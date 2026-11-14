import type { AccentKey, CameraPose, Locus, PalaceLayoutMeta, PalaceRoomSpec, PalaceSpec, Room, Vec3 } from '@/core/types';
import { getKit } from '@/layouts/kits';
import { KIT_LIST } from '@/layouts/kits/list';
import type { FeatureDef, KitDef, RoomPlan, RoomPlot } from '@/layouts/kits/types';
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
 *   - A place's position, feature, name, accent and view depend on (kit, room index, room
 *     shape, slot). In particular not on how many places its room has, nor on which rooms follow.
 *   - The only things that depend on what comes later are the rail from the last place of a
 *     room to the first place of the next, and whether a far doorway is open.
 *
 * `scripts/palace-invariance.mjs` proves it for specs and their extensions.
 *
 * The palace runs towards -z from the front door, like the Domus. A hall:
 *
 *        z = 0   entrance wall, doorway on the axis
 *        -3.5    place 1   by the left wall         (mirrored in every second room)
 *        -6.5    place 2   by the right wall
 *        -9.5    place 3   by the left wall
 *       -12.5    place 4   by the right wall
 *       -14.5    place 5   at the far wall, left of the doorway: the room's landmark, with the golden hand
 *       -16.0    far wall, doorway on the axis, the next room's name carved over it
 *
 * A ring (for a cycle) is an eight-sided room 12.4 m across with a doorway in its near side
 * and one in its far side. The places stand before five of the other six sides, in order
 * round the room from the left of the entrance, and the learner turns in the middle to face
 * each: the fifth, the landmark, is the last before the circle closes.
 *
 * Every room of a shape has one size, built for five places: a room with fewer has empty plots.
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

/** The ring: `halfWidth` is the distance from the centre to the middle of each of its eight sides. */
export const RING: RoomPlan = { ...HALL, halfWidth: 6.2, length: 12.4 };

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

/** One plot of a room, in the room's own frame before mirroring. */
interface Slot {
  /** The point on the wall face the place stands before. A wall feature hangs here. */
  x: number;
  z: number;
  /** Unit normal of the wall there, into the room. */
  nx: number;
  nz: number;
  /** A floor feature stands this far out from the wall (to its origin), or its footprint plus `margin` if that is more. */
  standoff: number;
  margin: number;
  /** How far round from square-on the view stands: the normal, turned by this angle about the vertical, points at it. */
  swing: number;
  /** A free-standing feature is turned this far the same way, towards its view. */
  turn: number;
  /** The view stands no further right than this, and that much further back instead. */
  maxViewX?: number;
}

/** A direction turned by `a` about the vertical. */
const turned = (x: number, z: number, a: number): [number, number] => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

/**
 * A hall: two places by each side wall, their views standing a little back towards the
 * entrance; and the landmark at the far wall left of the doorway, seen from well to its
 * right (but from no nearer the fourth place than the middle of the hall), clear of the
 * walk to the door.
 */
function hallSlots(plan: RoomPlan): Slot[] {
  const side = (s: -1 | 1, z: number): Slot => ({ x: s * plan.halfWidth, z, nx: -s, nz: 0, standoff: 1, margin: 0.15, swing: -s * 0.38, turn: -s * 0.3 });
  const landmark: Slot = { x: -2.85, z: -plan.length, nx: 0, nz: 1, standoff: 1.5, margin: 0.4, swing: -0.96, turn: -0.5, maxViewX: 1.5 };
  return [side(-1, -3.5), side(1, -6.5), side(-1, -9.5), side(1, -12.5), landmark];
}

/**
 * A ring: places before the sides 45, 90 and 135 degrees round from the entrance, then, past
 * the far doorway, 225 and 270. Each view stands near the middle of the room, a step towards
 * the place before: that one then leaves the picture on the left, and the next one stands
 * at its right edge, where the walk panel is.
 */
function ringSlots(plan: RoomPlan): Slot[] {
  const r = plan.halfWidth;
  return [45, 90, 135, 225, 270].map((degrees): Slot => {
    const a = (degrees * Math.PI) / 180;
    return { x: -r * Math.sin(a), z: -r + r * Math.cos(a), nx: Math.sin(a), nz: -Math.cos(a), standoff: 1, margin: 0.15, swing: 0.15, turn: 0.1 };
  });
}

/** The plan and the plots of a room of each shape. One size per shape, whatever the room holds. */
const SHAPES: Record<'hall' | 'ring', { plan: RoomPlan; slots: Slot[] }> = {
  hall: { plan: HALL, slots: hallSlots(HALL) },
  ring: { plan: RING, slots: ringSlots(RING) },
};

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
  shape: 'hall' | 'ring';
  plan: RoomPlan;
  /** World position of the room's origin (the threshold of its entrance doorway). */
  origin: Vec3;
  mirrored: boolean;
  /** The five plots in the room's own frame, mirroring applied: what the kit's Room is given. */
  plots: RoomPlot[];
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
function slotGround(slot: Slot, footprint = 0): [number, number] {
  const out = Math.max(slot.standoff, footprint + slot.margin);
  return [slot.x + slot.nx * out, slot.z + slot.nz * out];
}

interface Sited {
  position: Vec3;
  yaw: number;
  anchor: Vec3;
  view: CameraPose;
  hand: { position: Vec3; facing: number };
}

/** Where a feature stands in a slot of a room, where its image floats and where the learner stops to look. */
function site(room: RoomSite, slot: Slot, feature: FeatureDef): Sited {
  const onWall = feature.mount === 'wall';
  const { nx, nz } = slot;
  // In the room's frame, unmirrored: p the feature's origin, a the point its image floats over.
  const [px, pz] = onWall ? [slot.x, slot.z] : slotGround(slot, feature.footprint);
  const [fx, fz] = turned(nx, nz, onWall ? 0 : slot.turn);
  const yaw = Math.atan2(fx, fz);
  const out = onWall ? WALL_IMAGE_OUT : 0;
  const ax = px + nx * out;
  const az = pz + nz * out;
  const ay = feature.height + IMAGE_CLEARANCE;

  // The view: far enough back that the feature and the image above it both fit the frame.
  const d = clamp(1.5 + 1.1 * ay, 4.3, 6.2);
  const [vx, vz] = turned(nx, nz, slot.swing);
  let cx = ax + vx * d;
  let cz = az + vz * d;
  if (slot.maxViewX !== undefined && cx > slot.maxViewX) {
    cx = slot.maxViewX;
    cz = az + Math.sqrt(d * d - (cx - ax) ** 2);
  }
  // Aimed midway, in angle, between the floor under the feature and the top of its image: both are in the frame.
  const aim = (Math.atan2(ay + IMAGE_RADIUS - EYE, d) + Math.atan2(-EYE, d)) / 2;
  const ty = EYE + d * Math.tan(aim);

  // The golden hand of a landmark: beside it, on the side its view stands towards (in a hall,
  // the side of the doorway), so that nothing of the feature can stand between the two.
  const [sx, sz] = turned(nx, nz, Math.sign(slot.swing) * (Math.PI / 2));
  const beside = Math.min(feature.footprint + 0.25, 1.4);
  const before = onWall ? 0.85 : 0.3;
  const hx = px + sx * beside + nx * before;
  const hz = pz + sz * beside + nz * before;

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
export function roomSites(spec: PalaceSpec, kit: KitDef): RoomSite[] {
  let z = 0;
  return spec.rooms.map((room, index) => {
    // A kit that draws no ring room gets a hall: the plots of a ring would stand in mid-air in one.
    const shape = room.shape === 'ring' && kit.rings ? 'ring' : 'hall';
    const { plan, slots } = SHAPES[shape];
    const origin: Vec3 = [0, 0, round(z)];
    z -= plan.length + plan.partition;
    // Every second hall is mirrored. A ring never is: its route always turns the same way.
    const mirrored = shape === 'hall' && index % 2 === 1;
    const m = mirrored ? -1 : 1;
    const plots = slots.map((slot): RoomPlot => {
      const [gx, gz] = slotGround(slot);
      return { wall: [round(m * slot.x), round(slot.z)], normal: [round(m * slot.nx), round(slot.nz)], ground: [round(m * gx), round(gz)] };
    });
    return { index, spec: room, shape, plan, origin, mirrored, plots };
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
  const rooms = roomSites(spec, kit);
  const places: PlaceSite[] = [];
  const loci: Locus[] = [];
  const footprint: number[] = [];
  const plots: Vec3[] = [];
  const via: Record<string, Vec3[]> = {};

  for (const room of rooms) {
    const { slots } = SHAPES[room.shape];
    for (const plot of room.plots) plots.push(v3(room.origin[0] + plot.ground[0], 0, room.origin[2] + plot.ground[1]));
    const count = Math.min(room.spec.places, ROOM_CAPACITY, slots.length);
    for (let slot = 0; slot < count; slot++) {
      const n = room.index * ROOM_CAPACITY + slot;
      const { feature, round: again } = featureAt(kit, n);
      const s = site(room, slots[slot], feature);
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
    mood: (r.shape === 'ring' && kit.ringMood) || (kit.moods[r.index % kit.moods.length] ?? ''),
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
    overview: { position: v3(-0.5, 2.1, -2.4), target: v3(-1.5, 1.9, -10.4) },
    via,
  };
  return { spec, kit, rooms, places, plots, meta, footprint };
}
