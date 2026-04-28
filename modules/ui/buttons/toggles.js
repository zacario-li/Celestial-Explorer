import { Button } from './button.js';
import { state } from '../../state.js';
import { highVisLight } from '../../sceneSetup.js';
import { applyLanguage } from '../../ui.js';

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
