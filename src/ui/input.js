// Input: keyboard, mouse wheel and on-screen touch buttons, folded into one
// command per tick for the simulation. The sim never sees key codes, only
// the command { thr, rot, full, cut, stage, hold } and one-shot actions such
// as 'restart'.
//
// Flight controls are read by physical key position (e.code) so WASD on a
// QWERTY keyboard is ZQSD on a French one without any setup: Shift /
// W-position throttle up, Ctrl / S throttle down, Z-position full, X cut,
// A-position rotate left, D rotate right.
//
// The arrow keys are the time control in every mode, the same ladder as the
// replay shuttle: Right one notch faster (from pause, x1), Left is the other
// direction, which live can only mean pause. Space pauses and plays too.
//
// One-shot actions are read by the letter actually typed (e.key) so the key
// marked M mutes on every layout: R restart, M mute, V replay, T hold
// prograde, G hold retrograde, N new start, + and - zoom, 0 resets the zoom.
// Enter stages in flight (and confirms a page).
//
// In replay mode the arrows shuttle the tape (Right forwards, Left
// backwards, again for faster), Space pauses and plays, Home / End jump to
// the start / end, Esc exits.

const KEYS = {
  ShiftLeft: 'thrUp', ShiftRight: 'thrUp', KeyW: 'thrUp',
  ControlLeft: 'thrDown', ControlRight: 'thrDown', KeyS: 'thrDown',
  KeyZ: 'full', KeyX: 'cut',
  KeyA: 'rotLeft',
  KeyD: 'rotRight',
};
// Actions by typed character (layout-aware) and by physical code.
const ACTIONS_BY_KEY = { r: 'restart', m: 'mute', v: 'replay', t: 'holdPro', g: 'holdRet', n: 'newStart', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '_': 'zoomOut', '0': 'zoomReset', '1': 'pick1', '2': 'pick2', '3': 'pick3', '4': 'pick4', '5': 'pick5', '6': 'pick6' };
const ACTIONS_BY_CODE = { Enter: 'confirm', NumpadEnter: 'confirm', Space: 'pause', Escape: 'back', ArrowLeft: 'warpDown', ArrowRight: 'warpUp', NumpadAdd: 'zoomIn', NumpadSubtract: 'zoomOut' };
const REPLAY_BY_KEY = { r: 'restart', m: 'mute', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '_': 'zoomOut', '0': 'zoomReset' };
const REPLAY_BY_CODE = {
  ArrowLeft: 'rev', ArrowRight: 'fwd',
  Space: 'toggle', Home: 'start', End: 'end', Escape: 'exit', Enter: 'exit', NumpadAdd: 'zoomIn', NumpadSubtract: 'zoomOut',
};

function actionFor(e, byKey, byCode) {
  const typed = typeof e.key === 'string' && e.key.length === 1 ? e.key.toLowerCase() : null;
  return (typed && byKey[typed]) || byCode[e.code] || null;
}

// Labels for physical keys as printed on this keyboard (Chrome exposes the
// layout map; elsewhere fall back to the QWERTY letters).
export async function keyLabels(codes) {
  const out = {};
  for (const c of codes) out[c] = c.replace(/^Key/, '');
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      const map = await navigator.keyboard.getLayoutMap();
      for (const c of codes) { const k = map.get(c); if (k) out[c] = k.toUpperCase(); }
    }
  } catch { /* keep the fallback */ }
  return out;
}

// On-screen buttons: label, control, and where they sit (left or right
// cluster). Held buttons act while pressed; tap buttons fire once.
const BUTTONS = [
  { id: 'rotLeft', label: 'ROT L', cluster: 'left' },
  { id: 'rotRight', label: 'ROT R', cluster: 'left' },
  { id: 'holdPro', label: 'PRO', cluster: 'left', tap: true },
  { id: 'holdRet', label: 'RET', cluster: 'left', tap: true },
  { id: 'warpDown', label: 'WARP −', cluster: 'left', tap: true },
  { id: 'warpUp', label: 'WARP +', cluster: 'left', tap: true },
  { id: 'thrUp', label: 'THR +', cluster: 'right' },
  { id: 'thrDown', label: 'THR −', cluster: 'right' },
  { id: 'full', label: 'FULL', cluster: 'right' },
  { id: 'cut', label: 'CUT', cluster: 'right' },
  { id: 'stage', label: 'STAGE', cluster: 'right', tap: true },
];

export function createInput({ touchRoot, zoomTarget } = {}) {
  const held = new Set();      // controls currently held (keyboard or touch)
  const pointers = new Map();  // pointerId -> control
  const actions = [];          // one-shot actions queued for the game
  const gestureListeners = new Set();
  let gestured = false;
  let hold = 0;                // 0 none, 1 prograde, 2 retrograde
  let stagePending = false;    // one tick of 'stage' queued
  const pulses = new Set();    // full / cut taps too quick for a tick still count once

  function gesture() {
    if (gestured) return;
    gestured = true;
    gestureListeners.forEach((fn) => fn());
  }

  let mode = 'flight'; // 'flight' | 'replay'
  const observed = {};  // code -> character printed on the key, as seen typed
  const labelListeners = new Set();

  // Hold toggles: the same key again releases; turning by hand releases too.
  function tap(id) {
    if (id === 'holdPro') { hold = hold === 1 ? 0 : 1; updateButtons(); return; }
    if (id === 'holdRet') { hold = hold === 2 ? 0 : 2; updateButtons(); return; }
    if (id === 'stage') { stagePending = true; return; }
    actions.push(id);
  }

  window.addEventListener('keydown', (e) => {
    if (typeof e.key === 'string' && e.key.length === 1 && /^Key[A-Z]$/.test(e.code) && observed[e.code] !== e.key.toUpperCase()) {
      observed[e.code] = e.key.toUpperCase();
      labelListeners.forEach((fn) => fn({ ...observed }));
    }
    if (mode === 'replay') {
      const action = actionFor(e, REPLAY_BY_KEY, REPLAY_BY_CODE);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      gesture();
      actions.push(action);
      return;
    }
    const action = actionFor(e, ACTIONS_BY_KEY, ACTIONS_BY_CODE);
    if (e.repeat) { if (KEYS[e.code] || action) e.preventDefault(); return; }
    gesture();
    const control = KEYS[e.code];
    if (control) {
      held.add(control);
      if (control === 'full' || control === 'cut') pulses.add(control);
      if (control === 'rotLeft' || control === 'rotRight') { hold = 0; updateButtons(); }
      e.preventDefault();
      return;
    }
    if (action === 'holdPro' || action === 'holdRet') { tap(action); e.preventDefault(); return; }
    if (action) { actions.push(action); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const control = KEYS[e.code];
    if (control) { held.delete(control); e.preventDefault(); }
  });
  // Dropping focus (alt-tab, phone call) releases every key.
  window.addEventListener('blur', () => { held.clear(); pointers.clear(); updateButtons(); });

  // Mouse wheel zooms; a pinch on the drawing zooms too.
  if (zoomTarget) {
    zoomTarget.addEventListener('wheel', (e) => {
      e.preventDefault();
      const steps = -Math.sign(e.deltaY) * (e.deltaMode === 1 ? 0.5 : Math.min(1, Math.abs(e.deltaY) / 200));
      if (steps) actions.push({ type: 'zoom', value: steps });
    }, { passive: false });
    const touches = new Map();
    let pinch = null;
    zoomTarget.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      gesture();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    zoomTarget.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && Math.abs(Math.log2(d / pinch)) > 0.02) { actions.push({ type: 'zoom', value: Math.log2(d / pinch) }); pinch = d; }
      }
    });
    const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
    zoomTarget.addEventListener('pointerup', endTouch);
    zoomTarget.addEventListener('pointercancel', endTouch);
    zoomTarget.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  }

  const buttons = new Map();
  if (touchRoot) mountButtons(touchRoot);

  function mountButtons(root) {
    root.replaceChildren();
    const clusters = { left: document.createElement('div'), right: document.createElement('div') };
    clusters.left.className = 'touch-cluster touch-left';
    clusters.right.className = 'touch-cluster touch-right';
    for (const b of BUTTONS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'stamp-button';
      el.textContent = b.label;
      el.dataset.control = b.id;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        gesture();
        root.classList.add('is-touch');
        if (b.tap) { tap(b.id); return; }
        el.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId, b.id);
        if (b.id === 'full' || b.id === 'cut') pulses.add(b.id);
        if (b.id === 'rotLeft' || b.id === 'rotRight') hold = 0;
        updateButtons();
      });
      const release = (e) => { pointers.delete(e.pointerId); updateButtons(); };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      buttons.set(b.id, el);
      clusters[b.cluster].append(el);
    }
    root.append(clusters.left, clusters.right);
    // Any touch anywhere reveals the buttons (desktop mice never do).
    window.addEventListener('touchstart', () => root.classList.add('is-touch'), { passive: true, once: true });
  }

  function isHeld(control) {
    if (held.has(control)) return true;
    for (const c of pointers.values()) if (c === control) return true;
    return false;
  }

  function updateButtons() {
    for (const [id, el] of buttons) {
      const down = id === 'holdPro' ? hold === 1 : id === 'holdRet' ? hold === 2 : isHeld(id);
      el.classList.toggle('is-down', down);
    }
  }

  // The command for the next simulation tick.
  function command() {
    const up = isHeld('thrUp');
    const down = isHeld('thrDown');
    const left = isHeld('rotLeft');
    const right = isHeld('rotRight');
    const stage = stagePending ? 1 : 0;
    stagePending = false;
    const full = isHeld('full') || pulses.has('full') ? 1 : 0;
    const cut = isHeld('cut') || pulses.has('cut') ? 1 : 0;
    pulses.clear();
    return {
      thr: up === down ? 0 : up ? 1 : -1,
      rot: left === right ? 0 : right ? 1 : -1,
      full,
      cut,
      stage,
      hold,
    };
  }

  return {
    command,
    // Drain the queued one-shot actions ('restart', 'confirm', 'back', { type: 'zoom', value }).
    takeActions() { return actions.splice(0, actions.length); },
    // Queue a staging command for the next tick (Enter in flight).
    stageNow() { stagePending = true; },
    get hold() { return hold; },
    setHold(value) { hold = value; updateButtons(); },
    onFirstGesture(fn) { if (gestured) fn(); else gestureListeners.add(fn); },
    // Switch the keyboard between flying and the replay transport.
    setMode(next) { mode = next; held.clear(); pointers.clear(); pulses.clear(); stagePending = false; updateButtons(); },
    // Key labels learned from what the player actually typed (code -> letter).
    get observedLabels() { return { ...observed }; },
    onLabels(fn) { labelListeners.add(fn); },
    get mode() { return mode; },
    setButtonsVisible(visible) { if (touchRoot) touchRoot.classList.toggle('is-hidden', !visible); },
    // Any flight command being given right now (used to dismiss the start card).
    get active() { return held.size > 0 || pointers.size > 0; },
  };
}
