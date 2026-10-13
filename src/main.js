// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { predictDescent } from './core/predict.js';
import { computeAlerts } from './core/alerts.js';
import { createCapcom } from './core/capcom.js';
import { createPlayback } from './core/playback.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock, mountPage, unmountPage, reportPage, startPage } from './ui/screens.js';
import { createInput } from './ui/input.js';
import { createHud, HUD_HEIGHT } from './ui/hud.js';
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
let playback = null;        // set while a recorded flight is being replayed
let lastRecording = null;   // the most recent live flight, for replay
function stepGame(dt) {
  if (playback) playback.step(dt);
  else flight.step(input.command(), dt);
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
  loop.resume();
}

function handleAction(action) {
  if (action === 'begin') { closePage(); return; }
  if (action === 'restart') { closePage(); restart(); return; }
  if (action === 'replay') { closePage(); replay(); return; }
}

function beginFlight(next, replaying) {
  flight = next;
  playback = replaying || null;
  capcom = createCapcom();
  alerts = null;
  reportDueAt = null;
  loop.reset();
  camera.snap(flight.state);
  lastMetShown = -1;
  updateTitleBlock(titleBlock, { document: replaying ? 'REPLAY' : 'BLUEPRINT' });
}

function restart() {
  if (!playback && flight.tick > 0) lastRecording = flight.recording();
  beginFlight(createFlight({ seed: 1 }), null);
}

// Replay the last live flight from its recording: same seed, same inputs,
// same landing spot.
function replay() {
  if (!playback && flight.tick > 0) lastRecording = flight.recording();
  if (!lastRecording) return;
  const pb = createPlayback(lastRecording);
  beginFlight(pb.flight, pb);
}

const touchRoot = document.getElementById('touch-controls');
const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
function layout() {
  camera.setViewport(surface.width, Math.max(120, surface.height - HUD_HEIGHT), 0);
  // Keep the surface clear of the on-screen buttons when they are showing.
  const buttonsShown = (coarsePointer && coarsePointer.matches) || touchRoot.classList.contains('is-touch');
  camera.groundClearance = buttonsShown ? 168 : 40;
}
layout();
camera.snap(flight.state);

function render(alpha, frameDt) {
  const view = interpolated(flight, alpha);
  camera.follow(view, frameDt);
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
  const prediction = flight.phase === 'flying' ? predictDescent(view, flight.terrain, flight.body.gravity) : null;
  drawScene(surface.ctx, camera, { state: view, cfg: flight.cfg, phase: flight.phase, terrain: flight.terrain, prediction });
  const a = alerts || computeAlerts(flight, prediction);
  hud.update(view, a, capcom.latest, frameDt);
  hud.draw(surface.ctx, {
    width: surface.width,
    height: surface.height,
    titleBlockWidth: titleBlock.offsetWidth || 240,
    narrow: surface.width < 720,
    timeSeconds: performance.now() / 1000,
  }, view, a, capcom.latest);
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
    if (pageOpen === 'start' && (action === 'confirm' || action === 'restart')) { closePage(); continue; }
    if (pageOpen === 'report' && action === 'confirm') { closePage(); restart(); continue; }
    if (action === 'restart') { closePage(); restart(); }
    if (action === 'replay') { closePage(); replay(); }
    if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
  }
  // Any flight command dismisses the start card too.
  if (pageOpen === 'start') {
    const c = input.command();
    if (c.thr || c.rot || c.full || c.cut) closePage();
  }
  const { alpha } = loop.advance(nowMs / 1000);
  // A crash cuts hard to the report; a landing lets the touchdown settle first.
  if (flight.phase !== 'flying' && !pageOpen && reportDueAt === null) {
    reportDueAt = flight.tick + (flight.phase === 'crashed' ? 20 : 75);
    if (flight.phase === 'crashed') sfx.crash(); else sfx.touchdown();
  }
  sfx.setEngine(flight.phase === 'flying' ? flight.state.thrust / flight.cfg.maxThrust : 0);
  if (reportDueAt !== null && !pageOpen && flight.tick >= reportDueAt) {
    reportDueAt = null;
    openPage('report', reportPage(flight));
  }
  render(alpha, frameDt);
  const metSeconds = Math.floor(flight.state.time);
  if (metSeconds !== lastMetShown) {
    lastMetShown = metSeconds;
    updateTitleBlock(titleBlock, { met: metSeconds });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
openPage('start', startPage());
loop.pause();

// Pause the clock while the tab is hidden; resume cleanly when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.pause(); else if (!pageOpen) loop.resume();
});

surface.onResize(() => { layout(); render(0, 0); });

// Read-only hook for automated playtests (tools/check.js and friends).
window.__karman = { get flight() { return flight; }, get phase() { return flight.phase; } };
