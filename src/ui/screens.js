// Screen chrome drawn in HTML over the canvas: title blocks, stamps, pages.

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

// Engineering title block: program name, document, sheet number, date, MET.
export function mountTitleBlock(el, { program, document: doc, sheet, of, date, met = 0, audio = null }) {
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
//         caption, buttons: [{ label, key, action }], page }
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
    for (const b of page.buttons) {
      const btn = el('button', 'manual-button');
      btn.type = 'button';
      btn.append(el('span', null, b.label));
      if (b.key) btn.append(el('kbd', null, b.key));
      btn.addEventListener('click', () => onAction(b.action));
      bar.append(btn);
    }
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

const REASON_TEXT = {
  verticalSpeed: 'Came down too fast',
  horizontalSpeed: 'Still moving sideways',
  tilt: 'Not upright',
};

// Builds the flight report page from a finished flight.
export function reportPage(flight) {
  const td = flight.stats.touchdown;
  const landed = flight.phase === 'landed';
  const fuelPct = Math.round((flight.state.fuel / flight.cfg.fuelMass) * 100);
  const limits = flight.limits;
  const deg = (limits.tilt * 180) / Math.PI;
  const rows = [
    ['OUTCOME', landed ? 'Landed on the surface' : 'Crashed on the surface', landed ? null : 'spot'],
    ['FLIGHT TIME', formatSeconds(td.time)],
    ['FUEL LEFT', `${flight.state.fuel.toFixed(0)} KG  (${fuelPct}%)`],
    ['MAX SPEED', `${flight.stats.maxSpeed.toFixed(1)} M/S`],
    ['TOUCHDOWN V-SPEED', `${td.verticalSpeed.toFixed(1)} M/S  (LIMIT ${limits.verticalSpeed.toFixed(0)})`, td.reasons.includes('verticalSpeed') ? 'spot' : null],
    ['TOUCHDOWN H-SPEED', `${td.horizontalSpeed.toFixed(1)} M/S  (LIMIT ${limits.horizontalSpeed.toFixed(0)})`, td.reasons.includes('horizontalSpeed') ? 'spot' : null],
    ['TOUCHDOWN TILT', `${Math.abs((td.tilt * 180) / Math.PI).toFixed(0)} DEG  (LIMIT ${deg.toFixed(0)})`, td.reasons.includes('tilt') ? 'spot' : null],
  ];
  const caption = landed
    ? 'Descent within limits. Crew reports the surface is firm.'
    : `${td.reasons.map((r) => REASON_TEXT[r]).join('; ')}. Vehicle lost.`;
  return {
    section: 'SECTION 1 — LUNAR DESCENT TRAINER',
    title: 'FLIGHT REPORT',
    page: 'PAGE 2',
    stamp: { text: landed ? 'LANDED' : 'CRASHED', tone: landed ? 'ink' : 'spot' },
    rows,
    figure: 'FIG. 2',
    caption,
    buttons: [
      { label: 'FLY AGAIN', key: 'R', action: 'restart' },
      { label: 'WATCH REPLAY', key: 'P', action: 'replay' },
    ],
  };
}

export function startPage() {
  return {
    section: 'SECTION 1 — LUNAR DESCENT TRAINER',
    title: 'DESCENT CARD',
    page: 'PAGE 1',
    lines: [
      'You are 150 m above the Moon, drifting and sinking.',
      'Land with vertical speed under 3 m/s, sideways under 1 m/s, within 10° of upright.',
      'THROTTLE: Shift / Up to raise, Ctrl / Down to lower, Z full, X cut.',
      'TILT: A / Left and D / Right. The engine pushes the way the top leans.',
      'R restarts at any time. P replays the last flight. M mutes the sound.',
      'On a phone, use the stamped buttons.',
    ],
    figure: 'FIG. 1',
    caption: 'The dashed line shows where you fall if the engine stays off.',
    buttons: [{ label: 'BEGIN DESCENT', key: 'ENTER', action: 'begin' }],
  };
}
