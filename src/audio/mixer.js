// Mixer: one AudioContext behind master, music and SFX buses. Audio starts
// on the first user gesture (browsers require it), resumes when the tab
// comes back, and the whole thing is optional: with no Web Audio, every
// call is a no-op and the game plays silently.

export function createMixer() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null;
  let master = null;
  const buses = { music: null, sfx: null };
  let muted = false;

  function start() {
    if (ctx || !Ctx) return;
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      for (const name of Object.keys(buses)) {
        const g = ctx.createGain();
        g.gain.value = name === 'music' ? 0.5 : 0.7;
        g.connect(master);
        buses[name] = g;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  }

  return {
    get context() { return ctx; },
    get ready() { return !!ctx; },
    get muted() { return muted; },
    bus(name) { return buses[name]; },
    start,
    resume,
    setMuted,
    toggleMuted() { setMuted(!muted); return muted; },
  };
}
