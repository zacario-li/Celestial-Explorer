import { state } from '../core/state.js';

/**
 * ShipHudSystem — pilot HUD widget updates (was script.js animate(), ~L1192-1215).
 *
 * Updates the virtual throttle bar / readout / reverse toggle every frame.
 */
export class ShipHudSystem {
    constructor(ctx) {
        this.vBar = document.getElementById('v-throttle-bar');
        this.vVal = document.getElementById('v-throttle-val');
        this.vToggleBtn = document.getElementById('v-toggle-reverse');
    }

    update() {
        const { vBar, vVal, vToggleBtn } = this;
        if (!vBar && !vVal && !vToggleBtn) return;
        if (!state.isFlying) return;

        // Update Virtual Throttle UI
        if (vBar) {
            vBar.style.height = `${state.shipThrottle * 100}%`;
            vBar.classList.toggle('reverse', state.isReverse);
        }
        if (vVal) {
            const pct = Math.round(state.shipThrottle * 100);
            const mode = state.isReverse ? 'REV' : 'FWD';
            vVal.textContent = `${pct}% ${mode}`;
        }
        if (vToggleBtn) {
            vToggleBtn.classList.toggle('reverse-active', state.isReverse);
            vToggleBtn.textContent = state.isReverse ? 'REV: ON' : 'REV: OFF';
        }
    }
}
