#!/usr/bin/env node
// The reference mission: Earth pad -> orbit -> Moon -> landing -> ascent ->
// home -> splashdown, flown by simple autopilots through the real core.
// `node tools/mission.js` prints the log; the test suite runs it silently
// and checks it gets all the way. It is the proof behind the M3 gate and
// the tuning bench for the KP-3.

import { createFlight } from '../src/core/flight.js';
import { predictCoast } from '../src/core/predict.js';
import { railsAllowed, RAILS } from '../src/core/warp.js';
import { MOON, EARTH } from '../src/core/body.js';
import { propagate } from '../src/core/kepler.js';

const NONE = { thr: 0, rot: 0, full: 0, cut: 0, stage: 0, hold: 0, warp: 0, chute: 0 };
const deg = (d) => (d * Math.PI) / 180;

export function flyMission({ seed = 1, log = () => {}, stopAt = null } = {}) {
  const f = createFlight({ seed, scenario: 'earthLaunch' });
  const step = (cmd = {}) => f.step({ ...NONE, ...cmd });
  // A burn tick that drops a dry stage when there is another to light.
  const burn = (cmd = {}) => step({ ...cmd, full: 1, stage: f.state.fuel <= 0 && f.state.stage < f.cfg.stages.length - 1 ? 1 : 0 });
  const alive = () => f.phase === 'flying' || f.phase === 'pad';
  const alt = () => f.altitude();
  const el = () => f.elements;
  const fuel = () => `${f.state.fuel.toFixed(0)} kg in ${f.cfg.stages[f.state.stage].name}`;
  const fail = (why) => { throw new Error(`${why} (phase ${f.phase}, body ${f.body.id}, t ${(f.state.time / 60).toFixed(1)} min, ${fuel()})`); };
  const report = {};

  // Coast with the highest allowed rails level (or plain ticks) until `done`.
  // `eta` gives seconds to the thing we are waiting for, so the rails step
  // never jumps past it (a level is used only while its tick covers under a
  // quarter of the remaining time, like warp-to-event in the game).
  function coast(done, maxTicks = 200000, hold = 0, every = 1, eta = null) {
    const started = Date.now();
    for (let i = 0; i < maxTicks; i++) {
      if (!alive() || (i % every === 0 && done())) return;
      let level = 0;
      const left = eta ? eta() : null;
      for (let l = RAILS.length; l >= 1; l--) {
        if (left !== null && RAILS[l - 1].rate / 60 > left / 4) continue;
        if (railsAllowed(f, l)) { level = l; break; }
      }
      step({ warp: level, hold });
      if (i % 20000 === 19999) log(`   ...coasting: tick ${i}, level ${level}, alt ${(alt() / 1e3).toFixed(0)} km, T+${(f.state.time / 3600).toFixed(2)} h, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    fail('coast ran out of ticks');
  }
  // The burns take minutes, so a window is judged on the state half a burn
  // from now: that is roughly where an instant burn of the same size would go.
  const halfBurn = (dv) => {
    const m = f.state.fuel + f.cfg.stages.slice(f.state.stage).reduce((sum, st, i) => sum + st.dryMass + (i > 0 ? st.fuelMass : 0), 0);
    const lead = (dv / (f.cfg.stages[f.state.stage].maxThrust / m)) / 2;
    const q = propagate(f.state, f.body.mu, lead);
    return { state: { ...f.state, ...q }, clock: f.clock + lead };
  };
  const predict = () => predictCoast(f.state, f.body, f.terrain, { clock: f.clock, terrainOf: f.terrainOf, drag: f.drag() });
  // Closest approach to a body along a prediction, metres above its mean radius.
  function closestTo(p, bodyId, radius) {
    let best = Infinity;
    const segs = p.segments;
    for (let k = 0; k < segs.length; k++) {
      if (segs[k].body !== bodyId) continue;
      const end = k + 1 < segs.length ? segs[k + 1].from : p.points.length;
      for (let i = segs[k].from; i < end; i++) best = Math.min(best, Math.hypot(p.points[i].x, p.points[i].y) - radius);
    }
    return best;
  }

  // ---- A: Earth ascent to a 90 km orbit --------------------------------
  let n = 0;
  while (alive() && n < 60 * 1500) {
    const a = alt();
    const want = a < 1000 ? 0 : a < 12000 ? ((a - 1000) / 11000) * deg(50) : Math.min(deg(88), deg(50) + ((a - 12000) / 28000) * deg(38));
    const tilt = f.tilt();
    const rot = a < 40000 ? (tilt < want - 0.01 ? 1 : tilt > want + 0.01 ? -1 : 0) : 0;
    const stage = f.state.fuel <= 0 && f.state.stage === 0 ? 1 : 0;
    // Heat governor: ease the throttle while the skin is hot in thick air.
    const hot = f.state.heat > 0.45;
    if (a > 65000 && el().apAlt >= 100000) break;
    if (a > 5000 && a <= 65000 && Number.isFinite(el().apAlt) && el().apAlt >= 100000) { step({ cut: 1 }); log(`   coasting out of the air from ${(a / 1e3).toFixed(0)} km`); coast(() => alt() > 66000 || (el().timeToAp !== null && el().timeToAp < 5), 60 * 600, 1, 1, () => el().timeToAp); log(`   clear of the air at ${(alt() / 1e3).toFixed(0)} km`); continue; }
    step(hot ? { thr: -1, rot, stage, hold: a >= 40000 ? 1 : 0 } : { full: f.state.throttle >= 0.99 || f.state.heat < 0.3 ? 1 : 0, thr: f.state.heat < 0.3 && f.state.throttle < 0.99 ? 1 : 0, rot, stage, hold: a >= 40000 ? 1 : 0 });
    n += 1;
  }
  if (!alive()) fail(`lost during ascent${f.stats.burned ? ' (burned)' : ''}`);
  step({ cut: 1 });
  log(`   ascent done: alt ${(alt() / 1e3).toFixed(0)} km, ap ${(el().apAlt / 1e3).toFixed(0)} km, ${fuel()}, ${n} ticks`);
  coast(() => el().timeToAp !== null && el().timeToAp < 25, 60 * 1200, 1, 1, () => el().timeToAp);
  log(`   at apoapsis: alt ${(alt() / 1e3).toFixed(0)} km`);
  n = 0;
  while (alive() && el().peAlt < 85000 && (el().e >= 1 ? false : el().apAlt < 600000) && n < 60 * 600) { burn({ hold: 1 }); n += 1; }
  step({ cut: 1 });
  if (el().peAlt < 70000) fail('did not reach orbit');
  report.orbit = { ap: el().apAlt, pe: el().peAlt, fuel: f.state.fuel, stage: f.state.stage, time: f.state.time };
  log(`A  orbit ${(el().apAlt / 1e3).toFixed(0)} x ${(el().peAlt / 1e3).toFixed(0)} km, ${fuel()}, T+${(f.state.time / 60).toFixed(1)} min`);
  if (f.state.stage === 0) { step({ stage: 1 }); log('   dropped stage 1 in orbit'); }

  // ---- B: translunar injection ------------------------------------------
  // Wait on the rails until an instant prograde burn would pass the Moon
  // between 20 and 300 km, then burn for real until the live path does.
  let found = null;
  coast(() => {
    for (let dv = 900; dv <= 1100; dv += 40) {
      const { state: s, clock } = halfBurn(dv); const v = Math.hypot(s.vx, s.vy);
      const st = { ...s, vx: s.vx * (v + dv) / v, vy: s.vy * (v + dv) / v };
      const p = predictCoast(st, f.body, f.terrain, { clock, terrainOf: f.terrainOf, maxSteps: 2500 });
      if (p.encounter) { const pe = closestTo(p, 'moon', MOON.radius); if (pe > 20000 && pe < 300000) { found = { dv, pe }; return true; } }
    }
    return false;
  }, 60 * 60 * 3, 1, 20);
  if (!found) fail('no translunar window found');
  log(`B  window: ${found.dv} m/s would pass the Moon at ${(found.pe / 1e3).toFixed(0)} km, T+${(f.state.time / 3600).toFixed(2)} h`);
  if (stopAt === 'B') return { flight: f, report };
  n = 0; let good = false;
  while (alive() && n < 60 * 600) {
    burn({ hold: 1 }); n += 1;
    if (n % 5 === 0) { const p = predict(); if (p.encounter) { const pe = closestTo(p, 'moon', MOON.radius); if (pe > 15000 && pe < 400000) { good = true; break; } } }
  }
  step({ cut: 1 });
  if (!good) fail('translunar burn missed');
  report.tli = { fuel: f.state.fuel, pe: closestTo(predict(), 'moon', MOON.radius) };
  log(`   burned; Moon periapsis ${(report.tli.pe / 1e3).toFixed(0)} km, ${fuel()}`);

  // ---- C: to the Moon, capture, descent, landing ------------------------
  coast(() => f.body.id === 'moon', 60 * 60 * 6, 2);
  log(`C  in the Moon's sphere at T+${(f.state.time / 3600).toFixed(1)} h, periapsis ${(el().peAlt / 1e3).toFixed(0)} km`);
  if (stopAt === 'C') return { flight: f, report };
  // Correction: just inside the sphere a sideways nudge of a few m/s moves
  // the periapsis by a hundred kilometres.
  correct(f, step, el, alive, log, 40000, 120000, 20);
  coast(() => el().timeToPe !== null && el().timeToPe < 20, 60 * 60 * 6, 2, 1, () => el().timeToPe);
  n = 0;
  while (alive() && f.state.fuel > 0 && (el().e >= 1 || el().apAlt > Math.max(150000, el().peAlt + 50000)) && n < 60 * 900) { step({ full: 1, hold: 2 }); n += 1; }
  step({ cut: 1 });
  if (el().e >= 1) fail('capture burn failed');
  log(`   captured: ${(el().apAlt / 1e3).toFixed(0)} x ${(el().peAlt / 1e3).toFixed(0)} km, ${fuel()}`);
  // Deorbit: retrograde until the path meets the ground, then come down.
  n = 0;
  while (alive() && f.state.fuel > 0 && el().peAlt > -30000 && n < 60 * 600) { step({ full: 1, hold: 2 }); n += 1; }
  step({ cut: 1 });
  coast(() => alt() < 30000, 60 * 60 * 3, 2);
  poweredDescent(f, step, alive, alt, log);
  if (f.phase !== 'landed') fail(`Moon landing failed: ${f.stats.touchdown ? f.stats.touchdown.reasons.join(',') : 'no touchdown'}`);
  report.moon = { fuel: f.state.fuel, stage: f.state.stage, time: f.state.time, arc: f.stats.touchdown.arc };
  log(`   landed on the Moon at ${(f.stats.touchdown.verticalSpeed).toFixed(1)} m/s, ${fuel()}, T+${(f.state.time / 3600).toFixed(1)} h`);
  if (stopAt === 'D') return { flight: f, report };

  // ---- D: ascent to lunar orbit ------------------------------------------
  // Lift off on the ascent stage from where we sit (the flight is over once
  // landed; the ascent is flown from the landed state itself).
  f.phase = 'flying';
  step({ stage: 1, full: 1 });
  log(`D  lifting off the Moon: phase ${f.phase}, ${fuel()}, alt ${alt().toFixed(1)} m`);
  n = 0;
  while (alive() && n < 60 * 900) {
    const a = alt();
    const want = a < 300 ? 0 : Math.min(deg(88), ((a - 300) / 12000) * deg(88));
    const tilt = f.tilt();
    const rot = a < 10000 ? (tilt < want - 0.01 ? 1 : tilt > want + 0.01 ? -1 : 0) : 0;
    if (a > 2000 && Number.isFinite(el().apAlt) && el().apAlt >= 30000) break;
    step({ full: 1, rot, hold: a >= 10000 ? 1 : 0 });
    n += 1;
    if (n % 1200 === 0) log(`     ascent ${(f.state.time - report.moon.time).toFixed(0)} s: alt ${(a / 1e3).toFixed(1)} km, tilt ${(tilt * 180 / Math.PI).toFixed(0)}, ap ${Number.isFinite(el().apAlt) ? (el().apAlt / 1e3).toFixed(0) : 'inf'} km, ${fuel()}`);
  }
  step({ cut: 1 });
  log(`   ascent burn done: alt ${(alt() / 1e3).toFixed(1)} km, ap ${(el().apAlt / 1e3).toFixed(0)} km, pe ${(el().peAlt / 1e3).toFixed(0)} km, ${fuel()}, phase ${f.phase}`);
  coast(() => el().timeToAp !== null && el().timeToAp < 15, 60 * 1200, 1, 1, () => el().timeToAp);
  log(`   at lunar apoapsis: phase ${f.phase}, alt ${(alt() / 1e3).toFixed(1)} km, t-ap ${el().timeToAp && el().timeToAp.toFixed(0)}, v ${Math.hypot(f.state.vx, f.state.vy).toFixed(0)}`);
  n = 0;
  while (alive() && el().peAlt < 20000 && n < 60 * 600) { burn({ hold: 1 }); n += 1; }
  step({ cut: 1 });
  log(`   circularised: phase ${f.phase}, ${(el().apAlt / 1e3).toFixed(0)} x ${(el().peAlt / 1e3).toFixed(0)} km after ${n} ticks, ${fuel()}`);
  if (el().peAlt < 5000) fail('did not reach lunar orbit');
  log(`D  lunar orbit ${(el().apAlt / 1e3).toFixed(0)} x ${(el().peAlt / 1e3).toFixed(0)} km, ${fuel()}`);
  if (stopAt === 'E') return { flight: f, report };

  // ---- E: trans-Earth injection, home, entry ----------------------------
  found = null;
  coast(() => {
    for (let dv = 250; dv <= 700; dv += 30) {
      const { state: s, clock } = halfBurn(dv); const v = Math.hypot(s.vx, s.vy);
      const st = { ...s, vx: s.vx * (v + dv) / v, vy: s.vy * (v + dv) / v };
      const p = predictCoast(st, f.body, f.terrain, { clock, terrainOf: f.terrainOf, maxSteps: 2500 });
      if (p.exit) { const pe = closestTo(p, 'earth', EARTH.radius); if (pe > 15000 && pe < 55000) { found = { dv, pe }; return true; } }
    }
    return false;
  }, 60 * 60 * 3, 1, 10);
  if (!found) fail('no way home found');
  log(`E  home window: ${found.dv} m/s for an Earth periapsis of ${(found.pe / 1e3).toFixed(0)} km, T+${(f.state.time / 3600).toFixed(1)} h`);
  if (stopAt === 'E2') return { flight: f, report };
  n = 0; good = false;
  while (alive() && n < 60 * 600) {
    burn({ hold: 1 }); n += 1;
    if (n % 5 === 0) { const p = predict(); if (p.exit && closestTo(p, 'earth', EARTH.radius) < 75000) { good = true; break; } }
  }
  step({ cut: 1 });
  if (!good) fail('trans-Earth burn missed');
  log(`   burned, ${fuel()}`);
  if (stopAt === 'F') return { flight: f, report };
  coast(() => f.body.id === 'earth', 60 * 60 * 6, 2);
  log(`   back in Earth's sphere, periapsis ${(el().peAlt / 1e3).toFixed(0)} km`);
  // The corridor: too high skips out, too low burns. Fix it with short pulses.
  correct(f, step, el, alive, log, 20000, 35000, 4);
  step({ stage: 1 });
  log(`   dropped the ascent stage, ${fuel()}`);
  coast(() => alt() < 70000, 60 * 60 * 6, 2);
  log(`   entry interface at ${Math.hypot(f.state.vx, f.state.vy).toFixed(0)} m/s, T+${(f.state.time / 3600).toFixed(1)} h`);
  let opened = false;
  n = 0;
  while (alive() && n < 60 * 3600) {
    const v = Math.hypot(f.state.vx, f.state.vy);
    const chute = !opened && v < 200 && alt() < 20000 ? 1 : 0;
    if (chute) opened = true;
    step({ hold: 2, chute });
    n += 1;
  }
  report.home = { phase: f.phase, heat: f.stats.maxHeat, touchdown: f.stats.touchdown, burned: f.stats.burned, time: f.state.time };
  if (f.phase !== 'landed') fail(`did not make it home: ${f.stats.burned ? 'burned up' : f.stats.touchdown ? f.stats.touchdown.reasons.join(',') : 'lost'}`);
  log(`   ${f.stats.touchdown.water ? 'splashed down' : 'landed'} at ${f.stats.touchdown.verticalSpeed.toFixed(1)} m/s, peak heat ${(f.stats.maxHeat * 100).toFixed(0)} %, T+${(f.state.time / 3600).toFixed(1)} h`);
  return { flight: f, report };
}

// Mid-course correction: aim 90 degrees off prograde, pulse, keep the side
// that helps, until the periapsis sits between lo and hi. The pulse length
// adapts to how much the last one moved it.
function correct(f, step, el, alive, log, lo, hi, ticks) {
  let side = 1; let pulses = 0; let gain = 0;
  const mid = (lo + hi) / 2;
  while (alive() && (el().peAlt < lo || el().peAlt > hi) && pulses < 60) {
    const before = el().peAlt;
    if (gain > 0) ticks = Math.max(2, Math.min(20, Math.round(Math.abs(mid - before) / gain)));
    aim(f, step, () => Math.atan2(f.state.vx, f.state.vy) + side * Math.PI / 2);
    for (let i = 0; i < ticks; i++) step({ full: 1 });
    step({ cut: 1 });
    const after = el().peAlt;
    gain = Math.abs(after - before) / ticks;
    if ((after > before) !== (before < lo)) side = -side;
    pulses += 1;
  }
  log(`   corrected: periapsis ${(el().peAlt / 1e3).toFixed(0)} km after ${pulses} pulses, ${f.state.fuel.toFixed(0)} kg left`);
}

// Turn the nose to a heading (radians, the craft's convention), engine off.
function aim(f, step, target) {
  for (let i = 0; i < 60 * 30; i++) {
    let err = target() - f.state.angle;
    err = ((err + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (Math.abs(err) < 0.02 && Math.abs(f.state.angVel) < 0.02) return i;
    step({ rot: Math.abs(err) < 0.1 && Math.abs(f.state.angVel) > 0.05 ? 0 : err > 0 ? 1 : -1 });
  }
  return -1;
}

// Retrograde hold with a suicide-burn style throttle, then upright for
// the last metres with vertical speed held to the lander's rule.
function poweredDescent(f, step, alive, alt, log) {
  let n = 0;
  while (alive() && n < 60 * 1200) {
    const a = alt();
    const { vertical, horizontal } = f.groundSpeeds();
    const speed = Math.hypot(f.state.vx, f.state.vy);
    const m = f.state.fuel + f.cfg.stages.slice(f.state.stage).reduce((s, st, i) => s + st.dryMass + (i > 0 ? st.fuelMass : 0), 0);
    const accel = f.cfg.stages[f.state.stage].maxThrust / m - f.body.gravity;
    if (a > 120 || Math.abs(horizontal) > 3) {
      // Kill speed when the stopping distance at full thrust nears the height left.
      const stop = (speed * speed) / (2 * Math.max(0.5, accel));
      step({ hold: 2, full: stop > a * 0.75 ? 1 : 0, cut: stop > a * 0.75 ? 0 : 1 });
    } else {
      const want = -Math.min(2.5, 0.2 * a + 0.3);
      const tilt = f.tilt();
      const rot = tilt > 0.02 ? -1 : tilt < -0.02 ? 1 : 0;
      step({ rot, full: vertical < want ? 1 : 0, cut: vertical >= want ? 1 : 0 });
    }
    n += 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('mission.js')) {
  try {
    const t0 = Date.now();
    const { report } = flyMission({ log: (l) => console.log(l) });
    console.log(`mission complete in ${((Date.now() - t0) / 1000).toFixed(1)} s of computing`);
    console.log(JSON.stringify({ orbitFuel: report.orbit.fuel, moonFuel: report.moon.fuel, home: report.home.phase, heat: report.home.heat }, null, 0));
  } catch (e) {
    console.error(`mission failed: ${e.message}`);
    process.exit(1);
  }
}
