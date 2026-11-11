// Stand-ins for Supabase (auth + the PostgREST calls the server makes, over PGlite) and for Claude's streaming API.
'use strict';
const { asUser } = require('./pg_stub');
const { TABLES } = require('../server/schema');
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); });

// ---- stand-in Supabase (auth + PostgREST subset) over PGlite ----
function supabaseStub(db) {
  const tableToSheet = Object.fromEntries(Object.values(TABLES).map((t) => [t.table, t.sheet]));
  const calls = { upserts: 0, snapshots: 0 };
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    // Browsers call Supabase directly for sign-in, so answer CORS like Supabase does.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.apikey !== 'anon-key') return json(401, { message: 'No API key found in request' });
    const tok = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const uid = tok && tok[1].startsWith('token-') ? tok[1].slice(6) : null;
    try {
      if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
        // A magic-link request: GoTrue creates the user if needed, which the invite trigger may refuse.
        const b = JSON.parse((await readBody(req)) || '{}');
        calls.otp = (calls.otp || []).concat([b]);
        const known = await db.query('select id from auth.users where lower(email) = lower($1)', [b.email]);
        if (!known.rows.length) {
          try { await db.query('insert into auth.users (id, email) values (gen_random_uuid(), $1)', [b.email]); }
          catch (e) { return json(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' }); }
        }
        return json(200, {});
      }
      if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
      if (url.pathname === '/auth/v1/user') {
        const r = uid ? await db.query('select id, email from auth.users where id = $1', [uid]) : { rows: [] };
        return r.rows.length ? json(200, { id: r.rows[0].id, email: r.rows[0].email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-04T00:00:00Z' }) : json(401, { msg: 'invalid JWT' });
      }
      if (!uid) return json(401, { message: 'JWT expired' });
      const body = JSON.parse((await readBody(req)) || '{}');
      if (url.pathname === '/rest/v1/rpc/my_snapshot') {
        calls.snapshots++;
        const r = await asUser(db, uid, (tx) => tx.query('select public.my_snapshot($1) s', [body.ctx || '']));
        return json(200, r.rows[0].s);
      }
      const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (m && req.method === 'POST' && /merge-duplicates/.test(req.headers.prefer || '')) {
        const t = TABLES[tableToSheet[m[1]]];
        const conflict = url.searchParams.get('on_conflict').split(',');
        const rows = Array.isArray(body) ? body : [body];
        const keys = Object.keys(rows[0]);
        if (rows.some((r) => Object.keys(r).join() !== keys.join())) return json(400, { message: 'All object keys must match' });
        calls.upserts++;
        (calls.shapes = calls.shapes || []).push({ table: t.table, keys });
        await asUser(db, uid, async (tx) => {
          for (const r of rows) {
            const cols = keys.map((k) => `"${k}"`).join(', ');
            const vals = keys.map((_, i) => '$' + (i + 1)).join(', ');
            const set = keys.filter((k) => !conflict.includes(k)).map((k) => `"${k}" = excluded."${k}"`).join(', ');
            await tx.query(`insert into public.${t.table} (${cols}) values (${vals}) on conflict (${conflict.join(', ')}) do update set ${set}`, keys.map((k) => r[k]));
          }
        });
        res.writeHead(201); return res.end();
      }
      return json(404, { message: 'not found' });
    } catch (e) {
      return json(/row-level security|permission denied/.test(e.message) ? 403 : 400, { message: e.message });
    }
  };
  return { handler, calls };
}

// ---- stand-in Claude: streams Server-Sent Events like the Messages API ----
function claudeStub() {
  const seen = [];
  const reply = (body) => {
    const last = body.messages[body.messages.length - 1].content;
    if (/congruence review/.test(last)) return '```json\n' + JSON.stringify({
      summary: 'Mostly congruent. Email is eating the hours your Purpose needs.',
      trace: [{ item: 'Morning writing', element: 'Key Activities', tracesTo: ['Strategy'], status: 'traced', note: 'core' },
              { item: 'Email triage', element: 'Key Activities', tracesTo: [], status: 'untraced', note: 'no link' }],
      orphans: [],
      cards: [{ layer: 'How', kind: 'challenge', title: 'Email is missing from your no-list', body: 'It takes Tuesday.', tracesTo: 'Purpose', action: { type: 'revise', element: 'Strategy', text: 'Add email to the no-list' } },
              { layer: 'What', kind: 'community', title: 'Find a writers circle', body: 'Fellow travelers.', tracesTo: 'Relationships', action: { type: 'community' }, search: 'writers circle near me' }]
    }) + '\n```';
    if (/TASK FOR THE APP/.test(last)) return /Belief:/.test(last) ? 'Belief: Enough is a choice I make each day.\nWhy: Chasing more kept me from noticing what I had.' : '- I am enough, and growing.\n- People mostly do their best.';
    return 'Take your time with that. What do you notice when you sit with it?';
  };
  const handler = async (req, res) => {
    const body = JSON.parse(await readBody(req));
    seen.push({ headers: req.headers, body });
    if (req.headers['x-api-key'] !== 'test-key') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'invalid x-api-key' } })); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const text = reply(body);
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(Object.assign({ type }, data))}\n\n`);
    ev('message_start', { message: { id: 'msg_1', role: 'assistant', content: [] } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < text.length; i += 17) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 17) } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn' } });
    ev('message_stop', {});
    res.end();
  };
  return { handler, seen };
}

module.exports = { supabaseStub, claudeStub, readBody };
