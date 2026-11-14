import { CatmullRomCurve3, Vector3 } from 'three';
import type { CameraPose, PalaceLayoutMeta, Vec3 } from '@/core/types';

/** A place the camera can rest: before the door, the wide establishing pose, or a locus index. */
export type RailNode = 'entry' | 'overview' | number;

export function poseOf(layout: PalaceLayoutMeta, node: RailNode): CameraPose {
  if (node === 'entry') return layout.entry;
  if (node === 'overview') return layout.overview;
  return layout.loci[node]?.view ?? layout.overview;
}

/** Slow in, slow out (quintic), for the body. */
export function easePos(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** The gaze leads the body: it starts turning first and has settled before the body stops. */
export function easeLook(t: number): number {
  const s = Math.min(1, t / 0.85);
  return s * s * (3 - 2 * s);
}

/** Inverse of easePos, for QA freeze-frames given as a fraction of the path. */
export function timeForProgress(u: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (easePos(mid) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const SAMPLES = 192;
const MAX_CTRL = 64;
const MAX_KNOTS = 24;

function cr(p0: number, p1: number, p2: number, p3: number, f: number): number {
  return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
}

/**
 * One camera journey: a Catmull-Rom spline through control points for the body, and a
 * separate spline through the look targets of the poses passed on the way ("knots").
 * Built once per journey into preallocated buffers; sampling never allocates.
 */
export class Rail {
  /** Path length in metres. */
  length = 0;
  /** Number of poses on the path, including the start. */
  knots = 0;
  /** The node each knot stands for. nodes[0] is the node the journey leaves behind. */
  readonly nodes: RailNode[] = [];

  private readonly pts = new Float32Array(SAMPLES * 3);
  private readonly cum = new Float32Array(SAMPLES);
  private readonly ctrl = Array.from({ length: MAX_CTRL }, () => new Vector3());
  private readonly ctrlKnot = new Int8Array(MAX_CTRL);
  private ctrlCount = 0;
  private readonly looks = Array.from({ length: MAX_KNOTS }, () => new Vector3());
  private readonly knotAt = new Float32Array(MAX_KNOTS);
  private readonly curve = new CatmullRomCurve3([], false, 'centripetal');
  private readonly tmp = new Vector3();

  begin(pos: Vector3, look: Vector3, node: RailNode): this {
    this.ctrlCount = 0;
    this.knots = 0;
    this.nodes.length = 0;
    this.push(pos.x, pos.y, pos.z, true);
    this.looks[0].copy(look);
    this.nodes.push(node);
    this.knots = 1;
    return this;
  }

  /** A point the body passes through without the gaze caring (doorways). */
  via(p: Vec3): this {
    this.push(p[0], p[1], p[2], false);
    return this;
  }

  /** A pose the journey passes through or ends at. */
  knot(pose: CameraPose, node: RailNode): this {
    if (this.knots >= MAX_KNOTS) return this;
    this.push(pose.position[0], pose.position[1], pose.position[2], true);
    this.looks[this.knots].set(pose.target[0], pose.target[1], pose.target[2]);
    this.nodes.push(node);
    this.knots++;
    return this;
  }

  private push(x: number, y: number, z: number, isKnot: boolean) {
    if (this.ctrlCount >= MAX_CTRL) return;
    this.ctrl[this.ctrlCount].set(x, y, z);
    this.ctrlKnot[this.ctrlCount] = isKnot ? 1 : 0;
    this.ctrlCount++;
  }

  /** Samples the spline into the polyline table and measures where each knot falls on it. */
  finish(): this {
    const n = this.ctrlCount;
    const points = this.curve.points;
    points.length = 0;
    for (let i = 0; i < n; i++) points.push(this.ctrl[i]);
    if (n === 1) points.push(this.ctrl[0]);
    const { pts, cum, tmp } = this;
    for (let i = 0; i < SAMPLES; i++) {
      this.curve.getPoint(i / (SAMPLES - 1), tmp);
      pts[i * 3] = tmp.x;
      pts[i * 3 + 1] = tmp.y;
      pts[i * 3 + 2] = tmp.z;
      cum[i] = i === 0 ? 0 : cum[i - 1] + Math.hypot(tmp.x - pts[i * 3 - 3], tmp.y - pts[i * 3 - 2], tmp.z - pts[i * 3 - 1]);
    }
    this.length = cum[SAMPLES - 1];
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!this.ctrlKnot[i]) continue;
      const f = n > 1 ? (i / (n - 1)) * (SAMPLES - 1) : 0;
      const i0 = Math.min(SAMPLES - 1, Math.floor(f));
      const i1 = Math.min(SAMPLES - 1, i0 + 1);
      const len = cum[i0] + (cum[i1] - cum[i0]) * (f - i0);
      const at = this.length > 1e-6 ? len / this.length : k / Math.max(1, this.knots - 1);
      this.knotAt[k++] = at;
    }
    this.knotAt[0] = 0;
    this.knotAt[this.knots - 1] = 1;
    return this;
  }

  /** Body position at a fraction of the path length. */
  pointAt(u: number, out: Vector3): Vector3 {
    const { pts, cum } = this;
    const want = Math.min(1, Math.max(0, u)) * this.length;
    let lo = 0;
    let hi = SAMPLES - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= want) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo];
    const f = span > 1e-9 ? (want - cum[lo]) / span : 1;
    const a = lo * 3;
    const b = hi * 3;
    return out.set(pts[a] + (pts[b] - pts[a]) * f, pts[a + 1] + (pts[b + 1] - pts[a + 1]) * f, pts[a + 2] + (pts[b + 2] - pts[a + 2]) * f);
  }

  /** Index of the knot the body has last passed at this fraction of the path. */
  segmentAt(u: number): number {
    let k = 0;
    while (k < this.knots - 2 && u >= this.knotAt[k + 1]) k++;
    return k;
  }

  /** Look target at a fraction of the path length. */
  lookAt(v: number, out: Vector3): Vector3 {
    if (this.knots < 2) return out.copy(this.looks[0]);
    const k = this.segmentAt(v);
    const span = this.knotAt[k + 1] - this.knotAt[k];
    const f = span > 1e-6 ? Math.min(1, Math.max(0, (v - this.knotAt[k]) / span)) : 1;
    const l = this.looks;
    const p0 = l[Math.max(0, k - 1)];
    const p1 = l[k];
    const p2 = l[k + 1];
    const p3 = l[Math.min(this.knots - 1, k + 2)];
    return out.set(cr(p0.x, p1.x, p2.x, p3.x, f), cr(p0.y, p1.y, p2.y, p3.y, f), cr(p0.z, p1.z, p2.z, p3.z, f));
  }
}

const _ahead = new Vector3();
const _behind = new Vector3();

/**
 * The camera pose at time t (0..1) of a journey. Pure: the same t always gives the same
 * pose, which is what makes `?rail=` freeze-frames trustworthy.
 * Mid-journey the gaze leans toward the direction of travel, so the camera looks through
 * a doorway as it passes instead of staring at the jamb.
 */
export function sampleRail(rail: Rail, t: number, outPos: Vector3, outLook: Vector3): void {
  const u = easePos(t);
  rail.pointAt(u, outPos);
  rail.lookAt(easeLook(t), outLook);
  const s = Math.sin(Math.PI * t);
  const lean = (rail.knots > 2 ? 0.5 : 0.35) * s * s;
  if (lean < 0.001 || rail.length < 0.5) return;
  rail.pointAt(u + 0.03, _ahead);
  rail.pointAt(u - 0.03, _behind);
  _ahead.sub(_behind);
  _ahead.y *= 0.3;
  if (_ahead.lengthSq() < 1e-8) return;
  const reach = outLook.distanceTo(outPos);
  _behind.subVectors(outLook, outPos).normalize();
  _behind.lerp(_ahead.normalize(), lean);
  if (_behind.lengthSq() < 1e-6) return;
  outLook.copy(outPos).addScaledVector(_behind.normalize(), reach);
}

/** Fastest the view may turn during a walk glide, in radians per second (80°: a pan stays readable). */
export const MAX_TURN = (80 * Math.PI) / 180;

const PACE_STEPS = 96;

/**
 * The timetable of one journey: how many seconds in the camera reaches each rail time.
 * It starts from the distance-based duration and gives more time to the stretches where
 * the view would otherwise turn faster than `maxTurn`, so a leg that swings the gaze
 * from one wall to the other takes as long as the turn needs, however short the walk.
 * Only the timing changes: the path and the gaze at a given rail time stay those of
 * `sampleRail`. Built once per journey into preallocated tables.
 */
export class Pace {
  /** Seconds the journey takes. */
  duration = 0;
  /** Seconds at which rail time i / PACE_STEPS is reached. */
  private readonly at = new Float32Array(PACE_STEPS + 1);
  private readonly need = new Float32Array(PACE_STEPS);
  private readonly soft = new Float32Array(PACE_STEPS);
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private readonly dir = new Vector3();
  private readonly prev = new Vector3();

  build(rail: Rail, base: number, maxTurn: number): this {
    const { at, need, soft, pos, look, dir, prev } = this;
    const step = base / PACE_STEPS;
    for (let i = 0; i <= PACE_STEPS; i++) {
      sampleRail(rail, i / PACE_STEPS, pos, look);
      dir.subVectors(look, pos);
      if (dir.lengthSq() < 1e-10) dir.copy(prev);
      else dir.normalize();
      // How many times longer this step must take for the turn inside it to stay under the limit.
      if (i > 0) need[i - 1] = Math.max(1, prev.angleTo(dir) / (step * maxTurn));
      prev.copy(dir);
    }
    // Round the shoulders of the slow stretches, so the body eases into and out of them.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < PACE_STEPS; i++) {
        const a = need[Math.max(0, i - 1)];
        const b = need[Math.min(PACE_STEPS - 1, i + 1)];
        soft[i] = Math.max(need[i], (a + 2 * need[i] + b) / 4);
      }
      need.set(soft);
    }
    at[0] = 0;
    for (let i = 0; i < PACE_STEPS; i++) at[i + 1] = at[i] + step * need[i];
    this.duration = at[PACE_STEPS];
    return this;
  }

  /** Rail time (0..1) reached this many seconds into the journey. */
  timeAt(seconds: number): number {
    const { at } = this;
    if (seconds >= this.duration) return 1;
    if (seconds <= 0) return 0;
    let lo = 0;
    let hi = PACE_STEPS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid] <= seconds) lo = mid;
      else hi = mid;
    }
    const span = at[hi] - at[lo];
    return (lo + (span > 1e-9 ? (seconds - at[lo]) / span : 1)) / PACE_STEPS;
  }
}

/**
 * Seconds a glide takes for its distance alone: about 1.6 to 3 s, longer for multi-stop trips,
 * brisker in Judge Mode. `Pace` adds the time its turns need on top, at the same rate in every mode.
 */
export function railDuration(length: number, hops: number, judge: boolean): number {
  const base = Math.min(3, Math.max(1.6, 1 + 0.4 * length));
  const total = Math.min(4.2, base + Math.max(0, hops - 1) * 0.35);
  return judge ? Math.max(1.1, total * 0.7) : total;
}

/** Waypoints between two neighbouring nodes, in travel order. */
export function viaBetween(layout: PalaceLayoutMeta, a: RailNode, b: RailNode): Vec3[] {
  const fwd = layout.via?.[`${a}>${b}`];
  if (fwd) return fwd;
  const back = layout.via?.[`${b}>${a}`];
  return back ? [...back].reverse() : [];
}

/** Longest run of loci the camera walks through in one glide before a cut reads better. */
const MAX_HOPS = 4;

function range(a: number, b: number): number[] {
  const out: number[] = [];
  const d = b >= a ? 1 : -1;
  for (let i = a; i !== b + d; i += d) out.push(i);
  return out;
}

/** The room the overview pose stands in, judged by the nearest locus viewpoint. */
function overviewRoom(layout: PalaceLayoutMeta): string | undefined {
  const [x, y, z] = layout.overview.position;
  let best: string | undefined;
  let bestD = Infinity;
  for (const l of layout.loci) {
    const d = Math.hypot(l.view.position[0] - x, l.view.position[1] - y, l.view.position[2] - z);
    if (d < bestD) {
      bestD = d;
      best = l.roomId;
    }
  }
  return best;
}

/**
 * The nodes a glide from `from` to `to` passes, or null when no glide stays inside the
 * rooms (too far, or the overview is in another room) and the camera should cut instead.
 */
export function routeNodes(layout: PalaceLayoutMeta, from: RailNode, to: RailNode): RailNode[] | null {
  if (from === to) return [from];
  if (typeof from === 'number' && typeof to === 'number') {
    return Math.abs(to - from) <= MAX_HOPS ? range(from, to) : null;
  }
  if (from === 'overview' || to === 'overview') {
    const other = from === 'overview' ? to : from;
    if (typeof other !== 'number') return null;
    return layout.loci[other]?.roomId === overviewRoom(layout) ? [from, to] : null;
  }
  if (from === 'entry' && typeof to === 'number') return to < MAX_HOPS ? ['entry', ...range(0, to)] : null;
  if (to === 'entry' && typeof from === 'number') return from < MAX_HOPS ? [...range(from, 0), 'entry'] : null;
  return null;
}

/**
 * Where to cut to before gliding the last leg to `to`, so that the camera always arrives
 * at a locus the way the route approaches it. null: cut straight to the pose.
 */
export function leadIn(to: RailNode): RailNode | null {
  if (typeof to !== 'number') return null;
  return to === 0 ? 'entry' : to - 1;
}
