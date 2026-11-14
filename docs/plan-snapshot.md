# Plan / Outline (snapshot of the Google Doc "Plan/Outline" tab)

Snapshot taken: Sat Nov 14, 1:00 PM ET (Scribe sync after the site was deployed and the live Architect verified; no human edits found in the tab).
The Google Doc tab is the source of truth; this file exists so changes can be diffed.

## Defaults and decisions in force

- Name: **Memoria**. Main track: **Education**. Special tracks: **Amazon Best Practical AI Innovation**, **ChatOverflow Agent Leaderboard**. (Alex, Sat 2:40 AM)
- Not entering: Rookie, Hardware, Physical AI, CoStar, Arlequin, Capital One, Photon. LangChain deepagents and Peri: undecided, default is skip.
- No image-generation API. Memory images are procedural glyph compositions; AI-drawn images are a stretch (F-19).
- Deploy: Vercel, by importing the GitHub repo (Alex).

## Milestones (Eastern Time)

| When | Milestone |
|---|---|
| Sat 3:30 AM | Harness done, research brief in, three style prototypes sent, MVP list frozen |
| Sat 12:00 PM | Greybox vertical slice: full loop working and deployed. QA/Judge review 1 |
| Sat 7:00 PM | Chosen art direction applied, AI integrated, Judge Mode offline. QA/Judge review 2 |
| Sat 11:00 PM | P0 complete and polished. P1 only if everything is green |
| Sun 3:00 AM | Code freeze. Bug fixes only |
| Sun 3:00 to 6:00 AM | README, Devpost write-up, 2-minute video, pitch script, offline demo check |
| Sun 7:00 AM | Submit on Devpost |
| Sun 8:00 AM | Hard deadline |
| Sun 9:30 AM to 2:30 PM | Judging, 2-minute demos |

Status Sat 4:30 AM: about eight hours ahead of this plan; the remaining risks are the three human steps on the To-Do tab.

## Features

Priority: P0 = MVP, must ship. P1 = stretch, in order, only when P0 is green and deployed. P2 = roadmap, not built.
Status: todo / doing / done / cut. Criterion: C = Creativity, U = Utility, Ch = Charity, A = Avidity.

| ID | Feature | Pri | Status | Owner | Serves | Acceptance criteria |
|---|---|---|---|---|---|---|
| F-01 | Palace layout "Domus" | P0 | done | Engine | U, C | 3 rooms, 12 loci on one fixed route. Every locus differs in silhouette, accent colour and light. Every fifth locus carries a counting marker. |
| F-02 | Camera rail and walk controls | P0 | done | Engine | U, A | Camera glides between loci on a spline, eases, lingers. Right/Space = next, Left = back. Reduced motion replaces the glide with a cross-fade. |
| F-03 | Persistence | P0 | done | App | U | Decks, review state and settings survive a refresh, including mid-walk. localStorage, no account. |
| F-04 | Input | P0 | done (moving an item to a different place is not built) | App | U | Paste a list (one item per line, optional "term - meaning"); paste raw notes and have items extracted; add, edit, delete, reorder by hand. |
| F-05 | Palace Architect (AI) | P0 | done (live path verified on the deployed site Sat 12:55 PM: twelve facts in about 14 s including the self-check; offline planner as fallback) | AI | C, U | For each item: one vivid image (scene sentence, glyphs, motion) tied to the meaning, assigned to a locus, related items grouped by room. Self-checks for vividness and distinctness and revises. Learner can accept, edit or regenerate each image. Key stays server-side. Cached. Works offline with a local fallback. |
| F-06 | Familiarization walk | P0 | done | App, Engine | U | First use of a layout: a guided walk of the empty route that names each locus. Under 40 seconds. Skippable afterwards. |
| F-07 | Encode walk | P0 | done | App, Engine | U, C | At each locus the image appears in-world with term, meaning and scene. Learner-paced. |
| F-08 | Recall walk | P0 | done | App | U | Images hidden. Typed or multiple-choice answer at each locus, then feedback and the image is revealed. Score at the end. The answer is never shown before the learner commits. |
| F-09 | Review scheduling | P0 | done | App | U | Leitner boxes driven by recall results. A "due for review" view. "Review now" walks only the due loci. |
| F-10 | Judge Mode | P0 | done (default about 2 min; pitch variant 74 to 79 s with a spot check of three; runs offline; Pause control; a Judge run is a sandbox and is not added to reviews) | App, AI | C, U, A | One click. Preloaded 8-item list (the eight carpal bones of the wrist). Encode, then recall, then score. About 2 minutes by default; a pitch variant of about 85 seconds spot-checks four of the eight. Runs with the network off. |
| F-11 | Theme system | P0 | done (Ink & Vellum; Sanguine variant) | Art | A, C | One polished theme plus one palette variant. Any layout works with any theme. |
| F-12 | Overlay UI in the art direction | P0 | done | App, Art | A | 2D overlay styled from theme tokens; bespoke self-hosted type pairing; no stock component look. |
| F-13 | Theme Lab | P0 | done (copy, download and reset verified by real clicks in the test suite) | Engine | A | `?lab` panel to live-tweak palette, light, fog and post; exports theme JSON for `src/themes/`. |
| F-16 | Accessibility | P0 | doing (keyboard path, reduced motion, measured contrast, landmarks and headings; no screen-reader test) | App, Engine | Ch | Reduced-motion mode, keyboard-only use end to end, overlay contrast at least 4.5:1, text at least 16 px. |
| F-17 | Loading and performance | P0 | doing (loading screen; adaptive resolution; turn-rate cap; frame rate on a real laptop still unmeasured) | Engine | U, A | 60 fps at 1440×900 on an integrated GPU (checked on a real laptop). Designed loading state. Initial load under about 5 s. |
| F-14 | Development mechanic | P1 | done (first glaze when placed, full colour and an ink ring when recalled) | Engine, App | C | The palace looks unfinished around loci you have not learned and complete around loci you have mastered, driven by the review boxes. |
| F-15 | Built-in A/B mini-test | P1 | done (counterbalanced; not yet run with people) | App | U, Ch | Memorize one list with the palace and one without, then recall both; show the two scores. Used for the venue test. |
| F-18 | Second layout and theme; ambient audio | P1 | todo | Art, Engine | A | |
| F-19 | AI-drawn images for memory tokens | P1 | todo | AI | C | Cached; original imagery only. |
| F-20 | Palace editor | P1 | todo | Engine | U | Click to place or reorder loci in a layout. |
| F-21 | Shareable palace link | P1 | todo | App | U, Ch | Palace encoded in the URL. |
| F-22 | WebXR mode | P1 | todo | Engine | C | |
| R-01 | Your own home as a palace (phone scan, Gaussian splats) | P2 | roadmap | | A | |
| R-02 | Community theme gallery | P2 | roadmap | | A | |
| R-03 | Classroom mode: a teacher builds a palace, students walk it | P2 | roadmap | | Ch | |
| R-04 | Multilingual vocabulary packs | P2 | roadmap | | Ch | |

## Architecture summary

- Vite 8, React 19, TypeScript 6, three.js with React Three Fiber, drei, postprocessing, zustand, leva. WebGL2.
- Static front end on Vercel. One serverless function, `api/architect`, holds the Anthropic key.
- Layout (geometry and the ordered loci), Theme (JSON tokens) and Style (shader code) are separate, so any layout works with any theme.
- A shared "development field" tells every material how well the nearest locus has been learned.
- Everything on the demo path runs from fixtures with the network off.

## Art-direction decision

**Ink & Vellum** (Direction A), picked by Alex on Sat 3:20 AM from three prototypes of the same test room (Ink & Vellum, Nocturne Atrium, Cyanotype Blueprint). Palette variant: Sanguine (red chalk). Cyanotype stays as an experimental third theme. Detail in `docs/art-bible.md`.

## Decisions log

| # | When (ET) | Decision | By |
|---|---|---|---|
| D-01 | Sat 2:40 AM | Name is Memoria | Alex |
| D-02 | Sat 2:40 AM | Tracks: Education, Amazon Practical AI, ChatOverflow | Alex |
| D-03 | Sat 2:35 AM | Engine: React Three Fiber + TypeScript + Vite, as proposed in the brief | Lead |
| D-04 | Sat 2:40 AM | No image-generation API; memory images are procedural glyph compositions | Alex, Lead |
| D-05 | Sat 2:38 AM | TypeScript pinned to 6.0: the lint tooling does not support 7.0 yet | Lead |
| D-06 | Sat 2:42 AM | Layout / Theme / Style split, plus a shared development field | Lead |
| D-07 | Sat 2:40 AM | Deploy on Vercel by importing the GitHub repo | Alex |
| D-08 | Sat 2:50 AM | Judge Mode list: the eight carpal bones (exactly eight, fixed order, real coursework, names mean what the images show). Rejected "most abundant elements in Earth's crust" because the order differs between sources. | Lead |
| D-09 | Sat 2:50 AM | Palace has 12 loci in 3 rooms; Judge Mode uses the first 8 | Lead |
| D-10 | Sat 3:20 AM | Art direction: Ink & Vellum. Variant: Sanguine. Cyanotype kept as experimental | Alex |
| D-11 | Sat 3:25 AM | Architect default model: the current fast Claude model, for latency; overridable by environment variable | AI engineer, Lead |
| D-12 | Sat 4:25 AM | Judge Mode default run is about 2 minutes and the button says so; a pitch variant (`?judge=pitch`) fits a live pitch: 8 places encoded, a spot check of 4, about 70 seconds | Lead |
| D-13 | Sat 4:00 AM | ChatOverflow: CLI installed with Alex's choices (automatic notes, this machine only, GitHub hidden); waiting for Alex's GitHub sign-in | Alex, Lead |
| D-14 | Sat 4:30 AM | Default render quality for the ink style will be the lighter setting until a real laptop frame-rate check says otherwise | Lead |
| D-15 | Sat 5:05 AM | QA review 1 (C7 U6 Ch6 A7): one blocker (draft lost on refresh) and nine majors; fix round started | Lead |
| D-16 | Sat 6:40 AM | QA review 2 (C8 U7 Ch6 A8): no blockers; four majors fixed and covered by tests | Lead |
| D-17 | Sat 7:55 AM | Pitch variant shows each place for 4 s so it can be read; measured 74 to 79 s once the spot check was cut from four places to three; button says 90 seconds. The team may shorten it in `src/flows/timing.ts` after rehearsal | Lead |
| D-18 | Sat 7:50 AM | Comparison test is counterbalanced: two lists (carpal bones, citric acid cycle), each as a palace deck and as a plain list; list and order are swapped between volunteers | Lead |
| D-19 | Sat 7:00 AM | Demo footage and GIFs are rendered offline on a virtual clock (`scripts/capture.mjs`), because the build sandbox cannot show motion in real time | Lead |
| D-20 | Sat 5:50 AM | First correct recall is next due tomorrow; a miss is due again in 10 minutes | Lead |
| D-21 | Sat 9:40 AM | Judge runs are a sandbox (never added to reviews, never change saved decks); pitch spot check cut to three places | Lead |
| D-22 | Sat 12:50 PM | Extended thinking is off by default for the Architect's two calls: it cut a six-fact plan from about 26 s to about 11 s, and the self-check pass still reviews every image; `ARCHITECT_THINKING=adaptive` restores it | Lead |
| D-23 | Sat 12:30 PM | Public demo address is memoria-five-kappa.vercel.app; the first address shared was behind a Vercel login | Alex, Lead |

## Change log

| When (ET) | Change | By |
|---|---|---|
| Sat 2:50 AM | Initial plan written | Lead |
| Sat 3:25 AM | Art direction decided (D-10); F-11 now targets Ink & Vellum plus Sanguine | Lead |
| Sat 3:40 AM | Vertical slice reached, full loop on the real palace, merged to main | Lead |
| Sat 4:30 AM | Round two merged (app fixes, engine and palace polish, ink style, Theme Lab, theme-authoring skill); QA review 1 started | Lead |
| Sat 6:05 AM | Round three merged (QA 1 fixes, comparison test, offline Architect, results tour and recall flourish) | Lead |
| Sat 7:55 AM | Round four merged (QA 2 fixes, motion fixes found in the first footage, counterbalanced comparison test); all suites pass. Sat 9:40 AM: QA review 3 (safe to demo with precautions; C8 U7 Ch6 A8) and round five merged (Judge runs are a sandbox, spot check of three, pause on every timed stop, archway image moved, images fade out); all suites pass again | Lead |
| Sat 12:55 PM | Site deployed and public; live Architect verified and two defects from its first live runs fixed; ChatOverflow connected | Lead |
