import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Deck } from '@/core/types';
import {
  answerExam,
  backToReviews,
  beginExam,
  dontKnowExam,
  examRows,
  examShape,
  finishMarking,
  handIn,
  isAnswered,
  leaveExam,
  markExam,
  nextQuestion,
  positionCue,
  prevQuestion,
  requestLeaveExam,
  setExamDirection,
  setExamInput,
  showCutShort,
  toMark,
  useExam,
  walkBack,
  type ExamRow,
} from '@/flows/exam';
import { formatDuration, plural, termLength } from '@/flows/format';
import { useWalkKeys } from '@/flows/hooks';
import { useDeck } from '@/state/decks';
import { useReview } from '@/state/review';
import { ADVANCE_KEYS } from './Walk';
import './exam.css';

/**
 * Exam Mode, mounted once inside the overlay. Closed, it renders nothing. Open, it is a
 * sheet over the whole window: an exam has no palace, so the scene, the place names and the
 * images are all behind it (exam.css also takes the title and the docked panel out of the
 * page meanwhile, so nothing under the sheet can be read, clicked or focused).
 *
 * It is not a session mode and the engine never hears of it: see src/flows/exam.ts.
 */
export function Exam() {
  const stage = useExam((s) => s.stage);
  const confirm = useExam((s) => s.confirmLeave);
  const deck = useDeck(useExam((s) => s.deckId));
  const open = stage !== 'off' && deck !== undefined;
  const body = useRef<HTMLDivElement>(null);

  // Each screen of the exam starts at its top, however far the one before it was scrolled.
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [stage]);
  // A reload ended an exam in progress: the learner lands on the reviews screen, which says so.
  useEffect(() => showCutShort(), []);
  // The palace was deleted meanwhile (in another tab): there is nothing left to ask about.
  useEffect(() => {
    if (stage !== 'off' && !deck) leaveExam();
  }, [stage, deck]);

  useEffect(() => {
    if (!open) return;
    // The overlay's own Escape handler would leave the screen under the sheet. This one runs
    // first (capture phase) and stops the key there: Escape belongs to the exam while it is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target instanceof Element && e.target.closest('[data-lab]'))) return;
      e.preventDefault();
      e.stopPropagation();
      requestLeaveExam();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  const unfinished = stage === 'paper' || stage === 'marking';
  return (
    <div className="exam" role="region" aria-label={`Exam on ${deck.title}`} data-stage={stage} data-testid="exam">
      {/* The head comes after the body in the document (CSS draws it on top), so that Leave is the last Tab stop, as in the docked panel. */}
      <div className="exam__body" ref={body}>
        <div className="exam__page">
          {stage === 'setup' && <ExamSetup deck={deck} />}
          {stage === 'paper' && <ExamPaper />}
          {stage === 'marking' && <ExamMarking />}
          {stage === 'results' && <ExamResults deck={deck} />}
        </div>
      </div>
      <div className="exam__head">
        <span className="label" data-testid="exam-head">
          Memoria · Exam · {deck.title}
        </span>
        <button type="button" className="leave" onClick={requestLeaveExam} aria-label={unfinished ? 'Leave the exam' : 'Close the exam'} data-testid="exam-leave">
          <span className="leave__word">{unfinished ? 'Leave' : 'Close'}</span>
          <span className="key" aria-hidden="true">
            Esc
          </span>
        </button>
      </div>
      {confirm && <ExamLeaveConfirm />}
    </div>
  );
}

/** What an exam is, in two plain sentences, and its two choices. Nothing starts until the button is pressed. */
function ExamSetup({ deck }: { deck: Deck }) {
  const direction = useExam((s) => s.direction);
  const input = useExam((s) => s.input);
  const cards = useReview((s) => s.cards);
  const shape = examShape(deck, cards);
  const byPosition = shape.total - shape.withMeaning;
  const selfMarked = input === 'typed' && direction === 'term-meaning' && shape.withMeaning > 0;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="screen" data-testid="exam-setup">
      <p className="label">Before you start</p>
      <h1 className="question" tabIndex={-1} ref={heading}>
        An exam has no palace.
      </h1>
      <p className="body">Answer from memory, in shuffled order; afterwards, walk back to the places you missed.</p>
      <p className="body" data-testid="exam-setup-count">
        {plural(shape.total, 'question')}, one for each place you have studied. Nothing is marked until you hand in.
        {shape.leftOut > 0 ? ` ${plural(shape.leftOut, 'place')} you have not studied yet ${shape.leftOut === 1 ? 'is' : 'are'} left out.` : ''}
      </p>

      {shape.withMeaning > 0 ? (
        <fieldset className="exam__set" data-testid="exam-direction">
          <legend className="label">Direction</legend>
          <label className="check exam__option">
            <input type="radio" name="exam-direction" checked={direction === 'meaning-term'} onChange={() => setExamDirection('meaning-term')} data-testid="exam-direction-meaning-term" />
            <span>
              Meaning to term <span className="exam__gloss">You are shown the meaning and give the term.</span>
            </span>
          </label>
          <label className="check exam__option">
            <input type="radio" name="exam-direction" checked={direction === 'term-meaning'} onChange={() => setExamDirection('term-meaning')} data-testid="exam-direction-term-meaning" />
            <span>
              Term to meaning <span className="exam__gloss">You are shown the term and give the meaning.</span>
            </span>
          </label>
          {byPosition > 0 && (
            <p className="exam__note" data-testid="exam-some-by-position">
              {plural(byPosition, 'item has', 'items have')} no meaning: {byPosition === 1 ? 'it is' : 'they are'} asked for by position in the list.
            </p>
          )}
        </fieldset>
      ) : (
        <p className="body" data-testid="exam-by-position">
          This list has no meanings, so there is no direction to choose: each question asks which item comes at a position in the list.
        </p>
      )}

      <fieldset className="exam__set" data-testid="exam-input">
        <legend className="label">Answers</legend>
        <label className="check exam__option">
          <input type="radio" name="exam-input" checked={input === 'choice'} onChange={() => setExamInput('choice')} data-testid="exam-input-choice" />
          <span>Multiple choice</span>
        </label>
        <label className="check exam__option">
          <input type="radio" name="exam-input" checked={input === 'typed'} onChange={() => setExamInput('typed')} data-testid="exam-input-typed" />
          <span>Typed</span>
        </label>
        {selfMarked && (
          <p className="exam__note" data-testid="exam-self-marked-note">
            A typed meaning cannot be graded exactly. At the end you see each of your answers beside the right one and mark it yourself.
          </p>
        )}
      </fieldset>

      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={beginExam} data-testid="exam-start">
          Start the exam
        </button>
        <button type="button" className="btn btn--quiet" onClick={requestLeaveExam} data-testid="exam-cancel">
          Not now
        </button>
      </div>
      <p className="hint" data-testid="exam-setup-effect">
        An exam is listed in Progress. It changes no review date and no place in the palace.
      </p>
    </section>
  );
}

/**
 * The paper: one question at a time, in shuffled order. No place name, no image, no verdict.
 * An answer can be changed until the paper is handed in, and "I don't know" is an answer
 * like the others: always there, never chosen or focused for the learner.
 */
function ExamPaper() {
  const questions = useExam((s) => s.questions);
  const at = useExam((s) => s.at);
  const answers = useExam((s) => s.answers);
  const input = useExam((s) => s.input);
  const leaving = useExam((s) => s.confirmLeave);
  const q = questions[at];
  const a = q ? answers[q.itemId] : undefined;
  const state = { questions, answers };
  const ready = isAnswered(state, at);
  const last = at >= questions.length - 1;
  const complete = questions.every((_, i) => isAnswered(state, i));
  // "Hand in?" is asked before the paper goes: after that nothing can be changed.
  const [asking, setAsking] = useState(false);
  // Counts the answers given by a pick: after each, the focus goes to the way on.
  const [picked, setPicked] = useState(0);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onwardRef = useRef<HTMLButtonElement>(null);

  // A new question: focus goes to the answer field, or (multiple choice) to the question, so
  // that the next Tab is the first option and no stray key press can answer.
  useEffect(() => {
    setAsking(false);
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    else questionRef.current?.focus({ preventScroll: true });
    // A long question may have been scrolled: the next one starts at the top of the sheet.
    questionRef.current?.closest('.exam__body')?.scrollTo({ top: 0 });
  }, [at]);
  useEffect(() => {
    if (picked > 0) onwardRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const pick = (given: string) => {
    if (!q) return;
    answerExam(q.itemId, given);
    setPicked((n) => n + 1);
  };
  const dontKnow = () => {
    if (!q) return;
    dontKnowExam(q.itemId);
    setPicked((n) => n + 1);
  };
  const onward = () => {
    if (!ready) return;
    if (last) setAsking(true);
    else nextQuestion();
  };
  const keepWorking = () => {
    setAsking(false);
    setPicked((n) => n + 1);
  };

  // The "leave?" question and "Hand in?" have buttons of their own: this screen's keys are off meanwhile.
  useWalkKeys(
    leaving || asking || !q
      ? {}
      : {
          pick: input === 'choice' ? (i) => q.choices[i] !== undefined && pick(q.choices[i]) : undefined,
          unknown: dontKnow,
          next: ready ? onward : undefined,
          back: at > 0 ? prevQuestion : undefined,
        },
  );

  if (!q) return null;
  const typedMeaning = input === 'typed' && q.form === 'term-meaning';
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onward();
  };

  return (
    <section className="screen exam__paper" data-testid="exam-paper">
      {/*
        Multiple choice: the question takes the focus, so it is read out with what it is about. Typed: the
        focus stays in the answer field from one question to the next, so the new question is announced instead.
      */}
      <div aria-live={input === 'typed' ? 'polite' : 'off'}>
        <h1 className="label" data-testid="exam-count">
          Question {at + 1} of {questions.length}
        </h1>
        {/* One stroke per question: answered, open, and the one on screen. The line above says the same in words. */}
        <p className="exam__tally" aria-hidden="true">
          {questions.map((each, i) => (
            <span key={each.itemId} data-state={i === at ? 'here' : isAnswered(state, i) ? 'done' : 'open'} />
          ))}
        </p>
        <h2 className="question exam__question" tabIndex={-1} ref={questionRef} data-form={q.form} data-testid="exam-question">
          {q.cue && (
            <span className="exam__cue" data-length={termLength(q.cue)} data-testid="exam-cue">
              {q.cue}
            </span>
          )}{' '}
          <span className="exam__prompt" data-testid="exam-prompt">
            {q.prompt}
          </span>
        </h2>
      </div>

      {input === 'choice' ? (
        <ol className="choices">
          {q.choices.map((c, i) => {
            const mine = a !== undefined && !a.unknown && a.given === c;
            return (
              <li key={c}>
                {/* The pick is marked as the learner's own, never as right or wrong: there is no verdict before the end. */}
                <button type="button" className="choice" aria-pressed={mine} data-state={mine ? 'picked' : undefined} data-testid="exam-choice" onClick={() => pick(c)}>
                  <span className="choice__key">{i + 1}</span>
                  <span>{c}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="choice" aria-pressed={a?.unknown === true} data-state={a?.unknown ? 'picked' : undefined} data-testid="exam-unknown" onClick={dontKnow}>
              <span className="choice__key">0</span>
              <span>I don&rsquo;t know</span>
            </button>
          </li>
        </ol>
      ) : (
        <form className="typed" onSubmit={onSubmit}>
          <label htmlFor="exam-input" className="label">
            Your answer
          </label>
          <input
            id="exam-input"
            ref={inputRef}
            className="field"
            value={a?.unknown ? '' : (a?.given ?? '')}
            onChange={(e) => answerExam(q.itemId, e.target.value)}
            // A question mark in an empty field is "I don't know", as in the survey.
            onKeyDown={(e) => {
              if (e.key !== '?' || e.currentTarget.value.trim() !== '') return;
              e.preventDefault();
              dontKnow();
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="exam-input"
          />
          <div className="actions">
            <button type="button" className="btn" aria-pressed={a?.unknown === true} onClick={dontKnow} data-testid="exam-unknown">
              I don&rsquo;t know
              <span className="key" aria-hidden="true">
                ?
              </span>
            </button>
          </div>
        </form>
      )}

      <p className="exam__ack" aria-live="polite" data-testid="exam-ack">
        {!ready ? '' : a?.unknown ? 'Kept: I don’t know. You can change it until you hand in.' : 'Your answer is kept. You can change it until you hand in.'}
      </p>

      {asking ? (
        <div className="notice exam__handin" role="group" aria-label="Hand in" data-testid="exam-handin-ask">
          <p>
            Hand in your {plural(questions.length, 'answer')}? After this they cannot be changed.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={handIn} data-testid="exam-handin-yes">
              Hand in
            </button>
            {/* The focus lands on the way back, so that a second Enter never hands the paper in by itself. */}
            <button type="button" className="btn" autoFocus onClick={keepWorking} data-testid="exam-handin-no">
              Keep working
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={onwardRef} disabled={!ready} onClick={onward} data-testid={last ? 'exam-handin' : 'exam-next'}>
            {last ? 'Hand in' : 'Next question'}
          </button>
          <button type="button" className="btn btn--quiet" disabled={at === 0} onClick={prevQuestion} data-testid="exam-back">
            Back
          </button>
          {/* After going back to change an answer, the paper can be handed in from where the learner is. */}
          {complete && !last && (
            <button type="button" className="btn" onClick={() => setAsking(true)} data-testid="exam-handin-early">
              Hand in
            </button>
          )}
        </div>
      )}

      <p className="hint" data-testid="exam-hint">
        {input === 'choice'
          ? `Keys 1 to ${Math.max(q.choices.length, 1)} pick an answer. 0: I don’t know. ${ADVANCE_KEYS}: next. Left arrow: back.`
          : typedMeaning
            ? 'Type the meaning in your own words and press Enter. You mark it yourself at the end. A question mark in the empty field: I don’t know.'
            : 'Type the term and press Enter. Small typos, a leading "the" and anything in brackets are forgiven. A question mark in the empty field: I don’t know.'}
      </p>
    </section>
  );
}

/**
 * Typed meanings cannot be graded exactly, so the learner marks them: each answer beside the
 * right one. The marks are the learner's own and stay in the exam's record: they reach no
 * review card and no place.
 */
function ExamMarking() {
  const questions = useExam((s) => s.questions);
  const answers = useExam((s) => s.answers);
  const marks = useExam((s) => s.marks);
  const input = useExam((s) => s.input);
  const list = toMark({ questions, answers, input });
  const left = list.filter((q) => marks[q.itemId] === undefined).length;
  const others = questions.length - list.length;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="screen" data-testid="exam-marking">
      <p className="label">Handed in · mark your answers</p>
      <h1 className="question" tabIndex={-1} ref={heading}>
        Mark your own answers.
      </h1>
      <p className="body">
        A typed meaning cannot be graded exactly. Compare each of your answers with the right one and mark it. This exam is self-marked: the marks are
        yours, and they change no review date and no place in the palace.
      </p>
      {others > 0 && (
        <p className="muted" data-testid="exam-marking-others">
          {plural(others, 'question is', 'questions are')} not listed: an &ldquo;I don&rsquo;t know&rdquo; counts as missed, and a typed term is graded for you.
        </p>
      )}
      <ol className="places">
        {list.map((q) => {
          const mark = marks[q.itemId];
          return (
            <li key={q.itemId} className="place" data-marked={mark === undefined ? undefined : mark ? 'right' : 'wrong'} data-testid="exam-mark-row">
              <span className="place__term">{q.cue}</span>
              <span className="exam__pair">
                <span className="label">You wrote</span> {answers[q.itemId]?.given}
              </span>
              <span className="exam__pair">
                <span className="label">The meaning</span> {q.answer}
              </span>
              <div className="actions exam__marks" role="group" aria-label={`Your mark for ${q.cue ?? 'this answer'}`}>
                <button type="button" className="btn" aria-pressed={mark === true} onClick={() => markExam(q.itemId, true)} data-testid="exam-mark-right">
                  I had it
                </button>
                <button type="button" className="btn" aria-pressed={mark === false} onClick={() => markExam(q.itemId, false)} data-testid="exam-mark-wrong">
                  I missed it
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="hint" aria-live="polite" data-testid="exam-marks-left">
        {left > 0 ? `${plural(left, 'answer')} left to mark.` : 'Every answer is marked.'}
      </p>
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={left > 0} onClick={finishMarking} data-testid="exam-marking-done">
          See the results
        </button>
      </div>
    </section>
  );
}

/** What a question asked, as the results name it: everything is shown now. */
function askedText(deck: Deck, row: ExamRow): string {
  if (row.question.form === 'position') return positionCue(deck, row.item);
  return row.question.form === 'term-meaning' ? row.item.term : (row.item.meaning ?? '').trim();
}

/**
 * The results: the score, the time, every question with the answer given and the right one,
 * and for each miss the place its fact lives at and its image, now shown. One way on: the
 * walk back to those places.
 */
function ExamResults({ deck }: { deck: Deck }) {
  const questions = useExam((s) => s.questions);
  const answers = useExam((s) => s.answers);
  const marks = useExam((s) => s.marks);
  const input = useExam((s) => s.input);
  const direction = useExam((s) => s.direction);
  const ms = useExam((s) => s.ms);
  const rows = examRows({ deckId: deck.id, questions, answers, marks, input });
  const right = rows.filter((r) => r.correct).length;
  const missed = rows.length - right;
  const selfMarked = rows.some((r) => r.selfMarked);
  const way = !questions.some((q) => q.form !== 'position') ? 'By position' : direction === 'term-meaning' ? 'Term to meaning' : 'Meaning to term';
  const score = useRef<HTMLHeadingElement>(null);
  // The score is the first thing a screen reader should land on; Tab then reaches the actions.
  useEffect(() => {
    score.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="screen" data-testid="exam-results">
      <p className="label">Exam results</p>
      <h1 className="score" tabIndex={-1} ref={score} data-testid="exam-score">
        {right} of {rows.length}
      </h1>
      <p className="body" data-testid="exam-time">
        Answered without the palace in {formatDuration(ms)}. {way}, {input === 'choice' ? 'multiple choice' : 'typed'}.
      </p>
      {selfMarked && (
        <p className="body" data-testid="exam-self-marked">
          Self-marked: the typed meanings were judged by you.
        </p>
      )}
      <p className="body" data-testid="exam-effect">
        This exam is listed in Progress. It changed no review date and no place in the palace: those follow the recall walks.
      </p>
      <div className="actions">
        {missed > 0 && (
          <button type="button" className="btn btn--primary" onClick={walkBack} data-testid="exam-walk-back">
            Walk back to the {missed === 1 ? 'place' : `${missed} places`} you missed
          </button>
        )}
        <button type="button" className={missed > 0 ? 'btn' : 'btn btn--primary'} onClick={backToReviews} data-testid="exam-reviews">
          Back to reviews
        </button>
      </div>
      <p className="hint" data-testid="exam-next-step">
        {missed > 0
          ? 'The walk back is a study walk over those places only: each missed fact again, at its place. The usual recall walk follows it.'
          : 'Nothing was missed, so there is no place to walk back to.'}
      </p>
      <ol className="places">
        {rows.map((r) => (
          <li key={r.item.id} className="place" data-state={r.correct ? 'right' : 'wrong'} data-testid="exam-row">
            <div className="place__line">
              <span className="place__mark" aria-hidden="true">
                {r.correct ? '✓' : '✕'}
              </span>
              <span className="place__text">
                <span className="sr-only">{r.correct ? 'Right. ' : 'Missed. '}</span>
                <span className="place__term" data-testid="exam-row-asked">
                  {askedText(deck, r)}
                </span>
                <span className="exam__pair" data-testid="exam-row-given">
                  <span className="label">Your answer</span> {r.unknown ? 'I don’t know' : r.given}
                  {r.selfMarked ? (r.correct ? ' (marked right by you)' : ' (marked missed by you)') : ''}
                </span>
                <span className="exam__pair" data-testid="exam-row-right">
                  <span className="label">Right answer</span> {r.question.form === 'term-meaning' ? (r.item.meaning ?? '').trim() : r.item.term}
                </span>
                {!r.correct && r.locus && (
                  <>
                    <span className="exam__place" data-testid="exam-row-place">
                      It lives at {r.locus.name}
                      {r.room ? `, in ${r.room.name}` : ''}.
                    </span>
                    <span className="exam__image" data-testid="exam-row-image">
                      <span className="exam__glyphs" aria-hidden="true">
                        {r.item.imago.glyphs.join(' ')}
                      </span>
                      <span className="exam__scene">{r.item.imago.scene}</span>
                    </span>
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Leave this exam?", as a modal dialog like the walk's: Tab cycles inside the box, Escape
 * cancels (the exam's Escape handler toggles it), and on closing the focus returns to
 * whatever had it before.
 */
function ExamLeaveConfirm() {
  const marking = useExam((s) => s.stage === 'marking');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => Array.from(box.current?.querySelectorAll<HTMLElement>('button') ?? []);
    buttons()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = buttons();
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length;
      all[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before?.isConnected) before.focus();
    };
  }, []);

  return (
    <div className="modal" data-testid="exam-leave-scrim">
      <div ref={box} className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="exam-leave-q" aria-describedby="exam-leave-d" data-testid="exam-leave-confirm">
        <h2 id="exam-leave-q" className="question">
          Leave this exam?
        </h2>
        <p id="exam-leave-d">
          {marking ? 'Your answers have not been marked yet' : 'It has not been handed in'}, so nothing from it is kept: no score, and no change to any review
          or place.
        </p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={requestLeaveExam} data-testid="exam-leave-stay">
            Stay
          </button>
          <button type="button" className="btn" onClick={leaveExam} data-testid="exam-leave-yes">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
