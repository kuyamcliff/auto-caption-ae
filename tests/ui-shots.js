// Renders the real panel (mock host) and captures screenshots.
// node ui-shots.js <outDir> [width] [height]
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const url = q => 'file://' + path.resolve(__dirname, '../extension/com.cyriq.cyriqcap/index.html') + (q || '');
const DIR = 'C:\\Users\\you\\Documents\\CyriqCap-API';
(async () => {
  const out = process.argv[2]; const W = +process.argv[3] || 380, H = +process.argv[4] || 760;
  const b = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function page(q, init) {
    const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    pg.on('pageerror', e => errors.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await pg.addInitScript(init || (d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); }), DIR);
    await pg.goto(url(q));
    await pg.waitForTimeout(1500);
    return pg;
  }
  const shot = (pg, n) => pg.screenshot({ path: out + '/' + n + '.png' });

  // setup
  let pg = await page('', () => { localStorage.clear(); });
  await shot(pg, 'setup-empty');
  await pg.evaluate(d => { CQ.host.chooseFolder = () => Promise.resolve(d); }, DIR);
  await pg.click('#setup .btn.primary');
  await pg.waitForTimeout(700);
  await shot(pg, 'setup-running');
  await pg.waitForTimeout(3500);
  await shot(pg, 'setup-done');
  await pg.close();

  pg = await page('?api=bad', () => { localStorage.clear(); });
  await pg.evaluate(d => { CQ.host.chooseFolder = () => Promise.resolve(d); }, DIR);
  await pg.click('#setup .btn.primary');
  await pg.waitForTimeout(4500);
  await shot(pg, 'setup-bad');
  await pg.close();

  // captions
  pg = await page('?sel=video&fast=1');
  await shot(pg, 'captions');
  await pg.click('#view-captions .btn.icon[title="Get more models"]');
  await pg.waitForTimeout(400);
  await shot(pg, 'models');
  await pg.click('.dlg .m:nth-child(4) .btn');
  await pg.waitForTimeout(400);
  await shot(pg, 'models-downloading');
  await pg.click('.dlg .acts .btn');
  await pg.click('#view-captions .btn.primary.block');
  await pg.waitForTimeout(250);
  await shot(pg, 'captions-progress');
  await pg.waitForTimeout(2500);
  await shot(pg, 'transcript');
  await pg.evaluate(() => { const v = document.querySelector('#view-captions'); const s = [...v.querySelectorAll('.section')].find(x => /Style/.test(x.textContent.slice(0, 20))); v.scrollTop = s ? s.offsetTop - 4 : 99999; });
  await pg.waitForTimeout(400);
  await shot(pg, 'style');
  await pg.evaluate(() => document.querySelector('#view-captions').scrollTop = 99999);
  await pg.waitForTimeout(400);
  await shot(pg, 'style-bottom');
  await pg.close();

  // animate
  pg = await page('?sel=text,text2');
  await pg.click('#tabs button[data-tab=animate]');
  await pg.waitForTimeout(2500);
  await shot(pg, 'animate');
  await pg.evaluate(() => document.querySelector('#view-animate').scrollTop = 99999);
  await pg.waitForTimeout(500);
  await shot(pg, 'animate-cards');
  await pg.evaluate(() => { const p = CQ.presets.list.find(x => (x.needs || []).length); CQ.animate.pluginDialog(p, p.needs); });
  await pg.waitForTimeout(300);
  await shot(pg, 'plugin');
  await pg.close();

  // settings + help
  pg = await page('');
  await pg.click('#tabs button[data-tab=settings]');
  await pg.waitForTimeout(1200);
  await shot(pg, 'settings');
  await pg.click('#tabs button[data-tab=help]');
  await pg.waitForTimeout(800);
  await shot(pg, 'help');
  await pg.close();

  // wide layout
  pg = await b.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 });
  await pg.addInitScript(d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); }, DIR);
  await pg.goto(url('?sel=text'));
  await pg.waitForTimeout(1500);
  await pg.click('#tabs button[data-tab=animate]');
  await pg.waitForTimeout(1500);
  await shot(pg, 'wide-animate');
  await pg.close();

  console.log(JSON.stringify(errors.slice(0, 20)));
  await b.close();
})();
