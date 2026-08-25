import { state } from '../../core/state.js';
import { SCENE_UNITS_PER_AU } from '../../physics/constants.js';
import { t } from '../../core/i18n.js';
import { populateAutopilotDestinations } from '../uiCore.js';

/**
 * Autopilot mode button (wire-up added by refactor #1 — the button existed in
 * index.html with NO click handler anywhere in the repo).
 *
 * Takes (scene, camera, controls, options) for consistency with the other
 * button modules; it only needs globals + injected friends.
 *
 * Real DOM surface (see index.html): #pilot-autopilot-button, the
 * #autopilot-indicator > #ap-status pill, and the #autopilot-modal with
 * #autopilot-dest-list / #autopilot-cancel-btn. (The other "autopilot-*" ids
 * found in tooltips/targets are tooltip-module placeholders — not elements.)
 */
export function initAutopilotButton(physicsEngineOrScene, camera, controls, options = {}) {
    // Note: buttonInitializer calls this as initAutopilotButton(physicsEngine)
    // today; the argument is unused.
    const shipProvider = options.shipProvider || null;

    const AIP_ANOMALIES = ['astartus', 'titan', 'ptiliusprime', 'pthraxos', 'creemmeprime', 'despina'];

    const docButton = document.getElementById('pilot-autopilot-button');
    const indicator = document.getElementById('autopilot-indicator');
    const apStatus = document.getElementById('ap-status');
    const modal = document.getElementById('autopilot-modal');
    const destList = document.getElementById('autopilot-dest-list');
    const cancelBtn = document.getElementById('autopilot-cancel-btn');
    const modalTitle = document.getElementById('autopilot-modal-title');

    const _closeAutopilotModal = () => {
        state.isAutopilotModalActive = false;
        if (modal) modal.classList.remove('active');
        if (apStatus) apStatus.textContent = 'AUTOPILOT NAVIGATING';
    };

    // Disengaging: flight continues as MANUAL navigation (classic "take manual
    // control" semantics — mirrors the manual-keyword disconnect in script.js).
    const _disengage = () => {
        if (state.isAutopilotActive) {
            state.isAutopilotActive = false;
            state.autopilotStatus = 'apDisengaged';
        }
        state.showAutopilotTrajectory = false;
        _closeAutopilotModal();
        if (docButton && docButton.classList) {
            docButton.classList.remove('warning-glow');
            docButton.textContent = '🤖 AUTOPILOT';
        }
        if (apStatus) apStatus.textContent = 'AUTOPILOT DISENGAGED — MANUAL NAVIGATION';
    };

    if (docButton) {
        docButton.addEventListener('click', () => {
            if (!state.isFlying) {
                if (window.showToastMsg) {
                    try { window.showToastMsg(t('needPilotFirst', 'Enter Pilot Mode First')); } catch (e) {}
                }
                docButton.classList.add('warning-glow');
                setTimeout(() => docButton.classList.remove('warning-glow'), 700);
                return;
            }

            if (state.isAutopilotActive) {
                _disengage();
                return;
            }

            // Idle → show destination picker (now navigable: connects modal
            // population, target selection, status + indicator stripping)
            state.isAutopilotModalActive = true;
            try { populateAutopilotDestinations(physicsEngine.activePlanets, _onDestinationSelected); } catch (e) { console.error('populateAutopilotDestinations:', e); }
            if (modalTitle) modalTitle.textContent = t('autoNavHeading', 'Select Destination');
            if (modal) modal.classList.add('active');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            // Pure close (the button is named ABORT but ships semantics are
            // "close the picker", which is what "CANCEL" in the tooltip says).
            state.isAutopilotModalActive = false;
            modal?.classList.remove('active');
        });
    }

    // Destination picker (ui.js#populateAutopilotDestinations renders one
    // .dest-item per active physics planet and calls back with the body)
    const _onDestinationSelected = (planet) => {
        try {
            // state.autopilotTarget is consumed as a PHYSICS BODY by
            // AutopilotSystem (target.pos/.vel/.mesh) — keep it an object.
            const targetName = planet.name;
            const dist = planet.pos.length();
            state.autopilotTarget = planet;
            state.isAutopilotActive = true;
            state.autopilotStatus = 'apNavigating';
            state.showAutopilotTrajectory = true;

            if (destList) destList.style.display = 'none';
            if (indicator) indicator.style.display = 'flex';
            if (apStatus) {
                apStatus.textContent = `NAVIGATING → ${targetName} (${(dist / SCENE_UNITS_PER_AU).toFixed(2)} AU)`;
            }

            if (window.clearToastMessage) window.clearToastMessage();
            state.isAutopilotModalActive = false;
            modal?.classList.remove('active');

            if (docButton && docButton.classList) {
                docButton.classList.remove('warning-glow');
                docButton.textContent = '✖ DISCONNECT';
            }

            if (window.displayTelemetryUpdate) window.displayTelemetryUpdate();
        } catch (e) {
            console.error('autopilot select error:', e);
        }
    };

    return { _onDestinationSelected };
}

