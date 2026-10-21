// Renders the real panel (mock host) and captures screenshots.
// node ui-shots.js <outDir> [width] [height]
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const url = q => 'file://' + path.resolve(__dirname, '../extension/com.cyriq.cyriqcap/index.html') + (q || '');
const DIR = 'C:\\Users\\you\\Documents\\CyriqCap-API';
(async () => {
  const out = process.argv[2]; const W = +process.argv[3] || 320, H = +process.argv[4] || 560;
  const b = await chromium.launch({ executablePath: EXE });
  const errors = [];
  async function page(q, init, size) {
    const pg = await b.newPage({ viewport: size || { width: W, height: H }, deviceScaleFactor: 2 });
    pg.on('pageerror', e => errors.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(m.text()); });
    await pg.addInitScript(init || (d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); }), DIR);
    await pg.goto(url(q));
    await pg.waitForTimeout(1200);
    return pg;
  }
  const shot = (pg, n) => pg.screenshot({ path: out + '/' + n + '.png' });

  // setup
  let pg = await page('', () => { localStorage.clear(); });
  await shot(pg, 'setup');
  await pg.evaluate(d => { CQ.host.chooseFolder = () => Promise.resolve(d); }, DIR);
  await pg.click('#setup .btn.primary');
  await pg.waitForTimeout(150);
  await shot(pg, 'setup-verifying');
  await pg.waitForTimeout(450);
  await shot(pg, 'setup-ready');
  await pg.close();
  pg = await page('?api=bad', () => { localStorage.clear(); });
  await pg.evaluate(d => { CQ.host.chooseFolder = () => Promise.resolve(d); }, DIR);
  await pg.click('#setup .btn.primary');
  await pg.waitForTimeout(700);
  await shot(pg, 'setup-bad');
  await pg.close();

  // captions
  pg = await page('?sel=video&fast=1', d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.capSub', '"transcript"'); });
  await shot(pg, 'captions');
  await pg.click('#view-captions .btn.icon[title="Download more models"]');
  await pg.waitForTimeout(300);
  await shot(pg, 'models');
  await pg.click('.dlg .acts .btn');
  await pg.click('#view-captions .btn.primary.block');
  await pg.waitForTimeout(500);
  await shot(pg, 'progress');
  await pg.waitForTimeout(2600);
  await shot(pg, 'transcript');
  await pg.click('#view-captions .subtabs .seg button:nth-child(2)');
  await pg.waitForTimeout(500);
  await shot(pg, 'style');
  await pg.evaluate(() => document.querySelector('#view-captions .scroll').scrollTop = 99999);
  await pg.waitForTimeout(300);
  await shot(pg, 'style-bottom');
  await pg.evaluate(() => document.querySelector('#view-captions .scroll').scrollTop = 0);
  await pg.click('.fontpick');
  await pg.waitForTimeout(400);
  await shot(pg, 'fontpicker');
  await pg.close();

  // vertical comp
  pg = await page('?sel=video&vertical=1', d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.capSub', '"style"'); });
  await pg.waitForTimeout(600);
  await shot(pg, 'style-vertical');
  await pg.close();

  // animate
  pg = await page('?sel=text,text2', d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.tab', '"animate"'); });
  await pg.waitForTimeout(1500);
  await shot(pg, 'animate');
  await pg.waitForTimeout(700);
  await shot(pg, 'animate-2');
  await pg.click('#view-animate .foot .iconbtn[title=Options]');
  await pg.waitForTimeout(300);
  await shot(pg, 'animate-options');
  await pg.mouse.click(5, 300);
  await pg.evaluate(() => { const p = CQ.presets.list.find(x => (x.needs || []).length); CQ.animate.pluginDialog(p, p.needs); });
  await pg.waitForTimeout(300);
  await shot(pg, 'plugin');
  await pg.close();

  // settings + help
  pg = await page('');
  await pg.click('#gear');
  await pg.waitForTimeout(500);
  await shot(pg, 'settings');
  await pg.click('#tabs button[data-tab=help]');
  await pg.waitForTimeout(500);
  await shot(pg, 'help');
  await pg.close();

  // wide panel
  pg = await page('?sel=text', d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.tab', '"animate"'); }, { width: 760, height: 520 });
  await pg.waitForTimeout(1500);
  await shot(pg, 'wide-animate');
  await pg.close();

  console.log(JSON.stringify(errors.slice(0, 20)));
  await b.close();
})();
