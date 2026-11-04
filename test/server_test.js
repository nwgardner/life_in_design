// The hosted server end to end: real server code, a stand-in Supabase whose every query runs in Postgres (PGlite)
// under the schema's row-level security, and a stand-in Claude that streams like the real Messages API.
'use strict';
const http = require('http');
const { freshDb } = require('./pg_stub');
const { supabaseStub, claudeStub } = require('./stubs');
const { createApp } = require('../server/app');
const { createSupabase } = require('../server/supabase');
const { createClaude } = require('../server/claude');

const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ✓', m); };
const listen = (handler) => new Promise((r) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  console.log('Hosted server');
  const db = await freshDb();
  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
  await db.exec(`insert into public.invites (email) values ('nate@example.com'), ('friend@example.com')`);
  await db.query(`insert into auth.users (id, email) values ($1, 'nate@example.com'), ($2, 'friend@example.com')`, [A, B]);

  const supa = supabaseStub(db), cl = claudeStub();
  const supaSrv = await listen(supa.handler), clSrv = await listen(cl.handler);
  const base = (s) => 'http://127.0.0.1:' + s.address().port;
  const config = { supabaseUrl: base(supaSrv), supabaseAnonKey: 'anon-key', coachPerHour: 40 };
  const app = createApp({
    config,
    supabase: createSupabase({ url: config.supabaseUrl, anonKey: 'anon-key' }),
    ask: createClaude({ apiKey: 'test-key', model: 'claude-test', baseUrl: base(clSrv) })
  });
  const appSrv = await listen(app);
  const APP = base(appSrv);

  async function call(action, args, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who) headers.Authorization = 'Bearer token-' + who;
    const res = await fetch(APP + '/api/' + action, { method: 'POST', headers, body: JSON.stringify({ args: args || {} }) });
    if ((res.headers.get('content-type') || '').includes('ndjson')) {
      const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
      const done = lines.find((l) => l.t === 'done'), err = lines.find((l) => l.t === 'error');
      return { status: res.status, streamed: lines.filter((l) => l.t === 'text').length, result: done && done.result, error: err && err.error };
    }
    const j = await res.json();
    return { status: res.status, result: j.result, error: j.error };
  }
  const must = async (action, args, who = A) => { const r = await call(action, args, who); if (r.error) throw new Error(action + ': ' + r.error); return r.result; };

  // serving
  let r = await fetch(APP + '/healthz'); ok(r.status === 200, 'health check answers');
  r = await fetch(APP + '/config.js'); const cfgText = await r.text();
  ok(/supabaseUrl/.test(cfgText) && /anon-key/.test(cfgText) && !/test-key/.test(cfgText), 'config.js shares the public Supabase settings and never the Claude key');
  r = await fetch(APP + '/'); const page = await r.text();
  ok(r.status === 200 && /<!doctype html>/i.test(page) && /supabase-js@2\.118\.0/.test(page), 'the app page is served with the pinned sign-in library');
  ok(/frame-ancestors 'none'/.test(r.headers.get('content-security-policy')) && r.headers.get('content-security-policy').includes(config.supabaseUrl), 'the page has a content security policy that allows only Supabase');
  ok(!/Watts/.test(page), 'the page never carries the voice note');

  // auth
  ok((await call('getState', {})).status === 401, 'no sign-in, no data');
  ok((await call('getState', {}, '33333333-3333-4333-8333-333333333333')).status === 401, 'an unknown account is refused');
  ok(/No design found/.test((await call('getState', {}, A)).error), 'a new account has no design yet');

  // onboarding
  const u = await must('createUser', { name: 'Nate', whatBrought: 'Scattered', pressing: 'Should I take the new role?', is18: true, userId: B });
  ok(u.UserID === A && u.Email === 'nate@example.com', 'the design belongs to the signed-in account, whatever id the browser sends');
  ok((await call('createUser', { name: 'Again', is18: true }, A)).status === 409, 'a second design for the same account is refused');
  const sess = await must('startSession');
  let st = await must('getState');
  ok(st.parked.length === 1, 'the pressing problem is parked');

  // exploration with a streamed coach reply
  await must('startArea', { area: 'Money', sessionId: sess.SessionID });
  let c = await call('coach', { context: 'explore:Money', mode: 'open', sessionId: sess.SessionID }, A);
  ok(c.result && c.result.reply && c.streamed > 1, 'the coach reply streams in pieces');
  const sys = cl.seen[cl.seen.length - 1].body.system;
  ok(sys[0].cache_control && /Life in Design Coach/.test(sys[0].text) && /Lens 1 of 7/.test(sys[1].text), 'Claude gets the cached guide and the live context');
  await must('coach', { context: 'explore:Money', mode: 'chat', message: 'My dad saw money as security.' });
  await must('advanceLens', { area: 'Money' });
  for (let i = 0; i < 6; i++) { await must('coach', { context: 'explore:Money', mode: 'chat', message: 'Answer ' + i }); await must('advanceLens', { area: 'Money' }); }
  const draft = (await call('coach', { context: 'explore:Money', mode: 'draft' }, A)).result;
  ok(draft.draft && /^Enough/.test(draft.draft.belief), 'the chosen-belief draft comes back for approval');
  await must('saveChosenBelief', { area: 'Money', belief: draft.draft.belief, why: draft.draft.why });
  const msgs = await must('getMessages', { context: 'explore:Money' });
  ok(msgs.filter((m) => m.Role === 'assistant').length === 8 && msgs[0].Content.startsWith('[note]'), 'the whole conversation is stored in order');

  // design through the stack, with versioning
  ok(/opens once/.test((await call('saveElement', { element: 'Vision', statement: 'x' }, A)).error), 'the strict order holds on the server');
  for (const e of ['Core Beliefs', 'Vision', 'Purpose', 'Governing Principles', 'Strategy', 'Relationships', 'Key Activities', 'Resources', 'Methods']) await must('saveElement', { element: e, statement: e + ' v1', status: 'Draft' });
  await must('saveElement', { element: 'Vision', statement: 'Vision v2', status: 'Approved', changeNote: 'Bigger' });
  const dr = await db.query(`select version, status from public.design_record where user_id = $1 and element = 'Vision'`, [A]);
  const hist = await db.query(`select count(*)::int n from public.element_history where user_id = $1 and element = 'Vision'`, [A]);
  ok(dr.rows[0].version === '2' && dr.rows[0].status === 'Approved' && hist.rows[0].n === 2, 'an update replaces the current version and keeps the history');

  // Phase A inputs and the review loop
  await must('saveAssessment', { test: 'clifton', values: { top: ['Learner', 'Strategic', 'Ideation', 'Relator', 'Achiever'] } });
  await must('addJournal', { entry: 'Tuesdays feel stolen.' });
  const rv = (await call('coach', { context: 'iterate', mode: 'review' }, A)).result;
  ok(rv.review && rv.review.Total === '2' && cl.seen[cl.seen.length - 1].body.max_tokens === 2400, 'a congruence review runs and is stored');
  st = await must('getState');
  const how = st.recs.find((x) => x.Layer === 'How');
  const resp = await must('respondRec', { recId: how.RecID, status: 'Accepted', actionText: 'Email in one window after lunch' });
  ok(resp.next.open === 'element:Strategy', 'accepted guidance opens the element it changes');

  // isolation between people
  const sB = await call('getState', { userId: A }, B);
  ok(/No design found/.test(sB.error), "another person cannot reach Nate's design, even by sending his id");
  await must('createUser', { name: 'Friend', is18: true }, B);
  const fB = await must('getState', {}, B);
  ok(fB.user.Name === 'Friend' && fB.design.length === 0 && fB.journal.length === 0, 'each person sees only their own design');
  const rowsA = await db.query(`select count(*)::int n from public.journal_entries where user_id = $1`, [A]);
  ok(rowsA.rows[0].n === 1, "Nate's journal is untouched by the other account");

  // guards
  ok(/Unknown action/.test((await call('dropTables', {}, A)).error), 'only the app’s own actions can be called');
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) { const x = await call('coach', { context: 'explore:Money', mode: 'open' }, A); if (x.status === 429) limited = x; }
  ok(limited && /hourly limit/.test(limited.error), 'coaching calls are capped per person per hour');
  const badKey = createApp({ config, supabase: createSupabase({ url: config.supabaseUrl, anonKey: 'anon-key' }), ask: createClaude({ apiKey: 'wrong', model: 'm', baseUrl: base(clSrv) }) });
  const badSrv = await listen(badKey);
  const br = await fetch(base(badSrv) + '/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-' + B }, body: JSON.stringify({ args: { context: 'explore:Career', mode: 'open' } }) });
  ok(/ANTHROPIC_API_KEY/.test(await br.text()), 'a wrong Claude key gives a clear setup message');

  console.log('server checks passed · snapshots', supa.calls.snapshots, '· upserts', supa.calls.upserts);
  [supaSrv, clSrv, appSrv, badSrv].forEach((s) => s.close());
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
