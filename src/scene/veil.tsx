import { useFrame } from '@react-three/fiber';
import type { Theme } from '@/core/types';

/**
 * The veil is a paper-coloured sheet over the canvas. While the scene compiles it is the
 * loading state: a blank vellum page with the word "Memoria" and a thin ink rule being
 * drawn under it. It lifts once when the scene is ready, and afterwards dips briefly,
 * blank, when the camera cuts instead of gliding (far jumps, reduced motion).
 * It is plain mutable state written from the frame loop: no React state.
 */
export interface Veil {
  el: HTMLDivElement | null;
  /** The title and rule shown during the intro only. */
  mark: HTMLDivElement | null;
  rule: HTMLDivElement | null;
  /** 1 until the scene has rendered, then eases to 0. */
  intro: number;
  ready: boolean;
  /** QA: never lift (`&veil=hold`). */
  hold: boolean;
  /** 0..1, raised by the camera around a cut. */
  dip: number;
  /** True from the start of a dip until the camera has cut: what must change unseen waits for the cut. */
  cutting: boolean;
  /** Counts the cuts made under the veil. It goes up on the frame the veil is opaque. */
  cuts: number;
  /** Opacity last written to the element. */
  shown: number;
}

export function createVeil(hidden: boolean, hold = false): Veil {
  const intro = hidden ? 0 : 1;
  return { el: null, mark: null, rule: null, intro, ready: false, hold, dip: 0, cutting: false, cuts: 0, shown: intro };
}

const INTRO_SECONDS = 0.7;
/** The rule creeps towards full width for as long as loading takes, then is finished off. */
const RULE_SECONDS = 6;
const RULE_FINISH_MS = 260;

/** Called once when the scene is ready: draw the rest of the rule quickly, from wherever it has got to. */
export function finishRule(veil: Veil): void {
  const rule = veil.rule;
  if (!rule || typeof rule.getAnimations !== 'function') return;
  const running = rule.getAnimations();
  if (!running.length) return;
  const from = getComputedStyle(rule).transform;
  for (const a of running) a.cancel();
  rule.animate([{ transform: from }, { transform: 'scaleX(1)' }], { duration: RULE_FINISH_MS, easing: 'ease-out', fill: 'forwards' });
}

/** Lifts the intro veil and writes the veil's opacity to the DOM when it changes. */
export function VeilPainter({ veil, reduced }: { veil: Veil; reduced: boolean }) {
  useFrame((_, delta) => {
    if (veil.ready && !veil.hold && veil.intro > 0) {
      // Reduced motion: no fade, the page is simply there.
      veil.intro = reduced ? 0 : Math.max(0, veil.intro - delta / INTRO_SECONDS);
      if (veil.intro === 0 && veil.mark) veil.mark.style.display = 'none';
    }
    // Ease the linear intro ramp so the lift starts and ends softly.
    const intro = veil.intro * veil.intro * (3 - 2 * veil.intro);
    const o = Math.max(intro, veil.dip);
    if (Math.abs(o - veil.shown) < 0.004 && !(o === 0 && veil.shown !== 0)) return;
    veil.shown = o;
    if (veil.el) veil.el.style.opacity = String(o);
  });
  return null;
}

/** Width the title screen's text column covers on the left. */
const TITLE_COLUMN = 'min(680px, 47vw)';
const KEYFRAMES = '@keyframes memoria-veil-rule { from { transform: scaleX(0); } to { transform: scaleX(1); } }';

/**
 * The veil's DOM: the sheet, and on first load the title with its rule. The rule is a
 * transform animation, so it keeps drawing while shader compilation blocks the main thread.
 * `titled`: the title screen is up and already carries the word in its text column, so the
 * veil shows the rule centred in the part of the page that column leaves free, with a line
 * under it saying what is going on. A rule on its own there read as a stray stroke (QA #14).
 */
export function VeilSheet({ veil, theme, reduced, titled }: { veil: Veil; theme: Theme; reduced: boolean; titled: boolean }) {
  const { paper, ink, inkSoft } = theme.palette;
  return (
    <div
      aria-hidden
      ref={(el) => {
        veil.el = el;
        if (el) el.style.opacity = String(veil.shown);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        paddingLeft: titled ? TITLE_COLUMN : 0,
        background: paper,
        pointerEvents: 'none',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {veil.intro > 0 && (
        <div
          ref={(el) => {
            veil.mark = el;
          }}
          style={{ color: ink, textAlign: 'center' }}
        >
          <style>{KEYFRAMES}</style>
          {!titled && (
            <div style={{ fontFamily: `'${theme.type.display}', Georgia, serif`, fontSize: 46, lineHeight: 1, letterSpacing: '0.02em' }}>Memoria</div>
          )}
          <div
            ref={(el) => {
              veil.rule = el;
            }}
            style={{
              width: titled ? 320 : 232,
              height: 1,
              margin: '20px auto 0',
              background: ink,
              opacity: 0.8,
              transformOrigin: 'left center',
              animation: reduced ? undefined : `memoria-veil-rule ${RULE_SECONDS}s cubic-bezier(0.12, 0.7, 0.2, 1) both`,
            }}
          />
          {titled && (
            <div style={{ marginTop: 14, color: inkSoft, fontFamily: `'${theme.type.display}', Georgia, serif`, fontStyle: 'italic', fontSize: 17, letterSpacing: '0.01em' }}>
              The palace is being drawn
            </div>
          )}
        </div>
      )}
    </div>
  );
}
