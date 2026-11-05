/* The hero's tabletop: one glass die from the game, on the game's own mat,
   with real rigid-body physics. Loaded lazily, after the page has painted.

   The canvas is a fixed, see-through overlay across the whole window, so the
   die can be carried anywhere on the page, over the text and out of the hero.
   It never takes pointer events; the die is picked up by our own raycast on
   window pointerdown. The mat stays put: the camera is fitted to the hero's
   .dice-frame and offset so the mat lands exactly there, scroll included.

   Physics lives in ./diePhysics.js (plain Rapier, shared with the test bench
   in scripts/die-physics-test.mjs). This file draws it and wires up the hand.
   Nothing here moves the die except physics: no snapping, no nudges, no
   teleporting on release. The result is READ from the die's orientation once
   it has come to rest — the face pointing most nearly straight up. */
import {Suspense, use, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import * as THREE from 'three';
import {Canvas, useFrame, useLoader, useThree} from '@react-three/fiber';
import RAPIER from '@dimforge/rapier3d-compat';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {assetUrl} from '../../assetUrl.js';
import {
  createDieSim, boundsFor, tableParts, carryPoint, topFace, mulberry32,
  FACE_TABLE, DIE, RAIL,
} from './diePhysics.js';

export {boundsFor, topFace};

const HEADROOM = 2.5;     // air kept above the back rail, so a lifted die stays in view
const GRAB_PX = 30;       // forgiving grab radius around the die, in screen pixels
const REST_LIN = 0.03;    // below these (and for REST_TIME) the die counts as at rest
const REST_ANG = 0.06;
const REST_TIME = 0.3;
const FLAT_ENOUGH = 0.9;  // cos of ~25 degrees; less than this and the die is cocked
const ELEVATION = THREE.MathUtils.degToRad(52);
const FOV = 30;
const LAMP = new THREE.Vector3(-3, 8, 3);

/* Garnet, the colour the model is authored in. The dye and glass settings are
   the game's own (runtime/dice-3d.js: BROWSER_GLASS and the calibrated dye). */
const GARNET = '#bd4055';
const GARNET_DYE = '#dd1737';
const DYE_DISTANCE = 1.4;

let rapierReady = null;
const loadRapier = () => (rapierReady ||= RAPIER.init().then(() => RAPIER));

/* ---------- painted textures ----------
   Nothing is downloaded: the velvet and the walnut are painted at load. */
function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function paintVelvet(g, w, h) {
  g.fillStyle = '#1c2446';
  g.fillRect(0, 0, w, h);
  /* crushed-velvet blotches, then a fine nap */
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 110;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.5;
    grad.addColorStop(0, light ? 'rgba(120,140,200,0.07)' : 'rgba(5,8,20,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 1.2;
  }
  g.putImageData(img, 0, 0);
}

function paintWalnut(g, w, h) {
  g.fillStyle = '#3a2416';
  g.fillRect(0, 0, w, h);
  /* long grain lines that drift and pinch, like quarter-sawn walnut */
  for (let i = 0; i < 90; i++) {
    const y0 = Math.random() * h, amp = 2 + Math.random() * 6, f = 0.004 + Math.random() * 0.01;
    const dark = Math.random() < 0.6;
    g.strokeStyle = dark ? `rgba(20,10,4,${0.25 + Math.random() * 0.35})` : `rgba(140,90,52,${0.12 + Math.random() * 0.2})`;
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * f + i) * amp + Math.sin(x * f * 3.1 + i * 2) * amp * 0.3;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
}

/* ---------- the glass top ----------
   The velvet lies under a sheet of glass. The sheet is a clearcoat over the
   cloth (so the lamp and the room glint on it), and on top of that, in the
   same shader:

   - the PLANAR REFLECTION of the die and the rails, rendered each frame into
     a small target (see Reflections) and added in proportion to the glass's
     Fresnel reflectance at that viewing angle;
   - a CONTACT SHADOW computed from the die's real shape: the rounded cube's
     signed distance at each point of the cloth. Face down it is a crisp
     square, on an edge a line, on a corner a dot, and it spreads and fades
     as the die rises;
   - the LAMP'S LIGHT THROUGH THE GLASS: each point marches towards the lamp
     through the die's shape, and the light that arrives is dimmed by the
     garnet dye for the length of glass it crossed — deep red where it went
     through faces, dark where the rounded edges bent it away.

   No shadow maps and no extra passes: one small loop, skipped wherever the
   ray to the lamp cannot meet the die. */
const glassTopUniforms = () => ({
  uDieInv: {value: new THREE.Matrix4()},
  uDiePos: {value: new THREE.Vector3(0, -50, 0)},
  uLamp: {value: LAMP.clone()},
  uAbsorb: {value: new THREE.Vector3()},
  uRefl: {value: null},
  uReflGain: {value: 0},
  uResolution: {value: new THREE.Vector2(1, 1)},
  uGlow: {value: new THREE.Color(GARNET)},
});

const SDF_GLSL = /* glsl */`
  uniform mat4 uDieInv;
  uniform vec3 uDiePos;
  uniform vec3 uLamp;
  uniform vec3 uAbsorb;
  uniform sampler2D uRefl;
  uniform float uReflGain;
  uniform vec2 uResolution;
  uniform vec3 uGlow;
  varying vec3 vGfWorld;
  float gfDie(vec3 p) {
    vec3 q = abs((uDieInv * vec4(p, 1.0)).xyz) - vec3(${(DIE.half - DIE.radius).toFixed(4)});
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - ${DIE.radius.toFixed(4)};
  }
  /* light from the lamp that reaches p, through (or around) the die */
  vec3 gfLampThroughGlass(vec3 p) {
    vec3 dir = normalize(uLamp - p);
    vec3 oc = uDiePos - p;
    float along = dot(oc, dir);
    if (along < -0.9 || length(oc - dir * along) > 0.9) return vec3(1.0);
    float t0 = max(0.0, along - 0.9), t1 = along + 0.9;
    float dt = (t1 - t0) / float(GF_STEPS);
    float path = 0.0;
    for (int i = 0; i < GF_STEPS; i++) {
      float t = t0 + (float(i) + 0.5) * dt;
      /* the lamp has size, so the further the die is from the cloth the
         softer the edge of what it casts */
      float soft = 0.015 + t * 0.05;
      path += dt * smoothstep(soft, -soft, gfDie(p + dir * t));
    }
    if (path <= 0.0) return vec3(1.0);
    vec3 dyed = exp(-uAbsorb * path) * 0.86;          // two glass surfaces, and the dye
    float bent = exp(-path / 0.16);                    // short paths are the bevels: light refracted away
    vec3 through = dyed * (1.0 - 0.9 * bent) * (1.0 + 0.35 * smoothstep(0.5, 1.0, path));
    return mix(vec3(1.0), through, smoothstep(0.0, 0.05, path));
  }
`;

function glassTopMaterial(velvet, uniforms, steps) {
  const m = new THREE.MeshPhysicalMaterial({
    map: velvet, color: '#a3acd6', roughness: 0.95, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 0.22,
  });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = {...shader.defines, GF_STEPS: steps};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGfWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= gfLamp;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SDF_GLSL)
      .replace('#include <lights_fragment_begin>', `
        float gfD = max(gfDie(vGfWorld), 0.0);
        /* ambient occlusion from the die: dark right under it, soft around */
        float gfAO = 1.0 - 0.62 * exp(-gfD / 0.06) - 0.22 * exp(-gfD / 0.32);
        vec3 gfLamp = gfLampThroughGlass(vGfWorld);
        ${lights}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= gfAO;
        reflectedLight.directDiffuse *= mix(1.0, gfAO, 0.55);
        reflectedLight.directSpecular *= mix(1.0, gfAO, 0.5);
        /* a little of the garnet the lit glass scatters onto the cloth */
        totalEmissiveRadiance += uGlow * 0.05 * exp(-gfD / 0.22);`)
      .replace('#include <opaque_fragment>', `
        {
          /* the reflection, sharp but faint: glass reflects about 4% at
             normal incidence (Schlick, n = 1.5), more towards grazing */
          vec2 ruv = gl_FragCoord.xy / uResolution;
          vec2 px = 1.0 / uResolution;
          vec4 r = texture2D(uRefl, ruv) * 0.4
            + (texture2D(uRefl, ruv + vec2(1.5, 0.5) * px) + texture2D(uRefl, ruv - vec2(1.5, 0.5) * px)
            + texture2D(uRefl, ruv + vec2(-0.5, 1.5) * px) + texture2D(uRefl, ruv - vec2(-0.5, 1.5) * px)) * 0.15;
          float cosV = saturate(dot(normalize(cameraPosition - vGfWorld), vec3(0.0, 1.0, 0.0)));
          float F = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
          outgoingLight = outgoingLight * (1.0 - F * r.a * uReflGain * 0.6) + r.rgb * F * uReflGain;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'gf-glass-top-' + steps;
  return m;
}

/* For the copies drawn into the reflection: fade with height above the
   glass (what is close to the sheet reflects crisply; what is high up falls
   away into the room's darkness), and clip anything below it. Output is
   premultiplied so the cloth can add it straight in. */
function reflectionCopy(material, fade) {
  const m = material.clone();
  m.transparent = true;
  m.depthWrite = true;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGfH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGfH = -(modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGfH;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (vGfH < -0.01) discard;
        gl_FragColor.a = 1.0;
        gl_FragColor *= exp(-max(vGfH, 0.0) * ${fade.toFixed(3)});`);
  };
  m.customProgramCacheKey = () => 'gf-reflect-' + material.type + fade;
  return m;
}

/* ---------- table ---------- */
function useTableTextures() {
  const velvet = useMemo(() => canvasTexture(1024, 640, paintVelvet), []);
  const walnut = useMemo(() => canvasTexture(1024, 256, paintWalnut), []);
  useEffect(() => () => { velvet.dispose(); walnut.dispose(); }, [velvet, walnut]);
  return {velvet, walnut};
}

function railPieces(bounds) {
  const {halfX, halfZ} = bounds;
  const top = RAIL.height + 0.004;
  const inlays = {
    back: {pos: [0, top, -halfZ - 0.1], size: [halfX * 2 + 0.2, 0.012, 0.045]},
    front: {pos: [0, top, halfZ + 0.1], size: [halfX * 2 + 0.2, 0.012, 0.045]},
    left: {pos: [-halfX - 0.1, top, 0], size: [0.045, 0.012, halfZ * 2 + 0.2]},
    right: {pos: [halfX + 0.1, top, 0], size: [0.045, 0.012, halfZ * 2 + 0.2]},
  };
  return tableParts(bounds).filter(p => p.kind === 'wood').map(p => ({
    pos: p.center, size: p.half.map(h => h * 2), inlay: inlays[p.rail],
  }));
}

function Table({bounds, textures, materials}) {
  const {halfX, halfZ} = bounds;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={materials.glassTop}>
        <planeGeometry args={[halfX * 2 + 0.1, halfZ * 2 + 0.1]} />
      </mesh>
      {railPieces(bounds).map((r, i) => (
        <group key={i}>
          <mesh position={r.pos} material={materials.walnut}>
            <boxGeometry args={r.size} />
          </mesh>
          <mesh position={r.inlay.pos} material={materials.brass}>
            <boxGeometry args={r.inlay.size} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------- environment and light ---------- */
function Atmosphere() {
  const {gl, scene} = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  /* every light also lights the reflection pass (layer 1) */
  const both = l => l?.layers.enable(1);
  return (
    <>
      <ambientLight ref={both} intensity={0.18} color="#ffdcb0" />
      {/* the lamp: warm, from above and to the left, pooling on the cloth */}
      <spotLight ref={both} position={LAMP.toArray()} angle={0.7} penumbra={0.9} intensity={520} decay={2} color="#ffc98a" />
      {/* a cool rim from behind, to draw the glass edges */}
      <directionalLight ref={both} position={[3, 4, -6]} intensity={1.1} color="#9fb6ff" />
      {/* a hard little glint, the candle catching the glass */}
      <pointLight ref={both} position={[1.5, 5.5, 4.5]} intensity={22} distance={14} decay={2} color="#fff1d6" />
    </>
  );
}

/* ---------- the die model ---------- */
function useGlassDie() {
  const gltf = useLoader(GLTFLoader, assetUrl('models/glass_die.glb'));
  return useMemo(() => {
    const model = gltf.scene.clone(true);
    /* The "v1 Dense" look signed off on 30 Oct 2026 (APPROVED_LOOK in the
       game's runtime/dice-3d.js): deep dye and a strong clearcoat, which
       reads as glass over a dark cloth where clearer glass reads as black.
       Kept exactly, with one addition: a touch of dispersion, so the bright
       edges of what is seen through the glass split very slightly into
       colour, as real glass does. */
    const glass = new THREE.MeshPhysicalMaterial({
      color: GARNET, transmission: 0.9, thickness: 1.8,
      attenuationDistance: DYE_DISTANCE, attenuationColor: new THREE.Color(GARNET_DYE),
      roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
      ior: 1.5, envMapIntensity: 3.3, specularIntensity: 1, specularColor: new THREE.Color('#ffffff'),
      dispersion: 0.12,
    });
    model.traverse(o => {
      if (o.isMesh && /GlassBody/i.test(o.material?.name || o.name)) o.material = glass;
    });
    model.scale.setScalar(DIE.half);
    model.updateMatrixWorld(true);
    /* Read each face's direction from the model's own Face_N nodes, so the
       result can never disagree with the pips the visitor is looking at. */
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const faces = [];
    for (let v = 1; v <= 6; v++) {
      const node = model.getObjectByName('Face_' + v);
      if (!node) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(inv);
      if (p.lengthSq() > 1e-6) faces.push({value: v, normal: p.normalize()});
    }
    const faceNormals = faces.length === 6 ? faces : FACE_TABLE;

    /* The copy that is drawn in the reflection: same shape and pips, a
       cheaper opaque stand-in for the glass (a reflection 4% bright cannot
       show transmission, and a second transmission pass would double the
       cost of the most expensive thing on the page). */
    const mirror = gltf.scene.clone(true);
    const reflGlass = reflectionCopy(new THREE.MeshStandardMaterial({
      color: GARNET, roughness: 0.08, metalness: 0, emissive: new THREE.Color(GARNET_DYE), emissiveIntensity: 0.35, envMapIntensity: 2.2,
    }), 1.3);
    const reflPips = reflectionCopy(new THREE.MeshStandardMaterial({color: '#c8c8c2', roughness: 0.35}), 1.3);
    mirror.traverse(o => {
      if (!o.isMesh) return;
      o.material = /GlassBody/i.test(o.material?.name || o.name) ? reflGlass : reflPips;
      o.layers.set(1);
    });
    mirror.matrixAutoUpdate = false;
    return {model, glass, faceNormals, mirror, mirrorMaterials: [reflGlass, reflPips]};
  }, [gltf]);
}

/* ---------- the reflection pass ----------
   The glass top is the plane y = 0, so the reflection of anything is that
   thing scaled by (1, -1, 1). The copies are drawn from the REAL camera into
   a small target; a point on the glass then finds its reflection at its own
   place on screen. Only the die and the rails are reflected — the cloth
   cannot reflect itself and nothing else is near enough to matter. */
const FLIP = new THREE.Matrix4().makeScale(1, -1, 1);
function Reflections({die, bounds, uniforms, materials, scale}) {
  const {gl, scene, camera, size} = useThree();
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: true}), []);
  const railsGroup = useRef();
  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    target.setSize(Math.max(1, Math.round(size.width * dpr * scale)), Math.max(1, Math.round(size.height * dpr * scale)));
    uniforms.uRefl.value = target.texture;
    uniforms.uReflGain.value = 1.2;
  }, [gl, size, scale, target, uniforms]);
  useEffect(() => {
    railsGroup.current?.traverse(o => { o.layers.set(1); });
  });

  const clear = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const mirror = die.mirror;
    mirror.matrix.multiplyMatrices(FLIP, die.model.matrixWorld);
    mirror.matrixWorldNeedsUpdate = true;
    gl.getDrawingBufferSize(uniforms.uResolution.value);
    const prevTarget = gl.getRenderTarget();
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(clear);
    const prevMask = camera.layers.mask;
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    camera.layers.set(1);
    gl.render(scene, camera);
    camera.layers.mask = prevMask;
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(clear, prevAlpha);
  });

  return (
    <>
      <primitive object={die.mirror} />
      <group ref={railsGroup} scale={[1, -1, 1]}>
        {railPieces(bounds).map((r, i) => (
          <mesh key={i} position={r.pos} material={materials.walnutMirror} layers={1}>
            <boxGeometry args={r.size} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/* ---------- the die in play ---------- */
function Die({sim, die, bounds, api, uniforms, onResult, onPhase, onImpact, onActivity, reducedMotion}) {
  const {model, faceNormals} = die;
  const {camera, gl, invalidate} = useThree();
  const carry = useRef();
  const rim = useRef();

  /* Everything the frame loop reads lives in one mutable record: React state
     would re-render the scene every frame. */
  const s = useRef({
    held: false, hover: false, pointer: null, lift: 0, rest: 0, reported: true, phase: 'idle',
    away: false, lost: false, falling: 0, lastSound: 0, lastStrength: 0, soundWindow: [], settledAt: 0,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
  }).current;

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const tmp = useMemo(() => ({v: new THREE.Vector3(), m: new THREE.Matrix4()}), []);

  function setRay(clientX, clientY) {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray;
  }
  function screenPos(t) {
    const r = gl.domElement.getBoundingClientRect();
    const p = tmp.v.set(t.x, t.y, t.z).project(camera);
    return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
  }

  /* The canvas takes no pointer events, so the die is hit-tested by hand:
     the model first, then a small radius around it so a fingertip counts.
     Returns the world point that was touched. */
  function hitTest(clientX, clientY) {
    if (s.lost) return null;
    setRay(clientX, clientY);
    const hit = ray.intersectObject(model, true)[0];
    if (hit) return hit.point.clone();
    const [sx, sy] = screenPos(s.pos);
    if (Math.hypot(clientX - sx, clientY - sy) < GRAB_PX) {
      /* the nearest point on the pointer ray to the die's centre */
      const p = new THREE.Vector3();
      ray.ray.closestPointToPoint(s.pos, p);
      return p.sub(s.pos).clampLength(0, DIE.half).add(s.pos);
    }
    return null;
  }

  function setPhase(p) {
    if (p === s.phase) return;
    s.phase = p;
    onPhase(p);
  }

  function startRolling() {
    s.rest = 0;
    s.reported = false;
    s.falling = 0;
    setPhase('rolling');
    onActivity(true);
    invalidate();
  }

  function grab(e, point) {
    if (s.held) return;
    s.held = true;
    s.lift = point.y - s.pos.y;
    s.pointer = [e.clientX, e.clientY];
    s.reported = true;
    sim.body.setEnabled(true);
    sim.grab(point);
    api.unlockSound();
    s.away = !sim.overTable();
    setPhase(s.away ? 'held-off' : 'held');
    onActivity(true);
    invalidate();
    document.body.classList.add('die-held');
  }

  function release() {
    if (!s.held) return;
    s.held = false;
    document.body.classList.remove('die-held');
    s.released = sim.release({scale: reducedMotion ? 0.5 : 1});
    startRolling();
  }

  /* Pointer movement is tracked on the window while held, so a throw that
     leaves the canvas still lands. */
  useEffect(() => {
    /* The die is picked up from anywhere on the page. The header keeps its
       own clicks, and a press that misses the die is left alone entirely. */
    const down = e => {
      if (s.held || e.button > 0) return;
      if (e.target instanceof Element && e.target.closest('.site-header, .lightbox')) return;
      const point = hitTest(e.clientX, e.clientY);
      if (!point) return;
      e.preventDefault();
      grab(e, point);
    };
    const move = e => {
      if (s.held) { s.pointer = [e.clientX, e.clientY]; return; }
      const on = !!hitTest(e.clientX, e.clientY);
      if (on !== s.hover) {
        s.hover = on;
        document.body.classList.toggle('die-hover', on);
        invalidate();
      }
    };
    const up = () => release();
    /* While a finger holds the die the page must not scroll under it. */
    const touchMove = e => { if (s.held) e.preventDefault(); };
    window.addEventListener('pointerdown', down, {capture: true});
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    window.addEventListener('touchmove', touchMove, {passive: false});
    return () => {
      window.removeEventListener('pointerdown', down, {capture: true});
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      window.removeEventListener('touchmove', touchMove);
      document.body.classList.remove('die-held', 'die-hover');
    };
  });

  /* Put a lost die back in play. */
  function revive() {
    s.lost = false;
    model.visible = true;
    sim.body.setEnabled(true);
  }

  useEffect(() => {
    /* The keyboard-friendly alternative: a croupier's throw from one side. */
    api.roll = seed => {
      if (s.held) return;
      revive();
      sim.rollThrow(seed != null ? mulberry32(seed) : Math.random, {gentle: reducedMotion});
      api.unlockSound();
      startRolling();
    };
    /* Morrow's offer when the die has been dropped off the mat: it comes
       back over the cloth and falls, so the throw still decides the face. */
    api.fetch = seed => {
      if (s.held) return;
      revive();
      sim.fetchDrop(seed != null ? mulberry32(seed) : Math.random, {gentle: reducedMotion});
      api.unlockSound();
      startRolling();
    };
    /* For the automated checks and screenshots only: set the die down in a
       given pose (position, quaternion, velocities) and let physics run. */
    api.pose = ({p, q, v = [0, 0, 0], w = [0, 0, 0]}) => {
      if (s.held) return;
      revive();
      sim.place(p, new THREE.Quaternion(...q).normalize(), v, w);
      startRolling();
    };
    /* Read-only snapshot for scripts/check-site.mjs: where the die is on
       screen, how it is turned, and what is face up. */
    api.inspect = () => {
      const b = sim.body;
      const t = b.translation(), r = b.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      return {
        position: [t.x, t.y, t.z], quaternion: [r.x, r.y, r.z, r.w],
        linvel: Object.values(b.linvel()), angvel: Object.values(b.angvel()), released: s.released || null,
        screen: screenPos(s.pos),
        sleeping: b.isSleeping(), held: s.held, settled: s.reported, phase: s.phase,
        top: topFace(q, faceNormals), bounds, lost: s.lost, overMat: sim.overTable(t),
        faceNormals: faceNormals.map(f => ({value: f.value, normal: f.normal.toArray()})),
        steps: sim.steps,
        /* while held: where on screen the point the visitor took hold of is */
        grip: s.held ? screenPos(tmp.v.copy(sim.hand.local).applyQuaternion(q).add(t)) : null,
      };
    };
    return () => { api.roll = null; api.fetch = null; api.inspect = null; api.pose = null; };
  });

  /* Strikes become sound: harder strikes louder, glass and walnut each their
     own voice, never more than a few a moment. */
  function strike(ev) {
    if (s.held && ev.change < 1.5) return;
    /* timed in simulation seconds, not wall-clock: on a slow frame many
       steps run at once, and their strikes are still spread out in time */
    const now = ev.time * 1000;
    const strength = Math.min(1, (ev.change - 0.35) / 10);
    if (strength < 0.015) return;
    s.soundWindow = s.soundWindow.filter(t => now - t < 1000);
    const gap = now - s.lastSound;
    /* within 40 ms of the last strike only a clearly harder one is heard */
    if (gap < 40 && strength < s.lastStrength * 2) return;
    if (s.soundWindow.length >= 14) return;
    s.lastSound = now;
    s.lastStrength = strength;
    s.soundWindow.push(now);
    onImpact(strength, ev.surface);
  }

  useFrame((state, dt) => {
    const b = sim.body;

    /* the hand: where the pointer points, on the carry surface */
    if (s.held && s.pointer) {
      const r = setRay(s.pointer[0], s.pointer[1]);
      sim.setTarget(carryPoint(r.origin, r.direction, bounds, s.lift, tmp.v));
    }

    const alpha = s.lost ? 0 : sim.advance(dt, strike);

    /* draw the die between the last two physics steps */
    s.pos.lerpVectors(sim.prev.p, sim.curr.p, alpha);
    s.quat.slerpQuaternions(sim.prev.q, sim.curr.q, alpha);
    model.position.copy(s.pos);
    model.quaternion.copy(s.quat);
    model.updateMatrixWorld();
    tmp.m.compose(s.pos, s.quat, tmp.v.set(1, 1, 1)).invert();
    uniforms.uDieInv.value.copy(tmp.m);
    uniforms.uDiePos.value.copy(s.lost ? tmp.v.set(0, -50, 0) : s.pos);

    const t = b.translation();
    if (s.held) {
      const away = !sim.overTable(t);
      if (away !== s.away) { s.away = away; setPhase(away ? 'held-off' : 'held'); }
    } else if (!s.lost) {
      /* Off the mat it falls. It is gone once it has dropped out of the
         window (or a few seconds have passed): Morrow offers to fetch it.
         Not before — the fall itself is worth watching. */
      if (!sim.overTable(t) && t.y < 0) {
        s.falling += dt;
        const [sx, sy] = screenPos(t);
        const out = sy > window.innerHeight + 120 || sx < -120 || sx > window.innerWidth + 120;
        if (out || t.y < -40 || s.falling > 4 || !Number.isFinite(t.y)) {
          s.lost = true;
          s.reported = true;
          s.hover = false;
          document.body.classList.remove('die-hover');
          b.setEnabled(false);
          model.visible = false;
          setPhase('lost');
          onActivity(false);
          return;
        }
      } else s.falling = 0;

      const {lin, ang} = sim.speed();
      const still = b.isSleeping() || (lin < REST_LIN && ang < REST_ANG);
      if (!s.reported) {
        s.rest = still ? s.rest + dt : 0;
        if (s.rest > REST_TIME) {
          s.reported = true;
          s.settledAt = performance.now();
          const top = topFace(s.quat, faceNormals);
          /* At rest but leaning against a rail (or on one, askew): it is
             cocked, as a real die can be. No face is read and nothing pushes
             it flat; the visitor throws again. */
          if (top.dot >= FLAT_ENOUGH) {
            onResult(top.value);
            setPhase('settled');
          } else setPhase('cocked');
        }
      } else if ((lin > 0.25 || ang > 0.5) && (s.phase === 'settled' || s.phase === 'cocked')) {
        /* knocked back into motion by the hand or a rail it was resting on */
        startRolling();
      } else if (s.settledAt && performance.now() - s.settledAt > 1200 && !s.hover && b.isSleeping()) {
        s.settledAt = 0;
        onActivity(false);
      }
    }

    /* Away from the table the lamp no longer reaches, so a small light is
       carried with the die and the glass keeps its depth across the page. */
    const fp = {x: bounds.halfX + RAIL.width, z: bounds.halfZ + RAIL.width};
    const outside = Math.max(Math.abs(s.pos.x) - fp.x, Math.abs(s.pos.z) - fp.z, 0);
    const away = s.lost ? 0 : Math.min(1, outside / 0.7);
    if (carry.current) {
      carry.current.position.set(s.pos.x - 1.1, s.pos.y + 1.5, s.pos.z + 1.3);
      carry.current.intensity = away * 20;
    }
    if (rim.current) {
      rim.current.position.set(s.pos.x + 1.3, s.pos.y + 0.4, s.pos.z - 1.5);
      rim.current.intensity = away * 9;
    }
  });

  return (
    <>
      <primitive object={model} />
      {/* key and rim, carried with the die so the glass keeps its depth
          once it is away from the lamp over the table */}
      <pointLight ref={carry} intensity={0} distance={12} decay={2} color="#ffd9a8" />
      <pointLight ref={rim} intensity={0} distance={12} decay={2} color="#9fb6ff" />
    </>
  );
}

/* The camera is fitted to the mat exactly as if it were drawing inside
   .dice-frame, then its field of view is widened to the whole window and the
   frustum shifted so the mat lands on that frame — which also carries it up
   the screen as the page scrolls. Everywhere else on the canvas is empty,
   see-through air for the die to be carried through. */
function CameraRig({bounds, frameRef}) {
  const {camera, invalidate, size} = useThree();
  useEffect(() => {
    const el = frameRef?.current;
    const fitCam = new THREE.PerspectiveCamera(FOV, 1.6, 0.5, 60);
    const p = new THREE.Vector3();
    const ox = bounds.halfX + RAIL.width, oz = bounds.halfZ + RAIL.width;
    const points = [
      ...[-1, 1].flatMap(sx => [-1, 1].flatMap(sz => [0, RAIL.height].map(y => new THREE.Vector3(sx * ox, y, sz * oz)))),
      new THREE.Vector3(0, HEADROOM + 0.3, -bounds.halfZ + 0.62),
    ];

    const place = () => {
      const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
      const r = el ? el.getBoundingClientRect() : {left: 0, top: 0, width: W, height: H};
      const fw = Math.max(1, r.width), fh = Math.max(1, r.height);

      /* Distance that fits the whole mat into the frame, rails and all. */
      fitCam.fov = FOV;
      fitCam.aspect = fw / fh;
      for (let d = 7.5; d < 40; d += 0.1) {
        fitCam.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
        fitCam.lookAt(0, 0.55, 0);
        fitCam.updateProjectionMatrix();
        fitCam.updateMatrixWorld();
        if (points.every(v => { p.copy(v).project(fitCam); return Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.94; })) break;
      }
      camera.position.copy(fitCam.position);
      camera.quaternion.copy(fitCam.quaternion);

      /* Same picture, drawn on a window-sized canvas: widen the view so the
         frame's height still subtends FOV, then slide the frustum so the mat
         sits over the frame instead of the middle of the window. */
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * H / fh));
      camera.aspect = W / H;
      camera.setViewOffset(W, H, W / 2 - (r.left + fw / 2), H / 2 - (r.top + fh / 2), W, H);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      invalidate();
    };

    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll);
    const ro = el ? new ResizeObserver(place) : null;
    if (ro && el) ro.observe(el);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro?.disconnect();
    };
  }, [camera, invalidate, size, bounds, frameRef]);
  return null;
}

/* Everything that needs Rapier and the model, created once they are ready. */
function World({bounds, lowPower, ...props}) {
  use(loadRapier());
  const die = useGlassDie();
  const textures = useTableTextures();
  const {gl} = useThree();
  const uniforms = useMemo(glassTopUniforms, []);
  const sim = useMemo(() => createDieSim(RAPIER, {bounds}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => sim.dispose(), [sim]);
  /* a new mat shape moves the rails; the die stays where it is */
  useEffect(() => { if (sim.bounds !== bounds) sim.setBounds(bounds); }, [sim, bounds]);

  const materials = useMemo(() => {
    const walnut = new THREE.MeshStandardMaterial({map: textures.walnut, roughness: 0.42, metalness: 0.05, color: '#d8b490'});
    return {
      glassTop: glassTopMaterial(textures.velvet, uniforms, lowPower ? 10 : 16),
      walnut,
      walnutMirror: reflectionCopy(walnut, 1.6),
      brass: new THREE.MeshStandardMaterial({color: '#d6aa62', metalness: 1, roughness: 0.3}),
    };
  }, [textures, uniforms, lowPower]);
  useEffect(() => () => {
    for (const m of Object.values(materials)) m.dispose();
    for (const m of die.mirrorMaterials) m.dispose();
    die.glass.dispose();
  }, [materials, die]);

  useEffect(() => {
    /* the garnet dye's absorption per unit of glass, in linear colour */
    const c = new THREE.Color(GARNET_DYE);
    uniforms.uAbsorb.value.set(-Math.log(c.r) / DYE_DISTANCE, -Math.log(c.g) / DYE_DISTANCE, -Math.log(c.b) / DYE_DISTANCE);
    /* the glass only covers a few hundred pixels of a window-sized canvas,
       so what is seen through it needs far fewer than the full resolution */
    gl.transmissionResolutionScale = lowPower ? 0.4 : 0.6;
  }, [uniforms, gl, lowPower]);

  return (
    <>
      <Table bounds={bounds} textures={textures} materials={materials} />
      {/* order matters: frame callbacks run in mount order, and the
          reflection must be drawn after the die has moved this frame */}
      <Die sim={sim} die={die} bounds={bounds} uniforms={uniforms} {...props} />
      <Reflections die={die} bounds={bounds} uniforms={uniforms} materials={materials} scale={lowPower ? 0.35 : 0.5} />
    </>
  );
}

export default function DiceScene({api, frameRef, onResult, onPhase, onImpact, onReady, visible, reducedMotion, lowPower}) {
  const [aspect, setAspect] = useState(1.6);
  const [active, setActive] = useState(true);
  const bounds = useMemo(() => boundsFor(aspect), [aspect]);

  /* The mat's shape still follows the hero frame, not the window. */
  useEffect(() => {
    const el = frameRef?.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width && r.height) setAspect(Math.round((r.width / r.height) * 20) / 20);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frameRef]);

  /* Render continuously only while something is happening on screen. */
  const frameloop = !visible ? 'never' : active ? 'always' : 'demand';
  /* A window-sized canvas is a lot more pixels than the old frame-sized one,
     and glass costs a second pass, so the pixel ratio is held lower here. */
  const maxDpr = lowPower ? 1.25 : 1.5;

  const scene = (
    <div className="dice-canvas-wrap" aria-hidden="true">
      <Canvas
        frameloop={frameloop}
        dpr={[1, Math.min(maxDpr, window.devicePixelRatio || 1)]}
        gl={{antialias: true, alpha: true, powerPreference: 'high-performance'}}
        camera={{fov: FOV, near: 0.5, far: 400, position: [0, 8, 6]}}
        onCreated={({gl}) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.3;
          /* see-through: the mat floats on the page, with no box around it */
          gl.setClearColor('#000000', 0);
        }}
        aria-hidden="true"
      >
        <Suspense fallback={null}>
          <CameraRig bounds={bounds} frameRef={frameRef} />
          <Atmosphere />
          <World
            bounds={bounds}
            lowPower={lowPower}
            api={api}
            onResult={onResult}
            onPhase={onPhase}
            onImpact={onImpact}
            onActivity={setActive}
            reducedMotion={reducedMotion}
          />
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );

  /* On the page itself, not inside the hero, so nothing clips the die as it
     is carried away from the table. */
  return createPortal(scene, document.body);
}

function Ready({onReady}) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return null;
}
