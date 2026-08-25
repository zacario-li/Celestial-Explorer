import * as THREE from 'three';
import { Button } from './button.js';
import { state } from '../../core/state.js';
import { t } from '../../core/i18n.js';
import { updateInfoPanel } from '../uiCore.js';

// Seam for non-UI modules: the physics engine (on hard planet collision)
// requests a flight-level reset through this instead of clicking DOM nodes.
// The UI module keeps full ownership of the button: behavior is a genuine
// button click, including the Button listener pipeline.
let pilotExitClick = null;

export function registerPilotExit(clickFn) {
    pilotExitClick = typeof clickFn === 'function' ? clickFn : null;
}

export function requestPilotExit() {
    if (pilotExitClick) pilotExitClick();
}

let pilotToggleClick = null;

export function registerPilotToggle(fn) {
    pilotToggleClick = typeof fn === 'function' ? fn : null;
}

/** R-key entry: the HTML has long advertised "Press R or Click Button". */
export function requestPilotToggle() {
    if (pilotToggleClick) pilotToggleClick();
}

export function initPilotButton(scene, camera, controls, headlight, targetVec, options = {}) {
    // Spaceship access via injected provider (window fallback kept for
    // external tooling; internal modules should not depend on the global)
    const shipProvider = options.shipProvider || (() => (typeof window !== 'undefined' ? window._spaceship : null));
    const pilotButtonEl = document.getElementById('pilot-button');
    registerPilotToggle(() => { if (pilotButtonEl) pilotButtonEl.click(); });
    registerPilotExit(() => {
        // Deferral lives in the caller (physicsEngine.resetShipFlight's
        // setTimeout) — clicking here is exactly the original single-tick
        // timing, no extra macrotask.
        if (state.isFlying && pilotButtonEl) pilotButtonEl.click();
    });
    const touchControls = !!options.touchControls;
    // Rapid double-toggle (R tapped twice, double-click) would otherwise be
    // two full flights, each erasing the pre-flight focus.
    let _lastToggleAt = 0;
    return new Button('pilot-button', function() {
        const nowMs = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (nowMs - _lastToggleAt < 150) return;
        _lastToggleAt = nowMs;
        state.isFlying = !state.isFlying;
        const hud = document.getElementById('pilot-hud');
        const vController = document.getElementById('v-controller');
        const vCrosshair = document.getElementById('v-crosshair');

        if (state.isFlying) {
            if (hud) hud.style.display = 'block';
            // #9: the on-screen D-pad is a MOBILE controller -- on desktop it
            // used to overlay the UI and intercept clicks on the exit button
            if (vController) vController.style.display = touchControls ? 'block' : 'none';
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
                // The ship's berth (parent + local offset) is captured before
                // it lifts off, so exit can restore the docked pose:
                state._shipDockParent = ship.parent || null;
                state._shipDockLocal = ship.position.clone();
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
            // Tear down autopilot leftovers -- exiting used to freeze the state
            // machine mid-BURN with a stale vReq, which synchronously resumed
            // the next time the pilot re-entered (an approvaled burn) and
            // also abandoned an open picker modal:
            if (state.isAutopilotActive || state._prevAutopilotTarget !== null) {
                state.isAutopilotActive = false;
                state.autopilotPhase = '';
                state._prevAutopilotPhase = '';
                state.autopilotTarget = null;
                state._prevAutopilotTarget = null;
                state.timeToIntercept = 0;
            }
            const apModal = document.getElementById('autopilot-modal');
            if (state.isAutopilotModalActive && apModal) {
                apModal.classList.remove('active');
                state.isAutopilotModalActive = false;
            }
            const apIndicator = document.getElementById('autopilot-indicator');
            if (apIndicator) apIndicator.style.display = 'none';
            const apBtn = document.getElementById('pilot-autopilot-button');
            if (apBtn) {
                apBtn.textContent = t('pilotAutopilot');
                apBtn.classList.remove('warning-glow');
            }
            controls.enabled = true;
            // Restore the docked pose (previously the ship stayed rooted to
            // the scene, slowly drifting, and never docked again):
            const shipOut = shipProvider();
            if (shipOut && state._shipDockParent && state._shipDockParent.parent && state._shipDockLocal) {
                state._shipDockParent.add(shipOut);
                shipOut.position.copy(state._shipDockLocal);
            } else if (shipOut) {
                scene.add(shipOut);
            }
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
