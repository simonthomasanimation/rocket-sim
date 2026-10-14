// Camera for the flight view: maps body-relative metres to screen pixels.
// It follows the craft, turns so the local vertical points up the screen,
// zooms out as the craft climbs (or as its predicted path grows) and in as
// it nears the ground, keeps the ground pinned near the bottom of the flight
// area when it is in reach, and frames the whole Moon once it fits. A zoom
// the player sets holds as an absolute scale (the automatic zoom stops
// moving it) and a drag pans the view off the craft; 0 hands both back.
// Line weights are never scaled here: drawing code multiplies lengths by
// `scale` and keeps strokes in pixels.

export function createCamera() {
  const cam = {
    x: 0, y: 0,          // world focus, the craft's position
    rot: 0,              // world heading (clockwise from +y) drawn straight up
    scale: 6,            // px per metre
    lift: 40,            // px the focus sits above the bottom of the flight area
    width: 1, height: 1, // flight area in CSS px (viewport minus HUD strip)
    top: 0,              // y offset of the flight area on screen
    minScale: 0.000005, maxScale: 14, // down to the whole Earth-Moon system on one sheet
    groundClearance: 96, // px kept between the surface and the bottom of the flight area, room for the strata
    heldScale: null,     // px per metre the player set, or null for automatic
    offX: 0, offY: 0,    // world metres the view is panned off the craft
    bodyRadius: 1,
    groundRadius: null,  // radius of the ground under the craft (terrain), or null for the body's
  };

  // Where the camera wants to be for the given craft position. `extent` is
  // how far (m) the predicted path reaches from the craft: up (away from
  // the body), down (towards it) and to the side; null when unknown.
  function target(state, extent = null) {
    const R = cam.bodyRadius;
    const r = Math.hypot(state.x, state.y);
    const rot = Math.atan2(state.x, state.y);
    // Height above the ground under the craft, so a mountain top or a
    // crater floor frames like the flat pad does.
    const alt = Math.max(0, r - (cam.groundRadius || R));
    const H = cam.height; const W = cam.width;
    const c = cam.groundClearance; const pad = 24;
    // Near the ground the view is the M1 lander's: never under 3 px/m.
    let scale = (H * 0.55) / Math.max(alt + 24, 40);
    if (alt < 300) scale = Math.max(scale, 3);
    if (extent) {
      // Fit the path: above the craft into the room left over the pinned
      // ground (or over the craft once it sits at 62 % of the height),
      // sideways into half the width, and round the body when the path
      // goes further down than the ground.
      if (extent.up > 0) {
        let sa = (H - c - pad) / (alt + extent.up);
        if (alt * sa + c > H * 0.62) sa = Math.min(sa, (H * 0.38 - pad) / extent.up);
        scale = Math.min(scale, sa);
      }
      // (A path ending on the ground reaches about `alt` down, a few hundred
      // metres more over a basin; only one that goes round the body reaches
      // a good fraction of a radius further.)
      if (extent.down > alt + R / 4) scale = Math.min(scale, (H - c - pad) / (Math.max(r + R, extent.down) + extent.up));
      if (extent.side > 0) scale = Math.min(scale, (W / 2 - pad) / extent.side);
    }
    if (cam.heldScale !== null) scale = cam.heldScale;
    scale = clamp(scale, cam.minScale, cam.maxScale);
    // Ground as a line: pin it near the bottom. Moon as a disc: show it all.
    // Blend by how much of the disc fits in the view.
    const asLine = Math.min(alt * scale + c, H * 0.62);
    // The lowest thing to keep above the clearance: the far side of the disc,
    // or the far end of a path that goes beyond it (a transfer).
    const low = extent && extent.down > alt + R / 4 ? Math.max(r + R, extent.down) : r + R;
    const asDisc = Math.min(low * scale + c, H - 48);
    const t = clamp(1 - (R * scale - H / 3) / (H - H / 3), 0, 1);
    const lift = asLine + (asDisc - asLine) * t;
    return { x: state.x + cam.offX, y: state.y + cam.offY, rot, scale, lift };
  }

  cam.setViewport = (width, height, top = 0) => { cam.width = width; cam.height = height; cam.top = top; };
  cam.snap = (state, extent = null) => { cam.offX = 0; cam.offY = 0; Object.assign(cam, target(state, extent)); };
  // Ease the turn, zoom and lift towards the target; the focus itself goes
  // straight to the craft, so it never trails off a held sheet at warp.
  cam.follow = (state, dt, extent = null) => {
    const t = target(state, extent);
    const k = 1 - Math.exp(-dt * 4);
    cam.x = t.x;
    cam.y = t.y;
    cam.rot += shortest(t.rot - cam.rot) * k;
    cam.scale *= Math.pow(t.scale / cam.scale, k); // ease in log space so zooms feel even
    cam.lift += (t.lift - cam.lift) * k;
  };
  // A zoom step holds the scale from where the view is now, so the first
  // press is a small change from what the player sees, not from a target
  // the view is still easing towards.
  cam.zoom = (steps) => { cam.heldScale = clamp((cam.heldScale ?? cam.scale) * Math.pow(2, steps), cam.minScale, cam.maxScale); };
  // Pan by screen pixels: the view moves with the drag, the craft stays put.
  cam.pan = (dx, dy) => {
    const c = Math.cos(cam.rot); const s = Math.sin(cam.rot);
    const wx = -dx / cam.scale; const wy = dy / cam.scale; // screen right = world +x turned by rot, screen up = +y
    cam.offX += wx * c + wy * s; cam.offY += -wx * s + wy * c;
    const limit = 4e8; // no further than the far side of the system
    cam.offX = clamp(cam.offX, -limit, limit); cam.offY = clamp(cam.offY, -limit, limit);
  };
  cam.isHeld = () => cam.heldScale !== null || cam.offX !== 0 || cam.offY !== 0;
  cam.resetZoom = () => { cam.heldScale = null; cam.offX = 0; cam.offY = 0; };

  // A world vector turned into screen pixels (no translation).
  cam.toScreenVec = (wx, wy) => {
    const c = Math.cos(cam.rot); const s = Math.sin(cam.rot);
    return { x: (wx * c - wy * s) * cam.scale, y: -(wx * s + wy * c) * cam.scale };
  };
  cam.toScreen = (wx, wy) => {
    const v = cam.toScreenVec(wx - cam.x, wy - cam.y);
    return { x: cam.width / 2 + v.x, y: cam.top + cam.height - cam.lift + v.y };
  };
  cam.toWorld = (sx, sy) => {
    const dx = (sx - cam.width / 2) / cam.scale;
    const dy = -(sy - (cam.top + cam.height - cam.lift)) / cam.scale;
    const c = Math.cos(cam.rot); const s = Math.sin(cam.rot);
    return { x: cam.x + dx * c + dy * s, y: cam.y - dx * s + dy * c };
  };
  // Screen-space unit vectors of the local frame at a world heading: `up`
  // away from the body, `along` clockwise round it.
  cam.frameAt = (heading) => {
    const up = cam.toScreenVec(Math.sin(heading), Math.cos(heading));
    const n = Math.hypot(up.x, up.y) || 1;
    const ux = up.x / n; const uy = up.y / n;
    return { up: { x: ux, y: uy }, along: { x: -uy, y: ux } };
  };
  return cam;
}

// Opacity for a label whose subject is `px` pixels across: nothing under
// 12 px, full from 24 px, per the brief.
export function labelAlpha(px) {
  return clamp((px - 12) / 12, 0, 1);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function shortest(a) { a = a % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; }
