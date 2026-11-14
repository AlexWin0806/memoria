import { useCallback } from 'react';
import { type BufferGeometry, CylinderGeometry, ExtrudeGeometry, RingGeometry, Shape, SphereGeometry, Vector2 } from 'three';
import { type Parts, Welded, archedWall, at, box, shell } from '@/layouts/kits/build';
import type { KitRoomProps, RoomPlan } from '@/layouts/kits/types';
import { limb, ribbonGeometry } from '@/layouts/props/parts';
import { rockGeometry, scatter } from './rocks';

/**
 * One court of the Zen garden: open sky, a low plastered wall with a tile coping down each
 * side, and across the route a tall clipped hedge with a roofed gate in it. The plan is the
 * generator's; what changes from court to court is the ground (pale gravel or moss), what is
 * drawn on it, the path down the middle and what looks over the side walls, so that two
 * neighbouring courts are never taken for each other (art bible: the route alternates bright
 * and dim, warm and cool).
 */
interface Variant {
  ground: 'gravel' | 'moss';
  /** Gravel raked in long lines beside the path. */
  raked: boolean;
  path: 'stepping' | 'paved' | 'chequer';
  /** Low rocks on islands of moss by the walls, where no place stands: ringed with ripples in gravel. */
  islands: 'ringed' | 'plain' | 'none';
  /** A dry stream of pebbles across the court. */
  stream: boolean;
  /** What stands behind the side walls and looks over them. Far hills lie behind every court. */
  beyond: 'trees' | 'bamboo' | 'open';
  mood: string;
}

const VARIANTS: Variant[] = [
  { ground: 'gravel', raked: true, path: 'stepping', islands: 'ringed', stream: false, beyond: 'trees', mood: 'Bright and bare. Pale gravel raked in long lines, low rocks ringed with ripples, stepping stones down the middle.' },
  { ground: 'moss', raked: false, path: 'paved', islands: 'none', stream: false, beyond: 'bamboo', mood: 'Dim and green. A court of moss under tall bamboo, crossed by a straight path of cut stone.' },
  { ground: 'gravel', raked: false, path: 'stepping', islands: 'none', stream: true, beyond: 'open', mood: 'Open and cool. A dry stream of pebbles winds across bare gravel under a wide sky.' },
  { ground: 'moss', raked: false, path: 'chequer', islands: 'none', stream: false, beyond: 'trees', mood: 'Soft and shaded. Square stones set chequerwise into moss, clipped trees looking over the wall.' },
  { ground: 'gravel', raked: true, path: 'paved', islands: 'none', stream: false, beyond: 'bamboo', mood: 'Cool and still. Raked gravel either side of a cut-stone path, bamboo beyond the wall.' },
  { ground: 'moss', raked: false, path: 'stepping', islands: 'plain', stream: false, beyond: 'open', mood: 'Quiet and green. Stepping stones through moss past low rocks: the innermost court.' },
];

export const ZEN_MOODS = VARIANTS.map((v) => v.mood);

/** Thickness of the side walls. */
const T = 0.3;
/**
 * The side walls stand this far outside the plan's wall line, so that their coping overhangs
 * nothing inside it: a wall feature hangs on that line, on a `ZenBackdrop`.
 */
const SETBACK = 0.25;
/** Top of the plaster of the side walls: above eye height, below the crowns of the trees beyond. */
const WALL = 2.1;
/** And of the wall along the front of the garden, which stops short of the name tablet. */
const FRONT_WALL = 1.9;
/**
 * Top of the hedges across the route, the same for every court: one court is seen from
 * another only through the gates (the generator relies on it, see KitDef.Room).
 */
const HEDGE = 5.2;
/** The hedge stands this far behind the plane the name tablet and a landmark's backdrop are on. */
const HEDGE_BACK = 0.04;
/** Gate posts: their width, and their height (the top of the name panel). */
const POST = 0.26;
const HEAD = 3.3;
/** Underside of the gate's lintel. */
const LINTEL = 2.02;
/** Middle of the plaster panel between the lintel and the head of the gate: the name tablet hangs there. */
export const ZEN_SIGN_HEIGHT = 2.77;
/** The gate's roof in section, eaves to ridge to eaves: it rises more steeply towards the ridge. */
const ROOF: [number, number][] = [[-1.2, 3.38], [-0.8, 3.52], [-0.4, 3.72], [0, 3.98], [0.4, 3.72], [0.8, 3.52], [1.2, 3.38]];
const ROOF_HALF = 1.95;
/** Gravel before the front gate: the walk begins 8 m out. The front hedge is this wide either side, so nothing shows past its ends. */
const FORECOURT = 10;
const FRONT_REACH = 13;
/** How far past the middle of a gap between two places the trees and bamboo beyond the wall stand. */
const PAST = 0.45;
/** Width of a raked line: thin enough to draw as one quiet ink line. */
const LINE = 0.035;

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

const list = (): BufferGeometry[] => [];
const lists = () => ({ floor: list(), foliage: list(), stone: list(), wall: list(), ceiling: list(), wood: list(), trim: list(), metal: list() }) satisfies Parts;
type Court = ReturnType<typeof lists>;

/** An outline in XY extruded `length` along +z. */
function prism(points: [number, number][], length: number): BufferGeometry {
  return new ExtrudeGeometry(new Shape(points.map(([x, y]) => new Vector2(x, y))), { depth: length, bevelEnabled: false });
}

/** Turns a prism to run along +x from `x0`; its outline's x then runs towards -z from `z`. */
const alongX = (g: BufferGeometry, x0: number, z: number) => at(g, [x0, 0, z], [0, HALF_PI, 0]);

/** A tile coping in section: a little roof `half` wide either side of the wall's middle, standing on y. */
const coping = (half: number, y: number): [number, number][] => [[-half, y], [half, y], [half, y + 0.06], [0.05, y + 0.34], [-0.05, y + 0.34], [-half, y + 0.06]];

const rock = (p: [number, number, number], s: [number, number, number], turn: number) => at(rockGeometry(Math.round(turn * 10)), p, [0.2, turn, 0.1], s);
const mound = (p: [number, number, number], s: [number, number, number]) => at(new SphereGeometry(1, 16, 8), p, [0, 0, 0], s);

/**
 * What crosses the route at the end of a court: a clipped hedge the whole width, and in it a
 * gate of two posts under a tiled roof. `z0` is the plane the name tablet hangs on; the
 * plaster panel over the lintel carries it.
 */
function crossing(parts: Court, plan: RoomPlan, z0: number, shut: boolean, reach: number) {
  const P = plan.partition;
  const D = plan.door.halfWidth;
  const jamb = D + POST;
  const zc = z0 - P / 2;
  const thick = P - 2 * HEDGE_BACK;
  const shoulder = HEDGE - 0.25;

  parts.foliage.push(at(archedWall(-reach, reach, shoulder, thick, [{ x0: -jamb, x1: jamb, spring: HEAD + 0.14, point: 0 }]), [0, 0, zc - thick / 2]));
  // Clipped to a chamfer along the top.
  parts.foliage.push(alongX(prism([[-thick / 2, shoulder], [thick / 2, shoulder], [thick / 2 - 0.13, HEDGE], [-thick / 2 + 0.13, HEDGE]], 2 * reach), -reach, zc));

  for (const s of [-1, 1]) parts.wood.push(box(POST, HEAD, P + 0.08, [s * (D + POST / 2), HEAD / 2, zc]));
  parts.wood.push(box(2 * D, 0.22, P + 0.04, [0, LINTEL + 0.11, zc]));
  parts.wall.push(box(2 * D, HEAD - LINTEL - 0.22, P, [0, (HEAD + LINTEL + 0.22) / 2, zc]));
  parts.wood.push(box(2 * jamb + 0.3, 0.14, P + 0.2, [0, HEAD + 0.07, zc]));
  parts.ceiling.push(alongX(shell(ROOF, 0.12, 2 * ROOF_HALF), -ROOF_HALF, zc));
  // The arms that carry the eaves: one over each post, lying on the head beam.
  for (const s of [-1, 1]) parts.wood.push(box(0.14, 0.1, 1.4, [s * (D + POST / 2), HEAD + 0.19, zc]));
  parts.stone.push(box(2 * D, 0.05, P + 0.3, [0, 0.02, zc]));

  if (shut) {
    // Two boarded leaves, battened, and the bar that holds them until a court is laid out beyond.
    for (const s of [-1, 1]) {
      parts.wood.push(box(D - 0.02, LINTEL - 0.03, 0.07, [(s * D) / 2, (LINTEL - 0.03) / 2, zc]));
      for (const y of [0.32, 1.68]) parts.wood.push(box(D - 0.16, 0.1, 0.03, [(s * D) / 2, y, zc + 0.05]));
      parts.metal.push(box(0.08, 0.22, 0.04, [s * 0.5, 1.02, zc + 0.115]));
    }
    parts.wood.push(box(1.5, 0.11, 0.07, [0, 1.02, zc + 0.075]));
  }
}

/** Stepping stones on the walking line: flat, a little irregular, left foot then right. */
function stepping(parts: Court, from: number, to: number, skip?: (z: number) => boolean) {
  let k = 0;
  for (let z = from; z >= to; z -= 0.92, k++) {
    if (skip?.(z)) continue;
    const x = (k % 2 ? 1 : -1) * (0.12 + 0.08 * scatter(k, 1));
    const r = 0.3 + 0.06 * scatter(k, 2);
    parts.stone.push(at(new CylinderGeometry(1, 1.05, 1, 7), [x, 0.02, z], [0, scatter(k, 3) * TAU, 0], [r * (1 + 0.3 * scatter(k, 4)), 0.05, r]));
  }
}

function buildCourt({ index, plan, plots, open }: KitRoomProps): Parts {
  const v = VARIANTS[index % VARIANTS.length];
  const { halfWidth: W, length: L, partition: P } = plan;
  const first = index === 0;
  const zStart = first ? P : 0;
  const zEnd = -(L + P);
  const span = zStart - zEnd;
  const mid = (zStart + zEnd) / 2;
  const inner = W + SETBACK;
  const outer = inner + T;
  const parts = lists();
  /** The side the first place stands on, and the point by a wall across the court from plot `i`: nothing stands there. */
  const f = Math.sign(plots[0].wall[0]) || -1;
  const across = (i: number, inset: number): [number, number] => [-Math.sign(plots[i].wall[0]) * (W - inset), plots[i].wall[1]];

  (v.ground === 'moss' ? parts.foliage : parts.floor).push(box(2 * outer, 0.2, span, [0, -0.1, mid]));
  // The side walls run into the hedges at both ends.
  const run = (first ? P / 2 : 0) - zEnd;
  for (const s of [-1, 1]) {
    const x = s * (inner + T / 2);
    parts.wall.push(box(T, WALL, run, [x, WALL / 2, zEnd + run / 2]));
    parts.ceiling.push(at(prism(coping(T / 2 + 0.22, WALL - 0.02), run), [x, 0, zEnd]));
  }
  crossing(parts, plan, -L, !open, outer);
  if (first) {
    parts.floor.push(box(2 * FRONT_REACH, 0.2, FORECOURT, [0, -0.1, P + FORECOURT / 2]));
    crossing(parts, plan, P, false, FRONT_REACH);
    // Seen from outside, the garden wall stands before its hedge: lower than the name over the gate.
    const reach = FRONT_REACH - plan.door.halfWidth - POST;
    for (const s of [-1, 1]) {
      const x = s * (FRONT_REACH - reach / 2);
      parts.wall.push(box(reach, FRONT_WALL, 0.26, [x, FRONT_WALL / 2, P + 0.09]));
      parts.ceiling.push(alongX(prism(coping(0.3, FRONT_WALL - 0.02), reach), x - reach / 2, P + 0.09));
    }
    stepping(parts, P + 9.4, P + 0.9);
    // Clipped shrubs either side of the gate.
    for (const s of [-1, 1]) {
      parts.foliage.push(mound([s * 3.1, 0, P + 1.2], [1.0, 0.62, 0.72]));
      parts.foliage.push(mound([s * 4.5, 0, P + 1.4], [0.7, 0.44, 0.6]));
    }
  }

  // The path down the middle, from gate to gate.
  if (v.path === 'stepping') {
    stepping(parts, -0.75, -L + 0.7, v.stream ? (z) => z < -6.9 && z > -9.0 : undefined);
  } else if (v.path === 'paved') {
    // Cut stone in two rows, the joints of one against the middles of the other.
    for (const s of [-1, 1]) {
      for (let z = s < 0 ? -0.5 : -1.05; z - 1.1 > -L + 0.3; z -= 1.14) parts.stone.push(box(0.56, 0.05, 1.1, [s * 0.3, 0.02, z - 0.55]));
    }
  } else {
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 0) parts.stone.push(box(0.56, 0.05, 0.56, [(col - 1.5) * 0.6, 0.02, -0.8 - row * 0.6]));
      }
    }
  }

  if (v.raked) {
    for (const s of [-1, 1]) for (const x of [0.85, 1.25, 1.65, 2.05]) parts.trim.push(box(LINE, 0.012, 12.2, [s * x, 0.006, -7]));
  }

  if (v.islands !== 'none') {
    const isles: { at: [number, number]; size: number; rings: number[] }[] = [
      { at: across(1, 0.8), size: 1, rings: [1.15, 1.4, 1.65] },
      { at: across(2, 0.8), size: 0.8, rings: [1.0, 1.25] },
    ];
    for (const [k, isle] of isles.entries()) {
      const [x, z] = isle.at;
      const s = Math.sign(x);
      parts.foliage.push(mound([x, 0, z], [0.62 * isle.size, 0.13 * isle.size, 0.95 * isle.size]));
      parts.stone.push(rock([x + s * 0.05, 0.26 * isle.size, z - 0.2 * isle.size], [0.3 * isle.size, 0.34 * isle.size, 0.27 * isle.size], k * 1.3));
      if (!k) parts.stone.push(rock([x - s * 0.08, 0.14, z + 0.48], [0.2, 0.15, 0.18], 2.1));
      if (v.islands === 'ringed') {
        // Ripples raked round the island, as far as the wall.
        const toWall = inner - Math.abs(x);
        for (const r of isle.rings) {
          const cut = Math.acos(Math.min(1, toWall / r));
          parts.trim.push(at(new RingGeometry(r - LINE, r, 40, 1, (s > 0 ? 0 : Math.PI) + cut, TAU - 2 * cut), [x, 0.008, z], [-HALF_PI, 0, 0]));
        }
      }
    }
  }

  if (v.stream) {
    // From the wall across from the second place to the wall across from the third, between their plots.
    const bed: [number, number][] = [[f * (inner + 0.1), 6.2], [f * 3.2, 6.5], [f * 1.2, 7.4], [-f * 1.2, 8.5], [-f * 3.2, 9.4], [-f * (inner + 0.1), 9.7]];
    parts.stone.push(at(ribbonGeometry(bed, 1, 0.02), [0, 0, 0], [-HALF_PI, 0, 0]));
    parts.stone.push(box(1.0, 0.07, 1.9, [0, 0.045, -7.95]));
    parts.stone.push(rock([f * 2.5, 0.14, -6.15], [0.3, 0.2, 0.24], 0.4));
    parts.stone.push(rock([-f * 2.3, 0.15, -9.8], [0.32, 0.22, 0.25], 1.9));
    parts.stone.push(rock([-f * 1.75, 0.1, -7.95], [0.22, 0.15, 0.2], 3.0));
    parts.foliage.push(mound([f * 2.9, 0, -7.35], [0.7, 0.1, 0.4]));
  }

  // Beyond the side walls: what looks over them, behind stretches of wall no place stands by.
  // A place is looked at from a little nearer the entrance, so what is behind its memory image
  // is the wall just past it: these stand a step further on than the middle of the gap.
  if (v.beyond === 'trees') {
    // Two clipped trees, one behind each wall, at opposite ends of the court.
    for (const i of [0, 3]) {
      const [x, mid] = across(i, -T - SETBACK - 1.5);
      const z = mid - PAST;
      const s = Math.sign(x);
      parts.foliage.push(mound([x, 2.9, z], [1.3, 1.05, 1.25]));
      parts.foliage.push(mound([x + s * 0.7, 3.45, z + (i ? 0.8 : -0.8)], [0.85, 0.7, 0.85]));
    }
  } else if (v.beyond === 'bamboo') {
    // A clump of bamboo across from every side place: slim culms, each ending in a plume of leaves that nods outwards.
    for (let i = 0; i < 4; i++) {
      const [x, mid] = across(i, -T - SETBACK - 0.9);
      const z = mid - PAST;
      const s = Math.sign(x);
      for (let c = 0; c < 7; c++) {
        const k = i * 7 + c;
        const foot: [number, number, number] = [x + s * 0.5 * scatter(k, 7), 0, z + (c - 3) * 0.28 + 0.1 * scatter(k, 6)];
        const h = 3.7 + 0.9 * scatter(k, 8);
        const nod = (c - 3) * 0.1;
        const head: [number, number, number] = [foot[0] - s * 0.25, h, foot[2] + nod];
        const culm = limb(foot, head, 0.04);
        parts.foliage.push(at(new CylinderGeometry(1, 1, 1, 6), culm.p, culm.r, culm.s));
        const from: [number, number, number] = [head[0] + s * 0.03, h - 1.0, head[2] - nod * 0.4];
        const to: [number, number, number] = [head[0] - s * 0.22, h + 0.45, head[2] + nod * 0.9];
        const plume = limb(from, to, 0.2);
        parts.foliage.push(at(new SphereGeometry(1, 8, 8), plume.p, plume.r, [0.2, Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / 2, 0.2]));
      }
    }
  }
  // Far hills, low enough to show only from across the court.
  for (const s of [-1, 1]) {
    const k = index * 2 + (s > 0 ? 1 : 0);
    parts.foliage.push(at(new SphereGeometry(1, 24, 10), [s * (38 + 5 * scatter(k, 9)), -1, mid + 6 * (scatter(k, 10) - 0.5)], [0, 0, 0], [15, 6.5 + 2.5 * scatter(k, 11), 20]));
  }
  return parts;
}

export function ZenRoom(props: KitRoomProps) {
  const { index, shape, plan, plots, mirrored, open } = props;
  const make = useCallback(() => buildCourt({ index, shape, plan, plots, mirrored, open }), [index, shape, plan, plots, mirrored, open]);
  return <Welded build={make} />;
}

/**
 * What a wall feature hangs on: a taller stretch of the garden wall, plastered, under its
 * own tile coping. Its face is the plane z = 0 (see KitDef.Backdrop).
 */
export function ZenBackdrop() {
  const make = useCallback(
    (): Parts => ({
      wall: [box(2.6, 3.4, T + 0.04, [0, 1.7, -(T + 0.04) / 2])],
      ceiling: [alongX(prism(coping(T / 2 + 0.22, 3.38), 2.76), -1.38, -(T + 0.04) / 2)],
    }),
    [],
  );
  return <Welded build={make} />;
}
