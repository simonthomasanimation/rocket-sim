// Time warp rules. One ladder for the live flight and the replay shuttle:
// the physics levels (more 60 Hz steps per frame; engines, steering and
// air all work) and above them the rails levels, where the craft is moved
// along its orbit exactly (core/kepler.js) with no physics at all: engine
// off, outside any atmosphere, above a floor that rises per body with the
// level. The cap near the ground keeps a descent playable; a change of
// sphere of influence or an atmosphere entry stops the rails.

export const PHYSICS_LADDER = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

// Rails levels with the lowest altitude (m) they are allowed at, per body.
export const RAILS = [
  { rate: 100, floors: { earth: 62000, moon: 5000 } },
  { rate: 1000, floors: { earth: 80000, moon: 20000 } },
  { rate: 10000, floors: { earth: 200000, moon: 100000 } },
  { rate: 100000, floors: { earth: 500000, moon: 500000 } },
];

export const WARP_LADDER = [...PHYSICS_LADDER, ...RAILS.map((r) => r.rate)];
export const PHYSICS_LEVELS = PHYSICS_LADDER.length;

// Rails level (1..4) of a ladder index, 0 for a physics level.
export function railsLevel(index) {
  return index >= PHYSICS_LEVELS ? index - PHYSICS_LEVELS + 1 : 0;
}

// [altitude above the ground in metres (exclusive upper bound), highest physics warp allowed]
export const ALTITUDE_BANDS = [
  [500, 4],
  [2000, 8],
  [10000, 16],
  [50000, 32],
  [Infinity, 64],
];

// Highest physics warp allowed for the flight right now.
export function maxPhysicsWarp(flight) {
  if (flight.phase !== 'flying') return 64;
  // Under a canopy there is nothing left to fly: the descent may run at x64.
  const chute = flight.state.chute;
  if (chute && chute !== 2) return 64;
  const alt = flight.altitude();
  for (const [limit, cap] of ALTITUDE_BANDS) if (alt < limit) return cap;
  return 64;
}

// Whether rails level `level` (1..4) may run right now: coasting with the
// engine off, no parachute out, clear of any atmosphere and above the floor.
export function railsAllowed(flight, level) {
  if (level < 1 || level > RAILS.length) return false;
  if (flight.phase !== 'flying') return false;
  const s = flight.state;
  if (s.throttle > 0 || s.thrust > 0 || (s.chute && s.chute !== 2)) return false;
  const body = flight.body;
  const alt = flight.radius() - body.radius;
  if (body.atmosphere && alt < body.atmosphere.height + 2000) return false;
  const floor = RAILS[level - 1].floors[body.id];
  return floor !== undefined && alt >= floor;
}

// Index on the ladder of the highest warp allowed. `eventIn` is the time
// (s) to the next hard event (sphere-of-influence change, atmosphere entry,
// ground) if known: a rails step may not come within three steps of it.
export function maxWarpIndex(flight, eventIn = Infinity) {
  const cap = maxPhysicsWarp(flight);
  let i = 0;
  while (i + 1 < PHYSICS_LEVELS && PHYSICS_LADDER[i + 1] <= cap) i += 1;
  if (cap < 64) return i;
  for (let level = 1; level <= RAILS.length; level++) {
    if (!railsAllowed(flight, level)) break;
    const step = RAILS[level - 1].rate / 60;
    if (eventIn < step * 3) break;
    i = PHYSICS_LEVELS + level - 1;
  }
  return i;
}
