// Vellum document: the builder's paper and the drafting of a stack. Cream
// paper, grey 8 px grid at 10 %, a paper grain that never moves; black ink
// in two weights, red pencil for corrections and warnings. Parts are drawn
// from their SVG files (render/partart.js) on a central axis with dashed
// attachment nodes; decouplers rule the sheet into stages.

import { MONO } from './blueprint.js';
import { partById, partRadius, SIZES } from '../core/parts.js';
import { partGeometry, drawPart } from './partart.js';

export const VELLUM = {
  paper: '#F3EBD8',
  ink: '#1E1C1A',
  inkPale: 'rgba(30, 28, 26, 0.45)',
  pencil: '#C8382B',
  grid: 8,
};
const G = VELLUM.grid;
const HEAD = '"Archivo", "Helvetica Neue", Arial, sans-serif';

let grain = null; // a tile of paper grain, made once
function grainTile() {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  // A fixed sequence so the grain is the same every time the sheet is drawn.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 900; i++) {
    const a = 0.03 + rnd() * 0.03;
    ctx.fillStyle = rnd() < 0.5 ? `rgba(30, 28, 26, ${a})` : `rgba(255, 255, 255, ${a})`;
    ctx.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1, 1);
  }
  grain = c;
  return grain;
}

// The empty sheet, in device pixels so the grid stays crisp.
export function drawVellumPaper(ctx, width, height, dpr) {
  const W = Math.round(width * dpr); const H = Math.round(height * dpr);
  const px = Math.max(1, Math.round(dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = VELLUM.paper;
  ctx.fillRect(0, 0, W, H);
  const minor = 'rgba(30, 28, 26, 0.08)'; const major = 'rgba(30, 28, 26, 0.12)';
  for (let i = 0, x = 0; x <= width; i++, x += G) { ctx.fillStyle = i % 8 === 0 ? major : minor; ctx.fillRect(Math.round(x * dpr), 0, px, H); }
  for (let i = 0, y = 0; y <= height; i++, y += G) { ctx.fillStyle = i % 8 === 0 ? major : minor; ctx.fillRect(0, Math.round(y * dpr), W, px); }
  // Grain: the tile repeated at device scale, never animated.
  try {
    const pat = ctx.createPattern(grainTile(), 'repeat');
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
  } catch { /* no grain on a canvas that refuses patterns */ }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Height of a part in drawing units (decimetres), from its geometry when
// loaded, else from the data.
export function partUnits(id) {
  const g = partGeometry(id);
  const p = partById(id);
  if (g) return { h: g.viewBox[3] - 4, halfW: g.viewBox[2] / 2 - 2, nodes: g.nodes };
  return { h: p.height * 10, halfW: partRadius(p) * 10, nodes: {} };
}

// Lay the stack out in an area { x, y, w, h } (CSS px): a scale that fits
// the whole rocket with room to grow, the axis in the middle, the bottom
// part's base a grid step above the area's foot. Returns px boxes for each
// part and radial pair, used for drawing and hit testing.
export function layoutStack(design, area, { scale = null } = {}) {
  const items = design.stack.map((e, i) => {
    const u = partUnits(e.id);
    return { index: i, id: e.id, units: u, radials: e.radials };
  });
  let total = 0;
  for (const it of items) total += it.units.h;
  let widest = 10;
  for (const it of items) {
    widest = Math.max(widest, it.units.halfW);
    for (const r of it.radials) widest = Math.max(widest, it.units.halfW + 2 * partUnits(r.id).halfW + 2);
  }
  const room = Math.max(1, area.h - 10 * G);
  // Fit the stack and a part's worth of growth, between 0.6 and 3 px per unit.
  const k = scale || Math.max(0.6, Math.min(3, room / Math.max(total + 40, 120), (area.w - 12 * G) / (2 * widest + 20)));
  const axisX = Math.round(area.x + area.w / 2);
  const baseY = Math.round(area.y + area.h - 5 * G);
  const out = { k, axisX, baseY, totalUnits: total, parts: [], radials: [] };
  let y = baseY;
  for (const it of items) {
    const h = it.units.h * k;
    const top = y - h;
    const box = { index: it.index, id: it.id, top, bottom: y, halfW: it.units.halfW * k, x: axisX, nodes: it.units.nodes };
    out.parts.push(box);
    y = top;
  }
  // Radial pairs hang on their host: bottoms level with the engine under
  // the host when there is one (boosters, legs), else with the host.
  for (const box of out.parts) {
    const entry = design.stack[box.index];
    const hostR = partRadius(partById(box.id)) * 10 * k;
    const belowEntry = box.index > 0 ? design.stack[box.index - 1] : null;
    const below = belowEntry && partById(belowEntry.id).category === 'engine' ? out.parts[box.index - 1] : null;
    let lane = 0;
    for (const r of entry.radials) {
      const p = partById(r.id);
      const u = partUnits(r.id);
      const h = u.h * k; const w = 2 * u.halfW * k;
      const bottom = p.category === 'structure' && !p.legs ? box.bottom : below ? below.bottom : box.bottom;
      const attach = u.nodes.attach || [-u.halfW, u.h / 2];
      const gap = lane * (w + 4);
      out.radials.push({ index: box.index, id: r.id, count: r.count, drop: r.drop, lane,
        right: { x: axisX + hostR + gap, y: bottom - h, w, h }, left: { x: axisX - hostR - gap - w, y: bottom - h, w, h },
        attachUnits: attach, units: u, hostR, bottom, top: bottom - h });
      lane += 1;
    }
  }
  return out;
}

// Which part or radial pair is under (x, y)? { kind: 'part', index } |
// { kind: 'radial', index, id } | null.
export function hitStack(layout, x, y) {
  for (const r of layout.radials) {
    for (const side of [r.left, r.right]) if (x >= side.x && x <= side.x + side.w && y >= side.y && y <= side.y + side.h) return { kind: 'radial', index: r.index, id: r.id };
  }
  for (const b of layout.parts) if (Math.abs(x - b.x) <= Math.max(b.halfW, 12) && y >= b.top && y <= b.bottom) return { kind: 'part', index: b.index };
  return null;
}

// The index a dropped stack part would take at height y: the junction
// nearest to it (0 = under everything).
export function insertionIndexAt(layout, y) {
  if (!layout.parts.length) return 0;
  let best = 0; let bestD = Infinity;
  for (let i = 0; i <= layout.parts.length; i++) {
    const jy = i < layout.parts.length ? layout.parts[i].bottom : layout.parts[layout.parts.length - 1].top;
    const d = Math.abs(jy - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function text(ctx, str, x, y, { size = 11, align = 'left', colour = VELLUM.ink, font = MONO, weight = 500, baseline = 'middle' } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, Math.round(x), Math.round(y));
}

function nodeCircle(ctx, x, y, colour = VELLUM.ink, r = 4) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 0.75;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Draw the stack. opts: { selected: { kind, index, id } | null, hover,
// gapAt: index | null (a stack part is being dragged: show where it would
// go), hostHint: index | null (a radial part is being dragged: show the
// hosts), hide: { kind, index, id } (the dragged item, drawn as a ghost
// elsewhere), stages: compiled stages for the division lines, empty: text }
export function drawStack(ctx, layout, design, opts = {}) {
  const { k, axisX, baseY } = layout;
  const ink = VELLUM.ink;
  ctx.save();
  // The central axis as a dashed annotation line.
  const topY = layout.parts.length ? layout.parts[layout.parts.length - 1].top : baseY - 160;
  ctx.strokeStyle = VELLUM.inkPale;
  ctx.lineWidth = 0.75;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(axisX + 0.5, topY - 6 * G); ctx.lineTo(axisX + 0.5, baseY + 2 * G); ctx.stroke();
  ctx.setLineDash([]);
  // The base line: where the pad is.
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(axisX - 12 * G, baseY + 0.5); ctx.lineTo(axisX + 12 * G, baseY + 0.5); ctx.stroke();
  ctx.lineWidth = 0.75;
  for (let x = axisX - 12 * G; x < axisX + 12 * G; x += 6) { ctx.beginPath(); ctx.moveTo(x, baseY + 1); ctx.lineTo(x - 5, baseY + 7); ctx.stroke(); }
  text(ctx, 'PAD 1', axisX + 12 * G, baseY + 14, { size: 10, align: 'right', colour: VELLUM.inkPale });

  if (!layout.parts.length) {
    text(ctx, opts.empty || 'DRAG PARTS HERE, OR TAP ONE IN THE CATALOG', axisX, baseY - 10 * G, { size: 11, align: 'center', colour: VELLUM.inkPale });
  }

  const hidden = (kind, index, id) => opts.hide && opts.hide.kind === kind && opts.hide.index === index && (kind !== 'radial' || opts.hide.id === id);
  // Parts, bottom first, then their radial pairs.
  for (const b of layout.parts) {
    if (hidden('part', b.index)) continue;
    const sel = opts.selected && opts.selected.kind === 'part' && opts.selected.index === b.index;
    const hov = opts.hover && opts.hover.kind === 'part' && opts.hover.index === b.index;
    drawPart(ctx, b.id, sel ? VELLUM.pencil : ink, axisX, b.top, k);
    if (hov && !sel) {
      ctx.strokeStyle = VELLUM.inkPale; ctx.lineWidth = 0.75; ctx.setLineDash([3, 3]);
      ctx.strokeRect(Math.round(axisX - b.halfW - 4) + 0.5, Math.round(b.top - 2) + 0.5, Math.round(2 * b.halfW + 8), Math.round(b.bottom - b.top + 4));
      ctx.setLineDash([]);
    }
  }
  for (const r of layout.radials) {
    if (hidden('radial', r.index, r.id)) continue;
    const sel = opts.selected && opts.selected.kind === 'radial' && opts.selected.index === r.index && opts.selected.id === r.id;
    const colour = sel ? VELLUM.pencil : ink;
    const u = r.units;
    // Right-hand one with its hull side on the host's flank; the left mirrored.
    drawPart(ctx, r.id, colour, r.right.x + u.halfW * k, r.right.y, k);
    drawPart(ctx, r.id, colour, r.left.x + r.left.w - u.halfW * k, r.left.y, k, { flip: true });
    if (r.count === 4) text(ctx, '×4', r.right.x + r.right.w + 4, r.right.y + r.right.h / 2, { size: 10, colour: VELLUM.inkPale });
  }

  // Nodes: at every junction, the open ends, and on the hosts' flanks.
  const hostHint = opts.hostHint;
  for (let i = 0; i <= layout.parts.length; i++) {
    if (!layout.parts.length) { nodeCircle(ctx, axisX, baseY); break; }
    const y = i < layout.parts.length ? layout.parts[i].bottom : layout.parts[i - 1].top;
    nodeCircle(ctx, axisX, y, opts.gapAt === i ? VELLUM.pencil : ink, opts.gapAt === i ? 6 : 4);
  }
  for (const b of layout.parts) {
    const p = partById(b.id);
    if (p.nodes.radial !== 'host') continue;
    const r = partRadius(p) * 10 * k;
    const mid = (b.top + b.bottom) / 2;
    const hint = hostHint !== null && hostHint !== undefined;
    const colour = hint ? (hostHint === b.index ? VELLUM.pencil : ink) : ink;
    nodeCircle(ctx, axisX - r, mid, colour, hint && hostHint === b.index ? 6 : 3);
    nodeCircle(ctx, axisX + r, mid, colour, hint && hostHint === b.index ? 6 : 3);
  }
  // A dragged stack part: the junction it would take, as a pencil line.
  if (opts.gapAt !== null && opts.gapAt !== undefined && layout.parts.length) {
    const y = opts.gapAt < layout.parts.length ? layout.parts[opts.gapAt].bottom : layout.parts[layout.parts.length - 1].top;
    ctx.strokeStyle = VELLUM.pencil; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(axisX - 10 * G, Math.round(y) + 0.5); ctx.lineTo(axisX + 10 * G, Math.round(y) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Stage divisions in red pencil at each decoupler's top edge, and each
  // stage's figures down the left of the sheet, as a drawing's notes.
  if (opts.stages) {
    const width = Math.max(10 * G, ...layout.parts.map((b) => b.halfW + 3 * G), ...layout.radials.map((r) => r.right.x + r.right.w - axisX + 2 * G));
    for (const b of layout.parts) {
      const p = partById(b.id);
      if (p.category !== 'decoupler' || b.index === layout.parts.length - 1) continue;
      ctx.strokeStyle = VELLUM.pencil; ctx.lineWidth = 0.75; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(axisX - width, Math.round(b.top) + 0.5); ctx.lineTo(axisX + width, Math.round(b.top) + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts.figures && !opts.hide) {
      const left = axisX - width - G;
      let lastY = Infinity;
      opts.stages.forEach((st, i) => {
        const f = opts.figures[i];
        if (!f) return;
        let y;
        if (st.kind === 'boosters') { const r = layout.radials.find((q) => q.index === st.radials[0].on && q.id === st.radials[0].id); y = r ? r.top + 10 : null; }
        else { const boxes = st.parts.map((idx) => layout.parts[idx]).filter(Boolean); if (boxes.length) y = (Math.min(...boxes.map((q) => q.top)) + Math.max(...boxes.map((q) => q.bottom))) / 2; }
        if (y === null || y === undefined) return;
        if (lastY - y < 28) y = lastY - 28; // keep the notes apart
        lastY = y;
        const line1 = `${i + 1}  ${st.name}`;
        const line2 = f.deltaV > 0 ? `${Math.round(f.deltaV)} M/S · TWR ${f.twr.toFixed(2)}` : st.capsule ? 'RIDES HOME' : 'NO ENGINE';
        text(ctx, line1, left, y - 7, { size: 10, align: 'right', colour: st.kind === 'boosters' ? VELLUM.pencil : VELLUM.ink });
        text(ctx, line2, left, y + 7, { size: 10, align: 'right', colour: f.thrust > 0 && f.twr < 1 && i === 0 ? VELLUM.pencil : VELLUM.inkPale });
      });
    }
  }
  // Overall height as a dimension line on the right.
  if (layout.parts.length) {
    const right = axisX + Math.max(8 * G, ...layout.parts.map((b) => b.halfW + 2 * G), ...layout.radials.map((r) => r.right.x + r.right.w - axisX + G));
    const x = Math.round(right) + 0.5;
    ctx.strokeStyle = ink; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, baseY); ctx.stroke();
    for (const y of [topY, baseY]) { ctx.beginPath(); ctx.moveTo(x - 4, Math.round(y) + 0.5); ctx.lineTo(x + 4, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.save(); ctx.translate(x + 12, (topY + baseY) / 2); ctx.rotate(-Math.PI / 2);
    text(ctx, `${(layout.totalUnits / 10).toFixed(1)} M`, 0, 0, { size: 10, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}

// A single part drawn as a ghost under the pointer, mirrored pairs for a
// radial part.
export function drawGhost(ctx, id, x, y, k, isRadial) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  const u = partUnits(id);
  if (isRadial) {
    drawPart(ctx, id, VELLUM.pencil, x + 6 + u.halfW * k, y - u.h * k / 2, k);
    drawPart(ctx, id, VELLUM.pencil, x - 6 - u.halfW * k, y - u.h * k / 2, k, { flip: true });
  } else drawPart(ctx, id, VELLUM.pencil, x, y - u.h * k / 2, k);
  ctx.restore();
}

export const SIZE_LABEL = Object.fromEntries(Object.values(SIZES).map((s) => [s.id, s.label]));
