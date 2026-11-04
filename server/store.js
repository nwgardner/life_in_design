// An in-memory copy of one person's rows that the (synchronous) coaching engine reads and writes,
// remembering which rows changed so they can be saved in one pass afterwards.
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
  function mark(sheet, row) { dirty[sheet].set(pkOf(sheet, row), row); }

  return {
    rows(sheet) {
      if (!data[sheet]) throw new Error('Unknown table: ' + sheet);
      return data[sheet];
    },
    insert(sheet, obj) {
      const row = {};
      for (const c of TABLES[sheet].columns) row[c.name] = s(obj[c.name]);
      data[sheet].push(row);
      mark(sheet, row);
      return row;
    },
    update(sheet, pred, patch) {
      let n = 0;
      for (const row of data[sheet]) {
        if (!pred(row)) continue;
        for (const k of Object.keys(patch)) row[k] = s(patch[k]);
        mark(sheet, row);
        n++;
      }
      return n;
    },
    // Rows changed since the last call, grouped by table; clears the record.
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
