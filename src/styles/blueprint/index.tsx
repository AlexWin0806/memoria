import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  DepthTexture,
  DoubleSide,
  FrontSide,
  LinearFilter,
  Mesh,
  NearestFilter,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { AccentKey, SurfaceSlot, Theme } from '@/core/types';
import { useTheme } from '@/styles';
import { developmentUniforms } from '@/styles/development';
import type { StyleModule, SurfaceProps } from '@/styles/types';
import { POST_FRAG, POST_VERT, SURFACE_FRAG, SURFACE_VERT } from './glsl';

/**
 * Cyanotype Blueprint.
 *
 * Token mapping (the Theme type has a single palette, so the two states share it):
 *   palette.paper / palette.sky[0]   Prussian blue and the lighter paper blue (undeveloped fills)
 *   palette.ink / palette.inkSoft    white line, soft line (hatch, grid)
 *   palette.surfaces / .accents      developed colours: cream paper and mineral pigments
 *   ui.fg                            the dark ink the white line turns into once developed
 *   light.fillColor                  tint of the developed shade tone
 *   post.*                           every numeric knob, see DEFAULTS
 */
const DEFAULTS = {
  supersample: 2,
  lineWidth: 1.5,
  lineOpacity: 0.95,
  lineOpacityDeveloped: 0.85,
  creaseLo: 0.45,
  creaseHi: 0.75,
  planeContrast: 1.15,
  accentLift: 0.1,
  hatchSpacing: 7,
  hatchWidth: 1,
  hatchOpacity: 0.3,
  hatchOpacityDeveloped: 0.22,
  gridWidth: 1,
  gridOpacity: 0.32,
  gridOpacityDeveloped: 0.14,
  shadeDepth: 0.55,
  devThreshold: 0.2,
  devGamma: 1.5,
  devSoftness: 0.08,
  devNoise: 0.24,
  devNoiseScale: 1.1,
  devEdge: 0.14,
  grain: 0.05,
  vignette: 0.22,
};
type Knob = keyof typeof DEFAULTS;
const knob = (theme: Theme, k: Knob) => theme.post[k] ?? DEFAULTS[k];

/** Scene-target texels per CSS pixel. Written by the line pass, read by every surface (hatch, grid). */
const sharedPx = { value: 1 };

function devMaskUniforms(theme: Theme) {
  return {
    ...developmentUniforms,
    uDevSoft: { value: knob(theme, 'devSoftness') },
    uDevNoise: { value: knob(theme, 'devNoise') },
    uDevNoiseScale: { value: knob(theme, 'devNoiseScale') },
    uDevThreshold: { value: knob(theme, 'devThreshold') },
    uDevGamma: { value: knob(theme, 'devGamma') },
  };
}

const materialCache = new WeakMap<Theme, Map<string, ShaderMaterial>>();

function surfaceMaterial(theme: Theme, slot: SurfaceSlot, accent: AccentKey | undefined, doubleSided: boolean) {
  let perTheme = materialCache.get(theme);
  if (!perTheme) materialCache.set(theme, (perTheme = new Map()));
  const key = `${slot}|${accent ?? ''}|${doubleSided ? 2 : 1}`;
  const cached = perTheme.get(key);
  if (cached) return cached;
  const { palette, light } = theme;
  const flat = slot === 'glow' || slot === 'water';
  const material = new ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    side: doubleSided ? DoubleSide : FrontSide,
    uniforms: {
      ...devMaskUniforms(theme),
      uPaper: { value: new Color(palette.paper) },
      uPaperLight: { value: new Color(palette.sky[0]) },
      uLineSoft: { value: new Color(palette.inkSoft) },
      uInkDark: { value: new Color(theme.ui.fg) },
      uBase: { value: new Color(accent ? palette.accents[accent] : palette.surfaces[slot]) },
      uShadeTint: { value: new Color(light.fillColor) },
      uKeyDir: { value: new Vector3(...light.keyDirection).normalize() },
      uIsFloor: { value: slot === 'floor' ? 1 : 0 },
      uIsFlat: { value: flat ? 1 : 0 },
      uIsGlow: { value: slot === 'glow' ? 1 : 0 },
      uAccentLift: { value: accent ? knob(theme, 'accentLift') : 0 },
      uPx: sharedPx,
      uPlaneContrast: { value: knob(theme, 'planeContrast') },
      uHatchSpacing: { value: knob(theme, 'hatchSpacing') },
      uHatchWidth: { value: knob(theme, 'hatchWidth') },
      uHatchOpacity: { value: knob(theme, 'hatchOpacity') },
      uHatchOpacityDev: { value: knob(theme, 'hatchOpacityDeveloped') },
      uGridWidth: { value: knob(theme, 'gridWidth') },
      uGridOpacity: { value: knob(theme, 'gridOpacity') },
      uGridOpacityDev: { value: knob(theme, 'gridOpacityDeveloped') },
      uShadeDepth: { value: knob(theme, 'shadeDepth') },
      uDevEdge: { value: knob(theme, 'devEdge') },
    },
  });
  perTheme.set(key, material);
  return material;
}

function Surface({ slot, accent, doubleSided }: SurfaceProps) {
  const theme = useTheme();
  const material = useMemo(() => surfaceMaterial(theme, slot, accent, Boolean(doubleSided)), [theme, slot, accent, doubleSided]);
  return <primitive object={material} attach="material" />;
}

/** Everything is unlit and the paper is painted by the line pass, so there is nothing to add to the scene. */
function Environment() {
  return null;
}

/**
 * Scene → one supersampled colour+depth target → one full-screen pass (lines, sky, paper).
 * Owns its GPU objects so the React component stays free of mutable state.
 */
class LinePass {
  private readonly target: WebGLRenderTarget;
  private readonly material: ShaderMaterial;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new Camera();
  private readonly size = new Vector2();
  private supersample = 2;
  private lineWidth = 1.5;

  constructor(theme: Theme) {
    this.target = new WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false });
    // 8-bit sRGB storage: the GPU encodes on write and decodes on read, so maths stays linear.
    this.target.texture.colorSpace = SRGBColorSpace;
    this.target.texture.minFilter = LinearFilter;
    this.target.texture.magFilter = LinearFilter;
    this.target.texture.generateMipmaps = false;
    const depth = new DepthTexture(2, 2);
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    this.target.depthTexture = depth;

    this.material = new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...devMaskUniforms(theme),
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        uSS: { value: 2 },
        uTapA: { value: 1 },
        uTapB: { value: 2 },
        uRes: { value: new Vector2(2, 2) },
        uSlopeScale: { value: 1 },
        uProjInv: { value: null },
        uCamWorld: { value: null },
        uLine: { value: new Color(theme.palette.ink) },
        uInkDark: { value: new Color(theme.ui.fg) },
        uSkyLo: { value: new Color(theme.palette.sky[0]) },
        uSkyHi: { value: new Color(theme.palette.sky[1]) },
        uLineOpacity: { value: knob(theme, 'lineOpacity') },
        uLineOpacityDev: { value: knob(theme, 'lineOpacityDeveloped') },
        uCreaseLo: { value: knob(theme, 'creaseLo') },
        uCreaseHi: { value: knob(theme, 'creaseHi') },
        uGrain: { value: knob(theme, 'grain') },
        uVignette: { value: knob(theme, 'vignette') },
      },
    });
    this.supersample = knob(theme, 'supersample');
    this.lineWidth = knob(theme, 'lineWidth');

    const tri = new BufferGeometry();
    tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const quad = new Mesh(tri, this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  render(gl: WebGLRenderer, scene: Scene, camera: Camera) {
    const u = this.material.uniforms;
    gl.getDrawingBufferSize(this.size);
    const dpr = gl.getPixelRatio();
    // On a high-DPI screen the device pixels already do the supersampling.
    const ss = dpr >= 1.5 ? 1 : Math.max(1, Math.round(this.supersample));
    const w = Math.max(2, this.size.x * ss);
    const h = Math.max(2, this.size.y * ss);
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    const px = dpr * ss;
    const widthTexels = Math.max(2, Math.round(this.lineWidth * px));
    sharedPx.value = px;
    u.uSS.value = ss;
    u.uTapA.value = Math.floor(widthTexels / 2);
    u.uTapB.value = Math.ceil(widthTexels / 2);
    u.uRes.value.set(w, h);
    u.uSlopeScale.value = (h * camera.projectionMatrix.elements[5]) / 2;
    u.uProjInv.value = camera.projectionMatrixInverse;
    u.uCamWorld.value = camera.matrixWorld;

    // Alpha 0 everywhere except under transparent overlays: see SURFACE_FRAG.
    const clearAlpha = gl.getClearAlpha();
    gl.setClearAlpha(0);
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearAlpha(clearAlpha);
    gl.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
  }
}

function Post({ theme }: { theme: Theme }) {
  const pass = useMemo(() => new LinePass(theme), [theme]);
  useEffect(() => () => pass.dispose(), [pass]);
  // Priority 1 takes over rendering from react-three-fiber.
  useFrame(({ gl, scene, camera }) => pass.render(gl, scene, camera), 1);
  return null;
}

const blueprint: StyleModule = {
  id: 'blueprint',
  name: 'Cyanotype Blueprint',
  Surface,
  Environment,
  Post,
};

export default blueprint;
