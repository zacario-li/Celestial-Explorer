const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(4000);
  
  // Click Saturn in nav list
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const saturn = items.find(el => el.dataset.engName === 'Saturn');
    if(saturn) saturn.click();
  });
  
  await page.waitForTimeout(3000);
  
  // Try to put Mimas in front of the sun
  await page.evaluate(() => {
    let saturn = celestialBodies.find(b => b.name === 'Saturn');
    if(saturn) {
      let mimas = saturn.satellites.find(m => m.name === 'Mimas');
      if(mimas) {
        let sunDir = saturn.pos.clone().negate().normalize();
        mimas.mesh.position.copy(saturn.mesh.worldToLocal(saturn.pos.clone().add(sunDir.multiplyScalar(22)))); 
        mimas.mesh.updateMatrixWorld();
      }
    }
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'saturn_screenshot.png' });
  await browser.close();
})();
