// Kepler propagation: move a body-relative state along its two-body orbit
// by dt seconds exactly, with no integration. Universal-variable form
// (Vallado), so ellipses, parabolas and hyperbolas all work. Used by the
// on-rails time warp, where stepping physics at 100,000x would be absurd.

function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24;
}

function stumpffS(z) {
  if (z > 1e-6) { const sz = Math.sqrt(z); return (sz - Math.sin(sz)) / (sz * sz * sz); }
  if (z < -1e-6) { const sz = Math.sqrt(-z); return (Math.sinh(sz) - sz) / (sz * sz * sz); }
  return 1 / 6 - z / 120;
}

// Returns a new { x, y, vx, vy }; the input is not changed.
export function propagate(s, mu, dt) {
  if (dt === 0) return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
  const r0 = Math.hypot(s.x, s.y);
  const v0 = Math.hypot(s.vx, s.vy);
  const vr0 = (s.x * s.vx + s.y * s.vy) / r0;
  const alpha = 2 / r0 - (v0 * v0) / mu;          // 1 / a
  const sqrtMu = Math.sqrt(mu);
  // Initial guess for the universal anomaly chi.
  let chi;
  if (alpha > 1e-12) chi = sqrtMu * Math.abs(alpha) * dt;
  else if (alpha < -1e-12) {
    const a = 1 / alpha;
    chi = Math.sign(dt) * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (s.x * s.vx + s.y * s.vy + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - r0 * alpha)));
    if (!Number.isFinite(chi)) chi = sqrtMu * dt / r0;
  } else chi = sqrtMu * dt / r0;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z); const S = stumpffS(z);
    const F = (r0 * vr0 / sqrtMu) * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sqrtMu * dt;
    const dF = (r0 * vr0 / sqrtMu) * chi * (1 - alpha * chi * chi * S) + (1 - alpha * r0) * chi * chi * C + r0;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-9 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const C = stumpffC(z); const S = stumpffS(z);
  const f = 1 - (chi * chi / r0) * C;
  const g = dt - (chi * chi * chi / sqrtMu) * S;
  const x = f * s.x + g * s.vx;
  const y = f * s.y + g * s.vy;
  const r = Math.hypot(x, y);
  const fdot = (sqrtMu / (r * r0)) * (alpha * chi * chi * chi * S - chi);
  const gdot = 1 - (chi * chi / r) * C;
  return { x, y, vx: fdot * s.x + gdot * s.vx, vy: fdot * s.y + gdot * s.vy };
}
