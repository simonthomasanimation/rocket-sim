// Part art: loads art/parts/<id>.svg (from the asset map the snapshot
// build inlines, or over the network on the dev page), recolours it for a
// document and rasterises it at a pixel size. The drawings use
// non-scaling strokes, so a part drawn at any size keeps the 1.5 px and
// 0.75 px line weights of the brief; the catalog icon and the drafting
// table share one file. Render-side module: it may touch the DOM.

import { PARTS } from '../core/parts.js';

const texts = new Map();   // id -> svg text (once loaded)
const loading = new Map(); // id -> Promise<string>
const images = new Map();  // `${id}|${color}|${k}` -> HTMLImageElement
const parsed = new Map();  // id -> { viewBox: [x, y, w, h], nodes: { top, bottom, left, right, attach } }
const listeners = new Set();

// Called whenever a drawing arrives or a rasterised image finishes
// decoding: a document that drew a placeholder redraws then.
export function onPartArtReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => { for (const fn of listeners) fn(); };

function assetMap() {
  return (typeof window !== 'undefined' && window.__KP_ASSETS) || null;
}

// The SVG text of one part, fetched once.
export function loadPartText(id) {
  if (texts.has(id)) return Promise.resolve(texts.get(id));
  if (loading.has(id)) return loading.get(id);
  const inline = assetMap();
  const key = `art/parts/${id}.svg`;
  let p;
  if (inline && inline[key]) p = Promise.resolve(inline[key]);
  else p = fetch(key).then((r) => { if (!r.ok) throw new Error(`${key}: ${r.status}`); return r.text(); });
  p = p.then((t) => { texts.set(id, t); parsed.set(id, parse(t)); loading.delete(id); notify(); return t; });
  loading.set(id, p);
  return p;
}

// Fetch every part's drawing; resolves when all are in.
export function preloadPartArt() {
  return Promise.all(PARTS.map((p) => loadPartText(p.id).catch((e) => { console.warn(e.message); return null; })));
}

// Geometry of a loaded part: its viewBox and the named attachment nodes,
// in drawing units (decimetres, the stack axis at x = 0). Null until the
// text has arrived.
export function partGeometry(id) {
  return parsed.get(id) || null;
}

function parse(text) {
  const vb = (text.match(/viewBox="([^"]+)"/) || [])[1];
  const viewBox = vb ? vb.split(/\s+/).map(Number) : [0, 0, 1, 1];
  const nodes = {};
  const re = /<circle id="node-(\w+)"[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"/g;
  let m;
  while ((m = re.exec(text))) nodes[m[1]] = [Number(m[2]), Number(m[3])];
  return { viewBox, nodes };
}

// The part rasterised at `pxPerUnit` pixels per drawing unit in `color`,
// as an image to draw with drawImage, or null while it loads. `showNodes`
// keeps the dashed node circles (the drafting table); the icon and the
// flight drawing drop them.
export function partImage(id, color, pxPerUnit, showNodes = false) {
  const text = texts.get(id);
  if (!text) { loadPartText(id).catch(() => {}); return null; }
  const k = Math.max(0.25, Math.round(pxPerUnit * 8) / 8);
  const key = `${id}|${color}|${k}|${showNodes ? 1 : 0}`;
  let img = images.get(key);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  const { viewBox } = parsed.get(id);
  const w = Math.max(1, Math.round(viewBox[2] * k));
  const h = Math.max(1, Math.round(viewBox[3] * k));
  let svg = text.replace('<svg ', `<svg width="${w}" height="${h}" `).split('currentColor').join(color);
  if (!showNodes) svg = svg.replace(/<g id="nodes"[\s\S]*?<\/g>/, '');
  img = new Image();
  img.decoding = 'async';
  img.onload = notify;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  images.set(key, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// A data URL of the part drawn to fit a `box` px square in `color`, for an
// <img> in the catalog; the image is made at that exact size so the
// strokes keep their weight. Null until the text has loaded.
export function partIconSrc(id, color, box) {
  const text = texts.get(id);
  if (!text) { loadPartText(id).catch(() => {}); return null; }
  const { viewBox } = parsed.get(id);
  const k = Math.min(box / viewBox[2], box / viewBox[3]);
  const w = Math.max(1, Math.round(viewBox[2] * k)); const h = Math.max(1, Math.round(viewBox[3] * k));
  let svg = text.replace('<svg ', `<svg width="${w}" height="${h}" `).split('currentColor').join(color);
  svg = svg.replace(/<g id="nodes"[\s\S]*?<\/g>/, '');
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, w, h };
}

// Draw a part with its top node at (x, y) on the canvas at `pxPerUnit`,
// mirrored when `flip` (the left-hand one of a radial pair). Returns true
// when something was drawn.
export function drawPart(ctx, id, color, x, y, pxPerUnit, { showNodes = false, flip = false } = {}) {
  const img = partImage(id, color, pxPerUnit, showNodes);
  const geo = parsed.get(id);
  if (!img || !geo) return false;
  const [vx, vy, vw, vh] = geo.viewBox;
  const k = img.naturalWidth / vw;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, vx * k, vy * k, vw * k, vh * k);
  ctx.restore();
  return true;
}
