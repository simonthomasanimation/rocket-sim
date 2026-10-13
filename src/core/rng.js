// Seeded pseudo-random numbers (mulberry32). Every bit of chance in the game
// comes from one of these so a flight with the same seed plays the same way.

export function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                     // [0, 1)
    range: (lo, hi) => lo + (hi - lo) * next(), // [lo, hi)
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // [lo, hi]
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

// Turn any string (a date, a name) into a 32-bit seed.
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
