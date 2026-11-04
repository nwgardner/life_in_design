// Records a schema change as a new migration for Supabase's GitHub integration.
// Usage: npm run db:migration -- short_name
// Regenerates supabase/schema.sql from framework.json; if it differs from the newest migration,
// writes supabase/migrations/<UTC timestamp>_<short_name>.sql. The schema is written to be safe to run again,
// so each migration is the complete schema and applying it brings any database up to date.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');
const name = (process.argv[2] || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
if (!name) { console.error('Give the change a short name: npm run db:migration -- add_reflections'); process.exit(1); }

execFileSync(process.execPath, [path.join(__dirname, 'build_schema.js')], { stdio: 'inherit' });
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const files = fs.readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
if (files.length && fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8') === schema) {
  console.log('No schema changes since ' + files[files.length - 1] + '.');
  process.exit(0);
}
const d = new Date(), p = (n) => String(n).padStart(2, '0');
const stamp = d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
const file = stamp + '_' + name + '.sql';
fs.writeFileSync(path.join(dir, file), schema);
console.log('wrote supabase/migrations/' + file + '. Commit it; merging to main applies it in Supabase.');
