// Flight recording: the seed, the start and every change of command stamped
// with its tick. Because the simulation is fixed-step and seeded, feeding
// the same events back reproduces the flight exactly: that is the replay
// (see playback.js), and later the local ghost.

import { NO_COMMAND } from './lander.js';

export const RECORDING_VERSION = 1;

// Commands pack into one small integer: thr (-1..1) in bits 0-1, rot in
// bits 2-3, full in bit 4, cut in bit 5.
export function encodeCommand(c) {
  return ((c.thr + 1) & 3) | (((c.rot + 1) & 3) << 2) | ((c.full ? 1 : 0) << 4) | ((c.cut ? 1 : 0) << 5);
}

export function decodeCommand(code) {
  return {
    thr: (code & 3) - 1,
    rot: ((code >> 2) & 3) - 1,
    full: (code >> 4) & 1,
    cut: (code >> 5) & 1,
  };
}

export const NO_COMMAND_CODE = encodeCommand(NO_COMMAND);

// Records command changes as [tick, code] pairs.
export function createRecorder({ seed, start }) {
  const events = [];
  let lastCode = NO_COMMAND_CODE;
  return {
    record(tick, cmd) {
      const code = encodeCommand(cmd);
      if (code === lastCode) return;
      lastCode = code;
      events.push([tick, code]);
    },
    toJSON() {
      return { version: RECORDING_VERSION, seed, start: { ...start }, events: events.slice() };
    },
  };
}
