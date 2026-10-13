// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createFixedLoop } from './core/loop.js';
import { createSurface } from './render/surface.js';
import { drawPaper } from './render/blueprint.js';
import { mountTitleBlock, updateTitleBlock } from './ui/screens.js';

const surface = createSurface(document.getElementById('stage'));
const titleBlock = document.getElementById('title-block');

// Mission elapsed time is counted in ticks so it stays exact and replayable.
let elapsedTicks = 0;
const loop = createFixedLoop({ hz: 60, step: () => { elapsedTicks += 1; } });

function render() {
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
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
function frame(nowMs) {
  loop.advance(nowMs / 1000);
  render();
  const metSeconds = Math.floor(elapsedTicks / loop.hz);
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

surface.onResize(render);
