import type { ReactNode } from 'react';
import type { Vec3 } from '@/core/types';

/**
 * Wraps the geometry of one place (its feature: the lamp, the statue). Layouts put every
 * feature inside one of these so that the engine can take the feature apart when the place
 * is in ruins and put it back together as the learner repairs it (`SceneView.integrity`).
 *
 *   <LocusFeature index={6}><Statue /></LocusFeature>
 *
 * `index` is the locus index on the route. `ground` is the point on the floor that the pieces
 * fall around; default: the floor under the locus's focus (or anchor).
 */
export function LocusFeature({ children }: { index: number; ground?: Vec3; children: ReactNode }) {
  // Placeholder: the feature is always whole. The repair mechanic replaces this body.
  return <group>{children}</group>;
}
