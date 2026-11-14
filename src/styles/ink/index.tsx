import { useFrame, type RootState } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import {
  Camera,
  Color,
  DoubleSide,
  FrontSide,
  HalfFloatType,
  LinearFilter,
  type Material,
  Matrix3,
  Mesh,
  type Object3D,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { AccentKey, SurfaceSlot, Theme } from '@/core/types';
import { useTheme } from '@/styles';
import { developmentUniforms } from '@/styles/development';
import type { StyleModule, SurfaceProps } from '@/styles/types';
import { PAGE_FRAG, PAGE_VERT, SURFACE_FRAG, SURFACE_VERT } from './shaders';

/**
 * Ink & Vellum: iron-gall line over calfskin, thin mineral washes.
 *
 * Frame: the scene is drawn twice into off-screen targets (wash colour, then a geometry
 * buffer of normal + material id + depth), and one full-screen "page" pass turns the
 * discontinuities into ink line and lays the vellum over the result. No lights, no
 * shadow map. `post.quality` trades line quality for cost (see QUALITY below).
 *
 * Cost per frame at quality 2 (not yet measured on a real GPU):
 *   wash pass      scene into RGBA8 at full size; per fragment two 3D and one 2D value
 *                  noise and one loop over the loci
 *   geometry pass  scene into RGBA16F at full size, 4x multisampled; trivial shader
 *   page pass      one full-screen triangle pair; 11 texture fetches (9 of the geometry
 *                  buffer), two 3D and seven 2D value noises
 */

/** Every tunable number. Defaults are overridden by `theme.post`. */
const KNOBS: Record<string, number> = {
  lineWidth: 1.9,
  farWidth: 0.6,
  creaseWeight: 0.62,
  inkOpacity: 0.94,
  wobble: 0.9,
  wobbleScale: 90,
  depthThreshold: 0.008,
  normalThreshold: 0.16,
  distanceFade: 0.7,
  toneLit: 0.36,
  toneShade: -0.12,
  washLit: 0.6,
  washLitPigment: 0.74,
  washHalf: 0.9,
  shadeMix: 0.22,
  washThreshold: 0.2,
  washFull: 0.8,
  washFirst: 0.5,
  bleed: 0.34,
  pool: 0.22,
  poolWidth: 3,
  reserve: 0.5,
  granulation: 0.07,
  hatchSpacing: 7.5,
  hatchWidth: 1.1,
  hatchStrength: 0.6,
  grain: 0.09,
  fibre: 0.08,
  blotch: 0.06,
  vignette: 0.9,
  foxing: 0.5,
  laid: 0,
  quality: 2,
};

/**
 * `post.quality`: what the geometry buffer and the line search cost.
 *   2  full resolution, 4x multisampled (smooth shallow diagonals, steady thin detail), 8 taps
 *   1  full resolution, no multisampling, 8 taps
 *   0  half resolution, no multisampling, 6 taps (softer line; for weak GPUs)
 */
const QUALITY = [
  { scale: 0.5, samples: 0, taps: 6 },
  { scale: 1, samples: 0, taps: 8 },
  { scale: 1, samples: 4, taps: 8 },
];

const uniformName = (knob: string) => `u${knob[0].toUpperCase()}${knob.slice(1)}`;

const knobUniforms: Record<string, { value: number }> = Object.fromEntries(
  Object.entries(KNOBS).map(([k, v]) => [uniformName(k), { value: v }]),
);

/** Shared by reference between every ink material and the page pass. */
const shared = {
  ...knobUniforms,
  uPass: { value: 0 },
  uScale: { value: 1 },
  uFar: { value: 100 },
  uPaper: { value: new Color() },
  uPaperAged: { value: new Color() },
  uInk: { value: new Color() },
  uInkSoft: { value: new Color() },
  uLightDir: { value: new Vector3(0, 1, 0) },
};

// ───────────────────────── Surfaces ─────────────────────────

/**
 * One material per (slot, accent, sidedness), for the life of the page. A theme change
 * only rewrites colours and numbers in uniforms, so a stream of themes from the Theme Lab
 * creates nothing and leaks nothing.
 */
interface InkMaterial {
  material: ShaderMaterial;
  slot: SurfaceSlot;
  accent: AccentKey | undefined;
}
const materials = new Map<string, InkMaterial>();
let current: Theme | null = null;

function baseColor(theme: Theme, slot: SurfaceSlot, accent: AccentKey | undefined): string {
  return accent ? theme.palette.accents[accent] : theme.palette.surfaces[slot];
}

function inkMaterial(theme: Theme, slot: SurfaceSlot, accent: AccentKey | undefined, doubleSided: boolean): ShaderMaterial {
  const key = `${slot}|${accent ?? ''}|${doubleSided}`;
  const cached = materials.get(key);
  if (cached) return cached.material;
  const material = new ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    side: doubleSided ? DoubleSide : FrontSide,
    uniforms: {
      ...developmentUniforms,
      ...shared,
      uBase: { value: new Color(baseColor(theme, slot, accent)) },
      uKind: { value: slot === 'glow' ? 1 : slot === 'water' ? 2 : 0 },
      uPigment: { value: accent ? 1 : 0 },
      // Distinct ids (multiples of 1/64) so the page pass can ink the boundary between
      // two materials. The id travels in the length of the stored normal.
      uId: { value: ((((materials.size + 1) * 37) % 61) + 2) / 64 },
    },
  });
  material.userData.ink = true;
  materials.set(key, { material, slot, accent });
  return material;
}

function applyTheme(theme: Theme) {
  if (current === theme) return;
  current = theme;
  const { palette, light, post } = theme;
  for (const k of Object.keys(KNOBS)) knobUniforms[uniformName(k)].value = post[k] ?? KNOBS[k];
  shared.uPaper.value.set(palette.paper);
  shared.uPaperAged.value.set(palette.sky[1]);
  shared.uInk.value.set(palette.ink);
  shared.uInkSoft.value.set(palette.inkSoft);
  const [x, y, z] = light.keyDirection;
  shared.uLightDir.value.set(-x, -y, -z).normalize();
  materials.forEach((m) => m.material.uniforms.uBase.value.set(baseColor(theme, m.slot, m.accent)));
  setQuality(post.quality ?? KNOBS.quality);
}

function Surface({ slot, accent, doubleSided }: SurfaceProps) {
  const theme = useTheme();
  // The theme is only read for the colour a brand-new material starts with; later
  // themes reach existing materials through applyTheme.
  const material = useMemo(() => inkMaterial(theme, slot, accent, Boolean(doubleSided)), [theme, slot, accent, doubleSided]);
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

/** Half-float so that depth and the id survive, and so that it can be filtered and multisampled. */
function geomBuffer(samples: number): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, samples });
}
let quality = QUALITY[KNOBS.quality];
let geomTarget = geomBuffer(quality.samples);

const pageUniforms = {
  ...shared,
  tColor: { value: washTarget.texture },
  tGeom: { value: geomTarget.texture },
  uResolution: { value: new Vector2(1, 1) },
  uTan: { value: new Vector2(1, 1) },
  uCamRot: { value: new Matrix3() },
  uTaps: { value: quality.taps },
};

function setQuality(level: number) {
  const next = QUALITY[Math.min(2, Math.max(0, Math.round(level)))];
  if (next === quality) return;
  if (next.samples !== quality.samples) {
    // The sample count is fixed when a target is created: replace it and free the old one.
    geomTarget.dispose();
    geomTarget = geomBuffer(next.samples);
    pageUniforms.tGeom.value = geomTarget.texture;
  }
  quality = next;
  pageUniforms.uTaps.value = next.taps;
}

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

/** Facing the camera, id 0, at the far plane (alpha 1). */
const GEOM_CLEAR = new Color().setRGB(0, 0, 0.5);
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
  if (washTarget.width !== w || washTarget.height !== h) washTarget.setSize(w, h);
  const gw = Math.max(1, Math.round(w * quality.scale));
  const gh = Math.max(1, Math.round(h * quality.scale));
  if (geomTarget.width !== gw || geomTarget.height !== gh) geomTarget.setSize(gw, gh);
  // Line and hatch weights are authored in pixels at 900 px tall and scale with the frame.
  shared.uScale.value = Math.max(h / 900, 0.75);
  pageUniforms.uResolution.value.set(w, h);
  const e = camera.projectionMatrix.elements;
  pageUniforms.uTan.value.set(1 / e[0], 1 / e[5]);
  pageUniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld);
  if ('far' in camera) shared.uFar.value = camera.far;

  gl.getClearColor(previousClear);
  const previousAlpha = gl.getClearAlpha();

  shared.uPass.value = 0;
  gl.setRenderTarget(washTarget);
  gl.setClearColor(shared.uPaper.value, 0);
  gl.render(scene, camera);

  shared.uPass.value = 1;
  scene.traverse(hideNonInk);
  gl.setRenderTarget(geomTarget);
  gl.setClearColor(GEOM_CLEAR, 1);
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
