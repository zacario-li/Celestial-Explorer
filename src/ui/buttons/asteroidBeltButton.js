import { Button } from './button.js';
import { state } from '../../core/state.js';

export function initAsteroidBeltButton(mesh, physicsEngine) {
    return new Button('asteroid-belt-button', () => {
        state.isAsteroidBeltActive = !state.isAsteroidBeltActive;
        if (mesh) mesh.visible = state.isAsteroidBeltActive;
        physicsEngine.markDirty();
    }, {
        stateKey: 'isAsteroidBeltActive',
        stateObject: state,
        labels: { on: 'asteroidBeltOn', off: 'asteroidBeltOff' }
    });
}
