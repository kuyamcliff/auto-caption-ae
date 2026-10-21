// Usage: node shot.js <url-relative-to-repo> <out.png> [width] [height]
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const [,, rel, out, w, h] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage({ viewport: { width: +w || 1600, height: +h || 1200 } });
  const msgs = [];
  pg.on('console', m => { if (m.type() === 'error') msgs.push(m.text()); });
  pg.on('pageerror', e => msgs.push(String(e)));
  await pg.goto('file://' + path.resolve(__dirname, '..', rel));
  await pg.waitForFunction('window.done===true', null, { timeout: 120000 }).catch(() => {});
  const errs = await pg.evaluate('window.errors||[]').catch(() => []);
  await pg.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ errors: errs, console: msgs.slice(0, 20) }));
  await b.close();
})();
