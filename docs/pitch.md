# Memoria: 2-minute pitch (draft 6)

Hard limit is 2:00. State at Sat 9:30 PM ET. Two plans follow. Rehearse both once with a
stopwatch, and pick one.

What changed since draft 5: Plan A is cut to fit (QA review 4 counted draft 5 at 2:02 before
the judge had thought about a single answer). The opening is 20 words and the close is 50. The
demo figures are the reviewer's measured run. "Nothing is revealed" is gone everywhere: the
place stands or falls as you answer, so the verdict is shown; what is not shown is the right
answer. Everything draft 5 called "being built" is live.

If the team falls back to the build from before Part 2 (go or no-go is Sat 11:00 PM), use
draft 4 instead: `git show 34d496c:docs/pitch.md`.

## Before the judge arrives

- Open `https://memoria-five-kappa.vercel.app/?judge=pitch` once on the venue Wi-Fi before
  judging starts and leave the tab open. It waits on the title screen with a "Try it in 90
  seconds" button. With the offline copy a reload also works without a network, but never
  hard-reload (Shift+reload).
- If a page is ever stuck, open `/?nosw` online and then `/`.
- For a clean start, use a fresh browser profile and open the site in it once while online.
  Do not clear the site's saved data on the day: that also removes the offline copy, and the
  next load then needs the network.
- Keep `npm run build && npx vite preview` running on the demo laptop as a second address.
- The offline copy has been tested in headless Chromium only. Do the check on the To-Do tab
  on the demo laptop (open once on Wi-Fi, wait ten seconds, Wi-Fi off, reload) before relying
  on it.

## Plan A: the judge does it (recommended if the judge is willing)

The judge feels the method work on them. One person speaks; nobody else talks.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Eight wrist bones, in order. The palace is in ruins because you do not know them yet. Press the button." |
| 0:08 | Judge | **Study walk**, eight places. Each place goes from ruins to standing inside a scaffold as its picture is placed. Say nothing: talking over it makes the judge worse at it. |
| 0:55 | Speaker | While the judge reads the screen between and presses its button: "Now from memory. A right answer restores the place." |
| 0:59 | Judge | **Spot check**, three of the eight places, multiple choice. A right answer restores the place; a miss "needs another repair". Say nothing. |
| 1:28 | Speaker | "That is Memoria. **Give it your notes or a PDF and it builds the palace, a room for each category.** It first asks what you already know; whatever you miss falls into ruin, and you rebuild it by studying and recalling. Then it schedules your reviews. Free, in a browser." |
| 1:48 | | Done, with 12 seconds in hand. At 2:00 stop, even mid-sentence. |

### The budget (150 words a minute, 2.5 words a second)

| Part | Words | Seconds | Where the figure comes from |
|---|---|---|---|
| Opening | 20 | 8 | Counted. |
| Study walk | 0 | 47 | Measured 47.2 s from the button (eight stops of 4.0 s and the glides between). It is a timer; the judge cannot slow it. |
| Screen between | 9, said over it | 4 | Measured 3 s with a script pressing the button; 1 s added for a hand. |
| Spot check | 0 | 29 | Measured 19.6 s with each answer given within 2 s; 3 s more thought added for each of the three answers. |
| Demo, subtotal | | 80 | Measured 69.9 s in all with fast answers; 80 s allowed for a person. |
| Close | 50 | 20 | Counted. |
| In hand | | 12 | For a judge who thinks longer, or a slower laptop. |
| **Total** | **79** | **120** | 70 words outside the demo (28 s) and 9 inside it. |

Rules for the day:

- The bold sentence in the close is the one that says what the product does. It is never cut.
- If the results appear later than 1:35 on the stopwatch, say only the bold sentence and
  "Then it schedules your reviews." (22 words, 9 s).
- If the results appear by 1:20, one of these may be added, and only one:
  - after "a room for each category": "in a style you choose" (5 words, 2 s);
  - before "Free, in a browser.": "The method is about two thousand years old. Two
    meta-analyses find it improves recall for lists like this, though the quality of that
    evidence is rated low." (27 words, 11 s)

What gets cut in Plan A: the research, the comparison with other tools and the roadmap. Keep
them for questions.

## Plan B: the speaker drives (if the judge would rather watch)

A second person works the laptop and answers at once; the speaker talks over it. The judge
sees everything but does not feel it, so the "ah-ha" is weaker; in exchange there is time to
say more. The word counts are spoken words (a year or a hyphenated term counts as it is said).

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Eight wrist bones, in order. The palace is in ruins because we do not know them yet. Watch." Driver presses the button. (18 words, 7 s) |
| 0:09 to 0:13 | Speaker, while the lamp is on screen (the first stop, seconds 2 to 6 after the button) | "Scaphoid means boat-shaped, so a sailboat circles the lamp." (9 words) |
| 0:14 to 0:54 | Speaker, over the rest of the study walk | "Each place we study is rebuilt inside a scaffold: studied, not yet recalled. With your own notes, the ruins come from a survey: a first walk with one question at each place and an 'I don't know' button. The right answer is not shown; the place stands or falls. The method of loci was written down about 2,100 years ago. Two meta-analyses find a medium-to-large gain in recall for lists like this; both flag a high risk of bias, and a 2025 review grades the evidence low to very low." (about 97 words, 39 s) |
| 0:54 to 1:17 | Speaker, over the screen between and the spot check | "The pictures are gone now. The place is the cue. A right answer restores the place; a miss means it needs another repair. The ruins are a map of your answers, not a reward system: no points, no badges, no streaks." (41 words, 16 s) Driver answers two right and one wrong on purpose. |
| 1:17 | Speaker, over the results | "Two places restored, one needs another repair. The other five are still in scaffolding: studied, not yet recalled. In your own palace, that is what the scheduled reviews are for. Memoria builds the palace from your own notes or a PDF, a room for each category. The ruins and the rooms are our design, and no published study we found has tested them in a memory palace; we say so. It is free and runs from a link." (78 words, 31 s) |
| 1:48 | | Done. At 2:00 stop. |

The results screen of a demo run reads "This demo run was not added to your reviews." That is
why the line is "in your own palace".

## Timing notes

- **The measured run** (QA review 4, Sat 7:23 to 8:20 PM): the pitch variant took 69.9 s in
  all. Study walk 47.2 s from the button, 3 s on the screen between, spot check 19.6 s with
  each answer given within 2 s. With the network off and the keyboard only: 65.7 s. This was
  headless Chromium with software rendering on a loaded machine, answered by a script.
- Earlier runs today on the same machine under heavier load gave 80 to 94 s. The stops are
  timers and do not stretch; what stretches under load is the glide between places and the
  first paint.
- **Still owed:** a timing on a quiet machine with a person answering. Quiet-machine timing,
  with a person: (to fill in). Until it is filled in, plan for 80 s.
- To make the demo shorter, change the pitch constants in `src/flows/timing.ts`
  (`encodeSecondsPerStop` is 4; each half second off saves 4 s) and re-measure with
  `node scripts/smoke.mjs --only p --serial`. Below about 3.5 s per place the pictures cannot
  be read.
- The judge can press Space to move on sooner and P to pause. Do not tell them unless they ask.
- If something goes wrong, `docs/media/demo-pitch.mp4` is silent footage of the pitch run. It
  still shows the build from before Part 2 (no ruins, no scaffolds) and is to be re-rendered
  after the code freeze. Re-rendered: (to fill in).
- The collapse and the rebuild have been seen in stills and in tests, not in motion on a real
  GPU. By the code's constants each four-second stop begins with about 1.2 s of pieces rising
  where the picture fades in. Watch one full run on the demo laptop before the first judge and
  say whether the rebuild gets in the way of reading the picture: (to fill in).

## If asked

- **Does it work?** "We have not run an efficacy study of Memoria, and Part 2 adds three ideas (repair, rooms, links) that no published study has tested in a memory palace. The technique is well studied; our own evidence is n = (fill in) people at this venue, informal: (fill in) of 8 with the palace against (fill in) of 8 with a plain list, on two eight-item lists swapped between volunteers so that each list had its turn in the palace, tested in the same sitting." Drop the second sentence if the venue test was not run.
- **How are you different from Mnemorium and memoryOS?** "Mnemorium is a free, open-source desktop app that builds palaces from your own photos, generates mnemonics with an AI key you supply, and schedules reviews with FSRS; memoryOS is a freemium mobile app that teaches memory techniques through lessons and ready-made 3D palaces. Memoria runs in the browser and starts with a diagnostic walk of your own notes, then shows the result as the state of the palace; we did not find a diagnostic step in either product's public description." If pressed: "That is what we saw in their public descriptions in November 2026, not proof that the features are absent, and both do things Memoria does not: your own rooms and offline data in Mnemorium, a taught course by a memory champion in memoryOS." Never "first" or "only".
- **Does the diagnostic help?** "Memoria asks before it teaches: in laboratory studies, trying to answer before studying improved later memory for that answer even when the attempt failed, and a meta-analysis of questions asked before text and video lessons puts the gain at g = 0.54 for the facts asked about and about zero for anything else; the gain depends on studying the answers afterwards, and none of this was tested in a memory palace or in Memoria." That is why the study walk follows the survey in the same session and shows your survey answer beside the right one. If asked about vocabulary: the support is weaker for bare vocabulary pairs, where the classic studies needed the answer at once.
- **Does the survey show me the answers?** "No. The right answer is not shown; the place stands or falls. With four options, a place that stands tells you your pick was right. The right answer to a miss comes in the study walk, at the same place, beside what you answered." Never "nothing is revealed".
- **Why not just ask people what they know?** "People are poor judges of what they know, and in one pair of studies students who over-rated their answers remembered less two days later, so Memoria decides which places need repair from your answers, not from how confident you feel."
- **What if I mark my own answer right?** "A typed answer that is marked wrong can be overruled with 'I was right'. It is shown as self-marked and counted in the score, but it does not restore the place: the place stays under repair and its review stays in the first box, and the next real recall decides. In the same way, a place you answered right in the survey is 'standing', not 'restored', until you recall it after study, because a right pick among four can be a guess."
- **Why an "I don't know" button?** "If you have tried and nothing comes, say so: 'I don't know' is an honest answer and the palace will send you there first." It is never preselected. We make no claim that it is better or worse than guessing.
- **Why ruins? Is this gamification?** "The ruins are a map of your answers, not a reward system. Evidence that progress displays improve learning is thin (a 2024 review of 38 dashboard studies found no reliable gain in achievement), so we make no claim that the repair mechanic improves learning; we have not tested it." The palace shows what your answers showed. There are no points, badges or streaks, and a miss "needs another repair"; it is never a penalty.
- **Do rooms and links help?** "Organised material is recalled far better than the same material in random order (two to three times better in Bower and colleagues' 1969 word hierarchies), which is why each category gets its own room; whether rooms or drawn links help inside a memory palace has not been tested, and the nearest evidence is for concept maps on a page (g = 0.58 against mixed comparison activities, Schroeder and colleagues 2018)." You may add: "In one study, learning two similar languages in two distinct virtual settings reduced confusion between them a week later, but only for learners who felt present in those settings."
- **What about processes, not just lists?** "The Architect recognises when notes describe a process, links each step to the next and lays the steps out as stations in the Workshop; on the deployed site it did that for a six-step process in 11 to 13 seconds, in single runs. In the walk of a process deck each place also asks what happens to that step next, for example 'What happens to citrate next?' (it is rearranged), and never shows the next place's answer. At the end you put the steps in order. Those questions are scored apart from the places, and the links are drawn on the floor." Do not say the palace teaches understanding: a process deck is still an ordered list of steps, and the links are a view of the notes' structure.
- **How big can a palace get?** "Laboratory studies of the method of loci have used routes of about 20 to 40 places, so a 30-place palace is within the range studied for word lists; adding places to a palace later has not been studied, and we never put a second fact on a place that is in use, because reusing places is where interference has been reported." Thirty places in six rooms is the product's limit, not a finding.
- **What is the AI doing?** "For your own notes, the Architect plans (which facts, which room, whether they are facts or a process), writes the images, checks itself (a second pass that scores each image for concreteness, action, distinctness and its tie to the meaning) and adapts (when you miss an item it proposes a stronger image). It also structures: categories become rooms, and links are kept only where the notes support them. You choose the architecture or let it choose. The key stays on the server. The demo you just did did not use it: those eight images are hand-written and it ran entirely offline." You may add: "On the live site, in single runs, it proposed a 12-fact palace in 6 to 14 seconds, and a 30-fact palace in six rooms in 16 to 17 seconds as eight short parallel requests."
- **Can I add to a palace later, or change it?** "Yes. 'Add to this palace' puts new facts in free places or in a new room at the end, and nothing already placed moves; a script checks that over 434 generated palaces and 84 extensions. Only the new places are surveyed and studied. On the deployed site the Architect added two facts in 7 to 9 seconds, in single runs. 'Edit' changes a saved palace in place, and changing a fact sends its place back for repair."
- **Why is there an Exam Mode?** "An exam has no palace in front of you. Exam Mode asks the same facts on a plain sheet with the palace and the images hidden and the order shuffled, in either direction: term to meaning or meaning to term. Afterwards it walks you back to exactly the places you missed. It is recorded in Progress and changes nothing in the review schedule or in the state of a place; those follow the recall walks." We make no claim that it predicts or improves an exam result.
- **Does it work offline?** "Judge Mode and the built-in decks run from files in the page and make no network request. The site also keeps an offline copy: after one visit online, a reload with the network off still opens the app and Judge Mode runs. We have tested that in headless Chromium only. Building a palace from your own notes without a network uses the offline planner, and its drafts are labelled as offline drafts."
- **Did you check the two showcase decks?** "Every statement in the two showcase decks was checked against standard references: Berg and colleagues' *Biochemistry* (8th edition) and the IUBMB enzyme list for the cycle, the Real Academia Española's model conjugation for the verb, and Merriam-Webster and Etymonline for word origins. We checked search extracts of those sources, not the full texts."
- **The feedback link in the cycle deck?** "Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate. It also inhibits alpha-ketoglutarate dehydrogenase, the enzyme that makes succinyl-CoA itself, which Berg and Tymoczko give as one of the cycle's two main control points." The deck states the link in the first of those sentences.
- **Where is vosotros?** "The deck leaves out vosotros, the informal plural 'you' of most of Spain. In American Spanish ustedes is the only plural 'you', and it takes the same verb form as ellos." The first room is named "Past": say "preterite" aloud.
- **Why not flashcards?** "Flashcards give you spacing and testing but no encoding strategy. A palace gives you the encoding but nothing after. This is both, in one loop."
- **What is it bad at?** "Understanding. It is for ordered, discrete facts. And one topic per palace: reusing places is where interference has been reported, so a second list does not go onto a route you are still learning. Each new palace is furnished differently, so two palaces in one style share the architecture and are not the same route. We have not tested whether that is enough to keep two topics apart." If pressed: the five built-in decks still share the handcrafted Roman house, and on average about 6% of the places in two palaces of one style hold the same object.
- **Why 3D at all?** "A 2012 study with 142 people found a virtual place explored for a few minutes worked as well as a familiar real one for loci. Rendering the images in the place goes beyond what that study tested, and we say so."
- **What is next?** Plans, said as plans: the other learning environments from the team's notes (for systems, decisions, comparisons, timelines, simulations and proofs); a drill on commonly confused items; a palace built from a returned exam; your own home as the palace; reading scanned PDFs; and, parked for now, an optional "things you know well" field so images draw on what the learner already knows. Worlds from existing films, games or books are not planned: copyrighted characters and settings are out, by the team's own rule.

## Say only if verified

State at Sat 9:30 PM ET. Each entry says what is known and what would make the rest sayable.

**Sayable now** (on the live site and covered by tonight's tests: the walk-through suite 20 of 20, compose 11 of 11, PDF 7 of 7, the comparison test 3 of 3):

- "In a style you choose", "three styles", "a Gothic library, a Zen garden, a Workshop for processes": the Compose screen lets the learner choose the architecture or leave it to the Architect.
- "Add to this palace" and "Edit", as things a learner can press.
- "The links are drawn on the floor", "at the end you put the steps in order", "scored apart from the places".
- Exam Mode, as described under "If asked".
- The Architect figures, each as "in single runs on the deployed site", never as averages: a 12-fact palace proposed in 6 to 14 s; 30 facts in 6 rooms in 16 to 17 s as eight short parallel requests; a six-step process laid out as stations in the Workshop in 11 to 13 s; two facts added to a palace in 7 to 9 s; Regenerate in 1 to 2 s. Offline the self-check only flags weak images, so say "rewrites" of the live site only.
- QA review 4 (Sat evening, a reviewer with no knowledge of the build): safe to demo with precautions, no blocker; Creativity 8, Utility 8, Charity 6, Avidity 8. Its majors that could be fixed tonight are in the batch below.

**In the batch under test at Sat 9:30 PM.** Written here as live. Confirm each on the live site after the last deployment before saying it: (to fill in)

- The Judge screens say what the ruins mean: "In ruins: you have not learned these yet. Each place is rebuilt as you study it."
- The survey moves on by itself after each answer: one press per place.
- The self-mark rule and "standing", as under "If asked".
- Process questions ask what happens to a step next and never show the next place's answer; the inhibition link reads "Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate."
- Every new palace is furnished from its own seed. Built-in decks are unchanged.
- The offline copy.
- PDF: a slide footer that carries a page number is left out, and a table row is one fact.
- The offline planner: a `term - meaning` line is one fact, `label: a -> b -> c` is a chain, and room names are no longer cut in the middle of a phrase.

**Not sayable yet:**

- "A reload works without a network", said of the demo laptop or of any browser but Chromium: the offline copy was tested in headless Chromium only. Sayable of the demo laptop once the check on the To-Do tab has been done there: (to fill in).
- "It reads your PDF": true for PDFs with a text layer; tested on PDFs we generated, not on real lecture PDFs. Scans, locked and damaged files are refused in words. Do not say "any PDF". Real lecture PDFs tried: (to fill in).
- "The file never leaves your device": true of the PDF file, which is read in the browser. The text the learner then sends to the Architect does go to our server function, so do not say "your notes never leave your device".
- The venue numbers in "Does it work?" must be filled in from the real test, or the sentence dropped. No people have done the test yet.
- "It runs on an ordinary laptop", "60 frames a second", "the statue no longer flickers", anything about how the collapse and rebuild look in motion: not checked on a real GPU. The flicker fix was confirmed in stills only. Say it once a human has checked on the demo laptop: (to fill in).
- "It works with a screen reader": not tested. Do not say it.
- A quiet-machine timing with a person: (to fill in), as under Timing notes.

## Do not say

- "First AI memory palace", or "the first" or "the only" memory palace with a diagnostic, with rooms by category, with links, or on the web (others exist, and absence in a search is not proof).
- "Proven to double your memory" or any number without its caveat.
- "Self-made images are proven better" (evidence is mixed; we let the learner edit because they should own the image).
- "Nothing is revealed" of the survey. The place stands or falls as you answer, so the verdict is shown. Say "the right answer is not shown".
- "The survey improves your memory", "pretesting is proven", or "the survey helps you learn the whole topic" (the benefit depends on studying the answers afterwards, and only the facts asked about benefit).
- "Getting it wrong helps you learn" or "errors make memories stronger" without the condition (a failed attempt followed by the answer beats no attempt).
- "g = 0.54" for vocabulary, for memory palaces, or without "for the material asked about, in text and video lessons".
- "Guessing is better than saying I don't know", or the reverse. "Works even for words you have never seen."
- "Memoria knows what you know" (it knows what you answered; a right multiple-choice answer can be a lucky guess).
- "Watching your palace rebuild keeps you motivated", "improves retention", "proven gamification", or any gamification figure.
- "Sorting facts into rooms is proven to improve recall", "spatial organisation is shown to work in memory palaces", "links between places help you understand", "memory palaces teach relationships" or "understanding".
- "Holds 30 facts with no loss", "grows without limit", "extending never causes interference".
- "Two palaces cannot interfere", "the seed prevents interference" or "every palace is unique". The furnishing differs; whether that keeps two topics apart is untested, and two palaces in one style draw on the same objects.
- "Choosing your own style improves learning" (not researched).
- "Exam Mode prepares you for the exam", "predicts your mark" or "proves you know it" (not researched; it is a second way to be asked).
- "Works offline in every browser" or "installs as an app" (headless Chromium only).
- "Unlike Mnemorium, Memoria uses AI" or "schedules reviews" (Mnemorium does both). "memoryOS is paid-only", "cannot test recall", "cannot use your own material" or "has no AI" (not verified). Any price for either product, any Kickstarter total, and "the most funded app on Kickstarter" as our own statement.
- "Succinyl-CoA blocks citrate", "destroys citrate" or "switches the cycle off" (it inhibits an enzyme); any mechanism for that inhibition; "ATP inhibits citrate synthase".
- "Checked against the textbook" without "search extracts". "The Spanish past tense" for the first room (it is the preterite).
- Worlds, characters or settings from existing films, games or books, as a feature or as a plan.
