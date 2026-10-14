// Time warp rules. The ladder is shared by the live flight and the replay
// shuttle. The cap depends on how close the ground is: the closer, the
// slower time may run, so a descent cannot be warped past the point of no
// return. M3 extends this with bands by sphere of influence and distance
// to bodies, and a much taller ladder for coasting between them.

export const WARP_LADDER = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

// [altitude above the ground in metres (exclusive upper bound), highest warp allowed]
export const ALTITUDE_BANDS = [
  [500, 4],
  [2000, 8],
  [10000, 16],
  [50000, 32],
  [Infinity, 64],
];

// Highest warp allowed for the flight right now.
export function maxWarp(flight) {
  if (flight.phase !== 'flying') return WARP_LADDER[WARP_LADDER.length - 1];
  const alt = flight.altitude();
  for (const [limit, cap] of ALTITUDE_BANDS) if (alt < limit) return cap;
  return WARP_LADDER[WARP_LADDER.length - 1];
}

// Index on the ladder of the highest warp allowed.
export function maxWarpIndex(flight) {
  const cap = maxWarp(flight);
  let i = 0;
  while (i + 1 < WARP_LADDER.length && WARP_LADDER[i + 1] <= cap) i += 1;
  return i;
}
