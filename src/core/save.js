// Saves: everything the game keeps between sessions goes through here. The
// core never touches localStorage itself; main.js hands in a backend with
// getItem / setItem / removeItem (the browser's localStorage, or nothing),
// and every read and write is wrapped so the game runs with no storage at
// all. Values are JSON under one key prefix; export and import move the
// lot as one JSON document.

export const PREFIX = 'karman.';

export function createStore(backend = null) {
  let memory = {}; // the fallback when there is no backend, or it refuses

  function read(key) {
    const k = PREFIX + key;
    if (backend) {
      try { const raw = backend.getItem(k); if (raw !== null && raw !== undefined) return JSON.parse(raw); } catch { /* fall through */ }
    }
    return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
  }

  function write(key, value) {
    const k = PREFIX + key;
    memory[k] = value;
    if (!backend) return false;
    try { backend.setItem(k, JSON.stringify(value)); return true; } catch { return false; }
  }

  function remove(key) {
    const k = PREFIX + key;
    delete memory[k];
    if (!backend) return;
    try { backend.removeItem(k); } catch { /* nothing to do */ }
  }

  // Every key under the prefix (backend first, then memory), without it.
  function keys() {
    const out = new Set();
    if (backend) {
      try {
        const n = typeof backend.length === 'number' ? backend.length : 0;
        for (let i = 0; i < n; i++) { const k = backend.key(i); if (k && k.startsWith(PREFIX)) out.add(k.slice(PREFIX.length)); }
      } catch { /* a backend without key(); memory still answers */ }
    }
    for (const k of Object.keys(memory)) out.add(k.slice(PREFIX.length));
    return [...out].sort();
  }

  // Everything, as one JSON document for export.
  function exportAll() {
    const data = {};
    for (const k of keys()) data[k] = read(k);
    return { format: 'karman-save', version: 1, savedAt: new Date().toISOString(), data };
  }

  // Merge an exported document back in. Returns the keys written, or
  // throws when the document is not one of ours.
  function importAll(doc) {
    if (!doc || doc.format !== 'karman-save' || typeof doc.data !== 'object' || doc.data === null) throw new Error('not a Kármán Program save');
    const written = [];
    for (const [k, v] of Object.entries(doc.data)) { write(k, v); written.push(k); }
    return written;
  }

  return { read, write, remove, keys, exportAll, importAll, clearMemory() { memory = {}; } };
}
