import { Button } from './button.js';
import { state } from '../../state.js';
import { updateInfoPanel } from '../../ui.js';
import { scene } from '../../sceneSetup.js';

export function initOverviewButton() {
    return new Button('overview-button', function() {
        if (!state.isOverview) {
            state.previousBody = state.focusedBody;
            state.focusedBody = null;
            state.isOverview = true;
            state.isTransitioning = true;
            updateInfoPanel(null);
        } else {
            state.focusedBody = state.previousBody || scene.children.find(c => c.userData && c.userData.isSun);
            state.isTransitioning = true;
            updateInfoPanel(state.focusedBody);
        }
        // updateTextureResolution() will be called by the central manager or via state observer
        this.textContent = state.isOverview ? 'OVERVIEW: OFF' : 'OVERVIEW: ON'; // Fallback before i18n
    }, {
        stateKey: 'isOverview',
        stateObject: state,
        labels: { on: 'overviewOff', off: 'overviewOn' }
    });
}
