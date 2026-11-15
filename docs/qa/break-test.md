# Break test, build `ab6eb8a` (Sun 15 Nov, 2:05 to 2:40 AM ET)

**Verdict: safe to ship and to demo. No blocker; one major (saving a palace with storage full fails silently with an uncaught error), five minors.**
Build `ab6eb8a` in its own worktree, `vite preview` on :4811, headless Chromium (SwiftShader), greybox except where looks were judged (Ink & Vellum, Comer = Gothic, cycle deck = Workshop). About 30 browser sessions, one at a time. The live site and the live Architect were not touched (no requests spent).

## Issues, ranked

| # | Sev | Where | Steps | What happened | Expected | Smallest fix |
|---|---|---|---|---|---|---|
| 1 | major | Compose, "I have read these: place them in the palace" | Design 4 lines (offline planner), fill localStorage to the byte with a script, press the place button. | Nothing on screen changes, no message, button stays enabled; page error `QuotaExceededError: ... 'memoria.decks.v1' exceeded the quota`. Deck not saved. A reload restores the draft (nothing lost). | A line saying the palace could not be saved because browser storage is full, as the draft already does. | Catch the throw around the deck write and show the existing storage notice by the button. |
| 2 | minor | Recall walk, 390 × 700 | `/?judge=pitch`, Try it, skip to the spot check, press 2. | Only the green row and "Next place / Pause" are in view; the "Correct" / "Not this time" line and the term are below the pinned buttons. | The verdict in view on a phone. | Scroll the feedback into view after an answer, or put the verdict line above the options. |
| 3 | minor | Compose, emoji-only notes | Paste three lines of only emoji, Design. | "There was nothing to place. Put one fact on each line." though there are three lines. | Say emoji-only lines are skipped. | Name the reason in the message. |
| 4 | minor | Compose, same line 30 times | Paste `ATP - energy currency` × 30, Design. | "This text gave 1." with no word that 29 repeats were merged. | "29 repeated lines were merged." | Count duplicates in the message. |
| 5 | minor | Two tabs, one deck | Tab A: Walk the cranial nerves deck, answer 3. Tab B: Walk the same deck, answer 3. Reload A. | No warning in either tab; A resumes "place 3 of 12"; whose survey answers count was not checked. | A note that the deck is open in another tab. | After the freeze. |
| 6 | minor | Triple-click on any primary button | Triple-click "place them in the palace". | The next screen opens with all overlay text selected (blue). Harmless. | No selection. | `user-select: none` on buttons. |

Greybox only (a development theme, not shipped): Gothic walls turn near-black with the new tone, so the dark-red candelabrum barely reads. Ink & Vellum Gothic and Workshop looked fine.

## Tried and held

- `/?judge=pitch`: triple-click "Try it", Space/Enter mashed through the study walk, digits and Space mashed through the spot check: results reached, score matched the feedback, no page error. Double-click on "recall-start" ran one walk.
- `/?judge`: Escape mashed (dialog toggles; walk pauses under it), browser Back opens the Leave dialog, Forward harmless; reload mid-preview restarts Judge Mode; offline reload served by the offline copy.
- Eight corrupted `memoria.*` values (bad settings, review `[]`, history `null`, saved walk pointing at a missing deck, malformed draft and exam, truncated decks JSON, future version): title loads, storage notice where data was set aside, Judge Mode starts, no page error. `localStorage.clear()` mid-Judge: walk continued.
- Compose: empty, whitespace, one word, RTL, `<script>`/`<img onerror>`/SQL (shown as text), a 2,000-character meaning (no overflow, survey fine), CRLF, headings only, nested headings, three languages, 40,000 characters (30 kept, 609 listed), 200 lines, exactly 30 (30), 31 (1 left out and named). Triple-click Design and place: one deck.
- PDF: a text file, a 0-byte file and random bytes named `.pdf`: "is not a PDF", the notes kept.
- 390 × 700, 640 × 400, 3440 × 1440: no horizontal overflow, no text under 16 px.
- Smoothed camera: after the term or question appeared the view turned at most 1.3° more over 2.5 s (software rendering, so an upper bound); no overshoot seen. Ink Gothic and Workshop: place names, door sign and panel readable.
- Room names with `~ ; |` are escaped in the layout id (read in `src/layouts/spec.ts`, not run).

## Not tested

Live Architect and network loss during design, regenerate or "Add to this palace"; Exam Mode mashing; reload mid-ordering, mid-exam, mid-PDF; huge, scanned and 101-page PDFs; extending a full palace, edits, deletes, links to self; 200% zoom; reduced motion or theme switched mid-walk; a keyboard-only run from title to results; rubble, dashed outline and floor links in the darker palettes, and anything in motion on a GPU.
