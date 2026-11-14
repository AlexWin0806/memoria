import type { Deck, LinkKind } from '@/core/types';
import { planLayout } from '@/layouts/generated/plan';
import { parsePalaceId } from '@/layouts/spec';
import type { PalaceLayout } from '@/layouts/types';
import { viaBetween } from './rail';

/**
 * Where a link between two places runs on the floor. Never a straight line through walls:
 * out from the first place to the route, along the route (through the doorways), and in to
 * the second place.
 *
 * The route on the floor is a small graph, the trunk:
 *   a generated hall     its axis, from doorway to doorway; each place joins it square-on
 *   a generated ring     a circle round the room, inside the ring of places, with a stub to
 *                        each doorway: a link runs round it as an arc
 *   any other palace     the line from place to place in route order, through the layout's
 *                        `via` waypoints, bent round every place's footprint
 * Links that share a stretch of trunk run side by side in lanes, one lane per link for its
 * whole length, so two never lie on top of each other; where several links meet one place,
 * their last stretches (the spurs) run side by side too.
 *
 * Pure numbers (x, z pairs on the floor): no three, nothing measured in the scene.
 */

/** Most links drawn for one deck. The reveal of each is one entry of a uniform array. */
export const MAX_LINKS = 48;
/** Distance between two lanes, centre to centre, when there is room for it. */
export const LANE = 0.24;
/** The lanes of one stretch stay within this distance of the trunk: a doorway is 2.2 m wide. */
const MAX_SPREAD = 0.82;
/** Distance between the spurs of two links at one place. */
const SLOT = 0.3;
/** A spur ends this far outside the footprint of its place, and is never shorter than MIN_SPUR. */
const SPUR_GAP = 0.12;
const MIN_SPUR = 0.5;
/** Generated rooms: the trunk comes this close to the wall a doorway is in. */
const DOOR_IN = 0.5;
/** A ring's trunk circle, as a share of the distance from the centre of the room to its sides. */
const RING_TRUNK = 0.62;
const RING_STEPS = 72;
/** A flow (`becomes`) goes the way the route goes round a ring unless that is this many times longer. */
const AGAINST_FLOW = 1.9;
/** Other palaces: the trunk passes this far outside the footprint of the place it serves, and of every other. */
const STATION_OUT = 0.55;
const KEEP_CLEAR = 0.32;
/** Corners are rounded with this radius. */
const FILLET = 0.2;

interface Edge {
  to: number;
  len: number;
  /** 1: the way the route goes round a ring room. -1: against it. 0: not part of a ring. */
  ring: number;
}

interface Stop {
  vert: number;
  /** The floor point of the place and the radius of the floor its feature covers. */
  x: number;
  z: number;
  footprint: number;
}

interface Net {
  x: number[];
  z: number[];
  /** The direction lanes are set off in at each vertex: a unit vector (longer at a sharp corner, to keep lanes apart). */
  nx: number[];
  nz: number[];
  edges: Edge[][];
  /** By locus index. */
  stops: (Stop | undefined)[];
}

function vert(net: Net, x: number, z: number, nx: number, nz: number): number {
  net.x.push(x);
  net.z.push(z);
  net.nx.push(nx);
  net.nz.push(nz);
  net.edges.push([]);
  return net.x.length - 1;
}

function join(net: Net, a: number, b: number, ring = 0): void {
  const len = Math.max(1e-4, Math.hypot(net.x[b] - net.x[a], net.z[b] - net.z[a]));
  net.edges[a].push({ to: b, len, ring });
  net.edges[b].push({ to: a, len, ring: -ring });
}

function spotOf(layout: PalaceLayout, index: number): [number, number] {
  const p = layout.focus?.[index] ?? layout.loci[index].anchor;
  return [p[0], p[2]];
}

/** A generated palace: halls and rings on one axis, as the generator plans them. */
function generatedNet(layout: PalaceLayout): Net | null {
  const spec = parsePalaceId(layout.id);
  if (!spec) return null;
  const plan = planLayout(spec);
  if (plan.meta.loci.length !== layout.loci.length) return null;
  const net: Net = { x: [], z: [], nx: [], nz: [], edges: [], stops: [] };
  /** The end of the trunk of the room before, by its far doorway. */
  let last = -1;
  for (const room of plan.rooms) {
    const [x0, , z0] = room.origin;
    const { length, halfWidth } = room.plan;
    const loci = layout.loci.filter((l) => l.roomId === room.spec.id);
    const more = room.index < plan.rooms.length - 1;
    let prev = last;
    if (last >= 0) {
      prev = vert(net, x0, z0 - DOOR_IN, 1, 0);
      join(net, last, prev);
    }
    if (room.shape === 'ring') {
      const cz = z0 - halfWidth;
      const r = halfWidth * RING_TRUNK;
      const first = net.x.length;
      for (let j = 0; j < RING_STEPS; j++) {
        const a = (j / RING_STEPS) * Math.PI * 2;
        // Round from the entrance towards the left wall first, as the places stand; lanes are set off inwards.
        vert(net, x0 - r * Math.sin(a), cz + r * Math.cos(a), Math.sin(a), -Math.cos(a));
      }
      for (let j = 0; j < RING_STEPS; j++) join(net, first + j, first + ((j + 1) % RING_STEPS), 1);
      if (prev >= 0) {
        // The stub from the entrance keeps its own lanes right up to the circle.
        const foot = vert(net, x0, cz + r, 1, 0);
        join(net, prev, foot);
        join(net, foot, first);
      }
      for (const l of loci) {
        const [sx, sz] = spotOf(layout, l.index);
        const a = Math.atan2(-(sx - x0), sz - cz);
        const j = ((Math.round((a / (Math.PI * 2)) * RING_STEPS) % RING_STEPS) + RING_STEPS) % RING_STEPS;
        net.stops[l.index] = { vert: first + j, x: sx, z: sz, footprint: layout.footprint?.[l.index] ?? 0.5 };
      }
      last = -1;
      if (more) {
        const foot = vert(net, x0, cz - r, 1, 0);
        join(net, first + RING_STEPS / 2, foot);
        last = vert(net, x0, z0 - length + DOOR_IN, 1, 0);
        join(net, foot, last);
      }
    } else {
      for (const l of loci) {
        const [sx, sz] = spotOf(layout, l.index);
        const v = vert(net, x0, sz, 1, 0);
        if (prev >= 0) join(net, prev, v);
        prev = v;
        net.stops[l.index] = { vert: v, x: sx, z: sz, footprint: layout.footprint?.[l.index] ?? 0.5 };
      }
      last = -1;
      if (more && prev >= 0) {
        last = vert(net, x0, z0 - length + DOOR_IN, 1, 0);
        join(net, prev, last);
      }
    }
  }
  return net;
}

interface Waypoint {
  x: number;
  z: number;
  /** The locus this point is the station of, or -1. */
  stop: number;
}

/** Bends a line round a disc it would cross: the stretch inside is replaced by the shorter way round the rim. */
function roundDisc(line: Waypoint[], cx: number, cz: number, radius: number): Waypoint[] {
  const out: Waypoint[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    out.push(a);
    const b = line[i + 1];
    if (!b) break;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const fx = a.x - cx;
    const fz = a.z - cz;
    const qa = dx * dx + dz * dz;
    const qb = 2 * (fx * dx + fz * dz);
    const qc = fx * fx + fz * fz - radius * radius;
    const disc = qb * qb - 4 * qa * qc;
    if (qa < 1e-9 || disc <= 0) continue;
    const root = Math.sqrt(disc);
    const t1 = (-qb - root) / (2 * qa);
    const t2 = (-qb + root) / (2 * qa);
    // Only a line that goes in and comes out again: one that starts or ends inside has business there.
    if (t1 <= 0 || t2 >= 1) continue;
    const a1 = Math.atan2(fz + dz * t1, fx + dx * t1);
    let turn = Math.atan2(fz + dz * t2, fx + dx * t2) - a1;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.3));
    for (let k = 0; k <= steps; k++) {
      const at = a1 + (turn * k) / steps;
      out.push({ x: cx + Math.cos(at) * radius, z: cz + Math.sin(at) * radius, stop: -1 });
    }
  }
  return out;
}

/** Any other palace: from place to place in route order, as the camera rail goes. */
function routeNet(layout: PalaceLayout): Net {
  const net: Net = { x: [], z: [], nx: [], nz: [], edges: [], stops: [] };
  const spots = layout.loci.map((l) => {
    const [x, z] = spotOf(layout, l.index);
    return { x, z, footprint: layout.footprint?.[l.index] ?? 0.5 };
  });
  let line: Waypoint[] = [];
  layout.loci.forEach((l, i) => {
    const s = spots[i];
    // The station of a place: just outside its footprint, on the side the learner looks at it from.
    let dx = l.view.position[0] - s.x;
    let dz = l.view.position[2] - s.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 1;
    }
    const out = Math.min(s.footprint + STATION_OUT, Math.max(0.2, d - 0.3));
    if (i > 0) for (const v of viaBetween(layout, i - 1, i)) line.push({ x: v[0], z: v[2], stop: -1 });
    line.push({ x: s.x + dx * out, z: s.z + dz * out, stop: i });
  });
  for (const s of spots) line = roundDisc(line, s.x, s.z, s.footprint + KEEP_CLEAR);
  line = line.filter((p, i) => i === 0 || p.stop >= 0 || Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z) > 0.05);
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    // The left-hand side of each neighbouring stretch, averaged; lengthened at a corner so lanes keep their distance.
    const side = (from: Waypoint, to: Waypoint): [number, number] => {
      const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      return [(to.z - from.z) / len, -(to.x - from.x) / len];
    };
    const [ax, az] = i > 0 ? side(a, p) : side(p, b);
    const [bx, bz] = i < line.length - 1 ? side(p, b) : [ax, az];
    const len = Math.hypot(ax + bx, az + bz);
    const nx = len > 1e-3 ? (ax + bx) / len : ax;
    const nz = len > 1e-3 ? (az + bz) / len : az;
    const mitre = 1 / Math.max(0.5, nx * ax + nz * az);
    const v = vert(net, p.x, p.z, nx * mitre, nz * mitre);
    if (i > 0) join(net, v - 1, v);
    if (p.stop >= 0) net.stops[p.stop] = { vert: v, ...spots[p.stop] };
  });
  return net;
}

/** The cheapest way along the trunk from one vertex to another, as vertex indices. */
function walk(net: Net, from: number, to: number, flow: boolean): number[] | null {
  const n = net.x.length;
  const cost = new Float64Array(n).fill(Infinity);
  const back = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of net.edges[u]) {
      // A flow runs the way the route does. Anything else takes the shorter way, and of two
      // equal ways the one back along the route (feedback is drawn beside the steps it skips).
      const weight = flow ? (e.ring < 0 ? AGAINST_FLOW : 1) : e.ring > 0 ? 1.0005 : 1;
      const c = cost[u] + e.len * weight;
      if (c < cost[e.to]) {
        cost[e.to] = c;
        back[e.to] = u;
      }
    }
  }
  if (cost[to] === Infinity) return null;
  const out = [to];
  for (let v = to; v !== from; ) {
    v = back[v];
    out.push(v);
  }
  return out.reverse();
}

/** Lane number to signed steps from the trunk: 0, 1, -1, 2, -2, ... */
const laneStep = (lane: number) => ((lane + 1) >> 1) * (lane % 2 ? 1 : -1);

const FLOW_FIRST: Record<LinkKind, number> = { becomes: 0, mirrors: 1, needs: 2, blocks: 3 };

/** Length of a line of x, z pairs. */
export function lineLength(line: number[]): number {
  let len = 0;
  for (let i = 2; i < line.length; i += 2) len += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return len;
}

/** Takes `by` metres off the start of a line; a negative `by` lengthens it backwards instead. */
function trimStart(line: number[], by: number): number[] {
  if (line.length < 4 || Math.abs(by) < 1e-4) return line;
  if (by < 0) {
    const dx = line[2] - line[0];
    const dz = line[3] - line[1];
    const len = Math.hypot(dx, dz) || 1;
    return [line[0] + (dx / len) * by, line[1] + (dz / len) * by, ...line];
  }
  let left = by;
  for (let i = 2; i < line.length; i += 2) {
    const seg = Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
    if (seg > left || i === line.length - 2) {
      const f = seg > 1e-6 ? Math.min(0.95, left / seg) : 0;
      return [line[i - 2] + (line[i] - line[i - 2]) * f, line[i - 1] + (line[i + 1] - line[i - 1]) * f, ...line.slice(i)];
    }
    left -= seg;
  }
  return line;
}

function reversed(line: number[]): number[] {
  const out: number[] = [];
  for (let i = line.length - 2; i >= 0; i -= 2) out.push(line[i], line[i + 1]);
  return out;
}

/** A line with `start` metres taken off its beginning and `end` metres off its end (room for a mark). */
export function shortened(line: number[], start: number, end: number): number[] {
  const cut = start > 0 ? trimStart(line, start) : line;
  return end > 0 ? reversed(trimStart(reversed(cut), end)) : cut;
}

/** Drops the points at which a line doubles back on itself (where two stretches of trunk with different lanes meet). */
function untangle(line: number[]): number[] {
  const out = line.slice();
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 2; i < out.length - 2; i += 2) {
      const ax = out[i] - out[i - 2];
      const az = out[i + 1] - out[i - 1];
      const bx = out[i + 2] - out[i];
      const bz = out[i + 3] - out[i + 1];
      const tiny = Math.hypot(ax, az) < 1e-3;
      if (tiny || ax * bx + az * bz < 0) {
        out.splice(i, 2);
        changed = true;
        i -= 2;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Rounds every real corner of a line. */
function fillet(line: number[], radius: number): number[] {
  const out = [line[0], line[1]];
  for (let i = 2; i < line.length - 2; i += 2) {
    const px = line[i];
    const pz = line[i + 1];
    let ax = px - line[i - 2];
    let az = pz - line[i - 1];
    let bx = line[i + 2] - px;
    let bz = line[i + 3] - pz;
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < 1e-4 || lb < 1e-4) continue;
    ax /= la;
    az /= la;
    bx /= lb;
    bz /= lb;
    if (ax * bx + az * bz > 0.94) {
      out.push(px, pz);
      continue;
    }
    const d = Math.min(radius, la * 0.45, lb * 0.45);
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const u = 1 - t;
      // A quadratic curve from d before the corner to d after it, with the corner as its control point.
      out.push(u * u * (px - ax * d) + 2 * u * t * px + t * t * (px + bx * d), u * u * (pz - az * d) + 2 * u * t * pz + t * t * (pz + bz * d));
    }
  }
  out.push(line[line.length - 2], line[line.length - 1]);
  return out;
}

export interface RoutedLink {
  kind: LinkKind;
  label?: string;
  /** Locus indices of the two places. */
  from: number;
  to: number;
  /** The centre line on the floor from the edge of `from`'s footprint to the edge of `to`'s: x, z pairs. */
  line: number[];
}

export interface RoutedLinks {
  links: RoutedLink[];
  /** Widths of bands and marks are multiplied by this: below 1 when more lanes than usual share a stretch. */
  scale: number;
}

/** The links of a deck laid out on the floor of a palace. Links whose items have no place in it are left out. */
export function routeLinks(layout: PalaceLayout, deck: Deck | undefined): RoutedLinks {
  const none: RoutedLinks = { links: [], scale: 1 };
  if (!deck?.links?.length) return none;
  let net: Net | null = null;
  try {
    net = generatedNet(layout);
  } catch {
    net = null;
  }
  net ??= routeNet(layout);

  const locusOf = new Map<string, number>();
  for (const item of deck.items) {
    const locus = layout.loci.find((l) => l.id === item.locusId);
    if (locus) locusOf.set(item.id, locus.index);
  }
  interface Draft {
    kind: LinkKind;
    label?: string;
    from: number;
    to: number;
    path: number[];
    edges: Set<number>;
    lane: number;
  }
  const drafts: Draft[] = [];
  const n = net.x.length;
  for (const link of deck.links) {
    if (drafts.length >= MAX_LINKS) break;
    const from = locusOf.get(link.from);
    const to = locusOf.get(link.to);
    const a = from === undefined ? undefined : net.stops[from];
    const b = to === undefined ? undefined : net.stops[to];
    if (from === undefined || to === undefined || from === to || !a || !b) continue;
    const path = a.vert === b.vert ? [a.vert] : walk(net, a.vert, b.vert, link.kind === 'becomes');
    if (!path) continue;
    const edges = new Set<number>();
    for (let i = 1; i < path.length; i++) edges.add(Math.min(path[i - 1], path[i]) * n + Math.max(path[i - 1], path[i]));
    drafts.push({ kind: link.kind, label: link.label?.trim() || undefined, from, to, path, edges, lane: -1 });
  }

  // One lane per link, the flow first so that the main stream keeps the middle.
  const order = drafts.map((_, i) => i).sort((i, j) => FLOW_FIRST[drafts[i].kind] - FLOW_FIRST[drafts[j].kind] || i - j);
  let widest = 0;
  for (const i of order) {
    const d = drafts[i];
    const taken = new Set<number>();
    for (const other of drafts) {
      if (other.lane < 0) continue;
      for (const e of d.edges) {
        if (other.edges.has(e)) {
          taken.add(other.lane);
          break;
        }
      }
    }
    let lane = 0;
    while (taken.has(lane)) lane++;
    d.lane = lane;
    widest = Math.max(widest, Math.abs(laneStep(lane)));
  }
  const spacing = widest > 0 ? Math.min(LANE, MAX_SPREAD / widest) : LANE;
  const scale = Math.max(0.45, spacing / LANE);

  // The trunk part of each link, set off into its lane.
  const trunks = drafts.map((d) => {
    const off = laneStep(d.lane) * spacing;
    const line: number[] = [];
    for (const v of d.path) line.push(net.x[v] + net.nx[v] * off, net.z[v] + net.nz[v] * off);
    return untangle(line);
  });

  // The spurs: which side of its place each link turns to, and their order side by side.
  interface End {
    link: number;
    atStart: boolean;
    heading: number;
    near: number;
    pos: number;
  }
  const ends: End[][] = layout.loci.map(() => []);
  drafts.forEach((d, i) => {
    const line = trunks[i];
    for (const atStart of [true, false]) {
      const stop = net.stops[atStart ? d.from : d.to]!;
      const v = stop.vert;
      // Along the trunk at the place, and from the trunk to the place.
      const tx = -net.nz[v];
      const tz = net.nx[v];
      const k = atStart ? 0 : line.length - 2;
      const j = atStart ? Math.min(2, line.length - 2) : Math.max(0, line.length - 4);
      const heading = (line[j] - line[k]) * tx + (line[j + 1] - line[k + 1]) * tz >= 0 ? 1 : -1;
      const ux = stop.x - net.x[v];
      const uz = stop.z - net.z[v];
      const near = laneStep(d.lane) * (net.nx[v] * ux + net.nz[v] * uz);
      ends[atStart ? d.from : d.to].push({ link: i, atStart, heading, near, pos: 0 });
    }
  });
  for (const list of ends) {
    // Those that turn back along the trunk on one side, those that go on on the other; on each
    // side the link in the lane nearest the place turns off outermost, so no spur crosses a lane of its own group.
    list.sort((p, q) => p.heading - q.heading || (p.heading < 0 ? q.near - p.near : p.near - q.near) || p.link - q.link);
    list.forEach((e, j) => (e.pos = (j - (list.length - 1) / 2) * SLOT * Math.max(scale, 0.7)));
  }

  const links = drafts.map((d, i): RoutedLink => {
    let line = trunks[i];
    const spur = (atStart: boolean): [number, number] => {
      const end = ends[atStart ? d.from : d.to].find((e) => e.link === i && e.atStart === atStart)!;
      const stop = net.stops[atStart ? d.from : d.to]!;
      if (line.length >= 4) {
        const cut = trimStart(atStart ? line : reversed(line), end.pos * end.heading);
        line = atStart ? cut : reversed(cut);
      }
      const k = atStart ? 0 : line.length - 2;
      const v = stop.vert;
      let ux = stop.x - net.x[v];
      let uz = stop.z - net.z[v];
      const reach = Math.hypot(ux, uz);
      if (reach > 1e-3) {
        ux /= reach;
        uz /= reach;
      } else {
        ux = net.nx[v];
        uz = net.nz[v];
      }
      // From the lane to the edge of the footprint, parallel to the line from the trunk to the place.
      const own = (line[k] - net.x[v]) * ux + (line[k + 1] - net.z[v]) * uz;
      const length = Math.max(MIN_SPUR, reach - own - stop.footprint - SPUR_GAP);
      return [line[k] + ux * length, line[k + 1] + uz * length];
    };
    const head = spur(true);
    const tail = spur(false);
    return { kind: d.kind, label: d.label, from: d.from, to: d.to, line: fillet([...head, ...line, ...tail], FILLET) };
  });
  return { links, scale };
}

/** The point `at` metres along a line and the direction of the line there, into `out` as x, z, dx, dz. */
export function pointAlong(line: number[], at: number, out: number[]): void {
  let left = Math.max(0, at);
  for (let i = 2; i < line.length; i += 2) {
    const dx = line[i] - line[i - 2];
    const dz = line[i + 1] - line[i - 1];
    const seg = Math.hypot(dx, dz);
    if (seg >= left || i === line.length - 2) {
      const f = seg > 1e-6 ? Math.min(1, left / seg) : 0;
      out[0] = line[i - 2] + dx * f;
      out[1] = line[i - 1] + dz * f;
      out[2] = seg > 1e-6 ? dx / seg : 1;
      out[3] = seg > 1e-6 ? dz / seg : 0;
      return;
    }
    left -= seg;
  }
}
