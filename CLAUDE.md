# Memoria: project constitution

Every agent reads this file before touching anything. If something here conflicts with
the HackPrinceton packets in `docs/hackprinceton/` (git-ignored), the packets win.

## What we are building

**Memoria** is a web-based, walkable memory palace. Paste what you need to learn; an AI
"Palace Architect" turns it into vivid memory images placed along a fixed route through a
3D palace. You walk the route to encode, walk it again with the images hidden to recall,
and the palace schedules your reviews. The first walk of a deck is a survey of what you
already know: a place you miss falls into ruin, studying it puts it under repair, and
recalling it restores it. It is a learning tool that happens to be beautiful, not a tech
demo that happens to teach.

- Event: HackPrinceton Fall 2026. Main track: **Education**. Special tracks: Amazon
  "Best Practical AI Innovation", ChatOverflow Agent Leaderboard.
- Team: Alex Wang, Richard Xu, Eric Wang, Eric Chen.
- Repo: https://github.com/AlexWin0806/memoria (public, MIT).

## Deadlines (all Eastern Time)

| When | What |
|---|---|
| Sun Nov 15, 3:00 AM | Code freeze. Bug fixes only afterwards. |
| Sun Nov 15, 7:00 AM | Submit on Devpost (one-hour buffer). |
| **Sun Nov 15, 8:00 AM** | **Hard submission deadline.** |
| Sun Nov 15, 9:30 AM to 2:30 PM | In-person judging. Demo is 2 minutes maximum. |

Judging criteria: **Creativity** (the "ah-ha" moment), **Utility** (does it work, would
you use it), **Charity** (societal need), **Avidity** (passion, polish, future plans).
Every feature names the criterion it serves. Venue Wi-Fi will be congested, so the demo
path must never depend on a live network call.

## MVP (P0). Scope lives in the Google Doc "Plan/Outline" tab; `docs/plan-snapshot.md` mirrors it.

1. Palaces: the handcrafted Roman house (12 loci, 3 rooms; Judge Mode and the built-in
   decks) and generated palaces with one room per category, up to 5 places a room, 6 rooms,
   30 places, in three kits (Gothic library, Zen garden, Workshop). Palaces are append-only,
   and each new one is furnished from its own seed. 60 fps.
2. Input: paste a list, paste raw notes (the Architect extracts items), type items, or
   upload a PDF (its text is read in the browser).
3. Palace Architect (AI): proposes one vivid imago per item and assigns items to loci,
   grouping related items by room. It sorts facts into rooms, decides facts or process,
   keeps links only where the notes support them, suggests a kit, and can extend a palace
   without moving anything. The learner accepts, edits or regenerates every image.
4. Survey walk the first time a deck is opened: one question per place, with "I don't
   know". The right answer is not shown; the place stands or falls. A skipped survey becomes
   a familiarization walk of the empty route. A route check follows either.
5. Encode walk: camera glides locus to locus, each image appears in-world, learner-paced.
   The place goes under repair.
6. Recall walk: images hidden; typed or multiple-choice answer at each locus; feedback;
   image revealed; score at the end. A right answer restores the place; a self-marked answer
   does not. Process decks also ask what happens to each step next and the order of the
   steps, scored apart from the places.
7. Review scheduling: Leitner boxes driven by recall results, with a "due" view. A Progress
   view keeps every walk.
8. Persistence in localStorage. No accounts.
9. **Judge Mode**: one click, a preloaded 8-item list, encode then recall, score shown.
   The palace starts in ruins. Runs fully offline from fixtures. This is the demo.
10. Theme system with one polished theme plus one palette variant.
11. Compose (choose the kit or let the Architect choose), "Add to this palace", and "Edit"
    in place.
12. Exam Mode: no palace, shuffled order, either direction; it changes no review schedule.
13. Offline copy (a service worker): after one visit online, a reload works without a network.

Order of work: an ugly but complete loop first, then art direction, then polish.
A plain full loop beats a beautiful half loop.

## Architecture

Stack: Vite 8, React 19, TypeScript 6, three 0.187, @react-three/fiber 9, drei 10,
@react-three/postprocessing 3, zustand 5, leva, pdfjs-dist (loaded only when a PDF is
chosen). WebGL2. Deployed on Vercel; the only
server code is `api/architect.ts` (holds the Anthropic key).

Do not trust memory for library APIs. These versions are newer than most training data:
read the types and source in `node_modules` before using an API.

```
src/core/types.ts     Contracts. Types only. Everything is written against these.
src/layouts/          Palace layouts: geometry (JSX using <Surface slot>) + loci + route.
src/layouts/spec.ts   The palace specification (kit, seed, rooms) carried in the layout id.
                      Append-only: nothing that exists ever moves.
src/layouts/kits/     Kits for generated palaces (gothic, zen, workshop).
src/layouts/props/    Kit-neutral landmarks shared by every kit.
src/themes/*.json     Theme tokens (palette, light, fog, post, type, ui). Auto-discovered.
src/styles/<id>/      Style modules: code that turns theme tokens into materials,
                      environment and post-processing. Auto-discovered.
src/styles/development.tsx   The shared development field (see below).
src/scene/            Engine: canvas host, camera rail, loci, imago tokens, integrity
                      (ruin and repair), links drawn on the floor.
src/state/            Zustand stores: session, decks, review, history, draft, settings (persisted).
src/flows/            Survey / familiarize / encode / recall / process / exam controllers;
                      PDF reading.
src/ui/               2D overlay, styled from theme.ui tokens via CSS variables.
src/ai/               Architect client, local fallback, fixtures.
src/srs/              Review scheduling.
src/proto/            Art-direction test room (`/?proto=1`) and the landmark gallery (`?gallery`).
src/ab/               The comparison test (`?compare`).
src/sw.js             The offline copy (service worker); the build writes it to /sw.js.
api/architect.ts      Vercel function: the Palace Architect.
scripts/              shots, capture, smoke, compose-smoke, pdf-smoke, offline-smoke,
                      ab-smoke, architect-smoke, palace-invariance, live-check.
```

Three things stay separate so that any layout works with any theme:

- **Layout** = where things are. Meshes never choose a colour or a material; they name a
  semantic slot: `<mesh><boxGeometry /><Surface slot="wall" /></mesh>`. Slots: `floor wall
  ceiling trim stone wood metal water foliage cloth glow`. A locus feature adds
  `accent="amber"` (one of `red amber green teal blue plum`).
- **Theme** = JSON tokens. Palette variants are new JSON files with the same `style`.
- **Style** = code (`StyleModule`: `Surface`, `Environment`, `Post`) that interprets tokens.

**Development field.** `developmentUniforms` and `DEVELOPMENT_GLSL` give every material a
`developmentAt(worldPos)` value in 0..1: how well the nearest locus has been learned.
Styles render undeveloped areas as unfinished and developed areas as complete. This is the
core visual mechanic, so every style must respond to it.

**Integrity.** `SceneView.integrity` gives each place a value in 0..1 for how whole it is:
0 in ruins, 0.3 needs another repair, 0.6 under repair, 1 standing or restored. It is set
only by graded answers. Layouts wrap each place's feature in `<LocusFeature>`, which takes
it apart and rebuilds it from that value.

URL parameters: `?proto=1` test room; `?theme=<id>`; `?shot=<bookmark>` fixed camera with
motion frozen and UI hidden; `?dev=0,1,0.5` development per locus (proto); `?lab` Theme
Lab; `?perf` FPS overlay; `?judge` Judge Mode; `?judge=pitch` the 90-second variant;
`?compare` the comparison test; `?nosw` removes the offline copy; `?gallery` every landmark;
`?layout=<palace id>` start in a given palace; `&integrity=0,0.6,1` wholeness per place;
`&links=all` draw every link.

Screenshot contract: the app sets `window.__MEMORIA_READY__ = true` once the scene has
rendered. `npm run shots` waits for it.

## Art direction

**Chosen direction: Ink & Vellum** (style `ink`, theme `ink-vellum`; variant `ink-sanguine`).
Full detail in `docs/art-bible.md`. The rules that bind all code:

- Uncluttered; 3 to 5 loci per room; loci and memory images are the heroes.
- Every locus is distinct in silhouette, accent pigment and light.
- Saturated colour only on loci. One accent role per locus feature.
- Camera glides on a spline rail with eased motion and a short linger at each locus.
- Anti-generic: no default purple/blue gradients, no glassmorphism, no Inter-everywhere,
  no unmodified drei environment presets, no stock shadcn/Tailwind look, no bloom on
  everything. The 2D overlay must look like it belongs to the 3D world.
- Procedural geometry and original shaders first; otherwise CC0 only, logged in `CREDITS.md`.
- Fonts are self-hosted (npm `@fontsource/*`), never loaded from a CDN, and logged in `CREDITS.md`.
- Accessibility: reduced-motion mode, keyboard-only navigation, contrast ≥ 4.5:1, text ≥ 16 px.

Frame budget: 60 fps at 1440×900 on an integrated GPU. At most one 1024 shadow map, at
most two custom full-screen passes plus an optional normal pass, instancing for repeated
geometry, no allocations inside `useFrame`, adaptive DPR. Initial load under about 5 s.

## Research-backed design principles

From `docs/research.md` (sources checked through search extracts and abstracts; see the
caveats there). Every feature must respect these.

1. Every palace is a fixed route with one fact per locus, and the order of loci never changes.
   A palace grows only by adding places at the end of the route or in a new room; a place in
   use never moves and never takes a second fact.
2. Every locus is visually distinct in shape, colour and light, moderately lit, evenly
   spaced and free of clutter, and every fifth locus carries a landmark.
3. First-time users take the survey walk, or a short familiarization walk of the empty route
   if they skip it, and pass a quick route check, before any image is placed.
4. The Architect proposes; the learner always approves, edits or replaces each image and
   confirms where it sits.
5. Every image is concrete, doing something, different from its neighbours, and tied to the
   meaning of the fact by a one-line reason. Weirdness alone is not enough.
6. Every encoding walk is followed by a recall walk with images hidden, and the learner
   must answer before anything is revealed.
7. Every review is a retrieval attempt scheduled at expanding intervals, and success is
   judged on delayed recall.
8. One route per topic: never load a second, confusable list onto a route that is still
   being learned.
9. Every new deck starts with a survey walk: one question at each place, answered or marked
   "I don't know" before moving on; the right answer is not shown (the place stands or falls);
   the study walk follows in the same session and gives each answer at the place where it was
   asked.
10. The state of a place comes only from the learner's answers, never from self-rating; a
    place is restored by a correct recall after study, and a correct survey answer still gets
    a scheduled check.

Claims rule: nothing goes into the README, Devpost, pitch or UI copy unless it is in
`docs/research.md`. Do not claim "first AI memory palace" (others exist), do not say
self-made images are proven better than provided ones (evidence is mixed), and always
pair the effect sizes with the bias caveat. We have not run an efficacy study of Memoria.

## Coding conventions

- TypeScript strict. No `any` unless commented. Named exports, except style modules
  (default export, required by auto-discovery).
- Import app code through the `@/` alias.
- React function components. Scene state that changes every frame is mutated in
  `useFrame` through refs, never through React state.
- Comments say why, not what. No dead code, no TODOs without an owner.
- No new dependency without a reason stated in the commit message. Check the current
  version on npm first.
- Secrets never enter the repo. `.env*` is ignored; the pre-commit hook scans staged changes.
- `docs/hackprinceton/` is never committed.

## Definition of done

A change is done when:

1. `npm run check` and `npm run build` pass (the pre-commit hook enforces this).
2. For anything visible: `npm run shots` was run and a human or agent looked at the PNGs.
3. It works with keyboard only and with reduced motion.
4. Judge Mode still works with the network off.
5. `TASKS.md` is updated, and `CREDITS.md` if an asset, font or library was added.

## Working in this repo as an agent

- The Lead owns `main`, merges, and final calls. Subagents work in a git worktree on a
  branch named `agent/<role>-<topic>`, touch only the files in their brief, and commit there.
- In a fresh worktree, link dependencies instead of reinstalling:
  `ln -s /home/user/memoria/node_modules node_modules` (fall back to `npm ci`).
- Run `npm run check` before every commit. Never use `--no-verify`.
- Return a short summary plus file paths. Not transcripts.
- Agent roles are defined in `.claude/agents/`. Agent-level tasks are tracked in `TASKS.md`.
  The Google Doc To-Do tab is for the humans.
