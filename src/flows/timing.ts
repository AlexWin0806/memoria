/**
 * Every timing constant of the overlay lives here, so a run can be re-timed in one place.
 * The camera glide between stops belongs to the engine (src/scene/rail.ts: 1.6 to 3 s,
 * times 0.7 in Judge Mode) and comes on top of the per-stop times below.
 */

export type JudgeVariant = 'default' | 'pitch';

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
 * In both variants the screen between the two walks waits for its button, and every timed
 * stop (an image on the encode walk, the feedback after a recall answer) can be paused (P):
 * nothing a judge has to read is taken away by a timer.
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
};

/**
 * A Judge run starts with every place of its deck in ruins (the judge has not learned the list
 * yet): a place goes under repair when its image is placed on the study walk, and is restored
 * or left damaged by the answer on the recall walk. Set to false and a Judge run looks as it
 * did before: every place whole throughout. Read in src/state/sceneView.ts and nowhere else.
 */
export const JUDGE_STARTS_IN_RUINS = true;

/** If the engine has not reported `arrived` after this long, the walk carries on anyway. */
export const ARRIVED_FALLBACK_MS = 6000;

/** How long the overlay waits for the Architect before offering to continue by hand. */
export const PLAN_TIMEOUT_MS = 60_000;
export const REGENERATE_TIMEOUT_MS = 26_000;
/** On the Judge results screen "Strengthen this image" must answer at once, network or not. */
export const JUDGE_REGENERATE_TIMEOUT_MS = 1500;

/** How often "next review in 10 minutes" labels are refreshed. */
export const CLOCK_TICK_MS = 30_000;
