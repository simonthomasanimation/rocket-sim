// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createSurface } from './render/surface.js';
import { drawPaper } from './render/blueprint.js';
import { mountTitleBlock } from './ui/screens.js';

const surface = createSurface(document.getElementById('stage'));

function render() {
  drawPaper(surface.ctx, surface.width, surface.height, surface.dpr);
}

surface.onResize(render);
render();

mountTitleBlock(document.getElementById('title-block'), {
  program: 'KÁRMÁN PROGRAM',
  document: 'BLUEPRINT',
  sheet: 1,
  of: 1,
  date: new Date(),
});

// Redraw once the web fonts arrive so canvas text (later) uses the right face.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(render).catch(() => {});
}
