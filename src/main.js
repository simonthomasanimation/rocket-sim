// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { predictDescent } from './core/predict.js';
import { computeAlerts } from './core/alerts.js';
import { createCapcom } from './core/capcom.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock } from './ui/screens.js';
import { createInput } from './ui/input.js';
import { createHud, HUD_HEIGHT } from './ui/hud.js';

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');
const camera = createCamera();
const hud = createHud();
let capcom = createCapcom();
const input = createInput({ touchRoot: document.getElementById('touch-controls') });
window.addEventListener('touchstart', () => layout(), { passive: true, once: true });

let flight = createFlight({ seed: 1 });
let alerts = null;
function stepGame(dt) {
  flight.step(input.command(), dt);
  const prediction = flight.phase === 'flying' ? predictDescent(flight.state, flight.terrain, flight.body.gravity) : null;
  alerts = computeAlerts(flight, prediction);
  capcom.update(flight, alerts);
}
const loop = createFixedLoop({ hz: 60, step: stepGame });

function restart() {
  flight = createFlight({ seed: 1 });
  capcom = createCapcom();
  alerts = null;
  loop.reset();
  camera.snap(flight.state);
  lastMetShown = -1;
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
});

let lastMetShown = -1;
let lastFrameMs = null;
function frame(nowMs) {
  const frameDt = lastFrameMs === null ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  for (const action of input.takeActions()) if (action === 'restart') restart();
  const { alpha } = loop.advance(nowMs / 1000);
  render(alpha, frameDt);
  const metSeconds = Math.floor(flight.state.time);
  if (metSeconds !== lastMetShown) {
    lastMetShown = metSeconds;
    updateTitleBlock(titleBlock, { met: metSeconds });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Pause the clock while the tab is hidden; resume cleanly when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.pause(); else loop.resume();
});

surface.onResize(() => { layout(); render(0, 0); });
