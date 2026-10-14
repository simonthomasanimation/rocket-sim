#!/usr/bin/env node
// Writes art/parts/<id>.svg for every part in src/core/parts.js. The parts
// are drawn here from their data (height, radius, size) so the stack is
// consistent; edit the drawing rules here and re-run `node tools/parts-svg.js`.
//
// Conventions (docs/decisions.md): viewBox units are decimetres, the stack
// axis is x = 0, y runs down from the top node at (0, 0) to the bottom node
// at (0, H). Two stroke weights only, 1.5 structure and 0.75 annotation,
// both non-scaling so they stay the same on the catalog icon and on the
// drafting table; stroke colour is currentColor so each document recolours
// the same file; no fills (hatching only). Attachment nodes are named
// elements: node-top, node-bottom, node-left, node-right on stack parts
// (left/right on radial hosts only), node-attach on radial parts, which are
// drawn as the right-hand one of their pair.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS, SIZES, partRadius } from '../src/core/parts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'art', 'parts');

const f = (n) => (Math.round(n * 100) / 100).toString();
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const poly = (list) => `<polygon points="${pts(list)}"/>`;
const line = (list) => `<polyline points="${pts(list)}"/>`;
const seg = (x1, y1, x2, y2) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const rect = (x, y, w, h) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
const pathD = (d) => `<path d="${d}"/>`;
const dashed = (el) => el.replace(/\/>$/, ' stroke-dasharray="2 2"/>');

// Diagonal hatching clipped to a rectangle, as separate short lines (no
// clip paths: the canvas loader rasterises plain elements best). Pitch
// grows with the box so a long tank is not a wall of ink.
function hatch(x, y, w, h, pitch = null) {
  const p = pitch || Math.max(3, Math.min(w, h) / 4);
  const out = [];
  for (let c = -h; c < w; c += p) {
    // Line from (x + c, y + h) up-right at 45 degrees, clipped to the box.
    let x1 = x + c; let y1 = y + h; let x2 = x + c + h; let y2 = y;
    if (x1 < x) { y1 -= x - x1; x1 = x; }
    if (x2 > x + w) { y2 += x2 - (x + w); x2 = x + w; }
    if (x2 > x1 && y1 > y2) out.push(seg(x1, y1, x2, y2));
  }
  return out;
}

// An inner tank: domed ends, a feed line, and hatching for the fuel.
function innerTank(hw, y0, y1) {
  const dome = Math.min(hw * 0.5, (y1 - y0) * 0.2);
  const d = `M${f(-hw)},${f(y0 + dome)} Q${f(-hw)},${f(y0)} ${f(-hw + dome)},${f(y0)} L${f(hw - dome)},${f(y0)} Q${f(hw)},${f(y0)} ${f(hw)},${f(y0 + dome)} L${f(hw)},${f(y1 - dome)} Q${f(hw)},${f(y1)} ${f(hw - dome)},${f(y1)} L${f(-hw + dome)},${f(y1)} Q${f(-hw)},${f(y1)} ${f(-hw)},${f(y1 - dome)} Z`;
  return [pathD(d), ...hatch(-hw * 0.9, y0 + dome * 0.6, hw * 1.8, y1 - y0 - dome * 1.2)];
}

// A bell: throat at the top, flaring sides, a lip at the bottom.
function bell(cx, y0, y1, throat, mouth) {
  const d = `M${f(cx - throat)},${f(y0)} C${f(cx - throat)},${f(y0 + (y1 - y0) * 0.6)} ${f(cx - mouth)},${f(y0 + (y1 - y0) * 0.7)} ${f(cx - mouth)},${f(y1)} L${f(cx + mouth)},${f(y1)} C${f(cx + mouth)},${f(y0 + (y1 - y0) * 0.7)} ${f(cx + throat)},${f(y0 + (y1 - y0) * 0.6)} ${f(cx + throat)},${f(y0)} Z`;
  return pathD(d);
}

function drawPart(p) {
  const r = SIZES[p.size].radius * 10; // stack half-width in units
  const H = p.height * 10;
  const S = []; // structure
  const A = []; // annotation
  let halfW = r;
  const nodes = {};
  const isStack = p.nodes.radial !== 'attach';
  if (isStack) {
    if (p.nodes.top) nodes['node-top'] = [0, 0];
    if (p.nodes.bottom) nodes['node-bottom'] = [0, H];
  }
  switch (p.category) {
    case 'tank': {
      S.push(rect(-r, 0, 2 * r, H));
      A.push(...innerTank(r * 0.78, Math.min(4, H * 0.08), H - Math.min(4, H * 0.08)));
      // Weld seams every 2.5 m, a feed line down the axis at the bottom.
      for (let y = 25; y < H - 5; y += 25) A.push(seg(-r, y, r, y));
      nodes['node-left'] = [-r, H / 2]; nodes['node-right'] = [r, H / 2];
      break;
    }
    case 'engine': {
      const mountH = Math.min(H * 0.3, 6);
      const throat = r * 0.28;
      const mouth = Math.min(r * 0.85, H * 0.45);
      S.push(rect(-r * 0.9, 0, r * 1.8, mountH));
      S.push(bell(0, mountH, H, throat, mouth));
      // Turbopump and feed lines on the mount, a lip ring on the bell.
      A.push(rect(-throat * 1.6, mountH * 0.2, throat * 1.2, mountH * 0.6));
      A.push(seg(throat * 0.6, mountH * 0.25, throat * 1.6, mountH * 0.25), seg(throat * 0.6, mountH * 0.65, throat * 1.6, mountH * 0.65));
      A.push(seg(-mouth * 0.92, H - 1.2, mouth * 0.92, H - 1.2));
      for (let y = mountH + (H - mountH) * 0.35; y < H - 2; y += Math.max(2.5, (H - mountH) / 5)) {
        const t = (y - mountH) / (H - mountH);
        const w = throat + (mouth - throat) * t * t;
        A.push(seg(-w, y, w, y));
      }
      break;
    }
    case 'booster': {
      const br = p.radius * 10;
      halfW = br;
      const nose = Math.min(br * 2.2, H * 0.22);
      const bellH = Math.min(br * 1.2, H * 0.1);
      S.push(pathD(`M${f(-br)},${f(nose)} Q${f(-br)},${f(nose * 0.3)} ${f(0)},0 Q${f(br)},${f(nose * 0.3)} ${f(br)},${f(nose)} L${f(br)},${f(H - bellH)} L${f(-br)},${f(H - bellH)} Z`));
      S.push(bell(0, H - bellH, H, br * 0.35, br * 0.75));
      // Solid grain: a cross-hatched core, segment joints, bolts to the hull.
      A.push(...hatch(-br * 0.7, nose + 1.5, br * 1.4, H - bellH - nose - 3, 5));
      for (let y = nose + (H - nose - bellH) / 3; y < H - bellH - 1; y += (H - nose - bellH) / 3) A.push(seg(-br, y, br, y));
      A.push(seg(-br, nose + 2, -br - 2.5, nose + 2), seg(-br, H - bellH - 2, -br - 2.5, H - bellH - 2));
      nodes['node-attach'] = [-br, H / 2];
      break;
    }
    case 'decoupler': {
      S.push(rect(-r, 0, 2 * r, H));
      A.push(dashed(seg(-r - 1.5, H / 2, r + 1.5, H / 2)));
      for (let x = -r + r / 3; x < r; x += r / 3) A.push(seg(x, 0.4, x, H - 0.4));
      break;
    }
    case 'command': {
      if (p.crew === 0) {
        // Probe core: an instrument box with two antenna stubs.
        S.push(rect(-r * 0.8, 0, r * 1.6, H));
        A.push(dashed(rect(-r * 0.55, H * 0.25, r * 1.1, H * 0.5)));
        A.push(seg(-r * 0.8, H * 0.5, -r - 1.5, H * 0.5), seg(r * 0.8, H * 0.5, r + 1.5, H * 0.5));
        A.push(seg(-r - 1.5, H * 0.2, -r - 1.5, H * 0.8), seg(r + 1.5, H * 0.2, r + 1.5, H * 0.8));
        halfW = r + 1.5;
      } else {
        // Capsule: a cone from the shield width to a flat top with a hatch ring.
        const topHW = r * 0.32;
        const shoulder = H * 0.12;
        S.push(pathD(`M${f(-r)},${f(H)} L${f(-r)},${f(H - shoulder)} L${f(-topHW)},${f(0)} L${f(topHW)},0 L${f(r)},${f(H - shoulder)} L${f(r)},${f(H)} Z`));
        // Windows, one per seat, and a hatch outline.
        const seats = p.crew;
        for (let i = 0; i < seats; i++) {
          const x = (i - (seats - 1) / 2) * r * 0.7;
          A.push(poly([[x - r * 0.18, H * 0.42], [x + r * 0.18, H * 0.42], [x + r * 0.22, H * 0.6], [x - r * 0.22, H * 0.6]]));
        }
        A.push(dashed(seg(-r * 0.85, H - shoulder * 0.5, r * 0.85, H - shoulder * 0.5)));
        A.push(rect(-topHW * 0.6, H * 0.1, topHW * 1.2, H * 0.18));
      }
      break;
    }
    case 'structure': {
      if (p.id.startsWith('adapter')) {
        const topR = SIZES[p.nodes.top].radius * 10;
        S.push(poly([[-r, H], [-topR, 0], [topR, 0], [r, H]]));
        A.push(seg(-(r + topR) / 2, H / 2, (r + topR) / 2, H / 2));
        for (let x = -topR; x <= topR + 0.01; x += topR) A.push(seg(x, 0.3, x * (r / topR), H - 0.3));
      } else if (p.id === 'fins') {
        // One fin of the pair, root on the hull at the left edge, swept tip.
        const span = p.span * 10;
        halfW = span / 2;
        S.push(poly([[-span / 2, 0], [-span / 2, H], [span / 2, H], [span / 2, H * 0.55]]));
        A.push(seg(-span / 2 + span * 0.3, H * 0.15, -span / 2 + span * 0.3, H - 0.8));
        A.push(seg(-span / 2 + span * 0.6, H * 0.45, -span / 2 + span * 0.6, H - 0.8));
        nodes['node-attach'] = [-span / 2, H * 0.5];
      } else {
        // One landing leg of the pair: primary strut from the hull to the
        // pad, secondary strut, footpad. The hull is at the left edge.
        const span = p.span * 10;
        halfW = span / 2 + 1.5;
        const x0 = -span / 2;
        S.push(seg(x0, H * 0.15, span / 2, H), seg(x0, H * 0.6, span / 2 - span * 0.25, H * 0.75));
        S.push(seg(span / 2 - 2.5, H, span / 2 + 2.5, H));
        A.push(seg(x0, H * 0.15, x0, H * 0.6));
        A.push(dashed(seg(x0 + span * 0.3, H * 0.4, x0 + span * 0.3, H)));
        nodes['node-attach'] = [x0, H * 0.4];
      }
      break;
    }
    case 'utility': {
      if (p.chute) {
        // Canister with a domed lid; a folded canopy inside as nested arcs.
        const hw = r * 0.55;
        S.push(pathD(`M${f(-hw)},${f(H)} L${f(-hw)},${f(H * 0.5)} Q${f(-hw)},0 0,0 Q${f(hw)},0 ${f(hw)},${f(H * 0.5)} L${f(hw)},${f(H)} Z`));
        A.push(pathD(`M${f(-hw * 0.6)},${f(H * 0.85)} Q0,${f(H * 0.3)} ${f(hw * 0.6)},${f(H * 0.85)}`));
        A.push(pathD(`M${f(-hw * 0.3)},${f(H * 0.85)} Q0,${f(H * 0.55)} ${f(hw * 0.3)},${f(H * 0.85)}`));
      } else if (p.shield) {
        // A dish: flat on top, a shallow curve below, ablative layers hatched.
        S.push(pathD(`M${f(-r)},0 L${f(r)},0 L${f(r)},${f(H * 0.4)} Q0,${f(H * 1.9)} ${f(-r)},${f(H * 0.4)} Z`));
        A.push(pathD(`M${f(-r * 0.8)},${f(H * 0.4)} Q0,${f(H * 1.5)} ${f(r * 0.8)},${f(H * 0.4)}`));
        for (let x = -r * 0.75; x <= r * 0.75; x += r * 0.25) A.push(seg(x, H * 0.45, x, H * 0.9 - Math.abs(x / r) * H * 0.5));
      } else if (p.id.startsWith('nose')) {
        S.push(pathD(`M${f(-r)},${f(H)} C${f(-r)},${f(H * 0.4)} ${f(-r * 0.4)},${f(H * 0.1)} 0,0 C${f(r * 0.4)},${f(H * 0.1)} ${f(r)},${f(H * 0.4)} ${f(r)},${f(H)} Z`));
        A.push(dashed(seg(0, 1.5, 0, H - 1)));
        A.push(seg(-r * 0.75, H * 0.75, r * 0.75, H * 0.75));
      } else {
        // Beeper: a box with a whip antenna and a ring aerial.
        S.push(rect(-r * 0.7, 0, r * 1.4, H));
        A.push(seg(r * 0.7, H * 0.3, r + 2, H * 0.3), seg(r + 2, H * 0.3, r + 2, -1));
        A.push(`<circle cx="${f(-r * 0.25)}" cy="${f(H / 2)}" r="${f(H * 0.22)}"/>`);
        A.push(dashed(seg(-r * 0.7 + 1, H * 0.8, r * 0.7 - 1, H * 0.8)));
        halfW = r + 2;
      }
      break;
    }
    default: throw new Error(`no drawing for ${p.category}`);
  }
  return { halfW, H, S, A, nodes };
}

function svgFor(p) {
  const { halfW, H, S, A, nodes } = drawPart(p);
  const pad = 2;
  const vb = `${f(-halfW - pad)} ${f(-pad)} ${f(2 * (halfW + pad))} ${f(H + 2 * pad)}`;
  const ns = (list) => list.map((el) => el.replace(/\/>$/, ' vector-effect="non-scaling-stroke"/>'));
  const nodeEls = Object.entries(nodes).map(([id, [x, y]]) => `<circle id="${id}" class="node" cx="${f(x)}" cy="${f(y)}" r="2" stroke-dasharray="1.5 1.5" vector-effect="non-scaling-stroke"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-part="${p.id}" data-size="${p.size}" data-height="${f(H)}" data-half-width="${f(halfW)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
<title>${p.name}</title>
<g id="structure" stroke-width="1.5">
${ns(S).join('\n')}
</g>
<g id="annotation" stroke-width="0.75">
${ns(A).join('\n')}
</g>
<g id="nodes" stroke-width="0.75">
${nodeEls.join('\n')}
</g>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
let bytes = 0;
for (const p of PARTS) {
  const svg = svgFor(p);
  fs.writeFileSync(path.join(outDir, `${p.id}.svg`), svg);
  bytes += Buffer.byteLength(svg);
}
console.log(`${PARTS.length} part drawings written to art/parts (${(bytes / 1024).toFixed(1)} kB)`);
