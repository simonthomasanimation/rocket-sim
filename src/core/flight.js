// One flight of the lander from release to touchdown. Owns the lander state,
// keeps the previous tick for render interpolation, judges the landing and
// collects the figures for the results card. No DOM.

import { createLanderState, stepLander, lowestPointAltitude, NO_COMMAND, LANDER, MOON } from './lander.js';
import { createRng } from './rng.js';
import { createTerrain } from './terrain.js';
import { createRecorder } from './recording.js';

export const DEFAULT_START = Object.freeze({ x: 0, y: 150, vx: 3, vy: -6, angle: 0 });

// A touchdown is safe when all three hold at the moment of contact.
export const LANDING_LIMITS = Object.freeze({
  verticalSpeed: 3,            // m/s
  horizontalSpeed: 1,          // m/s
  tilt: (10 * Math.PI) / 180,  // radians
});

// Above this the craft has left the training area and the flight is aborted.
export const CEILING = 1500; // m

export function createFlight({ seed = 1, start = DEFAULT_START, cfg = LANDER, body = MOON, limits = LANDING_LIMITS } = {}) {
  const rng = createRng(seed);
  const terrain = createTerrain(seed);
  const recorder = createRecorder({ seed, start });
  const flight = {
    seed,
    cfg,
    body,
    limits,
    rng,
    terrain,
    recorder,
    start,
    tick: 0,
    phase: 'flying',          // flying | landed | crashed | aborted
    state: createLanderState(start),
    prev: null,
    events: [],               // { tick, type } in order: fuelOut, landed, crashed
    stats: { maxSpeed: 0, fuelStart: 0, touchdown: null },
    // Height of the footpads above the ground directly below (radar altitude).
    altitude() { return flight.state.y - terrain.height(flight.state.x); },
    recording() { return recorder.toJSON(); },
    step(cmd = NO_COMMAND, dt = 1 / 60) {
      flight.prev = { ...flight.state };
      if (flight.phase === 'flying') recorder.record(flight.tick, cmd);
      flight.tick += 1;
      if (flight.phase !== 'flying') return;
      const s = flight.state;
      const hadFuel = s.fuel > 0;
      stepLander(s, cmd, dt, cfg, body);
      if (hadFuel && s.fuel <= 0) {
        s.throttle = 0;
        flight.events.push({ tick: flight.tick, type: 'fuelOut' });
      }
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > flight.stats.maxSpeed) flight.stats.maxSpeed = speed;
      if (lowestPointAltitude(s, cfg, terrain.height(s.x)) <= 0) touchdown(flight);
      else if (s.y > CEILING) {
        flight.phase = 'aborted';
        flight.events.push({ tick: flight.tick, type: 'aborted' });
      }
    },
  };
  flight.stats.fuelStart = flight.state.fuel;
  flight.prev = { ...flight.state };
  return flight;
}

// Judge the contact and freeze the craft on the surface.
function touchdown(flight) {
  const s = flight.state;
  const { limits, cfg } = flight;
  const tilt = normalizeAngle(s.angle);
  const vSpeed = -s.vy;             // positive = descending
  const hSpeed = Math.abs(s.vx);
  const safe = vSpeed < limits.verticalSpeed && hSpeed < limits.horizontalSpeed && Math.abs(tilt) < limits.tilt;
  flight.stats.touchdown = {
    verticalSpeed: vSpeed,
    horizontalSpeed: hSpeed,
    tilt,
    time: s.time,
    fuel: s.fuel,
    x: s.x,
    safe,
    reasons: [
      vSpeed >= limits.verticalSpeed ? 'verticalSpeed' : null,
      hSpeed >= limits.horizontalSpeed ? 'horizontalSpeed' : null,
      Math.abs(tilt) >= limits.tilt ? 'tilt' : null,
    ].filter(Boolean),
  };
  // Rest on the lowest pad; a safe landing settles level, a crash stays as it hit.
  const ground = flight.terrain.height(s.x);
  if (safe) { s.angle = 0; s.y = ground; } else { s.angle = tilt; s.y = ground + Math.abs(Math.sin(tilt)) * cfg.footHalfWidth; }
  s.vx = 0; s.vy = 0; s.angVel = 0; s.throttle = 0; s.thrust = 0;
  flight.phase = safe ? 'landed' : 'crashed';
  flight.events.push({ tick: flight.tick, type: flight.phase });
  flight.prev = { ...s };
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// State as seen alpha of the way from the previous tick to the current one.
export function interpolated(flight, alpha) {
  const a = flight.prev || flight.state;
  const b = flight.state;
  const t = Math.max(0, Math.min(1, alpha));
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: a.angle + (b.angle - a.angle) * t,
  };
}
