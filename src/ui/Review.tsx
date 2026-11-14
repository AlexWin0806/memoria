import { canExam, startExam, useExam } from '@/flows/exam';
import { leave, startRecall } from '@/flows/flow';
import { formatWhen, plural } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { useAllDecks } from '@/state/decks';
import { reviewQueue, useReview } from '@/state/review';
import { useSession } from '@/state/session';

/**
 * Reviews: only palaces that have been studied, the ones with something due first.
 * A review is a recall walk over only the places that are due. Each palace also offers an
 * exam: the same facts with no palace on screen (src/flows/exam.ts).
 */
export function Review() {
  const decks = useAllDecks();
  const cards = useReview((s) => s.cards);
  const now = useNow();
  const queue = reviewQueue(decks, cards, now);
  const anyDue = queue.some((r) => r.progress.due > 0);
  const anyExam = queue.some((r) => canExam(r.deck, cards));
  // A reload ended an exam in progress: said once, here, and forgotten when this screen is left (src/flows/exam.ts).
  const cutShort = useExam((s) => s.cutShort);

  return (
    <section className="screen" data-testid="review">
      <p className="label">Reviews</p>
      {/* Focusable, so that the focus has somewhere to land when an exam's results lead back here. */}
      <h1 className="question" tabIndex={-1} data-testid="review-heading">
        {queue.length === 0 ? 'Nothing to review yet' : anyDue ? 'What is due' : 'Nothing is due right now'}
      </h1>
      {cutShort && (
        <p className="notice" role="status" data-testid="exam-cut-short">
          The page was reloaded in the middle of an exam. Nothing from it was recorded.
        </p>
      )}
      {queue.length === 0 ? (
        <p className="body" data-testid="review-empty">
          A palace appears here after its first recall walk. Walk one, recall it, and its places come back for review at
          growing intervals.
        </p>
      ) : (
        <p className="body">
          Each review is a recall walk over the places that are due, in route order. A right answer moves the item to a
          longer interval; a miss brings it back sooner.
          {anyExam ? ' An exam asks the same facts with no palace on screen, in shuffled order.' : ''}
        </p>
      )}
      {queue.length > 0 && (
        <ul className="places">
          {queue.map(({ deck, progress: p }) => (
            <li key={deck.id} className="place" data-testid="review-row">
              <div className="place__line">
                <span className="place__text">
                  <span className="place__term">{deck.title}</span>
                  <span className="place__meta">
                    {p.due > 0
                      ? `${p.due} of ${plural(p.total, 'place')} due now`
                      : `Next review ${p.nextDueAt === undefined ? 'soon' : formatWhen(p.nextDueAt, now)}`}
                    {p.fresh > 0 ? ` · ${p.fresh} not studied yet` : ''}
                  </span>
                </span>
              </div>
              {(p.due > 0 || canExam(deck, cards)) && (
                <div className="place__actions">
                  {p.due > 0 && (
                    <button type="button" className="btn" onClick={() => startRecall(deck.id, 'due')} data-testid="review-now">
                      Review now
                    </button>
                  )}
                  {canExam(deck, cards) && (
                    <button type="button" className="btn btn--quiet" onClick={() => startExam(deck.id)} aria-label={`Exam on ${deck.title}`} data-testid="review-exam">
                      Exam
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        {queue.length === 0 && (
          <button type="button" className="btn" onClick={() => useSession.getState().toCompose()}>
            Build a palace
          </button>
        )}
        <button type="button" className="btn btn--quiet" onClick={leave}>
          Back to palaces
        </button>
      </div>
    </section>
  );
}
