#!/usr/bin/env node
// Browser battery: drives the real page through the flight plan, every
// start, the builder, every preset launched from Earth and the Moon, the
// map, replay, pause, zoom, pan and the report pages, on a desktop and a
// phone-sized viewport, with random hands on the keys. It fails on any
// page error or console error, and reports slow frames. Needs Playwright.
// Usage: node tools/battery.js [--seconds N] [--shot DIR] [--snapshot]

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SECONDS = Number(opt('--seconds', 4));
const shotDir = opt('--shot', null);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.join(root, decodeURIComponent(url.pathname));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// A small seeded generator so a run can be repeated.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (list) => list[Math.floor(rnd() * list.length)];

const FLIGHT_KEYS = ['w', 's', 'a', 'd', 'z', 'x', 't', 'g', 'Enter', 'p', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'e', 'Tab', 'Tab', '+', '-', '0', 'c', 'l', ' ', ' '];

async function main() {
  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); } catch { console.log('battery skipped (playwright not installed)'); return; }
  const { server, port } = await serve();
  const browser = await playwright.chromium.launch();
  const problems = [];
  const notes = [];
  const flag = (s) => { problems.push(s); console.log(`  !! ${s}`); };

  for (const [label, vp] of [['desk', { width: 1280, height: 800, hasTouch: false }], ['phone', { width: 390, height: 760, hasTouch: true, isMobile: true }]]) {
    console.log(`${label}: ${vp.width}x${vp.height}`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.hasTouch, isMobile: vp.isMobile, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => flag(`${label}: page error: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') flag(`${label}: console error: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/${args.includes('--snapshot') ? 'dist/' : ''}index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    // Frame monitor: counts frames and long gaps between them.
    await page.evaluate(() => {
      window.__frames = { n: 0, slow: 0, worst: 0, last: performance.now() };
      const tick = (t) => { const d = t - window.__frames.last; window.__frames.last = t; window.__frames.n += 1; if (d > 100) window.__frames.slow += 1; if (d > window.__frames.worst) window.__frames.worst = d; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const k = () => page.evaluate(() => { const K = window.__karman; return { doc: K.doc, phase: K.phase, scenario: K.scenario, replay: !!K.replay, paused: K.paused, warp: K.warp, builder: K.builder.isOpen, page: !!document.querySelector('#page.is-open'), stage: K.flight.state.stage, alt: K.flight.altitude() }; });
    const shot = async (name) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${label}-${name}.png`) }); } };
    const mash = async (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const key = pick(FLIGHT_KEYS);
        if (key === 'w' || key === 's' || key === 'a' || key === 'd') { await page.keyboard.down(key); await page.waitForTimeout(60 + rnd() * 240); await page.keyboard.up(key); }
        else { await page.keyboard.press(key); await page.waitForTimeout(40 + rnd() * 120); }
        const s = await k();
        if (s.page && !s.replay) { await page.keyboard.press('Enter'); } // a report or orbit card: carry on
      }
    };

    // 1. The seven starts, each flown with random hands, then replay and the report.
    for (let i = 1; i <= 7; i++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      await page.keyboard.press('n'); await page.waitForTimeout(150);
      await page.keyboard.press(String(i)); await page.waitForTimeout(250);
      const before = await k();
      if (before.page || before.builder) flag(`${label}: start ${i} did not open a flight (${JSON.stringify(before)})`);
      await page.keyboard.down('z'); await page.waitForTimeout(400); await page.keyboard.up('z');
      await mash(SECONDS * 1000);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      let s = await k();
      if (s.doc === 'crt') { await page.keyboard.press('Tab'); }
      if (s.replay) { await page.keyboard.press('Escape'); }
      // Replay the flight, scrub, exit.
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      await page.keyboard.press('v'); await page.waitForTimeout(300);
      s = await k();
      if (!s.replay && !s.page) notes.push(`${label}: start ${i}: V did not open a replay (${s.phase})`);
      if (s.replay) {
        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End', ' ', ' ']) { await page.keyboard.press(key); await page.waitForTimeout(80); }
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      }
      await shot(`start-${i}`);
      await page.keyboard.press('r'); await page.waitForTimeout(100);
    }

    // 2. The builder: drag and tap parts, remove, move, presets, launches.
    await page.keyboard.press('Escape'); await page.keyboard.press('n'); await page.waitForTimeout(150);
    await page.keyboard.press('8'); await page.waitForTimeout(600);
    let s = await k();
    if (!s.builder || s.doc !== 'vellum') flag(`${label}: 8 did not open the builder (${JSON.stringify(s)})`);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('.vellum-part')).map((b) => b.dataset.part));
    await page.evaluate(() => window.__karman.builder.load({ name: 'BATTERY', stack: [] }));
    const centre = { x: vp.width / 2, y: vp.height * 0.6 };
    for (let i = 0; i < 14; i++) {
      const id = pick(ids);
      const item = await page.$(`[data-part="${id}"]`);
      if (!item) continue;
      await item.scrollIntoViewIfNeeded();
      const bb = await item.boundingBox();
      if (!bb) continue;
      if (vp.hasTouch) { await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      else if (rnd() < 0.5) { await item.click(); }
      else {
        await page.mouse.move(bb.x + 20, bb.y + 20); await page.mouse.down();
        await page.mouse.move(bb.x + 60, bb.y + 30, { steps: 3 });
        await page.mouse.move(centre.x + (rnd() - 0.5) * 40, centre.y - rnd() * 300, { steps: 6 });
        await page.mouse.up();
      }
      await page.waitForTimeout(60);
    }
    let stack = await page.evaluate(() => window.__karman.builder.design.stack.length);
    if (stack < 3) notes.push(`${label}: only ${stack} parts after 14 adds (refusals are expected, zero would not be)`);
    if (!vp.hasTouch) {
      // Drag a stacked part to another joint, another off the sheet.
      const boxes = await page.evaluate(() => { const b = window.__karman.builder; return b.design.stack.map((_, i) => i); });
      if (boxes.length >= 2) {
        await page.mouse.move(centre.x, vp.height * 0.6 - 40); await page.mouse.down(); await page.mouse.move(centre.x, vp.height * 0.6 - 300, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(80);
        await page.mouse.move(centre.x, vp.height * 0.6 - 40); await page.mouse.down(); await page.mouse.move(60, 60, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(80);
      }
    }
    await page.mouse.click(centre.x, vp.height * 0.6 - 30);
    await page.keyboard.press('Delete'); await page.waitForTimeout(80);
    await shot('builder');
    // Every preset from both pads with random hands.
    const presets = await page.evaluate(() => { window.__karman.builder.setView('designs'); return Array.from(document.querySelectorAll('.vellum-designs li')).map((li) => li.textContent.slice(0, 20)); });
    if (presets.length < 6) flag(`${label}: ${presets.length} presets listed`);
    for (let pi = 0; pi < 6; pi++) {
      for (const where of ['designEarth', 'designMoon']) {
        await page.evaluate(async (idx) => { const K = window.__karman; if (!K.builder.isOpen) K.openBuilder(); await new Promise((r) => setTimeout(r, 150)); K.builder.setView('designs'); const lis = Array.from(document.querySelectorAll('.vellum-designs li')); const li = lis.filter((l) => /KP-\d/.test(l.textContent))[idx]; li.querySelector('button').click(); }, pi);
        await page.evaluate((w) => window.__karman.launchDesign(w), where);
        await page.waitForTimeout(250);
        s = await k();
        if (s.doc !== 'blueprint' || s.phase !== 'pad') flag(`${label}: preset ${pi + 1} on ${where}: ${JSON.stringify(s)}`);
        await page.keyboard.down('z'); await page.waitForTimeout(500); await page.keyboard.up('z');
        await mash(SECONDS * 600);
        s = await k();
        if (s.doc === 'crt') await page.keyboard.press('Tab');
        if (s.replay) await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      }
    }
    await shot('design-flight');
    // 3. Pan and pinch on the sheet, and the map.
    await page.keyboard.press('Escape'); await page.keyboard.press('n'); await page.keyboard.press('4'); await page.waitForTimeout(200);
    await page.keyboard.down('z'); await page.waitForTimeout(1500); await page.keyboard.up('z');
    if (vp.hasTouch) {
      await page.touchscreen.tap(vp.width / 2, vp.height / 3);
    } else {
      await page.mouse.move(vp.width / 2, vp.height / 3); await page.mouse.down(); await page.mouse.move(vp.width / 2 + 200, vp.height / 3 + 100, { steps: 10 }); await page.mouse.up();
      await page.mouse.wheel(0, -600); await page.mouse.wheel(0, 900);
    }
    await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    if (!vp.hasTouch) { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.down(); await page.mouse.move(vp.width / 2 - 150, vp.height / 2 + 60, { steps: 8 }); await page.mouse.up(); await page.mouse.wheel(0, -300); }
    await page.keyboard.press('c'); await page.keyboard.press('l'); await page.keyboard.press('0'); await page.keyboard.press('l');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.press('e'); await page.waitForTimeout(1500);
    await shot('map');
    await page.keyboard.press('Tab');
    // Frames.
    const fr = await page.evaluate(() => window.__frames);
    const ms = fr.n ? (fr.slow / fr.n * 100).toFixed(1) : '?';
    console.log(`  frames ${fr.n}, slow (>100 ms) ${fr.slow} (${ms} %), worst ${fr.worst.toFixed(0)} ms`);
    if (fr.n > 0 && fr.slow / fr.n > 0.05) notes.push(`${label}: ${ms} % of frames over 100 ms (worst ${fr.worst.toFixed(0)} ms)`);
    await page.close();
  }
  await browser.close();
  server.close();
  for (const n of notes) console.log(`note: ${n}`);
  if (problems.length) { console.log(`\n${problems.length} problem(s)`); process.exit(1); }
  console.log('battery: no problems');
}

main().catch((e) => { console.error(e); process.exit(1); });
