// Replay transport: a strip of stamped buttons and a scrub tape, HTML over
// the canvas, shown only while a recording is being replayed. Buttons work
// with mouse and touch; the keyboard shortcuts are listed on each button.
//
// Actions sent to the handler: 'exit', 'rev', 'stepBack', 'toggle', 'stepFwd',
// 'fwd', 'start', 'end', and 'seek' with a fraction 0..1 while scrubbing.

// Home / End jump to the ends of the tape from the keyboard; the tape itself
// does the same by touch, so they need no buttons.
const BUTTONS = [
  { action: 'exit', label: 'EXIT', key: 'ESC' },
  { action: 'rev', label: 'REV', key: 'J' },
  { action: 'stepBack', label: 'STEP −', key: ',', repeat: true },
  { action: 'toggle', label: 'PLAY', key: 'SPACE', id: 'toggle' },
  { action: 'stepFwd', label: 'STEP +', key: '.', repeat: true },
  { action: 'fwd', label: 'FWD', key: 'L' },
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

  const buttons = el('div', 'transport-buttons');
  const byId = {};
  for (const b of BUTTONS) {
    const btn = el('button', 'stamp-button transport-button');
    btn.type = 'button';
    btn.append(el('span', 'transport-label', b.label));
    btn.append(el('kbd', null, b.key));
    btn.dataset.action = b.action;
    let timer = null;
    if (b.repeat) {
      // Jog buttons act on finger-down and repeat while held.
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        onAction(b.action);
        clearInterval(timer);
        timer = setInterval(() => onAction(b.action), 1000 / 15);
      });
      const release = () => { if (timer) { clearInterval(timer); timer = null; } };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
    } else {
      // Others act on the completed tap, so whatever appears underneath
      // (the flight report after EXIT) does not catch the finger-up.
      btn.addEventListener('click', () => onAction(b.action));
    }
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    buttons.append(btn);
    if (b.id) byId[b.id] = btn;
  }
  const speed = el('span', 'transport-speed', '×1');
  buttons.append(speed);

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
      speed.textContent = playing ? (spd < 0 ? `◂ ×${Math.abs(spd)}` : `×${spd} ▸`) : 'PAUSED';
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
