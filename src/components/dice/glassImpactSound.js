/* Glass & Fortune — impact voice for the 3D die.
   Copied from the game (runtime/dice-3d-sound.js) so the website die strikes
   the table with the same synthesised voice. The one addition is the
   optional `surface` on impact() (see SURFACES below); without it the voice
   is exactly the game's.

   One glass-on-felt strike, synthesised. Nothing is loaded: no samples, no
   impulse response file, nothing fetched. That matches the asset's own
   provenance — the die carries no fonts or textures either — and it is also the
   only way to hit the picture, because the roll's strike times are decided at
   runtime per die and a fixed one-second recording cannot line up with them.

   The vocabulary deliberately mirrors the game's own procedural fallback in
   `glass-and-fortune.html` (a `wood` body under a two-partial `glass` ring, a
   small convolution send), so this sits in the same room as the rest of the
   sound design rather than beside it. Two differences, both measured:

   - The shipped `dice_roll_*.wav` samples have effectively no energy below
     1 kHz — under 0.5% in all five. A struck glass cube on a felted table has a
     low-mid thump under the ring, so there is a real body layer here.
   - The samples vary by about 8 dB between variations. Level here follows the
     strike speed the choreography actually produces, so loudness means
     something.

   At integration this must NOT build its own AudioContext: pass the game's,
   and its effects bus as `destination`, so one mute and one master gain govern
   everything. The standalone context exists for the prototype page. */
'use strict';

/* Partial ratios and decays for the ring. Glass is inharmonic — these are not
   a harmonic series — and the upper partials die first, which is what separates
   glass from a bell or a plastic click. */
const PARTIALS = [
  {ratio: 1.00, level: 1.00, decay: 0.26},
  {ratio: 1.51, level: 0.42, decay: 0.17},
  {ratio: 2.33, level: 0.18, decay: 0.11},
];

/* Layer levels and shapes. Exposed as options rather than buried in the voice
   because they cannot be judged by ear from here.

   They are set by PEAK LEVEL PER LAYER, each rendered alone through an
   OfflineAudioContext and solved to a target: contact -15 dBFS, ring -19, body
   -22, thump -24 — transient loudest and briefest, tone beneath it, weight
   underneath that. An earlier attempt tuned the share of total spectral energy
   per band instead, and that is the wrong lens: three narrow sine partials hold
   far more energy per bin than a broadband 22ms tick, so the metric read the
   contact as absent while it was in fact the loudest layer in the mix. Retune
   by per-layer peak, or by ear with the preview's sliders. */
const DEFAULTS = {
  /* Headroom, measured offline rather than guessed: one die peaks at -8.3 dBFS
     at full volume, five at about -4, and six overlapping five-dice rolls — the
     worst the preview can produce — at -1.7, without a clipped sample. That
     last figure is too close to the ceiling to leave at unity, so the default
     sits here. The convolution impulse is random per instance, so repeated
     renders of the same roll vary by around a decibel. */
  volume: 0.75,
  wet: 0.15,          // same send as the game's Sfx bus
  reverbSeconds: 0.7, // same tail
  baseFreq: 1500,     // between the game's roll (1250) and select (1900) glass
  spread: 0.035,      // per-die detune, so five dice are not one die five times
  clickLevel: 0.186,   // contact, -15 dBFS alone
  clickHz: 3000,
  clickSeconds: 0.022,
  bodyLevel: 0.544,    // felt over wood, -22 dBFS alone
  bodyHz: 700,
  bodySeconds: 0.070,
  thumpLevel: 0.081,   // the weight under it, -24 dBFS alone
  thumpHz: 120,
  thumpSeconds: 0.090,
  ringLevel: 0.088,    // the glass itself, -19 dBFS alone
  ringDecayScale: 1,
};

/* What the die strikes changes the voice. The website's mat is velvet under
   a sheet of glass, inside walnut rails:
   - glass: glass meeting glass rings brighter and longer, and the velvet
     under the sheet takes most of the body out of it;
   - wood: lacquered walnut gives a warm knock and damps the ring sooner.
   'felt' is the game's own table, unchanged, and the default. */
const SURFACES = {
  felt: {pitch: 1, ring: 1, ringDecay: 1, body: 1, bodyHz: 1, click: 1, clickHz: 1},
  glass: {pitch: 1.14, ring: 1.55, ringDecay: 1.35, body: 0.45, bodyHz: 1.4, click: 1.15, clickHz: 1.35},
  wood: {pitch: 0.92, ring: 0.7, ringDecay: 0.7, body: 1.35, bodyHz: 0.62, click: 0.85, clickHz: 0.75},
};

export function createDiceAudio(options = {}) {
  const cfg = {...DEFAULTS, ...options};
  let ctx = options.context || null;
  const ownsContext = !options.context;
  let master = null, dry = null, wet = null, noiseBuffer = null;
  let muted = !!options.muted;
  let volume = cfg.volume;
  let built = false;
  let disposed = false;
  const stats = {impacts: 0, lastStrength: 0};

  function buildGraph() {
    if (built || !ctx) return;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    dry = ctx.createGain();
    wet = ctx.createGain();
    wet.gain.value = cfg.wet;

    /* A procedural impulse rather than a file: noise under a cubic decay, which
       is the same cheap trick the game uses for its own reverb. */
    const convolver = ctx.createConvolver();
    const len = Math.max(1, Math.floor(ctx.sampleRate * cfg.reverbSeconds));
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    convolver.buffer = impulse;

    dry.connect(master);
    wet.connect(convolver);
    convolver.connect(master);
    master.connect(options.destination || ctx.destination);

    /* One noise buffer, read from a random offset per voice. Allocating a fresh
       buffer per strike is wasteful when twenty can land inside a second. */
    const n = Math.floor(ctx.sampleRate * 0.25);
    noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    built = true;
  }

  function ensure() {
    if (disposed) return null;
    if (!ctx) {
      const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!Ctor) return null;
      try {
        ctx = new Ctor();
      } catch (err) {
        return null;
      }
    }
    buildGraph();
    return ctx;
  }

  function route(node, send) {
    node.connect(dry);
    if (send > 0) {
      const g = ctx.createGain();
      g.gain.value = send;
      node.connect(g);
      g.connect(wet);
    }
  }

  /* A filtered burst of the shared noise buffer. */
  function burst(at, seconds, level, freq, type, q, send) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const maxOffset = Math.max(0, noiseBuffer.duration - seconds - 0.001);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    if (q != null) filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(filter);
    filter.connect(g);
    route(g, send);
    src.start(at, Math.random() * maxOffset, seconds + 0.01);
    src.stop(at + seconds + 0.02);
  }

  function partial(at, freq, seconds, level, send) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, at);
    /* A struck solid detunes very slightly downward as it rings out. Tiny, but
       without it three sine partials read as a synth tone rather than a body. */
    o.frequency.exponentialRampToValueAtTime(freq * 0.995, at + seconds);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    o.connect(g);
    route(g, send);
    o.start(at);
    o.stop(at + seconds + 0.02);
  }

  /* One strike. `strength` is the renderer's normalised approach speed: 1 for
     the first fall, less for each bounce. `index`/`lastIndex` identify which
     strike it is, so the final settle can be a tick rather than a landing. */
  function impact(ev = {}) {
    const c = ensure();
    if (!c || muted || disposed) return false;
    const strength = Math.min(1, Math.max(0, ev.strength == null ? 1 : ev.strength));
    if (strength <= 0.001) return false;
    const at = c.currentTime + (ev.when || 0);
    const dieIndex = ev.die || 0;
    const settle = ev.lastIndex != null && ev.index === ev.lastIndex;

    /* Each slot keeps its own pitch, so a die sounds like itself across a roll
       and the row does not sound like one die struck five times. */
    const detune = 1 + ((dieIndex % 5) - 2) * cfg.spread;
    const surf = SURFACES[ev.surface] || SURFACES.felt;
    /* No two strikes of a real die are the same: where on the die it lands
       moves the pitch a little, and the ring a little more. */
    const vary = ev.surface ? 1 + (Math.random() - 0.5) * 0.05 : 1;
    const freq = cfg.baseFreq * detune * surf.pitch * vary;

    /* Perceptual, not linear: halving the strike speed should not halve the
       loudness or the roll's later bounces vanish. */
    const amp = Math.pow(strength, 0.6);

    /* Contact. Two hard surfaces meeting, before anything has had time to
       ring. Highpassed rather than band-limited, so it carries real air above
       8kHz — a narrow band here measured as no top end at all. */
    burst(at, cfg.clickSeconds, cfg.clickLevel * amp * surf.click,
          cfg.clickHz * surf.clickHz * (0.9 + 0.2 * strength), 'highpass', 0.7, 0.05);

    if (!settle) {
      /* Body. The layer the shipped samples are missing: felt over wood taking
         the weight. Low noise plus a short low tone, both gone in under 90ms. */
      burst(at, cfg.bodySeconds, cfg.bodyLevel * amp * surf.body, cfg.bodyHz * surf.bodyHz, 'lowpass', null, 0.06);
      partial(at, cfg.thumpHz * detune * surf.bodyHz, cfg.thumpSeconds, cfg.thumpLevel * amp * surf.body, 0.06);
    }

    /* Ring. Brightness rises with the strike: a hard hit excites the upper
       partials, a soft one barely touches them. */
    const ringScale = settle ? 0.45 : 1;
    for (let i = 0; i < PARTIALS.length; i++) {
      const p = PARTIALS[i];
      const bright = i === 0 ? 1 : Math.pow(strength, 0.5 + i * 0.35);
      const ringVary = ev.surface ? 1 + (Math.random() - 0.5) * 0.3 : 1;
      partial(at, freq * p.ratio, p.decay * cfg.ringDecayScale * surf.ringDecay * (settle ? 0.6 : 1),
              cfg.ringLevel * p.level * amp * bright * ringScale * surf.ring * ringVary, 0.18);
    }

    stats.impacts++;
    stats.lastStrength = strength;
    if (ev.surface) stats[ev.surface] = (stats[ev.surface] || 0) + 1;
    return true;
  }

  return {
    impact,
    /* Browsers start a context suspended until a gesture; call from a click. */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') return c.resume();
      return Promise.resolve();
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },
    get volume() { return volume; },
    setMuted(on) {
      muted = !!on;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    },
    get muted() { return muted; },
    get context() { return ctx; },
    get state() { return ctx ? ctx.state : 'none'; },
    get stats() { return {...stats}; },
    /* Everything the voice is built from, so the preview can show it and a
       measurement can assert against it rather than against guesses. */
    get spec() {
      return {...cfg, partials: PARTIALS.map(p => ({...p}))};
    },
    /* Retune live. The layer balance is the one thing here that cannot be
       settled by measurement, so it has to be adjustable by whoever can hear
       it. Takes any subset of the options. */
    set(patch) {
      Object.assign(cfg, patch);
      return {...cfg};
    },
    dispose() {
      disposed = true;
      if (ownsContext && ctx && ctx.state !== 'closed') {
        try { ctx.close(); } catch (err) { /* already gone */ }
      }
      ctx = null;
      built = false;
    },
  };
}
