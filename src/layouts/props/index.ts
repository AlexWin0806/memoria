import type { FeatureDef } from '@/layouts/kits/types';

/**
 * Features that belong to no one kit (an hourglass, a globe, a bell): a generated palace
 * draws on these after its kit's own features, so that thirty places can be thirty different
 * things. One file per feature in this folder; listed here in a fixed order, which the
 * generator relies on (append only: reordering would change existing palaces).
 */
export const PROPS: FeatureDef[] = [];
