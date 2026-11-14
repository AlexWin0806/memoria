import { useState } from 'react';
import { regenerateImago } from '@/ai/architect';
import type { Imago, Locus, MemoryItem } from '@/core/types';
import { splitGlyphs } from '@/flows/answers';
import { itemAt, leave, startRecall, useFlow } from '@/flows/flow';
import { formatDuration, formatWhen } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { getLayout } from '@/layouts';
import { useDeck, useDecks } from '@/state/decks';
import { useReview } from '@/state/review';
import { useSession } from '@/state/session';

type Draft = { status: 'busy' } | { status: 'draft'; imago: Imago; scene: string; glyphs: string } | { status: 'saved' };

/** Score, schedule, and for each miss a way to make its image stronger. */
export function Results() {
  const { stops, results, deckId, layoutId, judge } = useSession();
  const recallMs = useFlow((s) => s.recallMs);
  const cards = useReview((s) => s.cards);
  const deck = useDeck(deckId);
  const layout = getLayout(layoutId);
  const now = useNow();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  if (!deck) return null;
  const rows = stops.flatMap((index) => {
    const locus = layout.loci[index];
    const item = itemAt(deck, locus);
    return item ? [{ locus, item, result: results.find((r) => r.itemId === item.id) }] : [];
  });
  const right = rows.filter((r) => r.result?.correct).length;
  const setDraft = (id: string, d: Draft | undefined) =>
    setDrafts((all) => {
      const { [id]: _old, ...rest } = all;
      return d ? { ...rest, [id]: d } : rest;
    });

  const strengthen = async (item: MemoryItem, locus: Locus) => {
    setDraft(item.id, { status: 'busy' });
    const others = deck.items.filter((o) => o.id !== item.id).map((o) => o.imago);
    try {
      const imago = await regenerateImago({ item, locus, others, missed: true });
      setDraft(item.id, { status: 'draft', imago, scene: imago.scene, glyphs: imago.glyphs.join(' ') });
    } catch {
      // The Architect must never block the learner: fall back to editing the current image.
      setDraft(item.id, { status: 'draft', imago: item.imago, scene: item.imago.scene, glyphs: item.imago.glyphs.join(' ') });
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
    <section className="screen" data-testid="results">
      <p className="label">Results · {deck.title}</p>
      <h2 className="score" data-testid="results-score">
        {right} of {rows.length}
      </h2>
      <p className="body" data-testid="results-time">
        Recalled from memory in {formatDuration(recallMs)}.
      </p>
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
                  <span className="place__meta">
                    {locus.name} · {ok ? 'right' : 'missed'}
                    {card ? ` · due ${formatWhen(card.dueAt, now)}` : ''}
                  </span>
                </span>
              </div>
              {!ok && d?.status !== 'draft' && d?.status !== 'saved' && (
                <button type="button" className="link" disabled={d?.status === 'busy'} onClick={() => strengthen(item, locus)} data-testid="strengthen">
                  {d?.status === 'busy' ? 'The Architect is drawing a stronger image' : 'Strengthen this image'}
                </button>
              )}
              {d?.status === 'draft' && (
                <div className="draft" data-testid="strengthen-draft">
                  <label className="label" htmlFor={`sd-${item.id}`}>
                    New image for {locus.name}
                  </label>
                  <textarea
                    id={`sd-${item.id}`}
                    className="field"
                    rows={3}
                    value={d.scene}
                    onChange={(e) => setDraft(item.id, { ...d, scene: e.target.value })}
                  />
                  <label className="label" htmlFor={`sg-${item.id}`}>
                    Glyphs (1 to 3 emoji)
                  </label>
                  <input id={`sg-${item.id}`} className="field" value={d.glyphs} onChange={(e) => setDraft(item.id, { ...d, glyphs: e.target.value })} />
                  {d.imago.reason && (
                    <p className="reason">
                      <span className="label">Why</span> {d.imago.reason}
                    </p>
                  )}
                  <p className="hint">Edit it until it is vivid to you, then keep it.</p>
                  <div className="actions">
                    <button type="button" className="btn" onClick={() => accept(item, d)} data-testid="strengthen-accept">
                      Use this image
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => setDraft(item.id, undefined)}>
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
            You walked a fixed route, left one fact at each place, then walked it again with the images hidden and answered
            before anything was shown. The palace is the encoding step.
          </p>
          <p>
            Two meta-analyses report medium-to-large gains in recall of ordered lists with the method of loci, and both warn
            of a high risk of bias in the underlying studies. Retrieval practice and spaced review have the stronger evidence,
            so they are the core of the loop.
          </p>
          <p>
            This score is same-session recall. Success is judged on delayed recall, so each item comes back for review at
            expanding intervals (Leitner boxes: 10 minutes, then 1, 3, 7 and 21 days). We have not run an efficacy study of
            Memoria.
          </p>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={() => startRecall(deck.id, 'all', judge)} data-testid="results-again">
          Recall again
        </button>
        <button type="button" className="btn" onClick={leave} data-testid="results-home">
          Back to palaces
        </button>
      </div>
    </section>
  );
}
