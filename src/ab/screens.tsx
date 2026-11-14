import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTROL_LIST, JUDGE_DECK_ID } from '@/ai/fixtures';
import { itemAt } from '@/flows/flow';
import { plural } from '@/flows/format';
import { getLayout } from '@/layouts';
import { useDeck } from '@/state/decks';
import { isLastStop, useSession } from '@/state/session';
import {
  DISTRACTOR_SECONDS,
  ENCODE_SECONDS_PER_STOP,
  LIST_STUDY_SECONDS,
  answerQuestion,
  beginRun,
  beginStudy,
  closeCompare,
  currentArm,
  finishDistractor,
  finishStudy,
  showResults,
  useAb,
} from './store';
import { useLiveClock, usePausableCountdown } from './timer';

const ARM_NAME = { list: 'Plain list', palace: 'Palace' } as const;

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A whole number of seconds left, with the bar under it. Not a live region: it would be read out every second. */
function Clock({ left, total, label, testid }: { left: number; total: number; label: string; testid: string }) {
  return (
    <div className="ab-clock">
      <p className="ab-clock__text">
        <span className="ab-clock__n" data-testid={testid}>
          {Math.ceil(left / 1000)}
        </span>{' '}
        s left
      </p>
      <Bar value={1 - left / total} label={label} />
    </div>
  );
}

export function Intro() {
  const n = useAb((s) => s.rows.length);
  const abandoned = useAb((s) => s.abandoned);
  return (
    <section className="screen" data-testid="ab-intro">
      <p className="label">Compare</p>
      <h2 className="question">A plain list against the palace</h2>
      {abandoned && (
        <p className="notice" data-testid="ab-abandoned">
          That run was abandoned. Nothing was recorded.
        </p>
      )}
      <p className="body">
        You will learn two sets of eight terms, in order: one as a numbered list on this page, one on a walk through the palace. Which comes
        first is drawn at random.
      </p>
      <p className="body">After each set come twenty seconds of sums, then a test of all eight in order. It takes about four minutes.</p>
      <p className="muted">
        This is an informal comparison for a handful of volunteers, not a study. {n > 0 ? `${plural(n, 'participant')} recorded on this device so far.` : 'Nobody is recorded on this device yet.'}
      </p>
      <div className="actions">
        <button type="button" className="btn btn--primary" autoFocus onClick={beginRun} data-testid="ab-start">
          Start
        </button>
        <button type="button" className="btn btn--quiet" onClick={closeCompare} data-testid="ab-close">
          Back to the title
        </button>
      </div>
      {n > 0 && (
        <div className="actions">
          <button type="button" className="link" onClick={showResults} data-testid="ab-see-results">
            See the results so far
          </button>
        </div>
      )}
      <p className="hint">Enter starts. Escape leaves; during a run it asks first, and an abandoned run is not recorded.</p>
    </section>
  );
}

/** The briefing before an arm. Not timed. */
export function Ready() {
  const part = useAb((s) => s.part);
  const arm = useAb((s) => currentArm(s));
  return (
    <section className="screen" data-testid="ab-ready" data-arm={arm}>
      <p className="label">
        Part {part + 1} of 2 · {ARM_NAME[arm]}
      </p>
      {arm === 'list' ? (
        <>
          <h2 className="question">Eight terms as a numbered list.</h2>
          <p className="body">
            The list stays on this page for {LIST_STUDY_SECONDS} seconds. Learn the terms in order, any way you like. The palace does nothing
            meanwhile.
          </p>
          <p className="body">Then twenty seconds of sums, and the test: which term was number 1, number 2, and so on to 8.</p>
        </>
      ) : (
        <>
          <h2 className="question">Eight terms on a walk through the palace.</h2>
          <p className="body">
            You are walked past eight places. At each one a term appears with a picture of it for a few seconds, about {LIST_STUDY_SECONDS}{' '}
            seconds in all. Picture it happening at that exact spot. The walk moves on by itself.
          </p>
          <p className="body">Then twenty seconds of sums, and the test: at each place in turn, what did you leave there?</p>
        </>
      )}
      <p className="muted">Both tests offer the same eight answers every time, and neither tells you how you are doing until the end.</p>
      <div className="actions">
        <button type="button" className="btn btn--primary" autoFocus onClick={beginStudy} data-testid="ab-begin">
          Begin
        </button>
      </div>
      <p className="hint">Enter begins. The clock starts at once.</p>
    </section>
  );
}

/** List arm: the eight terms as plain text for a fixed time. The scene idles. */
export function ListStudy() {
  const paused = useAb((s) => s.confirmAbandon);
  const total = LIST_STUDY_SECONDS * 1000;
  const left = usePausableCountdown(LIST_STUDY_SECONDS, !paused, 'list', () => finishStudy(total));
  return (
    <section className="screen" data-testid="ab-list-study">
      <div className="ab-clock ab-clock--row">
        <div className="ab-clock__head">
          <p className="label">Plain list · Learn these in order</p>
          <p className="ab-clock__text">
            <span className="ab-clock__n" data-testid="ab-study-left">
              {Math.ceil(left / 1000)}
            </span>{' '}
            s left
          </p>
        </div>
        <Bar value={1 - left / total} label="Study time used" />
      </div>
      {paused ? (
        // Hidden while the abandon question is open, so a pause is not extra study time.
        <p className="muted">Paused.</p>
      ) : (
        <ol className="ab-list" aria-label={CONTROL_LIST.title}>
          {CONTROL_LIST.items.map((it, i) => (
            <li key={it.term} className="ab-list__item" data-testid="ab-list-item">
              <span className="ab-list__n">{i + 1}</span>
              <span className="ab-list__term" data-testid="ab-list-term">
                {it.term}
              </span>
              <span className="ab-list__meaning">{it.meaning}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Palace arm: a timed encode walk. Each image is shown for ENCODE_SECONDS_PER_STOP from the
 * moment the camera arrives, as in the pitch variant of Judge Mode, and nothing skips ahead:
 * every participant gets the same time at every place.
 */
export function PalaceEncode() {
  const paused = useAb((s) => s.confirmAbandon);
  const mode = useSession((s) => s.mode);
  const stops = useSession((s) => s.stops);
  const step = useSession((s) => s.step);
  const arrived = useSession((s) => s.arrived);
  const deck = useDeck(JUDGE_DECK_ID);
  const layout = getLayout(deck?.layoutId);
  const locus = layout.loci[stops[step]];
  const item = itemAt(deck, locus);
  const clock = useLiveClock(paused);
  useEffect(() => clock.reset(), [clock]);

  const total = ENCODE_SECONDS_PER_STOP * 1000;
  const left = usePausableCountdown(ENCODE_SECONDS_PER_STOP, mode === 'encode' && arrived && !paused, step, () => {
    const s = useSession.getState();
    if (isLastStop(s)) finishStudy(clock.elapsed());
    else s.next();
  });

  if (mode !== 'encode' || !locus || !item) return null;
  return (
    <section className="screen" data-testid="ab-encode">
      <p className="label" data-testid="ab-encode-label" data-place={locus.name}>
        Place {step + 1} of {stops.length} · {locus.name}
      </p>
      <div aria-live="polite">
        {arrived ? (
          <>
            <h2 className="term" data-testid="ab-encode-term">
              {item.term}
            </h2>
            {item.meaning && <p className="body">{item.meaning}</p>}
            <hr />
            <p className="scene">{item.imago.scene}</p>
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
      <Bar value={arrived ? 1 - left / total : 0} label="Time at this place" />
      <p className="hint">Picture it happening at this exact spot. The walk moves on by itself.</p>
    </section>
  );
}

function newSum(): { a: number; b: number } {
  const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  return { a: between(23, 78), b: between(13, 49) };
}

/** Twenty seconds of typed sums between study and test. Not scored, and nothing about them is kept. */
export function Distractor() {
  const paused = useAb((s) => s.confirmAbandon);
  const [sum, setSum] = useState(newSum);
  const [typed, setTyped] = useState('');
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const total = DISTRACTOR_SECONDS * 1000;
  const left = usePausableCountdown(DISTRACTOR_SECONDS, !paused, 'sums', finishDistractor);

  useEffect(() => {
    if (!paused) input.current?.focus();
  }, [paused]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim() || paused) return;
    setCount(count + 1);
    setSum(newSum());
    setTyped('');
  };

  return (
    <section className="screen" data-testid="ab-distractor">
      <p className="label">Sums · Not scored</p>
      <Clock left={left} total={total} label="Time until the test" testid="ab-sums-left" />
      <p className="body">
        Twenty seconds of sums before the test, so that you do not answer straight from what you have just seen. They are not scored.
      </p>
      <form className="typed" onSubmit={onSubmit}>
        <label htmlFor="ab-sum-input" className="term ab-sum" data-testid="ab-sum">
          {sum.a} + {sum.b}
        </label>
        <input
          id="ab-sum-input"
          ref={input}
          className="field ab-sum__field"
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          data-testid="ab-sum-input"
        />
        <div className="actions">
          <button type="submit" className="btn" disabled={!typed.trim()} data-testid="ab-sum-next">
            Next sum
          </button>
        </div>
      </form>
      <p className="hint" data-testid="ab-sum-count">
        Type the answer and press Enter. {count > 0 ? `${plural(count, 'sum')} done.` : 'One sum at a time.'}
      </p>
    </section>
  );
}

/**
 * The ordered recall test, the same in both arms: eight questions in order, the arm's eight
 * terms as options in one shuffled order throughout, keys 1 to 8. No feedback of any kind:
 * an answer is taken and the next question follows (the palace arm walks to the next place).
 * The palace arm never calls `session.answer`, so no image is revealed in the scene either.
 */
export function RecallTest() {
  const paused = useAb((s) => s.confirmAbandon);
  const arm = useAb((s) => currentArm(s));
  const options = useAb((s) => s.options);
  const questions = useAb((s) => s.questions);
  const index = useAb((s) => s.question);
  const mode = useSession((s) => s.mode);
  const arrived = useSession((s) => s.arrived);
  const asked = questions[index];
  // The palace question is asked once the camera has settled at the place.
  const ready = arm === 'list' || (mode === 'recall' && arrived);
  const clock = useLiveClock(paused);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ready) return;
    clock.reset();
    // Focus leaves the option just used, so a second Enter cannot answer the next question too.
    heading.current?.focus();
  }, [ready, index, clock]);

  const pick = (optionId: string) => {
    if (!ready || paused) return;
    answerQuestion(optionId, clock.elapsed());
  };
  const latest = useRef(pick);
  useEffect(() => {
    latest.current = pick;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-8]$/.test(e.key)) return;
      // A digit typed into a Theme Lab field (`?lab`) is not an answer.
      if (e.target instanceof Element && e.target.closest('[data-lab]')) return;
      const option = useAb.getState().options[Number(e.key) - 1];
      if (!option) return;
      e.preventDefault();
      latest.current(option.id);
    };
    // Capture phase on window: see Compare, which stops key events there.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!asked) return null;
  return (
    <section className="screen" data-testid="ab-recall" data-arm={arm}>
      <p className="label" data-testid="ab-recall-label">
        {ARM_NAME[arm]} · Question {index + 1} of {questions.length}
      </p>
      {!ready ? (
        <p className="muted" data-testid="ab-walking">
          Walking to {asked.place}.
        </p>
      ) : (
        <>
          <h2 className="question" ref={heading} tabIndex={-1} data-testid="ab-question" data-q={index + 1} data-place={asked.place}>
            {arm === 'list' ? `Which was number ${index + 1}?` : `What did you leave at ${asked.place}?`}
          </h2>
          <ol className="choices ab-choices">
            {options.map((o, i) => (
              <li key={o.id}>
                <button type="button" className="choice" disabled={paused} onClick={() => pick(o.id)} data-testid="ab-choice">
                  <span className="choice__key">{i + 1}</span>
                  <span>{o.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="hint">Keys 1 to {options.length} pick an answer. There is no feedback until both parts are done.</p>
    </section>
  );
}
