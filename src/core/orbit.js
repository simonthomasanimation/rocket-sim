// Two-body orbital elements from a body-relative position and velocity.
// Used for the Ap/Pe readouts and markers, the orbit milestone and the
// predictor's step size. Pure functions, 2D.

const TWO_PI = 2 * Math.PI;

export function orbitalElements(x, y, vx, vy, mu) {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - mu / r;
  const h = x * vy - y * vx;              // specific angular momentum (z); > 0 counter-clockwise
  const rv = x * vx + y * vy;
  const ex = ((v2 - mu / r) * x - rv * vx) / mu;
  const ey = ((v2 - mu / r) * y - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;                 // semi-latus rectum
  const bound = energy < 0;
  const a = bound ? -mu / (2 * energy) : -mu / (2 * energy);
  const rp = p / (1 + e);
  const ra = bound && e < 1 ? p / (1 - e) : Infinity;
  const period = bound ? TWO_PI * Math.sqrt((a * a * a) / mu) : Infinity;
  // Periapsis direction; for a near-circular orbit any direction serves, so
  // use the current one and the markers stay put under the craft.
  let ux; let uy;
  if (e > 1e-7) { ux = ex / e; uy = ey / e; } else { ux = x / r; uy = y / r; }
  const direction = h >= 0 ? 1 : -1;
  // True anomaly measured in the direction of motion.
  const nu = direction * Math.atan2(ux * y - uy * x, ux * x + uy * y);
  let timeToPe = null;
  let timeToAp = null;
  if (bound && e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    const M = E - e * Math.sin(E);
    const since = ((M / TWO_PI) * period + period) % period; // time since periapsis
    timeToPe = period - since;          // in (0, period]: at periapsis a whole orbit away
    timeToAp = (period / 2 - since + period) % period;
  } else if (e > 1 && nu < 0) {
    // Hyperbolic, still approaching: time to periapsis from the hyperbolic anomaly.
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    const M = e * Math.sinh(H) - H;
    const n = Math.sqrt(mu / Math.pow(-a, 3));
    timeToPe = -M / n;
  }
  return {
    r, v: Math.sqrt(v2), energy, h, e, a, p, rp, ra, period, direction, nu, timeToPe, timeToAp,
    periapsis: { x: ux * rp, y: uy * rp },
    apoapsis: Number.isFinite(ra) ? { x: -ux * ra, y: -uy * ra } : null,
  };
}

// Elements of a craft state around a body, with altitudes above the mean radius.
export function elementsOf(s, body) {
  const el = orbitalElements(s.x, s.y, s.vx, s.vy, body.mu);
  el.apAlt = Number.isFinite(el.ra) ? el.ra - body.radius : Infinity;
  el.peAlt = el.rp - body.radius;
  return el;
}
