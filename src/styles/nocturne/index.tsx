import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { DirectionalLight } from 'three';
import type { Theme } from '@/core/types';
import { useTheme } from '@/styles';
import type { StyleModule, SurfaceProps } from '@/styles/types';
import { LightShaft, LocusLamps, Sky, Stars } from './Atmosphere';
import { knob, noc, surfaceMaterial, syncUniforms } from './materials';

/**
 * Nocturne Atrium: a Roman atrium at blue hour. One cool light (the sky through the roof
 * opening, with the only shadow map) and one small warm lamp per locus, whose pool of
 * light is computed in the surface shader from the development field.
 */
function Surface({ slot, accent, doubleSided }: SurfaceProps) {
  const theme = useTheme();
  const material = useMemo(() => surfaceMaterial(theme, slot, accent, doubleSided), [theme, slot, accent, doubleSided]);
  return <primitive object={material} attach="material" />;
}

/** Screenshots and reduced-motion users get a still scene: no ripples, drift or flicker. */
function motionFrozen() {
  return (
    new URLSearchParams(window.location.search).has('shot') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function Environment({ theme }: { theme: Theme }) {
  const { palette, light, fog } = theme;
  // palette.paper is the light tone of the imago print here, so the dark comes from the sky.
  const night = palette.sky[1];
  const frozen = useMemo(motionFrozen, []);
  useLayoutEffect(() => syncUniforms(theme), [theme]);
  useFrame(({ clock }) => {
    noc.uTime.value = frozen ? 1.3 : clock.elapsedTime;
  });

  const key = useMemo(() => {
    const l = new DirectionalLight();
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    const c = l.shadow.camera;
    c.left = c.bottom = -8;
    c.right = c.top = 8;
    c.near = 1;
    c.far = 34;
    c.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.04;
    l.shadow.radius = 5;
    return l;
  }, []);
  const [dx, dy, dz] = light.keyDirection;
  const len = Math.hypot(dx, dy, dz) || 1;
  const sx = knob(theme, 'shaftX', 0);
  const sz = knob(theme, 'shaftZ', 0);

  return (
    <>
      <color attach="background" args={[night]} />
      <fog attach="fog" args={[palette.fog, fog.near, fog.far]} />
      <hemisphereLight args={[light.fillColor, night, light.ambient]} />
      <primitive
        object={key}
        color={light.keyColor}
        intensity={light.keyIntensity}
        position={[sx - (dx / len) * 16, -(dy / len) * 16, sz - (dz / len) * 16]}
      />
      <primitive object={key.target} position={[sx, 0, sz]} />
      <Sky />
      <Stars theme={theme} />
      {/* dark ground beyond the floor slab, so the frame never opens onto bare sky below */}
      <mesh position={[0, -0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[70, 48]} />
        <meshBasicMaterial color={night} />
      </mesh>
      <LightShaft theme={theme} />
      <LocusLamps theme={theme} frozen={frozen} />
    </>
  );
}

function Post({ theme }: { theme: Theme }) {
  const gl = useThree((s) => s.gl);
  const exposure = knob(theme, 'exposure', 1);
  useEffect(() => {
    const previous = gl.toneMappingExposure;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = previous;
    };
  }, [gl, exposure]);
  // Scene materials write linear HDR; the single tone map happens here, after bloom.
  return (
    <EffectComposer multisampling={knob(theme, 'msaa', 4)}>
      <Bloom
        mipmapBlur
        levels={5}
        luminanceThreshold={knob(theme, 'bloomThreshold', 1.05)}
        luminanceSmoothing={0.12}
        intensity={knob(theme, 'bloomIntensity', 0.65)}
        radius={knob(theme, 'bloomRadius', 0.7)}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={knob(theme, 'vignetteOffset', 0.3)} darkness={knob(theme, 'vignetteDarkness', 0.6)} />
    </EffectComposer>
  );
}

const nocturne: StyleModule = {
  id: 'nocturne',
  name: 'Nocturne Atrium',
  shadows: true,
  Surface,
  Environment,
  Post,
};

export default nocturne;
