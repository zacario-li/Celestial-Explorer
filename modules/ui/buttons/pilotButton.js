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
