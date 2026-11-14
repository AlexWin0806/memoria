import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { type Camera, type PerspectiveCamera, Vector3 } from 'three';
import type { PalaceLayout } from '@/layouts';
import { type SessionState, useSession } from '@/state/session';
import type { Qa } from './qa';
import { MAX_TURN, type RailNode, Pace, Rail, easePos, leadIn, poseOf, railDuration, routeNodes, sampleRail, timeForProgress, viaBetween } from './rail';
import { TOUR_LINGER, TOUR_PACE, TOUR_TURN, type Tour } from './tour';
import type { Veil } from './veil';

const DIP_OUT = 0.2;
const DIP_IN = 0.34;
/** The camera eases this far (metres) into its final pose after a glide. */
const SETTLE = 0.05;
const SETTLE_SECONDS = 0.55;
/** Idle motion: a slow breathing sway plus a few centimetres of pointer parallax. */
const SWAY_X = 0.018;
const SWAY_Y = 0.012;
const PARALLAX_X = 0.04;
const PARALLAX_Y = 0.025;
/**
 * Attract drift: a slow, small orbit around the overview's target. About 0.2 m of travel
 * either way over a minute, so the title composition holds and the lens stays clear of walls.
 */
const DRIFT_ANGLE = 0.035;
const DRIFT_RISE = 0.04;
/**
 * Bottom sheet (narrow screens): a locus view fills about this fraction of the frame's
 * height with the place and its image. When the sheet leaves less than that, the lens
 * widens just enough to keep both in the strip above it, down to this zoom.
 */
const VIEW_FILL = 0.86;
const MIN_ZOOM = 0.4;
/**
 * A walk glide that would take longer than this (several places passed, each with its own
 * turn of the head) reads better as a cut to the place before the destination. It also keeps
 * every arrival well inside the six seconds the overlay waits for one.
 */
const MAX_GLIDE_SECONDS = 4.6;

/** Pointer in -1..1, tracked on the window so it works under the 2D overlay too. */
const pointer = { x: 0, y: 0 };

const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _p = new Vector3();
const UP = new Vector3(0, 1, 0);

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

function createRig() {
  return {
    rail: new Rail(),
    /** When the current glide reaches each point of its rail: slower where the view turns. */
    pace: new Pace(),
    /** Seconds into the current glide. */
    clock: 0,
    /** Base pose: where the camera is before idle motion is layered on. */
    pos: new Vector3(),
    look: new Vector3(),
    phase: 'rest' as 'rest' | 'dip' | 'glide',
    /** Destination the current plan leads to. null until the first frame. */
    planned: null as RailNode | null,
    /** Node the camera rests at, or last left. */
    at: 'overview' as RailNode,
    /** Where a dip cuts to at its darkest point. */
    cutTo: 'overview' as RailNode,
    /** Dip: seconds into it. Glide: how far along the rail's own time (0..1) the camera is. */
    t: 0,
    settle: 0,
    settleFrom: 0,
    settleAmt: 0,
    idle: 0,
    drift: 0,
    time: 0,
    parX: 0,
    parY: 0,
    inset: 0,
    insetY: 0,
    appliedInset: -1,
    appliedInsetY: -1,
    appliedW: 0,
    appliedH: 0,
    /** The veil's count of cuts when the inset was last looked at. */
    cuts: 0,
    /** The results tour being walked, its current stop, and how long the camera has rested there. */
    tour: null as Tour | null,
    tourIndex: 0,
    linger: 0,
    /** The same, for scripts (`window.__memoria.tour`). */
    report: { active: false, index: -1, at: -1 },
  };
}

interface CameraRailProps {
  layout: PalaceLayout;
  /** Where the app wants the camera. */
  target: RailNode;
  /** The session snapshot `target` was derived from; guards against acting on stale props. */
  session: SessionState;
  reduced: boolean;
  /** Slow drift around the overview (title, results, review). */
  drift: boolean;
  /** Results: stroll through these places instead of resting at `target`. */
  tour: Tour | null;
  qa: Qa;
  veil: Veil;
}

/**
 * The camera. It rests at a pose, and when the app names a new destination it either
 * glides there along a spline rail or, for far jumps and reduced motion, cuts under a
 * short dip of the veil. It reports back through `session.arrived` and nothing else.
 */
export function CameraRail({ layout, target, session, reduced, drift, tour, qa, veil }: CameraRailProps) {
  const camera = useThree((s) => s.camera);
  const rig = useMemo(createRig, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = 1 - (e.clientY / window.innerHeight) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    if (!window.__memoria) return;
    window.__memoria.camera = camera;
    window.__memoria.tour = rig.report;
  }, [camera, rig]);

  // QA freeze-frames: pin the pose before the first frame is drawn.
  useLayoutEffect(() => {
    if (!qa.frozen) return;
    if (qa.rail) {
      const { from, t } = qa.rail;
      const to: RailNode = from === 'entry' ? 0 : (from as number) + 1;
      const start = poseOf(layout, from);
      rig.rail.begin(rig.pos.set(...start.position), rig.look.set(...start.target), from);
      for (const v of viaBetween(layout, from, to)) rig.rail.via(v);
      rig.rail.knot(poseOf(layout, to), to).finish();
      sampleRail(rig.rail, timeForProgress(t), rig.pos, rig.look);
    } else {
      const pose = poseOf(layout, qa.shot ?? 'overview');
      rig.pos.set(...pose.position);
      rig.look.set(...pose.target);
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  }, [camera, layout, qa, rig]);

  /** Lays the rail for a glide along `route`, starting from wherever the camera is now. */
  const glide = (route: RailNode[], behind: RailNode, passFirst: boolean) => {
    const { rail } = rig;
    rail.begin(rig.pos, rig.look, behind);
    let prev = behind;
    for (let i = 0; i < route.length; i++) {
      const node = route[i];
      const pose = poseOf(layout, node);
      if (i > 0) {
        for (const v of viaBetween(layout, prev, node)) rail.via(v);
        rail.knot(pose, node);
      } else if (passFirst) {
        // Joining mid-flight: keep only the waypoints that still lie ahead of the camera.
        _p.set(...pose.position);
        const left = _p.distanceTo(rig.pos);
        for (const v of viaBetween(layout, behind, node)) {
          if (Math.hypot(v[0] - _p.x, v[1] - _p.y, v[2] - _p.z) < left - 0.2) rail.via(v);
        }
        if (left > 0.3 || route.length === 1) rail.knot(pose, node);
      }
      prev = node;
    }
    rail.finish();
    rig.phase = 'glide';
    rig.t = 0;
    rig.clock = 0;
    // A tour is a stroll: slower than any walk, whatever the pace of the run that led here.
    // Judge Mode shortens the time given to the distance; the time a turn needs is the same for everyone.
    if (rig.tour) rig.pace.build(rail, Math.min(6, railDuration(rail.length, rail.knots - 1, false) * TOUR_PACE), TOUR_TURN);
    else rig.pace.build(rail, railDuration(rail.length, rail.knots - 1, session.judge), MAX_TURN);
    rig.settleFrom = rig.settleAmt;
  };

  const dipTo = (node: RailNode) => {
    rig.cutTo = node;
    veil.cutting = true;
    if (rig.phase !== 'dip') {
      rig.phase = 'dip';
      rig.t = veil.dip * DIP_OUT;
    }
  };

  const plan = (to: RailNode) => {
    rig.planned = to;
    const touring = rig.tour !== null;
    const cut = reduced || touring ? to : (leadIn(to) ?? to);
    if (rig.phase === 'dip') return dipTo(cut);
    if (reduced) return dipTo(to);
    if (touring) {
      // A tour strolls on to the next place of the route and nowhere else. Every other move
      // (to its first stop, across a gap between tested places, from the last stop round to
      // the first) is a cut under the veil: never a glide back through the house.
      if (rig.phase === 'rest' && typeof rig.at === 'number' && to === rig.at + 1) return glide([rig.at, to], rig.at, false);
      return dipTo(to);
    }
    if (rig.phase === 'glide') {
      // Interrupted between two poses: carry on from whichever of them the new route leaves from.
      const k = rig.rail.segmentAt(easePos(rig.t));
      const a = rig.rail.nodes[k];
      const b = rig.rail.nodes[k + 1];
      const fromA = routeNodes(layout, a, to);
      const fromB = routeNodes(layout, b, to);
      if (fromA && !fromA.includes(b)) glide(fromA, b, true);
      else if (fromB) glide(fromB, a, true);
      else return dipTo(cut);
      if (rig.pace.duration > MAX_GLIDE_SECONDS) dipTo(cut);
      return;
    }
    const route = routeNodes(layout, rig.at, to);
    if (!route) return dipTo(cut);
    if (route.length > 1) {
      glide(route, rig.at, false);
      if (rig.pace.duration > MAX_GLIDE_SECONDS) dipTo(cut);
    }
  };

  const cutTo = (node: RailNode) => {
    const pose = poseOf(layout, node);
    rig.pos.set(...pose.position);
    rig.look.set(...pose.target);
    rig.at = node;
    rig.phase = 'rest';
    rig.settleAmt = 0;
    rig.settle = 0;
  };

  /** View inset: slide the picture's centre into the area the overlay leaves free. */
  const frameView = (cam: Camera, width: number, height: number, right: number, bottom: number, dt: number) => {
    const wantInset = Math.min(right, width * 0.7);
    const wantInsetY = Math.min(bottom, height * 0.7);
    // A cut often comes with a new panel (title to walk): the picture keeps its framing while
    // the veil closes and has the new one when it lifts, instead of sliding sideways through both.
    const snap = reduced || qa.frozen || rig.cuts !== veil.cuts;
    rig.cuts = veil.cuts;
    if (!veil.cutting || snap) {
      rig.inset = snap || Math.abs(wantInset - rig.inset) < 0.5 ? wantInset : damp(rig.inset, wantInset, 7, dt);
      rig.insetY = snap || Math.abs(wantInsetY - rig.insetY) < 0.5 ? wantInsetY : damp(rig.insetY, wantInsetY, 7, dt);
    }
    if (isPerspective(cam) && (rig.inset !== rig.appliedInset || rig.insetY !== rig.appliedInsetY || width !== rig.appliedW || height !== rig.appliedH)) {
      cam.zoom = Math.min(1, Math.max(MIN_ZOOM, (height - rig.insetY) / (height * VIEW_FILL)));
      // Both calls rebuild the projection, so the zoom above takes effect with them.
      if (rig.inset > 0 || rig.insetY > 0) cam.setViewOffset(width, height, rig.inset / 2, rig.insetY / 2, width, height);
      else cam.clearViewOffset();
      rig.appliedInset = rig.inset;
      rig.appliedInsetY = rig.insetY;
      rig.appliedW = width;
      rig.appliedH = height;
    }
  };

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 0.5);
    const { width, height } = state.size;
    const live = useSession.getState();

    if (qa.frozen) {
      frameView(cam, width, height, qa.inset, qa.insetBottom, dt);
      return;
    }

    if (rig.planned === null) {
      cutTo(target);
      rig.planned = target;
    }
    // Props lag the store by a render; only act when they describe the store as it is now.
    const fresh = live === session;

    // Results tour: rest at a place, then move on to the next, round and round. Under
    // reduced motion it is one still view instead.
    let want = target;
    if (tour !== rig.tour) {
      rig.tour = tour;
      rig.linger = 0;
      // Begin at the place the camera is at or bound for (results open on the place just
      // answered): the picture holds while the score is read, and the tour goes on from there.
      rig.tourIndex = tour && typeof rig.planned === 'number' ? Math.max(0, tour.stops.indexOf(rig.planned)) : 0;
    }
    if (tour) {
      // Reduced motion shows the one still view; if motion comes back, the tour goes on from it.
      if (reduced) rig.tourIndex = Math.max(0, tour.stops.indexOf(tour.hold));
      const stop = tour.stops[rig.tourIndex];
      if (!reduced && rig.phase === 'rest' && rig.at === stop && tour.stops.length > 1) {
        rig.linger += dt;
        if (rig.linger >= TOUR_LINGER) {
          rig.tourIndex = (rig.tourIndex + 1) % tour.stops.length;
          rig.linger = 0;
        }
      }
      want = tour.stops[rig.tourIndex];
      rig.report.index = rig.tourIndex;
      rig.report.at = rig.phase === 'rest' && rig.at === want ? want : -1;
    } else {
      rig.report.index = -1;
      rig.report.at = -1;
    }
    rig.report.active = tour !== null;

    if (fresh && want !== rig.planned) plan(want);

    if (rig.phase === 'dip') {
      rig.t += dt;
      veil.dip = smooth(Math.min(1, rig.t / DIP_OUT));
      if (rig.t >= DIP_OUT) {
        // The veil is opaque on this frame: whatever else must change unseen changes now.
        veil.cutting = false;
        veil.cuts++;
        cutTo(rig.cutTo);
        const route = rig.planned !== null && rig.cutTo !== rig.planned ? routeNodes(layout, rig.cutTo, rig.planned) : null;
        if (route && route.length > 1) glide(route, rig.cutTo, false);
        else if (rig.planned !== null && rig.cutTo !== rig.planned) cutTo(rig.planned);
      }
    } else if (veil.dip > 0) {
      veil.dip = Math.max(0, veil.dip - dt / DIP_IN);
    }

    if (rig.phase === 'glide') {
      rig.clock += dt;
      rig.t = rig.pace.timeAt(rig.clock);
      sampleRail(rig.rail, rig.t, rig.pos, rig.look);
      rig.settleAmt = Math.max(rig.settleFrom * (1 - Math.min(1, rig.t * 4)), easePos(rig.t));
      if (rig.t >= 1) {
        rig.phase = 'rest';
        rig.at = rig.planned ?? rig.at;
        rig.settle = 1;
      }
    } else if (rig.settle > 0) {
      rig.settle = Math.max(0, rig.settle - dt / SETTLE_SECONDS);
      rig.settleAmt = smooth(rig.settle);
    }

    if (fresh && rig.phase === 'rest' && !live.arrived) live.setArrived(true);

    // After the plan above, so that a cut decided on this frame already holds the framing.
    frameView(cam, width, height, live.insetRight, live.insetBottom, dt);

    // Compose: base pose, then settle, drift and idle motion layered on by weight.
    const resting = rig.phase === 'rest' && !reduced;
    rig.idle = damp(rig.idle, resting ? 1 : 0, 3, dt);
    rig.drift = damp(rig.drift, resting && drift && rig.at === 'overview' ? 1 : 0, 1.2, dt);
    rig.time += dt;
    rig.parX = damp(rig.parX, pointer.x, 4, dt);
    rig.parY = damp(rig.parY, pointer.y, 4, dt);

    _dir.subVectors(rig.look, rig.pos).normalize();
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir);
    _p.copy(rig.pos).addScaledVector(_dir, -SETTLE * rig.settleAmt);
    if (rig.drift > 0.001) {
      const a = Math.sin(rig.time * 0.11) * DRIFT_ANGLE * rig.drift;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ox = _p.x - rig.look.x;
      const oz = _p.z - rig.look.z;
      _p.x = rig.look.x + ox * c - oz * s;
      _p.z = rig.look.z + ox * s + oz * c;
      _p.y += Math.sin(rig.time * 0.07 + 1) * DRIFT_RISE * rig.drift;
    }
    if (rig.idle > 0.001) {
      _p.addScaledVector(_right, rig.idle * (Math.sin(rig.time * 0.42) * SWAY_X + rig.parX * PARALLAX_X));
      _p.addScaledVector(_up, rig.idle * (Math.sin(rig.time * 0.63 + 0.7) * SWAY_Y + rig.parY * PARALLAX_Y));
    }
    cam.position.copy(_p);
    cam.lookAt(rig.look);
  });

  return null;
}
