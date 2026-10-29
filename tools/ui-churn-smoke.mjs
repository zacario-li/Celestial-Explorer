// Regression guard against whole-page relocalization on every flight frame.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(process.env.SMOKE_URL || 'http://localhost:3001/');
    await page.waitForFunction('window.SIM_READY === true', null, { timeout: 45000 });
    await page.locator('#pilot-button').click();
    await page.waitForTimeout(300);
    const count = await page.evaluate(async () => {
        window.state.isAutopilotActive = false;
        window.state.autopilotTarget = null;
        let mutations = 0;
        const observer = new MutationObserver(records => { mutations += records.length; });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
        observer.disconnect();
        return mutations;
    });
    assert.ok(count < 400, `too many DOM mutations across 20 frames: ${count}`);
    assert.deepEqual(errors, []);
    console.log(`ui-churn-smoke: ${count} mutations across 20 frames`);
} finally { await browser.close(); }
