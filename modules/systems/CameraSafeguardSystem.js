import * as THREE from 'three';
import { state } from '../state.js';

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

        // Self-healing for corrupted camera (NaN or extreme proximity/distance)
        if (state.isFlying) return;

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
