# Plan / Outline (snapshot of the Google Doc "Plan/Outline" tab)

Snapshot taken: Sat Nov 14, 9:30 PM ET (Scribe sync after QA review 4; no human edits found in this tab, or anywhere in the document, since the 5:45 PM sync: the tab was identical to the 5:45 PM snapshot before this sync wrote to it, and the document's last change before it was the end of that sync, at 6:04 PM).
The Google Doc tab is the source of truth; this file exists so changes can be diffed.
Other tabs at this sync, not mirrored here: the team's three tabs ("feature/bugs", "Part 3", "Part 4") were read and not written, and no change was found in them (same evidence as above). The Project Summary tab was brought to the 9:30 PM state (what is live, the batch under test, the QA review 4 verdict and scores, the measured figures, decisions since 5:45 PM, roadmap). The To-Do List tab gained four items at the top of its "Part 2 (added Sat 2:45 PM)" section (the offline check on the demo laptop, Judge Mode on a real GPU, timing Plan A with a stopwatch, real course PDFs) and a dated note on three older items.

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

## Part 2: the learner is the architect (from Sat 2:00 PM)

Alex set this direction at about 2:00 PM ET on Sat Nov 14 and confirmed the open decisions at 2:27 PM. His own text is in the Part 2 tab. His reason: other memory-palace apps exist (he names Mnemorium and memoryOS), so Memoria has to differ. The learner becomes the architect: a first walk with no preparation finds what the learner does not know, those places fall into ruin, and learning each fact repairs its place. The core idea, as Alex put it, is to give the learner more options.

Status Sat 5:45 PM: the first wave of Part 2 has been on the deployed site since 4:57 PM ET (commit `6e8e54e`). Each row of the scope table says whether the item is live, merged (on the working branch, going out with the next tested batch this evening) or building. Not verified by anyone: anything on a real GPU (frame rate, the collapse and rebuild in motion, the statue fix in motion), any result with real people, real lecture PDFs, screen readers, and a quiet-machine timing of the pitch run. The Features table further down describes the build from before Part 2 and has not been changed.

Status Sat 9:30 PM: nearly all of Part 2 is on the deployed site, and the scope table below is brought to that state. A last batch of fixes from QA review 4 was under test at 9:30 PM and is expected live tonight; the table marks those items "in tonight's batch", and each is to be confirmed on the live site (the Devpost checklist lists them). QA review 4 (Sat 7:23 to 8:20 PM): safe to demo with precautions, no blocker; Creativity 8, Utility 8, Charity 6, Avidity 8. Decisions since 5:45 PM are D-34 to D-38 in the Decisions log. Still not verified by anyone: anything on a real GPU (frame rate, the collapse and rebuild in motion), any result with real people, real lecture PDFs (only PDFs we generated), screen readers, the offline copy in any browser but Chromium, and a timing of the pitch run on a quiet machine with a person answering.

### Part 2 scope

Scope as set by the Lead from Alex's direction. Status at Sat 9:30 PM is one of: live (on the deployed site), in tonight's batch (under test at 9:30 PM, expected live tonight, to be confirmed on the live site), fixed, parked, roadmap, not planned.

| Item | Status | Scope |
|---|---|---|
| Survey (the diagnostic) | live since Sat 4:57 PM; the self-advance and "standing" are in tonight's batch | The first use of a deck is a walk of the route with one question per place and an "I don't know" button. The right answer is not shown; the place stands or falls as you answer. Each place answered wrong or "I don't know" collapses into ruin as you watch. A faint outline of the whole object stays, so the place is still a landmark. The study walk follows in the same session and shows the survey answer beside the right one. Sat 9:30 PM: in tonight's batch the survey moves on by itself after each answer (one press per place), and a place answered right is "standing", not "restored", until it is recalled after study. |
| Repair | live since Sat 4:57 PM; the self-mark rule is in tonight's batch | Three states per place: in ruins (unknown), under repair with scaffolding (studied), restored (recalled correctly). A later miss damages it again. Colour still follows review progress. As built: a later miss "needs another repair"; a legend explains the states; no points, badges or streaks. Sat 9:30 PM: in tonight's batch a self-marked answer ("I was right") leaves its place under repair and its review in the first box; only a real recall restores a place. The legend now also names "standing" and "needs another repair". |
| Judge Mode | live since Sat 4:57 PM. Decided by Alex (option a). The line that explains the ruins is in tonight's batch | The palace starts in ruins and each place rebuilds as the judge studies it. No added time. Pitch timing to be re-measured. Re-measured: 80 s for the pitch variant on a heavily loaded test machine (74 to 79 s before Part 2). A quiet-machine timing is still owed. Sat 9:30 PM: the reviewer measured 69.9 s for the pitch variant (study walk 47.2 s from the button, 3 s on the screen between, spot check 19.6 s with each answer given within 2 s; 65.7 s offline with keys). Earlier runs under heavier load gave 80 to 94 s. A timing on a quiet machine with a person answering is still owed. In tonight's batch the Judge screens say what the ruins mean: "In ruins: you have not learned these yet. Each place is rebuilt as you study it." |
| Generated palaces | live: Gothic library since Sat 4:57 PM, Zen garden and Workshop since Sat 6:21 PM. The Workshop replaces the castle (Alex, Sat 3:00 PM: it suits processes). Styles decided by Alex (option a). Seeds are in tonight's batch | One room per category, up to 5 places a room, up to 6 rooms, 30 places. The category name is inscribed over each doorway. The handcrafted Roman house stays for the demo and for existing decks. As built: 28 landmarks belong to no style and each style adds its own, so 30 places are 30 different objects. A script checks that nothing moves when a palace grows (63 palaces, 54 extensions). Sat 9:30 PM: in tonight's batch every new palace is furnished from its own seed, so two palaces in one style have the same architecture and the objects in a different order (measured: about 6% of places hold the same object across two seeds; built-in decks are unchanged). The "nothing moves" check now covers 434 palaces and 84 extensions. |
| Extending a palace | live since Sat 7:19 PM ("Add to this palace") | Append-only. New facts fill free spots in their category's room. Overflow opens a new room at the end ("Past II"). Nothing already placed ever moves. Sat 9:30 PM: only the new places are surveyed and studied. On the live site the Architect added two facts in 7 to 9 s, in single runs. |
| Relationships | live since Sat 6:21 PM (links drawn on the floor) | The Architect extracts links between facts (becomes, needs, blocks, mirrors) only where the notes support them. The engine draws them between places. A cycle gets a round room. Sat 9:30 PM: four kinds of link, told apart by the line alone. In tonight's batch the cycle deck's inhibition link is stated as "Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate." |
| Score history | live since Sat 4:57 PM | Every survey, recall and review walk is saved. A Progress view shows the trend, with the survey as the baseline, and the weakest places. Sat 9:30 PM: exams are recorded here too, in the table and off the chart's line. |
| PDF upload | live since Sat 4:57 PM; lists and slide bullets since Sat 7:23 PM; footers and table rows in tonight's batch; tested only on PDFs we generated | The text is read in the browser (PDF.js, loaded only when used). Headings become rooms. Long PDFs let the learner choose pages. New dependency `pdfjs-dist`, logged in `CREDITS.md`. As built: headings are marked in the notes; for a long PDF the learner chooses the pages that fit the Architect's 12,000-character limit; scans, locked and damaged files are refused in words. Sat 9:30 PM: a plain list stays a list and a wrapped slide bullet is one line (live). In tonight's batch a slide footer that carries a page number is left out and a table row is one fact. |
| Showcase decks | live; fact-checked, nothing wrong; the gloss corrections are live | One Spanish verb in three tense rooms. The citric acid cycle as a ring with links. As built: "Comer: one verb, three tenses" and "The citric acid cycle, as a cycle". The cycle deck moves to the Workshop with the next batch. Sat 9:30 PM: the cycle deck stands in the Workshop. |
| Bug: scroll bar in the middle of the screen | fixed and live | The title column now spans the window, so the bar is at the edge. |
| Bug: the statue flickers at its base | fixed and live; confirmed in stills, not in motion | Cause: the niche opening and the sill top were coplanar. To be checked in motion on a real laptop. |
| Compose screen | live since Sat 7:19 PM | Choose the style of the palace, see its rooms and links, choose facts or process, and extend a palace ("Add to this palace"). As built: choose the architecture or let the Architect choose, proposals by room, facts or process, "How these connect" for the links, save. "Edit" changes a saved palace in place. In tonight's batch: fixes to the offline planner (a "term - meaning" line is one fact; "label: a -> b -> c" is a chain), and room names are no longer cut in the middle of a phrase. |
| Process mode | live since Sat 7:19 PM. Confirmed by Alex. The reworded questions are in tonight's batch | After each place of a process deck the learner is asked what the step becomes, then puts the steps in order. Scored apart from the places. Sat 9:30 PM: in tonight's batch the questions ask about the transformation ("What happens to citrate next?": rearranged) and never show the next place's answer. On the live site the Architect recognised a six-step process and laid it out as stations in the Workshop in 11 to 13 s, in single runs. |
| Bug: the right answer was often the fourth option | fixed and live | The right answer is now dealt evenly across the options. |
| "Things you know well" | parked by Alex (Sat 3:00 PM) | An optional field (basketball, cooking) that the Architect draws memory images from, with no named people, characters, teams or titles. Not to be built unless Alex asks. Roadmap material for the pitch. |
| Other learning environments | roadmap | From the Part 3 tab: a systems garden where changing one variable shows its consequences, a decision labyrinth, a comparison gallery, a timeline, a simulation, a proof workshop. Also roadmap: your own home as the palace, and reading scanned PDFs. Sat 9:30 PM, also roadmap, from the feature/bugs tab: a drill on commonly confused items, and a palace from a returned exam. |
| Worlds from existing franchises | not planned | Copyrighted characters and settings are out (the team's own rule). |
| Exam Mode | live (built Sat evening, from the team's notes in the feature/bugs tab) | A quiz on a plain sheet with the palace hidden and the order shuffled, in either direction (term to meaning or meaning to term). Afterwards a walk back to exactly the places missed. It is recorded in Progress and changes no review schedule. |
| Edit a saved palace | live (from the team's notes in the feature/bugs tab) | In place: the palace's name, a room's name, a term, a meaning, an image. Nothing moves. Changing a fact sends its place back for repair; the facts not touched keep their progress. |
| Offline copy | in tonight's batch; tested in headless Chromium only | A service worker: after one visit online, a reload with the network off still opens the app, and Judge Mode runs. `/?nosw` removes it. Added after QA review 4, where a reload with the network off was the browser's error page. |
| QA review 4 | done Sat 8:20 PM | Safe to demo with precautions, no blocker. Creativity 8, Utility 8, Charity 6, Avidity 8. Twelve major issues: nine addressed in tonight's batch, three in the pitch, the README and the Devpost draft (corrected Sat 9:30 PM). |
| Drill on commonly confused items; a palace from a returned exam | roadmap | From the feature/bugs tab. Not tonight. |

### Part 2 milestones (Eastern Time)

These are added to the Milestones table above; nothing there is replaced. Submission (Sun 7:00 AM), the hard deadline (Sun 8:00 AM) and judging are unchanged.

| When | Milestone |
|---|---|
| Sat 5:00 PM | First pieces merged: repair mechanic, survey, generator, Architect (done: live at 4:57 PM) |
| Sat 8:00 PM | Compose with styles, rooms, links and extension. Zen garden and castle (Sat 5:45 PM: the Zen garden is merged; the Workshop replaces the castle and is merged; Compose is being built) (Sat 9:30 PM: done. Links, the Zen garden and the Workshop have been live since 6:21 PM; Compose, extension and process mode since 7:19 PM.) |
| Sat 10:00 PM | QA review 4 (done early, Sat 7:23 to 8:20 PM: safe to demo with precautions, no blocker; Creativity 8, Utility 8, Charity 6, Avidity 8) |
| Sat 11:00 PM | Go or no-go on Part 2 for the demo |
| Sun 12:00 to 3:00 AM | Pitch, README, Devpost and media updated (Sat 9:30 PM: pitch draft 6, the README and the Devpost draft are brought up to date; the media are re-rendered after the freeze) |
| Sun 3:00 AM | Code freeze |

### Fallback

The build that was demo-ready before Part 2 is commit `34d496c`. If Part 2 is not stable by about 11:00 PM ET on Saturday, the demo uses that build. In Vercel: open Deployments, pick the deployment of commit `34d496c`, and choose "Promote to Production".

### Research and claims

A research check is running on what we may claim about pretesting, diagnostics, spatial organization and the two competitors. Nothing about Part 2 goes into the README, the Devpost text, the pitch or the UI copy until it is in `docs/research.md`. Those documents are updated when the features are merged, not before. Sat 5:45 PM: the check is in (`docs/research.md`, sections 8 and 9). Section 8.4 lists the sentences we may say and 8.5 the ones we must not. The pitch (draft 5), the README and the Devpost draft have been rewritten from them and wait for the Lead to merge them. Sat 9:30 PM: after QA review 4 the three documents no longer say "nothing is revealed" of the survey. The place stands or falls as you answer; what is not shown is the right answer. The pitch is draft 6, with Plan A cut to fit two minutes.

### Also in the Part 2 tab, not in the scope above

Recorded here so they are not lost. Passed to the Lead at 2:45 PM for a decision. (The team has since renamed that tab "feature/bugs".)

- A third bug report: vary which option holds the correct answer. In the Mohs hardness deck it was often the fourth. (Fixed and live: the right answer is now dealt evenly across the options.)
- "Make sure that each term has a good associated visual."
- Different kinds of environment for memorizing terms and for learning processes. The Part 3 and Part 4 tabs hold longer proposals on this: an environment chosen by the kind of knowledge, and worlds the learner already knows. (Sat 5:45 PM: the Workshop style and process mode cover the process case; the other environments are roadmap.)
- Marked "do not worry about these right now": more camera modes, and combining sets.

Added to that tab by a teammate after the 2:45 PM sync (last edit Sat 3:04 PM). Not in the scope above. Passed to the Lead at 5:45 PM for a decision.

- Edit saved palaces: rename a saved palace and edit an item's term, definition or mnemonic in place, keeping item IDs, locations, links and the review progress of untouched items. (Sat 9:30 PM: built and live, as "Edit".)
- Choose recall direction: for term and definition pairs, Term to Definition or Definition to Term, in typed and multiple-choice modes; recall by place stays the default and for ordered lists. (Sat 9:30 PM: the direction can be chosen in Exam Mode; the recall and review walks still ask by place.)
- Exam Mode: a quiz with the palace, the images and the route order hidden; afterwards each missed item links back to its place for review. (Sat 9:30 PM: built and live.)
- Practice commonly confused items: when a learner repeatedly gives one item's answer for another, a short side-by-side drill on the difference. (Sat 9:30 PM: roadmap, not tonight.)
- Build a palace from a returned exam: paste missed questions with the instructor's corrections; they become a short palace walk with the feedback attached to each item. (Sat 9:30 PM: roadmap, not tonight.)

## Features

This list describes the build from before Part 2 (commit `34d496c`). Part 2 items are in the Part 2 section above.

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
| D-24 | Sat 2:00 PM | Part 2: the learner is the architect. A survey walk first, ruin and repair, generated palaces with a room per category, links between places, score history, extension up to 30 places, PDF upload. Scope is in the Part 2 section; Alex's text is in the Part 2 tab | Alex |
| D-25 | Sat 2:27 PM | Judge Mode starts with the palace in ruins and each place rebuilds as the judge studies it; no added time (option a). Pitch timing to be re-measured | Alex |
| D-26 | Sat 2:27 PM | Palace styles: Gothic library first, then Zen garden and castle (option a). The handcrafted Roman house stays for the demo and existing decks | Alex |
| D-27 | Sat 2:17 PM | Palaces are append-only: extending one never moves a place already used. Limits: up to 6 rooms, up to 5 places a room, 30 places | Lead |
| D-28 | Sat 2:24 PM | Fallback: commit `34d496c` is the build that was demo-ready before Part 2. Go or no-go on Part 2 for the demo at Sat 11:00 PM (Alex) | Lead |
| D-29 | Sat 2:29 PM | PDF upload (asked for by Alex at 2:27 PM) reads the text in the browser with PDF.js: new dependency `pdfjs-dist` 6.5.438, loaded only when used, logged in `CREDITS.md` | Alex, Lead |
| D-30 | Sat 2:35 PM | No Part 2 claim goes into the README, Devpost text, pitch or UI copy until it is in `docs/research.md`; those documents change when the features are merged | Lead |
| D-31 | Sat 3:00 PM | The third palace style is a Workshop, not a castle: it suits processes (machines as stations, a channel running from station to station) | Alex |
| D-32 | Sat 3:00 PM | Parked: an optional "things you know well" field that the Architect draws memory images from, with no named people, characters, teams or titles. Not to be built unless Alex asks | Alex |
| D-33 | Sat afternoon | Process mode: the walk of a process deck asks what each step becomes and has the learner put the steps in order, scored apart from the places | Alex (confirmed), Lead |
| D-34 | Sat evening | Exam Mode and editing a saved palace in place are built, from the team's notes in the feature/bugs tab. Exam Mode: the palace hidden, the order shuffled, either direction, then a walk back to exactly the places missed; recorded in Progress; it changes no review schedule | Team (the idea), Lead |
| D-35 | Sat evening | Roadmap, not tonight: a drill on commonly confused items, and a palace from a returned exam (both from the feature/bugs tab) | Lead |
| D-36 | Sat 8:20 PM | QA review 4 (C8 U8 Ch6 A8): safe to demo with precautions, no blocker. Twelve major issues: nine go into a last batch of fixes tonight, three are corrected in the pitch, the README and the Devpost draft | Lead |
| D-37 | Sat evening | Every new palace is furnished from its own seed, so two palaces in one style are not the same route (QA review 4, issue 6). Built-in decks are unchanged. No claim that this prevents two topics from interfering: it is untested | Lead |
| D-38 | Sat evening | The site keeps an offline copy (a service worker), so that a reload with the network off opens the app (QA review 4, issue 11). Tested in headless Chromium only. Demo rule: open the site once on the venue Wi-Fi, leave the tab open, and never hard-reload | Lead |

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
| Sat 2:45 PM | Part 2 recorded: new Part 2 section (scope, milestones, fallback, research and claims), decisions D-24 to D-30, a note above the Features table. Nothing earlier was changed or removed. Human additions found: the Part 2, Part 3 and Part 4 tabs | Scribe, for the Lead |
| Sat 5:45 PM | First wave of Part 2 live since 4:57 PM (commit `6e8e54e`). Part 2 scope table marked live, merged or building, with six rows added; status line; decisions D-31 to D-33; two items added to the To-Do tab. Nothing earlier was removed. Human change found: the Part 2 tab was renamed "feature/bugs" and five feature ideas were added to it (listed under "Also in the Part 2 tab") | Scribe, for the Lead |
| Sat 9:30 PM | Part 2 brought to its state at 9:30 PM. Scope table: every status is now live or "in tonight's batch" (the last batch of fixes, under test at 9:30 PM), with a dated note in each scope cell; five rows added (Exam Mode, Edit, offline copy, QA review 4, two roadmap items). A 9:30 PM status line with the QA review 4 verdict and scores; decisions D-34 to D-38; notes on three milestones; the five ideas from the feature/bugs tab marked built or roadmap. One correction: the Survey row said "Nothing is revealed", and now says the right answer is not shown and the place stands or falls. Four items added at the top of the Part 2 section of the To-Do tab. Nothing else earlier was changed or removed. No human change found since the 5:45 PM sync | Scribe, for the Lead |
