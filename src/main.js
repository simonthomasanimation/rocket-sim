// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { predictCoast } from './core/predict.js';
import { computeAlerts } from './core/alerts.js';
import { createCapcom } from './core/capcom.js';
import { buildTimeline, sampleTimeline } from './core/timeline.js';
import { deltaV, twr, activeStage, progradeAngle } from './core/craft.js';
import { SCENARIOS, SCENARIO_ORDER } from './core/scenario.js';
import { WARP_LADDER, maxWarpIndex } from './core/warp.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene, drawDetail } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock, stampTitleBlock, mountPage, unmountPage, reportPage, orbitPage, startPage } from './ui/screens.js';
import { createInput, keyLabels } from './ui/input.js';
import { createHud, hudHeight } from './ui/hud.js';
import { createTransport } from './ui/transport.js';
import { createMixer } from './audio/mixer.js';
import { createSfx } from './audio/sfx.js';

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');
const pageRoot = document.getElementById('page');
const camera = createCamera();
const hud = createHud();
let capcom = createCapcom();
const input = createInput({ touchRoot: document.getElementById('touch-controls'), zoomTarget: surface.canvas });
window.addEventListener('touchstart', () => layout(), { passive: true, once: true });
const mixer = createMixer();
const sfx = createSfx(mixer);
input.onFirstGesture(() => mixer.start());

let scenarioId = 'descent';
let flight = createFlight({ seed: 1, scenario: scenarioId });
camera.bodyRadius = flight.body.radius;
let alerts = null;
let replay = null;          // { timeline, cursor, speed, playing } while replaying
let lastRecording = null;   // the most recent live flight, for replay
// Shuttle ladder, shared by the replay and the live time warp: each press
// of the right arrow climbs one notch. Live, the physics steps per frame
// scale with it (the step itself stays 1/60 s, so the flight replays
// exactly), capped by how close the ground is (core/warp.js).
const SPEEDS = WARP_LADDER;
const WARPS = WARP_LADDER;
let warp = 0;
function setWarp(i) {
  const cap = maxWarpIndex(flight);
  warp = Math.max(0, Math.min(cap, i));
  const w = WARPS[warp];
  const text = `×${w % 1 === 0 ? w : w.toFixed(1)}`;
  updateTitleBlock(titleBlock, { warp: warp === cap && cap < WARPS.length - 1 ? `${text} MAX` : text });
  // Faster than real time is shown inverted so it cannot be forgotten.
  const cell = titleBlock.querySelector('[data-field="warp"]');
  if (cell) cell.classList.toggle('is-active', warp > 0);
}

let shortPrediction = null;
let sinceShort = 99;
let seenEvents = 0;
function stepGame(dt) {
  flight.step(input.command(), dt);
  // The alert rules look ten seconds ahead; a short prediction every third
  // tick is plenty. The drawing predicts the whole path from the view.
  if (flight.phase !== 'flying') shortPrediction = null;
  else if (sinceShort >= 3) { shortPrediction = predictCoast(flight.state, flight.body, flight.terrain, { maxTime: 12, maxSteps: 400 }); sinceShort = 0; }
  sinceShort += 1;
  alerts = computeAlerts(flight, shortPrediction);
  capcom.update(flight, alerts);
  // Sounds and stamps for new events.
  for (; seenEvents < flight.events.length; seenEvents++) {
    const ev = flight.events[seenEvents];
    if (ev.type === 'staged') sfx.stage();
    else if (ev.type === 'orbit') stampTitleBlock(titleBlock, 'ORBIT');
  }
  // Coming down into a slower band drops the warp to that band's cap.
  if (warp > maxWarpIndex(flight)) setWarp(warp);
}
const loop = createFixedLoop({ hz: 60, maxStepsPerFrame: 8, step: stepGame });

let pageOpen = null;        // 'start' | 'report' | null
let reportDueAt = null;     // flight tick at which the report page opens
let orbitDueAt = null;      // flight tick at which the orbit report opens (goal: orbit)
let orbitShown = false;

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
  const pick = /^pick(\d)$/.exec(action);
  if (pick) { const id = SCENARIO_ORDER[Number(pick[1]) - 1]; if (id) { closePage(); scenarioId = id; restart(); } return; }
  if (action === 'begin') { closePage(); return; }
  if (action === 'restart') { closePage(); restart(); return; }
  if (action === 'newStart') { showPlan(); return; }
  if (action === 'replay') { closePage(); startReplay(); return; }
}

function showPlan() {
  if (replay) exitReplay(false);
  loop.pause();
  openPage('start', startPage({ ...knownKeys, ...input.observedLabels }));
}

// Space holds the live flight; Space or the right arrow (or any restart)
// lets it go again, always at x1.
let userPaused = false;
function setPaused(value) {
  if (userPaused === value) return;
  userPaused = value;
  if (userPaused) loop.pause(); else loop.resume();
  setWarp(0);
  updateTitleBlock(titleBlock, { document: userPaused ? 'PAUSED' : 'BLUEPRINT' });
  const cell = titleBlock.querySelector('[data-field="document"]');
  if (cell) cell.classList.toggle('is-active', userPaused);
}
function togglePause() { setPaused(!userPaused); }
// Right arrow: a notch faster, or play again from pause. Left arrow: a
// notch slower, down to x1 (Space is the pause).
function warpUp() { if (userPaused) setPaused(false); else setWarp(warp + 1); }
function warpDown() { if (!userPaused) setWarp(warp - 1); }

function restart() {
  userPaused = false;
  if (replay) exitReplay(false);
  else if (flight.tick > 0) lastRecording = flight.recording();
  flight = createFlight({ seed: 1, scenario: scenarioId });
  capcom = createCapcom();
  alerts = null;
  shortPrediction = null;
  sinceShort = 99;
  seenEvents = 0;
  reportDueAt = null;
  orbitDueAt = null;
  orbitShown = false;
  input.setHold(0);
  loop.reset();
  if (!pageOpen) loop.resume();
  camera.resetZoom();
  camera.snap(flight.state);
  lastMetShown = -1;
  stampTitleBlock(titleBlock, null);
  setWarp(0);
  updateTitleBlock(titleBlock, { document: 'BLUEPRINT', sheet: `${SCENARIO_ORDER.indexOf(scenarioId) + 1} OF ${SCENARIO_ORDER.length}` });
}

// --- Replay -------------------------------------------------------------------
// The last live flight is run to its end from its recording with its ticks
// kept, then a cursor moves over that tape: forwards, backwards or
// scrubbing. Same seed, same inputs, same landing spot.
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
  const over = finished.phase !== 'flying' && finished.phase !== 'pad';
  if (showReport && over) openPage('report', reportPage(finished));
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
    case 'zoomIn': camera.zoom(0.5); break;
    case 'zoomOut': camera.zoom(-0.5); break;
    case 'zoomReset': camera.resetZoom(); break;
    case 'zoom': camera.zoom(value); break;
    default: break;
  }
}

// Move the replay cursor on by one screen frame.
function advanceReplay(frameDt) {
  const r = replay;
  const last = r.timeline.length - 1;
  if (r.playing) {
    r.cursor += (r.speed * frameDt) / r.timeline.dt;
    if (r.cursor >= last) { r.cursor = last; r.playing = false; }
    if (r.cursor <= 0) { r.cursor = 0; r.playing = false; }
  }
  transport.update({ time: r.cursor * r.timeline.dt, duration: r.timeline.duration, speed: r.speed, playing: r.playing });
}

const touchRoot = document.getElementById('touch-controls');
const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
function narrow() { return surface.width < 720; }
function layout() {
  const isNarrow = narrow();
  document.documentElement.style.setProperty('--hud-height', `${hudHeight(isNarrow)}px`);
  camera.setViewport(surface.width, Math.max(120, surface.height - hudHeight(isNarrow)), 0);
  // Keep the surface clear of the on-screen buttons when they are showing.
  const buttonsShown = !replay && ((coarsePointer && coarsePointer.matches) || touchRoot.classList.contains('is-touch'));
  const cluster = touchRoot.querySelector('.touch-right');
  camera.groundClearance = replay ? transport.height + 48 : buttonsShown ? (cluster ? cluster.offsetHeight : 168) + 56 : 96;
}
layout();
camera.snap(flight.state);

// What to draw this frame: the live flight between two ticks, or a sample
// of the replay tape at the cursor.
function currentScene(alpha) {
  if (replay) {
    const sample = sampleTimeline(replay.timeline, replay.cursor);
    const src = replay.timeline.flight;
    return { view: sample.state, phase: sample.phase, alerts: sample.alerts, capcom: sample.capcom, src, debris: sample.debris, hold: 0 };
  }
  const view = interpolated(flight, alpha);
  return { view, phase: flight.phase, alerts: null, capcom: capcom.latest, src: flight, debris: flight.debris, hold: input.hold };
}

// How far the predicted path reaches from the craft (up, down, sideways in
// the local frame, metres), for the camera's framing.
function extentOf(view, prediction) {
  if (!prediction) return null;
  const r = Math.hypot(view.x, view.y) || 1;
  const ux = view.x / r; const uy = view.y / r;
  let up = 0; let down = 0; let side = 0;
  const pts = prediction.points;
  const stride = Math.max(1, Math.floor(pts.length / 400));
  for (let i = 0; i < pts.length; i += stride) {
    const dx = pts[i].x - view.x; const dy = pts[i].y - view.y;
    const radial = dx * ux + dy * uy;
    const along = Math.abs(dx * uy - dy * ux);
    if (radial > up) up = radial;
    if (-radial > down) down = -radial;
    if (along > side) side = along;
  }
  return { up, down, side };
}

function render(alpha, frameDt) {
  const scene = currentScene(alpha);
  const { view, phase, src } = scene;
  const prediction = phase === 'flying' ? predictCoast(view, src.body, src.terrain) : null;
  camera.follow(view, frameDt, extentOf(view, prediction));
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
  drawScene(surface.ctx, camera, { state: view, cfg: src.cfg, phase, body: src.body, terrain: src.terrain, prediction, debris: scene.debris });
  // Detail inset: the vehicle full-frame whenever the main view draws it small.
  const isNarrow = narrow();
  const box = isNarrow
    ? { x: surface.width - 16 - 136, y: 16 + (titleBlock.offsetHeight || 170) + 8, w: 136, h: 168 }
    : { x: surface.width - 16 - 240, y: 16, w: 240, h: 272 };
  drawDetail(surface.ctx, camera, { state: view, cfg: src.cfg, phase, debris: scene.debris }, box);
  const a = scene.alerts || alerts || computeAlerts(src, prediction);
  hud.update(view, a, scene.capcom, frameDt);
  const up = Math.atan2(view.x, view.y);
  const speed = Math.hypot(view.vx, view.vy);
  const info = {
    stageText: `${view.stage + 1}/${src.cfg.stages.length}`,
    stages: src.cfg.stages.map((st, i) => ({ name: st.name, frac: i === view.stage ? view.fuel / st.fuelMass : i > view.stage ? 1 : 0, state: i < view.stage ? 'dropped' : i === view.stage ? 'live' : 'full' })),
    dv: deltaV(view, src.cfg),
    twr: twr(view, src.cfg, src.body),
    hold: scene.hold,
    paused: !replay && userPaused && !pageOpen,
    prograde: speed > 0.5 ? progradeAngle(view) - up : null,
    hDirection: view.vx * Math.cos(up) - view.vy * Math.sin(up),
  };
  hud.draw(surface.ctx, {
    width: surface.width,
    height: surface.height,
    titleBlockWidth: titleBlock.offsetWidth || 240,
    narrow: isNarrow,
    timeSeconds: performance.now() / 1000,
    camera,
  }, view, a, scene.capcom, info);
  return scene;
}

mountTitleBlock(titleBlock, {
  program: 'KÁRMÁN PROGRAM',
  document: 'BLUEPRINT',
  sheet: 1,
  of: SCENARIO_ORDER.length,
  date: new Date(),
  met: 0,
  warp: '×1',
  audio: 'ON',
});

let lastMetShown = -1;
let lastFrameMs = null;
function frame(nowMs) {
  const frameDt = lastFrameMs === null ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  for (const raw of input.takeActions()) {
    const action = typeof raw === 'string' ? raw : raw.type;
    const value = typeof raw === 'string' ? undefined : raw.value;
    if (replay) { onTransport(action, value); continue; }
    if (pageOpen === 'start') {
      const pick = /^pick(\d)$/.exec(action);
      if (pick) handleAction(action);
      else if (action === 'confirm' || action === 'pause' || action === 'back') closePage();
      continue;
    }
    if (pageOpen === 'orbit') {
      // The orbit card: Enter or Space carries on flying.
      if (action === 'confirm' || action === 'pause' || action === 'back') closePage();
      else if (action === 'newStart') showPlan();
      else if (action === 'restart') { closePage(); restart(); }
      else if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
      continue;
    }
    if (pageOpen === 'report') {
      if (action === 'confirm' || action === 'pause') { closePage(); restart(); }
      else if (action === 'back' || action === 'newStart') showPlan();
      else if (action === 'restart') { closePage(); restart(); }
      else if (action === 'replay') { closePage(); startReplay(); }
      else if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
      continue;
    }
    switch (action) {
      case 'restart': restart(); break;
      case 'newStart': case 'back': showPlan(); break;
      case 'replay': startReplay(); break;
      case 'pause': togglePause(); break;
      case 'confirm': input.stageNow(); break;
      case 'mute': updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' }); break;
      case 'warpUp': warpUp(); break;
      case 'warpDown': warpDown(); break;
      case 'zoomIn': camera.zoom(0.5); break;
      case 'zoomOut': camera.zoom(-0.5); break;
      case 'zoomReset': camera.resetZoom(); break;
      case 'zoom': camera.zoom(value); break;
      default: break;
    }
  }
  const { alpha } = loop.advance(nowMs / 1000, WARPS[warp]);
  if (replay) {
    advanceReplay(frameDt);
  } else {
    // A crash cuts hard to the report; a landing lets the touchdown settle first.
    const over = flight.phase !== 'flying' && flight.phase !== 'pad';
    if (over && !pageOpen && reportDueAt === null) {
      reportDueAt = flight.tick + (flight.phase === 'landed' ? 75 : 20);
      if (flight.phase === 'crashed') sfx.crash(); else if (flight.phase === 'landed') sfx.touchdown();
      setWarp(0);
    }
    if (reportDueAt !== null && !pageOpen && flight.tick >= reportDueAt) {
      reportDueAt = null;
      openPage('report', reportPage(flight));
    }
    // A flight whose goal is orbit gets its card once the stamp has landed.
    if (!orbitShown && flight.stats.orbit && flight.scenario.goal === 'orbit' && orbitDueAt === null) orbitDueAt = flight.tick + 150;
    if (orbitDueAt !== null && !pageOpen && !over && flight.tick >= orbitDueAt) {
      orbitDueAt = null;
      orbitShown = true;
      setWarp(0);
      openPage('orbit', orbitPage(flight));
    }
  }
  const scene = render(alpha, frameDt);
  const running = replay ? replay.playing && Math.abs(replay.speed) === 1 : warp === 0;
  sfx.setEngine(scene.phase === 'flying' && running ? scene.view.thrust / activeStage(scene.view, scene.src.cfg).maxThrust : 0);
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
let knownKeys = {};
keyLabels(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyX']).then((keys) => {
  knownKeys = keys;
  if (pageOpen === 'start') openPage('start', startPage({ ...keys, ...input.observedLabels }));
  transport.setKeyLabels({ ...keys, ...input.observedLabels });
});
// Browsers without a layout map still reveal the layout as keys get typed.
input.onLabels((keys) => transport.setKeyLabels(keys));

// Pause the clock while the tab is hidden; resume cleanly when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.pause(); else if (!pageOpen && !replay && !userPaused) loop.resume();
});

surface.onResize(() => { layout(); render(0, 0); });

// Read-only hook for automated playtests (tools/check.js and friends).
window.__karman = {
  get flight() { return flight; },
  get phase() { return flight.phase; },
  get replay() { return replay; },
  get scenario() { return scenarioId; },
  get camera() { return camera; },
  get warp() { return WARPS[warp]; },
  scenarios: Object.keys(SCENARIOS),
};
