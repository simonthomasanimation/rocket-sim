// CAPCOM: the one voice on the loop. A small bank of canned lines, each
// said once per flight when its trigger first holds. Pure logic; the HUD
// decides how to print it.

export const LINES = {
  goDescent: 'Go for descent. Watch your rate.',
  goLaunch: 'Pad is clear. You are go for launch.',
  goOrbit: 'We have you in a stable orbit. Plan your burn.',
  liftoff: 'Liftoff. Clear of the tower.',
  staged: 'Staging confirmed. Good separation.',
  stageDry: 'First stage is dry. Stage when ready.',
  orbit: 'Orbit confirmed. Periapsis is above the ground.',
  fuelLow: 'Fuel at fifteen percent. Commit or abort.',
  fuelOut: 'We show zero fuel. Ride it down.',
  rate: 'Descent rate is too high. Throttle up.',
  drift: 'You are drifting sideways. Level off.',
  landed: 'Contact light. Engine stop. Welcome to the Moon.',
  crashed: 'We have lost your signal.',
  escaped: 'You have left lunar space. Flight terminated.',
  soiMoon: 'Entering the Moon\'s sphere of influence. Lunar gravity has you now.',
  soiEarth: 'Back in Earth\'s sphere of influence.',
  entry: 'Entry interface. Keep the shield into the wind.',
  heat: 'Heating is near the limit. Hold retrograde.',
  chute: 'Good canopy.',
  chuteTorn: 'The canopy has torn away. Too fast.',
  splashdown: 'Splashdown. Recovery is on the way.',
  burned: 'We have lost the vehicle on entry.',
  alt500: 'Five hundred metres.',
  alt200: 'Two hundred metres.',
  alt100: 'One hundred metres.',
  alt50: 'Fifty metres.',
  alt20: 'Twenty metres.',
};

// Altitude callouts on the way down, read once each as the craft sinks past them.
const CALLOUTS = [[500, 'alt500'], [200, 'alt200'], [100, 'alt100'], [50, 'alt50'], [20, 'alt20']];

export function createCapcom() {
  const said = new Set();
  const log = [];
  function say(key, tick, critical = false, text = LINES[key]) {
    if (said.has(key)) return;
    said.add(key);
    log.push({ key, text, tick, critical });
  }
  return {
    log,
    get latest() { return log[log.length - 1] || null; },
    // Call once per tick with the flight and its current alerts.
    update(flight, alerts) {
      const t = flight.tick;
      if (t >= 60) say(flight.scenario.go || 'goDescent', t);
      for (const ev of flight.events) {
        if (ev.type === 'liftoff') say('liftoff', t);
        else if (ev.type === 'staged') say('staged', t);
        else if (ev.type === 'orbit' && flight.stats.orbit) say('orbit', t, false, `Orbit confirmed. Periapsis ${(flight.stats.orbit.pe / 1000).toFixed(1)} km.`);
        else if (ev.type === 'soi') say(`soi${ev.tick}`, t, false, LINES[ev.to === 'moon' ? 'soiMoon' : 'soiEarth']);
        else if (ev.type === 'burned') say('burned', t, true);
        else if (ev.type === 'splashdown') say('splashdown', t);
      }
      if (flight.phase === 'landed') { if (!(flight.stats.touchdown && flight.stats.touchdown.water)) say('landed', t); return; }
      if (flight.phase === 'crashed') { say('crashed', t, true); return; }
      if (flight.phase === 'escaped') { say('escaped', t, true); return; }
      if (alerts.fuel === 'critical') say('fuelOut', t, true);
      else if (alerts.fuel === 'caution' && flight.state.fuel <= 0) say('stageDry', t);
      else if (alerts.fuel === 'caution') say('fuelLow', t);
      if (alerts.heatFrac > 0.05 && alerts.heatFrac < 0.5) say('entry', t);
      if (alerts.heat === 'critical') say('heat', t, true);
      if (alerts.chute === 1) say('chute', t);
      if (alerts.chute === 2) say('chuteTorn', t, true);
      if (alerts.descent === 'critical') say('rate', t, true);
      if (alerts.drift === 'caution') say('drift', t);
      if (alerts.vSpeed > 0.5) {
        for (const [h, key] of CALLOUTS) if (alerts.altitude < h && alerts.altitude > h * 0.6) say(key, t);
      }
    },
  };
}
