// One flight of a craft around the Moon, from release (or the pad) until it
// is down or gone. Owns the craft state, keeps the previous tick for render
// interpolation, judges the landing and collects the figures for the
// results card. No DOM.

import { CRAFTS, createCraftState, stepCraft, runEngine, commandedThrottle, lowestPointAltitude, footHalfWidth, totalMass, rk4Step, dragFactor, heatFlux, heatLimit, NO_COMMAND } from './craft.js';
import { BODIES, ESCAPE_RADIUS, bodyState, childrenOf, upAngle, normalizeAngle } from './body.js';
import { SCENARIOS } from './scenario.js';
import { elementsOf } from './orbit.js';
import { createRng } from './rng.js';
import { createTerrain } from './terrain.js';
import { createRecorder } from './recording.js';
import { propagate } from './kepler.js';
import { RAILS, railsAllowed } from './warp.js';
import { progradeAngle } from './craft.js';
import { compileDesign, validateDesign } from './parts.js';

// A touchdown is safe when all three hold at the moment of contact. Under
// a parachute the capsule may come down harder and at any angle; on water
// a little harder still.
export const LANDING_LIMITS = Object.freeze({
  verticalSpeed: 3,            // m/s
  horizontalSpeed: 1,          // m/s
  tilt: (10 * Math.PI) / 180,  // radians
  chuteVerticalSpeed: 10,      // m/s, under the full main (it gives 5.4 m/s at the sea, under 9 on the highest ground)
  splashVerticalSpeed: 10,     // m/s, under a canopy into the sea
});

// A periapsis this far above the mean radius clears every crater rim: orbit.
export const ORBIT_MARGIN = 1000; // m

export function createFlight({ seed = 1, scenario = 'descent', limits = LANDING_LIMITS, design = null } = {}) {
  const scn = SCENARIOS[scenario] || SCENARIOS.descent;
  // A design from the vellum sheet is compiled into the stage list here;
  // a design with nothing to fire is still a craft, it just sits on the pad.
  let cfg = CRAFTS[scn.craft];
  let kept = null;
  if (scn.craft === 'design') {
    kept = validateDesign(design || { name: 'EMPTY', stack: [] });
    cfg = compileDesign(kept);
    if (!cfg.stages.length) cfg.stages.push({ name: 'EMPTY', kind: 'stack', dryMass: 100, fuelMass: 0, maxThrust: 0, isp: 0, height: 1, radius: 1, footHalfWidth: 1.1, capsule: false, shield: false, chute: false, crew: 0, legs: false, parts: [], radials: [] });
  }
  const body = BODIES[scn.body || 'moon'];
  const rng = createRng(seed);
  // One terrain per body, made on first use (the Moon's craters are a
  // long list and an Earth flight may never visit them).
  const terrains = {};
  const terrainOf = (b) => { if (!terrains[b.id]) terrains[b.id] = createTerrain(seed, b); return terrains[b.id]; };
  const terrain = terrainOf(body);
  const recorder = createRecorder({ seed, scenario: scn.id, design: kept });
  const state = createCraftState(cfg, scn.start(body, terrain));
  const flight = {
    seed,
    scenario: scn,
    cfg,
    body,                     // the body whose sphere of influence the craft is in
    limits,
    rng,
    terrain,                  // that body's terrain
    terrainOf,
    recorder,
    clock: 0,                 // s since the scenario began; bodies move on this, also on the pad
    tick: 0,
    phase: scn.onPad ? 'pad' : 'flying',   // pad | flying | landed | crashed | escaped
    state,
    prev: null,
    debris: [],               // dropped stages still falling: { stage, x, y, vx, vy, angle, angVel, age }
    events: [],               // { tick, type, ... } in order: liftoff, staged, fuelOut, orbit, landed, crashed, escaped
    stats: { maxSpeed: 0, maxAltitude: 0, fuelStart: 0, touchdown: null, orbit: null, maxHeat: 0, burned: false },
    elements: null,           // orbital elements at the last tick
    radius() { return Math.hypot(flight.state.x, flight.state.y); },
    up() { return upAngle(flight.state.x, flight.state.y); },
    tilt() { return normalizeAngle(flight.state.angle - flight.up()); },
    drag() { return dragFactor(flight.state, cfg); },
    heat() { return heatFlux(flight.state, flight.body) / heatLimit(flight.state, cfg); },
    // Height of the base plane above the ground directly below (radar altitude).
    altitude() { return flight.radius() - flight.terrain.groundRadiusAt(flight.state.x, flight.state.y); },
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
      flight.clock += dt;
      stepDebris(flight, dt);
      if (flight.phase === 'pad' && !liftoff(flight, cmd, dt)) return;
      if (flight.phase === 'crashed' && flight.state.broken === 1) { fall(flight, dt); return; }
      if (flight.phase !== 'flying') return;
      // On rails: no physics, the craft is moved along its orbit for the
      // warped span of this tick, stopping early at anything that needs
      // physics again. A thrust command takes the tick off the rails.
      const wantsThrust = cmd.full || cmd.thr > 0;
      if (cmd.warp > 0 && !wantsThrust && railsAllowed(flight, cmd.warp)) { railsStep(flight, cmd, dt * RAILS[cmd.warp - 1].rate); return; }
      const s = flight.state;
      const hadFuel = s.fuel > 0;
      const hadChute = s.chute;
      const { staged } = stepCraft(s, cmd, dt, cfg, flight.body, flight.terrain.groundRadiusAt(s.x, s.y));
      if (s.chute !== hadChute) flight.events.push({ tick: flight.tick, type: 'chute', chute: s.chute });
      if (staged >= 0) {
        // The spent stage is pushed off backwards along the axis by the
        // separation springs and picks up a slight tumble.
        const p = flight.prev;
        const kick = 1.5;
        flight.debris.push({
          stage: staged, x: p.x, y: p.y,
          vx: p.vx - Math.sin(p.angle) * kick, vy: p.vy - Math.cos(p.angle) * kick,
          angle: p.angle, angVel: p.angVel + flight.rng.range(-0.25, 0.25), age: 0,
          drag: dragFactor({ stage: 0, fuel: 0, chute: 0 }, { stages: [cfg.stages[staged]] }),
        });
        flight.events.push({ tick: flight.tick, type: 'staged', stage: staged });
      } else if (hadFuel && s.fuel <= 0) {
        s.throttle = 0;
        flight.events.push({ tick: flight.tick, type: 'fuelOut', stage: s.stage });
      }
      handoff(flight);
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > flight.stats.maxSpeed) flight.stats.maxSpeed = speed;
      // Re-entry heating: the fraction of what the craft can take.
      const heat = heatFlux(s, flight.body) / heatLimit(s, cfg);
      s.heat = heat;
      if (heat > flight.stats.maxHeat) flight.stats.maxHeat = heat;
      if (heat >= 1) {
        flight.stats.burned = true;
        flight.phase = 'crashed';
        s.throttle = 0; s.thrust = 0;
        breakUp(flight);
        flight.events.push({ tick: flight.tick, type: 'burned' });
        flight.events.push({ tick: flight.tick, type: 'crashed' });
        return;
      }
      const alt = flight.altitude();
      if (alt > flight.stats.maxAltitude) flight.stats.maxAltitude = alt;
      flight.elements = elementsOf(s, flight.body);
      if (!flight.stats.orbit && !flight.startedInOrbit && flight.elements.e < 1 && flight.elements.peAlt > ORBIT_MARGIN) {
        flight.stats.orbit = { tick: flight.tick, time: s.time, ap: flight.elements.apAlt, pe: flight.elements.peAlt };
        flight.events.push({ tick: flight.tick, type: 'orbit' });
      }
      if (lowestPointAltitude(alt, flight.tilt(), s, cfg) <= 0) touchdown(flight);
      else if (!flight.body.parent && flight.radius() > ESCAPE_RADIUS) {
        flight.phase = 'escaped';
        flight.events.push({ tick: flight.tick, type: 'escaped' });
      }
    },
  };
  flight.stats.fuelStart = cfg.stages.reduce((sum, st) => sum + st.fuelMass, 0);
  flight.elements = elementsOf(state, body);
  // A start already in orbit is not an orbit reached.
  flight.startedInOrbit = flight.elements.e < 1 && flight.elements.peAlt > ORBIT_MARGIN;
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

// Move the craft along its orbit for `span` seconds in chunks, handing it
// over at a sphere-of-influence change and stopping at the edge of an
// atmosphere or the ground. Debris is left behind. Mutates the flight.
function railsStep(flight, cmd, span) {
  const s = flight.state;
  flight.debris.length = 0;
  const chunk = Math.min(60, span);
  let left = span;
  while (left > 1e-6) {
    const body = flight.body;
    // Shorter chunks near a sphere-of-influence boundary, so the crossing
    // lands within a few seconds of where it should.
    let dt = Math.min(chunk, left);
    const v = Math.hypot(s.vx, s.vy) + 1000;
    let gap = Infinity;
    if (body.parent) gap = Math.abs(body.soi - Math.hypot(s.x, s.y));
    for (const child of childrenOf(body)) { const c = bodyState(child, flight.clock); gap = Math.min(gap, Math.abs(Math.hypot(s.x - c.x, s.y - c.y) - child.soi)); }
    // ...and above the air or the ground, so a fast fall stops at the edge
    // instead of a chunk landing deep inside it.
    const r0 = Math.hypot(s.x, s.y);
    if (body.atmosphere) gap = Math.min(gap, Math.max(0, r0 - body.radius - body.atmosphere.height - 2000));
    gap = Math.min(gap, Math.max(0, r0 - flight.terrain.groundRadiusAt(s.x, s.y) - 1000));
    if (gap < 3 * v * dt) dt = Math.max(2, Math.min(dt, gap / (3 * v) + 2));
    const next = propagate(s, body.mu, dt);
    s.x = next.x; s.y = next.y; s.vx = next.vx; s.vy = next.vy;
    s.time += dt;
    flight.clock += dt;
    left -= dt;
    const r = Math.hypot(s.x, s.y);
    if (body.atmosphere && r - body.radius < body.atmosphere.height + 2000) break;
    if (r <= flight.terrain.groundRadiusAt(s.x, s.y) + 1000) break;
    const before = flight.body;
    handoff(flight);
    if (flight.body !== before) break;
  }
  // The hold keeps the nose where it would be; otherwise the heading stays.
  if (cmd.hold && Math.hypot(s.vx, s.vy) > 0.5) s.angle = normalizeAngle(progradeAngle(s) + (cmd.hold === 2 ? Math.PI : 0));
  s.angVel = 0; s.throttle = 0; s.thrust = 0;
  flight.elements = elementsOf(s, flight.body);
  const alt = flight.altitude();
  if (alt > flight.stats.maxAltitude) flight.stats.maxAltitude = alt;
  if (!flight.body.parent && flight.radius() > ESCAPE_RADIUS) {
    flight.phase = 'escaped';
    flight.events.push({ tick: flight.tick, type: 'escaped' });
  }
}

// Patched conics: leaving the body's sphere of influence hands the craft
// to the parent's frame; entering a child's hands it to the child's. The
// craft, its previous tick and the debris all move to the new frame
// together, so nothing jumps on screen.
function handoff(flight) {
  const s = flight.state;
  const cur = flight.body;
  const r = Math.hypot(s.x, s.y);
  const T = flight.clock;
  let next = null; let dx = 0; let dy = 0; let dvx = 0; let dvy = 0;
  if (cur.parent && r > cur.soi) {
    const b = bodyState(cur, T);
    next = BODIES[cur.parent]; dx = b.x; dy = b.y; dvx = b.vx; dvy = b.vy;
  } else {
    for (const child of childrenOf(cur)) {
      const c = bodyState(child, T);
      if (Math.hypot(s.x - c.x, s.y - c.y) < child.soi) { next = child; dx = -c.x; dy = -c.y; dvx = -c.vx; dvy = -c.vy; break; }
    }
  }
  if (!next) return;
  for (const o of [s, flight.prev, ...flight.debris]) { if (!o) continue; o.x += dx; o.y += dy; o.vx += dvx; o.vy += dvy; }
  flight.body = next;
  flight.terrain = flight.terrainOf(next);
  flight.events.push({ tick: flight.tick, type: 'soi', from: cur.id, to: next.id });
}

// Past the heat limit the stack comes apart: every remaining stage becomes
// a piece of debris thrown sideways and tumbling, still in the air stream.
function breakUp(flight) {
  const s = flight.state;
  const { cfg } = flight;
  let along = 0;
  for (let i = s.stage; i < cfg.stages.length; i++) {
    const st = cfg.stages[i];
    const kick = flight.rng.range(2, 6) * (flight.rng.next() < 0.5 ? -1 : 1);
    const up = flight.rng.range(-1, 3);
    flight.debris.push({
      stage: i,
      x: s.x + Math.sin(s.angle) * along, y: s.y + Math.cos(s.angle) * along,
      vx: s.vx + Math.cos(s.angle) * kick + Math.sin(s.angle) * up,
      vy: s.vy - Math.sin(s.angle) * kick + Math.cos(s.angle) * up,
      angle: s.angle, angVel: s.angVel + flight.rng.range(-1.5, 1.5), age: 0, broken: true,
      drag: dragFactor({ stage: 0, fuel: 0, chute: 0 }, { stages: [st] }),
    });
    along += st.height;
  }
  s.broken = 1;
  if (s.chute && s.chute !== 2) s.chute = 2; // whatever canopy was out is lost
}

// After a break-up the wreck's centre keeps falling through the air (the
// camera and the inset follow it, the pieces drift away from it) until
// it reaches the ground.
function fall(flight, dt) {
  const s = flight.state;
  rk4Step(s, dt, flight.body, 0, 0, dragFactor({ ...s, chute: 0 }, flight.cfg));
  s.angle = normalizeAngle(s.angle + s.angVel * dt);
  s.heat = heatFlux(s, flight.body) / heatLimit(s, flight.cfg);
  if (Math.hypot(s.x, s.y) <= flight.terrain.groundRadiusAt(s.x, s.y)) s.broken = 2;
}

// Dropped stages coast under gravity until they hit the ground or drift off.
function stepDebris(flight, dt) {
  const { body, terrain } = flight;
  for (let i = flight.debris.length - 1; i >= 0; i--) {
    const d = flight.debris[i];
    rk4Step(d, dt, body, 0, 0, d.drag || 0);
    d.angle = normalizeAngle(d.angle + d.angVel * dt);
    d.age += dt;
    const r = Math.hypot(d.x, d.y);
    if (r <= terrain.groundRadiusAt(d.x, d.y) || d.age > 240) flight.debris.splice(i, 1);
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
  const arc = terrain.arcAt(s.x, s.y);
  const water = terrain.isWater(arc);
  const chute = s.chute === 1; // only the full main counts; a drogue or a reefed main is still a fall
  const vLimit = chute ? (water ? limits.splashVerticalSpeed : limits.chuteVerticalSpeed) : limits.verticalSpeed;
  const hLimit = chute ? Infinity : limits.horizontalSpeed;
  const tiltLimit = chute ? Infinity : limits.tilt;
  const safe = vSpeed < vLimit && hSpeed < hLimit && Math.abs(tilt) < tiltLimit;
  flight.stats.touchdown = {
    verticalSpeed: vSpeed,
    horizontalSpeed: hSpeed,
    tilt,
    time: s.time,
    fuel: s.fuel,
    arc,
    water,
    chute,
    limits: { verticalSpeed: vLimit, horizontalSpeed: hLimit, tilt: tiltLimit },
    safe,
    reasons: [
      vSpeed >= vLimit ? 'verticalSpeed' : null,
      hSpeed >= hLimit ? 'horizontalSpeed' : null,
      Math.abs(tilt) >= tiltLimit ? 'tilt' : null,
    ].filter(Boolean),
  };
  // Rest on the lowest pad; a safe landing settles level, a crash stays as it hit.
  const ground = terrain.groundRadiusAt(s.x, s.y);
  let r;
  if (safe) { s.angle = up; r = ground; } else { s.angle = up + tilt; r = ground + Math.abs(Math.sin(tilt)) * footHalfWidth(s, cfg); }
  if (water && safe) r = ground - 0.6; // afloat, a little low in the water
  s.x = Math.sin(up) * r;
  s.y = Math.cos(up) * r;
  s.vx = 0; s.vy = 0; s.angVel = 0; s.throttle = 0; s.thrust = 0;
  flight.phase = safe ? 'landed' : 'crashed';
  flight.events.push({ tick: flight.tick, type: water && safe ? 'splashdown' : flight.phase });
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
