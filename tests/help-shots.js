// Captures the Help screenshots from the real panel (mock host) and records
// where each numbered arrow should point.
// node help-shots.js <rawDir>   -> <rawDir>/*.png + <rawDir>/targets.json
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const url = q => 'file://' + path.resolve(__dirname, '../extension/com.cyriq.cyriqcap/index.html') + (q || '');
const DIR = 'C:\\Users\\you\\Documents\\CyriqCap-API';
const W = 380;

(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  const targets = {};
  async function page(q, h, init) {
    const pg = await b.newPage({ viewport: { width: W, height: h || 640 }, deviceScaleFactor: 2 });
    await pg.addInitScript(init || (d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.tab', '"captions"'); }), DIR);
    await pg.goto(url(q));
    await pg.waitForTimeout(1500);
    return pg;
  }
  // rect of a selector (or a function returning an element) in % of viewport
  async function rect(pg, sel) {
    return pg.evaluate(s => {
      const e = typeof s === 'string' ? document.querySelector(s) : null;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    }, sel);
  }
  async function record(pg, name, sels) {
    await pg.screenshot({ path: out + '/' + name + '.png' });
    const list = [];
    for (const s of sels) list.push(await rect(pg, s));
    targets[name] = list;
  }
  // mark elements so they can be targeted by attribute
  const tag = (pg, fn) => pg.evaluate(fn);

  // 1 setup
  let pg = await page('', 640, () => { localStorage.clear(); });
  await pg.evaluate(d => { CQ.host.chooseFolder = () => Promise.resolve(d); }, DIR);
  await pg.click('#setup .btn.primary');
  await pg.waitForTimeout(4200);
  await record(pg, 'setup', ['#setup .pathline', '#setup .fc', '#setup .btn.primary:not(.hidden)']);
  await pg.close();

  // 2 captions + 3 models
  pg = await page('?sel=video&fast=1', 420);
  await tag(pg, () => {
    const f = [...document.querySelectorAll('#view-captions .field')];
    f.find(x => /^Model/.test(x.textContent)).querySelector('select').setAttribute('data-h', 'model');
    f.find(x => /^Language/.test(x.textContent)).querySelector('select').setAttribute('data-h', 'lang');
  });
  await record(pg, 'captions', ['#view-captions .source', '[data-h=model]', '[data-h=lang]', '#view-captions .btn.primary.block']);
  await pg.click('#view-captions .btn.icon[title="Get more models"]');
  await pg.waitForTimeout(400);
  await record(pg, 'models', ['.dlg .m:nth-child(4) .btn']);
  await pg.click('.dlg .acts .btn');

  // 4 transcript
  await pg.setViewportSize({ width: W, height: 560 });
  await pg.click('#view-captions .btn.primary.block');
  await pg.waitForTimeout(2800);
  await pg.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); const v = document.querySelector('#view-captions'); const s = [...v.querySelectorAll('.section')].find(x => /^Transcript/i.test(x.textContent)); v.scrollTop = s.offsetTop - 8; });
  await pg.waitForTimeout(300);
  await record(pg, 'transcript', ['#view-captions .seg', '#view-captions .row textarea', '#view-captions .row .times']);

  // 5 style + create
  await pg.setViewportSize({ width: W, height: 900 });
  await pg.evaluate(() => { const v = document.querySelector('#view-captions'); const s = [...v.querySelectorAll('.section')].find(x => /^Style/i.test(x.textContent)); v.scrollTop = s.offsetTop - 8; });
  await pg.waitForTimeout(600);
  await tag(pg, () => {
    const f = [...document.querySelectorAll('#view-captions .field')];
    f.find(x => /^Font/.test(x.textContent)).querySelector('select').setAttribute('data-h', 'font');
    f.find(x => /^Position/.test(x.textContent)).querySelector('.seg').setAttribute('data-h', 'pos');
    [...document.querySelectorAll('#view-captions .btn.primary.block')].pop().setAttribute('data-h', 'create');
  });
  await record(pg, 'style', ['#view-captions .stage canvas', '[data-h=font]', '[data-h=pos]', '[data-h=create]']);
  await pg.close();

  // 6 animate + 7 plugin
  pg = await page('?sel=text,text2', 640);
  await pg.click('#tabs button[data-tab=animate]');
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { const v = document.querySelector('#view-animate'); const t = v.querySelector('.toolbar'); v.scrollTop = t.offsetTop - 250; });
  await pg.waitForTimeout(1800);
  await tag(pg, () => { document.querySelectorAll('#view-animate .card')[4].setAttribute('data-h', 'card'); document.querySelector('#view-animate .detail .btn.primary').setAttribute('data-h', 'apply'); });
  await record(pg, 'animate', ['#view-animate .toolbar .count', '[data-h=card]', '[data-h=apply]']);
  await pg.evaluate(() => { const p = CQ.presets.list.find(x => (x.needs || []).length); CQ.animate.pluginDialog(p, p.needs); });
  await pg.waitForTimeout(400);
  await record(pg, 'plugin', ['.dlg ul']);
  await pg.close();

  // 8 settings / fonts
  pg = await page('', 640);
  await pg.click('#tabs button[data-tab=settings]');
  await pg.waitForTimeout(900);
  await pg.evaluate(() => { const v = document.querySelector('#view-settings'); const s = [...v.querySelectorAll('.section')].find(x => /^Fonts/i.test(x.textContent)); v.scrollTop = s.offsetTop - 120; });
  await pg.waitForTimeout(300);
  await tag(pg, () => { [...document.querySelectorAll('#view-settings .btn')].find(x => /Install Fonts/.test(x.textContent)).setAttribute('data-h', 'fonts'); });
  await record(pg, 'settings', ['[data-h=fonts]']);
  await pg.close();

  fs.writeFileSync(out + '/targets.json', JSON.stringify(targets, null, 1));
  console.log(Object.keys(targets).map(k => k + ':' + targets[k].filter(Boolean).length + '/' + targets[k].length).join(' '));
  await b.close();
})();
