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

export function drawScene(ctx, cam, state, cfg) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cam.top, cam.width, cam.height);
  ctx.clip();
  drawGround(ctx, cam);
  drawLander(ctx, cam, state, cfg);
  ctx.restore();
}

// The horizon: one structure line for the surface, nothing more yet.
function drawGround(ctx, cam) {
  const g = cam.toScreen(0, 0);
  if (g.y < cam.top || g.y > cam.top + cam.height) return;
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(g.y) + 0.5);
  ctx.lineTo(cam.width, Math.round(g.y) + 0.5);
  ctx.stroke();
}

// A first outline of the lander: descent box, cabin, engine bell, two legs.
// Drawn in body space (metres, y up from the footpads) around the footpad
// centre, rotated by the tilt. The cutaway drawing replaces this later.
function drawLander(ctx, cam, s, cfg) {
  const p = cam.toScreen(s.x, s.y);
  const k = cam.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(s.angle);
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.lineJoin = 'miter';
  const M = (m) => m * k;
  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(M(x), -M(y)) : ctx.moveTo(M(x), -M(y))));
    ctx.closePath();
    ctx.stroke();
  };
  // Descent stage body.
  poly([[-2.1, 1.3], [2.1, 1.3], [2.1, 3.6], [-2.1, 3.6]]);
  // Cabin.
  poly([[-1.4, 3.6], [1.4, 3.6], [1.4, 5.6], [0.8, 6.4], [-0.8, 6.4], [-1.4, 5.6]]);
  // Engine bell.
  poly([[-0.6, 1.3], [0.6, 1.3], [0.9, 0.4], [-0.9, 0.4]]);
  // Legs and pads.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(M(side * 2.1), -M(1.6));
    ctx.lineTo(M(side * cfg.footHalfWidth), 0);
    ctx.moveTo(M(side * 2.1), -M(3.2));
    ctx.lineTo(M(side * cfg.footHalfWidth), 0);
    ctx.moveTo(M(side * (cfg.footHalfWidth - 0.5)), 0);
    ctx.lineTo(M(side * (cfg.footHalfWidth + 0.5)), 0);
    ctx.stroke();
  }
  // Exhaust: a plain flame outline scaled by thrust, white with a cyan core.
  if (s.thrust > 0) {
    const f = s.thrust / cfg.maxThrust;
    const len = 1.5 + 6 * f;
    ctx.beginPath();
    ctx.moveTo(M(-0.8), -M(0.4));
    ctx.lineTo(0, M(len));
    ctx.lineTo(M(0.8), -M(0.4));
    ctx.stroke();
    ctx.strokeStyle = BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    ctx.moveTo(M(-0.4), -M(0.4));
    ctx.lineTo(0, M(len * 0.55));
    ctx.lineTo(M(0.4), -M(0.4));
    ctx.stroke();
  }
  ctx.restore();
}
