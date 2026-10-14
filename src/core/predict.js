// Coast prediction: where the craft goes from here if the engine stays off.
// Integrates gravity only with the same RK4 as the flight, at a step chosen
// to resolve the path on screen near the craft and the orbit as a whole,
// until it hits the ground, leaves lunar space or closes one full orbit.

import { rk4Step } from './craft.js';
import { elementsOf } from './orbit.js';
import { ESCAPE_RADIUS } from './body.js';

// options: maxTime (s) stops early, used by the alert rules which only care
// about the next few seconds; maxSteps bounds the work per call; drag is the
// craft's drag factor so the path through an atmosphere decays as it will.
export function predictCoast(state, body, terrain, { maxTime = Infinity, maxSteps = 4000, drag = 0 } = {}) {
  const el = elementsOf(state, body);
  const R = body.radius;
  const s = { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
  const alt0 = Math.hypot(s.x, s.y) - R;
  let dt = 0.012 * (Math.max(alt0, 0) + 24) / Math.max(el.v, 1);
  if (Number.isFinite(el.period)) dt = Math.max(Math.min(dt, el.period / 600), el.period / 3000);
  dt = Math.max(0.05, Math.min(10, dt));

  const points = [{ x: s.x, y: s.y, t: 0 }];
  let t = 0;
  let impact = null;
  let escaped = false;
  let closed = false;
  let entry = null;       // first point where the path enters the atmosphere from above
  const atmTop = body.atmosphere ? R + body.atmosphere.height : 0;
  let wasAbove = Math.hypot(s.x, s.y) > atmTop;
  let swept = 0;
  let prevAngle = Math.atan2(s.x, s.y);
  let prevR = Math.hypot(s.x, s.y);
  let prevGround = terrain.groundRadiusAt(s.x, s.y);
  for (let i = 0; i < maxSteps && t < maxTime; i++) {
    const px = s.x; const py = s.y; const pvx = s.vx; const pvy = s.vy;
    // Inside the atmosphere drag changes quickly: keep the step short.
    const inAir = atmTop > 0 && Math.hypot(s.x, s.y) < atmTop + 2000;
    const step = inAir ? Math.min(dt, 1) : dt;
    rk4Step(s, step, body, 0, 0, drag);
    t += step;
    const r = Math.hypot(s.x, s.y);
    if (atmTop > 0) {
      if (wasAbove && r <= atmTop && !entry) entry = { x: s.x, y: s.y, t };
      wasAbove = r > atmTop;
    }
    const ground = terrain.groundRadiusAt(s.x, s.y);
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
      impact = { x: ix, y: iy, t: it, vRadial: ivx * ux + ivy * uy, vTangential: ivx * uy - ivy * ux, speed: Math.hypot(ivx, ivy) };
      points.push({ x: ix, y: iy, t: it });
      break;
    }
    points.push({ x: s.x, y: s.y, t });
    if (r > (Number.isFinite(body.soi) ? body.soi : ESCAPE_RADIUS)) { escaped = true; break; }
    const ang = Math.atan2(s.x, s.y);
    let d = ang - prevAngle;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
    prevAngle = ang;
    prevR = r;
    prevGround = ground;
    if (Math.abs(swept) >= 2 * Math.PI) { closed = true; break; }
  }
  return { points, impact, escaped, closed, entry, elements: el, dt };
}
