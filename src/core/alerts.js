// Alert levels for the instruments, per the brief: 'caution' is an accent
// outline blinking at 1 Hz, 'critical' an accent fill blinking at 2 Hz, and
// nothing else is ever red-orange. Pure function of flight state.

import { activeStage } from './craft.js';

export function computeAlerts(flight, prediction) {
  const s = flight.state;
  const { limits, cfg } = flight;
  const alt = flight.altitude();
  const { vertical, horizontal } = flight.groundSpeeds();
  const vSpeed = -vertical;
  const hSpeed = Math.abs(horizontal);
  const tiltAngle = flight.tilt();
  const stage = activeStage(s, cfg);
  const fuelFrac = stage.fuelMass > 0 ? s.fuel / stage.fuelMass : 0;
  const moreStages = s.stage < cfg.stages.length - 1;
  const impact = prediction && prediction.impact;
  const flying = flight.phase === 'flying';
  const el = flight.elements;

  // An empty tank is critical unless there is another stage to light.
  const fuel = !flying && flight.phase !== 'pad' ? 'none' : s.fuel <= 0 ? (moreStages ? 'caution' : 'critical') : fuelFrac < 0.15 ? 'caution' : 'none';
  // Falling fast with the ground close: critical when the engine-off impact
  // is under ten seconds and too hard; caution when the rate is over the
  // limit within the last sixty metres. Only while actually coming down: a
  // rocket climbing off the pad would also hit hard with its engine off.
  const descent = !flying || vSpeed <= 0 ? 'none'
    : impact && impact.t < 10 && -impact.vRadial >= limits.verticalSpeed * 2 ? 'critical'
    : alt < 60 && vSpeed >= limits.verticalSpeed ? 'caution'
    : 'none';
  const drift = !flying ? 'none' : alt < 30 && hSpeed >= limits.horizontalSpeed ? 'caution' : 'none';
  const tilt = !flying ? 'none' : alt < 30 && Math.abs(tiltAngle) >= limits.tilt ? 'caution' : 'none';
  // Re-entry heating against what the craft can take.
  const heatFrac = flying ? flight.heat() : 0;
  const heat = heatFrac >= 0.8 ? 'critical' : heatFrac >= 0.5 ? 'caution' : 'none';
  const worst = ['critical', 'caution', 'none'].find((l) => [fuel, descent, drift, tilt, heat].includes(l));
  return {
    fuel, descent, drift, tilt, heat,
    heatFrac,
    chute: s.chute,
    overall: worst,
    altitude: alt,
    vSpeed, hSpeed, tiltAngle, fuelFrac,
    speed: Math.hypot(s.vx, s.vy),
    // Orbit figures for the readouts; the periapsis is marked (static
    // accent) while it lies below the surface, i.e. the path meets the ground.
    apAlt: el ? el.apAlt : Infinity,
    peAlt: el ? el.peAlt : -Infinity,
    period: el ? el.period : Infinity,
    peBelow: !!el && el.peAlt < 0,
    // A periapsis inside the atmosphere: the orbit will decay (caution).
    peInAir: !!el && el.peAlt >= 0 && !!flight.body.atmosphere && el.peAlt < flight.body.atmosphere.height && el.e < 1,
  };
}
