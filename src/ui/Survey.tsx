import { useEffect, useRef, useState, type FormEvent } from 'react';
import { answerOf, buildChoices, surveyQuestion, typedMatches } from '@/flows/answers';
import { advanceSurvey, answerSurvey, beginStudyAfterSurvey, itemAt, leave, skipSurvey, stopsFor, useFlow } from '@/flows/flow';
import { plural, termLength } from '@/flows/format';
import { useWalkKeys } from '@/flows/hooks';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { useReview } from '@/state/review';
import { isLastStop, useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { RepairLegend } from './Legend';
import { ADVANCE_KEYS } from './Walk';

/**
 * The survey: a walk of the route with one question at each place, before anything is
 * studied. It finds out what the learner already knows, and it is also their first walk
 * of the route, so each stop names its place as the familiarization walk does.
 *
 * It reveals nothing: no right answer, no memory image, no verdict. What the learner sees
 * of their answer is the place itself, which stands or falls in the scene.
 */
export function Survey() {
  const phase = useFlow((s) => s.phase);
  return phase === 'summary' ? <SurveySummary /> : <SurveyWalk />;
}

function SurveyWalk() {
  const { stops, step, arrived, layoutId, deckId, results } = useSession();
  const input = useSettings((s) => s.recallInput);
  const deck = useDeck(deckId);
  const layout = getLayout(layoutId);
  const locus = layout.loci[stops[step]];
  const item = itemAt(deck, locus);
  const room = layout.rooms.find((r) => r.id === locus?.roomId);
  const result = item ? results.find((r) => r.itemId === item.id) : undefined;
  const answered = Boolean(result);
  const last = isLastStop({ step, stops });
  // The survey of a section: only the places that were added to the palace.
  const section = useFlow((s) => s.section);

  // Options are drawn once per stop and kept for the whole walk, so going back does not reshuffle them.
  const drawn = useRef(new Map<string, string[]>());
  const [typed, setTyped] = useState('');
  const [skipping, setSkipping] = useState(false);
  const arrivedAt = useRef(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answersRef = useRef<HTMLDivElement>(null);

  // When the stop is ready, focus goes to the answer field, or (multiple choice) to the
  // question, so that the next Tab is the first option and no stray key press can answer.
  useEffect(() => {
    if (!arrived) return;
    arrivedAt.current = Date.now();
    setTyped('');
    if (answered) return;
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    else questionRef.current?.focus({ preventScroll: true });
    // On a short sheet (a phone) the place and its description fill the view: bring the answers into it.
    // Where they are already in view, as in the docked panel, nothing moves.
    answersRef.current?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a stop becomes ready, not when it is answered
  }, [arrived, step]);

  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered, step]);

  let choices: string[] = [];
  if (deck && item && input === 'choice') {
    choices = drawn.current.get(item.id) ?? buildChoices(deck, item);
    drawn.current.set(item.id, choices);
  }

  const commit = (given: string, unknown = false) => {
    if (!deck || !item || !arrived || result) return;
    const right = answerOf(item);
    const correct = !unknown && (input === 'choice' ? given === right : typedMatches(given, right));
    answerSurvey({ itemId: item.id, correct, given, ms: Date.now() - arrivedAt.current, ...(unknown ? { unknown: true } : {}) });
  };
  const dontKnow = () => commit('', true);

  useWalkKeys({
    pick: input === 'choice' && arrived && !result ? (i) => choices[i] !== undefined && commit(choices[i]) : undefined,
    unknown: arrived && !result ? dontKnow : undefined,
    next: result ? advanceSurvey : undefined,
    back: step > 0 ? () => useSession.getState().prev() : undefined,
  });

  if (!deck || !locus || !item) return null;
  // A bare list item is asked for by its place in the whole list, which on a section is not its place in this walk.
  const q = surveyQuestion(deck, item, stopsFor(deck, layout).indexOf(stops[step]) + 1);
  const ready = arrived || answered;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) commit(typed);
  };

  return (
    <section className="screen survey" data-testid="survey">
      <h1 className="label" data-testid="walk-label">
        {section ? 'Survey of the new places' : 'Survey'} · Place {step + 1} of {stops.length}
        {room ? ` · ${room.name}` : ''}
      </h1>
      {/* Said once, on the survey's first screen and nowhere else (the claims rule: docs/research.md). */}
      {step === 0 && !answered && (
        <div className="lede" data-testid="survey-lede">
          <p>What do you already know? Nothing here counts against you. It tells the palace which places need building.</p>
          <p>Guess first. Trying to answer before you study tends to help the answer stick once you see it, even if your guess is wrong.</p>
        </div>
      )}
      {/* The place is named at every stop: this is also the learner's first walk of the route. */}
      <div aria-live="polite">
        <h2 className="term term--small" data-testid="place-name">
          {locus.name}
        </h2>
        {ready ? (
          <p className="body" data-testid="place-hint">
            {locus.hint}
          </p>
        ) : (
          <p className="muted">Walking there.</p>
        )}
      </div>

      {ready && (
        <>
          <hr />
          <p className="label">The fact that will live here</p>
          {q.cue && (
            <p className="survey__cue" data-length={termLength(q.cue)} data-testid="survey-cue">
              {q.cue}
            </p>
          )}
          <h2 className="question survey__question" tabIndex={-1} ref={questionRef} data-testid="survey-question" data-place={locus.name} data-form={q.form}>
            {q.prompt}
          </h2>
          <div ref={answersRef}>
            {input === 'choice' ? (
              <ol className="choices">
                {choices.map((c, i) => (
                  <li key={c}>
                    <button
                      type="button"
                      className="choice"
                      // The pick is marked as the learner's own, never as right or wrong.
                      data-state={result && !result.unknown && result.given === c ? 'picked' : undefined}
                      data-testid="survey-choice"
                      disabled={answered}
                      onClick={() => commit(c)}
                    >
                      <span className="choice__key">{i + 1}</span>
                      <span>{c}</span>
                    </button>
                  </li>
                ))}
                {/* An answer like the others, in the same list, with a key of its own. */}
                <li>
                  <button
                    type="button"
                    className="choice"
                    data-state={result?.unknown ? 'picked' : undefined}
                    data-testid="survey-unknown"
                    disabled={answered}
                    onClick={dontKnow}
                  >
                    <span className="choice__key">0</span>
                    <span>I don&rsquo;t know</span>
                  </button>
                </li>
              </ol>
            ) : (
              !result && (
                <form className="typed" onSubmit={onSubmit}>
                  <label htmlFor="survey-input" className="label">
                    Your answer
                  </label>
                  <input
                    id="survey-input"
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
                    data-testid="survey-input"
                  />
                  <div className="actions">
                    <button type="submit" className="btn btn--primary" disabled={!typed.trim()} data-testid="survey-submit">
                      Answer
                    </button>
                    <button type="button" className="btn" onClick={dontKnow} data-testid="survey-unknown">
                      I don&rsquo;t know
                      <span className="key" aria-hidden="true">
                        ?
                      </span>
                    </button>
                  </div>
                </form>
              )
            )}
          </div>
        </>
      )}

      <div aria-live="polite" data-testid="survey-feedback">
        {result && (
          <p className="survey__ack" data-testid="survey-ack">
            Noted.
            {input === 'typed' && !result.unknown && result.given ? <span className="survey__given"> You wrote: {result.given}</span> : null}
            {/* The scene is hidden from assistive technology, so what the place did is also said in words. */}
            <span className="sr-only">{result.correct ? ' This place stands.' : ' This place has fallen into ruin.'}</span>
          </p>
        )}
      </div>
      {result && (
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={nextRef} onClick={advanceSurvey} data-testid="survey-next">
            {last ? 'Finish the survey' : 'Next place'}
          </button>
          <button type="button" className="btn btn--quiet" disabled={step === 0} onClick={() => useSession.getState().prev()}>
            Back
          </button>
        </div>
      )}

      <p className="hint" data-testid="survey-hint">
        {result
          ? `The answers come in the study walk. ${ADVANCE_KEYS}: next.`
          : !ready
            ? 'A question waits at each place.'
            : input === 'choice'
              ? `Keys 1 to ${Math.max(choices.length, 1)} pick an answer. 0: I don’t know.`
              : 'Type the term and press Enter. A question mark in the empty field: I don’t know.'}
      </p>

      <p className="survey__skip">
        {skipping ? (
          <span className="confirm-inline" data-testid="survey-skip-ask">
            <span className="muted">
              {results.length === 0 ? 'Mark every place as not known?' : 'Mark the places you have not answered as not known?'}
            </span>
            <button type="button" className="link" onClick={skipSurvey} data-testid="survey-skip-yes">
              Yes, skip
            </button>
            {/* The focus lands on the way back, so that a second Enter never skips by itself. */}
            <button type="button" className="link" autoFocus onClick={() => setSkipping(false)} data-testid="survey-skip-no">
              Keep answering
            </button>
          </span>
        ) : (
          <button type="button" className="link" onClick={() => setSkipping(true)} data-testid="survey-skip">
            {results.length === 0 ? 'Skip: I know none of this' : 'Skip the rest: I know none of these'}
          </button>
        )}
      </p>
    </section>
  );
}

/** After the survey: what it found, place by place, and the way into study. */
function SurveySummary() {
  const { stops, layoutId, deckId } = useSession();
  const deck = useDeck(deckId);
  const cards = useReview((s) => s.cards);
  const walked = useFlow((s) => s.surveyWalked);
  const section = useFlow((s) => s.section);
  // New places are new even in a palace the learner knows: a section never counts as familiar (beginStudyAfterSurvey).
  const familiar = useSettings((s) => s.familiarized[layoutId] === true) && !section;
  const layout = getLayout(layoutId);
  const heading = useRef<HTMLHeadingElement>(null);

  // The count is the first thing a screen reader should land on; Tab then reaches the actions.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useWalkKeys({ next: beginStudyAfterSurvey });

  if (!deck) return null;
  const rows = stops.flatMap((index) => {
    const locus = layout.loci[index];
    const item = itemAt(deck, locus);
    return item ? [{ locus, known: cards[item.id]?.survey === 'known' }] : [];
  });
  const knew = rows.filter((r) => r.known).length;
  const ruins = rows.length - knew;
  // What stands between here and the study walk (research principle 3: see beginStudyAfterSurvey).
  const before = familiar || (walked && rows.length < 2) ? 'none' : walked ? 'check' : 'walk';

  return (
    <section className="screen survey" data-testid="survey-summary">
      <p className="label" data-testid="survey-summary-label">
        Survey · {deck.title}
        {section ? ` · ${plural(rows.length, 'new place')}` : ''}
      </p>
      <h1 className="question" tabIndex={-1} ref={heading} data-testid="survey-score">
        You knew {knew} of {rows.length}.
      </h1>
      <p className="body" data-testid="survey-ruins">
        {ruins === 0 ? 'Every place is standing.' : `${plural(ruins, 'place is', 'places are')} in ruins.`}
      </p>
      {!walked && (
        <p className="body" data-testid="survey-skipped">
          You skipped the survey, so every place it did not reach counts as not known.
        </p>
      )}
      <RepairLegend />
      <p className="body" data-testid="survey-next-step">
        {before === 'check' && 'First a quick check of the route you just walked. '}
        {before === 'walk' && 'First a walk of the empty route, so that you know the places before anything is put in them. '}
        {before === 'none' ? 'Now' : 'Then'} the study walk: every fact gets its image and its answer, the ones you knew too,
        because a right pick can be a guess.
      </p>
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={beginStudyAfterSurvey} data-testid="survey-study">
          {before === 'check' ? 'Check the route' : before === 'walk' ? 'Walk the route' : 'Start the study walk'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={leave} data-testid="survey-home">
          Back to palaces
        </button>
      </div>
      <p className="hint">{ADVANCE_KEYS}: go on.</p>
      {/* Place names only: the facts themselves are shown in the study walk. */}
      <ol className="places" data-testid="survey-places">
        {rows.map(({ locus, known }) => (
          <li key={locus.id} className="place" data-state={known ? 'standing' : 'ruins'} data-testid="survey-place">
            <span className="place__term">{locus.name}</span>
            <span className="place__meta">{known ? 'standing: you knew its fact' : 'in ruins'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
