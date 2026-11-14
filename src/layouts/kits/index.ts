import { GOTHIC } from './gothic';
import { WORKSHOP } from './workshop';
import { DEFAULT_KIT_ID } from './list';
import type { KitDef } from './types';
import { ZEN } from './zen';

/** Every kit a generated palace can be built in, by id. Each also has an entry in ./list.ts. */
export const KITS: Record<string, KitDef> = { [GOTHIC.id]: GOTHIC, [ZEN.id]: ZEN, [WORKSHOP.id]: WORKSHOP };

/** The kit of that id; the default kit for an id that is not (or no longer) registered. */
export function getKit(id: string | null | undefined): KitDef {
  return (id && KITS[id]) || KITS[DEFAULT_KIT_ID];
}

export { DEFAULT_KIT_ID, KIT_LIST, type KitInfo } from './list';
export type { FeatureDef, KitDef, KitRoomProps, RoomPlan, RoomPlot } from './types';
