# Memoria

**Tagline:** Paste what you need to learn. An AI architect turns it into a memory palace you walk to encode and walk again to recall.

## Inspiration

> **[SLOT FOR ALEX, two sentences in your own words. You teach competition math: what did you watch students fail to remember, and why did that make you want to build this? Replace this block.]**

Students memorize ordered, discrete material all the time: anatomy, vocabulary, formulas. The method of loci suits that kind of material, and its oldest surviving description was written around the 80s BCE. It asks a lot up front: a palace, a fixed route, and a vivid image for every item. We wanted to remove that setup and add what the technique lacks on its own, testing and spaced review.

## What it does

Paste a list or raw notes. The Palace Architect picks the facts, drafts one image per fact, and places each on a fixed route through a 3D palace of twelve places in three rooms. You approve, rewrite or regenerate every image. You walk the route to encode, then walk it again with the images hidden, answering at each place before anything is revealed. Your results schedule reviews at growing intervals (Leitner boxes). The palace begins as a line drawing, and colour washes in around the places you remember.

Judge Mode shows the whole loop in about two minutes with the eight carpal bones of the wrist, and it runs with the network off.

## How we built it

React Three Fiber and three.js (WebGL2) with TypeScript, Vite and zustand: a static site for Vercel with one serverless function. Layout, Theme (JSON tokens) and Style (shader code) are separate, so any palace works with any look. The look is a custom non-photorealistic pipeline: flat watercolour washes, ink outlines found from depth and surface direction, and paper grain, with no lights or shadow maps. A shared "development field" tells every material how well the nearest place has been learned.

The Architect is a small agent loop on the Claude API. It **plans** (which facts, which room), **acts** (drafts an image for each fact), **checks** (a second, strict pass tests every image for concreteness, action, distinctness from its neighbours and a stated link to the meaning, and rewrites the ones that fail) and **adapts** (when you miss an item in recall, it proposes a stronger image). The key stays on the server. If the function cannot be reached, a deterministic offline planner takes over. The live model path is built but awaits verification with a real key (to fill in).

The code was written with Claude Code agents under the team's direction during the hackathon window.

## Challenges we ran into

- Hatching was anchored to the screen and crawled as the camera moved, so we anchored it to the world.
- Our first Judge Mode ran 111 seconds against a 60 to 90 second plan. We made the button say "2 minutes" and added a 70-second variant for live pitches.
- Venue Wi-Fi is unreliable, so everything on the demo path had to run from fixtures.
- Several popular claims about memory did not check out, so we changed the design instead of repeating them.

## Accomplishments that we're proud of

- The full loop (compose, familiarize, encode, recall, review) runs on the real palace, and the demo path runs offline.
- A palace that visibly fills in as you learn it.
- Every claim we make traces to a source in our research brief, with its caveats.

## What we learned

The palace only helps you encode. What the literature shows makes memories last is retrieval practice and spacing, so those are the core loop. Two meta-analyses report medium-to-large gains in list recall from the method of loci (g = 0.65; d = 0.88), and both flag a high risk of bias. Research on supplied versus self-made images is mixed, so editing is mandatory. We have not run an efficacy study of Memoria. Informal venue test: (to fill in).

## What's next for Memoria

A built-in comparison test (one list with the palace, one without), a second palace and theme, a palace editor, shareable links and WebXR. Later: your own home as a palace from a phone scan, a community theme gallery, classroom mode and multilingual vocabulary packs.

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
- Live demo: (to fill in)
- Video: (to fill in)
