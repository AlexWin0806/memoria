import type { PalaceLayout } from '@/layouts';
import { useTheme } from '@/styles';

/** Posts stop short of the anchor so they do not draw across the memory image. */
const CLEARANCE = 0.8;

/**
 * `?debug`: a post from the floor to each locus anchor and a ground grid, so camera
 * poses and the rail can be judged before (or without) the architecture.
 * Debug only, so it colours itself instead of going through <Surface>.
 */
export function DebugPosts({ layout }: { layout: PalaceLayout }) {
  const theme = useTheme();
  return (
    <group>
      <gridHelper args={[60, 60, theme.palette.inkSoft, theme.palette.surfaces.trim]} position={[0, 0.001, -5]} />
      {layout.loci.map((l) => (
        <group key={l.id} position={[l.anchor[0], 0, l.anchor[2]]}>
          <mesh position={[0, (l.anchor[1] - CLEARANCE) / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, l.anchor[1] - CLEARANCE, 8]} />
            <meshBasicMaterial color={theme.palette.accents[l.accent]} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.36, 32]} />
            <meshBasicMaterial color={theme.palette.accents[l.accent]} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
