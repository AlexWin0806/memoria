import { useEffect, useRef, useState, type FormEvent } from 'react';
import { answerOf, buildChoices, typedMatches } from '@/flows/answers';
import { advanceRecall, itemAt, judgeTiming, useFlow } from '@/flows/flow';
import { useCountdown, useWalkKeys } from '@/flows/hooks';
import { ProgressBar } from './Walk';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { isLastStop, useSession } from '@/state/session';
import { useSettings } from '@/state/settings';

/**
 * Recall walk: retrieval practice. Nothing about the answer is rendered until the
 * learner has committed to one; committing is what reveals the image in the scene.
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

  useEffect(() => {
    if (!arrived) return;
    arrivedAt.current = Date.now();
    setTyped('');
    inputRef.current?.focus();
  }, [arrived, step]);

  const answered = Boolean(result);
  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);

  // Judge Mode keeps moving: the feedback is shown briefly, then the walk goes on by itself.
  const paused = useFlow((s) => s.confirmLeave);
  const moveOn = useCountdown(judge && answered && !paused, judgeTiming().feedbackSeconds, step, advanceRecall);
  const spot = judge && deck !== undefined && stops.length < deck.items.length;

  let choices: string[] = [];
  if (deck && item && input === 'choice') {
    choices = drawn.current.get(item.id) ?? buildChoices(deck, item);
    drawn.current.set(item.id, choices);
  }

  const commit = (given: string) => {
    if (!deck || !item || !arrived || result) return;
    const right = answerOf(deck, item);
    const correct = input === 'choice' ? given === right : typedMatches(given, right);
    useSession.getState().answer({ itemId: item.id, correct, given, ms: Date.now() - arrivedAt.current });
  };

  useWalkKeys({
    pick: input === 'choice' && arrived && !result ? (i) => choices[i] !== undefined && commit(choices[i]) : undefined,
    next: result ? advanceRecall : undefined,
    back: step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (!deck || !locus || !item) return null;
  const askMeaning = deck.kind === 'pairs' && Boolean(item.meaning);
  const right = answerOf(deck, item);

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
        <p className="muted">Walking to {locus.name}.</p>
      ) : (
        <>
          <h2 className="question" data-testid="recall-question" data-place={locus.name}>
            What did you leave at {locus.name}?
          </h2>
          {askMeaning && (
            <p className="body">
              The term at this place is <strong data-testid="recall-cue">{item.term}</strong>. What does it mean?
            </p>
          )}
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

      <div aria-live="polite" data-testid="recall-feedback">
        {result && (
          <div className="reveal" data-state={result.correct ? 'right' : 'wrong'}>
            <p className="verdict">{result.correct ? 'Correct.' : 'Not this time.'}</p>
            {!result.correct && input === 'typed' && result.given && <p className="muted">You wrote: {result.given}</p>}
            <p className="term term--small">{item.term}</p>
            {item.meaning && <p className="body">{item.meaning}</p>}
            <p className="scene">{item.imago.scene}</p>
          </div>
        )}
      </div>

      {result && judge && <ProgressBar value={moveOn} label="Time until the walk moves on" />}
      {result && (
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} onClick={advanceRecall} data-testid="recall-next">
            {last ? 'See the results' : 'Next place'}
          </button>
        </div>
      )}
      <p className="hint">
        {result
          ? judge
            ? 'It moves on by itself; Enter moves on sooner.'
            : 'Right arrow or Enter: next.'
          : input === 'choice'
            ? `Keys 1 to ${Math.max(choices.length, 1)} pick an answer.`
            : 'Type your answer and press Enter. Small typos are forgiven.'}
      </p>
    </section>
  );
}
