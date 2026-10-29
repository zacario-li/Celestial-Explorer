// Validate scheduler counters under a real browser's time-budgeted drain.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://localhost:3001/?seed=20260827');
    await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
    const result = await page.evaluate(() => {
        const engine = window.__sim.physicsEngine;
        window.state.simSpeedMultiplier = 1000000;
        for (let i = 0; i < 3; i++) engine.update(50000, 0.05);
        const busy = engine.getTimingStats();
        engine.clearPending();
        return { busy, reset: engine.getTimingStats() };
    });
    const balanced = s => Math.abs(s.requestedSeconds - s.integratedSeconds - s.pendingSeconds - s.droppedSeconds)
        < Math.max(1, s.requestedSeconds) * 1e-8;
    assert.ok(result.busy.pendingSteps > 0, 'high warp should create a backlog in this test');
    assert.ok(result.busy.droppedSeconds > 0, 'queue cap should account for discarded time');
    assert.ok(balanced(result.busy));
    assert.equal(result.reset.pendingSteps, 0);
    assert.ok(balanced(result.reset));
    assert.deepEqual(errors, []);
    console.log('time-accounting-smoke: backlog, overflow and reset balanced');
} finally { await browser.close(); }
