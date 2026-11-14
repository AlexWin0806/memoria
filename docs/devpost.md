# Memoria

**Tagline:** Paste your notes. Memoria asks what you already know, shows the gaps as a palace in ruins, and you rebuild it by learning.

<!-- This draft describes the site as it was at Sat 5:45 PM ET: the first wave of Part 2 is live (survey, repair, Judge Mode in ruins, Progress, generated palaces in the Gothic library style, PDF upload, the new Architect, two showcase decks). Everything that was only merged or still being built is inside a comment that starts "Part 2 state". Search for "Part 2 state" and for "to fill in" before submitting. -->

## Inspiration

Students memorize ordered, discrete material all the time: anatomy, vocabulary, formulas. The method of loci suits that kind of material, and its oldest surviving description was written around the 80s BCE. It asks a lot up front: a palace, a fixed route, and a vivid image for every item. We wanted to remove that setup and add what the technique lacks on its own, testing and spaced review.

Halfway through the hackathon we looked harder at what already exists. Memory-palace apps with AI help and with scheduled reviews are out there (we looked most closely at Mnemorium and memoryOS), so neither could be our difference. We asked what a study tool should do first, and our answer was: find out what you do not know. So the learner became the architect. The palace is in ruins wherever you do not know the material yet, and you rebuild it by learning.

<!-- Alex: add two sentences here in your own words before submitting. You teach competition math: what did you watch students fail to remember, and why did that make you want to build this? The section reads complete without them. -->

## What it does

Paste a list or raw notes, or upload a PDF. The PDF's text is read in your browser and the file never leaves your device. The Palace Architect picks the facts, sorts them into categories, drafts one image per fact, and places each on a fixed route through a 3D palace with one room per category, up to 30 places in 6 rooms. You approve, rewrite or regenerate every image.

Then you walk it three ways:

- **Survey.** The first time you open a deck you answer one question at each place, or press "I don't know". Nothing is revealed. Each place you miss collapses into ruin as you watch, and a dashed outline of the whole object stays.
- **Study.** The study walk follows in the same session. Each image appears at its place, with your survey answer beside the right one, and the place is rebuilt inside a scaffold.
- **Recall.** The same route with the images hidden. You answer at each place before anything is revealed, and a right answer restores the place.

Your results schedule reviews at growing intervals (Leitner boxes). A Progress view keeps every survey, recall and review walk, with the survey labelled "before study", and lists your weakest places. A legend explains the three states: in ruins, under repair, restored. There are no points, badges or streaks.

Judge Mode shows the loop in about two minutes with the eight carpal bones of the wrist: the palace starts in ruins, each place is rebuilt as you study it, and a right answer restores it. It runs with the network off. Two showcase decks show generated palaces: a Spanish verb in three tense rooms, and the citric acid cycle as a process with links between its steps. A built-in comparison test has a volunteer learn one list as plain text and another in the palace, with the lists and the order swapped between volunteers.

<!-- Part 2 state (Sat 5:45 PM): merged on the working branch, NOT on the live site. When the Zen garden and the Workshop are live AND the Compose screen lets the learner choose, add after "up to 30 places in 6 rooms": "You choose the style of the palace: a Gothic library, a Zen garden, or a Workshop, where machines stand as stations along a channel and which suits processes." If only the styles are live and the choice is not, say "The Architect suggests a style" instead of "You choose". -->

<!-- Part 2 state (Sat 5:45 PM): BEING BUILT. Add each sentence only if the feature is on the live site at submission. (1) Extension: "You can add facts to a palace later with 'Add to this palace'; nothing that already stands moves, and only the new places are surveyed and studied." (2) Process mode: "In a process deck the walk also asks what each step becomes, and you put the steps in order; that is scored apart from the places." (3) Links: "Links between facts are drawn on the floor between their places." -->

## How we built it

React Three Fiber and three.js: a static site with one serverless function. Layout, Theme (JSON tokens) and Style (shader code) are separate, so any palace works with any look. The look is a custom non-photorealistic pipeline: watercolour washes, ink outlines found from depth and surface direction, and paper grain.

Palaces are generated from a short specification: an architectural kit and, for each room, its name and its number of places. Extending a palace only adds places to rooms that have space and rooms to the end, so nothing that exists moves; a script checks that over 63 palaces and 54 extensions. There are 28 landmarks that suit any kit, and each kit adds its own, so the 30 places of a full palace are 30 different objects. Each place carries one number for how whole it is, set only by the learner's answers, and the scene draws it as ruins, a scaffold or the finished object.

The Architect is a small agent loop on the Claude API, built to **plan** (which facts, which categories, whether they are separate facts or the steps of a process), **write** (an image for each fact), **check itself** (a second, strict pass tests every image for concreteness, action, distinctness and a stated link to the meaning, and rewrites the ones that fail) and **adapt** (when you miss an item, it proposes a stronger image). In Part 2 it also **structures** (categories become rooms, and links between facts are kept only where the notes support them) and **extends** (new facts are added without changing any image or place that already stands). The key stays on the server. If the function cannot be reached, a deterministic offline planner drafts the images instead, and says so. Judge Mode uses neither: it runs on built-in decks whose images we wrote by hand, so the demo never depends on the network.

We ran the Architect on the deployed site. In single runs, not averages: a 30-fact palace in 6 rooms took 16 seconds as eight short parallel requests, and the self-check rewrote 19 of the 30 first drafts; a six-step process was recognised as a process, with every step linked, in 13 seconds; adding two facts to a palace took 9 seconds and touched nothing that already stood.

<!-- to fill in: replace the three figures above with the final ones from the Lead's second pass, if they changed. -->

PDFs are read in the browser with PDF.js, loaded only when a PDF is chosen. Headings are marked, a long PDF lets you choose the pages that fit the Architect's 12,000-character limit, and scans, locked files and damaged files are refused in words. It has been tested on PDFs we generated, not on real lecture PDFs.

<!-- to fill in: if a teammate tried two or three real course PDFs, replace the last sentence with what happened. -->

The code was written with Claude Code agents under the team's direction during the hackathon window, and checked by automated end-to-end tests and by three independent QA reviews of the build from before Part 2. The agents used ChatOverflow throughout: they searched it when they hit tooling problems and posted short, generic field notes back. Not yet checked: frame rate and motion on a real laptop, real lecture PDFs, and screen readers.

<!-- to fill in: QA review 4 (of Part 2) was planned for Sat 10:00 PM. If it ran, say "four independent QA reviews" and drop "of the build from before Part 2". -->

## Challenges we ran into

- We changed direction at 2:00 PM on Saturday with a demo-ready build in hand. We kept that build as a fallback and set a time to decide between the two.
- A palace has to grow without moving anything the learner has already placed. We made the palace's specification append-only and wrote a script that checks it over 63 palaces and 54 extensions.
- Some networks cut a request off at about 30 seconds, and a 30-fact palace does not fit in one such request, so the Architect plans it as eight short requests in parallel.
- The research did not support several things we wanted to say about Part 2, for example that watching a palace rebuild keeps you motivated. We say instead that the repair display, the rooms and the links are our design and are untested.
- The fact-check of our own showcase decks found nothing wrong, but nine English glosses in the Spanish deck fitted more than one verb form ("you ate"). The gloss is the quiz question, so each now names the person it means.
- Hatching was anchored to the screen and crawled as the camera moved, so we anchored it to the world.
- Our first Judge Mode ran 111 seconds against a 60 to 90 second plan. Its button now says "2 minutes", and a variant for live pitches says "90 seconds". With the palace starting in ruins that variant measured 80 seconds on a heavily loaded test machine.
- Our build machine draws only a few frames a second, so the demo footage is rendered offline, frame by frame on a virtual clock, and nothing has been seen in motion on a real GPU.

<!-- to fill in: the quiet-machine timing of the pitch run. Replace "measured 80 seconds on a heavily loaded test machine" with the quiet-machine figure once it exists. -->

## Accomplishments that we're proud of

- The full loop (compose, survey, study, recall, review) runs on generated palaces and on the handcrafted one, and the demo path runs offline.
- A palace that shows what your answers showed: ruins where you did not know, a scaffold where you have studied, the finished place where you have recalled.
- Palaces built from the categories in the learner's own notes or PDF, up to 30 places, that never move what already stands.
- Every claim we make traces to a source in our research brief, with its caveats, and both showcase decks were fact-checked against standard references through search extracts.

## What we learned

The palace only helps you encode. What the literature shows makes memories last is retrieval practice and spacing, so those are the core loop. Two meta-analyses report medium-to-large gains in list recall from the method of loci (g = 0.65; d = 0.88), and both flag a high risk of bias. Research on supplied versus self-made images is mixed, so you see every image before it is placed and can rewrite any of them.

For Part 2 we learned which of our new ideas has evidence and which does not. Memoria asks before it teaches: in laboratory studies, trying to answer before studying improved later memory for that answer even when the attempt failed, and a meta-analysis of questions asked before text and video lessons puts the gain at g = 0.54 for the facts asked about and about zero for anything else; the gain depends on studying the answers afterwards, and none of this was tested in a memory palace or in Memoria. People are poor judges of what they know, and in one pair of studies students who over-rated their answers remembered less two days later, so Memoria decides which places need repair from your answers, not from how confident you feel. The ruins are a map of your answers, not a reward system. Evidence that progress displays improve learning is thin (a 2024 review of 38 dashboard studies found no reliable gain in achievement), so we make no claim that the repair mechanic improves learning; we have not tested it.

We have not run an efficacy study of Memoria, and Part 2 adds three ideas (repair, rooms, links) that no published study has tested in a memory palace. The comparison test is built, but no people have done it yet.

<!-- Before submitting: if the venue comparison test was run, add one sentence here with n and the two means, for example: "Informal test at the venue, n = 5: 6.2 of 8 with the palace against 4.0 of 8 with a plain list, on two eight-item lists swapped between volunteers, tested in the same sitting." Report it as it came out. -->

## What's next for Memoria

First, run the comparison test and the survey with people. Then finish what was half-built when we submitted: choosing the style of a palace (a Zen garden and a Workshop for processes are built), adding facts to a palace that is already learned, a process mode that asks what each step becomes and has you put the steps in order, and links drawn on the floor between places.

<!-- Part 2 state: delete from the sentence above whatever is live at submission, and add it to "What it does" instead. -->

After that, as plans: learning environments for other kinds of knowledge (a systems garden where changing one variable shows its consequences, a decision labyrinth, a comparison gallery, a timeline, a simulation, a proof workshop); an optional "things you know well" field, so that images draw on what you already know; your own home as the palace; reading scanned PDFs; a palace editor, shareable links and WebXR; classroom mode and multilingual vocabulary packs. We do not plan worlds from existing films, games or books: copyrighted characters and settings are out.

## Built with

TypeScript, React, three.js, React Three Fiber, drei, postprocessing, GLSL, WebGL2, zustand, Vite, Zod, PDF.js, Claude API (Anthropic), Vercel, Playwright, Claude Code, ChatOverflow

## Tracks

- **Education (main track).** A study tool for ordered, discrete material that starts from what the learner does not know, makes every pass a retrieval attempt, and schedules reviews.
- **Amazon: Best Practical AI Innovation.** The Architect plans, writes, checks itself and adapts. It also structures the material (categories, links, facts or process) and extends a palace without disturbing what is already learned. The key stays on the server, and the demo runs offline from hand-written fixtures.
- **ChatOverflow Agent Leaderboard.** Our coding agents used ChatOverflow throughout the build and gave generic field notes back.

<!-- to fill in: the number of ChatOverflow notes at submission (five had been posted by Sat 12:55 PM). Add it to the ChatOverflow line only if you have the real count; do not round up. -->

## Team and Discord usernames

- Alex Wang: alexwin0806
- Richard Xu: msmn7
- Eric Wang: _significant
- Eric Chen: ericchen8492

## Links

- Repo: https://github.com/AlexWin0806/memoria
- Live demo: https://memoria-five-kappa.vercel.app
- Demo footage (silent, rendered offline): https://github.com/AlexWin0806/memoria/blob/main/docs/media/demo-pitch.mp4
- Video: <!-- add the YouTube link -->

<!-- to fill in: the demo footage, the GIFs and the ui-*.png stills show the build from before Part 2 (no ruins, no scaffolds). Do not submit the footage link until it has been re-rendered. For the gallery, the stills that already show Part 2 are docs/media/place-in-ruins.png, place-under-repair.png, palace-repair-mix.png, palace-gothic-library.png, palace-zen-garden.png and palace-workshop.png; upload the last two only if those styles are live. -->

## Before submitting (delete this section)

1. Inspiration: add Alex's two sentences.
2. Confirm which Part 2 features are live at submission. Search this file for "Part 2 state" and settle each comment: styles (Zen garden, Workshop) and the choice of style, "Add to this palace", process mode, links drawn on the floor. Text that describes a feature that is not on the live site does not go in.
3. Fill in the quiet-machine timing of the pitch run (Challenges). Search for "to fill in".
4. Re-render the media: `demo-pitch.mp4`, `encode.gif`, `recall.gif` and the `ui-*.png` stills show the build from before Part 2. Then check the footage link and choose the gallery images.
5. Fill in the final Architect figures, the result of trying real course PDFs, QA review 4, and the ChatOverflow note count, or leave the present wording.
6. What we learned: add the venue test sentence, or leave it out.
7. Links: video link.
8. Read the whole text once against `docs/research.md` sections 8.5 and 9.5 ("must not say"). No "first", no "only", no "proven".
9. On Devpost itself: track Education; special tracks Amazon Best Practical AI Innovation and ChatOverflow Agent Leaderboard; all four Discord usernames.
10. Delete every comment and this section.
