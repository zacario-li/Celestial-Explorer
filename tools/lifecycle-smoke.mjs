// Browser regression: removal of a host must not leave live satellite UI or
// dispose the independently owned spaceship. Requires the local server.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.env.SMOKE_URL || 'http://localhost:3001/');
    await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
    const result = await page.evaluate(() => {
        const bodies = window.__bodies.allBodies();
        const cleanup = window.__sim.postPhysicsSystems.find(s => s.constructor.name === 'CleanupSystem');
        const jupiter = bodies.find(b => b.name === 'Jupiter');
        const moon = jupiter.satellites[0];
        window.state.focusedBody = moon.mesh;
        window.state.previousBody = moon.mesh;
        jupiter.destroyed = true;
        cleanup.update();
        const satellite = { destroyed: moon.destroyed, focused: window.state.focusedBody === moon.mesh,
            previous: window.state.previousBody === moon.mesh,
            nav: !!document.querySelector('[data-eng-name="Io"]') };
        const earth = bodies.find(b => b.name === 'Earth');
        const ship = window.__sim.spaceship;
        let disposed = 0;
        ship.traverse(n => { if (n.geometry) n.geometry.addEventListener('dispose', () => disposed++); });
        const before = ship.getWorldPosition(ship.position.clone());
        earth.destroyed = true;
        cleanup.update();
        const after = ship.getWorldPosition(ship.position.clone());
        let root = ship;
        while (root.parent) root = root.parent;
        return { satellite, shipConnected: root === window.__sim.scene, disposed, shipDelta: before.distanceTo(after) };
    });
    assert.deepEqual(result.satellite, { destroyed: true, focused: false, previous: false, nav: false });
    assert.equal(result.shipConnected, true);
    assert.equal(result.disposed, 0);
    assert.ok(result.shipDelta < 1e-6, `ship moved ${result.shipDelta}`);
    assert.deepEqual(errors, []);
    console.log('lifecycle-smoke: satellite cleanup and ship preservation OK');
} finally { await browser.close(); }
