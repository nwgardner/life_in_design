/**
 * Life in Design Coach · Apps Script backend
 * The Google Sheet is the database; this file serves the web app and calls Claude.
 *
 * Setup (once): see the "Setup" tab of the README, or:
 *  1. Project Settings → Script properties → add ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL).
 *  2. Run setup() once from the editor and approve access.
 *  3. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 */

var SHEET_ID = '/*@@SHEET_ID@@*/';
var DEFAULT_MODEL = 'claude-sonnet-5-5';
var COACH_GUIDE = /*@@GUIDE@@*/'';

/* ---------- web app ---------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Life in Design')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Single entry point for the front end: google.script.run.api(action, args) */
function api(action, args) {
  args = args || {};
  try {
    if (action === 'coach') return coach_(args);
    var fn = LID.ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);
    var d = driver_();
    if (LID.WRITES[action]) return withLock_(function () { return clean_(fn(d, args)); });
    return clean_(fn(d, args));
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

/* ---------- coaching ---------- */
function coach_(a) {
  var d = driver_();
  var prepared = withLock_(function () { return LID.coachPrepare(d, a); });
  var text = callClaude_(prepared.system, prepared.messages, a.mode === 'review' ? 2400 : a.mode === 'draft' ? 700 : 900);
  var d2 = driver_();
  return clean_(withLock_(function () { return LID.coachRecord(d2, a, prepared, text); }));
}

function callClaude_(contextText, messages, maxTokens) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('The coach is not connected yet: add ANTHROPIC_API_KEY under Project Settings → Script properties.');
  var body = {
    model: props.getProperty('ANTHROPIC_MODEL') || DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: COACH_GUIDE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextText }
    ],
    messages: messages
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var json = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) {
    var msg = json && json.error && json.error.message || ('HTTP ' + code);
    if (code === 429 || code === 529) throw new Error('The coach is busy right now. Try again in a minute.');
    throw new Error('The coach could not answer: ' + msg);
  }
  return (json.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('').trim();
}

/* ---------- Sheet driver ---------- */
function ss_() {
  return SHEET_ID && SHEET_ID.indexOf('@@') < 0 ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function driver_() {
  var ss = ss_();
  var cache = {};
  var heads = {};
  function sheet(t) {
    var s = ss.getSheetByName(t);
    if (!s) { ensureSchema_(ss); s = ss.getSheetByName(t); }
    return s;
  }
  function readHeader(t) {
    var s = sheet(t), w = Math.max(s.getLastColumn(), 1);
    return s.getRange(1, 1, 1, w).getValues()[0].map(String);
  }
  function headers(t) {
    if (!heads[t]) {
      var h = readHeader(t);
      var missing = LID.FW.tables[t].some(function (c) { return h.indexOf(c) < 0; });
      if (missing) { ensureSchema_(ss); h = readHeader(t); }
      heads[t] = h;
    }
    return heads[t];
  }
  function norm(v) {
    if (v instanceof Date) return v.toISOString();
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    return v === null || v === undefined ? '' : String(v);
  }
  function rows(t) {
    if (cache[t]) return cache[t];
    var s = sheet(t), h = headers(t), last = s.getLastRow();
    var vals = last > 1 ? s.getRange(2, 1, last - 1, h.length).getValues() : [];
    var out = [];
    vals.forEach(function (r, i) {
      if (r[0] === '' || r[0] === null) return;
      var o = {}; Object.defineProperty(o, '__row', { value: i + 2, enumerable: false, writable: true });
      h.forEach(function (k, j) { o[k] = norm(r[j]); });
      out.push(o);
    });
    cache[t] = out;
    return out;
  }
  function writeRow(t, rowNum, obj) {
    var h = headers(t);
    sheet(t).getRange(rowNum, 1, 1, h.length).setNumberFormat('@').setValues([h.map(function (k) { return norm(obj[k]); })]);
  }
  return {
    rows: rows,
    insert: function (t, obj) {
      var list = rows(t);
      var r = Math.max(sheet(t).getLastRow(), 1) + 1;
      writeRow(t, r, obj);
      var copy = {}; Object.keys(obj).forEach(function (k) { copy[k] = norm(obj[k]); });
      Object.defineProperty(copy, '__row', { value: r, enumerable: false, writable: true });
      list.push(copy);
      return copy;
    },
    update: function (t, pred, patch) {
      var n = 0;
      rows(t).forEach(function (o) {
        if (!pred(o)) return;
        Object.keys(patch).forEach(function (k) { o[k] = norm(patch[k]); });
        writeRow(t, o.__row, o);
        n++;
      });
      return n;
    }
  };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function clean_(v) { return JSON.parse(JSON.stringify(v === undefined ? null : v)); }

/* ---------- schema ---------- */
function ensureSchema_(ss) {
  ss = ss || ss_();
  Object.keys(LID.FW.tables).forEach(function (t) {
    var cols = LID.FW.tables[t];
    var s = ss.getSheetByName(t) || ss.insertSheet(t);
    var w = Math.max(s.getLastColumn(), 1);
    var first = s.getRange(1, 1, 1, w).getValues()[0].map(String);
    if (first.join('') === '') {
      s.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#2b2622');
      s.setFrozenRows(1);
    } else {
      // Add any column the app needs that the sheet lacks, at the end, so existing data never moves.
      cols.filter(function (c) { return first.indexOf(c) < 0; }).forEach(function (c) {
        var col = s.getLastColumn() + 1;
        s.getRange(1, col, 1, 1).setValues([[c]]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#2b2622');
      });
    }
    s.getRange(2, 1, Math.max(s.getMaxRows() - 1, 1), Math.max(s.getLastColumn(), cols.length)).setNumberFormat('@');
  });
}

/* ---------- weekly email nudges ---------- */
function sendWeeklyNudges() {
  var d = driver_();
  var url = ScriptApp.getService().getUrl() || '';
  var sent = 0;
  d.rows('Users').forEach(function (u) {
    if (!u.Email || !/@/.test(u.Email)) return;
    var prefs = LID.getPrefs(u);
    if (!prefs.nudges || !prefs.email) return;
    if (prefs.lastEmailAt && (Date.now() - new Date(prefs.lastEmailAt).getTime()) < 6 * 86400000) return;
    var state;
    try { state = LID.ACTIONS.getState(d, { userId: u.UserID }); } catch (e) { return; }
    var nudges = LID.computeNudges(state, Date.now());
    var why = state.recs.filter(function (r) { return r.Status === 'New' && r.Layer === 'Why'; })[0];
    if (!nudges.length && !why) return;
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var html = '<div style="font-family:Georgia,serif;color:#1C2A30;max-width:560px">' +
      '<p style="font-size:18px">' + esc(u.Name) + ', your Life in Design this week</p>' +
      (why ? '<p style="border-left:3px solid #2D7266;padding-left:12px;font-style:italic">' + esc(why.Title) + '</p>' : '') +
      '<ul style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' + nudges.map(function (n) { return '<li>' + esc(n.text) + '</li>'; }).join('') + '</ul>' +
      (url ? '<p style="font-family:Arial,sans-serif"><a href="' + url + '" style="color:#2D7266">Open your design</a></p>' : '') +
      '<p style="font-family:Arial,sans-serif;font-size:12px;color:#55646A">You can turn these emails off under You → Notifications.</p></div>';
    try {
      MailApp.sendEmail({ to: u.Email, subject: 'Your Life in Design this week', htmlBody: html, name: 'Life in Design Coach' });
      LID.ACTIONS.savePrefs(d, { userId: u.UserID, prefs: { lastEmailAt: new Date().toISOString() }, silent: true });
      sent++;
    } catch (e) { Logger.log('Email to ' + u.UserID + ' failed: ' + e); }
  });
  Logger.log('Weekly nudges sent: ' + sent);
}

function installNudgeTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sendWeeklyNudges'; });
  if (!exists) ScriptApp.newTrigger('sendWeeklyNudges').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  return !exists;
}

/** Run once from the editor (and again after each update): checks the tabs, adds new ones, installs the weekly nudge email. */
function setup() {
  ensureSchema_();
  Logger.log(installNudgeTrigger_() ? 'Weekly nudge email scheduled for Monday mornings.' : 'Weekly nudge email already scheduled.');
  var hasKey = !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  Logger.log('Database ready: ' + ss_().getName());
  Logger.log(hasKey ? 'Claude API key found.' : 'Next: add ANTHROPIC_API_KEY in Project Settings → Script properties.');
}

/** Optional: run from the editor to confirm the coach answers. */
function testCoach() {
  Logger.log(callClaude_('Context: a connection test.', [{ role: 'user', content: 'Say hello in one short sentence.' }], 60));
}
