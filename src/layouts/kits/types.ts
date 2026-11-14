import type { FC } from 'react';
import type { AccentKey } from '@/core/types';

/**
 * One thing a place can be: a lectern, a stone lantern, a suit of armour. Features are the
 * landmarks of a palace, so each must be unlike every other in silhouette (research
 * principle 2), readable as ink line alone, and built only from <Surface slot> materials.
 */
export interface FeatureDef {
  /** Unique across all kits and props, kebab-case: `rose-window`, `stone-lantern`. */
  id: string;
  /** Proper name shown to the learner, without the article: "Rose Window". The UI adds "The". */
  name: string;
  /** What makes it unlike its neighbours, one line (becomes `Locus.hint`). */
  hint: string;
  /**
   * `floor`: stands free on the floor, about 1 m in from the wall. `wall`: hangs on or is set
   * into the wall behind it (a window, a shelf, a banner); its origin is on the wall face.
   */
  mount: 'floor' | 'wall';
  /** Radius in metres of the floor it covers, from its origin (see PalaceLayout.footprint). */
  footprint: number;
  /** Height in metres of its highest point. The memory image floats about 0.9 m above this. */
  height: number;
  /**
   * The feature itself, built around the origin: standing on y = 0, facing +z (towards the
   * viewer), no wider than 2.2 m, no deeper than 1.4 m, no taller than 3.2 m. Exactly one
   * part carries the accent (`<Surface slot="…" accent={accent} />`); the rest is neutral.
   * Several separate meshes, not one merged geometry: the engine takes a feature apart piece
   * by piece when its place is in ruins, and a feature of one piece cannot fall apart.
   */
  Component: FC<{ accent: AccentKey }>;
}

/**
 * The floor plan of one generated room, in the room's own frame: the centre of the threshold
 * of its entrance doorway is the origin, the floor is y = 0 and the route runs towards -z.
 * The same for every kit, so that places, camera views and the rail are worked out (and
 * checked) once, by the generator in src/layouts/generated/plan.ts.
 */
export interface RoomPlan {
  /** Inner faces of the side walls are at x = ±halfWidth. */
  halfWidth: number;
  /** Inner face of the entrance wall is at z = 0, of the far wall at z = -length. */
  length: number;
  /** Thickness of the wall between two rooms (it lies beyond z = -length), and of the front wall (before z = 0). */
  partition: number;
  /** Both doorways are centred on x = 0. */
  door: {
    halfWidth: number;
    /** Clear height at the jambs. The head may rise above this towards the middle (an arch), up to `signBottom`. */
    height: number;
  };
  /**
   * The wall above each doorway, between these two heights and `signHalfWidth` either side of
   * the axis, belongs to the generator: it carves the name of the room behind the doorway
   * there. A kit keeps it flat and bare, and keeps its ceiling above `signTop`.
   */
  signBottom: number;
  signTop: number;
  signHalfWidth: number;
}

export interface KitRoomProps {
  /**
   * Index of the room on the route, from 0. With `shape` it is the only thing the look of a
   * room may depend on: the route alternates bright and dim, warm and cool (art bible), and
   * a room must look the same however long the palace grows after it.
   */
  index: number;
  /** Until ring rooms are built, a ring is laid out (and passed) as a hall. */
  shape: 'hall' | 'ring';
  plan: RoomPlan;
  /**
   * True for every second room: its places are mirrored left to right (the first one stands
   * by the right-hand wall). A kit that lights a room from one side may use this, or ignore it.
   */
  mirrored: boolean;
  /**
   * True when another room follows: the far doorway is open. False for the last room built so
   * far: the kit closes the doorway (a shut door, a gate), and it opens when the palace is
   * extended. The only thing about a room that changes after it is built.
   */
  open: boolean;
}

/**
 * An architectural style for generated palaces: a Gothic library, a Zen garden, a castle.
 * Registered in src/layouts/kits/index.ts and listed for the UI and the Architect in
 * src/layouts/kits/list.ts.
 *
 * A kit supplies the look, never the plan: every kit's rooms have the same floor plan
 * (`RoomPlan`), so every kit gets the same places, views and camera rail.
 */
export interface KitDef {
  /** As in `PalaceSpec.kit` and in src/layouts/kits/list.ts: `gothic`. */
  id: string;
  /**
   * The kit's own landmarks, at least five (a room's worth), each unlike the others in
   * silhouette. A palace uses them in this order, then the kit-neutral props, so the order
   * is append-only: reordering or removing one changes palaces that learners already know.
   * The fifth, tenth, ... (index 4, 9) stand at the far end of a room as its landmark and
   * carry the golden hand: give those to the biggest, most singular things.
   */
  features: FeatureDef[];
  /** One line per room, by room index (cycled if there are more rooms): the mood of that room (`Room.mood`). */
  moods: string[];
  /**
   * Height of the middle of the name tablet the generator hangs over each doorway, on the face
   * at z = `RoomPlan.partition` of the room's own frame (the side you walk in from). Default:
   * the middle of the plan's name panel. A kit without walls gives the height of whatever it
   * builds there to carry the name (the beam of a gate).
   */
  signHeight?: number;
  /**
   * Everything of one room that is not a place: floor, side walls, the far wall with its
   * doorway, ceiling or sky, windows, and for room 0 also the front wall with the entrance
   * and a forecourt before it (the walk begins 8 m out, looking at the front: pave 10 m).
   * Drawn in the room's own frame (see `RoomPlan`), with <Surface slot> materials only and
   * no accent pigment: colour belongs to the places.
   *
   * Keep clear: the doorways; 5.2 m of height everywhere (a memory image floats up to 4.8 m);
   * the name panel over each doorway (`RoomPlan.signBottom`..`signTop`); the side walls from
   * the floor to 4 m within 1.6 m of each place (a wall feature hangs there), and the far wall
   * either side of the doorway likewise. Few draw calls: merge what repeats (`Repeated`).
   */
  Room: FC<KitRoomProps>;
}
