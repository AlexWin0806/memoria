import { useEffect, useRef, useState } from 'react';
import { formatDuration, plural } from '@/flows/format';
import { LIST_NAME, beginRun, canSwapLists, clearAll, closeCompare, mean, palaceListOf, toCsv, toIntro, useAb, type Order, type PalaceList } from './store';

const ORDER_TEXT: Record<Order, string> = { 'list-first': 'list first', 'palace-first': 'palace first' };
/** Table cell: which list was walked in the palace. */
const PALACE_TEXT: Record<PalaceList, string> = { carpals: 'carpal bones', krebs: 'citric acid cycle' };
const otherList = (p: PalaceList): PalaceList => (p === 'carpals' ? 'krebs' : 'carpals');

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * This participant's two scores (when a run has just finished), then every participant
 * recorded on this device with the two means, and the caveat that has to travel with them.
 */
export function CompareResults() {
  const rows = useAb((s) => s.rows);
  const lastId = useAb((s) => s.lastId);
  const studyMs = useAb((s) => s.studyMs);
  const mine = rows.find((r) => r.id === lastId);
  const [csv, setCsv] = useState<{ text: string; copied: boolean } | null>(null);
  const [clearing, setClearing] = useState(false);
  const n = rows.length;
  const listMean = mean(rows.map((r) => r.list.score));
  const palaceMean = mean(rows.map((r) => r.palace.score));
  // Which list this participant walked, and how the group divides between the two.
  const walked = mine ? palaceListOf(mine) : null;
  const withCarpals = rows.filter((r) => palaceListOf(r) === 'carpals').length;
  const swaps = canSwapLists() || withCarpals < n;

  // Focus starts on the heading, not on a button: a participant still pressing keys after
  // the last question must not start the next run before reading the result.
  const top = useRef<HTMLParagraphElement>(null);
  useEffect(() => top.current?.focus(), []);

  const copy = async () => {
    const text = toCsv(rows);
    setCsv({ text, copied: await copyText(text) });
  };

  return (
    <section className="screen" data-testid="ab-results">
      <p className="label" ref={top} tabIndex={-1} data-testid="ab-results-title">
        {mine ? `Result · Participant ${rows.indexOf(mine) + 1}` : 'Results so far'}
      </p>
      {mine && (
        <>
          <div className="ab-pair">
            <div className="ab-pair__arm" data-testid="ab-result-list">
              <p className="label">Plain list</p>
              <p className="score" data-testid="ab-score-list">
                {mine.list.score} of 8
              </p>
              <p className="muted">Answered in {formatDuration(mine.list.ms)}</p>
            </div>
            <div className="ab-pair__arm" data-testid="ab-result-palace">
              <p className="label">Palace</p>
              <p className="score" data-testid="ab-score-palace">
                {mine.palace.score} of 8
              </p>
              <p className="muted">Answered in {formatDuration(mine.palace.ms)}</p>
            </div>
          </div>
          <p className="body" data-testid="ab-order" data-order={mine.order}>
            This participant did the {mine.order === 'list-first' ? 'plain list first, then the palace' : 'palace first, then the plain list'}.{' '}
            <span data-testid="ab-material" data-palace={palaceListOf(mine)}>
              The plain list was {LIST_NAME[otherList(palaceListOf(mine))]}; the palace held {LIST_NAME[palaceListOf(mine)]}.
            </span>
            {studyMs.list !== undefined && studyMs.palace !== undefined && (
              <span data-testid="ab-study" data-list-ms={studyMs.list} data-palace-ms={studyMs.palace}>
                {' '}
                Study time: {formatDuration(studyMs.list)} for the list, {formatDuration(studyMs.palace)} for the walk. Answering time leaves
                out the camera&rsquo;s travel between places.
              </span>
            )}
          </p>
        </>
      )}

      <div className="note" data-testid="ab-caveat">
        <p>
          Read these numbers as an anecdote. The comparison is informal: each arm uses a different list
          {walked ? ` (for this participant, ${LIST_NAME[otherList(walked)]} as a plain list and ${LIST_NAME[walked]} in the palace)` : ''}.{' '}
          {swaps
            ? `Which list goes to the palace is swapped between participants, and only with equal numbers of each do the two lists even out: so far ${withCarpals} had the carpal bones in the palace and ${n - withCarpals} the citric acid cycle.`
            : 'Everyone so far had the citric acid cycle as a plain list and the carpal bones in the palace, so a difference between the arms cannot be told apart from a difference between the lists.'}{' '}
          Recall is tested in the same sitting, seconds after study, and n so far = {n}. It is not a study of Memoria&rsquo;s efficacy.
        </p>
      </div>

      <h3 className="label ab-table__title">Everyone recorded on this device</h3>
      {n === 0 ? (
        <p className="muted" data-testid="ab-empty">
          Nobody yet.
        </p>
      ) : (
        <table className="ab-table" data-testid="ab-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Order</th>
              <th scope="col">In the palace</th>
              <th scope="col" className="ab-table__num">
                List
              </th>
              <th scope="col" className="ab-table__num">
                Palace
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} data-testid="ab-row" data-current={r.id === lastId ? 'true' : undefined}>
                <td>{i + 1}</td>
                <td>{ORDER_TEXT[r.order]}</td>
                <td data-testid="ab-row-palace">{PALACE_TEXT[palaceListOf(r)]}</td>
                <td className="ab-table__num">{r.list.score} of 8</td>
                <td className="ab-table__num">{r.palace.score} of 8</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="ab-means">
              <th scope="row" colSpan={3}>
                Mean overall, n = {n}
              </th>
              <td className="ab-table__num" data-testid="ab-mean-list">
                {listMean.toFixed(1)} of 8
              </td>
              <td className="ab-table__num" data-testid="ab-mean-palace">
                {palaceMean.toFixed(1)} of 8
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={beginRun} data-testid="ab-next">
          Next participant
        </button>
        <button type="button" className="btn" disabled={n === 0} onClick={copy} data-testid="ab-copy">
          Copy as CSV
        </button>
      </div>
      <p className="ab-status" aria-live="polite" data-testid="ab-copy-status">
        {csv ? (csv.copied ? `Copied ${plural(n, 'row')} to the clipboard.` : 'The clipboard is not available here. Select the text below and copy it.') : ''}
      </p>
      {csv && (
        <textarea className="field ab-csv" readOnly rows={Math.min(8, n + 2)} value={csv.text} aria-label="Results as CSV" onFocus={(e) => e.target.select()} data-testid="ab-csv" />
      )}

      <div className="actions ab-foot">
        <button type="button" className="link" onClick={mine ? closeCompare : toIntro} data-testid="ab-done">
          {mine ? 'Back to the title' : 'Back'}
        </button>
        {clearing ? (
          <span className="ab-guard" data-testid="ab-clear-guard">
            <span>Delete all {plural(n, 'result')} from this device?</span>
            <button
              type="button"
              className="link link--danger"
              onClick={() => {
                clearAll();
                setClearing(false);
                setCsv(null);
              }}
              data-testid="ab-clear-yes"
            >
              Delete
            </button>
            <button type="button" className="link" autoFocus onClick={() => setClearing(false)} data-testid="ab-clear-no">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="link link--danger" disabled={n === 0} onClick={() => setClearing(true)} data-testid="ab-clear">
            Clear all results
          </button>
        )}
      </div>
    </section>
  );
}
