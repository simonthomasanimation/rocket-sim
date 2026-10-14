// CAPCOM: the one voice on the loop. A small bank of canned lines, each
// said once per flight when its trigger first holds. Pure logic; the HUD
// decides how to print it.

export const LINES = {
  go: 'Go for descent. Watch your rate.',
  fuelLow: 'Fuel at fifteen percent. Commit or abort.',
  fuelOut: 'We show zero fuel. Ride it down.',
  rate: 'Descent rate is too high. Throttle up.',
  drift: 'You are drifting sideways. Level off.',
  landed: 'Contact light. Engine stop. Welcome to the Moon.',
  crashed: 'We have lost your signal.',
  aborted: 'You are leaving the training area. Flight terminated.',
};

export function createCapcom() {
  const said = new Set();
  const log = [];
  function say(key, tick, critical = false) {
    if (said.has(key)) return;
    said.add(key);
    log.push({ key, text: LINES[key], tick, critical });
  }
  return {
    log,
    get latest() { return log[log.length - 1] || null; },
    // Call once per tick with the flight and its current alerts.
    update(flight, alerts) {
      const t = flight.tick;
      if (t >= 60) say('go', t);
      if (flight.phase === 'landed') { say('landed', t); return; }
      if (flight.phase === 'crashed') { say('crashed', t, true); return; }
      if (flight.phase === 'aborted') { say('aborted', t, true); return; }
      if (alerts.fuel === 'critical') say('fuelOut', t, true);
      else if (alerts.fuel === 'caution') say('fuelLow', t);
      if (alerts.descent === 'critical') say('rate', t, true);
      if (alerts.drift === 'caution') say('drift', t);
    },
  };
}
