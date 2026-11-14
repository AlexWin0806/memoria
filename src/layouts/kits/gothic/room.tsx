import { useCallback } from 'react';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, PlaneGeometry, RingGeometry } from 'three';
import { limb } from '@/layouts/domus/parts';
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
/** Width of a line of the floor inlay: thin enough to draw as one quiet ink line. */
const INLAY = 0.035;

const HALF_PI = Math.PI / 2;

function doorway(plan: RoomPlan): ArchOpening {
  return { x0: -plan.door.halfWidth, x1: plan.door.halfWidth, spring: plan.door.height, point: DOOR_POINT };
}

const list = (): BufferGeometry[] => [];

/**
 * What every room has, whatever its shape: the floor, the wall across its far end with the
 * doorway (and the door that stays shut until a room is built behind it), and for the first
 * room the front of the library.
 */
function ends({ index, plan, open }: KitRoomProps) {
  const { halfWidth: W, length: L, partition: P } = plan;
  const first = index === 0;
  const zStart = first ? P : 0;
  const zEnd = -(L + P);
  const door = doorway(plan);
  // The stone frame of a doorway stands a little into the opening, so that it covers the cut edge of the wall.
  const frame: ArchOpening = { ...door, x0: door.x0 + 0.03, x1: door.x1 - 0.03 };
  const parts = { floor: list(), wall: list(), ceiling: list(), stone: list(), wood: list(), trim: list(), glow: list(), metal: list() } satisfies Parts;

  parts.floor.push(box(2 * W + 2 * T, 0.2, zStart - zEnd, [0, -0.1, (zStart + zEnd) / 2]));
  parts.wall.push(at(archedWall(-W - T, W + T, WALL_TOP, P, [door]), [0, 0, zEnd]));
  parts.trim.push(at(archBand(frame, 0.27, P + 0.16), [0, 0, zEnd - 0.08]));
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
    parts.trim.push(at(archBand(frame, 0.27, P + 0.16), [0, 0, -0.08]));
    // The forecourt the walk begins on, two buttresses flanking the door, and the daylight
    // seen through the door when you look back.
    parts.stone.push(box(2 * W + 2 * T, 0.2, FORECOURT, [0, -0.1, P + FORECOURT / 2]));
    for (const side of [-1, 1]) {
      parts.stone.push(box(0.7, 6.2, 0.5, [side * 3.3, 3.1, P + 0.25]));
      parts.stone.push(box(0.7, 1.6, 0.9, [side * 3.3, 0.8, P + 0.45]));
    }
    parts.glow.push(at(new PlaneGeometry(24, 14), [0, 5, P + FORECOURT + 1], [0, Math.PI, 0]));
  }
  return parts;
}

/** A lancet's mullion, transom and sill, and the daylight behind it: at `p` in the middle of a wall whose normal into the room is (nx, nz). */
function lancet(parts: ReturnType<typeof ends>, p: [number, number], nx: number, nz: number, springAt: number) {
  const yaw = Math.atan2(nx, nz);
  const top = springAt + archRise(2 * WINDOW.half, 1);
  const [x, z] = p;
  parts.stone.push(box(0.08, top - WINDOW.sill - 0.1, 0.08, [x, (top + WINDOW.sill) / 2 - 0.05, z]));
  parts.stone.push(box(2 * WINDOW.half, 0.08, 0.08, [x, springAt, z], [0, yaw, 0]));
  parts.stone.push(box(2 * WINDOW.half + 0.3, 0.1, T + 0.16, [x + nx * 0.08, WINDOW.sill - 0.05, z + nz * 0.08], [0, yaw, 0]));
  // The daylight outside, facing into the room.
  parts.glow.push(at(new PlaneGeometry(2 * WINDOW.half + 0.5, top - WINDOW.sill + 0.5), [x - nx * (T / 2 + 0.03), (top + WINDOW.sill) / 2, z - nz * (T / 2 + 0.03)], [0, yaw, 0]));
}

function buildHall(props: KitRoomProps): Parts {
  const { index, plan, mirrored } = props;
  const v = VARIANTS[index % VARIANTS.length];
  const { halfWidth: W, length: L, partition: P } = plan;
  const zStart = index === 0 ? P : 0;
  const span = zStart + L + P;
  const parts = ends(props);

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
    for (const z of windows) lancet(parts, [side * (W + T / 2), z], -side, 0, springAt);
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
    for (const side of [-1, 1]) line(INLAY, 12.4, side * 2.1, -7.2);
    for (const z of BAYS.slice(0, 4)) line(4.2, INLAY, 0, z);
    line(4.2, INLAY, 0, -1);
    line(4.2, INLAY, 0, -13.4);
  } else if (v.floor === 'aisle') {
    for (const side of [-1, 1]) {
      line(INLAY, 12.4, side * 1.45, -7.2);
      line(INLAY, 12.4, side * 1.75, -7.2);
    }
  } else {
    for (const z of [-3.5, -6.5, -9.5, -12.5]) {
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) line(2.05, INLAY, dx * 0.725, z + dz * 0.725, dx * dz * (Math.PI / 4));
    }
  }
  return parts;
}

/** The ring: a chapter house. Eight sides under a ribbed pyramid of stone, one lancet in the side that has no plot. */
const RING_EAVES = 5.6;
const RING_RISE = 3.6;
export const GOTHIC_RING_MOOD = 'Eight-sided and still. A chapter house under a ribbed stone roof, one lancet where the circle closes.';

function buildRing(props: KitRoomProps): Parts {
  const { plan, mirrored } = props;
  const R = plan.halfWidth;
  const parts = ends(props);
  const half = R * Math.tan(Math.PI / 8);
  const corner = R / Math.cos(Math.PI / 8);
  const apex: [number, number, number] = [0, RING_EAVES + RING_RISE, -R];
  /** A point `r` from the centre, `degrees` round from the entrance (towards the left wall first). */
  const round = (degrees: number, r: number): [number, number] => {
    const a = (degrees * Math.PI) / 180;
    return [-r * Math.sin(a), -R + r * Math.cos(a)];
  };

  // The six sides that are not doorways. The plots stand before five; the sixth (the last
  // before the circle closes, right of the entrance) has the window.
  const windowAt = mirrored ? 45 : 315;
  for (const degrees of [45, 90, 135, 225, 270, 315]) {
    const [x, z] = round(degrees, R);
    const a = (degrees * Math.PI) / 180;
    const nx = Math.sin(a);
    const nz = -Math.cos(a);
    const yaw = Math.atan2(nx, nz);
    const lit = degrees === windowAt;
    const openings: ArchOpening[] = lit ? [{ x0: -WINDOW.half, x1: WINDOW.half, y0: WINDOW.sill, spring: 3.4, point: 1 }] : [];
    // Drawn facing +z from its outer face, then turned to face the middle of the room.
    parts.wall.push(at(archedWall(-half - 0.15, half + 0.15, RING_EAVES, T, openings), [x - nx * T, 0, z - nz * T], [0, yaw, 0]));
    parts.trim.push(box(2 * half, 0.16, 0.12, [x + nx * 0.06, RING_EAVES - 0.08, z + nz * 0.06], [0, yaw, 0]));
    if (lit) lancet(parts, [x - (nx * T) / 2, z - (nz * T) / 2], nx, nz, 3.4);
  }

  // The roof: eight flat cells from the eaves to a boss over the middle, a rib up every hip.
  const cells: number[] = [];
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = round(22.5 + 45 * k, corner + 0.05);
    const [x1, z1] = round(67.5 + 45 * k, corner + 0.05);
    // Wound to face down into the room.
    cells.push(...apex, x0, RING_EAVES, z0, x1, RING_EAVES, z1);
    const [hx, hz] = round(22.5 + 45 * k, corner - 0.1);
    const hip = limb([hx, RING_EAVES - 0.12, hz], [apex[0], apex[1] - 0.2, apex[2]], 0.1);
    parts.stone.push(at(new CylinderGeometry(1, 1, 1, 6), hip.p, hip.r, hip.s));
  }
  const roof = new BufferGeometry();
  roof.setAttribute('position', new Float32BufferAttribute(cells, 3));
  roof.setAttribute('uv', new Float32BufferAttribute(new Float32Array((cells.length / 3) * 2), 2));
  roof.computeVertexNormals();
  parts.ceiling.push(roof);
  parts.stone.push(at(new CylinderGeometry(0.34, 0.26, 0.5, 8), [apex[0], apex[1] - 0.4, apex[2]]));

  // The floor inlay: two eight-sided lines round the middle, inside the ring of plots.
  for (const r of [2.2, 3.5]) parts.trim.push(at(new RingGeometry(r - INLAY, r, 8, 1, Math.PI / 8), [0, 0.008, -R], [-HALF_PI, 0, 0]));
  return parts;
}

export function GothicRoom(props: KitRoomProps) {
  const { index, shape, plan, plots, mirrored, open } = props;
  const make = useCallback(() => (shape === 'ring' ? buildRing : buildHall)({ index, shape, plan, plots, mirrored, open }), [index, shape, plan, plots, mirrored, open]);
  return <Welded build={make} />;
}
