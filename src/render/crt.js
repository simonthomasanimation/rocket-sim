// CRT document: the system map. Phosphor green on black, 2 px scanlines,
// a curved-glass vignette and a little bloom (the one place the brief
// allows glow). North is up and nothing turns: bodies as circles with
// lat/long ticks, spheres of influence as dotted rings, the Moon's orbit as
// a thin ring, the craft's predicted path in the frame of the body it
// orbits, the craft as a bright triangle, events as labelled ticks, a
// blocky WARP readout, a status line and the radio log in terminal type.

import { BODIES, bodyState, childrenOf, ESCAPE_RADIUS } from '../core/body.js';
import { formatDistance, formatTime, MONO } from './blueprint.js';

export const CRT = {
  paper: '#050806',
  ink: '#5CFF8A',
  inkDim: 'rgba(92, 255, 138, 0.45)',
  accent: '#FFB347',
};

const G = 8;

// The map's own camera: centred on the frame, zoom from the fit plus the
// player's bias, eased so a change of frame does not snap.
export function createMapCamera() {
  const cam = { cx: 0, cy: 0, scale: 1e-4, zoomBias: 0, offX: 0, offY: 0, locked: false, width: 1, height: 1 };
  cam.toggleLock = () => { cam.locked = !cam.locked; cam.offX = 0; cam.offY = 0; };
  cam.zoom = (steps) => { cam.zoomBias = Math.max(-8, Math.min(8, cam.zoomBias + steps)); };
  cam.pan = (dx, dy) => { cam.offX -= dx / cam.scale; cam.offY += dy / cam.scale; };
  cam.isHeld = () => cam.zoomBias !== 0 || cam.offX !== 0 || cam.offY !== 0;
  cam.centre = () => { cam.offX = 0; cam.offY = 0; };
  cam.resetZoom = () => { cam.zoomBias = 0; cam.offX = 0; cam.offY = 0; };
  cam.toScreen = (wx, wy) => ({ x: cam.width / 2 + (wx - cam.cx) * cam.scale, y: cam.height / 2 - (wy - cam.cy) * cam.scale });
  // Fit a box [minX, maxX] x [minY, maxY] (world) with a margin, eased.
  // `focus` is the craft: when the view is locked it sits at the centre.
  cam.fit = (box, dt, snap = false, focus = null) => {
    // Symmetric about the frame body (the origin), so it sits at the centre.
    const w = 2 * Math.max(1, Math.abs(box.minX), Math.abs(box.maxX)); const h = 2 * Math.max(1, Math.abs(box.minY), Math.abs(box.maxY));
    const tx = cam.offX + (cam.locked && focus ? focus.x : 0); const ty = cam.offY + (cam.locked && focus ? focus.y : 0);
    let ts = Math.min((cam.width - 12 * G) / w, (cam.height - 24 * G) / h) * Math.pow(2, cam.zoomBias);
    ts = Math.max(1e-6, Math.min(2, ts));
    const far = Math.hypot(tx - cam.cx, ty - cam.cy) * cam.scale > cam.width;
    if (snap || far) { cam.cx = tx; cam.cy = ty; cam.scale = ts; return; }
    const k = 1 - Math.exp(-dt * 6);
    cam.cx += (tx - cam.cx) * k; cam.cy += (ty - cam.cy) * k;
    cam.scale *= Math.pow(ts / cam.scale, k);
  };
  return cam;
}

// Paper: black, green 8 px grid at 6 %, scanlines, vignette.
export function drawCrtPaper(ctx, width, height, dpr) {
  const W = Math.round(width * dpr); const H = Math.round(height * dpr);
  const px = Math.max(1, Math.round(dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = CRT.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(92, 255, 138, 0.06)';
  for (let x = 0; x <= width; x += G) ctx.fillRect(Math.round(x * dpr), 0, px, H);
  for (let y = 0; y <= height; y += G) ctx.fillRect(0, Math.round(y * dpr), W, px);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let y = 0; y < height; y += 2) ctx.fillRect(0, Math.round(y * dpr), W, px);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// A stroke with a soft glow under it.
function glowStroke(ctx, draw, colour = CRT.ink, width = 1, glow = 3) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = width + glow;
  ctx.beginPath(); draw(); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.beginPath(); draw(); ctx.stroke();
  ctx.restore();
}

function text(ctx, str, x, y, { size = 12, align = 'left', colour = CRT.ink, baseline = 'middle', weight = 500 } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, Math.round(x), Math.round(y));
}

// scene: { state, body, clock, prediction, phase, cfg }
// hud: { met, warp, paused, soi, apAlt, peAlt, dv, log: [capcom lines] }
export function drawCrt(ctx, cam, scene, hud, frameDt, snap = false) {
  const { state, body, clock, prediction } = scene;
  // Frame: the body the craft orbits, centred; the rest placed around it.
  const others = [];
  for (const child of childrenOf(body)) { const p = bodyState(child, clock); others.push({ body: child, x: p.x, y: p.y }); }
  if (body.parent) { const p = bodyState(body, clock); others.push({ body: BODIES[body.parent], x: -p.x, y: -p.y }); }

  // Fit the body, the craft and the predicted path (and the Moon's orbit when it is the frame's child).
  const box = { minX: -body.radius, maxX: body.radius, minY: -body.radius, maxY: body.radius };
  // Nothing beyond the system's edge counts for the framing.
  const reach = 3 * BODIES.moon.orbitRadius;
  const grow = (x, y, m = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > reach) return;
    box.minX = Math.min(box.minX, x - m); box.maxX = Math.max(box.maxX, x + m); box.minY = Math.min(box.minY, y - m); box.maxY = Math.max(box.maxY, y + m);
  };
  grow(state.x, state.y);
  if (prediction) {
    const segs = prediction.segments || [{ from: 0, offset: { x: 0, y: 0 } }];
    let k = 0;
    const pts = prediction.points;
    const stride = Math.max(1, Math.floor(pts.length / 300));
    for (let i = 0; i < pts.length; i += stride) {
      while (k + 1 < segs.length && segs[k + 1].from <= i) k += 1;
      grow(pts[i].x + segs[k].offset.x, pts[i].y + segs[k].offset.y);
    }
  }
  // The Moon's ring joins the frame once the flight reaches for it: the
  // craft or its path beyond two and a half radii, or an encounter found.
  // From the pad and in low orbit the map stays on the planet.
  let farthest = Math.hypot(state.x, state.y);
  if (prediction) { for (let i = 0; i < prediction.points.length; i += Math.max(1, Math.floor(prediction.points.length / 100))) farthest = Math.max(farthest, Math.hypot(prediction.points[i].x, prediction.points[i].y)); }
  const reaching = farthest > 2.5 * body.radius || (prediction && prediction.encounter);
  for (const o of others) if (o.body.parent === body.id && reaching) { grow(o.x, o.y, o.body.soi); grow(0, 0, o.body.orbitRadius); }
  cam.fit(box, frameDt, snap, state);

  ctx.save();
  ctx.lineJoin = 'round';

  // The Moon's orbit round the frame body, and the parent's ring when the frame is the Moon.
  for (const o of others) {
    if (o.body.parent === body.id) {
      const c = cam.toScreen(0, 0);
      glowStroke(ctx, () => ctx.arc(c.x, c.y, o.body.orbitRadius * cam.scale, 0, Math.PI * 2), CRT.inkDim, 0.75, 2);
    }
  }

  // Bodies: a circle with twelve ticks and a centre cross; SOI as a dotted ring.
  const drawBodyMark = (b, x, y) => {
    const c = cam.toScreen(x, y);
    const rp = b.radius * cam.scale;
    if (c.x < -rp - 100 || c.x > cam.width + rp + 100 || c.y < -rp - 100 || c.y > cam.height + rp + 100) return;
    const r = Math.max(rp, 3);
    glowStroke(ctx, () => ctx.arc(c.x, c.y, r, 0, Math.PI * 2), CRT.ink, 1.5, 4);
    if (rp >= 14) {
      ctx.strokeStyle = CRT.ink; ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const len = i % 3 === 0 ? 8 : 4;
        ctx.moveTo(c.x + Math.cos(a) * rp, c.y + Math.sin(a) * rp);
        ctx.lineTo(c.x + Math.cos(a) * (rp - len), c.y + Math.sin(a) * (rp - len));
      }
      ctx.moveTo(c.x - 4, c.y); ctx.lineTo(c.x + 4, c.y);
      ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x, c.y + 4);
      ctx.stroke();
      if (b.atmosphere) {
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(c.x, c.y, (b.radius + b.atmosphere.height) * cam.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (Number.isFinite(b.soi)) {
      const rs = b.soi * cam.scale;
      if (rs > r + 6 && rs < 6000) {
        ctx.strokeStyle = CRT.inkDim; ctx.lineWidth = 0.75;
        ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.arc(c.x, c.y, rs, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        text(ctx, `${b.name} SOI`, c.x, c.y - rs - 6, { size: 10, align: 'center', colour: CRT.inkDim });
      }
    }
    if (!b.parent) {
      // The edge of the top body's reach: beyond it the flight is lost.
      const re = ESCAPE_RADIUS * cam.scale;
      if (re < 6000) {
        ctx.strokeStyle = CRT.inkDim; ctx.lineWidth = 0.75;
        ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.arc(c.x, c.y, re, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const ly = c.y - re < 14 ? c.y + re + 14 : c.y - re - 6;
        if (ly > 0 && ly < cam.height) text(ctx, `${b.name} SOI  EDGE OF REACH ${formatDistance(ESCAPE_RADIUS)}`, c.x, ly, { size: 10, align: 'center', colour: CRT.inkDim });
      }
    }
    text(ctx, b.name, c.x, c.y + r + 12, { size: 11, align: 'center' });
  };
  drawBodyMark(body, 0, 0);
  for (const o of others) drawBodyMark(o.body, o.x, o.y);

  // Predicted path (current: green), event ticks with labels.
  if (prediction && prediction.points.length > 1) {
    const pts = prediction.points;
    const segs = prediction.segments || [{ body: body.id, from: 0, offset: { x: 0, y: 0 } }];
    // One stroke per segment, later ones fainter (see the blueprint's path).
    for (let k = 0; k < segs.length; k++) {
      const from = segs[k].from; const to = k + 1 < segs.length ? segs[k + 1].from : pts.length;
      const o = segs[k].offset;
      ctx.globalAlpha = Math.max(0.3, 1 - 0.3 * k);
      glowStroke(ctx, () => {
        let last = null;
        for (let i = from; i < to; i++) {
          const p = cam.toScreen(pts[i].x + o.x, pts[i].y + o.y);
          if (i === from) ctx.moveTo(p.x, p.y);
          else if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 1) ctx.lineTo(p.x, p.y);
          else continue;
          last = p;
        }
      }, CRT.ink, 1, 3);
    }
    ctx.globalAlpha = 1;
    const segOf = (i) => { let j = 0; while (j + 1 < segs.length && segs[j + 1].from <= i) j += 1; return segs[j]; };
    const craftP = cam.toScreen(state.x, state.y);
    const tick = (wx, wy, name, t, colour = CRT.ink) => {
      const p = cam.toScreen(wx, wy);
      if (p.x < -40 || p.x > cam.width + 40 || p.y < -40 || p.y > cam.height + 40) return;
      ctx.strokeStyle = colour; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5); ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5); ctx.stroke();
      // A tick on top of the craft (an impact seen from far out) prints below it, clear of the craft's name.
      const near = Math.hypot(p.x - craftP.x, p.y - craftP.y) < 24;
      text(ctx, `${name}  T-${formatTime(t)}`, p.x + 9, near ? p.y + 16 : p.y - 7, { size: 10, colour });
    };
    const el = prediction.elements;
    const ap = prediction.closed || (prediction.impact && el.timeToAp !== null && el.timeToAp < prediction.impact.t) || (!prediction.impact && !prediction.closed && el.timeToAp !== null);
    if (el.apoapsis && ap && el.apAlt > 0) tick(el.apoapsis.x, el.apoapsis.y, `AP ${formatDistance(el.apAlt)}`, el.timeToAp);
    if (el.peAlt > 0 && el.timeToPe !== null && (prediction.closed || !prediction.impact)) tick(el.periapsis.x, el.periapsis.y, `PE ${formatDistance(el.peAlt)}`, el.timeToPe);
    if (prediction.encounter) { const e = prediction.encounter; const o = (segs[e.seg] || segs[segs.length - 1]).offset; tick(e.x + o.x, e.y + o.y, `${BODIES[e.body].name} SOI`, e.t, CRT.accent); }
    if (prediction.exit) { const e = prediction.exit; const o = (segs[e.seg] || segs[0]).offset; tick(e.x + o.x, e.y + o.y, `LEAVE ${BODIES[e.body].name}`, e.t, CRT.accent); }
    if (prediction.entry) {
      // Entry and impact sit on the same pixel from far out: then only the impact is ticked.
      const e = prediction.entry; const o = (segs[e.seg] || segs[0]).offset;
      let crowded = false;
      if (prediction.impact) { const i = prediction.impact; const io = (segs[i.seg] || segs[0]).offset; const a = cam.toScreen(e.x + o.x, e.y + o.y); const b = cam.toScreen(i.x + io.x, i.y + io.y); crowded = Math.hypot(a.x - b.x, a.y - b.y) < 24; }
      if (!crowded) tick(e.x + o.x, e.y + o.y, 'ENTRY', e.t, CRT.accent);
    }
    if (prediction.impact) { const e = prediction.impact; const o = (segs[e.seg] || segs[0]).offset; tick(e.x + o.x, e.y + o.y, 'IMPACT', e.t, CRT.accent); }
    if (!prediction.impact && !prediction.closed) { const q = pts[pts.length - 1]; const o = segs[segs.length - 1].offset; tick(q.x + o.x, q.y + o.y, prediction.escaped ? 'LEAVES REACH — LOST' : 'PREDICTION ENDS', q.t, prediction.escaped ? CRT.accent : CRT.inkDim); }
    // Ghosts of other bodies at the times the path reaches them.
    for (let j = 1; j < segs.length; j++) {
      const sg = segs[j];
      const b = BODIES[sg.body];
      if (!b || sg.body === body.id) continue;
      const c = cam.toScreen(sg.offset.x, sg.offset.y);
      ctx.strokeStyle = CRT.inkDim; ctx.lineWidth = 0.75; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(3, b.radius * cam.scale), 0, Math.PI * 2); ctx.stroke();
      if (Number.isFinite(b.soi)) { ctx.beginPath(); ctx.arc(c.x, c.y, b.soi * cam.scale, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }

  // The craft: a bright triangle pointing along its heading.
  {
    const p = cam.toScreen(state.x, state.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(state.angle);
    ctx.fillStyle = CRT.ink;
    ctx.shadowColor = CRT.ink; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, scene.cfg.name, p.x + 10, p.y - 10, { size: 11 });
  }

  // Blocky warp readout, status line, radio log.
  text(ctx, `WARP ${hud.warp}`, 2 * G, 4 * G, { size: 22, weight: 700 });
  if (hud.paused) text(ctx, 'HOLD', 2 * G, 8 * G, { size: 22, weight: 700, colour: CRT.accent });
  const status = `T+${hud.met}   SOI ${hud.soi}   AP ${formatDistance(hud.apAlt)}   PE ${formatDistance(hud.peAlt)}   DV ${Math.round(hud.dv)} M/S   ${hud.stageText}`;
  text(ctx, status, 2 * G, cam.height - 3 * G, { size: 12 });
  const lines = hud.log.slice(-4);
  lines.forEach((l, i) => text(ctx, `> ${l}`, 2 * G, cam.height - (8 + (lines.length - 1 - i) * 2.25) * G, { size: 11, colour: i === lines.length - 1 ? CRT.ink : CRT.inkDim }));
  text(ctx, 'TAB  BLUEPRINT', cam.width - 2 * G, 3 * G, { size: 10, align: 'right', colour: CRT.inkDim });
  ctx.restore();
}
