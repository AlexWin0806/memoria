import { useEffect, useRef, useState } from 'react';
import { regenerateImago } from '@/ai/architect';
import type { Imago, Locus, MemoryItem } from '@/core/types';
import { emojiOnly, splitGlyphs } from '@/flows/answers';
import { withDeadline } from '@/flows/deadline';
import { itemAt, leave, startRecall, useFlow } from '@/flows/flow';
import { formatDuration, formatWhen, numberWord } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { isNoStrongerSuggestion, NO_MORE_OFFLINE } from '@/flows/suggest';
import { JUDGE_REGENERATE_TIMEOUT_MS, REGENERATE_TIMEOUT_MS } from '@/flows/timing';
import { getLayout } from '@/layouts';
import { useDeck, useDecks } from '@/state/decks';
import { useReview } from '@/state/review';
import { useSession } from '@/state/session';

/**
 * `by` says where the text in the editor came from: a new image from the Architect, an
 * offline draft, or the old image handed back for the learner to rewrite by hand.
 */
type Draft =
  | { status: 'busy' }
  | { status: 'draft'; imago: Imago; scene: string; glyphs: string; by: 'architect' | 'written' | 'offline' | 'hand'; late?: boolean; spent?: boolean }
  | { status: 'saved' };

const sameScene = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Score, schedule, and for each miss a way to make its image stronger. */
export function Results() {
  const { stops, results, deckId, layoutId, judge } = useSession();
  const recallMs = useFlow((s) => s.recallMs);
  const cards = useReview((s) => s.cards);
  const deck = useDeck(deckId);
  const layout = getLayout(layoutId);
  const now = useNow();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const score = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLElement>(null);
  // A list too long for the panel: the actions are then pinned to the bottom edge instead.
  const [long, setLong] = useState(false);

  // The score is the first thing a screen reader should land on, and Tab then reaches the actions.
  useEffect(() => {
    score.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const el = body.current;
    const scroller = el?.parentElement;
    if (!el || !scroller) return;
    const measure = () => {
      const cs = getComputedStyle(scroller);
      const room = scroller.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // Pinning changes the height a little, so the way back needs a clear margin (no flip-flop).
      setLong((was) => el.offsetHeight > room - (was ? 60 : 0));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);
  // An open Strengthen editor holds typing that is saved nowhere: the browser should ask before a reload.
  const editing = Object.values(drafts).some((d) => d.status === 'draft');
  useEffect(() => {
    useFlow.setState({ unsavedEdits: editing });
    return () => useFlow.setState({ unsavedEdits: false });
  }, [editing]);

  if (!deck) return null;
  const rows = stops.flatMap((index) => {
    const locus = layout.loci[index];
    const item = itemAt(deck, locus);
    return item ? [{ locus, item, result: results.find((r) => r.itemId === item.id) }] : [];
  });
  const right = rows.filter((r) => r.result?.correct).length;
  // Judge pitch: the recall walk checked only some of the places.
  const spot = judge && rows.length < deck.items.length;
  const setDraft = (id: string, d: Draft | undefined) =>
    setDrafts((all) => {
      const { [id]: _old, ...rest } = all;
      return d ? { ...rest, [id]: d } : rest;
    });

  const strengthen = async (item: MemoryItem, locus: Locus) => {
    setDraft(item.id, { status: 'busy' });
    const others = deck.items.filter((o) => o.id !== item.id).map((o) => o.imago);
    // The Architect must never block the learner. With no usable answer in time (none, an
    // error, or the same image again) the old image opens for rewriting by hand instead.
    const byHand = (late: boolean, spent = false) =>
      setDraft(item.id, { status: 'draft', imago: item.imago, scene: item.imago.scene, glyphs: item.imago.glyphs.join(' '), by: 'hand', late, spent });
    try {
      const imago = await withDeadline(
        regenerateImago({ item, locus, others, missed: true }),
        judge ? JUDGE_REGENERATE_TIMEOUT_MS : REGENERATE_TIMEOUT_MS,
      );
      if (isNoStrongerSuggestion(imago) || sameScene(imago.scene, item.imago.scene)) byHand(false, imago.source === 'fallback');
      else
        setDraft(item.id, {
          status: 'draft',
          imago,
          scene: imago.scene,
          glyphs: imago.glyphs.join(' '),
          // A fixture's alternate was written by hand for this item: it is not the Architect's work.
          by: imago.source === 'fallback' ? 'offline' : imago.source === 'fixture' ? 'written' : 'architect',
        });
    } catch {
      byHand(true);
    }
  };

  const accept = (item: MemoryItem, d: Extract<Draft, { status: 'draft' }>) => {
    const glyphs = splitGlyphs(d.glyphs);
    const edited = d.scene.trim() !== d.imago.scene || glyphs.join() !== d.imago.glyphs.join();
    useDecks.getState().updateItem(deck.id, item.id, {
      imago: {
        ...d.imago,
        scene: d.scene.trim() || d.imago.scene,
        glyphs: glyphs.length ? glyphs : d.imago.glyphs,
        source: edited ? 'learner' : d.imago.source,
      },
    });
    setDraft(item.id, { status: 'saved' });
  };

  return (
    <section className="screen results" data-long={long ? 'true' : 'false'} ref={body} data-testid="results">
      <p className="label">
        {spot ? 'Spot check' : 'Results'} · {deck.title}
      </p>
      <h1 className="score" tabIndex={-1} ref={score} data-testid="results-score">
        {right} of {rows.length}
      </h1>
      {spot && (
        <p className="body" data-testid="results-spot">
          A spot check: {numberWord(rows.length)} of the {numberWord(deck.items.length)} places, picked at random. The other{' '}
          {numberWord(deck.items.length - rows.length)} were not tested.
        </p>
      )}
      <p className="body" data-testid="results-time">
        Recalled from memory in {formatDuration(recallMs)}.
      </p>
      <div className="actions results__actions" data-testid="results-actions">
        {judge && (
          <button type="button" className="btn btn--primary" onClick={() => useSession.getState().toCompose()} data-testid="results-build">
            Build a palace from your own notes
          </button>
        )}
        <button
          type="button"
          className={judge ? 'btn' : 'btn btn--primary'}
          onClick={() => startRecall(deck.id, 'all', judge)}
          data-testid="results-again"
        >
          {spot ? `Recall all ${numberWord(deck.items.length)}` : 'Recall again'}
        </button>
        <button type="button" className="btn" onClick={leave} data-testid="results-home">
          Back to palaces
        </button>
      </div>
      <ol className="places">
        {rows.map(({ locus, item, result }) => {
          const card = cards[item.id];
          const d = drafts[item.id];
          const ok = Boolean(result?.correct);
          return (
            <li key={item.id} className="place" data-state={ok ? 'right' : 'wrong'} data-testid="result-row">
              <div className="place__line">
                <span className="place__mark" aria-hidden="true">
                  {ok ? '✓' : '✕'}
                </span>
                <span className="place__text">
                  <span className="place__term">{item.term}</span>
                  <span className="place__meta" data-testid="result-meta">
                    {locus.name} · {ok ? (result?.selfMarked ? 'right (self-marked)' : 'right') : 'missed'}
                    {card ? ` · ${ok ? 'next review' : 'again'} ${formatWhen(card.dueAt, now)}` : ''}
                  </span>
                </span>
              </div>
              {!ok && d?.status !== 'draft' && d?.status !== 'saved' && (
                <button type="button" className="link" disabled={d?.status === 'busy'} onClick={() => strengthen(item, locus)} data-testid="strengthen">
                  {d?.status === 'busy' ? 'Looking for a stronger image' : 'Strengthen this image'}
                </button>
              )}
              {d?.status === 'draft' && (
                <div className="draft" data-testid="strengthen-draft" data-by={d.by}>
                  {d.by === 'hand' && (
                    <p className="notice" data-testid="strengthen-guide">
                      {d.late ? 'The Architect did not answer, so this one is yours to rewrite. ' : d.spent ? `${NO_MORE_OFFLINE} ` : ''}
                      Make it more distinct from its neighbours, and still tied to the meaning.
                    </p>
                  )}
                  {d.by === 'offline' && (
                    <p className="notice" data-testid="strengthen-guide">
                      An offline draft, made without the Architect. Rewrite it until it is vivid to you: more distinct from
                      its neighbours, and still tied to the meaning.
                    </p>
                  )}
                  <label className="label" htmlFor={`sd-${item.id}`}>
                    {d.by === 'hand' ? `Rewrite the image at ${locus.name}` : `New image for ${locus.name}`}
                  </label>
                  <textarea
                    id={`sd-${item.id}`}
                    className="field"
                    rows={3}
                    value={d.scene}
                    // The editor opens with the text selected, so typing replaces the scene.
                    ref={(el) => {
                      if (el && el.dataset.opened !== 'yes') {
                        el.dataset.opened = 'yes';
                        el.focus();
                        el.select();
                      }
                    }}
                    data-testid="strengthen-scene"
                    onChange={(e) => setDraft(item.id, { ...d, scene: e.target.value })}
                  />
                  <label className="label" htmlFor={`sg-${item.id}`}>
                    Glyphs (1 to 3 emoji)
                  </label>
                  <input id={`sg-${item.id}`} className="field" value={d.glyphs} onChange={(e) => setDraft(item.id, { ...d, glyphs: emojiOnly(e.target.value).glyphs.join(' ') })} />
                  {d.imago.reason && (
                    <p className="reason">
                      <span className="label">Why</span> {d.imago.reason}
                    </p>
                  )}
                  {d.by === 'architect' && <p className="hint">Edit it until it is vivid to you, then keep it.</p>}
                  {d.by === 'written' && (
                    <p className="hint" data-testid="strengthen-written">
                      A hand-written alternative. Edit it until it is vivid to you, then keep it.
                    </p>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      // By hand, there is nothing new to keep until the learner has changed the old image.
                      disabled={d.by === 'hand' && sameScene(d.scene, item.imago.scene) && d.glyphs.trim() === item.imago.glyphs.join(' ')}
                      onClick={() => accept(item, d)}
                      data-testid="strengthen-accept"
                    >
                      Use this image
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => setDraft(item.id, undefined)} data-testid="strengthen-cancel">
                      Keep the old one
                    </button>
                  </div>
                </div>
              )}
              {d?.status === 'saved' && (
                <p className="muted" role="status">
                  New image placed at {locus.name}.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {judge && (
        <div className="note" data-testid="judge-note">
          <p className="label">What just happened</p>
          <p>
            {spot
              ? `You walked a fixed route and left one fact at each place. Then ${numberWord(rows.length)} of those places came back with the images hidden, and you answered before anything was shown. `
              : 'You walked a fixed route, left one fact at each place, then walked it again with the images hidden and answered before anything was shown. '}
            The palace is the encoding step.
          </p>
          <p>
            Two meta-analyses report medium-to-large gains in recall of ordered lists with the method of loci, and both warn
            of a high risk of bias in the underlying studies. Retrieval practice and spaced review have the stronger evidence,
            so they are the core of the loop.
          </p>
          <p>
            This score is same-session recall. Success is judged on delayed recall, so each item comes back for review at
            expanding intervals (Leitner boxes: a miss returns in 10 minutes; a right answer waits 1 day, then 3, 7 and 21
            days). We have not run an efficacy study of Memoria.
          </p>
          <p data-testid="judge-next">Next, try it on something of your own: build a palace from your own notes.</p>
        </div>
      )}

    </section>
  );
}
