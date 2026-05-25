import * as THREE from 'three';
import { Button } from './button.js';
import { state } from '../../state.js';
import { t } from '../../i18n.js';
import { updateInfoPanel } from '../../ui.js';

export function initPilotButton(scene, camera, controls, headlight, targetVec) {
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

            if (window._spaceship) {
                window._spaceship.getWorldPosition(targetVec);
                scene.add(window._spaceship);
                window._spaceship.position.copy(targetVec);
                state.shipVelocity.set(0, 0, 0);

                // Snap camera immediately to avoid slow lerping from the old planetary orbit position
                if (state.shipViewMode === 'cockpit') {
                    window._spaceship.visible = false;
                    const camOffset = new THREE.Vector3(0.00, 0.05, 0).applyQuaternion(window._spaceship.quaternion);
                    camera.position.copy(window._spaceship.position.clone().add(camOffset));
                    
                    const relativeQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
                    camera.quaternion.copy(window._spaceship.quaternion).multiply(relativeQuat);
                } else {
                    window._spaceship.visible = true;
                    const DEFAULT_THETA = 4.712;
                    const DEFAULT_PHI = 0.3;
                    const r = 20.0;
                    const ox = r * Math.sin(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                    const oy = r * Math.sin(DEFAULT_PHI);
                    const oz = r * Math.cos(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                    
                    const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(window._spaceship.quaternion);
                    camera.position.copy(window._spaceship.position.clone().add(camOffset));
                    
                    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(window._spaceship.quaternion);
                    camera.up.copy(shipUp);
                    camera.lookAt(window._spaceship.position);
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
