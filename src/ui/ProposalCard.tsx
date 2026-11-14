import type { Imago, ImagoAction, MemoryItem } from '@/core/types';
import { emojiOnly } from '@/flows/answers';
import { NO_MORE_OFFLINE } from '@/flows/suggest';
import { useDraft } from '@/state/draft';

const ACTIONS: ImagoAction[] = ['spin', 'bob', 'pulse', 'shake', 'orbit', 'swing', 'hop'];
const SOURCE_NOTE: Record<Imago['source'], string> = {
  architect: "The Architect's draft",
  fallback: 'Offline draft',
  fixture: 'Worked example',
  learner: 'Your image',
};

/** What a card still lacks before it can be placed, in words. */
export function missing(it: MemoryItem): string[] {
  return [!it.term.trim() && 'a term', !it.imago.scene.trim() && 'an image', it.imago.glyphs.length < 1 && 'a glyph'].filter(
    (m): m is string => Boolean(m),
  );
}

/** What Regenerate last said about a card. */
export type RegenerateNote = 'silent' | 'spent-offline' | 'spent-architect';

/**
 * One proposed image, for the learner to accept as it is, edit or have drawn again. Every
 * field writes straight to the Compose draft, so nothing typed here is lost to a reload.
 */
export function ProposalCard({
  item: it,
  number,
  place,
  checked,
  low,
  drawing,
  busy,
  anyBusy,
  note,
  emojiNote,
  onEmojiStripped,
  onRegenerate,
  onFocus,
}: {
  item: MemoryItem;
  /** Position on the route (or among the items being added), from 1. */
  number: number;
  /** The name of the place it sits at. */
  place: string;
  /** "Place" was pressed with incomplete cards: name what this one lacks. */
  checked: boolean;
  /** The plan flagged this image as a generic stand-in. */
  low: boolean;
  /** The Architect is still drawing the room this card is in: what it shows is an offline draft for now. */
  drawing: boolean;
  busy: boolean;
  anyBusy: boolean;
  note: RegenerateNote | null;
  /** The "emoji only" note is shown on this card. */
  emojiNote: boolean;
  onEmojiStripped: () => void;
  onRegenerate: () => void;
  onFocus?: () => void;
}) {
  const { patchItem, patchImago } = useDraft.getState();
  const drafted = useDraft((d) => d.drafted[it.id]);
  const id = (name: string) => `${name}-${it.id}`;
  const mine = it.imago.source === 'learner';
  const flag = checked && missing(it).length > 0;
  return (
    <li id={`card-${it.id}`} className="prop" data-state={flag ? 'incomplete' : undefined} data-drawing={drawing ? 'true' : undefined} data-testid="proposal-row" onFocus={onFocus}>
      <p className="label">
        {number} · {place}
      </p>
      {drawing && (
        <p className="prop__flag" data-testid="prop-drawing">
          Draft: the Architect is still drawing this room.
        </p>
      )}
      {low && !drawing && (
        <p className="prop__flag" data-testid="prop-low">
          Needs a better picture: this one is a plain stand-in. Rewrite it, or ask for another.
        </p>
      )}
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
          <input id={id('meaning')} className="field" value={it.meaning ?? ''} onChange={(e) => patchItem(it.id, { meaning: e.target.value })} />
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
      <input id={id('reason')} className="field" value={it.imago.reason ?? ''} onChange={(e) => patchImago(it.id, { reason: e.target.value })} data-testid="prop-reason" />
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
            aria-describedby={emojiNote ? id('glyph-note') : undefined}
            onChange={(e) => {
              const { glyphs, stripped } = emojiOnly(e.target.value);
              if (stripped) onEmojiStripped();
              patchImago(it.id, { glyphs });
            }}
            data-testid="prop-glyphs"
          />
          {emojiNote && (
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
        <button type="button" className="link" disabled={anyBusy || drawing} onClick={onRegenerate} data-testid="regenerate">
          {busy ? 'Drawing another' : 'Regenerate'}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => patchItem(it.id, { imago: { ...it.imago, source: e.target.checked ? 'learner' : (drafted ?? 'architect') } })}
          />
          This image is mine
        </label>
        <span className="muted">{SOURCE_NOTE[it.imago.source]}</span>
      </div>
      {note === 'silent' && (
        <p className="notice" role="status" data-testid="regenerate-silent">
          The Architect did not answer, so this image is unchanged. Edit it by hand, or try again in a while.
        </p>
      )}
      {(note === 'spent-offline' || note === 'spent-architect') && (
        <p className="notice" role="status" data-testid="regenerate-spent">
          {note === 'spent-offline' ? NO_MORE_OFFLINE : 'The Architect offered an image you have already seen. Rewrite it in your own words.'}
        </p>
      )}
    </li>
  );
}
