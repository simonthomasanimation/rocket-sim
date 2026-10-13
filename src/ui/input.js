// Input: keyboard and on-screen touch buttons, folded into one command per
// tick for the simulation. The sim never sees key codes, only the command
// { thr, rot, full, cut } and one-shot actions such as 'restart'.
//
// Keys: Shift / Up / W throttle up, Ctrl / Down / S throttle down, Z full,
// X cut, A / Left rotate left, D / Right rotate right, R restart.

const KEYS = {
  ShiftLeft: 'thrUp', ShiftRight: 'thrUp', ArrowUp: 'thrUp', KeyW: 'thrUp',
  ControlLeft: 'thrDown', ControlRight: 'thrDown', ArrowDown: 'thrDown', KeyS: 'thrDown',
  KeyZ: 'full', KeyX: 'cut',
  ArrowLeft: 'rotLeft', KeyA: 'rotLeft',
  ArrowRight: 'rotRight', KeyD: 'rotRight',
};
const ACTIONS = { KeyR: 'restart', Enter: 'confirm', Space: 'confirm', Escape: 'back' };

// On-screen buttons: label, control, and where they sit (left or right cluster).
const BUTTONS = [
  { id: 'rotLeft', label: 'ROT L', cluster: 'left' },
  { id: 'rotRight', label: 'ROT R', cluster: 'left' },
  { id: 'thrUp', label: 'THR +', cluster: 'right' },
  { id: 'thrDown', label: 'THR −', cluster: 'right' },
  { id: 'full', label: 'FULL', cluster: 'right' },
  { id: 'cut', label: 'CUT', cluster: 'right' },
];

export function createInput({ touchRoot } = {}) {
  const held = new Set();      // controls currently held (keyboard or touch)
  const pointers = new Map();  // pointerId -> control
  const actions = [];          // one-shot actions queued for the game
  const gestureListeners = new Set();
  let gestured = false;

  function gesture() {
    if (gestured) return;
    gestured = true;
    gestureListeners.forEach((fn) => fn());
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (KEYS[e.code] || ACTIONS[e.code]) e.preventDefault(); return; }
    gesture();
    const control = KEYS[e.code];
    if (control) { held.add(control); e.preventDefault(); return; }
    const action = ACTIONS[e.code];
    if (action) { actions.push(action); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const control = KEYS[e.code];
    if (control) { held.delete(control); e.preventDefault(); }
  });
  // Dropping focus (alt-tab, phone call) releases every key.
  window.addEventListener('blur', () => { held.clear(); pointers.clear(); updateButtons(); });

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
        el.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId, b.id);
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
    for (const [id, el] of buttons) el.classList.toggle('is-down', isHeld(id));
  }

  // The command for the next simulation tick.
  function command() {
    const up = isHeld('thrUp');
    const down = isHeld('thrDown');
    const left = isHeld('rotLeft');
    const right = isHeld('rotRight');
    return {
      thr: up === down ? 0 : up ? 1 : -1,
      rot: left === right ? 0 : right ? 1 : -1,
      full: isHeld('full') ? 1 : 0,
      cut: isHeld('cut') ? 1 : 0,
    };
  }

  return {
    command,
    // Drain the queued one-shot actions ('restart', 'confirm', 'back').
    takeActions() { return actions.splice(0, actions.length); },
    onFirstGesture(fn) { if (gestured) fn(); else gestureListeners.add(fn); },
    setButtonsVisible(visible) { if (touchRoot) touchRoot.classList.toggle('is-hidden', !visible); },
  };
}
