// End-to-end guidance regression using the actual browser systems and
// deterministic fixed wall frames. Requires the local server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const url = new URL(process.env.SMOKE_URL || 'http://localhost:3001/');
url.searchParams.set('seed', '20260827');
try {
    {
        const page = await browser.newPage();
        await page.goto(url.href);
        await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
        await page.locator('#pilot-button').click();
        const pendingBefore = await page.evaluate(() => {
            window.state.isPaused = true;
            const slider = document.getElementById('sim-speed-slider');
            slider.value = '300';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            const engine = window.__sim.physicsEngine;
            engine.frameBudgetMs = 0; engine.frameBudget = 1;
            engine.update(10, 0.02);
            return engine.getTimingStats().pendingSteps;
        });
        assert.ok(pendingBefore > 0, 'setup must contain a queued high-speed frame');
        await page.locator('#pilot-autopilot-button').click();
        await page.locator('#autopilot-dest-list .dest-item').filter({ hasText: 'Earth' }).first().click();
        const selected = await page.evaluate(() => ({
            active: window.state.isAutopilotActive,
            target: window.state.autopilotTarget?.name,
            pending: window.__sim.physicsEngine.getTimingStats().pendingSteps,
            speed: window.state.simSpeedMultiplier,
            toast: document.getElementById('toast-container').textContent,
        }));
        assert.equal(selected.active, true);
        assert.equal(selected.target, 'Earth');
        assert.equal(selected.pending, 0, 'old high-warp backlog must be discarded on engagement');
        assert.equal(selected.speed, 1, 'UI must remain at safe speed after autopilot exits');
        assert.match(selected.toast, /set simulation speed to 1×/);
        await page.evaluate(() => {
            const slider = document.getElementById('sim-speed-slider');
            slider.value = '300';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.equal(await page.evaluate(() => window.state.simSpeedMultiplier), 1, 'autopilot must reject high warp');
        console.log('UI engagement: backlog cleared and speed-limit notice shown');
        await page.close();
    }
    for (const scenario of [
        { name: 'rest-1x', speed: 1, initialInward: 0, reverse: false },
        { name: 'approaching-1x', speed: 1, initialInward: 3, reverse: false },
        { name: 'fast-approach-20fps', speed: 1, initialInward: 15, reverse: false, facingInward: true, frameDt: 0.05 },
        { name: 'longer-transfer', speed: 1, initialInward: 0, reverse: false, startDistance: 500, maxFrames: 15000 },
        { name: 'reverse-mode-1x', speed: 1, initialInward: 0, reverse: true },
        { name: 'requested-8000x', speed: 8000, initialInward: 0, reverse: false },
        { name: 'realistic-scale', speed: 1, initialInward: 0, reverse: false, realistic: true, startDistance: 0.2 },
    ]) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(url.href);
        await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
        const result = await page.evaluate(scenario => {
            const sim = window.__sim, engine = sim.physicsEngine, ship = sim.spaceship;
            const target = window.__bodies.allBodies().find(b => b.name === 'Earth');
            document.getElementById('pilot-button').click();
            sim.scene.add(ship);
            window.state.isRealisticScale = !!scenario.realistic;
            window.state._prevRealisticScaleForCam = !!scenario.realistic;
            target.updateScale(!!scenario.realistic);
            ship.scale.setScalar(scenario.realistic ? 0.00005 : 0.2);
            ship.position.copy(target.pos).add({ x: scenario.startDistance || 100, y: 0, z: 0 });
            ship.quaternion.identity();
            if (scenario.facingInward) ship.quaternion.setFromAxisAngle(ship.position.clone().set(0, 1, 0), Math.PI);
            window.state.shipVelocity.copy(target.vel).add({ x: -scenario.initialInward, y: 0, z: 0 });
            window.state.isPaused = false;
            window.state.capturedBody = null;
            window.state.isAutopilotActive = true;
            window.state.autopilotTarget = target;
            window.state._prevAutopilotTarget = null;
            window.state.autopilotPhase = '';
            window.state.simSpeedMultiplier = scenario.speed;
            window.state.isReverse = scenario.reverse;
            engine.clearPending();
            engine.frameBudgetMs = 0;
            engine.frameBudget = 2048;
            let elapsed = 0;
            const frameDt = scenario.frameDt || 0.02;
            sim.time.clock = { getElapsedTime: () => (elapsed += frameDt) };
            sim.time._prev = 0;
            const ctrl = sim.prePhysicsSystems.find(x => typeof x.captureSubstepInput === 'function');
            const autopilot = sim.prePhysicsSystems.find(x => x.apPathLine && x.apPathGeometry);
            const station = sim.postPhysicsSystems.find(x => typeof x.prepareInput === 'function');
            const ctx = ctrl.ctx;
            const hull = target.mesh.userData.radius * target.mesh.scale.x + 0.5 * ship.scale.x;
            let minDistance = Infinity, maxRequestedStep = 0, collision = false, frames = 0;
            for (; frames < (scenario.maxFrames || 5000); frames++) {
                sim.time.update();
                ctx.dt = sim.time.dt;
                ctrl.update();
                autopilot.update();
                if (window.state.capturedBody === target) break;
                station.prepareInput();
                maxRequestedStep = Math.max(maxRequestedStep, sim.time.simDt);
                ctx.physicsDt = engine.update(sim.time.simDt, sim.time.realDt);
                station.update();
                const distance = ship.position.distanceTo(target.pos);
                minDistance = Math.min(minDistance, distance);
                if (engine._flightResetPending || distance <= hull) { collision = true; break; }
            }
            return { frames, captured: window.state.capturedBody === target, collision, hull, minDistance,
                maxRequestedStep, selectedSpeed: window.state.simSpeedMultiplier,
                relativeSpeed: window.state.shipVelocity.distanceTo(target.vel) };
        }, scenario);
        assert.equal(result.collision, false, `${scenario.name}: collided ${JSON.stringify(result)}`);
        assert.equal(result.captured, true, `${scenario.name}: did not capture ${JSON.stringify(result)}`);
        assert.ok(result.minDistance > result.hull, `${scenario.name}: crossed hull`);
        assert.ok(result.maxRequestedStep <= (scenario.frameDt || 0.02) + 1e-6, `${scenario.name}: unsafe step ${result.maxRequestedStep}`);
        assert.equal(result.selectedSpeed, scenario.speed, 'user speed preference is not overwritten');
        assert.deepEqual(errors, []);
        if (process.env.AUTOPILOT_SCREENSHOTS && scenario.name === 'rest-1x') {
            fs.mkdirSync(process.env.AUTOPILOT_SCREENSHOTS, { recursive: true });
            await page.evaluate(() => { window.state.shipViewMode = 'chase'; });
            await page.waitForTimeout(5000);
            await page.screenshot({ path: path.join(process.env.AUTOPILOT_SCREENSHOTS, 'captured-earth.png') });
        }
        console.log(`${scenario.name}: safe capture after ${result.frames} frames, min distance ${result.minDistance.toFixed(2)}`);
        await page.close();
    }
} finally { await browser.close(); }
