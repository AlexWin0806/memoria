/**
 * Memoria core contracts. Everything else in the app is written against these types.
 * Keep this file dependency-free (types only, no React, no three).
 *
 * Three ideas are kept strictly separate:
 *   Layout  = geometry + the ordered route of loci (where things are)
 *   Theme   = JSON tokens: palette, light, fog, post, type (how it looks)
 *   Style   = a code module that interprets Theme tokens into materials and effects
 * Any layout must work with any theme.
 */

export type Vec3 = [number, number, number];

// ───────────────────────── Content ─────────────────────────

/** 'list' = ordered items (recall the item at each locus). 'pairs' = term → meaning. */
export type DeckKind = 'list' | 'pairs';

/** How an imago moves. Memory images should be active (Rhetorica ad Herennium III). */
export type ImagoAction = 'spin' | 'bob' | 'pulse' | 'shake' | 'orbit' | 'swing' | 'hop';

/** Hue roles. Each theme maps these to its own pigments. */
export type AccentKey = 'red' | 'amber' | 'green' | 'teal' | 'blue' | 'plum';

/** A memory image: one vivid scene the learner pictures at a locus. */
export interface Imago {
  /** One vivid, active, sensory sentence. Always learner-editable. */
  scene: string;
  /** 1–3 glyphs (emoji code points). The first is the hero; the rest act on or around it. */
  glyphs: string[];
  action: ImagoAction;
  /** Where the image came from. 'learner' once the learner has edited it. */
  source: 'architect' | 'learner' | 'fixture' | 'fallback';
}

export interface MemoryItem {
  id: string;
  /** The thing to remember (list) or the cue (pairs). */
  term: string;
  /** The answer or definition (pairs), or a short gloss (list). */
  meaning?: string;
  imago: Imago;
  /** Locus this item lives at. Assigned by the Architect, changeable by the learner. */
  locusId: string;
}

export interface Deck {
  id: string;
  title: string;
  kind: DeckKind;
  layoutId: string;
  items: MemoryItem[];
  createdAt: number;
  /** Fixture decks ship with the app and never touch the network. */
  fixture?: boolean;
}

// ───────────────────────── Layout ─────────────────────────

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export interface Room {
  id: string;
  name: string;
  /** One line for the art direction: the mood of this room. */
  mood: string;
  center: Vec3;
}

export interface Locus {
  id: string;
  /** Position along the fixed route, 0-based. */
  index: number;
  roomId: string;
  /** Short proper name shown to the learner, e.g. "The Bronze Door". */
  name: string;
  /** What makes this locus unlike its neighbours (silhouette, colour, light). */
  hint: string;
  /** Where the imago token floats. */
  anchor: Vec3;
  /** Camera pose when the walk is stopped at this locus. */
  view: CameraPose;
  accent: AccentKey;
  /** Every fifth locus carries a marker so the learner can keep count (Ad Herennium III.18). */
  marker?: 'hand';
}

/** Semantic material slots. Layouts name a slot; the active style decides what it looks like. */
export type SurfaceSlot =
  | 'floor'
  | 'wall'
  | 'ceiling'
  | 'trim'
  | 'stone'
  | 'wood'
  | 'metal'
  | 'water'
  | 'foliage'
  | 'cloth'
  | 'glow';

export interface PalaceLayoutMeta {
  id: string;
  name: string;
  description: string;
  rooms: Room[];
  loci: Locus[];
  /** Camera pose before the walk starts, and for the attract loop. */
  entry: CameraPose;
  /** A wide establishing pose used for the title screen and results. */
  overview: CameraPose;
  /**
   * Extra spline control points the camera passes through when travelling from
   * locus i to locus i+1 (key: `${i}>${i + 1}`, and `entry>0`). Used to steer the
   * rail through doorways instead of walls. Optional.
   */
  via?: Record<string, Vec3[]>;
}

// ───────────────────────── Theme ─────────────────────────

export type StyleId = 'greybox' | 'ink' | 'nocturne' | 'blueprint';

export interface ThemePalette {
  /** Scene clear colour / paper. */
  paper: string;
  /** Line and text ink. */
  ink: string;
  inkSoft: string;
  surfaces: Record<SurfaceSlot, string>;
  accents: Record<AccentKey, string>;
  /** Sky gradient, bottom then top. */
  sky: [string, string];
  fog: string;
}

export interface ThemeLight {
  ambient: number;
  keyColor: string;
  keyIntensity: number;
  /** Direction the key light travels (from light toward the scene). */
  keyDirection: Vec3;
  fillColor: string;
  fillIntensity: number;
  /** Strength of the local light at the active locus. */
  locusGlow: number;
}

export interface ThemeUi {
  bg: string;
  panel: string;
  fg: string;
  muted: string;
  accent: string;
  success: string;
  danger: string;
  /** Corner radius in px for overlay panels. */
  radius: number;
}

export interface Theme {
  id: string;
  name: string;
  style: StyleId;
  palette: ThemePalette;
  light: ThemeLight;
  fog: { near: number; far: number };
  /** Style-specific numeric knobs (edge width, grain, bloom…). Tuned in the Theme Lab. */
  post: Record<string, number>;
  /** CSS font-family names. Fonts are self-hosted; see CREDITS.md. */
  type: { display: string; text: string };
  ui: ThemeUi;
  audio?: { ambient?: string };
}

// ───────────────────────── Review ─────────────────────────

/** Leitner-style card state, one per MemoryItem. */
export interface ReviewCard {
  itemId: string;
  deckId: string;
  /** 0 = new, 1..5 = Leitner boxes. Drives the "development" of the locus in-world. */
  box: number;
  /** Epoch ms when the item is next due. */
  dueAt: number;
  lastReviewedAt?: number;
  reps: number;
  lapses: number;
}

export interface RecallResult {
  itemId: string;
  correct: boolean;
  /** What the learner typed or picked. */
  given: string;
  /** Time to answer in ms. */
  ms: number;
}

// ───────────────────────── Session ─────────────────────────

export type Mode =
  | 'attract' // title screen, slow drift
  | 'compose' // paste content, review the Architect's proposals
  | 'familiarize' // guided walk of the empty route
  | 'encode' // walk with images shown
  | 'recall' // walk with images hidden until answered
  | 'results' // score and schedule
  | 'review'; // due-for-review dashboard
