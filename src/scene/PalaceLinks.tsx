import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, type Mesh, NoColorSpace, ShaderMaterial } from 'three';
import type { Deck, LinkKind, Theme } from '@/core/types';
import type { PalaceLayout } from '@/layouts/types';
import type { SceneView } from '@/state/sceneView';
import { useTheme } from '@/styles';
import { MAX_LINKS, type RoutedLinks, lineLength, pointAlong, routeLinks, shortened } from './linkRoute';
import type { Veil } from './veil';

/**
 * The links between the facts of a deck, drawn on the floor from place to place along the
 * walking route (`./linkRoute`). A link shows where a step leads, never what is there. Four
 * kinds, told apart by line alone:
 *
 *   becomes   a channel (two rails) full of chevrons that point from `from` to `to`, ending
 *             in an arrowhead: the flow. A chain of them is one stream through the palace.
 *   needs     a line of dashes ending in a small open ring at the thing depended on
 *   blocks    one solid line in the theme's red that ends in a flat bar across its end
 *   mirrors   two fine parallel lines (an equals sign drawn out) with the same lozenge at both ends
 *
 * A label is written on the link at its middle, lying on the floor, in the hand of the
 * place names. Everything is one mesh for the lines and one for the labels, built when the
 * deck or the palace changes; while the palace is at rest nothing here runs.
 */

const KIND: Record<LinkKind, number> = { becomes: 0, needs: 1, blocks: 2, mirrors: 3 };
/** Half the width of the band of each kind, in metres. */
const HALF: Record<LinkKind, number> = { becomes: 0.085, needs: 0.03, blocks: 0.034, mirrors: 0.055 };
/** Just proud of the floor and of the lines inlaid in it (12 mm); the labels lie on the links. */
const LINE_Y = 0.018;
const LABEL_Y = 0.022;
/** A link is drawn in from `from` to `to` in this long, and taken up again in this long. */
const DRAW_SECONDS = 0.8;
const WIPE_SECONDS = 0.3;

const ARROW = 0.3;
const RING = 0.115;
const BAR = 0.21;
const LOZENGE = 0.105;

/** Labels: pixels of the atlas per row, and metres on the floor per pixel along the writing. */
const ROW = 64;
const FONT_PX = 42;
const PX = 0.15 / FONT_PX;
/**
 * A label is seen from eye height at a shallow angle, which squashes it: it is written
 * taller than it is wide by this much, as words painted on a road are.
 */
const TALL = 1.7;
const ATLAS_WIDTH = 1024;
/** Two labels are not written within this distance of each other. */
const LABEL_APART = 1.1;

const LINE_VERT = /* glsl */ `
  attribute vec4 aData;
  attribute vec3 aStyle;
  uniform float uReveal[${MAX_LINKS}];
  varying vec4 vData;
  varying vec3 vStyle;
  varying float vShown;
  void main() {
    vData = aData;
    vStyle = aStyle;
    // How far along this link the pen has got, in metres; a little past its end when it is all drawn.
    vShown = uReveal[int(aData.w + 0.5)] * (aData.z + 0.14);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// vData: metres along the link, metres across it, the link's length. vStyle: kind, 1 for a
// solid mark, half the band's width. All measures are in the world, so nothing crawls with the camera.
const LINE_FRAG = /* glsl */ `
  uniform vec3 uPen;
  uniform vec3 uStop;
  varying vec4 vData;
  varying vec3 vStyle;
  varying float vShown;
  void main() {
    float s = vData.x;
    float shown = 1.0 - smoothstep(vShown - 0.08, vShown, s);
    if (shown < 0.004) discard;
    float kind = vStyle.x;
    float hw = vStyle.z;
    float edge = abs(vData.y) / hw;
    float fs = max(fwidth(s), 1e-4);
    float fe = max(fwidth(edge), 1e-4);
    vec3 colour = kind > 1.5 && kind < 2.5 ? uStop : uPen;
    float alpha = 0.92;
    if (vStyle.y < 0.5) {
      if (kind < 0.5) {
        // The flow: two rails, and chevrons between them whose points lead towards the end.
        float rail = smoothstep(0.72 - fe, 0.72 + fe, edge);
        float period = 0.44;
        float c = fract((s + edge * hw * 1.25) / period) * period;
        float stroke = 0.075;
        float chevron = smoothstep(0.0, fs, c) * (1.0 - smoothstep(stroke - fs, stroke + fs, c));
        // Far off, where a chevron is finer than a pixel, the channel settles to an even tone.
        chevron = mix(chevron, stroke / period, smoothstep(0.5, 1.5, fs / stroke));
        alpha = max(rail * 0.9, max(chevron * 0.86, 0.16));
      } else if (kind < 1.5) {
        float period = 0.27;
        float c = fract(s / period);
        float f = fs / period;
        alpha = 0.9 * mix(smoothstep(0.0, f, c) * (1.0 - smoothstep(0.56 - f, 0.56 + f, c)), 0.56, smoothstep(0.4, 1.2, f));
      } else if (kind > 2.5) {
        alpha = 0.9 * smoothstep(0.5 - fe, 0.5 + fe, edge);
      }
      alpha *= 1.0 - smoothstep(1.0 - fe, 1.0, edge);
    }
    alpha *= shown;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(colour, alpha);
    #include <colorspace_fragment>
  }
`;

const LABEL_VERT = /* glsl */ `
  attribute float aLink;
  uniform float uReveal[${MAX_LINKS}];
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    // Written as the pen passes the middle of the link.
    vFade = smoothstep(0.45, 0.62, uReveal[int(aLink + 0.5)]);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The atlas holds the writing in red and the slip it is written on in green.
const LABEL_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uPen;
  uniform vec3 uSlip;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec4 t = texture2D(map, vUv);
    float alpha = max(t.r, t.g * 0.9) * vFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uSlip, uPen, t.r), alpha);
    #include <colorspace_fragment>
  }
`;

const _tone = new Color();
function tone(hex: string): number {
  _tone.set(hex);
  return 0.2126 * _tone.r + 0.7152 * _tone.g + 0.0722 * _tone.b;
}

/**
 * The pen and the slip a label is written on: the theme's ink on its paper, or the other way
 * round where the paper stands out more against the scene's ground tone (a night theme),
 * as for the outline of a place in ruins.
 */
function pens(theme: Theme): [pen: string, slip: string] {
  const { ink, paper, fog } = theme.palette;
  const ground = tone(fog);
  return Math.abs(tone(ink) - ground) >= Math.abs(tone(paper) - ground) ? [ink, paper] : [paper, ink];
}

interface Site {
  link: number;
  /** Locus index of the place the link leads to. */
  to: number;
  text: string;
  x: number;
  z: number;
  /** Direction of the link there. */
  dx: number;
  dz: number;
}

/** One geometry for every link: bands along the centre lines, and the marks at their ends. */
function lineGeometry(routed: RoutedLinks): BufferGeometry {
  const position: number[] = [];
  const data: number[] = [];
  const style: number[] = [];
  const index: number[] = [];
  const k = routed.scale;
  const at = [0, 0, 0, 0];

  routed.links.forEach((link, n) => {
    const kind = KIND[link.kind];
    const half = HALF[link.kind] * k;
    const length = lineLength(link.line);
    const vertex = (x: number, z: number, along: number, across: number, solid: number) => {
      position.push(x, LINE_Y, z);
      data.push(along, across, length, n);
      style.push(kind, solid, half);
      return position.length / 3 - 1;
    };
    /** A solid convex shape, as a fan round its first corner. */
    const shape = (corners: number[], along: number) => {
      const first = position.length / 3;
      for (let i = 0; i < corners.length; i += 2) vertex(corners[i], corners[i + 1], along, 0, 1);
      for (let i = 1; i < corners.length / 2 - 1; i++) index.push(first, first + i, first + i + 1);
    };

    // The band stops short of the marks that are drawn over its ends.
    const cutStart = link.kind === 'mirrors' ? LOZENGE * k : 0;
    const cutEnd = (link.kind === 'becomes' ? ARROW * 0.7 : link.kind === 'needs' ? RING * 2 : link.kind === 'mirrors' ? LOZENGE : 0) * k;
    const line = shortened(link.line, cutStart, cutEnd);
    let along = cutStart;
    let before = -1;
    for (let i = 0; i < line.length; i += 2) {
      const a = Math.max(0, i - 2);
      const b = Math.min(line.length - 2, i + 2);
      let tx = line[b] - line[a];
      let tz = line[b + 1] - line[a + 1];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      if (i > 0) along += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
      const left = vertex(line[i] + tz * half, line[i + 1] - tx * half, along, half, 0);
      vertex(line[i] - tz * half, line[i + 1] + tx * half, along, -half, 0);
      if (before >= 0) index.push(before, before + 1, left, before + 1, left + 1, left);
      before = left;
    }

    // The marks: at the very end of the link, across the direction it arrives in.
    const mark = (atStart: boolean) => {
      pointAlong(link.line, atStart ? 0 : length, at);
      const [x, z] = at;
      const ex = atStart ? -at[2] : at[2];
      const ez = atStart ? -at[3] : at[3];
      const s = atStart ? 0 : length;
      if (link.kind === 'becomes') {
        const a = ARROW * k;
        const w = 0.19 * k;
        shape([x, z, x - ex * a + ez * w, z - ez * a - ex * w, x - ex * a * 0.72, z - ez * a * 0.72, x - ex * a - ez * w, z - ez * a + ex * w], s);
      } else if (link.kind === 'blocks') {
        const w = BAR * k;
        const t = 0.042 * k;
        shape([x + ez * w - ex * t, z - ex * w - ez * t, x + ez * w + ex * t, z - ex * w + ez * t, x - ez * w + ex * t, z + ex * w + ez * t, x - ez * w - ex * t, z + ex * w - ez * t], s);
      } else if (link.kind === 'mirrors') {
        const a = LOZENGE * k;
        const w = 0.085 * k;
        shape([x, z, x - ex * a + ez * w, z - ez * a - ex * w, x - ex * a * 2, z - ez * a * 2, x - ex * a - ez * w, z - ez * a + ex * w], s);
      } else {
        // An open ring: the dashes stop at its rim.
        const outer = RING * k;
        const inner = outer - 0.034 * k;
        const cx = x - ex * outer;
        const cz = z - ez * outer;
        const first = position.length / 3;
        const steps = 20;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          vertex(cx + Math.cos(a) * outer, cz + Math.sin(a) * outer, s, 0, 1);
          vertex(cx + Math.cos(a) * inner, cz + Math.sin(a) * inner, s, 0, 1);
          const p = first + i * 2;
          const q = first + ((i + 1) % steps) * 2;
          index.push(p, p + 1, q, p + 1, q + 1, q);
        }
      }
    };
    mark(false);
    if (link.kind === 'mirrors') mark(true);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('aData', new Float32BufferAttribute(data, 4));
  geometry.setAttribute('aStyle', new Float32BufferAttribute(style, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Where each label is written: on its link, at the middle, or a little to one side of it if another label is there. */
function labelSites(routed: RoutedLinks): Site[] {
  const sites: Site[] = [];
  const at = [0, 0, 0, 0];
  routed.links.forEach((link, n) => {
    if (!link.label) return;
    const length = lineLength(link.line);
    let best = -1;
    let bestRoom = -1;
    for (const f of [0.5, 0.4, 0.6, 0.31, 0.69]) {
      pointAlong(link.line, f * length, at);
      let room = Infinity;
      for (const s of sites) room = Math.min(room, Math.hypot(s.x - at[0], s.z - at[1]));
      if (room > bestRoom) {
        bestRoom = room;
        best = f;
      }
      if (room >= LABEL_APART) break;
    }
    pointAlong(link.line, best * length, at);
    sites.push({ link: n, to: link.to, text: link.label, x: at[0], z: at[1], dx: at[2], dz: at[3] });
  });
  return sites;
}

interface Labels {
  geometry: BufferGeometry;
  texture: CanvasTexture;
}

/**
 * The labels: every one written into one atlas with the theme's display face, and one quad
 * each on the floor. A label runs along its link and stands the right way up for the learner
 * who has just walked the link: who stands where the place it leads to is looked at from.
 */
function makeLabels(sites: Site[], layout: PalaceLayout, theme: Theme): Labels | null {
  if (!sites.length) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `italic 400 ${FONT_PX}px ${theme.type.display}, serif`;
  ctx.font = font;
  const pad = 16;
  const gap = 8;
  const boxes: { x: number; y: number; w: number }[] = [];
  let x = gap;
  let y = gap;
  for (const site of sites) {
    const w = Math.min(ATLAS_WIDTH - 2 * gap, Math.ceil(ctx.measureText(site.text).width) + pad * 2);
    if (x + w + gap > ATLAS_WIDTH) {
      x = gap;
      y += ROW + gap;
    }
    boxes.push({ x, y, w });
    x += w + gap;
  }
  canvas.width = ATLAS_WIDTH;
  canvas.height = y + ROW + gap;
  // Opaque black, then the slips in green and the writing added in red: two masks in one texture.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  sites.forEach((site, i) => {
    const b = boxes[i];
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y + 5, b.w, ROW - 10, 10);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#f00';
    ctx.fillText(site.text, b.x + b.w / 2, b.y + ROW / 2 + 2, b.w - pad);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  // Seen at a shallow angle: without this the far half of each word blurs away.
  texture.anisotropy = 8;

  const position: number[] = [];
  const uv: number[] = [];
  const link: number[] = [];
  const index: number[] = [];
  sites.forEach((site, i) => {
    const b = boxes[i];
    // The top of the writing points away from that viewpoint.
    const view = layout.loci[site.to]?.view.position ?? layout.overview.position;
    const vx = view[0];
    const vz = view[2];
    let ux = site.dz;
    let uz = -site.dx;
    if (ux * (site.x - vx) + uz * (site.z - vz) < 0) {
      ux = -ux;
      uz = -uz;
    }
    // Reading direction: to the right of someone looking along `u`.
    const bx = -uz;
    const bz = ux;
    const w = (b.w * PX) / 2;
    const h = (ROW * PX * TALL) / 2;
    const first = position.length / 3;
    for (const [sb, su] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      position.push(site.x + bx * w * sb + ux * h * su, LABEL_Y, site.z + bz * w * sb + uz * h * su);
      uv.push((b.x + (sb > 0 ? b.w : 0)) / canvas.width, 1 - (b.y + (su > 0 ? 0 : ROW)) / canvas.height);
      link.push(site.link);
    }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aLink', new Float32BufferAttribute(link, 1));
  geometry.setIndex(index);
  return { geometry, texture };
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

interface Props {
  layout: PalaceLayout;
  /** The deck whose links are drawn. */
  deck: Deck | undefined;
  /** The memory images of the scene: a link shows once the images at both its ends do. */
  tokens: SceneView['tokens'];
  /** QA (`&links=`): every link, whatever is shown, held this far through being drawn in. null = as the images say. */
  held: number | null;
  /** Nothing is drawn in or taken up: links are simply there or not (reduced motion, frozen shots). */
  still: boolean;
  veil: Veil;
}

export function PalaceLinks({ layout, deck, tokens, held, still, veil }: Props) {
  const theme = useTheme();
  const lines = useRef<Mesh>(null);
  const writing = useRef<Mesh>(null);
  // Rebuilt when the links or the places of the items change, not on every edit of the deck.
  const links = deck?.links;
  const placed = deck?.items.map((it) => `${it.id}@${it.locusId}`).join('|') ?? '';
  const routed = useMemo(() => {
    void placed;
    return routeLinks(layout, deck && links ? { ...deck, links } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `placed` stands for the part of `deck` that matters here
  }, [layout, links, placed]);
  const count = routed.links.length;

  const rig = useMemo(
    () => ({
      /** By link: how far it is drawn (the uniform), the plain 0..1 behind that, and where it should be. */
      reveal: new Float32Array(MAX_LINKS),
      progress: new Float32Array(MAX_LINKS),
      target: new Float32Array(MAX_LINKS),
      active: false,
      first: true,
      cuts: 0,
    }),
    [],
  );
  const materials = useMemo(() => {
    const common = { transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const uReveal = { value: rig.reveal };
    const uPen = { value: new Color() };
    return {
      line: new ShaderMaterial({ ...common, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uReveal, uPen, uStop: { value: new Color() } } }),
      label: new ShaderMaterial({ ...common, vertexShader: LABEL_VERT, fragmentShader: LABEL_FRAG, uniforms: { uReveal, uPen, uSlip: { value: new Color() }, map: { value: null } } }),
    };
  }, [rig]);
  useEffect(
    () => () => {
      materials.line.dispose();
      materials.label.dispose();
    },
    [materials],
  );
  useLayoutEffect(() => {
    const [pen, slip] = pens(theme);
    materials.line.uniforms.uPen.value.set(pen);
    materials.line.uniforms.uStop.value.set(theme.palette.accents.red);
    materials.label.uniforms.uSlip.value.set(slip);
  }, [materials, theme]);

  const geometry = useMemo(() => (count ? lineGeometry(routed) : null), [routed, count]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  // The display face may still be loading when the labels are first written: write them again when it has.
  const [faces, setFaces] = useState(0);
  const display = theme.type.display;
  useEffect(() => {
    let alive = true;
    void document.fonts.load(`italic 400 ${FONT_PX}px ${display}`).then(() => alive && setFaces((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [display]);
  const sites = useMemo(() => labelSites(routed), [routed]);
  const labels = useMemo(() => {
    void faces;
    return makeLabels(sites, layout, theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the theme's display face matters, and `faces` says when it has loaded
  }, [sites, layout, display, faces]);
  useLayoutEffect(() => {
    materials.label.uniforms.map.value = labels?.texture ?? null;
    // The mesh of the labels may be new: have the next frame show or hide it with the lines.
    rig.active = true;
  }, [materials, labels, rig]);
  useEffect(
    () => () => {
      labels?.geometry.dispose();
      labels?.texture.dispose();
    },
    [labels],
  );

  // A new set of links starts from nothing and is, the first time, simply there.
  useLayoutEffect(() => {
    rig.progress.fill(0);
    rig.reveal.fill(0);
    rig.first = true;
  }, [rig, routed]);
  useLayoutEffect(() => {
    const seen = new Set<number>();
    for (const t of tokens) if (t.visible) seen.add(t.locusIndex);
    routed.links.forEach((link, i) => (rig.target[i] = held ?? (seen.has(link.from) && seen.has(link.to) ? 1 : 0)));
    rig.active = true;
  }, [rig, routed, tokens, held]);

  useFrame((_, delta) => {
    const cut = veil.cuts !== rig.cuts;
    rig.cuts = veil.cuts;
    if (!rig.active && !cut) return;
    const snap = still || cut || rig.first;
    // What changes with a camera cut waits for the cut, and is then changed unseen.
    if (veil.cutting && !snap) return;
    rig.first = false;
    const dt = Math.min(delta, 0.1);
    let moving = false;
    let any = false;
    for (let i = 0; i < count; i++) {
      const want = rig.target[i];
      let p = rig.progress[i];
      if (p !== want) {
        p = snap ? want : p < want ? Math.min(want, p + dt / DRAW_SECONDS) : Math.max(want, p - dt / WIPE_SECONDS);
        rig.progress[i] = p;
        // A held link (QA) is shown exactly that far along.
        rig.reveal[i] = held === null ? ease(p) : p;
        if (p !== want) moving = true;
      }
      if (p > 0) any = true;
    }
    rig.active = moving;
    if (lines.current) lines.current.visible = any;
    if (writing.current) writing.current.visible = any;
  });

  if (!geometry) return null;
  return (
    <>
      {/* Not ink surfaces: drawn in the colour pass only, so the pen strokes get no outline of their own. */}
      <mesh ref={lines} geometry={geometry} material={materials.line} visible={false} renderOrder={4} />
      {labels && <mesh ref={writing} geometry={labels.geometry} material={materials.label} visible={false} renderOrder={5} />}
    </>
  );
}
