# Agent task board

Agent-level tasks. Human tasks live in the Google Doc "To-Do List" tab.
Status: `todo`, `doing`, `done`, `blocked`. Feature ids match `docs/plan-snapshot.md`.

## Part 2, started Sat 2:10 PM ET (direction from Alex)

The learner is the architect: a diagnostic walk first (with "I don't know"), the palace falls
into ruin where the fact was unknown and is repaired by learning it; categories become rooms;
relationships are drawn between places; a choice of architecture; palaces can be extended, up
to 30 places; past scores and trends. The build that was demo-ready before Part 2 is commit
`34d496c` (roll back to it in Vercel if Part 2 is not stable by late evening).

| Task | Owner | Status | Notes |
|---|---|---|---|
| Contracts: `PalaceSpec` in the layout id (append-only), `ItemLink`, `WalkRecord`, `survey` mode, `SceneView.integrity`, `FeatureDef`, `LocusFeature` | Lead | done | `src/core/types.ts`, `src/layouts/spec.ts`, `src/layouts/kits/types.ts` |
| Bug: scroll bar in the middle of the title screen | Lead | done | The title column scrolled on its own; it now spans the window |
| Bug: statue flickers at its base; ruin and repair mechanic; 32 loci | Engine | doing | `agent/engine-repair` |
| Survey walk, integrity rules, Judge Mode starts in ruins (confirmed by Alex), walk history, Progress view | App | doing | `agent/app-survey` |
| Palace generator and the Gothic library kit | Engine | doing | `agent/engine-generator` |
| Twenty kit-neutral landmarks | Engine | doing | `agent/engine-props` |
| Architect: categories to rooms, links, kit suggestion, 30 items, extension; two showcase fixtures | AI | doing | `agent/ai-rooms-links` |
| Evidence for the diagnostic, rooms and links; facts about Mnemorium and memoryOS | Researcher | doing | `docs/research.md`, new Part 2 section |
| Upload a PDF: its text is read in the browser and becomes the notes | App | doing | `agent/app-pdf`; asked for by Alex at 2:27 PM |
| Compose: choose the architecture and rooms, edit links, extend a palace | App | todo | After the generator and the Architect land |
| Links drawn between places; Zen garden and castle kits (confirmed by Alex) | Engine | todo | After the generator lands |
| QA review 4; pitch, README, Devpost, Doc, media for Part 2 | QA, Scribe | todo | |

## Status at Sat 12:55 PM ET

Everything below is merged to `main` and pushed unless marked running. All three suites
pass on the merged build: `scripts/smoke.mjs` 13 of 13, `scripts/ab-smoke.mjs` 3 of 3,
`scripts/architect-smoke.mjs` (live model path skipped: no key).

| Area | State |
|---|---|
| Full loop: title, compose (drafts survive reload), familiarize, encode, recall (place is the cue; fair typed grading; resume after reload), results, review, Judge Mode, pitch variant | done and covered by tests |
| Saved-data repair and error page | done and covered by tests |
| Ink & Vellum: first glaze, full colour and ink ring on recall, sparse hatching, instancing; Sanguine variant; Theme Lab | done; Lab buttons covered by tests; Sanguine blue against teal judged from few frames |
| Engine: framing, rail safety, results tour, turn-rate cap, adaptive resolution, loading veil | done; motion checked in offline-rendered frames only |
| Architect: server function, cache, offline planner, alternates for every built-in item, five built-in decks | done; live path verified on the deployed site (twelve facts in about 14 s including the self-check; Regenerate about 3 s); thinking off by default |
| Deployment | public at https://memoria-five-kappa.vercel.app; `scripts/live-check.mjs` passes against it |
| ChatOverflow | connected as @alexwin0806; five generic notes posted |
| Comparison test (`?compare`), counterbalanced by list and order | done and covered by tests; never run with people |
| QA reviews 1, 2 and 3 (`docs/qa/`) | done: review 3 judged it safe to demo with precautions (C8 U7 Ch6 A8, no blockers); its three majors are fixed |
| Round five: Judge runs are a sandbox; pitch spot check of three (74 to 79 s); pause on every timed stop; comparison study times in the CSV; archway image moved; images fade out | done; all suites pass on the merged build |
| Capture tool and media (`scripts/capture.mjs`, `docs/media/`) | final re-render running |
| README, Devpost draft, pitch script (two plans), Google Doc | synced to the final numbers |

## Next

| Task | Owner | Status | Notes |
|---|---|---|---|
| Frame-rate check on a real laptop (`?perf`), quality 1 against 2 | Richard | todo | Cannot be measured in the build sandbox |
| Watch the app live on a real GPU | any human | todo | Motion seen only in offline frames |
| Venue comparison test with 3 to 5 people | Eric W., Eric C. | todo | `docs/venue-test.md` |
| Pitch rehearsal and timing decision | everyone | todo | Demo is about 85 of 120 seconds |
| Known leftovers | Engine / App | todo | 640×400 needs a scroll for the scene line; the comparison test still reads a learner's edited copy of the carpal deck; a deck repaired below three facts is kept; a second palace layout does not exist |

## Earlier milestones

Milestones 0 to 2 as first planned are complete or folded into round 2. Remaining ship work:

## Milestone 3: polish and ship (code freeze Sun 3:00 AM ET)

| Task | Owner | Status | Notes |
|---|---|---|---|
| F-15 Built-in A/B mini-test (with vs without palace) | App | todo | |
| Loading state, perf pass, accessibility pass | Engine + App | todo | |
| README with screenshots, Devpost draft, pitch script | Scribe | todo | |
| Offline demo check; final QA | QA | todo | |
