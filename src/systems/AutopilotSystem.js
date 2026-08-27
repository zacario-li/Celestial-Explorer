import * as THREE from 'three';
import { state } from '../core/state.js';
import { applyLanguage } from '../ui/uiCore.js';
import { planTransferOrbit } from '../core/transferOrbit.js';
import { solveIntercept, throttleForDeltaV, AP_GUIDANCE } from '../core/autopilotGuidance.js';
import { G } from '../physics/constants.js';

/**
 * AutopilotSystem — orbital transfer state machine
 * (was script.js animate(), ~L985-1113).
 *
 * Phases: PLANNING -> ALIGNING -> BURNING -> COASTING -> arrival/capture.
 *
 * Extracted verbatim from the main loop. Now a self-contained, unit-testable
 * state machine. It drives:
 *  - state.isAutopilotActive / autopilotPhase / autopilotTarget / timeToIntercept
 *  - the trajectory line (apPathLine) and rendezvous ghost visuals
 *  - arrival hand-off to StationKeeping (state.capturedBody)
 */
export class AutopilotSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.apPathLine = ctx.apPathLine;
        this.apPathGeometry = ctx.apPathGeometry;
        this.rendezvousGhost = ctx.rendezvousGhost;
        this.apIndicator = document.getElementById('autopilot-indicator');
        this.skIndicator = document.getElementById('station-keeping-indicator');
        this._diffVec = new THREE.Vector3();
        this._lastRemainSec = null;
    }

    update() {
        const { ctx } = this;
        const ship = ctx.spaceship;
        if (!state.isFlying || !ship) return;
        const physicsDt = ctx.physicsDt;
        // Whole-second edge trigger for course corrections (see COASTING):
        // computed once per frame so every phase can observe the same value.
        const vSecNow = Math.floor(state.virtualTime);

        if (state.isAutopilotActive && state.autopilotTarget) {
            const target = state.autopilotTarget;
            if (target.destroyed) {
                // Destination was taken in during the transfer: abort instead of
                // planning toward a stationary ghost (the planner had already
                // converged onto the corpse's remaining pos/vel).
                state.isAutopilotActive = false;
                state.autopilotTarget = null;
                return; // the OFF branch below clears the rest next frame
            }
            const dist = ship.position.distanceTo(target.pos);
            const scaleX = target.mesh ? target.mesh.scale.x : 1.0;
            const planetRadius = (target.mesh.userData.radius || 0.04) * scaleX;
            const captureRadius = planetRadius * 8;

            // The transfer-line visibility mirrors the Misc-settings choice
            // for the whole engagement (off by default):
            this.apPathLine.visible = state.showPlannedPath;

            // 1. ARRIVAL CHECK -- snap-lock only when arriving slow inside
            // the capture radius. A fast flyby must not be captured (the
            // plumbing would read as 'force capture'). The guidance law
            // hands off cleanly when it settles a ship with ~zero residual.
            const relAtArrival = state.shipVelocity.distanceTo(target.vel);
            if (dist < captureRadius && relAtArrival < 0.15) {
                state.isAutopilotActive = false;
                state.shipThrottle = 0;
                if (this.skIndicator) this.skIndicator.style.display = 'block';
                state.capturedBody = target;
                state.relativePos.copy(ship.position).sub(target.pos);
                state.shipVelocity.copy(target.vel);
                if (this.apIndicator) this.apIndicator.style.display = 'none';
                if (this.apPathLine.visible) this.apPathLine.visible = false;
                if (this.rendezvousGhost.visible) this.rendezvousGhost.visible = false;
            } else {
                // 2. PHASE MANAGEMENT
                if (!state.autopilotPhase || state.autopilotTarget !== state._prevAutopilotTarget) {
                    state.autopilotPhase = 'PLANNING';
                    state._prevAutopilotTarget = target;
                    state.shipThrottle = 0;
                }

                if (state.autopilotPhase === 'PLANNING') {
                    // Estimate travel time (approximate 1.5 units/s average speed)
                    const scaleFactor = state.isRealisticScale ? 0.00005 : 0.2;
                    state.timeToIntercept = dist / (1.5 * scaleFactor);

                    const plan = planTransferOrbit(ship.position, target, state.timeToIntercept, ctx.sunBody.pos, G * ctx.sunBody.physMass);
                    state.autopilotVReq.copy(plan.v0);

                    // Show planned trajectory
                    if (state.showAutopilotTrajectory) {
                        // Pooled line buffer (main.js pre-allocated 151
                        // vertices): setFromPoints() would allocate a fresh
                        // BufferAttribute per plan and leak the GL buffer:
                        const posArr = this.apPathGeometry.attributes.position.array;
                        const nPts = Math.min(plan.points.length, 151);
                        for (let i = 0; i < nPts; i++) {
                            const v = plan.points[i];
                            posArr[3 * i] = v.x; posArr[3 * i + 1] = v.y; posArr[3 * i + 2] = v.z;
                        }
                        this.apPathGeometry.setDrawRange(0, nPts);
                        this.apPathGeometry.attributes.position.needsUpdate = true;
                        // Honors the Misc-settings PLAN PATH flag (off by default):
                        this.apPathLine.visible = state.showPlannedPath;
                        this.rendezvousGhost.position.copy(plan.rendezvous);
                        this.rendezvousGhost.visible = true;
                    }

                    state.autopilotPhase = 'ALIGNING';
                }

                // 3. CONTINUOUS GUIDANCE (phase 2).
                // Every frame: propagate the target under sun gravity to
                // time tau, aim the burn at the residual delta-V for that
                // lead point, and scale throttle proportionally -- so the
                // burn auto-tapers and no phase ever sits idle while the
                // hand (attitude) drifts.
                const guidance = solveIntercept(ship.position, state.shipVelocity, target, ctx.sunBody.pos, G * ctx.sunBody.physMass);
                state.autopilotVReq.copy(guidance.vReq);
                state.timeToIntercept = guidance.tau; // LIVE ETA (per-frame solved)
                const dvMag = guidance.deltaV.length();

                // ARRIVAL: on topology and residual negligible inside the
                // capture radius -- stop burning and hand the ship to
                // station keeping (its assist picks up the last ~0.02 and
                // soft-locks; the hull window protects the interior).
                if (dist < captureRadius && dvMag <= AP_GUIDANCE.deadband) {
                    state.isAutopilotActive = false;
                    state.shipThrottle = 0;
                    state.autopilotPhase = '';
                    state.autopilotStatus = 'apDisengaged';
                    if (this.apIndicator) this.apIndicator.style.display = 'none';
                    if (this.apPathLine.visible) this.apPathLine.visible = false;
                    if (this.rendezvousGhost.visible) this.rendezvousGhost.visible = false;
                    return;
                }

                // Aim + proportional burn
                const throttle = throttleForDeltaV(dvMag);
                state.shipThrottle = throttle;
                if (throttle > 0) {
                    const dvDir = guidance.deltaV.clone().normalize();
                    if (dvDir.lengthSq() > 1e-9) {
                        let cross = new THREE.Vector3().crossVectors(dvDir, new THREE.Vector3(0, 1, 0));
                        if (cross.lengthSq() < 1e-6) cross = new THREE.Vector3().crossVectors(dvDir, new THREE.Vector3(1, 0, 0)); // near-polar aim
                        const targetZ = cross.normalize();
                        const targetY = new THREE.Vector3().crossVectors(targetZ, dvDir).normalize();
                        const aimQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dvDir, targetY, targetZ));
                        // 0.12 per frame: a few-second misaim resolves in ~1 s
                        ship.quaternion.slerp(aimQuat, 0.12);
                    }
                }
                state.autopilotPhase = throttle > 0 ? 'STEERING' : 'HOLD';

                // ETA: live-solved per frame by the guidance law above
                // (state.timeToIntercept = tau); no manual countdown.

                // Live countdown in the HUD: refresh once per whole second of
                // remaining time (applyLanguage renders #ap-status)
                const remainSec = Math.ceil(state.timeToIntercept);
                if (remainSec !== this._lastRemainSec) {
                    this._lastRemainSec = remainSec;
                    applyLanguage();
                }

                // Update HUD Status
                const targetStatus = dist < captureRadius * 3 ? 'apStatusApproaching' : 'apStatusNavigating';
                if (state.autopilotStatus !== targetStatus || state._prevAutopilotPhase !== state.autopilotPhase) {
                    state.autopilotStatus = targetStatus;
                    state._prevAutopilotPhase = state.autopilotPhase;
                    applyLanguage();
                }
                state._prevCourseSec = vSecNow;
            }
        } else {
            // Cleanup visuals & state cache when autopilot evaluates as OFF
            if (this.apPathLine.visible) this.apPathLine.visible = false;
            if (this.rendezvousGhost.visible) this.rendezvousGhost.visible = false;
            if (this.apIndicator) this.apIndicator.style.display = 'none';
            // Refresh the pill once so a stale ghost target stops being shown
            // (e.g. the destination was consumed mid-transfer):
            state.autopilotStatus = 'apDisengaged';
            applyLanguage();
            state.timeToIntercept = 0;
            state.autopilotTarget = null;
            state._prevAutopilotTarget = null;
            state.autopilotPhase = '';
            state._prevAutopilotPhase = '';
            this._lastRemainSec = null;
        }
    }
}
