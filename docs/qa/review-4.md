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
