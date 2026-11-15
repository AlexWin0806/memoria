# QA review 4: Part 2, fresh-eyes judge

Reviewer: QA / Judge agent, no knowledge of the build. 15 November 2026, 00:23 to 01:20 UTC
(Sat 7:23 to 8:20 PM ET).
Build under test: `dist/` built at 00:21 UTC from commit `4bc54eb` (HEAD moved to `c1d320f` during
the session; that commit changes `TASKS.md` only), served with `vite preview` and driven with
headless Chromium (Playwright, software WebGL), one browser at a time. Behaviour was measured on
`?theme=greybox`; looks were judged from nine of my own greybox screenshots and from two of the
team's Ink & Vellum stills in `docs/media/`. Load average was 5 to 11, so timings are upper bounds
and nothing here is a frame-rate or motion finding. One Compose run (six requests) went to the
deployed site to see the live Architect. The suites were not re-run, as instructed. Scripts, logs
and screenshots are in the session scratchpad under `qa4/`, not in the repo.

## Verdict

**Safe to demo: yes, with precautions.** No blocker. In about 25 browser sessions nothing
crashed, no page went blank, no saved work was lost, and the pitch run reached its results with
the network switched off (65.7 s, keyboard only, zero requests). The precautions:

1. **Say what the ruins mean, out loud, before the button.** Nothing on screen says it until the
   legend on the results (issue 1). An unattended judge who opens `/?judge` sees 9.6 s of rubble
   under the words "Route preview".
2. **Open the page while there is a network and do not reload.** There is no service worker: a
   reload with the network off is the browser's error page (issue 11). Keep `vite preview`
   running on the demo laptop as the fallback address.
3. **Plan A still does not fit two minutes at a speaking pace** (issue 2).
4. **Keep the citric acid cycle deck away from anyone who has taught biochemistry** until the
   "holds back" question is reworded (issue 5), and do not say "nothing is revealed" (issue 3).
5. If a judge asks for their own notes and the Wi-Fi is down, what they get is the offline
   planner, which has two parsing faults (issues 9 and 10). Say "offline draft" first.

## Scores

| Criterion | Review 3 | Now | Evidence |
|---|---|---|---|
| **Creativity** | 8 | **8** | The idea is stronger (a wrong survey answer collapses the place in front of you, and the palace is then a map of your own answers), but the two-minute path never explains it on screen, and the memory images themselves are still emoji medallions over a sentence in the side panel. |
| **Utility** | 7 | **8** | First time a review has seen the real thing end to end: the live Architect turned 12 lines of my notes into four named rooms with images tied to the meaning (outline on screen in 6.2 s, one run), and survey, study, recall, extend and edit survived every reload I tried with nothing moved. Held back by 36 clicks before the first image, a process mode that asks the same thing twice, and an offline planner that mangles ordinary notes. |
| **Charity** | 6 | **6** | Still no number from a person, and Part 2 adds three ideas the brief itself calls untested; the copy says so plainly. |
| **Avidity** | 8 | **8** | A very large amount landed in six hours with tests and no data loss, but the README, Devpost draft and pitch still describe live features as "being built", the media show the old build, Plan A overruns again, and three of the ten principles are not met by the build (issues 4, 6, 8). |

**Sceptical student, exam next week.** I would use it once, for the drug list, on the live site.
I would not open a second deck: before I saw a single picture of "Comer" I had answered fifteen
quiz questions about words I had just said I did not know, pressed "Next place" fifteen times and
passed a route check, and my second palace would have the same lectern, rose window and bookcase
in the same order as my first. On the process deck I was asked "what does citrate become?" and
then, one click later, "what did you leave at the next place?", which is the same question.

## The demo path, as measured

| | `/?judge=pitch` | `/?judge` |
|---|---|---|
| Before the first image | 2.5 s glide; first words on screen: "Place 1 of 8 · The Lamp. Walking to The Lamp." | Route preview, 9.6 s (eight places at about 1.2 s), the palace in ruins, words on screen: "Route preview · Place n of 8 · (name) · Skip the preview" |
| Study walk | 47.2 s from the button (eight stops of 4.0 s plus glides of 1.0 to 2.7 s) | stops of 4.5 s |
| Between | "The images are now hidden. We check three of the eight places." Waits for the button. | waits |
| Spot check | 19.6 s from its button to the results (two misses and one right answer, each given within 2 s); 69.9 s in all, 3 s of it on the screen between (65.7 s offline, with keys and three misses) | not timed |
| End state | asked and right: restored (1); asked and missed: "needs another repair" (0.3); the five not asked: under repair (0.6); "The other five were not tested." Honest. | not run to the end |

- **Does starting in ruins help or hurt?** It helps if the speaker's sentence lands, because the
  rebuild then has a meaning. It hurts a judge who is alone with the screen: nothing names the
  rubble, and the first thing the product shows looks broken. In Ink & Vellum the difference
  between an unlearned place (line drawing) and a ruined one (line-drawn rubble and a dashed
  outline) is small (`docs/media/place-in-ruins.png`).
- **Does the rebuild compete with the image?** Not seen in motion. By the constants in
  `src/scene/LocusFeature.tsx` (pieces rise for 0.55 s spread over 0.65 s) each 4-second stop
  starts with about 1.2 s of flying pieces at the spot where the medallion fades in, while the
  judge has a term, a meaning and a twelve-word scene to read. In my two stills taken during
  stops 1 and 2 the place was still rubble with the term already on the panel; the software
  renderer lags, so that proves nothing about a GPU. A person must watch this on the laptop.

## Issues, ranked

**Blocker** = would visibly fail in front of a judge or loses work; **major** = likely to cost
marks or trust; **minor** = polish. No blocker was found.

| # | Severity | Where | What I did | What happened | Smallest fix |
|---|---|---|---|---|---|
| 1 | major | Judge Mode, both variants | Opened `/?judge` and `/?judge=pitch` as a first-timer and logged every change of the overlay text. | No word about ruins before the results legend. `/?judge`: 9.6 s of preview over rubble reading only "Route preview · Place 4 of 8 · The Arch". Pitch: "Walking to The Lamp", then the term. The title says nothing either. | One line under the walk label on Judge runs, from the existing legend: "In ruins: you have not learned these yet. Each place is rebuilt as you study it." |
| 2 | major | `docs/pitch.md` Plan A | Counted words against the budget and laid it over the measured run. | Opening: 47 words in "about 15 s" (188 a minute). Close: 65 words in "about 23 s" (170 a minute). At 150 a minute: 19 + 50 + 4 + 23 + 26 = 2:02, before the judge thinks about an answer. Review 3, issue 1, again; the cut sentence is still the one that says what the product does. | Open with "Eight wrist bones, in order. The palace is in ruins because you do not know them yet. Press the button." (20 words). Rehearse with a stopwatch and a person. |
| 3 | major | README ("nothing is revealed", twice), Devpost ("Nothing is revealed"), pitch Plan B ("and nothing is revealed"), `src/ui/Survey.tsx` comment | Answered the Comer survey: five right, five "I don't know", five wrong. | The place stands or collapses the moment I answer (integrity 1 or 0 at once; screen-reader text "This place stands" / "has fallen into ruin"), and the summary lists each place as "standing: you knew its fact" or "in ruins". With four options, a place that stands tells me my pick was right. The verdict is revealed; only the right answer after a miss is withheld. | Say "the right answer is not shown" in the four documents. (Holding the collapse until the summary would make the sentence true, and would lose the best moment.) |
| 4 | major | Process mode, recall walk ("The citric acid cycle, as a cycle") | Walked it twice (mouse, then keys). | (a) A right link answer shows the next place's answer one click before that place is asked: "Correct. Succinyl-CoA becomes Succinate: releases CoA." then "What did you leave at The Trip Hammer?" (Succinate). The place answer sets the review and the state; principle 6 says nothing is revealed before the answer. The miss case is handled (the name is held back), the right case is not, and a quarter of blind picks are right. (b) For a chain, the link question and the next place are one question asked twice: 8 places + 9 links + ordering 8 = 25 answers for 8 facts. | Ask "becomes" links only after the last place, or ask them backwards ("What did this step come from?"), which names only places already answered. |
| 5 | major | Showcase deck, feedback link | Study walk and recall walk of the cycle deck. | Study, at Citrate: "Held back by Succinyl-CoA: inhibits citrate synthase." Recall: "Which step does Succinyl-CoA hold back?", right answer "Citrate", feedback "Succinyl-CoA holds back Citrate: inhibits citrate synthase." `docs/research.md` 9.4 item 3 says not to build the sentence from the kind and gives the wording; 9.5 forbids "Succinyl-CoA blocks citrate" and principle 9c says name the enzyme, not the product. The step citrate synthase catalyses is oxaloacetate to citrate; the only answer accepted is Citrate (Oxaloacetate was not among the options in my runs). | For a `blocks` link that has a label, use the 9.4 sentences: "Which intermediate inhibits citrate synthase, the enzyme that makes citrate?" |
| 6 | major | Principle 8 (one route per topic), generated palaces and built-in decks | Built two palaces in the Gothic library; read the places of a 30-place palace in each style. | Every Gothic palace has the same objects in the same order (Chained Lectern, Rose Window, Ladder Bookcase, ...). Places 11 to 30 are the same twenty objects in the same order in all three styles (The Hourglass ... The Anchor); only the first ten differ. Five built-in decks share the Roman house. The "This route already holds" notice exists only for learner decks in the Roman house (`Compose.tsx:733`); no notice appeared for my second Gothic palace. The pitch's own answer to "What is it bad at?" is "one list per route". | Show the same notice when the chosen style already holds a deck that is not fully restored; in the pitch say "for now, one topic per style". |
| 7 | major | First run of a built-in deck | Pressed "Walk" on Comer and counted. | 36 clicks at best (40 in my run) and 19 screens before the first memory image: 15 answers, 15 "Next place", "Check the route", two route questions; 86 s with instant scripted answers. A 30-place palace would be 66 clicks. "Skip: I know none of this" costs 3 clicks, then a walk of every empty place and the route check (17 clicks on the 8-place deck). | Move on by itself after a survey answer (one key per place), as Judge Mode already does after an answer. |
| 8 | major | Principle 10 (state from answers, never self-rating) | Read `src/flows/flow.ts:516` and `src/state/review.ts:112`, then ran both on the cycle deck. | (a) Typed recall: I typed "zzzz" for Citrate (a miss, the place at 0.3) and pressed "I was right": "Marked right by you ... This place is restored", the place whole, and the card moved from box 2 to box 3 (due in three days). That is self-rating setting a place's state and its schedule, in a product whose README and pitch quote the over-rating study. (b) After a survey alone (two right picks, six "I don't know", nothing studied) Progress reads "Now: 2 restored, 0 under repair, 0 needing another repair, 6 in ruins" under a legend that says "Restored: recalled"; with four options one unknown fact in four looks restored before any recall. | (a) A self-marked answer leaves the place under repair and the card in box 1. (b) Count survey-only places as "standing since the survey". |
| 9 | major | PDF upload, a lecture-slide PDF (five landscape slides with a footer and a page number) | Printed HTML to PDF, uploaded, pressed Design (offline planner). | The footer "BIOL 201 · Lecture 7 · Dr. Example 1" is kept on every page and becomes a fact (README: "running headers and page numbers are dropped"). Room names are cut to three words: "Lecture 7: The", "Distal tubule &" (`src/ai/local-outline.ts:225`). "Aldosterone → ENaC → sodium in, potassium out" becomes three facts. A table PDF: the header row is a fact and rows are split at the first cell ("A" means "Retinol Night blindness"). A two-column handout was read in the right order with its headings. | Drop a line that recurs on three or more pages once trailing digits are removed; do not shorten a heading in the middle of a phrase. |
| 10 | major | Offline planner (the venue fallback), headed list | Pasted 12 lines of `term - meaning` under four headings; one was "carvedilol - also blocks alpha-1". | 13 facts: "carvedilol" with the meaning "also", and "alpha-1" with no meaning. The relation pattern at `local-outline.ts:89` is applied to a line that already parsed as term and meaning. The live Architect got the same line right. | Do not look for "blocks / inhibits / requires" inside a `term - meaning` line. |
| 11 | major (precaution) | Offline claim, `docs/pitch.md` setup | Loaded the page, cut the network, ran the pitch, then reloaded. | Run: fine, no request made. Reload: `net::ERR_INTERNET_DISCONNECTED`. The setup line says "have Wi-Fi off or on; it does not matter", and it also says to clear the site data first, which needs a reload. | Say "open it before judging starts; never reload offline", and keep a local preview running. |
| 12 | major | README, Devpost, pitch against the build | Read all three against what runs. | README table and Roadmap, the Devpost comments and "What's next", and the pitch's "If asked" and "Say only if verified" still call the Compose screen, "Add to this palace", process mode, floor links, the Zen garden and the Workshop "merged" or "being built"; all are in this build and the Workshop is on the live site's title. Many "(to fill in)" remain. `demo-pitch.mp4` and the GIFs show the build without ruins. | The planned second docs pass; search for "being built", "Merged" and "to fill in". |
| 13 | minor | Legend | Results, summary, Progress. | The legend has three states; the product has four: "needs another repair" (0.3) is on the result rows and in Progress ("3 needing another repair") and not in the legend. | Add it. |
| 14 | minor | Principle 2, the marker on every fifth place | Built a 13-place palace from four headings (rooms of 4, 3, 3, 3), and a 30-place one. | The 13-place palace has no golden hand at all: the marker is the fifth place of a room (5, 10, ... 30 in the full palace), and headings rarely give rooms of five. | Count along the route, not within the room. |
| 15 | minor | Live Architect, one run, principle 5 | Read the 12 images. | Two neighbours in one room share a banana (furosemide, spironolactone); four scenes in a row end `shouting "<term>"`; one room's scenes have emoji inside the sentence; the captopril image has an hourglass beside the Gargoyle and the next room holds The Hourglass. The trace says "12 did not pass ... Rewrote 12". Verapamil's image drops "constipation". | Have the self-check compare glyphs within a room. |
| 16 | minor | Results after a skipped survey | Skipped the survey, studied, recalled. | "Before study: 0 of 8. Now: 6 of 8." Progress adds "(survey skipped)"; the results do not, so a baseline nobody measured reads as a gain. | The same three words on the results. |
| 17 | minor | Offline planner, other notes | Pasted prose, an arrow chain, nonsense. | Prose gives terms such as "Notes prof", "July", "TODO ask", in rooms "Part 1" to "Part 3". `water cycle: evaporation -> condensation -> ...` on one line is read as four separate facts with no links. A title line becomes a step. Ten silly lines: 7 kept and "Left out 1 line", when three were. `<script>` and SQL text are shown as text. 40 items: the first 30 kept, the other 10 listed with "Copy the rest". | Count what was left out; treat `label: a -> b -> c` as a chain. |
| 18 | minor | Route check | Answered wrongly on purpose. | Each wrong option is disabled until one is left, so the check cannot be failed; after a 15-place survey walk it is a formality, not the "pass" of principle 3. | Say so, or send two misses back to the walk. |
| 19 | minor | Floor links, `docs/media/palace-links-process.png` | Looked. | The labels on the floor ("rearranged", "loses CO2") are small and turned sideways or upside down to the camera. | Face the label to the route. |
| 20 | minor | Pitch Plan B | Laid the speech over the walk. | "Scaphoid ... a sailboat circles the lamp" is said about 35 s in; the lamp is on screen from 2 to 6 s (review 3, issue 12). "That is what the scheduled reviews are for" is said over a screen that reads "This demo run was not added to your reviews." | Move the first; add "in your own palace" to the second. |
| 21 | minor | 640 × 400, study walk | Keyboard run with reduced motion. | The pinned buttons cover the meaning line and the scene sentence is below the fold (known leftover). No horizontal overflow at 390 × 700 or 640 × 400. | Known. |
| 22 | minor | Labels | Measured. | No text under 16 px computed on 14 screens. The labels ("PLACE 2 OF 15 · THE ROSE WINDOW", the legend's state names) are 18 px in all-small-caps, so their letters stand about as tall as 12 px capitals. | Judge by eye on the laptop. |
| 23 | minor | Survey copy on vocabulary decks | Read it on Comer. | "Guess first. Trying to answer before you study tends to help the answer stick" is shown on bare vocabulary, where 8.1 calls the support "less secure". | Leave the second sentence off `pairs` decks. |
| 24 | minor | Rooms for similar categories (8.6, amendment to principle 8 and item 6) | Read the layout ids of every palace I built and of Comer. | Every room is the same form (`~hall~`): Comer's Past, Present and Future, the confusable case the brief names, differ by their five objects and the name over the door. Whether colour or light differs in Ink & Vellum was not seen. | A second room form for alternate rooms, or say "rooms differ by their objects". |

## The ten principles against the build

| # | Principle | Verdict |
|---|---|---|
| 1 | Fixed route, one fact per place, nothing moves | Holds. Extension: all 13 old items identical, new ones appended. Edit: no place changed; a deleted fact's place stays empty and is not refilled (the next fact went to a new room). |
| 2 | Distinct places; landmark on every fifth | 30 names distinct in each style. Marker missing when rooms are not full (issue 14). Six accents for 30 places. |
| 3 | Walk of the empty route and a route check first | Holds in form; the check cannot be failed (issue 18). |
| 4 | Learner approves every image | Compose: yes (the place button waits). Built-in decks: no approval step, as before. |
| 5 | Concrete, active, distinct, tied by a reason | Live run mostly; neighbours shared a picture (issue 15). Offline drafts are labelled stand-ins. |
| 6 | Recall with images hidden, answer before reveal | Broken in process mode (issue 4). Holds elsewhere. |
| 7 | Reviews at growing intervals | Right answer: due in exactly one day; miss: 10 minutes. Later intervals not reached. |
| 8 | One route per topic | Not met (issue 6). Every room I saw has the same form (issue 24). |
| 9 | Survey first, nothing revealed, study follows | Survey first: yes, also from "Recall" on a new deck. Study follows and shows my survey answer beside the right one. "Nothing revealed": no (issue 3). An abandoned survey keeps nothing and starts again; a reload resumes it. |
| 10 | State only from answers; restored only by recall after study | Not met in two places (issue 8). |

## Documents against the build

| Claim | Where | Build |
|---|---|---|
| "nothing is revealed" | README, Devpost, pitch B | The verdict is (issue 3). |
| "running headers and page numbers are dropped" | README | Not a footer with a page number on slides (issue 9). |
| "so 30 places are 30 different objects" | README, Devpost | True within a palace; 20 of them are the same in every style (issue 6). |
| "one list per route ... they interfere" | pitch | The build loads many (issue 6). |
| "decides which places need repair from your answers, not from how confident you feel" | README, Devpost, pitch | Except "I was right" (issue 8). |
| "have Wi-Fi off or on; it does not matter" | pitch | Only once the page is open (issue 11). |
| Study walk about 50 s, spot check 21 to 24 s, 77 to 80 s | pitch | 47.2 s, 3 s, 19.6 s; 69.9 s in all here. |
| "A Judge run is a sandbox"; "The other five ... still in scaffolding" | README, pitch B | True (0.6 for the five not asked). |
| "Being built": Compose, extension, process mode, floor links | README, Devpost, pitch | All present (issue 12). |
| g = 0.54, Bower 1969, 38 dashboard studies, 20 to 40 places, Mnemorium and memoryOS | README, Devpost, pitch | Word for word the sentences of 8.4; no "first", "only" or "proven" found. |
| "Succinyl-CoA inhibits citrate synthase" | pitch | The pitch is right; the deck's question is not (issue 5). |

## What impressed

- **It did not lose anything.** Reloads in the middle of a survey, a proposal, an extension, an
  edit, an answered link question and the ordering task all came back where they were (link
  answers kept; the ordering restarts empty). An edit draft stayed parked while I extended the
  same palace.
- **The live Architect, once.** Twelve facts in four rooms named from my headings, a reason for
  the style, one link it found by itself ("Furosemide pairs with Spironolactone: potassium effect
  opposite"), and images that carry the fact (a lung clamped in the lectern's chain for
  "avoid in asthma").
- **Keyboard.** The whole process deck, survey to Progress, in 139 key presses with a 2 px focus
  ring on every control I tabbed to, at 1440 × 900, 390 × 700 and 640 × 400 with reduced motion
  (the scene's snap flag is set; the change itself was not seen).
- **The button is hard to misuse.** A double click, Enter twice and a held Space on "Try it in
  90 seconds" all showed the first place for its full four seconds.
- **Honest small print in the app:** "a right pick can be a guess", "The other five were not
  tested", "This is a suggestion, not a finding", "offline draft", and a link miss that does not
  name a step the walk has still to ask.

## Not verified

- **Anything in motion or on a GPU:** the collapse, the rebuild against the image, frame rate,
  the statue flicker. Ink & Vellum in the new styles was seen only in the team's stills: my own
  stills of the Judge path in that theme timed out (load average 10.8 at 01:11 UTC).
- **The suites**, by instruction. **Exam mode**, by instruction.
- **Live Architect timing beyond the 6.2 s outline** (my wait for the images used a wrong
  condition), live Regenerate, live extension, a PDF through the live Architect.
- **Typed recall beyond the one answer in issue 8**, the Zen garden
  in a walk, the five older Domus decks under Part 2, `?compare`, two tabs, Theme Lab.
- **Whether a person can pass the route check after a 15-place survey**, read a place in 4 s
  while it rebuilds, or understand the ruins unprompted: no person has tried.
- **Screen readers and contrast:** not measured.

## Verification pass, Sat 10:15 PM build `c8de73e`

Same reviewer, 15 November 2026, 03:02 to 03:40 UTC (Sat 10:02 to 10:40 PM ET). `npm run build`
at `c8de73e`, served with `vite preview`, headless Chromium with software WebGL, greybox, one
browser at a time, about 25 sessions; load average under 3. The offline copy was tested on a copy
of `dist/` in the scratchpad, edited by hand to stand for a later build. The deployed site was not
opened in this pass. The suites were not re-run. Nothing was seen in motion or on a GPU.

### What was changed, issue by issue

| Issue | Status | What I saw |
|---|---|---|
| 1 Ruins unexplained | **fixed** | "In ruins: you have not learned these yet. Each place is rebuilt as you study it." is on every screen of the `/?judge` preview and on study stops 1 and 2 of both variants, from the start of the glide (about 7 s a stop), 16 px, grey, above the term. At 1440 × 900 the term (y 187), meaning, scene (to y 369) and buttons are all in view with no scroll: it does not get in the way. From stop 3 it is gone. |
| 2 Plan A overruns | **fixed on paper** | Counted: opening 20 words, 9 over the screen between, close 50; 8 + 47 + 4 + 29 + 20 = 108 s, 12 in hand. This build: study walk 48.6 s, spot check 17.8 s with instant keys, 66.6 s in all (67.2 s offline after a reload). The walk is 1.6 s over the budget's 47; the slack covers it. Still not rehearsed with a person. |
| 3 "Nothing is revealed" | **fixed** | Gone from README, Devpost and pitch; the summary now reads "standing: answered in the survey, not yet recalled". |
| 4 Process questions give the next place away | **fixed** | Cycle deck, one full walk with misses and "I don't know": "What happens to Citrate next?" with four labels as options, feedback "Citrate: rearranged." No question, option or feedback named a place that was still to be asked (checked against the eight terms at all 17 stops). The inhibition question waits until after place 8. A right pick shows the same sentence (read in `src/flows/process.ts`; I never picked right). The count is unchanged: 8 places + 9 links + 8 ordering picks = 25 answers. |
| 5 "Holds back Citrate" | **fixed for the deck** | Study walk, at Citrate and at Succinyl-CoA: "Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate." Recall: "Which step inhibits citrate synthase?", answer Succinyl-CoA. No "Held back by" in either walk. A built-in deck has no Compose list to check; in Compose a learner's own inhibition link still reads "ATP holds back PFK-1" (the kind's general name). |
| 6 One route per topic | **partly fixed** | Two Gothic palaces from different notes (`gothic@uefbv`, 12 places; `gothic@fen5d`, 14): one place holds the same object at the same place id (The Ship, r3-2), four more objects stand in both at different places, none twice within a palace. A third palace from the first one's notes shared no place with it. A draft kept its furnishing over a reload and into the survey. Extension: the 12 old items identical, every old place the same object, three new places appended. Comer and the cycle deck have the places they had. Not changed: no notice when a second palace is started in a style that holds an unfinished one, and five decks share the Roman house (the documents now say so). |
| 7 36 clicks to the first image | **fixed** | Comer: 21 presses including "Walk" (15 answers, "Check the route", two route answers each with "Next"), 19 screens, 68 s with instant answers. The stop holds 1.2 s after an answer, with a Pause. Skip path on the cycle deck: 8 presses at best (was 17); the walk of the empty route moves on by itself. |
| 8 Self-rating sets the state | **fixed** | "zzzz" then "I was right": "Marked by you. This place stays under repair until you recall it.", the place at 0.6, the card from box 2 to box 1, due in 10 minutes. Survey alone (two right picks): "Now: 0 restored, 2 standing, 0 under repair, 0 needing another repair, 6 in ruins." |
| 9 Slide PDF | **fixed, one part left** | The footer with its page number is gone; rooms read "The Nephron", "Distal tubule & collecting duct". Table PDF: one fact a row ("A" means "Retinol; Night blindness"); its header row became the heading, so the rooms are "Vitamin: Name: Deficiency" and "Vitamin: Name: Deficiency II". Left: "Aldosterone → ENaC → sodium in, potassium out" inside a bullet is still three bare facts. |
| 10 Carvedilol line | **fixed** | One fact, "carvedilol: also blocks alpha-1"; 12 facts in four rooms of three. |
| 11 No offline copy | **fixed** | Copy complete about 1 s after the title appeared (23 files). Network off, reload: title, then the pitch run to its results in 67.2 s; `/?judge` by address offline, to its results; Compose offline gave a proposal. A later build: the page was the new one on the first online load, its copy was saved 7.4 s after that load, and an offline reload then showed the new page; one visit later the old copy was gone. `/?nosw`: no worker, no saved files, and an offline reload fails again; opening `/` registers it again. No page error. |
| 12 Documents stale | **fixed** | Nothing is called "being built" or "merged". What remains "(to fill in)" is what cannot be known yet: a person's timing, the re-rendered media, the venue numbers. |
| 13 Legend | **fixed** | Five names on the summary, the results and Progress (in ruins, standing, under repair, restored, needs another repair); four on a Judge run, which has no "standing". |
| 16 Skipped survey on the results | **fixed** | "Before study: 0 of 8 (survey skipped). Now: 7 of 8." |
| 17 Offline planner, other notes | **partly fixed** | `water cycle: evaporation -> ... -> evaporation` is a process in a room "Water cycle" with four links, the last closing the circle. The title line is no longer a step. Not changed: ten silly lines still say "Left out 1 line" when three were; `a -> b (enzyme, uses ATP)` lines give the same compound twice (with and without its bracket) and one line became the fact "Uses ATP". |
| 18 Route check cannot be failed | **fixed** | First miss: "try again", that option disabled. Second miss: "It was The Pole Lathe ... Walk the route again if the order is not clear yet", with "Walk the route again" and "Go on". |
| 20 Pitch Plan B | **fixed** | The Scaphoid line is at 0:09 to 0:13, while the lamp is on screen; "in your own palace" added. |
| 23 "Guess first" on vocabulary | **fixed** | Comer shows "Guess first." and stops there. |
| 14, 19, 24 Not changed on purpose | **still minor** | The hand is on the fifth place of a room; every room is `~hall~`; the floor labels were not looked at again. None is worse than minor. |

### Exam Mode (new, ten minutes)

- **Offered** only on a studied palace (the cycle deck, not Comer). The setup says what it is and what it does not change.
- **The paper** covers the scene (the point under the pointer over the canvas is the sheet). Two papers came in two different orders, neither the route order (the first began with the facts of places 3, 2 and 4). No place name or image in the questions I read. Nothing is marked before hand-in; a pick can be changed.
- **Reload** in the middle: nothing recorded, cards identical, and a line says so. It lands on the Reviews screen, also when the exam was started from the title (new issue 3).
- **Browser Back** and **Escape**: "Leave this exam? It has not been handed in, so nothing from it is kept", with Stay first. Back did not leave the site.
- **Hand-in:** 0 of 8; each row gives my answer, the right one, the place it lives at and its image. The review cards and the saved decks were byte for byte what they were before; the history gained one `exam` record; Progress lists it "in the table, not on the line". "Walk back to the 8 places you missed" starts a study walk of those places and had changed no card when it started. I did not finish that walk or the recall walk after it.
- **One-fact palace** (seeded by hand), term to meaning, typed: one question; "zzzz", hand in, "Mark your own answers", "I had it": "1 of 1 ... Self-marked: the typed meanings were judged by you", and the card unchanged. With nothing missed there is no walk back, and it says so.
- Not tried: a list asked by position, the entries in Reviews and Progress (seen, not pressed), a long deck, the keyboard alone.

### Regressions on the demo path

None found. `/?judge=pitch`: 66.6 s online, 67.2 s offline after a reload, end state right (asked and right 1, missed 0.3, the five not asked 0.6). `/?judge`: 108.2 s online with nothing pressed but the answers (62.6 s to the screen between), and to its results offline. A double click was not repeated. No page error in any run.

### New issues, ranked

No blocker and no major.

| # | Severity | Where | What I did | What happened | Smallest fix |
|---|---|---|---|---|---|
| 1 | minor (precaution) | Offline copy, a new deployment | Loaded a later build online and cut the network 3 s later. | The reload showed the build before it, complete and working: the new copy is saved about 7 s after the first load (23 files). Waiting longer, it was the new one. | The pitch already says "wait ten seconds". After the last deployment, open the site, wait, and reload once before the Wi-Fi is trusted to fail. |
| 2 | minor | Seeded palaces | Compared two Gothic palaces; read what stands in them. | Five of twelve objects also stand in the other palace, one at the same place, and nothing warns when a second palace is started in a style that holds an unfinished one. Eight of the twelve objects in my Gothic library were not the style's own (a Beehive, a Ship, an Anchor, an Easel). "Machines as stations" was seen only in the built-in cycle deck; a new Workshop palace was not built. | The notice from the Roman house, for a style in use; in the documents, "the built-in process deck". |
| 3 | minor | Exam Mode, reload | Reloaded during an exam started from the title row. | The page comes back on the Reviews screen. | Come back to the title, with the same line. |
| 4 | minor | Process deck, length | Counted. | Still 25 answers for 8 facts, and my 0 of 9 on the links sits beside 7 of 8 on the places. The questions are no longer the same question twice. | Leave it; say "three scores" when showing it. |
| 5 | minor | Offline planner and PDF leftovers | As issues 9 and 17 above. | The count of lines left out; bracketed arrow lines; an arrow inside a slide bullet; a table's header as the room name with "II". | After the freeze. |
| 6 | minor | Wording | Read the documents. | Devpost: "A legend names the states of a place: in ruins, under repair, restored" (the build names five). Pitch Plan B: "and a 2025 review grades the evidence" still reads as a third source (review 3, issue 15). The ruins line still says "In ruins" once the place stands in its scaffold. | "and the newer of the two grades"; add the two states to the Devpost sentence. |

### Updated verdict and scores

**Safe to demo: yes.** The precautions left are the ones no script can retire: watch one full run
on the demo laptop's GPU and say whether the rebuild gets in the way of reading; do the offline
check in the laptop's own browser (open, wait ten seconds, Wi-Fi off, reload); rehearse Plan A once
with a person and a stopwatch.

| Criterion | Review 4 | Now | Evidence |
|---|---|---|---|
| **Creativity** | 8 | **8** | The same idea, now explained on screen in one line that does not crowd the picture; the images are still emoji medallions. |
| **Utility** | 8 | **8** | Firmer: 21 presses to the first image where there were 36, a process walk that no longer answers itself, self-marking that no longer restores a place, an exam on a plain sheet that changed no card, and a reload that works offline. Not higher without a person using it or a real lecture PDF. |
| **Charity** | 6 | **6** | Nothing changed: no number from a person. |
| **Avidity** | 8 | **9** | Twelve majors answered in about two hours, ten of them fixed outright as I measured, and the documents now say what the build does, including what this review found wrong. |
