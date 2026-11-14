import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Deck, WalkRecord } from '@/core/types';
import { ordinal } from '@/flows/answers';
import { advanceRecall, answerLink, backRecall, finishOrder, markLinkRight, resultsAfterOrder, useFlow } from '@/flows/flow';
import { plural } from '@/flows/format';
import { useWalkKeys } from '@/flows/hooks';
import { gradeLink, scoreOrder, shuffledSteps, type LinkQuestion, type StepOrder } from '@/flows/process';
import { isSectionWalk } from '@/state/history';
import { useSession } from '@/state/session';
import { ADVANCE_KEYS } from './Walk';
import './process.css';

/*
 * What a process deck adds to the recall walk and its results (see src/flows/process.ts):
 * a question about each link that leaves the step just recalled, the steps put in order once
 * at the end, and the lines that report both apart from the places. None of it reaches the
 * session store, so none of it changes the scene, a place or a review card.
 */

interface LinkStopProps {
  question: LinkQuestion;
  /** Which of this place's questions about links this is (from 1), and how many there are. */
  index: number;
  count: number;
  /** Multiple choice: the options, drawn once by the recall walk and kept for as long as it lasts. */
  choices: string[];
  input: 'choice' | 'typed';
  /** What the button that moves on says: the next question, the next place, or what follows the walk. */
  onward: string;
  /** The items this walk has still to ask about at their own places. */
  ahead: ReadonlySet<string>;
}

/**
 * One question about a link, asked at the place of the step it leaves, after that place has
 * been answered and its item revealed. Answered in the same way as the place (picked or
 * typed), with "I don't know" always there and never preselected; nothing about the answer
 * is shown before the learner commits.
 *
 * The feedback is the right answer and what the link says. One case holds the name back: the
 * learner missed, and the right answer is a step whose own place this walk has not asked yet.
 * Naming it would answer that place for them, and the place is what sets the review. They
 * are told what the link does; the name follows at its own place, once that is answered
 * (arrivalLines).
 */
export function LinkStop({ question, index, count, choices, input, onward, ahead }: LinkStopProps) {
  const { stops, step } = useSession();
  const answer = useFlow((s) => s.linkAnswers.find((a) => a.id === question.id));
  const [typed, setTyped] = useState('');
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answered = Boolean(answer);

  // As at the place's own question: the focus goes to the field, or (multiple choice) to the
  // question, so that the next Tab is the first option and no stray key press can answer.
  useEffect(() => {
    if (answered) nextRef.current?.focus();
    else if (inputRef.current) inputRef.current.focus();
    else questionRef.current?.focus({ preventScroll: true });
  }, [answered]);

  const commit = (given: string, unknown = false) => {
    if (answer) return;
    answerLink({ id: question.id, given, correct: !unknown && gradeLink(question, given, input), ...(unknown ? { unknown: true } : {}) });
  };
  const dontKnow = () => commit('', true);

  useWalkKeys({
    pick: input === 'choice' && !answer ? (i) => choices[i] !== undefined && commit(choices[i]) : undefined,
    unknown: !answer ? dontKnow : undefined,
    next: answer ? advanceRecall : undefined,
    back: backRecall,
  });

  // After a miss, a right answer that is still to be asked at its own place is not named.
  const shown = question.answers.filter((a) => answer?.correct || !ahead.has(a.itemId));
  const held = question.answers.filter((a) => !shown.includes(a));
  const right = new Set(shown.map((a) => a.term));
  // Only a typed answer can be overruled: the grader may be wrong about wording, never about a picked option.
  // And only against an answer that is shown: there is nothing to compare a held-back one with.
  const canOverrule = input === 'typed' && answer !== undefined && !answer.correct && !answer.unknown && answer.given.trim() !== '' && held.length === 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) commit(typed);
  };

  return (
    <section className="screen" data-testid="link-stop">
      <p className="label" data-testid="walk-label">
        Place {step + 1} of {stops.length} · Link{count > 1 ? ` ${index} of ${count}` : ''}
      </p>
      <h1 className="question" tabIndex={-1} ref={questionRef} data-testid="link-question" data-kind={question.kind}>
        {question.prompt}
      </h1>
      {input === 'choice' ? (
        <ol className="choices">
          {choices.map((c, i) => {
            const state = !answer ? undefined : right.has(c) ? 'right' : c === answer.given ? 'wrong' : undefined;
            return (
              <li key={c}>
                <button type="button" className="choice" data-state={state} data-testid="link-choice" disabled={answered} onClick={() => commit(c)}>
                  <span className="choice__key">{i + 1}</span>
                  <span>{c}</span>
                </button>
              </li>
            );
          })}
          {/* An answer like the others, in the same list, with a key of its own. */}
          <li>
            <button type="button" className="choice" data-state={answer?.unknown ? 'picked' : undefined} data-testid="link-unknown" disabled={answered} onClick={dontKnow}>
              <span className="choice__key">0</span>
              <span>I don&rsquo;t know</span>
            </button>
          </li>
        </ol>
      ) : (
        !answer && (
          <form className="typed" onSubmit={onSubmit}>
            <label htmlFor="link-input" className="label">
              Your answer
            </label>
            <input
              id="link-input"
              ref={inputRef}
              className="field"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              // A question mark in an empty field is "I don't know", so the key works here too.
              onKeyDown={(e) => {
                if (e.key !== '?' || typed.trim() !== '') return;
                e.preventDefault();
                dontKnow();
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-testid="link-input"
            />
            <div className="actions">
              <button type="submit" className="btn btn--primary" disabled={!typed.trim()} data-testid="link-submit">
                Answer
              </button>
              <button type="button" className="btn" onClick={dontKnow} data-testid="link-unknown">
                I don&rsquo;t know
                <span className="key" aria-hidden="true">
                  ?
                </span>
              </button>
            </div>
          </form>
        )
      )}

      {answer && (
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} onClick={advanceRecall} data-testid="link-next">
            {onward}
          </button>
          {canOverrule && (
            <button type="button" className="btn" onClick={() => markLinkRight(question.id)} data-testid="link-overrule">
              I was right
            </button>
          )}
        </div>
      )}

      <div aria-live="polite" data-testid="link-feedback">
        {answer && (
          <div className="reveal" data-state={answer.correct ? 'right' : 'wrong'}>
            <p className="verdict" data-testid="link-verdict">
              {answer.selfMarked ? 'Marked right by you.' : answer.correct ? 'Correct.' : 'Not this time.'}
            </p>
            {input === 'typed' && answer.given && (answer.selfMarked || !answer.correct) && <p className="muted">You wrote: {answer.given}</p>}
            {/* The right answer, and what the link says about it. */}
            {shown.map((a) => (
              <p key={a.term} className="link__fact" data-testid="link-fact">
                {a.sentence}
              </p>
            ))}
            {held.map((a) => (
              <p key={a.term} className="link__fact" data-testid="link-fact" data-held="true">
                {a.held}
              </p>
            ))}
            {held.length > 0 && (
              <p className="state" data-testid="link-held">
                Its name waits at its own place, which you have not been asked about yet.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="hint" data-testid="link-hint">
        {answer
          ? `Links are scored apart from the places. ${ADVANCE_KEYS}: next.`
          : input === 'choice'
            ? `Keys 1 to ${Math.max(choices.length, 1)} pick an answer. 0: I don’t know.`
            : 'Type the term and press Enter. A question mark in the empty field: I don’t know.'}
      </p>
    </section>
  );
}

/**
 * After the recall walk of a process: the steps it asked about, shuffled, to be put in the
 * order they run. The learner picks them one after another (a click, Enter on a step, or its
 * number key) and can take the last one back; nothing is dragged. The steps keep their
 * position and their key while the task lasts, so a key always means the same step.
 */
export function OrderTask({ deck, task }: { deck: Deck; task: StepOrder }) {
  // Shuffled once: the task is rebuilt on every render of the walk, the order on screen is not.
  const [shown] = useState(() => shuffledSteps(task));
  const [sequence, setSequence] = useState<string[]>([]);
  const [result, setResult] = useState<ReturnType<typeof scoreOrder> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const term = (id: string) => deck.items.find((it) => it.id === id)?.term ?? '';
  const complete = sequence.length === shown.length;

  const pick = (id: string | undefined) => {
    if (!id || result || sequence.includes(id)) return;
    setSequence([...sequence, id]);
  };
  const undo = () => {
    if (!result) setSequence(sequence.slice(0, -1));
  };
  const check = () => {
    if (!complete || result) return;
    const scored = scoreOrder(task, sequence);
    finishOrder(scored);
    setResult(scored);
  };

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  // Every step placed: the focus goes to the check. Checked: to the way on.
  useEffect(() => {
    if (result) doneRef.current?.focus();
    else if (complete) checkRef.current?.focus();
  }, [complete, result]);

  useWalkKeys({
    pick: result ? undefined : (i) => pick(shown[i]),
    back: sequence.length > 0 && !result ? undo : undefined,
    next: result ? resultsAfterOrder : complete ? check : undefined,
  });

  const keys = Math.min(9, shown.length);
  return (
    <section className="screen order" data-testid="order">
      <p className="label" data-testid="walk-label">
        Put the steps in order · {deck.title}
      </p>
      <div aria-live="polite">
        <h1 className="question" tabIndex={-1} ref={headingRef} data-testid="order-question">
          {result
            ? `${result.correct} of ${result.total} in order.`
            : sequence.length === 0
              ? task.cycle
                ? 'Which step do you start with?'
                : 'Which comes first?'
              : complete
                ? 'That is every step.'
                : 'And then?'}
        </h1>
        {!result && (
          <p className="muted" data-testid="order-count">
            {sequence.length} of {shown.length} placed.
            {task.cycle && sequence.length === 0 ? ' These steps run in a circle, so any of them can come first.' : ''}
          </p>
        )}
      </div>

      {!result && (
        <ol className="choices order__steps">
          {shown.map((id, i) => {
            const at = sequence.indexOf(id);
            return (
              <li key={id}>
                {/* A placed step stays where it was, so that the keys do not shift; it is inert, not disabled, so that the focus stays put. */}
                <button
                  type="button"
                  className="choice"
                  aria-disabled={at >= 0}
                  data-state={at >= 0 ? 'picked' : undefined}
                  data-term={term(id)}
                  data-testid="order-step"
                  onClick={() => pick(id)}
                >
                  <span className="choice__key">{i < 9 ? i + 1 : ''}</span>
                  <span>
                    {term(id)}
                    {at >= 0 && <span className="order__nth"> · {ordinal(at + 1)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="actions">
        {result ? (
          <button type="button" className="btn btn--primary" ref={doneRef} onClick={resultsAfterOrder} data-testid="order-done">
            See the results
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--primary" ref={checkRef} disabled={!complete} onClick={check} data-testid="order-check">
              Check the order
            </button>
            <button type="button" className="btn btn--quiet" disabled={sequence.length === 0} onClick={undo} data-testid="order-undo">
              Undo
            </button>
          </>
        )}
      </div>

      <p className="label order__head">Your order</p>
      {sequence.length === 0 ? (
        <p className="muted">Nothing placed yet.</p>
      ) : (
        <ol className="order__seq" data-testid="order-sequence">
          {sequence.map((id, i) => (
            <li key={id} data-state={result ? (result.marks[i] ? 'right' : 'wrong') : undefined} data-testid="order-placed">
              <span>{term(id)}</span>
              {result && (
                <span className="order__mark" aria-hidden="true">
                  {result.marks[i] ? '✓' : '✕'}
                </span>
              )}
              {result && <span className="sr-only">{result.marks[i] ? ': in order' : ': out of order'}</span>}
            </li>
          ))}
        </ol>
      )}
      {result && (
        <div aria-live="polite" data-testid="order-feedback">
          <p className="body">
            A step counts when it follows the step that really comes before it
            {task.cycle ? '; in a circle, the first one counts when the last leads back to it.' : '; the first one counts when it really is the first.'}
          </p>
          {result.correct < result.total && (
            <p className="body" data-testid="order-right">
              The order: {task.steps.map(term).join(', ')}
              {task.cycle ? `, and back to ${term(task.steps[0])}.` : '.'}
            </p>
          )}
        </div>
      )}

      <p className="hint" data-testid="order-hint">
        {result
          ? `The order is scored apart from the places. ${ADVANCE_KEYS}: the results.`
          : `Keys 1 to ${keys} pick a step${shown.length > 9 ? '; Tab reaches the others' : ''}. Left arrow: undo.`}
      </p>
    </section>
  );
}

/**
 * The lines of the results that are not the places: that the walk covered only new places,
 * and, for a process, the links and the order, each counted by itself. Nothing here is a
 * reward: three plain counts, and a line saying which of them sets the reviews.
 */
export function ResultLines({ record }: { record: WalkRecord }) {
  const section = isSectionWalk(record);
  const apart = record.relations !== undefined || record.order !== undefined;
  if (!section && !apart) return null;
  return (
    <div className="lines" data-testid="results-lines">
      {section && <p data-testid="results-section">{plural(record.total, 'new place')}: the rest of the palace was not walked.</p>}
      {apart && (
        <>
          <p data-testid="results-places">
            Places: {record.correct} of {record.total}.
          </p>
          {record.relations && (
            <p data-testid="results-links">
              Links: {record.relations.correct} of {record.relations.total}.
            </p>
          )}
          {record.order && (
            <p data-testid="results-order">
              Order: {record.order.correct} of {record.order.total}.
            </p>
          )}
          <p className="lines__note">Only the places set the reviews and the state of each place.</p>
        </>
      )}
    </div>
  );
}
