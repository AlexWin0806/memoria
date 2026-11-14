import { useEffect, useId, useRef, useState } from 'react';
import { plural } from '@/flows/format';
import {
  ARCHITECT_MAX_CHARS,
  extractPdfText,
  firstPagesThatFit,
  pagesText,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  type PdfExtract,
  type PdfPageText,
} from '@/flows/pdf';
import { MAX_PLACES } from '@/layouts/spec';
import { useDraft } from '@/state/draft';
import './pdf.css';

const count = (n: number): string => n.toLocaleString('en-US');
const characters = (n: number): string => `${count(n)} ${n === 1 ? 'character' : 'characters'}`;
const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string; done: number; total: number }
  | { kind: 'choose'; name: string; pdf: PdfExtract; chosen: number[]; replaces: boolean }
  | { kind: 'done'; line: string }
  | { kind: 'error'; message: string };

/** "lecture-4.pdf: 9 pages, 7,480 characters." and what else was done to it. */
function readLine(name: string, pdf: PdfExtract, used: PdfPageText[]): string {
  const withText = pdf.pages.length - pdf.emptyPages;
  const chars = pagesText(used).length;
  const headings = used.reduce((n, p) => n + p.headings, 0);
  const which = used.length === withText ? plural(pdf.pages.length, 'page') : `${used.length} of ${plural(pdf.pages.length, 'page')}`;
  return [
    `${name}: ${which}, ${characters(chars)}.`,
    headings > 0 ? `${plural(headings, 'heading')} marked with #.` : '',
    pdf.emptyPages > 0 ? `${plural(pdf.emptyPages, 'page')} had no text and ${pdf.emptyPages === 1 ? 'was' : 'were'} left out.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * "Upload a PDF", next to the notes box. The PDF is read on this page (src/flows/pdf.ts) and
 * its text becomes the notes: it goes into the same draft the textarea writes to, so it can
 * be edited and survives a reload like pasted text.
 *
 * `target` is the id of the notes box. A PDF dropped on that element is read too, which is
 * why this component, not Compose, listens there: one mount point, nothing else to wire.
 */
export function PdfUpload({ target, disabled = false }: { target: string; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const legend = useRef<HTMLLegendElement>(null);
  const reading = useRef<AbortController | null>(null);
  const blocked = useRef(disabled);
  const id = useId();

  useEffect(() => {
    blocked.current = disabled;
    // The Architect has started on the text as it stands: a reading still under way would change it under its feet.
    if (disabled) reading.current?.abort();
  }, [disabled]);
  // Leaving the screen stops a reading in progress.
  useEffect(() => () => reading.current?.abort(), []);
  // The page chooser takes the focus when it opens, and gives it back to the button when it closes.
  const choosing = phase.kind === 'choose';
  const wasChoosing = useRef(false);
  useEffect(() => {
    if (choosing) legend.current?.focus();
    else if (wasChoosing.current) button.current?.focus();
    wasChoosing.current = choosing;
  }, [choosing]);

  /** The chosen pages become the notes: the same draft text the notes box edits. */
  const put = (name: string, pdf: PdfExtract, used: PdfPageText[]): Phase => {
    useDraft.getState().patch({ text: pagesText(used) });
    return { kind: 'done', line: readLine(name, pdf, used) };
  };

  const read = async (file: File) => {
    reading.current?.abort();
    const mine = new AbortController();
    reading.current = mine;
    setPhase({ kind: 'reading', name: file.name, done: 0, total: 0 });
    const result = await extractPdfText(file, {
      signal: mine.signal,
      onProgress: (done, total) => {
        if (reading.current === mine) setPhase({ kind: 'reading', name: file.name, done, total });
      },
    });
    if (reading.current !== mine) return;
    reading.current = null;
    if (!result.ok) {
      setPhase(result.error === 'cancelled' ? { kind: 'done', line: result.message } : { kind: 'error', message: result.message });
      return;
    }
    const { pdf } = result;
    const replaces = useDraft.getState().text.trim() !== '';
    // Nothing is cut off and nothing typed is overwritten without the learner saying so.
    if (pdf.chars > ARCHITECT_MAX_CHARS || replaces) {
      setPhase({ kind: 'choose', name: file.name, pdf, chosen: firstPagesThatFit(pdf.pages, ARCHITECT_MAX_CHARS), replaces });
      return;
    }
    setPhase(
      put(
        file.name,
        pdf,
        pdf.pages.filter((p) => p.text),
      ),
    );
  };

  const take = (files: FileList | null | undefined) => {
    if (!files?.length || blocked.current) return;
    if (files.length > 1) {
      setPhase({ kind: 'error', message: 'One PDF at a time: choose the one to read.' });
      return;
    }
    void read(files[0]);
  };
  // The listeners below are attached once; they reach the current `take` through this ref.
  const onFiles = useRef(take);
  useEffect(() => {
    onFiles.current = take;
  });

  // A PDF dropped on the notes box is read. A file dropped anywhere else on the page would
  // make the browser open it in place of the app, so that is stopped while this is on screen.
  useEffect(() => {
    const box = document.getElementById(target);
    const mark = (on: boolean) => {
      if (on) box?.setAttribute('data-pdf-drop', 'over');
      else box?.removeAttribute('data-pdf-drop');
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const onBox = box !== null && e.target instanceof Node && box.contains(e.target);
      if (e.dataTransfer) e.dataTransfer.dropEffect = onBox && !blocked.current ? 'copy' : 'none';
      mark(onBox && !blocked.current);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      mark(false);
      if (box !== null && e.target instanceof Node && box.contains(e.target)) onFiles.current(e.dataTransfer?.files);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) mark(false);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragleave', leave);
      mark(false);
    };
  }, [target]);

  const isReading = phase.kind === 'reading';
  const press = () => {
    if (isReading) reading.current?.abort();
    else input.current?.click();
  };

  let chooser = null;
  if (phase.kind === 'choose') {
    const { name, pdf, chosen, replaces } = phase;
    const used = pdf.pages.filter((p) => chosen.includes(p.page));
    const total = pagesText(used).length;
    const over = total > ARCHITECT_MAX_CHARS;
    const tooLong = pdf.chars > ARCHITECT_MAX_CHARS;
    const toggle = (page: number, on: boolean) =>
      setPhase({ ...phase, chosen: on ? [...chosen, page].sort((a, b) => a - b) : chosen.filter((n) => n !== page) });
    chooser = (
      <fieldset className="pdf__choose" data-testid="pdf-choose">
        <legend className="label" tabIndex={-1} ref={legend}>
          {tooLong ? 'Choose the pages to use' : 'Use this PDF?'}
        </legend>
        <p className="body" data-testid="pdf-choose-why">
          {name} has {characters(pdf.chars)} on {plural(pdf.pages.length, 'page')}.{' '}
          {tooLong
            ? `The Architect reads up to ${count(ARCHITECT_MAX_CHARS)} characters at a time, so nothing is cut off here: you choose the pages. A palace holds up to ${MAX_PLACES} facts, so one chapter at a time works best.`
            : ''}
          {replaces ? ' The notes box already holds text. Using the PDF replaces it.' : ''}
        </p>
        <ol className="pdf__pages">
          {pdf.pages.map((p) => {
            const alone = p.chars > ARCHITECT_MAX_CHARS;
            return (
              <li key={p.page}>
                <label className="check" htmlFor={`${id}-p${p.page}`}>
                  <input
                    id={`${id}-p${p.page}`}
                    type="checkbox"
                    checked={chosen.includes(p.page)}
                    disabled={!p.text || alone}
                    onChange={(e) => toggle(p.page, e.target.checked)}
                    data-testid="pdf-page"
                  />
                  <span>
                    Page {p.page}:{' '}
                    <span className="pdf__count">
                      {!p.text
                        ? 'no text: a picture of a page'
                        : alone
                          ? `${characters(p.chars)}: too long on its own. Paste the part you need instead.`
                          : characters(p.chars)}
                    </span>
                  </span>
                </label>
                {p.text && <span className="pdf__peek">{p.text.split('\n')[0].replace(/^# /, '')}</span>}
              </li>
            );
          })}
        </ol>
        {/* Pinned like the buttons of a walk: the total and the buttons stay in view however many pages there are. */}
        <div className="pin pdf__pin">
          <p className={over ? 'notice notice--danger' : 'notice'} role="status" data-testid="pdf-total" data-over={over ? 'true' : 'false'}>
            Chosen: {plural(used.length, 'page')}, {count(total)} of {count(ARCHITECT_MAX_CHARS)} characters.
            {over ? ' That is over the limit: untick a page.' : ''}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={disabled || over || used.length === 0}
              onClick={() => setPhase(put(name, pdf, used))}
              data-testid="pdf-use"
            >
              {replaces ? 'Replace my notes with these pages' : 'Use these pages'}
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => setPhase({ kind: 'done', line: 'Nothing was read into your notes.' })}
              data-testid="pdf-choose-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <div className="pdf" data-testid="pdf-upload" data-phase={phase.kind}>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        tabIndex={-1}
        onChange={(e) => {
          take(e.target.files);
          // So that choosing the same file again is a change.
          e.target.value = '';
        }}
        data-testid="pdf-input"
      />
      {!chooser && (
        <p className="pdf__row">
          {/* One button for both, so the focus stays put when reading starts and stops. */}
          <button type="button" className="btn btn--quiet" ref={button} disabled={disabled} onClick={press} data-testid="pdf-button">
            {isReading ? 'Stop reading' : 'Upload a PDF'}
          </button>
          {isReading ? (
            <span data-testid="pdf-progress">
              Reading {phase.name}
              {phase.total > 0 ? `: page ${phase.done} of ${phase.total}` : ''}
            </span>
          ) : (
            <span className="pdf__or">or drop one onto the notes box</span>
          )}
        </p>
      )}
      {isReading && (
        <div
          className="bar"
          role="progressbar"
          aria-label="Pages read"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, phase.total)}
          aria-valuenow={phase.done}
        >
          <div className="bar__fill" style={{ width: `${phase.total > 0 ? (100 * phase.done) / phase.total : 0}%` }} />
        </div>
      )}
      {chooser}
      {/* Said once when reading starts and once when it ends; the page counter above is not announced page by page. */}
      <p className="pdf__status" role="status" aria-live="polite" data-heard-only={isReading ? 'true' : undefined} data-testid="pdf-status">
        {isReading ? `Reading ${phase.name}.` : phase.kind === 'done' ? phase.line : ''}
      </p>
      {phase.kind === 'error' && (
        <p className="notice notice--danger" role="alert" data-testid="pdf-error">
          {phase.message}
        </p>
      )}
      <p className="hint" data-testid="pdf-note">
        PDFs of up to {Math.round(PDF_MAX_BYTES / (1024 * 1024))} MB and {PDF_MAX_PAGES} pages. Your PDF is read in this browser. Only the text
        you keep is sent to the Architect.
      </p>
    </div>
  );
}
