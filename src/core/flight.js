// One flight of the lander from release to touchdown. Owns the lander state,
// keeps the previous tick for render interpolation, and will later own the
// landing rules and the input recording. No DOM.

import { createLanderState, stepLander, NO_COMMAND, LANDER, MOON } from './lander.js';
import { createRng } from './rng.js';

export const DEFAULT_START = Object.freeze({ x: 0, y: 150, vx: 3, vy: -6, angle: 0 });

export function createFlight({ seed = 1, start = DEFAULT_START, cfg = LANDER, body = MOON } = {}) {
  const rng = createRng(seed);
  const flight = {
    seed,
    cfg,
    body,
    rng,
    tick: 0,
    phase: 'flying',          // flying | landed | crashed
    state: createLanderState(start),
    prev: null,
    step(cmd = NO_COMMAND, dt = 1 / 60) {
      flight.prev = { ...flight.state };
      if (flight.phase !== 'flying') { flight.tick += 1; return; }
      stepLander(flight.state, cmd, dt, cfg, body);
      // Until the landing rules arrive, the surface simply stops the craft.
      if (flight.state.y <= 0) {
        flight.state.y = 0;
        flight.state.vx = 0;
        flight.state.vy = 0;
        flight.state.angVel = 0;
        flight.phase = 'landed';
      }
      flight.tick += 1;
    },
  };
  flight.prev = { ...flight.state };
  return flight;
}

// State as seen alpha of the way from the previous tick to the current one.
export function interpolated(flight, alpha) {
  const a = flight.prev || flight.state;
  const b = flight.state;
  const t = Math.max(0, Math.min(1, alpha));
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: a.angle + (b.angle - a.angle) * t,
  };
}
