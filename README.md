# Memoria

**Paste what you need to learn, and an AI architect turns it into a memory palace you can walk through.** You walk it to encode, walk it again with the images hidden to recall, and the palace schedules your reviews.

![The atrium of the palace, fully learned](docs/media/palace-overview.png)

![The palace paints itself in around the places you remember; unlearned places stay as line drawing](docs/media/palace-development.png)

The palace starts as a line drawing. Colour washes in around each place as you learn what you left there.

## Try it

Live demo: (link added once deployed)

Press "Try it in 2 minutes" on the title screen. That is Judge Mode: it loads the eight carpal bones of the wrist, walks you past one image per bone, then hides the images and asks what you left at each place. It takes about two minutes and runs with the network off.

## What it does

1. **Paste.** A list (one item per line, optionally `term - meaning`) or raw notes.
2. **The Architect proposes.** The Palace Architect picks the facts, drafts one image per fact, and assigns each to a place on a fixed route through the palace, keeping related items in the same room.
3. **You approve or edit.** Every image is yours to accept, rewrite or regenerate before anything is placed.
4. **Familiarize.** The first time you use a palace you take a short walk of the empty route, so you know the places before anything is put in them.
5. **Encode walk.** The camera glides from place to place. At each one the image appears in the room with its term, meaning and scene. You set the pace.
6. **Recall walk.** The same route with the images hidden. You answer at each place, typed or multiple choice, before anything is revealed. You get a score at the end, and for anything you missed you can ask the Architect for a stronger image.
7. **Spaced review.** Recall results move each item through Leitner boxes with growing intervals (10 minutes, then 1, 3, 7 and 21 days). A "due" view walks only the places that need review.

The palace, "Domus", has twelve places in three rooms (the Vestibule, the Atrium, the Study). Everything is stored in your browser's localStorage. There are no accounts.

## Why it should work, and what we do not claim

All of this comes from [`docs/research.md`](docs/research.md), which lists every source and how confident we are in it.

- The oldest surviving description of the method of loci is in the *Rhetorica ad Herennium*, written around the 80s BCE. The palace follows the rules for places found there and in Cicero: a fixed order, distinct forms, no crowds, and a marker on every fifth place.
- Two meta-analyses report that the method of loci improves recall of lists by a medium-to-large margin (g = 0.65 across 13 randomised trials; d = 0.88 for immediate serial recall against rehearsal). Both flag a high risk of bias, and the 2025 review grades the evidence as low to very low quality.
- A 2012 study of 142 participants found that a virtual environment explored for about five minutes served as well as a familiar real place. That is why Memoria uses a fixed virtual route with a familiarization walk. Participants in that study imagined their items, so our rendered images go beyond what it tested.
- The palace only helps you encode. What the literature shows makes memories last is retrieval practice and spacing, so every palace ends in a recall walk with the images hidden, followed by scheduled reviews.

What we do not claim:

- **We have not run an efficacy study of Memoria.** It is a hackathon prototype with no outcome data of its own. Every claim above is about the technique, not about this app.
- Our sources were checked through abstracts and search extracts, not full texts. `docs/research.md` marks what was not re-checked.
- The evidence is mostly short laboratory studies with university students memorizing word lists. Classroom evidence is thin.
- Loci suit ordered, discrete facts. They do not teach understanding.
- A browser is the desktop condition. The one head-to-head study we found reported head-mounted VR better than desktop, and other work suggests navigation itself may not be the active ingredient. The 3D walk is there for structure and engagement, not as a proven memory boost.
- AI-supplied images are not known to work as well as images the learner invents. The research on supplied versus self-made mnemonics is mixed, which is why you approve or edit every image.
- The large gains in training studies followed about six weeks of daily practice in young adult men. We do not promise general memory improvement, only what is practised.
- Other AI-assisted memory palace tools exist. Memoria is not the first.

## How it is built

**Stack.** Vite 8, React 19, TypeScript 6, three.js 0.187 with React Three Fiber 9, drei and postprocessing, zustand for state. WebGL2. The front end is static and deploys on Vercel. The only server code is one function, `api/architect.ts`.

**Layout, Theme, Style.** Three things are kept separate so that any palace works with any look:

- A **layout** (`src/layouts/`) is geometry plus the ordered route of places. Meshes never choose a colour. They name a semantic slot (`<Surface slot="wall" />`), and a place feature adds an accent role.
- A **theme** (`src/themes/*.json`) is a file of tokens: palette, light, fog, post-processing numbers, type, UI colours.
- A **style** (`src/styles/<id>/`) is code that turns theme tokens into materials, environment and post-processing.

The default look, Ink & Vellum, is a custom non-photorealistic pipeline: flat watercolour washes, ink outlines found from depth and surface direction, and paper grain, with no lights or shadow maps.

**The development field.** Every material can ask `developmentAt(worldPosition)`, a value from 0 to 1 that says how well the nearest place has been learned. Styles draw low values as unfinished and high values as complete. In the ink style an unlearned place is line on bare vellum, and a correct recall brings the washes and pigment in around it.

**The Palace Architect.** The server function makes two model calls for a new deck, and the app shows each step to the learner in plain words:

1. *Plan*: choose the facts, decide whether the deck is an ordered list or term-and-meaning pairs, and group related items by room.
2. *Generate*: draft one image per fact, acting on the feature of its place.
3. *Self-check*: a second, strict pass checks every image against the image rules (concrete, doing something, different from its neighbours, tied to the meaning by a one-line reason).
4. *Revise*: the images that fail are rewritten.
5. *Adapt*: when you miss an item in a recall walk, you can ask for a stronger image for that item.

The Anthropic key is read from the server environment and never reaches the browser. Results are cached. If the function is unreachable or has no key, the app falls back to a deterministic offline planner, so composing a palace still works without a network.

**Offline demo path.** Judge Mode and the built-in decks run from fixtures. Nothing on the demo path makes a network request.

## Run it locally

Needs a current Node.js.

```bash
npm install
npm run dev
```

For the live Architect, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. The dev server serves the same `api/architect.ts` handler that Vercel runs. Without a key the app uses its offline planner. `ARCHITECT_MODEL` and `ARCHITECT_EFFORT` are optional overrides, described in `.env.example`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build to `dist/` |
| `npm run check` | Type-check and lint |
| `npm run shots` | Headless screenshots of fixed camera bookmarks into `qa/shots/` |
| `node scripts/smoke.mjs` | End-to-end test of the learning loop in headless Chromium, including Judge Mode offline and a keyboard-only walk. Run `npm run build` first. |
| `node scripts/architect-smoke.mjs` | Checks the fixture decks, the offline planner and the API handler's guard rails. Calls the real model only when a key is set. |

`shots` and `smoke.mjs` need Playwright: `npm i -D playwright && npx playwright install chromium`.

## URL switches

| Parameter | Effect |
|---|---|
| `?judge` | Starts Judge Mode (about 2 minutes) |
| `?judge=pitch` | The pitch variant: waits on the title screen, then eight places encoded and a spot check of four, about 70 seconds |
| `?lab` | Theme Lab: a panel for tuning the active theme's tokens live |
| `?perf` | Frame-rate overlay |
| `?theme=<id>` | Use a theme by id, for example `?theme=ink-sanguine` |
| `?proto=1` | The art-direction test room used to compare the three prototypes |

## Themes

| Id | Status |
|---|---|
| `ink-vellum` | Default. Iron-gall ink line over vellum with mineral-pigment washes. |
| `ink-sanguine` | Palette variant of the same style: red chalk on cream paper. |
| `cyanotype` | Experimental. |
| `nocturne-atrium` | Experimental; a prototype from the art-direction comparison. |
| `greybox` | Plain fallback, and the simplest template for a new style. |

![The three art directions we prototyped; we chose Ink & Vellum](docs/media/art-directions.png)

To add a palette variant, copy the nearest JSON file in `src/themes/`, change its `id` and `name`, and edit the tokens. Themes are discovered automatically, so there is no code to write. A new style module is only needed when the way the picture is made changes. The full procedure, including the screenshot checks, is in [`.claude/skills/palace-theme-authoring/SKILL.md`](.claude/skills/palace-theme-authoring/SKILL.md).

## Accessibility

What exists today:

- **Keyboard only.** The whole loop can be done without a pointer: Right or Space for the next place, Left to go back. The smoke test composes a list and walks encode and recall with the keyboard only.
- **Reduced motion.** Follows the operating system's setting and can be overridden under Settings on the title screen. The camera glide is replaced with a cross-fade.
- **Contrast.** Overlay colours come from theme tokens, with a rule of at least 4.5:1 for text. The title screen has been measured. A full audit is still pending.
- **Text size.** Overlay text is at least 16 px.

## Status

- The live Architect path is built but has not been tested against the real model. It will be once an API key is configured. The offline planner works.
- Frame rate has not been measured on a real laptop yet. The target is 60 fps at 1440×900 on an integrated GPU.
- The half-learned look of the palace (between line drawing and full colour) is still being tuned, and so is the Sanguine variant.
- The Theme Lab panel is built; its copy and download buttons are not yet verified.
- Moving an item to a different place by hand is not built.
- Not deployed yet.

## Roadmap

Stretch goals, in order:

1. A built-in A/B mini-test: memorize one list with the palace and one without, then compare the two scores.
2. A second layout and theme, and ambient audio.
3. AI-drawn images for the memory tokens.
4. A palace editor: click to place or reorder places in a layout.
5. A shareable palace link, with the palace encoded in the URL.
6. A WebXR mode.

Later:

- Your own home as a palace, from a phone scan.
- A community theme gallery.
- Classroom mode: a teacher builds a palace and students walk it.
- Multilingual vocabulary packs.

## Built at HackPrinceton Fall 2026

Education track. Team: Alex Wang, Richard Xu, Eric Wang, Eric Chen.

The code was written with Claude Code agents under the team's direction during the hackathon window. The team chose the idea, the scope and the art direction, and reviewed the result. The agent roles and the rules they worked under are in [`CLAUDE.md`](CLAUDE.md) and [`.claude/agents/`](.claude/agents/).

## License and credits

MIT. See [LICENSE](LICENSE). Third-party libraries, fonts and assets are listed in [CREDITS.md](CREDITS.md). Geometry and shaders are procedural and original unless listed there.
