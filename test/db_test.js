// Checks supabase/schema.sql in a real Postgres engine: own-rows isolation, the invite gate, grants and the snapshot.
'use strict';
const fs = require('fs');
const path = require('path');
const { freshDb, asUser } = require('./pg_stub');

const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ✓', m); };
async function fails(p) { try { await p; return null; } catch (e) { return e.message; } }

(async () => {
  console.log('Database');
  const db = await freshDb();
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));
  ok(true, 'schema runs, and runs again without errors');

  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
  let e = await fails(db.query(`insert into auth.users (id, email) values ($1, 'stranger@example.com')`, [A]));
  ok(e && /invite-only/.test(e), 'sign-up without an invite is refused');
  await db.exec(`insert into public.invites (email) values ('Nate@Example.com'), ('friend@example.com')`);
  await db.query(`insert into auth.users (id, email) values ($1, 'nate@example.com'), ($2, 'friend@example.com')`, [A, B]);
  ok(true, 'invited emails can sign up (case-insensitive)');

  await asUser(db, A, (tx) => tx.query(`insert into public.profiles (name) values ('Nate')`));
  const own = await asUser(db, A, (tx) => tx.query(`select user_id from public.profiles`));
  ok(own.rows.length === 1 && own.rows[0].user_id === A, 'a new row defaults to the signed-in user');
  e = await fails(asUser(db, A, (tx) => tx.query(`insert into public.journal_entries (entry_id, user_id, entry) values (gen_random_uuid(), $1, 'x')`, [B])));
  ok(e && /row-level security/.test(e), "nobody can write a row into someone else's design");

  await asUser(db, B, (tx) => tx.query(`insert into public.journal_entries (entry_id, entry) values (gen_random_uuid(), 'private thoughts')`));
  await asUser(db, B, (tx) => tx.query(`insert into public.messages (message_id, context, role, content) values (gen_random_uuid(), 'explore:Money', 'user', 'hi')`));
  const seen = await asUser(db, A, (tx) => tx.query(`select count(*)::int n from public.journal_entries`));
  ok(seen.rows[0].n === 0, "one person cannot read another's journal");
  const upd = await asUser(db, A, (tx) => tx.query(`update public.journal_entries set entry = 'gotcha' returning *`));
  ok(upd.rows.length === 0, "one person cannot change another's rows");

  e = await fails(asUser(db, null, (tx) => tx.query(`select * from public.profiles`)));
  ok(e && /permission denied/.test(e), 'anonymous visitors cannot read any table');
  e = await fails(asUser(db, A, (tx) => tx.query(`select * from public.invites`)));
  ok(e && /permission denied/.test(e), 'signed-in people cannot read the invite list');
  e = await fails(asUser(db, A, (tx) => tx.query(`delete from public.profiles`)));
  ok(e && /permission denied/.test(e), 'rows cannot be deleted through the app');

  await asUser(db, A, (tx) => tx.query(`insert into public.messages (message_id, context, role, content) values (gen_random_uuid(), 'explore:Money', 'user', 'first'), (gen_random_uuid(), 'explore:Money', 'assistant', 'second'), (gen_random_uuid(), 'element:Vision', 'user', 'other')`));
  const snap = (await asUser(db, A, (tx) => tx.query(`select public.my_snapshot('explore:Money') s`))).rows[0].s;
  ok(snap.profiles.length === 1 && snap.journal_entries.length === 0, "the snapshot holds only the caller's rows");
  ok(snap.messages.length === 2 && snap.messages[0].content === 'first' && snap.messages[1].content === 'second', 'the snapshot keeps messages for one conversation, in order');
  ok(!('seq' in snap.messages[0]) && !('inserted_at' in snap.messages[0]), 'internal columns stay out of the snapshot');
  e = await fails(asUser(db, null, (tx) => tx.query(`select public.my_snapshot('')`)));
  ok(e && /permission denied/.test(e), 'anonymous visitors cannot call the snapshot');

  await db.query(`delete from auth.users where id = $1`, [B]);
  const gone = await db.query(`select count(*)::int n from public.journal_entries`);
  ok(gone.rows[0].n === 0, "deleting an account deletes that person's data");
  console.log('database checks passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
