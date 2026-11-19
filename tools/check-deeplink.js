#!/usr/bin/env node
/* Deep-link checks: ?mode=family&builder=1 opens Ion Families on the Ion Builder (and keeps it there), ?mode=table opens the
   Oxyanion Table, both work with ?course=3A or 1A, and the plain URL still opens the normal start screen. Runs at a phone size
   (390×844, touch) and a desktop size; fails on any console error.  Usage: NODE_PATH=<node_modules with playwright> node tools/check-deeplink.js */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright not found. Run with NODE_PATH pointing at a node_modules that has playwright, e.g.\n  NODE_PATH=/path/to/node_modules node tools/check-deeplink.js'); process.exit(2); }
const path = require('path'), fs = require('fs'), url = require('url');
const ROOT = path.join(__dirname, '..'), GH = path.join(ROOT, '..');
const page0 = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
const SIZES = [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['desktop', { viewport: { width: 1280, height: 900 } }]];
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } };
/* offline and repeatable: itsdrdan.github.io/<repo>/… is served from the sibling local clone when it exists; every other web request gets an empty reply */
async function route(ctx) {
  await ctx.route(/^https?:/, r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'itsdrdan.github.io') { const f = path.join(GH, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f }); }
    return r.fulfill({ status: 200, body: '' });
  });
}
async function run(CASES) {
  const browser = await chromium.launch();
  for (const [size, opts] of SIZES) for (const c of CASES) {
    const ctx = await browser.newContext(opts); await route(ctx);
    const page = await ctx.newPage(), errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(page0 + c.q, { waitUntil: 'load' }); await page.waitForTimeout(400);
    const f0 = fail, tag = size + ' ' + (c.q || '(no parameters)');
    try { await c.check(page, (cond, m) => ok(cond, tag + ': ' + m)); } catch (e) { ok(false, tag + ': ' + e.message); }
    ok(!errs.length, tag + ': console errors: ' + errs.join(' | '));
    console.log((fail > f0 ? '  ' : 'ok') + ' ' + tag);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${n - fail}/${n} deep-link checks passed`); process.exit(fail ? 1 : 0);
}
const builder = async (page, ok) => {
  ok(await page.evaluate(() => state.mode === 'family' && !state.quiz), 'Ion Families mode');
  ok(await page.locator('#modes [data-mode="family"].on').isVisible(), 'Ion Families card is highlighted');
  ok(await page.locator('#ibLab').isVisible(), 'Ion Builder lab is visible');
  ok(await page.locator('#ibLab .ib-steps').isVisible() && await page.locator('#ibLab [data-ibp]').count() === 3, 'builder opens on its Predict step (3 choices)');
};
const table = async (page, ok) => {
  ok(await page.evaluate(() => state.mode === 'table' && state.q && state.q.mode === 'table'), 'Oxyanion Table mode');
  ok(await page.locator('#otLab').isVisible(), 'Oxyanion Table lab is visible');
  ok(await page.locator('#ibLab').isHidden(), 'no Ion Builder');
};
run([
  { q: '', check: async (page, ok) => {
    ok(await page.evaluate(() => state.course === '1A' && !state.mode), 'CHEM 1A, no mode picked yet');
    ok(await page.locator('#emptyBox').isVisible(), 'start screen (pick a mode) is showing');
    ok(await page.locator('#ibLab').isHidden() && await page.locator('#otLab').isHidden(), 'no lab open');
  } },
  { q: '?mode=family&builder=1', check: async (page, ok) => {
    await builder(page, ok);
    for (let i = 0; i < 8; i++) { await page.evaluate(() => newQuestion()); ok(await page.evaluate(() => !!(state.q && state.q.lab)) && await page.locator('#ibLab').isVisible(), 'question ' + (i + 2) + ' is also an Ion Builder'); }
  } },
  { q: '?course=3A&mode=family&builder=1', check: async (page, ok) => { await builder(page, ok); ok(await page.evaluate(() => state.course === '3A'), 'course=3A still applies'); } },
  { q: '?mode=family', check: builder },
  { q: '?mode=table', check: table },
  { q: '?course=3A&mode=table', check: async (page, ok) => { await table(page, ok); ok(await page.evaluate(() => state.course === '3A'), 'course=3A still applies'); } },
  { q: '?mode=nonsense', check: async (page, ok) => { ok(await page.locator('#emptyBox').isVisible(), 'unknown mode is ignored'); } },
]);
