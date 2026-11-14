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
  /** One line tying the image to the meaning of the fact ("scaphoid means boat-shaped"). */
  reason?: string;
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
  /** Other ready-made images for this item, offered when the learner asks for a stronger one. */
  alternates?: Imago[];
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
  /**
   * How items relate to one another (a pathway step becomes the next, one thing blocks
   * another). The engine draws each link between the two places. Optional; order is not meaningful.
   */
  links?: ItemLink[];
  /** Epoch ms of the last completed survey walk (the diagnostic). Absent = never surveyed. */
  surveyedAt?: number;
  /** What the learner is meant to do with this deck. Absent = `facts`. */
  focus?: DeckFocus;
}

/**
 * Different kinds of knowledge are practised differently:
 *   facts    remember each item at its place (terms, names, dates). The place is the cue.
 *   process  the items are the steps of a process. The walks also ask how one step leads to
 *            another (what it becomes, what it needs, what it blocks), using `links`, and
 *            the learner puts the steps back in order.
 */
export type DeckFocus = 'facts' | 'process';

/**
 * A relationship between two items, drawn in the palace between their two places:
 *   becomes  `from` turns into or leads to `to` (a step in a pathway, a sequence in time)
 *   needs    `from` depends on `to` (cannot happen or be understood without it)
 *   blocks   `from` inhibits or prevents `to` (feedback inhibition, an exception to a rule)
 *   mirrors  `from` and `to` are a matched pair (opposites, counterparts, the same form in two tenses)
 */
export type LinkKind = 'becomes' | 'needs' | 'blocks' | 'mirrors';

export interface ItemLink {
  /** MemoryItem ids. */
  from: string;
  to: string;
  kind: LinkKind;
  /** A few words shown on the link, e.g. "loses CO2". Optional. */
  label?: string;
}

// ───────────────────────── Palace plan ─────────────────────────

/**
 * A generated palace: a kit (the architecture) and an ordered chain of rooms, one per
 * category of the material. It is append-only, so that what a learner has already placed
 * never moves: rooms are never removed or reordered, and `places` only grows. Encoded into
 * `Deck.layoutId` by `palaceLayoutId` in src/layouts/spec.ts; the handcrafted palaces keep
 * their plain ids (`domus`).
 */
export interface PalaceSpec {
  /** Kit id, e.g. `gothic`, `zen`, `castle`. An unknown kit falls back to the default kit. */
  kit: string;
  /** In route order. */
  rooms: PalaceRoomSpec[];
}

export interface PalaceRoomSpec {
  /** Stable and unique within the palace (`r1`, `r2`, ...). Never reused. */
  id: string;
  /** The category this room holds, shown to the learner ("Past tense"). */
  name: string;
  /** How many places are built in this room, 1..ROOM_CAPACITY. Their ids are `<room id>-<n>`, n from 1. */
  places: number;
  /** `ring`: a round room whose places stand in a circle, for a cycle. Default `hall`. */
  shape?: 'hall' | 'ring';
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
  /**
   * What the survey (the diagnostic taken before any study) found for this item: `unknown`
   * covers a wrong answer and "I don't know" alike. Absent = the item was never surveyed.
   * A card that holds only this (reps 0, box 0) is not a studied card: nothing is due on it.
   */
  survey?: 'known' | 'unknown';
  /**
   * What the learner picked or typed in the survey, shown beside the right answer on the study
   * walk. An empty string = they chose "I don't know". Absent = the survey never reached the
   * item (it was skipped), or the item was never surveyed.
   */
  surveyGiven?: string;
  /** Epoch ms when the item's image was first placed on a study walk. Absent = not studied yet. */
  studiedAt?: number;
}

export interface RecallResult {
  itemId: string;
  correct: boolean;
  /** What the learner typed or picked. */
  given: string;
  /** Time to answer in ms. */
  ms: number;
  /** The learner chose "I don't know". Always paired with `correct: false`. */
  unknown?: boolean;
}

/**
 * What kind of walk a score came from. `survey` is the diagnostic taken before any study.
 * `exam` is not a walk at all: the same facts asked with no palace on screen, in shuffled
 * order. It is kept in the same history so that the Progress view can list it, apart from the walks.
 */
export type WalkKind = 'survey' | 'recall' | 'review' | 'exam';

/**
 * Which way an exam asked: the meaning shown and the term asked for, the term shown and the
 * meaning asked for, or (a list with no meanings) each item asked for by its position.
 */
export type ExamDirection = 'meaning-term' | 'term-meaning' | 'position';

/** One finished walk, kept so that the learner can see how their scores change over time. */
export interface WalkRecord {
  id: string;
  deckId: string;
  kind: WalkKind;
  /** Epoch ms when the walk ended. */
  at: number;
  total: number;
  correct: number;
  /** How many were answered "I don't know" (counted as not correct). */
  unknown: number;
  /** Per item, in route order. */
  items: { itemId: string; correct: boolean; unknown?: boolean }[];
  /** Total answering time in ms. */
  ms: number;
  /** Questions about links between items (process decks), scored apart from the items. */
  relations?: { total: number; correct: number };
  /**
   * Putting the steps in order after the walk (process decks), scored apart from the items:
   * how many of the `total` steps followed their true predecessor.
   */
  order?: { total: number; correct: number };
  /**
   * An exam only (`kind: 'exam'`): which way it asked, and whether the learner marked their own
   * typed meanings (no grader can), in which case `correct` is their count, not the palace's.
   */
  exam?: { direction: ExamDirection; selfMarked?: boolean };
}

// ───────────────────────── Session ─────────────────────────

export type Mode =
  | 'attract' // title screen, slow drift
  | 'compose' // paste content, review the Architect's proposals
  | 'familiarize' // guided walk of the empty route
  | 'survey' // the diagnostic: a walk of the route with a question at each place, before any study
  | 'encode' // walk with images shown
  | 'recall' // walk with images hidden until answered
  | 'results' // score and schedule
  | 'review'; // due-for-review dashboard
