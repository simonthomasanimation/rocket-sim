#!/usr/bin/env node
// Deploy check: builds the snapshot, syntax-checks the bundle, then (when
// Playwright and a Chromium are available) opens both the dev page and the
// snapshot headlessly and fails on any page error or console error.
// Usage: node tools/check.js [--shot DIR]

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bundle, buildSnapshot } from './snapshot.js';
import { PARTS } from '../src/core/parts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : null;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

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

async function openAndWatch(browser, url, label) {
  const problems = [];
  const warnings = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`${label}: page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${label}: console error: ${m.text()}`);
    else if (m.type() === 'warning') warnings.push(`${label}: console warning: ${m.text()}`);
  });
  page.on('requestfailed', (r) => warnings.push(`${label}: request failed: ${r.url()} (${r.failure()?.errorText})`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  if (!canvas || canvas.w === 0 || canvas.h === 0) problems.push(`${label}: no sized canvas on the page`);
  // Every part drawing decodes as an image, from the inlined map on the
  // snapshot and over the wire on the dev page.
  const bad = await page.evaluate(async (ids) => {
    const out = [];
    for (const id of ids) {
      const key = `art/parts/${id}.svg`;
      let text = window.__KP_ASSETS && window.__KP_ASSETS[key];
      if (!text) { const r = await fetch(key); if (!r.ok) { out.push(`${id}: ${r.status}`); continue; } text = await r.text(); }
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.replace('<svg ', '<svg width="64" height="64" ').split('currentColor').join('#1E1C1A'))}`;
      try { await img.decode(); } catch { out.push(`${id}: does not decode`); continue; }
      if (!(img.naturalWidth > 0)) out.push(`${id}: empty image`);
    }
    return out;
  }, PARTS.map((p) => p.id));
  for (const b of bad) problems.push(`${label}: part art ${b}`);
  // The builder: open it, add parts as taps on the catalog would, check the
  // stack and the staging list follow, and come back to the flight plan.
  const built = await page.evaluate(async () => {
    const k = window.__karman;
    if (!k || !k.openBuilder) return 'no builder hook';
    k.openBuilder();
    await new Promise((r) => setTimeout(r, 300));
    if (k.doc !== 'vellum' || !k.builder.isOpen) return `builder did not open (${k.doc})`;
    const b = k.builder;
    const n = b.design.stack.length;
    b.load({ name: 'CHECK', stack: [] });
    b.add('engine-s-lift'); b.add('tank-s-long'); b.add('booster-s'); b.add('decoupler-s'); b.add('shield-s'); b.add('capsule-s'); b.add('parachute');
    if (b.design.stack.length !== 6 || b.design.stack[1].radials.length !== 1) return `stack is ${JSON.stringify(b.design.stack)}`;
    b.add('tank-s-short');
    if (b.design.stack.length !== 6) return 'a part stacked on a parachute';
    const s = b.stats;
    if (!(s.stages.length === 3 && s.mass > 0 && s.deltaV > 0)) return `stats ${JSON.stringify(s)}`;
    if (!document.querySelector('.vellum-part img')) return 'catalog without icons';
    if (document.querySelectorAll('.vellum-stage').length !== 4) return `${document.querySelectorAll('.vellum-stage').length} staging rows`;
    // Save it, find it in the list and in the store, import a JSON text, and
    // check the sheet comes back as it was left.
    b.save();
    if (!b.saved.CHECK || b.saved.CHECK.stack.length !== 6) return 'the design was not saved';
    const stored = k.store.read('designs');
    if (!stored || !stored.CHECK) return 'the store does not hold the saved design';
    if (!document.querySelector('.vellum-designs b')) return 'the saved list is empty';
    const presets = document.querySelectorAll('.vellum-designs')[1];
    if (!presets || presets.querySelectorAll('li').length !== 6) return 'six presets expected in the list';
    b.importText(JSON.stringify({ format: 'karman-design', version: 1, design: { name: 'IMPORTED', stack: ['engine-s-lift', 'tank-s-long', 'probe-core', 'nose-s'] } }));
    if (b.design.name !== 'IMPORTED' || b.design.stack.length !== 4) return 'the import did not land on the sheet';
    let refused = false;
    try { b.importText('{"name":"X","stack":["warp-drive"]}'); } catch { refused = true; }
    if (!refused || b.design.name !== 'IMPORTED') return 'a bad import was not refused';
    const current = k.store.read('builder.current');
    if (!current || current.name !== 'IMPORTED') return 'the sheet is not kept between visits';
    k.closeBuilder();
    await new Promise((r) => setTimeout(r, 300));
    if (k.doc !== 'blueprint') return `builder did not close (${k.doc})`;
    // Launch the KP-4 preset from the sheet: the flight is built from the
    // design, drawn from its parts, lifts off under full throttle, drops
    // its boosters, and its recording carries the rocket.
    k.openBuilder();
    await new Promise((r) => setTimeout(r, 200));
    const kp4 = Array.from(document.querySelectorAll('.vellum-designs li')).find((li) => li.textContent.includes('KP-4'));
    if (!kp4) return 'no KP-4 preset in the list';
    kp4.querySelector('button').click();
    k.launchDesign('designEarth');
    await new Promise((r) => setTimeout(r, 300));
    if (k.doc !== 'blueprint' || k.scenario !== 'designEarth' || k.phase !== 'pad') return `launch state ${k.doc} ${k.scenario} ${k.phase}`;
    if (k.flight.cfg.drawing !== 'parts' || k.flight.cfg.name !== 'KP-4 ORBITAL CAPSULE') return `craft ${k.flight.cfg.name} ${k.flight.cfg.drawing}`;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true }));
    await new Promise((r) => setTimeout(r, 2500));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', bubbles: true }));
    if (k.phase !== 'flying' || k.flight.altitude() < 20) return `did not lift off: ${k.phase} at ${k.flight.altitude().toFixed(0)} m`;
    if (!k.flight.recording().design) return 'the recording does not carry the design';
    return n >= 0 ? null : 'bad';
  });
  if (built) problems.push(`${label}: builder: ${built}`);
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${label}.png`) });
  }
  await page.close();
  return { problems, warnings };
}

async function main() {
  const { generated, bytes } = buildSnapshot();
  console.log(`snapshot: dist/index.html ${(bytes / 1024).toFixed(1)} kB from ${generated.join(', ')}`);
  if (bytes > 2 * 1024 * 1024) { console.error('snapshot exceeds the 2 MB asset budget'); process.exit(1); }

  const tmp = path.join(root, 'dist', '.bundle-check.js');
  fs.writeFileSync(tmp, bundle('src/main.js'));
  const syntax = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (syntax.status !== 0) { console.error(syntax.stderr); process.exit(1); }
  console.log('bundle: syntax ok');

  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); } catch { playwright = null; }
  if (!playwright) { console.log('browser check skipped (playwright not installed)'); return; }

  const { server, port } = await serve();
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (e) {
    console.log(`browser check skipped (${e.message.split('\n')[0]})`);
    server.close();
    return;
  }
  const results = [
    await openAndWatch(browser, `http://127.0.0.1:${port}/index.html`, 'dev'),
    await openAndWatch(browser, `http://127.0.0.1:${port}/dist/index.html`, 'snapshot'),
  ];
  await browser.close();
  server.close();
  const problems = results.flatMap((r) => r.problems);
  const warnings = results.flatMap((r) => r.warnings);
  warnings.forEach((w) => console.log(`warn: ${w}`));
  if (problems.length) { problems.forEach((p) => console.error(`FAIL: ${p}`)); process.exit(1); }
  console.log('browser: dev page and snapshot load without console errors');
}

main().catch((e) => { console.error(e); process.exit(1); });
