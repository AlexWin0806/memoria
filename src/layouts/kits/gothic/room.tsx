import { useCallback } from 'react';
import { type BufferGeometry, PlaneGeometry } from 'three';
import { type ArchOpening, type Parts, Welded, archBand, archPoints, archRise, archSlab, archedWall, at, box, shell } from '@/layouts/kits/build';
import type { KitRoomProps, RoomPlan } from '@/layouts/kits/types';

/**
 * One hall of the Gothic library. The plan is the generator's; what changes from room to
 * room is the roof, where the daylight comes in and the pattern set into the floor, so that
 * two neighbouring rooms are never taken for each other (art bible: the route alternates
 * bright and dim, warm and cool).
 *
 *   vault   a pointed stone barrel vault on transverse ribs: the tallest, coolest rooms
 *   beams   a flat ceiling on dark oak cross-beams: low and warm
 *   open    an open timber roof on king-post trusses: between the two
 */
interface Variant {
  roof: 'vault' | 'beams' | 'open';
  /** Top of the side walls: the springing of a vault, the underside of a flat ceiling, the eaves of an open roof. */
  eaves: number;
  /** Lancets in both side walls, in the wall the first place does not stand by, or none. */
  windows: 'both' | 'one' | 'none';
  floor: 'ladder' | 'aisle' | 'lozenge';
  mood: string;
}

const VARIANTS: Variant[] = [
  { roof: 'vault', eaves: 4.4, windows: 'both', floor: 'ladder', mood: 'Bright and cool. Daylight from tall lancets on both sides, under a pointed stone vault.' },
  { roof: 'beams', eaves: 5.5, windows: 'none', floor: 'aisle', mood: 'Low, dim and warm. A windowless scriptorium under dark oak beams.' },
  { roof: 'open', eaves: 5.3, windows: 'one', floor: 'lozenge', mood: 'Airy and gold. An open timber roof, lit from one side.' },
  { roof: 'vault', eaves: 4.4, windows: 'one', floor: 'aisle', mood: 'Tall and shadowed. A stone vault with light from one side only.' },
  { roof: 'beams', eaves: 5.5, windows: 'both', floor: 'lozenge', mood: 'Warm and bright. Oak beams overhead, lancets on both sides.' },
  { roof: 'open', eaves: 5.3, windows: 'none', floor: 'ladder', mood: 'Quiet and enclosed. A windowless hall under an open timber roof: the innermost room.' },
];

export const GOTHIC_MOODS = VARIANTS.map((v) => v.mood);

/** Outer wall thickness. */
const T = 0.3;
/**
 * The walls between rooms rise to this height whatever the two rooms are, so that a tall
 * room never looks over the wall into a low neighbour.
 */
const WALL_TOP = 9.8;
/** Ribs, beams and trusses stand on these lines across the hall, between the places. */
const BAYS = [-2, -5, -8, -11, -14];
/** Where a side wall is free for a window: across the hall from each place on the other wall. */
const WINDOWS_BY_FIRST = [-6.5, -12.5];
const WINDOWS_OPPOSITE = [-3.5, -9.5];
/** How pointed the doorways and windows are (see `archPoints`). */
const DOOR_POINT = 0.85;
/** The vault: barely pointed, or it would be twice as high as the hall is wide. */
const VAULT_POINT = 0.534;
const RIDGE_RISE = 2.6;
/** Paving before the front door: the walk begins 8 m out. */
const FORECOURT = 10;
const WINDOW = { half: 0.65, sill: 1.3 };

const HALF_PI = Math.PI / 2;

function doorway(plan: RoomPlan): ArchOpening {
  return { x0: -plan.door.halfWidth, x1: plan.door.halfWidth, spring: plan.door.height, point: DOOR_POINT };
}

function build({ index, plan, mirrored, open }: KitRoomProps): Parts {
  const v = VARIANTS[index % VARIANTS.length];
  const { halfWidth: W, length: L, partition: P } = plan;
  const first = index === 0;
  const zStart = first ? P : 0;
  const zEnd = -(L + P);
  const span = zStart - zEnd;
  const zMid = (zStart + zEnd) / 2;
  const door = doorway(plan);
  const list = (): BufferGeometry[] => [];
  const parts = { floor: list(), wall: list(), ceiling: list(), stone: list(), wood: list(), trim: list(), glow: list(), metal: list() } satisfies Parts;

  parts.floor.push(box(2 * W + 2 * T, 0.2, span, [0, -0.1, zMid]));

  // Side walls, with the lancets where a wall has no place before it.
  const springAt = Math.min(3.4, v.eaves - 1.5);
  const firstSide = mirrored ? 1 : -1;
  for (const side of [-1, 1]) {
    const lit = v.windows === 'both' || (v.windows === 'one' && side !== firstSide);
    const windows = lit ? (side === firstSide ? WINDOWS_BY_FIRST : WINDOWS_OPPOSITE) : [];
    const openings = windows.map((z): ArchOpening => ({ x0: zStart - z - WINDOW.half, x1: zStart - z + WINDOW.half, y0: WINDOW.sill, spring: springAt, point: 1 }));
    // Drawn with x running down the hall, then turned to stand along it; the extrusion goes outwards.
    parts.wall.push(at(archedWall(0, span, v.eaves, T, openings), [side < 0 ? -W - T : W, 0, zStart], [0, HALF_PI, 0]));
    parts.trim.push(box(0.12, 0.16, L, [side * (W - 0.06), v.eaves - 0.08, -L / 2]));
    const top = springAt + archRise(2 * WINDOW.half, 1);
    for (const z of windows) {
      const x = side * (W + T / 2);
      parts.stone.push(box(0.08, top - WINDOW.sill - 0.1, 0.08, [x, (top + WINDOW.sill) / 2 - 0.05, z]));
      parts.stone.push(box(0.08, 0.08, 2 * WINDOW.half, [x, springAt, z]));
      parts.stone.push(box(T + 0.16, 0.1, 2 * WINDOW.half + 0.3, [x - side * 0.08, WINDOW.sill - 0.05, z]));
      // The daylight outside, facing into the room.
      parts.glow.push(at(new PlaneGeometry(2 * WINDOW.half + 0.5, top - WINDOW.sill + 0.5), [side * (W + T + 0.03), (top + WINDOW.sill) / 2, z], [0, -side * HALF_PI, 0]));
    }
  }

  // The wall at the far end, its doorway, and the door that stays shut until a room is built behind it.
  parts.wall.push(at(archedWall(-W - T, W + T, WALL_TOP, P, [door]), [0, 0, zEnd]));
  parts.trim.push(at(archBand(door, 0.24, P + 0.16), [0, 0, zEnd - 0.08]));
  if (!open) {
    const face = -L - P / 2 + 0.06;
    parts.wood.push(at(archSlab(door, 0.12), [0, 0, face - 0.12]));
    parts.metal.push(box(0.06, plan.door.height + 1.35, 0.04, [0, (plan.door.height + 1.35) / 2, face + 0.01]));
    for (const side of [-1, 1]) {
      for (const y of [0.45, 1.25, 2.05]) parts.metal.push(box(0.78, 0.07, 0.03, [side * 0.64, y, face + 0.01]));
      parts.metal.push(box(0.05, 0.3, 0.05, [side * 0.16, 1.1, face + 0.03]));
    }
  }
  if (first) {
    parts.wall.push(at(archedWall(-W - T, W + T, WALL_TOP, P, [door]), [0, 0, 0]));
    parts.trim.push(at(archBand(door, 0.24, P + 0.16), [0, 0, -0.08]));
    // The forecourt the walk begins on, two buttresses flanking the door, and the daylight
    // seen through the door when you look back.
    parts.stone.push(box(2 * W + 2 * T, 0.2, FORECOURT, [0, -0.1, P + FORECOURT / 2]));
    for (const side of [-1, 1]) {
      parts.stone.push(box(0.7, 6.2, 0.5, [side * 3.3, 3.1, P + 0.25]));
      parts.stone.push(box(0.7, 1.6, 0.9, [side * 3.3, 0.8, P + 0.45]));
    }
    parts.glow.push(at(new PlaneGeometry(24, 14), [0, 5, P + FORECOURT + 1], [0, Math.PI, 0]));
  }

  if (v.roof === 'vault') {
    parts.ceiling.push(at(shell(archPoints(-W - 0.02, W + 0.02, v.eaves, VAULT_POINT, 12), 0.25, L), [0, 0, -L]));
    const rib: ArchOpening = { x0: -W + 0.26, x1: W - 0.26, y0: v.eaves - 0.55, spring: v.eaves, point: VAULT_POINT };
    for (const z of BAYS) parts.stone.push(at(archBand(rib, 0.26, 0.3), [0, 0, z - 0.15]));
  } else if (v.roof === 'beams') {
    parts.ceiling.push(box(2 * W + 2 * T, 0.2, L, [0, v.eaves + 0.1, -L / 2]));
    for (const z of BAYS) {
      parts.wood.push(box(2 * W, 0.36, 0.3, [0, v.eaves - 0.18, z]));
      for (const side of [-1, 1]) parts.stone.push(box(0.34, 0.3, 0.38, [side * (W - 0.17), v.eaves - 0.51, z]));
    }
    for (const side of [-1, 1]) parts.wood.push(box(0.2, 0.2, L, [side * 1.6, v.eaves - 0.1, -L / 2]));
  } else {
    const ridge = v.eaves + RIDGE_RISE;
    parts.ceiling.push(at(shell([[-W - 0.02, v.eaves], [0, ridge], [W + 0.02, v.eaves]], 0.2, L), [0, 0, -L]));
    const slope = Math.atan2(RIDGE_RISE, W);
    const rafter = Math.hypot(W, RIDGE_RISE) - 0.3;
    for (const z of BAYS) {
      parts.wood.push(box(2 * W, 0.28, 0.26, [0, v.eaves + 0.14, z]));
      parts.wood.push(box(0.22, RIDGE_RISE - 0.5, 0.22, [0, v.eaves + RIDGE_RISE / 2, z]));
      for (const side of [-1, 1]) parts.wood.push(box(rafter, 0.22, 0.22, [(side * W) / 2, v.eaves + RIDGE_RISE / 2 - 0.2, z], [0, 0, -side * slope]));
    }
    parts.wood.push(box(0.24, 0.24, L, [0, ridge - 0.3, -L / 2]));
  }

  // The floor inlay: thin lines down the middle of the hall, clear of the plots by the walls.
  const line = (w: number, d: number, x: number, z: number, turn = 0) => parts.trim.push(box(w, 0.012, d, [x, 0.006, z], [0, turn, 0]));
  if (v.floor === 'ladder') {
    for (const side of [-1, 1]) line(0.07, 12.4, side * 2.1, -7.2);
    for (const z of BAYS.slice(0, 4)) line(4.2, 0.07, 0, z);
    line(4.2, 0.07, 0, -1);
    line(4.2, 0.07, 0, -13.4);
  } else if (v.floor === 'aisle') {
    for (const side of [-1, 1]) {
      line(0.07, 12.4, side * 1.45, -7.2);
      line(0.07, 12.4, side * 1.75, -7.2);
    }
  } else {
    for (const z of [-3.5, -6.5, -9.5, -12.5]) {
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) line(2.05, 0.07, dx * 0.725, z + dz * 0.725, dx * dz * (Math.PI / 4));
    }
  }
  return parts;
}

export function GothicRoom(props: KitRoomProps) {
  const { index, shape, plan, mirrored, open } = props;
  const make = useCallback(() => build({ index, shape, plan, mirrored, open }), [index, shape, plan, mirrored, open]);
  return <Welded build={make} />;
}
