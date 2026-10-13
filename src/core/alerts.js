// Alert levels for the instruments, per the brief: 'caution' is an accent
// outline blinking at 1 Hz, 'critical' an accent fill blinking at 2 Hz, and
// nothing else is ever red-orange. Pure function of flight state.

export function computeAlerts(flight, prediction) {
  const s = flight.state;
  const { limits, cfg } = flight;
  const alt = flight.altitude();
  const vSpeed = -s.vy;
  const hSpeed = Math.abs(s.vx);
  const fuelFrac = s.fuel / cfg.fuelMass;
  const impact = prediction && prediction.impact;
  const flying = flight.phase === 'flying';

  const fuel = !flying ? 'none' : s.fuel <= 0 ? 'critical' : fuelFrac < 0.15 ? 'caution' : 'none';
  // Falling fast with the ground close: critical when the engine-off impact
  // is under ten seconds and too hard; caution when the rate is over the
  // limit within the last sixty metres.
  const descent = !flying ? 'none'
    : impact && impact.t < 10 && -impact.vy >= limits.verticalSpeed * 2 ? 'critical'
    : alt < 60 && vSpeed >= limits.verticalSpeed ? 'caution'
    : 'none';
  const drift = !flying ? 'none' : alt < 30 && hSpeed >= limits.horizontalSpeed ? 'caution' : 'none';
  const tilt = !flying ? 'none' : alt < 30 && Math.abs(s.angle) >= limits.tilt ? 'caution' : 'none';
  const worst = ['critical', 'caution', 'none'].find((l) => [fuel, descent, drift, tilt].includes(l));
  return { fuel, descent, drift, tilt, overall: worst, altitude: alt, vSpeed, hSpeed, fuelFrac };
}
