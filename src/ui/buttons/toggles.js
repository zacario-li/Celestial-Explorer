import { Button } from './button.js';
import { state } from '../../core/state.js';
import { highVisLight, setPerformanceMode } from '../../core/sceneSetup.js';
import { applyLanguage } from '../uiCore.js';

export function initHighVisButton() {
    return new Button('highvis-button', () => {
        state.isHighVis = !state.isHighVis;
        highVisLight.intensity = state.isHighVis ? 2.5 : 0;
    }, {
        stateKey: 'isHighVis',
        stateObject: state,
        activeClass: 'active'
    });
}

export function initAutoRotateButton() {
    return new Button('autorotate-button', () => {
        state.isAutoRotate = !state.isAutoRotate;
    }, {
        stateKey: 'isAutoRotate',
        stateObject: state,
        labels: { on: 'autoRotateOn', off: 'autoRotateOff' }
    });
}

export function initFuturePathButton() {
    return new Button('future-path-button', () => {
        state.showFuturePath = !state.showFuturePath;
    }, {
        stateKey: 'showFuturePath',
        stateObject: state,
        labels: { on: 'futurePathOn', off: 'futurePathOff' }
    });
}

export function initPlannedPathButton() {
    return new Button('plannedpath-button', () => {
        // User intent for the autopilot transfer line; AutopilotSystem
        // realises it per frame while a plan exists (default off):
        state.showPlannedPath = !state.showPlannedPath;
    }, {
        stateKey: 'showPlannedPath',
        stateObject: state,
        labels: { on: 'plannedPathOn', off: 'plannedPathOff' }
    });
}

export function initPerformanceModeButton() {
    return new Button('performance-mode-button', () => {
        // User-opted-in fill-rate trade: pixel 1.0 + 1024^2 shadow map.
        // OFF (default) is exactly today's image.
        state.performanceMode = !state.performanceMode;
        setPerformanceMode(state.performanceMode);
    }, {
        stateKey: 'performanceMode',
        stateObject: state,
        labels: { on: 'boostOn', off: 'boostOff' }
    });
}

export function initHoverZonesButton(celestialBodies) {
    return new Button('hoverzones-button', () => {
        state.showHoverZones = !state.showHoverZones;
        celestialBodies.forEach(b => {
            if (b.captureMesh) b.captureMesh.visible = state.showHoverZones;
        });
    }, {
        stateKey: 'showHoverZones',
        stateObject: state,
        labels: { on: 'hoverZonesOn', off: 'hoverZonesOff' },
        activeClass: 'active'
    });
}

export function initVenusAtmButton(celestialBodies) {
    return new Button('venus-atm-button', async () => {
        state.showVenusAtmosphere = !state.showVenusAtmosphere;
        await applyLanguage();
        celestialBodies.forEach(body => {
            if (body.name === 'Venus' && body.atmMesh) {
                body.atmMesh.visible = state.showVenusAtmosphere;
            }
        });
    });
}

export function initKuiperBeltButton(mesh, physicsEngine) {
    return new Button('kuiper-belt-button', () => {
        state.isKuiperBeltActive = !state.isKuiperBeltActive;
        if (mesh) mesh.visible = state.isKuiperBeltActive;
        physicsEngine.markDirty();
    }, {
        stateKey: 'isKuiperBeltActive',
        stateObject: state,
        labels: { on: 'kuiperBeltOn', off: 'kuiperBeltOff' }
    });
}

export function initRealisticScaleButton(celestialBodies, sunWrapper) {
    return new Button('realistic-scale-button', () => {
        state.isRealisticScale = !state.isRealisticScale;
        celestialBodies.forEach(body => {
            if (body.updateScale) body.updateScale(state.isRealisticScale);
        });
        if (sunWrapper && sunWrapper.updateScale) {
            sunWrapper.updateScale(state.isRealisticScale);
        }
        state.isTransitioning = true;
    }, {
        stateKey: 'isRealisticScale',
        stateObject: state,
        labels: { on: 'realisticScaleOn', off: 'realisticScaleOff' }
    });
}
