// Instrument strip along the bottom of the blueprint: altitude and velocity
// dials that change range as the numbers grow, vertical/horizontal speed and
// tilt readouts, orbit readouts (Ap, Pe, period), fuel and throttle tapes,
// a compass-rose attitude indicator, stage figures and the CAPCOM line.
// Two-tone ink; accent only when an alert says so.

import { BLUEPRINT, STROKE, MONO, formatDistance, formatTime, drawScaleBar } from '../render/blueprint.js';

const G = 8; // grid

// The strip is one row on wide sheets and two on narrow ones (phones).
export function hudHeight(narrow) {
  return narrow ? 200 : 112;
}

// Dial ranges: the dial steps up when the needle would pin and back down
// once the value has fallen well inside the next range below.
const ALT_RANGES = [
  { max: 200, ticks: [0, 50, 100, 150, 200], unit: 'M' },
  { max: 2000, ticks: [0, 0.5, 1, 1.5, 2], unit: 'KM' },
  { max: 20000, ticks: [0, 5, 10, 15, 20], unit: 'KM' },
  { max: 200000, ticks: [0, 50, 100, 150, 200], unit: 'KM' },
  { max: 600000, ticks: [0, 200, 400, 600], unit: 'KM' },
  { max: 6000000, ticks: [0, 2000, 4000, 6000], unit: 'KM' },
  { max: 60000000, ticks: [0, 20, 40, 60], unit: 'MM' },
];
const VEL_RANGES = [
  { max: 30, ticks: [0, 10, 20, 30], unit: 'M/S' },
  { max: 300, ticks: [0, 100, 200, 300], unit: 'M/S' },
  { max: 1000, ticks: [0, 250, 500, 750, 1000], unit: 'M/S' },
  { max: 4000, ticks: [0, 1000, 2000, 3000, 4000], unit: 'M/S' },
];

function chooseRange(ranges, current, value) {
  let i = current;
  while (i < ranges.length - 1 && value > ranges[i].max) i += 1;
  while (i > 0 && value < ranges[i - 1].max * 0.35) i -= 1;
  return i;
}

export function createHud() {
  // Needles sweep and settle: displayed values ease to the real ones.
  const shown = { alt: 0, vel: 0, fuel: 1, thr: 0, pitch: 0 };
  let altRange = 0;
  let velRange = 0;
  let capcomShownKey = null;
  let capcomRevealed = 0;

  function ease(key, target, dt) {
    const k = 1 - Math.exp(-dt * 8);
    shown[key] += (target - shown[key]) * k;
  }

  // view: interpolated state; alerts from computeAlerts; capcom log entry.
  function update(view, alerts, capcomLine, dt) {
    altRange = chooseRange(ALT_RANGES, altRange, alerts.altitude);
    velRange = chooseRange(VEL_RANGES, velRange, alerts.speed);
    ease('alt', alerts.altitude, dt);
    ease('vel', alerts.speed, dt);
    ease('fuel', alerts.fuelFrac, dt);
    ease('thr', view.throttle, dt);
    if (capcomLine && capcomLine.key !== capcomShownKey) { capcomShownKey = capcomLine.key; capcomRevealed = 0; }
    capcomRevealed += dt * 40; // characters per second, a teletype pace
  }

  // info: { stageText, dv, twr, hold, pitch, prograde (relative to local up, or null) }
  function draw(ctx, { width, height, titleBlockWidth, narrow, timeSeconds, camera }, view, alerts, capcomLine, info) {
    const H = hudHeight(narrow);
    const top = height - H;
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

    const ar = ALT_RANGES[altRange];
    const vr = VEL_RANGES[velRange];
    const altVal = Math.max(0, alerts.altitude);
    const altText = ar.unit === 'M' ? `${altVal.toFixed(0)} M` : altVal < 1e6 ? `${(altVal / 1000).toFixed(altVal < 100000 ? 1 : 0)} KM` : `${(altVal / 1e6).toFixed(2)} MM`;
    // Two layouts on the 8px grid: one row, or two rows for phones.
    const L = narrow
      ? { r: 4.5 * G, d1: 6 * G, d2: 16 * G, rx: 22 * G, rw: 12 * G, t1: 37 * G, t2: 43 * G, row2: 11 * G, rose: 6 * G, ox: 12 * G, ow: 12 * G, sx: 26 * G, sw: 12 * G, stack: 41 * G, cap: 999 * G }
      : { r: 5 * G, d1: 7 * G, d2: 19 * G, rx: 26 * G, rw: 13 * G, t1: 56 * G, t2: 62 * G, row2: 0, rose: 71 * G, ox: 41 * G, ow: 13 * G, sx: 79 * G, sw: 12 * G, stack: 94 * G, cap: 98 * G };
    dial(ctx, L.d1, top + 7 * G, L.r, Math.min(ar.max, Math.max(0, shown.alt)) / ar.max, `ALT ${ar.unit}`, altText, ar.ticks, tone(alerts.descent));
    dial(ctx, L.d2, top + 7 * G, L.r, Math.min(vr.max, shown.vel) / vr.max, `VEL ${vr.unit}`, `${alerts.speed.toFixed(alerts.speed < 100 ? 1 : 0)} M/S`, vr.ticks, 'none');

    // Readouts: vertical speed positive upward, horizontal positive to the right.
    readout(ctx, L.rx, top + 3 * G, L.rw, 'V-SPD', signed(-alerts.vSpeed) + ' M/S', tone(alerts.descent));
    readout(ctx, L.rx, top + 6 * G, L.rw, 'H-SPD', signed(alerts.hSpeed * Math.sign(info.hDirection || 1)) + ' M/S', tone(alerts.drift));
    readout(ctx, L.rx, top + 9 * G, L.rw, 'TILT', signed((alerts.tiltAngle * 180) / Math.PI, 0) + ' DEG', tone(alerts.tilt));
    readout(ctx, L.rx, top + 12 * G, L.rw, 'HEAT', `${Math.round((alerts.heatFrac || 0) * 100)}%`, tone(alerts.heat || 'none'));

    // Orbit readouts; the periapsis goes accent while it lies underground.
    const oy = top + L.row2;
    readout(ctx, L.ox, oy + 3 * G, L.ow, 'AP', formatDistance(alerts.apAlt), 'none');
    readout(ctx, L.ox, oy + 6 * G, L.ow, 'PE', formatDistance(alerts.peAlt), alerts.peBelow ? 'marker' : alerts.peInAir ? tone('caution') : 'none');
    readout(ctx, L.ox, oy + 9 * G, L.ow, 'T', Number.isFinite(alerts.period) ? formatTime(alerts.period) : '---', 'none');

    // Tapes.
    tape(ctx, L.t1, top + 2 * G, 2 * G, 9 * G, Math.max(0, Math.min(1, shown.fuel)), 'FUEL', `${Math.round(alerts.fuelFrac * 100)}%`, tone(alerts.fuel));
    tape(ctx, L.t2, top + 2 * G, 2 * G, 9 * G, Math.max(0, Math.min(1, shown.thr)), 'THR', `${Math.round(view.throttle * 100)}%`, 'none');

    // Attitude rose and the stage figures.
    rose(ctx, L.rose, oy + 7 * G, L.r, info, alerts.tiltAngle);
    readout(ctx, L.sx, oy + 3 * G, L.sw, 'STAGE', info.stageText, 'none');
    readout(ctx, L.sx, oy + 6 * G, L.sw, 'DV', `${Math.round(info.dv)} M/S`, 'none');
    readout(ctx, L.sx, oy + 9 * G, L.sw, 'TWR', info.twr.toFixed(1), 'none');
    if (info.capsule) readout(ctx, L.sx, oy + 12 * G, L.sw, 'CHUTE', ['STOWED', 'OPEN', 'TORN'][alerts.chute || 0], alerts.chute === 2 ? 'marker' : 'none');
    if (info.stages) stack(ctx, L.stack, oy + 11 * G, info.stages);

    // CAPCOM line: in the strip when there is room, else top left of the
    // sheet beside the title block, wrapped onto two lines.
    const capRight = width - titleBlockWidth - 2 * G;
    const inStrip = !narrow && capRight - L.cap > 160;
    const cx = inStrip ? L.cap : 2 * G;
    const cy = inStrip ? top + 7 * G : 3 * G;
    const maxW = inStrip ? capRight - L.cap : width - 5 * G - titleBlockWidth;
    capcom(ctx, cx, cy, maxW, capcomLine, capcomRevealed, capcomLine && capcomLine.critical ? (blink2 ? 'critical' : 'none') : 'none', inStrip ? 1 : 2);
    if (camera) drawScaleBar(ctx, camera, 3 * G, 10 * G);
    if (info.paused) banner(ctx, width / 2, narrow ? 22 * G : 4 * G, 'PAUSED   SPACE TO RESUME');
    ctx.restore();
  }

  return { update, draw, height: hudHeight };
}

function signed(v, digits = 1) {
  const r = Math.abs(v) < 0.05 ? 0 : v;
  return (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(digits);
}

function colours(level) {
  if (level === 'critical') return { stroke: BLUEPRINT.accent, fill: BLUEPRINT.accent, text: BLUEPRINT.paper };
  if (level === 'caution') return { stroke: BLUEPRINT.accent, fill: null, text: BLUEPRINT.ink };
  if (level === 'marker') return { stroke: BLUEPRINT.ink, fill: null, text: BLUEPRINT.accent };
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

// Compass rose: local vertical at the top, ticks every 30 degrees, the
// craft's axis as a needle, prograde and retrograde marked on the ring and
// labelled, the active hold named beneath.
function rose(ctx, cx, cy, r, info, pitch) {
  ctx.lineWidth = STROKE.structure;
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = STROKE.annotation;
  ctx.strokeStyle = BLUEPRINT.inkPale;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const len = i % 3 === 0 ? 6 : 3;
    ctx.moveTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ctx.lineTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len));
  }
  ctx.stroke();
  text(ctx, 'UP', cx, cy - r + 11, { size: 8, weight: 400, align: 'center', colour: BLUEPRINT.inkPale });
  // Prograde / retrograde on the ring.
  if (info.prograde !== null && info.prograde !== undefined) {
    for (const [off, name] of [[0, 'PRO'], [Math.PI, 'RET']]) {
      const a = info.prograde + off - Math.PI / 2;
      const mx = cx + Math.cos(a) * (r - 9); const my = cy + Math.sin(a) * (r - 9);
      const active = (info.hold === 1 && off === 0) || (info.hold === 2 && off !== 0);
      ctx.strokeStyle = BLUEPRINT.ink;
      ctx.lineWidth = active ? STROKE.structure : STROKE.annotation;
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      if (off !== 0) { ctx.beginPath(); ctx.moveTo(mx - 2.5, my - 2.5); ctx.lineTo(mx + 2.5, my + 2.5); ctx.moveTo(mx + 2.5, my - 2.5); ctx.lineTo(mx - 2.5, my + 2.5); ctx.stroke(); }
      text(ctx, name, mx + Math.cos(a) * -9, my + Math.sin(a) * -9, { size: 7, weight: 400, align: 'center', colour: BLUEPRINT.inkPale });
    }
  }
  // Needle: the craft's axis.
  const a = pitch - Math.PI / 2;
  ctx.strokeStyle = BLUEPRINT.ink;
  ctx.lineWidth = STROKE.structure;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * 5, cy - Math.sin(a) * 5);
  ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.stroke();
  const holdText = info.hold === 1 ? 'AUTO PRO' : info.hold === 2 ? 'AUTO RET' : 'ATT';
  if (info.hold) {
    // Inverted cell, like WARP in the title block: steering is automatic.
    const w = 54; const hh = 11;
    ctx.fillStyle = BLUEPRINT.ink;
    ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + r - 1), w, hh);
    text(ctx, holdText, cx, cy + r + 8, { size: 8, weight: 500, align: 'center', colour: BLUEPRINT.paper });
  } else {
    text(ctx, holdText, cx, cy + r + 9, { size: 9, weight: 400, align: 'center', colour: BLUEPRINT.inkPale });
  }
}

// The vehicle as a stack of stage boxes from the bottom up: hatched to the
// fuel left, the live stage in the heavy stroke, dropped stages crossed out.
function stack(ctx, x, bottom, stages) {
  const w = 2 * G; const h = 12; const gap = 4;
  stages.forEach((st, i) => {
    const y = bottom - (i + 1) * (h + gap);
    const live = st.state === 'live';
    ctx.strokeStyle = live ? BLUEPRINT.ink : BLUEPRINT.inkPale;
    ctx.lineWidth = live ? STROKE.structure : STROKE.annotation;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    if (st.state === 'dropped') {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + w - 2, y + h - 2);
      ctx.moveTo(x + w - 2, y + 2); ctx.lineTo(x + 2, y + h - 2);
      ctx.stroke();
    } else if (st.frac > 0) {
      const fw = Math.max(1, Math.round((w - 2) * Math.min(1, st.frac)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, y + 1, fw, h - 1);
      ctx.clip();
      ctx.strokeStyle = BLUEPRINT.inkPale;
      ctx.lineWidth = STROKE.annotation;
      ctx.beginPath();
      for (let d = -h; d < w; d += 4) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
      ctx.stroke();
      ctx.restore();
    }
    text(ctx, `S${i + 1}`, x - 4, y + h / 2, { size: 8, weight: 400, align: 'right', colour: live ? BLUEPRINT.ink : BLUEPRINT.inkPale });
  });
  text(ctx, 'STACK', x + w / 2, bottom - stages.length * (h + gap) - 7, { size: 9, weight: 400, align: 'center', colour: BLUEPRINT.inkPale });
}

// A boxed line of type in the sheet, inverted so it cannot be missed.
function banner(ctx, cx, y, str) {
  ctx.font = `500 12px ${MONO}`;
  const w = ctx.measureText(str).width + 24;
  ctx.fillStyle = BLUEPRINT.ink;
  ctx.fillRect(Math.round(cx - w / 2), y, Math.round(w), 24);
  text(ctx, str, cx, y + 12, { size: 12, align: 'center', colour: BLUEPRINT.paper });
}

// Label left, value right-aligned in the field, boxed only when alerting.
function readout(ctx, x, y, w, name, value, level) {
  const c = colours(level);
  if (level === 'caution' || level === 'critical') {
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
