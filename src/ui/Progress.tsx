import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Deck, ReviewCard, WalkKind, WalkRecord } from '@/core/types';
import { closeProgress } from '@/flows/flow';
import { plural } from '@/flows/format';
import { useNow } from '@/flows/hooks';
import { getLayout } from '@/layouts';
import { useAllDecks } from '@/state/decks';
import { isSectionWalk, isSkippedSurvey, useHistory, walksOf, weakestPlaces } from '@/state/history';
import { repairCounts, useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { RepairLegend } from './Legend';
import { deckStatus } from './Title';
import './progress.css';

/** How each kind of walk is named. The survey is always called what it is: the score before any study. */
const KIND_NAME: Record<WalkKind, string> = {
  survey: 'Before study (survey)',
  recall: 'Recall walk',
  review: 'Review',
};

const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const score = (r: { correct: number; total: number }) => `${r.correct} of ${r.total}`;
const share = (r: WalkRecord) => (r.total > 0 ? r.correct / r.total : 0);
/** The kind of a walk as the table names it. A walk of a section says that it covered only new places. */
const kindName = (r: WalkRecord) =>
  `${isSkippedSurvey(r) ? 'Before study (survey skipped)' : KIND_NAME[r.kind]}${isSectionWalk(r) ? ` · ${plural(r.total, 'new place')}` : ''}`;

/**
 * Progress: for each palace, its score on every finished walk, the latest against the
 * first, and the places missed most often. Opened from the title and from the results; it
 * is not a session mode, so the scene behind it stays as it was.
 */
export function Progress() {
  const records = useHistory((s) => s.records);
  const decks = useAllDecks();
  const cards = useReview((s) => s.cards);
  const inHand = useSession((s) => s.deckId);
  const now = useNow();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // On closing over the title, the focus goes back to the link that opened this view (the results screen sees to its own).
    return () => {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid=title-progress]')?.focus({ preventScroll: true }));
    };
  }, []);

  // Palaces with at least one finished walk: the one in hand first, then the most recently walked.
  const rows = decks
    .map((deck) => ({ deck, walks: walksOf(records, deck.id) }))
    .filter((r) => r.walks.length > 0)
    .sort((a, b) => Number(b.deck.id === inHand) - Number(a.deck.id === inHand) || b.walks[b.walks.length - 1].at - a.walks[a.walks.length - 1].at);

  return (
    <section className="screen progress" data-testid="progress">
      <p className="label">Progress</p>
      <h1 className="question" tabIndex={-1} ref={heading} data-testid="progress-heading">
        {rows.length === 0 ? 'No walks yet' : 'Your scores, walk by walk'}
      </h1>
      {rows.length === 0 ? (
        <p className="body" data-testid="progress-empty">
          Nothing has been measured yet. A palace appears here once its survey or a recall walk is finished, and its line
          begins with the second walk.
        </p>
      ) : (
        <>
          <p className="body">
            Each point is one finished walk: the share of places answered right. The survey is the score before study, so
            every later walk can be read against it.
          </p>
          <RepairLegend />
        </>
      )}
      {rows.map(({ deck, walks }) => (
        <PalaceProgress key={deck.id} deck={deck} walks={walks} cards={cards} now={now} />
      ))}
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={closeProgress} data-testid="progress-back">
          Back
        </button>
      </div>
    </section>
  );
}

function PalaceProgress({ deck, walks: all, cards, now }: { deck: Deck; walks: WalkRecord[]; cards: Record<string, ReviewCard>; now: number }) {
  // The line and the summary follow walks of the whole palace. A walk of a section (only the places
  // that were added) scores a different set of places, so it is listed in the table, labelled, and
  // kept out of the line. A palace that has only section walks so far shows those.
  const whole = all.filter((r) => !isSectionWalk(r));
  const walks = whole.length > 0 ? whole : all;
  const sections = all.length - whole.length;
  const first = walks[0];
  const latest = walks[walks.length - 1];
  // A process deck counts its links and its order apart from the places: two more columns, when there is something in them.
  const hasLinks = all.some((r) => r.relations !== undefined);
  const hasOrder = all.some((r) => r.order !== undefined);
  const layout = getLayout(deck.layoutId);
  const placeOf = (itemId: string) => {
    const item = deck.items.find((it) => it.id === itemId);
    return layout.loci.find((l) => l.id === item?.locusId)?.name;
  };
  const weak = weakestPlaces(all, deck.id).flatMap((p) => {
    const name = placeOf(p.itemId);
    return name ? [{ ...p, name }] : [];
  });
  const tested = all.some((r) => r.kind !== 'survey');
  const repair = deck.surveyedAt !== undefined ? repairCounts(deck, cards) : null;
  const firstName = first.kind === 'survey' ? (isSkippedSurvey(first) ? 'Before study (survey skipped)' : 'Before study') : 'First walk';

  return (
    <section className="palace" aria-labelledby={`pp-${deck.id}`} data-testid="progress-palace">
      <h2 id={`pp-${deck.id}`} className="palace__name">
        {deck.title}
      </h2>
      <p className="palace__meta" data-testid="progress-status">
        {deckStatus(deck, cards, now)}
      </p>
      <p className="body" data-testid="progress-summary">
        {walks.length === 1
          ? `${firstName}: ${score(first)}. One walk so far.`
          : `${firstName}: ${score(first)}. Latest (${KIND_NAME[latest.kind].toLowerCase()}): ${score(latest)}. ${plural(walks.length, 'walk')} in all.`}
      </p>
      {sections > 0 && whole.length > 0 && (
        <p className="body" data-testid="progress-sections">
          {plural(sections, 'more walk')} of new places only: in the table, not on the line.
        </p>
      )}
      {repair && (
        <p className="body" data-testid="progress-repair">
          Now: {repair.whole} restored, {repair.repair} under repair, {repair.damaged} needing another repair, {repair.ruins} in ruins.
        </p>
      )}
      <ScoreChart walks={walks} label={`${deck.title}: score on each of ${plural(walks.length, 'walk')}. ${firstName}: ${score(first)}. Latest: ${score(latest)}.`} />
      <details className="walks">
        <summary className="label">The walks as a table</summary>
        <table className="walks__table" data-testid="progress-table">
          <thead>
            <tr>
              <th scope="col">Walk</th>
              <th scope="col">When</th>
              <th scope="col">Kind</th>
              <th scope="col">{hasLinks || hasOrder ? 'Places right' : 'Right'}</th>
              <th scope="col">No answer</th>
              {hasLinks && <th scope="col">Links</th>}
              {hasOrder && <th scope="col">Order</th>}
            </tr>
          </thead>
          <tbody>
            {all.map((r, i) => (
              <tr key={r.id} data-testid="progress-row" data-kind={r.kind} data-section={isSectionWalk(r) ? 'true' : undefined}>
                <td>{i + 1}</td>
                <td>{when.format(r.at)}</td>
                <td>{kindName(r)}</td>
                <td>{score(r)}</td>
                <td>{r.unknown}</td>
                {hasLinks && <td data-testid="progress-links">{r.relations ? score(r.relations) : 'not asked'}</td>}
                {hasOrder && <td data-testid="progress-order">{r.order ? score(r.order) : 'not asked'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <h3 className="label palace__sub">Places to revisit</h3>
      {weak.length > 0 ? (
        <ol className="weak" data-testid="progress-weak">
          {weak.map((p) => (
            <li key={p.itemId}>
              <span className="weak__name">{p.name}</span>
              <span className="weak__meta">
                missed on {p.misses} of {plural(p.asked, 'walk')}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted" data-testid="progress-weak-none">
          {tested ? 'No place has been missed on a recall walk.' : 'Nothing to say yet: no recall walk has been finished.'}
        </p>
      )}
    </section>
  );
}

const CHART_HEIGHT = 216;
/** The bottom band holds a score label under a point at 0%, and the dates under that. */
const PAD = { top: 26, right: 18, bottom: 54, left: 52 };
/** Half the side of a marker, in px: every mark is at least 10 px across. */
const MARK = 5;
/** Room taken by the words "before study" at 16 px, and by a score such as "10 of 12". */
const NOTE_WIDTH = 92;
const VALUE_WIDTH = 70;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** True when the line or one of its marks passes through the box (with a few px of air around it). */
function inked(points: { cx: number; cy: number }[], box: Box): boolean {
  const air = 3;
  return points.some((p, i) => {
    const near = p.cx > box.x0 - MARK - air && p.cx < box.x1 + MARK + air;
    if (near && p.cy + MARK > box.y0 - air && p.cy - MARK < box.y1 + air) return true;
    const q = points[i + 1];
    if (!q || q.cx < box.x0 || p.cx > box.x1) return false;
    const at = (xv: number) => p.cy + ((q.cy - p.cy) * (xv - p.cx)) / (q.cx - p.cx);
    const a = at(Math.max(box.x0, p.cx));
    const b = at(Math.min(box.x1, q.cx));
    // The segment crosses the box when its two ends there are not both above or both below it.
    return !(Math.max(a, b) <= box.y0 - air || Math.min(a, b) >= box.y1 + air);
  });
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Score per walk as an ink line: the share of places answered right, 0 to 100 per cent,
 * walks evenly spaced in the order they were taken. The survey is an open ring and a dashed
 * level across the plot (the score before study); recall walks are dots, reviews diamonds.
 * Drawn at its real pixel width (no scaling), so that its text stays at 16 px.
 */
function ScoreChart({ walks, label }: { walks: WalkRecord[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (walks.length === 1 ? plotW / 2 : (i / (walks.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - v) * plotH;
  const points = walks.map((r, i) => ({ r, cx: x(i), cy: y(share(r)) }));
  const survey = walks.find((r) => r.kind === 'survey');
  const last = points[points.length - 1];
  const shown = active ?? walks.length - 1;
  const kinds = (['survey', 'recall', 'review'] as const).filter((k) => walks.some((r) => r.kind === k));

  // The nearest walk to the pointer, so that no one has to land on a 10 px dot.
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.cx - px) < Math.abs(points[best].cx - px)) best = i;
    });
    setActive(best);
  };
  // The latest score is labelled at its point, on the side the line does not come from:
  // above after a rise, below after a fall.
  const before = points[points.length - 2];
  const lastLabelY = before && before.cy < last.cy ? last.cy + 24 : last.cy - 12;
  const lastLabelX = Math.min(last.cx, width - PAD.right);
  const valueBox: Box = { x0: lastLabelX - VALUE_WIDTH, x1: lastLabelX, y0: lastLabelY - 14, y1: lastLabelY + 4 };
  const surveyY = survey ? y(share(survey)) : 0;
  // "before study" sits on its dashed level wherever the line, the marks and the latest score leave it room:
  // the first clear spot of left, right and middle, above the level or below it.
  const note = (() => {
    const lefts = [PAD.left + 12, width - PAD.right - NOTE_WIDTH - 12, PAD.left + (plotW - NOTE_WIDTH) / 2];
    const spots = lefts.flatMap((x0) => [surveyY - 7, surveyY + 19].map((base) => ({ x0, base })));
    const clear = spots.find(({ x0, base }) => {
      const box: Box = { x0, x1: x0 + NOTE_WIDTH, y0: base - 14, y1: base + 4 };
      return box.y0 >= 2 && box.y1 <= PAD.top + plotH + 2 && !inked(points, box) && !overlap(box, valueBox);
    });
    return clear ?? spots[0];
  })();

  return (
    <figure className="chart" ref={box}>
      <svg
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        data-testid="progress-chart"
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="chart__tick" x={PAD.left - 8} y={y(v) + 5} textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        {survey && (
          <g data-testid="chart-baseline">
            <line className="chart__baseline" x1={PAD.left} x2={width - PAD.right} y1={surveyY} y2={surveyY} />
            {walks.length > 1 && (
              <text className="chart__note" x={note.x0} y={note.base}>
                before study
              </text>
            )}
          </g>
        )}
        {points.length > 1 && <polyline className="chart__line" points={points.map((p) => `${p.cx},${p.cy}`).join(' ')} />}
        {points.map((p, i) => (
          <Marker key={p.r.id} kind={p.r.kind} cx={p.cx} cy={p.cy} active={i === active} />
        ))}
        <text className="chart__value" x={lastLabelX} y={lastLabelY} textAnchor={walks.length === 1 ? 'middle' : 'end'}>
          {walks.length === 1 && last.r.kind === 'survey' ? `before study: ${score(last.r)}` : score(last.r)}
        </text>
        <text className="chart__tick" x={walks.length === 1 ? x(0) : PAD.left} y={CHART_HEIGHT - 8} textAnchor={walks.length === 1 ? 'middle' : 'start'}>
          {day.format(walks[0].at)}
        </text>
        {walks.length > 1 && (
          <text className="chart__tick" x={width - PAD.right} y={CHART_HEIGHT - 8} textAnchor="end">
            {day.format(last.r.at)}
          </text>
        )}
      </svg>
      {/* What the pointer is over, or the latest walk. The table below holds every value, so this line is not announced. */}
      <figcaption className="chart__readout" aria-hidden="true" data-testid="chart-readout">
        Walk {shown + 1} of {walks.length} · {KIND_NAME[walks[shown].kind].toLowerCase()} · {score(walks[shown])} · {when.format(walks[shown].at)}
      </figcaption>
      <p className="chart__key" aria-hidden="true">
        {kinds.map((k) => (
          <span key={k} className="chart__keyitem">
            <svg width={16} height={16} aria-hidden="true">
              <Marker kind={k} cx={8} cy={8} active={false} />
            </svg>
            {KIND_NAME[k].toLowerCase()}
          </span>
        ))}
      </p>
    </figure>
  );
}

/** Survey: an open ring. Recall: a dot. Review: a diamond. Each has a ring of the paper colour, so the line never touches it. */
function Marker({ kind, cx, cy, active }: { kind: WalkKind; cx: number; cy: number; active: boolean }) {
  const cls = `chart__mark chart__mark--${kind}`;
  return (
    <g data-active={active ? 'true' : undefined}>
      {active && <circle className="chart__halo" cx={cx} cy={cy} r={MARK + 6} />}
      {kind === 'review' ? (
        <rect className={cls} x={cx - MARK} y={cy - MARK} width={MARK * 2} height={MARK * 2} transform={`rotate(45 ${cx} ${cy})`} />
      ) : (
        <circle className={cls} cx={cx} cy={cy} r={kind === 'survey' ? MARK : MARK + 0.5} />
      )}
    </g>
  );
}
