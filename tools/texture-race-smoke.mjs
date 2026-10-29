// Real browser regression: deliberately finish a formerly focused texture
// after switching focus or destroying the body.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    for (const scenario of ['focus', 'destroy']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const errors = [];
        let highRequests = 0;
        page.on('pageerror', error => errors.push(String(error)));
        await page.route('**/textures/planets/earth.jpg', async route => {
            highRequests++;
            await new Promise(resolve => setTimeout(resolve, 2500));
            await route.continue().catch(() => {});
        });
        await page.goto('http://localhost:3001/?seed=20260827');
        await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
        await page.waitForFunction(() => {
            const earth = window.__bodies.allBodies().find(b => b.name === 'Earth');
            return earth?.mesh.material.map?.image?.src?.includes('/low/earth.jpg');
        }, null, { timeout: 15000 });
        await page.getByText('Earth', { exact: true }).first().click();
        await page.waitForFunction(() => window.state.focusedBody?.userData?.name === 'Earth');
        await page.waitForTimeout(300);
        assert.ok(highRequests > 0, 'focused high tier was requested');
        if (scenario === 'focus') {
            await page.getByText('Jupiter', { exact: true }).first().click();
        } else {
            await page.evaluate(() => {
                const earth = window.__bodies.allBodies().find(b => b.name === 'Earth');
                window.__deadMaterial = earth.mesh.material;
                window.__deadMap = earth.mesh.material.map;
                earth.destroyed = true;
                window.__sim.postPhysicsSystems.find(s => s.constructor.name === 'CleanupSystem').update();
            });
        }
        await page.waitForTimeout(3500);
        const result = await page.evaluate(scenario => {
            if (scenario === 'destroy') return { unchanged: window.__deadMaterial.map === window.__deadMap };
            const earth = window.__bodies.allBodies().find(b => b.name === 'Earth');
            return { low: earth.mesh.material.map?.image?.src?.includes('/low/earth.jpg') };
        }, scenario);
        assert.equal(scenario === 'focus' ? result.low : result.unchanged, true, `${scenario}: stale texture was applied`);
        assert.deepEqual(errors, []);
        console.log(`texture-race ${scenario}: delayed response ignored`);
        await page.close();
    }
} finally { await browser.close(); }
