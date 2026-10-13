// Camera for the flight view: maps world metres to screen pixels. Follows
// the craft, zooms out as it climbs and in as it nears the ground, and keeps
// the ground pinned near the bottom of the flight area when it is in reach.
// Line weights are never scaled here: drawing code multiplies lengths by
// `scale` and keeps strokes in pixels.

export function createCamera() {
  const cam = {
    x: 0,            // world x at the centre of the view
    bottomY: -12,    // world y at the bottom edge of the flight area
    scale: 6,        // px per metre
    width: 1, height: 1, // flight area in CSS px (viewport minus HUD strip)
    top: 0,          // y offset of the flight area on screen
    minScale: 3, maxScale: 14,
  };

  // Where the camera wants to be for the given craft position.
  function target(state) {
    const alt = Math.max(0, state.y);
    const scale = clamp((cam.height * 0.55) / Math.max(alt + 24, 40), cam.minScale, cam.maxScale);
    const bottomY = Math.max(-12, state.y - (cam.height * 0.62) / scale);
    return { x: state.x, bottomY, scale };
  }

  cam.setViewport = (width, height, top = 0) => { cam.width = width; cam.height = height; cam.top = top; };
  cam.snap = (state) => { Object.assign(cam, target(state)); };
  // Ease towards the target; dt is frame time in seconds.
  cam.follow = (state, dt) => {
    const t = target(state);
    const k = 1 - Math.exp(-dt * 4);
    cam.x += (t.x - cam.x) * k;
    cam.bottomY += (t.bottomY - cam.bottomY) * k;
    cam.scale += (t.scale - cam.scale) * k;
  };
  cam.toScreen = (wx, wy) => ({
    x: cam.width / 2 + (wx - cam.x) * cam.scale,
    y: cam.top + cam.height - (wy - cam.bottomY) * cam.scale,
  });
  cam.toWorld = (sx, sy) => ({
    x: cam.x + (sx - cam.width / 2) / cam.scale,
    y: cam.bottomY + (cam.top + cam.height - sy) / cam.scale,
  });
  return cam;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
