import { useMemo, useState } from 'react';
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

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="bar__fill" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
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

  useWalkKeys({
    next: phase === 'walk' && (arrived || judge) ? advance : undefined,
    back: phase === 'walk' && step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (phase === 'routeCheck') return <RouteCheck />;
  if (!locus) return null;

  return (
    <section className="screen" data-testid="familiarize">
      <p className="label">{judge ? 'Route preview' : 'Learn the route'}</p>
      <p className="lede">
        {judge
          ? `A quick look at the route: ${stops.length} places, always in this order.`
          : 'First walk the empty route. The places never change order, so each one can hold one fact.'}
      </p>
      <hr />
      <div aria-live="polite">
        <p className="label" data-testid="walk-label">
          Place {step + 1} of {stops.length}
          {room ? ` · ${room.name}` : ''}
        </p>
        <h2 className="term" data-testid="place-name">
          {locus.name}
        </h2>
        {arrived || judge ? (
          <p className="body" data-testid="place-hint">
            {locus.hint}
          </p>
        ) : (
          <p className="muted">Walking there.</p>
        )}
      </div>
      {judge ? (
        <>
          <ProgressBar value={(step + progress) / stops.length} label="Route preview progress" />
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={beginEncodeAfterFamiliarize} data-testid="preview-skip">
              Skip the preview
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
          <button type="button" className="btn btn--primary" disabled={!arrived} onClick={advance} data-testid="walk-next">
            {last ? 'Check the route' : 'Next place'}
          </button>
        </div>
      )}
      {!judge && <p className="hint">Right arrow or Space: next. Left arrow: back.</p>}
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
      <h2 className="question" data-testid="route-question">
        Which place comes right after {q.anchor.name}?
      </h2>
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
        <button type="button" className="btn btn--quiet" onClick={repeatFamiliarize}>
          Walk the route again
        </button>
        {solved && (
          <button type="button" className="btn btn--primary" autoFocus onClick={advance} data-testid="route-next">
            {lastQuestion ? 'Place the images' : 'Next question'}
          </button>
        )}
      </div>
      <p className="hint">Keys 1 to {q.options.length} pick an answer.</p>
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

  // Nothing moves on by itself while the "leave?" question is open.
  const paused = useFlow((s) => s.confirmLeave);
  const progress = useCountdown(judge && walking && arrived && !paused, timing.encodeSecondsPerStop, step, advanceEncode);
  const wait = useCountdown(judge && !walking && !paused, timing.interstitialSeconds, 'interstitial', beginRecallAfterEncode);

  useWalkKeys({
    next: !walking ? beginRecallAfterEncode : arrived ? advanceEncode : undefined,
    back: walking && step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (!walking) {
    return (
      <section className="screen" data-testid="interstitial">
        <p className="label">{spot ? 'Spot check' : 'Recall walk'}</p>
        <h2 className="question">Now walk it again. The images are hidden. Answer from memory.</h2>
        {spot && (
          <p className="body" data-testid="spot-note">
            We will check {numberWord(spot)} of the {numberWord(stops.length)}, picked at random, in route order.
          </p>
        )}
        <p className="body">
          At each place, say what you left there before you look. Trying to retrieve it is the part that makes it last.
        </p>
        {judge && <ProgressBar value={wait} label="Time until the recall walk starts" />}
        <div className="actions">
          <button type="button" className="btn btn--primary" autoFocus onClick={beginRecallAfterEncode} data-testid="recall-start">
            {spot ? 'Start the spot check' : 'Start the recall walk'}
          </button>
        </div>
      </section>
    );
  }
  if (!locus || !item) return null;

  return (
    <section className="screen" data-testid="encode">
      <p className="label" data-testid="walk-label">
        Place {step + 1} of {stops.length} · {locus.name}
      </p>
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
            {item.imago.reason && (
              <p className="reason">
                <span className="label">Why</span> {item.imago.reason}
              </p>
            )}
          </>
        ) : (
          <p className="muted">Walking to {locus.name}.</p>
        )}
      </div>
      {judge && <ProgressBar value={arrived ? progress : 0} label="Time at this place" />}
      <div className="actions">
        <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
          Back
        </button>
        <button type="button" className="btn btn--primary" disabled={!arrived} onClick={advanceEncode} data-testid="walk-next">
          {last ? 'I can see it. Finish' : 'I can see it'}
        </button>
      </div>
      <p className="hint">
        Picture it happening at this exact spot. {judge ? 'It moves on by itself; Space moves on sooner.' : 'Right arrow or Space: next. Left arrow: back.'}
      </p>
    </section>
  );
}
