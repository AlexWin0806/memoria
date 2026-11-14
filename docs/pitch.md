# Memoria: 2-minute pitch (draft 5)

Hard limit is 2:00. The demo itself takes about 77 to 80 seconds, so there are about 40 seconds
of speech. Two plans follow. Rehearse both once, time them, and pick one.

What changed since draft 4: the palace now starts in ruins, and the story is the architect's.
The ruins say "you do not know these yet". Each place the judge studies is rebuilt inside a
scaffold. Each place the judge recalls is restored. The timing is unchanged in design (starting
in ruins adds no timer); the measured figures are under Timing notes.

If the team falls back to the build from before Part 2 (go or no-go is Sat 11:00 PM), use
draft 4 instead: `git show 34d496c:docs/pitch.md`.

Before the judge arrives: open the public address
`https://memoria-five-kappa.vercel.app/?judge=pitch` (it waits on the title screen with a
"Try it in 90 seconds" button), clear the site's saved data first, and have Wi-Fi off or on;
it does not matter.

## Plan A: the judge does it (recommended if the judge is willing)

The judge feels the method work on them. One person speaks; nobody else talks.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Can you name the eight bones of your wrist, in order? Anatomy students have to. This palace is in ruins because you do not know them yet. Press the button and walk: one strange picture at each place, and each place is rebuilt as you study it." (about 15 s) |
| 0:15 | Judge | **Study walk**, eight places, about 50 s. Each place goes from ruins to standing inside a scaffold as its picture is placed. Say nothing: talking over it makes the judge worse at it. |
| 1:05 | Speaker | "Now the pictures are gone. Three places, from memory. A right answer restores the place." (4 s, while the judge presses the button) |
| 1:09 | Judge | **Spot check**, three of the eight places, multiple choice, about 23 s. A right answer restores the place; a miss "needs another repair". |
| 1:32 to 1:35 | Speaker | "With your own material, Memoria starts by finding out what you do not know: one question at each place, and 'I don't know' is an honest answer. The palace then shows it: ruins where you missed. It builds that palace from your own notes or a PDF, a room for each category, and it schedules your reviews. It is free and runs from a link." (about 23 s) |
| 2:00 | | Stop, even mid-sentence. |

Lines for the close, to add only if there is time and only if true on the day:

- After "a room for each category": "in a style you choose". Say it only if the Compose screen
  with the choice of style is live at judging (see "Say only if verified").
- If the demo ended by 1:30, before the last sentence: "The method is about two thousand years
  old. Two meta-analyses find it improves recall for lists like this, though the quality of
  that evidence is rated low." (about 9 s)

What gets cut in Plan A: the research, the comparison with other tools and the roadmap. Keep
them for questions.

## Plan B: the speaker drives (if the judge would rather watch)

A second person works the laptop and the speaker talks over it. The judge sees everything but
does not feel it, so the "ah-ha" is weaker; in exchange there is time to say more.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | The same opening, ending "Watch: one strange picture at each place, and each place is rebuilt as we study it." Driver presses the button. |
| 0:15 | Speaker, over the study walk | "The palace is in ruins because we have not learned these yet. With your own material that comes from a survey: a first walk with one question at each place and an 'I don't know' button, and nothing is revealed. Each place we study is rebuilt inside a scaffold: studied, not yet recalled. The method is the method of loci, written down about 2,100 years ago. Scaphoid means boat-shaped, so a sailboat circles the lamp. Two meta-analyses find a medium-to-large gain in recall for lists like this; both flag a high risk of bias, and a 2025 review grades the evidence low to very low." |
| 1:05 | Speaker, over the spot check | "The pictures are gone now. The place is the cue. A right answer restores the place; a miss means it needs another repair. The ruins are a map of your answers, not a reward system: no points, no badges, no streaks." Driver answers two right and one wrong on purpose. |
| 1:32 to 1:35 | Speaker | "Two places restored, one needs another repair. The other five are still in scaffolding: studied, not yet recalled, and that is what the scheduled reviews are for. Memoria builds the palace from your own notes or a PDF, a room for each category. The ruins and the rooms are our design, and no published study we found has tested them in a memory palace; we say so. It is free and runs from a link." (about 25 s) |
| 2:00 | | Stop. |

## Timing notes

- Pitch variant on the build that went live Sat 4:57 PM (the palace starts in ruins): 80 s,
  measured on a heavily loaded test machine. Before Part 2 the same run measured 74 to 79 s.
  Quiet-machine timing: (to fill in). Until it is filled in, plan for 80 s.
- Starting in ruins sets no timer: every stop lasts as long as it did before. The parts are as
  measured on the build of Sat 9:40 AM: study walk about 50 s from the button, spot-check
  screen about 4 s, spot check about 21 to 24 s depending on which three places are drawn.
- To make the demo shorter, change the pitch constants in `src/flows/timing.ts`
  (`encodeSecondsPerStop` is 4; each half second off saves 4 s) and re-measure with
  `node scripts/smoke.mjs --only p --serial`. Below about 3.5 s per place the pictures cannot
  be read.
- The judge can press Space to move on sooner and P to pause. Do not tell them unless they ask.
- If something goes wrong, `docs/media/demo-pitch.mp4` is silent footage of the pitch run. As
  of Sat 5:45 PM it shows the build from before Part 2 (no ruins, no scaffolds); it is to be
  re-rendered late tonight. Re-rendered: (to fill in).
- The collapse and the rebuild have been seen in stills and in tests, not in motion on a real
  GPU. Watch one full run on the demo laptop before the first judge.

## If asked

- **Does it work?** "We have not run an efficacy study of Memoria, and Part 2 adds three ideas (repair, rooms, links) that no published study has tested in a memory palace. The technique is well studied; our own evidence is n = (fill in) people at this venue, informal: (fill in) of 8 with the palace against (fill in) of 8 with a plain list, on two eight-item lists swapped between volunteers so that each list had its turn in the palace, tested in the same sitting." Drop the second sentence if the venue test was not run.
- **How are you different from Mnemorium and memoryOS?** "Mnemorium is a free, open-source desktop app that builds palaces from your own photos, generates mnemonics with an AI key you supply, and schedules reviews with FSRS; memoryOS is a freemium mobile app that teaches memory techniques through lessons and ready-made 3D palaces. Memoria runs in the browser and starts with a diagnostic walk of your own notes, then shows the result as the state of the palace; we did not find a diagnostic step in either product's public description." If pressed: "That is what we saw in their public descriptions in November 2026, not proof that the features are absent, and both do things Memoria does not: your own rooms and offline data in Mnemorium, a taught course by a memory champion in memoryOS." Never "first" or "only".
- **Does the diagnostic help?** "Memoria asks before it teaches: in laboratory studies, trying to answer before studying improved later memory for that answer even when the attempt failed, and a meta-analysis of questions asked before text and video lessons puts the gain at g = 0.54 for the facts asked about and about zero for anything else; the gain depends on studying the answers afterwards, and none of this was tested in a memory palace or in Memoria." That is why the study walk follows the survey in the same session and shows your survey answer beside the right one. If asked about vocabulary: the support is weaker for bare vocabulary pairs, where the classic studies needed the answer at once.
- **Why not just ask people what they know?** "People are poor judges of what they know, and in one pair of studies students who over-rated their answers remembered less two days later, so Memoria decides which places need repair from your answers, not from how confident you feel."
- **Why an "I don't know" button?** "If you have tried and nothing comes, say so: 'I don't know' is an honest answer and the palace will send you there first." It is never preselected. We make no claim that it is better or worse than guessing.
- **Why ruins? Is this gamification?** "The ruins are a map of your answers, not a reward system. Evidence that progress displays improve learning is thin (a 2024 review of 38 dashboard studies found no reliable gain in achievement), so we make no claim that the repair mechanic improves learning; we have not tested it." The palace shows what your answers showed. There are no points, badges or streaks, and a miss "needs another repair"; it is never a penalty.
- **Do rooms and links help?** "Organised material is recalled far better than the same material in random order (two to three times better in Bower and colleagues' 1969 word hierarchies), which is why each category gets its own room; whether rooms or drawn links help inside a memory palace has not been tested, and the nearest evidence is for concept maps on a page (g = 0.58 against mixed comparison activities, Schroeder and colleagues 2018)." You may add: "In one study, learning two similar languages in two distinct virtual settings reduced confusion between them a week later, but only for learners who felt present in those settings."
- **What about processes, not just lists?** "Live now: the Architect recognises when notes describe a process and links each step to the next; on the deployed site it laid out a six-step process with every step linked in 13 seconds, in a single run. Being built tonight: after each place of a process deck the walk asks what the step becomes, and the learner puts the steps in order, scored apart from the places; and the links drawn on the floor." Say "being built" unless "Say only if verified" below has been updated. Do not say the palace teaches understanding: a process deck is still an ordered list of steps, and the links are a view of the notes' structure.
- **How big can a palace get?** "Laboratory studies of the method of loci have used routes of about 20 to 40 places, so a 30-place palace is within the range studied for word lists; adding places to a palace later has not been studied, and we never put a second fact on a place that is in use, because reusing places is where interference has been reported." Thirty places in six rooms is the product's limit, not a finding.
- **What is the AI doing?** "For your own notes, the Architect plans (which facts, which room, whether they are facts or a process), writes the images, checks itself (a second pass that scores each image for concreteness, action, distinctness and its tie to the meaning) and adapts (when you miss an item it proposes a stronger image). It also structures: categories become rooms, and links are kept only where the notes support them. The key stays on the server. The demo you just did did not use it: those eight images are hand-written and it ran entirely offline." You may add: "On the live site, in single runs, it built a 30-fact palace in six rooms in 16 seconds as eight short parallel requests, and its self-check rewrote 19 of the 30 first drafts."
- **Can I add to a palace later?** "The Architect can: on the deployed site it added two facts to a palace in 9 seconds, in a single run, and nothing that already stood was touched. Nothing that exists ever moves when a palace grows; a script checks that over 63 palaces and 54 extensions. The screen for it ('Add to this palace') is being built tonight." Say "being built" unless verified below.
- **Did you check the two showcase decks?** "Every statement in the two showcase decks was checked against standard references: Berg and colleagues' *Biochemistry* (8th edition) and the IUBMB enzyme list for the cycle, the Real Academia Española's model conjugation for the verb, and Merriam-Webster and Etymonline for word origins. We checked search extracts of those sources, not the full texts."
- **The feedback link in the cycle deck?** "Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate. It also inhibits alpha-ketoglutarate dehydrogenase, the enzyme that makes succinyl-CoA itself, which Berg and Tymoczko give as one of the cycle's two main control points."
- **Where is vosotros?** "The deck leaves out vosotros, the informal plural 'you' of most of Spain. In American Spanish ustedes is the only plural 'you', and it takes the same verb form as ellos." The first room is named "Past": say "preterite" aloud.
- **Why not flashcards?** "Flashcards give you spacing and testing but no encoding strategy. A palace gives you the encoding but nothing after. This is both, in one loop."
- **What is it bad at?** "Understanding. It is for ordered, discrete facts. And one list per route: load two similar lists onto the same route and they interfere."
- **Why 3D at all?** "A 2012 study with 142 people found a virtual place explored for a few minutes worked as well as a familiar real one for loci. Rendering the images in the place goes beyond what that study tested, and we say so."
- **What is next?** Plans, said as plans: the other learning environments from the team's notes (a systems garden where changing one variable shows its consequences, a decision labyrinth, a comparison gallery, a timeline, a simulation, a proof workshop); an optional "things you know well" field so images draw on what the learner already knows; your own home as the palace; reading scanned PDFs. Worlds from existing films, games or books are not planned: copyrighted characters and settings are out, by the team's own rule.

## Say only if verified

State at Sat 5:45 PM ET. Update this list in the second pass; each entry says what would make it sayable.

- "In a style you choose", "three styles", "a Zen garden", "a workshop for processes": the Gothic library is live. The Zen garden and the Workshop are merged on the working branch and not on the live site, and the screen for choosing a style is being built. Sayable when both are live at judging: (to fill in).
- "After each step it asks what the step becomes" and "you put the steps in order" (process mode): being built. Sayable when live: (to fill in).
- "Links are drawn on the floor between places": being built. The Architect already extracts the links. Sayable when live: (to fill in).
- "Add to this palace" as something a learner can press: being built. The Architect's part is measured (9 s, single run). Sayable when live: (to fill in).
- The Architect figures (30 facts in 16 s; 19 of 30 first drafts rewritten; a process in 13 s; an extension in 9 s; the older twelve-fact path 14 s; Regenerate about 2 s): measured on the deployed site on Sat Nov 14, single runs, not averages. Say "in a single run". Offline the self-check only flags weak images, so say "rewrites" of the live site only. Final figures: (to fill in).
- "It reads your PDF": true for PDFs with a text layer; tested on synthetic PDFs only, not on real lecture PDFs. Scans, locked and damaged files are refused in words. Do not say "any PDF". Real lecture PDFs tried: (to fill in).
- "The file never leaves your device": true of the PDF file, which is read in the browser. The text the learner then sends to the Architect does go to our server function, so do not say "your notes never leave your device".
- The venue numbers in "Does it work?" must be filled in from the real test, or the sentence dropped. No people have done the test yet.
- "It runs from a link on an ordinary laptop", "60 frames a second", "the statue no longer flickers", anything about how the collapse and rebuild look in motion: not checked on a real GPU. The flicker fix was confirmed in stills only. Say it once a human has checked on the demo laptop: (to fill in).
- "It works with a screen reader": not tested. Do not say it.

## Do not say

- "First AI memory palace", or "the first" or "the only" memory palace with a diagnostic, with rooms by category, with links, or on the web (others exist, and absence in a search is not proof).
- "Proven to double your memory" or any number without its caveat.
- "Self-made images are proven better" (evidence is mixed; we let the learner edit because they should own the image).
- "The survey improves your memory", "pretesting is proven", or "the survey helps you learn the whole topic" (the benefit depends on studying the answers afterwards, and only the facts asked about benefit).
- "Getting it wrong helps you learn" or "errors make memories stronger" without the condition (a failed attempt followed by the answer beats no attempt).
- "g = 0.54" for vocabulary, for memory palaces, or without "for the material asked about, in text and video lessons".
- "Guessing is better than saying I don't know", or the reverse. "Works even for words you have never seen."
- "Memoria knows what you know" (it knows what you answered; a right multiple-choice answer can be a lucky guess).
- "Watching your palace rebuild keeps you motivated", "improves retention", "proven gamification", or any gamification figure.
- "Sorting facts into rooms is proven to improve recall", "links between places help you understand", "memory palaces teach relationships" or "understanding".
- "Holds 30 facts with no loss", "grows without limit", "extending never causes interference".
- "Choosing your own style improves learning" (not researched).
- "Unlike Mnemorium, Memoria uses AI" or "schedules reviews" (Mnemorium does both). "memoryOS is paid-only", "cannot test recall", "cannot use your own material" or "has no AI" (not verified). Any price for either product, and any Kickstarter total.
- "Succinyl-CoA blocks citrate", "destroys citrate" or "switches the cycle off" (it inhibits an enzyme); any mechanism for that inhibition; "ATP inhibits citrate synthase".
- "Checked against the textbook" without "search extracts". "The Spanish past tense" for the first room (it is the preterite).
- Worlds, characters or settings from existing films, games or books, as a feature or as a plan.
