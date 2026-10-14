// Celestial bodies, their gravity and their orbits. The world is 2D side-on
// with x to the right and y up. A craft's position is always measured from
// the centre of the body whose sphere of influence it is in (body-relative
// coordinates), so the numbers stay small enough for doubles.
//
// Scale rule (decisions.md): radii and distances are one tenth of the real
// ones and surface gravity is kept, so mu = g * R^2. Orbital speeds come out
// at about a third of the real ones and periods at about a third: a low
// Earth orbit takes half an hour, the Moon goes round in 8.7 days and a
// transfer to it takes about 38 hours. Bodies do not spin.

const EARTH_RADIUS = 637100;
const EARTH_G = 9.81;
const EARTH_MU = EARTH_G * EARTH_RADIUS * EARTH_RADIUS;
const MOON_RADIUS = 173700;
const MOON_G = 1.62;
const MOON_MU = MOON_G * MOON_RADIUS * MOON_RADIUS;
const MOON_ORBIT = 38440000;

export const EARTH = Object.freeze({
  id: 'earth',
  name: 'EARTH',
  radius: EARTH_RADIUS,
  gravity: EARTH_G,
  mu: EARTH_MU,
  parent: null,
  orbitRadius: 0,
  soi: Infinity,
  atmosphere: null,          // filled in by the atmosphere task
  texture: 'earth',
});

export const MOON = Object.freeze({
  id: 'moon',
  name: 'MOON',
  radius: MOON_RADIUS,
  gravity: MOON_G,
  mu: MOON_MU,
  parent: 'earth',
  orbitRadius: MOON_ORBIT,
  phase0: Math.PI / 3,       // where the Moon is at clock 0, radians counter-clockwise from +x
  // Sphere of influence: a (m/M)^(2/5), about 38 Moon radii.
  soi: MOON_ORBIT * Math.pow(MOON_MU / EARTH_MU, 0.4),
  atmosphere: null,
  texture: 'moon',
});

export const BODIES = { earth: EARTH, moon: MOON };

// Mean motion of a body's circular orbit round its parent (rad/s).
export function meanMotion(body) {
  if (!body.parent) return 0;
  const parent = BODIES[body.parent];
  return Math.sqrt(parent.mu / (body.orbitRadius ** 3));
}

export function orbitalPeriod(body) {
  const n = meanMotion(body);
  return n > 0 ? (2 * Math.PI) / n : Infinity;
}

// Position and velocity of a body relative to its parent at a clock time
// (seconds). Circular orbit, counter-clockwise.
export function bodyState(body, clock) {
  if (!body.parent) return { x: 0, y: 0, vx: 0, vy: 0 };
  const n = meanMotion(body);
  const a = body.orbitRadius;
  const th = body.phase0 + n * clock;
  return { x: a * Math.cos(th), y: a * Math.sin(th), vx: -a * n * Math.sin(th), vy: a * n * Math.cos(th) };
}

// Children of a body (bodies that orbit it).
export function childrenOf(body) {
  return Object.values(BODIES).filter((b) => b.parent === body.id);
}

// Acceleration due to gravity at a body-relative position.
export function gravityAt(body, x, y) {
  const r2 = x * x + y * y;
  const r = Math.sqrt(r2);
  if (r < 1) return { ax: 0, ay: 0 };
  const g = body.mu / r2;
  return { ax: -g * x / r, ay: -g * y / r };
}

// Local vertical as a heading: the angle of "up" measured clockwise from the
// world +y axis, the same convention a craft's angle uses. Directly above the
// body (x = 0, y > 0) up is 0; to the right of the body it is +90 degrees.
export function upAngle(x, y) {
  return Math.atan2(x, y);
}

export function radiusAt(x, y) {
  return Math.hypot(x, y);
}

// Speed of a circular orbit at distance r from the centre.
export function circularSpeed(body, r) {
  return Math.sqrt(body.mu / r);
}

export function normalizeAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// A craft this far out from the root body has left the system: in M3 that
// is well beyond the Moon's orbit.
export const ESCAPE_RADIUS = 4 * MOON_ORBIT;
