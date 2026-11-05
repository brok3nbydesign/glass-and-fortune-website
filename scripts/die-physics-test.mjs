/* Physics test bench for the website's glass die.

     npm run test:physics            all scenarios
     SEED=7 npm run test:physics     a different (but repeatable) set
     ONLY=edge npm run test:physics  one group, by name
     VERBOSE=1                       print every scenario

   Runs src/components/dice/diePhysics.js — the very module the website
   uses — headless in Node, with no rendering. Every scenario is seeded, so
   a failure can be replayed exactly. It measures, rather than eyeballs:

   - penetration into the glass and the rails (from Rapier's own contacts)
   - energy: after release nothing may ever gain energy
   - bounce: every bounce lower than the last
   - settling: time to rest, jitter once at rest, never stuck
   - outcome: flat on the glass, cocked, on a rail, or fallen off
   - edge and corner landings, overhang tipping, balance on an edge
   - the same throw at 30, 60, 90, 144 and 240 fps
   - nonsense input: teleporting pointers, long frame hitches, a die pushed
     into the table. */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  createDieSim, boundsFor, tableParts, footprint, mulberry32, randomQuaternion,
  topFace, FACE_TABLE, DIE, PHYS, RAIL, HAND, carryPoint,
} from '../src/components/dice/diePhysics.js';

await RAPIER.init();
const SEED = Number(process.env.SEED || 1);
const ONLY = process.env.ONLY || '';
const VERBOSE = !!process.env.VERBOSE;
const g = -PHYS.gravity;

const BOUNDS = {wide: boundsFor(2.2), mid: boundsFor(1.6), narrow: boundsFor(0.8)};

/* ---------- measuring one run ---------- */
function energy(sim) {
  const b = sim.body, v = b.linvel(), w = b.angvel(), t = b.translation();
  const I = sim.mass * (2 * DIE.half) ** 2 / 6;
  return 0.5 * sim.mass * (v.x * v.x + v.y * v.y + v.z * v.z) + 0.5 * I * (w.x * w.x + w.y * w.y + w.z * w.z) + sim.mass * g * t.y;
}

function deepestContact(sim) {
  let min = Infinity;
  sim.world.contactPairsWith(sim.collider, other => {
    sim.world.contactPair(sim.collider, other, m => {
      for (let i = 0; i < m.numContacts(); i++) min = Math.min(min, m.contactDist(i));
    });
  });
  return min;
}

function classify(sim, q) {
  const t = sim.body.translation();
  const b = sim.bounds;
  const top = topFace(q, FACE_TABLE);
  if (!sim.overTable(t) || t.y < -0.5) return {kind: 'fell', top};
  if (Math.abs(t.x) > b.halfX || Math.abs(t.z) > b.halfZ) return {kind: t.y > RAIL.height ? 'on-rail' : 'cocked-rail', top};
  if (top.dot < 0.9) return {kind: 'cocked', top};
  return {kind: 'flat', top};
}

/* Run the free simulation (no hand) until rest or timeout. */
function runFree(sim, {maxTime = 12, fps = 60} = {}) {
  const r = {
    maxPen: 0, energyGain: 0, apexes: [], strikes: 0, strikesBySurface: {}, settleTime: null,
    jitter: 0, slide: 0, nan: false, maxY: -Infinity, minY: Infinity, fellAt: null, falling: true,
  };
  let E = energy(sim), prevVy = sim.body.linvel().y, grounded = false, restAt = null;
  const restPos = new THREE.Vector3(), q = new THREE.Quaternion();
  let lastPos = null;
  const frame = 1 / fps;
  for (let t = 0; t < maxTime; t += frame) {
    sim.advance(frame, s => { r.strikes++; r.strikesBySurface[s.surface] = (r.strikesBySurface[s.surface] || 0) + 1; });
    const p = sim.body.translation(), v = sim.body.linvel(), w = sim.body.angvel();
    if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) { r.nan = true; break; }
    r.maxY = Math.max(r.maxY, p.y); r.minY = Math.min(r.minY, p.y);
    const pen = deepestContact(sim);
    if (pen < 0) r.maxPen = Math.max(r.maxPen, -pen);
    /* semi-implicit Euler carries a bounded energy error of about m·g·|v|·dt;
       anything beyond that is the solver adding energy */
    const E2 = energy(sim), slack = sim.mass * g * Math.hypot(v.x, v.y, v.z) * PHYS.dt;
    if (E2 > E + slack) r.energyGain = Math.max(r.energyGain, (E2 - E - slack) / Math.max(E, 1));
    E = Math.min(E, E2);
    /* apex of each bounce: vertical velocity turning from up to down, airborne */
    if (prevVy > 0.05 && v.y <= 0.05 && grounded) {
      const I = sim.mass * (2 * DIE.half) ** 2 / 6;
      r.apexes.push({y: p.y, spin: 0.5 * I * (w.x * w.x + w.y * w.y + w.z * w.z)});
    }
    if (p.y < DIE.half * 1.8) grounded = true;
    prevVy = v.y;
    /* sliding: travelling while barely turning, in contact with the glass */
    const lin = Math.hypot(v.x, v.z), ang = Math.hypot(w.x, w.y, w.z);
    if (lastPos && p.y < DIE.half + 0.02 && lin > 0.15 && ang < 0.4) r.slide += Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
    lastPos = {x: p.x, z: p.z};
    if (!sim.overTable(p) && p.y < -0.5 && r.fellAt == null) r.fellAt = t;
    if (r.fellAt != null && t - r.fellAt > 1.0) break; // keep watching it fall for a second
    const resting = sim.body.isSleeping() || (lin < 0.02 && Math.abs(v.y) < 0.02 && ang < 0.05);
    if (resting && sim.overTable(p)) {
      if (restAt == null) { restAt = t; restPos.set(p.x, p.y, p.z); }
      else r.jitter = Math.max(r.jitter, restPos.distanceTo(new THREE.Vector3(p.x, p.y, p.z)));
      if (t - restAt > 1.0) { r.settleTime = restAt; break; }
    } else if (restAt != null && t - restAt < 1.0) {
      /* moved again after looking still: count it as jitter, keep waiting */
      r.jitter = Math.max(r.jitter, restPos.distanceTo(new THREE.Vector3(p.x, p.y, p.z)));
      restAt = null;
    }
  }
  const rot = sim.body.rotation();
  q.set(rot.x, rot.y, rot.z, rot.w);
  r.outcome = classify(sim, q);
  r.sleeping = sim.body.isSleeping();
  r.final = sim.body.translation();
  /* when it fell, did it keep falling (not hang in the air)? */
  if (r.outcome.kind === 'fell') r.falling = sim.body.linvel().y < -3;
  return r;
}

/* Pick the die up at its current place, follow a pointer path, let go. */
function handThrow(sim, path, {fps = 60, hold = 0.25, scale = 1} = {}) {
  const t0 = sim.body.translation();
  /* grab the top of the die, as a pointer from above would */
  sim.grab(new THREE.Vector3(t0.x, t0.y + DIE.half * 0.9, t0.z));
  const frame = 1 / fps;
  const target = new THREE.Vector3();
  let maxPen = 0;
  const steps = Math.round((hold + path.duration) * fps);
  for (let i = 0; i <= steps; i++) {
    const time = i * frame;
    path.at(Math.max(0, time - hold), target);
    sim.setTarget(target);
    sim.advance(frame);
    const pen = deepestContact(sim);
    if (pen < 0) maxPen = Math.max(maxPen, -pen);
  }
  const rel = sim.release({scale});
  return {rel, maxPen};
}

/* A straight pointer path in world space over the carry surface. */
function linePath(a, b, duration, ease = t => t) {
  return {duration, at(t, out) { const k = ease(duration > 0 ? Math.min(1, t / duration) : 1); return out.lerpVectors(a, b, k); }};
}

/* ---------- scenarios ---------- */
const scenarios = [];
function add(group, name, fn, expect) { scenarios.push({group, name, fn, expect}); }
const R = mulberry32(SEED * 7919);
const rr = (a, b) => a + R() * (b - a);

function fresh(bounds = BOUNDS.mid) { return createDieSim(RAPIER, {bounds}); }
function qFromEuler(x, y, z) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); }
/* orientation with a body diagonal pointing straight down: lands on a corner */
function cornerDown(yaw) {
  const diag = new THREE.Vector3(1, 1, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(diag, new THREE.Vector3(0, -1, 0)).premultiply(qFromEuler(0, yaw, 0));
}

for (let i = 0; i < 10; i++) {
  const h = rr(0.6, 1.2), q = qFromEuler(rr(-0.1, 0.1), rr(0, 6.28), rr(-0.1, 0.1));
  const pos = [rr(-1, 1), h, rr(-0.8, 0.8)];
  add('gentle-drop', `flat from ${h.toFixed(2)}`, () => { const s = fresh(); s.place(pos, q); return s; }, {settle: true, onTable: true, maxApexRatio: 0.5});
}
for (let i = 0; i < 10; i++) {
  const h = rr(3, 6), q = randomQuaternion(R);
  const pos = [rr(-1, 1), h, rr(-0.6, 0.6)];
  add('high-drop', `random orientation from ${h.toFixed(1)}`, () => { const s = fresh(); s.place(pos, q, [0, 0, 0], [rr(-2, 2), rr(-2, 2), rr(-2, 2)]); return s; }, {settle: true, onTable: true});
}
for (let i = 0; i < 10; i++) {
  const tilt = rr(0.02, 0.12) * (i % 2 ? 1 : -1), h = rr(1, 3);
  const q = qFromEuler(0, rr(0, 6.28), Math.PI / 4 + tilt);
  add('edge-first', `edge down, tilt ${tilt.toFixed(2)}, from ${h.toFixed(1)}`, () => { const s = fresh(); s.place([rr(-0.8, 0.8), h, rr(-0.5, 0.5)], q); return s; }, {settle: true, onTable: true, mustRotate: true});
}
for (let i = 0; i < 10; i++) {
  const h = rr(1, 3.5), yaw = rr(0, 6.28);
  const q = cornerDown(yaw).multiply(qFromEuler(rr(-0.05, 0.05), 0, rr(-0.05, 0.05)));
  add('corner-first', `corner down from ${h.toFixed(1)}`, () => { const s = fresh(); s.place([rr(-0.8, 0.8), h, rr(-0.5, 0.5)], q); return s; }, {settle: true, onTable: true, mustRotate: true});
}
for (let i = 0; i < 10; i++) {
  const speed = rr(1.5, 4), dir = rr(0, 6.28);
  const v = [Math.cos(dir) * speed, 0, Math.sin(dir) * speed * 0.5];
  const w = [v[2] / DIE.half, 0, -v[0] / DIE.half];
  add('slow-roll', `rolling at ${speed.toFixed(1)}`, () => { const s = fresh(BOUNDS.wide); s.place([0, DIE.half + 0.01, 0], qFromEuler(0, rr(0, 6.28), 0), v, w); return s; }, {settle: true, onTable: true, maxSlide: 0.8});
}
for (let i = 0; i < 24; i++) {
  const which = ['narrow', 'mid', 'wide'][i % 3];
  const seed = SEED * 1000 + i;
  add('roll-button', `${which} mat, seed ${seed}`, () => { const s = fresh(BOUNDS[which]); s.rollThrow(mulberry32(seed)); return s; }, {settle: true, onTable: true, inside: true});
}
for (let i = 0; i < 4; i++) {
  const seed = SEED * 2000 + i;
  add('roll-button', `reduced motion, seed ${seed}`, () => { const s = fresh(BOUNDS.mid); s.rollThrow(mulberry32(seed), {gentle: true}); return s; }, {settle: true, onTable: true, inside: true});
}
for (let i = 0; i < 6; i++) {
  const seed = SEED * 3000 + i;
  add('fetch', `Morrow's drop, seed ${seed}`, () => { const s = fresh(); s.fetchDrop(mulberry32(seed)); return s; }, {settle: true, onTable: true, inside: true});
}

/* Hand throws: pick up from the middle, swing, let go. */
for (let i = 0; i < 16; i++) {
  const b = BOUNDS[['mid', 'wide', 'narrow'][i % 3]];
  const hard = i % 2 === 0;
  const ang = rr(0, 6.28), dist = hard ? rr(1.0, 1.6) : rr(0.3, 0.7), dur = hard ? rr(0.06, 0.12) : rr(0.25, 0.5);
  const startH = HAND.holdY + DIE.half * 0.9;
  const a = new THREE.Vector3(rr(-0.5, 0.5), startH, rr(-0.4, 0.4));
  const z = a.clone().add(new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist * 0.6));
  add('hand-throw', `${hard ? 'hard' : 'soft'} throw ${(dist / dur).toFixed(1)} u/s`, () => {
    const s = fresh(b);
    s.place([a.x, DIE.half, a.z], qFromEuler(0, rr(0, 6.28), 0));
    for (let k = 0; k < 30; k++) s.step();
    const r = handThrow(s, linePath(a, z, dur));
    s._hand = r;
    return s;
  }, {settle: true, handPen: 0.02});
}
/* Throws carrying lots of spin: a fast arc, released while the die swings. */
for (let i = 0; i < 8; i++) {
  const seed = SEED * 4000 + i;
  add('spin-throw', `whipped arc, seed ${seed}`, () => {
    const rnd = mulberry32(seed);
    const s = fresh(BOUNDS.wide);
    s.place([0, DIE.half, 0], randomQuaternion(rnd).multiply(new THREE.Quaternion()));
    for (let k = 0; k < 120; k++) s.step();
    const c = new THREE.Vector3(0, HAND.holdY + 0.45, 0), rad = 0.6 + rnd() * 0.4, w = 18 + rnd() * 10;
    const path = {duration: 0.35, at(t, out) { return out.set(c.x + Math.cos(t * w) * rad, c.y, c.z + Math.sin(t * w) * rad * 0.6); }};
    s._hand = handThrow(s, path);
    return s;
  }, {settle: true, handPen: 0.02});
}

/* Drops onto the rails: whatever happens, it must be physical. */
for (let i = 0; i < 10; i++) {
  const b = BOUNDS.mid;
  const rail = i % 2 ? 'x' : 'z';
  const off = rr(-0.35, 0.35); // offset of the centre from the rail's centreline
  const h = rr(1.4, 2.4);
  add('rail-drop', `onto ${rail} rail, offset ${off.toFixed(2)}`, () => {
    const s = fresh(b);
    const p = rail === 'x' ? [b.halfX + RAIL.width / 2 + off, h, rr(-1, 1)] : [rr(-1.5, 1.5), h, -b.halfZ - RAIL.width / 2 + off];
    s.place(p, qFromEuler(rr(-0.3, 0.3), rr(0, 6.28), rr(-0.3, 0.3)));
    return s;
  }, {settle: 'any'});
}

/* Overhang: set the die flat on top of the right rail with its centre at a
   chosen distance from the rail's OUTER edge, and let go. Physics alone
   decides; the expected answer is simple statics — it tips off if and only
   if its centre of mass is past the edge. (Starting at rest, exactly on the
   edge, it may go either way.) */
for (const d of [-0.32, -0.22, -0.12, -0.06, -0.03, 0.03, 0.06, 0.12, 0.2, 0.3]) {
  add('overhang', `centre ${d > 0 ? d.toFixed(2) + ' past' : (-d).toFixed(2) + ' inside'} the outer edge`, () => {
    const b = BOUNDS.mid;
    const s = fresh(b);
    const edge = b.halfX + RAIL.width;
    s.place([edge + d, RAIL.height + DIE.half + 0.002, 0], new THREE.Quaternion());
    s._expectFall = d > 0;
    return s;
  }, {settle: 'any', overhang: true});
}
/* The same at the inner edge, over the cloth. */
for (const d of [-0.15, -0.05, 0.05, 0.15]) {
  add('overhang', `inner edge, centre ${d > 0 ? d.toFixed(2) + ' over the cloth' : (-d).toFixed(2) + ' on the rail'}`, () => {
    const b = BOUNDS.mid;
    const s = fresh(b);
    s.place([b.halfX - d, RAIL.height + DIE.half + 0.002, 0.2], new THREE.Quaternion());
    s._expectInward = d > 0;
    return s;
  }, {settle: 'any', inner: true});
}

/* Balanced on an edge: a hair off vertical either way, it falls that way. */
for (const lean of [-0.03, -0.01, -0.003, 0.003, 0.01, 0.03]) {
  add('edge-balance', `balanced on an edge, leaning ${lean}`, () => {
    const s = fresh();
    /* rest height of a rounded cube on its edge: the edge's centre line plus the rounding */
    const h = (DIE.half - DIE.radius) * Math.SQRT2 + DIE.radius;
    s.place([0, h + 0.0005, 0], qFromEuler(0, 0, Math.PI / 4 + lean));
    s._lean = lean;
    return s;
  }, {settle: true, onTable: true, balance: true});
}

/* Carried off the table and dropped: it must fall away, not hang or stop. */
for (let i = 0; i < 5; i++) {
  const side = [[1, 0], [-1, 0], [0, 1], [0.7, 0.7], [-0.6, 0.8]][i];
  add('fall-off', `dropped beyond the ${['right', 'left', 'front', 'front-right', 'front-left'][i]}`, () => {
    const b = BOUNDS.mid, f = footprint(b);
    const s = fresh(b);
    s.place([0, DIE.half, 0], new THREE.Quaternion());
    for (let k = 0; k < 30; k++) s.step();
    const a = new THREE.Vector3(0, HAND.holdY + 0.45, 0);
    const z = new THREE.Vector3(side[0] * (f.x + 1.2), HAND.holdY + 0.45, side[1] * (f.z + 1.2));
    s._hand = handThrow(s, linePath(a, z, 0.8, t => t * t * (3 - 2 * t)));
    return s;
  }, {fell: true});
}

/* Rolled slowly towards a rail: it must stop against it or on it, not pass. */
for (let i = 0; i < 6; i++) {
  const speed = rr(2, 6);
  add('into-rail', `rolling into the right rail at ${speed.toFixed(1)}`, () => {
    const s = fresh(BOUNDS.mid);
    s.place([s.bounds.halfX - 1.6, DIE.half + 0.01, rr(-0.8, 0.8)], qFromEuler(0, rr(-0.3, 0.3), 0), [speed, 0, 0], [0, 0, -speed / DIE.half * 0.6]);
    return s;
  }, {settle: true, onTable: true});
}

/* Nonsense input. */
add('unusual', 'pointer teleports across the window in one frame', () => {
  const s = fresh(BOUNDS.mid);
  for (let k = 0; k < 30; k++) s.step();
  s._hand = handThrow(s, {duration: 0.05, at(t, out) { return t < 0.02 ? out.set(0, HAND.holdY + 0.45, 0) : out.set(40, HAND.holdY + 0.45, -30); }});
  return s;
}, {finite: true, maxRelease: HAND.maxThrow + 1e-6});
add('unusual', 'grab and release in the same frame', () => {
  const s = fresh();
  for (let k = 0; k < 30; k++) s.step();
  s._hand = handThrow(s, linePath(new THREE.Vector3(0.4, 0.95, 0.3), new THREE.Vector3(0.4, 0.95, 0.3), 0), {hold: 0});
  return s;
}, {settle: true, onTable: true});
add('unusual', 'die pushed down into the glass by the hand', () => {
  const s = fresh();
  for (let k = 0; k < 30; k++) s.step();
  const p = s.body.translation();
  s._hand = handThrow(s, linePath(new THREE.Vector3(p.x, 1, p.z), new THREE.Vector3(p.x, -2, p.z), 0.4), {hold: 0.05});
  return s;
}, {settle: true, onTable: true, handPen: 0.03, jitter: 0.015});
add('unusual', 'die dragged hard into a rail', () => {
  const s = fresh();
  for (let k = 0; k < 30; k++) s.step();
  const p = s.body.translation();
  s._hand = handThrow(s, linePath(new THREE.Vector3(p.x, 0.9, p.z), new THREE.Vector3(s.bounds.halfX + 1.5, 0.9, p.z), 0.6), {hold: 0.05});
  return s;
}, {settle: 'any', handPen: 0.03});
add('unusual', 'a half-second frame hitch mid-throw', () => {
  const s = fresh();
  s.rollThrow(mulberry32(99));
  s.advance(0.5);
  return s;
}, {settle: true, onTable: true});
add('unusual', 'touch: tiny jittery drags then release', () => {
  const s = fresh();
  for (let k = 0; k < 30; k++) s.step();
  const rnd = mulberry32(5);
  const base = new THREE.Vector3(0.4, HAND.holdY + 0.45, 0.3);
  s._hand = handThrow(s, {duration: 0.6, at(t, out) { return out.copy(base).add(new THREE.Vector3((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.04)); }});
  return s;
}, {settle: true, onTable: true, maxRelease: 1.5});

/* ---------- run ---------- */
const results = [];
const failures = [];
const faces = {};
const sel = scenarios.filter(s => !ONLY || s.group.includes(ONLY));
for (const sc of sel) {
  const sim = sc.fn();
  const q0 = sim.snapshot({p: new THREE.Vector3(), q: new THREE.Quaternion()}).q.clone();
  const r = runFree(sim);
  const rot = sim.body.rotation();
  const turned = 2 * Math.acos(Math.min(1, Math.abs(q0.dot(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)))));
  const e = sc.expect, bad = [];
  if (r.nan) bad.push('NaN');
  if (r.maxPen > 0.02) bad.push(`penetration ${r.maxPen.toFixed(3)}`);
  if (sim._hand && sim._hand.maxPen > (e.handPen ?? 0.02)) bad.push(`held penetration ${sim._hand.maxPen.toFixed(3)}`);
  if (r.energyGain > 0.02) bad.push(`energy gained ${(r.energyGain * 100).toFixed(1)}%`);
  /* A bounce may rise higher than the last only by spending spin: an edge
     strike turns rotation into lift. Higher than the spin could pay for is
     energy from nowhere. */
  for (let k = 1; k < r.apexes.length; k++) {
    const a = r.apexes[k - 1], b = r.apexes[k];
    if (sim.mass * g * (b.y - a.y) > a.spin + 0.05 * sim.mass * g) { bad.push('a bounce rose higher than its spin could pay for'); break; }
  }
  if (e.settle === true && r.settleTime == null && r.outcome.kind !== 'fell') bad.push('never came to rest');
  if (e.settle && r.jitter > (e.jitter ?? 0.004)) bad.push(`jitter at rest ${r.jitter.toFixed(4)}`);
  if (e.onTable && r.outcome.kind === 'fell') bad.push('left the table');
  if (e.inside && !['flat', 'cocked'].includes(r.outcome.kind)) bad.push(`ended ${r.outcome.kind}`);
  if (e.maxSlide && r.slide > e.maxSlide) bad.push(`slid ${r.slide.toFixed(2)} without turning`);
  if (e.mustRotate && turned < 0.05) bad.push('landed on an edge/corner without turning');
  if (e.fell && r.outcome.kind !== 'fell') bad.push(`did not fall off (${r.outcome.kind})`);
  if (e.fell && !r.falling) bad.push('stopped falling in mid-air');
  if (e.maxRelease && sim._hand && Math.hypot(...sim._hand.rel.linvel) > e.maxRelease) bad.push(`release speed ${Math.hypot(...sim._hand.rel.linvel).toFixed(2)}`);
  if (e.overhang) {
    const fell = r.outcome.kind === 'fell';
    if (fell !== sim._expectFall) bad.push(fell ? 'fell although supported' : 'stayed although its centre was past the edge');
  }
  if (e.inner) {
    const inward = Math.abs(r.final.x) < sim.bounds.halfX;
    if (inward !== sim._expectInward) bad.push(inward ? 'fell onto the cloth although supported' : 'stayed on the rail although its centre was over the cloth');
  }
  if (e.balance) {
    /* leaning +z rotation tips it toward -x */
    const wentNeg = r.final.x < 0;
    if (wentNeg !== (sim._lean > 0)) bad.push(`fell the wrong way (x ${r.final.x.toFixed(2)})`);
  }
  if (r.outcome.kind === 'flat') faces[r.outcome.top.value] = (faces[r.outcome.top.value] || 0) + 1;
  const row = {group: sc.group, name: sc.name, outcome: r.outcome.kind, face: r.outcome.top.value, settle: r.settleTime, strikes: r.strikes, surfaces: r.strikesBySurface, pen: +r.maxPen.toFixed(4), jitter: +r.jitter.toFixed(5), slide: +r.slide.toFixed(2), bounces: r.apexes.length, bad};
  results.push(row);
  if (bad.length) failures.push(row);
  if (VERBOSE || bad.length) console.log(`${bad.length ? 'FAIL' : 'ok  '} [${sc.group}] ${sc.name}: ${r.outcome.kind}${r.outcome.kind === 'flat' ? ' ' + r.outcome.top.value : ''}, rest ${r.settleTime?.toFixed(2) ?? '-'}s, ${r.strikes} strikes, pen ${r.maxPen.toFixed(4)}, slide ${r.slide.toFixed(2)}${bad.length ? '  <- ' + bad.join('; ') : ''}`);
  sim.dispose();
}

/* ---------- frame-rate independence ----------
   The same pointer movement, delivered at different display rates, must
   throw the die the same way. */
if (!ONLY || 'framerate'.includes(ONLY)) {
  const rows = [];
  for (const fps of [30, 60, 90, 144, 240]) {
    const s = fresh(BOUNDS.wide);
    s.place([0, DIE.half, 0], new THREE.Quaternion());
    for (let k = 0; k < 30; k++) s.step();
    const a = new THREE.Vector3(-0.5, HAND.holdY + 0.45, 0), z = new THREE.Vector3(0.9, HAND.holdY + 0.45, -0.3);
    const {rel} = handThrow(s, linePath(a, z, 0.15), {fps, hold: 0.3});
    let t = 0;
    while (t < 0.25) { s.advance(1 / fps); t += 1 / fps; }
    const p = s.body.translation();
    rows.push({fps, v: rel.linvel.map(x => +x.toFixed(2)), w: rel.angvel.map(x => +x.toFixed(2)), at: [p.x, p.y, p.z].map(x => +x.toFixed(3))});
    s.dispose();
  }
  const ref = rows[1];
  let worst = 0;
  for (const r of rows) worst = Math.max(worst, Math.hypot(...r.v.map((x, i) => x - ref.v[i])) / Math.hypot(...ref.v));
  console.log('frame rate  release velocity        position 0.25 s later');
  for (const r of rows) console.log(`  ${String(r.fps).padStart(3)} fps  [${r.v.join(', ')}]  [${r.at.join(', ')}]`);
  const row = {group: 'framerate', name: 'same throw at 30-240 fps', worst, bad: worst > 0.08 ? [`release velocity differs by ${(worst * 100).toFixed(1)}%`] : []};
  results.push(row);
  if (row.bad.length) { failures.push(row); console.log('FAIL ' + row.bad[0]); }
  else console.log(`ok   release velocity within ${(worst * 100).toFixed(1)}% across frame rates`);
}

/* ---------- carry surface continuity ---------- */
if (!ONLY || 'carry'.includes(ONLY)) {
  const cam = new THREE.PerspectiveCamera(30, 1.6, 0.5, 100);
  cam.position.set(0, Math.sin(0.9076) * 12, Math.cos(0.9076) * 12);
  cam.lookAt(0, 0.55, 0);
  cam.updateMatrixWorld();
  const ray = new THREE.Raycaster(), out = new THREE.Vector3(), last = new THREE.Vector3();
  let worst = 0;
  for (let y = 1; y >= -1; y -= 0.002) {
    ray.setFromCamera(new THREE.Vector2(0.1, y), cam);
    carryPoint(ray.ray.origin, ray.ray.direction, BOUNDS.mid, 0.45, out);
    if (y < 1) worst = Math.max(worst, out.distanceTo(last));
    last.copy(out);
  }
  const row = {group: 'carry', name: 'carry surface is continuous', worst, bad: worst > 0.2 ? [`jump of ${worst.toFixed(2)}`] : []};
  results.push(row);
  console.log(`${row.bad.length ? 'FAIL' : 'ok  '} carry surface: largest step ${worst.toFixed(3)} for a 0.1% pointer move`);
  if (row.bad.length) failures.push(row);
}

/* ---------- fairness ----------
   Nothing chooses the face, so over many Roll-button throws every face must
   come up about as often (chi-squared, 5 degrees of freedom; 20.5 is the
   p = 0.001 line). Cocked dice are counted separately. */
if (!ONLY || 'fairness'.includes(ONLY)) {
  const N = Number(process.env.FAIR || 600), count = [0, 0, 0, 0, 0, 0, 0];
  let cocked = 0, fell = 0, slowest = 0;
  for (let i = 0; i < N; i++) {
    const s = fresh(BOUNDS[['narrow', 'mid', 'wide'][i % 3]]);
    s.rollThrow(mulberry32(SEED * 100000 + i));
    let t = 0;
    for (; t < 10; t += 1 / 60) { s.advance(1 / 60); if (s.body.isSleeping()) break; }
    slowest = Math.max(slowest, t);
    const r = s.body.rotation();
    const c = classify(s, new THREE.Quaternion(r.x, r.y, r.z, r.w));
    if (c.kind === 'flat') count[c.top.value]++; else if (c.kind === 'fell') fell++; else cocked++;
    s.dispose();
  }
  const flat = count.slice(1).reduce((a, b) => a + b, 0), exp = flat / 6;
  const chi = count.slice(1).reduce((a, n) => a + (n - exp) ** 2 / exp, 0);
  const bad = [];
  if (chi > 20.5) bad.push(`faces uneven, chi-squared ${chi.toFixed(1)}`);
  if (fell > 0) bad.push(`${fell} Roll-button throws left the table`);
  if (cocked / N > 0.05) bad.push(`${cocked} cocked`);
  const row = {group: 'fairness', name: `${N} roll-button throws`, bad};
  results.push(row);
  if (bad.length) failures.push(row);
  console.log(`${bad.length ? 'FAIL' : 'ok  '} fairness over ${N} throws: ${count.slice(1).map((n, i) => `${i + 1}:${n}`).join(' ')}, cocked ${cocked}, fell ${fell}, chi-squared ${chi.toFixed(1)}, slowest to sleep ${slowest.toFixed(1)} s${bad.length ? '  <- ' + bad.join('; ') : ''}`);
}

/* ---------- summary ---------- */
const by = {};
for (const r of results) {
  const b = by[r.group] ||= {n: 0, fail: 0, outcomes: {}};
  b.n++; if (r.bad.length) b.fail++;
  if (r.outcome) b.outcomes[r.outcome] = (b.outcomes[r.outcome] || 0) + 1;
}
console.log('\ngroup          runs  fail  outcomes');
for (const [k, b] of Object.entries(by)) console.log(`${k.padEnd(14)} ${String(b.n).padStart(4)}  ${String(b.fail).padStart(4)}  ${Object.entries(b.outcomes).map(([o, n]) => `${o} ${n}`).join(', ')}`);
const settles = results.filter(r => r.settle != null).map(r => r.settle).sort((a, b) => a - b);
if (settles.length) console.log(`\ntime to rest: median ${settles[settles.length >> 1].toFixed(2)} s, slowest ${settles[settles.length - 1].toFixed(2)} s`);
console.log('faces when flat:', Object.entries(faces).sort().map(([f, n]) => `${f}:${n}`).join('  '));
const strikes = results.filter(r => r.strikes != null).map(r => r.strikes);
console.log(`strikes per run: median ${strikes.sort((a, b) => a - b)[strikes.length >> 1]}`);
console.log(`\n${results.length - failures.length} of ${results.length} physics scenarios passed (seed ${SEED}).`);
if (process.env.REPORT) (await import('node:fs')).writeFileSync(process.env.REPORT, JSON.stringify({seed: SEED, results}, null, 1));
process.exit(failures.length ? 1 : 0);
