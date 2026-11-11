# Life in Design Coach

A responsive web app that coaches a person through Nate Gardner's Life in Design Framework, with Claude as the coach.

It runs three ways from the same code:

- **Hosted alpha** (current): a Node server on Render, with Supabase for accounts and data. Invite-only, sign-in by emailed link, each person able to see only their own design. Setup: [docs/alpha-setup.md](docs/alpha-setup.md).
- **Google Apps Script** (v1): the Google Sheet as the database, as described below.
- **Preview**: the front end alone, saving to the browser, with Claude answering through claude.ai.

- **Database:** [Life in Design Coach – Database](https://docs.google.com/spreadsheets/d/1wv_mxigQ2TIDVD6A5f_RVVI7IW5m7ZLdEBsMjPSGYYU/edit) (Sheet ID `1wv_mxigQ2TIDVD6A5f_RVVI7IW5m7ZLdEBsMjPSGYYU`)
- **Live app:** Google Apps Script web app (`dist/apps-script/Code.gs` + `dist/apps-script/Index.html`)
- **Preview:** the same front end running in Claude, saving to the browser instead of the Sheet


## Repository layout

| Path | What it is |
|---|---|
| `src/` | Editable source: `shared.js` (the coaching engine), `backend.gs.js` (Apps Script server), `ui.html` (front end), `guide.md` (coach instructions) |
| `server/` | The hosted alpha's web server: sign-in checks, the engine over each person's rows, Claude streaming. No third-party packages. |
| `supabase/` | `migrations/` (applied by Supabase's GitHub integration on every change to `main`), `schema.sql` (the full current schema, generated from `framework.json`) and `config.toml` |
| `render.yaml` | Render Blueprint for the alpha |
| `framework.json` | The 9 elements, 14 belief areas, 7 lenses, 10 tests and the database schema |
| `dist/` | Built files: `web/index.html` and `server/engine.js` for the alpha, `apps-script/Code.gs` and `apps-script/Index.html` for Apps Script, and `preview.html` |
| `test/` | Backend simulation and browser walkthroughs |
| `build_sheet.py` | Builds a fresh copy of the Google Sheet database |
| `docs/alpha-setup.md` | Step-by-step setup for Supabase and Render |
| `docs/roadmap.md` | Decisions and what comes next |

Run `npm run build` after editing anything in `src/` or `framework.json` (it also regenerates `supabase/schema.sql`), and `npm test` before committing. `npm run test:ui` drives the hosted app in a browser and needs Playwright.

## Apps Script version: go live (about 10 minutes)

1. Open the database Sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with `dist/apps-script/Code.gs`. The Sheet ID is already filled in.
3. Click **＋ → HTML**, name it `Index` (exactly), and paste `dist/apps-script/Index.html`.
4. **Project Settings** (gear icon) → **Script properties** → add `ANTHROPIC_API_KEY` with a key from console.anthropic.com. Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
5. Back in the editor, pick `setup` in the function menu → **Run** → approve the permissions. It checks every tab and adds any missing columns. Run `testCoach` to confirm Claude answers.
6. **Deploy → New deployment →** type **Web app** · Execute as **Me** · Who has access **Anyone** (or *Anyone with a Google account*) → **Deploy**. Open the URL.

To ship a change later: paste the new files, run `setup` again (it adds any new tabs and columns without touching existing data), then **Deploy → Manage deployments → ✎ → Version: New version**. The URL stays the same.

**Upgrading from v1 to Phase A:** paste both files, run `setup` once. It adds the five new tabs and the `Prefs` column, and schedules the weekly nudge email (Monday 7am, your script's time zone). Google will ask you to approve two new permissions: sending email and running on a schedule.

## What v1 does

| Framework requirement | In the app |
|---|---|
| Onboarding: "Consider yourself an iterative design," what brought you, what you hope changes | Welcome screen; answers saved to **Users** and given to the coach. First sign-in opens a five-step guide to the framework and the coach's process; a *Pro tip* note on the Design page reopens it |
| The coach front and center | **Design**, the first tab and the landing page after every sign-in, holds the conversation that matters now: the beginning of the Exploration (premise, then an area to choose), the area in progress, the next element, or a check-in once all nine are drafted |
| Adults 18+ only | Age confirmation; under-18 gets a kind message and 988, no account |
| Entering through the What | Optional "pressing problem" on onboarding → **ParkedProblems**; coach holds the line until the design reaches the What (immediately, for someone who begins there) |
| Core Beliefs Exploration: 14 areas + your own, 7 lenses, one at a time | Area grid → guided chat per area. Replies are captured under the current lens; *Next lens* / *Skip this lens* advance; tender-area and family-shape care built into the coach context |
| Close each area with a choice, saved only with approval | *Close this area* → coach proposes from your words → you edit → **ChosenBeliefs** |
| Why → How → What hierarchy, with open ways in | After the guide, the person chooses where to begin: the What and their Inputs, the How, or the Core Beliefs Exploration. Any element can be designed at any time; the pyramid keeps the hierarchy, the app suggests a next step from the chosen way in, and the coach treats work above an unfinished foundation as provisional and guides toward the Why |
| Capture with consent, keep their voice | *Capture a draft* → coach drafts from your words (or says there isn't enough yet) → you edit → save as Draft or Approved |
| Version, don't overwrite | Every save bumps the version in **DesignRecord** and appends to **ElementHistory** with a one-line change note |
| Session shape: reconnect, focus, explore, capture, commit | Coach reconnects after 8+ hours away; *End session* asks for one small step → **Commitments** |
| Alignment check, living with the design, remodel | Unlock once all nine have drafts; each has its own coach focus |
| Present the design on request | *Record*: Why / How / What with drafts and gaps marked, plus history; *Belief map* shows every area through every lens |
| Voice and safety | Your full instructions are the coach's system prompt (server-side only, so the voice note never reaches the browser); crisis line in the footer |

## Phase A: inputs, iteration and nudges

The framework stays at the core; these are supplements the coach draws on to guide, nudge and suggest.

| Roadmap item | In the app |
|---|---|
| **Strength & personality tests** (manual entry) | *Inputs → Strengths & personality*: 10 tests, each with an input shaped to its results. CliftonStrengths (rank from 34, grouped by domain) · VIA (rank from 24, by virtue) · Myers-Briggs/16Personalities (4 pairs, optional %, -A/-T) · Enneagram (type, wing, instinct, tritype) · Big Five (5 percentiles) · DISC (primary, secondary, scores) · Working Genius (sort 6 into 2/2/2) · Kolbe A (4 modes, 1–10) · Holland Code (pick 3 in order) · 5 Love Languages (5 scores). Each also stores date taken and notes; a readable summary is generated for the coach. Results only; no test questions are reproduced. |
| **Journaling** | *Inputs → Journal*: free entries, optional prompts (drawn from open Why questions, the current element, and general reflection prompts). Each entry is shared with the coach or private; delete erases the text. |
| **Knowledge & skills acquired** | *Inputs → Learning & skills*: log knowledge or skills as acquired or in progress. Feeds Resources. |
| **Goals** | *Inputs → Goals*, at four horizons, each shaped to its distance: **Short-term** (30–90 days) as a SMART goal, with the element it serves; **Mid-term** (90–360 days) as an objective with up to five key results and a progress slider each; **Long-term** (1–5 years) as a vivid written picture plus a list of specific circumstances true then; **Life-long** as a guided reflection that first settles the person into an imagined place, then asks who they hope to have become. Every goal also asks what is in the way and what they'll do, and on completion records the date and what it taught them. Stored in **Goals**; the coach brings them into Vision, Purpose, Strategy and Key Activities. |
| **Life experiences** | *Inputs → Life experiences*: a ledger of experiences to live (kind, when, why it calls), with obstacles and plan, moving to *Lived* with a date and what it taught. Stored in **LifeExperiences**. |
| **Life Design Iteration** | *Iterate* opens once all nine elements have a first draft (the v1 design). A **congruence review** traces each Key Activity, Method and Resource to the How and Why (traced / weak / untraced, plus a score), names foundation with nothing built on it, and offers guidance on a depth gradient: Why ≤ 1 contemplation question, How ≤ 2 challenges, What ≤ 3 suggestions. *Talk it through* opens a coaching conversation in the evaluator role. |
| **Guidance becomes input** | Each card can be accepted, adapted into the person's own words, or declined with a reason. Accepting a How/What card opens that element with the guidance as a new input to work in (saved only when they approve a new version); a Why question opens the journal with that prompt; a learning card is added to the learning plan. Accepted and declined guidance (with reasons) feed every later conversation and review. |
| **Communities of Activity** | Review cards of kind *community*: a type of group that fits the design plus a search phrase (e.g. "crossfit gym near me"). Saved ones are listed under *Communities to look for*. |
| **Notifications** | Nudges on the Journey (guidance waiting, review due every 14 days, a quarterly look at the Why, journaling after 7 quiet days, stale commitments, adding strengths results). Each type can be turned off, all of them can be, and a weekly email (when there's something to say) can be turned off separately under *You*. |

## Look and feel

The interface aims to feel like a deep breath: organic minimalism, wabi-sabi and fluid modernism.

- **Palettes.** Mist & Stone sets the ground (linen `#F5F2EB`, pebble `#D4CDC3`, charcoal slate `#2C302E` text, sage `#8A9A86` accent). Forest Floor colors what you act on (moss `#525B44` buttons, raw sand and driftwood accents). Horizon is the sky: alabaster, foggy blue-gray, warm dusk and slate blue drift slowly behind everything. A night palette mirrors it for dark mode.
- **The layers as a cairn.** Why is stone (slate blue), How is wood (driftwood), What is leaf (sage). The pyramid is drawn as a cairn of three stones, built from the ground up.
- **Type.** Fraunces (soft, slightly imperfect serif) for headings, Nunito Sans for reading, Caveat for hand-written notes such as tier labels and prompts.
- **Texture and shape.** A faint paper grain, pebble-shaped cards with uneven corners, hand-drawn wavy dividers, shadows cast as if by sunlight from the upper left.
- **Motion.** The fog drifts over minutes and follows the hour (dawn, day, dusk, night). Saving a reflection, a belief, a draft, a commitment or accepting guidance sends a ripple from where you tapped, brightens the fog and turns it a little; the turn is remembered on that device. Buttons and cards give with a soft spring instead of snapping. Everything holds still for people who set "reduce motion".

## Announcing an update

When a release adds something people should know about, add an entry at the end of [`src/releases.json`](src/releases.json) in the same pull request:

```json
{
  "id": "2026-12-01",
  "since": "2026-12-01T18:00:00Z",
  "title": "A short, warm headline",
  "intro": "One or two sentences.",
  "items": [
    { "key": "unique-key", "title": "What it is", "where": "Inputs → Goals", "body": "What it does for them.", "view": "inputs", "tab": "goals" }
  ]
}
```

- `id` must be later than the one before it; `since` is roughly when it goes live. Only people who joined before `since` are told about it; anyone newer meets it as part of the app.
- Each item names where it lives: `view` (a nav tab: `home`, `journey`, `design`, `inputs`, `iterate`, `you`), plus an Inputs `tab` or a `spot` on the page if it's more specific.
- **What people see:** opening the app in a new visit (a new tab, or after signing in) shows a *What's new* window with a "Give it a try" for each item. If the update arrived during a visit, the next refresh shows a quiet note in the top left instead. A small *new* mark sits above each tab where something changed, and on the sub-tab or card inside, until the person steps into it. *You → What's new* reopens the window.
- Visits and the seen window are kept in the person's settings, so there is no database change.

## How it works

```
Browser (Index.html) ──google.script.run.api(action, args)──▶ Code.gs
                                                           ├─ LID engine: rules, versioning, lens state, coach context
                                                           ├─ Sheet driver: reads/writes tabs by header name
                                                           └─ Claude Messages API (guide cached as the system prompt)
```

The engine (`src/shared.js`) is one piece of code shared by the backend and the preview, so the rules can't drift apart. The coach gets: your full guide (cached), the person's design record, chosen beliefs, parked problems, open commitments, and a focus block for the current element or lens, plus the last 40 messages of that conversation.

## Data model

| Tab | One row per |
|---|---|
| Users | person (name, stage, current focus, onboarding answers, plain-language preference) |
| DesignRecord | person × element: current statement, Draft/Approved, version |
| ElementHistory | saved version of an element, with change note |
| BeliefExploration | person × area × lens: their words, LensStatus (Open / Explored / Skipped) |
| ChosenBeliefs | belief chosen to close an area |
| ParkedProblems | pressing What problem (Parked / Revisited / Resolved) |
| Commitments | small step ending a session (Open / Done / Let go) |
| Sessions | visit |
| Messages | coaching turn, by context (`explore:Money`, `element:Vision`, `alignment`, …) |
| Assessments | person × test: results (JSON), readable summary, date taken, notes |
| Journal | entry: prompt, text, shared with coach or private |
| Growth | knowledge or skill, acquired or planned |
| Reviews | congruence review: summary, trace (JSON), traced / total |
| Recommendations | guidance card: layer, kind, action, status (New / Accepted / Declined), adapted text or reason |
| Users.Prefs | notification settings (JSON) |
| Ref_* | the framework's elements, areas and lenses (reference only) |

## Known limits of v1 (candidates for v2)

- **Identity:** each person gets a private personal key stored in their browser (shown under *You* to move devices). Anyone holding a key can open that design. v2: Google sign-in or an emailed sign-in link.
- **Scale:** each request reads whole tabs. Comfortable for a pilot of dozens to a few hundred people; beyond that, move Messages to its own store or a database.
- **Replies arrive whole** in the Apps Script version (no word-by-word streaming); the preview streams.
- **Ref tabs are documentation:** the app reads the framework from code. v2 could read them so you can tune wording in the Sheet.
- **No AI session summaries yet;** a session's summary is its commitment.
- **Review length:** a congruence review asks Claude for a structured result and can take 30–60 seconds. Apps Script allows it, but if reviews start timing out, switch `ANTHROPIC_MODEL` to a faster model.
- **Email nudges** are sent from the Google account that owns the script, within Google's daily email quota (100/day on a personal account).
- **Journals live in your Sheet.** As the Sheet's owner you can read every entry, including ones marked private to the coach. Say so in the app's privacy terms before inviting others.
- **Next: Phase B** (Google sign-in, calendar read/write with alignment metrics) will likely move hosting off Apps Script.

## Source & build

`src/` holds the editable source: `shared.js` (engine), `backend.gs.js` (Apps Script), `ui.html` (front end), `guide.md` (coach instructions). `framework.json` defines elements, areas, lenses and the Sheet schema.

```
npm run build                # everything in dist/, plus supabase/schema.sql
npm run db:migration -- name # record a schema change as a new Supabase migration
npm test                     # migrations current, engine (60 checks), database rules in Postgres (15), hosted server end to end (25)
npm run test:ui              # hosted app in a browser with the real Supabase sign-in library
node test/gas_sim.js         # full journey + Phase A against a mock Sheet and fake Claude (60 checks)
python3 test/ui_smoke.py     # browser walkthrough at desktop and phone width
python3 test/ui_phaseA.py    # Phase A walkthrough: tests, journal, learning, review, accept/adapt/decline, notifications
LID_FONT_CSS=path/to/fonts.css python3 test/ui_look.py   # screenshots of key views, light desktop and dark phone
```
