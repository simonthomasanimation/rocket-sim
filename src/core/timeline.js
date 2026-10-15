// Timeline: a recording run to its end with its ticks kept, so a replay can
// be scrubbed and played backwards without re-simulating. Each frame
// carries the craft state, the debris, the phase, the alerts and the CAPCOM
// line current at that tick. Short flights keep every tick; a long one
// (an orbit at time warp) keeps every nth so the tape stays a few tens of
// thousands of frames.

import { createPlayback } from './playback.js';
import { predictCoast } from './predict.js';
import { computeAlerts } from './alerts.js';
import { createCapcom } from './capcom.js';
import { normalizeAngle } from './body.js';

// The tape is built in pieces so the page can keep drawing while a long
// flight is run through: createTimelineBuilder gives a builder whose
// work(ticks) runs up to that many ticks and reports progress; the
// timeline is ready when `done`. buildTimeline runs it to the end at once.
export function createTimelineBuilder(recording, { maxTicks = 60 * 60 * 90, maxFrames = 24000, dt = 1 / 60 } = {}) {
  const playback = createPlayback(recording);
  const flight = playback.flight;
  const capcom = createCapcom();
  const frames = [];
  const limit = Math.min(maxTicks, recording.ticks || maxTicks);
  const stride = Math.max(1, Math.ceil(limit / maxFrames));

  // The alert rules only look ten seconds ahead, so the prediction here is
  // short; refreshing it every few ticks is plenty. The drawing predicts
  // live from the sampled state, so frames do not keep one.
  let prediction = null;
  let sinceLast = 99;
  function capture(force = false) {
    const live = flight.phase === 'flying';
    if (!live) prediction = null;
    else if (sinceLast >= 3 || !prediction) { prediction = predictCoast(flight.state, flight.body, flight.terrain, { maxTime: 12, maxSteps: 400, drag: flight.drag(), clock: flight.clock }); sinceLast = 0; }
    const alerts = computeAlerts(flight, prediction);
    capcom.update(flight, alerts);
    if (force || flight.tick % stride === 0) {
      frames.push({ tick: flight.tick, clock: flight.clock, body: flight.body.id, state: { ...flight.state }, debris: flight.debris.map((d) => ({ ...d })), phase: flight.phase, alerts, capcom: capcom.latest });
    }
  }

  capture(true);
  let n = 0;
  let running = true;
  let tail = 0;       // the short tail after the end, frames captured so far
  let finished = false;
  let timeline = null;

  function finish() {
    if (frames[frames.length - 1].tick !== flight.tick) capture(true);
    timeline = {
      flight,
      frames,
      dt: dt * stride,
      stride,
      get length() { return frames.length; },
      get duration() { return (frames.length - 1) * dt * stride; },
      at(index) { return frames[Math.max(0, Math.min(frames.length - 1, index))]; },
    };
    finished = true;
  }

  return {
    get done() { return finished; },
    get progress() { return finished ? 1 : Math.min(0.99, n / Math.max(1, limit)); },
    get timeline() { return timeline; },
    // Run up to `ticks` more ticks of the flight (and then the tail). True when the tape is complete.
    work(ticks = 2000) {
      if (finished) return true;
      let budget = ticks;
      while (budget > 0 && n < limit && running) { running = playback.step(dt); sinceLast += 1; capture(); n += 1; budget -= 1; }
      if (budget <= 0) return false;
      if (n < limit && running) return false;
      if (frames[frames.length - 1].tick !== flight.tick) capture(true);
      // A short tail so the result can be seen before the end of the tape.
      const over = flight.phase !== 'flying' && flight.phase !== 'pad';
      while (over && tail < 45 && budget > 0) { for (let k = 0; k < stride; k++) flight.step(undefined, dt); sinceLast += stride; capture(true); tail += 1; budget -= stride; }
      if (over && tail < 45) return false;
      finish();
      return true;
    },
  };
}

export function buildTimeline(recording, opts = {}) {
  const b = createTimelineBuilder(recording, opts);
  while (!b.work(100000)) { /* to the end */ }
  return b.timeline;
}

// The frame as seen `cursor` frames into the tape, interpolating between
// neighbouring frames so slow and fast play stay smooth.
export function sampleTimeline(timeline, cursor) {
  const i = Math.floor(cursor);
  const a = timeline.at(i);
  let b = timeline.at(i + 1);
  if (b.body !== a.body) b = a; // frames in different spheres of influence do not mix
  const t = Math.max(0, Math.min(1, cursor - i));
  const state = {
    ...a.state,
    x: a.state.x + (b.state.x - a.state.x) * t,
    y: a.state.y + (b.state.y - a.state.y) * t,
    angle: a.state.angle + normalizeAngle(b.state.angle - a.state.angle) * t,
  };
  return { ...a, state };
}
