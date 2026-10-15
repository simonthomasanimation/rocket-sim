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
    { name: 'STAGE 2', dryMass: 800, fuelMass: 3200, maxThrust: 30000, isp: 310, height: 7.0, radius: 1.3, footHalfWidth: 2.6 },
    { name: 'STAGE 3', dryMass: 150, fuelMass: 700, maxThrust: 8000, isp: 310, height: 5.3, radius: 1.0, footHalfWidth: 1.6 },
    { name: 'CAPSULE', dryMass: 750, fuelMass: 0, maxThrust: 0, isp: 0, height: 2.4, radius: 1.0, footHalfWidth: 1.2, capsule: true, shield: true, chute: true },
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
    chute: 0,       // 0 stowed, 3 drogue out, 4 main reefed, 1 main full, 2 torn away (a stage with `chute` only)
    chuteT: 0,      // s since the current canopy came out
    heat: 0,        // entry heating as a fraction of what the craft can take
    broken: 0,      // 1 once the heat has torn the craft apart
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
export function stepCraft(s, cmd, dt, cfg, body, groundRadius = null) {
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
  // The parachutes: one command, on the capsule stage, puts the drogue
  // out (too fast and it tears away). The rest is automatic, as on a real
  // capsule: once the drogue has the capsule under MAIN_SPEED and under
  // MAIN_HEIGHT above the ground, the main comes out reefed (a narrow
  // cone, a fifth of its drag) for REEF_TIME, then blooms to full over
  // BLOOM_TIME.
  if (cmd.chute && s.chute === 0 && activeStage(s, cfg).chute) { s.chute = Math.hypot(s.vx, s.vy) > CHUTE_MAX_SPEED ? 2 : 3; s.chuteT = 0; }
  if (s.chute === 3 || s.chute === 4) {
    s.chuteT += dt;
    if (s.chute === 3 && Math.hypot(s.vx, s.vy) < MAIN_SPEED && Math.hypot(s.x, s.y) - (groundRadius || body.radius) < MAIN_HEIGHT) { s.chute = 4; s.chuteT = 0; }
    else if (s.chute === 4 && s.chuteT >= REEF_TIME + BLOOM_TIME) s.chute = 1;
  }

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
  if (st.chute) cdA += canopyCdA(s);
  return cdA / (2 * totalMass(s, cfg));
}
// Drag area of whatever canopy is out.
export function canopyCdA(s) {
  if (s.chute === 1) return CHUTE_CDA;
  if (s.chute === 3) return DROGUE_CDA;
  if (s.chute === 4) return CHUTE_CDA * (REEF_FRACTION + (1 - REEF_FRACTION) * canopyBloom(s));
  return 0;
}
// How far the main has opened past its reefed cone: 0 reefed, 1 full.
export function canopyBloom(s) {
  if (s.chute === 1) return 1;
  if (s.chute !== 4) return 0;
  return Math.max(0, Math.min(1, (s.chuteT - REEF_TIME) / BLOOM_TIME));
}
export const CHUTE_CDA = 520;  // m^2, the main canopy full: about 5.4 m/s at the sea with the capsule, under 9 m/s on the highest ground
export const DROGUE_CDA = 12;  // m^2, the drogue: about 30 m/s at the sea, 45 m/s at 4 km
export const REEF_FRACTION = 0.2; // the reefed main's share of its full drag area
export const REEF_TIME = 4;    // s the main stays reefed
export const BLOOM_TIME = 1;   // s it takes to open fully after that
export const MAIN_SPEED = 90;  // m/s, the main comes out under this speed...
export const MAIN_HEIGHT = 3000; // m ...and this height above the ground (radar, so a mountain counts)
export const CHUTE_MAX_SPEED = 250; // m/s; the drogue opened faster than this tears away

// Heating limits for rho * v^3: a bare stack chars at the first, a capsule
// flying shield-first holds to the second (a return from the Moon reaches
// about 60 % of it). Heating only counts once the craft is fast enough to
// heat the air in front of it: nothing under HEAT_SPEED_0, the full
// rho * v^3 from HEAT_SPEED_1 up, so a brisk climb through thick air is
// safe and an entry from orbit (1,400 m/s and up) is as it always was.
export const HEAT_BARE = 3e7;
export const HEAT_SPEED_0 = 500;  // m/s
export const HEAT_SPEED_1 = 1000; // m/s
export const HEAT_SHIELDED = 2.5e8;

// Heat flux measure rho * v^3 at the craft.
export function heatFlux(s, body) {
  const rho = densityAt(body, Math.hypot(s.x, s.y));
  if (rho <= 0) return 0;
  const v = Math.hypot(s.vx, s.vy);
  const ramp = Math.max(0, Math.min(1, (v - HEAT_SPEED_0) / (HEAT_SPEED_1 - HEAT_SPEED_0)));
  return rho * v * v * v * ramp;
}

// The heat shield counts only on the stage that carries one (the capsule
// between its shield and its parachute), flying alone, with its base
// within 60 degrees of retrograde.
export function isShielded(s, cfg) {
  const st = activeStage(s, cfg);
  if (!st.shield) return false;
  const v = Math.hypot(s.vx, s.vy);
  if (v < 1) return true;
  const retro = Math.atan2(-s.vx, -s.vy);
  const err = Math.abs(normalizeAngle(s.angle - retro));
  return err < Math.PI / 3;
}

export function heatLimit(s, cfg) {
  return isShielded(s, cfg) ? HEAT_SHIELDED : HEAT_BARE;
}

// Classical fourth-order Runge-Kutta over (x, y, vx, vy) with gravity from
// the body, a constant extra acceleration (tx, ty): the thrust for the
// craft, nothing for coasting debris and predictions, and air drag when the
// body has an atmosphere (`drag` is the factor above, 0 for none). Far more
// accurate per step than Euler, which is what keeps an orbit closed for
// hours of play and lets the predictor take big steps.
export function rk4Step(s, dt, body, tx = 0, ty = 0, drag = 0) {
  // Under a parachute the drag is stiff: it can take the whole speed off in
  // a fraction of the step, and a step longer than that time constant makes
  // the integrator blow up (a predicted path billions of metres long, and a
  // camera zooming out to fit it). Take as many sub-steps as the stiffness
  // asks for; the flight and the prediction share the rule.
  if (drag > 0 && body.atmosphere) {
    const rho = densityAt(body, Math.hypot(s.x, s.y));
    const stiffness = drag * rho * Math.hypot(s.vx, s.vy) * dt;
    if (stiffness > STIFF_STEP) {
      const n = Math.min(400, Math.ceil(stiffness / STIFF_STEP));
      for (let i = 0; i < n; i++) rk4Single(s, dt / n, body, tx, ty, drag);
      return;
    }
  }
  rk4Single(s, dt, body, tx, ty, drag);
}
const STIFF_STEP = 0.2; // the share of the speed drag may take off in one sub-step

function rk4Single(s, dt, body, tx, ty, drag) {
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
