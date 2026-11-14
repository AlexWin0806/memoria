import { useEffect, useRef, useState, type FormEvent } from 'react';
import { answerOf, buildChoices, typedMatches } from '@/flows/answers';
import { advanceRecall, answerRecall, itemAt, judgeTiming, markRight } from '@/flows/flow';
import { termLength } from '@/flows/format';
import { useTimedStop, useWalkKeys } from '@/flows/hooks';
import { ADVANCE_KEYS, ProgressBar } from './Walk';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { isLastStop, useSession } from '@/state/session';
import { useSettings } from '@/state/settings';

/**
 * Recall walk: retrieval practice. The place is the only cue: both answer modes ask what
 * was left there, the answer is the item's term, and nothing about the item is rendered
 * until the learner has committed. Committing is what reveals the image in the scene.
 */
export function Recall() {
  const { stops, step, arrived, judge, layoutId, deckId, results } = useSession();
  const setting = useSettings((s) => s.recallInput);
  const deck = useDeck(deckId);
  const layout = getLayout(layoutId);
  const locus = layout.loci[stops[step]];
  const item = itemAt(deck, locus);
  const result = item ? results.find((r) => r.itemId === item.id) : undefined;
  const input = judge ? 'choice' : setting;
  const last = isLastStop({ step, stops });

  // Options are drawn once per stop and kept for the whole walk, so going back does not reshuffle them.
  const drawn = useRef(new Map<string, string[]>());
  const [typed, setTyped] = useState('');
  const arrivedAt = useRef(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);

  const answered = Boolean(result);
  // When the stop is ready, focus goes to the answer field, or (multiple choice) to the
  // question, so that the next Tab is the first option and no stray key press can answer.
  useEffect(() => {
    if (!arrived) return;
    arrivedAt.current = Date.now();
    setTyped('');
    if (answered) return;
    if (inputRef.current) inputRef.current.focus();
    else questionRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a stop becomes ready, not when it is answered
  }, [arrived, step]);

  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered, step]);

  // Judge Mode keeps moving: the feedback is shown, then the walk goes on by itself. A miss is
  // held longer, because that is the moment to look at the image again.
  const timing = judgeTiming();
  const feedbackSeconds = result && !result.correct ? timing.missFeedbackSeconds : timing.feedbackSeconds;
  // Like a timed encode stop, the feedback can be paused (the button or P). The pause belongs
  // to the stop it was set at; the clock also stops while the "leave?" question is open.
  const canHold = judge && answered;
  const { progress: moveOn, held, toggle } = useTimedStop('recall', step, feedbackSeconds, canHold, advanceRecall);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const toggleHold = () => {
    // Paused, the focus is on the control, so that Space resumes; resumed, it is back on
    // "Next place", so that Space moves on as it does on a stop that was never paused.
    (toggle() ? pauseRef : nextRef).current?.focus({ preventScroll: true });
  };
  const spot = judge && deck !== undefined && stops.length < deck.items.length;

  let choices: string[] = [];
  if (deck && item && input === 'choice') {
    choices = drawn.current.get(item.id) ?? buildChoices(deck, item);
    drawn.current.set(item.id, choices);
  }

  const commit = (given: string) => {
    if (!deck || !item || !arrived || result) return;
    const right = answerOf(item);
    const correct = input === 'choice' ? given === right : typedMatches(given, right);
    answerRecall({ itemId: item.id, correct, given, ms: Date.now() - arrivedAt.current });
  };

  useWalkKeys({
    pick: input === 'choice' && arrived && !result ? (i) => choices[i] !== undefined && commit(choices[i]) : undefined,
    next: result ? advanceRecall : undefined,
    back: step > 0 ? () => useSession.getState().prev() : undefined,
    pause: canHold ? toggleHold : undefined,
    resume: held ? toggleHold : undefined,
  });

  if (!deck || !locus || !item) return null;
  const right = answerOf(item);
  // Only a typed answer can be overruled: the grader may be wrong about wording, never about a picked option.
  const canOverrule = input === 'typed' && result !== undefined && !result.correct && result.given.trim() !== '';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) commit(typed);
  };

  return (
    <section className="screen" data-testid="recall">
      <p className="label" data-testid="walk-label">
        {spot ? `Spot check ${step + 1} of ${stops.length}` : `Place ${step + 1} of ${stops.length} · Recall`}
      </p>
      {!arrived && !result ? (
        <h1 className="muted">Walking to {locus.name}.</h1>
      ) : (
        <>
          <h1 className="question" tabIndex={-1} ref={questionRef} data-testid="recall-question" data-place={locus.name}>
            What did you leave at {locus.name}?
          </h1>
          {input === 'choice' ? (
            <ol className="choices">
              {choices.map((c, i) => {
                const state = !result ? undefined : c === right ? 'right' : c === result.given ? 'wrong' : undefined;
                return (
                  <li key={c}>
                    <button type="button" className="choice" data-state={state} data-testid="choice" disabled={Boolean(result)} onClick={() => commit(c)}>
                      <span className="choice__key">{i + 1}</span>
                      <span>{c}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            !result && (
              <form className="typed" onSubmit={onSubmit}>
                <label htmlFor="recall-input" className="label">
                  Your answer
                </label>
                <input
                  id="recall-input"
                  ref={inputRef}
                  className="field"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-testid="recall-input"
                />
                <div className="actions">
                  <button type="submit" className="btn btn--primary" disabled={!typed.trim()} data-testid="recall-submit">
                    Answer
                  </button>
                </div>
              </form>
            )
          )}
          {!result && (
            <div className="actions">
              <button type="button" className="link" onClick={() => commit('')} data-testid="recall-pass">
                I cannot recall it
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} onClick={advanceRecall} data-testid="recall-next">
            {last ? 'See the results' : 'Next place'}
          </button>
          {judge && (
            <button type="button" className="btn" ref={pauseRef} aria-pressed={held} onClick={toggleHold} data-testid="recall-pause">
              {held ? 'Resume' : 'Pause'}
              <span className="key" aria-hidden="true">
                P
              </span>
            </button>
          )}
          {canOverrule && (
            <button type="button" className="btn" onClick={() => markRight(item.id)} data-testid="recall-overrule">
              I was right
            </button>
          )}
        </div>
      )}
      {result && judge && <ProgressBar value={moveOn} label="Time until the walk moves on" />}

      <div aria-live="polite" data-testid="recall-feedback">
        {result && (
          <div className="reveal" data-state={result.correct ? 'right' : 'wrong'}>
            <p className="verdict" data-testid="recall-verdict">
              {result.selfMarked ? 'Marked right by you.' : result.correct ? 'Correct.' : 'Not this time.'}
            </p>
            {input === 'typed' && result.given && (result.selfMarked || !result.correct) && <p className="muted">You wrote: {result.given}</p>}
            <p className="term term--small" data-length={termLength(item.term)}>
              {item.term}
            </p>
            {item.meaning && <p className="body">{item.meaning}</p>}
            <p className="scene">{item.imago.scene}</p>
          </div>
        )}
      </div>

      <p className="hint" data-testid="recall-hint">
        {result
          ? judge
            ? held
              ? 'Paused. Space or P resumes.'
              : `It moves on by itself; ${ADVANCE_KEYS} moves on sooner. P pauses.`
            : `${ADVANCE_KEYS}: next.`
          : input === 'choice'
            ? `Keys 1 to ${Math.max(choices.length, 1)} pick an answer.`
            : 'Type what you left here and press Enter. Small typos, a leading "the" and anything in brackets are forgiven.'}
      </p>
    </section>
  );
}
