# Memoria

**Tagline:** Paste what you need to learn. An AI architect turns it into a memory palace you walk to encode and walk again to recall.

## Inspiration

Students memorize ordered, discrete material all the time: anatomy, vocabulary, formulas. The method of loci suits that kind of material, and its oldest surviving description was written around the 80s BCE. It asks a lot up front: a palace, a fixed route, and a vivid image for every item. We wanted to remove that setup and add what the technique lacks on its own, testing and spaced review.

<!-- Alex: add two sentences here in your own words before submitting. You teach competition math: what did you watch students fail to remember, and why did that make you want to build this? The section reads complete without them. -->

## What it does

Paste a list or raw notes. The Palace Architect picks the facts, drafts one image per fact, and places each on a fixed route through a 3D palace of twelve places in three rooms. You approve, rewrite or regenerate every image. You walk the route to encode, then walk it again with the images hidden, answering at each place before anything is revealed. Your results schedule reviews at growing intervals (Leitner boxes). The palace begins as a line drawing, and colour washes in around the places you remember.

Judge Mode shows the whole loop in about two minutes with the eight carpal bones of the wrist, and it runs with the network off.

## How we built it

React Three Fiber and three.js (WebGL2) with TypeScript, Vite and zustand: a static site for Vercel with one serverless function. Layout, Theme (JSON tokens) and Style (shader code) are separate, so any palace works with any look. The look is a custom non-photorealistic pipeline: flat watercolour washes, ink outlines found from depth and surface direction, and paper grain, with no lights or shadow maps. A shared "development field" tells every material how well the nearest place has been learned.

The Architect is a small agent loop on the Claude API. It **plans** (which facts, which room), **acts** (drafts an image for each fact), **checks** (a second, strict pass tests every image for concreteness, action, distinctness from its neighbours and a stated link to the meaning, and rewrites the ones that fail) and **adapts** (when you miss an item in recall, it proposes a stronger image). The key stays on the server. If the function cannot be reached, a deterministic offline planner takes over. <!-- Before submitting: the live model path is built but had not been run with a real key when this was drafted. Once it has been tested, delete this comment. If it has not, add the sentence: "The live model path is built; the demo runs on the offline planner." -->

The code was written with Claude Code agents under the team's direction during the hackathon window.

## Challenges we ran into

- Hatching was anchored to the screen and crawled as the camera moved, so we anchored it to the world.
- Our first Judge Mode ran 111 seconds against a 60 to 90 second plan. We made the button say "2 minutes" and added a shorter variant for live pitches (about 80 seconds: eight places, then a spot check of four).
- Venue Wi-Fi is unreliable, so everything on the demo path had to run from fixtures.
- Several popular claims about memory did not check out, so we changed the design instead of repeating them.

## Accomplishments that we're proud of

- The full loop (compose, familiarize, encode, recall, review) runs on the real palace, and the demo path runs offline.
- A palace that visibly fills in as you learn it.
- Every claim we make traces to a source in our research brief, with its caveats.

## What we learned

The palace only helps you encode. What the literature shows makes memories last is retrieval practice and spacing, so those are the core loop. Two meta-analyses report medium-to-large gains in list recall from the method of loci (g = 0.65; d = 0.88), and both flag a high risk of bias. Research on supplied versus self-made images is mixed, so you see every image before it is placed and can rewrite any of them. We have not run an efficacy study of Memoria.

<!-- Before submitting: if the venue comparison test was run, add one sentence here with n and the two means, for example: "Informal test at the venue, n = 5: 6.2 of 8 with the palace against 4.0 of 8 with a plain list, on two eight-item lists swapped between volunteers, tested in the same sitting." Report it as it came out. -->

## What's next for Memoria

A second palace layout, so a second topic gets its own route, then a palace editor, shareable links and WebXR. Later: your own home as a palace from a phone scan, a community theme gallery, classroom mode and multilingual vocabulary packs.

## Built with

TypeScript, React, three.js, React Three Fiber, drei, postprocessing, GLSL, WebGL2, zustand, Vite, Zod, Claude API (Anthropic), Vercel, Claude Code

## Tracks

- Education (main track)
- Amazon: Best Practical AI Innovation
- ChatOverflow Agent Leaderboard

## Team and Discord usernames

- Alex Wang: alexwin0806
- Richard Xu: msmn7
- Eric Wang: _significant
- Eric Chen: ericchen8492

## Links

- Repo: https://github.com/AlexWin0806/memoria
- Live demo: <!-- add the Vercel URL -->
- Video: <!-- add the YouTube link -->

## Before submitting (delete this section)

1. Inspiration: add Alex's two sentences.
2. How we built it: resolve the note about the live model path.
3. What we learned: add the venue test sentence, or leave it out.
4. Links: live demo URL and video link.
5. On Devpost itself: track Education; special tracks Amazon Best Practical AI Innovation and ChatOverflow Agent Leaderboard; all four Discord usernames.
