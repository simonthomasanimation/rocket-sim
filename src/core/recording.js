// Flight recording: the seed, the scenario and every change of command
// stamped with its tick. Because the simulation is fixed-step and seeded,
// feeding the same events back reproduces the flight exactly: that is the
// replay (see playback.js), and later the local ghost.

import { NO_COMMAND } from './craft.js';

export const RECORDING_VERSION = 2;

// Commands pack into one small integer: thr (-1..1) in bits 0-1, rot in
// bits 2-3, full in bit 4, cut in bit 5, stage in bit 6, hold (0..2) in
// bits 7-8.
export function encodeCommand(c) {
  return ((c.thr + 1) & 3) | (((c.rot + 1) & 3) << 2) | ((c.full ? 1 : 0) << 4) | ((c.cut ? 1 : 0) << 5)
    | ((c.stage ? 1 : 0) << 6) | (((c.hold || 0) & 3) << 7);
}

export function decodeCommand(code) {
  return {
    thr: (code & 3) - 1,
    rot: ((code >> 2) & 3) - 1,
    full: (code >> 4) & 1,
    cut: (code >> 5) & 1,
    stage: (code >> 6) & 1,
    hold: (code >> 7) & 3,
  };
}

export const NO_COMMAND_CODE = encodeCommand(NO_COMMAND);

// Records command changes as [tick, code] pairs.
export function createRecorder({ seed, scenario }) {
  const events = [];
  let lastCode = NO_COMMAND_CODE;
  let ticks = 0; // ticks recorded so far, so an unfinished flight replays up to "now"
  return {
    record(tick, cmd) {
      ticks = tick + 1;
      const code = encodeCommand(cmd);
      if (code === lastCode) return;
      lastCode = code;
      events.push([tick, code]);
    },
    toJSON() {
      return { version: RECORDING_VERSION, seed, scenario, ticks, events: events.slice() };
    },
  };
}
