---
name: palace-theme-authoring
description: How to add or change a visual theme for the Memoria memory palace - a JSON palette variant in src/themes/ or a new style module in src/styles/<id>/ - and prove it with screenshots. Use this whenever the task mentions a theme, palette, colour variant, art direction, style module, shader look, vellum/ink/sanguine/cyanotype/nocturne, theme.post knobs, the Theme Lab, the development field (how the palace fills in as you learn), or visual QA bookmarks, even if the word "theme" is never used (for example "make a night version", "try a blue paper look", "the wash looks dirty").
---

# Palace theme authoring (Memoria)

A look in Memoria is two things kept strictly apart:

- **Theme** = JSON tokens in `src/themes/<id>.json` (colours, light, fog, numbers, fonts, UI colours). Auto-discovered by `src/themes/index.ts`.
- **Style** = code in `src/styles/<id>/index.tsx` that turns those tokens into materials, environment and post-processing. Auto-discovered by `src/styles/index.tsx`. One style serves many themes.

Layouts never name a colour: geometry says `<Surface slot="wall" />` or `<Surface slot="stone" accent="teal" />` and the active style decides what that means. So any layout works with any theme, and a theme can be judged in every room without touching geometry.

Read first: `CLAUDE.md` (art rules, frame budget), `docs/art-bible.md` (the directions and the chosen one), `src/core/types.ts` (the `Theme` contract), `src/styles/types.ts` (the `StyleModule` contract), `src/styles/development.tsx`.

## 1. Decide: palette variant or new style?

Write a **JSON palette variant** (minutes, no code) when the rendering idea stays the same and only tokens change: different paper and line colour, different pigments, different line weight, grain, hatch density, fonts. Example: `ink-sanguine.json` is the `ink` style with red-chalk line, cream laid paper (`post.laid` > 0) and an earth palette.

Write a **new style module** only when the way the picture is made changes: a different shading model (lit PBR versus flat wash), a different line technique, a different meaning of "developed", a different pass structure. A new style costs a frame-budget review and a full QA round, so try hard to express the idea as tokens of an existing style first. If an existing style lacks one knob you need, add the knob to that style (with a default that leaves other themes unchanged) rather than forking it.

Existing styles: `ink` (chosen direction; two scene passes + one page pass), `blueprint`, `nocturne`, `greybox` (fallback, also the simplest template).

## 2. Theme JSON: every token group

Copy the nearest theme and change `id` (must equal the file name) and `name`. All groups are required except `audio`.

| Group | Keys | Notes |
|---|---|---|
| identity | `id`, `name`, `style` | `style` is one of the ids in `StyleId` (`src/core/types.ts`). |
| `palette` tokens | `paper`, `ink`, `inkSoft`, `sky` [low, high], `fog` | `paper` is the clear colour and the page; `ink` is line and text. In `ink`, `sky[1]` is the aged-corner tone. |
| `palette.surfaces` (material slots) | `floor wall ceiling trim stone wood metal water foliage cloth glow` | Structure. Keep these in the neutral range: saturated colour is reserved for loci. They must still differ from `paper` enough that a washed room reads as painted. |
| `palette.accents` (pigments) | `red amber green teal blue plum` | One role per locus feature. All six must be told apart at a glance and in greyscale-ish conditions (vary value as well as hue). |
| `light` (rig) | `ambient`, `keyColor`, `keyIntensity`, `keyDirection` [x,y,z travel direction], `fillColor`, `fillIntensity`, `locusGlow` | Unlit styles (`ink`) only use `keyDirection` to pick lit/half/shade tones. |
| `fog` | `near`, `far` | Metres. |
| `post` (preset) | style-specific numbers | Every tunable number of the style lives here: nothing numeric is hard-coded in a shader if someone might want to tune it. Missing keys fall back to the style's defaults. `quality` (0..2) is the shared name for the cost knob. |
| `type` | `display`, `text` | Bare CSS family names, no fallbacks (the UI adds them in `src/ui/theme.ts`). Only families that are self-hosted: imported in `src/main.tsx` from `@fontsource/*` and logged in `CREDITS.md`. Currently shipped: `IM Fell English`, `IM Fell English SC`, `EB Garamond Variable`. |
| `ui` | `bg panel fg muted accent success danger`, `radius` | The 2D overlay is styled only from these via CSS variables. `fg` on `panel` and on `bg` needs contrast >= 4.5:1. |
| `audio` (optional) | `ambient` | Path of a CC0 loop under `public/`, logged in `CREDITS.md`. Omit rather than ship a placeholder. |

All colour comes from the JSON. A hex literal in a style module or in overlay CSS is a bug.

`ink` post knobs, by group (defaults in `KNOBS` at the top of `src/styles/ink/index.tsx`):
line `lineWidth farWidth creaseWeight inkOpacity wobble wobbleScale depthThreshold normalThreshold distanceFade`; tones `toneLit toneShade washLit washLitPigment washHalf shadeMix reserve granulation`; development `washThreshold washFull washFirst bleed pool poolWidth`; hatching `hatchSpacing hatchWidth hatchStrength`; paper `grain fibre blotch vignette foxing laid`; cost `quality`.

## 3. Style module contract (only if you need one)

Create `src/styles/<id>/index.tsx` with a **default export** of type `StyleModule` and add the id to `StyleId` in `src/core/types.ts`:

- `Surface({ slot, accent, doubleSided })`: returns a material element attached as `material`. Colour is `accent ? palette.accents[accent] : palette.surfaces[slot]`.
- `Environment({ theme })`: sky/background, fog, lights, atmosphere.
- `Post({ theme })`: post chain or `null`. A style that owns the frame registers `useFrame(render, 1)`.
- `shadows?: boolean`: only if the look needs the one allowed 1024 shadow map.

Rules that keep it fast and leak-free:

- Cache materials by **semantic key** (slot, accent, sidedness), never by colour, and push colours and `post` numbers into uniforms when the theme object changes. The Theme Lab sends a new theme object every ~120 ms while a slider moves; keying by colour would create a material per drag step.
- Render targets are module-level singletons, resized in place. If a setting forces a new target (for example a sample count), `dispose()` the old one.
- No allocations in `useFrame`: preallocate vectors, colours, arrays.
- Anything that gives texture to a surface (hatching, mottling, wash edges) is anchored to world or object space. Screen-anchored patterns crawl when the camera glides. Only the paper itself may be fixed to the screen.
- Things that are not surfaces of the style (imago tokens, labels) are drawn by `src/scene/ImagoToken.tsx` with theme colours only; do not restyle them per style.

## 4. The development field contract

`src/styles/development.tsx` is the app's central mechanic: the palace fills in around the places you remember. Every style must respond to it.

- Spread `developmentUniforms` into each surface material's uniforms (shared by reference) and include `DEVELOPMENT_GLSL`; call `developmentAt(worldPos)` (0..1) in the fragment shader with a world-space position.
- Uniforms: `uDevPoints[16]`, `uDevValues[16]`, `uDevCount`, `uDevRadius` (4.2 m), `uDevFloor` (rises toward 1 as the whole route nears mastery, so a learned palace is complete wall to wall). `uDevCount == 0` means fully developed.
- The field is a soft union. If a style needs "one place is truly learned" (as `ink` does for its second glaze), take the maximum single-locus value from the same uniforms rather than changing the shared function.

Values the app produces (`src/state/sceneView.ts`), and what each must look like:

| Value | When | Must read as |
|---|---|---|
| 1 | title screen; a correct recall | Complete and beautiful wall to wall. The jump to 1 is the signature moment: it must be obvious. |
| 0.65 | encode: image placed here | Deliberately half-finished (ink: one light, clean first wash with a crisp dried edge). Never a grey smudge. |
| 0.4 | familiarization walk | A light sketch everywhere. |
| 0.3 | a miss | Mostly unfinished, a small trace remains. |
| 0.18 | not reached yet | The style's bare state (ink: confident line on clean paper). Still fully legible. |

## 5. Frame budget

60 fps at 1440x900 on an integrated GPU. At most one 1024 shadow map; at most two custom full-screen passes plus an optional normal/geometry pass; instancing for repeats; adaptive DPR is on (`src/scene/PalaceCanvas.tsx`). State the cost of a style in its header comment as passes, target sizes and texture fetches per pixel. Expose a `post.quality` knob when there is a cheaper path. Headless Chromium is software GL and runs a few frames per second: that tells you nothing about real speed; check with `?perf` on real hardware.

## 6. Screenshot QA loop

Compiling is not looking. For every visible change:

```bash
npm run check
npm run build && node scripts/shots.mjs --bookmarks qa/bookmarks.ink.json --out qa/shots/<name>
# or, while iterating, against a running dev server (no rebuild):
npx vite --port 5199 --strictPort &
node scripts/shots.mjs --url http://localhost:5199 --bookmarks qa/bookmarks.ink.json --only overview
```

Pitfalls seen in practice (the build machine is shared and software-rendered):

- Do not edit style source while a shot is rendering against the dev server: the hot reload of a style module can fail and leave the page blank until the screenshot times out. Edit, then shoot.
- A run without `--url` starts its own `vite preview` and appears to leave it running afterwards. When it ends, list previews from your own worktree (`pgrep -af "<your worktree dir>.*vite preview"`) and stop that PID. Never stop servers or renders by pattern, and never ones from another worktree: other agents render on the same machine.
- A background dev server is stopped at its time limit (30 minutes by default). Give it a longer limit, or shoot the final set from `dist/`.
- Several renders at once starve each other. Run one at a time and expect about a minute per 1440x900 frame.

Then open the PNGs (Read tool), critique against `docs/art-bible.md`, fix, repeat: at least three rounds. A bookmark is `{ "name", "query", "width"?, "height"?, "waitMs"? }`; pass a smaller `width`/`height` while iterating and render the final set at 1440x900. Add a `qa/bookmarks.<style>.json` for a new style.

URL switches (`src/scene/qa.ts`): `theme=<id>`, `shot=overview|entry|<locus index>`, `rail=<from>&t=<0..1>` (camera frozen part-way to the next locus), `tokens=all`, `dev=<v>` or `dev=<v0>,<v1>,...` per locus, `perf`, `debug`. `?proto=1&theme=<id>` is the small art test room; `?lab` opens the Theme Lab.

Minimum set to look at for a theme:

1. `shot=overview&dev=1` and `shot=overview&dev=0.18` (complete versus bare).
2. Two loci with images, at `dev=1` and at `dev=0.65`: `shot=0&tokens=all&dev=1`, `shot=4&tokens=all&dev=0.65`.
3. A mixed state: `shot=4&dev=0.18,0.18,0.18,0.65,1,0.3`.
4. Motion: `rail=4&t=0.3` and `rail=4&t=0.32` (neighbouring frames; texture must move with the surfaces, nothing may flicker), plus a wider pair such as `t=0.3` / `t=0.4`.
5. The overlay on top (`qa/bookmarks.ui.json`) for contrast and fonts.

**Theme Lab** (`/?lab`, add `&theme=<id>`): a Leva panel, top-left, collapsed. Tune palette, light, fog, every `post` number and `ui` colours live; "Copy JSON" or "Download JSON" (saved as `<id>.json`), then put the file into `src/themes/`; "Reset" returns to the saved theme. Use it to find values, then confirm with headless shots.

## 7. Anti-generic checklist

Reject the theme if any of these is true:

- Default purple/blue gradient, glassmorphism, Inter on everything, stock shadcn/Tailwind look.
- An unmodified drei environment preset, bloom on everything, lens flare, decorative chromatic aberration.
- Saturated colour on structure, or two loci that share accent, silhouette and light.
- The six accents are not distinguishable from each other, or an accent is too close to the line colour.
- The half-developed state looks like dirt, fog or shadow instead of intent.
- Lines alias, shimmer or break up at distance; texture crawls in motion.
- Memory images look pasted over the picture instead of belonging to it; they are not readable at 3 to 5 m.
- The overlay does not look like it belongs to the 3D world (fonts, colours and radius must come from the theme).
- A font or asset that is not self-hosted and logged in `CREDITS.md`.

## 8. Definition of done

- [ ] `src/themes/<id>.json` complete (section 2); for a new style, `src/styles/<id>/index.tsx` and the `StyleId` entry.
- [ ] No colour literal and no untunable magic number in the style; numbers live in `theme.post`.
- [ ] Every development value in section 4 looks right, and 0.65 to 1 is an obvious change.
- [ ] Section 6 shots rendered at 1440x900 and looked at; three or more look-and-fix rounds; rail frames stable.
- [ ] Works in the proto room and the real palace, and the imago tokens are readable in it.
- [ ] Frame cost stated; within the budget; no allocations per frame; nothing leaks under Theme Lab edits.
- [ ] Overlay contrast >= 4.5:1, body text >= 16 px, reduced motion still fine.
- [ ] `npm run check` and `npm run build` pass; final PNGs copied where the brief asks; `docs/art-bible.md` updated if the direction changed (art director only); `CREDITS.md` updated for any new font or asset; `TASKS.md` updated.

## Ink style: wash knobs added in round three

These live in `theme.post` of `ink-vellum.json` and `ink-sanguine.json`:

- `washThreshold` is now a **reach** threshold (about 0.08), and `bleed` is the hand-wander of
  the wash boundary **in metres**.
- First glaze (a place whose image has been placed but not yet recalled):
  `washFirstPigment`, `firstSaturation`.
- Tint ramp from a miss to a first glaze: `tintFrom`, `tintTo`, `missGrey`.
- Hatching: `hatchTone`, `hatchContact` (the band at the wall base), `hatchPatch`,
  `groundAt` (floor height the contact band assumes; 0 for Domus).
- `quality`: 0 = half-size geometry buffer, 1 = full size without multisampling (the shipped
  default), 2 = 4x multisampled. Raise it only after a frame-rate check on a real laptop.

The ink surface shader supports `InstancedMesh`. A new style that uses a custom
`ShaderMaterial` must handle `instanceMatrix` itself (`#ifdef USE_INSTANCING`), or instanced
parts of a layout collapse to the mesh origin. The experimental `blueprint` style has not
been checked for this.
