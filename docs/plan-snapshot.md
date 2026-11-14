# Plan / Outline (snapshot of the Google Doc "Plan/Outline" tab)

Snapshot taken: Sat Nov 14, 3:00 AM ET (initial population by the Lead).
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

## Features

Priority: P0 = MVP, must ship. P1 = stretch, in order, only when P0 is green and deployed. P2 = roadmap, not built.
Status: todo / doing / done / cut. Criterion: C = Creativity, U = Utility, Ch = Charity, A = Avidity.

| ID | Feature | Pri | Status | Owner | Serves | Acceptance criteria |
|---|---|---|---|---|---|---|
| F-01 | Palace layout "Domus" | P0 | todo | Engine | U, C | 3 rooms, 12 loci on one fixed route. Every locus differs in silhouette, accent colour and light. Every fifth locus carries a counting marker. |
| F-02 | Camera rail and walk controls | P0 | todo | Engine | U, A | Camera glides between loci on a spline, eases, lingers. Right/Space = next, Left = back. Reduced motion replaces the glide with a cross-fade. |
| F-03 | Persistence | P0 | todo | App | U | Decks, review state and settings survive a refresh, including mid-walk. localStorage, no account. |
| F-04 | Input | P0 | todo | App | U | Paste a list (one item per line, optional "term - meaning"); paste raw notes and have items extracted; add, edit, delete, reorder by hand. |
| F-05 | Palace Architect (AI) | P0 | todo | AI | C, U | For each item: one vivid image (scene sentence, glyphs, motion) tied to the meaning, assigned to a locus, related items grouped by room. Self-checks for vividness and distinctness and revises. Learner can accept, edit or regenerate each image. Key stays server-side. Cached. Works offline with a local fallback. |
| F-06 | Familiarization walk | P0 | todo | App, Engine | U | First use of a layout: a guided walk of the empty route that names each locus. Under 40 seconds. Skippable afterwards. |
| F-07 | Encode walk | P0 | todo | App, Engine | U, C | At each locus the image appears in-world with term, meaning and scene. Learner-paced. |
| F-08 | Recall walk | P0 | todo | App | U | Images hidden. Typed or multiple-choice answer at each locus, then feedback and the image is revealed. Score at the end. The answer is never shown before the learner commits. |
| F-09 | Review scheduling | P0 | todo | App | U | Leitner boxes driven by recall results. A "due for review" view. "Review now" walks only the due loci. |
| F-10 | Judge Mode | P0 | todo | App, AI | C, U, A | One click. Preloaded 8-item list (the eight carpal bones of the wrist). Encode, then recall, then score. About 60 to 90 seconds. Runs with the network off. |
| F-11 | Theme system | P0 | doing | Art | A, C | One polished theme plus one palette variant. Any layout works with any theme. |
| F-12 | Overlay UI in the art direction | P0 | todo | App, Art | A | 2D overlay styled from theme tokens; bespoke self-hosted type pairing; no stock component look. |
| F-13 | Theme Lab | P0 | todo | Engine | A | `?lab` panel to live-tweak palette, light, fog and post; exports theme JSON for `src/themes/`. |
| F-16 | Accessibility | P0 | todo | App, Engine | Ch | Reduced-motion mode, keyboard-only use end to end, overlay contrast at least 4.5:1, text at least 16 px. |
| F-17 | Loading and performance | P0 | todo | Engine | U, A | 60 fps at 1440×900 on an integrated GPU (checked on a real laptop). Designed loading state. Initial load under about 5 s. |
| F-14 | Development mechanic | P1 | todo | Engine, App | C | The palace looks unfinished around loci you have not learned and complete around loci you have mastered, driven by the review boxes. |
| F-15 | Built-in A/B mini-test | P1 | todo | App | U, Ch | Memorize one list with the palace and one without, then recall both; show the two scores. Used for the venue test. |
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

## Change log

| When (ET) | Change | By |
|---|---|---|
| Sat 2:50 AM | Initial plan written | Lead |
| Sat 3:25 AM | Art direction decided (D-10); F-11 now targets Ink & Vellum plus Sanguine | Lead |
