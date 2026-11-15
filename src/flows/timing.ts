/**
 * Every timing constant of the overlay lives here, so a run can be re-timed in one place.
 * The camera glide between stops belongs to the engine (src/scene/rail.ts: 1.6 to 3 s,
 * times 0.7 in Judge Mode) and comes on top of the per-stop times below.
 */

export type JudgeVariant = 'default' | 'pitch' | 'short';

export interface JudgeTiming {
  /** Route preview: seconds per stop. 0 = no preview, straight to the encode walk. */
  previewSecondsPerStop: number;
  /** Encode walk: seconds an image is shown, counted from arrival, before moving on. */
  encodeSecondsPerStop: number;
  /** Recall walk: seconds the feedback is shown after a right answer before moving on. */
  feedbackSeconds: number;
  /** The same after a miss: longer, because that is the moment to look at the image again. */
  missFeedbackSeconds: number;
  /** Recall checks this many places, picked at random, in route order. null = all of them. */
  spotCheckStops: number | null;
}

/*
 * In every variant the screen between the two walks waits for its button, and every timed
 * stop (an image on the encode walk, the feedback after a recall answer) can be paused (P):
 * nothing a judge has to read is taken away by a timer. The learner's own walks have two
 * timed stops of the same kind, further down: SURVEY_HOLD_SECONDS, FAMILIARIZE_SECONDS_PER_STOP.
 */
export const JUDGE_TIMING: Record<JudgeVariant, JudgeTiming> = {
  /** The title button and `?judge`. */
  default: {
    previewSecondsPerStop: 1.1,
    encodeSecondsPerStop: 4.5,
    feedbackSeconds: 2,
    missFeedbackSeconds: 3.5,
    spotCheckStops: null,
  },
  /** `?judge=pitch`: sized to sit inside a 2-minute live pitch. */
  pitch: {
    previewSecondsPerStop: 0,
    encodeSecondsPerStop: 4,
    feedbackSeconds: 2,
    missFeedbackSeconds: 3.5,
    spotCheckStops: 3,
  },
  /**
   * `?judge=short`: the five stages of the cell cycle instead of the eight carpal bones, timed
   * as the pitch run, and every place is asked: on five places a spot check would save little.
   */
  short: {
    previewSecondsPerStop: 0,
    encodeSecondsPerStop: 4,
    feedbackSeconds: 2,
    missFeedbackSeconds: 3.5,
    spotCheckStops: null,
  },
};

/**
 * What the title button promises, per variant: the measured length of a passive run (nothing
 * skipped or paused, two seconds of thought per answer, and time to read the screen between
 * the walks before pressing its button: eight seconds for the default run's 33 words, four
 * for the pitch run's 18). Measured on the greybox theme, each case alone, with
 *   node scripts/smoke.mjs --only a --serial     default: 123 s
 *   node scripts/smoke.mjs --only p --serial     pitch:    77 s (a few seconds either way: the three spot-check places are random)
 * The pitch label is rounded up, so that the promise is kept with room to spare; the default
 * label is the run's length to the nearest half minute. Re-measure and update both the number
 * and the wording after changing anything above.
 */
export const JUDGE_PROMISE: Record<JudgeVariant, { measuredSeconds: number; label: string }> = {
  default: { measuredSeconds: 123, label: 'Try it in 2 minutes' },
  pitch: { measuredSeconds: 77, label: 'Try it in 90 seconds' },
  short: { measuredSeconds: 60, label: 'Try it in 60 seconds' },
};

/**
 * A Judge run starts with every place of its deck in ruins (the judge has not learned the list
 * yet): a place goes under repair when its image is placed on the study walk, and is restored
 * or left needing repair by the answer on the recall walk. Set to false and a Judge run looks
 * as it did before: every place whole throughout, and its results say nothing about repair.
 * Read in src/state/sceneView.ts (the scene) and src/ui/Results.tsx (the legend and the rows).
 * It sets no timer: every stop lasts as long with it on as with it off.
 */
export const JUDGE_STARTS_IN_RUINS = true;

/**
 * A Judge run says what the ruins mean (RuinsLine in src/ui/Legend.tsx) over the route preview
 * and on this many stops of the study walk, counted from the first. By the second stop a place
 * has been rebuilt in front of the judge and the line has been true on screen; after that it
 * would only be one more thing to read in four seconds. It sets no timer either.
 */
export const JUDGE_RUINS_LINE_STOPS = 2;

/**
 * The survey moves on by itself after an answer. The place stands or falls (the engine's
 * collapse takes 0.9 s); the walk holds this long so that it is seen, then goes to the next
 * place: one key press per place. Under reduced motion the hold stays: it is also the time
 * to read "Noted". Like every timed stop it can be paused (P).
 */
export const SURVEY_HOLD_SECONDS = 1.2;

/**
 * The walk of the empty route (after a skipped survey, or again from the route check) moves on
 * by itself: seconds at each place, counted from arrival, to read its name and what it looks
 * like. Space moves on sooner, P pauses.
 */
export const FAMILIARIZE_SECONDS_PER_STOP = 2.5;

/** If the engine has not reported `arrived` after this long, the walk carries on anyway. */
export const ARRIVED_FALLBACK_MS = 6000;

/** How long the overlay waits for the Architect before offering to continue by hand. */
export const PLAN_TIMEOUT_MS = 60_000;
export const REGENERATE_TIMEOUT_MS = 26_000;
/** On the Judge results screen "Strengthen this image" must answer at once, network or not. */
export const JUDGE_REGENERATE_TIMEOUT_MS = 1500;

/** How often "next review in 10 minutes" labels are refreshed. */
export const CLOCK_TICK_MS = 30_000;
