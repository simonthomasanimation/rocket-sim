// Blueprint document: the flight view's paper. Prussian blue, white 8px grid,
// faint fold creases. Linework only, two stroke weights, no fills but hatching.

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

// scene: { state, cfg, phase, terrain, prediction }
export function drawScene(ctx, cam, scene) {
  const { state, cfg, phase, terrain, prediction } = scene;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cam.top, cam.width, cam.height);
  ctx.clip();
  drawGround(ctx, cam, terrain);
  if (phase === 'flying' && prediction) drawPrediction(ctx, cam, prediction, cfg);
  drawLander(ctx, cam, state, cfg, phase);
  if (phase === 'landed' || phase === 'crashed') drawOutcomeLabel(ctx, cam, state, cfg, phase);
  ctx.restore();
}

// Horizon: the surface as one structure line following the terrain, a band
// of diagonal hatching beneath it anchored to world x so it scrolls with the
// ground, crater rims ticked, and the landing site bracketed and labelled.
function drawGround(ctx, cam, terrain) {
  const bottom = cam.top + cam.height;
  const left = cam.toWorld(0, 0).x;
  const right = cam.toWorld(cam.width, 0).x;
  const groundTopScreen = cam.toScreen(0, 0).y; // datum; terrain stays within a few metres of it
  if (groundTopScreen < cam.top - 40 * cam.scale) return; // ground far below the view

  // Surface polyline, sampled every 2 px.
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let sx = 0; sx <= cam.width + 2; sx += 2) {
    const wx = left + (right - left) * (sx / cam.width);
    const p = cam.toScreen(wx, terrain.height(wx));
    if (sx === 0) ctx.moveTo(sx, p.y); else ctx.lineTo(sx, p.y);
  }
  ctx.stroke();

  // Hatch band: 45-degree strokes, world-anchored spacing never under 10 px.
  const band = Math.min(48, Math.max(16, 4 * cam.scale));
  let spacing = 1;
  while (spacing * cam.scale < 10) spacing *= 2;
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  const startX = Math.floor((left - band / cam.scale) / spacing) * spacing;
  for (let wx = startX; wx <= right; wx += spacing) {
    const p = cam.toScreen(wx, terrain.height(wx));
    if (p.y > bottom) continue;
    ctx.moveTo(p.x, p.y + 1);
    ctx.lineTo(p.x + band, Math.min(bottom + 1, p.y + 1 + band));
  }
  ctx.stroke();

  // Crater rims: short radial ticks over the lip, a circled depth annotation
  // for craters wide enough to read.
  ctx.strokeStyle = BLUEPRINT.ink;
  for (const c of terrain.craters) {
    if (c.x + c.r * 1.3 < left || c.x - c.r * 1.3 > right) continue;
    const rimPx = c.r * cam.scale;
    if (rimPx < 8) continue;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const rx = c.x + side * c.r * 1.1;
      const p = cam.toScreen(rx, terrain.height(rx));
      const n = rimPx > 30 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const t = p.x + side * i * 4;
        ctx.moveTo(t, p.y - 2);
        ctx.lineTo(t + side * 3, p.y - 7);
      }
    }
    ctx.stroke();
    if (rimPx > 60) {
      const p = cam.toScreen(c.x, terrain.height(c.x));
      label(ctx, `CRATER R ${c.r.toFixed(0)} M`, p.x, p.y + band + 14, 'center');
    }
  }

  // Landing site brackets.
  const siteY = (x) => cam.toScreen(x, terrain.height(x)).y;
  for (const [wx, side] of [[terrain.site.from, 1], [terrain.site.to, -1]]) {
    if (wx < left - 5 || wx > right + 5) continue;
    const p = cam.toScreen(wx, 0);
    const y = siteY(wx);
    ctx.lineWidth = STROKE.annotation;
    ctx.strokeStyle = BLUEPRINT.ink;
    ctx.beginPath();
    ctx.moveTo(p.x + 0.5, y - 10);
    ctx.lineTo(p.x + 0.5, y + 6);
    ctx.moveTo(p.x + 0.5, y - 10);
    ctx.lineTo(p.x + 0.5 + side * 8, y - 10);
    ctx.stroke();
  }
  const siteMid = (terrain.site.from + terrain.site.to) / 2;
  if (siteMid > left && siteMid < right) {
    const p = cam.toScreen(siteMid, 0);
    label(ctx, 'SITE 1', p.x, siteY(siteMid) + band + 14, 'center');
  }
}

// Dashed ballistic path from the craft to the ground with the predicted
// impact circled and timed. Accent only when impact is under ten seconds.
function drawPrediction(ctx, cam, prediction, cfg) {
  const { points, impact } = prediction;
  if (points.length < 2) return;
  const critical = impact && impact.t < 10;
  ctx.strokeStyle = critical ? BLUEPRINT.accent : BLUEPRINT.inkPale;
  ctx.lineWidth = STROKE.annotation;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  points.forEach((pt, i) => {
    const p = cam.toScreen(pt.x, pt.y);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  if (impact) {
    const p = cam.toScreen(impact.x, impact.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y);
    ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x, p.y + 9);
    ctx.stroke();
    label(ctx, `T-${impact.t.toFixed(0)} S  ${(-impact.vy).toFixed(0)} M/S`, p.x + 12, p.y - 6, 'left',
      critical ? BLUEPRINT.accent : BLUEPRINT.inkPale);
  }
}

// Typewriter label beside the craft once it is down. Accent only for a crash.
function drawOutcomeLabel(ctx, cam, s, cfg, phase) {
  const p = cam.toScreen(s.x, s.y);
  const crashed = phase === 'crashed';
  const colour = crashed ? BLUEPRINT.accent : BLUEPRINT.ink;
  const x0 = Math.round(p.x + cfg.footHalfWidth * cam.scale);
  const x = x0 + 24;
  const y = Math.round(p.y - 2 * cam.scale);
  ctx.strokeStyle = colour;
  ctx.lineWidth = STROKE.annotation;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y + 0.5);
  ctx.lineTo(x + 0.5, y + 0.5);
  ctx.stroke();
  label(ctx, crashed ? 'IMPACT' : 'TOUCHDOWN', x + 4, y - 2, 'left', colour);
}

function label(ctx, text, x, y, align = 'left', colour = BLUEPRINT.ink) {
  ctx.fillStyle = colour;
  ctx.font = `500 12px ${MONO}`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = align;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

// Cutaway lander in body space (metres, y up from the footpad plane),
// rotated by the tilt about the footpad centre. Structure strokes outline the
// stages, legs and bell; annotation strokes draw the inner tank, its hatched
// fuel level, windows and the stage division. The flame is white with a
// pale-cyan core and only its length changes with thrust.
function drawLander(ctx, cam, s, cfg, phase = 'flying') {
  const p = cam.toScreen(s.x, s.y);
  const k = cam.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(s.angle);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  const M = (m) => m * k;
  const path = (pts, close = true) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(M(x), -M(y)) : ctx.moveTo(M(x), -M(y))));
    if (close) ctx.closePath();
  };
  const detailed = k >= 5; // inner drawing only when it can be read

  // Flame first so the bell overlaps it.
  if (s.thrust > 0 && phase === 'flying') {
    const f = s.thrust / cfg.maxThrust;
    const flicker = 1 + 0.06 * Math.sin(s.time * 37) + 0.04 * Math.sin(s.time * 59);
    const len = (1.2 + 7 * f) * flicker;
    ctx.strokeStyle = BLUEPRINT.ink;
    ctx.lineWidth = STROKE.structure;
    path([[-0.85, 0.5], [-0.5, -len * 0.45], [0, -len], [0.5, -len * 0.45], [0.85, 0.5]], false);
    ctx.stroke();
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    path([[-0.4, 0.5], [0, -len * 0.5], [0.4, 0.5]], false);
    ctx.stroke();
  }

  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  if (phase === 'crashed') ctx.setLineDash([3, 3]); // a broken drawing for a broken craft

  // Descent stage: octagonal box, 1.3 to 3.6 m.
  path([[-2.4, 1.6], [-2.1, 1.3], [2.1, 1.3], [2.4, 1.6], [2.4, 3.3], [2.1, 3.6], [-2.1, 3.6], [-2.4, 3.3]]);
  ctx.stroke();
  // Ascent stage: cabin with a flat face and a domed top.
  path([[-1.5, 3.6], [1.5, 3.6], [1.5, 5.4], [1.0, 6.3], [0.3, 6.7], [-0.3, 6.7], [-1.0, 6.3], [-1.5, 5.4]]);
  ctx.stroke();
  // Engine bell.
  path([[-0.55, 1.3], [0.55, 1.3], [0.95, 0.5], [-0.95, 0.5]]);
  ctx.stroke();
  // Legs: primary strut from the box corner to the pad, secondary strut up
  // to the box, pad as a short line.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(M(side * 2.4), -M(1.7));
    ctx.lineTo(M(side * cfg.footHalfWidth), 0);
    ctx.moveTo(M(side * 2.4), -M(3.1));
    ctx.lineTo(M(side * (cfg.footHalfWidth - 0.9)), -M(0.9));
    ctx.moveTo(M(side * (cfg.footHalfWidth - 0.6)), 0);
    ctx.lineTo(M(side * (cfg.footHalfWidth + 0.6)), 0);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (detailed) {
    ctx.lineWidth = STROKE.annotation;
    ctx.strokeStyle = BLUEPRINT.inkPale;
    // Stage division.
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(M(-2.4), -M(3.6)); ctx.lineTo(M(2.4), -M(3.6)); ctx.stroke();
    ctx.setLineDash([]);
    // Descent tank inside the box, with fuel hatched from the bottom.
    const tank = { x0: -1.7, x1: 1.7, y0: 1.6, y1: 3.3 };
    path([[tank.x0, tank.y0], [tank.x1, tank.y0], [tank.x1, tank.y1], [tank.x0, tank.y1]]);
    ctx.stroke();
    const frac = Math.max(0, Math.min(1, s.fuel / cfg.fuelMass));
    const level = tank.y0 + (tank.y1 - tank.y0) * frac;
    if (frac > 0) {
      ctx.save();
      path([[tank.x0, tank.y0], [tank.x1, tank.y0], [tank.x1, level], [tank.x0, level]]);
      ctx.clip();
      ctx.beginPath();
      const step = 4 / k; // 4 px hatch pitch in metres
      for (let x = tank.x0 - (tank.y1 - tank.y0); x < tank.x1; x += step) {
        ctx.moveTo(M(x), -M(tank.y0));
        ctx.lineTo(M(x + (tank.y1 - tank.y0)), -M(tank.y1));
      }
      ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(M(tank.x0), -M(level)); ctx.lineTo(M(tank.x1), -M(level)); ctx.stroke();
    }
    // Feed line from tank to engine, two windows, an antenna.
    ctx.beginPath();
    ctx.moveTo(0, -M(tank.y0)); ctx.lineTo(0, -M(1.3));
    ctx.moveTo(M(-1.1), -M(4.6)); ctx.lineTo(M(-0.5), -M(4.6)); ctx.lineTo(M(-0.5), -M(5.3)); ctx.lineTo(M(-1.2), -M(5.3)); ctx.closePath();
    ctx.moveTo(M(1.1), -M(4.6)); ctx.lineTo(M(0.5), -M(4.6)); ctx.lineTo(M(0.5), -M(5.3)); ctx.lineTo(M(1.2), -M(5.3)); ctx.closePath();
    ctx.moveTo(M(0.9), -M(6.3)); ctx.lineTo(M(1.3), -M(7.2)); ctx.moveTo(M(1.05), -M(7.2)); ctx.lineTo(M(1.55), -M(7.2));
    ctx.stroke();
  }
  ctx.restore();
}
