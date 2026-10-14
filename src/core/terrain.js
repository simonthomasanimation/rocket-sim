// The Moon's surface: a sphere with shallow craters all the way round and a
// few wide basins, generated from the flight seed so a replay sees the same
// ground. Positions along the surface are arc lengths s in metres measured
// clockwise from the point directly above the body centre (the launch pad),
// wrapping at the circumference. Heights are metres above the mean radius;
// altitude is radar altitude, so a crater floor is really lower.
// The landing site around the pad is kept flat so a first-timer can land.

import { createRng } from './rng.js';

export const SITE = Object.freeze({ from: -60, to: 140 }); // flat landing zone, metres of arc

export function createTerrain(seed, body, { site = SITE } = {}) {
  const R = body.radius;
  const C = 2 * Math.PI * R;                 // circumference
  const half = C / 2;
  const wrap = (s) => { s = (s + half) % C; if (s < 0) s += C; return s - half; };

  // Small craters: 3 to 22 m radius every 25 to 90 m, right round the body.
  const rng = createRng(seed ^ 0x5eed);
  const craters = [];
  let x = -half;
  while (x < half) {
    x += rng.range(25, 90);
    const r = rng.range(3, 22);
    if (x + r * 1.3 > site.from && x - r * 1.3 < site.to) continue; // keep the site clear
    craters.push({ x, r, depth: r * rng.range(0.08, 0.16) });
  }
  craters.sort((a, b) => a.x - b.x);
  const reach = 22 * 1.3; // widest small crater rim, metres

  // Basins: a few dozen wide, shallow craters that show from orbit and are
  // real dips in the ground. None within 25 km of the site.
  const brng = createRng(seed ^ 0xba51);
  const basins = [];
  const count = Math.round(C / 28000);
  for (let i = 0; i < count; i++) {
    const bx = brng.range(-half, half);
    const r = brng.range(2500, 12000);
    if (Math.abs(bx) < 25000 + r) continue;
    if (basins.some((b) => Math.abs(wrap(b.x - bx)) < (b.r + r) * 1.4)) continue;
    basins.push({ x: bx, r, depth: r * brng.range(0.025, 0.04) });
  }
  basins.sort((a, b) => a.x - b.x);

  // Index of the first small crater whose centre is at or beyond s.
  function firstAtOrAfter(s) {
    let lo = 0;
    let hi = craters.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (craters[mid].x < s) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // Bowl with a raised rim; d is the distance from the centre.
  function craterProfile(d, r, depth) {
    if (d < r) { const t = d / r; return -depth * (1 - t * t); }
    if (d < r * 1.3) { const t = (d - r) / (r * 0.3); return depth * 0.25 * (1 - t); }
    return 0;
  }

  function smallAt(s) {
    let h = 0;
    for (let i = firstAtOrAfter(s - reach); i < craters.length; i++) {
      const c = craters[i];
      if (c.x - s > reach) break;
      h += craterProfile(Math.abs(s - c.x), c.r, c.depth);
    }
    return h;
  }

  function height(s) {
    s = wrap(s);
    let h = smallAt(s);
    // Near the seam the neighbours on the other side of the wrap count too.
    if (s < -half + reach) h += smallAt(s + C);
    else if (s > half - reach) h += smallAt(s - C);
    for (const b of basins) {
      const d = Math.abs(wrap(s - b.x));
      if (d < b.r * 1.3) h += craterProfile(d, b.r, b.depth);
    }
    return h;
  }

  return {
    seed,
    body,
    circumference: C,
    craters,
    basins,
    site,
    height,                                  // metres above the mean radius at arc s
    wrap,
    arcOf: (theta) => theta * R,             // heading angle (clockwise from +y) -> arc metres
    angleOf: (s) => s / R,
    // Arc position of a body-relative point and the ground radius under it.
    arcAt: (x, y) => Math.atan2(x, y) * R,
    groundRadiusAt(x, y) { return R + height(Math.atan2(x, y) * R); },
    // Body-relative point on the surface at arc s.
    surfacePoint(s) { const a = s / R; const r = R + height(s); return { x: Math.sin(a) * r, y: Math.cos(a) * r }; },
  };
}
