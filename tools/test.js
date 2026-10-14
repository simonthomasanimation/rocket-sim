#!/usr/bin/env node
// Core tests, run with `npm test`. Pure Node, no browser: the game core
// never touches the DOM, so it can be exercised here directly.

import assert from 'node:assert/strict';
import { createFlight } from '../src/core/flight.js';
import { createRng } from '../src/core/rng.js';
import { encodeCommand, decodeCommand } from '../src/core/recording.js';
import { replayToEnd } from '../src/core/playback.js';
import { buildTimeline, sampleTimeline } from '../src/core/timeline.js';
import { createFixedLoop } from '../src/core/loop.js';
import { MOON, EARTH, circularSpeed, gravityAt, bodyState, orbitalPeriod, densityAt } from '../src/core/body.js';
import { createCraftState, rk4Step, ROCKET, deltaV } from '../src/core/craft.js';
import { elementsOf } from '../src/core/orbit.js';
import { predictCoast } from '../src/core/predict.js';
import { createTerrain } from '../src/core/terrain.js';
import { WARP_LADDER, PHYSICS_LADDER, maxPhysicsWarp, maxWarpIndex, railsAllowed, RAILS, PHYSICS_LEVELS } from '../src/core/warp.js';
import { propagate } from '../src/core/kepler.js';
import { flyMission } from './mission.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const NONE = { thr: 0, rot: 0, full: 0, cut: 0, stage: 0, hold: 0 };

test('command codes round-trip', () => {
  for (const thr of [-1, 0, 1]) for (const rot of [-1, 0, 1]) for (const full of [0, 1]) for (const cut of [0, 1]) for (const stage of [0, 1]) for (const hold of [0, 1, 2]) for (const warp of [0, 1, 4]) for (const chute of [0, 1]) {
    const c = { thr, rot, full, cut, stage, hold, warp, chute };
    assert.deepEqual(decodeCommand(encodeCommand(c)), c);
  }
});

test('fixed loop steps in whole ticks and caps catch-up', () => {
  let n = 0;
  const loop = createFixedLoop({ hz: 60, maxStepsPerFrame: 8, step: () => { n += 1; } });
  loop.advance(0);
  loop.advance(1 / 60);
  assert.equal(n, 1);
  loop.advance(10); // a long stall is capped, not caught up
  assert.equal(n, 9);
  const { alpha } = loop.advance(10 + 0.5 / 60);
  assert.ok(alpha > 0.49 && alpha < 0.51);
});

test('gravity is inverse-square and 1.62 m/s^2 at the surface', () => {
  const g = gravityAt(MOON, 0, MOON.radius);
  assert.ok(Math.abs(g.ay + 1.62) < 1e-9 && Math.abs(g.ax) < 1e-9);
  const far = gravityAt(MOON, 0, 2 * MOON.radius);
  assert.ok(Math.abs(far.ay + 1.62 / 4) < 1e-9);
});

test('free fall from 150 m hits the ground at the expected speed', () => {
  const f = createFlight({ seed: 7, scenario: 'descent' });
  f.state.vx = 0; f.state.vy = 0;
  while (f.phase === 'flying') f.step(NONE);
  assert.equal(f.phase, 'crashed');
  const expected = Math.sqrt(2 * 1.62 * 150);
  assert.ok(Math.abs(f.stats.touchdown.verticalSpeed - expected) < 0.3, `got ${f.stats.touchdown.verticalSpeed}`);
});

test('a gentle flown descent is judged a landing', () => {
  const f = createFlight({ seed: 7, scenario: 'descent' });
  f.state.vx = 0;
  while (f.phase === 'flying') {
    const want = -Math.min(2.5, 0.2 * f.altitude() + 0.3);
    const v = f.groundSpeeds().vertical;
    f.step({ ...NONE, full: v < want ? 1 : 0, cut: v >= want ? 1 : 0 });
  }
  assert.equal(f.phase, 'landed');
  assert.ok(f.stats.touchdown.verticalSpeed < 3);
});

// A noisy pilot: pseudo-random commands with a bias towards slowing down.
function flyNoisy(seed) {
  const rng = createRng(seed);
  const f = createFlight({ seed, scenario: 'descent' });
  let cmd = NONE;
  let n = 0;
  while (f.phase === 'flying' && n < 60 * 120) {
    if (rng.next() < 0.1) {
      const v = f.groundSpeeds().vertical;
      const want = -Math.min(3, 0.15 * f.altitude() + 0.5);
      cmd = { ...NONE, thr: rng.int(-1, 1), rot: rng.next() < 0.3 ? rng.int(-1, 1) : 0, full: v < want ? 1 : 0, cut: v >= want && rng.next() < 0.5 ? 1 : 0 };
    }
    f.step(cmd);
    n += 1;
  }
  return f;
}

test('replaying a recording reproduces the flight exactly', () => {
  for (const seed of [1, 2, 3, 42]) {
    const live = flyNoisy(seed);
    const rec = live.recording();
    assert.ok(rec.events.length > 5, 'recording has events');
    const again = replayToEnd(rec);
    assert.equal(again.phase, live.phase, `seed ${seed}: same outcome`);
    assert.equal(again.tick, live.tick, `seed ${seed}: same length`);
    assert.equal(again.state.x, live.state.x, `seed ${seed}: same x`);
    assert.equal(again.state.y, live.state.y, `seed ${seed}: same y`);
    assert.equal(again.state.fuel, live.state.fuel, `seed ${seed}: same fuel`);
    assert.deepEqual(again.stats.touchdown, live.stats.touchdown, `seed ${seed}: same touchdown figures`);
    // The recording survives a trip through JSON (storage, export).
    const viaJson = replayToEnd(JSON.parse(JSON.stringify(rec)));
    assert.equal(viaJson.state.x, live.state.x);
  }
});

test('a timeline keeps every tick and stops where the recording stops', () => {
  const live = flyNoisy(3);
  const tl = buildTimeline(live.recording());
  assert.equal(tl.stride, 1);
  assert.equal(tl.at(tl.length - 1).phase, live.phase);
  assert.equal(tl.at(live.tick).state.x, live.state.x);
  const mid = sampleTimeline(tl, 10.5);
  assert.ok(mid.state.y < tl.at(10).state.y && mid.state.y > tl.at(11).state.y || mid.state.y > tl.at(10).state.y && mid.state.y < tl.at(11).state.y);
  // An unfinished flight replays only up to "now".
  const f = createFlight({ seed: 9, scenario: 'descent' });
  for (let i = 0; i < 100; i++) f.step({ ...NONE, thr: 1 });
  const partial = buildTimeline(f.recording());
  assert.equal(partial.length, 101);
  assert.equal(partial.at(100).phase, 'flying');
  assert.equal(partial.at(100).state.y, f.state.y);
});

test('a long flight is kept on a strided tape', () => {
  const f = createFlight({ seed: 9, scenario: 'orbit' });
  for (let i = 0; i < 30000; i++) f.step(NONE);
  const tl = buildTimeline(f.recording(), { maxFrames: 1000 });
  assert.equal(tl.stride, 30);
  assert.ok(tl.length <= 1002 && tl.length >= 1000, `${tl.length} frames`);
  assert.equal(tl.at(tl.length - 1).tick, 30000);
  assert.equal(tl.at(tl.length - 1).state.x, f.state.x);
});

test('burning straight up with the lander leaves the Moon far behind', () => {
  const f = createFlight({ seed: 1, scenario: 'descent' });
  let n = 0;
  while (f.phase === 'flying' && f.radius() < MOON.soi && n < 60 * 3600 * 4) { f.step({ ...NONE, full: 1 }); n += 1; }
  assert.ok(f.radius() >= MOON.soi, `only reached ${(f.radius() / 1000).toFixed(0)} km`);
});

test('the Earth-Moon system is on the shared scale', () => {
  assert.ok(Math.abs(gravityAt(EARTH, 0, EARTH.radius).ay + 9.81) < 1e-9);
  const days = orbitalPeriod(MOON) / 86400;
  assert.ok(days > 8 && days < 9.5, `Moon period ${days.toFixed(2)} days`);
  assert.ok(MOON.soi > 6e6 && MOON.soi < 7.5e6, `Moon SOI ${(MOON.soi / 1000).toFixed(0)} km`);
  const a = bodyState(MOON, 0); const b = bodyState(MOON, 1000);
  assert.ok(Math.abs(Math.hypot(a.x, a.y) - MOON.orbitRadius) < 1 && Math.abs(Math.hypot(b.x, b.y) - MOON.orbitRadius) < 1);
  // Velocity agrees with the motion over a second.
  const c = bodyState(MOON, 1);
  assert.ok(Math.abs((c.x - a.x) - a.vx) < 0.01 && Math.abs((c.y - a.y) - a.vy) < 0.01);
});

test('the Earth has a flat pad on a coast, seas between continents and mountains', () => {
  const t = createTerrain(5, EARTH);
  assert.ok(t.continents.length >= 4, `${t.continents.length} continents`);
  const pad = t.height(0);
  for (let x = t.site.from; x <= t.site.to; x += 5) assert.equal(t.height(x), pad);
  assert.ok(pad > 0, 'the pad is on land');
  assert.ok(t.isWater(80000) && t.isWater(120000), 'the sea begins east of the pad, under the first stage');
  assert.ok(!t.isWater(-50000), 'land inland of the pad');
  let water = 0; let land = 0;
  for (let s = -t.circumference / 2; s < t.circumference / 2; s += 2000) { if (t.isWater(s)) water += 1; else land += 1; }
  const share = land / (land + water);
  assert.ok(share > 0.25 && share < 0.45, `land covers ${(share * 100).toFixed(0)} % of the globe`);
  assert.ok(t.peaks.length >= 3 && t.peaks.every((p) => p.h >= 2000 && p.h <= 4500), `peaks ${t.peaks.map((p) => p.h.toFixed(0)).join(', ')} m`);
  assert.ok(t.maxHeight <= 4500, `tallest ground ${t.maxHeight.toFixed(0)} m`);
  for (const s of [123.4, 5000, -70000, t.circumference / 2 - 3]) assert.ok(Math.abs(t.height(s) - t.height(s + t.circumference)) < 1e-6, `wraps at ${s}`);
  const f = createFlight({ seed: 1, scenario: 'earthLaunch' });
  assert.equal(f.body.id, 'earth');
  assert.equal(f.phase, 'pad');
  assert.ok(f.altitude() < 1 && f.altitude() > -1);
});

test('terrain is flat across the landing site, seeded and wraps round', () => {
  const a = createTerrain(5, MOON);
  const b = createTerrain(5, MOON);
  const c = createTerrain(6, MOON);
  for (let x = a.site.from; x <= a.site.to; x += 5) assert.equal(a.height(x), 0);
  assert.deepEqual(a.craters, b.craters);
  assert.notDeepEqual(a.craters, c.craters);
  assert.ok(a.basins.length > 10, `${a.basins.length} basins`);
  const C = a.circumference;
  for (const s of [123.4, 5000, -70000, C / 2 - 3]) assert.ok(Math.abs(a.height(s) - a.height(s + C)) < 1e-6, `wraps at ${s}`);
});

test('a circular orbit stays circular for 100 periods', () => {
  const r = MOON.radius + 15000;
  const v = circularSpeed(MOON, r);
  const s = { x: 0, y: r, vx: v, vy: 0 };
  const el0 = elementsOf(s, MOON);
  const dt = 1 / 60;
  const steps = Math.round((100 * el0.period) / dt);
  let minR = r; let maxR = r;
  for (let i = 0; i < steps; i++) {
    rk4Step(s, dt, MOON);
    if ((i & 63) === 0) { const rr = Math.hypot(s.x, s.y); if (rr < minR) minR = rr; if (rr > maxR) maxR = rr; }
  }
  const el1 = elementsOf(s, MOON);
  assert.ok(maxR - minR < 1, `radius wandered ${(maxR - minR).toFixed(3)} m over 100 periods`);
  assert.ok(Math.abs(el1.a - el0.a) < 0.5, `semi-major axis drifted ${(el1.a - el0.a).toFixed(3)} m`);
  assert.ok(el1.e < 1e-5, `eccentricity grew to ${el1.e}`);
});

test('orbital elements match the state they came from', () => {
  const r = MOON.radius + 15000;
  const el = elementsOf({ x: 0, y: r, vx: circularSpeed(MOON, r), vy: 0 }, MOON);
  assert.ok(Math.abs(el.apAlt - 15000) < 1e-3 && Math.abs(el.peAlt - 15000) < 1e-3);
  assert.ok(Math.abs(el.period - 2 * Math.PI * Math.sqrt(r ** 3 / MOON.mu)) < 1e-6);
  // Faster at the top of the orbit: this is the periapsis of an ellipse.
  const fast = elementsOf({ x: 0, y: r, vx: circularSpeed(MOON, r) * 1.1, vy: 0 }, MOON);
  assert.ok(Math.abs(fast.peAlt - 15000) < 1e-3, `pe ${fast.peAlt}`);
  assert.ok(fast.apAlt > 15000 && fast.timeToPe > fast.timeToAp);
  assert.ok(Math.abs(fast.timeToAp - fast.period / 2) < 1e-6);
});

test('the coast prediction closes an orbit and finds the ground of a hop', () => {
  const f = createFlight({ seed: 2, scenario: 'orbit' });
  const p = predictCoast(f.state, f.body, f.terrain);
  assert.ok(p.closed && !p.impact, 'orbit closes');
  assert.ok(p.points.length > 300 && p.points.length <= 4000, `${p.points.length} points`);
  const last = p.points[p.points.length - 1];
  assert.ok(Math.abs(Math.hypot(last.x, last.y) - f.radius()) < 2, 'ends at the same radius');
  const hop = createFlight({ seed: 2, scenario: 'descent' });
  const q = predictCoast(hop.state, hop.body, hop.terrain);
  assert.ok(q.impact && q.impact.t > 5 && q.impact.t < 20, `impact at ${q.impact && q.impact.t}`);
  assert.ok(q.impact.vRadial < -15);
  // The predicted impact agrees with the flown one.
  while (hop.phase === 'flying') hop.step(NONE);
  assert.ok(Math.abs(hop.stats.touchdown.time - q.impact.t) < 0.2, `flown ${hop.stats.touchdown.time} vs predicted ${q.impact.t}`);
});

test('the rocket lifts off the pad, stages and has the delta-v to orbit', () => {
  const f = createFlight({ seed: 1, scenario: 'launch' });
  assert.equal(f.phase, 'pad');
  const dv = deltaV(f.state, f.cfg);
  assert.ok(dv > 1500 && dv < 1800, `${dv.toFixed(0)} m/s`);
  f.step(NONE);
  assert.equal(f.phase, 'pad');
  for (let i = 0; i < 30; i++) f.step({ ...NONE, full: 1 });
  assert.equal(f.phase, 'flying');
  assert.ok(f.events.some((e) => e.type === 'liftoff'));
  f.step({ ...NONE, full: 1, stage: 1 });
  assert.equal(f.state.stage, 1);
  assert.equal(f.debris.length, 1);
  assert.ok(ROCKET.stages[1].fuelMass - f.state.fuel < 1, 'second stage lit on staging');
  assert.ok(f.events.some((e) => e.type === 'staged'));
});

test('a scripted gravity turn reaches orbit', () => {
  const f = createFlight({ seed: 1, scenario: 'launch' });
  let n = 0;
  while ((f.phase === 'pad' || f.phase === 'flying') && !f.stats.orbit && n < 60 * 900) {
    const alt = f.altitude();
    const tilt = f.tilt();
    const want = alt < 300 ? 0 : Math.min(Math.PI / 2 - 0.05, (alt - 300) / 6000 * (Math.PI / 2));
    const stage = f.state.fuel <= 0 && f.state.stage === 0 ? 1 : 0;
    const el = f.elements;
    const burn = el.apAlt < 18000 ? 1 : 0;
    const hold = el.apAlt >= 18000 && el.peAlt < 14000 && el.timeToAp < 60 ? 1 : 0;
    f.step({ ...NONE, full: burn || hold ? 1 : 0, cut: burn || hold ? 0 : 1, rot: tilt < want - 0.01 ? 1 : tilt > want + 0.01 ? -1 : 0, stage, hold: 0 });
    n += 1;
  }
  assert.ok(f.stats.orbit, `no orbit after ${n} ticks, pe ${f.elements.peAlt.toFixed(0)}`);
  assert.equal(f.state.stage, 1, 'the first stage alone cannot make orbit');
  assert.ok(f.state.fuel > 50, `fuel left ${f.state.fuel.toFixed(0)} kg`);
});

test('time warp is capped by the distance to the ground, rails by floors and the engine', () => {
  const low = createFlight({ seed: 1, scenario: 'descent' });
  assert.equal(maxPhysicsWarp(low), 4);
  assert.equal(WARP_LADDER[maxWarpIndex(low)], 4);
  const high = createFlight({ seed: 1, scenario: 'orbit' });
  assert.equal(maxPhysicsWarp(high), 32);
  assert.equal(maxWarpIndex(high), PHYSICS_LADDER.indexOf(32), 'no rails under 50 km over the Moon');
  const pad = createFlight({ seed: 1, scenario: 'launch' });
  assert.equal(maxPhysicsWarp(pad), 64, 'nothing to protect on the pad');
  assert.ok(!railsAllowed(pad, 1), 'no rails on the pad');
  high.state.y += 60000; high.elements = elementsOf(high.state, high.body);
  assert.equal(maxPhysicsWarp(high), 64);
  assert.ok(railsAllowed(high, 1) && railsAllowed(high, 2) && !railsAllowed(high, 3), '75 km over the Moon: x1000 yes, x10,000 no');
  assert.equal(WARP_LADDER[maxWarpIndex(high)], 1000);
  assert.equal(WARP_LADDER[maxWarpIndex(high, 4)], 64, 'an event 4 s away keeps it off the rails');
  high.state.throttle = 0.5;
  assert.ok(!railsAllowed(high, 1), 'engine on: no rails');
  const leo = createFlight({ seed: 1, scenario: 'earthOrbit' });
  assert.ok(railsAllowed(leo, 2) && !railsAllowed(leo, 3), '60 km over the Earth: x1000 yes, x10,000 no');
});

test('Kepler propagation matches the integrator and closes an orbit', () => {
  const r = EARTH.radius + 60000;
  const v = circularSpeed(EARTH, r);
  const s0 = { x: 0, y: r, vx: v, vy: 0 };
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / EARTH.mu);
  const back = propagate(s0, EARTH.mu, T);
  assert.ok(Math.hypot(back.x - s0.x, back.y - s0.y) < 1, `after one period off by ${Math.hypot(back.x - s0.x, back.y - s0.y).toFixed(3)} m`);
  // An elliptical and a hyperbolic case against RK4 over 2000 s.
  for (const k of [1.3, 1.6]) {
    const e0 = { x: 0, y: r, vx: v * k, vy: 0 };
    const rk = { ...e0 };
    for (let i = 0; i < 2000; i++) rk4Step(rk, 1, EARTH);
    const kp = propagate(e0, EARTH.mu, 2000);
    assert.ok(Math.hypot(kp.x - rk.x, kp.y - rk.y) < 5, `k ${k}: ${Math.hypot(kp.x - rk.x, kp.y - rk.y).toFixed(2)} m apart`);
  }
});

test('a flight on rails replays exactly and reaches the Moon', () => {
  const f = createFlight({ seed: 3, scenario: 'earthOrbit' });
  // Find a translunar burn by prediction, then apply it as a short full burn.
  for (let i = 0; i < 60 * 400 && f.elements.apAlt < 39.5e6; i++) f.step({ ...NONE, full: 1, hold: 1 });
  f.step({ ...NONE, cut: 1 });
  let n = 0;
  while (f.body.id !== 'moon' && f.phase === 'flying' && n < 20000) {
    let level = 0;
    for (let l = RAILS.length; l >= 1; l--) if (railsAllowed(f, l)) { level = l; break; }
    f.step({ ...NONE, warp: level });
    n += 1;
  }
  assert.equal(f.body.id, 'moon', `after ${n} ticks still at ${f.body.id}, ap ${(f.elements.apAlt / 1e3).toFixed(0)} km`);
  assert.ok(f.state.time > 20 * 3600 && f.state.time < 70 * 3600, `arrived after ${(f.state.time / 3600).toFixed(1)} h`);
  const again = replayToEnd(f.recording(), { maxTicks: 60 * 400 + n + 10 });
  assert.equal(again.body.id, 'moon');
  assert.equal(again.state.x, f.state.x);
  assert.equal(again.state.y, f.state.y);
  assert.equal(again.clock, f.clock);
});

test('the atmosphere thins with height and slows a falling stage to terminal speed', () => {
  assert.ok(Math.abs(densityAt(EARTH, EARTH.radius) - 1.225) < 1e-9);
  assert.ok(Math.abs(densityAt(EARTH, EARTH.radius + 5000) - 1.225 / Math.E) < 1e-6);
  assert.equal(densityAt(EARTH, EARTH.radius + 60000), 0);
  assert.equal(densityAt(MOON, MOON.radius), 0);
  // A KP-3 third stage dropped from 8 km, engine off, reaches a steady fall.
  const f = createFlight({ seed: 1, scenario: 'earthLaunch' });
  f.phase = 'flying';
  f.state.stage = 2; f.state.fuel = 700; f.state.y = EARTH.radius + f.terrain.height(0) + 8000;
  let last = 0; let n = 0;
  while (f.phase === 'flying' && n < 60 * 400) { f.step(NONE); n += 1; if (f.altitude() < 2000 && f.altitude() > 1500) last = -f.groundSpeeds().vertical; }
  assert.ok(last > 40 && last < 400, `fell at ${last.toFixed(0)} m/s through 2 km`);
  // Without drag it would arrive at 396 m/s; terminal speed at sea level is about 130.
  assert.ok(f.stats.touchdown && f.stats.touchdown.verticalSpeed < 300, `hit at ${f.stats.touchdown && f.stats.touchdown.verticalSpeed.toFixed(0)}`);
});

test('an orbit dipping into the atmosphere is predicted to come down', () => {
  const f = createFlight({ seed: 1, scenario: 'earthOrbit' });
  const v0 = f.state.vx;
  for (let k = 0.999; k > 0.9; k -= 0.001) { f.state.vx = v0 * k; if (f.elements.peAlt < 9000) break; f.elements = elementsOf(f.state, f.body); }
  f.elements = elementsOf(f.state, f.body);
  const p = predictCoast(f.state, f.body, f.terrain, { drag: f.drag() });
  assert.ok(p.elements.peAlt < 12000 && p.elements.peAlt > 0, `pe ${p.elements.peAlt.toFixed(0)}`);
  assert.ok(p.entry && p.entry.t > 0, 'entry marker found');
  assert.ok(p.impact || p.points.length === 4000 || !p.closed, 'the path does not simply close');
});

test('leaving the Moon hands the craft to Earth and the inertial position is unchanged', () => {
  const f = createFlight({ seed: 1, scenario: 'orbit' });
  // Put the craft just inside the edge of the Moon's SOI, moving out.
  f.state.x = 0; f.state.y = MOON.soi - 10; f.state.vx = 0; f.state.vy = 100;
  const before = bodyState(MOON, f.clock);
  const inertial = { x: f.state.x + before.x, y: f.state.y + before.y };
  let n = 0;
  while (f.body.id === 'moon' && n < 600) { f.step(NONE); n += 1; }
  assert.equal(f.body.id, 'earth');
  assert.ok(f.events.some((e) => e.type === 'soi' && e.to === 'earth'));
  const after = { x: f.state.x, y: f.state.y };
  const moved = n / 60 * 100; // metres travelled, roughly
  assert.ok(Math.hypot(after.x - inertial.x, after.y - inertial.y) < moved + 2000, 'position carried over');
  assert.ok(Math.hypot(f.state.vx, f.state.vy) > 150, 'the Moon\'s own orbital speed is added');
});

test('a burn from Earth orbit reaches the Moon in the prediction', () => {
  const f = createFlight({ seed: 1, scenario: 'earthOrbit' });
  let found = null;
  for (let dv = 900; dv <= 1100 && !found; dv += 10) {
    const v = Math.hypot(f.state.vx, f.state.vy);
    const st = { ...f.state, vx: f.state.vx * (v + dv) / v, vy: f.state.vy * (v + dv) / v };
    const p = predictCoast(st, f.body, f.terrain, { clock: f.clock, terrainOf: f.terrainOf, maxSteps: 4000 });
    if (p.encounter) found = { dv, p };
  }
  assert.ok(found, 'no burn between 900 and 1100 m/s meets the Moon');
  const { p } = found;
  assert.equal(p.encounter.body, 'moon');
  assert.ok(p.encounter.t > 20 * 3600 && p.encounter.t < 60 * 3600, `encounter at ${(p.encounter.t / 3600).toFixed(1)} h`);
  assert.ok(p.segments.length >= 2 && p.segments[1].body === 'moon');
  // The craft then flies on in the Moon's frame: either round it or out again.
  assert.ok(p.impact || p.exit || p.closed || p.points.length >= 4000);
});

test('a capsule rides the heat shield-first, opens the chute and splashes down or lands', () => {
  const f = createFlight({ seed: 1, scenario: 'reentry' });
  f.step({ ...NONE, stage: 1 });
  let n = 0; let opened = false; let maxHeat = 0;
  while (f.phase === 'flying' && n < 60 * 3600) {
    const v = Math.hypot(f.state.vx, f.state.vy);
    const chute = !opened && v < 200 && f.altitude() < 20000 ? 1 : 0;
    if (chute) opened = true;
    f.step({ ...NONE, hold: 2, chute });
    if (f.state.heat > maxHeat) maxHeat = f.state.heat;
    n += 1;
  }
  assert.equal(f.phase, 'landed', `ended ${f.phase}: ${JSON.stringify(f.stats.touchdown && f.stats.touchdown.reasons)} heat ${f.stats.maxHeat.toFixed(2)}`);
  assert.ok(maxHeat > 0.1 && maxHeat < 1, `peak heat ${maxHeat.toFixed(2)} of the shielded limit`);
  assert.equal(f.state.chute, 1);
  assert.ok(f.stats.touchdown.verticalSpeed < 10, `came down at ${f.stats.touchdown.verticalSpeed.toFixed(1)} m/s`);
  // Nose first it burns; with the chute opened too early it tears and the capsule hits hard.
  const g = createFlight({ seed: 1, scenario: 'reentry' });
  g.step({ ...NONE, stage: 1 });
  n = 0;
  while (g.phase === 'flying' && n < 60 * 3600) { g.step({ ...NONE, hold: 1 }); n += 1; }
  assert.ok(g.stats.burned, 'prograde entry burns up');
  const h = createFlight({ seed: 1, scenario: 'reentry' });
  h.step({ ...NONE, stage: 1 });
  n = 0;
  while (h.phase === 'flying' && n < 60 * 3600) { h.step({ ...NONE, hold: 2, chute: n === 10 ? 1 : 0 }); n += 1; }
  assert.equal(h.state.chute, 2, 'opened at orbital speed the chute tears');
  assert.equal(h.phase, 'crashed');
});

test('the KP-3 flies the reference mission: Earth pad, Moon landing, splashdown (about ten seconds)', () => {
  const { report } = flyMission({ seed: 1 });
  assert.ok(report.orbit.pe > 70000, `Earth orbit periapsis ${(report.orbit.pe / 1e3).toFixed(0)} km`);
  assert.ok(report.moon.fuel > 0, 'landed on the Moon with fuel to spare');
  assert.equal(report.home.phase, 'landed', `came home ${report.home.phase}`);
  assert.ok(report.home.touchdown.verticalSpeed < 10, `came down at ${report.home.touchdown.verticalSpeed.toFixed(1)} m/s`);
  assert.ok(report.home.heat > 0.1 && report.home.heat < 1, `peak heat ${report.home.heat.toFixed(2)} of the shielded limit`);
});

let failed = 0;
for (const { name, fn } of tests) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); } catch (e) { failed += 1; console.error(`FAIL ${name}\n     ${e.message}`); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
