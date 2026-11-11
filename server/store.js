// An in-memory copy of one person's rows that the (synchronous) coaching engine reads and writes,
// remembering which rows changed, and which columns, so they can be saved in one pass afterwards.
// Saving only the changed columns keeps two requests that touch the same row (say, a coach reply and a
// settings change) from overwriting each other's work with a stale copy.
'use strict';
const { TABLES, fromDb, pkOf } = require('./schema');

function createStore(snapshot) {
  const data = {};
  const dirty = {};
  for (const sheet of Object.keys(TABLES)) {
    data[sheet] = (snapshot[TABLES[sheet].table] || []).map((r) => fromDb(sheet, r));
    dirty[sheet] = new Map();
  }
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  // cols: null for a new row (saved whole), or the set of columns changed on an existing one.
  function mark(sheet, row, cols) {
    const key = pkOf(sheet, row), cur = dirty[sheet].get(key);
    if (cur && cur.cols === null) return;
    if (!cols) { dirty[sheet].set(key, { row, cols: null }); return; }
    const set = cur ? cur.cols : new Set();
    cols.forEach((c) => set.add(c));
    dirty[sheet].set(key, { row, cols: set });
  }

  return {
    rows(sheet) {
      if (!data[sheet]) throw new Error('Unknown table: ' + sheet);
      return data[sheet];
    },
    insert(sheet, obj) {
      const row = {};
      for (const c of TABLES[sheet].columns) row[c.name] = s(obj[c.name]);
      data[sheet].push(row);
      mark(sheet, row, null);
      return row;
    },
    update(sheet, pred, patch) {
      let n = 0;
      for (const row of data[sheet]) {
        if (!pred(row)) continue;
        const cols = Object.keys(patch).filter((k) => row[k] !== s(patch[k]));
        for (const k of Object.keys(patch)) row[k] = s(patch[k]);
        if (cols.length) mark(sheet, row, cols);
        n++;
      }
      return n;
    },
    // Changes since the last call, grouped by table as [{ row, cols }]; clears the record.
    takeChanges() {
      const out = {};
      for (const sheet of Object.keys(dirty)) {
        if (dirty[sheet].size) out[sheet] = Array.from(dirty[sheet].values());
        dirty[sheet] = new Map();
      }
      return out;
    }
  };
}

module.exports = { createStore };
