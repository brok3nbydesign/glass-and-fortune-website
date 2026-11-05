/* The glass die's physics, with no React and no rendering in it, so the
   website and the test harness (scripts/die-physics-test.mjs) run exactly
   the same simulation.

   Rapier (@dimforge/rapier3d-compat) does the rigid-body work. Everything
   here is ordinary physics configuration plus one "hand" — the spring a
   visitor holds the die by. There is no scripted motion: no snapping, no
   nudging, no teleporting on release, no invisible walls.

   Units: the die is 1 unit on a side. World Y is up, the glass top of the
   mat is the plane y = 0. */
import * as THREE from 'three';

/* ---------- the die ----------
   The model is a 2-unit cube with 0.24 rounded edges (ten segments), shown
   at half scale. A Rapier round cuboid IS that shape — a box swept by a
   sphere — so the collider is not an approximation: measured against the
   GLB, its edges and corners agree to within float error. The only parts of
   the mesh off that surface are the pip wells, 0.03 deep at this scale, and
   those cannot touch a flat table anyway. */
export const DIE = {
  half: 0.5,
  radius: 0.12,
  density: 2.5, // soda-lime glass, g/cm3; mass and inertia follow from the shape
};

export const PHYS = {
  gravity: -30,           // a 1-unit die under 9.8 would fall like a balloon
  dt: 1 / 120,            // fixed step, whatever the display's frame rate
  maxSteps: 30,           // catch-up allowed per rendered frame (0.25 s): one body
                          // costs microseconds a step, so even a 4 fps machine
                          // runs the die in real time rather than slow motion
  solverIterations: 8,
  prediction: 0.2,
  linearDamping: 0.02,    // air only; energy is lost to contacts, not drag
  angularDamping: 0.05,
};

/* The mat is velvet under a sheet of glass (that is what reflects the die),
   framed by lacquered walnut rails. Coefficients are the PAIR values for
   glass die against each surface: the die's own coefficients are 1 and
   combine by multiplication. The sheet sits on velvet, which soaks up some
   of each strike, so it is less lively than glass on stone. */
export const SURFACES = {
  glass: {friction: 0.42, restitution: 0.32},
  wood: {friction: 0.4, restitution: 0.42},
};

/* The rails are real: the die can hit them, ride up them, rest on top of them
   or tip over them. 0.8 tall — a little under the die — is the lowest that
   keeps an ordinary throw on the mat (measured with the test bench: at the
   old 0.42 a die rolling into the rail simply hops over it). */
export const RAIL = {width: 0.55, height: 0.8};

/* Hand: how firmly a visitor holds the die. */
export const HAND = {
  holdY: 1.3,        // carried height of the die's centre over the mat
  stiffness: 520,    // spring, per unit mass (natural frequency ~23 rad/s)
  damping: 36,       // just under critical, so a sharp stop leaves a little sway
  maxAccel: 380,     // the spring's strongest pull, so a far target is a swing, not a launch
  gripStiffness: 400, // how firmly the fingers hold its orientation; softer and it
  gripDamping: 34,     // swings about the grabbed point and a level flick lobs it upward
  rollOff: 0.2,      // spin from the die rolling off the fingertips on a throw
  maxThrow: 8.5,     // soft limit (tanh), so a harder flick is always a bit stronger
  maxSpin: 26,
};

export function boundsFor(aspect) {
  const halfZ = 1.75;
  const halfX = THREE.MathUtils.clamp(halfZ * aspect * 0.95, 1.75, 4.2);
  return {halfX, halfZ};
}

/* Every solid part of the mat, shared by the colliders and the meshes so the
   two can never disagree. The glass top only covers the inside of the rails;
   the rails stand on it. Past the rails' outer edges there is nothing. */
export function tableParts({halfX, halfZ}) {
  const W = RAIL.width, H = RAIL.height;
  const outerX = halfX + W;
  return [
    {kind: 'glass', center: [0, -0.15, 0], half: [halfX, 0.15, halfZ]},
    {kind: 'wood', rail: 'back', center: [0, H / 2, -halfZ - W / 2], half: [outerX, H / 2, W / 2]},
    {kind: 'wood', rail: 'front', center: [0, H / 2, halfZ + W / 2], half: [outerX, H / 2, W / 2]},
    {kind: 'wood', rail: 'left', center: [-halfX - W / 2, H / 2, 0], half: [W / 2, H / 2, halfZ]},
    {kind: 'wood', rail: 'right', center: [halfX + W / 2, H / 2, 0], half: [W / 2, H / 2, halfZ]},
  ];
}

export function footprint({halfX, halfZ}) {
  return {x: halfX + RAIL.width, z: halfZ + RAIL.width};
}

/* Deterministic random numbers for the Roll button and the tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomQuaternion(rand) {
  /* uniform over all orientations (Shoemake) */
  const u1 = rand(), u2 = rand() * Math.PI * 2, u3 = rand() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return new THREE.Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/* Scale a vector's length through tanh: unchanged when small, never past max. */
function softLimit(vec, max) {
  const l = vec.length();
  if (l > 1e-9) vec.multiplyScalar(max * Math.tanh(l / max) / l);
  return vec;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/* The simulation: one world, one die, the mat. */
export function createDieSim(RAPIER, {bounds, position = [0.4, DIE.half, 0.3], rotation = [0, 0.24, 0, 0.97]} = {}) {
  const world = new RAPIER.World({x: 0, y: PHYS.gravity, z: 0});
  world.timestep = PHYS.dt;
  world.integrationParameters.numSolverIterations = PHYS.solverIterations;
  /* Contacts are created this far (x die size) before surfaces touch, and
     solved so the gap closes exactly. With Rapier's default (0.002) a die
     striking at 9 u/s travels 0.075 in one step and sinks that far into the
     glass before anything pushes back; measured, this takes the worst
     penetration from 0.08 to 0.003 and removes the false "pop" bounces. */
  world.integrationParameters.normalizedPredictionDistance = PHYS.prediction;

  const q0 = new THREE.Quaternion(...rotation).normalize();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setRotation({x: q0.x, y: q0.y, z: q0.z, w: q0.w})
      .setLinearDamping(PHYS.linearDamping)
      .setAngularDamping(PHYS.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(true),
  );
  const inner = DIE.half - DIE.radius;
  const collider = world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(inner, inner, inner, DIE.radius)
      .setDensity(DIE.density)
      .setFriction(1)
      .setRestitution(1)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply),
    body,
  );
  const mass = body.mass();
  /* A uniform cube's inertia is m·a²/6 about every axis through its centre,
     so one number serves for the hand's grip. */
  const inertia = mass * (2 * DIE.half) ** 2 / 6;

  let table = null;
  const kinds = new Map();
  function setBounds(b) {
    if (table) world.removeRigidBody(table);
    kinds.clear();
    table = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const p of tableParts(b)) {
      const s = SURFACES[p.kind];
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(...p.half)
          .setTranslation(...p.center)
          .setFriction(s.friction)
          .setRestitution(s.restitution),
        table,
      );
      kinds.set(c.handle, p.kind);
    }
    sim.bounds = b;
    body.wakeUp();
  }

  /* ---------- the hand ----------
     Held, the die is still a dynamic body. A damped spring pulls the point
     that was grabbed towards the pointer, and the fingers resist turning, so
     it lags, sways and tips a little as it is swung about, it still collides
     with the rails and the glass (it cannot be pushed through them), and on
     release it simply keeps the velocity it has. */
  const hand = {
    held: false,
    local: new THREE.Vector3(),        // grabbed point, in the die's frame
    grip: new THREE.Quaternion(),      // orientation the fingers hold
    from: new THREE.Vector3(),         // target at the start of this frame
    to: new THREE.Vector3(),           // target at the end of it
    target: new THREE.Vector3(),
    targetVel: new THREE.Vector3(),
    samples: [],                       // [time, x, y, z] of the pointer target
  };

  function grab(worldPoint) {
    const t = body.translation(), r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    hand.local.set(worldPoint.x - t.x, worldPoint.y - t.y, worldPoint.z - t.z)
      .applyQuaternion(_q2.copy(_q).invert());
    hand.grip.copy(_q);
    hand.from.copy(worldPoint);
    hand.to.copy(worldPoint);
    hand.target.copy(worldPoint);
    hand.targetVel.set(0, 0, 0);
    hand.samples = [[sim.time, worldPoint.x, worldPoint.y, worldPoint.z]];
    hand.held = true;
    body.setGravityScale(1, true);
    body.wakeUp();
  }

  /* Where the grabbed point should be by the end of the coming frame. */
  function setTarget(p) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    hand.from.copy(hand.to);
    hand.to.copy(p);
  }

  /* Let go: the die keeps the velocity the hand gave it. A thrown die also
     rolls off the fingertips, which turns it over the way it is travelling;
     that spin is added in proportion to the throw, about the horizontal axis
     square to it. Nothing random. */
  function release({scale = 1} = {}) {
    if (!hand.held) return;
    hand.held = false;
    const v = body.linvel(), w = body.angvel();
    _v.set(v.x, v.y, v.z).multiplyScalar(scale);
    softLimit(_v, HAND.maxThrow);
    _w.set(_v.z, 0, -_v.x).multiplyScalar(HAND.rollOff / DIE.half * scale);
    _w.x += w.x * scale; _w.y += w.y * scale; _w.z += w.z * scale;
    softLimit(_w, HAND.maxSpin);
    body.setLinvel({x: _v.x, y: _v.y, z: _v.z}, true);
    body.setAngvel({x: _w.x, y: _w.y, z: _w.z}, true);
    return {linvel: _v.toArray(), angvel: _w.toArray()};
  }

  function applyHand(frac) {
    /* the target moves smoothly across the frame's steps, so a 30 fps
       display pulls the same way a 144 fps one does */
    hand.target.lerpVectors(hand.from, hand.to, frac);
    const s = hand.samples;
    s.push([sim.time, hand.target.x, hand.target.y, hand.target.z]);
    while (s.length > 2 && sim.time - s[1][0] > 0.06) s.shift();
    const a = s[0], z = s[s.length - 1];
    const span = z[0] - a[0];
    if (span > 1e-4) hand.targetVel.set((z[1] - a[1]) / span, (z[2] - a[2]) / span, (z[3] - a[3]) / span);

    const t = body.translation(), r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const p = _v.copy(hand.local).applyQuaternion(_q).add(t);
    const pv = body.velocityAtPoint(p);
    const acc = _w.set(
      HAND.stiffness * (hand.target.x - p.x) + HAND.damping * (hand.targetVel.x - pv.x),
      HAND.stiffness * (hand.target.y - p.y) + HAND.damping * (hand.targetVel.y - pv.y),
      HAND.stiffness * (hand.target.z - p.z) + HAND.damping * (hand.targetVel.z - pv.z),
    );
    if (acc.length() > HAND.maxAccel) acc.setLength(HAND.maxAccel);
    const k = mass * PHYS.dt;
    body.applyImpulseAtPoint({x: acc.x * k, y: acc.y * k, z: acc.z * k}, {x: p.x, y: p.y, z: p.z}, true);
    /* the fingers carry its weight */
    body.applyImpulse({x: 0, y: -PHYS.gravity * k, z: 0}, true);
    /* and hold its orientation, springily */
    _q2.copy(hand.grip).multiply(_q.invert());
    if (_q2.w < 0) { _q2.x = -_q2.x; _q2.y = -_q2.y; _q2.z = -_q2.z; _q2.w = -_q2.w; }
    const sinHalf = Math.hypot(_q2.x, _q2.y, _q2.z);
    const angle = 2 * Math.atan2(sinHalf, _q2.w);
    const w = body.angvel();
    const ax = sinHalf > 1e-6 ? angle / sinHalf : 2;
    const kr = HAND.gripStiffness, cr = HAND.gripDamping, ki = inertia * PHYS.dt;
    body.applyTorqueImpulse({
      x: (kr * _q2.x * ax - cr * w.x) * ki,
      y: (kr * _q2.y * ax - cr * w.y) * ki,
      z: (kr * _q2.z * ax - cr * w.z) * ki,
    }, true);
  }

  /* ---------- strikes, for the sound ----------
     A strike is a change in the die's velocity that gravity and the hand did
     not cause: what is left is the table pushing back. Reported with which
     surface it hit, so glass on glass and glass on walnut sound different. */
  const lastV = new THREE.Vector3(), lastW = new THREE.Vector3();
  function surfaceTouched() {
    let kind = null;
    world.contactPairsWith(collider, other => { if (!kind) kind = kinds.get(other.handle) || null; });
    return kind;
  }

  const sim = {
    world, body, collider, hand, mass, bounds: null, time: 0, steps: 0, accumulator: 0,
    prev: {p: new THREE.Vector3(), q: new THREE.Quaternion()},
    curr: {p: new THREE.Vector3(), q: new THREE.Quaternion()},
    setBounds, grab, setTarget, release,

    /* One fixed step. Returns a strike, if there was one. */
    step(frac = 1) {
      if (hand.held) applyHand(frac);
      const v0 = body.linvel(), w0 = body.angvel();
      lastV.set(v0.x, v0.y, v0.z);
      lastW.set(w0.x, w0.y, w0.z);
      const gravityOn = !body.isSleeping();
      world.step();
      sim.time += PHYS.dt;
      sim.steps++;
      const v = body.linvel(), w = body.angvel();
      const dv = Math.hypot(v.x - lastV.x, v.y - lastV.y - (gravityOn ? PHYS.gravity * PHYS.dt : 0), v.z - lastV.z);
      const dw = Math.hypot(w.x - lastW.x, w.y - lastW.y, w.z - lastW.z) * DIE.half;
      const change = dv + 0.5 * dw;
      if (change > 0.35) return {change, surface: surfaceTouched() || 'glass', time: sim.time};
      return null;
    },

    /* Advance by a rendered frame's worth of time in fixed steps, keeping the
       last two states so the picture can be interpolated between them. */
    advance(frameDt, onStrike) {
      sim.accumulator = Math.min(sim.accumulator + Math.min(frameDt, PHYS.dt * PHYS.maxSteps), PHYS.dt * PHYS.maxSteps);
      const n = Math.floor(sim.accumulator / PHYS.dt + 1e-9);
      for (let i = 0; i < n; i++) {
        sim.snapshot(sim.prev);
        const strike = sim.step((i + 1) / n);
        if (strike && onStrike) onStrike(strike);
        sim.accumulator -= PHYS.dt;
      }
      if (n === 0 && hand.held) hand.from.copy(hand.to);
      sim.snapshot(sim.curr);
      if (n > 0 || !sim._init) { sim._init = true; }
      return sim.accumulator / PHYS.dt;
    },

    snapshot(out) {
      const t = body.translation(), r = body.rotation();
      out.p.set(t.x, t.y, t.z);
      out.q.set(r.x, r.y, r.z, r.w);
      return out;
    },

    /* Put the die somewhere directly (the Roll button and Morrow's fetch
       start a fresh throw; nothing moves it while it is in play). */
    place(p, q, linvel = [0, 0, 0], angvel = [0, 0, 0]) {
      hand.held = false;
      body.setTranslation({x: p[0], y: p[1], z: p[2]}, true);
      body.setRotation({x: q.x, y: q.y, z: q.z, w: q.w}, true);
      body.setLinvel({x: linvel[0], y: linvel[1], z: linvel[2]}, true);
      body.setAngvel({x: angvel[0], y: angvel[1], z: angvel[2]}, true);
      sim.snapshot(sim.prev);
      sim.snapshot(sim.curr);
    },

    /* A croupier's throw: from beside one rail, low, aimed to land on the
       cloth and tumble across it. The landing spot, speed and spin are
       random; what happens after that is physics. */
    rollThrow(rand = Math.random, {gentle = false} = {}) {
      const {halfX, halfZ} = sim.bounds;
      const side = rand() < 0.5 ? -1 : 1;
      const x0 = side * (halfX - 0.75), z0 = (rand() - 0.5) * halfZ;
      const y0 = gentle ? 1.2 : 1.5 + rand() * 0.5;
      const xl = side * (halfX * (0.05 + rand() * 0.35)), zl = (rand() - 0.5) * halfZ * 0.6;
      const speed = gentle ? 3.2 : 6 + rand() * 4;
      /* time of flight from the real horizontal distance, never so short that
         the aim needs a violent downward or sideways throw */
      const T = Math.max(0.24, Math.hypot(xl - x0, zl - z0) / speed);
      const vy = (DIE.half + 0.05 - y0 - 0.5 * PHYS.gravity * T * T) / T;
      const turn = gentle ? 5 : 12 + rand() * 10;
      const spinAxis = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.6, rand() - 0.5).normalize();
      sim.place([x0, y0, z0], randomQuaternion(rand),
        [(xl - x0) / T, vy, (zl - z0) / T],
        spinAxis.multiplyScalar(turn).toArray());
    },

    /* Morrow fetching it back: dropped from his hand over the middle. */
    fetchDrop(rand = Math.random, {gentle = false} = {}) {
      const turn = gentle ? 3 : 9;
      sim.place([(rand() - 0.5) * 0.8, gentle ? 1.6 : 2.8, (rand() - 0.5) * 0.8], randomQuaternion(rand),
        [0, -1, 0], [(rand() - 0.5) * turn, (rand() - 0.5) * turn, (rand() - 0.5) * turn]);
    },

    /* Is the die's centre over any part of the mat (rails included)? */
    overTable(p = body.translation()) {
      const f = footprint(sim.bounds);
      return Math.abs(p.x) <= f.x && Math.abs(p.z) <= f.z;
    },

    speed() {
      const v = body.linvel(), w = body.angvel();
      return {lin: Math.hypot(v.x, v.y, v.z), ang: Math.hypot(w.x, w.y, w.z)};
    },

    dispose() { world.free(); },
  };

  setBounds(bounds || boundsFor(1.6));
  sim.snapshot(sim.prev);
  sim.snapshot(sim.curr);
  return sim;
}

/* The face pointing most nearly straight up, from the die's orientation. */
export function topFace(quaternion, faceNormals) {
  let best = null;
  for (const f of faceNormals) {
    const d = _v.copy(f.normal).applyQuaternion(quaternion).y;
    if (!best || d > best.dot) best = {value: f.value, dot: d};
  }
  return best;
}

export const FACE_TABLE = [
  [1, [0, 1, 0]], [2, [0, 0, -1]], [3, [1, 0, 0]],
  [4, [-1, 0, 0]], [5, [0, 0, 1]], [6, [0, -1, 0]],
].map(([value, n]) => ({value, normal: new THREE.Vector3(...n)}));

/* The surface a held die is carried along, for a pointer ray. Over the mat
   it is a level plane at carrying height; past the back of the mat it turns
   straight up (pointing higher up the screen lifts the die rather than
   carrying it away behind the table, so it can be held high and dropped);
   past the front it turns straight down, in front of the mat. Continuous at
   both folds, so the die never jumps. `lift` is the grabbed point's height
   above the die's centre, so it is the centre that rides at holdY. */
export function carryPoint(origin, dir, bounds, lift, out) {
  const H = HAND.holdY + lift;
  const zBack = -bounds.halfZ + 0.75, zFront = bounds.halfZ + RAIL.width + 0.9;
  let t = Math.abs(dir.y) > 1e-6 ? (H - origin.y) / dir.y : -1;
  if (t > 0) {
    out.copy(dir).multiplyScalar(t).add(origin);
    if (out.z >= zBack && out.z <= zFront) return out;
  }
  /* back wall if the level-plane hit lies behind it (or the ray points up) */
  const zw = (t <= 0 || out.z < zBack) ? zBack : zFront;
  t = Math.abs(dir.z) > 1e-6 ? (zw - origin.z) / dir.z : 0;
  if (t <= 0) return out.copy(origin).addScaledVector(dir, 10);
  out.copy(dir).multiplyScalar(t).add(origin);
  out.y = Math.min(out.y, 9);
  return out;
}
