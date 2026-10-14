// Where a flight starts. Each scenario names a craft and a starting state on
// the body; the recording stores the scenario id so a replay rebuilds it.

import { circularSpeed, EARTH, MOON } from './body.js';

export const LOW_EARTH_ORBIT_ALTITUDE = 90000; // m, above the 60 km atmosphere

export const LOW_ORBIT_ALTITUDE = 15000; // m

export const SCENARIOS = {
  descent: {
    id: 'descent',
    go: 'goDescent',
    name: 'DESCENT',
    craft: 'lander',
    body: 'moon',
    onPad: false,
    section: 'SECTION 1 — LUNAR DESCENT TRAINER',
    goal: 'land',
    goalText: 'Land: under 3 m/s down, under 1 m/s sideways, within 10° of upright.',
    brief: '150 m up, drifting and sinking.',
    start: (body) => ({ x: 0, y: body.radius + 150, vx: 3, vy: -6, angle: 0 }),
  },
  launch: {
    id: 'launch',
    go: 'goLaunch',
    name: 'LAUNCH',
    craft: 'rocket',
    body: 'moon',
    onPad: true,
    section: 'SECTION 2 — ORBITAL FLIGHT',
    goal: 'orbit',
    goalText: 'Reach orbit: burn sideways until PE is above the ground. Fuel left is your score.',
    brief: 'A two-stage rocket on Pad 1. Climb, tip over, stage when the first tank runs dry.',
    start: (body) => ({ x: 0, y: body.radius, vx: 0, vy: 0, angle: 0 }),
  },
  orbit: {
    id: 'orbit',
    go: 'goOrbit',
    name: 'ORBIT',
    craft: 'rocket',
    body: 'moon',
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
  earthLaunch: {
    id: 'earthLaunch',
    go: 'goLaunch',
    name: 'EARTH LAUNCH',
    craft: 'rocket3',
    body: 'earth',
    onPad: true,
    section: 'SECTION 3 — EARTH TO MOON',
    goal: 'orbit',
    goalText: 'Reach Earth orbit above the atmosphere with the first stage; the rest of the rocket is for the Moon.',
    brief: 'The three-stage KP-3 on Pad 1, Earth. Heavier gravity, a thin atmosphere to climb out of.',
    start: (body, terrain) => ({ x: 0, y: body.radius + terrain.height(0), vx: 0, vy: 0, angle: 0 }),
  },
  earthOrbit: {
    id: 'earthOrbit',
    go: 'goOrbit',
    name: 'EARTH ORBIT',
    craft: 'rocket3',
    body: 'earth',
    onPad: false,
    section: 'SECTION 3 — EARTH TO MOON',
    goal: 'land',
    goalText: 'Fly to the Moon and land on it: burn prograde when the Moon is about 60° ahead, let its gravity catch you, then come down.',
    brief: 'Stages 2 and 3 of the KP-3 in a 90 km Earth orbit, tanks full.',
    start: (body) => {
      const r = body.radius + LOW_EARTH_ORBIT_ALTITUDE;
      return { x: 0, y: r, vx: circularSpeed(body, r), vy: 0, angle: Math.PI / 2, stage: 1 };
    },
  },
  reentry: {
    id: 'reentry',
    go: 'goOrbit',
    name: 'RE-ENTRY',
    craft: 'rocket3',
    body: 'earth',
    onPad: false,
    section: 'SECTION 3 — EARTH TO MOON',
    goal: 'land',
    goalText: 'Come home: hold retrograde (G) so the shield takes the heat, open the parachute (P) under 250 m/s, splash down under 10 m/s.',
    brief: 'The KP-3 capsule alone, 90 km up, periapsis already inside the air.',
    start: (body) => {
      const r = body.radius + LOW_EARTH_ORBIT_ALTITUDE;
      const a = (r + body.radius + 30000) / 2;
      return { x: 0, y: r, vx: Math.sqrt(body.mu * (2 / r - 1 / a)), vy: 0, angle: -Math.PI / 2, stage: 2, fuel: 60 };
    },
  },
};

export const SCENARIO_ORDER = ['descent', 'launch', 'orbit', 'earthLaunch', 'earthOrbit', 'reentry'];
