// Where a flight starts. Each scenario names a craft and a starting state on
// the body; the recording stores the scenario id so a replay rebuilds it.

import { circularSpeed } from './body.js';

export const LOW_ORBIT_ALTITUDE = 15000; // m

export const SCENARIOS = {
  descent: {
    id: 'descent',
    name: 'DESCENT',
    craft: 'lander',
    onPad: false,
    section: 'SECTION 1 — LUNAR DESCENT TRAINER',
    brief: '150 m up, drifting and sinking. Land with vertical speed under 3 m/s, sideways under 1 m/s, within 10° of upright.',
    start: (body) => ({ x: 0, y: body.radius + 150, vx: 3, vy: -6, angle: 0 }),
  },
  launch: {
    id: 'launch',
    name: 'LAUNCH',
    craft: 'rocket',
    onPad: true,
    section: 'SECTION 2 — ORBITAL FLIGHT',
    brief: 'A two-stage rocket on Pad 1. Climb, tip over and keep burning sideways until the periapsis clears the ground. Stage when the first tank runs dry.',
    start: (body) => ({ x: 0, y: body.radius, vx: 0, vy: 0, angle: 0 }),
  },
  orbit: {
    id: 'orbit',
    name: 'ORBIT',
    craft: 'rocket',
    onPad: false,
    section: 'SECTION 2 — ORBITAL FLIGHT',
    brief: 'The second stage, circling 15 km up. Burn retrograde to come down, then land on the fins.',
    start: (body) => {
      const r = body.radius + LOW_ORBIT_ALTITUDE;
      return { x: 0, y: r, vx: circularSpeed(body, r), vy: 0, angle: Math.PI / 2, stage: 1 };
    },
  },
};

export const SCENARIO_ORDER = ['descent', 'launch', 'orbit'];
