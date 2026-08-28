import * as THREE from 'three';
import { state } from '../core/state.js';

/**
 * FocusedShadowSystem — isolated high-res shadow logic (was script.js
 * animate(), ~L1555-1596, plus setBodyLayer at ~L190).
 *
 *  - when the focused body changes: move it (and its system) onto shadow
 *    layer 2 and move the previously focused body back to layer 0
 *  - place the directional "focused light" behind the body relative to the
 *    sun with a tightly bound orthographic shadow camera
 */
export class FocusedShadowSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this._prevFocused = null;
    }

    /** Switch all layers of a body (mesh, atmosphere, satellites) in place. */
    setBodyLayer(body, targetLayer) {
        if (!body) return;
        const root = body.mesh || body;
        root.traverse((child) => {
            child.layers.set(targetLayer);
        });
        if (body.atmMesh) {
            body.atmMesh.layers.set(targetLayer);
        }
        if (body.satellites) {
            body.satellites.forEach(s => this.setBodyLayer(s, targetLayer));
        }
    }

    update() {
        const { ctx } = this;
        const { focusedLight, sunBody, celestialBodies } = ctx;

        // --- ISOLATED HIGH-RES SHADOW LOGIC ---
        const currentFocused = (state.focusedBody && !state.isOverview && !state.focusedBody.userData?.isSun) ? state.focusedBody : null;

        if (currentFocused !== this._prevFocused) {
            // Revert old body to global layer
            if (this._prevFocused) {
                const oldBody = celestialBodies.find(b => b.mesh === this._prevFocused || b.satellites?.some(s => s.mesh === this._prevFocused));
                if (oldBody) this.setBodyLayer(oldBody, 0);
            }
            // Isolate new body to shadow layer
            if (currentFocused) {
                const newBody = celestialBodies.find(b => b.mesh === currentFocused || b.satellites?.some(s => s.mesh === currentFocused));
                if (newBody) this.setBodyLayer(newBody, 2);
            }
            this._shadowSize = 60;
            // Cover the focused system's full satellite cloud, not just the
            // body disc. A fixed 60u half-width box clipped distant moons out
            // of the shadow camera: half a moon shaded normally, half falling
            // off the map and reading fully sunlit -- the broken far-side
            // shading. Moon positions are fixed orbital radii, so the box
            // size is static per focus.
            const sysBody = celestialBodies.find(b => b.mesh === currentFocused || b.satellites?.some(s => s.mesh === currentFocused));
            const sats = (sysBody && sysBody.satellites) || [];
            for (const sat of sats) {
                const d = (sat.dist || 0) + (sat.radius || sat.r || 0) + 8;
                if (d > this._shadowSize) this._shadowSize = Math.ceil(d);
            }
            const ring = sysBody && sysBody.rings ? (sysBody.userData.radius || 0) * 1.5 : 0;
            if (ring > this._shadowSize) this._shadowSize = Math.ceil(ring);
            this._shadowSize = Math.min(this._shadowSize, 300);
            this._prevFocused = currentFocused;
        }
        if (currentFocused) {
            const actualPos = new THREE.Vector3();
            currentFocused.getWorldPosition(actualPos);

            const dirFromSun = actualPos.clone().sub(sunBody.pos).normalize();
            const shadowSize = this._shadowSize || 60;

            // Place DirectionalLight 120 units towards the Sun
            focusedLight.position.copy(actualPos).sub(dirFromSun.multiplyScalar(shadowSize * 2));
            focusedLight.target.position.copy(actualPos);

            // Tightly bound orthographic shadow camera
            focusedLight.shadow.camera.left = -shadowSize;
            focusedLight.shadow.camera.right = shadowSize;
            focusedLight.shadow.camera.top = shadowSize;
            focusedLight.shadow.camera.bottom = -shadowSize;
            focusedLight.shadow.camera.near = 0.1;
            focusedLight.shadow.camera.far = shadowSize * 4;
            focusedLight.shadow.camera.updateProjectionMatrix();

            focusedLight.intensity = 2.0;
        } else {
            focusedLight.intensity = 0;
        }
    }
}
