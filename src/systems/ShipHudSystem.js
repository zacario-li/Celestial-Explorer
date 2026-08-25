import { state } from '../core/state.js';
import { t } from '../core/i18n.js';

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
        this.vViewBtn = document.getElementById('v-toggle-view');
    }

    update() {
        const { vBar, vVal, vToggleBtn } = this;
        if (!vBar && !vVal && !vToggleBtn) return;
        if (!state.isFlying) return;

        // Update Virtual Throttle UI
        if (vBar) {
            // |throttle|: the bar is a magnitude meter; the direction is
            // shown by the FWD/REV labels below (a negative % is an invalid
            // CSS and the bar just froze at the old height)
            vBar.style.height = `${Math.abs(state.shipThrottle) * 100}%`;
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
        // The CAM toggle used to say whatever init set it to -- it now
        // reflects which view is actually active.
        if (this.vViewBtn) {
            this.vViewBtn.textContent = t(state.shipViewMode === 'chase' ? 'camChase' : 'camCockpit');
        }
    }
}
