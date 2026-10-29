// Real-browser check: body rotation follows executed physics time under a
// constrained substep budget, and pause stops both streams.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://localhost:3001/?seed=20260827');
    await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
    const result = await page.evaluate(async () => {
        const sim = window.__sim;
        const earth = window.__bodies.allBodies().find(b => b.name === 'Earth');
        sim.physicsEngine.frameBudgetMs = 0;
        sim.physicsEngine.frameBudget = 2;
        window.state.simSpeedMultiplier = 8000;
        await new Promise(requestAnimationFrame);
        const startRotation = earth.mesh.rotation.y;
        let integratedScripted = 0;
        for (let i = 0; i < 20; i++) {
            await new Promise(requestAnimationFrame);
            integratedScripted += sim.time.integratedScriptedDt;
        }
        const endRotation = earth.mesh.rotation.y;
        const pending = sim.physicsEngine.getTimingStats().pendingSteps;
        window.state.isPaused = true;
        await new Promise(requestAnimationFrame);
        const pausedRotation = earth.mesh.rotation.y;
        await new Promise(requestAnimationFrame);
        return { actual: endRotation - startRotation, expected: earth.rotSpeed * integratedScripted,
            pending, pausedDt: sim.time.integratedDt, pausedMovement: earth.mesh.rotation.y - pausedRotation };
    });
    assert.ok(result.pending > 0, 'test must exercise a real backlog');
    assert.ok(Math.abs(result.actual - result.expected) < 1e-9, `rotation diverged: ${JSON.stringify(result)}`);
    assert.equal(result.pausedDt, 0);
    assert.equal(result.pausedMovement, 0);
    assert.deepEqual(errors, []);
    console.log('unified-time-smoke: rendered rotation follows executed time; pause freezes it');
} finally { await browser.close(); }
