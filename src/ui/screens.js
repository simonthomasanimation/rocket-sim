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
export function mountTitleBlock(el, { program, document: doc, sheet, of, date, met = 0 }) {
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
