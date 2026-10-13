// Sound effects. Placeholder engine noise: filtered noise whose loudness and
// brightness follow the throttle. Touchdown gives a short thud, a crash a
// longer burst. Realistic where the physics is real, per the brief.

export function createSfx(mixer) {
  let engine = null; // { source, filter, gain }
  let lastThrottle = 0;

  function noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let a = 0x1234567; // small deterministic noise generator
    for (let i = 0; i < data.length; i++) {
      a = (a * 1664525 + 1013904223) >>> 0;
      data[i] = (a / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  function ensureEngine() {
    const ctx = mixer.context;
    if (engine || !ctx) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx, 2);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(mixer.bus('sfx'));
      source.start();
      engine = { source, filter, gain };
    } catch {
      engine = null;
    }
  }

  // throttle 0..1 of the thrust actually produced; call every frame.
  function setEngine(throttle) {
    ensureEngine();
    if (!engine) return;
    if (Math.abs(throttle - lastThrottle) < 0.005) return;
    lastThrottle = throttle;
    const ctx = mixer.context;
    const t = ctx.currentTime;
    engine.gain.gain.setTargetAtTime(throttle > 0 ? 0.15 + 0.55 * throttle : 0, t, 0.08);
    engine.filter.frequency.setTargetAtTime(200 + 1800 * throttle, t, 0.1);
  }

  // A burst of filtered noise: thud for a landing, crunch for a crash.
  function burst({ seconds, cutoff, level }) {
    const ctx = mixer.context;
    if (!ctx) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx, seconds);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(level, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
      source.connect(filter).connect(gain).connect(mixer.bus('sfx'));
      source.start(t);
      source.stop(t + seconds);
    } catch { /* silence is fine */ }
  }

  return {
    setEngine,
    touchdown() { burst({ seconds: 0.25, cutoff: 300, level: 0.6 }); },
    crash() { burst({ seconds: 0.9, cutoff: 900, level: 0.9 }); },
    stop() { setEngine(0); },
  };
}
