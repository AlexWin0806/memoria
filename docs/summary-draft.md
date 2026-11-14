# Memoria

**Paste what you need to learn, and an AI architect turns it into a walkable memory palace. You walk it to encode, walk it again to recall, and the palace schedules your reviews.**

HackPrinceton Fall 2026. Main track: Education. Special tracks: Amazon Best Practical AI Innovation, ChatOverflow Agent Leaderboard.

## Links

- Repo: https://github.com/AlexWin0806/memoria
- Live demo: (pending Vercel import)
- Video (2 minutes or less): (pending)
- Devpost: (pending)

## Team

| Name | Discord |
|---|---|
| Alex Wang | alexwin0806 |
| Richard Xu | msmn7 |
| Eric Wang | _significant |
| Eric Chen | ericchen8492 |

## Problem

Students are asked to memorize ordered, discrete material all the time: anatomy, vocabulary, formulas, dates, a speech. Most re-read and cram, and most of it is gone in a week. The method of loci, the 2,500-year-old technique memory competitors still use, works for exactly this kind of material, but it has a setup cost: you need a palace, a route, and a vivid image for every item. Few students get past that.

## Solution

Memoria removes the setup cost and adds the two things loci alone lack.

1. Paste a list or your raw notes. The Palace Architect extracts the items, proposes one vivid, active image for each, and places them along a fixed route through a palace, keeping related items in the same room. You approve or rewrite every image, because images you make yourself stick better.
2. Walk the palace to encode. Each image appears at its locus.
3. Walk it again to recall. The images are hidden until you answer, so every pass is retrieval practice, not re-reading.
4. The palace schedules your reviews, and it visibly comes to life around the loci you have mastered.

Judge Mode lets anyone feel the effect in about a minute: memorize the eight carpal bones of the wrist by walking, then recall them.

## Why it serves people

Free, runs in a browser from a link, no install and no account, built to run on an ordinary laptop, usable with a keyboard only and with reduced motion. Useful to students without tutoring, language learners and anyone preparing for an exam.

## Research highlights

(Filled in from `docs/research.md` once the Researcher has verified sources. No claim goes here without a citation.)

## Screenshots

(Added at each milestone.)

## Tech stack

React Three Fiber and three.js (WebGL2) with custom GLSL shaders, TypeScript, Vite, zustand. One Vercel serverless function calls the Claude API so the key never reaches the browser. Everything on the demo path runs offline from fixtures.

## Roadmap

- Now: one handcrafted palace, one polished theme and a palette variant, the full encode / recall / review loop, Judge Mode.
- Next: more layouts and themes, ambient audio, AI-drawn memory images, a palace editor, shareable palace links, WebXR.
- Later: turn a phone scan of your own home into your palace, a community theme gallery, classroom mode where a teacher builds a palace and students walk it, multilingual vocabulary packs.

## Why we care

(Alex teaches competition math. Two or three sentences from the team go here.)
