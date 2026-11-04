// A local stand-in for Supabase's Postgres: the schema runs in PGlite with the parts of Supabase it relies on
// (the auth schema, auth.uid(), and the anon / authenticated roles).
'use strict';
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const SUPABASE_STUB = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text unique);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  await db.exec(sql);
  return db;
}

// Run a function as a signed-in user (or anon when userId is null), like PostgREST does for each request.
async function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId || '']);
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
}

module.exports = { freshDb, asUser, SUPABASE_STUB };
