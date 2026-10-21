// Captures the Help screenshots from the real panel (mock host) and records
// where each numbered arrow points.
// node help-shots.js <rawDir>   -> <rawDir>/<id>.png + <rawDir>/targets.json
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const url = q => 'file://' + path.resolve(__dirname, '../extension/com.cyriq.cyriqcap/index.html') + (q || '');
const DIR = 'C:\\Users\\you\\Documents\\CyriqCap-API';
const W = 320;

(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  const targets = {};
  async function page(q, h, init) {
    const pg = await b.newPage({ viewport: { width: W, height: h || 560 }, deviceScaleFactor: 2 });
    await pg.addInitScript(init || (d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.tab', '"captions"'); localStorage.setItem('cq.capSub', '"transcript"'); }), DIR);
    await pg.goto(url(q));
    await pg.waitForTimeout(1300);
    return pg;
  }
  async function record(pg, name, sels) {
    await pg.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await pg.screenshot({ path: out + '/' + name + '.png' });
    const list = [];
    for (const s of sels) {
      list.push(await pg.evaluate(sel => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
      }, s));
    }
    targets[name] = list;
  }
  const mark = (pg, fn) => pg.evaluate(fn);

  // 1 setup
  let pg = await page('', 420, () => { localStorage.clear(); });
  await record(pg, 'setup', ['#setup .btn.primary']);
  await pg.close();

  // 2 generate + 3 edit + 4 style
  pg = await page('?sel=video&fast=1', 470);
  await mark(pg, () => {
    const f = [...document.querySelectorAll('#view-captions .field')];
    f.find(x => /^Model/.test(x.textContent)).querySelector('select').setAttribute('data-h', 'model');
    f.find(x => /^Language/.test(x.textContent)).querySelector('select').setAttribute('data-h', 'lang');
  });
  await record(pg, 'generate', ['#view-captions .source', '[data-h=model]', '[data-h=lang]', '#view-captions .scroll .btn.primary.block']);
  await pg.click('#view-captions .scroll .btn.primary.block');
  await pg.waitForTimeout(2200);
  await pg.evaluate(() => { const s = document.querySelector('#view-captions .scroll'); s.scrollTop = document.querySelector('.subtabs').offsetTop - 8; });
  await pg.waitForTimeout(300);
  await record(pg, 'edit', ['#view-captions .trbar select', '#view-captions .cap textarea', '#view-captions .cap .tm']);
  await pg.setViewportSize({ width: W, height: 700 });
  await pg.click('#view-captions .subtabs .seg button:nth-child(2)');
  await pg.waitForTimeout(300);
  await pg.evaluate(() => { const s = document.querySelector('#view-captions .scroll'); s.scrollTop = document.querySelector('.subtabs').offsetTop - 8; });
  await pg.waitForTimeout(500);
  await mark(pg, () => { document.querySelectorAll('#view-captions .group .scrub')[0].setAttribute('data-h', 'scrub'); });
  await record(pg, 'style', ['#view-captions .stage', '[data-h=scrub]', '#view-captions .foot .btn']);
  await pg.close();

  // 5 animate + 6 plugins
  pg = await page('?sel=text,text2', 560, d => { localStorage.setItem('cq.apiDir', JSON.stringify(d)); localStorage.setItem('cq.tab', '"animate"'); });
  await pg.waitForTimeout(1200);
  await mark(pg, () => { document.querySelectorAll('#view-animate .card')[3].setAttribute('data-h', 'card'); });
  await record(pg, 'animate', ['#view-animate .foot .info small', '[data-h=card]', '#view-animate .foot .btn.primary']);
  await pg.evaluate(() => { const p = CQ.presets.list.find(x => (x.needs || []).length); CQ.animate.pluginDialog(p, p.needs); });
  await pg.waitForTimeout(400);
  await record(pg, 'plugins', ['.dlg ul']);
  await pg.close();

  // 7 settings
  pg = await page('', 560);
  await pg.click('#gear');
  await pg.waitForTimeout(500);
  await mark(pg, () => { [...document.querySelectorAll('#view-settings .btn')].find(x => /Fonts/.test(x.textContent)).setAttribute('data-h', 'fonts'); document.querySelector('#view-settings .models .m:nth-child(2) .btn').setAttribute('data-h', 'dl'); });
  await pg.evaluate(() => { document.querySelector('#view-settings .scroll').scrollTop = 120; });
  await pg.waitForTimeout(200);
  await record(pg, 'settings', ['#gear', '[data-h=dl]', '[data-h=fonts]']);
  await pg.close();

  fs.writeFileSync(out + '/targets.json', JSON.stringify(targets, null, 1));
  console.log(Object.keys(targets).map(k => k + ':' + targets[k].filter(Boolean).length + '/' + targets[k].length).join(' '));
  await b.close();
})();
