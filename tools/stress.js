#!/usr/bin/env node
// Stress battery for the core: random rockets flown with random hands, on
// Earth and on the Moon, with warp, staging, parachutes, replays and the
// predictor, and the builder's operations in random order. Nothing here
// knows the right answer; it checks that nothing breaks: no exception, no
// NaN, no infinite figure, every replay landing where its flight did.
// Usage: node tools/stress.js [--seeds N] [--ticks N] [--quiet]

import { createFlight } from '../src/core/flight.js';
import { predictCoast } from '../src/core/predict.js';
import { replayToEnd } from '../src/core/playback.js';
import { railsAllowed, RAILS, maxWarpIndex, warpLimitReason } from '../src/core/warp.js';
import { computeAlerts } from '../src/core/alerts.js';
import { createCapcom } from '../src/core/capcom.js';
import { buildTimeline, sampleTimeline } from '../src/core/timeline.js';
import { PARTS, createDesign, cloneDesign, validateDesign, addPart, addRadial, insertPart, movePart, removePart, removeRadial, setBoosterDrop, compileDesign, designStats, stagingList, designGeometry, partById } from '../src/core/parts.js';
import { PRESETS } from '../src/core/designs.js';
import { createRng } from '../src/core/rng.js';
import { deltaV, twr } from '../src/core/craft.js';
import { elementsOf } from '../src/core/orbit.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const SEEDS = opt('--seeds', 40);
const TICKS = opt('--ticks', 60 * 240);
const quiet = args.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

const problems = [];
const flag = (where, what) => { problems.push(`${where}: ${what}`); if (!quiet) console.log(`  !! ${where}: ${what}`); };

// NaN is always a bug; Infinity is a bug except where it means "never"
// or "open" (an escape orbit's apoapsis, a time to an event that never comes).
const MAY_BE_INFINITE = /elements|alerts|timeTo|apAlt|ra\b|period|impact/;
function finite(obj, where, depth = 0) {
  if (depth > 3 || obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && Number.isNaN(v)) flag(where, `${k} is NaN`);
    else if (typeof v === 'number' && !Number.isFinite(v) && !MAY_BE_INFINITE.test(`${where}.${k}`)) flag(where, `${k} is ${v}`);
    else if (typeof v === 'object' && v && depth < 3) finite(v, `${where}.${k}`, depth + 1);
  }
}

// --- Random designs ------------------------------------------------------------
const stackParts = PARTS.filter((p) => p.nodes.radial !== 'attach');
const radialParts = PARTS.filter((p) => p.nodes.radial === 'attach');
function randomDesign(rng, i) {
  const d = createDesign(`FUZZ ${i}`);
  const n = 1 + Math.floor(rng.next() * 12);
  for (let k = 0; k < n; k++) {
    const p = stackParts[Math.floor(rng.next() * stackParts.length)];
    if (rng.next() < 0.7) addPart(d, p.id); else insertPart(d, Math.floor(rng.next() * (d.stack.length + 1)), p.id);
  }
  d.stack.forEach((e, idx) => {
    if (partById(e.id).nodes.radial !== 'host') return;
    const m = Math.floor(rng.next() * 3);
    for (let k = 0; k < m; k++) { const r = radialParts[Math.floor(rng.next() * radialParts.length)]; addRadial(d, idx, r.id, rng.next() < 0.3 ? 4 : 2); }
    if (rng.next() < 0.3) setBoosterDrop(d, idx, 'with');
  });
  // A few random edits after the fact.
  for (let k = 0; k < 4; k++) {
    const r = rng.next();
    if (r < 0.3 && d.stack.length > 1) movePart(d, Math.floor(rng.next() * d.stack.length), Math.floor(rng.next() * (d.stack.length + 1)));
    else if (r < 0.5 && d.stack.length > 1) removePart(d, Math.floor(rng.next() * d.stack.length));
    else if (r < 0.6) { const e = d.stack[Math.floor(rng.next() * d.stack.length)]; if (e && e.radials.length) removeRadial(d, d.stack.indexOf(e), e.radials[0].id); }
  }
  return d;
}

// --- Builder operations --------------------------------------------------------
function stressBuilder() {
  log('builder: random designs through the compiler, the figures, the list, the geometry and a JSON round trip');
  const rng = createRng(99);
  let compiled = 0;
  for (let i = 0; i < 400; i++) {
    const d = randomDesign(rng, i);
    const where = `design ${i} [${d.stack.map((e) => e.id).join(',')}]`;
    try {
      const cfg = compileDesign(d);
      finite(cfg, where);
      for (const st of cfg.stages) {
        if (st.dryMass < 0 || st.fuelMass < 0 || st.maxThrust < 0 || st.height < 0 || st.radius <= 0 || st.footHalfWidth <= 0) flag(where, `stage ${st.name} has an impossible figure ${JSON.stringify(st)}`);
        if (st.maxThrust > 0 && !(st.isp > 0)) flag(where, `stage ${st.name} thrust without isp`);
      }
      const s = designStats(d); finite(s, where);
      const rows = stagingList(d);
      if (rows.length < cfg.stages.length) flag(where, 'staging list shorter than the stages');
      const g = designGeometry(d); finite(g, where);
      const back = validateDesign(JSON.parse(JSON.stringify(d)));
      if (JSON.stringify(back) !== JSON.stringify(d)) flag(where, 'does not survive a JSON round trip');
      compiled += 1;
    } catch (e) { flag(where, `threw ${e.stack.split('\n').slice(0, 2).join(' | ')}`); }
  }
  log(`  ${compiled} designs compiled`);
}

// --- Flying ----------------------------------------------------------------------
const NONE = { thr: 0, rot: 0, full: 0, cut: 0, stage: 0, hold: 0, warp: 0, chute: 0 };
function randomHands(rng, f, prev) {
  // Hold a command for a while, change it now and then; sometimes a stab at a key.
  const c = { ...prev, stage: 0, chute: 0, full: 0, cut: 0 };
  if (rng.next() < 0.03) c.thr = Math.floor(rng.next() * 3) - 1;
  if (rng.next() < 0.02) c.rot = Math.floor(rng.next() * 3) - 1;
  if (rng.next() < 0.01) c.hold = Math.floor(rng.next() * 3);
  if (rng.next() < 0.01) c.full = 1;
  if (rng.next() < 0.01) c.cut = 1;
  if (rng.next() < 0.004) c.stage = 1;
  if (rng.next() < 0.003) c.chute = 1;
  if (rng.next() < 0.02) {
    const want = Math.floor(rng.next() * (RAILS.length + 1));
    c.warp = want > 0 && railsAllowed(f, want) ? want : 0;
  } else if (c.warp > 0 && !railsAllowed(f, c.warp)) c.warp = 0;
  return c;
}

function flyOne(label, make, seed, ticks) {
  const rng = createRng(seed * 7919 + 13);
  let f;
  try { f = make(); } catch (e) { flag(label, `createFlight threw ${e.message}`); return null; }
  const capcom = createCapcom();
  let cmd = { ...NONE };
  let n = 0;
  const events = new Set();
  try {
    for (; n < ticks; n++) {
      cmd = randomHands(rng, f, cmd);
      f.step(cmd);
      if (n % 97 === 0) {
        finite(f.state, `${label} state t${n}`);
        for (const d of f.debris) finite(d, `${label} debris t${n}`);
        if (!Number.isFinite(f.altitude())) flag(label, `altitude ${f.altitude()} at tick ${n}`);
        const el = f.elements; if (el) finite(el, `${label} elements t${n}`);
        if (f.phase === 'flying') {
          const p = predictCoast(f.state, f.body, f.terrain, { drag: f.drag(), clock: f.clock, terrainOf: f.terrainOf });
          if (!p.points.length) flag(label, `empty prediction at tick ${n}`);
          for (const q of p.points) { if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) { flag(label, `prediction point not finite at tick ${n}`); break; } }
          const r0 = Math.hypot(f.state.x, f.state.y);
          let reach = 0; for (const q of p.points) reach = Math.max(reach, Math.hypot(q.x, q.y));
          if (reach > 1e10) flag(label, `prediction reaches ${reach.toExponential(1)} m at tick ${n} (r ${r0.toExponential(1)})`);
          const a = computeAlerts(f, p); finite(a, `${label} alerts t${n}`);
          capcom.update(f, a);
          const dv = deltaV(f.state, f.cfg); if (!Number.isFinite(dv)) flag(label, `deltaV ${dv}`);
          const t = twr(f.state, f.cfg, f.body); if (!Number.isFinite(t)) flag(label, `twr ${t}`);
          maxWarpIndex(f, Infinity); warpLimitReason(f, Infinity);
        }
      }
      for (const ev of f.events.slice(-3)) events.add(ev.type);
      if (f.phase !== 'flying' && f.phase !== 'pad') break;
      if (f.phase === 'pad' && n > 60 * 20) break; // never left the pad: nothing more to learn
    }
  } catch (e) { flag(label, `threw at tick ${n}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); return null; }
  return { f, n, events: [...events] };
}

function checkReplay(label, f) {
  try {
    const rec = f.recording();
    const again = replayToEnd(rec, { maxTicks: rec.ticks });
    const dx = Math.abs(again.state.x - f.state.x); const dy = Math.abs(again.state.y - f.state.y);
    if (dx > 1e-6 || dy > 1e-6 || again.phase !== f.phase || again.state.stage !== f.state.stage) flag(label, `replay differs: ${again.phase}/${f.phase}, stage ${again.state.stage}/${f.state.stage}, off by ${Math.hypot(dx, dy).toExponential(2)} m`);
    const tl = buildTimeline(rec, { maxTicks: rec.ticks });
    const mid = sampleTimeline(tl, (tl.length - 1) / 2);
    finite(mid.state, `${label} timeline sample`);
    if (JSON.stringify(rec).length > 2e6) flag(label, `recording is ${JSON.stringify(rec).length} bytes`);
  } catch (e) { flag(label, `replay threw ${e.message}`); }
}

function stressFlights() {
  const scenarios = ['descent', 'launch', 'orbit', 'earthLaunch', 'earthOrbit', 'moonReturn', 'reentry'];
  log(`flights: the seven starts with random hands, ${SEEDS} seeds each`);
  const outcomes = {};
  for (const id of scenarios) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const label = `${id} seed ${seed}`;
      const r = flyOne(label, () => createFlight({ seed, scenario: id }), seed, TICKS);
      if (!r) continue;
      outcomes[r.f.phase] = (outcomes[r.f.phase] || 0) + 1;
      if (seed <= 3) checkReplay(label, r.f);
    }
  }
  log(`  outcomes ${JSON.stringify(outcomes)}`);
  log(`flights: the six presets and random designs from the sheet, Earth and Moon`);
  const rng = createRng(7);
  const designs = [...PRESETS, ...Array.from({ length: SEEDS }, (_, i) => randomDesign(rng, 1000 + i))];
  const out2 = {};
  designs.forEach((d, i) => {
    for (const id of ['designEarth', 'designMoon']) {
      const label = `${d.name} on ${id}`;
      const r = flyOne(label, () => createFlight({ seed: 1 + i, scenario: id, design: d }), i + 1, TICKS);
      if (!r) continue;
      out2[r.f.phase] = (out2[r.f.phase] || 0) + 1;
      if (i < 8) checkReplay(label, r.f);
    }
  });
  log(`  outcomes ${JSON.stringify(out2)}`);
}

// --- Odd designs on purpose ------------------------------------------------------
function stressEdges() {
  log('edges: designs built to be awkward');
  const cases = {
    'nothing': [],
    'capsule only': ['capsule-s'],
    'parachute only': ['parachute'],
    'nose only': ['nose-s'],
    'engine only': ['engine-l-cluster'],
    'boosters, no engine': [{ id: 'tank-m-short', radials: [{ id: 'booster-l', count: 4 }] }, 'probe-core'],
    'boosters with, no engine': [{ id: 'tank-m-short', radials: [{ id: 'booster-l', count: 4, drop: 'with' }] }, 'probe-core'],
    'booster on empty tank stage': ['engine-s-vac', 'decoupler-s', { id: 'tank-s-short', radials: [{ id: 'booster-s' }] }],
    'twenty decouplers': Array(20).fill('decoupler-s'),
    'fifty tanks': ['engine-l-cluster', ...Array(50).fill('tank-l-long'), 'probe-core'],
    'all radials': ['engine-m-lift', { id: 'tank-m-long', radials: [{ id: 'booster-s', count: 4 }, { id: 'booster-m', count: 4 }, { id: 'booster-l', count: 4 }, { id: 'fins', count: 4 }, { id: 'legs-s', count: 4 }, { id: 'legs-m', count: 4 }] }, 'probe-core'],
    'chute under engine': ['engine-s-vac', 'tank-s-short', 'capsule-s', 'parachute'],
    'two capsules': ['engine-s-vac', 'tank-s-short', 'capsule-s', 'capsule-s'],
    'heavy on trim': ['engine-trim', 'tank-l-long', 'tank-l-long', 'capsule-m'],
  };
  for (const [name, stack] of Object.entries(cases)) {
    const where = `edge "${name}"`;
    let d;
    try { d = validateDesign({ name, stack }); } catch (e) { flag(where, `validate threw ${e.message}`); continue; }
    try {
      const cfg = compileDesign(d); finite(cfg, where);
      designStats(d); stagingList(d); designGeometry(d);
    } catch (e) { flag(where, `compile threw ${e.message}`); continue; }
    for (const id of ['designEarth', 'designMoon']) {
      const r = flyOne(`${where} on ${id}`, () => createFlight({ seed: 5, scenario: id, design: d }), 5, 60 * 60);
      if (r && r.f.phase === 'flying') { /* fine */ }
    }
  }
}

const started = Date.now();
stressBuilder();
stressEdges();
stressFlights();
const secs = ((Date.now() - started) / 1000).toFixed(0);
if (problems.length) {
  console.log(`\n${problems.length} problem(s) in ${secs} s:`);
  for (const p of problems.slice(0, 60)) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`stress: no problems in ${secs} s`);
