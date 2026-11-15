import { useEffect, useRef, useState, type FormEvent } from 'react';
import { answerOf, buildChoices, typedMatches } from '@/flows/answers';
import { advanceRecall, answerRecall, itemAt, judgeTiming, markRight, useFlow } from '@/flows/flow';
import { termLength } from '@/flows/format';
import { useTimedStop, useWalkKeys } from '@/flows/hooks';
import { arrivalLines, buildLinkChoices, linkQuestions, orderTask } from '@/flows/process';
import { LinkStop, OrderTask } from './Process';
import { ADVANCE_KEYS, ProgressBar } from './Walk';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { isLastStop, useSession } from '@/state/session';
import { useSettings } from '@/state/settings';

/**
 * Recall walk: retrieval practice. The place is the only cue: both answer modes ask what
 * was left there, the answer is the item's term, and nothing about the item is rendered
 * until the learner has committed. Committing is what reveals the image in the scene.
 *
 * In a process deck the place's question comes first and is unchanged; once it is answered
 * and the item revealed, each link that leaves the step is asked about (LinkStop), and after
 * the last place the steps are put in order (OrderTask). Those answers are scored apart.
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

  // A process deck (never a Judge run): the questions about this step's links, the one on screen
  // if any, and the ordering task that follows the walk.
  const linkAt = useFlow((s) => s.linkAt);
  const questions = judge ? [] : linkQuestions(deck, item);
  const question = result ? questions[linkAt - 1] : undefined;
  const walkItems = stops.flatMap((index) => itemAt(deck, layout.loci[index])?.id ?? []);
  const task = judge || !deck ? null : orderTask(deck, walkItems);
  // The places of this walk that have not been answered: nothing asked about a link may name what is at them.
  const ahead = new Set(walkItems.filter((id) => !results.some((r) => r.itemId === id)));
  const ordering = useFlow((s) => s.phase) === 'order' && task !== null;
  const aside = ordering || question !== undefined;

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

  // Also on the way back from a question about a link to what the place revealed.
  useEffect(() => {
    if (answered && !aside) nextRef.current?.focus();
  }, [answered, step, aside]);

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
  let linkChoices: string[] = [];
  if (deck && question && input === 'choice') {
    linkChoices = drawn.current.get(question.id) ?? buildLinkChoices(deck, question);
    drawn.current.set(question.id, linkChoices);
  }

  const commit = (given: string) => {
    if (!deck || !item || !arrived || result) return;
    const right = answerOf(item);
    const correct = input === 'choice' ? given === right : typedMatches(given, right);
    // "I cannot recall it" gives no answer at all: the walk history counts it apart from a wrong one.
    answerRecall({ itemId: item.id, correct, given, ms: Date.now() - arrivedAt.current, ...(given === '' ? { unknown: true } : {}) });
  };

  // A question about a link and the ordering task have keys of their own: this screen's are off meanwhile.
  useWalkKeys(
    aside
      ? {}
      : {
          pick: input === 'choice' && arrived && !result ? (i) => choices[i] !== undefined && commit(choices[i]) : undefined,
          next: result ? advanceRecall : undefined,
          back: step > 0 ? () => useSession.getState().prev() : undefined,
          pause: canHold ? toggleHold : undefined,
          resume: held ? toggleHold : undefined,
        },
  );

  if (!deck || !locus || !item) return null;
  // What follows the last answer at the last place.
  const afterWalk = task ? 'Put the steps in order' : 'See the results';
  if (ordering) return <OrderTask deck={deck} task={task} />;
  if (question) {
    const lastQuestion = linkAt >= questions.length;
    return (
      <LinkStop
        key={question.id}
        question={question}
        index={linkAt}
        count={questions.length}
        choices={linkChoices}
        input={input}
        onward={!lastQuestion ? 'Next question' : last ? afterWalk : 'Next place'}
        ahead={ahead}
      />
    );
  }
  const right = answerOf(item);
  const ledHere = judge || !result ? [] : arrivalLines(deck, item, (id) => !ahead.has(id));
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
            {questions.length > 0 ? 'Next question' : last ? afterWalk : 'Next place'}
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
            {/* A process deck: what led here, from the steps already answered. A question about a link that was missed back there gets its answer now. */}
            {ledHere.length > 0 && (
              <ul className="links links--reveal" data-testid="recall-links">
                {ledHere.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {/*
              In a surveyed palace the answer also decides the state of the place (a timed Judge run has no time
              for the line). An answer the learner marked right themselves decides nothing: said here, where the
              button was pressed, in any palace.
            */}
            {!judge && (deck.surveyedAt !== undefined || result.selfMarked) && (
              <p className="state" data-testid="recall-place-state">
                {result.selfMarked
                  ? deck.surveyedAt !== undefined
                    ? 'Marked by you. This place stays under repair until you recall it.'
                    : 'Marked by you. It comes back for review soon, and that recall decides.'
                  : result.correct
                    ? 'This place is restored.'
                    : 'This place needs another repair: it comes back for review soon.'}
              </p>
            )}
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
