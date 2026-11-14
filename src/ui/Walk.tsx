import { useEffect, useMemo, useRef, useState } from 'react';
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
import { numberWord } from '@/flows/format';
import { useCountdown, useWalkKeys } from '@/flows/hooks';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { isLastStop, useSession } from '@/state/session';

/** The one wording for the advance key, used on every walk screen. */
export const ADVANCE_KEYS = 'Space or Right arrow';

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="bar__fill" style={{ width: `${Math.round(value * 100)}%` }} />
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

/** Familiarization: the empty route, place by place, then a two-question route check. */
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

  useWalkKeys({
    next: phase === 'walk' && (arrived || judge) ? advance : undefined,
    back: phase === 'walk' && step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (phase === 'routeCheck') return <RouteCheck />;
  if (!locus) return null;

  // The Judge preview shows the place name and nothing else to read: each stop lasts about a second.
  if (judge) {
    return (
      <section className="screen" data-testid="familiarize">
        <h1 className="label">Route preview</h1>
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
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} disabled={!arrived} onClick={advance} data-testid="walk-next">
            {last ? 'Check the route' : 'Next place'}
          </button>
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
        </div>
      </div>
      <p className="hint">{ADVANCE_KEYS}: next. Left arrow: back.</p>
    </section>
  );
}

function RouteCheck() {
  const { stops, layoutId } = useSession();
  const layout = getLayout(layoutId);
  const questions = useMemo(() => buildRouteQuestions(layout, stops), [layout, stops]);
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const q = questions[index];
  const heading = useFocusWhenReady<HTMLHeadingElement>(true, index);

  const pick = (i: number) => {
    const option = q?.options[i];
    if (!option || solved) return;
    if (option.id === q.answer.id) setSolved(true);
    else if (!wrong.includes(option.id)) setWrong([...wrong, option.id]);
  };
  const advance = () => {
    if (!solved) return;
    if (index >= questions.length - 1) {
      beginEncodeAfterFamiliarize();
      return;
    }
    setIndex(index + 1);
    setWrong([]);
    setSolved(false);
  };
  useWalkKeys({ pick, next: solved ? advance : undefined });

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
          const state = solved && o.id === q.answer.id ? 'right' : wrong.includes(o.id) ? 'wrong' : undefined;
          return (
            <li key={o.id}>
              <button
                type="button"
                className="choice"
                data-state={state}
                data-testid="route-option"
                disabled={solved || wrong.includes(o.id)}
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
          : wrong.length > 0
            ? 'Not that one. Picture the walk and try again.'
            : ''}
      </p>
      <div className="actions">
        {solved && (
          <button type="button" className="btn btn--primary" autoFocus onClick={advance} data-testid="route-next">
            {lastQuestion ? 'Place the images' : 'Next question'}
          </button>
        )}
        <button type="button" className="btn btn--quiet" onClick={repeatFamiliarize}>
          Walk the route again
        </button>
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
  // The interstitial moves on by itself only when the run has a hold time; otherwise it waits for its button.
  const hold = judge ? timing.interstitialSeconds : null;

  // Nothing moves on by itself while the "leave?" question is open.
  const paused = useFlow((s) => s.confirmLeave);
  const progress = useCountdown(judge && walking && arrived && !paused, timing.encodeSecondsPerStop, step, advanceEncode);
  const wait = useCountdown(hold !== null && !walking && !paused, hold ?? 0, 'interstitial', beginRecallAfterEncode);
  const nextRef = useFocusWhenReady<HTMLButtonElement>(walking && arrived, step);

  useWalkKeys({
    next: !walking ? beginRecallAfterEncode : arrived ? advanceEncode : undefined,
    back: walking && step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (!walking) {
    return (
      <section className="screen" data-testid="interstitial">
        <p className="label">{spot ? 'Spot check' : 'Recall walk'}</p>
        {spot ? (
          // The pitch run: at most 20 words, and it waits for the button.
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
        {hold !== null && <ProgressBar value={wait} label="Time until the recall walk starts" />}
        <div className="actions">
          <button type="button" className="btn btn--primary" autoFocus onClick={beginRecallAfterEncode} data-testid="recall-start">
            {spot ? 'Start the spot check' : 'Start the recall walk'}
          </button>
        </div>
        <p className="hint">
          {hold !== null ? `It starts by itself; ${ADVANCE_KEYS} starts it sooner.` : `${ADVANCE_KEYS}: start.`}
        </p>
      </section>
    );
  }
  if (!locus || !item) return null;

  return (
    <section className="screen" data-testid="encode">
      <h1 className="label" data-testid="walk-label">
        Place {step + 1} of {stops.length} · {locus.name}
      </h1>
      {/* The live region stays mounted so that each new image is announced when it appears. */}
      <div aria-live="polite">
        {arrived ? (
          <>
            <h2 className="term" data-testid="encode-term">
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
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
        </div>
      </div>
      <p className="hint">
        {judge
          ? `It moves on by itself; ${ADVANCE_KEYS} moves on sooner.`
          : `Picture it happening at this exact spot. ${ADVANCE_KEYS}: next. Left arrow: back.`}
      </p>
    </section>
  );
}
