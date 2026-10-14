// Built-in designs: the rockets the program hands a new engineer, written
// as the builder would stack them, in the order a career meets them. Plain
// JSON so they save and export like the player's own. Each is checked by
// the test suite to compile without a red-pencil warning.

import { createDesign } from './parts.js';

// 1. A sounding rocket: one small sustainer under a drum of fuel, a probe
// core, a nose cone, fins. Past the Kármán line and down again.
export const KP1_DESIGN = Object.freeze(createDesign('KP-1 SOUNDING ROCKET', [
  'engine-s-lift',
  { id: 'tank-s-long', radials: [{ id: 'fins', count: 2 }] },
  'probe-core',
  'nose-s',
]));

// 2. The Moon-orbit trainer of milestone 2 in parts: two small stages on
// legs, a capsule that can land on its fins... on the Moon.
export const KP2_DESIGN = Object.freeze(createDesign('KP-2 MOON ORBITER', [
  'engine-s-lift',
  { id: 'tank-s-long', radials: [{ id: 'fins', count: 2 }] },
  'decoupler-s',
  'engine-s-vac',
  { id: 'tank-s-short', radials: [{ id: 'legs-s', count: 2 }] },
  'shield-s',
  'capsule-s',
  'parachute',
]));

// 3. The KP-3 of milestone 3: a main engine under the big tank with fins,
// the Moon stage on legs, the ascent stage, and the capsule between its
// shield and its parachute.
export const KP3_DESIGN = Object.freeze(createDesign('KP-3 LUNAR RETURN', [
  'engine-l-main',
  { id: 'tank-l-long', radials: [{ id: 'fins', count: 2 }] },
  'decoupler-l',
  'engine-m-vac',
  { id: 'tank-m-long', radials: [{ id: 'legs-m', count: 2 }] },
  'decoupler-m',
  'engine-s-vac',
  'tank-s-long',
  'decoupler-s',
  'shield-s',
  'capsule-s',
  'parachute',
]));

// 4. A medium two-stage to Earth orbit and back: the lifter with two
// strap-ons, a vacuum stage, a capsule.
export const KP4_DESIGN = Object.freeze(createDesign('KP-4 ORBITAL CAPSULE', [
  'engine-m-lift',
  { id: 'tank-m-long', radials: [{ id: 'booster-m', count: 2 }, { id: 'fins', count: 2 }] },
  'decoupler-m',
  'engine-s-vac',
  'tank-s-long',
  'decoupler-s',
  'shield-s',
  'capsule-s',
  'parachute',
]));

// 5. A satellite carrier: the beeper module under a nose cone on a
// two-stage medium rocket. Mission 7 wants it in a given orbit.
export const KP5_DESIGN = Object.freeze(createDesign('KP-5 SATELLITE CARRIER', [
  'engine-m-lift',
  { id: 'tank-m-long', radials: [{ id: 'booster-s', count: 2 }, { id: 'fins', count: 2 }] },
  'decoupler-m',
  'engine-trim',
  'tank-s-short',
  'probe-core',
  'beeper',
  'nose-s',
]));

// 6. The heavy lifter: the four-chamber cluster with two large strap-ons,
// a medium Moon stage on legs, a two-seat capsule.
export const KP6_DESIGN = Object.freeze(createDesign('KP-6 HEAVY LUNAR', [
  'engine-l-cluster',
  { id: 'tank-l-long', radials: [{ id: 'booster-l', count: 2 }, { id: 'fins', count: 2 }] },
  'tank-l-short',
  'decoupler-l',
  'engine-m-lift',
  'tank-m-long',
  'decoupler-m',
  'engine-m-vac',
  { id: 'tank-m-long', radials: [{ id: 'legs-m', count: 2 }] },
  'decoupler-m',
  'engine-s-vac',
  'tank-s-long',
  'decoupler-s',
  'shield-m',
  'capsule-m',
  'parachute',
]));

export const PRESETS = Object.freeze([KP1_DESIGN, KP2_DESIGN, KP3_DESIGN, KP4_DESIGN, KP5_DESIGN, KP6_DESIGN]);
