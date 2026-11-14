import type { FeatureDef } from '@/layouts/kits/types';
import { ANVIL } from './anvil';
import { BANNER } from './banner';
import { BELL } from './bell';
import { CHEST } from './chest';
import { CLOCK } from './clock';
import { DRUM } from './drum';
import { HARP } from './harp';
import { HOURGLASS } from './hourglass';
import { LADDER } from './ladder';
import { LOOM } from './loom';
import { SCALES } from './scales';
import { SHIELD } from './shield';
import { TELESCOPE } from './telescope';
import { WELL } from './well';

/**
 * Features that belong to no one kit (an hourglass, a globe, a bell): a generated palace
 * draws on these after its kit's own features, so that thirty places can be thirty different
 * things. One file per feature in this folder; listed here in a fixed order, which the
 * generator relies on (append only: reordering would change existing palaces).
 */
export const PROPS: FeatureDef[] = [
  HOURGLASS, BELL, CHEST, SHIELD, HARP, SCALES, ANVIL, LADDER, TELESCOPE, WELL, BANNER, LOOM, CLOCK, DRUM,
];
