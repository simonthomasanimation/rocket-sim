// Fixed-timestep loop (accumulator pattern). The simulation always advances
// in whole ticks of 1/60 s, however fast or slow the screen refreshes, so a
// flight is a pure function of its starting state and its tick-stamped
// inputs. The caller feeds in wall-clock time; this module never touches the
// DOM, timers or requestAnimationFrame.
//
//   const loop = createFixedLoop({ hz: 60, step: (dt, tick) => sim.step(dt) });
//   // each animation frame:
//   const { alpha } = loop.advance(nowSeconds);
//   render(alpha); // alpha in [0,1): how far we are between the last two ticks

export function createFixedLoop({ hz = 60, maxStepsPerFrame = 8, step }) {
  const dt = 1 / hz;
  let accumulator = 0;
  let last = null;
  let tick = 0;
  let paused = false;

  // `rate` is the time warp: simulated seconds per wall-clock second. The
  // step stays 1/60 s whatever the rate, so a warped flight replays exactly.
  function advance(nowSeconds, rate = 1) {
    if (last === null) last = nowSeconds;
    let frame = nowSeconds - last;
    last = nowSeconds;
    if (paused) return { alpha: accumulator / dt, steps: 0 };
    if (!(frame >= 0)) frame = 0; // clock went backwards or NaN
    // After a long stall (tab in the background) do not try to catch up on
    // seconds of simulation at once: drop the surplus and keep the game smooth.
    const cap = maxStepsPerFrame * dt;
    if (frame > cap) frame = cap;
    accumulator += frame * rate;
    let steps = 0;
    while (accumulator >= dt) {
      step(dt, tick);
      tick += 1;
      accumulator -= dt;
      steps += 1;
    }
    return { alpha: accumulator / dt, steps };
  }

  return {
    dt,
    hz,
    get tick() { return tick; },
    get paused() { return paused; },
    advance,
    // Forget any partial frame; used when the clock source changes.
    resync() { last = null; },
    pause() { paused = true; },
    resume() { paused = false; last = null; },
    reset() { accumulator = 0; last = null; tick = 0; },
  };
}

// Linear interpolation helper for render smoothing between two ticks.
export function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}
