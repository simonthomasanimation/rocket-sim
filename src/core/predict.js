// Ballistic prediction: where the craft goes from here if the engine stays
// off. Uniform gravity, no drag. Returns sampled points and the impact.

export function predictDescent(state, terrain, gravity, { dt = 0.1, maxTime = 120 } = {}) {
  const points = [];
  let { x, y, vx, vy } = state;
  let t = 0;
  let impact = null;
  points.push({ x, y, t });
  while (t < maxTime) {
    const nvy = vy - gravity * dt;
    const nx = x + vx * dt;
    const ny = y + nvy * dt;
    const ground = terrain.height(nx);
    if (ny <= ground) {
      // Linear interpolation to the ground within this step.
      const f = (y - terrain.height(x)) / Math.max(1e-9, (y - terrain.height(x)) - (ny - ground));
      const ix = x + (nx - x) * f;
      const iy = terrain.height(ix);
      t += dt * f;
      impact = { x: ix, y: iy, t, vx, vy: vy - gravity * dt * f };
      points.push({ x: ix, y: iy, t });
      break;
    }
    x = nx; y = ny; vy = nvy; t += dt;
    points.push({ x, y, t });
  }
  return { points, impact };
}
