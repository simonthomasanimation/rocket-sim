// The builder: the vellum document's chrome and its pointer work. The
// catalog column and the staging/figures panel are HTML laid over the
// sheet (like the manual's pages); the drafting itself is drawn on the
// canvas by render/vellum.js. Design rules and figures come from
// core/parts.js; this file only moves parts about and prints what the
// core says.

import { PARTS, CATEGORIES, SIZES, partById, createDesign, cloneDesign, addPart, addRadial, insertPart, insertRefusal, removePart, removeRadial, setBoosterDrop, stagingList, designStats, compileDesign } from '../core/parts.js';
import { KP3_DESIGN } from '../core/designs.js';
import { EARTH, MOON } from '../core/body.js';
import { preloadPartArt, partIconSrc, onPartArtReady } from '../render/partart.js';
import { VELLUM, layoutStack, hitStack, insertionIndexAt, drawStack, drawGhost, partUnits } from '../render/vellum.js';

const DRAG_PX = 6;      // movement before a press becomes a drag
const HOLD_MS = 320;    // a finger must hold this long on a catalog item to drag it (else it scrolls)

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}
const kg = (m) => `${Math.round(m).toLocaleString('en-US')} KG`;
const kn = (n) => `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} KN`;

export function createBuilder({ canvas, root, onAction }) {
  let open = false;
  let design = createDesign('UNTITLED');
  let loadedPreset = false;
  let selected = null;   // { kind: 'part', index } | { kind: 'radial', index, id }
  let hover = null;
  let drag = null;       // { id, from: 'catalog' | 'stack', kind, index, x, y, moved, radial }
  let layout = null;
  let noteText = ''; let noteUntil = 0;
  let catalogBuilt = false;
  let area = { x: 0, y: 0, w: 1, h: 1 };
  let narrow = false;

  // --- Chrome ---------------------------------------------------------------
  const catalog = el('aside', 'vellum-catalog');
  catalog.setAttribute('aria-label', 'Parts catalog');
  const panel = el('aside', 'vellum-panel');
  panel.setAttribute('aria-label', 'Design figures and staging');
  const toggle = el('button', 'stamp-button vellum-toggle', 'LIST');
  toggle.type = 'button';
  toggle.addEventListener('click', () => { root.classList.toggle('show-panel'); toggle.textContent = root.classList.contains('show-panel') ? 'SHEET' : 'LIST'; });
  const ghost = el('img', 'vellum-ghost');
  ghost.alt = '';
  root.append(catalog, panel, toggle, ghost);

  function buildCatalog() {
    catalog.replaceChildren();
    const head = el('header', 'vellum-head');
    head.append(el('span', 'vellum-section', 'PARTS CATALOG'));
    head.append(el('span', 'vellum-pageno', `${PARTS.length} ITEMS`));
    catalog.append(head);
    for (const c of CATEGORIES) {
      const group = el('section', 'vellum-group');
      group.append(el('h2', 'vellum-group-title', c.name));
      for (const p of PARTS.filter((q) => q.category === c.id)) {
        const item = el('button', 'vellum-part');
        item.type = 'button';
        item.dataset.part = p.id;
        const fig = el('span', 'vellum-part-fig');
        fig.dataset.part = p.id;
        fillIcon(fig, p.id);
        item.append(fig);
        const txt = el('span', 'vellum-part-text');
        txt.append(el('b', null, p.name));
        txt.append(el('i', null, partLine(p)));
        item.append(txt);
        item.title = p.text;
        wireCatalogItem(item, p);
        group.append(item);
      }
      catalog.append(group);
    }
    catalogBuilt = true;
  }

  // The icon is the part's own drawing, small; filled in once its file is here.
  function fillIcon(fig, id) {
    if (fig.firstChild) return;
    const icon = partIconSrc(id, VELLUM.ink, 44);
    if (!icon) return;
    const img = el('img'); img.src = icon.src; img.width = icon.w; img.height = icon.h; img.alt = '';
    fig.append(img);
  }
  function fillIcons() { catalog.querySelectorAll('.vellum-part-fig').forEach((fig) => fillIcon(fig, fig.dataset.part)); }

  // One line of figures under a catalog name.
  function partLine(p) {
    const bits = [SIZES[p.size].label];
    if (p.category === 'tank') bits.push(`${p.fuel} KG FUEL`);
    else if (p.category === 'engine') bits.push(kn(p.thrust), `ISP ${p.isp}`);
    else if (p.category === 'booster') bits.push(kn(p.thrust), `${p.fuel} KG`);
    else bits.push(kg(p.mass));
    return bits.join(' · ');
  }

  function wireCatalogItem(item, p) {
    const isRadial = p.nodes.radial === 'attach';
    let press = null;
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      press = { x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId, touch: e.pointerType !== 'mouse', timer: null, dragging: false };
      if (press.touch) {
        // A held finger lifts the part; a quick slide scrolls the column.
        press.timer = setTimeout(() => { if (press && !press.dragging) startDrag(item, p, press.x, press.y, press.id); }, HOLD_MS);
      } else e.preventDefault();
    });
    item.addEventListener('pointermove', (e) => {
      if (!press || press.id !== e.pointerId || press.dragging) return;
      const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.touch) { if (d > 8 && press.timer) { clearTimeout(press.timer); press.timer = null; press = null; } return; }
      if (d > DRAG_PX) startDrag(item, p, e.clientX, e.clientY, e.pointerId);
    });
    const up = (e) => {
      if (!press || press.id !== e.pointerId) return;
      if (press.timer) clearTimeout(press.timer);
      const wasDrag = press.dragging;
      press = null;
      if (!wasDrag) tapCatalog(p);
    };
    item.addEventListener('pointerup', up);
    item.addEventListener('pointercancel', (e) => { if (press && press.id === e.pointerId) { if (press.timer) clearTimeout(press.timer); press = null; } });
    item.addEventListener('contextmenu', (e) => e.preventDefault());
    function startDrag(node, part, x, y, pointerId) {
      press.dragging = true;
      node.setPointerCapture?.(pointerId);
      beginDrag({ id: part.id, from: 'catalog', radial: isRadial, x, y, pointerId, node });
    }
  }

  // A tap adds the part where it most likely goes: on top of the stack, or
  // for a radial part on the selected tank (else the highest tank).
  function tapCatalog(p) {
    if (p.nodes.radial === 'attach') {
      let host = selected && selected.kind === 'part' && partById(design.stack[selected.index].id).nodes.radial === 'host' ? selected.index : -1;
      if (host < 0) for (let i = design.stack.length - 1; i >= 0; i--) if (partById(design.stack[i].id).nodes.radial === 'host') { host = i; break; }
      if (host < 0) { note('A RADIAL PART NEEDS A TANK TO HANG ON'); return; }
      const why = addRadial(design, host, p.id);
      if (why) note(why); else { selected = { kind: 'radial', index: host, id: p.id }; changed(); }
      return;
    }
    const why = addPart(design, p.id);
    if (why) note(why); else { selected = { kind: 'part', index: design.stack.length - 1 }; changed(); }
  }

  // --- Dragging -------------------------------------------------------------
  function beginDrag(d) {
    drag = { ...d, moved: true };
    const u = partUnits(d.id);
    const k = layout ? layout.k : 1.5;
    const icon = partIconSrc(d.id, VELLUM.pencil, Math.max(u.h, 2 * u.halfW) * k);
    if (icon) { ghost.src = icon.src; ghost.width = icon.w; ghost.height = icon.h; }
    ghost.classList.add('is-on');
    moveGhost(d.x, d.y);
    const node = d.node || canvas;
    const onMove = (e) => { if (e.pointerId !== d.pointerId) return; drag.x = e.clientX; drag.y = e.clientY; moveGhost(e.clientX, e.clientY); };
    const onUp = (e) => {
      if (e.pointerId !== d.pointerId) return;
      node.removeEventListener('pointermove', onMove); node.removeEventListener('pointerup', onUp); node.removeEventListener('pointercancel', onCancel);
      endDrag(e.clientX, e.clientY);
    };
    const onCancel = (e) => {
      if (e.pointerId !== d.pointerId) return;
      node.removeEventListener('pointermove', onMove); node.removeEventListener('pointerup', onUp); node.removeEventListener('pointercancel', onCancel);
      drag = null; ghost.classList.remove('is-on');
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onCancel);
  }
  function moveGhost(x, y) {
    ghost.style.transform = `translate(${Math.round(x - ghost.width / 2)}px, ${Math.round(y - ghost.height / 2)}px)`;
  }
  function inArea(x, y) { return x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h; }

  // The stack as it stands without the dragged item (for drop targets).
  function reducedDesign() {
    const d = cloneDesign(design);
    if (drag && drag.from === 'stack') {
      if (drag.kind === 'part') removePart(d, drag.index); else removeRadial(d, drag.index, drag.id);
    }
    return d;
  }

  function endDrag(x, y) {
    const d = drag;
    drag = null;
    ghost.classList.remove('is-on');
    if (!d) return;
    const inside = inArea(x, y);
    const reduced = reducedDesign();
    const lay = layoutStack(reduced, area);
    if (d.from === 'catalog') {
      if (!inside) return;
      if (d.radial) {
        const hit = hitStack(lay, x, y);
        if (!hit || hit.kind !== 'part') { note('DROP A RADIAL PART ON A TANK'); return; }
        const why = addRadial(design, hit.index, d.id);
        if (why) note(why); else { selected = { kind: 'radial', index: hit.index, id: d.id }; changed(); }
      } else {
        const i = insertionIndexAt(lay, y);
        const why = insertPart(design, i, d.id);
        if (why) note(why); else { selected = { kind: 'part', index: i }; changed(); }
      }
      return;
    }
    // From the stack: dropped outside, the part goes back to the catalog.
    if (d.kind === 'part') {
      const entry = design.stack[d.index];
      if (!inside) { removePart(design, d.index); selected = null; changed(); return; }
      const i = insertionIndexAt(lay, y);
      const why = insertRefusal(reduced, i, entry.id);
      if (why) { note(why); return; }
      reduced.stack.splice(i, 0, entry);
      design = reduced;
      selected = { kind: 'part', index: i };
      changed();
      return;
    }
    const pair = design.stack[d.index].radials.find((r) => r.id === d.id);
    if (!inside) { removeRadial(design, d.index, d.id); selected = null; changed(); return; }
    const hit = hitStack(lay, x, y);
    if (!hit || hit.kind !== 'part') { note('DROP A RADIAL PART ON A TANK'); return; }
    if (hit.index === d.index) return;
    const why = addRadial(reduced, hit.index, d.id);
    if (why) { note(why); return; }
    const moved = reduced.stack[hit.index].radials.find((r) => r.id === d.id);
    moved.count = pair.count; moved.drop = pair.drop;
    design = reduced;
    selected = { kind: 'radial', index: hit.index, id: d.id };
    changed();
  }

  // --- The sheet's pointer work -------------------------------------------
  let press = null;
  function onCanvasDown(e) {
    if (!open || !layout || (e.button !== undefined && e.button !== 0)) return;
    const hit = hitStack(layout, e.clientX, e.clientY);
    selected = hit;
    press = hit ? { hit, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    refreshPanel();
    if (hit) e.preventDefault();
  }
  function onCanvasMove(e) {
    if (!open || !layout) return;
    if (press && press.id === e.pointerId && !drag) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) {
        const h = press.hit;
        const id = h.kind === 'part' ? design.stack[h.index].id : h.id;
        press = null;
        beginDrag({ id, from: 'stack', kind: h.kind, index: h.index, radial: h.kind === 'radial', x: e.clientX, y: e.clientY, pointerId: e.pointerId });
        return;
      }
    }
    if (drag) return;
    hover = hitStack(layout, e.clientX, e.clientY);
    canvas.style.cursor = hover ? 'grab' : '';
  }
  function onCanvasUp(e) { if (press && press.id === e.pointerId) press = null; }

  // --- Panel ------------------------------------------------------------------
  function refreshPanel() {
    panel.replaceChildren();
    const head = el('header', 'vellum-head');
    head.append(el('span', 'vellum-section', 'SECTION 4 — VEHICLE ASSEMBLY'));
    head.append(el('span', 'vellum-pageno', 'VELLUM'));
    panel.append(head);
    panel.append(el('h1', 'vellum-title', design.name));

    const bar = el('div', 'vellum-buttons');
    bar.append(button('NEW', () => { design = createDesign('UNTITLED'); selected = null; changed(); }));
    bar.append(button('KP-3', () => { design = cloneDesign(KP3_DESIGN); selected = null; changed(); }));
    bar.append(button('FLIGHT PLAN', () => onAction('newStart'), 'N'));
    panel.append(bar);

    const note = el('p', 'vellum-note');
    note.dataset.role = 'note';
    panel.append(note);

    // Figures: the slide-rule panel. TWR against Earth's pad and the Moon's.
    const stats = designStats(design, { gravity: EARTH.gravity });
    const moon = designStats(design, { gravity: MOON.gravity });
    const table = el('table', 'vellum-table');
    const row = (k, v, tone) => { const tr = el('tr'); tr.append(el('th', null, k)); tr.append(el('td', tone ? `tone-${tone}` : null, v)); table.append(tr); };
    row('PAD MASS', kg(stats.mass));
    row('HEIGHT', `${(design.stack.reduce((h, e) => h + partById(e.id).height, 0)).toFixed(1)} M`);
    row('PARTS', String(design.stack.length + design.stack.reduce((n, e) => n + e.radials.reduce((m, r) => m + r.count, 0), 0)));
    const twrText = (t) => (t > 0 ? t.toFixed(2) : '—');
    row('TWR OFF EARTH', twrText(stats.launchTwr), stats.launchTwr > 0 && stats.launchTwr < 1 ? 'pencil' : null);
    row('TWR OFF MOON', twrText(moon.launchTwr), moon.launchTwr > 0 && moon.launchTwr < 1 ? 'pencil' : null);
    row('ΔV TOTAL', `${Math.round(stats.deltaV).toLocaleString('en-US')} M/S`);
    panel.append(table);
    // Red-pencil warnings from the compiler, before the figures they explain.
    if (stats.warnings.length) {
      panel.append(el('h2', 'vellum-group-title vellum-pencil', 'RED PENCIL'));
      const ul = el('ul', 'vellum-warnings');
      for (const w of stats.warnings) ul.append(el('li', null, w.text));
      panel.append(ul);
    }
    if (stats.stages.length) {
      const rule = el('table', 'vellum-table vellum-rule');
      const hr = el('tr');
      for (const h of ['STAGE', 'MASS', 'TWR', 'ΔV']) hr.append(el('th', null, h));
      rule.append(hr);
      stats.stages.forEach((st, i) => {
        const tr = el('tr');
        if (st.kind === 'boosters') tr.className = 'kind-boosters';
        tr.append(el('td', null, `${i + 1} ${st.kind === 'boosters' ? 'BOOST' : st.thrust > 0 ? 'STAGE' : 'CAPS.'}`));
        tr.append(el('td', null, `${(st.mass / 1000).toFixed(st.mass < 10000 ? 2 : 1)} T`));
        tr.append(el('td', st.thrust > 0 && st.twr < 1 && i === 0 ? 'tone-pencil' : null, st.thrust > 0 ? st.twr.toFixed(2) : '—'));
        tr.append(el('td', null, st.deltaV > 0 ? `${Math.round(st.deltaV).toLocaleString('en-US')}` : '—'));
        rule.append(tr);
      });
      panel.append(rule);
      panel.append(el('p', 'vellum-caption', 'Mass at ignition; TWR against Earth gravity, ΔV in m/s with the tanks full. To orbit from Pad 1 takes about 3,200; the Moon and back about 2,900 more.'));
    }

    // Staging list.
    panel.append(el('h2', 'vellum-group-title', 'STAGING, IN FIRING ORDER'));
    const rows = stagingList(design);
    const list = el('ol', 'vellum-stages');
    if (!rows.length) list.append(el('li', 'vellum-stage is-empty', 'NOTHING TO FIRE YET'));
    rows.forEach((r, i) => {
      const li = el('li', `vellum-stage kind-${r.kind}`);
      const top = el('div', 'vellum-stage-top');
      top.append(el('b', null, `${i + 1}  ${r.name}`));
      top.append(el('span', null, r.fires));
      li.append(top);
      li.append(el('i', null, r.parts.join(', ')));
      if (r.canLater || r.canEarlier) {
        const ctl = el('div', 'vellum-stage-ctl');
        if (r.canLater) ctl.append(button('LATER: DROP WITH STAGE', () => { setBoosterDrop(design, r.stackIndex, 'with'); changed(); }));
        if (r.canEarlier) ctl.append(button('EARLIER: DROP WHEN DRY', () => { setBoosterDrop(design, r.stackIndex, 'early'); changed(); }));
        li.append(ctl);
      }
      list.append(li);
    });
    panel.append(list);

    // The selected part.
    if (selected) {
      const entry = design.stack[selected.index];
      const p = entry ? partById(selected.kind === 'part' ? entry.id : selected.id) : null;
      if (p) {
        panel.append(el('h2', 'vellum-group-title', selected.kind === 'part' ? `SELECTED: ${p.name}` : `SELECTED: ${p.name} (PAIR)`));
        panel.append(el('p', 'vellum-text', p.text));
        const t2 = el('table', 'vellum-table');
        const r2 = (k, v) => { const tr = el('tr'); tr.append(el('th', null, k)); tr.append(el('td', null, v)); t2.append(tr); };
        r2('SIZE', SIZES[p.size].label);
        r2('MASS', kg(p.mass));
        if (p.fuel) r2('FUEL', kg(p.fuel));
        if (p.thrust) { r2('THRUST', kn(p.thrust)); r2('ISP', `${p.isp} S`); }
        panel.append(t2);
        const b2 = el('div', 'vellum-buttons');
        b2.append(button('REMOVE', () => removeSelected(), 'DEL'));
        if (selected.kind === 'radial') {
          const pair = entry.radials.find((r) => r.id === selected.id);
          if (pair) b2.append(button(pair.count === 2 ? 'FIT FOUR' : 'FIT TWO', () => { pair.count = pair.count === 2 ? 4 : 2; changed(); }));
        }
        panel.append(b2);
      }
    }
    panel.append(el('p', 'vellum-caption', 'Drag parts from the catalog onto the axis; a tap puts one on top. Boosters, fins and legs hang on a tank. Drag a part off the sheet to remove it. Decouplers divide the stages.'));
    showNote();
  }
  function button(label, fn, key) {
    const b = el('button', 'vellum-button');
    b.type = 'button';
    b.append(el('span', null, label));
    if (key) b.append(el('kbd', null, key));
    b.addEventListener('click', fn);
    return b;
  }
  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'part') removePart(design, selected.index); else removeRadial(design, selected.index, selected.id);
    selected = null;
    changed();
  }
  function note(text) { noteText = text; noteUntil = performance.now() + 3500; showNote(); }
  function showNote() {
    const n = panel.querySelector('[data-role="note"]');
    if (!n) return;
    const on = noteText && performance.now() < noteUntil;
    n.textContent = on ? noteText : '';
    n.classList.toggle('is-on', !!on);
  }
  function changed() {
    if (selected && selected.kind === 'part' && !design.stack[selected.index]) selected = null;
    refreshPanel();
  }

  // --- Drawing ----------------------------------------------------------------
  function measure(width, height) {
    narrow = width < 720;
    const cr = catalog.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    if (narrow) {
      // The title block sits top right on a phone: draft to its left.
      const tb = document.getElementById('title-block');
      const right = tb ? Math.min(width - 16, tb.getBoundingClientRect().left - 8) : width - 16;
      area = { x: 16, y: 16, w: Math.max(100, right - 16), h: Math.max(100, cr.top - 24) };
    } else area = { x: cr.right + 16, y: 16, w: Math.max(100, pr.left - cr.right - 32), h: height - 32 };
  }
  function draw(ctx, width, height) {
    measure(width, height);
    layout = layoutStack(drag && drag.from === 'stack' ? reducedDesign() : design, area);
    const cfg = compileDesign(design);
    let gapAt = null; let hostHint = null;
    if (drag && inArea(drag.x, drag.y)) {
      if (drag.radial) { const hit = hitStack(layout, drag.x, drag.y); hostHint = hit && hit.kind === 'part' && partById((drag.from === 'stack' ? reducedDesign() : design).stack[hit.index].id).nodes.radial === 'host' ? hit.index : -1; }
      else gapAt = insertionIndexAt(layout, drag.y);
    }
    const figures = drag ? null : designStats(design, { gravity: EARTH.gravity }).stages;
    drawStack(ctx, layout, drag && drag.from === 'stack' ? reducedDesign() : design, { selected: drag ? null : selected, hover: drag ? null : hover, gapAt, hostHint, stages: cfg.stages, figures });
    if (drag && (!inArea(drag.x, drag.y) || true)) { /* the HTML ghost follows the pointer */ }
    if (noteText && performance.now() >= noteUntil) { noteText = ''; showNote(); }
  }

  let unwatch = null;
  return {
    get isOpen() { return open; },
    get design() { return design; },
    open() {
      open = true;
      root.classList.add('is-open');
      if (!loadedPreset) { design = cloneDesign(KP3_DESIGN); loadedPreset = true; }
      if (!catalogBuilt) buildCatalog();
      refreshPanel();
      preloadPartArt().then(() => { fillIcons(); refreshPanel(); });
      canvas.addEventListener('pointerdown', onCanvasDown);
      canvas.addEventListener('pointermove', onCanvasMove);
      canvas.addEventListener('pointerup', onCanvasUp);
      unwatch = onPartArtReady(fillIcons);
    },
    close() {
      open = false;
      drag = null; press = null; hover = null;
      ghost.classList.remove('is-on');
      root.classList.remove('is-open');
      canvas.style.cursor = '';
      canvas.removeEventListener('pointerdown', onCanvasDown);
      canvas.removeEventListener('pointermove', onCanvasMove);
      canvas.removeEventListener('pointerup', onCanvasUp);
      if (unwatch) { unwatch(); unwatch = null; }
    },
    draw,
    // Keyboard actions while the builder is open; true when taken.
    handleAction(action) {
      if (action === 'remove') { removeSelected(); return true; }
      if (action === 'back' || action === 'newStart') { onAction('newStart'); return true; }
      if (action === 'build') return true;
      return false;
    },
    // For automated playtests: add a part as a tap on the catalog would.
    add(id) { tapCatalog(partById(id)); },
    load(d) { design = cloneDesign(d); selected = null; changed(); },
    get stats() { return designStats(design); },
  };
}
