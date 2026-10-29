import assert from 'node:assert/strict';
import { state } from '../../src/core/state.js';
import { TimingStatusSystem } from '../../src/systems/TimingStatusSystem.js';

const previous = { paused: state.isPaused, speed: state.simSpeedMultiplier, language: state.currentLang };
try {
    let now = 0;
    const stats = { integratedSeconds: 100, pendingSeconds: 0, pendingSteps: 0, droppedSeconds: 0 };
    const engine = { getTimingStats: () => ({ ...stats }) };
    const output = { hidden: true, textContent: '' };
    const system = new TimingStatusSystem(engine, output, () => now);
    state.isPaused = false;
    state.simSpeedMultiplier = 8000;
    state.currentLang = 'en';
    system.update();
    now = 1000; stats.integratedSeconds += 1000; stats.pendingSeconds = 200; stats.pendingSteps = 4; stats.droppedSeconds = 40;
    system.update();
    assert.equal(output.hidden, false);
    assert.match(output.textContent, /Physics: 1,000×/);
    assert.match(output.textContent, /queued: 200s/);
    assert.match(output.textContent, /discarded total: 40s/);
    state.isPaused = true;
    now = 2000; system.update();
    assert.equal(output.hidden, true, 'paused samples must not show a stale rate');
    state.isPaused = false; state.currentLang = 'zh';
    now = 9000; system.update(); // new baseline, excludes the paused interval
    now = 10000; stats.integratedSeconds += 20; system.update();
    assert.match(output.textContent, /物理实际: 20×/);
    assert.match(output.textContent, /积压: 200s/);
    state.simSpeedMultiplier = 1; stats.pendingSeconds = 0; stats.pendingSteps = 0;
    now = 11000; system.update();
    assert.equal(output.hidden, true, 'normal speed without backlog is uncluttered');
    console.log('timing-status: 8 checks passed');
} finally {
    state.isPaused = previous.paused;
    state.simSpeedMultiplier = previous.speed;
    state.currentLang = previous.language;
}
