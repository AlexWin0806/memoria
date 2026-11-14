import { useFrame } from '@react-three/fiber';

/**
 * The veil is a paper-coloured sheet over the canvas. It lifts once when the scene is
 * ready, and dips briefly when the camera cuts instead of gliding (far jumps, reduced
 * motion). It is plain mutable state written from the frame loop: no React state.
 */
export interface Veil {
  el: HTMLDivElement | null;
  /** 1 until the scene has rendered, then eases to 0. */
  intro: number;
  ready: boolean;
  /** 0..1, raised by the camera around a cut. */
  dip: number;
  /** Opacity last written to the element. */
  shown: number;
}

export function createVeil(hidden: boolean): Veil {
  const intro = hidden ? 0 : 1;
  return { el: null, intro, ready: false, dip: 0, shown: intro };
}

const INTRO_SECONDS = 0.7;

/** Lifts the intro veil and writes the veil's opacity to the DOM when it changes. */
export function VeilPainter({ veil }: { veil: Veil }) {
  useFrame((_, delta) => {
    if (veil.ready && veil.intro > 0) veil.intro = Math.max(0, veil.intro - delta / INTRO_SECONDS);
    // Ease the linear intro ramp so the lift starts and ends softly.
    const intro = veil.intro * veil.intro * (3 - 2 * veil.intro);
    const o = Math.max(intro, veil.dip);
    if (Math.abs(o - veil.shown) < 0.004 && !(o === 0 && veil.shown !== 0)) return;
    veil.shown = o;
    if (veil.el) veil.el.style.opacity = String(o);
  });
  return null;
}
