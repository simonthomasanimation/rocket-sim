// Celestial bodies and their gravity. The world is 2D side-on with x to the
// right and y up; a body sits at the origin of its own frame and every craft
// position is measured from that centre (body-relative coordinates), so the
// numbers stay small enough for doubles even far from the surface.
//
// Scale rule (decisions.md): radii are one tenth of the real ones and the
// surface gravity is kept, so mu = g * R^2. Orbital speeds come out at about
// a third of the real ones and periods at about a third, which keeps a low
// orbit in the tens of minutes.

export const MOON = Object.freeze({
  name: 'MOON',
  radius: 173700,                   // m, one tenth of the real Moon
  gravity: 1.62,                    // m/s^2 at the surface
  mu: 1.62 * 173700 * 173700,       // m^3/s^2, gravitational parameter
});

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

// Beyond this many radii from the centre a craft has left lunar space; in
// M3 the sphere of influence takes over.
export const ESCAPE_RADII = 3;
