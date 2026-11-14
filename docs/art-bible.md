# Memoria art bible

Status: three candidate directions are being prototyped in the same test room
(`/?proto=1&theme=<id>`). The team picks one; this file then records the decision.

## What the visuals are for

Memoria is a learning tool. The look serves the method of loci:

- **The loci and the memory images are the heroes.** Architecture is quiet so that
  the one distinct feature of each locus, and the image placed there, are what the eye keeps.
- **Every locus is unlike its neighbours** in silhouette, accent pigment and light.
  Classical sources ask for loci that are distinct, moderately lit and well spaced.
- **Development is visible.** Around a locus you have not learned, the palace looks
  unfinished. Around one you have mastered, it looks complete. Each style decides what
  "unfinished" and "complete" mean (see `src/styles/development.tsx`).

## Rules for every style

1. Uncluttered. Generous empty space. About 3 to 5 loci per room, few other objects.
2. Saturated colour is reserved for loci. Structure stays within the neutral range of the
   palette; each locus feature takes exactly one of the six accent roles
   (`red`, `amber`, `green`, `teal`, `blue`, `plum`).
3. A colour script: each room has one mood and one dominant light. The route alternates
   bright and dim, warm and cool, so rooms are not confused with each other.
4. Motion is restrained and eased. The camera glides on a rail and lingers at each locus.
   Only memory images move on their own.
5. Anti-generic checklist. None of these: default purple/blue gradients, glassmorphism
   cards, Inter on everything, unmodified drei environment presets, stock shadcn/Tailwind
   look, bloom on everything, lens flares, chromatic aberration as decoration.
6. Procedural geometry and original shaders first. Otherwise CC0 assets only, logged in
   `CREDITS.md`. No copyrighted characters or IP. Mood references are not copied.
7. Frame budget: steady 60 fps at 1440×900 on an integrated GPU. At most one shadow map
   (1024), at most two full-screen custom passes plus an optional normal pass, no
   per-frame allocations, adaptive DPR.
8. Accessibility: reduced-motion mode, keyboard-only navigation, overlay text contrast of
   at least 4.5:1, body text no smaller than 16 px.

## Direction A: Ink & Vellum (`style: ink`, theme `ink-vellum`)

**Idea.** The palace is a page from a Renaissance memory treatise that you can walk into:
iron-gall ink line over calfskin vellum, with thin mineral-pigment washes.

- **Palette.** Vellum `#efe4c8`, vellum shade `#d6c6a0`, ink `#2b2018`, soft ink `#6e5a45`.
  Pigments: vermilion `#b8402a`, orpiment `#c8922e`, verdigris `#4f8a6b`, azurite teal
  `#3f7f86`, lapis `#34508f`, madder plum `#7b3f5e`.
- **Shading.** No PBR. Two or three flat tones (lit, half, shade) with a soft, slightly
  irregular boundary, like a wash laid with a brush. Pigment pools a little darker at the
  edge of a wash. Structure is nearly paper-coloured; only locus features carry pigment.
- **Line.** Ink outlines from depth and normal discontinuities, about 1.5 to 2.5 px,
  with a slight hand wobble and varying weight (heavier on silhouettes, lighter on creases).
- **Shade marks.** Sparse diagonal hatching in the darkest tone, as in an engraving.
- **Paper.** Vellum grain and fibre across the whole frame, darkening gently toward the
  corners like an aged page. The sky is bare vellum.
- **Development.** Undeveloped: line on bare vellum, no wash. Developed: washes and pigment.
- **Type.** Display: IM Fell English (italic and small caps). Text: EB Garamond.
- **Risk.** Line quality. Thin, aliased or flickering lines would look cheap.

## Direction B: Nocturne Atrium (`style: nocturne`, theme `nocturne-atrium`)

**Idea.** A Roman atrium at blue hour. The sky through the roof opening is the only cool
light; each locus has its own small warm lamp. A homage to Simonides and Cicero.

- **Palette.** Night `#0f1a2e` to dusk `#27406b`, marble `#c9c3b8` (reads blue-grey under
  the sky), lamp `#ffb869`, deep water `#0d2a3a`. Accents as jewel tones that can glow:
  `#d0553f`, `#f0a94a`, `#6fae7a`, `#4fb3b0`, `#5f8fe0`, `#a070c0`.
- **Shading.** Physically based but restrained: cool sky light from above, one soft shadow
  from the roof opening, a warm point light per locus, procedural marble veining, still
  water with a Fresnel highlight and slow ripples, a few dust motes in the light shaft,
  thin floor haze, a handful of stars through the opening.
- **Post.** Filmic tone map, a soft vignette, and bloom only on lamps and the `glow` slot.
- **Development.** Undeveloped: the locus lamp is out and its feature is cold stone.
  Developed: the lamp is lit and the pigment shows.
- **Type.** Display: Cormorant Garamond. Text: Alegreya Sans.
- **Risk.** Looking like a generic three.js night scene. Specificity (veining, the colour
  script, the lamps) has to carry it. Also the most expensive of the three to render.

## Direction C: Cyanotype Blueprint (`style: blueprint`, theme `cyanotype`)

**Idea.** The palace is an architect's cyanotype: white line on Prussian blue. As you
master items, the drawing develops into full colour around their loci. Visual progress is
memory progress.

- **Palette.** Prussian blue `#0f3057`, paper blue `#16406e`, line `#e6f0fa`, soft line
  `#8fb3d6`. Developed colours: cream `#f2e8cf` with pigments `#e0604a`, `#f2b84b`,
  `#7fc08a`, `#5fc7c0`, `#8fb0ff`, `#c08fd8`.
- **Shading.** Flat fills in close blue values, shifted slightly by surface direction so
  planes separate. Crisp, clean technical lines (1 to 1.5 px, no wobble). Fine 45-degree
  drafting hatch on the shade side. A faint one-metre drafting grid on the floor.
- **Development.** Undeveloped: pure blueprint. Developed: cream paper and pigment, with
  the white line turning to a dark ink line so it stays legible.
- **Type.** Display: Space Grotesk or a drafting-style face. Text: IBM Plex Sans.
- **Risk.** Can read as cold or as a "tech demo" wireframe if the developed state is not
  rich enough.

## Decision

Pending. Lead's recommendation and the team's pick are recorded here once made.
