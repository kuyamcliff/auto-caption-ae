// Renders the real panel (mock host) and captures screenshots.
// node ui-shots.js <outDir> [width] [height]
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const url = q => 'file://' + path.resolve(__dirname, '../extension/com.cyriq.cyriqcap/index.html') + (q || '');
(async () => {
  const out = process.argv[2]; const W = +process.argv[3] || 420, H = +process.argv[4] || 860;
  const b = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function page(q, init) {
    const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    pg.on('pageerror', e => errors.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await pg.addInitScript(init || (() => { localStorage.setItem('cq.apiDir', JSON.stringify('C:\\Users\\you\\Documents\\CyriqCap-API')); }));
    await pg.goto(url(q));
    await pg.waitForTimeout(1500);
    return pg;
  }
  // onboarding
  let pg = await page('', () => { localStorage.clear(); });
  await pg.screenshot({ path: out + '/ui-onboard-empty.png' });
  await pg.evaluate(() => { CQ.host.chooseFolder = () => Promise.resolve('C:\\Users\\you\\Documents\\CyriqCap-API'); });
  await pg.click('#onboard .btn.primary');
  await pg.waitForTimeout(1600);
  await pg.screenshot({ path: out + '/ui-onboard-done.png' });
  await pg.close();
  // captions
  pg = await page('?sel=video&fast=1');
  await pg.screenshot({ path: out + '/ui-captions.png' });
  await pg.click('#view-captions .btn.primary.block');
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: out + '/ui-captions-progress.png' });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: out + '/ui-captions-transcript.png', fullPage: false });
  await pg.evaluate(() => document.querySelector('#view-captions').scrollTop = 99999);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/ui-captions-style.png' });
  await pg.close();
  // animate
  pg = await page('?sel=text,text2');
  await pg.click('#tabs button[data-tab=animate]');
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: out + '/ui-animate.png' });
  await pg.evaluate(() => document.querySelector('#view-animate').scrollTop = 99999);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: out + '/ui-animate-detail.png' });
  await pg.close();
  // settings
  pg = await page('');
  await pg.click('#tabs button[data-tab=settings]');
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: out + '/ui-settings.png' });
  await pg.close();
  console.log(JSON.stringify(errors.slice(0, 20)));
  await b.close();
})();
