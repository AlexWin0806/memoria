import type { AccentKey, CameraPose, Locus, PalaceLayoutMeta, PalaceRoomSpec, PalaceSpec, Room, Vec3 } from '@/core/types';
import { getKit } from '@/layouts/kits';
import { KIT_LIST } from '@/layouts/kits/list';
import type { FeatureDef, KitDef, RoomPlan } from '@/layouts/kits/types';
import { PROPS } from '@/layouts/props';
import { ROOM_CAPACITY, normalizeSpec, palaceLayoutId, placeId } from '@/layouts/spec';

/**
 * The data half of a generated palace: where every room, place, camera view and rail
 * waypoint is. Pure functions of the spec (no React is rendered, nothing is measured), so
 * the stores and scripts can call it, and so that the rule of src/layouts/spec.ts holds:
 *
 *   **nothing that exists ever moves.**
 *
 *   - A room's origin depends on the shapes of the rooms before it, and on nothing else.
 *   - A place's position, feature, name, accent and view depend on (kit, room index, slot).
 *     In particular not on how many places its room has, nor on which rooms follow.
 *   - The only things that depend on what comes later are the rail from the last place of a
 *     room to the first place of the next, and whether a far doorway is open.
 *
 * `scripts/palace-invariance.mjs` proves it for specs and their extensions.
 *
 * The palace runs towards -z from the front door, like the Domus. One room:
 *
 *        z = 0   entrance wall, doorway on the axis
 *        -3.5    place 1   by the left wall         (mirrored in every second room)
 *        -6.5    place 2   by the right wall
 *        -9.5    place 3   by the left wall
 *       -12.5    place 4   by the right wall
 *       -14.5    place 5   at the far wall, left of the doorway: the room's landmark, with the golden hand
 *       -16.0    far wall, doorway on the axis, the next room's name carved over it
 *
 * Every hall has this one size, built for five places: a room with fewer has empty plots.
 */
export const HALL: RoomPlan = {
  halfWidth: 4.6,
  length: 16,
  partition: 0.6,
  door: { halfWidth: 1.1, height: 2 },
  signBottom: 3.9,
  signTop: 4.74,
  signHalfWidth: 2.7,
};

/** Eye height of every view, as in the Domus. */
const EYE = 1.65;
/** How far before the front wall the walk begins. Kits pave a forecourt there (see KitDef.Room). */
const ENTRY_BACK = 8;
/** A memory image floats this far above the top of its feature (FeatureDef.height). */
const IMAGE_CLEARANCE = 0.9;
/** Half the height of a memory image with its satellites, with a little air. */
const IMAGE_RADIUS = 0.75;
/** A wall feature's image hangs this far out from the wall, so the wall does not cut it. */
const WALL_IMAGE_OUT = 0.75;
/** A floor feature stands at least this far in from the wall behind it (to its origin). */
const WALL_STANDOFF = 1;
/** The landmark at the far wall stands this far in front of it. */
const FAR_STANDOFF = 1.5;
/** How far a side-wall view stands back along the route from square-on, in radians. */
const SIDE_VIEW_ANGLE = 0.38;
/** The same for the landmark: its view stands well to the right of it, clear of the walk to the door. */
const FAR_VIEW_ANGLE = 0.96;

interface Slot {
  /** -1 the left wall, 1 the right wall, 0 the far wall. */
  side: -1 | 0 | 1;
  /** Along the wall: z for a side wall, x for the far wall. */
  at: number;
}

const SLOTS: Slot[] = [
  { side: -1, at: -3.5 },
  { side: 1, at: -6.5 },
  { side: -1, at: -9.5 },
  { side: 1, at: -12.5 },
  { side: 0, at: -2.85 },
];

/**
 * Accent by room index and slot. Hand-set so that no pigment repeats inside a room, the
 * landmark (last column) is never amber (the golden hand beside it is), and a room begins
 * with the one pigment the room before it does not use: however full that room is, its last
 * place and this first one differ. Rooms beyond the table cycle it (row 6 would be row 0).
 */
const ACCENTS: AccentKey[][] = [
  ['red', 'teal', 'amber', 'blue', 'plum'],
  ['green', 'amber', 'blue', 'red', 'teal'],
  ['plum', 'green', 'red', 'amber', 'blue'],
  ['teal', 'plum', 'amber', 'green', 'red'],
  ['blue', 'red', 'green', 'plum', 'teal'],
  ['amber', 'teal', 'plum', 'blue', 'green'],
];

const ORDINALS = ['', 'Second ', 'Third ', 'Fourth ', 'Fifth ', 'Sixth '];

/** Everything about one room that does not depend on the rooms after it. */
export interface RoomSite {
  index: number;
  spec: PalaceRoomSpec;
  /** A ring is laid out as a hall until ring rooms are built. */
  shape: 'hall' | 'ring';
  plan: RoomPlan;
  /** World position of the room's origin (the threshold of its entrance doorway). */
  origin: Vec3;
  mirrored: boolean;
}

/** One built place: what stands there and where, in world coordinates. */
export interface PlaceSite {
  locusIndex: number;
  roomIndex: number;
  slot: number;
  feature: FeatureDef;
  accent: AccentKey;
  position: Vec3;
  /** Rotation about y that turns the feature's front (+z) to face the room. */
  yaw: number;
  /** Where the golden hand of a landmark stands, and the turn that faces it to the view. */
  hand?: { position: Vec3; facing: number };
}

export interface PalacePlan {
  spec: PalaceSpec;
  kit: KitDef;
  rooms: RoomSite[];
  places: PlaceSite[];
  /** The floor point of every slot of every room, built or not: the plots. */
  plots: Vec3[];
  meta: PalaceLayoutMeta;
  footprint: number[];
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const v3 = (x: number, y: number, z: number): Vec3 => [round(x), round(y), round(z)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The plan of a room of this shape. One size per shape, whatever the room holds. */
function planFor(_shape: 'hall' | 'ring'): RoomPlan {
  return HALL;
}

/**
 * The n-th landmark of a palace (n = room index × 5 + slot): the kit's own features, then
 * the kit-neutral props, each once; if a palace needs more than there are, the kit's
 * features come round again and are told apart by name ("The Second Lectern").
 */
function featureAt(kit: KitDef, n: number): { feature: FeatureDef; round: number } {
  const pool = kit.features.length + PROPS.length;
  if (n < kit.features.length) return { feature: kit.features[n], round: 0 };
  if (n < pool) return { feature: PROPS[n - kit.features.length], round: 0 };
  const again = n - pool;
  return { feature: kit.features[again % kit.features.length], round: 1 + Math.floor(again / kit.features.length) };
}

/** The floor point of a slot in its room's frame, before mirroring: where a floor feature of this footprint stands. */
function slotGround(plan: RoomPlan, slot: Slot, footprint = 0): [number, number] {
  if (slot.side === 0) return [slot.at, -plan.length + Math.max(FAR_STANDOFF, footprint + 0.4)];
  return [slot.side * (plan.halfWidth - Math.max(WALL_STANDOFF, footprint + 0.15)), slot.at];
}

interface Sited {
  position: Vec3;
  yaw: number;
  anchor: Vec3;
  view: CameraPose;
  hand: { position: Vec3; facing: number };
}

/** Where a feature stands in a slot of a room, where its image floats and where the learner stops to look. */
function site(room: RoomSite, slotIndex: number, feature: FeatureDef): Sited {
  const { plan } = room;
  const slot = SLOTS[slotIndex];
  const onWall = feature.mount === 'wall';
  // In the room's frame, unmirrored: p the feature's origin, (nx, nz) the wall's normal into the room.
  let px: number;
  let pz: number;
  let nx = 0;
  let nz = 0;
  let yaw: number;
  if (slot.side === 0) {
    nz = 1;
    [px, pz] = onWall ? [slot.at, -plan.length] : slotGround(plan, slot, feature.footprint);
    // A free-standing landmark turns towards its view, which stands to its right.
    yaw = onWall ? 0 : 0.5;
  } else {
    nx = -slot.side;
    [px, pz] = onWall ? [slot.side * plan.halfWidth, slot.at] : slotGround(plan, slot, feature.footprint);
    // Facing across the room; a free-standing feature turns a little towards the entrance, where its view stands.
    yaw = -slot.side * (Math.PI / 2 - (onWall ? 0 : 0.3));
  }
  const out = onWall ? WALL_IMAGE_OUT : 0;
  const ax = px + nx * out;
  const az = pz + nz * out;
  const ay = feature.height + IMAGE_CLEARANCE;

  // The view: far enough back that the feature and the image above it both fit the frame.
  const d = clamp(1.5 + 1.1 * ay, 4.3, 6.2);
  let cx: number;
  let cz: number;
  if (slot.side === 0) {
    // Well to the right of the landmark, but no nearer the place by the right-hand wall than the middle of the hall.
    cx = Math.min(ax + d * Math.sin(FAR_VIEW_ANGLE), 1.5);
    cz = az + Math.sqrt(d * d - (cx - ax) ** 2);
  } else {
    cx = ax + nx * d * Math.cos(SIDE_VIEW_ANGLE);
    cz = Math.min(az + d * Math.sin(SIDE_VIEW_ANGLE), -0.9);
  }
  // Aimed midway, in angle, between the floor under the feature and the top of its image: both are in the frame.
  const aim = (Math.atan2(ay + IMAGE_RADIUS - EYE, d) + Math.atan2(-EYE, d)) / 2;
  const ty = EYE + d * Math.tan(aim);

  // The golden hand of a landmark: beside it, on the side away from the doorway, where its view
  // (which stands to the right) sees it clear of the feature. Elsewhere: in front, a little aside.
  let hx: number;
  let hz: number;
  if (slot.side === 0) {
    hx = Math.max(px - Math.min(feature.footprint + 0.25, 1.45), -plan.halfWidth + 0.35);
    hz = pz + (onWall ? 0.85 : 0.3);
  } else {
    const aside = Math.atan2(cx - px, cz - pz) - 0.6;
    hx = px + Math.sin(aside) * (feature.footprint + 0.3);
    hz = pz + Math.cos(aside) * (feature.footprint + 0.3);
  }

  const m = room.mirrored ? -1 : 1;
  const [ox, , oz] = room.origin;
  const world = (x: number, y: number, z: number) => v3(ox + m * x, y, oz + z);
  return {
    position: world(px, 0, pz),
    yaw: round(m * yaw),
    anchor: world(ax, ay, az),
    view: { position: world(cx, EYE, cz), target: world(ax, ty, az) },
    hand: { position: world(hx, 0, hz), facing: round(m * Math.atan2(cx - hx, cz - hz)) },
  };
}

/** The rooms of a spec, each placed by the rooms before it. */
export function roomSites(spec: PalaceSpec): RoomSite[] {
  let z = 0;
  return spec.rooms.map((room, index) => {
    const shape = room.shape === 'ring' ? 'ring' : 'hall';
    const plan = planFor(shape);
    const origin: Vec3 = [0, 0, round(z)];
    z -= plan.length + plan.partition;
    return { index, spec: room, shape, plan, origin, mirrored: index % 2 === 1 };
  });
}

/** Rail waypoints through the doorway out of `room`: one each side of the wall, on the axis. */
function throughFarDoor(room: RoomSite): Vec3[] {
  const z = room.origin[2] - room.plan.length;
  return [v3(0, EYE, z + 1.3), v3(0, EYE, z - room.plan.partition - 0.9)];
}

export function planLayout(input: PalaceSpec): PalacePlan {
  const spec = normalizeSpec(input);
  const kit = getKit(spec.kit);
  const rooms = roomSites(spec);
  const places: PlaceSite[] = [];
  const loci: Locus[] = [];
  const footprint: number[] = [];
  const plots: Vec3[] = [];
  const via: Record<string, Vec3[]> = {};

  for (const room of rooms) {
    const m = room.mirrored ? -1 : 1;
    for (const slot of SLOTS) {
      const [x, z] = slotGround(room.plan, slot);
      plots.push(v3(room.origin[0] + m * x, 0, room.origin[2] + z));
    }
    const count = Math.min(room.spec.places, ROOM_CAPACITY);
    for (let slot = 0; slot < count; slot++) {
      const n = room.index * ROOM_CAPACITY + slot;
      const { feature, round: again } = featureAt(kit, n);
      const s = site(room, slot, feature);
      const accent = ACCENTS[room.index % ACCENTS.length][slot];
      const landmark = slot === ROOM_CAPACITY - 1;
      const index = loci.length;
      // The walk from the last place of the room before comes in through this room's entrance.
      if (slot === 0 && room.index > 0 && index > 0) via[`${index - 1}>${index}`] = throughFarDoor(rooms[room.index - 1]);
      loci.push({
        id: placeId(room.spec.id, slot + 1),
        index,
        roomId: room.spec.id,
        name: `The ${ORDINALS[again] ?? ''}${feature.name}`,
        hint: landmark ? `${feature.hint} The fifth place of its room: it bears the golden hand.` : feature.hint,
        anchor: s.anchor,
        view: s.view,
        accent,
        ...(landmark ? { marker: 'hand' as const } : {}),
      });
      footprint.push(feature.footprint);
      places.push({ locusIndex: index, roomIndex: room.index, slot, feature, accent, position: s.position, yaw: s.yaw, ...(landmark ? { hand: s.hand } : {}) });
    }
  }

  const first = rooms[0];
  const front = first.plan.partition;
  via['entry>0'] = [v3(0, EYE, front + 0.4), v3(0, EYE, -0.9)];
  const info = KIT_LIST.find((k) => k.id === kit.id);
  const roomList: Room[] = rooms.map((r) => ({
    id: r.spec.id,
    name: r.spec.name,
    mood: kit.moods[r.index % kit.moods.length] ?? '',
    center: v3(r.origin[0], 0, r.origin[2] - r.plan.length / 2),
  }));
  const names = rooms.map((r) => r.spec.name).join(', ');
  const meta: PalaceLayoutMeta = {
    id: palaceLayoutId(spec),
    name: info?.name ?? kit.id,
    description: `${info?.name ?? kit.id}: ${rooms.length === 1 ? 'one room' : `${rooms.length} rooms`} (${names}), ${loci.length} places.`,
    rooms: roomList,
    loci,
    // On the forecourt, far enough back to read the first room's name over the front door.
    entry: { position: v3(0, EYE, front + ENTRY_BACK), target: v3(0, 2.55, 0) },
    // Title screen: text covers the left 680 px. Just inside the first room, looking a little
    // left of the axis, so the far doorway and the name over it sit right of centre.
    overview: { position: v3(-0.5, 2.1, -1), target: v3(-1.5, 1.9, -9) },
    via,
  };
  return { spec, kit, rooms, places, plots, meta, footprint };
}
