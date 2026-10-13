#!/usr/bin/env node
// Core tests, run with `npm test`. Pure Node, no browser: the game core
// never touches the DOM, so it can be exercised here directly.

import assert from 'node:assert/strict';
import { createFlight } from '../src/core/flight.js';
import { createRng } from '../src/core/rng.js';
import { encodeCommand, decodeCommand } from '../src/core/recording.js';
import { replayToEnd } from '../src/core/playback.js';
import { createFixedLoop } from '../src/core/loop.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('command codes round-trip', () => {
  for (const thr of [-1, 0, 1]) for (const rot of [-1, 0, 1]) for (const full of [0, 1]) for (const cut of [0, 1]) {
    const c = { thr, rot, full, cut };
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

test('free fall from 150 m hits the ground at the expected speed', () => {
  const f = createFlight({ seed: 7, start: { x: 0, y: 150, vx: 0, vy: 0, angle: 0 } });
  while (f.phase === 'flying') f.step({ thr: 0, rot: 0, full: 0, cut: 0 });
  assert.equal(f.phase, 'crashed');
  const expected = Math.sqrt(2 * 1.62 * 150);
  assert.ok(Math.abs(f.stats.touchdown.verticalSpeed - expected) < 0.3, `got ${f.stats.touchdown.verticalSpeed}`);
});

test('a gentle flown descent is judged a landing', () => {
  const f = createFlight({ seed: 7, start: { x: 0, y: 150, vx: 0, vy: -6, angle: 0 } });
  while (f.phase === 'flying') {
    const s = f.state;
    const want = -Math.min(2.5, 0.2 * f.altitude() + 0.3);
    f.step({ thr: 0, rot: 0, full: s.vy < want ? 1 : 0, cut: s.vy >= want ? 1 : 0 });
  }
  assert.equal(f.phase, 'landed');
  assert.ok(f.stats.touchdown.verticalSpeed < 3);
});

// A noisy pilot: pseudo-random commands with a bias towards slowing down.
function flyNoisy(seed) {
  const rng = createRng(seed);
  const f = createFlight({ seed });
  let cmd = { thr: 0, rot: 0, full: 0, cut: 0 };
  let n = 0;
  while (f.phase === 'flying' && n < 60 * 120) {
    if (rng.next() < 0.1) {
      const s = f.state;
      const want = -Math.min(3, 0.15 * f.altitude() + 0.5);
      cmd = { thr: rng.int(-1, 1), rot: rng.next() < 0.3 ? rng.int(-1, 1) : 0, full: s.vy < want ? 1 : 0, cut: s.vy >= want && rng.next() < 0.5 ? 1 : 0 };
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

test('terrain is flat across the landing site and seeded', () => {
  const a = createFlight({ seed: 5 }).terrain;
  const b = createFlight({ seed: 5 }).terrain;
  const c = createFlight({ seed: 6 }).terrain;
  for (let x = a.site.from; x <= a.site.to; x += 5) assert.equal(a.height(x), 0);
  assert.deepEqual(a.craters, b.craters);
  assert.notDeepEqual(a.craters, c.craters);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.error(`FAIL ${name}\n     ${e.message}`); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
