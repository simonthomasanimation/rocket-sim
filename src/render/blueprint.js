// Blueprint document: the flight view's paper. Prussian blue, white 8px grid,
// faint fold creases. Linework only, two stroke weights, no fills but hatching.

import { labelAlpha } from './camera.js';
import { craftHeight, footHalfWidth, activeStage } from '../core/craft.js';

export const BLUEPRINT = {
  paper: '#1B3A6B',
  ink: '#F2F4F7',
  inkPale: '#A9D6E5',
  accent: '#E4572E',
  grid: 8,
  gridMajorEvery: 8, // one heavier line every 64px
};

// Draws the empty sheet. Works in device pixels so grid lines stay crisp at
// any devicePixelRatio: a 1 CSS px line is `round(dpr)` device pixels wide.
export function drawPaper(ctx, width, height, dpr) {
  const W = Math.round(width * dpr);
  const H = Math.round(height * dpr);
  const px = Math.max(1, Math.round(dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BLUEPRINT.paper;
  ctx.fillRect(0, 0, W, H);

  const minor = 'rgba(242, 244, 247, 0.08)';
  const major = 'rgba(242, 244, 247, 0.10)';
  const step = BLUEPRINT.grid;
  for (let i = 0, x = 0; x <= width; i++, x += step) {
    const xd = Math.round(x * dpr);
    ctx.fillStyle = i % BLUEPRINT.gridMajorEvery === 0 ? major : minor;
    ctx.fillRect(xd, 0, px, H);
  }
  for (let i = 0, y = 0; y <= height; i++, y += step) {
    const yd = Math.round(y * dpr);
    ctx.fillStyle = i % BLUEPRINT.gridMajorEvery === 0 ? major : minor;
    ctx.fillRect(0, yd, W, px);
  }

  drawCreases(ctx, W, H, px);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Fold creases: the sheet was folded in half both ways. A lighter line with a
// darker neighbour reads as a crease without a gradient or shadow.
function drawCreases(ctx, W, H, px) {
  const light = 'rgba(242, 244, 247, 0.05)';
  const dark = 'rgba(0, 0, 0, 0.07)';
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  ctx.fillStyle = light;
  ctx.fillRect(cx, 0, px, H);
  ctx.fillRect(0, cy, W, px);
  ctx.fillStyle = dark;
  ctx.fillRect(cx + px, 0, px, H);
  ctx.fillRect(0, cy + px, W, px);
}

// --- Flight scene ---------------------------------------------------------
// Everything below draws in CSS pixels after drawPaper has reset the transform
// to the device pixel ratio. Lengths in metres are multiplied by cam.scale;
// stroke widths stay in pixels (1.5 structure, 0.75 annotation).

export const STROKE = { structure: 1.5, annotation: 0.75 };
export const MONO = '"IBM Plex Mono", "Courier Prime", ui-monospace, Menlo, monospace';

// scene: { state, cfg, phase, body, terrain, prediction, debris }
export function drawScene(ctx, cam, scene) {
  const { state, cfg, phase, body, terrain, prediction, debris } = scene;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cam.top, cam.width, cam.height);
  ctx.clip();
  drawBody(ctx, cam, body, terrain, state);
  if (phase === 'flying' && prediction) drawPrediction(ctx, cam, prediction, body);
  for (const d of debris || []) drawDebris(ctx, cam, d, cfg);
  drawCraft(ctx, cam, state, cfg, phase);
  if (phase === 'landed' || phase === 'crashed') drawOutcomeLabel(ctx, cam, state, cfg, phase);
  ctx.restore();
}

// Formats an altitude for a typewriter label.
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '---';
  const a = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (a < 10000) return `${sign}${a.toFixed(0)} M`;
  if (a < 100000) return `${sign}${(a / 1000).toFixed(1)} KM`;
  return `${sign}${(a / 1000).toFixed(0)} KM`;
}

// The Moon: its surface as one structure line following the terrain,
// diagonal hatching beneath it when close, stipple across the disc when far,
// basins circled with hatched rims, small crater rims ticked, the landing
// site bracketed and the pad with its gantry.
function drawBody(ctx, cam, body, terrain, state) {
  const R = body.radius;
  const s = cam.scale;
  const W = cam.width; const H = cam.height;
  const thetaC = Math.atan2(state.x, state.y);
  const diag = Math.hypot(W, H);
  const half = Math.min(Math.PI, (diag / s) / R + 0.002);
  const full = half >= Math.PI;
  let n = Math.ceil((2 * half) / (2 / (s * R)));
  n = Math.max(32, Math.min(3000, n));
  const dTheta = (2 * half) / n;
  const theta0 = full ? -Math.PI : thetaC - half;

  const surfaceAt = (theta) => {
    const r = R + terrain.height(theta * R);
    return cam.toScreen(Math.sin(theta) * r, Math.cos(theta) * r);
  };

  // Stipple inside the disc when the view is wide enough to read it as a
  // disc; fades out as the hatch band takes over close in.
  if (s < 0.5) drawStipple(ctx, cam, R, Math.min(1, (0.5 - s) / 0.25));

  // Surface polyline.
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const p = surfaceAt(theta0 + k * dTheta);
    if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  if (full) ctx.closePath();
  ctx.stroke();

  // Hatch band under the surface: 45-degree strokes between "down" and
  // "along", anchored to arc positions so they scroll with the ground.
  if (s >= 0.25) {
    const band = Math.min(48, Math.max(16, 4 * s));
    let spacing = 1;
    while (spacing * s < 10) spacing *= 2;
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.globalAlpha = Math.min(1, (s - 0.25) / 0.25);
    ctx.beginPath();
    const arc0 = Math.floor(((thetaC - half) * R) / spacing) * spacing;
    const arc1 = (thetaC + half) * R;
    for (let arc = arc0; arc <= arc1; arc += spacing) {
      const theta = arc / R;
      const p = surfaceAt(theta);
      if (p.x < -band || p.x > W + band || p.y < cam.top - band || p.y > cam.top + H + band) continue;
      const f = cam.frameAt(theta);
      const dx = (-f.up.x + f.along.x) * Math.SQRT1_2;
      const dy = (-f.up.y + f.along.y) * Math.SQRT1_2;
      ctx.moveTo(p.x - f.up.x, p.y - f.up.y);
      ctx.lineTo(p.x - f.up.x + dx * band, p.y - f.up.y + dy * band);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Basins: circled, with hatch ticks round the rim, labelled when readable.
  // Only from far enough out that the Moon reads as a disc; close in they
  // are dips in the surface line instead.
  const basinAlpha = Math.max(0, Math.min(1, (0.003 - s) / 0.001));
  for (const b of terrain.basins) {
    if (basinAlpha <= 0) break;
    const dArc = terrain.wrap(b.x - thetaC * R);
    if (!full && Math.abs(dArc) > half * R + b.r * 1.3) continue;
    const rp = b.r * s;
    if (rp < 3) continue;
    ctx.globalAlpha = basinAlpha;
    const theta = b.x / R;
    const p = surfaceAt(theta);
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rp, 0, Math.PI * 2);
    ctx.stroke();
    const ticks = Math.max(8, Math.min(36, Math.round(rp / 6)));
    const len = Math.min(6, rp / 3);
    ctx.beginPath();
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      ctx.moveTo(p.x + Math.cos(a) * rp, p.y + Math.sin(a) * rp);
      ctx.lineTo(p.x + Math.cos(a) * (rp - len), p.y + Math.sin(a) * (rp - len));
    }
    ctx.stroke();
    const alpha = labelAlpha(rp) * basinAlpha;
    if (alpha > 0) label(ctx, `CRATER R ${(b.r / 1000).toFixed(0)} KM`, p.x, p.y + rp + 14, 'center', BLUEPRINT.inkPale, alpha);
    ctx.globalAlpha = 1;
  }

  // Small crater rims: short radial ticks over the lip, a circled depth
  // annotation for craters wide enough to read.
  if (s >= 0.3) {
    const craters = terrain.craters;
    const arcA = (thetaC - half) * R; const arcB = (thetaC + half) * R;
    let i = lowerBound(craters, arcA - 30);
    ctx.strokeStyle = BLUEPRINT.ink;
    ctx.lineWidth = STROKE.annotation;
    for (; i < craters.length && craters[i].x <= arcB + 30; i++) {
      const c = craters[i];
      const rimPx = c.r * s;
      if (rimPx < 8) continue;
      const f = cam.frameAt(c.x / R);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const arc = c.x + side * c.r * 1.1;
        const p = surfaceAt(arc / R);
        const m = rimPx > 30 ? 3 : 2;
        for (let k = 0; k < m; k++) {
          const ox = side * k * 4;
          const bx = p.x + f.along.x * ox + f.up.x * 2; const by = p.y + f.along.y * ox + f.up.y * 2;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + f.along.x * side * 3 + f.up.x * 5, by + f.along.y * side * 3 + f.up.y * 5);
        }
      }
      ctx.stroke();
      const alpha = labelAlpha(rimPx * 2 - 100);
      if (alpha > 0) {
        const p = surfaceAt(c.x / R);
        label(ctx, `CRATER R ${c.r.toFixed(0)} M`, p.x - f.up.x * 60, p.y - f.up.y * 60, 'center', BLUEPRINT.ink, alpha);
      }
    }
  }

  // Landing site brackets, the pad and its gantry.
  if (s >= 0.08) {
    ctx.lineWidth = STROKE.annotation;
    ctx.strokeStyle = BLUEPRINT.ink;
    const site = terrain.site;
    for (const [arc, side] of [[site.from, 1], [site.to, -1]]) {
      const p = surfaceAt(arc / R);
      const f = cam.frameAt(arc / R);
      if (p.x < -20 || p.x > W + 20) continue;
      ctx.beginPath();
      ctx.moveTo(p.x + f.up.x * 10, p.y + f.up.y * 10);
      ctx.lineTo(p.x - f.up.x * 6, p.y - f.up.y * 6);
      ctx.moveTo(p.x + f.up.x * 10, p.y + f.up.y * 10);
      ctx.lineTo(p.x + f.up.x * 10 + f.along.x * side * 8, p.y + f.up.y * 10 + f.along.y * side * 8);
      ctx.stroke();
    }
    const mid = (site.from + site.to) / 2;
    const pm = surfaceAt(mid / R);
    const fm = cam.frameAt(mid / R);
    const alpha = labelAlpha((site.to - site.from) * s / 4);
    if (alpha > 0) label(ctx, 'SITE 1', pm.x - fm.up.x * 30, pm.y - fm.up.y * 30, 'center', BLUEPRINT.ink, alpha);
    // Gantry: a tower to the left of the pad, three ties, a service arm.
    const towerPx = 12 * s;
    if (towerPx >= 6) {
      const base = surfaceAt(-9 / R);
      const f = cam.frameAt(0);
      const at = (dx, dy) => ({ x: base.x + f.along.x * dx * s + f.up.x * dy * s, y: base.y + f.along.y * dx * s + f.up.y * dy * s });
      ctx.strokeStyle = BLUEPRINT.ink;
      ctx.lineWidth = STROKE.structure;
      ctx.beginPath();
      let a = at(-1, 0); ctx.moveTo(a.x, a.y); a = at(-1, 12); ctx.lineTo(a.x, a.y);
      a = at(1, 0); ctx.moveTo(a.x, a.y); a = at(1, 12); ctx.lineTo(a.x, a.y);
      a = at(-1, 12); ctx.moveTo(a.x, a.y); a = at(1, 12); ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.lineWidth = STROKE.annotation;
      ctx.beginPath();
      for (const h of [3, 6, 9]) { a = at(-1, h); ctx.moveTo(a.x, a.y); a = at(1, h + 1.5); ctx.lineTo(a.x, a.y); }
      a = at(1, 10); ctx.moveTo(a.x, a.y); a = at(6, 10); ctx.lineTo(a.x, a.y);
      a = at(-2, 0); ctx.moveTo(a.x, a.y); a = at(12, 0); ctx.lineTo(a.x, a.y);
      ctx.stroke();
      const la = labelAlpha(towerPx);
      if (la > 0) { a = at(0, 14); label(ctx, 'PAD 1', a.x, a.y, 'center', BLUEPRINT.ink, la); }
    }
  }

  // The body's centre, marked and named once the disc is small enough to read as one.
  const Rpx = R * s;
  if (Rpx < 0.6 * Math.max(W, H)) {
    const c = cam.toScreen(0, 0);
    const alpha = labelAlpha(Rpx / 3);
    if (alpha > 0) {
      ctx.strokeStyle = BLUEPRINT.inkPale;
      ctx.lineWidth = STROKE.annotation;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y);
      ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, `${body.name}  R ${(R / 1000).toFixed(0)} KM`, c.x, c.y + 18, 'center', BLUEPRINT.inkPale, alpha);
    }
  }
}

// Stipple across the disc: one dot per cell of a world-anchored grid, placed
// by a hash so it never twinkles, only inside the body and the view.
function drawStipple(ctx, cam, R, alpha) {
  const s = cam.scale;
  let cell = 1;
  while (cell * s < 13) cell *= 2;
  const corners = [cam.toWorld(0, cam.top), cam.toWorld(cam.width, cam.top), cam.toWorld(0, cam.top + cam.height), cam.toWorld(cam.width, cam.top + cam.height)];
  const minX = Math.max(-R, Math.min(...corners.map((c) => c.x)));
  const maxX = Math.min(R, Math.max(...corners.map((c) => c.x)));
  const minY = Math.max(-R, Math.min(...corners.map((c) => c.y)));
  const maxY = Math.min(R, Math.max(...corners.map((c) => c.y)));
  if (minX > maxX || minY > maxY) return;
  const i0 = Math.floor(minX / cell); const i1 = Math.ceil(maxX / cell);
  const j0 = Math.floor(minY / cell); const j1 = Math.ceil(maxY / cell);
  if ((i1 - i0) * (j1 - j0) > 40000) return;
  ctx.fillStyle = BLUEPRINT.inkPale;
  ctx.globalAlpha = 0.5 * alpha;
  const inner = (R - cell) * (R - cell);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const h = hash2(i, j);
      if ((h & 3) !== 0) continue; // one cell in four carries a dot
      const wx = (i + ((h >>> 8) & 255) / 256) * cell;
      const wy = (j + ((h >>> 16) & 255) / 256) * cell;
      if (wx * wx + wy * wy > inner) continue;
      const p = cam.toScreen(wx, wy);
      if (p.x < 0 || p.x > cam.width || p.y < cam.top || p.y > cam.top + cam.height) continue;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function hash2(i, j) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

function lowerBound(craters, arc) {
  let lo = 0; let hi = craters.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (craters[mid].x < arc) lo = mid + 1; else hi = mid; }
  return lo;
}

// Dashed coast path from the craft onward, the predicted impact circled and
// timed, apoapsis and periapsis as small circled markers with typewriter
// labels. Accent only when impact is under ten seconds.
function drawPrediction(ctx, cam, prediction, body) {
  const { points, impact, elements: el, closed } = prediction;
  if (points.length < 2) return;
  const critical = impact && impact.t < 10;
  ctx.strokeStyle = critical ? BLUEPRINT.accent : BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  let last = null;
  for (let i = 0; i < points.length; i++) {
    const p = cam.toScreen(points[i].x, points[i].y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 1.5) ctx.lineTo(p.x, p.y);
    else continue;
    last = p;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (impact) {
    const p = cam.toScreen(impact.x, impact.y);
    const colour = critical ? BLUEPRINT.accent : BLUEPRINT.inkPale;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y);
    ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x, p.y + 9);
    ctx.stroke();
    label(ctx, `T-${formatTime(impact.t)}  ${(-impact.vRadial).toFixed(0)} M/S`, p.x + 12, p.y - 6, 'left', colour);
  }
  // Markers only where the path really passes.
  const apOnPath = el.apoapsis && (closed || (impact && el.timeToAp < impact.t) || (!impact && !closed && el.timeToAp !== null));
  const peOnPath = el.peAlt > 0 && (closed || (!impact && el.timeToPe !== null));
  const eta = (t) => (t !== null && Number.isFinite(t) ? `  T-${formatTime(t)}` : '');
  if (apOnPath) drawMarker(ctx, cam, el.apoapsis, `AP ${formatDistance(el.apAlt)}${eta(el.timeToAp)}`, BLUEPRINT.ink);
  if (peOnPath) drawMarker(ctx, cam, el.periapsis, `PE ${formatDistance(el.peAlt)}${eta(el.timeToPe)}`, BLUEPRINT.ink);
}

function drawMarker(ctx, cam, at, text, colour) {
  const p = cam.toScreen(at.x, at.y);
  if (p.x < -40 || p.x > cam.width + 40 || p.y < cam.top - 40 || p.y > cam.top + cam.height + 40) return;
  const f = cam.frameAt(Math.atan2(at.x, at.y));
  ctx.strokeStyle = colour;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  const lx = p.x + f.up.x * 14; const ly = p.y + f.up.y * 14;
  ctx.beginPath(); ctx.moveTo(p.x + f.up.x * 4, p.y + f.up.y * 4); ctx.lineTo(lx, ly); ctx.stroke();
  label(ctx, text, lx + (f.up.x >= 0 ? 4 : -4), ly + 5, f.up.x >= 0 ? 'left' : 'right', colour);
}

export function formatTime(t) {
  if (t < 100) return `${t.toFixed(0)} S`;
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Typewriter label beside the craft once it is down. Accent only for a crash.
function drawOutcomeLabel(ctx, cam, s, cfg, phase) {
  const p = cam.toScreen(s.x, s.y);
  const f = cam.frameAt(Math.atan2(s.x, s.y));
  const crashed = phase === 'crashed';
  const colour = crashed ? BLUEPRINT.accent : BLUEPRINT.ink;
  const off = footHalfWidth(s, cfg) * cam.scale + 24;
  const x0 = p.x + f.along.x * (off - 24) + f.up.x * 2 * cam.scale;
  const y0 = p.y + f.along.y * (off - 24) + f.up.y * 2 * cam.scale;
  const x = p.x + f.along.x * off + f.up.x * 2 * cam.scale;
  const y = p.y + f.along.y * off + f.up.y * 2 * cam.scale;
  ctx.strokeStyle = colour;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  label(ctx, crashed ? 'IMPACT' : 'TOUCHDOWN', x + 4, y - 2, 'left', colour);
}

function label(ctx, text, x, y, align = 'left', colour = BLUEPRINT.ink, alpha = 1) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.font = `500 12px ${MONO}`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = align;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.globalAlpha = 1;
}

// --- Craft ------------------------------------------------------------------

// The craft at its position, turned by its heading relative to the camera.
// Below ten pixels tall it becomes a labelled symbol.
function drawCraft(ctx, cam, s, cfg, phase = 'flying') {
  const p = cam.toScreen(s.x, s.y);
  const hPx = craftHeight(s, cfg) * cam.scale;
  if (hPx < 10) { drawSymbol(ctx, cam, s, cfg, p); return; }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(s.angle - cam.rot);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  const k = cam.scale;
  if (s.thrust > 0 && phase === 'flying') {
    const st = activeStage(s, cfg);
    const bell = cfg.drawing === 'lander' ? 0.95 : st.radius * 0.8;
    drawFlame(ctx, k, s.thrust / st.maxThrust, s.time, bell, cfg.drawing === 'lander' ? 0.5 : 0.1);
  }
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  if (phase === 'crashed') ctx.setLineDash([3, 3]); // a broken drawing for a broken craft
  if (cfg.drawing === 'lander') drawLander(ctx, k, s, cfg);
  else drawRocketStack(ctx, k, s, cfg, s.stage, 0, BLUEPRINT.ink, STROKE.structure);
  ctx.setLineDash([]);
  ctx.restore();
}

// A dropped stage falling away, drawn lighter than the live craft.
function drawDebris(ctx, cam, d, cfg) {
  const p = cam.toScreen(d.x, d.y);
  const st = cfg.stages[d.stage];
  if (st.height * cam.scale < 6) return;
  if (p.x < -200 || p.x > cam.width + 200 || p.y < cam.top - 200 || p.y > cam.top + cam.height + 200) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(d.angle - cam.rot);
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  drawRocketStack(ctx, cam.scale, { stage: d.stage, fuel: 0 }, cfg, d.stage, d.stage, BLUEPRINT.inkPale, STROKE.annotation, true);
  ctx.restore();
}

function drawSymbol(ctx, cam, s, cfg, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(s.angle - cam.rot);
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.restore();
  label(ctx, cfg.name, p.x + 10, p.y + 5, 'left', BLUEPRINT.ink);
}

// Flame: white outline with a pale-cyan core; only its length changes with
// thrust. `w` is the bell's half width in metres, `y0` where it starts.
function drawFlame(ctx, k, f, time, w, y0) {
  const flicker = 1 + 0.06 * Math.sin(time * 37) + 0.04 * Math.sin(time * 59);
  const len = (1.2 + 7 * f) * flicker * (w / 0.95);
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  polyline(ctx, k, [[-w * 0.9, y0], [-w * 0.55, y0 - len * 0.45], [0, y0 - len], [w * 0.55, y0 - len * 0.45], [w * 0.9, y0]]);
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  polyline(ctx, k, [[-w * 0.4, y0], [0, y0 - len * 0.5], [w * 0.4, y0]]);
}

function polyline(ctx, k, pts, close = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, -y * k) : ctx.moveTo(x * k, -y * k)));
  if (close) ctx.closePath();
  ctx.stroke();
}

// Hatched fuel inside a tank rectangle (body space), level from the bottom.
function drawTank(ctx, k, x0, x1, y0, y1, frac) {
  ctx.lineWidth = STROKE.annotation;
  ctx.strokeStyle = BLUEPRINT.inkPale;
  polyline(ctx, k, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
  if (frac <= 0) return;
  const level = y0 + (y1 - y0) * Math.min(1, frac);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 * k, -level * k, (x1 - x0) * k, (level - y0) * k);
  ctx.clip();
  ctx.beginPath();
  const step = 4 / k; // 4 px hatch pitch in metres
  for (let x = x0 - (y1 - y0); x < x1; x += step) {
    ctx.moveTo(x * k, -y0 * k);
    ctx.lineTo((x + (y1 - y0)) * k, -y1 * k);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(x0 * k, -level * k); ctx.lineTo(x1 * k, -level * k); ctx.stroke();
}

// Cutaway lander in body space (metres, y up from the footpad plane).
// Structure strokes outline the stages, legs and bell; annotation strokes
// draw the inner tank, its hatched fuel level, windows and the stage division.
function drawLander(ctx, k, s, cfg) {
  const st = cfg.stages[0];
  const half = st.footHalfWidth;
  const path = (pts, close = true) => polyline(ctx, k, pts, close);
  const detailed = k >= 5; // inner drawing only when it can be read
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  // Descent stage: octagonal box, 1.3 to 3.6 m.
  path([[-2.4, 1.6], [-2.1, 1.3], [2.1, 1.3], [2.4, 1.6], [2.4, 3.3], [2.1, 3.6], [-2.1, 3.6], [-2.4, 3.3]]);
  // Ascent stage: cabin with a flat face and a domed top.
  path([[-1.5, 3.6], [1.5, 3.6], [1.5, 5.4], [1.0, 6.3], [0.3, 6.7], [-0.3, 6.7], [-1.0, 6.3], [-1.5, 5.4]]);
  // Engine bell.
  path([[-0.55, 1.3], [0.55, 1.3], [0.95, 0.5], [-0.95, 0.5]]);
  // Legs: primary strut from the box corner to the pad, secondary strut up
  // to the box, pad as a short line.
  for (const side of [-1, 1]) {
    path([[side * 2.4, 1.7], [side * half, 0]], false);
    path([[side * 2.4, 3.1], [side * (half - 0.9), 0.9]], false);
    path([[side * (half - 0.6), 0], [side * (half + 0.6), 0]], false);
  }
  const dash = ctx.getLineDash();
  ctx.setLineDash([]);
  if (detailed) {
    ctx.lineWidth = STROKE.annotation;
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.setLineDash([3, 3]);
    path([[-2.4, 3.6], [2.4, 3.6]], false);
    ctx.setLineDash([]);
    drawTank(ctx, k, -1.7, 1.7, 1.6, 3.3, s.fuel / st.fuelMass);
    // Feed line from tank to engine, two windows, an antenna.
    path([[0, 1.6], [0, 1.3]], false);
    path([[-1.1, 4.6], [-0.5, 4.6], [-0.5, 5.3], [-1.2, 5.3]]);
    path([[1.1, 4.6], [0.5, 4.6], [0.5, 5.3], [1.2, 5.3]]);
    path([[0.9, 6.3], [1.3, 7.2]], false);
    path([[1.05, 7.2], [1.55, 7.2]], false);
  }
  ctx.setLineDash(dash);
}

// The rocket as a stack of stages from `from` to the top, drawn with the
// base of stage `from` on the base plane. `stop` limits the stack (for a
// dropped stage drawn alone).
function drawRocketStack(ctx, k, s, cfg, from, stop, ink, weight, alone = false) {
  const top = alone ? stop : cfg.stages.length - 1;
  let y = 0;
  for (let i = from; i <= top; i++) {
    const st = cfg.stages[i];
    const frac = i === s.stage ? s.fuel / st.fuelMass : i > s.stage ? 1 : 0;
    ctx.strokeStyle = ink;
    ctx.lineWidth = weight;
    if (i === 0) drawFirstStage(ctx, k, st, y, frac, ink, weight);
    else drawSecondStage(ctx, k, st, y, frac, ink, weight, i === top);
    if (i < top) {
      // Interstage division.
      const dash = ctx.getLineDash();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = BLUEPRINT.inkPale;
      ctx.lineWidth = STROKE.annotation;
      polyline(ctx, k, [[-st.radius, y + st.height], [st.radius, y + st.height]]);
      ctx.setLineDash(dash);
    }
    y += st.height;
  }
}

// First stage: bell 0 to 0.9 m, tank body to 7.4 m, four fins (two seen) to
// the base plane, a hatched tank inside.
function drawFirstStage(ctx, k, st, y, frac, ink, weight) {
  const r = st.radius;
  const detailed = k >= 4;
  const path = (pts, close = true) => polyline(ctx, k, pts.map(([x, py]) => [x, py + y]), close);
  ctx.strokeStyle = ink;
  ctx.lineWidth = weight;
  path([[-r, 0.9], [r, 0.9], [r, st.height], [-r, st.height]]);
  path([[-0.5, 0.9], [0.5, 0.9], [0.8, 0.1], [-0.8, 0.1]]);
  for (const side of [-1, 1]) path([[side * r, 0.9], [side * st.footHalfWidth, 0], [side * r, 2.6]]);
  if (detailed) {
    drawTank(ctx, k, -r * 0.75, r * 0.75, 1.4, st.height - 0.5, frac);
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    path([[0, 1.4], [0, 0.9]], false);
    path([[-r, 3.0], [r, 3.0]], false);
  }
}

// Second stage: small bell, body, hatched tank; the capsule on top of the
// last stage, with window ticks.
function drawSecondStage(ctx, k, st, y, frac, ink, weight, capsule) {
  const r = st.radius;
  const detailed = k >= 4;
  const path = (pts, close = true) => polyline(ctx, k, pts.map(([x, py]) => [x, py + y]), close);
  const bodyTop = st.height - (capsule ? 2.0 : 0);
  ctx.strokeStyle = ink;
  ctx.lineWidth = weight;
  path([[-0.4, 0.6], [0.4, 0.6], [0.6, 0.05], [-0.6, 0.05]]);
  path([[-r, 0.6], [r, 0.6], [r, bodyTop], [-r, bodyTop]]);
  for (const side of [-1, 1]) path([[side * r, 0.6], [side * st.footHalfWidth, 0], [side * r, 1.6]]);
  if (capsule) path([[-r, bodyTop], [r, bodyTop], [0.3, st.height], [-0.3, st.height]]);
  if (detailed) {
    drawTank(ctx, k, -r * 0.7, r * 0.7, 1.0, bodyTop - 0.4, frac);
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    path([[0, 1.0], [0, 0.6]], false);
    if (capsule) {
      path([[-0.5, bodyTop + 0.5], [-0.2, bodyTop + 0.5], [-0.15, bodyTop + 1.0], [-0.45, bodyTop + 1.0]]);
      path([[0.5, bodyTop + 0.5], [0.2, bodyTop + 0.5], [0.15, bodyTop + 1.0], [0.45, bodyTop + 1.0]]);
    }
  }
}
