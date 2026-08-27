import * as THREE from 'three';
import { state } from '../core/state.js';

/**
 * ShipControlSystem — manual flight input (was script.js animate(), ~L887-983).
 *
 * Responsibilities:
 *  1. Spaceship scaling (realistic-scale mode) + immediate camera snap on mode change
 *  2. Attitude input: pitch / yaw / roll + auto-leveling
 *  3. Thrust state (manual throttle) + engine acceleration
 *
 * Runs only while piloting. Autopilot (AutopilotSystem) owns its own
 * throttle management and corrects state.shipThrottle after this system.
 */
export class ShipControlSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.alBtn = document.getElementById('pilot-autolevel-button');
        // The HUD has advertised this button all along; nothing used to
        // engage the auto-level (isAutoLeveling was write-only false):
        if (this.alBtn) {
            this.alBtn.addEventListener('click', () => { state.isAutoLeveling = true; });
        }
    }

    update() {
        const { ctx } = this;
        const ship = ctx.spaceship;
        if (!state.isFlying || !ship) return;
        const physicsDt = ctx.physicsDt;

        // Dynamically update spaceship scale based on Realistic Scale mode (normalized geometries)
        const shipScale = state.isRealisticScale ? 0.00005 : 0.2;
        ship.scale.setScalar(shipScale);

        // Detect scale mode changes to snap camera immediately and avoid slow lerping lags
        if (state._prevRealisticScaleForCam !== state.isRealisticScale) {
            if (state.shipViewMode === 'cockpit') {
                const camOffset = new THREE.Vector3(0.00, 0.05 * shipScale, 0).applyQuaternion(ship.quaternion);
                ctx.camera.position.copy(ship.position.clone().add(camOffset));
            } else {
                const r = 20.0 * shipScale;
                const DEFAULT_THETA = 4.712;
                const DEFAULT_PHI = 0.3;
                const ox = r * Math.sin(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                const oy = r * Math.sin(DEFAULT_PHI);
                const oz = r * Math.cos(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
                ctx.camera.position.copy(ship.position.clone().add(camOffset));
            }
            state._prevRealisticScaleForCam = state.isRealisticScale;
        }

        // 1. Rotation (Arrow keys for Pitch/Yaw, Q/E for Roll)
        const keys = ctx.keys;
        const yaw = (keys['ArrowLeft'] ? 1 : 0) - (keys['ArrowRight'] ? 1 : 0);
        const pitch = (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0);
        const roll = (keys['KeyQ'] ? 1 : 0) - (keys['KeyE'] ? 1 : 0);

        const rotSpeed = 0.025;

        if (yaw !== 0 || pitch !== 0 || roll !== 0) {
            state.isAutoLeveling = false;
        }

        if (state.isAutoLeveling) {
            // Smoothly rotate ship towards level
            const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
            forward.y = 0;
            forward.normalize();
            if (forward.lengthSq() < 0.001) forward.set(1, 0, 0);

            const targetMat = new THREE.Matrix4();
            const targetUp = new THREE.Vector3(0, 1, 0);
            const targetX = forward;
            const targetZ = new THREE.Vector3().crossVectors(targetX, targetUp).normalize();
            const targetY = new THREE.Vector3().crossVectors(targetZ, targetX).normalize();

            targetMat.makeBasis(targetX, targetY, targetZ);
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMat);

            ship.quaternion.slerp(targetQuat, 0.05);

            if (this.alBtn) this.alBtn.style.background = 'rgba(0,255,255,0.4)';

            if (ship.quaternion.angleTo(targetQuat) < 0.001) {
                state.isAutoLeveling = false;
            }
        } else {
            ship.rotateY(yaw * rotSpeed);
            ship.rotateZ(pitch * rotSpeed);
            ship.rotateX(roll * rotSpeed);

            if (this.alBtn) this.alBtn.style.background = 'rgba(0,255,255,0.1)';
        }

        // 2. Simple Engine Ignition (W/S for Newtonian Thrust)
        // Throttle is now instantaneous ignition level (-1, 0, 1)
        if (state.isAutopilotActive) {
            // Autopilot manages its own throttle logic
        } else {
            state.shipThrottle = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
        }

        const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);

        // The REV toggle inverts the throttle (FWD keys fire aft). Previously
        // it was display-only -- the HUD said REV: ON but the ship ignored it.
        const effThrottle = state.isReverse ? -state.shipThrottle : state.shipThrottle;

        // Apply engine thrust physics to shipVelocity. Acceleration is a
        // PHYSICS quantity, independent of the model's render scale (which
        // was silently multiplying the delta-V by 0.2 -- five times weaker
        // than intended, forever-stalling autopilot burns).
        if (effThrottle !== 0) {
            const turbo = keys['ShiftLeft'] ? 3 : 1;
            const maxAccel = 0.08 * turbo;
            const currentAccel = effThrottle * maxAccel;
            state.shipVelocity.addScaledVector(dir, currentAccel * (physicsDt / 0.016));
        }
    }
}
