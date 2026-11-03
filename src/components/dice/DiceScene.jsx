/* The hero's tabletop: one glass die from the game, on the game's own table,
   with real rigid-body physics. Loaded lazily, after the page has painted.

   The die's result is READ from its orientation once it has settled — the
   face whose normal points most nearly straight up — never chosen first. */
import {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {Canvas, useFrame, useLoader, useThree} from '@react-three/fiber';
import {Physics, RigidBody, CuboidCollider, RoundCuboidCollider} from '@react-three/rapier';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {assetUrl} from '../../assetUrl.js';

/* Rapier body types (RigidBodyType in @dimforge/rapier3d-compat). */
const DYNAMIC = 0;
const KINEMATIC = 2;

const GRAVITY = -26;      // heavier than real: a 1-unit die under 9.8 falls like a balloon
const LIFT = 2.5;         // how high a held die is raised above the table
const LIFT_MIN = 1.4;     // lowest it dips, to stay in view over the back rail
const SETTLE_SPEED = 0.06;
const SETTLE_TIME = 0.35; // seconds below SETTLE_SPEED before a result is read
const FLAT_ENOUGH = 0.9;  // cos of ~25 degrees; less than this and the die is leaning
const MAX_THROW = 15;
const ELEVATION = THREE.MathUtils.degToRad(52);
const FOV = 30;

/* Garnet, the colour the model is authored in. The dye and glass settings are
   the game's own (runtime/dice-3d.js: BROWSER_GLASS and the calibrated dye). */
const GARNET = '#bd4055';
const GARNET_DYE = '#dd1737';

/* Face values by local normal, as exported (assets/models/dice/glass_die.faces.json).
   Opposite faces sum to seven. Replaced at load by the model's own Face_N nodes. */
const FACE_TABLE = [
  [1, [0, 1, 0]], [2, [0, 0, -1]], [3, [1, 0, 0]],
  [4, [-1, 0, 0]], [5, [0, 0, 1]], [6, [0, -1, 0]],
];

export function boundsFor(aspect) {
  const halfZ = 1.75;
  const halfX = THREE.MathUtils.clamp(halfZ * aspect * 0.95, 1.75, 4.2);
  return {halfX, halfZ};
}

/* ---------- table ----------
   A card-table mat: navy velvet baize, the cloth of the round table in
   Morrow's parlour, inside walnut rails with a brass inlay, floating on the
   page with nothing around it. The rails stand exactly
   where the invisible walls are, so every bounce has something to hit.
   Textures are painted at load, so nothing extra is downloaded. */
const RAIL = 0.55;
const RAIL_H = 0.42;

function canvasTexture(w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
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

function Table({bounds}) {
  const {halfX, halfZ} = bounds;
  /* one painting stretched over the cloth: tiling showed a seam */
  const velvet = useMemo(() => canvasTexture(1024, 640, paintVelvet), []);
  const walnut = useMemo(() => canvasTexture(1024, 256, paintWalnut), []);
  useEffect(() => () => { velvet.dispose(); walnut.dispose(); }, [velvet, walnut]);

  const outerX = halfX + RAIL;
  const rails = [
    {pos: [0, RAIL_H / 2, -halfZ - RAIL / 2], size: [outerX * 2, RAIL_H, RAIL], inlay: [0, RAIL_H + 0.004, -halfZ - 0.1], inlaySize: [halfX * 2 + 0.2, 0.012, 0.045]},
    {pos: [0, RAIL_H / 2, halfZ + RAIL / 2], size: [outerX * 2, RAIL_H, RAIL], inlay: [0, RAIL_H + 0.004, halfZ + 0.1], inlaySize: [halfX * 2 + 0.2, 0.012, 0.045]},
    {pos: [-halfX - RAIL / 2, RAIL_H / 2, 0], size: [RAIL, RAIL_H, halfZ * 2], inlay: [-halfX - 0.1, RAIL_H + 0.004, 0], inlaySize: [0.045, 0.012, halfZ * 2 + 0.2]},
    {pos: [halfX + RAIL / 2, RAIL_H / 2, 0], size: [RAIL, RAIL_H, halfZ * 2], inlay: [halfX + 0.1, RAIL_H + 0.004, 0], inlaySize: [0.045, 0.012, halfZ * 2 + 0.2]},
  ];

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[halfX * 2 + 0.1, halfZ * 2 + 0.1]} />
        <meshStandardMaterial map={velvet} roughness={0.95} metalness={0} color="#a3acd6" />
      </mesh>
      {rails.map((r, i) => (
        <group key={i}>
          <mesh position={r.pos}>
            <boxGeometry args={r.size} />
            <meshStandardMaterial map={walnut} roughness={0.42} metalness={0.05} color="#d8b490" />
          </mesh>
          <mesh position={r.inlay}>
            <boxGeometry args={r.inlaySize} />
            <meshStandardMaterial color="#d6aa62" metalness={1} roughness={0.3} />
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
  return (
    <>
      <ambientLight intensity={0.18} color="#ffdcb0" />
      {/* the lamp: warm, from above and to the left, pooling on the cloth */}
      <spotLight position={[-3, 8, 3]} angle={0.7} penumbra={0.9} intensity={520} decay={2} color="#ffc98a" />
      {/* a cool rim from behind, to draw the glass edges */}
      <directionalLight position={[3, 4, -6]} intensity={1.1} color="#9fb6ff" />
      {/* a hard little glint, the candle catching the glass */}
      <pointLight position={[1.5, 5.5, 4.5]} intensity={22} distance={14} decay={2} color="#fff1d6" />
    </>
  );
}

/* Soft shadow and the coloured light the glass throws onto the cloth. Both are
   cheap textured quads that follow the die; neither costs a shadow pass. */
function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- the die ---------- */
function useGlassDie() {
  const gltf = useLoader(GLTFLoader, assetUrl('models/glass_die.glb'));
  return useMemo(() => {
    const model = gltf.scene.clone(true);
    /* The "v1 Dense" look signed off on 30 Oct 2026 (APPROVED_LOOK in the
       game's runtime/dice-3d.js): deep dye and a strong clearcoat, which
       reads as glass over a dark cloth where clearer glass reads as black. */
    const glass = new THREE.MeshPhysicalMaterial({
      color: GARNET, transmission: 0.9, thickness: 1.8,
      attenuationDistance: 1.4, attenuationColor: new THREE.Color(GARNET_DYE),
      roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
      ior: 1.5, envMapIntensity: 3.3, specularIntensity: 1, specularColor: new THREE.Color('#ffffff'),
    });
    model.traverse(o => {
      if (o.isMesh && /GlassBody/i.test(o.material?.name || o.name)) o.material = glass;
    });
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
    const faceNormals = faces.length === 6
      ? faces
      : FACE_TABLE.map(([value, n]) => ({value, normal: new THREE.Vector3(...n)}));
    return {model, glass, faceNormals};
  }, [gltf]);
}

export function topFace(quaternion, faceNormals) {
  const up = new THREE.Vector3(0, 1, 0);
  let best = null;
  for (const f of faceNormals) {
    const d = f.normal.clone().applyQuaternion(quaternion).dot(up);
    if (!best || d > best.dot) best = {value: f.value, dot: d};
  }
  return best;
}

function Die({bounds, api, onResult, onPhase, onImpact, onActivity, reducedMotion}) {
  const body = useRef();
  const {model, glass, faceNormals} = useGlassDie();
  const {camera, gl, invalidate} = useThree();
  const shadow = useRef();
  const glow = useRef();
  const shadowTex = useMemo(() => radialTexture('rgba(0,0,0,0.78)', 'rgba(0,0,0,0)'), []);
  const glowTex = useMemo(() => radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), []);

  /* Everything the frame loop reads lives in one mutable record: React state
     would re-render the physics body every frame. */
  const s = useRef({
    held: false, hover: false, target: new THREE.Vector3(), heldPos: new THREE.Vector3(),
    samples: [], spin: new THREE.Euler(), still: 0, reported: true, nudges: 0,
    lastV: new THREE.Vector3(), lastW: new THREE.Vector3(), lastSound: 0, settledAt: 0,
  }).current;

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  function clampToTable(v, margin = 0.62) {
    v.x = THREE.MathUtils.clamp(v.x, -bounds.halfX + margin, bounds.halfX - margin);
    v.z = THREE.MathUtils.clamp(v.z, -bounds.halfZ + margin, bounds.halfZ - margin);
    return v;
  }
  /* A held die is raised high over the spot the pointer marks on the cloth,
     so its shadow sits under the cursor or finger and the die floats above
     it. Over the back of the table it dips just enough to stay in view. */
  function pointerToTable(clientX, clientY) {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return liftOver(clampToTable(hit));
  }
  function liftOver(v) {
    const p = new THREE.Vector3();
    for (v.y = LIFT; v.y > LIFT_MIN; v.y -= 0.1) {
      if (p.copy(v).project(camera).y < 0.8) break;
    }
    return v;
  }

  function startRolling() {
    s.still = 0;
    s.reported = false;
    s.nudges = 0;
    onPhase('rolling');
    onActivity(true);
  }

  function grab(e) {
    const b = body.current;
    if (!b || s.held) return;
    e.stopPropagation();
    s.held = true;
    s.touch = e.pointerType === 'touch';
    const t = b.translation();
    s.heldPos.set(t.x, t.y, t.z);
    liftOver(s.target.set(t.x, 0, t.z));
    s.samples = [];
    const q = b.rotation();
    s.spin.setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    b.setBodyType(KINEMATIC, true);
    api.unlockSound();
    onPhase('held');
    onActivity(true);
    invalidate();
    document.body.classList.add('die-held');
  }

  function release() {
    const b = body.current;
    if (!b || !s.held) return;
    s.held = false;
    document.body.classList.remove('die-held');
    /* Velocity from the last ~90ms of hand movement, not the last frame,
       so a flick reads as a throw and a jittery finger does not. */
    const now = performance.now();
    const recent = s.samples.filter(p => now - p.t < 90);
    const v = new THREE.Vector3();
    if (recent.length >= 2) {
      const a = recent[0], z = recent[recent.length - 1];
      const dt = Math.max(0.016, (z.t - a.t) / 1000);
      v.set((z.x - a.x) / dt, (z.y - a.y) / dt, (z.z - a.z) / dt);
    }
    if (v.length() > MAX_THROW) v.setLength(MAX_THROW);
    if (reducedMotion) v.multiplyScalar(0.5);
    b.setBodyType(DYNAMIC, true);
    b.setLinvel({x: v.x, y: Math.min(v.y, 2) - 1, z: v.z}, true);
    /* Roll the way it is thrown: spin about the horizontal axis square to the
       travel (as the game's dice do), plus a little wobble so a straight drop
       still turns over. */
    const axis = new THREE.Vector3(v.z, 0, -v.x);
    const spin = axis.multiplyScalar(1.1);
    const wobble = reducedMotion ? 1.5 : 4;
    b.setAngvel({
      x: spin.x + (Math.random() - 0.5) * wobble,
      y: (Math.random() - 0.5) * wobble,
      z: spin.z + (Math.random() - 0.5) * wobble,
    }, true);
    startRolling();
  }

  /* Pointer movement is tracked on the window while held, so a throw that
     leaves the canvas still lands. */
  useEffect(() => {
    const move = e => {
      if (!s.held) return;
      const p = pointerToTable(e.clientX, e.clientY);
      if (p) s.target.copy(p);
    };
    const up = () => release();
    /* While a finger holds the die the page must not scroll under it. */
    const touchMove = e => { if (s.held) e.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    window.addEventListener('touchmove', touchMove, {passive: false});
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      window.removeEventListener('touchmove', touchMove);
    };
  });

  /* The keyboard-friendly alternative: toss the die in from one side. */
  useEffect(() => {
    api.roll = () => {
      const b = body.current;
      if (!b || s.held) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (bounds.halfX - 0.9);
      const z = (Math.random() - 0.5) * bounds.halfZ;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
      b.setBodyType(DYNAMIC, true);
      b.setTranslation({x, y: reducedMotion ? 1.4 : 2.6, z}, true);
      b.setRotation(q, true);
      const speed = reducedMotion ? 3.5 : 7 + Math.random() * 3.5;
      b.setLinvel({x: -side * speed, y: reducedMotion ? 0 : 1.5, z: -z * 0.8}, true);
      const turn = reducedMotion ? 4 : 14;
      b.setAngvel({x: (Math.random() - 0.5) * turn, y: (Math.random() - 0.5) * turn * 0.6, z: side * turn * (0.6 + Math.random() * 0.4)}, true);
      api.unlockSound();
      startRolling();
      invalidate();
    };
    /* Read-only snapshot for the automated checks in scripts/check-site.mjs:
       where the die is on screen, how it is turned, and what is face up. */
    api.inspect = () => {
      const b = body.current;
      if (!b) return null;
      const t = b.translation(), r = b.rotation();
      const p = new THREE.Vector3(t.x, t.y, t.z).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      return {
        position: [t.x, t.y, t.z], quaternion: [r.x, r.y, r.z, r.w],
        screen: [rect.left + (p.x + 1) / 2 * rect.width, rect.top + (1 - p.y) / 2 * rect.height],
        sleeping: b.isSleeping(), held: s.held, settled: s.reported,
        top: topFace(q, faceNormals), bounds,
        faceNormals: faceNormals.map(f => ({value: f.value, normal: f.normal.toArray()})),
      };
    };
    return () => { api.roll = null; api.inspect = null; };
  }, [api, bounds, reducedMotion, invalidate, camera, gl, faceNormals]);

  useFrame((state, dt) => {
    const b = body.current;
    if (!b) return;
    const t = b.translation();

    if (s.held) {
      /* Ease toward the hand rather than snapping to it. */
      const k = 1 - Math.exp(-dt * 16);
      s.heldPos.lerp(s.target, k);
      b.setNextKinematicTranslation(s.heldPos);
      s.spin.x += dt * 0.9;
      s.spin.z += dt * 0.6;
      const dx = s.target.x - s.heldPos.x, dz = s.target.z - s.heldPos.z;
      const q = new THREE.Quaternion().setFromEuler(s.spin)
        .premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dz * 0.25, 0, -dx * 0.25)));
      b.setNextKinematicRotation(q);
      s.samples.push({t: performance.now(), x: s.heldPos.x, y: s.heldPos.y, z: s.heldPos.z});
      if (s.samples.length > 12) s.samples.shift();
    } else {
      const v = b.linvel(), w = b.angvel();
      const vv = new THREE.Vector3(v.x, v.y, v.z), ww = new THREE.Vector3(w.x, w.y, w.z);

      /* A strike is a sudden change of velocity — gravity alone changes it by
         under half a unit a frame, so anything well past that is a contact. */
      const dv = vv.distanceTo(s.lastV);
      const now = performance.now();
      if (dv > 1.4 && now - s.lastSound > 55) {
        s.lastSound = now;
        onImpact(Math.min(1, (dv - 1.2) / 10));
      }
      s.lastV.copy(vv);
      s.lastW.copy(ww);

      /* Never lose the die: anything outside the table drops back to centre. */
      const lost = !Number.isFinite(t.x) || Math.abs(t.x) > bounds.halfX + 1.5
        || Math.abs(t.z) > bounds.halfZ + 1.5 || t.y < -1 || t.y > 12;
      if (lost) {
        b.setTranslation({x: 0, y: 2.4, z: 0}, true);
        b.setLinvel({x: 0, y: 0, z: 0}, true);
        startRolling();
      }

      if (!s.reported) {
        const speed = vv.length() + ww.length() * 0.35;
        s.still = speed < SETTLE_SPEED || b.isSleeping() ? s.still + dt : 0;
        if (s.still > SETTLE_TIME) {
          const r = b.rotation();
          const top = topFace(new THREE.Quaternion(r.x, r.y, r.z, r.w), faceNormals);
          if (top.dot >= FLAT_ENOUGH || s.nudges >= 4) {
            s.reported = true;
            s.settledAt = now;
            onResult(top.value);
            onPhase('settled');
          } else {
            /* Leaning on an edge or a wall: give it a gentle tap, as a
               croupier would, rather than announce a face that is not up. */
            s.nudges++;
            s.still = 0;
            b.applyImpulse({x: -t.x * 0.08, y: 1.6, z: -t.z * 0.08}, true);
            b.applyTorqueImpulse({x: (Math.random() - 0.5) * 0.3, y: 0, z: (Math.random() - 0.5) * 0.3}, true);
          }
        }
      } else if (s.settledAt && now - s.settledAt > 1200 && !s.hover) {
        s.settledAt = 0;
        onActivity(false);
      }
    }

    /* Shadow and glow follow the die and soften as it rises. */
    const h = Math.max(0, t.y - 0.5);
    if (shadow.current) {
      shadow.current.position.set(t.x + 0.12, 0.012, t.z + 0.1);
      const sc = 1.55 + h * 0.15;
      shadow.current.scale.set(sc, sc, 1);
      shadow.current.material.opacity = 0.85 / (1 + h * 0.3);
    }
    if (glow.current) {
      glow.current.position.set(t.x + 0.35, 0.014, t.z + 0.45);
      const sc = 2.3 + h * 0.4;
      glow.current.scale.set(sc, sc, 1);
      glow.current.material.opacity = (s.hover || s.held ? 0.62 : 0.42) / (1 + h * 0.8);
    }
  });

  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        position={[0.4, 0.5, 0.3]}
        rotation={[0, 0.5, 0]}
        linearDamping={0.12}
        angularDamping={0.35}
        ccd
        canSleep
      >
        <RoundCuboidCollider args={[0.38, 0.38, 0.38, 0.12]} restitution={0.3} friction={0.55} density={2.4} />
        <primitive
          object={model}
          scale={0.5}
          onPointerDown={grab}
          onPointerOver={e => { e.stopPropagation(); s.hover = true; document.body.classList.add('die-hover'); onActivity(true); invalidate(); }}
          onPointerOut={() => { s.hover = false; document.body.classList.remove('die-hover'); invalidate(); }}
        />
      </RigidBody>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
      <mesh ref={glow} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glowTex} color={GARNET} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

/* Fixed walls: the table, four invisible sides and a lid, so nothing can
   leave the scene however hard it is thrown. */
function Bounds({bounds}) {
  const {halfX, halfZ} = bounds;
  const H = 6;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfX + 2, 0.5, halfZ + 2]} position={[0, -0.5, 0]} restitution={0.28} friction={0.7} />
      <CuboidCollider args={[0.5, H, halfZ + 2]} position={[-halfX - 0.5, H, 0]} restitution={0.4} friction={0.2} />
      <CuboidCollider args={[0.5, H, halfZ + 2]} position={[halfX + 0.5, H, 0]} restitution={0.4} friction={0.2} />
      <CuboidCollider args={[halfX + 2, H, 0.5]} position={[0, H, -halfZ - 0.5]} restitution={0.4} friction={0.2} />
      <CuboidCollider args={[halfX + 2, H, 0.5]} position={[0, H, halfZ + 0.5]} restitution={0.4} friction={0.2} />
      <CuboidCollider args={[halfX + 2, 0.5, halfZ + 2]} position={[0, H * 1.4, 0]} />
    </RigidBody>
  );
}

/* Frame the whole mat, rails and all, with a margin, since it floats on the
   page and any cut edge would show; plus headroom above the back rail so a
   raised die stays in view. */
function CameraRig({bounds}) {
  const {camera, size} = useThree();
  useEffect(() => {
    const ox = bounds.halfX + RAIL, oz = bounds.halfZ + RAIL;
    const points = [
      ...[-1, 1].flatMap(sx => [-1, 1].flatMap(sz => [0, RAIL_H].map(y => new THREE.Vector3(sx * ox, y, sz * oz)))),
      new THREE.Vector3(0, LIFT + 0.3, -bounds.halfZ + 0.62),
    ];
    const p = new THREE.Vector3();
    camera.fov = FOV;
    camera.aspect = size.width / Math.max(1, size.height);
    for (let d = 7.5; d < 40; d += 0.1) {
      camera.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
      camera.lookAt(0, 0.55, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      if (points.every(v => { p.copy(v).project(camera); return Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.94; })) break;
    }
  }, [camera, size, bounds]);
  return null;
}

export default function DiceScene({api, onResult, onPhase, onImpact, onReady, visible, reducedMotion, lowPower}) {
  const wrap = useRef();
  const [aspect, setAspect] = useState(1.6);
  const [active, setActive] = useState(true);
  const bounds = useMemo(() => boundsFor(aspect), [aspect]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width && r.height) setAspect(Math.round((r.width / r.height) * 20) / 20);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Render continuously only while something is happening on screen. */
  const frameloop = !visible ? 'never' : active ? 'always' : 'demand';
  const maxDpr = lowPower ? 1.5 : 2;

  return (
    <div ref={wrap} className="dice-canvas-wrap">
      <Canvas
        frameloop={frameloop}
        dpr={[1, Math.min(maxDpr, window.devicePixelRatio || 1)]}
        gl={{antialias: true, alpha: true, powerPreference: 'high-performance'}}
        camera={{fov: FOV, near: 0.5, far: 60, position: [0, 8, 6]}}
        onCreated={({gl}) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.3;
          /* see-through: the mat floats on the page, with no box around it */
          gl.setClearColor('#000000', 0);
        }}
        aria-hidden="true"
      >
        <Suspense fallback={null}>
          <CameraRig bounds={bounds} />
          <Atmosphere />
          <Table bounds={bounds} />
          <Physics gravity={[0, GRAVITY, 0]} paused={!visible} timeStep={1 / 60}>
            <Bounds key={`${bounds.halfX}-${bounds.halfZ}`} bounds={bounds} />
            <Die
              bounds={bounds}
              api={api}
              onResult={onResult}
              onPhase={onPhase}
              onImpact={onImpact}
              onActivity={setActive}
              reducedMotion={reducedMotion}
            />
          </Physics>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Ready({onReady}) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return null;
}
