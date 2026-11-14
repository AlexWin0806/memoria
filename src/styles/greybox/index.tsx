import { DoubleSide, FrontSide } from 'three';
import type { Theme } from '@/core/types';
import { useTheme } from '@/styles';
import type { StyleModule, SurfaceProps } from '@/styles/types';

/**
 * Greybox: the neutral reference style. Plain lit materials, no post-processing.
 * Use it as the template for a new style (see .claude/skills/palace-theme-authoring).
 */
function Surface({ slot, accent, doubleSided }: SurfaceProps) {
  const theme = useTheme();
  const color = accent ? theme.palette.accents[accent] : theme.palette.surfaces[slot];
  const side = doubleSided ? DoubleSide : FrontSide;
  if (slot === 'glow') return <meshBasicMaterial color={color} side={side} toneMapped={false} />;
  if (slot === 'water')
    return <meshStandardMaterial color={color} roughness={0.15} metalness={0.1} transparent opacity={0.85} side={side} />;
  return (
    <meshStandardMaterial
      color={color}
      roughness={slot === 'metal' ? 0.45 : 0.92}
      metalness={slot === 'metal' ? 0.15 : 0}
      side={side}
    />
  );
}

function Environment({ theme }: { theme: Theme }) {
  const { palette, light, fog } = theme;
  const [dx, dy, dz] = light.keyDirection;
  return (
    <>
      <color attach="background" args={[palette.paper]} />
      <fog attach="fog" args={[palette.fog, fog.near, fog.far]} />
      <hemisphereLight args={[palette.sky[1], palette.surfaces.floor, light.ambient]} />
      <directionalLight color={light.keyColor} intensity={light.keyIntensity} position={[-dx * 12, -dy * 12, -dz * 12]} />
      <directionalLight color={light.fillColor} intensity={light.fillIntensity} position={[dx * 8, 6, dz * 8]} />
    </>
  );
}

const greybox: StyleModule = {
  id: 'greybox',
  name: 'Greybox',
  Surface,
  Environment,
  Post: () => null,
};

export default greybox;
