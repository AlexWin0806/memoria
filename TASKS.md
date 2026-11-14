# Agent task board

Agent-level tasks. Human tasks live in the Google Doc "To-Do List" tab.
Status: `todo`, `doing`, `done`, `blocked`. Feature ids match `docs/plan-snapshot.md`.

## Status at Sat 5:45 AM ET

Everything below is merged to `main` and pushed unless marked running.

| Area | State |
|---|---|
| Full loop on the real palace (title, compose, familiarize, encode, recall, results, review, Judge Mode, pitch variant) | done; smoke cases pass on greybox |
| Ink & Vellum style: even first glaze, sparse hatching, inked tokens, instancing support, quality 1 default | done; not yet watched in motion or on a real GPU |
| Sanguine variant, Theme Lab (`?lab`), theme-authoring skill | done; Lab buttons not clicked through; Sanguine blue vs teal unverified |
| Engine: framing with the panel, rail safety, overview, loading veil, results tour, recall flourish, phone framing | done; flourish and tour seen as stills only |
| Architect: server function, client, cache, offline planner, fixture alternates, progress callback | done; live path untested (no API key yet) |
| QA review 1 (`docs/qa/review-1.md`) | done: C7 U6 Ch6 A7, 1 blocker, 9 majors |
| App fixes from QA (draft persistence, pitch readability, recall cue, grading, resume, scheduling text, results layout) | running |
| A/B list-versus-palace test (`?compare`) | running |
| README, Devpost draft, pitch script, Google Doc sync | done at 4:40 AM; needs a refresh after this round |

## Next

| Task | Owner | Status | Notes |
|---|---|---|---|
| Merge app fixes and the A/B test; full smoke run | Lead | todo | |
| QA/Judge review 2 (fresh context) | QA | todo | After the merge |
| README GIF of the recall moment; offline-rendered demo footage as a video fallback | Lead | todo | Deterministic frame capture, ffmpeg |
| Live Architect test with a real key | Lead | blocked | Needs Alex: "key ready" |
| Vercel deploy check | Lead | blocked | Needs Alex's import and the URL |
| ChatOverflow sign-in | Lead | blocked | CLI installed; needs Alex's GitHub approval code |
| Frame-rate check on a real laptop (`?perf`), quality 1 vs 2 | Richard | todo | Cannot be measured in the build sandbox |
| Watch one recall answer and one results tour on a real GPU | any human | todo | Seen as stills only |
| Venue comparison test with 3 to 5 people | Eric W., Eric C. | todo | Uses `?compare` once merged |

## Earlier milestones

Milestones 0 to 2 as first planned are complete or folded into round 2. Remaining ship work:

## Milestone 3: polish and ship (code freeze Sun 3:00 AM ET)

| Task | Owner | Status | Notes |
|---|---|---|---|
| F-15 Built-in A/B mini-test (with vs without palace) | App | todo | |
| Loading state, perf pass, accessibility pass | Engine + App | todo | |
| README with screenshots, Devpost draft, pitch script | Scribe | todo | |
| Offline demo check; final QA | QA | todo | |
