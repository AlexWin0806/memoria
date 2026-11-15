import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildRouteQuestions } from '@/flows/answers';
import {
  advanceEncode,
  beginEncodeAfterFamiliarize,
  beginRecallAfterEncode,
  finishFamiliarize,
  itemAt,
  judgeTiming,
  repeatFamiliarize,
  useFlow,
} from '@/flows/flow';
import { numberWord, termLength } from '@/flows/format';
import { useCountdown, useTimedStop, useWalkKeys } from '@/flows/hooks';
import { studyLines } from '@/flows/process';
import { FAMILIARIZE_SECONDS_PER_STOP, JUDGE_RUINS_LINE_STOPS, JUDGE_STARTS_IN_RUINS } from '@/flows/timing';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { useReview } from '@/state/review';
import { isLastStop, useSession } from '@/state/session';
import { RuinsLine } from './Legend';
import './process.css';

/** The one wording for the advance key, used on every walk screen. */
export const ADVANCE_KEYS = 'Space or Right arrow';

/**
 * A thin progress bar. The fill eases forwards only: when the value drops (a new stop begins)
 * it is reset at once, where the transition used to drain it from full to empty.
 */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const fill = useRef<HTMLDivElement>(null);
  const shown = useRef(pct);
  const dropped = pct < shown.current;
  useLayoutEffect(() => {
    shown.current = pct;
    // Reading a layout value applies the reset now, before the next render switches the transition back on.
    if (dropped) void fill.current?.offsetWidth;
  });
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div ref={fill} className="bar__fill" style={{ width: `${pct}%`, transition: dropped ? 'none' : undefined }} />
    </div>
  );
}

/** Moves focus to the screen's primary action once it can be used (the stop is ready). */
function useFocusWhenReady<T extends HTMLElement>(ready: boolean, key: string | number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (ready) ref.current?.focus({ preventScroll: true });
  }, [ready, key]);
  return ref;
}

/**
 * Familiarization: the empty route, place by place, then a two-question route check. The
 * learner's walk moves on by itself at a readable pace (FAMILIARIZE_SECONDS_PER_STOP at each
 * place, from arrival): there is nothing to do at an empty place but look, and one press per
 * place was a press too many. Space moves on sooner, P pauses, Left arrow goes back.
 */
export function Familiarize() {
  const { stops, step, arrived, judge, layoutId } = useSession();
  const phase = useFlow((s) => s.phase);
  const layout = getLayout(layoutId);
  const locus = layout.loci[stops[step]];
  const last = isLastStop({ step, stops });
  const room = layout.rooms.find((r) => r.id === locus?.roomId);

  const advance = () => {
    if (last) finishFamiliarize();
    else useSession.getState().next();
  };
  // The Judge preview is a fly-through: it keeps moving without waiting for the camera to settle.
  const paused = useFlow((s) => s.confirmLeave);
  const progress = useCountdown(judge && phase === 'walk' && !paused, judgeTiming().previewSecondsPerStop, step, advance);
  const nextRef = useFocusWhenReady<HTMLButtonElement>(!judge && phase === 'walk' && arrived, step);
  // The learner's walk: a timed stop like the others, which can be paused. The pause belongs to the stop it was set at.
  const canHold = !judge && phase === 'walk' && arrived;
  const { progress: atPlace, held, toggle } = useTimedStop('familiarize', step, FAMILIARIZE_SECONDS_PER_STOP, canHold, advance);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const toggleHold = () => {
    // Paused, the focus is on the control, so that Space resumes; resumed, it is back on "Next place".
    (toggle() ? pauseRef : nextRef).current?.focus({ preventScroll: true });
  };

  useWalkKeys({
    next: phase === 'walk' && (arrived || judge) ? advance : undefined,
    back: phase === 'walk' && step > 0 ? () => useSession.getState().prev() : undefined,
    pause: canHold ? toggleHold : undefined,
    resume: held ? toggleHold : undefined,
  });

  if (phase === 'routeCheck') return <RouteCheck />;
  if (!locus) return null;

  // The Judge preview shows the place name and nothing else to read: each stop lasts about a second.
  if (judge) {
    return (
      <section className="screen" data-testid="familiarize">
        <h1 className="label">Route preview</h1>
        {/* The preview flies over rubble for nine seconds: this says why. */}
        {JUDGE_STARTS_IN_RUINS && <RuinsLine />}
        <div aria-live="polite">
          <p className="label" data-testid="walk-label">
            Place {step + 1} of {stops.length}
          </p>
          <p className="term term--large" data-testid="place-name">
            {locus.name}
          </p>
        </div>
        <ProgressBar value={(step + progress) / stops.length} label="Route preview progress" />
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={beginEncodeAfterFamiliarize} data-testid="preview-skip">
            Skip the preview
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen" data-testid="familiarize">
      <h1 className="label">Learn the route</h1>
      <p className="lede">First walk the empty route. The places never change order, so each one can hold one fact.</p>
      <hr />
      <div aria-live="polite">
        <p className="label" data-testid="walk-label">
          Place {step + 1} of {stops.length}
          {room ? ` · ${room.name}` : ''}
        </p>
        <h2 className="term" data-testid="place-name">
          {locus.name}
        </h2>
        {arrived ? (
          <p className="body" data-testid="place-hint">
            {locus.hint}
          </p>
        ) : (
          <p className="muted">Walking there.</p>
        )}
      </div>
      <div className="pin">
        <ProgressBar value={arrived ? atPlace : 0} label="Time at this place" />
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} disabled={!arrived} onClick={advance} data-testid="walk-next">
            {last ? 'Check the route' : 'Next place'}
          </button>
          <button type="button" className="btn" ref={pauseRef} disabled={!arrived} aria-pressed={held} onClick={toggleHold} data-testid="familiarize-pause">
            {held ? 'Resume' : 'Pause'}
            <span className="key" aria-hidden="true">
              P
            </span>
          </button>
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
        </div>
      </div>
      <p className="hint" data-testid="familiarize-hint">
        {held ? 'Paused. Space or P resumes.' : `It moves on by itself; ${ADVANCE_KEYS} moves on sooner. P pauses. Left arrow: back.`}
      </p>
    </section>
  );
}

/** Wrong picks on one question of the route check before it counts as missed. */
const ROUTE_CHECK_TRIES = 2;

/**
 * The route check: which place comes right after another, twice. A question can be missed
 * (research principle 3 asks for a check that is passed, not a formality): after a second
 * wrong pick the right place is named, and walking the route again is offered beside going on.
 */
function RouteCheck() {
  const { stops, layoutId } = useSession();
  const layout = getLayout(layoutId);
  const questions = useMemo(() => buildRouteQuestions(layout, stops), [layout, stops]);
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const q = questions[index];
  const heading = useFocusWhenReady<HTMLHeadingElement>(true, index);

  const missed = !solved && wrong.length >= ROUTE_CHECK_TRIES;
  const over = solved || missed;
  const pick = (i: number) => {
    const option = q?.options[i];
    if (!option || over) return;
    if (option.id === q.answer.id) setSolved(true);
    else if (!wrong.includes(option.id)) setWrong([...wrong, option.id]);
  };
  const advance = () => {
    if (!over) return;
    if (index >= questions.length - 1) {
      beginEncodeAfterFamiliarize();
      return;
    }
    setIndex(index + 1);
    setWrong([]);
    setSolved(false);
  };
  useWalkKeys({ pick, next: over ? advance : undefined });

  if (!q) return null;
  const lastQuestion = index >= questions.length - 1;
  return (
    <section className="screen" data-testid="route-check">
      <p className="label">
        Route check · {index + 1} of {questions.length}
      </p>
      <h1 className="question" tabIndex={-1} ref={heading} data-testid="route-question">
        Which place comes right after {q.anchor.name}?
      </h1>
      <ol className="choices">
        {q.options.map((o, i) => {
          const state = over && o.id === q.answer.id ? 'right' : wrong.includes(o.id) ? 'wrong' : undefined;
          return (
            <li key={o.id}>
              <button
                type="button"
                className="choice"
                data-state={state}
                data-testid="route-option"
                disabled={over || wrong.includes(o.id)}
                onClick={() => pick(i)}
              >
                <span className="choice__key">{i + 1}</span>
                <span>{o.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="feedback" aria-live="polite" data-testid="route-feedback">
        {solved
          ? `Yes. ${q.answer.name} comes right after ${q.anchor.name}.`
          : missed
            ? `It was ${q.answer.name}: ${q.answer.name} comes right after ${q.anchor.name}. Walk the route again if the order is not clear yet.`
            : wrong.length > 0
              ? 'Not that one. Picture the walk and try again.'
              : ''}
      </p>
      {/* After a miss the walk is the first thing offered, and going on is the learner's choice. */}
      <div className="actions">
        {solved && (
          <button type="button" className="btn btn--primary" autoFocus onClick={advance} data-testid="route-next">
            {lastQuestion ? 'Place the images' : 'Next question'}
          </button>
        )}
        <button type="button" className={missed ? 'btn btn--primary' : 'btn btn--quiet'} autoFocus={missed} key={missed ? 'again-missed' : 'again'} onClick={repeatFamiliarize} data-testid="route-again">
          Walk the route again
        </button>
        {missed && (
          <button type="button" className="btn" onClick={advance} data-testid="route-next">
            Go on
          </button>
        )}
      </div>
      <p className="hint">
        Keys 1 to {q.options.length} pick an answer. {ADVANCE_KEYS}: next.
      </p>
    </section>
  );
}

/** Encode walk: one image per place, learner-paced (timed in Judge Mode). */
export function Encode() {
  const { stops, step, arrived, judge, layoutId, deckId } = useSession();
  const phase = useFlow((s) => s.phase);
  const deck = useDeck(deckId);
  const layout = getLayout(layoutId);
  const locus = layout.loci[stops[step]];
  const item = itemAt(deck, locus);
  const last = isLastStop({ step, stops });
  const walking = phase === 'walk';
  const timing = judgeTiming();
  // Judge pitch: the recall walk checks only some of the places.
  const spot = judge && timing.spotCheckStops !== null && timing.spotCheckStops < stops.length ? timing.spotCheckStops : null;

  // A timed stop can be paused (the button or P). The pause belongs to the stop it was set at.
  // The clock stops for the pause and while the "leave?" question is open, and goes on from where it was.
  const canHold = judge && walking && arrived;
  const { progress, held, toggle } = useTimedStop('encode', step, timing.encodeSecondsPerStop, canHold, advanceEncode);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const toggleHold = () => {
    toggle();
    // Focus on the control, so that Space (which otherwise moves on) is the key that resumes.
    pauseRef.current?.focus({ preventScroll: true });
  };
  const nextRef = useFocusWhenReady<HTMLButtonElement>(walking && arrived, step);
  // What the learner answered in the survey, shown beside the right answer. A Judge run has no survey.
  const card = useReview((s) => (!judge && deck?.surveyedAt !== undefined && item ? s.cards[item.id] : undefined));

  useWalkKeys({
    next: !walking ? beginRecallAfterEncode : arrived ? advanceEncode : undefined,
    back: walking && step > 0 ? () => useSession.getState().prev() : undefined,
    pause: canHold ? toggleHold : undefined,
    resume: held ? toggleHold : undefined,
  });

  if (!walking) {
    return (
      <section className="screen" data-testid="interstitial">
        <p className="label">{spot ? 'Spot check' : 'Recall walk'}</p>
        {/* This screen always waits for its button: it says why the next walk matters, and that takes reading. */}
        {spot ? (
          // The pitch run: at most 20 words.
          <>
            <h1 className="question">The images are now hidden.</h1>
            <p className="body" data-testid="spot-note">
              We check {numberWord(spot)} of the {numberWord(stops.length)} places. Answer from memory before you look.
            </p>
          </>
        ) : (
          <>
            <h1 className="question">Now walk it again. The images are hidden. Answer from memory.</h1>
            <p className="body">
              At each place, say what you left there before you look. Trying to retrieve it is the part that makes it last.
            </p>
          </>
        )}
        <div className="actions">
          <button type="button" className="btn btn--primary" autoFocus onClick={beginRecallAfterEncode} data-testid="recall-start">
            {spot ? 'Start the spot check' : 'Start the recall walk'}
          </button>
        </div>
        <p className="hint">{ADVANCE_KEYS}: start.</p>
      </section>
    );
  }
  if (!locus || !item) return null;
  // A process deck: how this step connects to the others, from the deck's links. (A timed Judge run has no time for it.)
  const connects = judge || !deck ? [] : studyLines(deck, item, stops.flatMap((index) => itemAt(deck, layout.loci[index])?.id ?? []));

  return (
    <section className="screen" data-testid="encode">
      <h1 className="label" data-testid="walk-label">
        Place {step + 1} of {stops.length} · {locus.name}
      </h1>
      {/* A Judge run: what the ruins mean, from the first screen until a place or two has been rebuilt. */}
      {judge && JUDGE_STARTS_IN_RUINS && step < JUDGE_RUINS_LINE_STOPS && <RuinsLine />}
      {/* The live region stays mounted so that each new image is announced when it appears. */}
      <div aria-live="polite">
        {arrived ? (
          <>
            {/*
              The learner's own survey answer, then the right one under it. Every fact is studied,
              the ones the survey found known too: a right pick there may have been a guess.
            */}
            {card?.survey && (
              <p className="state" data-testid="encode-survey" data-outcome={card.survey}>
                {card.surveyGiven === undefined
                  ? 'You skipped this place in the survey.'
                  : card.surveyGiven === ''
                    ? 'In the survey you said: I don’t know.'
                    : `In the survey you answered: ${card.surveyGiven}.`}
                {card.survey === 'known' && ' You knew this. Picture it anyway: a right pick can be a guess.'}
              </p>
            )}
            <h2 className="term" data-length={termLength(item.term)} data-testid="encode-term">
              {item.term}
            </h2>
            {item.meaning && (
              <p className="body" data-testid="encode-meaning">
                {item.meaning}
              </p>
            )}
            <hr />
            <p className="scene" data-testid="encode-scene">
              {item.imago.scene}
            </p>
            {/* A timed run leaves no time for a fourth line: the "why" is for learner-paced walks. */}
            {!judge && item.imago.reason && (
              <p className="reason" data-testid="encode-reason">
                <span className="label">Why</span> {item.imago.reason}
              </p>
            )}
            {connects.length > 0 && (
              <div className="links" data-testid="encode-links">
                <p className="label">How this step connects</p>
                <ul>
                  {connects.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="muted">Walking to {locus.name}.</p>
        )}
      </div>
      {/* Pinned to the bottom edge when a long meaning or scene would push the buttons out of view. */}
      <div className="pin">
        {judge && <ProgressBar value={arrived ? progress : 0} label="Time at this place" />}
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} disabled={!arrived} onClick={advanceEncode} data-testid="walk-next">
            {last ? 'I can see it. Finish' : 'I can see it'}
          </button>
          {judge && (
            <button type="button" className="btn" ref={pauseRef} disabled={!arrived} aria-pressed={held} onClick={toggleHold} data-testid="encode-pause">
              {held ? 'Resume' : 'Pause'}
              <span className="key" aria-hidden="true">
                P
              </span>
            </button>
          )}
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
        </div>
      </div>
      <p className="hint" data-testid="encode-hint">
        {held
          ? 'Paused. Space or P resumes.'
          : judge
            ? `It moves on by itself; ${ADVANCE_KEYS} moves on sooner. P pauses.`
            : `Picture it happening at this exact spot. ${ADVANCE_KEYS}: next. Left arrow: back.`}
      </p>
    </section>
  );
}
