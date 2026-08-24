/**
 * CI smoke test (refactor #7): boots the app in headless Chromium and asserts
 * the invariants the build pipeline must never break.
 *
 *   node server.js &            (or PORT=3001 node server.js &)
 *   node tools/ci-smoke.mjs [url]
 *
 * Exits non-zero on: any page/console error, wrong population counts, NaN
 * positions, a stalled animation loop, or a failed pilot-mode round trip.
 */
import pw from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { chromium } = pw;
const URL = process.argv[2] || 'http://localhost:3001';

const expected = {
    physicsPlanets: 11,
    minAliveBodies: 2400,
    navItems: 31
};

const errors = [];
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SIM_READY === true, null, { timeout: 45000 });
await page.waitForTimeout(7000); // let physics settle + STL load

const probe = await page.evaluate(({ expected }) => {
    const out = { issues: [] };
    const pe = window.physicsEngine;
    out.physicsPlanets = pe ? pe.activePlanets.length : -1;
    out.aliveBodies = pe ? pe.physicsBodies.filter(b => !b.destroyed).length : -1;
    for (const b of (pe ? pe.physicsBodies : [])) {
        if (b.destroyed) continue;
        if (isNaN(b.pos.x) || isNaN(b.pos.z)) out.issues.push('NaN in ' + (b.name || 'body'));
    }
    const cam = window.camera;
    if (!cam || isNaN(cam.position.x)) out.issues.push('camera NaN');
    out.navItems = document.querySelectorAll('.nav-item').length;
    const cv = document.querySelector('canvas');
    let nonBlack = 0;
    if (cv) {
        const c2 = document.createElement('canvas');
        c2.width = 64; c2.height = 64;
        const g = c2.getContext('2d');
        g.drawImage(cv, 0, 0, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 24) nonBlack++;
    }
    out.nonBlackPx = nonBlack; // informational: WebGL buffers clear between
                               // frames (no preserveDrawingBuffer), so 0 is
                               // expected here even on a healthy scene
    out.sunIsPhysicsBody = pe && pe.physicsBodies.find(b => b.isSun) ? 1 : 0;
    out.hasIndex = (window.__bodies && window.__bodies.allBodies().length) || 0;
    out.timeAdvanced = (window.__sim && window.__sim.time && window.state.virtualTime > 0) ? 1 : 0;

    if (out.physicsPlanets !== expected.physicsPlanets) out.issues.push('planets ' + out.physicsPlanets);
    if (out.aliveBodies < expected.minAliveBodies) out.issues.push('alive ' + out.aliveBodies);
    if (out.navItems !== expected.navItems) out.issues.push('nav ' + out.navItems);
    if (!out.sunIsPhysicsBody) out.issues.push('sun missing from physics');
    if (!out.hasIndex) out.issues.push('body index missing');
    if (!out.timeAdvanced) out.issues.push('animation loop not advancing');
    return out;
}, { expected });

// Pilot round trip: enter, throttle, exit
const pilot = await page.evaluate(() => {
    const el = document.getElementById('pilot-button');
    if (!el) return { ok: false, note: 'pilot-button missing' };
    el.click();
    return new Promise(resolve => setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
            const vel = +window.state.shipVelocity.length().toPrecision(4);
            document.getElementById('pilot-button')?.click();
            setTimeout(() => resolve({ ok: !window.state.isFlying, vel, flying: window.state.isFlying }), 800);
        }, 1500);
    }, 400));
});

await browser.close();

const failures = [...errors, ...probe.issues].filter(Boolean);
if (pilot.flying) failures.push('pilot did not exit');
if (pilot.vel <= 0) failures.push('pilot never got thrust');

const report = {
    url: URL,
    loadMs: Date.now() - t0,
    probe: { ...probe, issues: probe.issues },
    pilot,
    errors: errors.slice(0, 10),
    pass: failures.length === 0
};
const json = JSON.stringify(report, null, 2);
console.log(json);
fs.writeFileSync(path.join(os.tmpdir(), 'ci-smoke-report.json'), json);
process.exit(report.pass ? 0 : 1);
