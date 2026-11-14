import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { leave, requestLeave, startJudge, useFlow } from '@/flows/flow';
import { useArrivedFallback, useReducedMotion } from '@/flows/hooks';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { getTheme } from '@/themes';
import { Compose } from './Compose';
import { Recall } from './Recall';
import { Results } from './Results';
import { Review } from './Review';
import { Title } from './Title';
import { Encode, Familiarize } from './Walk';
import { applyThemeVars } from './theme';
import './overlay.css';

const query = () => new URLSearchParams(location.search);

/**
 * The 2D interface. It talks to the 3D engine only through the session store.
 * Hidden entirely for `?shot` and `?rail` (screenshot and camera-rail tooling).
 */
export function Overlay() {
  const q = query();
  if (q.has('shot') || q.has('rail')) return null;
  return <OverlayRoot />;
}

function OverlayRoot() {
  const mode = useSession((s) => s.mode);
  const themeId = useSettings((s) => s.themeId);
  const reduced = useReducedMotion(useSettings((s) => s.reducedMotion));
  const confirmLeave = useFlow((s) => s.confirmLeave);
  useArrivedFallback();

  // Before first paint, so the overlay never flashes unstyled.
  useLayoutEffect(() => {
    applyThemeVars(getTheme(query().get('theme') ?? themeId));
  }, [themeId]);

  useEffect(() => {
    if (query().has('judge')) startJudge();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      requestLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ov" data-mode={mode} data-reduced-motion={reduced ? 'true' : 'false'}>
      {mode === 'attract' ? (
        <Title />
      ) : (
        <Panel wide={mode === 'compose'}>
          {confirmLeave && <LeaveConfirm compose={mode === 'compose'} />}
          {mode === 'compose' && <Compose />}
          {mode === 'familiarize' && <Familiarize />}
          {mode === 'encode' && <Encode />}
          {mode === 'recall' && <Recall />}
          {mode === 'results' && <Results />}
          {mode === 'review' && <Review />}
        </Panel>
      )}
    </div>
  );
}

/**
 * The one docked panel: a page margin on the right, a bottom sheet on narrow screens.
 * Reports the width it covers so the engine can re-centre the view beside it.
 */
function Panel({ wide, children }: { wide: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const docked = window.innerWidth >= 720;
      useSession.getState().setInsetRight(docked ? Math.round(el.getBoundingClientRect().width) : 0);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
      useSession.getState().setInsetRight(0);
    };
  }, []);
  return (
    <aside ref={ref} className={wide ? 'panel panel--wide' : 'panel'} aria-label="Memoria">
      <header className="panel__head">
        <span className="label">Memoria</span>
        <button type="button" className="leave" onClick={requestLeave} data-testid="leave">
          <span className="leave__word">Leave</span>
          <span className="key">Esc</span>
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </aside>
  );
}

function LeaveConfirm({ compose }: { compose: boolean }) {
  return (
    <div className="confirm" role="alertdialog" aria-labelledby="leave-q" data-testid="leave-confirm">
      <p id="leave-q">
        {compose
          ? 'Leave without placing these? The proposal will be lost; your pasted text is kept.'
          : 'Leave this walk? It will not be recorded.'}
      </p>
      <div className="actions">
        <button type="button" className="btn" autoFocus onClick={() => useFlow.setState({ confirmLeave: false })}>
          Stay
        </button>
        <button type="button" className="btn btn--quiet" onClick={leave} data-testid="leave-yes">
          Leave
        </button>
      </div>
    </div>
  );
}
