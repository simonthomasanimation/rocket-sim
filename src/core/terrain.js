// A body's surface: heights along the ground as a function of arc length s
// (metres, clockwise from the point directly above the body centre, the
// launch pad, wrapping at the circumference), generated from the flight
// seed so a replay sees the same ground. Altitude is radar altitude, so a
// crater floor or a continent is really lower or higher.
//
// The Moon: small craters right round, a few wide shallow basins. The Earth:
// continents as broad raised plateaus (with contour lines when drawn) on a
// sea at height 0; everything at height 0 is water. The pad sits on a flat
// site in both cases.

import { createRng } from './rng.js';

export const SITE = Object.freeze({ from: -60, to: 140 }); // flat landing zone, metres of arc

// Bowl with a raised rim; d is the distance from the centre.
function craterProfile(d, r, depth) {
  if (d < r) { const t = d / r; return -depth * (1 - t * t); }
  if (d < r * 1.3) { const t = (d - r) / (r * 0.3); return depth * 0.25 * (1 - t); }
  return 0;
}

export function createTerrain(seed, body, { site = SITE } = {}) {
  const R = body.radius;
  const C = 2 * Math.PI * R;                 // circumference
  const half = C / 2;
  const wrap = (s) => { s = (s + half) % C; if (s < 0) s += C; return s - half; };
  const base = {
    seed, body, circumference: C, site, wrap,
    arcOf: (theta) => theta * R,             // heading angle (clockwise from +y) -> arc metres
    angleOf: (s) => s / R,
    arcAt: (x, y) => Math.atan2(x, y) * R,
  };
  const t = body.texture === 'earth' ? earthTerrain(seed, R, C, half, wrap, site) : moonTerrain(seed, R, C, half, wrap, site);
  const terrain = { ...base, ...t };
  terrain.groundRadiusAt = (x, y) => R + terrain.height(Math.atan2(x, y) * R);
  terrain.surfacePoint = (s) => { const a = s / R; const r = R + terrain.height(s); return { x: Math.sin(a) * r, y: Math.cos(a) * r }; };
  if (!terrain.isWater) terrain.isWater = () => false;
  return terrain;
}

function moonTerrain(seed, R, C, half, wrap, site) {
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

  function firstAtOrAfter(s) {
    let lo = 0; let hi = craters.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (craters[mid].x < s) lo = mid + 1; else hi = mid; }
    return lo;
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
    if (s < -half + reach) h += smallAt(s + C);
    else if (s > half - reach) h += smallAt(s - C);
    for (const b of basins) {
      const d = Math.abs(wrap(s - b.x));
      if (d < b.r * 1.3) h += craterProfile(d, b.r, b.depth);
    }
    return h;
  }
  return { craters, basins, continents: [], height };
}

// Continents: broad plateaus with rolling hills on top, between seas at
// height 0. The pad's continent is centred on the pad with a flat site.
function earthTerrain(seed, R, C, half, wrap, site) {
  const rng = createRng(seed ^ 0xea27);
  const continents = [];
  // The home continent at the pad, then four more in evenly spaced slots
  // round the globe, each jittered within its slot so the seas differ.
  const slots = 5;
  continents.push({ x: 0, w: rng.range(500000, 700000), h: rng.range(300, 600) });
  for (let i = 1; i < slots; i++) {
    const w = rng.range(250000, 650000);
    const x = wrap((i / slots) * C + rng.range(-60000, 60000));
    continents.push({ x, w, h: rng.range(200, 800) });
  }
  continents.sort((a, b) => a.x - b.x);
  // Hills: a few gentle sine waves per continent, seeded.
  const hills = continents.map(() => [rng.range(0.6, 1.4), rng.range(0.3, 0.9), rng.range(0, 6.28), rng.range(0, 6.28)]);

  function landAt(s) {
    let h = 0;
    for (let i = 0; i < continents.length; i++) {
      const c = continents[i];
      const d = wrap(s - c.x);
      const u = d / (c.w / 2);
      if (Math.abs(u) >= 1) continue;
      // Plateau shoulders: smooth rise over the outer 30 % of the half-width.
      const edge = Math.min(1, (1 - Math.abs(u)) / 0.3);
      const shoulder = edge * edge * (3 - 2 * edge);
      const [f1, f2, p1, p2] = hills[i];
      const rolling = 0.35 * Math.sin(u * Math.PI * 3 * f1 + p1) + 0.2 * Math.sin(u * Math.PI * 7 * f2 + p2);
      h = Math.max(h, c.h * shoulder * (0.7 + rolling * shoulder));
    }
    return h;
  }
  // The site is flat at the height of the land around it.
  const siteHeight = landAt((site.from + site.to) / 2);
  const flat = { from: site.from - 2000, to: site.to + 2000 };
  function height(s) {
    s = wrap(s);
    if (s > flat.from && s < flat.to) {
      const inner = s >= site.from - 400 && s <= site.to + 400;
      if (inner) return siteHeight;
      const t = s < site.from - 400 ? (s - flat.from) / (site.from - 400 - flat.from) : (flat.to - s) / (flat.to - site.to - 400);
      return siteHeight * (1 - t) + landAt(s) * t;
    }
    return landAt(s);
  }
  return { craters: [], basins: [], continents, height, isWater: (s) => height(s) <= 0.01, seaLevel: 0 };
}
