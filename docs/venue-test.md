# Venue comparison test: how to run it

Purpose: honest, informal numbers for the pitch and Devpost ("n = 8, informal: 6.2 of 8 with
the palace against 4.0 of 8 with a plain list"). It is not a study and we never call it one.

## Setup (once)

1. Open the deployed site, or a local production build, on the demo laptop. It works offline.
2. Results stay in this browser only. Use one laptop and one browser for everyone, or copy
   the CSV from each device at the end.
3. Use a fresh browser profile, so that no edited deck and no earlier result is in the way.

## The four combinations

Two things differ between volunteers, and each is fixed by the address:

- **Order**: which comes first, the plain list or the palace walk
  (`compare=list-first` or `compare=palace-first`).
- **Material**: which of the two lists is walked in the palace; the other one is the plain list
  (`palace=carpals`: the carpal bones in the palace, the citric acid cycle as the list;
  `palace=krebs`: the citric acid cycle in the palace, the carpal bones as the list).

Without the second one, "palace against list" could not be told apart from "carpal bones
against citric acid cycle". Give the volunteers these four addresses in turn, then start again
at the first:

| Volunteer | Address | First | In the palace |
|---|---|---|---|
| 1, 5, 9 | `/?compare=list-first&palace=carpals` | list | carpal bones |
| 2, 6, 10 | `/?compare=palace-first&palace=krebs` | palace | citric acid cycle |
| 3, 7, 11 | `/?compare=palace-first&palace=carpals` | palace | carpal bones |
| 4, 8, 12 | `/?compare=list-first&palace=krebs` | list | citric acid cycle |

Any two neighbours in this rotation differ in the material, and volunteers 1 and 2 differ in
both, so even two people give each list one turn in the palace. Stop after a multiple of four
if you can: only then are order and material both balanced. Plain `/?compare` draws both at
random, which with a handful of people can put everyone in the same combination.

Open the address afresh for every volunteer. **Do not press "Next participant"** when an
address fixes the combination: it would run the same combination again.

If the build has no second picture set (no citric acid cycle deck), `palace=krebs` quietly
runs with the carpal bones in the palace. The results table says which list each person
walked, so check its "In the palace" column after volunteer 2.

## For each volunteer (about 4 to 4.5 minutes)

1. Recruit people who have **not** seen Judge Mode: it uses the same eight carpal bones, so
   anyone who has tried it already knows one of the lists. Skip pre-med and biochemistry
   students if you can; they may know either list already.
2. Open the next address in the rotation.
3. Say only this: "You will memorise two short lists in two different ways, and be tested on
   each. It takes about four minutes. Just follow the screen." Do not explain the method.
4. Do not help, hint or react while they work. Stay quiet during both study phases.
5. When the results screen shows, let them look. A reload or Escape in the middle of a run
   abandons it and records nothing: start that volunteer's address again, or skip them.

## What each volunteer does

- **List arm:** one list of eight as a numbered list with short meanings, for 50 seconds.
- **Palace arm:** the other list of eight as a timed walk, also 50 seconds including camera
  travel. Each place shows the term, its meaning and the image; it cannot be paused.
- After each: 20 seconds of typed sums (not scored), then eight ordered multiple-choice questions.

## Afterwards

1. Open `/?compare`, choose **See the results so far**, press **Copy as CSV** and paste it
   into the team doc. The column `palace_list` says which list each person walked.
2. Fill in the pitch line and the Devpost "(to fill in)" slots with the two overall means and n,
   and say how many had each list in the palace.
3. Report it exactly as it is, including if the palace did not win.

## Limits to state if asked

- Each person has a different list in each arm. Swapping the lists between people evens that
  out only if the numbers are equal; say so if they are not. Same-session recall only.
- The two lists are not equally hard, and their meanings are not equally long.
- About 18 of the palace arm's 51 seconds are camera travel, so it has less reading time.
- Eight-option multiple choice allows guessing (1 in 8) and elimination, in both arms.
- Small n; order and material balanced by hand, not randomised.
- If a fixture deck was edited on this device ("Strengthen this image"), the palace arm uses
  the edited images. Use a fresh browser profile for the test.
