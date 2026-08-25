import * as THREE from 'three';
import { state } from '../core/state.js';
import { applyLanguage } from '../ui/uiCore.js';
import { planTransferOrbit } from '../core/transferOrbit.js';

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

        if (state.isAutopilotActive && state.autopilotTarget) {
            const target = state.autopilotTarget;
            const dist = ship.position.distanceTo(target.pos);
            const scaleX = target.mesh ? target.mesh.scale.x : 1.0;
            const planetRadius = (target.mesh.userData.radius || 0.04) * scaleX;
            const captureRadius = planetRadius * 8;

            // 1. ARRIVAL CHECK
            if (dist < captureRadius) {
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

                    const plan = planTransferOrbit(ship.position, target, state.timeToIntercept, ctx.sunBody.pos);
                    state.autopilotVReq.copy(plan.v0);

                    // Show planned trajectory
                    if (state.showAutopilotTrajectory) {
                        this.apPathGeometry.setFromPoints(plan.points);
                        this.apPathLine.visible = true;
                        this.rendezvousGhost.position.copy(plan.rendezvous);
                        this.rendezvousGhost.visible = true;
                    }

                    state.autopilotPhase = 'ALIGNING';
                }

                if (state.autopilotPhase === 'ALIGNING') {
                    const deltaV = this._diffVec.copy(state.autopilotVReq).sub(state.shipVelocity);
                    if (deltaV.length() < 0.0001) {
                        state.autopilotPhase = 'COASTING';
                    } else {
                        // Point ship in direction of deltaV
                        const toDir = deltaV.normalize();
                        const targetMat = new THREE.Matrix4();
                        const targetUp = new THREE.Vector3(0, 1, 0);
                        const targetX = toDir;
                        const targetZ = new THREE.Vector3().crossVectors(targetX, targetUp).normalize();
                        const targetY = new THREE.Vector3().crossVectors(targetZ, targetX).normalize();

                        if (targetX.lengthSq() > 0.001 && targetZ.lengthSq() > 0.001) {
                            targetMat.makeBasis(targetX, targetY, targetZ);
                            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMat);
                            ship.quaternion.slerp(targetQuat, 0.05);

                            // If alignment is close enough, start burn
                            if (ship.quaternion.angleTo(targetQuat) < 0.1) {
                                state.autopilotPhase = 'BURNING';
                            }
                        }
                    }
                }

                if (state.autopilotPhase === 'BURNING') {
                    const deltaV = this._diffVec.copy(state.autopilotVReq).sub(state.shipVelocity);
                    const currentDir = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);

                    // Check if we are still pointing in the right direction
                    const alignment = currentDir.dot(deltaV.normalize());

                    if (deltaV.length() < 0.0005 || alignment < 0) {
                        // Burn complete or overshot
                        state.shipThrottle = 0;
                        state.autopilotPhase = 'COASTING';
                    } else {
                        state.shipThrottle = 1.0;
                    }
                }

                if (state.autopilotPhase === 'COASTING') {
                    state.shipThrottle = 0;

                    // Periodic course correction (every 5 seconds of virtual time)
                    if (Math.floor(state.virtualTime) % 5 === 0 && Math.abs(state.virtualTime - Math.floor(state.virtualTime)) < physicsDt) {
                        // Quick re-plan if still far
                        if (dist > captureRadius * 5) {
                            const plan = planTransferOrbit(ship.position, target, state.timeToIntercept, ctx.sunBody.pos);
                            state.autopilotVReq.copy(plan.v0);
                            // If correction is significant, re-align
                            if (this._diffVec.copy(state.autopilotVReq).sub(state.shipVelocity).length() > 0.001) {
                                state.autopilotPhase = 'ALIGNING';
                            }
                        }
                    }
                }

                // ETA Countdown (Accounts for simulation speed)
                state.timeToIntercept -= physicsDt;

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
            }
        } else {
            // Cleanup visuals & state cache when autopilot evaluates as OFF
            if (this.apPathLine.visible) this.apPathLine.visible = false;
            if (this.rendezvousGhost.visible) this.rendezvousGhost.visible = false;
            state.timeToIntercept = 0;
            state._prevAutopilotTarget = null;
            state.autopilotPhase = '';
            state._prevAutopilotPhase = '';
            this._lastRemainSec = null;
        }
    }
}
