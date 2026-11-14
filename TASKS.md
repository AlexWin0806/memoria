# Agent task board

Agent-level tasks. Human tasks live in the Google Doc "To-Do List" tab.
Status: `todo`, `doing`, `done`, `blocked`. Feature ids match `docs/plan-snapshot.md`.

## Status at Sat 3:40 AM ET

Vertical slice reached: the full loop (title, compose, familiarize, encode, recall, results,
review, Judge Mode) runs on the real 12-locus palace in the Ink & Vellum style. Everything
is merged to `main` and pushed. Smoke cases a, e, f, g pass on the real engine; b and c carry
stale expectations (four fixture decks now) and are being fixed in round 2.

## Round 2 (in progress, three agents)

| Task | Owner | Status | Notes |
|---|---|---|---|
| Due vs new semantics; smoke b/c; Judge timing and `?judge=pitch`; Architect timeouts; modal; small screens | App | doing | |
| Framing with the 380 px panel; rail safety per leg; overview; golden hands; weak loci; loading state; perf numbers | Engine | doing | Owns `src/layouts` too |
| Wash quality; motion stability; inked tokens; paper; `ink-sanguine`; Theme Lab; cost; theme-authoring skill | Art Director | doing | Owns `ImagoToken.tsx` this round |

## After round 2

| Task | Owner | Status | Notes |
|---|---|---|---|
| QA/Judge review 1 (fresh context) | QA | todo | |
| Live Architect test with a real key | Lead | blocked | Needs Alex's Anthropic key |
| Vercel deploy check | Lead | blocked | Needs Alex's Vercel import and the URL |
| ChatOverflow connect | Lead | blocked | Needs Alex's choices and GitHub sign-in |
| F-15 A/B mini-test | App | todo | |
| README with screenshots; Devpost text; pitch timing pass | Scribe | todo | |
| Sync Google Doc tabs with decisions D-10, D-11 and status | Scribe | todo | |

## Earlier milestones

Milestones 0 to 2 as first planned are complete or folded into round 2. Remaining ship work:

## Milestone 3: polish and ship (code freeze Sun 3:00 AM ET)

| Task | Owner | Status | Notes |
|---|---|---|---|
| F-15 Built-in A/B mini-test (with vs without palace) | App | todo | |
| Loading state, perf pass, accessibility pass | Engine + App | todo | |
| README with screenshots, Devpost draft, pitch script | Scribe | todo | |
| Offline demo check; final QA | QA | todo | |
