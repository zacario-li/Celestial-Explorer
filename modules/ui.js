import { state } from './state.js';
import { t, tName } from './i18n.js';
import { planetsData } from './planetsData.js';

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
    document.querySelector('.ui-side-left h1').textContent = t('title');
    document.querySelector('.ui-side-left p').textContent = t('subtitle');
    document.querySelector('.nav-title').textContent = t('navTitle');
    document.getElementById('highvis-button').textContent = t('highvis');
    document.getElementById('overview-button').textContent = state.isOverview ? t('overviewOff') : t('overviewOn');
    document.getElementById('asteroid-belt-button').textContent = state.isAsteroidBeltActive ? t('asteroidBeltOn') : t('asteroidBeltOff');
    document.getElementById('kuiper-belt-button').textContent = state.isKuiperBeltActive ? t('kuiperBeltOn') : t('kuiperBeltOff');
    document.getElementById('hoverzones-button').textContent = state.showHoverZones ? t('hoverZonesOn') : t('hoverZonesOff');
    document.getElementById('pilot-button').textContent = state.isFlying ? t('pilotEnd') : t('pilotStart');
    document.getElementById('pilot-instr').textContent = t('pilotInstructions');
    const autoLevelBtn = document.getElementById('pilot-autolevel-button');
    if (autoLevelBtn) autoLevelBtn.textContent = t('pilotAutoLevel');
    const autopilotBtn = document.getElementById('pilot-autopilot-button');
    if (autopilotBtn) autopilotBtn.textContent = t('pilotAutopilot');
    
    const skStatus = document.getElementById('sk-status');
    if (skStatus) skStatus.textContent = t('stationKeepingActive');
    const skHint = document.getElementById('sk-hint');
    if (skHint) skHint.textContent = t('stationKeepingHint');

    const apStatus = document.getElementById('ap-status');
    if (apStatus && state.autopilotStatus) {
        // Status is dynamic e.g. "NAVIGATING TO [Planet]"
        const base = t(state.autopilotStatus);
        const target = state.autopilotTarget ? tName(state.autopilotTarget.name) : '';
        apStatus.textContent = `${base} ${target}`.trim();
    }

    document.getElementById('spawn-button').textContent = t('spawnPlanet');
    document.getElementById('lang-button').textContent = t('langSwitch');

    // Modal UI
    document.getElementById('modal-title').textContent = t('modalCustomizeTitle');
    document.getElementById('modal-lbl-template').textContent = t('modalTemplate');
    document.getElementById('modal-lbl-distance').textContent = t('modalDistance');
    document.getElementById('modal-lbl-mass').textContent = t('modalMass');
    document.getElementById('modal-cancel-btn').textContent = t('modalCancel');
    document.getElementById('modal-machinegun-btn').textContent = t('modalMachineGun');
    document.getElementById('modal-confirm-btn').textContent = t('modalConfirm');
    document.getElementById('opt-random').textContent = t('optRandom');
    
    document.getElementById('autopilot-modal-title').textContent = t('autopilotModalTitle');
    document.getElementById('autopilot-cancel-btn').textContent = t('autopilotCancel');
    
    const pauseBtn = document.getElementById('pause-button');
    pauseBtn.textContent = state.isPaused ? t('resume') : t('pause');

    const autoRotateBtn = document.getElementById('autorotate-button');
    autoRotateBtn.textContent = state.isAutoRotate ? t('autoRotateOn') : t('autoRotateOff');

    document.querySelectorAll('.nav-item').forEach(item => {
        const engName = item.dataset.engName;
        if (engName) item.textContent = tName(engName);
    });

    // Update Spawn Template Dropdown Options
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
        if (p.destroyed) return;
        const item = document.createElement('div');
        item.className = 'dest-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = tName(p.name);
        
        const distSpan = document.createElement('span');
        distSpan.className = 'dest-dist';
        // Simple distance from origin in AU-like units
        const dist = Math.round(p.pos.length());
        distSpan.textContent = `${dist} AU`;

        item.appendChild(nameSpan);
        item.appendChild(distSpan);
        
        item.onclick = () => onSelect(p);
        list.appendChild(item);
    });
}
