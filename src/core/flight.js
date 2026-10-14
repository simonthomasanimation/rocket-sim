// One flight of a craft around the Moon, from release (or the pad) until it
// is down or gone. Owns the craft state, keeps the previous tick for render
// interpolation, judges the landing and collects the figures for the
// results card. No DOM.

import { CRAFTS, createCraftState, stepCraft, runEngine, commandedThrottle, lowestPointAltitude, footHalfWidth, totalMass, rk4Step, NO_COMMAND } from './craft.js';
import { MOON, ESCAPE_RADII, upAngle, normalizeAngle } from './body.js';
import { SCENARIOS } from './scenario.js';
import { elementsOf } from './orbit.js';
import { createRng } from './rng.js';
import { createTerrain } from './terrain.js';
import { createRecorder } from './recording.js';

// A touchdown is safe when all three hold at the moment of contact.
export const LANDING_LIMITS = Object.freeze({
  verticalSpeed: 3,            // m/s
  horizontalSpeed: 1,          // m/s
  tilt: (10 * Math.PI) / 180,  // radians
});

// A periapsis this far above the mean radius clears every crater rim: orbit.
export const ORBIT_MARGIN = 1000; // m

export function createFlight({ seed = 1, scenario = 'descent', body = MOON, limits = LANDING_LIMITS } = {}) {
  const scn = SCENARIOS[scenario] || SCENARIOS.descent;
  const cfg = CRAFTS[scn.craft];
  const rng = createRng(seed);
  const terrain = createTerrain(seed, body);
  const recorder = createRecorder({ seed, scenario: scn.id });
  const state = createCraftState(cfg, scn.start(body, terrain));
  const flight = {
    seed,
    scenario: scn,
    cfg,
    body,
    limits,
    rng,
    terrain,
    recorder,
    tick: 0,
    phase: scn.onPad ? 'pad' : 'flying',   // pad | flying | landed | crashed | escaped
    state,
    prev: null,
    debris: [],               // dropped stages still falling: { stage, x, y, vx, vy, angle, angVel, age }
    events: [],               // { tick, type, ... } in order: liftoff, staged, fuelOut, orbit, landed, crashed, escaped
    stats: { maxSpeed: 0, maxAltitude: 0, fuelStart: 0, touchdown: null, orbit: null },
    elements: null,           // orbital elements at the last tick
    radius() { return Math.hypot(flight.state.x, flight.state.y); },
    up() { return upAngle(flight.state.x, flight.state.y); },
    tilt() { return normalizeAngle(flight.state.angle - flight.up()); },
    // Height of the base plane above the ground directly below (radar altitude).
    altitude() { return flight.radius() - terrain.groundRadiusAt(flight.state.x, flight.state.y); },
    // Vertical (positive up) and horizontal (positive clockwise, +x at the pad) speed over the ground.
    groundSpeeds() {
      const s = flight.state;
      const r = Math.hypot(s.x, s.y) || 1;
      const ux = s.x / r; const uy = s.y / r;
      return { vertical: s.vx * ux + s.vy * uy, horizontal: s.vx * uy - s.vy * ux };
    },
    recording() { return recorder.toJSON(); },
    step(cmd = NO_COMMAND, dt = 1 / 60) {
      flight.prev = { ...flight.state };
      if (flight.phase === 'pad' || flight.phase === 'flying') recorder.record(flight.tick, cmd);
      flight.tick += 1;
      stepDebris(flight, dt);
      if (flight.phase === 'pad' && !liftoff(flight, cmd, dt)) return;
      if (flight.phase !== 'flying') return;
      const s = flight.state;
      const hadFuel = s.fuel > 0;
      const { staged } = stepCraft(s, cmd, dt, cfg, body);
      if (staged >= 0) {
        const p = flight.prev;
        flight.debris.push({ stage: staged, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, angVel: p.angVel, age: 0 });
        flight.events.push({ tick: flight.tick, type: 'staged', stage: staged });
      } else if (hadFuel && s.fuel <= 0) {
        s.throttle = 0;
        flight.events.push({ tick: flight.tick, type: 'fuelOut', stage: s.stage });
      }
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > flight.stats.maxSpeed) flight.stats.maxSpeed = speed;
      const alt = flight.altitude();
      if (alt > flight.stats.maxAltitude) flight.stats.maxAltitude = alt;
      flight.elements = elementsOf(s, body);
      if (!flight.stats.orbit && flight.elements.e < 1 && flight.elements.peAlt > ORBIT_MARGIN) {
        flight.stats.orbit = { tick: flight.tick, time: s.time, ap: flight.elements.apAlt, pe: flight.elements.peAlt };
        flight.events.push({ tick: flight.tick, type: 'orbit' });
      }
      if (lowestPointAltitude(alt, flight.tilt(), s, cfg) <= 0) touchdown(flight);
      else if (flight.radius() > ESCAPE_RADII * body.radius) {
        flight.phase = 'escaped';
        flight.events.push({ tick: flight.tick, type: 'escaped' });
      }
    },
  };
  flight.stats.fuelStart = cfg.stages.reduce((sum, st) => sum + st.fuelMass, 0);
  flight.elements = elementsOf(state, body);
  flight.prev = { ...flight.state };
  return flight;
}

// On the pad the craft is held down; the engine may run (and burn fuel)
// until its thrust beats the craft's weight, then the clamps let go.
// Returns true when the craft is released this tick.
function liftoff(flight, cmd, dt) {
  const s = flight.state;
  const { cfg, body } = flight;
  const throttle = commandedThrottle(s, cmd, dt, cfg);
  const potential = s.fuel > 0 ? cfg.stages[s.stage].maxThrust * throttle : 0;
  const weight = totalMass(s, cfg) * body.mu / (s.x * s.x + s.y * s.y);
  if (potential > weight) {
    flight.phase = 'flying';
    flight.events.push({ tick: flight.tick, type: 'liftoff' });
    return true;
  }
  const hadFuel = s.fuel > 0;
  runEngine(s, cmd, dt, cfg);
  if (hadFuel && s.fuel <= 0) { s.throttle = 0; flight.events.push({ tick: flight.tick, type: 'fuelOut', stage: s.stage }); }
  return false;
}

// Dropped stages coast under gravity until they hit the ground or drift off.
function stepDebris(flight, dt) {
  const { body, terrain } = flight;
  for (let i = flight.debris.length - 1; i >= 0; i--) {
    const d = flight.debris[i];
    rk4Step(d, dt, body);
    d.angle = normalizeAngle(d.angle + d.angVel * dt);
    d.age += dt;
    const r = Math.hypot(d.x, d.y);
    if (r <= terrain.groundRadiusAt(d.x, d.y) || r > ESCAPE_RADII * body.radius || d.age > 240) flight.debris.splice(i, 1);
  }
}

// Judge the contact and freeze the craft on the surface.
function touchdown(flight) {
  const s = flight.state;
  const { limits, cfg, terrain } = flight;
  const up = flight.up();
  const tilt = normalizeAngle(s.angle - up);
  const { vertical, horizontal } = flight.groundSpeeds();
  const vSpeed = -vertical;         // positive = descending
  const hSpeed = Math.abs(horizontal);
  const safe = vSpeed < limits.verticalSpeed && hSpeed < limits.horizontalSpeed && Math.abs(tilt) < limits.tilt;
  flight.stats.touchdown = {
    verticalSpeed: vSpeed,
    horizontalSpeed: hSpeed,
    tilt,
    time: s.time,
    fuel: s.fuel,
    arc: terrain.arcAt(s.x, s.y),
    safe,
    reasons: [
      vSpeed >= limits.verticalSpeed ? 'verticalSpeed' : null,
      hSpeed >= limits.horizontalSpeed ? 'horizontalSpeed' : null,
      Math.abs(tilt) >= limits.tilt ? 'tilt' : null,
    ].filter(Boolean),
  };
  // Rest on the lowest pad; a safe landing settles level, a crash stays as it hit.
  const ground = terrain.groundRadiusAt(s.x, s.y);
  let r;
  if (safe) { s.angle = up; r = ground; } else { s.angle = up + tilt; r = ground + Math.abs(Math.sin(tilt)) * footHalfWidth(s, cfg); }
  s.x = Math.sin(up) * r;
  s.y = Math.cos(up) * r;
  s.vx = 0; s.vy = 0; s.angVel = 0; s.throttle = 0; s.thrust = 0;
  flight.phase = safe ? 'landed' : 'crashed';
  flight.events.push({ tick: flight.tick, type: flight.phase });
  flight.prev = { ...s };
}

export { normalizeAngle };

// State as seen alpha of the way from the previous tick to the current one.
export function interpolated(flight, alpha) {
  const a = flight.prev || flight.state;
  const b = flight.state;
  const t = Math.max(0, Math.min(1, alpha));
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: a.angle + normalizeAngle(b.angle - a.angle) * t,
  };
}
