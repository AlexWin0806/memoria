# QA review 3: fresh-eyes judge, round four

Reviewer: QA / Judge agent, no knowledge of the build. 14 November 2026, 13:12 to 13:57 UTC.
Build under test: `npm run build` of the working tree at `31dab96`, served with `vite preview`,
driven with headless Chromium (Playwright, software WebGL). Behaviour was measured on
`?theme=greybox`; looks were judged from 13 screenshots (3 default theme, 10 Sanguine, most read as a montage) and from
contact sheets of `docs/media/demo-pitch.mp4`. The machine was shared with another rendering
job and with my own parallel runs (load average 26 to 42 for most of the session), so every
timing below is an upper bound and nothing here is a frame-rate finding. Scripts, logs and
screenshots are in the session scratchpad under `qa3/`, not in the repo.

## Verdict

**Safe to demo: yes, with precautions.** I found no blocker. In about 45 browser sessions nothing crashed,
no page went blank, and no saved-data shape I tried stopped the title or Judge Mode
from loading. Round four did what it set out to do: the comparison test gives each participant
the list and order the address names, and its table, sentence, means and CSV agreed with the
answers my script gave in all four combinations; the interstitial waits; the images are hidden
on it; Pause holds. The precautions: (1) Plan A of the pitch has no slack at all and will run
past 2:00 with a judge who thinks, cutting the only sentence that says what the product is;
rehearse it with a stopwatch or shorten the opening; (2) two of thirteen end-to-end cases
failed in my full run of `scripts/smoke.mjs` on a heavily loaded machine and passed when run
alone (see Suite results): re-run the suite on the demo laptop before trusting "13 of 13"; (3) the Devpost draft and the
pitch describe the AI in the present tense, and the demo contains no AI output at all: decide
what the speaker says to "what did the AI do just now?"; (4) between judges, reload
`/?judge=pitch` and check there is no "Resume your walk" line above the button. One thing to
know, not to fix tonight: pressing the judge button silently erases any saved review schedule
for the carpal bones (issue 3).

## Scores

| Criterion | Review 2 | Now | Evidence |
|---|---|---|---|
| **Creativity** | 8 | **8** | Unchanged idea, better told: in the footage a right answer brings the medallion, an ink ring on the floor and the place's pigment within about a second, and the results tour now cross-fades calmly between coloured places. The images are still emoji medallions floating over props. |
| **Utility** | 7 | **7** | Sturdier than before: bad saved data is survived, a review the next "day" works and survives a reload mid-review (right answers went to 3 days, a miss to 10 minutes, a recovered miss to 1 day), two tabs do not overwrite each other, typed recall accepted `iso-citrate`, `succinyl coa`, `Succinat`. Held back by the same things: one palace, an Architect that has never run, and a 216-character term that is cut off instead of wrapped. |
| **Charity** | 6 | **6** | The comparison harness is now honest in design (lists and order swapped, fixed option order, no feedback, an abandoned run records nothing) and I would believe its arithmetic. It still holds no number from a person. |
| **Avidity** | 8 | **8** | All four review-2 majors are closed and tested, the documents now agree on 90 seconds and 83 to 89, and the pitch has two timed plans. Not higher because the suite is not robust under load, Plan A does not fit, and a few claims ("timed stops can be paused", "the demo runs on the offline planner") are not what the build does. |

**Sceptical student.** I would use it for one list this week, and I now trust it not to eat my
work. I still have not seen the AI, my own notes still get offline placeholders, and when I
missed an answer in the demo the right picture was gone again in three seconds with no way to
hold it.

## Suite results

| Suite | Result |
|---|---|
| `npm run build` | passes |
| `npm run check` | passes (typecheck and lint, exit 0) |
| `node scripts/architect-smoke.mjs` | passes ("all checks passed"; live model path skipped: no key) |
| `node scripts/smoke.mjs` | **11 of 13 in the full run** on a heavily loaded machine: `a p b c(+d) e f r t w s x` passed; `g` failed ("a paused stop moved on by itself", smoke.mjs:125) and `l` failed ("locator.click: Timeout 5000ms exceeded", smoke.mjs:1083). **Re-run of the two alone** (`--only g,l --serial`, the machine still busy): both pass. |
| `node scripts/ab-smoke.mjs` | passes, 3 of 3 (8 and 8 in one row; lists swapped with means 6.0 and 6.0, CSV and clipboard match, guarded Clear; abandoned run stores nothing) |

The suites print their own timings, all inflated by the load: default passive run 186 s, pitch passive run 103 s, and in `ab-smoke` "palace encode walk measured by the app: 65.8 s; LIST_STUDY_SECONDS is 51" (see issue 6). Another agent was also running `smoke.mjs --only a,p,g` and `ab-smoke.mjs --only 1` on the machine during my run; I did not touch those.

## Regressions and new issues, ranked

Severity as before: **blocker** = would visibly fail in front of a judge or loses work;
**major** = likely to cost marks or trust; **minor** = polish. No blocker was found.

| # | Severity | Where | What I did | What happened | What I expected |
|---|---|---|---|---|---|
| 1 | major | `docs/pitch.md`, Plan A | Timed the script against the build: pressed the button, pressed nothing else during the encode walk, clicked "Start the spot check" at once, answered each question within about a second. | Button to interstitial: 47.9 s. Spot check: 25.8 s with instant answers (feedback stays 2.0 s after a right answer, 3.2 to 3.6 s after a miss, and each of the four places also has a 1.5 to 3 s glide). The script's budget is 15 + 47 + 4 + 34 + 18 = 1:58, so the slack is two seconds. The opening line is 43 words in "about 14 s" (184 words a minute); the close is 46 words in 18 s. Every second a judge thinks per answer adds four seconds, a judge who reads the interstitial adds more (it waits for ever), and a judge who misses adds 1.5 s per miss. The instruction for overrun is "Stop, even mid-sentence", and the sentence that is cut is the only one that says what Memoria does ("builds the palace from your own notes, tests you ..., schedules the reviews"). The suite's own passive pitch run took 103 s on this loaded machine. | A plan with ten seconds of slack: a five-second opening ("Eight wrist bones, in order. Press the button and just look."), or the product sentence moved before the button. Rehearse with a real person, not a script. |
| 2 | major | `docs/devpost.md` "How we built it"; `docs/pitch.md` "If asked: What is the AI doing?" | Read both against what the demo runs. | Devpost: "The live model path is built; the demo runs on the offline planner." Judge Mode does not use the offline planner: it shows eight hand-written fixture images (README says so: "Judge Mode and the built-in decks run from fixtures"). The pitch answer says in the present tense that the Architect "plans ... acts ... checks itself ... and adapts"; only "it rewrites its own weak images" is under "Say only if verified". No step of that loop has ever executed against a model (known), and nothing a judge sees in two minutes was written by a model or by the planner. For the Amazon "Practical AI" track that is the first question. | "The demo images are hand-written; your own notes go through the Architect, which is built and untested against the live model; offline you get a labelled draft." Put the whole AI answer under "Say only if verified" until the key exists. |
| 3 | major | Judge Mode against a learner's saved state for the carpal deck | (a) Stored a review card for `carpal-1` in box 4, due in 6 days (title: "The eight carpal bones · next review in 6 days · 7 new"), plus one for the Mohs deck; pressed "Try it in 2 minutes"; left during the route preview. (b) Stored a three-item deck under the id `fixture-carpals`, then pressed the judge button. | (a) The carpal card was deleted the moment Judge Mode started, before any answer; after leaving, the row reads "not started". The Mohs card was kept. (b) The stored deck showed in the list in place of the built-in one ("Hijacked carpals · 3 places", with Delete); starting Judge Mode ran the eight built-in bones and emptied `memoria.decks.v1` (34 characters afterwards). Nothing on screen says any of this. The results screen of the demo tells the judge "next review tomorrow"; a student who comes back tomorrow and presses the big button again loses that schedule instead of reviewing. I did not check whether an image changed through "Strengthen this image" is erased the same way; (b) suggests it is. | Starting clean is right for a booth. It should not cost a returning learner their boxes without a word: keep the cards and reset only the colour, or ask ("Start the carpal bones again? Your review schedule for them will be cleared"), or give the demo its own copy of the deck. Rated major and not blocker because it cannot hurt the booth demo and touches one built-in deck. |
| 4 | minor (major if it repeats on the demo laptop) | `scripts/smoke.mjs`, cases `g` and `l` | Ran the whole suite once, as asked, while the machine was heavily loaded. | 11 of 13 passed. `FAIL g  a paused stop moved on by itself (smoke.mjs:125)` and `FAIL l  locator.click: Timeout 5000ms exceeded. (smoke.mjs:1083)`. By hand I could not make a paused stop move on: 10 pauses held (P at the instant the image appeared, three times; P at 93 %, 95 % and 95 to 98 % of the bar; P early in a stop; the Pause button with the mouse; under the Leave dialog; at the last place), each for 5 to 7 s. Case `l` uses a 5 s click timeout, and on this machine a plain click on the title's judge button took 5.2 s. Run alone afterwards, `g` and `l` both passed, so I read both failures as the suite's timing margins under load, not as defects in the app. | README and TASKS.md state "13 of 13". A suite that is to be trusted on Sunday morning should not depend on a 5 s click or on a wall-clock race; re-run it on the demo laptop and record the result. |
| 5 | minor | Recall walk, feedback after an answer (Judge Mode and the pitch variant) | Answered wrongly, then pressed P; looked for a Pause control. | The feedback stop is timed ("It moves on by itself; Space or Right arrow moves on sooner.") and has no Pause button; P does nothing. A miss shows the right term, its meaning and the image for 3.2 to 3.6 s, then the camera leaves. README: "Timed stops can be paused with the Pause button or the P key"; pitch: "The judge can press ... P to pause". True of the eight encode stops only. | Review 2 asked for the image to stay after a miss until the learner moves on. Either pause there too or say "encode stops" in the two documents. |
| 6 | minor | Comparison test, study time | Ran five participants; read the "Study time" sentence and the CSV. | The list arm is exactly 51 s. The walk was reported as 52, 53, 51 and 52 s and once as "1 min 3 s for the walk" (my clock: 66.5 s) when the machine was at its busiest: the walk's length follows the camera, not the clock. The comparison suite printed the same thing in its own run: "palace encode walk measured by the app: 65.8 s; LIST_STUDY_SECONDS is 51". The result screen is honest about it, but the CSV has no study-time column (`participant,id,at,order,palace_list,list_score,list_ms,palace_score,palace_ms`), so an unequal run cannot be spotted afterwards. | A `list_study_ms` and `palace_study_ms` column, and the venue protocol telling the operator to read the "Study time" sentence for every volunteer. |
| 7 | minor | Saved-data repair, decks that are valid in form but wrong in content | Stored a deck with an item at `domus-99`; with two items on `domus-01`; with 20 items on `domus-01` to `domus-20`; with duplicate item ids. | No crash, no quiet line, and the title counts every stored item ("Bad deck · 3 places", "20 places") while the walk is "Place 1 of 2" or "Place 2 of 12": the extra items are never shown or tested and nothing says so. Duplicate item ids are accepted. A deck repaired down to one item is still listed and gives a one-option quiz ("1 Term3 ... Keys 1 to 1 pick an answer"). A stored draft whose three items sit on places of another layout opens as "Draft restored" with every card headed "Unplaced", and "place them in the palace" accepts it: the paste screen comes back saying "This route already holds 'X'" (I did not walk the palace that made). | The same "set aside" line the malformed cases get, a count that matches the walk, and the three-fact minimum applied after repair. |
| 8 | minor | Comparison test, browser Back | Opened it from the title, Start, Begin, then Back during the list. | The browser left the site (`about:blank` in my history). Forward returned to the introduction with "That run was abandoned. Nothing was recorded." In an ordinary walk Back opens the Leave dialog instead. Escape (dialog, list hidden, clock stopped at 46 s for 6 s) and reload (the abandoned notice) behave as documented. | The same guard as in a walk; a two-finger swipe on a trackpad is an easy accident for a volunteer. |
| 9 | minor | Comparison test, introduction | Opened each of the four fixed addresses. | The introduction always says "Which comes first, and which set goes where, is drawn at random", also when the address fixes both. | Leave the sentence out when nothing is drawn. |
| 10 | minor | Long terms | Composed a list whose first term is one 216-character word with a 200-character meaning, walked and recalled it. | The term is cut off at the panel's right edge, not wrapped: in the recall options (text runs from x = 980 to 2175 in a 1280 window), in the results rows, and in the title's deck list (to x = 1388). The automatic palace name is 234 characters. The proposal fields are single-line inputs showing about a quarter of the text. Nothing overflows the page and nothing breaks; a 200-character meaning with spaces wraps correctly. | `overflow-wrap: anywhere` on terms and titles; a cap on the automatic name. |
| 11 | minor | Compose, emoji-only line | Pasted six lines, one of them `🦴🦴🦴 - 👻`. | Five facts kept; the trace says "Left out 1 that was empty or repeated." It was neither. Arabic, Chinese and Hebrew terms went through compose, walk, multiple-choice recall and results intact; the offline planner says plainly that it has no picture for them. | "1 with no words", as the paste screen already says for other lines. |
| 12 | minor | `docs/pitch.md`, Plan B | Laid the speech over the measured walk. | "Scaphoid means boat-shaped, so a sailboat circles the lamp" is the fourth sentence of the speech, about 12 s in; the Scaphoid is on screen only from about 2 to 6 s after the button. By then the screen shows the Triquetrum at the Amphora. | Say it first, or name whatever is on screen. |
| 13 | minor | `docs/pitch.md`, setup line | Followed "clear the site's saved data first" as a presenter. | There is no control for it in the app (the guarded Reset exists only on the error page), so it means DevTools or a fresh profile. Not clearing is mostly harmless: a second pitch run starts from line drawing again (at place 2 the fountain answered right in the first run was uncoloured), but the carpal row reads "next review in 5 minutes · 4 new", and if the previous judge left mid-walk the title opens with "You were on a walk ... Resume your walk / Start over" above the button. The judge button still starts a fresh run. | Say how ("open a private window" or "press Start over if the line shows"). |
| 14 | minor | Title, built-in decks | Pressed "Recall" on a deck marked "not started". | A recall walk starts at once: "What did you leave at The Lamp?" about a list that was never shown. | Offer Recall only after a first walk, as principle 6 implies. |
| 15 | minor | `docs/pitch.md` Plan B; TASKS.md | Read them against `docs/research.md`. | Pitch: "both flag a high risk of bias, and a 2025 review grades the evidence low to very low" reads as a third source; the 2025 review is the second meta-analysis (README has it right). TASKS.md still lists F-15 (the comparison test), the README and the pitch as `todo` under Milestone 3. | "and the newer of the two grades ...". |

Checked and found sound (round four and earlier): P pauses and Space resumes without skipping,
with the remaining time kept (1.5 s used, 2.6 s after resume); Right arrow while paused moves on
and clears the pause; Left goes back and the earlier stop is timed again; the clock stops under
the Leave dialog whether paused or not; a reload mid-walk in the pitch variant gives "Resume
your walk" and the resumed walk is still timed; the interstitial ignores P and Left, and waited
82 s in a run where I pressed nothing; browser Back on it opens the Leave dialog; number keys pressed during
the glide to a question do not answer it; feedback 1.8 to 2.0 s right, 3.2 to 3.6 s wrong; images are
absent on the "now hidden" screen (greybox frame and the footage). Default Judge Mode: 5 of 8 as
entered, the three misses each with "Strengthen this image", 121 s after the page had loaded, with about a second per
answer. Review the next day: "Reviews (8 due)", after a reload too; a reload after three
answers resumed at place 3 with the answers kept. Two tabs: decks and review cards from both
survive. Malformed review, draft, settings, comparison and walk records: all survived, and Judge Mode started after every one. A due card for a missing item or a missing deck is ignored ("Nothing to review yet"); a due time that is a string and negative counts are set aside with the quiet line; a card in box 99, a due time of 0 and a card whose key and item id disagree are kept and reviewed normally; a draft with no plan or with 14 items goes back to the paste screen with its text ("Draft restored"); settings of the wrong kind, comparison results of the wrong shape (the introduction then says nobody is recorded) and seven keys of non-JSON all give the one quiet line. Walk snapshots (kept in sessionStorage): one for a deleted deck is dropped without a line; a step of 99 or a recall snapshot of the wrong shape is set aside; one naming another layout is both "set aside" and offered as "Resume your walk", and resumed correctly at place 3 on Domus. In all, 27 hand-made shapes plus the suite's four; the only gaps are issues 3 and 7.

## The comparison test

| Address | Arms ran as | Entered | Table | CSV row |
|---|---|---|---|---|
| `list-first&palace=carpals` | list (citric acid cycle), then palace (carpal bones) | 5 and 1 | 5 of 8, 1 of 8 | `list-first,carpals,5,…,1,…` |
| `palace-first&palace=krebs` | palace (citric acid cycle), then list (carpal bones) | 3 and 6 | 6 of 8, 3 of 8 | `palace-first,krebs,6,…,3,…` |
| `palace-first&palace=carpals` | palace (carpal bones), then list (citric acid cycle) | 8 and 0 | 0 of 8, 8 of 8 | `palace-first,carpals,0,…,8,…` |
| `list-first&palace=krebs` | list (carpal bones), then palace (citric acid cycle) | 2 and 1 | 2 of 8, 1 of 8 | `list-first,krebs,2,…,1,…` |
| "Next participant" after the second | the same combination again, straight to Part 1 | 8 and 8 | 8 of 8, 8 of 8 | third row |

Means were right each time (5.5 and 2.0 for n = 2; 6.3 and 4.0 for n = 3; 1.0 and 4.5 in the
second browser). The per-participant sentence named the right order and lists, and counted how
many had each list in the palace. Both arms offer the same eight answers in one fixed order per
arm, with no feedback; both lists are term plus a short meaning. "Next participant" behaves as
`docs/venue-test.md` warns. I would believe a number this produces as a description of what
was answered. I would not read it as palace against list unless the counts per list are equal,
which the screen itself says; the table has no mean per list, so an unbalanced set cannot be
read from it. ("Clear all results": asks first with a "Delete" button, then the table reads "Nobody yet", n = 0, and the stored key is gone.)

## Motion notes from the footage

`demo-pitch.mp4`: 86 s, 960 × 600, 15 frames a second. Judged from six contact sheets (one a frame-per-second overview of the whole film, five at five frames a second).

- **Button to first place.** One frame of bare vellum, then the vestibule already gliding. It
  reads as a cut through paper, not as a fault. The glide to the Lamp is slow and level.
- **An image appearing.** The medallion comes up through one half-transparent frame (about a
  fifth of a second) and the first glaze spreads on the wall behind it over roughly half a
  second. Clear and unhurried. The small badge orbits the medallion the whole time: a little busy.
- **Pans.** No whip anywhere I sampled. The turn to the Statue passes over about a second of
  nearly empty wall; the turn-rate cap makes it calm but it is the dullest second of the film.
- **"Now hidden."** The topiary stands without its medallion for the whole screen. Good.
- **Start of the spot check.** One blank frame, then a pan across the uncoloured vestibule (the
  one-frame vanish is on the known list).
- **A right answer.** Ring on the floor first, the medallion fading in, then pigment on the
  object and a wash on the wall, complete in under a second; the red bench and the plum arch are
  the two best frames in the film. The pointer hesitating over the options looks like a hand.
- **Results tour.** "3 of 4" appears while the camera stays on the last place for about 2.5 s,
  then a cross-fade through paper to the Cloak Bench (held about 3.5 s), then to the Arch. Calm,
  and every stop is a coloured place. At this frame size only three of the four result rows are
  above the pinned buttons; the fourth needs a scroll.
- **Not in the film:** a wrong answer's reveal in close-up, the default two-minute mode, reduced motion.

Sanguine across a walk (eight frames after right answers, several taken before the camera had
arrived because of the machine): red, blue, plum, teal and green are easy to tell apart and none
merges with the red-chalk line. The Amphora and the Statue both carry blue, and the Lamp and the
Sundial both amber, in every theme: with six accents on twelve places "distinct in colour" holds
only within a room. I did not get a usable frame of an amber place in Sanguine.

## Documents against the build

| Claim | Where | Build |
|---|---|---|
| "Try it in 2 minutes", "Try it in 90 seconds", 83 to 89 s | README, Devpost, pitch, buttons | Labels match. Pitch run: 47.9 s walk, 26 to 34 s spot check. Default run: 121 s. |
| Each place 4 s; `encodeSecondsPerStop` is 4; smoke `--only p --serial` | pitch | True (3.8 to 4.1 s; constants 4, 2 and 3.5 s). |
| "Timed stops can be paused with the Pause button or the P key" | README, pitch | Encode stops only (issue 5). |
| "the demo runs on the offline planner" | Devpost | Not so: fixtures (issue 2). |
| First right answer tomorrow, a miss in 10 minutes, then 3, 7, 21 days | README, results text | Tomorrow, 10 minutes and 3 days seen; 7 and 21 not reached. |
| 51 seconds each, 20 s of sums, eight ordered questions, CSV stays on device | README, venue protocol | True for the list; the walk is "about 51" and stretched to 63 and 66 s here (issue 6). Labels "See the results so far", "Copy as CSV", "Next participant" match. |
| "A reload or Escape in the middle of a run abandons it and records nothing" | venue protocol | True; Escape asks first. Back is not mentioned and leaves the site (issue 8). |
| g = 0.65, 13 trials; d = 0.88; both flag bias; low to very low; 142 participants, 2012; 80s BCE | README, Devpost, pitch, results text | Match `docs/research.md` rows 9 and 10 and its wording. |
| "13 of 13 cases" | README, TASKS.md | 11 of 13 in my full run; the two failures passed when run alone (issue 4). |
| Devpost placeholders | Devpost | Four HTML comments and a "Before submitting (delete this section)" list remain by design; none may reach the form. |

## Not tested, and why

- **Live Architect, deployed site, real-GPU frame rate, real people**: as before.
- **`?perf`, `?debug`, cyanotype and nocturne themes, reduced motion, narrow windows**: no time; review 2 covered the last two.
- **Theme Lab sliders with a real drag**: one attempt on the `light.ambient` track (a 2-pixel-high element) left the value at 0.90; I cannot say whether the drag or my aim failed. Copy JSON took a real click and held valid JSON. There is no theme control during a walk, so a mid-walk theme switch is not possible from the interface.
- **The cranial nerves deck in typed mode**: not run; the citric acid cycle was (7 of 8, then a next-day review).
- **The results tour live** and the default mode's tour: seen only in the pitch footage.
- **"Strengthen this image" then Judge Mode** (issue 3), and **7- and 21-day intervals**.
- **Whether a person can read a place in 4 s**: still untested on anyone.
- **Screen readers and contrast**: not re-measured.
