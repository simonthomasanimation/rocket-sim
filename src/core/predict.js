// Coast prediction: where the craft goes from here if the engine stays off.
// Integrates gravity (and drag) with the same RK4 as the flight, at a step
// chosen to resolve the path on screen near the craft and the orbit as a
// whole, until it hits the ground, leaves the system or closes one full
// orbit. Patched conics: when the path leaves the body's sphere of
// influence or enters a child's, the integration carries on in that body's
// frame, and the points record which frame they are in together with the
// offset that places that frame on the starting one.

import { rk4Step } from './craft.js';
import { elementsOf } from './orbit.js';
import { BODIES, ESCAPE_RADIUS, bodyState, childrenOf, frameOffset } from './body.js';

// options: maxTime (s) stops early, used by the alert rules which only care
// about the next few seconds; maxSteps bounds the work per call; drag is the
// craft's drag factor; clock is the flight clock now (for where the other
// bodies are); terrainOf gives the terrain of another body for impacts.
export function predictCoast(state, body, terrain, { maxTime = Infinity, maxSteps = 4000, drag = 0, clock = 0, terrainOf = null } = {}) {
  const el = elementsOf(state, body);
  let cur = body;
  let curTerrain = terrain;
  let R = cur.radius;
  const s = { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
  let dt = stepFor(s, cur, el);

  // Each segment carries the offset that places its frame on the starting
  // one, taken at the moment the segment begins.
  const segments = [{ body: cur.id, from: 0, offset: { x: 0, y: 0 }, t: 0 }];
  const points = [{ x: s.x, y: s.y, t: 0 }];
  let t = 0;
  let impact = null;
  let escaped = false;
  let closed = false;
  let entry = null;       // first point where the path enters an atmosphere from above
  let encounter = null;   // first entry into a child's sphere of influence
  let exit = null;        // first exit to the parent's
  let atmTop = cur.atmosphere ? R + cur.atmosphere.height : 0;
  let wasAbove = Math.hypot(s.x, s.y) > atmTop;
  let swept = 0;
  let prevAngle = Math.atan2(s.x, s.y);
  let prevR = Math.hypot(s.x, s.y);
  let prevGround = groundRadius(curTerrain, cur, s.x, s.y);
  const children = childrenOf(cur);
  let transitions = 0;

  for (let i = 0; i < maxSteps && t < maxTime; i++) {
    const px = s.x; const py = s.y; const pvx = s.vx; const pvy = s.vy;
    // Inside the atmosphere drag changes quickly: keep the step short.
    const inAir = atmTop > 0 && Math.hypot(s.x, s.y) < atmTop + 2000;
    const step = inAir ? Math.min(dt, 1) : dt;
    rk4Step(s, step, cur, 0, 0, drag);
    t += step;
    const r = Math.hypot(s.x, s.y);
    if (atmTop > 0) {
      if (wasAbove && r <= atmTop && !entry) entry = { x: s.x, y: s.y, t, seg: segments.length - 1 };
      wasAbove = r > atmTop;
    }
    const ground = groundRadius(curTerrain, cur, s.x, s.y);
    if (r <= ground) {
      // Linear interpolation to the ground within this step.
      const above = prevR - prevGround;
      const f = above / Math.max(1e-9, above - (r - ground));
      const ix = px + (s.x - px) * f;
      const iy = py + (s.y - py) * f;
      const ivx = pvx + (s.vx - pvx) * f;
      const ivy = pvy + (s.vy - pvy) * f;
      const ir = Math.hypot(ix, iy);
      const ux = ix / ir; const uy = iy / ir;
      const it = t - step + step * f;
      impact = { x: ix, y: iy, t: it, body: cur.id, seg: segments.length - 1, vRadial: ivx * ux + ivy * uy, vTangential: ivx * uy - ivy * ux, speed: Math.hypot(ivx, ivy) };
      points.push({ x: ix, y: iy, t: it });
      break;
    }
    points.push({ x: s.x, y: s.y, t });

    // Sphere-of-influence changes (at most a few per prediction).
    let changed = false;
    if (transitions < 4) {
      const T = clock + t;
      if (cur.parent && r > cur.soi) {
        const parent = BODIES[cur.parent];
        const b = bodyState(cur, T);
        s.x += b.x; s.y += b.y; s.vx += b.vx; s.vy += b.vy;
        if (!exit) exit = { x: px, y: py, t, body: cur.id, seg: segments.length - 1 };
        cur = parent;
        changed = true;
      } else {
        for (const child of childrenOf(cur)) {
          const c = bodyState(child, T);
          const dx = s.x - c.x; const dy = s.y - c.y;
          if (Math.hypot(dx, dy) < child.soi) {
            s.x = dx; s.y = dy; s.vx -= c.vx; s.vy -= c.vy;
            if (!encounter) encounter = { t, body: child.id, seg: segments.length, x: s.x, y: s.y };
            cur = child;
            changed = true;
            break;
          }
        }
      }
    }
    if (changed) {
      transitions += 1;
      R = cur.radius;
      curTerrain = terrainOf ? terrainOf(cur) : null;
      atmTop = cur.atmosphere ? R + cur.atmosphere.height : 0;
      wasAbove = Math.hypot(s.x, s.y) > atmTop;
      segments.push({ body: cur.id, from: points.length, offset: frameOffset(body, cur, clock + t), t });
      points.push({ x: s.x, y: s.y, t });
      swept = 0;
      prevAngle = Math.atan2(s.x, s.y);
      prevR = Math.hypot(s.x, s.y);
      prevGround = groundRadius(curTerrain, cur, s.x, s.y);
      dt = stepFor(s, cur, elementsOf(s, cur));
      continue;
    }
    if (!cur.parent && r > ESCAPE_RADIUS) { escaped = true; break; }
    const ang = Math.atan2(s.x, s.y);
    let d = ang - prevAngle;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
    prevAngle = ang;
    prevR = r;
    prevGround = ground;
    if (Math.abs(swept) >= 2 * Math.PI) { closed = true; break; }
  }
  return { points, segments, impact, escaped, closed, entry, encounter, exit, elements: el, dt, body: body.id };
}

function groundRadius(terrain, body, x, y) {
  return terrain ? terrain.groundRadiusAt(x, y) : body.radius;
}

// Step size: resolves the path on screen near the craft and the ellipse as
// a whole; coarser far out where nothing happens quickly.
function stepFor(s, body, el) {
  const alt = Math.hypot(s.x, s.y) - body.radius;
  let dt = 0.012 * (Math.max(alt, 0) + 24) / Math.max(el.v, 1);
  if (Number.isFinite(el.period)) dt = Math.max(Math.min(dt, el.period / 600), el.period / 3000);
  else dt = Math.max(dt, Math.hypot(s.x, s.y) / Math.max(el.v, 1) / 400);
  return Math.max(0.05, Math.min(600, dt));
}
