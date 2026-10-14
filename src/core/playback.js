// Playback: runs a recording through a fresh flight, one tick at a time.
// Kept apart from recording.js so flight.js can record without a circular
// import.

import { createFlight } from './flight.js';
import { NO_COMMAND } from './craft.js';
import { decodeCommand } from './recording.js';

// Plays a recording back through a fresh flight, one tick at a time.
// `step()` returns false once the recording's flight is over.
export function createPlayback(recording) {
  const flight = createFlight({ seed: recording.seed, scenario: recording.scenario, design: recording.design || null });
  const events = recording.events;
  let cursor = 0;
  let cmd = NO_COMMAND;
  return {
    flight,
    get command() { return cmd; },
    step(dt) {
      while (cursor < events.length && events[cursor][0] <= flight.tick) {
        cmd = decodeCommand(events[cursor][1]);
        cursor += 1;
      }
      flight.step(cmd, dt);
      return flight.phase === 'flying' || flight.phase === 'pad';
    },
  };
}

// Run a recording to its end in one go (used by the tests and the ghosts):
// as far as the recording goes, or until the flight is over.
export function replayToEnd(recording, { maxTicks = 60 * 60 * 10, dt = 1 / 60 } = {}) {
  const playback = createPlayback(recording);
  const limit = Math.min(maxTicks, recording.ticks || maxTicks);
  let n = 0;
  while (n < limit && playback.step(dt)) n += 1;
  return playback.flight;
}
