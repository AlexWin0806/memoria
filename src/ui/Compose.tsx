import { useEffect, useRef, useState } from 'react';
import { planPalace, planPalaceLocal, regenerateImago, type ArchitectPlan } from '@/ai/architect';
import type { Deck, Imago, ImagoAction, MemoryItem } from '@/core/types';
import { splitGlyphs } from '@/flows/answers';
import { DeadlineError, withDeadline } from '@/flows/deadline';
import { startEncode, useFlow } from '@/flows/flow';
import { plural } from '@/flows/format';
import { PLAN_TIMEOUT_MS, REGENERATE_TIMEOUT_MS } from '@/flows/timing';
import { getLayout } from '@/layouts';
import { useDecks } from '@/state/decks';
import { useSession } from '@/state/session';

const ACTIONS: ImagoAction[] = ['spin', 'bob', 'pulse', 'shake', 'orbit', 'swing', 'hop'];
const SOURCE_NOTE: Record<Imago['source'], string> = {
  architect: "The Architect's draft",
  fallback: 'Offline draft',
  fixture: 'Worked example',
  learner: 'Your image',
};

/** Paste content, read the Architect's proposal, edit it, and only then place it. */
export function Compose() {
  const layout = getLayout(useSession((s) => s.layoutId));
  const text = useFlow((s) => s.draftText);
  const others = useDecks((s) => s.decks);
  const [stage, setStage] = useState<'input' | 'planning' | 'proposal'>('input');
  const [plan, setPlan] = useState<ArchitectPlan | null>(null);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [title, setTitle] = useState('');
  const [glyphText, setGlyphText] = useState<Record<string, string>>({});
  // The source each image had when the Architect handed it over, to restore if "mine" is unticked.
  const [drafted, setDrafted] = useState<Record<string, Imago['source']>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The Architect ran out of time: offer to try again or to continue by hand.
  const [slow, setSlow] = useState(false);
  // The item whose Regenerate got no answer, so its row can say so.
  const [silent, setSilent] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Counts design attempts, so an answer that arrives after the learner moved on is dropped.
  const attempt = useRef(0);

  // A plan that resolves after the learner has left must not mark a draft as unsaved.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      useFlow.setState({ unsavedDraft: false });
    };
  }, []);
  useEffect(() => {
    if (stage === 'proposal') heading.current?.focus();
  }, [stage]);

  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const sameRoute = Object.values(others).filter((d) => d.layoutId === layout.id && !d.fixture);

  const request = () => ({ text, maxItems: layout.loci.length, rooms: layout.rooms, loci: layout.loci });

  const show = (p: ArchitectPlan) => {
    const order = new Map(layout.loci.map((l) => [l.id, l.index]));
    const sorted = [...p.items].sort((a, b) => (order.get(a.locusId) ?? 0) - (order.get(b.locusId) ?? 0));
    if (!sorted.length) {
      setError('There was nothing to place. Put one item on each line.');
      setStage('input');
      return;
    }
    setPlan(p);
    setItems(sorted);
    setTitle(p.title);
    setGlyphText(Object.fromEntries(sorted.map((it) => [it.id, it.imago.glyphs.join(' ')])));
    setDrafted(Object.fromEntries(sorted.map((it) => [it.id, it.imago.source])));
    useFlow.setState({ unsavedDraft: true });
    setStage('proposal');
  };

  const design = async () => {
    if (!text.trim()) return;
    const mine = ++attempt.current;
    setError('');
    setSlow(false);
    setStage('planning');
    try {
      const p = await withDeadline(planPalace(request()), PLAN_TIMEOUT_MS);
      if (alive.current && mine === attempt.current) show(p);
    } catch (e) {
      if (!alive.current || mine !== attempt.current) return;
      if (e instanceof DeadlineError) setSlow(true);
      else setError('The Architect could not make a plan from this text. Check it and try again.');
      setStage('input');
    }
  };

  /** No Architect: the built-in planner places each line, and the learner writes the images. */
  const byHand = () => {
    if (!text.trim()) return;
    attempt.current++;
    setError('');
    setSlow(false);
    show(planPalaceLocal(request()));
  };

  const patchItem = (id: string, patch: Partial<MemoryItem>) =>
    setItems((all) => all.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  // Any edit to the image makes it the learner's own.
  const patchImago = (id: string, patch: Partial<Imago>) =>
    setItems((all) => all.map((it) => (it.id === id ? { ...it, imago: { ...it.imago, source: 'learner', ...patch } } : it)));

  const regenerate = async (item: MemoryItem) => {
    const locus = layout.loci.find((l) => l.id === item.locusId);
    if (!locus) return;
    setBusy(item.id);
    setSilent(null);
    try {
      const imago = await withDeadline(
        regenerateImago({ item, locus, others: items.filter((o) => o.id !== item.id).map((o) => o.imago) }),
        REGENERATE_TIMEOUT_MS,
      );
      if (!alive.current) return;
      patchItem(item.id, { imago });
      setGlyphText((g) => ({ ...g, [item.id]: imago.glyphs.join(' ') }));
      setDrafted((d) => ({ ...d, [item.id]: imago.source }));
    } catch {
      // Keep the current image and say so; the learner can still edit it by hand.
      if (alive.current) setSilent(item.id);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const problems = items.filter((it) => !it.term.trim() || !it.imago.scene.trim() || it.imago.glyphs.length < 1).length;

  const place = () => {
    if (!plan || problems > 0) return;
    const deck: Deck = {
      id: `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim() || plan.title,
      kind: plan.kind,
      layoutId: layout.id,
      createdAt: Date.now(),
      items: items.map((it) => ({
        ...it,
        term: it.term.trim(),
        meaning: it.meaning?.trim() || undefined,
        imago: { ...it.imago, scene: it.imago.scene.trim() },
      })),
    };
    useDecks.getState().upsert(deck);
    useFlow.setState({ unsavedDraft: false, draftText: '' });
    startEncode(deck.id);
  };

  if (stage !== 'proposal' || !plan) {
    const planning = stage === 'planning';
    return (
      <section className="screen" data-testid="compose">
        <p className="label">Build a palace</p>
        <h2 className="question">What do you need to learn?</h2>
        <label className="body" htmlFor="compose-text">
          Paste a list, one item per line, or paste your notes.
        </label>
        <textarea
          id="compose-text"
          className="field field--tall"
          rows={9}
          autoFocus
          value={text}
          disabled={planning}
          onChange={(e) => useFlow.setState({ draftText: e.target.value })}
          placeholder={'Scaphoid - boat-shaped\nLunate: moon-shaped\nTriquetrum - three-cornered'}
          data-testid="compose-text"
        />
        <p className="hint">
          Formats: <code>term - meaning</code>, <code>term: meaning</code>, or one item per line. {layout.name} has{' '}
          {layout.loci.length} places and each place holds one fact.
        </p>
        {sameRoute.length > 0 && (
          <p className="notice">
            This route already holds {sameRoute.map((d) => `"${d.title}"`).join(', ')}. Reusing a route for a second list
            is thought to make the lists interfere (the evidence is mixed), so keep similar lists apart.
          </p>
        )}
        {error && (
          <p className="notice notice--danger" role="alert">
            {error}
          </p>
        )}
        {slow && (
          <p className="notice" role="alert" data-testid="compose-slow">
            The Architect has not answered after {Math.round(PLAN_TIMEOUT_MS / 1000)} seconds. Your text is safe. Try again,
            or continue by hand: each line gets a place and a plain draft, and you write the images yourself.
          </p>
        )}
        {planning ? (
          <>
            <div role="status" data-testid="compose-working">
              <p className="label">The Architect is working</p>
              <ol className="steps">
                <li>Reading {plural(lines, 'line')} of your text.</li>
                <li>
                  Choosing a place for each item along the {layout.loci.length} places of {layout.name}, related items in the
                  same room.
                </li>
                <li>Drafting one image per place, each tied to the meaning of its fact.</li>
              </ol>
              <p className="muted">This can take up to {Math.round(PLAN_TIMEOUT_MS / 1000)} seconds.</p>
            </div>
            <div className="actions">
              <button type="button" className="btn btn--quiet" onClick={byHand} data-testid="compose-by-hand">
                Do not wait: continue by hand
              </button>
            </div>
          </>
        ) : (
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={design} data-testid="compose-design">
              {slow ? 'Try again' : 'Design my palace'}
            </button>
            {slow && (
              <button type="button" className="btn" onClick={byHand} data-testid="compose-by-hand">
                Continue by hand
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="screen" data-testid="proposal">
      <p className="label">The Architect proposes</p>
      <h2 className="question" tabIndex={-1} ref={heading}>
        {plural(items.length, 'image')} for you to check
      </h2>
      <p className="body">
        Read each one. Change anything that is not vivid to you: an image you have reworked yourself is yours. Nothing is
        placed until you say so.
      </p>

      {plan.source === 'local' && (
        <p className="notice" data-testid="compose-local">
          This is an offline draft. The Architect could not be reached, so these images are plain placeholders. Rewrite each
          one in your own words before you walk.
        </p>
      )}
      {plan.overflow.length > 0 && (
        <p className="notice" data-testid="compose-overflow">
          These did not fit: {plan.overflow.join(', ')}. {layout.name} has {layout.loci.length} places and each place holds
          one fact. Put the rest in another palace later.
        </p>
      )}

      <div className="steps-block">
        <p className="label">What the Architect did</p>
        <ol className="steps" data-testid="compose-steps">
          {plan.steps.map((s, i) => (
            <li key={i}>
              <span className="label">{s.kind}</span> {s.label}
            </li>
          ))}
        </ol>
      </div>

      <label className="label" htmlFor="deck-title">
        Name of this palace
      </label>
      <input id="deck-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="compose-title" />

      <ol className="proposal">
        {items.map((it, n) => {
          const locus = layout.loci.find((l) => l.id === it.locusId);
          const room = layout.rooms.find((r) => r.id === locus?.roomId);
          const id = (name: string) => `${name}-${it.id}`;
          const mine = it.imago.source === 'learner';
          return (
            <li key={it.id} className="prop" data-testid="proposal-row">
              <p className="label">
                {n + 1} · {locus?.name ?? 'Unplaced'}
                {room ? ` · ${room.name}` : ''}
              </p>
              <div className="pair">
                <div>
                  <label className="sub" htmlFor={id('term')}>
                    Term
                  </label>
                  <input id={id('term')} className="field" value={it.term} onChange={(e) => patchItem(it.id, { term: e.target.value })} />
                </div>
                <div>
                  <label className="sub" htmlFor={id('meaning')}>
                    Meaning
                  </label>
                  <input
                    id={id('meaning')}
                    className="field"
                    value={it.meaning ?? ''}
                    onChange={(e) => patchItem(it.id, { meaning: e.target.value })}
                  />
                </div>
              </div>
              <label className="sub" htmlFor={id('scene')}>
                Image
              </label>
              <textarea
                id={id('scene')}
                className="field"
                rows={3}
                value={it.imago.scene}
                onChange={(e) => patchImago(it.id, { scene: e.target.value })}
              />
              <div className="pair">
                <div>
                  <label className="sub" htmlFor={id('glyphs')}>
                    Glyphs (1 to 3 emoji)
                  </label>
                  <input
                    id={id('glyphs')}
                    className="field"
                    value={glyphText[it.id] ?? ''}
                    aria-invalid={it.imago.glyphs.length < 1}
                    onChange={(e) => {
                      setGlyphText((g) => ({ ...g, [it.id]: e.target.value }));
                      patchImago(it.id, { glyphs: splitGlyphs(e.target.value) });
                    }}
                  />
                </div>
                <div>
                  <label className="sub" htmlFor={id('action')}>
                    Motion
                  </label>
                  <select id={id('action')} className="field" value={it.imago.action} onChange={(e) => patchImago(it.id, { action: e.target.value as ImagoAction })}>
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {it.imago.reason && (
                <p className="reason">
                  <span className="label">Why</span> {it.imago.reason}
                </p>
              )}
              <div className="prop__foot">
                <button type="button" className="link" disabled={busy !== null} onClick={() => regenerate(it)} data-testid="regenerate">
                  {busy === it.id ? 'Drawing another' : 'Regenerate'}
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={mine}
                    onChange={(e) =>
                      patchItem(it.id, {
                        imago: { ...it.imago, source: e.target.checked ? 'learner' : (drafted[it.id] ?? 'architect') },
                      })
                    }
                  />
                  This image is mine
                </label>
                <span className="muted">{SOURCE_NOTE[it.imago.source]}</span>
              </div>
              {silent === it.id && (
                <p className="notice" role="status" data-testid="regenerate-silent">
                  The Architect did not answer, so this image is unchanged. Edit it by hand, or try again in a while.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {problems > 0 && (
        <p className="notice notice--danger" role="alert">
          {plural(problems, 'image needs', 'images need')} a term, a scene and at least one glyph before it can be placed.
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={problems > 0} onClick={place} data-testid="compose-place">
          Place these in the palace
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => {
            useFlow.setState({ unsavedDraft: false });
            setStage('input');
          }}
        >
          Back to my text
        </button>
      </div>
    </section>
  );
}
