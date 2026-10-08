/* scene.js — the tank in three.js.
 *
 * The bake (paint.js, fishpaint.js, info.js) produces canvases; this file
 * stacks them as textured planes under an orthographic camera and does the
 * per-frame work in shaders: plant sway, caustics, god rays, particulates,
 * the rippling reflection band, rain on the surface, and the fish.
 *
 * Fixed camera, side view, 1:1 pane pixels. Draw order is explicit
 * (renderOrder) with depth testing off — this is 2.5D compositing, and the
 * order IS the depth.
 *
 *   0 backdrop · 10 far plants · 15 far fish · 20 wood · 30 mid plants
 *   40 substrate · 45 near fish · 50 front plants · 55 stone · 60 particles
 *   65 rays · 70 surface band · 72 hood · 80 glass · 90 thermometer · 100 fade
 */

import * as THREE from '/vendor/three-0.170.0.module.min.js';
import { W, H, GEO } from './layout.js';
import {
  paintBackdrop, paintBackPlants, paintWood, buildWood, paintMidPlants, paintSubstrate,
  paintFront, paintHood, paintGlass, paintReflection,
} from './paint.js';
import { paintSpecies, ASPECT } from './fishpaint.js';
import { paintStone, paintStoneText, paintThermo, STONE, THERMO } from './info.js';
import { createPopulation, step } from './fish.js';
import { makeRng } from './rng.js';

/* ── shared GLSL ───────────────────────────────────────────────────────── */

const VERT = /* glsl */`
  varying vec2 vUv;
  varying vec2 vPix;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPix = vec2(wp.x, -wp.y);  // pane pixels, y down
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* The classic iterated-trig water caustic. Cheap — three iterations — and
 * reads as dancing light lines on sand from across a room. Stretched wide
 * because we see the substrate nearly edge-on. */
const CAUSTIC = /* glsl */`
  float caustic(vec2 p, float t) {
    vec2 uv = p * vec2(0.0085, 0.016) + vec2(17.0, 3.0);
    vec2 i = uv;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 3; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = uv + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(uv.x / (sin(i.x + tt) / inten), uv.y / (cos(i.y + tt) / inten)));
    }
    c /= 3.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 7.0), 0.0, 1.2);
  }
`;

const LAYER_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uTime;
  uniform vec3 uLight;
  uniform float uIntensity;
  uniform float uCaustic;     // scene-wide, from sky.js
  uniform float uCausticGain; // this layer's receptiveness
  uniform float uSway;        // px of sway at full height
  uniform float uSwayBase;    // pane y where plants are rooted
  uniform float uSwayHeight;  // px over which sway reaches full strength
  uniform float uFog;
  uniform vec3 uFogColor;
  uniform float uShimmer;     // backdrop only
  varying vec2 vUv;
  varying vec2 vPix;
  ${CAUSTIC}
  void main() {
    vec2 uv = vUv;
    if (uSway > 0.0) {
      float h = clamp((uSwayBase - vPix.y) / uSwayHeight, 0.0, 1.0);
      float s = sin(uTime * 0.42 + vPix.x * 0.006 + vPix.y * 0.010) * 0.7
              + sin(uTime * 0.19 + vPix.x * 0.013) * 0.3;
      uv.x -= uSway * h * h * s / ${W.toFixed(1)};
    }
    vec4 c = texture2D(map, uv);
    if (c.a < 0.02) discard;
    vec3 col = c.rgb * uLight * uIntensity;
    if (uCausticGain > 0.0) {
      // Caustics land on upward-facing light surfaces; strongest near the
      // top of each object, fading with depth below the surface.
      float depth = clamp((vPix.y - ${GEO.surface.toFixed(1)}) / 420.0, 0.0, 1.0);
      float k = caustic(vPix, uTime * 0.35) * uCaustic * uCausticGain * (1.0 - depth * 0.35);
      col += c.rgb * uLight * k * 0.9;
    }
    if (uShimmer > 0.0) {
      float s = sin(vPix.x * 0.045 + uTime * 0.3) * sin(vPix.x * 0.011 - uTime * 0.17);
      col += uLight * uIntensity * max(0.0, s) * uShimmer * 0.06;
    }
    col = mix(col, uFogColor * uLight * uIntensity, uFog);
    gl_FragColor = vec4(col, c.a);
  }
`;

const FISH_VERT = /* glsl */`
  uniform float uPhase;
  uniform float uAmp;
  uniform float uFace;   // -1..1: facing and turn
  varying vec2 vUv;
  varying vec2 vPix;
  void main() {
    vUv = uv;
    vec3 p = position;                // x in [-0.5, 0.5], nose at +0.5
    float u = p.x + 0.5;
    // Tail region beats: a travelling wave plus foreshortening of the fin as
    // it sweeps toward and away from the viewer.
    float t = clamp((0.42 - u) / 0.42, 0.0, 1.0);
    p.y += sin(uPhase - u * 5.0) * uAmp * t * t;
    p.x += t * 0.06 * abs(sin(uPhase)) ;
    // A fish turning side-on narrows through zero.
    p.x *= uFace;
    p.y *= 1.0 - 0.12 * (1.0 - abs(uFace));
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vPix = vec2(wp.x, -wp.y);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FISH_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uLight;
  uniform float uIntensity;
  uniform float uFog;
  uniform vec3 uFogColor;
  uniform float uIrid;       // 0..1, peaks as the fish shows its flank
  uniform float uTime;
  uniform float uCaustic;
  varying vec2 vUv;
  varying vec2 vPix;
  ${CAUSTIC}
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.03) discard;
    // View-angle iridescence: boost saturated electric blue (the neon and
    // cardinal stripe) as the flank turns toward us.
    float blue = smoothstep(0.25, 0.6, c.b - max(c.r, c.g));
    vec3 col = c.rgb + blue * uIrid * vec3(0.05, 0.25, 0.35);
    col *= uLight * uIntensity;
    // Rim light on the upper edge, strongest on translucent fins.
    float rim = (1.0 - c.a) * 0.35;
    col += uLight * uIntensity * rim * 0.25;
    col += c.rgb * uLight * caustic(vPix, uTime * 0.35) * uCaustic * 0.35;
    col = mix(col, uFogColor * uLight * uIntensity, uFog);
    gl_FragColor = vec4(col, c.a);
  }
`;

const RAY_FRAG = /* glsl */`
  uniform vec3 uLight;
  uniform float uStrength;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    // Soft across the beam, fading with depth, flickering slowly.
    float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
    float down = pow(vUv.y, 1.6);
    float flick = 0.65 + 0.35 * sin(uTime * 0.31 + uSeed * 7.0) * sin(uTime * 0.17 + uSeed * 3.0);
    float a = across * down * flick * uStrength;
    gl_FragColor = vec4(uLight * a, a);
  }
`;

const SURFACE_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uLight;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uRain;   // 0 none, 1 rain, 0.5 snow (slower, fewer)
  varying vec2 vUv;
  varying vec2 vPix;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    // Slow rolling ripples on the underside of the surface.
    uv.x += sin(vPix.x * 0.035 + uTime * 0.8) * 0.0025 + sin(vPix.x * 0.011 - uTime * 0.5) * 0.004;
    uv.y += sin(vPix.x * 0.05 + uTime * 0.6) * 0.06;
    vec3 col = texture2D(map, uv).rgb * uLight * uIntensity;
    // Bright meniscus line where the band meets the water.
    float edge = smoothstep(0.12, 0.0, vUv.y);
    col += uLight * uIntensity * edge * 0.55;
    // Rain: expanding rings in cells across the band.
    if (uRain > 0.0) {
      vec2 cell = floor(vec2(vPix.x / 80.0, 0.0));
      for (int k = -1; k <= 1; k++) {
        vec2 cc = cell + vec2(float(k), 0.0);
        float h = hash(cc);
        float period = 2.2 / uRain + h * 1.5;
        float age = mod(uTime + h * 10.0, period);
        vec2 center = vec2((cc.x + 0.2 + 0.6 * h) * 80.0, ${(GEO.surface - 6).toFixed(1)});
        float r = age * 26.0;
        float d = abs(length((vPix - center) * vec2(1.0, 2.6)) - r);
        float ring = smoothstep(2.2, 0.0, d) * (1.0 - age / period);
        col += uLight * uIntensity * ring * 0.5;
      }
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const HOOD_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uLight;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec2 vPix;
  void main() {
    vec4 c = texture2D(map, vUv);
    vec3 col = c.rgb;
    // The LED strip along the hood's lower edge takes the sun's colour.
    float strip = smoothstep(${(GEO.hoodBottom - 6).toFixed(1)}, ${(GEO.hoodBottom - 2).toFixed(1)}, vPix.y)
                * smoothstep(${(GEO.hoodBottom + 1).toFixed(1)}, ${(GEO.hoodBottom - 1).toFixed(1)}, vPix.y);
    col = mix(col, uLight * (0.55 + 0.45 * uIntensity), strip);
    // Glow spilling down from it.
    float spill = smoothstep(${(GEO.hoodBottom + 14).toFixed(1)}, ${GEO.hoodBottom.toFixed(1)}, vPix.y) * step(${GEO.hoodBottom.toFixed(1)}, vPix.y);
    float a = max(c.a, spill * 0.35 * uIntensity);
    col = mix(col, uLight, spill * (1.0 - c.a));
    gl_FragColor = vec4(col, a);
  }
`;

const STONE_FRAG = /* glsl */`
  uniform sampler2D map;     // the slate
  uniform sampler2D textMap; // the lettering
  uniform vec3 uLight;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uCaustic;
  uniform float uGlow;
  uniform float uBright;
  varying vec2 vUv;
  varying vec2 vPix;
  void main() {
    vec4 s = texture2D(map, vUv);
    vec4 t = texture2D(textMap, vUv);
    if (s.a < 0.02 && t.a < 0.02) discard;
    // An LCD card on the front glass since 2026-10-08, not a stone in the
    // water: no scene light, no caustics — the same dimming as the clock.
    vec3 col = s.rgb * uBright;
    vec3 letters = t.rgb * uBright;
    letters += vec3(0.55, 0.85, 1.0) * uGlow * (0.18 + 0.08 * sin(uTime * 1.2)) * t.a;
    col = mix(col, letters, t.a);
    gl_FragColor = vec4(col, max(s.a, t.a));
  }
`;

const FLAT_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uBright;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.01) discard;
    gl_FragColor = vec4(c.rgb * uBright, c.a);
  }
`;

const PARTICLE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aTw;
  uniform float uTime;
  varying float vA;
  void main() {
    vA = 0.45 + 0.55 * sin(uTime * 0.6 + aTw * 6.28);
    gl_PointSize = aSize;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;
const PARTICLE_FRAG = /* glsl */`
  uniform vec3 uLight;
  uniform float uIntensity;
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d)) * vA * 0.55;
    gl_FragColor = vec4(uLight * (0.6 + 0.4 * uIntensity), a);
  }
`;

/* ── construction ──────────────────────────────────────────────────────── */

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

/** A plane covering pane rect (x, y, w, h), y down. */
function plane(material, x, y, w, h, order, segX = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, segX, 1), material);
  m.position.set(x + w / 2, -(y + h / 2), 0);
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
}

function shaderMat(frag, uniforms, { vert = VERT, blending = THREE.NormalBlending } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending,
  });
}

/** Light uniforms shared by reference across every lit material. */
function lightUniforms() {
  return {
    uTime: { value: 0 },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uIntensity: { value: 1 },
    uCaustic: { value: 1 },
  };
}

export class TankScene {
  /**
   * @param {HTMLCanvasElement} canvasEl
   */
  constructor(canvasEl) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: false,
      alpha: false,
      // The daemon screenshots the page; keep the last frame readable.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.camera = new THREE.OrthographicCamera(0, W, 0, -H, -10, 10);
    this.shared = lightUniforms();
    this.scene = null;
    this.fade = 0;
  }

  /** The WebGL renderer string — logged so the daemon log shows whether
   * headless Chromium got the GPU or fell back to SwiftShader. */
  rendererInfo() {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }

  /**
   * Bake and assemble a whole tank from a layout. Synchronous and a little
   * slow (the bake is ~1-3s of canvas work); called at boot and at 03:00.
   *
   * @param {ReturnType<import('./layout.js').buildLayout>} layout
   */
  build(layout) {
    this.dispose();
    const S = this.shared;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.layout = layout;
    this.textures = [];
    const tex = (c) => { const t = texture(c); this.textures.push(t); return t; };

    const fogColor = new THREE.Color(0.62, 0.80, 0.78);
    const layer = (canvas, order, opts = {}) => {
      const mat = shaderMat(LAYER_FRAG, {
        ...S,
        map: { value: tex(canvas) },
        uCausticGain: { value: opts.caustic ?? 0 },
        uSway: { value: opts.sway ?? 0 },
        uSwayBase: { value: opts.swayBase ?? GEO.substrateBack + 10 },
        uSwayHeight: { value: opts.swayHeight ?? 300 },
        uFog: { value: opts.fog ?? 0 },
        uFogColor: { value: fogColor },
        uShimmer: { value: opts.shimmer ?? 0 },
      });
      const m = plane(mat, 0, 0, W, H, order);
      scene.add(m);
      return m;
    };

    const backdrop = paintBackdrop(layout);
    const backPlants = paintBackPlants(layout);
    const limbs = buildWood(layout);
    const wood = paintWood(layout, limbs);
    const mid = paintMidPlants(layout);
    const substrate = paintSubstrate(layout);
    const front = paintFront(layout);

    /* Caustic gains cut 2026-10-08 (substrate 0.6 -> 0.2, wood 0.45 -> 0.25,
     * mid 0.3 -> 0.15, front 0.2 -> 0.1). At full strength the bright web
     * left its unlit cells — and the crisp folds where the pattern crosses
     * zero — reading as dark shapes, and at 4 fps they jumped rather than
     * drifted: Ricky saw "weird floating shadows ... most noticeable on the
     * grass". Confirmed by rendering with every fish hidden. */
    layer(backdrop, 0, { shimmer: 1 });
    layer(backPlants, 10, { sway: 7, fog: 0.16, caustic: 0.15, swayHeight: 320 });
    layer(wood, 20, { caustic: 0.25 });
    layer(mid, 30, { sway: 5, caustic: 0.15, swayHeight: 220 });
    layer(substrate, 40, { caustic: 0.2 });
    layer(front, 50, { sway: 9, swayBase: H, swayHeight: 300, caustic: 0.1 });

    // Reflection band under the surface, and the hood above it.
    const refl = paintReflection([backdrop, backPlants, wood, mid]);
    const surfMat = shaderMat(SURFACE_FRAG, { ...S, map: { value: tex(refl) }, uRain: { value: 0 } });
    this.surfMat = surfMat;
    scene.add(plane(surfMat, 0, GEO.hoodBottom, W, GEO.surface - GEO.hoodBottom, 70));
    const hood = paintHood();
    scene.add(plane(shaderMat(HOOD_FRAG, { ...S, map: { value: tex(hood) } }), 0, 0, W, hood.height, 72));

    // God rays from the surface, slanting with the light.
    const rr = makeRng(layout.seed ^ 0x2a);
    this.rays = [];
    for (let i = 0; i < 6; i++) {
      const mat = shaderMat(RAY_FRAG, { ...S, uStrength: { value: 0.1 }, uSeed: { value: rr.next() } },
        { blending: THREE.AdditiveBlending });
      const w = rr.range(50, 120);
      const x = rr.range(80, W - 200);
      const geo = new THREE.BufferGeometry();
      const top = -GEO.surface, bot = -GEO.substrateBack, slant = 130;
      // A trapezoid widening downward. uv.y is 1 at the surface.
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        x, top, 0, x + w, top, 0, x + slant + w * 1.8, bot, 0, x + slant - w * 0.4, bot, 0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      geo.setIndex([0, 3, 2, 0, 2, 1]);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 65;
      m.frustumCulled = false;
      scene.add(m);
      this.rays.push({ mat, base: rr.range(0.06, 0.13) });
    }

    // Particulates: slow-drifting motes, brighter when they catch the light.
    const N = 130;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const tw = new Float32Array(N);
    this.motes = [];
    for (let i = 0; i < N; i++) {
      const m = { x: rr.range(0, W), y: rr.range(GEO.surface, GEO.substrateBack + 40),
        vx: rr.range(-1.5, 1.5), vy: rr.range(-0.6, 1.2) };
      this.motes.push(m);
      size[i] = rr.range(1.2, 3.0);
      tw[i] = rr.next();
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pgeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    pgeo.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
    const points = new THREE.Points(pgeo, new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      uniforms: { ...S }, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    points.renderOrder = 60;
    points.frustumCulled = false;
    scene.add(points);
    this.pointsGeo = pgeo;

    // Glass overlay.
    const glass = paintGlass();
    scene.add(plane(shaderMat(FLAT_FRAG, { map: { value: tex(glass) }, uBright: { value: 1 } }), 0, 0, W, H, 80));

    // Fish. Perches for otocinclus: upward-facing spots along the wood.
    const perches = [];
    for (const limb of limbs) {
      for (let i = 4; i < limb.pts.length - 4; i += 9) {
        const p = limb.pts[i];
        if (p.w > 5 && p.y > 120 && p.y < 360) perches.push({ x: p.x, y: p.y - p.w - 4 });
      }
    }
    this.pop = createPopulation(layout, { perches });
    const speciesTex = new Map();
    this.fishMeshes = this.pop.agents.map((a) => {
      if (!speciesTex.has(a.sp.id)) speciesTex.set(a.sp.id, tex(paintSpecies(a.sp)));
      const mat = shaderMat(FISH_FRAG, {
        ...S,
        map: { value: speciesTex.get(a.sp.id) },
        uPhase: { value: 0 }, uAmp: { value: 0.05 }, uFace: { value: 1 },
        uFog: { value: 0 }, uFogColor: { value: fogColor }, uIrid: { value: 0 },
      }, { vert: FISH_VERT });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, ASPECT, 14, 1), mat);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });

    // The slate stone and its lettering.
    const sr = makeRng(layout.seed ^ 0x51a7e);
    this.stoneTextCanvas = null;
    this.stoneMat = shaderMat(STONE_FRAG, {
      ...S,
      map: { value: tex(paintStone(sr.next)) },
      textMap: { value: null },
      uGlow: { value: 0 },
      uBright: { value: 1 },
    });
    // 90, with the clock: on the glass, in front of everything in the water.
    scene.add(plane(this.stoneMat, STONE.x, STONE.y, STONE.w, STONE.h, 90));

    this.thermoMat = shaderMat(FLAT_FRAG, { map: { value: null }, uBright: { value: 1 } });
    scene.add(plane(this.thermoMat, THERMO.x, THERMO.y, THERMO.w, THERMO.h, 90));

    // Fade-to-black for the 03:00 rebuild.
    this.fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    scene.add(plane(this.fadeMat, 0, 0, W, H, 100));
  }

  /** Replace the stone's lettering. */
  setStoneText(text, glow, brightness = 1) {
    this.stoneMat.uniforms.uBright.value = brightness;
    const old = this.stoneMat.uniforms.textMap.value;
    const t = texture(paintStoneText(text));
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    this.stoneMat.uniforms.textMap.value = t;
    this.stoneMat.uniforms.uGlow.value = glow;
    old?.dispose();
  }

  /** Replace the thermometer's readout. */
  setThermo(info, brightness) {
    const old = this.thermoMat.uniforms.map.value;
    const t = texture(paintThermo(info));
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    this.thermoMat.uniforms.map.value = t;
    this.thermoMat.uniforms.uBright.value = brightness;
    old?.dispose();
  }

  /** @param {ReturnType<import('./sky.js').lighting>} light */
  setLight(light) {
    this.shared.uLight.value.setRGB(...light.color);
    this.shared.uIntensity.value = light.intensity;
    this.shared.uCaustic.value = light.caustics;
    this.light = light;
    if (this.surfMat) this.surfMat.uniforms.uRain.value = light.drops === 'rain' ? 1 : light.drops === 'snow' ? 0.5 : 0;
  }

  setFade(v) { this.fade = v; if (this.fadeMat) this.fadeMat.opacity = v; }

  /**
   * Advance the simulation to `t` seconds and draw.
   * @param {number} t   seconds, monotonic
   * @param {number} dt  seconds since the previous frame
   */
  frame(t, dt) {
    if (!this.scene) return;
    this.shared.uTime.value = t;

    // Fixed sub-steps: the boids forces assume small dt, and at 4 fps a frame
    // is 250ms. Clamp so a tab that slept for an hour doesn't fast-forward.
    let left = Math.min(dt, 1);
    while (left > 0) { const h = Math.min(0.05, left); step(this.pop, h); left -= h; }

    const rays = this.light?.rays ?? 1;
    for (const r of this.rays) r.mat.uniforms.uStrength.value = r.base * rays;

    // Motes drift and wrap.
    const pos = this.pointsGeo.attributes.position.array;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += (m.vx + Math.sin(t * 0.2 + i) * 1.2) * dt;
      m.y += (m.vy + Math.cos(t * 0.15 + i * 1.7) * 0.8) * dt;
      if (m.x < 0) m.x += W; if (m.x > W) m.x -= W;
      if (m.y < GEO.surface + 4) m.y = GEO.substrateBack + 30;
      if (m.y > GEO.substrateBack + 40) m.y = GEO.surface + 6;
      pos[i * 3] = m.x; pos[i * 3 + 1] = -m.y; pos[i * 3 + 2] = 0;
    }
    this.pointsGeo.attributes.position.needsUpdate = true;

    // Fish: depth sets scale, fog and which side of the wood they are on.
    this.pop.agents.forEach((a, i) => {
      const m = this.fishMeshes[i];
      const scale = a.sp.length * a.size * (1 - 0.32 * a.z);
      m.scale.set(scale, scale, 1);
      m.position.set(a.x, -a.y, 0);
      // Nose follows the climb; mirrored fish rotate the other way.
      m.rotation.z = -a.tilt * Math.sign(a.face || 1);
      // Swimmers pass behind the wood when deep; animals that live ON the
      // substrate or the wood always draw in front of it.
      const onSurface = a.sp.style === 'bottom' || a.sp.style === 'shrimp' || a.sp.style === 'cling';
      m.renderOrder = !onSurface && a.z > 0.5 ? 15 : 45;
      const u = m.material.uniforms;
      u.uPhase.value = a.phase;
      u.uFace.value = Math.abs(a.face) < 0.08 ? 0.08 * Math.sign(a.face || 1) : a.face;
      u.uAmp.value = a.sp.style === 'shrimp' ? 0.0 : 0.05;
      u.uFog.value = a.z * 0.25; // was 0.42: deep fish read as fading out (2026-10-08)
      u.uIrid.value = Math.abs(a.face) * (0.5 + 0.5 * Math.sin(t * 0.7 + a.jitter));
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    for (const t of this.textures ?? []) t.dispose();
    this.stoneMat?.uniforms.textMap.value?.dispose();
    this.thermoMat?.uniforms.map.value?.dispose();
    this.scene = null;
  }
}
