import { state } from './state.js?v=5';
import { t, tName } from './i18n.js?v=5';
import { planetsData } from './planetsData.js?v=5';

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
    document.getElementById('pilot-button').textContent = state.isFlying ? t('pilotEnd') : t('pilotStart');
    document.getElementById('pilot-instr').textContent = t('pilotInstructions');
    document.getElementById('spawn-button').textContent = t('spawnPlanet');
    document.getElementById('lang-button').textContent = t('langSwitch');

    // Modal UI
    document.getElementById('modal-title').textContent = t('modalCustomizeTitle');
    document.getElementById('modal-lbl-template').textContent = t('modalTemplate');
    document.getElementById('modal-lbl-distance').textContent = t('modalDistance');
    document.getElementById('modal-lbl-mass').textContent = t('modalMass');
    document.getElementById('modal-cancel-btn').textContent = t('modalCancel');
    document.getElementById('modal-confirm-btn').textContent = t('modalConfirm');
    document.getElementById('opt-random').textContent = t('optRandom');
    
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
