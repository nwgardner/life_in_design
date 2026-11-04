# Hosted alpha setup

The alpha runs on three free accounts: **GitHub** (this repo), **Supabase** (database and sign-in) and **Render** (the web server). Claude is called from the server with your own Anthropic API key. Allow about 30 minutes the first time.

Nothing secret ever goes in this repo. Keys live in Render's settings.

## 1. Set up the database in Supabase

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and press **Run**. It creates the tables, turns on row-level security with an "only your own rows" rule on every table, adds the invite list, and creates the function the server uses to load a person's design. It's safe to run again after an update.
3. Invite yourself first. In a new query, run:
   ```sql
   insert into public.invites (email) values ('your-email@example.com');
   ```
   Add each tester the same way. Anyone not on this list is refused at sign-up.

## 2. Configure sign-in in Supabase

1. **Authentication → Sign In / Providers → Email:** make sure Email is enabled. The app signs people in with emailed links, so no passwords are involved.
2. **Authentication → URL Configuration:** after step 4 below, set **Site URL** to your Render address (for example `https://life-in-design.onrender.com`) and add the same address under **Redirect URLs**. Sign-in links only return to addresses listed here.
3. **Email sender.** Supabase's built-in email only sends to members of your Supabase team, and only 2 per hour. That's enough for you to test alone. Before you invite testers, add a custom email sender under **Authentication → Emails → SMTP Settings**. Without a domain of your own, the simplest options are:
   - **Brevo** (free plan): verify a single sender email address, then use Brevo's SMTP host, port and key.
   - **Gmail**: with 2-step verification on, create an app password and use `smtp.gmail.com`, port 587, your address, and the app password. Fine for a handful of testers.

   Once you have a domain, a sender like Resend or Postmark on that domain is more reliable.
4. Optional: **Authentication → Emails → Templates → Magic Link** lets you change the email's wording, for example to "Your sign-in link for Life in Design".

## 3. Get an Anthropic API key with a spending limit

In the Anthropic Console, create a key just for this app, and set a monthly spend limit for the workspace it belongs to. The server also caps each person at 60 coaching calls an hour (`COACH_CALLS_PER_HOUR`).

## 4. Deploy on Render

1. Sign in to Render with GitHub and allow it to access `nwgardner/life_in_design`.
2. **New → Blueprint**, pick this repo. Render reads [`render.yaml`](../render.yaml) and asks for three values:
   - `SUPABASE_URL`: the Project URL, like `https://abcd1234.supabase.co`. The **Connect** button at the top of your Supabase project shows it.
   - `SUPABASE_ANON_KEY`: the **publishable** key (`sb_publishable_…`), shown in the same Connect dialog and under **Project Settings → API Keys**. A legacy `anon` key also works, but Supabase is retiring those.
   - `ANTHROPIC_API_KEY`: the key from step 3.
3. Deploy. When it's live, open the `onrender.com` address, then go back and finish step 2.2 with that address.
4. Every merge to `main` redeploys automatically.

Never use Supabase's **secret** or `service_role` key here. The app doesn't need it: every request runs as the signed-in person, under the row-level security rules.

## 5. Try it

Open your Render address, enter your invited email, open the link from your inbox, and you're in. On the free plan Render sleeps after 15 minutes without visitors; the next visit takes about a minute to wake. Upgrade the Render service to a paid instance before real testers arrive if that matters.

## What's in this alpha and what isn't

- **In:** everything in the app today (the Exploration, the nine elements, inputs, iteration, nudges) with real accounts, data in Postgres, and each person able to see only their own design.
- **Not yet:** the weekly email (it needs a mail sender wired to the server), Google sign-in and the calendar (they need a domain and Google's app verification), and deleting your account from inside the app (an admin can delete a user in Supabase → Authentication, which removes all their data).

## When something goes wrong

| What you see | Likely cause |
|---|---|
| "This app isn't connected to its database yet" | `SUPABASE_URL` or `SUPABASE_ANON_KEY` missing in Render |
| "invite-only during the alpha" | The email isn't in `public.invites` |
| "Sign-in emails can't be sent to this address yet" | Supabase's built-in email: add a custom SMTP sender |
| "Too many sign-in emails just now" | The built-in sender's 2-per-hour limit |
| The link opens the app but you're still signed out | The Render address isn't in Supabase's Redirect URLs |
| "The coach could not sign in to Claude" | `ANTHROPIC_API_KEY` is wrong or missing |
| "Loading your design failed (404)" | `supabase/schema.sql` hasn't been run |
