// Hosted mode in a real browser: the real server and the real supabase-js sign-in library, against the stand-in
// Supabase (PGlite) and Claude. Walks invite-only sign-in, the magic link, onboarding, a streamed coach reply,
// staying signed in across a reload, and signing out. Screenshots land in test/shots/.
// Optional: LID_FONT_CSS=path/to/fonts.css for real fonts in screenshots.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { freshDb } = require('./pg_stub');
const { supabaseStub, claudeStub } = require('./stubs');
const { createApp } = require('../server/app');
const { createSupabase } = require('../server/supabase');
const { createClaude } = require('../server/claude');

const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ✓', m); };
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => r(s)); });
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const SUPA_JS = fs.readFileSync(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'));
const FONTS = process.env.LID_FONT_CSS ? fs.readFileSync(process.env.LID_FONT_CSS, 'utf8') : '';

(async () => {
  console.log('Hosted app in a browser');
  const db = await freshDb();
  await db.exec(`insert into public.invites (email) values ('nate@example.com')`);
  const supa = supabaseStub(db), cl = claudeStub();
  const supaSrv = await listen(supa.handler), clSrv = await listen(cl.handler);
  const base = (s) => 'http://127.0.0.1:' + s.address().port;
  const config = { supabaseUrl: base(supaSrv), supabaseAnonKey: 'anon-key' };
  const appSrv = await listen(createApp({
    config, supabase: createSupabase({ url: config.supabaseUrl, anonKey: 'anon-key' }),
    ask: createClaude({ apiKey: 'test-key', model: 'claude-test', baseUrl: base(clSrv) })
  }));
  const APP = base(appSrv);

  const browser = await chromium.launch();
  const errors = [];
  for (const [name, viewport, scheme] of [['desktop', { width: 1280, height: 860 }, 'light'], ['phone', { width: 390, height: 844 }, 'dark']]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(name + ': ' + m.text()); });
    // Expected failures: the uninvited sign-in attempt, and "no design yet" for a brand-new account.
    const expected = [/\/auth\/v1\/otp$/, /\/api\/getState$/];
    pg.on('response', (r) => { if (r.status() >= 400 && !/fonts/.test(r.url()) && !expected.some((x) => x.test(new URL(r.url()).pathname))) errors.push(name + ': ' + r.status() + ' ' + r.url()); });
    await pg.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SUPA_JS, headers: { 'Access-Control-Allow-Origin': '*' } }));
    await pg.route('https://fonts.googleapis.com/**', (r) => FONTS ? r.fulfill({ status: 200, contentType: 'text/css', body: FONTS }) : r.abort());
    await pg.route('https://fonts.gstatic.com/**', (r) => r.abort());

    await pg.goto(APP + '/');
    await pg.waitForSelector('#signinForm');
    ok(await pg.isVisible('text=invite-only alpha'), name + ': signed-out visitors see the sign-in screen');
    await pg.fill('#si-email', 'stranger@example.com'); await pg.click('#signinForm button[type=submit]');
    await pg.waitForSelector('#si-err:not([hidden])');
    ok(/invite-only/.test(await pg.textContent('#si-err')), name + ': an uninvited email is turned away kindly');
    await pg.fill('#si-email', 'nate@example.com'); await pg.click('#signinForm button[type=submit]');
    await pg.waitForSelector('text=Check your email');
    const otp = supa.calls.otp[supa.calls.otp.length - 1];
    ok(otp.email === 'nate@example.com', name + ': an invited email gets a sign-in link');
    if (name === 'desktop') await pg.screenshot({ path: path.join(SHOTS, 'H1-check-email.png') });

    // Opening the emailed link: Supabase redirects back with the session in the URL hash.
    const uid = (await db.query(`select id from auth.users where email = 'nate@example.com'`)).rows[0].id;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await pg.goto('about:blank'); // a link from an email opens a fresh page load
    await pg.goto(APP + '/#access_token=token-' + uid + '&expires_at=' + exp + '&expires_in=3600&refresh_token=refresh-1&token_type=bearer&type=magiclink');
    if (name === 'desktop') {
      await pg.waitForSelector('#onboard', { timeout: 15000 }).catch(async (e) => { console.log('SCREEN:', (await pg.textContent('main')).slice(0, 300)); throw e; });
      ok(await pg.isVisible('text=Signed in as nate@example.com'), 'the magic link signs in and opens onboarding');
      ok(!(await pg.url()).includes('access_token'), 'the token is cleared from the address bar');
      await pg.fill('#ob-name', 'Nate'); await pg.fill('#ob-pressing', 'Should I take the new role?'); await pg.check('#ob-adult');
      await pg.click('#onboard button[type=submit]');
      // First sign-in: the Design page, with the guide to the framework open over it.
      await pg.waitForSelector('.home .chat');
      await pg.waitForSelector('.dialog.guide');
      ok(/iterative design/.test(await pg.textContent('.dialog.guide h2')), 'first sign-in lands on Design with the framework guide open');
      await pg.screenshot({ path: path.join(SHOTS, 'H2a-guide-desktop.png') });
      for (let i = 0; i < 4; i++) await pg.click('.dialog.guide #guideNext');
      ok(/walk it together/.test(await pg.textContent('.dialog.guide h2')) && (await pg.textContent('#guideNext')) === 'Begin', 'the guide walks five steps, ending with how the coach works');
      await pg.screenshot({ path: path.join(SHOTS, 'H2b-guide-step5.png') });
      await pg.click('#guideNext');
      await pg.waitForSelector('.dialog.guide', { state: 'detached' });
      await pg.waitForFunction(() => !document.getElementById('pending') && document.querySelectorAll('.home .msg.coach').length >= 1, null, { timeout: 15000 });
      ok(await pg.isVisible('.stone[data-area="Money"]') && /Beginning the Exploration/.test(await pg.textContent('.chat-head')), 'the coach opens the Exploration right on the Design page, with areas to choose');
      ok((await pg.textContent('#nav button >> nth=0')) === 'Design' && (await pg.textContent('#nav button >> nth=1')) === 'Journey', 'Design is the first tab, beside Journey');
      await pg.screenshot({ path: path.join(SHOTS, 'H2c-design-begin.png') });
      await pg.click('.protip');
      await pg.waitForSelector('.dialog.guide');
      ok(/iterative design/.test(await pg.textContent('.dialog.guide h2')), 'the pro tip reopens the guide');
      await pg.keyboard.press('Escape');
      await pg.waitForSelector('.dialog.guide', { state: 'detached' });
      await pg.click('.stone[data-area="Money"]');
      await pg.waitForFunction(() => /Exploring Money/.test(document.querySelector('.chat-head').textContent) && !document.getElementById('pending') && document.querySelectorAll('.msg.coach').length >= 1, null, { timeout: 15000 });
      ok(await pg.isVisible('.home .chat') && await pg.isVisible('text=Lens 1 of 7'), 'choosing an area keeps the conversation on the Design page');
      await pg.fill('#msg', 'My dad saw money as security.'); await pg.keyboard.press('Enter');
      await pg.waitForFunction(() => !document.getElementById('pending') && document.querySelectorAll('.msg.coach').length >= 2, null, { timeout: 15000 })
        .catch(async (e) => { console.log('STREAM:', (await pg.textContent('#stream')).slice(0, 400)); throw e; });
      ok(/Take your time/.test(await pg.textContent('.msg.coach >> nth=-1')), 'the coach answers through the server');
      await pg.waitForTimeout(1500); await pg.screenshot({ path: path.join(SHOTS, 'H2-design-desktop.png') });
    } else {
      await pg.waitForSelector('.home .chat');
      await pg.waitForFunction(() => /Exploring Money/.test(document.querySelector('.chat-head').textContent) && document.querySelectorAll('.msg.coach').length >= 2, null, { timeout: 15000 });
      ok(!(await pg.$('.dialog.guide')), 'phone: the same account returns to its conversation on Design, without the guide again');
      await pg.screenshot({ path: path.join(SHOTS, 'H2-design-phone.png'), fullPage: true });
    }
    await pg.reload();
    await pg.waitForSelector('.home .chat');
    ok(true, name + ': still signed in after a reload');
    await pg.click('#nav [data-view=you]');
    await pg.waitForSelector('text=Your account');
    ok(!(await pg.isVisible('text=Personal key')), name + ': no personal key in the hosted app');
    if (name === 'phone') await pg.screenshot({ path: path.join(SHOTS, 'H3-you-phone.png') });
    ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), name + ': no sideways scrolling');
    await pg.click('[data-act=signOut]');
    await pg.waitForSelector('#signinForm');
    ok(true, name + ': signing out returns to the sign-in screen');
    await ctx.close();
  }
  const rows = (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.messages)::int m, (select count(*) from public.parked_problems)::int k`)).rows[0];
  ok(rows.p === 1 && rows.m >= 3 && rows.k === 1, 'everything was saved in the database: profile, conversation, parked problem');
  ok(errors.length === 0, 'no errors in the browser' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  [supaSrv, clSrv, appSrv].forEach((s) => s.close());
  console.log('hosted UI checks passed');
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
