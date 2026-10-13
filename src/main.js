// Kármán Program — entry point. Wires the canvas surface, the current
// document renderer and the HTML chrome together. Game logic lives in
// src/core and never reaches this file's DOM calls.

import { createSurface } from './render/surface.js';

const surface = createSurface(document.getElementById('stage'));

function render() {
  const { ctx, width, height, dpr } = surface;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1B3A6B';
  ctx.fillRect(0, 0, width, height);
}

surface.onResize(render);
render();
