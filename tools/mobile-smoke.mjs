// Mobile layout and touch regression against a running `node server.js`.
// Set MOBILE_SCREENSHOTS=/tmp/dir to save rendered screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const url = process.env.SMOKE_URL || 'http://localhost:3001/?seed=20260827';
const shots = process.env.MOBILE_SCREENSHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
try {
    for (const [name, config] of [
        ['iphone-se', devices['iPhone SE']],
        ['iphone-13', devices['iPhone 13']],
        ['iphone-se-landscape', { ...devices['iPhone SE'], viewport: { width: 568, height: 320 } }],
    ]) {
        const context = await browser.newContext(config);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
        await page.waitForTimeout(1500);
        const viewport = page.viewportSize();
        const bounds = await page.evaluate(() => ({
            innerWidth, docWidth: document.documentElement.scrollWidth,
            canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(),
            nav: document.querySelector('#nav-panel').getBoundingClientRect().toJSON(),
            bar: document.querySelector('#ui-right').getBoundingClientRect().toJSON(),
        }));
        assert.equal(bounds.innerWidth, viewport.width, `${name}: viewport expanded`);
        assert.ok(bounds.docWidth <= viewport.width, `${name}: page overflows`);
        assert.ok(bounds.nav.left >= 0 && bounds.nav.right <= viewport.width, `${name}: nav out of view`);
        assert.ok(bounds.bar.left >= 0 && bounds.bar.right <= viewport.width, `${name}: controls out of view`);
        assert.equal(bounds.canvas.width, viewport.width, `${name}: canvas width`);
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-overview.png`) });
        const more = page.locator('#mobile-more-button');
        const hit = await more.evaluate(button => {
            const r = button.getBoundingClientRect();
            const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return target === button || button.contains(target);
        });
        assert.ok(hit, `${name}: more button is covered`);
        await more.tap();
        assert.equal(await more.getAttribute('aria-expanded'), 'true');
        assert.ok(await page.locator('#spawn-button').isVisible(), `${name}: extra actions hidden`);
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-more.png`) });
        const beltBefore = await page.evaluate(() => window.__sim.state.isAsteroidBeltActive);
        await page.locator('#asteroid-belt-button').tap();
        assert.notEqual(await page.evaluate(() => window.__sim.state.isAsteroidBeltActive), beltBefore);
        assert.equal(await page.locator('#mobile-more-button').getAttribute('aria-expanded'), 'false');
        const info = page.locator('#info-panel');
        if (await info.isVisible()) {
            await info.tap();
            assert.equal(await info.getAttribute('aria-expanded'), 'true');
            await info.tap();
            assert.equal(await info.getAttribute('aria-expanded'), 'false');
        }
        await page.locator('#settings-button').tap();
        const modal = page.locator('#settings-modal .modal-content');
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        const box = await modal.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${name}: modal overflows width`);
        assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${name}: modal overflows height`);
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-settings.png`) });
        await page.locator('#settings-close-btn').tap();
        await page.locator('#pilot-button').tap();
        assert.equal(await page.evaluate(() => window.__sim.state.isFlying), true, `${name}: pilot did not start`);
        assert.equal(await page.locator('#v-controller').isVisible(), true, `${name}: touch controls hidden`);
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-pilot.png`) });
        await page.locator('#v-up').tap();
        await page.locator('#mobile-more-button').tap();
        assert.equal(await page.locator('#mobile-more-button').getAttribute('aria-expanded'), 'true', `${name}: drawer in pilot mode`);
        assert.ok(await page.locator('#spawn-button').isVisible());
        await page.locator('#mobile-more-button').tap();
        assert.deepEqual(errors, [], `${name}: page errors`);
        console.log(`${name}: layout, modal and pilot touch OK`);
        await context.close();
    }
} finally { await browser.close(); }
