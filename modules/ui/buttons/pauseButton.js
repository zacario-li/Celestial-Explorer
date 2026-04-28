import { Button } from './button.js';
import { state } from '../../state.js';

export function initPauseButton() {
    return new Button('pause-button', () => {
        state.isPaused = !state.isPaused;
    }, {
        stateKey: 'isPaused',
        stateObject: state,
        labels: { on: 'resume', off: 'pause' },
        colors: { 
            on: '#ff4f4f', off: '#4fa6ff', 
            onBg: 'rgba(255, 79, 79, 0.2)', offBg: 'rgba(255, 255, 255, 0.05)' 
        }
    });
}
