// Built-in designs: the rockets the program hands a new engineer, written
// as the builder would stack them. Plain JSON so they save and export like
// the player's own. M4 grows this to six presets.

import { createDesign } from './parts.js';

// The KP-3 of milestone 3 as a design: a main engine under the big tank
// with fins, the Moon stage on legs, the ascent stage, and the capsule
// between its shield and its parachute.
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

export const PRESETS = Object.freeze([KP3_DESIGN]);
