// Flat-ish Moon surface: a level plain with shallow craters, generated from
// the flight seed so a replay sees the same ground. Heights in metres above
// the datum y = 0; the landing zone around the start is kept flat.

import { createRng } from './rng.js';

export const SITE = Object.freeze({ from: -60, to: 140 }); // flat landing zone, metres

export function createTerrain(seed, { span = 3000, site = SITE } = {}) {
  const rng = createRng(seed ^ 0x5eed);
  const craters = [];
  let x = -span;
  while (x < span) {
    x += rng.range(25, 90);
    const r = rng.range(3, 22);
    if (x + r * 1.3 > site.from && x - r * 1.3 < site.to) continue; // keep the site clear
    craters.push({ x, r, depth: r * rng.range(0.08, 0.16) });
  }

  craters.sort((a, b) => a.x - b.x);
  const reach = 22 * 1.3; // widest crater rim, metres

  // Index of the first crater whose centre is at or beyond x (binary search).
  function firstAtOrAfter(x) {
    let lo = 0;
    let hi = craters.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (craters[mid].x < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function height(px) {
    let h = 0;
    for (let i = firstAtOrAfter(px - reach); i < craters.length; i++) {
      const c = craters[i];
      if (c.x - px > reach) break;
      const d = Math.abs(px - c.x);
      if (d < c.r) {
        const t = d / c.r;
        h -= c.depth * (1 - t * t);           // bowl
      } else if (d < c.r * 1.3) {
        const t = (d - c.r) / (c.r * 0.3);
        h += c.depth * 0.25 * (1 - t);        // raised rim
      }
    }
    return h;
  }

  return { seed, craters, height, site };
}
