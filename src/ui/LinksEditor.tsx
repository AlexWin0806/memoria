import { useRef, useState, type ReactNode } from 'react';
import type { ItemLink, LinkKind } from '@/core/types';
import { plural } from '@/flows/format';
import { LINK_KIND_NOTE, LINK_KINDS, linkInWords, samePair } from './palaceWords';

/** A label on a link is a few words (the Architect's own rule). */
const LABEL_WORDS = 4;
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

export interface LinkEnd {
  id: string;
  term: string;
  /** Already in the palace (adding to a palace): shown as such in the menus. */
  standing?: boolean;
}

/**
 * "How these connect": the links between facts, each in words, each removable, and a small
 * form to add one. It shows how the notes are organised and nothing more; whether links help
 * anyone remember has not been tested (docs/research.md 8.5), so nothing here says they do.
 */
export function LinksEditor({
  links,
  ends,
  onChange,
  taken = [],
  fresh,
  max,
  children,
}: {
  links: ItemLink[];
  /** Every item a link may join, in walking order. */
  ends: LinkEnd[];
  onChange: (links: ItemLink[]) => void;
  /** Links the palace already has: the same two items are not linked again. */
  taken?: readonly ItemLink[];
  /** Adding to a palace: a new link must touch one of these (the new items). */
  fresh?: ReadonlySet<string>;
  /** The most links the palace keeps. */
  max: number;
  /** Said under the heading. */
  children?: ReactNode;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<LinkKind>('becomes');
  const [label, setLabel] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const status = useRef<HTMLParagraphElement>(null);
  const termOf = (id: string) => ends.find((e) => e.id === id)?.term.trim() || 'a fact with no term';
  const option = (e: LinkEnd) => `${e.term.trim() || 'No term yet'}${e.standing ? ' (already in the palace)' : ''}`;

  const add = () => {
    setSaid('');
    const link: ItemLink = { from, to, kind, ...(label.trim() ? { label: label.trim().replace(/\s+/g, ' ') } : {}) };
    const fail = (message: string) => setProblem(message);
    if (!from || !to) return fail('Choose the two facts to link.');
    if (from === to) return fail('A fact cannot be linked to itself.');
    if (words(label) > LABEL_WORDS) return fail(`The label is ${words(label)} words. Keep it to ${LABEL_WORDS} or fewer.`);
    if ([...links, ...taken].some((l) => samePair(l, link))) return fail('These two facts are already linked. Remove that link first to change it.');
    if (fresh && !fresh.has(from) && !fresh.has(to)) return fail('A link added here joins a new fact to another fact. These two are both already in the palace.');
    if (links.length + taken.length >= max) return fail(`This palace keeps at most ${plural(max, 'link')}. Remove one first.`);
    onChange([...links, link]);
    setProblem('');
    setSaid(`Added: ${linkInWords(link, termOf)}.`);
    setLabel('');
  };

  const remove = (link: ItemLink) => {
    onChange(links.filter((l) => l !== link));
    setProblem('');
    setSaid(`Removed: ${linkInWords(link, termOf)}.`);
    // The button that had the focus is gone: the line that says what happened takes it.
    status.current?.focus();
  };

  return (
    <section className="links" aria-labelledby="links-h" data-testid="links">
      <h2 id="links-h" className="label">
        How these connect
      </h2>
      {children}
      {links.length === 0 ? (
        <p className="muted" data-testid="links-none">
          No links.
        </p>
      ) : (
        <ul className="links__list">
          {links.map((link) => {
            const text = linkInWords(link, termOf);
            return (
              <li key={`${link.from}>${link.to}`} className="links__row" data-testid="link-row" data-kind={link.kind}>
                <span className="links__words">{text}</span>
                <button type="button" className="link" onClick={() => remove(link)} aria-label={`Remove the link: ${text}`} data-testid="link-remove">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="links__said" role="status" tabIndex={-1} ref={status} data-testid="links-status">
        {said}
      </p>
      <fieldset className="links__add" data-testid="link-add">
        <legend className="sub">Add a link</legend>
        <div className="links__form">
          <div>
            <label className="sub" htmlFor="link-from">
              From
            </label>
            <select id="link-from" className="field" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="link-from">
              <option value="">Choose a fact</option>
              {ends.map((e) => (
                <option key={e.id} value={e.id}>
                  {option(e)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sub" htmlFor="link-kind">
              How
            </label>
            <select id="link-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)} data-testid="link-kind">
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LINK_KIND_NOTE[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sub" htmlFor="link-to">
              To
            </label>
            <select id="link-to" className="field" value={to} onChange={(e) => setTo(e.target.value)} data-testid="link-to">
              <option value="">Choose a fact</option>
              {ends.map((e) => (
                <option key={e.id} value={e.id}>
                  {option(e)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sub" htmlFor="link-label">
              Label (optional, up to {LABEL_WORDS} words)
            </label>
            <input
              id="link-label"
              className="field"
              value={label}
              maxLength={60}
              aria-invalid={words(label) > LABEL_WORDS}
              onChange={(e) => setLabel(e.target.value)}
              // Enter in the one text field of the form adds the link, as a form would.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              data-testid="link-label"
            />
          </div>
        </div>
        {problem && (
          <p className="notice notice--danger" role="alert" data-testid="link-problem">
            {problem}
          </p>
        )}
        <button type="button" className="btn btn--quiet" onClick={add} data-testid="link-add-button">
          Add this link
        </button>
      </fieldset>
    </section>
  );
}
