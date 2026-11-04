// Starts the Life in Design web server. Render runs: node server/index.js
'use strict';
const http = require('http');
const { createApp } = require('./app');
const { createSupabase } = require('./supabase');
const { createClaude } = require('./claude');

const env = process.env;
const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY'].filter((k) => !env[k]);
if (missing.length) console.warn('Missing environment variables: ' + missing.join(', ') + '. Add them in Render → Environment.');

const config = {
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
  coachPerHour: Number(env.COACH_CALLS_PER_HOUR) || 60
};
const app = createApp({
  config,
  supabase: createSupabase({ url: config.supabaseUrl || 'http://invalid', anonKey: config.supabaseAnonKey }),
  ask: createClaude({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', baseUrl: env.ANTHROPIC_BASE_URL || undefined })
});

const port = Number(env.PORT) || 3000;
http.createServer(app).listen(port, '0.0.0.0', () => console.log('Life in Design listening on port ' + port));
