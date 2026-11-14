import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, type Group, LinearFilter, type MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { Locus, Theme, Vec3 } from '@/core/types';
import { useTheme } from '@/styles';

const TEX_HEIGHT = 256;
/** Height of the plate in metres: about 120 px tall from a locus viewpoint at 1440×900. */
const WORLD_HEIGHT = 0.48;
const FADE_SECONDS = 0.35;

interface Plate {
  texture: CanvasTexture;
  aspect: number;
  draw: () => void;
}

/** A name plate drawn with the theme's display face, ink on paper, ruled in the locus's pigment. */
function makePlate(name: string, eyebrow: string, theme: Theme, pigment: string): Plate {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const nameFont = `600 104px ${theme.type.display}, serif`;
  const eyebrowFont = `600 50px ${theme.type.display}, serif`;
  ctx.font = nameFont;
  const pad = 56;
  canvas.width = Math.ceil(Math.max(ctx.measureText(name).width, 260) + pad * 2);
  canvas.height = TEX_HEIGHT;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const draw = () => {
    const { width: w, height: h } = canvas;
    const r = Math.min(40, theme.ui.radius * 4);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, r);
    ctx.fillStyle = theme.palette.paper;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = theme.palette.ink;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.palette.inkSoft;
    ctx.font = eyebrowFont;
    ctx.fillText(eyebrow, w / 2, 74);
    ctx.fillStyle = theme.palette.ink;
    ctx.font = nameFont;
    ctx.fillText(name, w / 2, 180);
    ctx.fillStyle = pigment;
    ctx.fillRect(pad, 204, w - pad * 2, 12);
    texture.needsUpdate = true;
  };
  draw();
  return { texture, aspect: canvas.width / canvas.height, draw };
}

/** The name of a locus, shown in-world at `at` (default: its anchor) during the familiarization walk. */
export function LocusLabel({ locus, at, total, raised, still }: { locus: Locus; at?: Vec3; total: number; raised?: boolean; still?: boolean }) {
  const theme = useTheme();
  const face = useRef<Group>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const age = useRef(0);
  const pigment = theme.palette.accents[locus.accent];
  const plate = useMemo(() => makePlate(locus.name, `${locus.index + 1} of ${total}`, theme, pigment), [locus.name, locus.index, total, theme, pigment]);

  useEffect(() => {
    // The display face may still be loading when the plate is first drawn.
    let alive = true;
    void document.fonts.load(`600 104px ${theme.type.display}`).then(() => alive && plate.draw());
    return () => {
      alive = false;
      plate.texture.dispose();
    };
  }, [plate, theme.type.display]);

  useFrame(({ camera }, delta) => {
    if (face.current) face.current.quaternion.copy(camera.quaternion);
    if (!material.current) return;
    age.current = Math.min(FADE_SECONDS, age.current + delta);
    const p = age.current / FADE_SECONDS;
    material.current.opacity = p * (2 - p);
    if (face.current) face.current.position.y = still ? 0 : (1 - p * (2 - p)) * -0.08;
  });

  const [x, y, z] = at ?? locus.anchor;
  return (
    <group position={[x, y + (raised ? 1.05 : 0), z]}>
      <group ref={face}>
        {/* Drawn over the scene: a name the learner is asked to read must never be half hidden. */}
        <mesh renderOrder={20}>
          <planeGeometry args={[WORLD_HEIGHT * plate.aspect, WORLD_HEIGHT]} />
          <meshBasicMaterial ref={material} map={plate.texture} transparent opacity={0} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
