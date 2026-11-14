# Memoria: 2-minute pitch (draft 4)

Hard limit is 2:00. The demo itself takes about 77 seconds (measured 74 to 79), so there are
about 40 seconds of speech. Two plans follow. Rehearse both once, time them, and pick one.

Before the judge arrives: open the public address
`https://memoria-five-kappa.vercel.app/?judge=pitch` (it waits on the title screen with a
"Try it in 90 seconds" button), clear the site's saved data first, and have Wi-Fi off or on;
it does not matter.

## Plan A: the judge does it (recommended if the judge is willing)

The judge feels the method work on them. One person speaks; nobody else talks.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Can you name the eight bones of your wrist, in order? Anatomy students have to. Most of us cram lists like that and lose them in a week. Press the button, and just walk and look: one strange picture at each place." (about 14 s) |
| 0:15 | Judge | **Encode walk**, eight places, about 50 s. Say nothing: talking over it makes the judge worse at it. |
| 1:05 | Speaker | "Now the pictures are gone. Three places, from memory." (3 s, while the judge presses the button) |
| 1:09 | Judge | **Spot check**, three of the eight places, multiple choice, about 23 s. Each place takes on colour when they get it right. |
| 1:32 | Speaker | "That is the method of loci, about two thousand years old. Two meta-analyses find it improves recall for lists like this, though the quality of that evidence is rated low. The catch was always the setup. Memoria builds the palace from your own notes, tests you instead of letting you re-read, and schedules the reviews. It is free and runs from a link." (about 25 s; if the judge was slow, drop the second sentence) |
| 2:00 | | Stop, even mid-sentence. |

What gets cut in Plan A: the detail of the research and the roadmap. Keep them for questions.

## Plan B: the speaker drives (if the judge would rather watch)

A second person works the laptop and the speaker talks over it. The judge sees everything but
does not feel it, so the "ah-ha" is weaker; in exchange there is time to say more.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | The same opening, ending "Watch: one strange picture at each place." Driver presses the button. |
| 0:15 | Speaker, over the encode walk | "This is the method of loci, written down about 2,100 years ago. You fix a route, and at each place you picture something vivid tied to the fact. Scaphoid means boat-shaped, so a sailboat circles the lamp. Two meta-analyses find a medium-to-large gain in recall for lists like this; both flag a high risk of bias, and a 2025 review grades the evidence low to very low." |
| 1:05 | Speaker, over the spot check | "The pictures are gone now. The place is the cue. When the answer is right, the place takes on colour: the palace paints itself in as you learn it." Driver answers two right and one wrong on purpose. |
| 1:32 | Speaker | "The catch was always the setup. Memoria builds the palace from your own notes, tests you instead of letting you re-read, and schedules reviews at growing intervals. It is free, it runs from a link, and next we want your own home to be the palace." |
| 2:00 | | Stop. |

## Timing notes

- Measured on the build of Sat 9:40 AM: encode walk about 50 s from the button, spot-check screen
  about 4 s, spot check about 21 to 24 s depending on which three places are drawn.
- To make the demo shorter, change the pitch constants in `src/flows/timing.ts`
  (`encodeSecondsPerStop` is 4; each half second off saves 4 s) and re-measure with
  `node scripts/smoke.mjs --only p --serial`. Below about 3.5 s per place the pictures cannot
  be read.
- The judge can press Space to move on sooner and P to pause. Do not tell them unless they ask.
- If something goes wrong, `docs/media/demo-pitch.mp4` is silent footage of this exact run.

## If asked

- **Does it work?** "We have not run an efficacy study of Memoria. The technique is well studied; our own evidence is n = (fill in) people at this venue, informal: (fill in) of 8 with the palace against (fill in) of 8 with a plain list, on two eight-item lists swapped between volunteers so that each list had its turn in the palace, tested in the same sitting." Drop this sentence if the venue test was not run.
- **What is the AI doing?** "For your own notes, the Architect is built to plan (which facts, which room), write the images, check itself (a second pass that scores each image for concreteness, action, distinctness and its tie to the meaning) and adapt (when you miss an item it proposes a stronger image). The key stays on the server. The demo you just did did not use it: those eight images are hand-written and it ran entirely offline." You may add: "On the live site it plans a twelve-fact palace in about fifteen seconds and rewrites the images that fail its own check."
- **Why not flashcards?** "Flashcards give you spacing and testing but no encoding strategy. A palace gives you the encoding but nothing after. This is both, in one loop."
- **What is it bad at?** "Understanding. It is for ordered, discrete facts. And one list per route: load two similar lists onto the same route and they interfere."
- **Why 3D at all?** "A 2012 study with 142 people found a virtual place explored for a few minutes worked as well as a familiar real one for loci. Rendering the images in the place goes beyond what that study tested, and we say so."

## Say only if verified

- "It rewrites its own weak images": verified on the live Architect on the deployed site, Sat Nov 14 at about 12:55 PM ET. In single runs a six-fact plan took 11.3 s and a twelve-fact palace 13.7 s, and the second pass rejected and rewrote 4 of 6 and 4 of 12 first drafts. Offline it only flags them, so say it of the live site only.
- The venue numbers in "Does it work?" must be filled in from the real test, or the sentence dropped. No people have done the test yet.
- "It runs from a link on an ordinary laptop" (in the close): the site is now deployed and public, but frame rate and live motion have not been checked on a real laptop. Say it once that is done.

## Do not say

- "First AI memory palace" (others exist).
- "Proven to double your memory" or any number without its caveat.
- "Self-made images are proven better" (evidence is mixed; we let the learner edit because they should own the image).
