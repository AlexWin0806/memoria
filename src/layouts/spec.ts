import type { PalaceRoomSpec, PalaceSpec } from '@/core/types';

/**
 * Generated palaces, as data. Pure functions only (no React, no three): the app, the stores
 * and the storage repair all import this file.
 *
 * A generated palace is identified by its whole specification, encoded into the layout id:
 *
 *   gen:<kit>;<room id>~<places>~<shape>~<name>;<room id>~...
 *
 * so that a deck needs nothing but its `layoutId` to rebuild its palace, and so that every
 * place that calls `getLayout(layoutId)` works for generated palaces unchanged.
 *
 * The rule that makes a palace safe to extend: **nothing that exists ever moves.** A room's
 * position depends only on the rooms before it; a place's position depends only on its room
 * and its number. Extending appends places to rooms that have space and rooms to the end of
 * the route. Ids are never reused, so a memory image stays where the learner put it.
 */

/** Most places in one room. The art bible asks for 3 to 5 loci per room. */
export const ROOM_CAPACITY = 5;
export const MAX_ROOMS = 6;
/** Most places in one palace. */
export const MAX_PLACES = ROOM_CAPACITY * MAX_ROOMS;

export const GENERATED_PREFIX = 'gen:';

export function isGeneratedId(layoutId: string | null | undefined): layoutId is string {
  return typeof layoutId === 'string' && layoutId.startsWith(GENERATED_PREFIX);
}

const clampPlaces = (n: number) => Math.max(1, Math.min(ROOM_CAPACITY, Math.round(Number.isFinite(n) ? n : 1)));

/** A spec that the generator can always build: at most MAX_ROOMS rooms, 1..ROOM_CAPACITY places each, unique ids. */
export function normalizeSpec(spec: PalaceSpec): PalaceSpec {
  const seen = new Set<string>();
  const rooms: PalaceRoomSpec[] = [];
  for (const r of spec.rooms.slice(0, MAX_ROOMS)) {
    let id = /^[a-z0-9]+$/i.test(r.id) ? r.id : `r${rooms.length + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const room: PalaceRoomSpec = { id, name: r.name.trim().slice(0, 40) || `Room ${rooms.length + 1}`, places: clampPlaces(r.places) };
    if (r.shape === 'ring') room.shape = 'ring';
    rooms.push(room);
  }
  if (!rooms.length) rooms.push({ id: 'r1', name: 'Room 1', places: 3 });
  return { kit: /^[a-z0-9-]+$/.test(spec.kit) ? spec.kit : 'gothic', rooms };
}

export function palaceLayoutId(spec: PalaceSpec): string {
  const s = normalizeSpec(spec);
  const rooms = s.rooms.map((r) => [r.id, r.places, r.shape === 'ring' ? 'ring' : 'hall', encodeURIComponent(r.name)].join('~'));
  return `${GENERATED_PREFIX}${s.kit};${rooms.join(';')}`;
}

/** The spec inside a generated layout id, or null for a handcrafted palace or a damaged id. */
export function parsePalaceId(layoutId: string | null | undefined): PalaceSpec | null {
  if (!isGeneratedId(layoutId)) return null;
  const [kit, ...parts] = layoutId.slice(GENERATED_PREFIX.length).split(';');
  if (!kit || !parts.length) return null;
  const rooms: PalaceRoomSpec[] = [];
  for (const part of parts) {
    const [id, places, shape, name] = part.split('~');
    if (!id || !places || name === undefined) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      return null;
    }
    rooms.push({ id, name: decoded, places: Number(places), ...(shape === 'ring' ? { shape: 'ring' as const } : {}) });
  }
  return normalizeSpec({ kit, rooms });
}

/** `<room id>-<n>`: the id of the n-th place (from 1) of a room. */
export const placeId = (roomId: string, n: number) => `${roomId}-${n}`;

/** Every place of a palace, in route order. */
export function specPlaces(spec: PalaceSpec): { id: string; roomId: string; roomIndex: number; slot: number }[] {
  return spec.rooms.flatMap((r, roomIndex) =>
    Array.from({ length: r.places }, (_, k) => ({ id: placeId(r.id, k + 1), roomId: r.id, roomIndex, slot: k })),
  );
}

export const specPlaceCount = (spec: PalaceSpec) => spec.rooms.reduce((n, r) => n + r.places, 0);

/** How many more places a palace can take: in its rooms as they stand, and in rooms it could still add. */
export function specRoomLeft(spec: PalaceSpec): number {
  const inRooms = spec.rooms.reduce((n, r) => n + (ROOM_CAPACITY - r.places), 0);
  const newRooms = (MAX_ROOMS - spec.rooms.length) * ROOM_CAPACITY;
  return Math.min(MAX_PLACES - specPlaceCount(spec), inRooms + newRooms);
}

/** One request to grow a palace: `count` new places for the category `roomName` (or the room `roomId`). */
export interface Growth {
  roomId?: string;
  roomName?: string;
  count: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function freshRoomId(rooms: PalaceRoomSpec[]): string {
  let n = rooms.length + 1;
  while (rooms.some((r) => r.id === `r${n}`)) n++;
  return `r${n}`;
}

/**
 * Grows a palace without moving anything in it. For each request: fill the named room while
 * it has space, then open a new room at the end of the route for the rest (a category that
 * outgrows its room continues in "<name> II"). Returns the new spec and the ids of the places
 * that were added, in the order asked for; fewer than asked if the palace is full.
 */
export function extendSpec(spec: PalaceSpec, growth: Growth[]): { spec: PalaceSpec; added: string[][] } {
  const rooms = normalizeSpec(spec).rooms.map((r) => ({ ...r }));
  const total = () => rooms.reduce((n, r) => n + r.places, 0);
  const added: string[][] = [];
  for (const g of growth) {
    const ids: string[] = [];
    let left = Math.max(0, Math.round(g.count));
    const name = g.roomName?.trim() || rooms.find((r) => r.id === g.roomId)?.name || 'New wing';
    // The room asked for, then any annexe of the same category opened earlier.
    const homes = rooms.filter((r) => r.id === g.roomId || sameName(r.name, name) || r.name.toLowerCase().startsWith(`${name.toLowerCase()} `));
    for (const room of homes) {
      while (left > 0 && room.places < ROOM_CAPACITY && total() < MAX_PLACES) {
        room.places++;
        ids.push(placeId(room.id, room.places));
        left--;
      }
    }
    let annexe = homes.length;
    while (left > 0 && rooms.length < MAX_ROOMS && total() < MAX_PLACES) {
      annexe++;
      const room: PalaceRoomSpec = { id: freshRoomId(rooms), name: annexe > 1 ? `${name} ${roman(annexe)}` : name, places: 0 };
      rooms.push(room);
      while (left > 0 && room.places < ROOM_CAPACITY && total() < MAX_PLACES) {
        room.places++;
        ids.push(placeId(room.id, room.places));
        left--;
      }
    }
    added.push(ids);
  }
  return { spec: { kit: spec.kit, rooms }, added };
}

const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] ?? String(n);

/**
 * A first palace for material that falls into categories: one room per category in the order
 * given, a category of more than ROOM_CAPACITY items continuing in a second room. Returns the
 * spec and, per category, the place ids for its items in order (short if the palace is full).
 */
export function planSpec(kit: string, categories: { name: string; count: number; shape?: 'hall' | 'ring' }[]): { spec: PalaceSpec; places: string[][] } {
  const rooms: PalaceRoomSpec[] = [];
  const places: string[][] = [];
  let total = 0;
  for (const c of categories) {
    const ids: string[] = [];
    let left = Math.max(0, Math.round(c.count));
    let part = 0;
    while (left > 0 && rooms.length < MAX_ROOMS && total < MAX_PLACES) {
      part++;
      const take = Math.min(left, ROOM_CAPACITY, MAX_PLACES - total);
      const room: PalaceRoomSpec = { id: `r${rooms.length + 1}`, name: part > 1 ? `${c.name} ${roman(part)}` : c.name, places: take };
      if (c.shape === 'ring') room.shape = 'ring';
      rooms.push(room);
      for (let k = 1; k <= take; k++) ids.push(placeId(room.id, k));
      total += take;
      left -= take;
    }
    places.push(ids);
  }
  return { spec: normalizeSpec({ kit, rooms }), places };
}
