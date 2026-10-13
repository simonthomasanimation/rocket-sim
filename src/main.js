// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createFlight, interpolated } from './core/flight.js';
import { createSurface } from './render/surface.js';
import { createCamera } from './render/camera.js';
import { drawPaper, drawScene } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock } from './ui/screens.js';
import { createInput } from './ui/input.js';

const HUD_HEIGHT = 112; // px reserved along the bottom for the instrument strip

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');
const camera = createCamera();
const input = createInput({ touchRoot: document.getElementById('touch-controls') });

let flight = createFlight({ seed: 1 });
const loop = createFixedLoop({ hz: 60, step: (dt) => flight.step(input.command(), dt) });

function restart() {
  flight = createFlight({ seed: 1 });
  loop.reset();
  camera.snap(flight.state);
  lastMetShown = -1;
}

function layout() {
  camera.setViewport(surface.width, Math.max(120, surface.height - HUD_HEIGHT), 0);
}
layout();
camera.snap(flight.state);

function render(alpha, frameDt) {
  const view = interpolated(flight, alpha);
  camera.follow(view, frameDt);
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
  drawScene(surface.ctx, camera, view, flight.cfg);
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
