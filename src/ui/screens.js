// Screen chrome drawn in HTML over the canvas: title blocks, stamps, pages.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDrawingDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  return `${d} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function cell(label, value) {
  const tr = document.createElement('tr');
  const th = document.createElement('td');
  th.className = 'label';
  th.textContent = label;
  const td = document.createElement('td');
  td.textContent = value;
  tr.append(th, td);
  return tr;
}

// Engineering title block: program name, document, sheet number, date.
export function mountTitleBlock(el, { program, document: doc, sheet, of, date }) {
  el.replaceChildren();
  const table = document.createElement('table');
  const head = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 2;
  th.textContent = program;
  head.append(th);
  table.append(head);
  table.append(cell('DOC', doc));
  table.append(cell('SHEET', `${sheet} OF ${of}`));
  table.append(cell('DATE', formatDrawingDate(date)));
  el.append(table);
}
