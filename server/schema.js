// Maps the engine's tables (framework.json, PascalCase columns as in the Google Sheet)
// to Postgres tables and snake_case columns. One source of truth for the SQL and the server.
'use strict';
const path = require('path');
const fw = require(path.join(__dirname, '..', 'framework.json'));

const TABLE_NAMES = { Users: 'profiles', Journal: 'journal_entries', Growth: 'growth_items' };

function snake(name) {
  return name
    .replace(/ID$/, 'Id')
    .replace(/ID([A-Z])/g, 'Id$1')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

const TABLES = {};
for (const [sheet, cols] of Object.entries(fw.tables)) {
  const table = TABLE_NAMES[sheet] || snake(sheet);
  const columns = cols.map((name) => ({ name, col: snake(name) }));
  let pk;
  if (sheet === 'Users') pk = ['user_id'];
  else if (sheet === 'DesignRecord') pk = ['user_id', 'element'];
  else pk = [columns[0].col];
  TABLES[sheet] = { sheet, table, columns, pk, byCol: Object.fromEntries(columns.map((c) => [c.col, c.name])) };
}

// A row from Postgres (snake_case, nulls) -> the engine's shape (PascalCase strings).
function fromDb(sheet, row) {
  const t = TABLES[sheet];
  const out = {};
  for (const c of t.columns) {
    const v = row[c.col];
    out[c.name] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

// An engine row -> a full Postgres row with every column (PostgREST bulk upserts need identical keys).
function toDb(sheet, row) {
  const t = TABLES[sheet];
  const out = {};
  for (const c of t.columns) {
    const v = row[c.name];
    out[c.col] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

function pkOf(sheet, row) {
  return TABLES[sheet].pk.map((col) => row[TABLES[sheet].byCol[col]]).join('\u0001');
}

module.exports = { TABLES, snake, fromDb, toDb, pkOf, fw };
