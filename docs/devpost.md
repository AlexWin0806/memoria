# Memoria

**Tagline:** Paste your notes. Memoria asks what you already know, shows the gaps as a palace in ruins, and you rebuild it by learning.

<!-- This draft describes the site as it was at Sat 9:30 PM ET. Everything is written as live. Two kinds of comment are left for the person who submits. (1) "Confirm on the live site": a sentence that depends on the last batch of the evening, which was still under test at 9:30 PM. If the item is not on the live site at submission, delete the sentence the comment points at. (2) "to fill in": a figure or a result that only a person can supply. Search for both before submitting. -->

## Inspiration

Students memorize ordered, discrete material all the time: anatomy, vocabulary, formulas. The method of loci suits that kind of material, and its oldest surviving description was written around the 80s BCE. It asks a lot up front: a palace, a fixed route, and a vivid image for every item. We wanted to remove that setup and add what the technique lacks on its own, testing and spaced review.

Halfway through the hackathon we looked harder at what already exists. Memory-palace apps with AI help and with scheduled reviews are out there (we looked most closely at Mnemorium and memoryOS), so neither could be our difference. We asked what a study tool should do first, and our answer was: find out what you do not know. So the learner became the architect. The palace is in ruins wherever you do not know the material yet, and you rebuild it by learning.

<!-- Alex: add two sentences here in your own words before submitting. You teach competition math: what did you watch students fail to remember, and why did that make you want to build this? The section reads complete without them. -->

## What it does

Paste a list or raw notes, or upload a PDF. The PDF's text is read in your browser and the file never leaves your device. The Palace Architect picks the facts, sorts them into categories, drafts one image per fact, and places each on a fixed route through a 3D palace with one room per category, up to 30 places in 6 rooms. You choose the style of the palace, or let the Architect choose: a Gothic library, a Zen garden, or a Workshop, where machines stand as stations along a channel and which suits processes. You approve, rewrite or regenerate every image.

Then you walk it three ways:

- **Survey.** The first time you open a deck you answer one question at each place, or press "I don't know". The right answer is not shown; the place stands or falls as you answer. Each place you miss collapses into ruin as you watch, and a dashed outline of the whole object stays.
- **Study.** The study walk follows in the same session. Each image appears at its place, with your survey answer beside the right one, and the place is rebuilt inside a scaffold.
- **Recall.** The same route with the images hidden. You answer at each place before its image is shown again, and a right answer restores the place.

Your results schedule reviews at growing intervals (Leitner boxes). A Progress view keeps every survey, recall and review walk, with the survey labelled "before study", and lists your weakest places. A legend names the states of a place: in ruins, standing (answered in the survey, not yet recalled), under repair, restored, and needs another repair. There are no points, badges or streaks.

The state of a place follows your graded answers, not your own rating. If you overrule a typed miss with "I was right", the answer is shown as self-marked and the place stays under repair until the next real recall. A place you answered right in the survey is "standing", not "restored", until you recall it after study.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): the paragraph above. Type a wrong answer on a recall walk, press "I was right", and check that the place is under repair and not restored; take a survey, answer one place right, and check that Progress calls it "standing". If either fails, delete the paragraph. -->

You can add facts later with "Add to this palace": nothing that already stands moves, and only the new places are surveyed and studied. "Edit" changes a saved palace in place, and a changed fact sends its place back for repair. When your notes describe a process, the walk also asks what happens to each step next and has you put the steps in order; that is scored apart from the places, and the links between the steps are drawn on the floor. Every new palace is furnished differently, so two palaces in one style share the architecture and are not the same route.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): (1) the last sentence above: build two palaces in the Gothic library and check that the first places hold different objects; if they are the same, delete the sentence. (2) "what happens to each step next": walk "The five stages of the cell cycle" and check that the question reads "What happens to Interphase next?" and that no feedback names the next place; if it still asks "What does Interphase become?", write "asks what each step becomes" instead. -->

Exam Mode asks the same facts the way an exam does: on a plain sheet, with the palace and the images hidden and the questions shuffled, from term to meaning or from meaning to term. Afterwards you walk back to exactly the places you missed. An exam is recorded in Progress and changes no review schedule.

Judge Mode shows the loop in about two minutes with the eight carpal bones of the wrist: the palace starts in ruins, each place is rebuilt as you study it, and a right answer restores it. A shorter run for live demos, `/?judge=short`, does the same with the five stages of the cell cycle in one hall of the Workshop, where each station is linked to the next on the floor and the last back to the first; to stay short it asks the five places and not the links. It measured 67 seconds with a script answering on a loaded test machine, and its button says 75. Both run with the network off. Two showcase decks show generated palaces: a Spanish verb in three tense rooms, and the five stages of the cell cycle as a process with links between its steps; walked from the list of palaces, the cell cycle asks what happens to each stage next and has you put the stages in order. A built-in comparison test has a volunteer learn one list as plain text and another in the palace, with the lists and the order swapped between volunteers.

<!-- Confirm on the live site (deployed at about 3:30 AM Sun): open `/?judge=short` and look for the "Try it in 75 seconds" button, and check that the list of palaces shows "The five stages of the cell cycle" and no citric acid cycle deck. If the short run is not there, delete the three sentences from "A shorter run" to "Both run with the network off" and write "It runs with the network off." instead; in the next sentence write "the citric acid cycle as a process with links between its steps" in place of the cell cycle, and delete everything after its semicolon. -->

## How we built it

React Three Fiber and three.js: a static site with one serverless function. Layout, Theme (JSON tokens) and Style (shader code) are separate, so any palace works with any look. The look is a custom non-photorealistic pipeline: watercolour washes, ink outlines found from depth and surface direction, and paper grain.

Palaces are generated from a short specification: an architectural kit, a seed and, for each room, its name and its number of places. Extending a palace only adds places to rooms that have space and rooms to the end, so nothing that exists moves; a script checks that over 434 palaces and 84 extensions. The seed decides which object stands at which place, so no object stands twice in a palace and two palaces in one style are furnished differently: on average about 6% of their places hold the same object, measured over every pair of 160 seeds in each style. Each place carries one number for how whole it is, set only by the learner's graded answers, and the scene draws it as ruins, a scaffold or the finished object.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): the seed. If two new palaces in one style are furnished the same on the live site, delete "a seed" and the sentence that starts "The seed decides", and write instead: "There are 28 landmarks that suit any kit, and each kit adds its own, so the 30 places of a full palace are 30 different objects." -->

The Architect is a small agent loop on the Claude API, built to **plan** (which facts, which categories, whether they are separate facts or the steps of a process), **write** (an image for each fact), **check itself** (a second, strict pass tests every image for concreteness, action, distinctness and a stated link to the meaning, and rewrites the ones that fail) and **adapt** (when you miss an item, it proposes a stronger image). In Part 2 it also **structures** (categories become rooms, and links between facts are kept only where the notes support them) and **extends** (new facts are added without changing any image or place that already stands). The key stays on the server. If the function cannot be reached, a deterministic offline planner drafts the images instead, and says so. Judge Mode uses neither: it runs on built-in decks whose images we wrote by hand, so the demo never depends on the network.

We ran the Architect on the deployed site. In single runs, not averages: a 12-fact palace was proposed in 6 to 14 seconds; a 30-fact palace in 6 rooms took 16 to 17 seconds as eight short parallel requests; a six-step process was recognised as a process and laid out as stations in the Workshop in 11 to 13 seconds; adding two facts to a palace took 7 to 9 seconds and touched nothing that already stood.

PDFs are read in the browser with PDF.js, loaded only when a PDF is chosen. Headings are marked, a table row is one fact, a slide footer that carries a page number is left out, a long PDF lets you choose the pages that fit the Architect's 12,000-character limit, and scans, locked files and damaged files are refused in words. It has been tested on PDFs we generated, not on real lecture PDFs.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): "a table row is one fact, a slide footer that carries a page number is left out". If not live, delete those two clauses. -->

<!-- to fill in: if a teammate tried two or three real course PDFs, replace the last sentence of the PDF paragraph with what happened. -->

After one visit online the site keeps an offline copy (a service worker we wrote by hand), so a reload with the network off still opens the app and Judge Mode runs. We have tested that in headless Chromium only.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): the offline copy. On the demo laptop: open the site once on Wi-Fi in a normal window, wait ten seconds, turn Wi-Fi off, reload. The title screen must appear. If it does not, delete the paragraph above. If it does, you may replace "in headless Chromium only" with the browser you used. -->

In the last hours before submission we smoothed the camera's turns (the view follows the rail with about a tenth of a second of damping, so corners reach the screen as rounded turns; glides take as long as before), gave the Gothic library darker grey stone and the Workshop brown wood, made the Architect's endpoint accept JSON requests only, so that a page on another site cannot have its visitors' browsers spend our key with plain-text requests, and made a full browser storage say that nothing was saved when a palace is placed, where it used to fail silently. A break test of the build with the new camera and palettes found no blocker; the silent failure to save was its one major finding, and the fix came after it.

The code was written with Claude Code agents under the team's direction during the hackathon window, and checked by automated end-to-end tests and by four independent QA reviews. On the evening's builds the walk-through suite passed 20 of 20 cases, the Compose suite 11 of 11, the PDF suite 7 of 7 and the comparison-test suite 3 of 3. The fourth review judged Part 2 safe to demo with precautions and found no blocker; it found twelve major issues, nine of which we addressed in code the same evening and three in our own documents. The agents used ChatOverflow throughout: they searched it when they hit tooling problems and posted short, generic field notes back. Not yet checked: frame rate and motion on a real laptop, real lecture PDFs, screen readers, and the offline copy in any browser but Chromium.

## Challenges we ran into

- We changed direction at 2:00 PM on Saturday with a demo-ready build in hand. We kept that build as a fallback and set a time to decide between the two.
- A palace has to grow without moving anything the learner has already placed. We made the palace's specification append-only and wrote a script that checks it over 434 palaces and 84 extensions.
- Some networks cut a request off at about 30 seconds, and a 30-fact palace does not fit in one such request, so the Architect plans it as eight short requests in parallel.
- The research did not support several things we wanted to say about Part 2, for example that watching a palace rebuild keeps you motivated. We say instead that the repair display, the rooms and the links are our design and are untested.
- A reviewer with no knowledge of the build caught us saying that "nothing is revealed" during the survey. The place stands or falls as you answer, so the verdict is shown. What is not shown is the right answer, and that is what we now say.
- The same review found that every palace in one style had the same objects in the same order, against our own rule of one topic per route. Each new palace is now furnished from its own seed. We have not tested whether that is enough to keep two topics apart.
- The fact-check of our two showcase decks of Saturday night (the Spanish verb and the citric acid cycle) found nothing wrong, but nine English glosses in the Spanish deck fitted more than one verb form ("you ate"). The gloss is the quiz question, so each now names the person it means.
- Hatching was anchored to the screen and crawled as the camera moved, so we anchored it to the world.
- Our first Judge Mode ran 111 seconds against a 60 to 90 second plan. Its button now says "2 minutes", and a variant for live pitches says "90 seconds". With the palace starting in ruins that variant measured 69.9 seconds with a script answering within two seconds on a loaded test machine, and 80 to 94 seconds in earlier runs under heavier load. For the live pitch we then added a shorter run, the five stages of the cell cycle in the Workshop with every station asked, which measured 67 seconds in the same way; its button says "75 seconds".
- Our build machine draws only a few frames a second, so the demo footage is rendered offline, frame by frame on a virtual clock, and nothing has been seen in motion on a real GPU.

<!-- Confirm on the live site (batch under test at Sat 9:30 PM): the seed, for the sixth bullet above. If it is not live, end the bullet after "one topic per route" and add "That is not fixed yet." -->

<!-- to fill in: the timing of the pitch run on a quiet machine with a person answering. Once it exists, add it to the Judge Mode bullet: "With a person answering on a laptop it took N seconds." -->

## Accomplishments that we're proud of

- The full loop (compose, survey, study, recall, review) runs on generated palaces in three styles and on the handcrafted one, and the demo path runs offline.
- A palace that shows what your answers showed: ruins where you did not know, a scaffold where you have studied, the finished place where you have recalled.
- Palaces built from the categories in the learner's own notes or PDF, up to 30 places, that can be extended and edited without moving what already stands.
- Process decks that ask how each step leads on, and an Exam Mode that asks the facts with the palace hidden.
- Every claim we make traces to a source in our research brief, with its caveats, and the Spanish showcase deck and the citric acid cycle deck it was first paired with were fact-checked against standard references through search extracts. The cell cycle deck, added early on Sunday, has not been checked that way yet.

## What we learned

The palace only helps you encode. What the literature shows makes memories last is retrieval practice and spacing, so those are the core loop. Two meta-analyses report medium-to-large gains in list recall from the method of loci (g = 0.65; d = 0.88), and both flag a high risk of bias. Research on supplied versus self-made images is mixed, so you see every image before it is placed and can rewrite any of them.

For Part 2 we learned which of our new ideas has evidence and which does not. Memoria asks before it teaches: in laboratory studies, trying to answer before studying improved later memory for that answer even when the attempt failed, and a meta-analysis of questions asked before text and video lessons puts the gain at g = 0.54 for the facts asked about and about zero for anything else; the gain depends on studying the answers afterwards, and none of this was tested in a memory palace or in Memoria. People are poor judges of what they know, and in one pair of studies students who over-rated their answers remembered less two days later, so Memoria decides which places need repair from your answers, not from how confident you feel. The ruins are a map of your answers, not a reward system. Evidence that progress displays improve learning is thin (a 2024 review of 38 dashboard studies found no reliable gain in achievement), so we make no claim that the repair mechanic improves learning; we have not tested it.

We have not run an efficacy study of Memoria, and Part 2 adds three ideas (repair, rooms, links) that no published study has tested in a memory palace. The comparison test is built, but no people have done it yet.

<!-- Before submitting: if the venue comparison test was run, add one sentence here with n and the two means, for example: "Informal test at the venue, n = 5: 6.2 of 8 with the palace against 4.0 of 8 with a plain list, on two eight-item lists swapped between volunteers, tested in the same sitting." Report it as it came out. -->

## What's next for Memoria

First, run the comparison test and the survey with people, and watch the palace on real laptops: nothing has been seen in motion on a real GPU.

After that, as plans: learning environments for other kinds of knowledge, from the team's notes (for systems, decisions, comparisons, timelines, simulations and proofs); a drill on commonly confused items; a palace built from a returned exam, where the questions you missed become a short walk; your own home as the palace; reading scanned PDFs; and an optional "things you know well" field, so that images draw on what you already know. Further out: a palace editor, shareable links, WebXR, classroom mode and multilingual vocabulary packs. We do not plan worlds from existing films, games or books: copyrighted characters and settings are out.

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
- Footage of the short run (silent, rendered offline): https://github.com/AlexWin0806/memoria/blob/main/docs/media/demo-short.mp4 (to fill in when rendered)
- Video: <!-- add the YouTube link -->

<!-- media: re-rendered from the Part 2 build on Saturday night: `demo-pitch.mp4` (80.6 s, the true pitch run), `survey-collapse.gif`/`.mp4`, `repair.gif`/`.mp4`, `encode.gif`, `recall.gif`/`.mp4`, and the stills `ui-title`, `ui-survey`, `ui-encode`, `ui-recall`, `ui-results`, `ui-compose`, `ui-process`, `ui-progress` (seeded history), `ui-exam`. Best gallery picks: survey-collapse.gif, repair.gif, palace-gothic-library.png, palace-links-process.png, ui-compose.png, ui-process.png. For the gallery, the stills that already show Part 2 are docs/media/place-in-ruins.png, place-under-repair.png, palace-repair-mix.png, palace-gothic-library.png, palace-zen-garden.png, palace-workshop.png and palace-links-process.png. -->

<!-- media, Sun 3:00 AM: `ui-process.png` and `palace-links-process.png` showed the citric acid cycle deck, which is no longer on the list of palaces; they are being re-rendered for the cell cycle under the same file names. Check that the copies you upload show the cell cycle. `demo-pitch.mp4` shows the eight-bone pitch run, which is still true of `/?judge=pitch`. `demo-short.mp4`, footage of `/?judge=short`: (to fill in when rendered). -->

## Before submitting (delete this section)

1. Inspiration: add Alex's two sentences.
2. Confirm on the live site, after the last deployment, each item of the batch that was under test at Sat 9:30 PM. Each has a comment in the text that starts "Confirm on the live site" and says what to delete if the item is not there.
   1. Judge screens say what the ruins mean: open `/?judge` and `/?judge=pitch` and look for "In ruins: you have not learned these yet. Each place is rebuilt as you study it." (Nothing in this text depends on it; the pitch does.)
   2. The survey moves on by itself after each answer: one press per place. (Nothing in this text depends on it.)
   3. "I was right" leaves its place under repair, and a place answered right in the survey is "standing", not "restored" (What it does).
   4. Process questions ask what happens to a step next ("What happens to Interphase next?", walking "The five stages of the cell cycle" from the list) and never show the next place's answer (What it does).
   5. Two new palaces in one style are furnished differently (What it does, How we built it, Challenges).
   6. The offline copy: on the demo laptop, open the site once on Wi-Fi, wait ten seconds, turn Wi-Fi off, reload; the title screen must appear (How we built it).
   7. PDF: a slide footer with a page number is left out, and a table row is one fact (How we built it).
   8. The offline planner: a `term - meaning` line is one fact, `label: a -> b -> c` is a chain, and room names are not cut in the middle of a phrase. (Nothing in this text depends on it.)
3. Confirm that what was live at 9:30 PM is still on the live site: the choice of style on the Compose screen, "Add to this palace", "Edit", process decks, links drawn on the floor, Exam Mode. Text that describes a feature that is not on the live site does not go in.
4. Fill in the timing of the pitch run on a quiet machine with a person answering (Challenges). Search for "to fill in".
5. Media: re-rendered on Saturday night (see the comment under Links). Choose the gallery images, and upload `demo-pitch.mp4` to YouTube for the video link if there is no narrated video.
6. Fill in the result of trying real course PDFs and the ChatOverflow note count, or leave the present wording.
7. What we learned: add the venue test sentence, or leave it out.
8. Links: video link.
9. Read the whole text once against `docs/research.md` sections 8.5 and 9.5 ("must not say"). No "first", no "only", no "proven", and no "nothing is revealed".
10. On Devpost itself: track Education; special tracks Amazon Best Practical AI Innovation and ChatOverflow Agent Leaderboard; all four Discord usernames.
11. Open `/?judge=short` on the demo laptop once on Wi-Fi after the last deployment; time one run.
12. Delete every comment and this section.
