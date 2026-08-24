import * as THREE from 'three';
import { Button } from './button.js';
import { state } from '../../state.js';
import { t } from '../../i18n.js';
import { updateInfoPanel } from '../../ui.js';

export function initPilotButton(scene, camera, controls, headlight, targetVec, options = {}) {
    // Spaceship access via injected provider (window fallback kept for
    // external tooling; internal modules should not depend on the global)
    const shipProvider = options.shipProvider || (() => (typeof window !== 'undefined' ? window._spaceship : null));
    return new Button('pilot-button', function() {
        state.isFlying = !state.isFlying;
        const hud = document.getElementById('pilot-hud');
        const vController = document.getElementById('v-controller');
        const vCrosshair = document.getElementById('v-crosshair');

        if (state.isFlying) {
            if (hud) hud.style.display = 'block';
            if (vController) vController.style.display = 'block';
            if (vCrosshair) vCrosshair.style.display = 'block';
            controls.enabled = false;

            state.focusedBody = null;
            state.isTransitioning = false;
            updateInfoPanel(null);

            this.textContent = t('pilotEnd');
            this.style.background = 'rgba(0, 255, 255, 0.2)';
            this.style.borderColor = '#00ffff';

            headlight.intensity = 0; 

            const ship = shipProvider();
            if (ship) {
                ship.getWorldPosition(targetVec);
                scene.add(ship);
                ship.position.copy(targetVec);
                state.shipVelocity.set(0, 0, 0);

                // Apply correct scale immediately to spaceship and snap camera to prevent lerping lags
                const shipScale = state.isRealisticScale ? 0.00005 : 0.2;
                ship.scale.setScalar(shipScale);
                if (state.shipViewMode === 'cockpit') {
                    ship.visible = true;
                    const camOffset = new THREE.Vector3(0.00, 0.05 * shipScale, 0).applyQuaternion(ship.quaternion);
                    camera.position.copy(ship.position.clone().add(camOffset));

                    const relativeQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
                    camera.quaternion.copy(ship.quaternion).multiply(relativeQuat);
                } else {
                    ship.visible = true;
                    const DEFAULT_THETA = 4.712;
                    const DEFAULT_PHI = 0.3;
                    const r = 20.0 * shipScale;
                    const ox = r * Math.sin(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                    const oy = r * Math.sin(DEFAULT_PHI);
                    const oz = r * Math.cos(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);

                    const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
                    camera.position.copy(ship.position.clone().add(camOffset));

                    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
                    camera.up.copy(shipUp);
                    camera.lookAt(ship.position);
                }
            }
        } else {
            if (hud) hud.style.display = 'none';
            if (vController) vController.style.display = 'none';
            if (vCrosshair) vCrosshair.style.display = 'none';
            state.shipThrottle = 0; 
            controls.enabled = true;
            this.textContent = t('pilotStart');
            this.style.background = 'rgba(255, 255, 255, 0.05)';
            this.style.borderColor = '#4fa6ff';
            headlight.intensity = 0;

            if (state.focusedBody) {
                state.isTransitioning = true;
            }
        }
    });
}
