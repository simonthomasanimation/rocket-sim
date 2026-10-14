// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { predictDescent } from './core/predict.js';
import { computeAlerts } from './core/alerts.js';
import { createCapcom } from './core/capcom.js';
import { buildTimeline, sampleTimeline } from './core/timeline.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock, mountPage, unmountPage, reportPage, startPage } from './ui/screens.js';
import { createInput, keyLabels } from './ui/input.js';
import { createHud, HUD_HEIGHT } from './ui/hud.js';
import { createTransport } from './ui/transport.js';
import { createMixer } from './audio/mixer.js';
import { createSfx } from './audio/sfx.js';

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');
const pageRoot = document.getElementById('page');
const camera = createCamera();
const hud = createHud();
let capcom = createCapcom();
const input = createInput({ touchRoot: document.getElementById('touch-controls') });
window.addEventListener('touchstart', () => layout(), { passive: true, once: true });
const mixer = createMixer();
const sfx = createSfx(mixer);
input.onFirstGesture(() => mixer.start());

let flight = createFlight({ seed: 1 });
let alerts = null;
let replay = null;          // { timeline, cursor, speed, playing } while replaying
let lastRecording = null;   // the most recent live flight, for replay
const SPEEDS = [1, 4, 8, 16];
function stepGame(dt) {
  flight.step(input.command(), dt);
  const prediction = flight.phase === 'flying' ? predictDescent(flight.state, flight.terrain, flight.body.gravity) : null;
  alerts = computeAlerts(flight, prediction);
  capcom.update(flight, alerts);
}
const loop = createFixedLoop({ hz: 60, step: stepGame });

let pageOpen = null;        // 'start' | 'report' | null
let reportDueAt = null;     // flight tick at which the report page opens

function openPage(kind, page) {
  pageOpen = kind;
  mountPage(pageRoot, page, handleAction);
  input.setButtonsVisible(false);
}

function closePage() {
  pageOpen = null;
  unmountPage(pageRoot);
  input.setButtonsVisible(true);
  if (!replay && !userPaused) loop.resume();
}

function handleAction(action) {
  if (action === 'begin') { closePage(); return; }
  if (action === 'restart') { closePage(); restart(); return; }
  if (action === 'replay') { closePage(); startReplay(); return; }
}

// P holds the live flight; P again (or any restart) lets it go.
let userPaused = false;
function togglePause() {
  userPaused = !userPaused;
  if (userPaused) loop.pause(); else loop.resume();
  updateTitleBlock(titleBlock, { document: userPaused ? 'PAUSED' : 'BLUEPRINT' });
}

function restart() {
  userPaused = false;
  if (replay) exitReplay(false);
  else if (flight.tick > 0) lastRecording = flight.recording();
  flight = createFlight({ seed: 1 });
  capcom = createCapcom();
  alerts = null;
  reportDueAt = null;
  loop.reset();
  if (!pageOpen) loop.resume();
  camera.snap(flight.state);
  lastMetShown = -1;
  updateTitleBlock(titleBlock, { document: 'BLUEPRINT' });
}

// --- Replay -------------------------------------------------------------------
// The last live flight is run to its end from its recording with every tick
// kept, then a cursor moves over that tape: forwards, backwards, stepping
// or scrubbing. Same seed, same inputs, same landing spot.
const transport = createTransport(document.getElementById('transport'), onTransport);

function startReplay() {
  if (!replay && flight.tick > 0) lastRecording = flight.recording();
  if (!lastRecording) return;
  const timeline = buildTimeline(lastRecording);
  replay = { timeline, cursor: 0, speed: 1, playing: true };
  loop.pause();
  input.setMode('replay');
  input.setButtonsVisible(false);
  transport.show();
  layout();
  camera.snap(timeline.at(0).state);
  lastMetShown = -1;
  updateTitleBlock(titleBlock, { document: 'REPLAY' });
}

// Leave the replay; by default back to the flight report of that flight.
function exitReplay(showReport = true) {
  if (!replay) return;
  const finished = replay.timeline.flight;
  replay = null;
  transport.hide();
  layout();
  input.setMode('flight');
  input.setButtonsVisible(true);
  camera.snap(flight.state);
  updateTitleBlock(titleBlock, { document: 'BLUEPRINT' });
  if (showReport && finished.phase !== 'flying') openPage('report', reportPage(finished));
  else if (showReport && !userPaused) loop.resume(); // the live flight carries on where it was
}

function onTransport(action, value) {
  if (!replay) return;
  const r = replay;
  const last = r.timeline.length - 1;
  const faster = (dir) => {
    // Same direction: next speed up; other direction or paused: start at ×1.
    const i = SPEEDS.indexOf(Math.abs(r.speed));
    const next = r.playing && Math.sign(r.speed) === dir && i >= 0 ? SPEEDS[Math.min(SPEEDS.length - 1, i + 1)] : 1;
    r.speed = dir * next;
    r.playing = true;
  };
  switch (action) {
    case 'rev': faster(-1); break;
    case 'fwd': faster(1); break;
    case 'pause': r.playing = false; break;
    case 'toggle':
      if (r.playing) r.playing = false;
      else { if (r.cursor >= last) r.cursor = 0; r.speed = 1; r.playing = true; }
      break;
    case 'stepBack': r.playing = false; r.cursor = Math.max(0, Math.ceil(r.cursor) - 1); break;
    case 'stepFwd': r.playing = false; r.cursor = Math.min(last, Math.floor(r.cursor) + 1); break;
    case 'start': r.cursor = 0; camera.snap(r.timeline.at(0).state); break;
    case 'end': r.cursor = last; r.playing = false; camera.snap(r.timeline.at(last).state); break;
    case 'seek': {
      const target = Math.round(value * last);
      if (Math.abs(target - r.cursor) > 120) camera.snap(r.timeline.at(target).state);
      r.cursor = target;
      r.playing = false;
      break;
    }
    case 'exit': exitReplay(true); break;
    case 'restart': closePage(); restart(); break;
    case 'mute': updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' }); break;
    default: break;
  }
}

// Move the replay cursor on by one screen frame.
function advanceReplay(frameDt) {
  const r = replay;
  const last = r.timeline.length - 1;
  if (r.playing) {
    r.cursor += r.speed * frameDt * 60;
    if (r.cursor >= last) { r.cursor = last; r.playing = false; }
    if (r.cursor <= 0) { r.cursor = 0; r.playing = false; }
  }
  transport.update({ time: r.cursor * r.timeline.dt, duration: r.timeline.duration, speed: r.speed, playing: r.playing });
}

const touchRoot = document.getElementById('touch-controls');
const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
function layout() {
  camera.setViewport(surface.width, Math.max(120, surface.height - HUD_HEIGHT), 0);
  // Keep the surface clear of the on-screen buttons when they are showing.
  const buttonsShown = !replay && ((coarsePointer && coarsePointer.matches) || touchRoot.classList.contains('is-touch'));
  camera.groundClearance = replay ? transport.height + 32 : buttonsShown ? 168 : 40;
}
layout();
camera.snap(flight.state);

// What to draw this frame: the live flight between two ticks, or a sample
// of the replay tape at the cursor.
function currentScene(alpha) {
  if (replay) {
    const sample = sampleTimeline(replay.timeline, replay.cursor);
    const src = replay.timeline.flight;
    return { view: sample.state, phase: sample.phase, alerts: sample.alerts, capcom: sample.capcom, src };
  }
  const view = interpolated(flight, alpha);
  return { view, phase: flight.phase, alerts: null, capcom: capcom.latest, src: flight };
}

function render(alpha, frameDt) {
  const scene = currentScene(alpha);
  const { view, phase, src } = scene;
  camera.follow(view, frameDt);
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
  const prediction = phase === 'flying' ? predictDescent(view, src.terrain, src.body.gravity) : null;
  drawScene(surface.ctx, camera, { state: view, cfg: src.cfg, phase, terrain: src.terrain, prediction });
  const a = scene.alerts || alerts || computeAlerts(src, prediction);
  hud.update(view, a, scene.capcom, frameDt);
  hud.draw(surface.ctx, {
    width: surface.width,
    height: surface.height,
    titleBlockWidth: titleBlock.offsetWidth || 240,
    narrow: surface.width < 720,
    timeSeconds: performance.now() / 1000,
  }, view, a, scene.capcom);
  return scene;
}

mountTitleBlock(titleBlock, {
  program: 'KÁRMÁN PROGRAM',
  document: 'BLUEPRINT',
  sheet: 1,
  of: 1,
  date: new Date(),
  met: 0,
  audio: 'ON',
});

let lastMetShown = -1;
let lastFrameMs = null;
function frame(nowMs) {
  const frameDt = lastFrameMs === null ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  for (const action of input.takeActions()) {
    if (replay) { onTransport(action); continue; }
    if (pageOpen === 'start' && (action === 'confirm' || action === 'restart')) { closePage(); continue; }
    if (pageOpen === 'report' && action === 'confirm') { closePage(); restart(); continue; }
    if (action === 'restart') { closePage(); restart(); }
    if (action === 'replay') { closePage(); startReplay(); }
    if (action === 'pause' && !pageOpen) togglePause();
    if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
  }
  // Any flight command dismisses the start card too.
  if (pageOpen === 'start') {
    const c = input.command();
    if (c.thr || c.rot || c.full || c.cut) closePage();
  }
  const { alpha } = loop.advance(nowMs / 1000);
  if (replay) {
    advanceReplay(frameDt);
  } else {
    // A crash cuts hard to the report; a landing lets the touchdown settle first.
    if (flight.phase !== 'flying' && !pageOpen && reportDueAt === null) {
      reportDueAt = flight.tick + (flight.phase === 'landed' ? 75 : 20);
      if (flight.phase === 'crashed') sfx.crash(); else if (flight.phase === 'landed') sfx.touchdown();
    }
    if (reportDueAt !== null && !pageOpen && flight.tick >= reportDueAt) {
      reportDueAt = null;
      openPage('report', reportPage(flight));
    }
  }
  const scene = render(alpha, frameDt);
  const running = replay ? replay.playing && Math.abs(replay.speed) === 1 : true;
  sfx.setEngine(scene.phase === 'flying' && running ? scene.view.thrust / scene.src.cfg.maxThrust : 0);
  const metSeconds = Math.floor(scene.view.time);
  if (metSeconds !== lastMetShown) {
    lastMetShown = metSeconds;
    updateTitleBlock(titleBlock, { met: metSeconds });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
openPage('start', startPage());
loop.pause();
// Relabel the card with the keys as printed on this keyboard, once known.
keyLabels(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyX', 'Comma', 'Period']).then((keys) => {
  if (pageOpen === 'start') openPage('start', startPage(keys));
  transport.setKeyLabels(keys);
});

// Pause the clock while the tab is hidden; resume cleanly when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.pause(); else if (!pageOpen && !replay && !userPaused) loop.resume();
});

surface.onResize(() => { layout(); render(0, 0); });

// Read-only hook for automated playtests (tools/check.js and friends).
window.__karman = { get flight() { return flight; }, get phase() { return flight.phase; }, get replay() { return replay; } };
