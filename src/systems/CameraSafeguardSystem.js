import * as THREE from 'three';
import { state } from '../core/state.js';

/**
 * CameraSafeguardSystem — non-piloting camera safety & OrbitControls limits
 * (was script.js animate(), ~L1355-1384).
 *
 *  - resets NaN / far-away cameras back near the sun
 *  - bumps the camera out if it clips into the orbit target
 *  - adapts OrbitControls min/max distance to the focused body's size
 */
export class CameraSafeguardSystem {
    constructor(ctx) {
        this.ctx = ctx;
    }

    update() {
        const { ctx } = this;
        const { camera, controls, sunBody, sun } = ctx;

        // Self-healing for corrupted camera (NaN or extreme proximity/distance).
        // While flying the ship's own drift / a runaway burn can corrupt the
        // rig: reset the ship near the sun instead of waiting for the pilot
        // to survive to the exit button.
        if (state.isFlying) {
            const sp = ctx.spaceship;
            const finiteV = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
            // Position AND up/quaternion: a good position with a NaN up/quat is
            // the classic 'the frame vanishes into nothing' state (position
            // looks finite so the old check never fired) -- a roll that blows
            // the look-at basis produces exactly that, and nothing else could
            // rebuild the orientation.
            const camBad = !(finiteV(camera.position) && finiteV(camera.up) && Number.isFinite(camera.quaternion.x) && Number.isFinite(camera.quaternion.y) && Number.isFinite(camera.quaternion.z) && Number.isFinite(camera.quaternion.w));
            const shipBad = !(sp && finiteV(sp.position));
            if (camBad || shipBad) {
                console.warn('Camera Safeguard: resetting corrupted in-flight camera/ship.');
                if (sp) {
                    sp.position.set(sunBody.pos.x, sunBody.pos.y + 20, sunBody.pos.z);
                    sp.scale.setScalar(state.isRealisticScale ? 0.00005 : 0.2);
                    state.shipVelocity.set(0, 0, 0);
                }
                camera.up.set(0, 1, 0);
                camera.position.set(sunBody.pos.x, sunBody.pos.y + 20, sunBody.pos.z + 10);
                camera.lookAt(sunBody.pos);
                camera.quaternion.normalize();
            }
            return;
        }

        const camDistSq = camera.position.distanceToSquared(controls.target);
        const isCamCorrupt = isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z);

        // Threshold relaxed from 0.01 to 0.000001 to support Realistic Scale close-ups
        const safeguardMin = state.isRealisticScale ? 0.00000001 : 0.01;
        if (isCamCorrupt || camDistSq > 100000000) {
            console.warn("Camera Safeguard: Resetting position to safe coordinates.");
            // Reset near the sun's current position, not the hardcoded origin
            const sunPos = sunBody.pos;
            camera.position.set(sunPos.x, sunPos.y + 300, sunPos.z + 500);
            controls.target.copy(sunPos);
            camera.updateProjectionMatrix();
        } else if (camDistSq < safeguardMin) {
            console.warn("Camera Safeguard: Adjusting position to prevent clipping.");
            const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
            if (dir.lengthSq() < 0.1) dir.set(0, 1, 0);
            const safeDist = Math.max(safeguardMin * 1.5, controls.minDistance || 0.1);
            camera.position.copy(controls.target).addScaledVector(dir, safeDist);
            camera.updateProjectionMatrix();
        }

        // Dynamically set OrbitControls limits based on focused body size to prevent clipping
        let targetRadius = 40; // Default to Sun radius
        if (state.focusedBody) {
            targetRadius = state.focusedBody.userData.radius * state.focusedBody.scale.x || 10;
        } else {
            targetRadius = sun.scale.x * 40;
        }
        controls.minDistance = targetRadius * 1.25;
        controls.maxDistance = 15000;
    }
}
