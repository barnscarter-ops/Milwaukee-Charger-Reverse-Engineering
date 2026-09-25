// Board Atlas regression check, screenshot audit and frame-time measurement.
//   npm run test:visual                 functional checks on desktop and phones (screenshots in artifacts/)
//   npm run test:visual -- --shots      also the full screenshot matrix in artifacts/shots/<viewport>/
//   npm run test:visual -- --perf       also frame times, using the hardware GPU (D3D11) when available
// Needs the dev server: npm run dev (http://127.0.0.1:5173). BROWSER_EXECUTABLE overrides the browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const URL = process.env.ATLAS_URL || 'http://127.0.0.1:5173/';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? EDGE : undefined);
const SOFT_GL = ['--use-gl=angle', '--use-angle=swiftshader'];
// Headless Edge caps requestAnimationFrame at 32 fps, so frame timing runs uncapped and syncs the GPU each frame:
// the reported frame cost is CPU + GPU time per rendered frame, to compare with the 16.7 ms budget of 60 fps.
const HARD_GL = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
const flags = new Set(process.argv.slice(2));
const UI_KEY = 'milwaukee-48-59-1812-board-atlas-ui';
const V1_KEY = 'milwaukee-48-59-1812-board-atlas-v1';
const V2_KEY = 'milwaukee-48-59-1812-board-atlas-v2';
const VIEWPORTS = { desktop: [1440, 900], tablet: [768, 1024], phone: [390, 844], narrow: [320, 700] };
const errors = [];

await mkdir('artifacts/shots', { recursive: true });

async function open(browser, name, { onboarded = true, storage = null, dpr = 1 } = {}) {
  const [width, height] = VIEWPORTS[name];
  const mobile = width < 800;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.addInitScript(([uiKey, done, seed]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (done) localStorage.setItem(uiKey, JSON.stringify({ onboarded: true }));
    for (const [k, v] of Object.entries(seed || {})) localStorage.setItem(k, JSON.stringify(v));
  }, [UI_KEY, onboarded, storage]);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await ready(page);
  return page;
}

const ready = page => page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, null, { timeout: 60000 });
const settle = (page, ms = 1400) => page.waitForTimeout(ms);

async function canvasStats(page, label) {
  const image = PNG.sync.read(await page.locator('#scene canvas').screenshot());
  const colors = new Set();
  let cream = 0, green = 0;
  for (let y = 0; y < image.height; y += 6) for (let x = 0; x < image.width; x += 6) {
    const i = (y * image.width + x) * 4, r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    if (r > 170 && g > 150 && b > 100 && r > b + 25) cream++;
    if (g > r * 1.2 && g > b * 0.95 && g > 90) green++;
  }
  assert(colors.size > 60, `${label}: canvas looks blank (${colors.size} colours)`);
  return { colors: colors.size, cream, green };
}

async function shot(page, dir, name) {
  await page.screenshot({ path: `artifacts/shots/${dir}/${name}.png` });
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, w: innerWidth }));
  assert(o.doc <= o.w && o.body <= o.w, `${label}: horizontal overflow ${JSON.stringify(o)}`);
}

// ---------------- functional checks ----------------
async function functional(browser) {
  const report = {};
  const d = await open(browser, 'desktop');
  const top = await canvasStats(d, 'desktop top');
  assert(top.cream > 400, `desktop top: component side missing (${top.cream})`);
  await d.screenshot({ path: 'artifacts/desktop-top.png' });
  const idleBefore = await d.evaluate(() => window.__atlas.perf.read().frames);
  await d.waitForTimeout(1200);
  const idleAfter = await d.evaluate(() => window.__atlas.perf.read().frames);
  assert.equal(idleAfter, idleBefore, 'renderer drew frames while idle');

  await d.click('#side-bottom');
  await settle(d, 1800);
  const bottom = await canvasStats(d, 'desktop bottom');
  assert(bottom.green > 400, `desktop bottom: solder side missing (${bottom.green})`);
  await d.screenshot({ path: 'artifacts/desktop-bottom.png' });

  await d.fill('#search', 'U4');
  assert.equal(await d.locator('#index-list .ref-row').count(), 1);
  await d.locator('#index-list .ref-row').click();
  assert.equal(await d.textContent('#selected-title'), 'U4');
  await d.fill('[name=identity]', 'Temporary test entry');
  await d.click('#confidence label:has(input[value=probable])');
  await d.reload({ waitUntil: 'networkidle' }); await ready(d);
  await d.click('#side-bottom'); await d.fill('#search', 'U4'); await d.locator('#index-list .ref-row').click();
  assert.equal(await d.inputValue('[name=identity]'), 'Temporary test entry');
  assert.equal(await d.isChecked('input[name=confidence][value=probable]'), true);
  assert.equal(await d.getAttribute('#index-list .ref-row .dot', 'data-conf'), 'probable');

  await d.fill('#search', 'ZZZ9');
  assert.match(await d.textContent('#index-list'), /No markings/);
  await d.fill('#search', 'T1');
  assert(await d.locator('#index-list .ref-row.other-side[data-key="T1"]').count() === 1, 'search should offer T1 from the other side');
  await d.locator('#index-list .ref-row[data-key="T1"]').click();
  await settle(d, 1800);
  assert.equal(await d.getAttribute('#side-top', 'aria-pressed'), 'true', 'selecting a component-side part should flip back');
  assert.match(await d.textContent('#record-meta'), /Spans the barrier/);

  await d.click('#photo-button');
  await d.locator('#photo-image').evaluate(img => img.decode());
  assert.equal(await d.locator('#photo-image').evaluate(img => img.naturalWidth > 1000), true);
  await d.keyboard.press('ArrowRight');
  assert.match(await d.textContent('#photo-position'), /^2 \//);
  await d.click('#photo-close');

  await d.fill('#search', '');
  await d.click('[data-view=plan]'); await settle(d, 1200);
  await d.click('#add-reference');
  assert.equal(await d.isVisible('#mode-banner'), true);
  const addAt = await d.evaluate(() => window.__atlas.project(300, 1300));
  await d.mouse.click(addAt.x, addAt.y);
  await d.locator('#add-dialog').waitFor({ state: 'visible' });
  await d.fill('#new-designator', 'T1');
  await d.click('#add-dialog .primary');
  assert.equal(await d.isVisible('#add-error'), true, 'duplicate designator must be refused');
  await d.fill('#new-designator', 'R999');
  await d.click('#add-dialog .primary');
  assert.equal(await d.textContent('#selected-title'), 'R999');
  await d.click('#relocate-reference');
  const moveTo = await d.evaluate(() => window.__atlas.project(320, 1320));
  await d.mouse.click(moveTo.x, moveTo.y);
  assert.equal(await d.isHidden('#mode-banner'), true);
  const saved = await d.evaluate(k => JSON.parse(localStorage.getItem(k)), V2_KEY);
  const r999 = saved.custom.find(c => c.id === 'R999');
  assert(r999 && Math.abs(r999.x - 320) < 4 && Math.abs(r999.y - 1320) < 4, `R999 relocation not stored: ${JSON.stringify(r999)}`);
  assert.equal(saved.schema, 2);

  // continuity log: typed endpoints, net, cross-barrier flag
  await d.click('[data-layer=links]');
  await d.fill('[name=aRef]', 'R27'); await d.fill('[name=bRef]', 'U4'); await d.fill('[name=bPin]', '12');
  await d.click('#reading-form button[type=submit]');
  assert.match(await d.textContent('#net-list'), /NET-R27/);
  await d.fill('[name=aRef]', 'C2'); await d.fill('[name=bRef]', 'U4');
  assert.equal(await d.isVisible('#reading-warn'), true, 'a primary-to-secondary pair must be flagged');
  await d.fill('[name=aRef]', 'NOPE1');
  await d.click('#reading-form button[type=submit]');
  assert.match(await d.textContent('#reading-error'), /not in the index/);
  await d.click('[data-layer=links]');

  await d.click('[data-layer=xray]'); await settle(d, 600);
  assert.equal(await d.isVisible('#xray-card'), true);
  await d.click('[data-layer=xray]');
  await d.click('[data-layer=zones]'); await settle(d, 600);
  assert.match(await d.textContent('#zone-parts'), /T1/);
  await d.click('[data-layer=zones]');

  const download = d.waitForEvent('download');
  await d.click('#export-notes');
  const file = await download;
  assert.match(file.suggestedFilename(), /board-records/);

  // schema-1 import: notes only, renamed designators follow
  await d.setInputFiles('#import-notes', { name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 1, components: [{ id: 'U8', x: 1, z: 2 }], notes: { U8: { identity: 'From v1 file', confidence: 'probable' } } })) });
  await d.locator('#confirm-dialog').waitFor({ state: 'visible' });
  await Promise.all([d.waitForEvent('load'), d.click('#confirm-ok')]);
  await ready(d);
  const afterImport = await d.evaluate(k => JSON.parse(localStorage.getItem(k)), V2_KEY);
  assert.equal(afterImport.notes.U3?.identity, 'From v1 file', 'schema-1 import should map U8 to U3');
  assert(afterImport.custom.some(c => c.id === 'R999'), 'schema-1 import must keep markers');
  report.desktop = { top, bottom };
  await d.close();

  // v1 browser storage migrates notes only
  const m = await open(browser, 'desktop', { storage: { [V1_KEY]: { schema: 1, components: [{ id: 'R5', x: 9, z: 9, side: 'bottom' }], notes: { F4: { identity: 'Migrated fuse note', confidence: 'confirmed' }, R5: { identity: '', confidence: 'unknown' } } } } });
  const migrated = await m.evaluate(k => JSON.parse(localStorage.getItem(k)), V2_KEY);
  assert.equal(migrated.notes.F2?.identity, 'Migrated fuse note');
  assert.equal(Object.keys(migrated.overrides).length, 0, 'v1 positions must not migrate');
  assert.equal(migrated.notes.R5, undefined, 'blank v1 records are dropped');
  await m.close();

  // phone
  const p = await open(browser, 'phone');
  report.phone = await canvasStats(p, 'phone');
  await p.click('#mobile-index');
  await p.fill('#search', 'T1');
  await p.locator('#index-list .ref-row[data-key="T1"]').click();
  assert.equal(await p.textContent('#selected-title'), 'T1');
  await p.waitForTimeout(450);
  assert.equal(await p.locator('#inspector').evaluate(el => el.classList.contains('open') && getComputedStyle(el).visibility === 'visible'), true);
  await p.screenshot({ path: 'artifacts/mobile-inspector.png' });
  await noOverflow(p, 'phone');
  await p.close();

  const n = await open(browser, 'narrow');
  await n.screenshot({ path: 'artifacts/mobile-narrow.png' });
  await noOverflow(n, 'narrow');
  const header = await n.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const bar = r('.topbar'), sw = r('.side-switch'), act = r('.top-actions'), brand = r('.brand-mark');
    return brand.right <= sw.left && sw.right <= act.left && act.right <= bar.right;
  });
  assert.equal(header, true, '320px header controls overlap');
  report.narrow = await canvasStats(n, 'narrow');
  await n.close();
  return report;
}

// ---------------- screenshot matrix ----------------
async function matrix(browser) {
  for (const vp of Object.keys(VIEWPORTS)) {
    await mkdir(`artifacts/shots/${vp}`, { recursive: true });
    const [width, height] = VIEWPORTS[vp];
    const mobile = width <= 600;   // inspector is a bottom sheet
    const drawer = width <= 800;   // index is a drawer
    const touch = width < 800;
    const tap = async (page, sel) => page.evaluate(q => document.querySelector(q).click(), sel);

    // loading and onboarding (first run)
    const l = await browser.newPage({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
    l.on('pageerror', e => errors.push(`${vp} loading: ${e.message}`));
    let release;
    const gate = new Promise(r => { release = r; });
    await l.route('**/board-bottom.jpg', async route => { await gate; await route.continue(); });
    await l.goto(URL, { waitUntil: 'domcontentloaded' });
    await l.waitForSelector('#loading .loading-card');
    await l.waitForTimeout(600);
    await shot(l, vp, '00-loading');
    release();
    await ready(l);
    await l.waitForTimeout(700);
    await shot(l, vp, '01-onboarding');
    await l.close();

    const p = await open(browser, vp);
    await settle(p);
    await shot(p, vp, '02-top-three');
    await tap(p, '[data-view=plan]'); await settle(p); await shot(p, vp, '03-top-plan');
    await tap(p, '[data-view=edge]'); await settle(p); await shot(p, vp, '04-top-edge');
    await tap(p, '[data-view=three]'); await settle(p);
    if (!touch) {
      const t1 = await p.evaluate(() => window.__atlas.screenOf('C3'));
      await p.mouse.move(t1.x, t1.y); await settle(p, 500); await shot(p, vp, '05-top-hover');
      await p.mouse.move(5, height - 5);
    }
    await tap(p, '#surface-toggle'); await settle(p, 700); await shot(p, vp, '06-top-photo-off');
    await tap(p, '#surface-toggle'); await settle(p, 500);
    if (drawer) await tap(p, '#mobile-index');
    await p.fill('#search', 'T1');
    await p.locator('#index-list .ref-row[data-key="T1"]').click();
    await settle(p, 1400); await shot(p, vp, '07-top-selected');
    if (mobile) await tap(p, '#close-inspector');
    await p.evaluate(() => document.querySelector('#label-toggle').click());
    await tap(p, '[data-view=plan]'); await settle(p); await shot(p, vp, '08-top-all-labels');
    await p.evaluate(() => document.querySelector('#label-toggle').click());
    await p.evaluate(() => { window.__atlas.debug.flipHold = 0.5; });
    await tap(p, '[data-view=three]'); await settle(p, 1200);
    await tap(p, '#side-bottom'); await settle(p, 500); await shot(p, vp, '09-flip-mid');
    await p.evaluate(() => { delete window.__atlas.debug.flipHold; window.__atlas.invalidate(); });
    await settle(p, 1800); await shot(p, vp, '10-bottom-three');
    await tap(p, '[data-view=plan]'); await settle(p); await shot(p, vp, '11-bottom-plan');
    await tap(p, '[data-view=edge]'); await settle(p); await shot(p, vp, '12-bottom-edge');
    await tap(p, '[data-view=plan]'); await settle(p);
    await p.evaluate(() => document.querySelector('#label-toggle').click()); await settle(p, 600);
    await shot(p, vp, '13-bottom-all-labels');
    await p.evaluate(() => document.querySelector('#label-toggle').click());
    if (drawer) await tap(p, '#mobile-index');
    await p.fill('#search', 'U4'); await settle(p, 300);
    if (drawer) await shot(p, vp, '14-index-open');
    await p.locator('#index-list .ref-row[data-key="U4"]').click(); await settle(p, 1400);
    await shot(p, vp, '15-bottom-selected');
    if (mobile) await tap(p, '#close-inspector');
    if (drawer) await tap(p, '#mobile-index');
    await p.fill('#search', 'QQ77'); await settle(p, 300); await shot(p, vp, '16-empty-search');
    await p.fill('#search', '');
    if (drawer) await tap(p, '#close-index');
    await tap(p, '[data-view=three]'); await settle(p);
    await p.evaluate(() => document.querySelector('#add-reference').click()); await settle(p, 300); await shot(p, vp, '17-add-mode');
    const at = await p.evaluate(() => window.__atlas.project(250, 1200));
    await p.mouse.click(at.x, at.y); await settle(p, 400); await shot(p, vp, '18-add-dialog');
    await p.fill('#new-designator', 'R998'); await p.click('#add-dialog .primary'); await settle(p, 900);
    await p.evaluate(() => document.querySelector('#relocate-reference').click()); await settle(p, 300); await shot(p, vp, '19-relocate-mode');
    await p.keyboard.press('Escape');
    if (mobile) await p.evaluate(() => document.querySelector('#close-inspector').click());
    await tap(p, '[data-layer=xray]'); await settle(p, 900);
    const lens = await p.evaluate(() => window.__atlas.project(130, 985));
    if (touch) await p.touchscreen.tap(lens.x, lens.y);
    else await p.mouse.move(lens.x, lens.y);
    await settle(p, 700); await shot(p, vp, '20-xray');
    await tap(p, '[data-layer=xray]');
    await tap(p, '[data-view=plan]');
    await tap(p, '[data-layer=zones]'); await settle(p, 1200); await shot(p, vp, '21-zones-bottom');
    await tap(p, '#side-top'); await settle(p, 1800); await shot(p, vp, '22-zones-top');
    await tap(p, '[data-layer=zones]');
    await tap(p, '[data-layer=links]'); await settle(p, 400);
    await p.fill('[name=aRef]', 'C2'); await p.fill('[name=bRef]', 'X-BRIDGE');
    await p.click('#reading-form button[type=submit]');
    await p.fill('[name=aRef]', 'J13'); await p.fill('[name=bRef]', 'J18');
    await p.check('input[name=result][value=resistance]', { force: true }); await p.fill('[name=value]', '4.7k');
    await p.click('#reading-form button[type=submit]');
    await p.fill('[name=aRef]', 'C3'); await p.fill('[name=bRef]', 'J13');
    await p.check('input[name=result][value=continuity]', { force: true });
    await p.click('#reading-form button[type=submit]');
    await settle(p, 900); await shot(p, vp, '23-continuity');
    if (mobile) await p.evaluate(() => document.querySelector('#close-inspector').click());
    await settle(p, 500); await shot(p, vp, '24-continuity-scene');
    await p.evaluate(() => document.querySelector('#photo-button').click());
    await p.locator('#photo-image').evaluate(img => img.decode()); await settle(p, 300); await shot(p, vp, '25-photos');
    await p.evaluate(() => document.querySelector('#photo-dialog').close());
    await p.evaluate(() => document.querySelector('#help-button').click()); await settle(p, 300); await shot(p, vp, '26-help');
    await p.evaluate(() => document.querySelector('#help-dialog').close());
    await noOverflow(p, vp);
    await p.close();
  }
}

// ---------------- frame times ----------------
async function perf() {
  const browser = await chromium.launch({ executablePath, headless: true, args: HARD_GL });
  const out = {};
  try {
    const d = await open(browser, 'desktop');
    out.gpu = await d.evaluate(() => window.__atlas.perf.gpu());
    out.dpr = 1;
    out.scene = await d.evaluate(() => window.__atlas.perf.info());
    await d.evaluate(() => { window.__atlas.debug.syncGpu = true; });
    await d.evaluate(() => {
      window.__long = [];
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] });
    });
    const measure = async (name, fn) => {
      await d.evaluate(() => { window.__atlas.perf.reset(); window.__long.length = 0; });
      await fn();
      out[name] = await d.evaluate(() => ({ ...window.__atlas.perf.read(), longTasks: window.__long.length, longestTaskMs: Math.max(0, ...window.__long) }));
    };
    const box = await d.locator('#scene canvas').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await measure('orbit', async () => {
      await d.mouse.move(cx, cy); await d.mouse.down();
      for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2; await d.mouse.move(cx + Math.cos(a) * 220, cy + Math.sin(a) * 90, { steps: 1 }); await d.waitForTimeout(16); }
      await d.mouse.up(); await d.waitForTimeout(900);
    });
    await d.click('[data-view=three]'); await d.waitForTimeout(1200);
    await measure('flip', async () => { await d.click('#side-bottom'); await d.waitForTimeout(1600); await d.click('#side-top'); await d.waitForTimeout(1600); });
    await measure('hover', async () => {
      for (let i = 0; i <= 150; i++) { await d.mouse.move(box.x + box.width * (0.2 + 0.6 * (i / 150)), cy + Math.sin(i / 8) * 120); await d.waitForTimeout(16); }
    });
    await d.click('#label-toggle');
    await measure('orbitAllLabels', async () => {
      await d.mouse.move(cx, cy); await d.mouse.down();
      for (let i = 0; i <= 90; i++) { await d.mouse.move(cx + Math.sin(i / 14) * 240, cy, { steps: 1 }); await d.waitForTimeout(16); }
      await d.mouse.up(); await d.waitForTimeout(900);
    });
    await d.click('#label-toggle');
    await measure('search', async () => { await d.click('#search'); for (const ch of 'R2') { await d.keyboard.type(ch, { delay: 120 }); } await d.fill('#search', ''); await d.keyboard.type('TP4', { delay: 120 }); await d.waitForTimeout(300); });
    await measure('xrayLens', async () => {
      await d.click('[data-layer=xray]');
      for (let i = 0; i <= 120; i++) { await d.mouse.move(box.x + box.width * (0.25 + 0.5 * (i / 120)), cy + Math.cos(i / 10) * 100); await d.waitForTimeout(16); }
      await d.click('[data-layer=xray]');
    });
    // Same orbit and flip on a 2x (retina-class) screen; the renderer caps its pixel ratio at 1.5.
    const r = await open(browser, 'desktop', { dpr: 2 });
    await r.evaluate(() => { window.__atlas.debug.syncGpu = true; });
    const rb = await r.locator('#scene canvas').boundingBox();
    const rx = rb.x + rb.width / 2, ry = rb.y + rb.height / 2;
    const measure2 = async (name, fn) => { await r.evaluate(() => window.__atlas.perf.reset()); await fn(); out[name] = await r.evaluate(() => window.__atlas.perf.read()); };
    await measure2('orbitDpr2', async () => {
      await r.mouse.move(rx, ry); await r.mouse.down();
      for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2; await r.mouse.move(rx + Math.cos(a) * 220, ry + Math.sin(a) * 90, { steps: 1 }); await r.waitForTimeout(16); }
      await r.mouse.up(); await r.waitForTimeout(900);
    });
    await measure2('flipDpr2', async () => { await r.click('#side-bottom'); await r.waitForTimeout(1600); await r.click('#side-top'); await r.waitForTimeout(1600); });
    await r.close();

    await d.waitForTimeout(1000);
    const before = await d.evaluate(() => window.__atlas.perf.read().frames);
    await d.waitForTimeout(1500);
    out.idleFramesIn1500ms = (await d.evaluate(() => window.__atlas.perf.read().frames)) - before;
    out.note = 'frameCost = CPU + GPU per frame (gl.finish); interval = rAF spacing with vsync off';
    await d.close();
  } finally {
    await browser.close();
  }
  return out;
}

const browser = await chromium.launch({ executablePath, headless: true, args: SOFT_GL });
try {
  const result = { functional: await functional(browser) };
  if (flags.has('--shots')) { await matrix(browser); result.shots = 'artifacts/shots/'; }
  if (flags.has('--perf')) result.perf = await perf();
  assert.deepEqual(errors, []);
  await writeFile('artifacts/verify-result.json', JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (err) {
  if (errors.length) console.error('Page errors:', errors);
  throw err;
} finally {
  await browser.close();
}
