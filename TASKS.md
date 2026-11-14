# Agent task board

Agent-level tasks. Human tasks live in the Google Doc "To-Do List" tab.
Status: `todo`, `doing`, `done`, `blocked`. Feature ids match `docs/plan-snapshot.md`.

## Status at Sat 8:00 AM ET

Everything below is merged to `main` and pushed unless marked running. All three suites
pass on the merged build: `scripts/smoke.mjs` 13 of 13, `scripts/ab-smoke.mjs` 3 of 3,
`scripts/architect-smoke.mjs` (live model path skipped: no key).

| Area | State |
|---|---|
| Full loop: title, compose (drafts survive reload), familiarize, encode, recall (place is the cue; fair typed grading; resume after reload), results, review, Judge Mode, pitch variant | done and covered by tests |
| Saved-data repair and error page | done and covered by tests |
| Ink & Vellum: first glaze, full colour and ink ring on recall, sparse hatching, instancing; Sanguine variant; Theme Lab | done; Lab buttons covered by tests; Sanguine blue against teal judged from few frames |
| Engine: framing, rail safety, results tour, turn-rate cap, adaptive resolution, loading veil | done; motion checked in offline-rendered frames only |
| Architect: server function, cache, offline planner, alternates for every built-in item, five built-in decks | done; live path untested |
| Comparison test (`?compare`), counterbalanced by list and order | done and covered by tests; never run with people |
| QA reviews 1 and 2 (`docs/qa/`) | done: review 2 scored C8 U7 Ch6 A8, no blockers |
| Capture tool and media (`scripts/capture.mjs`, `docs/media/`) | first set done; re-render from the final build running |
| README, Devpost draft, pitch script, Google Doc | sync running |

## Next

| Task | Owner | Status | Notes |
|---|---|---|---|
| Commit re-rendered media and synced docs | Lead | todo | When the two jobs finish |
| Live Architect test with a real key | Lead | blocked | Needs Alex: "key ready" |
| Vercel deploy check | Lead | blocked | Needs Alex's import and the URL |
| ChatOverflow sign-in | Lead | blocked | CLI installed; needs a fresh link and Alex's GitHub approval code |
| Save a setup script on the cloud environment (`npm install`) | Lead | blocked | Needs Alex present to approve the prompt |
| Frame-rate check on a real laptop (`?perf`), quality 1 against 2 | Richard | todo | Cannot be measured in the build sandbox |
| Watch the app live on a real GPU | any human | todo | Motion seen only in offline frames |
| Venue comparison test with 3 to 5 people | Eric W., Eric C. | todo | `docs/venue-test.md` |
| Pitch rehearsal and timing decision | everyone | todo | Demo is about 85 of 120 seconds |
| Known leftovers | Engine / App | todo | Image in the archway looms when walked under; images vanish in one frame at the spot-check start; 640×400 needs a scroll for the scene line; Cyanotype style unchecked for instancing; a second palace layout does not exist |

## Earlier milestones

Milestones 0 to 2 as first planned are complete or folded into round 2. Remaining ship work:

## Milestone 3: polish and ship (code freeze Sun 3:00 AM ET)

| Task | Owner | Status | Notes |
|---|---|---|---|
| F-15 Built-in A/B mini-test (with vs without palace) | App | todo | |
| Loading state, perf pass, accessibility pass | Engine + App | todo | |
| README with screenshots, Devpost draft, pitch script | Scribe | todo | |
| Offline demo check; final QA | QA | todo | |
