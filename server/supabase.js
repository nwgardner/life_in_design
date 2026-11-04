// The few Supabase calls the server makes, over plain HTTPS. Every data call carries the person's own
// access token, so Postgres row-level security decides what it can see and change.
'use strict';
const { TABLES, toDb } = require('./schema');

function createSupabase({ url, anonKey, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '');
  const headers = (token, extra) => Object.assign({ apikey: anonKey, Authorization: 'Bearer ' + token }, extra || {});

  async function failure(res, what) {
    let detail = '';
    try { const j = await res.json(); detail = j.message || j.msg || j.error_description || j.error || ''; } catch (e) { /* not JSON */ }
    const err = new Error(what + ' failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
    err.status = res.status;
    return err;
  }

  return {
    // The signed-in person behind an access token, or null if the token is missing, expired or forged.
    async getUser(token) {
      if (!token) return null;
      const res = await fetchImpl(base + '/auth/v1/user', { headers: headers(token) });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw await failure(res, 'Checking your sign-in');
      const u = await res.json();
      return u && u.id ? { id: u.id, email: u.email || '' } : null;
    },

    // All of the person's rows, plus the messages of one conversation.
    async snapshot(token, ctx) {
      const res = await fetchImpl(base + '/rest/v1/rpc/my_snapshot', {
        method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ ctx: ctx || '' })
      });
      if (!res.ok) throw await failure(res, 'Loading your design');
      return res.json();
    },

    // Insert-or-update full rows for one table, keyed on its primary key.
    async upsert(token, sheet, rows) {
      const t = TABLES[sheet];
      const res = await fetchImpl(base + '/rest/v1/' + t.table + '?on_conflict=' + t.pk.join(','), {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows.map((r) => toDb(sheet, r)))
      });
      if (!res.ok) throw await failure(res, 'Saving to ' + t.table);
    }
  };
}

module.exports = { createSupabase };
