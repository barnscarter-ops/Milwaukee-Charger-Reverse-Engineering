import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? edge : undefined),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});
await mkdir('artifacts', { recursive: true });
const errors = [];

async function checkCanvas(page, label) {
  const canvas = page.locator('#scene canvas');
  await canvas.waitFor({ state: 'visible' });
  await page.waitForTimeout(1400);
  const image = PNG.sync.read(await canvas.screenshot({ path: `artifacts/${label}-canvas.png` }));
  const colors = new Set();
  let lit = 0;
  for (let y = 0; y < image.height; y += 9) {
    for (let x = 0; x < image.width; x += 9) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      if (g > r * 1.08 && g > b * 0.88 && g > 35) lit++;
    }
  }
  assert(colors.size > 35, `${label}: canvas appears blank (${colors.size} colors)`);
  assert(lit > 40, `${label}: PCB green area missing (${lit} sample pixels)`);
  return { colors: colors.size, boardPixels: lit };
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await desktop.screenshot({ path: 'artifacts/desktop-top.png', fullPage: true });
  const top = await checkCanvas(desktop, 'desktop-top');
  await desktop.getByRole('button', { name: 'Solder side' }).click();
  await desktop.screenshot({ path: 'artifacts/desktop-bottom.png', fullPage: true });
  const bottom = await checkCanvas(desktop, 'desktop-bottom');
  await desktop.locator('#search').fill('U4');
  assert.equal(await desktop.locator('.ref-row').count(), 1);
  await desktop.locator('.ref-row').click();
  assert.equal(await desktop.locator('#selected-title').textContent(), 'U4');
  await desktop.locator('[name=identity]').fill('Temporary test entry');
  await desktop.reload({ waitUntil: 'networkidle' });
  await desktop.getByRole('button', { name: 'Solder side' }).click();
  await desktop.locator('#search').fill('U4');
  await desktop.locator('.ref-row').click();
  assert.equal(await desktop.locator('[name=identity]').inputValue(), 'Temporary test entry');
  await desktop.locator('[name=identity]').fill('');
  await desktop.getByRole('button', { name: 'Open evidence photographs' }).click();
  await desktop.locator('#photo-image').evaluate(img => img.decode());
  assert.equal(await desktop.locator('#photo-image').evaluate(img => img.naturalWidth > 1000), true);
  await desktop.locator('#photo-close').click();
  await desktop.locator('#search').fill('');
  await desktop.getByRole('button', { name: 'Component side' }).click();
  await desktop.getByRole('button', { name: 'Reset camera' }).click();
  await desktop.locator('#add-reference').click();
  await desktop.mouse.click(450, 735);
  await desktop.locator('#add-dialog').waitFor({ state: 'visible' });
  await desktop.locator('#new-designator').fill('R999');
  await desktop.locator('.dialog-actions .primary').click();
  assert.equal(await desktop.locator('#selected-title').textContent(), 'R999');
  await desktop.locator('#relocate-reference').click();
  await desktop.mouse.click(470, 750);
  assert.equal(await desktop.locator('#relocate-help').isHidden(), true);
  const download = desktop.waitForEvent('download');
  await desktop.locator('#export-notes').click();
  const exported = await download;
  assert.match(exported.suggestedFilename(), /board-records/);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: 'artifacts/mobile-top.png', fullPage: true });
  const phone = await checkCanvas(mobile, 'mobile-top');
  await mobile.locator('#mobile-index').click();
  await mobile.locator('#search').fill('T1');
  await mobile.locator('.ref-row').click();
  assert.equal(await mobile.locator('#selected-title').textContent(), 'T1');
  await mobile.waitForTimeout(450);
  assert.equal(await mobile.locator('#inspector').isVisible(), true);
  await mobile.screenshot({ path: 'artifacts/mobile-inspector.png', fullPage: true });
  const narrow = await browser.newPage({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  narrow.on('pageerror', error => errors.push(error.message));
  await narrow.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await narrow.screenshot({ path: 'artifacts/mobile-narrow.png', fullPage: true });
  assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const headerFits = await narrow.evaluate(() => {
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    const brand = document.querySelector('.brand').getBoundingClientRect();
    const actions = document.querySelector('.top-actions').getBoundingClientRect();
    return brand.right + 5 <= actions.left && actions.right <= bar.right;
  });
  assert.equal(headerFits, true);
  const narrowCanvas = await checkCanvas(narrow, 'mobile-narrow');
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ top, bottom, phone, narrowCanvas, errors }, null, 2) + '\n');
  await desktop.close(); await mobile.close(); await narrow.close();
} finally {
  await browser.close();
}
