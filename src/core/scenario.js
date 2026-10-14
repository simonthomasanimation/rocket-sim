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
    goal: 'land',
    goalText: 'Land: under 3 m/s down, under 1 m/s sideways, within 10° of upright.',
    brief: '150 m up, drifting and sinking.',
    start: (body) => ({ x: 0, y: body.radius + 150, vx: 3, vy: -6, angle: 0 }),
  },
  launch: {
    id: 'launch',
    name: 'LAUNCH',
    craft: 'rocket',
    onPad: true,
    section: 'SECTION 2 — ORBITAL FLIGHT',
    goal: 'orbit',
    goalText: 'Reach orbit: burn sideways until PE is above the ground. Fuel left is your score.',
    brief: 'A two-stage rocket on Pad 1. Climb, tip over, stage when the first tank runs dry.',
    start: (body) => ({ x: 0, y: body.radius, vx: 0, vy: 0, angle: 0 }),
  },
  orbit: {
    id: 'orbit',
    name: 'ORBIT',
    craft: 'rocket',
    onPad: false,
    section: 'SECTION 2 — ORBITAL FLIGHT',
    goal: 'land',
    goalText: 'Come down and land on the fins: under 3 m/s down, under 1 m/s sideways, upright.',
    brief: 'The second stage, circling 15 km up. Burn retrograde to drop PE below the ground.',
    start: (body) => {
      const r = body.radius + LOW_ORBIT_ALTITUDE;
      return { x: 0, y: r, vx: circularSpeed(body, r), vy: 0, angle: Math.PI / 2, stage: 1 };
    },
  },
};

export const SCENARIO_ORDER = ['descent', 'launch', 'orbit'];
