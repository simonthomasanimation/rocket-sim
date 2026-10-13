// Instrument strip along the bottom of the blueprint: altitude and velocity
// dials, vertical/horizontal speed readouts, fuel and throttle tapes, and the
// CAPCOM line. Two-tone ink; accent only when an alert says so.

import { BLUEPRINT, STROKE, MONO } from '../render/blueprint.js';

export const HUD_HEIGHT = 112;
const G = 8; // grid

export function createHud() {
  // Needles sweep and settle: displayed values ease to the real ones.
  const shown = { alt: 0, vel: 0, fuel: 1, thr: 0 };
  let capcomShownKey = null;
  let capcomRevealed = 0;

  function ease(key, target, dt) {
    const k = 1 - Math.exp(-dt * 8);
    shown[key] += (target - shown[key]) * k;
  }

  // view: interpolated state; alerts from computeAlerts; capcom log entry.
  function update(view, alerts, capcomLine, dt) {
    ease('alt', alerts.altitude, dt);
    ease('vel', Math.hypot(view.vx, view.vy), dt);
    ease('fuel', alerts.fuelFrac, dt);
    ease('thr', view.throttle, dt);
    if (capcomLine && capcomLine.key !== capcomShownKey) { capcomShownKey = capcomLine.key; capcomRevealed = 0; }
    capcomRevealed += dt * 40; // characters per second, a teletype pace
  }

  function draw(ctx, { width, height, titleBlockWidth, narrow, timeSeconds }, view, alerts, capcomLine) {
    const top = height - HUD_HEIGHT;
    const blink1 = Math.floor(timeSeconds * 2) % 2 === 0;   // 1 Hz
    const blink2 = Math.floor(timeSeconds * 4) % 2 === 0;   // 2 Hz
    const tone = (level) => (level === 'critical' ? (blink2 ? 'critical' : 'none') : level === 'caution' ? (blink1 ? 'caution' : 'none') : 'none');

    ctx.save();
    ctx.lineWidth = STROKE.structure;
    ctx.strokeStyle = BLUEPRINT.ink;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(width, top + 0.5);
    ctx.stroke();

    const ALT_MAX = 200;
    const VEL_MAX = 30;
    // Two layouts on the 8px grid: roomy, and compact for phones.
    const L = narrow
      ? { r: 4.5 * G, d1: 6 * G, d2: 16 * G, rx: 22 * G, rw: 12 * G, t1: 37 * G, t2: 43 * G, cap: 48 * G }
      : { r: 5 * G, d1: 7 * G, d2: 19 * G, rx: 26 * G, rw: 13 * G, t1: 40 * G, t2: 46 * G, cap: 52 * G };
    dial(ctx, L.d1, top + 7 * G, L.r, Math.min(ALT_MAX, Math.max(0, shown.alt)) / ALT_MAX, 'ALT', `${Math.max(0, alerts.altitude).toFixed(0)} M`, [0, 50, 100, 150, 200], tone(alerts.descent));
    dial(ctx, L.d2, top + 7 * G, L.r, Math.min(VEL_MAX, shown.vel) / VEL_MAX, 'VEL', `${Math.hypot(view.vx, view.vy).toFixed(1)} M/S`, [0, 10, 20, 30], 'none');

    // Readouts: vertical speed positive upward, horizontal positive to the right.
    readout(ctx, L.rx, top + 3 * G, L.rw, 'V-SPD', signed(view.vy) + ' M/S', tone(alerts.descent));
    readout(ctx, L.rx, top + 6 * G, L.rw, 'H-SPD', signed(view.vx) + ' M/S', tone(alerts.drift));
    readout(ctx, L.rx, top + 9 * G, L.rw, 'TILT', signed((view.angle * 180) / Math.PI, 0) + ' DEG', tone(alerts.tilt));

    // Tapes.
    tape(ctx, L.t1, top + 2 * G, 2 * G, 9 * G, Math.max(0, Math.min(1, shown.fuel)), 'FUEL', `${Math.round(alerts.fuelFrac * 100)}%`, tone(alerts.fuel));
    tape(ctx, L.t2, top + 2 * G, 2 * G, 9 * G, Math.max(0, Math.min(1, shown.thr)), 'THR', `${Math.round(view.throttle * 100)}%`, 'none');

    // CAPCOM line: in the strip when there is room, else top left of the
    // sheet beside the title block, wrapped onto two lines.
    const capRight = width - titleBlockWidth - 2 * G;
    const inStrip = !narrow && capRight - L.cap > 160;
    const cx = inStrip ? L.cap : 2 * G;
    const cy = inStrip ? top + 7 * G : 3 * G;
    const maxW = inStrip ? capRight - L.cap : width - 5 * G - titleBlockWidth;
    capcom(ctx, cx, cy, maxW, capcomLine, capcomRevealed, capcomLine && capcomLine.critical ? (blink2 ? 'critical' : 'none') : 'none', inStrip ? 1 : 2);
    ctx.restore();
  }

  return { update, draw };
}

function signed(v, digits = 1) {
  const r = Math.abs(v) < 0.05 ? 0 : v;
  return (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(digits);
}

function colours(level) {
  if (level === 'critical') return { stroke: BLUEPRINT.accent, fill: BLUEPRINT.accent, text: BLUEPRINT.paper };
  if (level === 'caution') return { stroke: BLUEPRINT.accent, fill: null, text: BLUEPRINT.ink };
  return { stroke: BLUEPRINT.ink, fill: null, text: BLUEPRINT.ink };
}

function text(ctx, str, x, y, { size = 12, weight = 500, align = 'left', colour = BLUEPRINT.ink, baseline = 'middle' } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, Math.round(x), Math.round(y));
}

// Round dial: 270-degree sweep from lower left to lower right, tick marks
// with numerals, needle, name above and digital value below.
function dial(ctx, cx, cy, r, frac, name, value, ticks, level) {
  const c = colours(level);
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.lineWidth = STROKE.structure;
  ctx.strokeStyle = c.stroke;
  if (c.fill) { ctx.fillStyle = c.fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = STROKE.annotation;
  const inkOn = c.fill ? BLUEPRINT.paper : BLUEPRINT.inkPale;
  ctx.strokeStyle = inkOn;
  ticks.forEach((t, i) => {
    const a = start + sweep * (i / (ticks.length - 1));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
    text(ctx, String(t), cx + Math.cos(a) * (r - 13), cy + Math.sin(a) * (r - 13), { size: 8, weight: 400, align: 'center', colour: inkOn });
  });
  // Minor ticks between majors.
  ctx.beginPath();
  const minor = (ticks.length - 1) * 5;
  for (let i = 0; i <= minor; i++) {
    if (i % 5 === 0) continue;
    const a = start + sweep * (i / minor);
    ctx.moveTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
  }
  ctx.stroke();
  // Needle.
  const a = start + sweep * Math.max(0, Math.min(1, frac));
  ctx.strokeStyle = c.fill ? BLUEPRINT.paper : BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6);
  ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, name, cx, cy + 11, { size: 9, weight: 400, align: 'center', colour: inkOn });
  text(ctx, value, cx, cy + r - 9, { size: 10, align: 'center', colour: c.fill ? BLUEPRINT.paper : BLUEPRINT.ink });
}

// Label left, value right-aligned in the field, boxed only when alerting.
function readout(ctx, x, y, w, name, value, level) {
  const c = colours(level);
  if (level !== 'none') {
    ctx.lineWidth = STROKE.annotation;
    ctx.strokeStyle = c.stroke;
    if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(x - 4, y - 9, w + 8, 18); }
    ctx.strokeRect(x - 4 + 0.5, y - 9 + 0.5, w + 8, 18);
  }
  text(ctx, name, x, y, { size: 9, weight: 400, colour: c.fill ? BLUEPRINT.paper : BLUEPRINT.inkPale });
  text(ctx, value, x + w, y, { size: 12, align: 'right', colour: c.text });
}

// Vertical tape: outline, hatched to the level, name above, value below.
function tape(ctx, x, y, w, h, frac, name, value, level) {
  const c = colours(level);
  const fillH = Math.round(h * frac);
  ctx.lineWidth = STROKE.structure;
  ctx.strokeStyle = c.stroke;
  if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(x, y, w, h); }
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  if (fillH > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + h - fillH, w - 1, fillH);
    ctx.clip();
    ctx.strokeStyle = c.fill ? BLUEPRINT.paper : BLUEPRINT.inkPale;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    for (let d = -h; d < w; d += 4) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = c.fill ? BLUEPRINT.paper : BLUEPRINT.ink;
    ctx.lineWidth = STROKE.annotation;
    ctx.beginPath();
    ctx.moveTo(x, y + h - fillH + 0.5);
    ctx.lineTo(x + w, y + h - fillH + 0.5);
    ctx.stroke();
  }
  text(ctx, name, x + w / 2, y - 7, { size: 9, weight: 400, align: 'center', colour: BLUEPRINT.inkPale });
  text(ctx, value, x + w / 2, y + h + 9, { size: 10, align: 'center', colour: c.stroke === BLUEPRINT.accent ? BLUEPRINT.accent : BLUEPRINT.ink });
}

// The radio line: "CAPCOM" tag, then the message revealed like a teletype,
// wrapped by words onto up to maxLines lines.
function capcom(ctx, x, y, maxW, line, revealed, level, maxLines = 1) {
  const c = colours(level);
  text(ctx, 'CAPCOM', x, y - 10, { size: 9, weight: 400, colour: BLUEPRINT.inkPale });
  if (!line) return;
  const n = Math.max(0, Math.min(line.text.length, Math.floor(revealed)));
  ctx.font = `500 12px ${MONO}`;
  const lines = wrap(ctx, line.text.slice(0, n), maxW, maxLines);
  lines.forEach((str, i) => {
    const ly = y + i * 18;
    if (c.fill) {
      ctx.fillStyle = c.fill;
      ctx.fillRect(x - 2, ly, ctx.measureText(str).width + 4, 18);
    }
    text(ctx, str, x, ly + 9, { size: 12, colour: c.text });
  });
}

function wrap(ctx, str, maxW, maxLines) {
  const words = str.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (ctx.measureText(trial).width <= maxW || !current) current = trial;
    else { lines.push(current); current = w; }
  }
  if (current) lines.push(current);
  while (lines.length > maxLines) lines.pop();
  const last = lines[lines.length - 1];
  if (last) { let t = last; while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1); lines[lines.length - 1] = t; }
  return lines;
}
