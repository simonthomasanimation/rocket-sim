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
