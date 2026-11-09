// The Life in Design web server: serves the app and runs one engine action per request, as the signed-in person.
'use strict';
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');

const ROOT = path.join(__dirname, '..');
const MAX_BODY = 256 * 1024;

function loadEngine() {
  const file = path.join(ROOT, 'dist', 'server', 'engine.js');
  if (!fs.existsSync(file)) throw new Error('dist/server/engine.js is missing: run npm run build first.');
  return require(file);
}

function createApp({ supabase, ask, config, engine = loadEngine(), now = Date.now }) {
  const LID = engine;
  const guide = fs.readFileSync(path.join(ROOT, 'src', 'guide.md'), 'utf8');
  const indexPath = path.join(ROOT, 'dist', 'web', 'index.html');
  const html = () => fs.readFileSync(indexPath);
  const ALLOWED = new Set(Object.keys(LID.ACTIONS).concat(['coach']));
  const supaOrigin = (() => { try { return new URL(config.supabaseUrl).origin; } catch (e) { return ''; } })();

  // Small guards for an alpha: cache sign-in checks briefly, and cap coaching calls per person per hour.
  const userCache = new Map();
  const coachCalls = new Map();
  const perHour = config.coachPerHour || 60;

  async function authenticate(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    const token = m[1].trim();
    const hit = userCache.get(token);
    if (hit && hit.until > now()) return { token, user: hit.user };
    const user = await supabase.getUser(token);
    if (!user) return null;
    userCache.set(token, { user, until: now() + 60 * 1000 });
    if (userCache.size > 5000) userCache.clear();
    return { token, user };
  }

  function allowCoach(userId) {
    const t = now();
    const list = (coachCalls.get(userId) || []).filter((x) => t - x < 3600 * 1000);
    if (list.length >= perHour) { coachCalls.set(userId, list); return false; }
    list.push(t);
    coachCalls.set(userId, list);
    return true;
  }

  // Errors the engine raises are about what the person asked for (a locked element, a missing field): 400s.
  function run(fn) {
    try { return fn(); } catch (e) { if (!e.status) e.status = 400; throw e; }
  }

  async function flush(token, store) {
    const changes = store.takeChanges();
    for (const sheet of Object.keys(changes)) await supabase.upsert(token, sheet, changes[sheet]);
  }

  function send(res, status, body, headers) {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error('That is more text than the app accepts at once.'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
        catch (e) { reject(Object.assign(new Error('The request was not valid JSON.'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  async function handleApi(req, res, action) {
    if (!ALLOWED.has(action)) return send(res, 404, { error: 'Unknown action.' });
    const auth = await authenticate(req);
    if (!auth) return send(res, 401, { error: 'Please sign in again.' });
    const body = await readJson(req);
    const args = Object.assign({}, body.args || {});
    // The person is always the signed-in account, whatever the browser sends.
    delete args.newUserId;
    args.userId = auth.user.id;

    // Messages are loaded for one conversation only; startArea names its conversation by the area.
    const msgContext = args.context || (action === 'startArea' && args.area ? 'explore:' + String(args.area).trim() : '');
    const snapshot = await supabase.snapshot(auth.token, msgContext);
    const store = createStore(snapshot);

    if (action === 'createUser') {
      if (store.rows('Users').length) return send(res, 409, { error: 'You already have a design.' });
      args.newUserId = auth.user.id;
      args.email = auth.user.email;
    }

    if (action !== 'coach') {
      const result = run(() => LID.ACTIONS[action](store, args));
      await flush(auth.token, store);
      return send(res, 200, { result: JSON.parse(JSON.stringify(result === undefined ? null : result)) });
    }

    if (!allowCoach(auth.user.id)) {
      return send(res, 429, { error: "You've reached this alpha's hourly limit for coaching. Take a breath and come back in a little while." });
    }
    const prepared = run(() => LID.coachPrepare(store, args));
    await flush(auth.token, store);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const line = (o) => res.write(JSON.stringify(o) + '\n');
    try {
      const maxTokens = args.mode === 'review' ? 2400 : args.mode === 'draft' ? 700 : 900;
      const stream = args.mode !== 'review' && args.mode !== 'draft';
      const text = await ask({
        guide, context: prepared.system, messages: prepared.messages, maxTokens,
        onText: stream ? (delta, whole) => line({ t: 'text', text: whole }) : null
      });
      const result = run(() => LID.coachRecord(store, args, prepared, text));
      await flush(auth.token, store);
      line({ t: 'done', result: JSON.parse(JSON.stringify(result)) });
    } catch (e) {
      line({ t: 'error', error: e.message || 'The coach could not answer just now.' });
    }
    res.end();
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/config.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('window.LID_CONFIG = ' + JSON.stringify({ supabaseUrl: config.supabaseUrl || '', supabaseAnonKey: config.supabaseAnonKey || '' }) + ';\n');
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'same-origin',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self' " + supaOrigin,
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'self'"
          ].join('; ')
        });
        return res.end(html());
      }
      const m = /^\/api\/([A-Za-z]+)$/.exec(url.pathname);
      if (m && req.method === 'POST') return await handleApi(req, res, m[1]);
      return send(res, 404, { error: 'Not found.' });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, e.message);
      if (res.headersSent) { try { res.end(); } catch (x) { /* closed */ } return; }
      return send(res, status, { error: status >= 500 && !e.status ? 'Something went wrong on our side. Try again in a moment.' : e.message });
    }
  };
}

module.exports = { createApp };
