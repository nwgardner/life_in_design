// Fails when the schema in framework.json has changed without a migration, so a change can't reach main
// and skip the database. Fix: npm run db:migration -- short_name
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const files = fs.readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const bad = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !/^\d{14}_[a-z0-9_]+\.sql$/.test(f));
if (bad.length) { console.error('Migration files must be named <14-digit UTC timestamp>_<name>.sql: ' + bad.join(', ')); process.exit(1); }
if (!files.length || fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8') !== schema) {
  console.error('The database schema changed but no migration records it. Run: npm run db:migration -- short_name');
  process.exit(1);
}
console.log('migrations up to date · latest ' + files[files.length - 1]);
