import type { FeatureDef } from '@/layouts/kits/types';
import { ABACUS } from './abacus';
import { ANCHOR } from './anchor';
import { ANVIL } from './anvil';
import { BANNER } from './banner';
import { BEEHIVE } from './beehive';
import { BELL } from './bell';
import { BIRDCAGE } from './birdcage';
import { CAULDRON } from './cauldron';
import { CHESS_TABLE } from './chess-table';
import { CHEST } from './chest';
import { CLOCK } from './clock';
import { DRUM } from './drum';
import { EASEL } from './easel';
import { HARP } from './harp';
import { HOURGLASS } from './hourglass';
import { KEYS } from './keys';
import { LADDER } from './ladder';
import { LOOM } from './loom';
import { MIRROR } from './mirror';
import { OBELISK } from './obelisk';
import { SCALES } from './scales';
import { SHIELD } from './shield';
import { SHIP } from './ship';
import { SPINNING_WHEEL } from './spinning-wheel';
import { TELESCOPE } from './telescope';
import { WEATHERCOCK } from './weathercock';
import { WELL } from './well';
import { WHEELBARROW } from './wheelbarrow';

/**
 * Features that belong to no one kit (an hourglass, a bell, an anvil): a generated palace
 * draws on these after its kit's own features, so that thirty places can be thirty different
 * things. One file per feature in this folder; listed here in a fixed order, which the
 * generator relies on (append only: reordering would change existing palaces).
 *
 * The order mixes them on purpose: neighbours in the list differ in height, mass and mount,
 * and every fourth of the first twenty is a wall feature. The last row is a reserve, past
 * what a palace of thirty places draws; the ladder is in it because the Gothic kit has a
 * bookcase with a ladder of its own.
 */
export const PROPS: FeatureDef[] = [
  HOURGLASS, BELL, CHEST, SHIELD,
  HARP, SCALES, ANVIL, ABACUS,
  TELESCOPE, WELL, BANNER, LOOM,
  CLOCK, DRUM, BIRDCAGE, KEYS,
  CAULDRON, MIRROR, OBELISK, ANCHOR,
  CHESS_TABLE, WEATHERCOCK, BEEHIVE, WHEELBARROW,
  SHIP, EASEL, SPINNING_WHEEL, LADDER,
];
