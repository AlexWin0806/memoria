import { useState } from 'react';
import type { Deck, ReviewCard } from '@/core/types';
import { judgeVariantFromUrl, startEncode, startJudge, startRecall } from '@/flows/flow';
import { formatWhen, plural } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { JUDGE_PROMISE } from '@/flows/timing';
import { useAllDecks, useDecks } from '@/state/decks';
import { deckProgress, useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { useSettings, type RecallInput } from '@/state/settings';
import { THEMES } from '@/themes';

/**
 * "8 places · not started", "8 places · 3 due now" or "8 places · next review tomorrow".
 * A place that has never been recalled is new, not due; a partly studied palace says how many are new.
 */
export function deckStatus(deck: Deck, cards: Record<string, ReviewCard>, now: number): string {
  const places = plural(deck.items.length, 'place');
  const p = deckProgress(deck, cards, now);
  if (p.studied === 0) return `${places} · not started`;
  const fresh = p.fresh > 0 ? ` · ${p.fresh} new` : '';
  if (p.due > 0) return `${places} · ${p.due} due now${fresh}`;
  return `${places} · next review ${p.nextDueAt === undefined ? 'soon' : formatWhen(p.nextDueAt, now)}${fresh}`;
}

/** Title screen: set low on the left, straight over the scene, with no panel. */
export function Title() {
  const decks = useAllDecks();
  const cards = useReview((s) => s.cards);
  const now = useNow();
  const [deleting, setDeleting] = useState<string | null>(null);
  // Only places that have been studied and are due again: a new learner has no reviews.
  const totalDue = decks.reduce((n, d) => n + deckProgress(d, cards, now).due, 0);
  const promise = JUDGE_PROMISE[judgeVariantFromUrl()].label;

  const remove = (deckId: string) => {
    useDecks.getState().remove(deckId);
    useReview.getState().resetDeck(deckId);
    setDeleting(null);
  };

  return (
    <main className="title" data-testid="title">
      <h1 className="title__name">Memoria</h1>
      <p className="title__pitch">Paste what you need to learn. Walk it into memory.</p>
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={() => startJudge()} data-testid="title-judge">
          {promise}
        </button>
        <button type="button" className="btn" onClick={() => useSession.getState().toCompose()} data-testid="title-build">
          Build a palace
        </button>
      </div>

      <section className="title__decks" aria-labelledby="palaces-h">
        <div className="rowhead">
          <h2 id="palaces-h" className="label">
            Your palaces
          </h2>
          <button type="button" className="link" onClick={() => useSession.getState().toReview()} data-testid="title-review">
            Reviews{totalDue > 0 ? ` (${totalDue} due)` : ''}
          </button>
        </div>
        <ul className="decks">
          {decks.map((deck) => (
            <li key={deck.id} className="deck" data-testid="deck-row">
              <div className="deck__text">
                <span className="deck__title">{deck.title}</span>
                <span className="deck__meta">{deckStatus(deck, cards, now)}</span>
              </div>
              {deleting === deck.id ? (
                <div className="deck__actions">
                  <span className="deck__meta">Delete this palace?</span>
                  <button type="button" className="link link--danger" onClick={() => remove(deck.id)}>
                    Delete
                  </button>
                  <button type="button" className="link" autoFocus onClick={() => setDeleting(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <div className="deck__actions">
                  <button type="button" className="link" onClick={() => startEncode(deck.id)} aria-label={`Walk ${deck.title}`}>
                    Walk
                  </button>
                  <button type="button" className="link" onClick={() => startRecall(deck.id, 'all')} aria-label={`Recall ${deck.title}`}>
                    Recall
                  </button>
                  {!deck.fixture && (
                    <button type="button" className="link" onClick={() => setDeleting(deck.id)} aria-label={`Delete ${deck.title}`}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Settings />
    </main>
  );
}

function Settings() {
  const s = useSettings();
  const motion = s.reducedMotion === null ? 'system' : s.reducedMotion ? 'on' : 'off';
  return (
    <details className="settings" data-testid="settings">
      <summary className="label">Settings</summary>
      <div className="settings__grid">
        <label htmlFor="set-theme">Theme</label>
        <select id="set-theme" value={s.themeId} onChange={(e) => s.setTheme(e.target.value)}>
          {Object.values(THEMES).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label htmlFor="set-motion">Reduced motion</label>
        <select
          id="set-motion"
          value={motion}
          onChange={(e) => s.setReducedMotion(e.target.value === 'system' ? null : e.target.value === 'on')}
        >
          <option value="system">Follow the system</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <label htmlFor="set-recall">Recall answers</label>
        <select id="set-recall" value={s.recallInput} onChange={(e) => s.setRecallInput(e.target.value as RecallInput)}>
          <option value="choice">Multiple choice</option>
          <option value="typed">Typed</option>
        </select>
      </div>
    </details>
  );
}
