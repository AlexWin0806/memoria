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
  /** Seconds the "now recall" screen holds before the recall walk starts by itself. null = it waits for its button. */
  interstitialSeconds: number | null;
  /** Recall walk: seconds the feedback is shown after an answer before moving on. */
  feedbackSeconds: number;
  /** Recall checks this many places, picked at random, in route order. null = all of them. */
  spotCheckStops: number | null;
}

export const JUDGE_TIMING: Record<JudgeVariant, JudgeTiming> = {
  /** The title button and `?judge`. */
  default: {
    previewSecondsPerStop: 1.1,
    encodeSecondsPerStop: 4.5,
    interstitialSeconds: 6,
    feedbackSeconds: 1.5,
    spotCheckStops: null,
  },
  /** `?judge=pitch`: sized to sit inside a 2-minute live pitch. */
  pitch: {
    previewSecondsPerStop: 0,
    encodeSecondsPerStop: 4,
    interstitialSeconds: null,
    feedbackSeconds: 1.5,
    spotCheckStops: 4,
  },
};

/**
 * What the title button promises, per variant: the measured length of a passive run (nothing
 * skipped, two seconds of thought per answer), rounded. Measured on the greybox theme with
 *   node scripts/smoke.mjs --only a --serial     default: 111 s
 *   node scripts/smoke.mjs --only p --serial     pitch:    69 s
 * Re-measure and update both the number and the wording after changing anything above.
 */
export const JUDGE_PROMISE: Record<JudgeVariant, { measuredSeconds: number; label: string }> = {
  default: { measuredSeconds: 111, label: 'Try it in 2 minutes' },
  pitch: { measuredSeconds: 69, label: 'Try it in 70 seconds' },
};

/** If the engine has not reported `arrived` after this long, the walk carries on anyway. */
export const ARRIVED_FALLBACK_MS = 6000;

/** How long the overlay waits for the Architect before offering to continue by hand. */
export const PLAN_TIMEOUT_MS = 30_000;
export const REGENERATE_TIMEOUT_MS = 12_000;
/** On the Judge results screen "Strengthen this image" must answer at once, network or not. */
export const JUDGE_REGENERATE_TIMEOUT_MS = 1500;

/** How often "next review in 10 minutes" labels are refreshed. */
export const CLOCK_TICK_MS = 30_000;
