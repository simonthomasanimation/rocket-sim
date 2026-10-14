// Blueprint document: the flight view's paper. Prussian blue, white 8px grid,
// faint fold creases. Linework only, two stroke weights, no fills but hatching.

import { labelAlpha } from './camera.js';
import { craftHeight, footHalfWidth, activeStage, progradeAngle, canopyBloom } from '../core/craft.js';
import { BODIES, ESCAPE_RADIUS } from '../core/body.js';

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
// Depths of the strata lines drawn inside a body, metres.
export const STRATA = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
export const CHUTE_RADIUS = 7;   // canopy radius, metres
export const CHUTE_RISE = 14;    // canopy centre above the craft's top, metres
export const MONO = '"IBM Plex Mono", "Courier Prime", ui-monospace, Menlo, monospace';

// scene: { state, cfg, phase, body, terrain, prediction, debris, others, avoid, clock }
// others: [{ body, terrain, offset: { x, y } }] bodies drawn at an offset
// from the current body's centre (the Moon seen from Earth, and the reverse).
// avoid: [{ x, y, w, h }] screen rectangles taken by the sheet furniture
// (the Detail A inset, the title block) that edge pointers keep clear of.
export function drawScene(ctx, cam, scene) {
  const { state, cfg, phase, body, terrain, prediction, debris, others, avoid, clock } = scene;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cam.top, cam.width, cam.height);
  ctx.clip();
  for (const o of others || []) {
    const shifted = shiftedCamera(cam, o.offset.x, o.offset.y);
    drawBody(ctx, shifted, o.body, o.terrain, { x: state.x - o.offset.x, y: state.y - o.offset.y }, true);
  }
  drawBody(ctx, cam, body, terrain, state);
  if (others && others.length) drawBodyPaths(ctx, cam, body, others);
  // Pointers to the bodies that are off the sheet: the one the craft
  // orbits, and the others (the Moon from Earth's sphere, Earth from the Moon's).
  // No pointer to the body the craft is standing on or skimming: with the
  // ground within a sheet's height below, the altitude ruler says it all.
  // With the view dragged off the craft, the pointers start from the middle
  // of the sheet and one more points back to the craft.
  {
    const W = cam.width; const H = cam.height;
    const at = cam.toScreen(state.x, state.y);
    const craftOn = at.x > 0 && at.x < W && at.y > cam.top && at.y < cam.top + H;
    const craft = craftOn ? at : { x: W / 2, y: cam.top + H / 2 };
    // The altitude ruler's column counts as furniture too.
    const keepClear = [...(avoid || []), { x: 0, y: cam.top, w: 110, h: H }];
    if (!craftOn) drawEdgePointer(ctx, cam, { name: cfg.name, radius: 0 }, at, craft, Math.hypot(at.x - craft.x, at.y - craft.y) / cam.scale, { avoid: keepClear });
    const r = Math.hypot(state.x, state.y);
    const gr = terrain.groundRadiusAt(state.x, state.y);
    const ground = cam.toScreen((state.x / r) * gr, (state.y / r) * gr);
    // The ground reads as a horizon line only when the disc dwarfs the sheet.
    const horizon = body.radius * cam.scale > 4 * Math.max(cam.width, cam.height);
    const floorY = horizon && ground.y > cam.top && ground.y < cam.top + cam.height ? ground.y : Infinity;
    const opts = { avoid: keepClear, floorY };
    if ((r - gr) * cam.scale > cam.height) drawEdgePointer(ctx, cam, body, cam.toScreen(0, 0), craft, r, opts);
    for (const o of others || []) drawEdgePointer(ctx, cam, o.body, cam.toScreen(o.offset.x, o.offset.y), craft, Math.hypot(state.x - o.offset.x, state.y - o.offset.y), opts);
  }
  drawAltitudeRuler(ctx, cam, body, terrain, state);
  if (phase === 'flying' && prediction) drawPrediction(ctx, cam, prediction, body);
  for (const d of debris || []) drawDebris(ctx, cam, d, cfg);
  for (const d of debris || []) if (d.age < 1 && craftHeight(state, cfg) * cam.scale >= 10) drawSeparation(ctx, cam.toScreen(state.x, state.y), debrisTop(cam, d, cfg));
  drawCraft(ctx, cam, state, cfg, phase);
  if (phase === 'landed' || phase === 'crashed') drawOutcomeLabel(ctx, cam, state, cfg, phase);
  ctx.restore();
}

// A round number of metres that spans between 48 and 120 px at this zoom.
function niceStep(scale, minPx = 48, maxPx = 120) {
  let step = 1;
  const steps = [1, 2, 5];
  for (let mag = 1; mag <= 1e7; mag *= 10) {
    for (const f of steps) { step = f * mag; if (step * scale >= minPx) return step; }
  }
  return step;
}

// Scale bar, top left of the sheet: its label changes as the view zooms, so
// a change of zoom is never silent.
export function drawScaleBar(ctx, cam, x, y) {
  const step = niceStep(cam.scale, 48, 160);
  const px = step * cam.scale;
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y - 4); ctx.lineTo(x + 0.5, y + 4);
  ctx.moveTo(x, y + 0.5); ctx.lineTo(x + px, y + 0.5);
  ctx.moveTo(x + px + 0.5, y - 4); ctx.lineTo(x + px + 0.5, y + 4);
  ctx.moveTo(x + px / 2 + 0.5, y); ctx.lineTo(x + px / 2 + 0.5, y + 3);
  ctx.stroke();
  label(ctx, `SCALE ${formatDistance(step)}`, x, y - 4, 'left', BLUEPRINT.inkPale);
  const notes = [];
  if (cam.locked) notes.push('LOCKED ON THE CRAFT — L UNLOCKS');
  if (cam.isHeld && cam.isHeld()) notes.push('VIEW HELD — C CENTRES ON THE CRAFT, 0 RESETS THE ZOOM TOO');
  notes.forEach((n, i) => label(ctx, n, x, y + 16 + i * 14, 'left', BLUEPRINT.inkPale));
}

// Altitude ruler down the left edge: ticks in metres above the ground
// under the craft, scrolling as it climbs or sinks, spaced wider as the
// view zooms in. The ground tick is the heavy one.
function drawAltitudeRuler(ctx, cam, body, terrain, state) {
  const s = cam.scale;
  const r = Math.hypot(state.x, state.y);
  const alt = r - terrain.groundRadiusAt(state.x, state.y);
  if (alt > 60000 || alt * s > cam.height * 40) return;
  const craft = cam.toScreen(state.x, state.y);
  const groundY = craft.y + alt * s;           // the view is turned so up is up
  const x = 3 * 8;
  const top = cam.top + 13 * 8;
  const bottom = cam.top + cam.height - 8;
  if (groundY < top) return;
  const step = niceStep(s, 40, 100);
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, Math.min(bottom, groundY));
  ctx.stroke();
  for (let h = 0; ; h += step) {
    const y = groundY - h * s;
    if (y < top) break;
    if (y > bottom) continue;
    const major = h === 0;
    ctx.strokeStyle = major ? BLUEPRINT.ink : BLUEPRINT.inkPale;
    ctx.lineWidth = major ? STROKE.structure : STROKE.annotation;
    ctx.beginPath();
    ctx.moveTo(x - (major ? 8 : 4), Math.round(y) + 0.5); ctx.lineTo(x + (major ? 8 : 4), Math.round(y) + 0.5);
    ctx.stroke();
    label(ctx, major ? 'GROUND' : formatDistance(h), x + 10, y + 5, 'left', major ? BLUEPRINT.ink : BLUEPRINT.inkPale);
  }
  // The edge of the air, named after the programme.
  if (body.atmosphere) {
    const y = groundY - body.atmosphere.height * s;
    if (y > top && y < bottom && body.atmosphere.height * s > 60) {
      ctx.strokeStyle = BLUEPRINT.ink;
      ctx.lineWidth = STROKE.annotation;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x - 8, Math.round(y) + 0.5); ctx.lineTo(x + 56, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'KÁRMÁN LINE', x + 10, y - 3, 'left', BLUEPRINT.ink);
    }
  }
  // Below ground the ruler names the strata lines.
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x + 0.5, groundY); ctx.lineTo(x + 0.5, bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const d of STRATA) {
    const px = d * s;
    const y = groundY + px;
    if (px < 14 || y > bottom) continue;
    const alpha = Math.min(1, (px - 14) / 20);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x - 4, Math.round(y) + 0.5); ctx.lineTo(x + 4, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    label(ctx, `-${formatDistance(d)}`, x + 10, y + 5, 'left', BLUEPRINT.inkPale, alpha);
  }
}

// Detail inset: the vehicle full-frame in a boxed callout (an engineering
// "DETAIL A") whenever the main view draws it under 48 px tall, so its
// tilt, exhaust and remaining stages stay readable from any distance.
// The inset eases its framing so a dropped stage can slide into view.
const inset = { k: 0, offset: 0 };

export function drawDetail(ctx, cam, { state, cfg, phase, debris }, box) {
  const h = craftHeight(state, cfg);
  if (h * cam.scale >= 48) return;
  const tilt = state.angle - Math.atan2(state.x, state.y);
  const ax = Math.sin(state.angle); const ay = Math.cos(state.angle);
  // Frame the vehicle, and for a few seconds after staging the spent stage
  // behind it too (up to two and a half stage lengths back).
  let back = 0;
  for (const d of debris || []) {
    if (d.age >= 5) continue;
    const st = cfg.stages[d.stage];
    const b = -((d.x - state.x) * ax + (d.y - state.y) * ay);
    back = Math.max(back, Math.min(b, 2.5 * st.height));
  }
  // Framed on the whole vehicle as it left the pad (never less than 55 %
  // of it), so a stage that is left alone stays the size it was rather
  // than jumping up to fill the box.
  const whole = cfg.stages.reduce((sum, st) => sum + st.height, 0);
  // With the chute out, the canopy is part of the vehicle.
  const top = Math.max(h, canopyTop(state, h));
  const framed = Math.max(top, 0.55 * whole);
  const kTarget = (box.h * 0.6) / (framed + back);
  const offTarget = (top - back) / 2;        // metres from the base to the framed midpoint
  if (!inset.k) { inset.k = kTarget; inset.offset = offTarget; }
  inset.k += (kTarget - inset.k) * 0.12;
  inset.offset += (offTarget - inset.offset) * 0.12;
  const k = inset.k;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.52;
  const base = { x: cx - Math.sin(tilt) * inset.offset * k, y: cy + Math.cos(tilt) * inset.offset * k };
  const rot = Math.atan2(state.x, state.y);
  // The inset's own little camera: the craft's base at `base`, everything
  // else placed relative to it in metres.
  const mini = {
    scale: k, rot, width: box.w, height: box.h, top: box.y, left: box.x,
    toScreen: (wx, wy) => {
      const dx = wx - state.x; const dy = wy - state.y;
      const c = Math.cos(rot); const sn = Math.sin(rot);
      return { x: base.x + (dx * c - dy * sn) * k, y: base.y - (dx * sn + dy * c) * k };
    },
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = BLUEPRINT.paper;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = BLUEPRINT.ink;
  for (let x = box.x + 8; x < box.x + box.w; x += 8) ctx.fillRect(x, box.y, 1, box.h);
  for (let y = box.y + 8; y < box.y + box.h; y += 8) ctx.fillRect(box.x, y, box.w, 1);
  ctx.globalAlpha = 1;
  // Local horizon tick marks at the bottom corners so "up" is explicit.
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.moveTo(box.x + 8, box.y + box.h - 20); ctx.lineTo(box.x + 28, box.y + box.h - 20);
  ctx.moveTo(box.x + box.w - 8, box.y + box.h - 20); ctx.lineTo(box.x + box.w - 28, box.y + box.h - 20);
  ctx.stroke();
  // A stage dropped in the last few seconds falls away in the inset too.
  for (const d of debris || []) {
    if (d.age >= 5) continue;
    ctx.globalAlpha = Math.min(1, (5 - d.age) / 2);
    drawDebris(ctx, mini, d, cfg, true);
    if (d.age < 1) drawSeparation(ctx, base, debrisTop(mini, d, cfg));
    ctx.globalAlpha = 1;
  }
  drawCraft(ctx, mini, state, cfg, phase);
  ctx.restore();
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
  label(ctx, 'DETAIL A', box.x + 8, box.y + 16, 'left', BLUEPRINT.inkPale);
  label(ctx, `${cfg.name}  ${cfg.stages.length - state.stage} STG`, box.x + 8, box.y + box.h - 6, 'left', BLUEPRINT.ink);
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

// A camera whose world origin sits at an offset from the real one: used to
// draw a second body at its place relative to the current one.
function shiftedCamera(cam, ox, oy) {
  return {
    scale: cam.scale, rot: cam.rot, width: cam.width, height: cam.height, top: cam.top, left: cam.left || 0,
    toScreen: (wx, wy) => cam.toScreen(wx + ox, wy + oy),
    toScreenVec: cam.toScreenVec,
    toWorld: (sx, sy) => { const p = cam.toWorld(sx, sy); return { x: p.x - ox, y: p.y - oy }; },
    frameAt: cam.frameAt,
  };
}

// A body: its surface as one structure line following the terrain, diagonal
// hatching beneath it when close, stipple (Moon) or contour lines (Earth)
// when far, basins circled with hatched rims, small crater rims ticked, the
// landing site bracketed and the pad with its gantry. `far` is a body other
// than the one the craft orbits: drawn whole, without the ground furniture.
function drawBody(ctx, cam, body, terrain, state, far = false) {
  const R = body.radius;
  const s = cam.scale;
  const W = cam.width; const H = cam.height;
  const thetaC = Math.atan2(state.x, state.y);
  const diag = Math.hypot(W, H);
  const centre = cam.toScreen(0, 0);
  // The reach of the body's gravity: its sphere of influence as a dotted
  // ring, or, for the body at the top (Earth), the edge beyond which the
  // flight is lost, named as its SOI too. Drawn once the view is wide
  // enough for the ring to read as a ring (see drawReachRing), so the
  // planet-level view stays clean.
  if (Number.isFinite(body.soi)) drawReachRing(ctx, cam, centre, body.soi, `${body.name} SOI`);
  else if (!body.parent) drawReachRing(ctx, cam, centre, ESCAPE_RADIUS, `${body.name} SOI — EDGE OF ITS REACH ${formatDistance(ESCAPE_RADIUS)}, THE FLIGHT IS LOST BEYOND IT`);
  if (far) {
    // Off the sheet entirely, or too small to be more than a dot.
    const Rpx = R * s;
    if (centre.x < -Rpx - 40 || centre.x > W + Rpx + 40 || centre.y < cam.top - Rpx - 40 || centre.y > cam.top + H + Rpx + 40) return;
    if (Rpx < 2) {
      ctx.strokeStyle = BLUEPRINT.ink; ctx.lineWidth = STROKE.annotation;
      ctx.beginPath(); ctx.arc(centre.x, centre.y, 2.5, 0, Math.PI * 2); ctx.stroke();
      label(ctx, body.name, centre.x + 7, centre.y + 5, 'left', BLUEPRINT.inkPale);
      return;
    }
  }
  const half = far ? Math.PI : Math.min(Math.PI, (diag / s) / R + 0.002);
  const full = half >= Math.PI;
  if (!far && R * s < 12 && centre.x > -20 && centre.x < W + 20 && centre.y > cam.top - 20 && centre.y < cam.top + H + 20) {
    // The body the craft orbits, seen from far out: name it, it is only a dot.
    label(ctx, body.name, centre.x + 7, centre.y + 5, 'left', BLUEPRINT.inkPale);
  }
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
  const earth = body.texture === 'earth';
  if (s < 0.5 && !earth) drawStipple(ctx, cam, R, Math.min(1, (0.5 - s) / 0.25));

  // Heights along the drawn arc, sampled once for the surface line, the
  // contours and the water line.
  const hs = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) hs[k] = terrain.height((theta0 + k * dTheta) * R);
  const pointAt = (theta, r) => cam.toScreen(Math.sin(theta) * r, Math.cos(theta) * r);

  // Surface polyline.
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const p = pointAt(theta0 + k * dTheta, R + hs[k]);
    if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  if (full) ctx.closePath();
  ctx.stroke();

  // Atmosphere: a dashed ring at its top.
  if (body.atmosphere) {
    const ra = R + body.atmosphere.height;
    if (body.atmosphere.height * s >= 3) {
      ctx.strokeStyle = BLUEPRINT.inkPale;
      ctx.lineWidth = STROKE.annotation;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const m = Math.max(48, Math.min(1200, n));
      const dT = (2 * half) / m;
      for (let k = 0; k <= m; k++) {
        const th = theta0 + k * dT;
        const p = cam.toScreen(Math.sin(th) * ra, Math.cos(th) * ra);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      if (full) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      if (!far) {
        const p = cam.toScreen(Math.sin(thetaC) * ra, Math.cos(thetaC) * ra);
        const f = cam.frameAt(thetaC);
        if (p.y > cam.top && p.y < cam.top + H) label(ctx, `KÁRMÁN LINE ${formatDistance(body.atmosphere.height)} — AIR BELOW`, p.x + f.along.x * 60 + 4, p.y + f.along.y * 60 - 4, 'left', BLUEPRINT.inkPale, labelAlpha(body.atmosphere.height * s));
      }
    }
  }

  // Earth: contour lines across the land at round heights, the step picked
  // so neighbouring lines sit at least 7 px apart (a finer set fades in
  // between them as the view closes in); two dashed lines under the sea;
  // from orbit, where the relief is under a pixel, a band of coast-following
  // contours inside each landmass so land and sea still read; the highest
  // peak of each range and each sea labelled when there is room.
  if (earth) drawEarthFurniture(ctx, cam, body, terrain, hs, { n, theta0, dTheta, full, half, thetaC });

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

  // Strata: dashed depth lines inside the body, concentric with the
  // surface, at a fixed ladder of depths. They bunch up as the view zooms
  // out and spread as it zooms in, so the zoom is never silent. Labelled on
  // the altitude ruler (see drawAltitudeRuler).
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([3, 5]);
  const bottomPx = cam.top + H;
  for (const d of STRATA) {
    const px = d * s;
    if (px < 14 || d >= R) continue;
    const top = cam.toScreen(Math.sin(thetaC) * (R - d), Math.cos(thetaC) * (R - d));
    if (top.y > bottomPx + 20 && !full) continue;
    const m = Math.max(48, Math.min(600, n));
    const dT = (2 * half) / m;
    ctx.globalAlpha = Math.min(1, (px - 14) / 20) * 0.7;
    ctx.beginPath();
    for (let k = 0; k <= m; k++) {
      const th = theta0 + k * dT;
      const p = cam.toScreen(Math.sin(th) * (R - d), Math.cos(th) * (R - d));
      if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    if (full) ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Surface ticks: distance along the ground from the pad, at a round step,
  // so sideways motion and horizontal scale read at every zoom.
  if (!far && R * s >= 120) {
    const step = niceStep(s, 90, 220);
    const arc0 = Math.floor(((thetaC - half) * R) / step) * step;
    const arc1 = (thetaC + half) * R;
    const band = s >= 0.25 ? Math.min(48, Math.max(16, 4 * s)) : 0;
    ctx.strokeStyle = BLUEPRINT.ink;
    ctx.lineWidth = STROKE.annotation;
    const placed = []; // label spots taken: round the far side of a small
                       // body the ticks from both directions meet, and one
                       // label there is enough
    for (let arc = arc0; arc <= arc1; arc += step) {
      const wrapped = terrain.wrap(arc);
      const theta = wrapped / R;
      const p = surfaceAt(theta);
      if (p.x < -40 || p.x > W + 40 || p.y < cam.top - 20 || p.y > cam.top + H + 20) continue;
      const f = cam.frameAt(theta);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - f.up.x * 7, p.y - f.up.y * 7);
      ctx.stroke();
      const lx = p.x - f.up.x * (band + 14); const ly = p.y - f.up.y * (band + 14);
      if (lx < 120) continue; // the altitude ruler's column
      if (placed.some((q) => Math.hypot(q.x - lx, q.y - ly) < 56)) continue;
      placed.push({ x: lx, y: ly });
      label(ctx, Math.abs(wrapped) < 1 ? 'PAD' : formatDistance(wrapped), lx, ly + 5, 'center', BLUEPRINT.inkPale);
    }
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
  if (!far && s >= 0.08) {
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
// A ring of radius `radius` (m) round a centre on screen, dotted, with its
// label on the ring at the point nearest the middle of the sheet. Skipped
// when no part of it crosses the sheet, when it is too small to see, or
// when it is so much bigger than the sheet that it would cross it as a
// near-straight line: the rings of reach and the bodies' paths belong to
// the wide view, not to the planet-level one (owner's call, 14 Oct).
function drawReachRing(ctx, cam, centre, radius, text, dash = [2, 8]) {
  const rp = radius * cam.scale;
  if (rp < 4) return;
  const W = cam.width; const H = cam.height;
  if (rp > 1.5 * Math.hypot(W, H)) return;
  const mx = W / 2; const my = cam.top + H / 2;
  const d = Math.hypot(mx - centre.x, my - centre.y);
  const reach = Math.hypot(W, H) / 2;
  if (d > rp + reach || d < rp - reach) return; // the ring passes nowhere near the sheet
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash(dash);
  ctx.beginPath(); ctx.arc(centre.x, centre.y, rp, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Label: on the ring, towards the middle of the sheet (straight up from
  // the centre when the centre is the middle).
  const ux = d > 1 ? (mx - centre.x) / d : 0; const uy = d > 1 ? (my - centre.y) / d : -1;
  const px = centre.x + ux * rp; const py = centre.y + uy * rp;
  if (px < 60 || px > W - 60 || py < cam.top + 20 || py > cam.top + H - 20) return;
  label(ctx, text, px, py - 6 + (uy > 0 ? 18 : 0), 'center', BLUEPRINT.inkPale, labelAlpha(rp / 2));
}

// The paths of the other bodies round this one, as fine dotted rings: the
// Moon's orbit seen from Earth, and Earth's apparent path seen from the
// Moon. (A ghost of the body at the path's closest approach was tried and
// dropped: it looked too much like the body itself, owner's call, 14 Oct.)
function drawBodyPaths(ctx, cam, body, others) {
  const centre = cam.toScreen(0, 0);
  for (const o of others) {
    const child = o.body.parent === body.id;
    const ring = child ? o.body.orbitRadius : body.orbitRadius;
    if (!(ring > 0)) continue;
    drawReachRing(ctx, cam, centre, ring, child ? `${o.body.name}'S PATH` : `${o.body.name}'S PATH, SEEN FROM THE ${body.name}`, [1, 5]);
  }
}

// A pointer at the edge of the sheet towards a body that is off it: a
// short arrow along the direction from the craft, with the body's name and
// the distance to its centre, so a craft far out in space can always find
// the way home. Nothing is drawn while the body's disc is on the sheet.
// opts.avoid: rectangles of sheet furniture to keep clear of; opts.floorY:
// the ground line's screen y when it is on the sheet, which a pointer
// stays above so it never prints over the surface and its labels.
function drawEdgePointer(ctx, cam, body, centre, craft, distance, opts = {}) {
  const W = cam.width; const H = cam.height;
  const rp = body.radius * cam.scale;
  if (centre.x > -rp && centre.x < W + rp && centre.y > cam.top - rp && centre.y < cam.top + H + rp) return;
  const dx = centre.x - craft.x; const dy = centre.y - craft.y;
  const len = Math.hypot(dx, dy) || 1;
  let ux = dx / len; let uy = dy / len;
  // Where the ray from the craft leaves the sheet, inset from the edge.
  const inset = 28;
  const left = inset; const right = W - inset; const top = cam.top + inset;
  let bottom = cam.top + H - inset;
  let ox = craft.x; let oy = craft.y;
  // With the ground drawn as a horizon, a body below it gets its pointer
  // along the horizon instead of into the dirt, from a point above the line.
  if (Number.isFinite(opts.floorY) && opts.floorY - 44 < bottom) {
    bottom = opts.floorY - 44;
    if (oy > bottom) oy = bottom;
    if (uy > 0) { ux = Math.sign(ux) || 1; uy = 0; }
  }
  if (bottom <= top) return;
  let t = Infinity;
  if (ux > 0) t = Math.min(t, (right - ox) / ux); else if (ux < 0) t = Math.min(t, (left - ox) / ux);
  if (uy > 0) t = Math.min(t, (bottom - oy) / uy); else if (uy < 0) t = Math.min(t, (top - oy) / uy);
  if (!Number.isFinite(t) || t <= 0) return;
  let px = ox + ux * t; let py = oy + uy * t;
  // Keep clear of the furniture (the Detail A inset, the title block): slide
  // the tip the shortest way out of any rectangle it lands in, along the edge.
  for (const r of opts.avoid || []) {
    const pad = 10;
    if (px < r.x - pad || px > r.x + r.w + pad || py < r.y - pad || py > r.y + r.h + pad) continue;
    const ways = [];
    if (r.y - pad >= top) ways.push({ x: px, y: r.y - pad, d: py - (r.y - pad) });
    if (r.y + r.h + pad <= bottom) ways.push({ x: px, y: r.y + r.h + pad, d: r.y + r.h + pad - py });
    if (r.x - pad >= left) ways.push({ x: r.x - pad, y: py, d: px - (r.x - pad) });
    if (r.x + r.w + pad <= right) ways.push({ x: r.x + r.w + pad, y: py, d: r.x + r.w + pad - px });
    if (!ways.length) return;
    ways.sort((a, b) => a.d - b.d);
    px = ways[0].x; py = ways[0].y;
  }
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.moveTo(px - ux * 16, py - uy * 16); ctx.lineTo(px, py);
  ctx.moveTo(px, py); ctx.lineTo(px - ux * 7 - uy * 4, py - uy * 7 + ux * 4);
  ctx.moveTo(px, py); ctx.lineTo(px - ux * 7 + uy * 4, py - uy * 7 - ux * 4);
  ctx.stroke();
  const align = px > W * 0.66 ? 'right' : px < W * 0.33 ? 'left' : 'center';
  // The label sits beyond the tail of the arrow, above the shaft when the
  // arrow is level; either way it takes the first baseline whose box stays
  // off the furniture and on the sheet.
  const name = `${body.name} ${formatDistance(distance)}`;
  const lx = px - ux * 10;
  const lw = name.length * 7.3;
  const x0 = align === 'right' ? lx - lw : align === 'left' ? lx : lx - lw / 2;
  const level = Math.abs(uy) < 0.35;
  const options = level ? [py - 8, py + 18] : [py - uy * 22 + (uy < 0 ? 16 : 4), py + 18, py - 8];
  const clear = (y) => y - 10 >= cam.top && y + 3 <= cam.top + H
    && !(opts.avoid || []).some((r) => x0 < r.x + r.w && x0 + lw > r.x && y - 10 < r.y + r.h && y + 3 > r.y);
  const ly = options.find(clear) ?? options[0];
  label(ctx, name, lx, ly, align, BLUEPRINT.ink);
}

// Earth's ground furniture (see drawBody). `hs` holds the height at each of
// the n+1 samples from theta0, dTheta apart.
function drawEarthFurniture(ctx, cam, body, terrain, hs, { n, theta0, dTheta, full, half, thetaC }) {
  const R = body.radius;
  const s = cam.scale;
  const W = cam.width; const H = cam.height;
  const pointAt = (theta, r) => cam.toScreen(Math.sin(theta) * r, Math.cos(theta) * r);
  const onSheet = (p) => p.x > -40 && p.x < W + 40 && p.y > cam.top - 40 && p.y < cam.top + H + 40;
  ctx.lineWidth = STROKE.annotation;
  ctx.strokeStyle = BLUEPRINT.inkPale;

  // Contours: a level step from the ladder so that step * s >= 7 px, drawn
  // where the land is above the level, with the ends interpolated between
  // samples. The next finer step fades in as it reaches 3.5 px.
  const ladder = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  let hmin = Infinity; let hmax = 0;
  for (let k = 0; k <= n; k++) { if (hs[k] < hmin) hmin = hs[k]; if (hs[k] > hmax) hmax = hs[k]; }
  const contourAt = (level, alpha) => {
    if (alpha <= 0 || level > hmax) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k <= n; k++) {
      const above = hs[k] >= level;
      if (above && !pen) {
        // Rising edge: start where the ground crosses the level.
        let th = theta0 + k * dTheta;
        if (k > 0) { const t = (level - hs[k - 1]) / (hs[k] - hs[k - 1]); th = theta0 + (k - 1 + t) * dTheta; }
        const p = pointAt(th, R + level); ctx.moveTo(p.x, p.y); pen = true;
      } else if (!above && pen) {
        const t = (hs[k - 1] - level) / (hs[k - 1] - hs[k]);
        const p = pointAt(theta0 + (k - 1 + t) * dTheta, R + level); ctx.lineTo(p.x, p.y); pen = false;
      }
      if (above && pen && k > 0) { const p = pointAt(theta0 + k * dTheta, R + level); ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  let major = ladder.find((st) => st * s >= 7) || null;
  if (major) {
    const minor = ladder[ladder.indexOf(major) - 1];
    const lo = Math.max(major, Math.floor(hmin / major) * major);
    for (let level = lo; level <= hmax; level += major) contourAt(level, Math.min(1, (major * s - 7) / 5));
    if (minor && minor * s >= 3.5) {
      const alpha = Math.min(1, (minor * s - 3.5) / 3.5) * 0.7;
      const lo2 = Math.max(minor, Math.floor(hmin / minor) * minor);
      for (let level = lo2; level <= hmax; level += minor) if (level % major !== 0) contourAt(level, alpha);
    }
  }

  // Water: two dashed lines just under the sea surface, the draughtsman's
  // ripple, as soon as the sea is wide enough to hold a dash.
  if (s >= 0.004) {
    const off = Math.min(6, Math.max(3, 2 * s)) / s;
    ctx.setLineDash([6, 6]);
    for (const [depth, dashShift] of [[off, 0], [off * 2.2, 6]]) {
      ctx.lineDashOffset = dashShift;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= n; k++) {
        if (hs[k] <= 0.01) {
          const p = pointAt(theta0 + k * dTheta, R - depth);
          if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          pen = true;
        } else pen = false;
      }
      ctx.stroke();
    }
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
  }

  // Coast band from orbit: for each run of land, nested arcs 6 px apart
  // inside the surface, each one drawn back 7 px from the ends of the one
  // outside it, so a landmass reads like an island on a chart.
  const bandAlpha = Math.max(0, Math.min(1, (0.004 - s) / 0.002));
  if (bandAlpha > 0) {
    ctx.globalAlpha = bandAlpha;
    const runs = [];
    let start = -1;
    for (let k = 0; k <= n; k++) {
      const land = hs[k] > 0.01;
      if (land && start < 0) start = k;
      if ((!land || k === n) && start >= 0) { runs.push([start, land ? k : k - 1]); start = -1; }
    }
    // On a full disc a run may wrap across the seam: join the first and last.
    if (full && runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === n) {
      const last = runs.pop(); runs[0] = [last[0] - n, runs[0][1]];
    }
    const pxPerSample = dTheta * R * s;
    ctx.beginPath();
    for (const [a, b] of runs) {
      const widthPx = (b - a) * pxPerSample;
      if (widthPx < 4) continue;
      const lines = Math.min(4, Math.floor(widthPx / 14));
      for (let i = 1; i <= lines; i++) {
        const inset = (7 * i) / pxPerSample;
        const ka = a + inset; const kb = b - inset;
        if (kb <= ka) break;
        const r = R - (6 * i) / s;
        const steps = Math.max(2, Math.ceil(kb - ka));
        for (let j = 0; j <= steps; j++) {
          const k = ka + (kb - ka) * (j / steps);
          const p = pointAt(theta0 + k * dTheta, r);
          if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Labels: the peak of each range (with a tick down from it) once the
  // range is tall on the sheet, and each sea once it is wide enough.
  const visible = (arc) => full || Math.abs(terrain.wrap(arc - thetaC * R)) < half * R;
  for (const peak of terrain.peaks || []) {
    if (!visible(peak.x)) continue;
    const alpha = labelAlpha(peak.h * s * 2);
    if (alpha <= 0) continue;
    const theta = peak.x / R;
    const p = pointAt(theta, R + peak.h);
    if (!onSheet(p)) continue;
    const f = cam.frameAt(theta);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(p.x + f.up.x * 4, p.y + f.up.y * 4);
    ctx.lineTo(p.x + f.up.x * 16, p.y + f.up.y * 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    label(ctx, `PEAK ${(peak.h / 1000).toFixed(1)} KM`, p.x + f.up.x * 22, p.y + f.up.y * 22 + 5, 'center', BLUEPRINT.inkPale, alpha);
  }
  // A sea is labelled at its middle, or at the nearest point of it that is
  // on the sheet when the middle is not (a coast seen from the land).
  for (const sea of terrain.seas || []) {
    const alpha = labelAlpha(sea.w * s / 6);
    if (alpha <= 0) continue;
    const margin = Math.min(sea.w * 0.4, 60 / s);
    const window = full ? Math.PI * R : half * R * 0.85;
    let arc = terrain.wrap(sea.x - thetaC * R); // relative to the craft
    if (!full) {
      if (arc - sea.w / 2 + margin > window || arc + sea.w / 2 - margin < -window) continue;
      arc = Math.max(-window, Math.min(window, arc));
      arc = Math.max(terrain.wrap(sea.x - thetaC * R) - sea.w / 2 + margin, Math.min(terrain.wrap(sea.x - thetaC * R) + sea.w / 2 - margin, arc));
    }
    const theta = thetaC + arc / R;
    const inset = Math.min(28 / s, R / 4);
    const p = pointAt(theta, R - inset);
    if (!onSheet(p)) continue;
    label(ctx, 'SEA', p.x, p.y + 5, 'center', BLUEPRINT.inkPale, alpha * 0.8);
  }
}

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
  const { points, segments, impact, elements: el, closed } = prediction;
  if (points.length < 2) return;
  const critical = impact && impact.t < 10;
  // Each segment is in its own body's frame; its offset places it on the
  // starting frame (where that body sits at the time the segment begins).
  const segs = segments || [{ body: body.id, from: 0, offset: { x: 0, y: 0 } }];
  ctx.strokeStyle = critical ? BLUEPRINT.accent : BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([4, 4]);
  // One stroke per segment, each later one fainter: after a change of
  // sphere the path is further off in time and less certain, and when
  // several loops lie over each other the fading says which comes first.
  for (let k = 0; k < segs.length; k++) {
    const from = segs[k].from; const to = k + 1 < segs.length ? segs[k + 1].from : points.length;
    const o = segs[k].offset;
    ctx.globalAlpha = Math.max(0.3, 1 - 0.3 * k);
    ctx.beginPath();
    let last = null;
    for (let i = from; i < to; i++) {
      const p = cam.toScreen(points[i].x + o.x, points[i].y + o.y);
      if (i === from) ctx.moveTo(p.x, p.y);
      else if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 1.5) ctx.lineTo(p.x, p.y);
      else continue;
      last = p;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  // Ghosts of the other bodies where the path meets them, and the
  // encounter and exit markers (accent dot: a marker, per the brief).
  for (let k = 1; k < segs.length; k++) {
    const sg = segs[k];
    const b = BODIES[sg.body];
    if (!b || sg.body === body.id) continue;
    const c = cam.toScreen(sg.offset.x, sg.offset.y);
    // Even when the body is a dot at this zoom the ghost gets a disc and a
    // name: without them the path's loop round the body reads as a knot.
    const rp = Math.max(3, b.radius * cam.scale);
    if (rp < 4000 && c.x > -40 && c.x < cam.width + 40 && c.y > cam.top - 40 && c.y < cam.top + cam.height + 40) {
      ctx.strokeStyle = BLUEPRINT.inkPale;
      ctx.lineWidth = STROKE.annotation;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, rp, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `${b.name} WILL BE HERE AT T-${formatTime(sg.t)}`, c.x, c.y + rp + 14, 'center', BLUEPRINT.inkPale);
    }
  }
  if (prediction.encounter) {
    const e = prediction.encounter;
    const sg = segs[e.seg] || segs[segs.length - 1];
    const p = cam.toScreen(e.x + sg.offset.x, e.y + sg.offset.y);
    ctx.fillStyle = BLUEPRINT.accent;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    label(ctx, `${BODIES[e.body].name} SOI T-${formatTime(e.t)}`, p.x + 8, p.y - 4, 'left', BLUEPRINT.ink);
  }
  if (prediction.exit) {
    const e = prediction.exit;
    const sg = segs[e.seg] || segs[0];
    const p = cam.toScreen(e.x + sg.offset.x, e.y + sg.offset.y);
    ctx.fillStyle = BLUEPRINT.accent;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    label(ctx, `LEAVING ${BODIES[e.body].name} SOI T-${formatTime(e.t)}`, p.x + 8, p.y - 4, 'left', BLUEPRINT.ink);
  }
  if (impact) {
    const so = (segs[impact.seg] || segs[0]).offset;
    const p = cam.toScreen(impact.x + so.x, impact.y + so.y);
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
  // Where the path ends without landing or closing: leaving Earth's reach
  // (a warning), or simply where the prediction stopped looking.
  if (!impact && !closed && points.length > 1) {
    const sg = segs[segs.length - 1];
    const q = points[points.length - 1];
    const p = cam.toScreen(q.x + sg.offset.x, q.y + sg.offset.y);
    if (p.x > -40 && p.x < cam.width + 40 && p.y > cam.top - 40 && p.y < cam.top + cam.height + 40) {
      const colour = prediction.escaped ? BLUEPRINT.accent : BLUEPRINT.inkPale;
      ctx.strokeStyle = colour; ctx.lineWidth = STROKE.annotation;
      ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5); ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5); ctx.stroke();
      label(ctx, prediction.escaped ? `LEAVES ${BODIES[sg.body].name.toUpperCase()}'S REACH T-${formatTime(q.t)} — FLIGHT LOST` : `PREDICTION ENDS T-${formatTime(q.t)}`, p.x + 9, p.y - 4, 'left', colour);
    }
  }
  if (prediction.entry) {
    const e = prediction.entry;
    const eo = (segs[e.seg] || segs[0]).offset;
    const p = cam.toScreen(e.x + eo.x, e.y + eo.y);
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5);
    ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5);
    ctx.stroke();
    label(ctx, `ENTRY T-${formatTime(e.t)}`, p.x + 9, p.y - 4, 'left', BLUEPRINT.inkPale);
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
  if (t < 3600) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  if (t < 48 * 3600) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t - h * 3600) / 60);
    return `${h}H ${String(m).padStart(2, '0')}M`;
  }
  const d = Math.floor(t / 86400);
  const h = Math.floor((t - d * 86400) / 3600);
  return `${d}D ${String(h).padStart(2, '0')}H`;
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
  label(ctx, s.broken ? 'BREAK-UP' : crashed ? 'IMPACT' : 'TOUCHDOWN', x + 4, y - 2, 'left', colour);
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
  if (s.broken) {
    // The pieces are debris now; here only the point where it came apart.
    drawBreakUp(ctx, k, s, cfg);
    ctx.restore();
    return;
  }
  if (phase === 'flying' && s.heat > 0.03) drawPlasma(ctx, k, s, cfg);
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  if (phase === 'crashed') ctx.setLineDash([3, 3]); // a broken drawing for a broken craft
  if (cfg.drawing === 'lander') drawLander(ctx, k, s, cfg);
  else drawRocketStack(ctx, k, s, cfg, s.stage, 0, BLUEPRINT.ink, STROKE.structure);
  ctx.setLineDash([]);
  if (phase === 'flying' && s.heat > 0.08) drawHullHeat(ctx, k, s, cfg);
  if (s.chute) drawChute(ctx, k, s, cfg);
  ctx.restore();
}

// The hull itself heating: cross-hatching on the face that meets the air
// (the base when flying shield-first, the nose otherwise), from a few
// strokes at a tenth of the limit to a dense band near it; accent from
// 80 %, when it is a warning.
function drawHullHeat(ctx, k, s, cfg) {
  const h = craftHeight(s, cfg);
  const st = activeStage(s, cfg);
  const r = st.radius || 2.4;
  const heat = Math.min(1, s.heat);
  let off = progradeAngle(s) - s.angle;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  const noseFirst = Math.abs(off) < Math.PI / 2;
  // A band of diagonal hatching across the hull at the end meeting the
  // air, growing up the hull and tightening as the heat climbs.
  const skirt = noseFirst ? 0 : Math.min(0.6, h * 0.1);
  const band = h * (0.18 + 0.5 * heat);
  const y0 = noseFirst ? h - band : skirt;
  const count = 1 + Math.round(heat * 14);
  const gap = band / count;
  const wobble = 1 + 0.08 * Math.sin(s.time * 19);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-r * k, -(y0 + band) * k, 2 * r * k, band * k);
  ctx.clip();
  ctx.strokeStyle = heat >= 0.8 ? BLUEPRINT.accent : BLUEPRINT.ink;
  ctx.lineWidth = heat >= 0.5 ? STROKE.structure : STROKE.annotation;
  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const y = y0 + (i + 0.5) * gap * wobble;
    ctx.moveTo(-r * k, -(y - r * 0.6) * k);
    ctx.lineTo(r * k, -(y + r * 0.6) * k);
  }
  ctx.stroke();
  ctx.restore();
}

// Where the craft came apart: a burst of short accent strokes.
function drawBreakUp(ctx, k, s, cfg) {
  const r = (activeStage(s, cfg).radius || 2.4) * 2.5;
  ctx.strokeStyle = BLUEPRINT.accent;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const inner = r * (0.4 + 0.3 * ((i * 0.618) % 1));
    ctx.moveTo(Math.cos(a) * inner * k, Math.sin(a) * inner * k);
    ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  ctx.stroke();
}

// Entry heating: short strokes streaming back from the base, more and
// longer as the heat climbs; accent only when it is near the limit.
function drawPlasma(ctx, k, s, cfg) {
  const st = activeStage(s, cfg);
  const w = (st.radius || 2.4) * 1.3;
  const n = 4 + Math.round(Math.min(1, s.heat) * 10);
  const len = (1 + 6 * Math.min(1, s.heat)) * w;
  ctx.strokeStyle = s.heat >= 0.8 ? BLUEPRINT.accent : BLUEPRINT.ink;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = -w + (2 * w * (i + 0.5)) / n;
    const flick = 0.7 + 0.3 * Math.abs(Math.sin(s.time * 23 + i * 1.7));
    ctx.moveTo(x * k, -0.1 * k);
    ctx.lineTo(x * 1.4 * k, len * flick * k);
  }
  ctx.stroke();
}

// The drogue: a small canopy on a long line; the main: reefed, a narrow
// cone, blooming to the full arc. Each as width and height factors of the
// full main, and the line length as a factor of CHUTE_RISE.
function canopyShape(s) {
  if (s.chute === 3) return { w: 0.3, hgt: 0.3, rise: 1.7 };
  const b = canopyBloom(s);
  return { w: 0.3 + 0.7 * b, hgt: 0.7 + 0.3 * b, rise: 1 };
}
// Height of the highest point of the canopy above the craft's base plane.
function canopyTop(s, h) {
  if (!s.chute || s.chute === 2) return h;
  const c = canopyShape(s);
  return h + CHUTE_RISE * c.rise + CHUTE_RADIUS * c.hgt;
}

// The parachute above the capsule: canopy as an arc with gore lines and
// shrouds to the craft's top; torn, only a few loose lines remain.
function drawChute(ctx, k, s, cfg) {
  const h = craftHeight(s, cfg);
  const top = h;
  if (s.chute === 2) {
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    for (const dx of [-0.5, 0.2, 0.6]) { ctx.moveTo(dx * k, -top * k); ctx.lineTo((dx * 2) * k, -(top + 3) * k); }
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const c = canopyShape(s);
  const rw = CHUTE_RADIUS * c.w;   // half-width of the canopy
  const rh = CHUTE_RADIUS * c.hgt; // its height above the skirt
  const cy = top + CHUTE_RISE * c.rise; // skirt line above the base plane
  const gores = s.chute === 3 ? 3 : 6;
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.ellipse(0, -cy * k, rw * k, rh * k, 0, Math.PI, 2 * Math.PI);
  ctx.lineTo(-rw * k, -cy * k);
  ctx.stroke();
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  for (let i = 1; i < gores; i++) {
    const a = Math.PI + (i / gores) * Math.PI;
    ctx.moveTo(0, -(cy - rh * 0.2) * k);
    ctx.lineTo(Math.cos(a) * rw * k, -(cy - Math.sin(a) * rh) * k);
  }
  const shrouds = s.chute === 3 ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1];
  for (const f of shrouds) { ctx.moveTo(f * rw * k, -cy * k); ctx.lineTo(0, -top * k); }
  ctx.stroke();
}

// The capsule alone: a truncated cone on a heat shield (the heavy arc
// under the base), a window, no engine.
function drawCapsule(ctx, k, st, y, ink, weight) {
  const r = st.radius;
  const path = (pts, close = true) => polyline(ctx, k, pts.map(([x, py]) => [x, py + y]), close);
  ctx.strokeStyle = ink;
  ctx.lineWidth = weight;
  path([[-r, 0.35], [r, 0.35], [0.35, st.height], [-0.35, st.height]]);
  // Shield: a shallow arc below the base, drawn heavier.
  ctx.lineWidth = weight * 1.6;
  ctx.beginPath();
  ctx.moveTo(-r * k, -(y + 0.35) * k);
  ctx.quadraticCurveTo(0, -(y - 0.25) * k, r * k, -(y + 0.35) * k);
  ctx.stroke();
  ctx.lineWidth = weight;
  if (k >= 4) {
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    path([[0.25, st.height * 0.55], [0.55, st.height * 0.55], [0.5, st.height * 0.72], [0.3, st.height * 0.72]]);
    path([[-r * 0.8, 0.9], [r * 0.8, 0.9]], false);
  }
}

// Screen position of a dropped stage's top end.
function debrisTop(cam, d, cfg) {
  const h = cfg.stages[d.stage].height;
  return cam.toScreen(d.x + Math.sin(d.angle) * h, d.y + Math.cos(d.angle) * h);
}

// The brief's dashed separation line between the craft and the stage it
// has just dropped, for the first second.
function drawSeparation(ctx, a, b) {
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

// A dropped stage falling away, drawn lighter than the live craft.
function drawDebris(ctx, cam, d, cfg, inset = false) {
  const p = cam.toScreen(d.x, d.y);
  const st = cfg.stages[d.stage];
  if (st.height * cam.scale < 6) return;
  const margin = inset ? 0 : 200;
  const left = cam.left || 0;
  if (p.x < left - margin || p.x > left + cam.width + margin || p.y < cam.top - margin || p.y > cam.top + cam.height + margin) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(d.angle - cam.rot);
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  if (d.broken) ctx.setLineDash([3, 3]); // torn pieces
  drawRocketStack(ctx, cam.scale, { stage: d.stage, fuel: 0 }, cfg, d.stage, d.stage, BLUEPRINT.inkPale, STROKE.annotation, true);
  ctx.setLineDash([]);
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
    else if (!st.maxThrust) drawCapsule(ctx, k, st, y, ink, weight);
    else drawSecondStage(ctx, k, st, y, frac, ink, weight, i === top && st.capsule);
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
