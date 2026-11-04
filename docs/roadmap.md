# Life in Design Coach · roadmap

Source: the Lucid diagram "Life in Design Coach" (Inputs → My Life Design → Agentic Connectors → Outputs), plus Nate's clarifications.

## Principles
- The Life in Design Framework is the core. Every other input is a supplement that helps the coach guide, nudge and suggest within the guided process.
- An agent model drives the conversation. The goal is a v1 design, then continual iteration toward greater congruence across Why, How and What.
- Iteration depth: the Why is the deepest and most complex to iterate, the How less so, and the What lightest and most frequent.
- Outputs act as an objective evaluator of congruence: provocative, challenging and guiding.
- Guidance the user accepts becomes a new input to the design. The loop is closed.

## Inputs
1. Guided Prompt (built)
2. Strength and personality tests, entered manually, each with an input shaped to its results (built): CliftonStrengths, VIA Character Strengths, Myers-Briggs / 16Personalities, Enneagram, Big Five (OCEAN), DISC, Working Genius, Kolbe A Index, Holland Code (RIASEC), 5 Love Languages.
3. Knowledge Acquired log (built)
4. Skills Acquired log (built)
5. Journaling (built)
6. Agent Discussion (built)

## Outputs
- **Calendar Prioritization:** reads and writes the calendar. The coach writes recommended time blocks for Whats that align with the How and Why, and reads the calendar for metrics on how well time went to aligned Whats. Persistent misalignment triggers challenge and nudges toward a new iteration, plus objective feedback on what deviating from the design implies.
- **Life Design Iteration (built):** provoke contemplation of the Why; challenge whether the What is accomplishing the Why through the How; suggest Whats from strengths, resources, new learning and skills.
- **Communities of Activity:** first as recommended kinds of groups that fit the design (built), later as groups formed inside the app.

## Notifications
Active nudges, guidance and recommendations, each switchable (built: in-app plus a weekly email).

## Phasing
- **A (done):** tests, journaling, knowledge and skills logs, congruence reviews with the accept / adapt / decline loop, community recommendations, nudges.
- **Design refresh (done):** organic minimalism, wabi-sabi, fluid modernism.
- **Hosted alpha (next):** code in this GitHub repo, hosted on Render at an `onrender.com` address (no domain yet), Supabase free plan for the database and sign-in with per-user access rules, email sign-in links, invite-only sign-up, Claude called from the server with a separate, spend-capped API key.
- **B:** Google sign-in and calendar read/write with alignment metrics. Needs a domain, a privacy policy and Google's OAuth verification (unverified apps are capped at 100 users).
- **Agent:** the coach as an agent with tools over the design record (read, propose, save on approval), shaped by a suite of evaluation conversations that test it against the guide.
- **Second brain and other agents:** read a person's existing second brain through MCP; later, let a person grant their own agents scoped, revocable access to their design.
- **C:** in-app communities.
