import * as THREE from 'three';
import { state } from '../state.js';

/**
 * ShipCameraSystem — cockpit & chase camera rigs during flight
 * (was script.js animate(), ~L1217-1291).
 *
 *  - cockpit (1st person): camera glued to ship, forward aligned, dynamic near plane
 *  - chase (3rd person): soft-follow orbit camera with drag-inspect + auto reset
 *  - when NOT flying: camera up reset + docked/idle bobbing animation
 */
export class ShipCameraSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.vCrosshair = document.getElementById('v-crosshair');
    }

    update() {
        const { ctx } = this;
        const ship = ctx.spaceship;
        const camera = ctx.camera;

        if (state.isFlying && ship) {
            const shipScale = state.isRealisticScale ? 0.00005 : 0.2;

            if (state.shipViewMode === 'cockpit') {
                // First-Person Cockpit Camera (Inside/at the ship)
                ship.visible = true; // Show ship so interior is visible
                const camOffset = new THREE.Vector3(0.00, 0.05 * shipScale, 0).applyQuaternion(ship.quaternion);
                camera.position.copy(ship.position.clone().add(camOffset));

                // Align camera forward (-Z) with ship forward (+X)
                const relativeQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
                camera.quaternion.copy(ship.quaternion).multiply(relativeQuat);

                // Dynamically set camera near plane to prevent clipping the spaceship cockpit
                const targetNear = 0.00005 * shipScale;
                if (camera.near !== targetNear) {
                    camera.near = targetNear;
                    camera.updateProjectionMatrix();
                }

                if (this.vCrosshair) this.vCrosshair.style.display = 'block';
            } else {
                // Third-Person Chase Camera (Soft-Follow + Drag Inspect)
                const DEFAULT_THETA = 4.712; // Directly behind (Negative X-axis)
                const DEFAULT_PHI = 0.3;     // Slight upward angle for better view

                // Auto-Reset logic: Interpolate back to default after 1s of inactivity
                if (!state.shipOrbitAngles) state.shipOrbitAngles = { theta: 4.712, phi: 0.3 };
                if (!state.isOrbitingShip && (Date.now() - state.lastOrbitTime > 1000)) {
                    state.shipOrbitAngles.theta += (DEFAULT_THETA - state.shipOrbitAngles.theta) * 0.05;
                    state.shipOrbitAngles.phi += (DEFAULT_PHI - state.shipOrbitAngles.phi) * 0.05;
                }

                // Calculate offset based on current orbit angles (r = 20.0 is perfect for ship scale)
                const r = 20.0 * shipScale;
                const ox = r * Math.sin(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);
                const oy = r * Math.sin(state.shipOrbitAngles.phi);
                const oz = r * Math.cos(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);

                ship.visible = true; // Show ship in third-person view
                const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
                const goalPos = ship.position.clone().add(camOffset);

                camera.position.lerp(goalPos, 0.1);

                // Align camera's up direction with ship's local up direction so camera rolls with ship
                const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
                camera.up.copy(shipUp);

                camera.lookAt(ship.position);

                if (camera.near !== 0.001) {
                    camera.near = 0.001;
                    camera.updateProjectionMatrix();
                }

                if (this.vCrosshair) this.vCrosshair.style.display = 'none';
            }
            // Add a slight nose-down tilt if needed, but per user request, keep it 1:1
        } else {
            // Reset camera up vector to default when not piloting
            camera.up.set(0, 1, 0);

            if (camera.near !== 0.001) {
                camera.near = 0.001;
                camera.updateProjectionMatrix();
            }

            if (ship) {
                ship.visible = true; // Ensure ship is visible when not piloting

                const earthRef = ctx.earthRef;
                if (!earthRef.orbitObj.children.includes(ship)) {
                    // Subtle bobbing for stationary mode (relative to Earth orbital location)
                    // Note: For simplicity, if you exited flight mode far from Earth,
                    // we'll just keep the ship where it is in global space.
                    const time = performance.now() * 0.001;
                    ship.position.y += Math.sin(time * 2) * 0.01;
                } else {
                    // Original docked animation (proportionally scaled)
                    const time = performance.now() * 0.001;
                    const earthScale = earthRef.mesh.scale.x;
                    const baseHeight = 16 * earthScale;
                    const bob = Math.sin(time * 2) * 0.5 * earthScale;
                    ship.position.set(0, baseHeight + bob, 0);
                    ship.rotation.z = Math.sin(time * 0.5) * 0.1;
                }
            }
        }
    }
}
