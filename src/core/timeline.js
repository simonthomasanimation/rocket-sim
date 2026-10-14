// Timeline: a recording run to its end with every tick kept, so a replay can
// be scrubbed, stepped and played backwards without re-simulating. Each
// frame carries the lander state, the phase, the alerts and the CAPCOM line
// current at that tick. A two-minute flight is about 7,000 small frames.

import { createPlayback } from './playback.js';
import { predictDescent } from './predict.js';
import { computeAlerts } from './alerts.js';
import { createCapcom } from './capcom.js';

export function buildTimeline(recording, { maxTicks = 60 * 60 * 10, dt = 1 / 60 } = {}) {
  const playback = createPlayback(recording);
  const flight = playback.flight;
  const capcom = createCapcom();
  const frames = [];

  // The engine-off prediction is the costly part; refreshing it every third
  // tick (50 ms) is plenty for the alert rules. The drawing predicts live
  // from the sampled state, so frames do not keep one.
  let prediction = null;
  function capture() {
    if (flight.phase !== 'flying') prediction = null;
    else if (frames.length % 3 === 0 || !prediction) prediction = predictDescent(flight.state, flight.terrain, flight.body.gravity);
    const alerts = computeAlerts(flight, prediction);
    capcom.update(flight, alerts);
    frames.push({ tick: flight.tick, state: { ...flight.state }, phase: flight.phase, alerts, capcom: capcom.latest });
  }

  const limit = Math.min(maxTicks, recording.ticks || maxTicks);
  capture();
  let n = 0;
  while (n < limit && playback.step(dt)) { capture(); n += 1; }
  if (flight.phase !== 'flying') {
    capture(); // the touchdown frame itself
    // A short tail so the result can be seen before the end of the tape.
    for (let i = 0; i < 45; i++) { flight.step(undefined, dt); capture(); }
  }

  return {
    flight,
    frames,
    dt,
    get length() { return frames.length; },
    get duration() { return (frames.length - 1) * dt; },
    at(index) { return frames[Math.max(0, Math.min(frames.length - 1, index))]; },
  };
}

// The frame as seen `cursor` ticks into the tape, interpolating between
// neighbouring frames so slow and fast play stay smooth.
export function sampleTimeline(timeline, cursor) {
  const i = Math.floor(cursor);
  const a = timeline.at(i);
  const b = timeline.at(i + 1);
  const t = Math.max(0, Math.min(1, cursor - i));
  const state = {
    ...a.state,
    x: a.state.x + (b.state.x - a.state.x) * t,
    y: a.state.y + (b.state.y - a.state.y) * t,
    angle: a.state.angle + (b.state.angle - a.state.angle) * t,
  };
  return { ...a, state };
}
