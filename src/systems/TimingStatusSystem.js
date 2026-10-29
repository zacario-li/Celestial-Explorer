import { state } from '../core/state.js';
import { t } from '../core/i18n.js';

const formatSeconds = value => value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString();

/** Displays measured physics throughput, not the requested slider multiplier. */
export class TimingStatusSystem {
    constructor(engine, output, now = () => performance.now()) {
        this.engine = engine;
        this.output = output;
        this.now = now;
        this.sample = null;
    }

    update() {
        if (!this.output) return;
        if (state.isPaused) {
            this.output.hidden = true;
            this.sample = null;
            return;
        }
        const now = this.now();
        if (!this.sample || this.sample.multiplier !== state.simSpeedMultiplier) {
            this.sample = { now, integrated: this.engine.getTimingStats().integratedSeconds,
                multiplier: state.simSpeedMultiplier };
            this.output.hidden = true;
            return;
        }
        const elapsed = (now - this.sample.now) / 1000;
        if (elapsed < 1) return;
        const stats = this.engine.getTimingStats();
        const speed = Math.max(0, (stats.integratedSeconds - this.sample.integrated) / elapsed);
        this.sample = { now, integrated: stats.integratedSeconds, multiplier: state.simSpeedMultiplier };
        if (state.simSpeedMultiplier <= 1 && stats.pendingSteps === 0) {
            this.output.hidden = true;
            return;
        }
        const parts = [`${t('physicsActual')}: ${Math.round(speed).toLocaleString()}×`];
        if (stats.pendingSeconds > 0) parts.push(`${t('physicsBacklog')}: ${formatSeconds(stats.pendingSeconds)}s`);
        if (stats.droppedSeconds > 0) parts.push(`${t('physicsDropped')}: ${formatSeconds(stats.droppedSeconds)}s`);
        this.output.textContent = parts.join(' · ');
        this.output.hidden = false;
    }
}
