// Craft: a stack of stages on a round body. Pure data and pure functions; no
// DOM, no timers. Units are SI (m, kg, s, radians). Positions are relative to
// the body centre, x to the right and y up.
//
// Position (x, y) is the centre of the craft's base plane, the point that
// touches down. Angle is the heading of the body axis measured clockwise
// from the world +y axis; on the pad directly above the body centre that is
// 0. Tilt is the heading minus the local vertical. The engine pushes along
// the body axis, so leaning right drives the craft to the right.

import { gravityAt, densityAt, normalizeAngle } from './body.js';

export const G0 = 9.80665;

// The M1 lander: one stage, kept forgiving. The ascent stage counts as dry mass.
export const LANDER = Object.freeze({
  id: 'lander',
  name: 'LM TRAINER',
  drawing: 'lander',
  stages: [
    { name: 'DESCENT', dryMass: 2200, fuelMass: 1400, maxThrust: 16000, isp: 300, height: 7.0, footHalfWidth: 4.2 },
  ],
  throttleRate: 1.0,          // throttle fraction per second when ramping
  maxRotRate: Math.PI / 3,    // rad/s, 60 degrees per second
  rotAccel: Math.PI,          // rad/s^2, how fast the rate command is reached
});

// The M2 test rocket: a first stage that nearly reaches orbit and a second
// stage with enough left to circularise, come back down and land on its fins.
export const ROCKET = Object.freeze({
  id: 'rocket',
  name: 'KP-2',
  drawing: 'rocket',
  stages: [
    { name: 'STAGE 1', dryMass: 400, fuelMass: 350, maxThrust: 12000, isp: 250, height: 7.4, radius: 1.0, footHalfWidth: 1.7 },
    { name: 'STAGE 2', dryMass: 700, fuelMass: 300, maxThrust: 5000, isp: 300, height: 6.2, radius: 0.8, footHalfWidth: 1.1 },
  ],
  throttleRate: 1.0,
  maxRotRate: Math.PI / 6,    // 30 degrees per second
  rotAccel: Math.PI / 2,
});

// The M3 three-stage rocket: a first stage for the climb out of Earth's
// atmosphere into orbit, a second stage that flies to the Moon and lands on
// it, and an ascent stage with the capsule (heat shield and parachute) that
// comes home.
export const ROCKET3 = Object.freeze({
  id: 'rocket3',
  name: 'KP-3',
  drawing: 'rocket',
  stages: [
    { name: 'STAGE 1', dryMass: 2600, fuelMass: 18000, maxThrust: 400000, isp: 280, height: 18.0, radius: 1.8, footHalfWidth: 3.0 },
    { name: 'STAGE 2', dryMass: 800, fuelMass: 2600, maxThrust: 30000, isp: 310, height: 7.0, radius: 1.3, footHalfWidth: 2.6 },
    { name: 'STAGE 3', dryMass: 900, fuelMass: 700, maxThrust: 8000, isp: 310, height: 7.7, radius: 1.0, footHalfWidth: 1.6, capsule: true },
  ],
  throttleRate: 1.0,
  maxRotRate: Math.PI / 6,
  rotAccel: Math.PI / 2,
});

export const CRAFTS = { lander: LANDER, rocket: ROCKET, rocket3: ROCKET3 };

export function activeStage(s, cfg) {
  return cfg.stages[s.stage];
}

export function exhaustSpeed(stage) {
  return stage.isp * G0;
}

// Mass of everything still attached: the live stage with its remaining
// fuel, and every stage above it, full.
export function totalMass(s, cfg) {
  let m = s.fuel;
  for (let i = s.stage; i < cfg.stages.length; i++) {
    m += cfg.stages[i].dryMass;
    if (i > s.stage) m += cfg.stages[i].fuelMass;
  }
  return m;
}

// Ideal delta-v left in the live stage and in every stage above it.
export function deltaV(s, cfg) {
  let total = 0;
  let mass = totalMass(s, cfg);
  for (let i = s.stage; i < cfg.stages.length; i++) {
    const st = cfg.stages[i];
    const fuel = i === s.stage ? s.fuel : st.fuelMass;
    const after = mass - fuel;
    if (fuel > 0 && after > 0) total += exhaustSpeed(st) * Math.log(mass / after);
    mass = after - st.dryMass;
  }
  return total;
}

// Thrust-to-weight ratio at full throttle against the surface gravity.
export function twr(s, cfg, body) {
  return activeStage(s, cfg).maxThrust / (totalMass(s, cfg) * body.gravity);
}

// Half the span of whatever the live stage stands on (footpads, fin tips).
export function footHalfWidth(s, cfg) {
  return activeStage(s, cfg).footHalfWidth;
}

// Height from the base plane of the live stage to the top of the craft.
export function craftHeight(s, cfg) {
  let h = 0;
  for (let i = s.stage; i < cfg.stages.length; i++) h += cfg.stages[i].height;
  return h;
}

// Height of the base plane's lowest point above the ground under the craft,
// allowing for tilt. `tilt` is the heading relative to the local vertical.
export function lowestPointAltitude(altitude, tilt, s, cfg) {
  return altitude - Math.abs(Math.sin(tilt)) * footHalfWidth(s, cfg);
}

export function createCraftState(cfg, { x = 0, y = 0, vx = 0, vy = 0, angle = 0, stage = 0, fuel = null } = {}) {
  return {
    x, y, vx, vy,
    angle,
    angVel: 0,
    throttle: 0,    // 0..1, the commanded and actual throttle (no engine lag yet)
    stage,          // index of the live stage, 0 = bottom
    fuel: fuel === null ? cfg.stages[stage].fuelMass : fuel, // kg left in the live stage
    thrust: 0,      // N produced on the last step, for the drawing and HUD
    chute: 0,       // 0 stowed, 1 out, 2 torn away
    time: 0,        // s since the flight began
  };
}

// Command for one step. thr: -1 ramp down / 0 hold / +1 ramp up. rot: -1
// left, 0 none, +1 right. full and cut jump the throttle to 100 % / 0 %.
// stage drops the live stage this tick. hold: 0 none, 1 prograde, 2
// retrograde; an attitude hold that steers when rot is 0. warp: the rails
// level (0 = physics) the tick runs at. chute: open the parachute.
export const NO_COMMAND = Object.freeze({ thr: 0, rot: 0, full: 0, cut: 0, stage: 0, hold: 0, warp: 0, chute: 0 });

// Throttle and fuel for one step; returns the thrust produced. Mutates `s`.
export function runEngine(s, cmd, dt, cfg) {
  if (cmd.cut) s.throttle = 0;
  else if (cmd.full) s.throttle = 1;
  else if (cmd.thr) s.throttle += cmd.thr * cfg.throttleRate * dt;
  if (s.throttle < 0) s.throttle = 0;
  if (s.throttle > 1) s.throttle = 1;
  const st = activeStage(s, cfg);
  let thrust = 0;
  if (s.throttle > 0 && s.fuel > 0) {
    thrust = st.maxThrust * s.throttle;
    const flow = thrust / exhaustSpeed(st);     // kg/s
    const burned = Math.min(s.fuel, flow * dt);
    thrust = burned / dt * exhaustSpeed(st);    // reduced if the tank ran dry mid-step
    s.fuel -= burned;
    if (s.fuel < 1e-9) s.fuel = 0;
  }
  s.thrust = thrust;
  return thrust;
}

// Heading of the velocity vector in the craft's angle convention.
export function progradeAngle(s) {
  return Math.atan2(s.vx, s.vy);
}

// Advance the craft by dt seconds. Returns { staged } where staged is the
// index of a stage dropped this step, or -1. Mutates `s`.
export function stepCraft(s, cmd, dt, cfg, body) {
  let staged = -1;
  if (cmd.stage && s.stage < cfg.stages.length - 1) {
    staged = s.stage;
    // The base plane moves up to the bottom of the next stage.
    const h = cfg.stages[s.stage].height;
    s.x += h * Math.sin(s.angle);
    s.y += h * Math.cos(s.angle);
    s.stage += 1;
    s.fuel = cfg.stages[s.stage].fuelMass;
  }
  const thrust = runEngine(s, cmd, dt, cfg);

  // Rotation: a rate command reached with bounded angular acceleration. The
  // attitude hold steers towards prograde or retrograde when the pilot is
  // not turning by hand and the craft is moving.
  let rot = cmd.rot;
  let targetRate = rot * cfg.maxRotRate;
  if (!rot && cmd.hold && Math.hypot(s.vx, s.vy) > 0.5) {
    const want = progradeAngle(s) + (cmd.hold === 2 ? Math.PI : 0);
    const err = normalizeAngle(want - s.angle);
    targetRate = Math.max(-cfg.maxRotRate, Math.min(cfg.maxRotRate, err * 2.5));
  }
  const maxDelta = cfg.rotAccel * dt;
  const delta = targetRate - s.angVel;
  s.angVel += Math.max(-maxDelta, Math.min(maxDelta, delta));
  s.angle = normalizeAngle(s.angle + s.angVel * dt);

  // Translation under gravity, thrust along the body axis and air drag.
  const m = totalMass(s, cfg);
  const tx = (thrust / m) * Math.sin(s.angle);
  const ty = (thrust / m) * Math.cos(s.angle);
  rk4Step(s, dt, body, tx, ty, dragFactor(s, cfg));
  s.time += dt;
  return { staged };
}

// Drag factor of a stack: Cd * A / (2 m), so that the deceleration is
// factor * rho * v^2. A blunt stack: Cd 0.5 over the live stage's cross
// section, plus the parachute's canopy when it is out.
export function dragFactor(s, cfg) {
  const st = activeStage(s, cfg);
  const radius = st.radius || 2.4;
  let cdA = 0.5 * Math.PI * radius * radius;
  if (s.chute === 1 && st.capsule) cdA += CHUTE_CDA;
  return cdA / (2 * totalMass(s, cfg));
}
export const CHUTE_CDA = 300; // m^2, the main canopy

// Classical fourth-order Runge-Kutta over (x, y, vx, vy) with gravity from
// the body, a constant extra acceleration (tx, ty): the thrust for the
// craft, nothing for coasting debris and predictions, and air drag when the
// body has an atmosphere (`drag` is the factor above, 0 for none). Far more
// accurate per step than Euler, which is what keeps an orbit closed for
// hours of play and lets the predictor take big steps.
export function rk4Step(s, dt, body, tx = 0, ty = 0, drag = 0) {
  const ax = (x, y, vx, vy) => {
    const g = gravityAt(body, x, y);
    let dx = 0; let dy = 0;
    if (drag > 0 && body.atmosphere) {
      const rho = densityAt(body, Math.hypot(x, y));
      if (rho > 0) { const v = Math.hypot(vx, vy); dx = -drag * rho * v * vx; dy = -drag * rho * v * vy; }
    }
    return [g.ax + tx + dx, g.ay + ty + dy];
  };
  const [a1x, a1y] = ax(s.x, s.y, s.vx, s.vy);
  const k1 = [s.vx, s.vy, a1x, a1y];
  const h2 = dt / 2;
  const [a2x, a2y] = ax(s.x + k1[0] * h2, s.y + k1[1] * h2, s.vx + k1[2] * h2, s.vy + k1[3] * h2);
  const k2 = [s.vx + k1[2] * h2, s.vy + k1[3] * h2, a2x, a2y];
  const [a3x, a3y] = ax(s.x + k2[0] * h2, s.y + k2[1] * h2, s.vx + k2[2] * h2, s.vy + k2[3] * h2);
  const k3 = [s.vx + k2[2] * h2, s.vy + k2[3] * h2, a3x, a3y];
  const [a4x, a4y] = ax(s.x + k3[0] * dt, s.y + k3[1] * dt, s.vx + k3[2] * dt, s.vy + k3[3] * dt);
  const k4 = [s.vx + k3[2] * dt, s.vy + k3[3] * dt, a4x, a4y];
  const w = dt / 6;
  s.x += w * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  s.y += w * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  s.vx += w * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  s.vy += w * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
}

// Throttle the command would set this step, without touching the state.
export function commandedThrottle(s, cmd, dt, cfg) {
  let t = s.throttle;
  if (cmd.cut) t = 0;
  else if (cmd.full) t = 1;
  else if (cmd.thr) t += cmd.thr * cfg.throttleRate * dt;
  return Math.max(0, Math.min(1, t));
}
