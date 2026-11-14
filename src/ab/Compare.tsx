import { useEffect, useRef, type ReactNode } from 'react';
import { useSession } from '@/state/session';
import { CompareResults } from './CompareResults';
import { Distractor, Intro, ListStudy, PalaceEncode, Ready, RecallTest } from './screens';
import { abandon, currentArm, openCompare, requestAbandon, runInProgress, useAb } from './store';
import './ab.css';

/**
 * The comparison test, mounted once inside the overlay. Closed, it renders nothing. Open,
 * it puts its own docked panel over the regular one (ab.css hides the title screen and the
 * regular panel) and owns the keyboard.
 *
 * Why it owns the keyboard: the palace arm uses the session's `encode` and `recall` modes
 * to move the camera, so the regular Encode and Recall screens are mounted too, hidden.
 * Their shortcuts (Space, arrows, 1 to 4) and the overlay's Escape handler listen on
 * `window` in the bubble phase; this listener runs in the capture phase and stops the
 * event there, so a key can never advance the walk, reveal an image or reach the review
 * store. Default actions (typing, Tab, Enter on a focused button) are not affected.
 */
export function Compare() {
  const stage = useAb((s) => s.stage);
  const confirm = useAb((s) => s.confirmAbandon);
  const open = stage !== 'off';

  useEffect(() => {
    if (new URLSearchParams(location.search).has('compare')) openCompare();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      requestAbandon();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  // The list needs room for eight terms with their meanings; the results for a table.
  const size = stage === 'study' && currentArm() === 'list' ? 'list' : stage === 'results' ? 'wide' : 'normal';
  return (
    <>
      <ComparePanel size={size} running={runInProgress(stage)}>
        {stage === 'intro' && <Intro />}
        {stage === 'ready' && <Ready />}
        {stage === 'study' && (currentArm() === 'list' ? <ListStudy /> : <PalaceEncode />)}
        {stage === 'distractor' && <Distractor />}
        {stage === 'recall' && <RecallTest />}
        {stage === 'results' && <CompareResults />}
      </ComparePanel>
      {confirm && <AbandonConfirm />}
    </>
  );
}

/**
 * The docked panel, as in the overlay: a page margin on the right, a bottom sheet on narrow
 * screens. It reports the width (or height) it covers so the engine re-centres the view.
 */
function ComparePanel({ size, running, children }: { size: 'normal' | 'wide' | 'list'; running: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let want = { right: 0, bottom: 0 };
    const apply = () => {
      const s = useSession.getState();
      if (s.insetRight !== want.right) s.setInsetRight(want.right);
      if (s.insetBottom !== want.bottom) s.setInsetBottom(want.bottom);
    };
    const measure = () => {
      const docked = window.innerWidth >= 720;
      const box = el.getBoundingClientRect();
      want = docked ? { right: Math.round(box.width), bottom: 0 } : { right: 0, bottom: Math.round(box.height) };
      apply();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    // The regular panel mounts hidden during the palace walks and reports a width of 0,
    // and reports 0 again when it unmounts. Whenever the inset is not ours, put ours back.
    const unsubscribe = useSession.subscribe(apply);
    return () => {
      unsubscribe();
      ro.disconnect();
      window.removeEventListener('resize', measure);
      want = { right: 0, bottom: 0 };
      apply();
    };
  }, []);
  return (
    <aside ref={ref} className={size === 'normal' ? 'panel ab' : `panel ab ab--${size}`} aria-label="Memoria: compare list against palace" data-testid="ab-panel">
      <header className="panel__head">
        <span className="label">Memoria · Compare</span>
        <button type="button" className="leave" onClick={requestAbandon} data-testid="ab-leave">
          <span className="leave__word">{running ? 'Abandon' : 'Leave'}</span>
          <span className="key">Esc</span>
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </aside>
  );
}

/** "Abandon this run?" as a modal: focus starts on Keep going, Tab cycles inside, Escape closes it. */
function AbandonConfirm() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => Array.from(box.current?.querySelectorAll<HTMLElement>('button') ?? []);
    buttons()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = buttons();
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length;
      all[next].focus();
    };
    // On window in the capture phase, like the panel's own listener, which stops the event there.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="modal" data-testid="ab-abandon-scrim">
      <div ref={box} className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="ab-abandon-q" aria-describedby="ab-abandon-d" data-testid="ab-abandon">
        <h2 id="ab-abandon-q" className="question">
          Abandon this run?
        </h2>
        <p id="ab-abandon-d">It will not be recorded. The clock is stopped while you decide.</p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => useAb.setState({ confirmAbandon: false })} data-testid="ab-abandon-stay">
            Keep going
          </button>
          <button type="button" className="btn" onClick={abandon} data-testid="ab-abandon-yes">
            Abandon
          </button>
        </div>
      </div>
    </div>
  );
}
