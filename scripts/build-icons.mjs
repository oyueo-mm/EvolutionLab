// Renders the raster icon variants from public/logo.svg with a local Chrome/Edge.
// Usage: node scripts/build-icons.mjs   (output is committed; rerun only when the logo changes)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findBrowser } from '../e2e/lib.mjs';

const svg = fs.readFileSync('public/logo.svg', 'utf8');
// Full-bleed variant for platforms that apply their own corner mask (iOS home screen).
const fullBleed = svg.replace('rx="14" ', '');

const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
const page = await browser.newPage();
async function png(source, size) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** ICO container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((im) => im.data)]);
}

const sizes = [16, 32, 48];
const icoImages = [];
for (const s of sizes) icoImages.push({ size: s, data: await png(svg, s) });
fs.writeFileSync('public/favicon.ico', ico(icoImages));
fs.writeFileSync('public/apple-touch-icon.png', await png(fullBleed, 180));
fs.mkdirSync('public/brand', { recursive: true });
fs.writeFileSync('public/brand/logo-512.png', await png(svg, 512));
fs.writeFileSync('public/brand/logo-192.png', await png(svg, 192));
await browser.close();
console.log('wrote public/favicon.ico (16/32/48), public/apple-touch-icon.png (180), public/brand/logo-{192,512}.png');
