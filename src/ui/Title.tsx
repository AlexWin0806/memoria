import { useState } from 'react';
import { CompareLink } from '@/ab/CompareLink';
import type { Deck, ReviewCard } from '@/core/types';
import { discardSavedWalk, judgeVariantFromUrl, openProgress, resumeWalk, startEncode, startJudge, startRecall, useFlow } from '@/flows/flow';
import { formatWhen, plural } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { JUDGE_PROMISE } from '@/flows/timing';
import { getDeck, useAllDecks, useDecks } from '@/state/decks';
import { EDIT_PREFIX, hasExtensionDraft, hasNewPalaceDraft, openEditor, openExtension, openNewPalace, useDraft } from '@/state/draft';
import { useHistory } from '@/state/history';
import { deckProgress, useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { useSettings, type RecallInput } from '@/state/settings';
import { savedDataWasSetAside } from '@/state/storage';
import { useThemeLab } from '@/state/themeLab';
import { getTheme, THEMES } from '@/themes';
import { useActiveTheme } from '@/themes/active';
import { palaceStyleLine } from './palaceWords';
import './compose.css';

/**
 * "8 places · not started", "8 places · 3 due now" or "8 places · next review tomorrow".
 * A place that has never been recalled is new, not due; a partly studied palace says how many are new.
 * A palace that has been surveyed but not recalled yet says how far it got: "surveyed, not yet
 * studied" until every image has been placed, then "studied, not yet recalled".
 */
export function deckStatus(deck: Deck, cards: Record<string, ReviewCard>, now: number): string {
  const places = plural(deck.items.length, 'place');
  const p = deckProgress(deck, cards, now);
  if (p.studied === 0 && deck.surveyedAt !== undefined) {
    const placed = deck.items.every((it) => cards[it.id]?.studiedAt !== undefined);
    return `${places} · ${placed ? 'studied, not yet recalled' : 'surveyed, not yet studied'}`;
  }
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
  // A walk that a reload cut short, and a Compose draft that is waiting to be placed.
  const saved = useFlow((s) => s.savedWalk);
  const savedDeck = saved ? getDeck(saved.deckId) : undefined;
  const drafting = useDraft((d) => hasNewPalaceDraft(d));
  // Notes waiting to be added to a palace are kept with that palace.
  const adding = useDraft((d) => decks.filter((deck) => hasExtensionDraft(deck.id, d)).map((deck) => deck.id).join(' '));
  // Edits begun and not saved are kept with their palace too.
  const editing = useDraft((d) => decks.filter((deck) => d.parked[EDIT_PREFIX + deck.id] !== undefined).map((deck) => deck.id).join(' '));

  const remove = (deckId: string) => {
    useDecks.getState().remove(deckId);
    useReview.getState().resetDeck(deckId);
    useHistory.getState().removeDeck(deckId);
    useDraft.getState().forget(deckId);
    setDeleting(null);
  };

  return (
    <div className="title" data-testid="title">
      <h1 className="title__name">Memoria</h1>
      <p className="title__pitch">Paste what you need to learn. Walk it into memory.</p>
      {savedDataWasSetAside() && (
        // Saved data that failed validation was dropped on load; the raw original is kept (see @/state/storage).
        <p className="title__aside" role="status" data-testid="storage-notice">
          Some saved data could not be read and was set aside.
        </p>
      )}
      {saved && savedDeck && (
        <div className="notice resume" role="status" data-testid="resume">
          <p>
            You were on a walk: {savedDeck.title}, {saved.mode === 'recall' ? 'recall, ' : saved.mode === 'survey' ? 'survey, ' : ''}place{' '}
            {saved.step + 1} of {saved.stops.length}.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--primary" autoFocus onClick={resumeWalk} data-testid="resume-walk">
              Resume your walk
            </button>
            <button type="button" className="btn" onClick={discardSavedWalk} data-testid="resume-discard">
              Start over
            </button>
          </div>
        </div>
      )}
      <div className="actions">
        <button type="button" className={saved && savedDeck ? 'btn' : 'btn btn--primary'} onClick={() => startJudge()} data-testid="title-judge">
          {promise}
        </button>
        <button type="button" className="btn" onClick={openNewPalace} data-testid="title-build">
          {drafting ? 'Continue your draft' : 'Build a palace'}
        </button>
      </div>

      <section className="title__decks" aria-labelledby="palaces-h">
        <div className="rowhead">
          <h2 id="palaces-h" className="label">
            Your palaces
          </h2>
          <span className="rowhead__links">
            <button type="button" className="link" onClick={() => useSession.getState().toReview()} data-testid="title-review">
              Reviews{totalDue > 0 ? ` (${totalDue} due)` : ''}
            </button>
            <button type="button" className="link" onClick={openProgress} data-testid="title-progress">
              Progress
            </button>
          </span>
        </div>
        <ul className="decks">
          {decks.map((deck) => {
            // A generated palace says what it is built as and how many rooms it has; it can also be added to.
            const style = palaceStyleLine(deck.layoutId);
            return (
            <li key={deck.id} className="deck" data-testid="deck-row">
              <div className="deck__text">
                <span className="deck__title">{deck.title}</span>
                <span className="deck__line">
                  {style && (
                    <span className="deck__palace" data-testid="deck-palace">
                      {style} ·{' '}
                    </span>
                  )}
                  <span className="deck__meta">{deckStatus(deck, cards, now)}</span>
                </span>
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
                  {!deck.fixture && style && (
                    <button type="button" className="link" onClick={() => openExtension(deck.id)} aria-label={`Add to ${deck.title}`} data-testid="deck-extend">
                      {adding.split(' ').includes(deck.id) ? 'Add (draft)' : 'Add'}
                    </button>
                  )}
                  {/* A built-in deck is changed only as before: one image at a time, from its results. */}
                  {!deck.fixture && (
                    <button type="button" className="link" onClick={() => openEditor(deck.id)} aria-label={`Edit ${deck.title}`} data-testid="deck-edit">
                      {editing.split(' ').includes(deck.id) ? 'Edit (draft)' : 'Edit'}
                    </button>
                  )}
                  {!deck.fixture && (
                    <button type="button" className="link" onClick={() => setDeleting(deck.id)} aria-label={`Delete ${deck.title}`}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      </section>

      <Settings />
      <CompareLink />
    </div>
  );
}

/** Value of the menu entry that stands for a theme shown but not saved. */
const PREVIEW = '(preview)';

function Settings() {
  const s = useSettings();
  const motion = s.reducedMotion === null ? 'system' : s.reducedMotion ? 'on' : 'off';
  // The menu shows the theme on screen. With `?theme=` or a Theme Lab override that is not
  // the saved one: it is listed as a preview, and a choice made here is saved for later.
  const active = useActiveTheme();
  const tuned = useThemeLab((t) => t.override !== null);
  const fromUrl = new URLSearchParams(location.search).get('theme');
  const preview = tuned || (fromUrl !== null && THEMES[fromUrl] !== undefined && fromUrl !== s.themeId);
  return (
    <details className="settings" data-testid="settings">
      <summary className="label">Settings</summary>
      <div className="settings__grid">
        <label htmlFor="set-theme">Theme</label>
        <select
          id="set-theme"
          value={preview ? PREVIEW : getTheme(s.themeId).id}
          onChange={(e) => e.target.value !== PREVIEW && s.setTheme(e.target.value)}
          data-testid="set-theme"
        >
          {preview && <option value={PREVIEW}>{active.name} (preview)</option>}
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
