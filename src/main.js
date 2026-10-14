// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { predictCoast } from './core/predict.js';
import { computeAlerts } from './core/alerts.js';
import { createCapcom } from './core/capcom.js';
import { buildTimeline, sampleTimeline } from './core/timeline.js';
import { deltaV, twr, activeStage, progradeAngle, dragFactor, MAIN_HEIGHT } from './core/craft.js';
import { SCENARIOS, SCENARIO_ORDER } from './core/scenario.js';
import { WARP_LADDER, maxWarpIndex, railsLevel, warpLimitReason, burning } from './core/warp.js';
import { BODIES, bodyState, childrenOf } from './core/body.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene, drawDetail } from './render/blueprint.js';
import { createMapCamera, drawCrtPaper, drawCrt } from './render/crt.js';
import { drawVellumPaper } from './render/vellum.js';
import { createBuilder } from './ui/builder.js';
import { mountTitleBlock, updateTitleBlock, stampTitleBlock, mountPage, unmountPage, reportPage, orbitPage, startPage, formatMet } from './ui/screens.js';
import { createInput, keyLabels } from './ui/input.js';
import { createHud, hudHeight } from './ui/hud.js';
import { createTransport } from './ui/transport.js';
import { createMixer } from './audio/mixer.js';
import { createSfx } from './audio/sfx.js';

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');
const pageRoot = document.getElementById('page');
const camera = createCamera();
const mapCamera = createMapCamera();
const hud = createHud();
// Which document is on the sheet, and the page turn between them.
let doc = 'blueprint';      // 'blueprint' | 'crt' | 'vellum'
let turning = null;         // { snapshot, startedAt }
const turnCanvas = document.createElement('canvas');
let capcom = createCapcom();
const input = createInput({ touchRoot: document.getElementById('touch-controls'), zoomTarget: surface.canvas });
window.addEventListener('touchstart', () => layout(), { passive: true, once: true });
const mixer = createMixer();
const sfx = createSfx(mixer);
input.onFirstGesture(() => mixer.start());

// The builder (vellum document): its chrome lives in #vellum, its drafting on the canvas.
const builder = createBuilder({ canvas: surface.canvas, root: document.getElementById('vellum'), onAction: (a) => { if (a === 'newStart') closeBuilder(); } });

let scenarioId = 'descent';
let flight = createFlight({ seed: 1, scenario: scenarioId });
let alerts = null;
let replay = null;          // { timeline, cursor, speed, playing } while replaying
let lastRecording = null;   // the most recent live flight, for replay
// Shuttle ladder, shared by the replay and the live time warp: each press
// of the right arrow climbs one notch. Live, the physics steps per frame
// scale with it (the step itself stays 1/60 s, so the flight replays
// exactly), capped by how close the ground is (core/warp.js).
const SPEEDS = WARP_LADDER.slice(0, 13); // the replay shuttle stops at x64
const WARPS = WARP_LADDER;
let warp = 0;
let lastPrediction = null;
let hadEncounter = null;    // body id of the encounter on the last frame's path, for the burn calls  // the drawn (long) prediction: event times for the warp rules
let warpTo = null;          // { at: clock, name } while warping to an event
// Time to the next hard event on the predicted path, if one is known.
function eventIn() {
  const p = lastPrediction;
  if (!p) return Infinity;
  let t = Infinity;
  for (const e of [p.encounter, p.exit, p.entry, p.impact]) if (e && e.t < t) t = e.t;
  return t;
}
function setWarp(i) {
  const cap = maxWarpIndex(flight, eventIn());
  warp = Math.max(0, Math.min(cap, i));
  const w = WARPS[warp];
  const rails = railsLevel(warp);
  let text = `×${w % 1 === 0 ? w : w.toFixed(1)}`;
  if (rails) text += ' RAILS';
  if (warpTo) text += ` → ${warpTo.name}`;
  else if (warp === cap && cap < WARPS.length - 1) text += ' MAX';
  updateTitleBlock(titleBlock, { warp: text });
  input.setRails(rails);
  // Faster than real time is shown inverted so it cannot be forgotten.
  const cell = titleBlock.querySelector('[data-field="warp"]');
  if (cell) cell.classList.toggle('is-active', warp > 0);
}

// E: warp to the next event (Ap, Pe, SOI change, atmosphere entry, touchdown under the main), easing
// the warp down so it arrives within a couple of seconds of real time.
function startWarpTo() {
  if (flight.phase !== 'flying') return;
  const el = flight.elements;
  const p = lastPrediction;
  const candidates = [];
  if (el && el.timeToAp !== null && Number.isFinite(el.timeToAp) && el.apAlt > 0) candidates.push({ t: el.timeToAp, name: 'AP' });
  if (el && el.timeToPe !== null && el.peAlt > 0) candidates.push({ t: el.timeToPe, name: 'PE' });
  if (p && p.encounter) candidates.push({ t: p.encounter.t, name: `${p.encounter.body.toUpperCase()} SOI` });
  if (p && p.exit) candidates.push({ t: p.exit.t, name: 'SOI EXIT' });
  if (p && p.entry) candidates.push({ t: p.entry.t, name: 'ENTRY' });
  // Under a canopy the descent is steady, so the predicted touchdown is an
  // event too, and under the drogue so is the height where the main comes out.
  if (p && p.impact && flight.state.chute === 1) candidates.push({ t: p.impact.t, name: 'TOUCHDOWN' });
  if (p && flight.state.chute === 3) {
    const pt = p.points.find((q) => Math.hypot(q.x, q.y) - flight.terrain.groundRadiusAt(q.x, q.y) < MAIN_HEIGHT);
    if (pt) candidates.push({ t: pt.t, name: 'MAIN CHUTE' });
  }
  const next = candidates.filter((c) => c.t > 5).sort((a, b) => a.t - b.t)[0];
  if (!next) return;
  warpTo = { at: flight.clock + next.t - 2, name: next.name };
  steerWarpTo();
}
function steerWarpTo() {
  if (!warpTo) return;
  const remaining = warpTo.at - flight.clock;
  if (remaining <= 0 || flight.phase !== 'flying') { warpTo = null; setWarp(0); return; }
  // The highest level whose tick (rate / 60 s) still fits three times into
  // what is left, so each level lasts well under a second of real time.
  let i = 0;
  while (i + 1 < WARPS.length && WARPS[i + 1] <= 20 * remaining) i += 1;
  setWarp(i);
}

let shortPrediction = null;
let sinceShort = 99;
let seenEvents = 0;
function stepGame(dt) {
  let cmd = input.command();
  // ENTER is the next step down the stack: with only the capsule left and
  // the chute still stowed, it opens the chute.
  const st = flight.cfg.stages[flight.state.stage];
  if (cmd.stage && st.capsule && flight.state.stage === flight.cfg.stages.length - 1 && flight.state.chute === 0) cmd = { ...cmd, stage: 0, chute: 1 };
  flight.step(cmd, dt);
  // The alert rules look ten seconds ahead; a short prediction every third
  // tick is plenty. The drawing predicts the whole path from the view.
  if (flight.phase !== 'flying') shortPrediction = null;
  else if (sinceShort >= 3) { shortPrediction = predictCoast(flight.state, flight.body, flight.terrain, { maxTime: 12, maxSteps: 400, drag: flight.drag(), clock: flight.clock }); sinceShort = 0; }
  sinceShort += 1;
  alerts = computeAlerts(flight, shortPrediction);
  alerts.escaping = !!(lastPrediction && lastPrediction.escaped && flight.phase === 'flying');
  capcom.update(flight, alerts);
  // Sounds and stamps for new events.
  for (; seenEvents < flight.events.length; seenEvents++) {
    const ev = flight.events[seenEvents];
    if (ev.type === 'staged') sfx.stage();
    else if (ev.type === 'splashdown') stampTitleBlock(titleBlock, 'RECOVERED');
    else if (ev.type === 'orbit') stampTitleBlock(titleBlock, 'ORBIT');
    else if (ev.type === 'soi') { aimCamera(flight.body, flight.terrain, flight.state); camera.snap(flight.state); flashSoi(); }
    else if (ev.type === 'chute' && ev.chute === 4 && warp > 0) { warpTo = null; setWarp(0); } // the main coming out is worth watching
  }
  // Coming down into a slower band, or up to an event, drops the warp to the cap.
  if (warp > maxWarpIndex(flight, eventIn())) setWarp(warp);
}
const loop = createFixedLoop({ hz: 60, maxStepsPerFrame: 8, step: stepGame });

// A sphere-of-influence change flashes the SOI cell for a moment.
let soiFlashUntil = 0;
function flashSoi() {
  soiFlashUntil = performance.now() + 1500;
  const cell = titleBlock.querySelector('[data-field="soi"]');
  if (cell) { cell.classList.add('is-active'); setTimeout(() => { if (performance.now() >= soiFlashUntil - 10) cell.classList.remove('is-active'); }, 1500); }
}

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
  if (action === 'build') { openBuilder(); return; }
}

// --- Builder ----------------------------------------------------------------
// The vellum sheet: the flight waits, paused, while the rocket is drafted.
function openBuilder() {
  if (doc === 'vellum') return;
  if (replay) exitReplay(false);
  if (pageOpen) { pageOpen = null; unmountPage(pageRoot); }
  loop.pause();
  turnTo('vellum');
  builder.open();
  input.setMode('builder');
  input.setButtonsVisible(false);
  updateTitleBlock(titleBlock, { document: 'VELLUM', sheet: 'DESIGN' });
}
function closeBuilder() {
  if (doc !== 'vellum') return;
  builder.close();
  input.setMode('flight');
  turnTo('blueprint');
  updateTitleBlock(titleBlock, { sheet: `${SCENARIO_ORDER.indexOf(scenarioId) + 1} OF ${SCENARIO_ORDER.length}` });
  showPlan();
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
  updateTitleBlock(titleBlock, { document: userPaused ? 'PAUSED' : doc === 'crt' ? 'CRT MAP' : 'BLUEPRINT' });
  const cell = titleBlock.querySelector('[data-field="document"]');
  if (cell) cell.classList.toggle('is-active', userPaused);
}
function togglePause() { setPaused(!userPaused); }
// Right arrow: a notch faster, or play again from pause. Left arrow: a
// notch slower, down to x1 (Space is the pause).
function warpUp() {
  warpTo = null;
  if (userPaused) { setPaused(false); return; }
  const before = warp;
  setWarp(warp + 1);
  // A press that gets nowhere is answered: CAPCOM says what holds the warp.
  if (warp === before && warp < WARPS.length - 1) {
    const why = warpLimitReason(flight, eventIn());
    if (why) capcom.remark(why, flight.tick);
  }
}
function warpDown() { warpTo = null; if (!userPaused) setWarp(warp - 1); }

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
  warpTo = null;
  lastPrediction = null;
  input.setHold(0);
  loop.reset();
  if (!pageOpen) loop.resume();
  camera.resetZoom();
  aimCamera(flight.body, flight.terrain, flight.state);
  camera.snap(flight.state);
  lastMetShown = -1;
  stampTitleBlock(titleBlock, null);
  setWarp(0);
  updateTitleBlock(titleBlock, { document: 'BLUEPRINT', sheet: `${SCENARIO_ORDER.indexOf(scenarioId) + 1} OF ${SCENARIO_ORDER.length}`, soi: flight.body.name });
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
    case 'zoomIn': zoomBy(0.5); break;
    case 'zoomOut': zoomBy(-0.5); break;
    case 'zoomReset': (doc === 'crt' ? mapCamera : camera).resetZoom(); break;
    case 'centre': (doc === 'crt' ? mapCamera : camera).centre(); break;
    case 'lock': (doc === 'crt' ? mapCamera : camera).toggleLock(); break;
    case 'zoom': zoomBy(value); break;
    case 'pan': (doc === 'crt' ? mapCamera : camera).pan(value.dx, value.dy); break;
    case 'map': turnPage(); break;
    default: break;
  }
}

function zoomBy(steps) { (doc === 'crt' ? mapCamera : camera).zoom(steps); }

// Page turn: the old sheet is kept as a picture and wiped off over 200 ms
// while the new document draws beneath (the grid stays put).
function turnPage() {
  if (doc === 'vellum') return;
  turnTo(doc === 'crt' ? 'blueprint' : 'crt');
}
function turnTo(next) {
  if (next === doc) return;
  try {
    turnCanvas.width = surface.canvas.width; turnCanvas.height = surface.canvas.height;
    turnCanvas.getContext('2d').drawImage(surface.canvas, 0, 0);
    turning = { startedAt: performance.now() };
  } catch { turning = null; }
  doc = next;
  document.body.classList.toggle('doc-crt', doc === 'crt');
  document.body.classList.toggle('doc-vellum', doc === 'vellum');
  updateTitleBlock(titleBlock, { document: doc === 'vellum' ? 'VELLUM' : userPaused ? 'PAUSED' : doc === 'crt' ? 'CRT MAP' : 'BLUEPRINT' });
  if (doc === 'crt') { mapCamera.width = surface.width; mapCamera.height = surface.height; mapSnap = true; }
}
let mapSnap = false;

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
    const body = BODIES[sample.body] || src.body;
    return { view: sample.state, phase: sample.phase, alerts: sample.alerts, capcom: sample.capcom, src, debris: sample.debris, hold: 0, clock: sample.clock, body, terrain: src.terrainOf(body) };
  }
  const view = interpolated(flight, alpha);
  return { view, phase: flight.phase, alerts: null, capcom: capcom.latest, src: flight, debris: flight.debris, hold: input.hold, clock: flight.clock, body: flight.body, terrain: flight.terrain };
}

// How far the predicted path reaches from the craft (up, down, sideways in
// the local frame, metres), for the camera's framing.
function extentOf(view, prediction) {
  if (!prediction) return null;
  const r = Math.hypot(view.x, view.y) || 1;
  const ux = view.x / r; const uy = view.y / r;
  let up = 0; let down = 0; let side = 0;
  const pts = prediction.points;
  const segs = prediction.segments || [{ from: 0, offset: { x: 0, y: 0 } }];
  const stride = Math.max(1, Math.floor(pts.length / 400));
  let k = 0;
  for (let i = 0; i < pts.length; i += stride) {
    while (k + 1 < segs.length && segs[k + 1].from <= i) k += 1;
    const o = segs[k].offset;
    const dx = pts[i].x + o.x - view.x; const dy = pts[i].y + o.y - view.y;
    const radial = dx * ux + dy * uy;
    const along = Math.abs(dx * uy - dy * ux);
    if (radial > up) up = radial;
    if (-radial > down) down = -radial;
    if (along > side) side = along;
  }
  return { up, down, side };
}

// The other bodies as seen from the current one: its children and its
// parent, at their places on the clock.
function otherBodies(src, body, clock) {
  const out = [];
  for (const child of childrenOf(body)) {
    const p = bodyState(child, clock);
    out.push({ body: child, terrain: src.terrainOf(child), offset: { x: p.x, y: p.y } });
  }
  if (body.parent) {
    const p = bodyState(body, clock);
    out.push({ body: BODIES[body.parent], terrain: src.terrainOf(BODIES[body.parent]), offset: { x: -p.x, y: -p.y } });
  }
  return out;
}

// Tell the camera which body it frames and how high the ground is under the craft.
function aimCamera(body, terrain, state) {
  camera.bodyRadius = body.radius;
  camera.groundRadius = terrain.groundRadiusAt(state.x, state.y);
}

function render(alpha, frameDt) {
  const scene = currentScene(alpha);
  if (doc === 'vellum') {
    drawVellumPaper(surface.ctx, surface.width, surface.height, surface.dpr);
    builder.draw(surface.ctx, surface.width, surface.height);
    finishTurn();
    return scene;
  }
  const { view, phase, src, body, terrain } = scene;
  aimCamera(body, terrain, view);
  const prediction = phase === 'flying' ? predictCoast(view, body, terrain, { drag: dragFactor(view, src.cfg), clock: scene.clock, terrainOf: src.terrainOf }) : null;
  if (!replay) {
    lastPrediction = prediction;
    // An encounter gained or lost while the engine burns is called at once:
    // the moment to cut is the moment the Moon lands on the path.
    const enc = prediction && prediction.encounter ? prediction.encounter.body : null;
    if (phase === 'flying' && burning(flight)) {
      if (enc && !hadEncounter) capcom.remark(`${BODIES[enc].name} is on your path. Cut the engine now to keep it.`, flight.tick);
      else if (!enc && hadEncounter) capcom.remark(`${BODIES[hadEncounter].name} encounter lost: the burn has gone long. Cut the engine and re-plan on the map.`, flight.tick);
    }
    hadEncounter = enc;
  }
  const extent = extentOf(view, prediction);
  lastExtent = extent;
  camera.follow(view, frameDt, extent);
  const a0 = scene.alerts || alerts || computeAlerts(src, prediction);
  if (doc === 'crt') {
    mapCamera.width = surface.width; mapCamera.height = surface.height;
    drawCrtPaper(surface.ctx, surface.width, surface.height, surface.dpr);
    drawCrt(surface.ctx, mapCamera, { state: view, body, clock: scene.clock, prediction, phase, cfg: src.cfg }, {
      met: formatMet(view.time), warp: titleBlock.querySelector('[data-field="warp"]') ? titleBlock.querySelector('[data-field="warp"]').textContent : '×1',
      paused: !replay && userPaused && !pageOpen, soi: body.name, apAlt: a0.apAlt, peAlt: a0.peAlt, dv: deltaV(view, src.cfg),
      stageText: `STAGE ${view.stage + 1}/${src.cfg.stages.length}  FUEL ${Math.round(a0.fuelFrac * 100)}%`,
      log: replay ? (scene.capcom ? [scene.capcom.text] : []) : capcom.log.map((l) => l.text),
    }, frameDt, mapSnap);
    mapSnap = false;
    finishTurn();
    return scene;
  }
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
  // Detail inset: the vehicle full-frame whenever the main view draws it small.
  const isNarrow = narrow();
  const box = isNarrow
    ? { x: surface.width - 16 - 136, y: 16 + (titleBlock.offsetHeight || 170) + 8, w: 136, h: 168 }
    : { x: surface.width - 16 - 240, y: 16, w: 240, h: 272 };
  // Corners the sheet's edge pointers keep clear of: the inset and the title block.
  const tb = titleBlock.getBoundingClientRect();
  const avoid = [box, { x: tb.left, y: tb.top, w: tb.width, h: tb.height }];
  drawScene(surface.ctx, camera, { state: view, cfg: src.cfg, phase, body, terrain, prediction, debris: scene.debris, others: otherBodies(src, body, scene.clock), avoid, clock: scene.clock });
  drawDetail(surface.ctx, camera, { state: view, cfg: src.cfg, phase, debris: scene.debris }, box);
  const a = scene.alerts || alerts || computeAlerts(src, prediction);
  hud.update(view, a, scene.capcom, frameDt);
  const up = Math.atan2(view.x, view.y);
  const speed = Math.hypot(view.vx, view.vy);
  const info = {
    bodyName: body.name,
    stageText: `${view.stage + 1}/${src.cfg.stages.length}`,
    capsule: !!activeStage(view, src.cfg).capsule,
    stages: src.cfg.stages.map((st, i) => ({ name: st.name, frac: i === view.stage ? view.fuel / st.fuelMass : i > view.stage ? 1 : 0, state: i < view.stage ? 'dropped' : i === view.stage ? 'live' : 'full' })),
    dv: deltaV(view, src.cfg),
    twr: twr(view, src.cfg, body),
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
  finishTurn();
  return scene;
}

// Draw the old sheet sliding off to the right over the freshly drawn new one.
function finishTurn() {
  if (!turning) return;
  const p = Math.min(1, (performance.now() - turning.startedAt) / 200);
  const ctx = surface.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const W = surface.canvas.width; const H = surface.canvas.height;
  const edge = Math.round(W * p);
  ctx.beginPath(); ctx.rect(edge, 0, W - edge, H); ctx.clip();
  ctx.drawImage(turnCanvas, 0, 0);
  ctx.restore();
  ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
  if (p >= 1) turning = null;
}

mountTitleBlock(titleBlock, {
  program: 'KÁRMÁN PROGRAM',
  document: 'BLUEPRINT',
  sheet: 1,
  of: SCENARIO_ORDER.length,
  date: new Date(),
  met: 0,
  soi: 'MOON',
  warp: '×1',
  audio: 'ON',
});

let lastMetShown = -1;
let lastFrameMs = null;
let lastExtent = null;
function frame(nowMs) {
  const frameDt = lastFrameMs === null ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  for (const raw of input.takeActions()) {
    const action = typeof raw === 'string' ? raw : raw.type;
    const value = typeof raw === 'string' ? undefined : raw.value;
    if (doc === 'vellum') {
      if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
      else builder.handleAction(action);
      continue;
    }
    if (replay) { onTransport(action, value); continue; }
    if (pageOpen === 'start') {
      const pick = /^pick(\d)$/.exec(action);
      if (pick) handleAction(action);
      else if (action === 'confirm' || action === 'pause' || action === 'back') closePage();
      else if (action === 'build') openBuilder();
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
      else if (action === 'build') openBuilder();
      else if (action === 'mute') updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' });
      continue;
    }
    switch (action) {
      case 'build': openBuilder(); break;
      case 'restart': restart(); break;
      case 'newStart': case 'back': showPlan(); break;
      case 'replay': startReplay(); break;
      case 'pause': togglePause(); break;
      case 'confirm': input.stageNow(); break;
      case 'mute': updateTitleBlock(titleBlock, { audio: mixer.toggleMuted() ? 'MUTED' : 'ON' }); break;
      case 'warpUp': warpUp(); break;
      case 'warpDown': warpDown(); break;
      case 'warpTo': if (warpTo) { warpTo = null; setWarp(0); } else startWarpTo(); break;
      case 'zoomIn': zoomBy(0.5); break;
      case 'zoomOut': zoomBy(-0.5); break;
      case 'zoomReset': (doc === 'crt' ? mapCamera : camera).resetZoom(); break;
      case 'centre': (doc === 'crt' ? mapCamera : camera).centre(); break;
      case 'lock': (doc === 'crt' ? mapCamera : camera).toggleLock(); break;
      case 'zoom': zoomBy(value); break;
      case 'pan': (doc === 'crt' ? mapCamera : camera).pan(value.dx, value.dy); break;
      case 'map': turnPage(); break;
      default: break;
    }
  }
  if (warpTo && !replay && !pageOpen) steerWarpTo();
  // Rails levels run one tick per sixtieth of real time, each tick a long
  // jump along the orbit; physics levels run more ticks per frame.
  const { alpha } = loop.advance(nowMs / 1000, railsLevel(warp) ? 1 : WARPS[warp]);
  if (replay) {
    advanceReplay(frameDt);
  } else {
    // A crash cuts hard to the report; a landing lets the touchdown settle
    // first, and a break-up lets the pieces fall away for a moment.
    const over = flight.phase !== 'flying' && flight.phase !== 'pad';
    if (over && !pageOpen && reportDueAt === null) {
      reportDueAt = flight.tick + (flight.phase === 'landed' ? 75 : flight.stats.burned ? 150 : 20);
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
  const running = replay ? replay.playing && Math.abs(replay.speed) === 1 : warp === 0 && !loop.paused;
  if (!replay && warp > 0 && flight.phase !== 'flying' && flight.phase !== 'pad') setWarp(0);
  sfx.setEngine(scene.phase === 'flying' && running ? scene.view.thrust / (activeStage(scene.view, scene.src.cfg).maxThrust || 1) : 0);
  const metSeconds = Math.floor(scene.view.time);
  if (metSeconds !== lastMetShown) {
    lastMetShown = metSeconds;
    updateTitleBlock(titleBlock, { met: metSeconds, soi: scene.body.name });
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
  get extent() { return lastExtent; },
  get mapCamera() { return mapCamera; },
  get prediction() { return lastPrediction; },
  get paused() { return loop.paused; },
  get hold() { return input.hold; },
  get engineLevel() { return sfx.engineLevel; },
  get doc() { return doc; },
  get builder() { return builder; },
  openBuilder, closeBuilder,
  scenarios: Object.keys(SCENARIOS),
};
