// The lunar lander: a rigid body on a flat Moon with uniform gravity.
// Pure data and pure functions; no DOM, no timers. Units are SI (m, kg, s,
// radians). The world is 2D side-on: x to the right, y up, the surface at y = 0.
//
// Position (x, y) is the centre of the footpad plane, the point that touches
// down. Angle is the tilt from vertical, positive when the top leans right
// (clockwise on screen); the engine pushes along the body axis, so leaning
// right drives the craft to the right.

export const MOON = {
  name: 'MOON',
  gravity: 1.62,          // m/s^2, uniform for the flat-Moon milestone
};

// Vehicle definition. Roughly a small two-stage lander, kept forgiving.
export const LANDER = {
  dryMass: 2200,          // kg, structure + crew + ascent stage
  fuelMass: 1400,         // kg, full descent tank
  maxThrust: 16000,       // N at 100 % throttle
  isp: 300,               // s; exhaust speed = isp * g0
  g0: 9.80665,
  minThrottle: 0,         // the descent engine throttles all the way down
  throttleRate: 1.0,      // throttle fraction per second when ramping
  maxRotRate: Math.PI / 3,    // rad/s, 60 degrees per second
  rotAccel: Math.PI,          // rad/s^2, how fast the rate command is reached
  comDry: 3.1,            // m above the footpads, centre of mass with empty tanks
  comFuel: 1.6,           // m above the footpads, centre of mass of the fuel
  footHalfWidth: 4.2,     // m, half the span between outer footpads
  height: 7.0,            // m, footpads to top of the cabin
};

export function exhaustSpeed(cfg = LANDER) {
  return cfg.isp * cfg.g0;
}

export function totalMass(s, cfg = LANDER) {
  return cfg.dryMass + s.fuel;
}

// Height of the centre of mass above the footpads for the current fuel load.
export function comHeight(s, cfg = LANDER) {
  const m = totalMass(s, cfg);
  return (cfg.dryMass * cfg.comDry + s.fuel * cfg.comFuel) / m;
}

// Thrust-to-weight ratio at the current throttle and mass.
export function twr(s, cfg = LANDER, body = MOON) {
  return (cfg.maxThrust * s.throttle) / (totalMass(s, cfg) * body.gravity);
}

// Altitude of the lowest footpad above the ground height under the craft,
// accounting for tilt.
export function lowestPointAltitude(s, cfg = LANDER, groundHeight = 0) {
  return s.y - groundHeight - Math.abs(Math.sin(s.angle)) * cfg.footHalfWidth;
}

export function createLanderState({ x = 0, y = 150, vx = 0, vy = 0, angle = 0, fuel = LANDER.fuelMass } = {}) {
  return {
    x, y, vx, vy,
    angle,
    angVel: 0,
    throttle: 0,    // 0..1, the commanded and actual throttle (no engine lag yet)
    fuel,           // kg remaining
    thrust: 0,      // N produced on the last step, for the drawing and HUD
    time: 0,        // s since the flight began
  };
}

// Command for one step. thr: -1 ramp down / 0 hold / +1 ramp up. rot: -1 left,
// 0 none, +1 right. full and cut jump the throttle to 100 % / 0 %.
export const NO_COMMAND = Object.freeze({ thr: 0, rot: 0, full: 0, cut: 0 });

// Advance the lander by dt seconds with semi-implicit (symplectic) Euler:
// velocities first, then positions with the new velocities. Mutates `s`.
export function stepLander(s, cmd, dt, cfg = LANDER, body = MOON) {
  // Throttle command.
  if (cmd.cut) s.throttle = 0;
  else if (cmd.full) s.throttle = 1;
  else if (cmd.thr) s.throttle += cmd.thr * cfg.throttleRate * dt;
  if (s.throttle < cfg.minThrottle) s.throttle = cfg.minThrottle;
  if (s.throttle > 1) s.throttle = 1;

  // Engine: thrust needs fuel; the tank can only give what it has this step.
  let thrust = 0;
  if (s.throttle > 0 && s.fuel > 0) {
    thrust = cfg.maxThrust * s.throttle;
    const flow = thrust / exhaustSpeed(cfg);     // kg/s
    const burned = Math.min(s.fuel, flow * dt);
    thrust = burned / dt * exhaustSpeed(cfg);    // reduced if the tank ran dry mid-step
    s.fuel -= burned;
    if (s.fuel < 1e-9) s.fuel = 0;
  }
  s.thrust = thrust;

  // Rotation: a rate command reached with bounded angular acceleration.
  const targetRate = cmd.rot * cfg.maxRotRate;
  const maxDelta = cfg.rotAccel * dt;
  const delta = targetRate - s.angVel;
  s.angVel += Math.max(-maxDelta, Math.min(maxDelta, delta));

  // Translation.
  const m = totalMass(s, cfg);
  const ax = (thrust / m) * Math.sin(s.angle);
  const ay = (thrust / m) * Math.cos(s.angle) - body.gravity;
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.angle += s.angVel * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.time += dt;
  return s;
}
