// Verify the seed controls actual scene construction, not merely the PRNG.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    async function snapshot(seed) {
        const page = await browser.newPage();
        try {
            const errors = [];
            page.on('pageerror', e => errors.push(String(e)));
            await page.goto(`http://localhost:3001/?seed=${encodeURIComponent(seed)}`);
            await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
            const value = await page.evaluate(() => {
                const sim = window.__sim;
                const asteroid = sim.physicsEngine.physicsBodies.find(b => b.isAsteroid);
                const visual = sim.postPhysicsSystems.find(s => s.constructor.name === 'BodyVisualSystem');
                const stars = visual.ctx.starField.geometry.attributes.position.array;
                return { stars: Array.from(stars.slice(0, 12)), radius: asteroid.orbitRadius,
                    local: asteroid.instances[0].localPos.toArray() };
            });
            assert.deepEqual(errors, []);
            return value;
        } finally { await page.close(); }
    }
    const a = await snapshot('audit-1');
    const b = await snapshot('audit-1');
    const c = await snapshot('audit-2');
    assert.deepEqual(a, b, 'same seed must reproduce scene');
    assert.notDeepEqual(a, c, 'different seeds must produce different scenes');
    console.log('seed-smoke: scene generation is reproducible');
} finally { await browser.close(); }
