// A body's surface: heights along the ground as a function of arc length s
// (metres, clockwise from the point directly above the body centre, the
// launch pad, wrapping at the circumference), generated from the flight
// seed so a replay sees the same ground. Altitude is radar altitude, so a
// crater floor or a continent is really lower or higher.
//
// The Moon: small craters right round, a few wide shallow basins. The Earth:
// continents with plains, hill country and mountain ranges (contour lines
// when drawn) between seas at height 0; everything at height 0 is water.
// The pad sits on a flat site in both cases.

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

// Smooth seeded noise along the ground that wraps at the circumference:
// random values on a lattice `wavelength` apart, blended with a smoothstep.
function makeNoise(rng, C, wavelength) {
  const n = Math.max(4, Math.round(C / wavelength));
  const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) vals[i] = rng.range(-1, 1);
  const cell = C / n;
  const half = C / 2;
  return (s) => {
    const u = (s + half) / cell;
    let i = Math.floor(u);
    const t = u - i;
    i = ((i % n) + n) % n;
    const j = (i + 1) % n;
    const k = t * t * (3 - 2 * t);
    return vals[i] + (vals[j] - vals[i]) * k;
  };
}

// Octaves of ground detail, wavelength and share of the local relief: the
// longest shape a whole hill country, the shortest a bump under the lander.
const OCTAVES = [[60000, 1], [20000, 0.5], [6000, 0.3], [2000, 0.15], [800, 0.12], [250, 0.04], [60, 0.012]];
const PLAIN_RELIEF = 160;      // m, the up-and-down of the plains
const HILL_RELIEF = 500;       // m, extra on hill country at its crest
const RANGE_RELIEF = 1600;     // m, extra ruggedness on a mountain range at its crest
export const EARTH_PEAK_MAX = 4500; // m, no range is taller than this

// A smooth hump of unit height over |d| < w/2 (cosine squared).
function hump(d, w) {
  const u = Math.abs(d) / (w / 2);
  if (u >= 1) return 0;
  const c = Math.cos(u * Math.PI / 2);
  return c * c;
}

// The Earth, a coast-to-coast landscape laid out round the globe:
//  - the home continent, with the pad on a coastal plain 70 km from its
//    east coast so the first stage falls in the sea, hill country inland
//    and a mountain range in its western interior;
//  - three more continents, each with its own ranges, separated by seas,
//    with a few islands out in the water;
//  - the sea at height 0 everywhere outside the land, so splashdowns are
//    anything that comes down between the coasts.
// Land is a plain (150 to 350 m, drifting slowly) plus mountain ranges
// (humps 60 to 160 km wide, peaks 2 to 4.5 km) plus layered noise whose
// amplitude grows on the ranges, all shaded into the sea across a coastal
// shelf. The pad sits on a flat site at the plain's height.
function earthTerrain(seed, R, C, half, wrap, site) {
  const rng = createRng(seed ^ 0xea27);
  const continents = [];
  const ranges = [];
  const PAD_TO_COAST = 70000;

  // Home continent: its east coast is 70 km east of the pad.
  const homeW = rng.range(460000, 560000);
  continents.push({ x: wrap(PAD_TO_COAST - homeW / 2), w: homeW, home: true });
  // The rest, walking east from the home coast: sea, land, sea, land ...
  // with the widths drawn so about a third of the globe is land.
  const widths = [rng.range(300000, 440000), rng.range(130000, 230000), rng.range(200000, 340000)];
  const landTotal = homeW + widths.reduce((a, b) => a + b, 0);
  const seaTotal = C - landTotal;
  const seaShares = [1, 1, 1, 1].map(() => rng.range(0.7, 1.3));
  const seaSum = seaShares.reduce((a, b) => a + b, 0);
  let cursor = PAD_TO_COAST; // east coast of the land just placed
  const seas = [];
  for (let i = 0; i < 4; i++) {
    const gap = seaTotal * seaShares[i] / seaSum;
    seas.push({ x: wrap(cursor + gap / 2), w: gap });
    cursor += gap;
    if (i < widths.length) { continents.push({ x: wrap(cursor + widths[i] / 2), w: widths[i] }); cursor += widths[i]; }
  }
  // Islands: one or two in each sea, well clear of the coasts.
  for (const sea of seas) {
    const count = rng.int(1, 2);
    for (let k = 0; k < count; k++) {
      const w = rng.range(8000, 36000);
      const x = wrap(sea.x + rng.range(-0.3, 0.3) * sea.w);
      continents.push({ x, w, island: true });
    }
  }
  continents.sort((a, b) => a.x - b.x);

  // Mountain ranges: one in the home continent, its near foot 110 to 160 km
  // west of the pad so it stands on the horizon of a launch; one or two per
  // other continent, inside the interior. Hill country: lower, narrower
  // humps, two or three per continent, the home ones starting 25 km west of
  // the pad (the rocket flies east, over the sea).
  const hills = [];
  for (const c of continents) {
    if (c.island) continue;
    const inner = c.w * 0.3; // the ranges sit within the middle 60 %
    const count = c.home ? 1 : rng.int(1, 2);
    for (let k = 0; k < count; k++) {
      const w = rng.range(60000, 160000);
      const h = rng.range(2000, EARTH_PEAK_MAX);
      let x;
      if (c.home) x = -rng.range(110000, 160000) - w / 2;
      else x = wrap(c.x + rng.range(-inner, inner));
      if (ranges.some((r) => Math.abs(wrap(r.x - x)) < (r.w + w) / 2)) continue;
      ranges.push({ x, w, h });
    }
    const hillCount = rng.int(2, 3);
    for (let k = 0; k < hillCount; k++) {
      const w = rng.range(15000, 50000);
      const h = rng.range(300, 900);
      let x;
      if (c.home && k === 0) x = -25000 - w / 2 - rng.range(0, 20000);
      else x = wrap(c.x + rng.range(-c.w * 0.4, c.w * 0.4));
      if (Math.abs(wrap(x)) < 12000 + w / 2) continue; // never over the pad
      hills.push({ x, w, h });
    }
  }
  ranges.sort((a, b) => a.x - b.x);

  const plainDrift = makeNoise(rng, C, 150000);
  const octaves = OCTAVES.map(([wl, share]) => [makeNoise(rng, C, wl), share]);

  // The land envelope, 1 in the interior and 0 at the water line, falling
  // across a shelf that is 8 % of the width (at least 10 km, 1.5 km on an island).
  function envelope(s) {
    let e = 0;
    for (const c of continents) {
      const d = Math.abs(wrap(s - c.x));
      const hw = c.w / 2;
      if (d >= hw) continue;
      const shelf = Math.max(c.island ? 1500 : 10000, c.w * 0.08);
      const t = Math.min(1, (hw - d) / shelf);
      e = Math.max(e, t * t * (3 - 2 * t));
    }
    return e;
  }
  function landAt(s) {
    const e = envelope(s);
    if (e <= 0) return 0;
    let ridge = 0; let rugged = 0; let hilly = 0;
    for (const r of ranges) {
      const b = hump(wrap(s - r.x), r.w);
      if (b > 0) { ridge += r.h * b; rugged = Math.max(rugged, b); }
    }
    for (const r of hills) {
      const b = hump(wrap(s - r.x), r.w);
      if (b > 0) { ridge += r.h * b; hilly = Math.max(hilly, b); }
    }
    const relief = PLAIN_RELIEF + HILL_RELIEF * hilly + RANGE_RELIEF * rugged;
    let noise = 0;
    for (const [fn, share] of octaves) noise += fn(s) * share;
    const plain = 250 + 100 * plainDrift(s);
    let h = plain + ridge + relief * noise;
    // Soft cap: the noise on a tall ridge may not carry a peak past the limit.
    const knee = EARTH_PEAK_MAX * 0.8;
    if (h > knee) h = knee + (EARTH_PEAK_MAX - knee) * Math.tanh((h - knee) / (EARTH_PEAK_MAX - knee));
    return e * Math.max(3, h);
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
  // The peak of each range, found by a fine search over its width, for labels.
  const peaks = ranges.map((r) => {
    let best = { x: r.x, h: 0 };
    for (let d = -r.w / 2; d <= r.w / 2; d += 250) { const h = height(r.x + d); if (h > best.h) best = { x: wrap(r.x + d), h }; }
    return best;
  });
  const maxHeight = peaks.reduce((m, p) => Math.max(m, p.h), 1000);
  return { craters: [], basins: [], continents, ranges, hills, peaks, seas, maxHeight, height, isWater: (s) => height(s) <= 0.01, seaLevel: 0 };
}
