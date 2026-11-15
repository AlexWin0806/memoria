# Memoria: 2-minute pitch (draft 7)

Hard limit is 2:00. State at Sun 3:00 AM ET. Two plans follow, both on the short demo
(`/?judge=short`), and a named fallback on the eight-bone runs. Rehearse both plans once with a
stopwatch, on the demo laptop if possible, and pick one.

What changed since draft 6: the demo is now `/?judge=short`, the five stages of the cell cycle in
one hall of the Workshop, every station asked. It measured 67 s from the button to the results,
so the close has room to say what Memoria does: the survey and the state of the palace, a palace
from your own notes or a PDF with a room per category in a style you choose, the reviews, and
Exam Mode. The opening says "you have not learned them here", not "you do not know them": many
judges learned these stages at school, and a demo run has no survey, so every demo starts in
ruins. The citric acid cycle decks are off the list of palaces; the cell cycle is the process
showcase now. The eight-bone runs (`/?judge=pitch`, `/?judge`) are unchanged and are the fallback.

The short demo and the change to the list are being deployed at about 3:30 AM ET, after their
tests. Until someone has opened `/?judge=short` on the live site after that deployment, rehearse
on `npx vite preview` and keep the fallback ready.

## Before the judge arrives

- Open `https://memoria-five-kappa.vercel.app/?judge=short` once on the venue Wi-Fi before
  judging starts and leave the tab open. It waits on the title screen with a "Try it in 75
  seconds" button. With the offline copy a reload also works without a network, but never
  hard-reload (Shift+reload).
- Open `/?judge=pitch` in a second tab for the fallback. It waits on a "Try it in 90 seconds"
  button.
- For the next judge, reload the tab. A Judge run is a sandbox and starts in ruins every time.
- If a page is ever stuck, open `/?nosw` online and then `/`.
- For a clean start, use a fresh browser profile and open the site in it once while online.
  Do not clear the site's saved data on the day: that also removes the offline copy, and the
  next load then needs the network.
- Keep `npm run build && npx vite preview` running on the demo laptop as a second address.
- The offline copy has been tested in headless Chromium only, and its test reloads `/`,
  `/?judge` and `/?judge=pitch`, not `/?judge=short`. Do the check on the To-Do tab on the demo
  laptop (open once on Wi-Fi, wait ten seconds, Wi-Fi off, reload) with `/?judge=short` before
  relying on it.
- After the last deployment, time one run of `/?judge=short` on the demo laptop and watch it
  once: (to fill in).

## Plan A: the judge does it (recommended if the judge is willing)

The judge feels the method work on them. One person speaks; nobody else talks.

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Five stages of the cell cycle, in order. The workshop is in ruins because you have not learned them here. Press the button." |
| 0:09 | Judge | **Study walk**, five stations: a screw press, a grindstone, an alembic still, a hopper and chute, a water wheel. Each rises from ruins inside a scaffold as its picture is placed, and lines on the floor join each stage to the next. About 28 s. Say nothing: talking over it makes the judge worse at it. |
| 0:37 | Speaker | While the judge reads the screen between and presses its button: "Now from memory. A right answer restores the place." |
| 0:41 | Judge | **Recall walk**, all five stations, multiple choice. A right answer restores the place; a miss "needs another repair". Say nothing. |
| 1:16 to 1:29 | Speaker | As soon as the results appear (1:16 with fast answers; allow until 1:29): "That is Memoria. **Give it your notes or a PDF and it builds the palace, a room for each category, in a style you choose.** It first asks what you already know, and what you miss falls into ruin. It schedules your reviews, and Exam Mode asks the same facts with the palace hidden. Free, in a browser." |
| 1:52 | | Done at the latest, with 8 seconds in hand. At 2:00 stop, even mid-sentence. |

### The budget (150 words a minute, 2.5 words a second)

| Part | Words | Seconds | Where the figure comes from |
|---|---|---|---|
| Opening | 23 | 9 | Counted. |
| Demo, measured | 9, said over the screen between | 67 | Measured 67 s from the button to the results: smoke case `i`, passive, two seconds of thought per answer and four seconds to read the screen between. Its parts were not timed apart; see Timing notes. The study walk is timers; the judge cannot slow it. |
| A person thinking | 0 | 13 | Allowed: 2.5 s more thought on each of the five answers. Demo allowed in all: 80 s. |
| Close | 58 | 23 | Counted. |
| In hand | | 8 | For a judge who thinks longer, or a slower laptop. |
| **Total** | **90** | **120** | 81 words outside the demo (32 s) and 9 inside it. |

Rules for the day:

- The bold sentence in the close is the one that says what the product does. It is never cut.
- If the results appear later than 1:35 on the stopwatch, say only "That is Memoria.", the bold
  sentence and "It schedules your reviews." (29 words, 12 s).
- If the results appear by 1:20, one of these may be added before "Free, in a browser.", and
  only one:
  - "The lines on the floor join each stage to the next; when your notes describe a process,
    they get lines too." (21 words, 8 s)
  - "The method is about two thousand years old. Two meta-analyses find it improves recall of
    lists like this; both flag a high risk of bias." (26 words, 10 s)

What gets cut in Plan A: the research, the comparison with other tools and the roadmap. Keep
them for questions.

## Plan B: the speaker drives (if the judge would rather watch)

A second person works the laptop and answers at once; the speaker talks over it. The judge
sees everything but does not feel it, so the "ah-ha" is weaker; in exchange there is time to
say more. The word counts are spoken words (a year or a hyphenated term counts as it is said).

| Time | Who | What |
|---|---|---|
| 0:00 | Speaker | "Five stages of the cell cycle, in order. The workshop is in ruins because we have not learned them here. Watch." Driver presses the button. (21 words, 8 s) |
| 0:10 to 0:14 | Speaker, while the first picture is on screen (the screw press, from about 2 s after the button, for 3.5 s) | "Inter means between: between divisions, the press copies the DNA." (10 words) |
| 0:14 to 0:36 | Speaker, over the rest of the study walk | "Each station we study is rebuilt inside a scaffold: studied, not yet recalled. The lines on the floor join each stage to the next. With your own notes, the ruins come from a survey: one question at each place, with an 'I don't know' button." (45 words, 18 s) |
| 0:36 to 1:15 | Speaker, over the screen between and the recall walk | "The pictures are gone now. The place is the cue. A right answer restores the place; a miss means it needs another repair. In the survey the right answer is not shown; the place stands or falls. The method of loci was written down about 2,100 years ago. Two meta-analyses find a medium-to-large gain in recall for lists like this; both flag a high risk of bias, and the newer of the two grades the evidence low to very low." (86 words, 34 s) Driver presses on at once and answers four right and one wrong on purpose. |
| 1:15 | Speaker, over the results | "Four places restored, one needs another repair. In your own palace, that is what the scheduled reviews are for. Memoria builds the palace from your own notes or a PDF, a room for each category, in a style you choose, and Exam Mode asks the same facts with the palace hidden. The ruins and the rooms are our design, and no published study we found has tested them in a memory palace; we say so. It is free and runs from a link." (83 words, 33 s) |
| 1:48 | | Done. At 2:00 stop. |

The demo part of Plan B is planned at the measured 67 s: the driver answers at once, which
gains a few seconds over the script's two seconds of thought, and the deliberate miss holds its
feedback a second longer. The results screen of a demo run reads "This demo run was not added
to your reviews." That is why the line is "in your own palace".

## Fallback: the eight-bone runs

Use it if `/?judge=short` is not on the live site, will not start, or looks wrong on the demo
laptop. These runs are as they were for draft 6, apart from the camera, which is live since
2:52 AM for every run.

- **`/?judge=pitch`**: the eight carpal bones in the Roman house, each shown 4 s, then a spot
  check of three. Button "Try it in 90 seconds"; about 75 s (QA review 4 measured 69.9 s with
  fast answers; the latest scripted run, noted in `src/flows/timing.ts`, 77 s). Script: draft
  6's Plan A with this draft's close.

  | Time | Who | What |
  |---|---|---|
  | 0:00 | Speaker | "Eight wrist bones, in order. The palace is in ruins because you do not know them yet. Press the button." (20 words, 8 s) |
  | 0:08 | Judge | **Study walk**, eight places, 47 s. Say nothing. |
  | 0:55 | Speaker | Over the screen between: "Now from memory. A right answer restores the place." |
  | 0:59 | Judge | **Spot check**, three of the eight places. Say nothing. |
  | 1:28 at the latest | Speaker | Plan A's close (58 words, 23 s). Done by 1:51, 9 s in hand. If the results appear later than 1:35, the short close only. |

- **`/?judge`**: the eight bones with every place asked, about two minutes (123 s measured). Too
  long for the pitch; offer it to a judge who wants to try more afterwards.
- **Footage**: `docs/media/demo-short.mp4`, the short run (to fill in when rendered), and
  `docs/media/demo-pitch.mp4`, silent footage of the eight-bone pitch run (80.6 s, rendered
  from the Part 2 build on Saturday night; still true of `?judge=pitch`). Have them open in a
  second tab, or downloaded.

## Timing notes

- **The measured run** (`node scripts/smoke.mjs --only i --serial`, Sun early morning): 67 s
  from the button to the results, passive, two seconds of thought per answer, four seconds to
  read the screen between, the network off. Headless Chromium with software rendering on a
  loaded test machine, the plain test theme, answered by a script. The button rounds it up to
  "Try it in 75 seconds". The same run in the Roman house, before it moved to the Workshop,
  measured 63 s.
- **Where the time goes**, by the constants (`src/flows/timing.ts`, `src/scene/rail.ts`), not
  timed apart: the study walk is five glides of about 2 s and five pictures of 3.5 s, about
  28 s; the recall walk is five glides, five answers and the feedback (1.5 s after a right
  answer, 2.5 s after a miss), about 28 s with two seconds of thought each; about 20 s of the
  67 is the ten glides. The rest is the screen between and the first paint.
- **Still owed:** a timing on the demo laptop with a person answering, after the last
  deployment: (to fill in). Until it is filled in, plan for 80 s.
- It is already at 3.5 s a picture, which draft 6 gave as the floor for reading one. To make
  it shorter, the glides would have to be cut in the engine (`src/scene/rail.ts`); that is not
  a change to make on the day. Re-measure with `node scripts/smoke.mjs --only i --serial` after
  any change to the `short` constants.
- The judge can press Space to move on sooner and P to pause. Do not tell them unless they ask.
- If something goes wrong, play the footage (see the fallback above).
- The collapse and the rebuild have been seen in stills and in tests, not in motion on a real
  GPU, and the Workshop's stations not in motion at all. By the code's constants each 3.5-second
  stop begins with about 1.2 s of pieces rising where the picture fades in. Watch one full run on
  the demo laptop before the first judge and say whether the rebuild gets in the way of reading
  the picture: (to fill in).

## If asked

- **Does it work?** "We have not run an efficacy study of Memoria, and Part 2 adds three ideas (repair, rooms, links) that no published study has tested in a memory palace. The technique is well studied; our own evidence is n = (fill in) people at this venue, informal: (fill in) of 8 with the palace against (fill in) of 8 with a plain list, on two eight-item lists swapped between volunteers so that each list had its turn in the palace, tested in the same sitting." Drop the second sentence if the venue test was not run.
- **Why the cell cycle?** "Five terms in a fixed order that a biology student has to learn, short enough to study and recall in about a minute and a quarter, and a cycle, so it shows the Workshop: each station leads to the next, and the lines on the floor close the loop. Each picture acts on its station, and its reason ties it to the meaning: a word root where the name has one, inter- for between, pro- for before, telos for end, and a hook marked as a letter hook where it has none, M for middle and A for apart." Do not call the deck fact-checked (see "Say only if verified").
- **I already knew these.** "Then the recall walk is easy and every station is restored. A demo run has no survey, so it starts in ruins for everyone. With your own notes the survey comes first, and a place you answer right stands from the start; it is 'standing', not 'restored', until you recall it after study."
- **Why were the links not asked?** "Time. The demo asks the five places only, to stay at about a minute and a quarter. Walk 'The five stages of the cell cycle' from the list of palaces and it is a full process deck: each station also asks what happens to that stage next, and at the end you put the five stages in order, scored apart from the places." The lines on the floor are drawn in the demo too.
- **Why no prometaphase or cytokinesis?** "The deck keeps to five stages to stay short. The split of the cell is there as the last link on the floor, 'cell splits in two', from telophase back to interphase. A deck from your own notes has as many stages as the notes list." Do not call interphase a stage of mitosis: it comes between divisions, and the deck says so.
- **How are you different from Mnemorium and memoryOS?** "Mnemorium is a free, open-source desktop app that builds palaces from your own photos, generates mnemonics with an AI key you supply, and schedules reviews with FSRS; memoryOS is a freemium mobile app that teaches memory techniques through lessons and ready-made 3D palaces. Memoria runs in the browser and starts with a diagnostic walk of your own notes, then shows the result as the state of the palace; we did not find a diagnostic step in either product's public description." If pressed: "That is what we saw in their public descriptions in November 2026, not proof that the features are absent, and both do things Memoria does not: your own rooms and offline data in Mnemorium, a taught course by a memory champion in memoryOS." Never "first" or "only".
- **Does the diagnostic help?** "Memoria asks before it teaches: in laboratory studies, trying to answer before studying improved later memory for that answer even when the attempt failed, and a meta-analysis of questions asked before text and video lessons puts the gain at g = 0.54 for the facts asked about and about zero for anything else; the gain depends on studying the answers afterwards, and none of this was tested in a memory palace or in Memoria." That is why the study walk follows the survey in the same session and shows your survey answer beside the right one. If asked about vocabulary: the support is weaker for bare vocabulary pairs, where the classic studies needed the answer at once.
- **Does the survey show me the answers?** "No. The right answer is not shown; the place stands or falls. With four options, a place that stands tells you your pick was right. The right answer to a miss comes in the study walk, at the same place, beside what you answered." Never "nothing is revealed".
- **Why not just ask people what they know?** "People are poor judges of what they know, and in one pair of studies students who over-rated their answers remembered less two days later, so Memoria decides which places need repair from your answers, not from how confident you feel."
- **What if I mark my own answer right?** "A typed answer that is marked wrong can be overruled with 'I was right'. It is shown as self-marked and counted in the score, but it does not restore the place: the place stays under repair and its review stays in the first box, and the next real recall decides. In the same way, a place you answered right in the survey is 'standing', not 'restored', until you recall it after study, because a right pick among four can be a guess."
- **Why an "I don't know" button?** "If you have tried and nothing comes, say so: 'I don't know' is an honest answer and the palace will send you there first." It is never preselected. We make no claim that it is better or worse than guessing.
- **Why ruins? Is this gamification?** "The ruins are a map of your answers, not a reward system. Evidence that progress displays improve learning is thin (a 2024 review of 38 dashboard studies found no reliable gain in achievement), so we make no claim that the repair mechanic improves learning; we have not tested it." The palace shows what your answers showed. There are no points, badges or streaks, and a miss "needs another repair"; it is never a penalty.
- **Do rooms and links help?** "Organised material is recalled far better than the same material in random order (two to three times better in Bower and colleagues' 1969 word hierarchies), which is why each category gets its own room; whether rooms or drawn links help inside a memory palace has not been tested, and the nearest evidence is for concept maps on a page (g = 0.58 against mixed comparison activities, Schroeder and colleagues 2018)." You may add: "In one study, learning two similar languages in two distinct virtual settings reduced confusion between them a week later, but only for learners who felt present in those settings."
- **What about processes, not just lists?** "The Architect recognises when notes describe a process, links each step to the next and lays the steps out as stations in the Workshop; on the deployed site it did that for a six-step process in 11 to 13 seconds, in single runs. In the walk of a process deck each place also asks what happens to that step next, for example 'What happens to Interphase next?' (the chromosomes coil up), and never shows the next place's answer. At the end you put the steps in order. Those questions are scored apart from the places, and the links are drawn on the floor." Do not say the palace teaches understanding: a process deck is still an ordered list of steps, and the links are a view of the notes' structure.
- **How big can a palace get?** "Laboratory studies of the method of loci have used routes of about 20 to 40 places, so a 30-place palace is within the range studied for word lists; adding places to a palace later has not been studied, and we never put a second fact on a place that is in use, because reusing places is where interference has been reported." Thirty places in six rooms is the product's limit, not a finding.
- **What is the AI doing?** "For your own notes, the Architect plans (which facts, which room, whether they are facts or a process), writes the images, checks itself (a second pass that scores each image for concreteness, action, distinctness and its tie to the meaning) and adapts (when you miss an item it proposes a stronger image). It also structures: categories become rooms, and links are kept only where the notes support them. You choose the architecture or let it choose. The key stays on the server, and the endpoint accepts JSON requests only. The demo you just did did not use it: those five images are hand-written and it ran entirely offline." You may add: "On the live site, in single runs, it proposed a 12-fact palace in 6 to 14 seconds, and a 30-fact palace in six rooms in 16 to 17 seconds as eight short parallel requests."
- **Can I add to a palace later, or change it?** "Yes. 'Add to this palace' puts new facts in free places or in a new room at the end, and nothing already placed moves; a script checks that over 434 generated palaces and 84 extensions. Only the new places are surveyed and studied. On the deployed site the Architect added two facts in 7 to 9 seconds, in single runs. 'Edit' changes a saved palace in place, and changing a fact sends its place back for repair."
- **Why is there an Exam Mode?** "An exam has no palace in front of you. Exam Mode asks the same facts on a plain sheet with the palace and the images hidden and the order shuffled, in either direction: term to meaning or meaning to term. Afterwards it walks you back to exactly the places you missed. It is recorded in Progress and changes nothing in the review schedule or in the state of a place; those follow the recall walks." We make no claim that it predicts or improves an exam result.
- **Does it work offline?** "Judge Mode and the built-in decks run from files in the page and make no network request; the short demo has been run to its results with the network off. The site also keeps an offline copy: after one visit online, a reload with the network off still opens the app and Judge Mode runs. We have tested that in headless Chromium only. Building a palace from your own notes without a network uses the offline planner, and its drafts are labelled as offline drafts."
- **Did you check the decks?** "The Spanish verb deck was checked statement by statement against the Real Academia Española's model conjugation, and the citric acid cycle deck we showed until tonight against Berg and colleagues' *Biochemistry* (8th edition) and the IUBMB enzyme list. We checked search extracts of those sources, not the full texts. The cell cycle deck was added tonight and has not had that check."
- **What if my browser storage is full?** "Saving a palace says that nothing was saved and keeps your notes and images; it used to fail silently, and a break test caught it tonight."
- **Where is vosotros?** "The deck leaves out vosotros, the informal plural 'you' of most of Spain. In American Spanish ustedes is the only plural 'you', and it takes the same verb form as ellos." The first room is named "Past": say "preterite" aloud.
- **Why not flashcards?** "Flashcards give you spacing and testing but no encoding strategy. A palace gives you the encoding but nothing after. This is both, in one loop."
- **What is it bad at?** "Understanding. It is for ordered, discrete facts. And one topic per palace: reusing places is where interference has been reported, so a second list does not go onto a route you are still learning. Each new palace is furnished differently, so two palaces in one style share the architecture and are not the same route. We have not tested whether that is enough to keep two topics apart." If pressed: the built-in decks in the handcrafted Roman house still share its route, and on average about 6% of the places in two palaces of one style hold the same object.
- **Why 3D at all?** "A 2012 study with 142 people found a virtual place explored for a few minutes worked as well as a familiar real one for loci. Rendering the images in the place goes beyond what that study tested, and we say so."
- **What is next?** Plans, said as plans: the other learning environments from the team's notes (for systems, decisions, comparisons, timelines, simulations and proofs); a drill on commonly confused items; a palace built from a returned exam; your own home as the palace; reading scanned PDFs; and, parked for now, an optional "things you know well" field so images draw on what the learner already knows. Worlds from existing films, games or books are not planned: copyrighted characters and settings are out, by the team's own rule.

## Say only if verified

State at Sun 3:00 AM ET. Each entry says what is known and what would make the rest sayable.

**Sayable now** (on the live site; covered by Saturday night's tests, the walk-through suite 20 of 20, compose 11 of 11, PDF 7 of 7, the comparison test 3 of 3, and by the break test of build `ab6eb8a`, Sun 2:05 to 2:40 AM, with the new camera and palettes, which found no blocker; the JSON-only endpoint and the storage message came after it):

- "In a style you choose", "three styles", "a Gothic library, a Zen garden, a Workshop for processes": the Compose screen lets the learner choose the architecture or leave it to the Architect.
- "Add to this palace" and "Edit", as things a learner can press.
- "The links are drawn on the floor", "at the end you put the steps in order", "scored apart from the places".
- Exam Mode, as described under "If asked".
- The Architect figures, each as "in single runs on the deployed site", never as averages: a 12-fact palace proposed in 6 to 14 s; 30 facts in 6 rooms in 16 to 17 s as eight short parallel requests; a six-step process laid out as stations in the Workshop in 11 to 13 s; two facts added to a palace in 7 to 9 s; Regenerate in 1 to 2 s. Offline the self-check only flags weak images, so say "rewrites" of the live site only.
- QA review 4 (Sat evening, a reviewer with no knowledge of the build): safe to demo with precautions, no blocker; Creativity 8, Utility 8, Charity 6, Avidity 8.
- Live since 2:52 AM: the camera's turns are smoothed (measured on a virtual clock; say "smoothed", not "smooth on any laptop"); the Gothic library in darker grey stone and the Workshop in brown wood; the Architect endpoint accepts JSON requests only; saving a palace with the browser's storage full says that nothing was saved, instead of failing silently.

**Being deployed at about 3:30 AM ET.** Written here as live. Confirm each on the live site after the deployment before saying it: (to fill in)

- `/?judge=short`, with a "Try it in 75 seconds" button: the cell cycle in one Workshop hall, in ruins at the start, every station asked, "5 of 5" for a clean run, no questions about the links.
- The list of palaces: "The five stages of the cell cycle" is there and, walked from the list, asks "What happens to Interphase next?" at its first station and ends with the ordering task. Neither citric acid cycle deck is on the list; `/?compare` still uses the citric acid cycle as its second list.

**From the batch under test at Sat 9:30 PM**, also written as live. Confirmed on the live site: (to fill in)

- The Judge screens say what the ruins mean: "In ruins: you have not learned these yet. Each place is rebuilt as you study it."
- The survey moves on by itself after each answer: one press per place.
- The self-mark rule and "standing", as under "If asked".
- Process questions ask what happens to a step next and never show the next place's answer.
- Every new palace is furnished from its own seed. Built-in decks are unchanged.
- The offline copy.
- PDF: a slide footer that carries a page number is left out, and a table row is one fact.
- The offline planner: a `term - meaning` line is one fact, `label: a -> b -> c` is a chain, and room names are no longer cut in the middle of a phrase.

**Not sayable yet:**

- "The cell cycle deck was checked" or "fact-checked": it has no entry in `docs/research.md`. Its five meanings and its word roots (inter-, pro-, telos) have not been through the check that section 9 gave the Spanish and citric acid decks.
- "A reload works without a network", said of the demo laptop or of any browser but Chromium: the offline copy was tested in headless Chromium only, and its test does not reload `/?judge=short`. Sayable of the demo laptop once the check on the To-Do tab has been done there with `/?judge=short`: (to fill in).
- "It reads your PDF": true for PDFs with a text layer; tested on PDFs we generated, not on real lecture PDFs. Scans, locked and damaged files are refused in words. Do not say "any PDF". Real lecture PDFs tried: (to fill in).
- "The file never leaves your device": true of the PDF file, which is read in the browser. The text the learner then sends to the Architect does go to our server function, so do not say "your notes never leave your device".
- The venue numbers in "Does it work?" must be filled in from the real test, or the sentence dropped. No people have done the test yet.
- "It runs on an ordinary laptop", "60 frames a second", "the statue no longer flickers", anything about how the collapse and rebuild or the smoothed camera look in motion: not checked on a real GPU. The flicker fix was confirmed in stills only. Say it once a human has checked on the demo laptop: (to fill in).
- "It works with a screen reader": not tested. Do not say it.
- The short demo's length with a person answering on the demo laptop: (to fill in), as under Timing notes. Until then say "about a minute and a quarter", not a number of seconds.

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
- "It teaches you the cell cycle" or "you now understand mitosis": the demo is an ordered list of five names and their meanings.
- "The five stages of mitosis" for this deck, or "interphase is a stage of mitosis": interphase comes between divisions.
- "M for middle" or "A for apart" as word origins. They are letter hooks, and the deck labels them so.
- "The demo asks about the links": it draws them; it does not ask about them.
- "Holds 30 facts with no loss", "grows without limit", "extending never causes interference".
- "Two palaces cannot interfere", "the seed prevents interference" or "every palace is unique". The furnishing differs; whether that keeps two topics apart is untested, and two palaces in one style draw on the same objects.
- "Choosing your own style improves learning" (not researched).
- "Exam Mode prepares you for the exam", "predicts your mark" or "proves you know it" (not researched; it is a second way to be asked).
- "Works offline in every browser" or "installs as an app" (headless Chromium only).
- "Unlike Mnemorium, Memoria uses AI" or "schedules reviews" (Mnemorium does both). "memoryOS is paid-only", "cannot test recall", "cannot use your own material" or "has no AI" (not verified). Any price for either product, any Kickstarter total, and "the most funded app on Kickstarter" as our own statement.
- "Succinyl-CoA blocks citrate", "destroys citrate" or "switches the cycle off" (it inhibits an enzyme); any mechanism for that inhibition; "ATP inhibits citrate synthase".
- "Checked against the textbook" without "search extracts". "The Spanish past tense" for the first room (it is the preterite).
- Worlds, characters or settings from existing films, games or books, as a feature or as a plan.
