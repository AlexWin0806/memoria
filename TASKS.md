# Agent task board

Agent-level tasks. Human tasks live in the Google Doc "To-Do List" tab.
Status: `todo`, `doing`, `done`, `blocked`. Feature ids match `docs/plan-snapshot.md`.

## Part 2, started Sat 2:10 PM ET (direction from Alex)

Third batch live at Sat 7:23 PM ET (commit `4bc54eb`): everything in the table below marked live. First wave merged to `main` and deployed at Sat 4:57 PM ET (commit `6e8e54e`). On that build: `smoke.mjs` 15 of 15,
`ab-smoke.mjs` 3 of 3, `pdf-smoke.mjs` 5 of 5, `architect-smoke.mjs` and `palace-invariance.mjs` pass, and
`live-check.mjs` passes against the deployed site (with and without the browser). Not verified: anything on a real
GPU, `drive-walk.mjs` (fails on time budgets under machine load, also on the old build), a quiet-machine pitch timing.

The learner is the architect: a diagnostic walk first (with "I don't know"), the palace falls
into ruin where the fact was unknown and is repaired by learning it; categories become rooms;
relationships are drawn between places; a choice of architecture; palaces can be extended, up
to 30 places; past scores and trends. The build that was demo-ready before Part 2 is commit
`34d496c` (roll back to it in Vercel if Part 2 is not stable by late evening).

| Task | Owner | Status | Notes |
|---|---|---|---|
| Contracts: `PalaceSpec` in the layout id (append-only), `ItemLink`, `WalkRecord`, `survey` mode, `SceneView.integrity`, `FeatureDef`, `LocusFeature` | Lead | done | `src/core/types.ts`, `src/layouts/spec.ts`, `src/layouts/kits/types.ts` |
| Bug: scroll bar in the middle of the title screen | Lead | done | The title column scrolled on its own; it now spans the window |
| Bug: statue flickers at its base; ruin and repair mechanic; 32 loci | Engine | done, live 4:57 PM | Cause: the niche opening and the sill top were coplanar. Flicker itself not seen in the sandbox: check on a real laptop |
| Survey walk, integrity rules, Judge Mode starts in ruins (confirmed by Alex), walk history, Progress view; right answer dealt evenly across the options | App | done, live 4:57 PM | Smoke 15 of 15 on the merged build; pitch run 80 s under load, to be re-timed on a quiet machine |
| Palace generator, Gothic library kit, ring rooms | Engine | done, live 4:57 PM | `scripts/palace-invariance.mjs`: nothing moves when a palace grows |
| Kit-neutral landmarks | Engine | done, live 4:57 PM | 28 of them; gallery at `/?gallery` |
| Architect: categories to rooms, links, facts or process, kit suggestion, 30 items, extension; two showcase decks | AI | done, live 4:57 PM; one fix running | Live: 30 facts in 16 s, a process in 13 s, extension in 9 s. Fix running: a process must not get one room per step |
| Evidence for the diagnostic, rooms and links; facts about Mnemorium and memoryOS | Researcher | doing | `docs/research.md`, new Part 2 section |
| Upload a PDF: its text is read in the browser and becomes the notes | App | done, live 4:57 PM | `scripts/pdf-smoke.mjs` 5 of 5; real lecture PDFs untested |
| Compose: choose the architecture and rooms, links, facts or process, extend a palace, edit a saved palace in place | App | done, live 7:19 PM | `scripts/compose-smoke.mjs` 10 of 11 on the merged build: case b's premise is stale (a never-opened palace is now surveyed whole when extended); being updated. Live Architect through this screen: 6 s to the proposal |
| Links drawn between places | Engine | done, live 6:21 PM | Four kinds told apart in line alone; lanes along the route through the doorways |
| Workshop kit (Alex, 3:00 PM: instead of the castle; it suits processes) | Engine | done, live 6:21 PM | Ten stations, a floor channel through every hall, a mill-house ring room |
| Zen garden kit | Engine | done, live 6:21 PM | Ten places of its own, six court variants; three courts seen in greybox only |
| Process mode: a process deck's walk asks how each step leads on and has the learner reorder the steps (confirmed by Alex); walks for newly added places only; every new deck starts with the survey | App | done, live 7:19 PM | Smoke 18 of 18 on the merged build. A missed link question holds the answer back when it names a place not yet asked |
| PDF reader: a plain list stays a list; a wrapped slide bullet is one line | App | done, live 7:23 PM | `scripts/pdf-smoke.mjs` 6 of 6; real lecture PDFs still untested |
| Exam Mode (no palace, shuffled, either direction; walk back to the places missed), from the team's notes | App | doing | `agent/app-exam` |
| Fact-check of the two showcase decks | Researcher | done | Nothing wrong; nine Spanish glosses made unambiguous; `docs/research.md` section 9 |
| QA review 4 | QA | doing | `docs/qa/review-4.md` |
| Pitch draft 5, README, Devpost, Doc for Part 2 | Scribe | first pass done | Second pass owed: final timings, which features are live, media |
| Media re-render for Part 2; quiet-machine pitch timing; `drive-walk.mjs` on a quiet machine | Lead | todo | After the agents finish |
| From the team's notes, not tonight: drill on commonly confused items; a palace from a returned exam | | roadmap | |
| Parked by Alex (Sat 3:00 PM), keep in mind: an optional "things you know well" field (basketball, cooking) that the Architect draws memory images from, with no named people, characters, teams or titles | AI, App | parked | Not to be built unless Alex asks; roadmap material for the pitch |

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
