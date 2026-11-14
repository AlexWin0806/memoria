import { leave, startRecall } from '@/flows/flow';
import { formatWhen, plural } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { useAllDecks } from '@/state/decks';
import { dueItemIds, nextDueAt, useReview } from '@/state/review';

/** Due-for-review dashboard. A review is a recall walk over only the places that are due. */
export function Review() {
  const decks = useAllDecks();
  const cards = useReview((s) => s.cards);
  const now = useNow();

  return (
    <section className="screen" data-testid="review">
      <p className="label">Reviews</p>
      <h2 className="question">What is due</h2>
      <p className="body">
        Each review is a recall walk over the places that are due, in route order. A right answer moves the item to a longer
        interval; a miss brings it back sooner.
      </p>
      <ul className="places">
        {decks.map((deck) => {
          const due = dueItemIds(deck, cards, now).length;
          const started = deck.items.some((it) => cards[it.id]);
          const next = nextDueAt(deck, cards, now);
          return (
            <li key={deck.id} className="place" data-testid="review-row">
              <div className="place__line">
                <span className="place__text">
                  <span className="place__term">{deck.title}</span>
                  <span className="place__meta">
                    {due > 0
                      ? `${due} of ${plural(deck.items.length, 'place')} due now`
                      : next === undefined
                        ? 'Nothing due'
                        : `Nothing due · next review ${formatWhen(next, now)}`}
                    {!started ? ' · not walked yet' : ''}
                  </span>
                </span>
              </div>
              {due > 0 && (
                <button type="button" className="btn" onClick={() => startRecall(deck.id, 'due')} data-testid="review-now">
                  Review now
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button type="button" className="btn btn--quiet" onClick={leave}>
          Back to palaces
        </button>
      </div>
    </section>
  );
}
