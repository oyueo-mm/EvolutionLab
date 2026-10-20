// Browser regression test for the built app.
//
//   npm run e2e                 → builds nothing; serves ./dist like GitHub Pages (/EvolutionLab/) and tests it
//   npm run e2e -- --url <URL>  → tests a deployed site instead
//
// Needs a Chrome/Chromium/Edge executable (found automatically or via $CHROME_PATH).
// Exit code is non-zero when any check fails, so it can gate a deployment.

import puppeteer from 'puppeteer-core';
import { findBrowser, serveDist } from './lib.mjs';

const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
const server = argUrl ? null : await serveDist('dist');
const URL_ = argUrl ?? server.url;

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const problems = [];
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function open(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warn' && m.type() !== 'warning') return;
    // Raised by this test's own pixel probe (repeated getImageData); the app never reads the canvas back.
    if (/willReadFrequently/.test(m.text())) return;
    problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  // Black-frame probe. ResizeObservers run in creation order, so this one runs right after the
  // app's observer in the same frame — after the app could repaint, before the browser paints.
  // A canvas that is still cleared (opaque black or transparent) at that point is what the user sees.
  await page.evaluateOnNewDocument(() => {
    window.__probe = { frames: 0, black: 0 };
    window.__installProbe = () => {
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      new ResizeObserver(() => {
        if (!c.width || !c.height) return;
        let dark = 0;
        const pts = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8], [0.05, 0.5], [0.95, 0.5]];
        for (const [fx, fy] of pts) {
          const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
          if (d[3] === 0 || (d[0] < 20 && d[1] < 20 && d[2] < 20)) dark++;
        }
        window.__probe.frames++;
        if (dark === pts.length) window.__probe.black++;
      }).observe(c);
    };
  });
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.waitForSelector('canvas');
  await wait(600);
  await page.evaluate(() => window.__installProbe());
  return page;
}

const click = (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button')].find((el) => el.offsetParent !== null && !el.closest('[inert]') && el.innerText.trim() === t);
  b?.click();
  return !!b;
}, text);
const speed = (page, x) => page.evaluate((v) => document.querySelector(`button[aria-label="${v}배속"]`)?.click(), x);
const toggleSettings = (page) => page.click('#settings-toggle');
const toggleStats = (page) => page.evaluate(() => document.querySelector('button[aria-controls="stats-panel"]').click());
const header = (page) => page.$eval('header', (h) => h.innerText.replace(/\s+/g, ' '));
const num = (t, re) => Number((t.match(re) || [])[1] ?? NaN);

/** Share of near-black pixels in a real screenshot of the canvas. */
async function screenshotDark(page) {
  const r = await page.$eval('canvas', (c) => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  if (r.width < 4 || r.height < 4) return 0;
  const b64 = await page.screenshot({ encoding: 'base64', clip: r });
  return page.evaluate(async (data) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const oc = new OffscreenCanvas(img.width, img.height);
    const x = oc.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    let dark = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { n++; if (d[i] < 25 && d[i + 1] < 25 && d[i + 2] < 25) dark++; }
    return dark / n;
  }, b64);
}

async function togglePanels(page) {
  await page.evaluate(() => { window.__probe = { frames: 0, black: 0 }; });
  let worst = 0;
  for (let i = 0; i < 2; i++) {
    for (const t of [toggleSettings, toggleStats]) {
      await t(page);
      await wait(70); // mid-transition
      worst = Math.max(worst, await screenshotDark(page));
      await wait(260);
    }
  }
  for (let i = 0; i < 5; i++) { await toggleSettings(page); await wait(35); } // rapid toggling
  await wait(450);
  const settled = await screenshotDark(page);
  return { ...(await page.evaluate(() => window.__probe)), worst, settled };
}

console.log(`Testing ${URL_}\n`);

// ---------------------------------------------------------------- assets & branding
{
  const page = await open(1440, 900);
  const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.href));
  const base = new URL(URL_).pathname;
  check('icon links point inside the site base path', icons.length >= 3 && icons.every((h) => new URL(h).pathname.startsWith(base)), icons.map((h) => new URL(h).pathname).join(', '));
  for (const h of icons) {
    const status = await page.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, h);
    check(`icon loads: ${new URL(h).pathname}`, status === 200, `HTTP ${status}`);
  }
  const logo = await page.$eval('header img', (img) => ({ src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 }));
  check('header logo renders from the same SVG as the favicon', logo.ok && logo.src.endsWith('logo.svg'), logo.src);
  check('world is drawn (no blank canvas at start)', (await screenshotDark(page)) < 0.3);
  await page.close();
}

// ---------------------------------------------------------------- black canvas regression
{
  const page = await open(1440, 900);
  const states = [
    ['paused before start', async () => {}],
    ['running 1×', async () => { await click(page, '시작'); await speed(page, 1); }],
    ['running 10×', async () => { await speed(page, 10); }],
    ['running MAX', async () => { await click(page, 'MAX'); }],
    ['paused mid-run', async () => { await click(page, 'MAX'); await click(page, '일시정지'); }],
    ['zoomed in (paused)', async () => { await page.evaluate(() => document.querySelector('button[aria-label="확대"]').click()); }],
  ];
  for (const [name, prep] of states) {
    await prep();
    await wait(400);
    const r = await togglePanels(page);
    check(`no black canvas while toggling panels — ${name}`, r.frames > 10 && r.black === 0 && r.worst < 0.3 && r.settled < 0.3,
      `${r.black}/${r.frames} resize frames black, screenshot dark ${(r.worst * 100).toFixed(0)}% mid / ${(r.settled * 100).toFixed(0)}% settled`);
  }
  await page.evaluate(() => { window.__probe = { frames: 0, black: 0 }; });
  for (const [w, h] of [[1200, 760], [1500, 950], [1440, 900]]) { await page.setViewport({ width: w, height: h }); await wait(150); }
  const r = await page.evaluate(() => window.__probe);
  check('no black canvas while the window is resized', r.frames >= 3 && r.black === 0, `${r.black}/${r.frames}`);
  await page.close();
}

// ---------------------------------------------------------------- core functions
{
  const page = await open(1440, 900);
  let h = await header(page);
  check('preset A starts with 200 prey / 25 predators', num(h, /피식자 (\d+)/) === 200 && num(h, /포식자 (\d+)/) === 25, h.slice(0, 80));
  await click(page, '시작');
  await speed(page, 10);
  await wait(3000);
  h = await header(page);
  check('simulation runs in the worker at 10× (UPS ≈ 300)', Math.abs(num(h, /UPS (\d+)/) - 300) < 45, `UPS ${num(h, /UPS (\d+)/)}`);
  check('prey reproduce', num(h, /피식자 (\d+)/) > 200);
  const fps = num(h, /FPS (\d+)/);
  check('FPS counts painted frames (≈ snapshot rate while running, ≤ 61)', fps > 10 && fps <= 61, `FPS ${fps}`);

  // select a creature
  const box = await (await page.$('canvas')).boundingBox();
  let selected = false;
  for (let k = 0; k < 120 && !selected; k++) {
    await page.mouse.click(box.x + box.width * (0.1 + 0.8 * ((k * 37) % 61) / 61), box.y + box.height * (0.1 + 0.8 * ((k * 23) % 59) / 59));
    selected = await page.waitForFunction(() => document.body.innerText.includes('유전자 = 표현형'), { timeout: 600 }).then(() => true, () => false);
  }
  check('clicking a creature shows its genes', selected);

  await click(page, '일시정지');
  await wait(300);
  await page.evaluate(() => { window.__probe = { frames: 0, black: 0 }; });
  await toggleSettings(page); await wait(350); await toggleSettings(page); await wait(350);
  check('selection survives a settings toggle', await page.evaluate(() => document.body.innerText.includes('유전자 = 표현형')));
  check('…without black frames', (await page.evaluate(() => window.__probe.black)) === 0);

  await toggleStats(page);
  await wait(1500);
  const lines = await page.evaluate(() => [...document.querySelectorAll('#stats-panel .recharts-line-curve')].filter((p) => (p.getAttribute('d') || '').length > 20).length);
  check('stats charts draw real data', lines >= 4, `${lines} line paths`);
  await toggleStats(page);

  for (const id of ['B', 'C']) {
    await page.select('#preset-select', id);
    await wait(400);
    await click(page, '시작');
    await speed(page, 10);
    await wait(2500);
    h = await header(page);
    check(`preset ${id} runs`, num(h, /피식자 (\d+)/) > 0 && num(h, /먹이 (\d+)/) > 0 && num(h, /UPS (\d+)/) > 200, h.slice(40, 140));
    await click(page, '일시정지');
  }
  await click(page, '초기화');
  await wait(500);
  check('reset returns to t = 0', / 시간 0s /.test(` ${await header(page)} `));
  await page.close();
}

// ---------------------------------------------------------------- mobile
{
  const page = await open(390, 844);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('mobile: no horizontal overflow', overflow <= 0, `${overflow}px`);
  await page.evaluate(() => { window.__probe = { frames: 0, black: 0 }; });
  await toggleSettings(page); await wait(400);
  const drawer = await page.$eval('#settings-panel', (a) => getComputedStyle(a).position);
  await page.keyboard.press('Escape'); await wait(400);
  check('mobile: settings open as an overlay drawer and close with Esc', drawer === 'fixed' && (await page.$eval('#settings-panel', (a) => a.hasAttribute('inert'))));
  check('mobile: canvas stays drawn', (await screenshotDark(page)) < 0.3 && (await page.evaluate(() => window.__probe.black)) === 0);
  await page.close();
}

console.log(`\nconsole errors / failed requests / HTTP errors: ${problems.length ? '' : 'none'}`);
for (const p of problems) console.log(`  ${p}`);
if (problems.length) failed++;
await browser.close();
server?.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
