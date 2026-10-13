// Canvas surface: owns the DOM canvas, keeps it full-window and DPR-aware,
// and tells listeners when its size changes. Everything else draws through
// the `ctx` it hands out and never touches the element directly.

export function createSurface(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const surface = { canvas, ctx, width: 0, height: 0, dpr: 1 };
  const listeners = new Set();
  let dprQuery = null;

  function resize() {
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    const width = Math.max(1, Math.round(window.innerWidth));
    const height = Math.max(1, Math.round(window.innerHeight));
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    surface.width = width;
    surface.height = height;
    surface.dpr = dpr;
    watchDpr(dpr);
    listeners.forEach((fn) => fn(surface));
  }

  // Re-run resize when the window moves to a screen with another pixel density.
  function watchDpr(dpr) {
    if (!window.matchMedia) return;
    if (dprQuery) dprQuery.removeEventListener('change', resize);
    dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener('change', resize);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  surface.onResize = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  return surface;
}
