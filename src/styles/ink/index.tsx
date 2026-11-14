import { useFrame, type RootState } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import {
  Camera,
  Color,
  DepthTexture,
  DoubleSide,
  FrontSide,
  type Material,
  Mesh,
  type Object3D,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { Theme } from '@/core/types';
import { useTheme } from '@/styles';
import { developmentUniforms } from '@/styles/development';
import type { StyleModule, SurfaceProps } from '@/styles/types';
import { PAGE_FRAG, PAGE_VERT, SURFACE_FRAG, SURFACE_VERT } from './shaders';

/**
 * Ink & Vellum: iron-gall line over calfskin, thin mineral washes.
 *
 * Frame: the scene is drawn twice into off-screen targets (wash colour, then normals +
 * depth), and one full-screen "page" pass turns the discontinuities into ink line and
 * lays the vellum over the result. No lights, no shadow map.
 */

/** Every tunable number. Defaults are overridden by `theme.post`. */
const KNOBS: Record<string, number> = {
  lineWidth: 2.2,
  creaseWeight: 0.62,
  inkOpacity: 0.94,
  wobble: 1.2,
  wobbleScale: 64,
  depthThreshold: 0.008,
  normalThreshold: 0.16,
  distanceFade: 0.7,
  toneLit: 0.36,
  toneShade: -0.12,
  washLit: 0.22,
  washLitPigment: 0.74,
  washHalf: 0.85,
  shadeMix: 0.2,
  washThreshold: 0.2,
  bleed: 0.34,
  pool: 0.16,
  granulation: 0.07,
  hatchSpacing: 7.5,
  hatchWidth: 1.1,
  hatchStrength: 0.6,
  grain: 0.06,
  fibre: 0.05,
  blotch: 0.05,
  vignette: 0.9,
};

const knobUniforms: Record<string, { value: number }> = Object.fromEntries(
  Object.entries(KNOBS).map(([k, v]) => [`u${k[0].toUpperCase()}${k.slice(1)}`, { value: v }]),
);

/** Shared by reference between every ink material and the page pass. */
const shared = {
  ...knobUniforms,
  uPass: { value: 0 },
  uScale: { value: 1 },
  uPaper: { value: new Color() },
  uPaperAged: { value: new Color() },
  uInk: { value: new Color() },
  uInkSoft: { value: new Color() },
  uLightDir: { value: new Vector3(0, 1, 0) },
};

function applyTheme(theme: Theme) {
  const { palette, light, post } = theme;
  for (const k of Object.keys(KNOBS)) knobUniforms[`u${k[0].toUpperCase()}${k.slice(1)}`].value = post[k] ?? KNOBS[k];
  shared.uPaper.value.set(palette.paper);
  shared.uPaperAged.value.set(palette.sky[1]);
  shared.uInk.value.set(palette.ink);
  shared.uInkSoft.value.set(palette.inkSoft);
  const [x, y, z] = light.keyDirection;
  shared.uLightDir.value.set(-x, -y, -z).normalize();
}

// ───────────────────────── Surfaces ─────────────────────────

const materials = new Map<string, ShaderMaterial>();

function inkMaterial(color: string, kind: number, pigment: boolean, doubleSided: boolean): ShaderMaterial {
  const key = `${color}|${kind}|${pigment}|${doubleSided}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const m = new ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    side: doubleSided ? DoubleSide : FrontSide,
    uniforms: {
      ...developmentUniforms,
      ...shared,
      uBase: { value: new Color(color) },
      uKind: { value: kind },
      uPigment: { value: pigment ? 1 : 0 },
      // Distinct 8-bit ids so the page pass can ink the boundary between two materials.
      uId: { value: (((materials.size + 1) * 37) % 251 + 2) / 255 },
    },
  });
  m.userData.ink = true;
  materials.set(key, m);
  return m;
}

function Surface({ slot, accent, doubleSided }: SurfaceProps) {
  const theme = useTheme();
  const color = accent ? theme.palette.accents[accent] : theme.palette.surfaces[slot];
  const kind = slot === 'glow' ? 1 : slot === 'water' ? 2 : 0;
  const material = useMemo(() => inkMaterial(color, kind, Boolean(accent), Boolean(doubleSided)), [color, kind, accent, doubleSided]);
  return <primitive object={material} attach="material" />;
}

function Environment({ theme }: { theme: Theme }) {
  // No lights and no scene background: the washes are unlit shaders and the sky is the
  // bare page, cleared by the page renderer below.
  useLayoutEffect(() => applyTheme(theme), [theme]);
  return null;
}

// ───────────────────────── Page renderer ─────────────────────────

const washTarget = new WebGLRenderTarget(1, 1);
const normalTarget = new WebGLRenderTarget(1, 1, { depthTexture: new DepthTexture(1, 1) });

const pageUniforms = {
  ...shared,
  tColor: { value: washTarget.texture },
  tNormal: { value: normalTarget.texture },
  tDepth: { value: normalTarget.depthTexture },
  uResolution: { value: new Vector2(1, 1) },
  uTan: { value: new Vector2(1, 1) },
  uNear: { value: 0.1 },
  uFar: { value: 100 },
};
const pageMaterial = new ShaderMaterial({
  vertexShader: PAGE_VERT,
  fragmentShader: PAGE_FRAG,
  uniforms: pageUniforms,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
const pageQuad = new Mesh(new PlaneGeometry(2, 2), pageMaterial);
pageQuad.frustumCulled = false;
const pageScene = new Scene().add(pageQuad);
const pageCamera = new Camera();

const NORMAL_CLEAR = new Color().setRGB(0.5, 0.5, 1);
const bufferSize = new Vector2();
const previousClear = new Color();
const hidden: Object3D[] = [];

/** Things that are not ink surfaces (imago tokens) must not leave outlines. */
function hideNonInk(o: Object3D) {
  const mesh = o as Mesh;
  if (!mesh.isMesh || !o.visible) return;
  const material = mesh.material as Material | Material[];
  if (Array.isArray(material) || !material.userData.ink) {
    o.visible = false;
    hidden.push(o);
  }
}

function renderPage({ gl, scene, camera }: RootState) {
  gl.getDrawingBufferSize(bufferSize);
  const w = bufferSize.x;
  const h = bufferSize.y;
  if (washTarget.width !== w || washTarget.height !== h) {
    washTarget.setSize(w, h);
    normalTarget.setSize(w, h);
  }
  // Line and hatch weights are authored in pixels at 900 px tall and scale with the frame.
  shared.uScale.value = Math.max(h / 900, 0.75);
  pageUniforms.uResolution.value.set(w, h);
  const e = camera.projectionMatrix.elements;
  pageUniforms.uTan.value.set(1 / e[0], 1 / e[5]);
  if ('near' in camera) {
    pageUniforms.uNear.value = camera.near;
    pageUniforms.uFar.value = camera.far;
  }

  gl.getClearColor(previousClear);
  const previousAlpha = gl.getClearAlpha();

  shared.uPass.value = 0;
  gl.setRenderTarget(washTarget);
  gl.setClearColor(shared.uPaper.value, 0);
  gl.render(scene, camera);

  shared.uPass.value = 1;
  scene.traverse(hideNonInk);
  gl.setRenderTarget(normalTarget);
  gl.setClearColor(NORMAL_CLEAR, 0);
  gl.render(scene, camera);
  for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
  hidden.length = 0;
  shared.uPass.value = 0;

  gl.setRenderTarget(null);
  gl.setClearColor(previousClear, previousAlpha);
  gl.render(pageScene, pageCamera);
}

function Post({ theme }: { theme: Theme }) {
  useLayoutEffect(() => applyTheme(theme), [theme]);
  // A positive priority hands the frame to this callback instead of R3F's default render.
  useFrame(renderPage, 1);
  return null;
}

const ink: StyleModule = {
  id: 'ink',
  name: 'Ink & Vellum',
  Surface,
  Environment,
  Post,
};

export default ink;
