import { state } from './state.js?v=2';
import { t, tName } from './i18n.js?v=2';
import { planetsData } from './planetsData.js?v=2';

export function updateInfoPanel(body) {
    const panel = document.getElementById('info-panel');
    const nameEl = document.getElementById('info-name');
    const massEl = document.getElementById('info-mass');
    const radiusEl = document.getElementById('info-radius');
    const densityEl = document.getElementById('info-density');
    const relEl = document.getElementById('info-relative');

    const allNavItems = document.querySelectorAll('.nav-item');
    allNavItems.forEach(item => {
        const engName = item.dataset.engName;
        if (body && engName === body.userData.name) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    if (!body || !body.userData || !body.userData.mass) {
        panel.style.display = 'none';
        return;
    }

    nameEl.textContent = tName(body.userData.name);
    massEl.textContent = `${t('mass')}: ${body.userData.mass}`;
    radiusEl.textContent = `${t('radius')}: ${body.userData.infoRadius}`;
    densityEl.textContent = `${t('density')}: ${body.userData.density}`;
    relEl.textContent = body.userData.massRel;
    panel.style.display = 'block';
}

export async function applyLanguage() {
    const safeSetText = (id, key) => {
        const el = document.getElementById(id);
        if (el) {
            const txt = t(key);
            el.textContent = txt;
        }
    };

    const safeSetSelectorText = (selector, key) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = t(key);
    };

    safeSetSelectorText('.ui-side-left h1', 'title');
    safeSetSelectorText('.ui-side-left p', 'subtitle');
    safeSetSelectorText('.nav-title', 'navTitle');
    
    safeSetText('highvis-button', 'highvis');
    safeSetText('overview-button', state.isOverview ? 'overviewOff' : 'overviewOn');
    safeSetText('asteroid-belt-button', state.isAsteroidBeltActive ? 'asteroidBeltOn' : 'asteroidBeltOff');
    safeSetText('kuiper-belt-button', state.isKuiperBeltActive ? 'kuiperBeltOn' : 'kuiperBeltOff');
    safeSetText('hoverzones-button', state.showHoverZones ? 'hoverZonesOn' : 'hoverZonesOff');
    safeSetText('pilot-button', state.isFlying ? 'pilotEnd' : 'pilotStart');
    safeSetText('pilot-instr', 'pilotInstructions');
    safeSetText('pilot-autolevel-button', 'pilotAutoLevel');
    safeSetText('pilot-autopilot-button', 'pilotAutopilot');
    
    safeSetText('sk-status', 'stationKeepingActive');
    safeSetText('sk-hint', 'stationKeepingHint');

    const apStatus = document.getElementById('ap-status');
    if (apStatus && state.autopilotStatus) {
        const base = t(state.autopilotStatus);
        const target = state.autopilotTarget ? tName(state.autopilotTarget.name) : '';
        const phaseKey = state.autopilotPhase === 'BURNING' ? 'apPhaseBurning' : (state.autopilotPhase === 'COASTING' ? 'apPhaseCoasting' : '');
        const phaseStr = phaseKey ? ` (${t(phaseKey)})` : '';
        apStatus.textContent = `${base} ${target}${phaseStr}`.trim();
    }

    safeSetText('spawn-button', 'spawnPlanet');
    safeSetText('sync-time-button', 'timeSync');
    safeSetText('set-time-button', 'setTime');
    safeSetText('lang-button', 'langSwitch');

    const speedLbl = document.getElementById('sim-speed-label');
    if (speedLbl) speedLbl.textContent = `${t('simSpeed')}: ${state.simSpeedMultiplier}x`;

    // Modal UI
    safeSetText('modal-title', 'modalCustomizeTitle');
    safeSetText('modal-lbl-template', 'modalTemplate');
    safeSetText('modal-lbl-distance', 'modalDistance');
    safeSetText('modal-lbl-mass', 'modalMass');
    safeSetText('modal-cancel-btn', 'modalCancel');
    safeSetText('modal-machinegun-btn', 'modalMachineGun');
    safeSetText('modal-confirm-btn', 'modalConfirm');
    safeSetText('opt-random', 'optRandom');
    
    // Time Modal
    safeSetText('time-modal-title', 'modalTimeTitle');
    safeSetText('time-modal-confirm', 'modalSet');
    safeSetText('time-modal-cancel', 'modalCancel');
    safeSetText('lbl-year', 'year');
    safeSetText('lbl-month', 'month');
    safeSetText('lbl-day', 'day');
    safeSetText('lbl-hour', 'hour');
    safeSetText('lbl-minute', 'minute');
    safeSetText('lbl-second', 'second');

    safeSetText('autopilot-modal-title', 'autopilotModalTitle');
    safeSetText('autopilot-cancel-btn', 'autopilotCancel');
    
    safeSetText('pause-button', state.isPaused ? 'resume' : 'pause');
    safeSetText('autorotate-button', state.isAutoRotate ? 'autoRotateOn' : 'autoRotateOff');

    document.querySelectorAll('.nav-item').forEach(item => {
        const engName = item.dataset.engName;
        if (engName) item.textContent = tName(engName);
    });

    const spawnTemplate = document.getElementById('spawn-template');
    if (spawnTemplate) {
        const opts = spawnTemplate.options;
        for (let i = 0; i < opts.length; i++) {
            const val = opts[i].value;
            if (val === 'Random') {
                opts[i].textContent = t('optRandom');
            } else {
                const idx = parseInt(val);
                if (!isNaN(idx) && planetsData[idx]) {
                    const d = planetsData[idx];
                    opts[i].textContent = `${d.name} (${tName(d.name)})`;
                }
            }
        }
    }

    if (state.focusedBody) updateInfoPanel(state.focusedBody);
}

export function populateAutopilotDestinations(activePlanets, onSelect) {
    const list = document.getElementById('autopilot-dest-list');
    if (!list) return;
    list.innerHTML = '';

    activePlanets.forEach(p => {
        if (p.destroyed || p.isAsteroid) return;
        const item = document.createElement('div');
        item.className = 'dest-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = tName(p.name);
        
        const distSpan = document.createElement('span');
        distSpan.className = 'dest-dist';
        const dist = Math.round(p.pos.length());
        distSpan.textContent = `${dist} AU`;

        item.appendChild(nameSpan);
        item.appendChild(distSpan);
        
        item.onclick = () => onSelect(p);
        list.appendChild(item);
    });
}
