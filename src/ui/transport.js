// Replay transport: a strip of stamped buttons and a scrub tape, HTML over
// the canvas, shown only while a recording is being replayed. Buttons work
// with mouse and touch; the keyboard shortcuts are listed on each button.
//
// Actions sent to the handler: 'exit', 'rev', 'toggle', 'fwd', and 'seek'
// with a fraction 0..1 while scrubbing. REV and FWD are the arrow keys, the
// same keys that set the time warp in flight; each press in the same
// direction goes a notch faster.

const BUTTONS = [
  { action: 'exit', label: 'EXIT', key: 'ESC' },
  { action: 'rev', label: 'REV', key: '←' },
  { action: 'toggle', label: 'PLAY', key: 'SPACE', id: 'toggle' },
  { action: 'fwd', label: 'FWD', key: '→' },
];

export function createTransport(root, onAction) {
  root.replaceChildren();
  const bar = el('div', 'transport-bar');

  // Scrub tape: a long horizontal tape with a playhead and tick marks.
  const tape = el('div', 'transport-tape');
  tape.setAttribute('role', 'slider');
  tape.setAttribute('aria-label', 'Replay position');
  const ticks = el('div', 'transport-ticks');
  const played = el('div', 'transport-played');
  const head = el('div', 'transport-head');
  const timeNow = el('span', 'transport-time transport-time-now', '00:00.0');
  const timeEnd = el('span', 'transport-time transport-time-end', '00:00.0');
  tape.append(ticks, played, head);
  let scrubbing = false;
  const seekFromEvent = (e) => {
    const r = tape.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    onAction('seek', f);
  };
  tape.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    scrubbing = true;
    tape.setPointerCapture?.(e.pointerId);
    seekFromEvent(e);
  });
  tape.addEventListener('pointermove', (e) => { if (scrubbing) seekFromEvent(e); });
  const stop = () => { scrubbing = false; };
  tape.addEventListener('pointerup', stop);
  tape.addEventListener('pointercancel', stop);
  tape.addEventListener('lostpointercapture', stop);

  const tapeRow = el('div', 'transport-tape-row');
  tapeRow.append(timeNow, tape, timeEnd);

  // EXIT on the left, the shuttle group centred, the speed on the right.
  const buttons = el('div', 'transport-buttons');
  const left = el('div', 'transport-group transport-left');
  const centre = el('div', 'transport-group transport-centre');
  const byId = {};
  for (const b of BUTTONS) {
    const btn = el('button', 'stamp-button transport-button');
    btn.type = 'button';
    btn.append(el('span', 'transport-label', b.label));
    const kbd = el('kbd', null, b.key);
    if (b.code) kbd.dataset.code = b.code;
    btn.append(kbd);
    btn.dataset.action = b.action;
    // Act on the completed tap, so whatever appears underneath (the flight
    // report after EXIT) does not catch the finger-up.
    btn.addEventListener('click', () => onAction(b.action));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    (b.action === 'exit' ? left : centre).append(btn);
    if (b.id) byId[b.id] = btn;
  }
  const speed = el('span', 'transport-speed', '×1');
  buttons.append(left, centre, speed);

  bar.append(tapeRow, buttons);
  root.append(bar);

  // Tick marks every ten seconds once the duration is known.
  let tickedFor = -1;
  function layoutTicks(duration) {
    if (tickedFor === duration) return;
    tickedFor = duration;
    ticks.replaceChildren();
    if (duration <= 0) return;
    for (let t = 10; t < duration; t += 10) {
      const m = el('i');
      m.style.left = `${(t / duration) * 100}%`;
      ticks.append(m);
    }
  }

  return {
    show() { root.classList.add('is-open'); },
    hide() { root.classList.remove('is-open'); },
    // Height of the bar on screen, for keeping the drawing clear of it.
    get height() { return root.classList.contains('is-open') ? bar.offsetHeight : 0; },
    // Relabel position-based keys as printed on this keyboard.
    setKeyLabels(labels) {
      for (const kbd of bar.querySelectorAll('kbd[data-code]')) {
        const l = labels[kbd.dataset.code];
        if (l) kbd.textContent = l;
      }
    },
    // { time, duration, speed, playing }
    update({ time, duration, speed: spd, playing }) {
      layoutTicks(duration);
      const f = duration > 0 ? time / duration : 0;
      played.style.width = `${f * 100}%`;
      head.style.left = `${f * 100}%`;
      timeNow.textContent = clock(time);
      timeEnd.textContent = clock(duration);
      tape.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      byId.toggle.querySelector('.transport-label').textContent = playing ? 'PAUSE' : 'PLAY';
      const mag = `×${Math.abs(spd) % 1 === 0 ? Math.abs(spd) : Math.abs(spd).toFixed(1)}`;
      speed.textContent = playing ? (spd < 0 ? `◂ ${mag}` : `${mag} ▸`) : 'PAUSED';
    },
  };
}

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
