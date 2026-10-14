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

// Highest physics warp while the engine burns: at x64 a whole tank goes in
// a few real seconds and a path set to meet the Moon balloons into an
// escape before the player can cut (owner's report, 14 Oct).
export const BURN_WARP = 8;

export function burning(flight) {
  const s = flight.state;
  return s.throttle > 0 && s.fuel > 0;
}

// Highest physics warp allowed for the flight right now.
export function maxPhysicsWarp(flight) {
  if (flight.phase !== 'flying') return 64;
  let cap = 64;
  // Under a canopy there is nothing left to fly: the descent may run at x64.
  const chute = flight.state.chute;
  if (!(chute && chute !== 2)) {
    const alt = flight.altitude();
    for (const [limit, c] of ALTITUDE_BANDS) if (alt < limit) { cap = c; break; }
  }
  if (burning(flight)) cap = Math.min(cap, BURN_WARP);
  return cap;
}

// Whether rails level `level` (1..4) may run right now: coasting with the
// engine off, no parachute out, clear of any atmosphere and above the floor.
export function railsAllowed(flight, level) {
  return railsBlocker(flight, level) === null;
}

// Why rails level `level` may not run right now, in CAPCOM's words, or null
// when it may. An open throttle only counts while there is fuel to burn:
// a tank run dry with the throttle still at full is a coast, and the
// warp must not stay stuck at x64 for it (owner's report, 14 Oct).
export function railsBlocker(flight, level) {
  if (level < 1 || level > RAILS.length) return 'No such warp.';
  if (flight.phase !== 'flying') return 'Rails warp is for a flight under way.';
  const s = flight.state;
  if ((s.throttle > 0 && s.fuel > 0) || s.thrust > 0) return 'Throttle is open. Rails warp needs the engine shut: cut it first.';
  if (s.chute && s.chute !== 2) return 'Rails warp is off under a canopy. Ride it down at x64.';
  const body = flight.body;
  const alt = flight.radius() - body.radius;
  if (body.atmosphere && alt < body.atmosphere.height + 2000) return `Still in the air. Rails warp from ${Math.round((body.atmosphere.height + 2000) / 1000)} km up.`;
  const floor = RAILS[level - 1].floors[body.id];
  if (floor === undefined) return 'No rails warp here.';
  if (alt < floor) return `Too low for x${RAILS[level - 1].rate.toLocaleString('en')} here: it needs ${Math.round(floor / 1000)} km over the ${body.name.toLowerCase()}.`;
  return null;
}

// Why the warp will not go above the highest level allowed right now, in
// CAPCOM's words, or null when the top of the ladder is open.
export function warpLimitReason(flight, eventIn = Infinity) {
  const cap = maxPhysicsWarp(flight);
  if (cap < 64) {
    if (burning(flight) && cap === BURN_WARP) return `Engine burning: the warp holds at x${BURN_WARP} so the burn stays in hand. Cut it for more.`;
    return `Too close to the ground for more than x${cap}.`;
  }
  for (let level = 1; level <= RAILS.length; level++) {
    const why = railsBlocker(flight, level);
    if (why) return why;
    const step = RAILS[level - 1].rate / 60;
    if (eventIn < step * 3) return `An event is coming up in ${Math.round(eventIn)} s: the warp holds here until it is past.`;
  }
  return null;
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
