import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { type Camera, type PerspectiveCamera, Vector3 } from 'three';
import type { PalaceLayout } from '@/layouts';
import { type SessionState, useSession } from '@/state/session';
import type { Qa } from './qa';
import { type RailNode, Rail, easePos, leadIn, poseOf, railDuration, routeNodes, sampleRail, timeForProgress, viaBetween } from './rail';
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
    t: 0,
    dur: 1,
    settle: 0,
    settleFrom: 0,
    settleAmt: 0,
    idle: 0,
    drift: 0,
    time: 0,
    parX: 0,
    parY: 0,
    inset: 0,
    appliedInset: -1,
    appliedW: 0,
    appliedH: 0,
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
  qa: Qa;
  veil: Veil;
}

/**
 * The camera. It rests at a pose, and when the app names a new destination it either
 * glides there along a spline rail or, for far jumps and reduced motion, cuts under a
 * short dip of the veil. It reports back through `session.arrived` and nothing else.
 */
export function CameraRail({ layout, target, session, reduced, drift, qa, veil }: CameraRailProps) {
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
    if (window.__memoria) window.__memoria.camera = camera;
  }, [camera]);

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
    rig.dur = railDuration(rail.length, rail.knots - 1, session.judge);
    rig.settleFrom = rig.settleAmt;
  };

  const dipTo = (node: RailNode) => {
    rig.cutTo = node;
    if (rig.phase !== 'dip') {
      rig.phase = 'dip';
      rig.t = veil.dip * DIP_OUT;
    }
  };

  const plan = (to: RailNode) => {
    rig.planned = to;
    const cut = reduced ? to : (leadIn(to) ?? to);
    if (rig.phase === 'dip') return dipTo(cut);
    if (reduced) return dipTo(to);
    if (rig.phase === 'glide') {
      // Interrupted between two poses: carry on from whichever of them the new route leaves from.
      const k = rig.rail.segmentAt(easePos(rig.t));
      const a = rig.rail.nodes[k];
      const b = rig.rail.nodes[k + 1];
      const fromA = routeNodes(layout, a, to);
      const fromB = routeNodes(layout, b, to);
      if (fromA && !fromA.includes(b)) return glide(fromA, b, true);
      if (fromB) return glide(fromB, a, true);
      return dipTo(cut);
    }
    const route = routeNodes(layout, rig.at, to);
    if (route && route.length > 1) return glide(route, rig.at, false);
    if (!route) return dipTo(cut);
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

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 0.5);

    // View inset: slide the picture's centre into the area the overlay leaves free.
    const { width, height } = state.size;
    const live = useSession.getState();
    const wantInset = Math.min(qa.frozen ? qa.inset : live.insetRight, width * 0.7);
    rig.inset = reduced || qa.frozen || Math.abs(wantInset - rig.inset) < 0.5 ? wantInset : damp(rig.inset, wantInset, 7, dt);
    if (isPerspective(cam) && (rig.inset !== rig.appliedInset || width !== rig.appliedW || height !== rig.appliedH)) {
      if (rig.inset > 0) cam.setViewOffset(width, height, rig.inset / 2, 0, width, height);
      else cam.clearViewOffset();
      rig.appliedInset = rig.inset;
      rig.appliedW = width;
      rig.appliedH = height;
    }

    if (qa.frozen) return;

    if (rig.planned === null) {
      cutTo(target);
      rig.planned = target;
    }
    // Props lag the store by a render; only act when they describe the store as it is now.
    const fresh = live === session;
    if (fresh && target !== rig.planned) plan(target);

    if (rig.phase === 'dip') {
      rig.t += dt;
      veil.dip = smooth(Math.min(1, rig.t / DIP_OUT));
      if (rig.t >= DIP_OUT) {
        cutTo(rig.cutTo);
        const route = rig.planned !== null && rig.cutTo !== rig.planned ? routeNodes(layout, rig.cutTo, rig.planned) : null;
        if (route && route.length > 1) glide(route, rig.cutTo, false);
        else if (rig.planned !== null && rig.cutTo !== rig.planned) cutTo(rig.planned);
      }
    } else if (veil.dip > 0) {
      veil.dip = Math.max(0, veil.dip - dt / DIP_IN);
    }

    if (rig.phase === 'glide') {
      rig.t = Math.min(1, rig.t + dt / rig.dur);
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
