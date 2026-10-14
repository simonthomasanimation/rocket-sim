// Screen chrome drawn in HTML over the canvas: title blocks, stamps, pages.

import { SCENARIOS, SCENARIO_ORDER } from '../core/scenario.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDrawingDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  return `${d} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// Mission elapsed time as HH:MM:SS from whole seconds.
export function formatMet(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${r}`;
}

function cell(label, value, key) {
  const tr = document.createElement('tr');
  const th = document.createElement('td');
  th.className = 'label';
  th.textContent = label;
  const td = document.createElement('td');
  td.textContent = value;
  if (key) td.dataset.field = key;
  tr.append(th, td);
  return tr;
}

// Engineering title block: program name, document, sheet number, date, MET, warp, audio.
export function mountTitleBlock(el, { program, document: doc, sheet, of, date, met = 0, soi = null, warp = null, audio = null }) {
  el.replaceChildren();
  const table = document.createElement('table');
  const head = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 2;
  th.textContent = program;
  head.append(th);
  table.append(head);
  table.append(cell('DOC', doc, 'document'));
  table.append(cell('SHEET', `${sheet} OF ${of}`, 'sheet'));
  table.append(cell('DATE', formatDrawingDate(date), 'date'));
  table.append(cell('MET', formatMet(met), 'met'));
  if (soi !== null) table.append(cell('SOI', soi, 'soi'));
  if (warp !== null) table.append(cell('WARP', warp, 'warp'));
  if (audio !== null) table.append(cell('AUDIO', audio, 'audio'));
  el.append(table);
}

// Update individual fields without rebuilding the block.
export function updateTitleBlock(el, fields) {
  for (const [key, value] of Object.entries(fields)) {
    const td = el.querySelector(`[data-field="${key}"]`);
    if (!td) continue;
    const text = key === 'met' ? formatMet(value) : String(value);
    if (td.textContent !== text) td.textContent = text;
  }
}

// A milestone stamp lands on the title block (ORBIT); null clears it.
export function stampTitleBlock(el, text) {
  el.querySelectorAll('.title-stamp').forEach((n) => n.remove());
  if (!text) return;
  const stamp = document.createElement('div');
  stamp.className = 'title-stamp';
  stamp.textContent = text;
  el.append(stamp);
  requestAnimationFrame(() => stamp.classList.add('is-landed'));
}

// --- Manual pages -----------------------------------------------------------
// A page of the printed manual laid over the sheet: section header, a stamp,
// rows of figures, a caption and stamped buttons. One component serves the
// start card and the flight report.

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

// page: { section, title, figure, stamp: { text, tone }, rows: [[label, value, tone?]],
//         choices: [{ label, key, text, action }], lines, caption,
//         buttons: [{ label, key, action }], page }
// onAction(action) is called when a button is pressed.
export function mountPage(root, page, onAction) {
  root.replaceChildren();
  const sheet = el('section', 'manual-page');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', page.title);

  const head = el('header', 'manual-head');
  head.append(el('span', 'manual-section', page.section));
  head.append(el('span', 'manual-pageno', page.page || 'PAGE 1'));
  sheet.append(head);
  sheet.append(el('h1', 'manual-title', page.title));

  if (page.stamp) {
    const stamp = el('div', `manual-stamp tone-${page.stamp.tone || 'ink'}`, page.stamp.text);
    sheet.append(stamp);
  }

  const openedAt = performance.now();
  const button = (b, className) => {
    const btn = el('button', className);
    btn.type = 'button';
    btn.append(el('span', null, b.label));
    if (b.key) btn.append(el('kbd', null, b.key));
    // A page that appears under a finger must not take that same tap.
    btn.addEventListener('click', () => { if (performance.now() - openedAt > 250) onAction(b.action); });
    return btn;
  };

  if (page.choices && page.choices.length) {
    const list = el('div', 'manual-choices');
    for (const c of page.choices) {
      const row = el('div', 'manual-choice');
      row.append(button(c, 'manual-button'));
      row.append(el('p', null, c.text));
      list.append(row);
    }
    sheet.append(list);
  }

  if (page.rows && page.rows.length) {
    const table = el('table', 'manual-table');
    for (const [label, value, tone] of page.rows) {
      const tr = el('tr');
      tr.append(el('th', null, label));
      const td = el('td', tone ? `tone-${tone}` : null, value);
      tr.append(td);
      table.append(tr);
    }
    sheet.append(table);
  }

  if (page.lines && page.lines.length) {
    const list = el('ul', 'manual-lines');
    for (const line of page.lines) list.append(el('li', null, line));
    sheet.append(list);
  }

  if (page.caption) {
    const cap = el('p', 'manual-caption');
    if (page.figure) cap.append(el('b', null, `${page.figure}  `));
    cap.append(document.createTextNode(page.caption));
    sheet.append(cap);
  }

  if (page.buttons && page.buttons.length) {
    const bar = el('div', 'manual-buttons');
    for (const b of page.buttons) bar.append(button(b, 'manual-button'));
    sheet.append(bar);
  }

  root.append(sheet);
  root.classList.add('is-open');
  // Stamps land: 110% to 100% in 80 ms, no spring.
  const stamp = sheet.querySelector('.manual-stamp');
  if (stamp) requestAnimationFrame(() => stamp.classList.add('is-landed'));
}

export function unmountPage(root) {
  root.replaceChildren();
  root.classList.remove('is-open');
}

// --- Report text -------------------------------------------------------------

export function formatSeconds(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m} MIN ${s.toFixed(1)} S` : `${s.toFixed(1)} S`;
}

function km(m) { return m < 10000 ? `${m.toFixed(0)} M` : `${(m / 1000).toFixed(1)} KM`; }

const REASON_TEXT = {
  verticalSpeed: 'Came down too fast',
  horizontalSpeed: 'Still moving sideways',
  tilt: 'Not upright',
};

const REPORT_BUTTONS = [
  { label: 'FLY AGAIN', key: 'R', action: 'restart' },
  { label: 'FLIGHT PLAN', key: 'N', action: 'newStart' },
  { label: 'WATCH REPLAY', key: 'V', action: 'replay' },
];

// Builds the flight report page from a finished flight.
export function reportPage(flight) {
  const td = flight.stats.touchdown;
  const landed = flight.phase === 'landed';
  const s = flight.state;
  const stage = flight.cfg.stages[s.stage];
  const fuelPct = Math.round((s.fuel / stage.fuelMass) * 100);
  const limits = flight.limits;
  const deg = (limits.tilt * 180) / Math.PI;
  const section = flight.scenario.section;
  const orbit = flight.stats.orbit;
  const common = [
    ['FLIGHT TIME', formatSeconds(td ? td.time : s.time)],
    ['FUEL LEFT', `${s.fuel.toFixed(0)} KG  (${fuelPct}%, ${stage.name})`],
    ['MAX SPEED', `${flight.stats.maxSpeed.toFixed(1)} M/S`],
    ['MAX ALTITUDE', km(flight.stats.maxAltitude)],
  ];
  if (orbit) common.push(['ORBIT REACHED', `AP ${km(orbit.ap)}  PE ${km(orbit.pe)}`]);
  if (!td) {
    // No touchdown: the flight left lunar space.
    return {
      section,
      title: 'FLIGHT REPORT',
      page: 'PAGE 2',
      stamp: { text: 'ABORTED', tone: 'spot' },
      rows: [['OUTCOME', 'Left lunar space', 'spot'], ...common],
      figure: 'FIG. 2',
      caption: 'Passed three Moon radii out with no way back. The Moon is the other way.',
      buttons: REPORT_BUTTONS,
    };
  }
  const rows = [
    ['OUTCOME', landed ? 'Landed on the surface' : 'Crashed on the surface', landed ? null : 'spot'],
    ...common,
    ['TOUCHDOWN V-SPEED', `${td.verticalSpeed.toFixed(1)} M/S  (LIMIT ${limits.verticalSpeed.toFixed(0)})`, td.reasons.includes('verticalSpeed') ? 'spot' : null],
    ['TOUCHDOWN H-SPEED', `${td.horizontalSpeed.toFixed(1)} M/S  (LIMIT ${limits.horizontalSpeed.toFixed(0)})`, td.reasons.includes('horizontalSpeed') ? 'spot' : null],
    ['TOUCHDOWN TILT', `${Math.abs((td.tilt * 180) / Math.PI).toFixed(0)} DEG  (LIMIT ${deg.toFixed(0)})`, td.reasons.includes('tilt') ? 'spot' : null],
    ['DOWNRANGE', `${(td.arc / 1000).toFixed(td.arc > 10000 ? 0 : 1)} KM FROM PAD 1`],
  ];
  const caption = landed
    ? 'Descent within limits. Crew reports the surface is firm.'
    : `${td.reasons.map((r) => REASON_TEXT[r]).join('; ')}. Vehicle lost.`;
  return {
    section,
    title: 'FLIGHT REPORT',
    page: 'PAGE 2',
    stamp: { text: landed ? 'LANDED' : 'CRASHED', tone: landed ? 'ink' : 'spot' },
    rows,
    figure: 'FIG. 2',
    caption,
    buttons: REPORT_BUTTONS,
  };
}

// The card that lands when a flight whose goal is orbit gets there.
export function orbitPage(flight) {
  const o = flight.stats.orbit;
  const s = flight.state;
  const stage = flight.cfg.stages[s.stage];
  const fuelPct = Math.round((s.fuel / stage.fuelMass) * 100);
  return {
    section: flight.scenario.section,
    title: 'ORBIT REPORT',
    page: 'PAGE 2',
    stamp: { text: 'ORBIT', tone: 'ink' },
    rows: [
      ['OUTCOME', 'Stable orbit achieved'],
      ['TIME TO ORBIT', formatSeconds(o.time)],
      ['APOAPSIS', km(o.ap)],
      ['PERIAPSIS', km(o.pe)],
      ['FUEL LEFT', `${s.fuel.toFixed(0)} KG  (${fuelPct}%, ${stage.name})`],
      ['STAGES LEFT', `${flight.cfg.stages.length - s.stage} OF ${flight.cfg.stages.length}`],
    ],
    figure: 'FIG. 2',
    caption: 'Periapsis clear of the ground: the vehicle will not come down on its own. Carry on flying, or bring it home with a retrograde burn.',
    buttons: [
      { label: 'CONTINUE', key: 'ENTER', action: 'begin' },
      { label: 'FLY AGAIN', key: 'R', action: 'restart' },
      { label: 'FLIGHT PLAN', key: 'N', action: 'newStart' },
    ],
  };
}

// The flight plan: choose where to start, with the controls as printed on
// the player's keyboard. keys: labels for KeyW, KeyS, KeyA, KeyD, KeyZ,
// KeyX (see keyLabels in input.js).
export function startPage(keys = {}) {
  const k = { KeyW: 'W', KeyS: 'S', KeyA: 'A', KeyD: 'D', KeyZ: 'Z', KeyX: 'X', ...keys };
  return {
    section: 'SECTION 2 — ORBITAL FLIGHT',
    title: 'FLIGHT PLAN',
    page: 'PAGE 1',
    choices: SCENARIO_ORDER.map((id, i) => ({ label: SCENARIOS[id].name, key: String(i + 1), action: `pick${i + 1}`, text: `${SCENARIOS[id].brief} GOAL — ${SCENARIOS[id].goalText}` })),
    lines: [
      `THROTTLE: ${k.KeyW} raises, ${k.KeyS} lowers (Shift / Ctrl work too). ${k.KeyZ} full, ${k.KeyX} cut.`,
      `TILT: ${k.KeyA} and ${k.KeyD}. The engine pushes the way the nose points. T holds prograde, G holds retrograde.`,
      'TIME: Right arrow runs time faster, Left arrow slower, a notch per press: ×1 to ×64 with physics (less near the ground), then ×100 to ×100,000 on rails (engine off, clear of any air, high enough). E warps to the next event: AP, PE, a change of sphere of influence, atmosphere entry. SPACE pauses. The same arrows shuttle a replay.',
      'TAB turns the page to the CRT map (the whole system, north up) and back. ENTER stages. + and − zoom, 0 resets. Mouse wheel and pinch zoom too.',
      'R restarts. N returns to this plan. V replays the last flight. M mutes.',
      'On a phone, use the stamped buttons.',
    ],
    figure: 'FIG. 1',
    caption: 'The dashed line is where you coast if the engine stays off; AP and PE mark its highest and lowest points.',
  };
}
