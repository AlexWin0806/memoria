import { useEffect, useMemo, useRef, useState } from 'react';
import { planPalace, planPalaceLocal, regenerateImago, type ArchitectPlan, type ArchitectRequest, type ArchitectStep } from '@/ai/architect';
import type { Deck, Imago, ImagoAction, MemoryItem } from '@/core/types';
import { emojiOnly } from '@/flows/answers';
import { DeadlineError, withDeadline } from '@/flows/deadline';
import { startEncode } from '@/flows/flow';
import { plural } from '@/flows/format';
import { cleanPaste, droppedNote, MIN_ITEMS, restLines } from '@/flows/paste';
import { isNoStrongerSuggestion, NO_MORE_OFFLINE } from '@/flows/suggest';
import { PLAN_TIMEOUT_MS, REGENERATE_TIMEOUT_MS } from '@/flows/timing';
import { getLayout } from '@/layouts';
import { useDecks } from '@/state/decks';
import { hasDraft, useDraft } from '@/state/draft';
import { useSession } from '@/state/session';
import { PdfUpload } from './PdfUpload';

const ACTIONS: ImagoAction[] = ['spin', 'bob', 'pulse', 'shake', 'orbit', 'swing', 'hop'];
const SOURCE_NOTE: Record<Imago['source'], string> = {
  architect: "The Architect's draft",
  fallback: 'Offline draft',
  fixture: 'Worked example',
  learner: 'Your image',
};

/**
 * The Architect may report each step as it works (`planPalace(req, { onStep })`). The
 * second argument is optional on both sides, so this also runs against a planner without it.
 */
const planWithSteps = planPalace as (req: ArchitectRequest, opts?: { onStep?: (step: ArchitectStep) => void }) => Promise<ArchitectPlan>;

const sameScene = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a card still lacks before it can be placed, in words. */
function missing(it: MemoryItem): string[] {
  return [!it.term.trim() && 'a term', !it.imago.scene.trim() && 'an image', it.imago.glyphs.length < 1 && 'a glyph'].filter(
    (m): m is string => Boolean(m),
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Paste content, read the Architect's proposal, edit it, and only then place it.
 * Everything typed here lives in the draft store (localStorage), so a reload returns to
 * the same step with the same text and edits. Only placing or "Discard draft" clears it.
 */
export function Compose() {
  const layout = getLayout(useSession((s) => s.layoutId));
  const draft = useDraft();
  const { text, stage, plan, items, title } = draft;
  const others = useDecks((s) => s.decks);
  const [planning, setPlanning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ArchitectStep[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The Architect ran out of time: offer to try again or to continue by hand.
  const [slow, setSlow] = useState(false);
  // The item whose Regenerate got no answer, and the one that has no new image left to offer.
  const [silent, setSilent] = useState<string | null>(null);
  const [spent, setSpent] = useState<{ id: string; offline: boolean } | null>(null);
  // The learner has reached the end of the list, by scrolling or by tabbing.
  const [readAll, setReadAll] = useState(false);
  // "Place" was pressed with incomplete cards: name them until they are fixed.
  const [checked, setChecked] = useState(false);
  // The first glyph field that had non-emoji typed into it; the note is shown there, once.
  const [emojiNote, setEmojiNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [discarding, setDiscarding] = useState(false);
  // What was already here when the screen opened is a draft from earlier: say so, quietly.
  const [restored, setRestored] = useState(() => hasDraft(useDraft.getState()));
  const heading = useRef<HTMLHeadingElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  // Counts design attempts, so an answer that arrives after the learner moved on is dropped.
  const attempt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    useDraft.getState().patch({ open: true });
    return () => {
      alive.current = false;
      useDraft.getState().patch({ open: false });
    };
  }, []);
  useEffect(() => {
    if (stage === 'proposal') heading.current?.focus();
  }, [stage]);
  // Reaching the end of the list by scrolling counts as having read it.
  useEffect(() => {
    const end = listEnd.current;
    if (stage !== 'proposal' || !end || readAll) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReadAll(true);
    });
    io.observe(end);
    return () => io.disconnect();
  }, [stage, readAll]);
  // The skip link does with one key what a mouse does with the scroll bar: it goes to the end
  // of the list, which is what unlocks the button, and puts the focus on it.
  const placeButton = useRef<HTMLButtonElement>(null);
  const skipToPlace = () => {
    setReadAll(true);
    setTimeout(() => {
      placeButton.current?.scrollIntoView({ block: 'nearest' });
      placeButton.current?.focus();
    }, 0);
  };

  const cleaned = useMemo(() => cleanPaste(text), [text]);
  const dropped = droppedNote(cleaned);
  const sameRoute = Object.values(others).filter((d) => d.layoutId === layout.id && !d.fixture);
  const places = layout.loci.length;

  const request = (): ArchitectRequest => ({ text: cleaned.text, maxItems: places, rooms: layout.rooms, loci: layout.loci });

  const show = (p: ArchitectPlan) => {
    const order = new Map(layout.loci.map((l) => [l.id, l.index]));
    const sorted = [...p.items].sort((a, b) => (order.get(a.locusId) ?? 0) - (order.get(b.locusId) ?? 0));
    if (sorted.length < MIN_ITEMS) {
      setError(
        sorted.length === 0
          ? 'There was nothing to place. Put one fact on each line.'
          : `A palace needs at least ${MIN_ITEMS} facts, or the recall walk is not a real test. This text gave ${sorted.length}. Add more, one per line.`,
      );
      return;
    }
    useDraft.getState().patch({
      stage: 'proposal',
      plan: { title: p.title, kind: p.kind, steps: p.steps, source: p.source, overflow: p.overflow },
      items: sorted,
      title: p.title,
      drafted: Object.fromEntries(sorted.map((it) => [it.id, it.imago.source])),
      shown: Object.fromEntries(sorted.map((it) => [it.id, [it.imago.scene]])),
      rest: restLines(cleaned.lines, p.overflow),
    });
    setReadAll(false);
    setChecked(false);
    setRestored(false);
  };

  const design = async () => {
    if (!cleaned.lines.length) return;
    const mine = ++attempt.current;
    setError('');
    setSlow(false);
    setLiveSteps([]);
    setPlanning(true);
    try {
      const onStep = (step: ArchitectStep) => {
        if (alive.current && mine === attempt.current) setLiveSteps((all) => [...all, step]);
      };
      const p = await withDeadline(planWithSteps(request(), { onStep }), PLAN_TIMEOUT_MS);
      if (alive.current && mine === attempt.current) show(p);
    } catch (e) {
      if (!alive.current || mine !== attempt.current) return;
      if (e instanceof DeadlineError) setSlow(true);
      else setError('The Architect could not make a plan from this text. Check it and try again.');
    } finally {
      if (alive.current && mine === attempt.current) setPlanning(false);
    }
  };

  /** No Architect: the built-in planner places each line, and the learner writes the images. */
  const byHand = () => {
    if (!cleaned.lines.length) return;
    attempt.current++;
    setError('');
    setSlow(false);
    setPlanning(false);
    show(planPalaceLocal(request()));
  };

  const { patchItem, patchImago } = draft;

  const regenerate = async (item: MemoryItem) => {
    const locus = layout.loci.find((l) => l.id === item.locusId);
    if (!locus) return;
    setBusy(item.id);
    setSilent(null);
    setSpent(null);
    try {
      const imago = await withDeadline(
        regenerateImago({ item, locus, others: items.filter((o) => o.id !== item.id).map((o) => o.imago) }),
        REGENERATE_TIMEOUT_MS,
      );
      if (!alive.current) return;
      const d = useDraft.getState();
      const seen = [...(d.shown[item.id] ?? []), item.imago.scene];
      // The planner had nothing stronger, or offered an image this card has already shown:
      // that is not a new image, so the card is left alone and says so instead of cycling.
      if (isNoStrongerSuggestion(imago) || seen.some((scene) => sameScene(scene, imago.scene))) {
        setSpent({ id: item.id, offline: imago.source !== 'architect' });
        return;
      }
      d.patchItem(item.id, { imago });
      d.patch({ shown: { ...d.shown, [item.id]: [...seen, imago.scene] }, drafted: { ...d.drafted, [item.id]: imago.source } });
    } catch {
      // Keep the current image and say so; the learner can still edit it by hand.
      if (alive.current) setSilent(item.id);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const incomplete = items.flatMap((it, n) => {
    const lacks = missing(it);
    const locus = layout.loci.find((l) => l.id === it.locusId);
    return lacks.length ? [{ id: it.id, label: `${n + 1} · ${locus?.name ?? 'Unplaced'} (needs ${lacks.join(' and ')})` }] : [];
  });

  const place = () => {
    if (!plan || !readAll) return;
    if (incomplete.length > 0) {
      setChecked(true);
      // Go to the first incomplete card and put the cursor in the field it lacks.
      const first = items.find((it) => it.id === incomplete[0].id);
      const field = !first ? '' : !first.term.trim() ? 'term' : !first.imago.scene.trim() ? 'scene' : 'glyphs';
      document.getElementById(`card-${incomplete[0].id}`)?.scrollIntoView({ block: 'start' });
      document.getElementById(`${field}-${incomplete[0].id}`)?.focus({ preventScroll: true });
      return;
    }
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
        imago: { ...it.imago, scene: it.imago.scene.trim(), reason: it.imago.reason?.trim() || undefined },
      })),
    };
    useDecks.getState().upsert(deck);
    useDraft.getState().discard();
    startEncode(deck.id);
  };

  const discard = () => {
    attempt.current++;
    useDraft.getState().discard();
    setDiscarding(false);
    setRestored(false);
    setPlanning(false);
    setError('');
    setSlow(false);
    setReadAll(false);
    setChecked(false);
  };

  const discardControl = discarding ? (
    <span className="confirm-inline" role="group" aria-label="Discard this draft?">
      <span className="muted">Discard this draft for good?</span>
      <button type="button" className="link link--danger" onClick={discard} data-testid="draft-discard-yes">
        Discard
      </button>
      <button type="button" className="link" autoFocus onClick={() => setDiscarding(false)}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" className="link" onClick={() => setDiscarding(true)} data-testid="draft-discard">
      Discard draft
    </button>
  );
  const restoredLine = restored && (
    <p className="muted" role="status" data-testid="draft-restored">
      Draft restored.
    </p>
  );

  if (stage !== 'proposal' || !plan) {
    const empty = cleaned.lines.length === 0;
    return (
      <section className="screen" data-testid="compose">
        <p className="label">Build a palace</p>
        <h1 className="question">What do you need to learn?</h1>
        {restoredLine}
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
          onChange={(e) => draft.patch({ text: e.target.value })}
          placeholder={'Scaphoid - boat-shaped\nLunate: moon-shaped\nTriquetrum - three-cornered'}
          data-testid="compose-text"
        />
        <PdfUpload target="compose-text" disabled={planning} />
        {dropped && (
          <p className="hint" role="status" data-testid="compose-dropped">
            {dropped}
          </p>
        )}
        <p className="hint">
          Formats: <code>term - meaning</code>, <code>term: meaning</code>, or one item per line. {layout.name} has {places}{' '}
          places and each place holds one fact; a palace needs at least {MIN_ITEMS}.
        </p>
        <p className="hint" data-testid="compose-limits">
          Best for ordered or discrete facts. It will not teach understanding.
        </p>
        {sameRoute.length > 0 && (
          <p className="notice">
            This route already holds {sameRoute.map((d) => `"${d.title}"`).join(', ')}. Reusing a route for a second list
            is thought to make the lists interfere (the evidence is mixed), so keep similar lists apart.
          </p>
        )}
        {error && (
          <p className="notice notice--danger" role="alert" data-testid="compose-error">
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
              {liveSteps.length > 0 ? (
                <ol className="steps">
                  {liveSteps.map((s, i) => (
                    <li key={i}>
                      <span className="label">{s.kind}</span> {s.label}
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="steps">
                  <li>Reading {plural(cleaned.lines.length, 'line')} of your text.</li>
                  <li>
                    Choosing a place for each item along the {places} places of {layout.name}, related items in the same
                    room.
                  </li>
                  <li>Drafting one image per place, each tied to the meaning of its fact.</li>
                </ol>
              )}
              <p className="muted">This can take up to {Math.round(PLAN_TIMEOUT_MS / 1000)} seconds.</p>
            </div>
            <div className="actions">
              <button type="button" className="btn btn--quiet" onClick={byHand} data-testid="compose-by-hand">
                Do not wait: continue by hand
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="actions">
              <button type="button" className="btn btn--primary" disabled={empty} onClick={design} data-testid="compose-design">
                {slow ? 'Try again' : plan ? 'Design again' : 'Design my palace'}
              </button>
              {slow && (
                <button type="button" className="btn" onClick={byHand} data-testid="compose-by-hand">
                  Continue by hand
                </button>
              )}
              {plan && (
                <button type="button" className="btn" onClick={() => draft.patch({ stage: 'proposal' })} data-testid="compose-back-to-images">
                  Back to my {plural(items.length, 'image')}
                </button>
              )}
            </div>
            {empty && (
              <p className="hint" data-testid="compose-empty-note">
                {text.trim() ? 'These lines hold no words, so there is nothing to place yet.' : 'Nothing to place yet.'} Type at
                least {MIN_ITEMS} facts, one per line.
              </p>
            )}
            {plan && <p className="hint">Designing again replaces the images you have edited.</p>}
            {hasDraft({ text, plan }) && <p className="draft-tools">{discardControl}</p>}
          </>
        )}
      </section>
    );
  }

  const offline = plan.source === 'local';
  return (
    <section className="screen" data-testid="proposal">
      <p className="label">{offline ? 'The offline planner proposes' : 'The Architect proposes'}</p>
      <h1 className="question" tabIndex={-1} ref={heading}>
        {plural(items.length, 'image')} for you to check
      </h1>
      {restoredLine}
      <p className="body">
        Read each one. Change anything that is not vivid to you: an image you have reworked yourself is yours. Nothing is
        placed until you say so.
      </p>

      {offline && (
        <p className="notice" data-testid="compose-local">
          This is an offline draft. The Architect could not be reached, so these images are plain placeholders. Rewrite each
          one in your own words before you walk.
        </p>
      )}
      {dropped && (
        <p className="hint" data-testid="compose-dropped">
          {dropped}
        </p>
      )}
      {plan.overflow.length > 0 && (
        <div className="notice" data-testid="compose-overflow">
          <p>
            This palace has {places} places and each place holds one fact. The remaining {plural(plan.overflow.length, 'fact')}{' '}
            {plan.overflow.length === 1 ? 'is' : 'are'} listed here:
          </p>
          <ol className="rest" start={items.length + 1}>
            {draft.rest.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p data-testid="compose-one-route">
            Memoria has one palace today. Learn this set until it is solid before you put another on the same route: two half-learned
            lists on one route interfere.
          </p>
          <p>
            <button
              type="button"
              className="link"
              onClick={async () => setCopied((await copyText(draft.rest.join('\n'))) ? 'yes' : 'no')}
              data-testid="compose-copy-rest"
            >
              Copy the rest
            </button>{' '}
            <span className="muted" role="status">
              {copied === 'yes' ? 'Copied.' : copied === 'no' ? 'Could not reach the clipboard. Select the list and copy it by hand.' : ''}
            </span>
          </p>
        </div>
      )}

      <div className="steps-block">
        <p className="label" data-testid="compose-steps-head">
          {offline ? 'What the offline planner did' : 'What the Architect did'}
        </p>
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
      <input id="deck-title" className="field" value={title} onChange={(e) => draft.patch({ title: e.target.value })} data-testid="compose-title" />

      <p className="skip">
        <button type="button" className="link" onClick={skipToPlace} data-testid="compose-skip">
          Skip to the place button
        </button>
      </p>
      <ol className="proposal">
        {items.map((it, n) => {
          const locus = layout.loci.find((l) => l.id === it.locusId);
          const room = layout.rooms.find((r) => r.id === locus?.roomId);
          const id = (name: string) => `${name}-${it.id}`;
          const mine = it.imago.source === 'learner';
          const flag = checked && missing(it).length > 0;
          return (
            <li
              key={it.id}
              id={`card-${it.id}`}
              className="prop"
              data-state={flag ? 'incomplete' : undefined}
              data-testid="proposal-row"
              // Tabbing into the last card counts as having read to the end.
              onFocus={n === items.length - 1 ? () => setReadAll(true) : undefined}
            >
              <p className="label">
                {n + 1} · {locus?.name ?? 'Unplaced'}
                {room ? ` · ${room.name}` : ''}
              </p>
              <div className="pair">
                <div>
                  <label className="sub" htmlFor={id('term')}>
                    Term
                  </label>
                  <input
                    id={id('term')}
                    className="field"
                    value={it.term}
                    aria-invalid={checked && !it.term.trim()}
                    onChange={(e) => patchItem(it.id, { term: e.target.value })}
                    data-testid="prop-term"
                  />
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
                aria-invalid={checked && !it.imago.scene.trim()}
                onChange={(e) => patchImago(it.id, { scene: e.target.value })}
                data-testid="prop-scene"
              />
              <label className="sub" htmlFor={id('reason')}>
                Why it fits the meaning (one line)
              </label>
              <input
                id={id('reason')}
                className="field"
                value={it.imago.reason ?? ''}
                onChange={(e) => patchImago(it.id, { reason: e.target.value })}
                data-testid="prop-reason"
              />
              <div className="pair">
                <div>
                  <label className="sub" htmlFor={id('glyphs')}>
                    Glyphs (1 to 3 emoji)
                  </label>
                  <input
                    id={id('glyphs')}
                    className="field"
                    value={it.imago.glyphs.join(' ')}
                    aria-invalid={checked && it.imago.glyphs.length < 1}
                    aria-describedby={emojiNote === it.id ? id('glyph-note') : undefined}
                    onChange={(e) => {
                      const { glyphs, stripped } = emojiOnly(e.target.value);
                      if (stripped && emojiNote === null) setEmojiNote(it.id);
                      patchImago(it.id, { glyphs });
                    }}
                    data-testid="prop-glyphs"
                  />
                  {emojiNote === it.id && (
                    <p id={id('glyph-note')} className="sub" role="status" data-testid="glyph-note">
                      Emoji only: letters and other characters are left out.
                    </p>
                  )}
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
                        imago: { ...it.imago, source: e.target.checked ? 'learner' : (draft.drafted[it.id] ?? 'architect') },
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
              {spent?.id === it.id && (
                <p className="notice" role="status" data-testid="regenerate-spent">
                  {spent.offline ? NO_MORE_OFFLINE : 'The Architect offered an image you have already seen. Rewrite it in your own words.'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div ref={listEnd} data-testid="proposal-end" />

      <div className="dock" data-testid="compose-dock">
        {checked && incomplete.length > 0 && (
          <p className="notice notice--danger" role="alert" data-testid="compose-problems">
            Not placed yet. {incomplete.length === 1 ? 'This card is' : 'These cards are'} incomplete:{' '}
            {incomplete.map((c) => c.label).join('; ')}.
          </p>
        )}
        {!readAll && (
          <p className="hint" data-testid="compose-unread">
            Read to the end of the list first: {plural(items.length, 'image')}.
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={placeButton} disabled={!readAll} onClick={place} data-testid="compose-place">
            I have read these: place them in the palace
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => draft.patch({ stage: 'input' })} data-testid="compose-back">
            Back to my text
          </button>
        </div>
        <p className="draft-tools">{discardControl}</p>
      </div>
    </section>
  );
}
