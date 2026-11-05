/* The hero's table and its controls. The 3D scene itself is a separate
   chunk, loaded only when WebGL is available; without it the hero shows a
   still of the same die and the rest of the site is untouched. */
import {Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {RESULT_LINES, HERO, MORROW_SITE} from '../data/content.js';
import {assetUrl} from '../assetUrl.js';
import {createDiceAudio} from './dice/glassImpactSound.js';
import {createMorrowVoice} from './dice/morrowVoice.js';

const DiceScene = lazy(() => import('./dice/DiceScene.jsx'));

function webglAvailable() {
  if (typeof window === 'undefined' || window.GLASS_NO_WEBGL) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch(err) { console.warn('Glass die unavailable:', err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function readMuted() {
  try { return localStorage.getItem('gf-site-muted') === '1'; } catch { return false; }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export default function InteractiveDice() {
  const [supported] = useState(webglAvailable);
  /* Fetch the 3D scene only once the page itself has loaded, so the logo,
     copy and buttons never wait behind the physics engine. */
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const start = () => {
      const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
      idle(() => { if (!cancelled) setGo(true); }, {timeout: 1500});
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, {once: true});
    return () => { cancelled = true; window.removeEventListener('load', start); };
  }, [supported]);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('idle');
  /* eslint-disable-next-line no-unused-vars */
  const [result, setResult] = useState(null);
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(readMuted);
  const reducedMotion = usePrefersReducedMotion();
  const box = useRef();
  const frame = useRef();
  const audio = useRef(null);
  const voice = useRef(null);
  const throws = useRef(0);
  const invites = useRef(0);
  const [saying, setSaying] = useState(null);
  const lowPower = useMemo(() => matchMedia('(max-width: 760px), (pointer: coarse)').matches, []);

  /* Pause physics and drawing when the table is off screen or the tab hidden.
     Not while the die is in the air or in someone's hand, though: it can be
     carried right down the page, long after the table itself has scrolled by. */
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), {threshold: 0.02});
    if (box.current) io.observe(box.current);
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const inHand = phase === 'held' || phase === 'held-off' || phase === 'rolling';
  useEffect(() => { setVisible(!hidden && (onScreen || inHand)); }, [hidden, onScreen, inHand]);

  useEffect(() => () => audio.current?.dispose(), []);

  /* Morrow. Nothing of his is fetched or played until the visitor has
     touched the page once — browsers refuse it before that anyway. */
  useEffect(() => {
    const v = createMorrowVoice({muted: readMuted()});
    v.onCaption(setSaying);
    voice.current = v;
    /* In the capture phase, and registered before the scene loads, so the
       very press that picks the die up has already unlocked his voice. */
    const allow = () => v.allow();
    window.addEventListener('pointerdown', allow, {capture: true, once: true});
    window.addEventListener('keydown', allow, {capture: true, once: true});
    return () => {
      window.removeEventListener('pointerdown', allow, {capture: true});
      window.removeEventListener('keydown', allow, {capture: true});
      v.dispose();
      voice.current = null;
    };
  }, []);

  /* The scene and these controls talk through one small object. */
  const api = useMemo(() => ({
    roll: null,
    unlockSound() {
      if (!audio.current) audio.current = createDiceAudio({muted: readMuted(), volume: 0.6});
      audio.current.unlock();
    },
  }), []);

  /* The automated checks drive the die through this; it is inert otherwise. */
  useEffect(() => {
    window.__glassDie = {
      roll: seed => api.roll?.(seed),
      fetch: seed => api.fetch?.(seed),
      pose: pose => api.pose?.(pose),
      inspect: () => api.inspect?.(),
      sound: () => audio.current ? {state: audio.current.state, muted: audio.current.muted, ...audio.current.stats} : null,
    };
    return () => { delete window.__glassDie; };
  }, [api]);

  const onImpact = useCallback((strength, surface) => {
    audio.current?.impact({strength, surface});
    /* A good hard crack against the rail earns a word about it. */
    if (strength > 0.85) voice.current?.say(MORROW_SITE.hardThrow, {once: true});
  }, []);
  const onResult = useCallback(value => {
    const lines = RESULT_LINES[value];
    setResult({value, line: lines[Math.floor(Math.random() * lines.length)]});
    const n = ++throws.current;
    const v = voice.current;
    if (!v) return;
    if (n === 12) v.say(MORROW_SITE.manyThrows, {once: true, gap: 0});
    else if (n === 1 || Math.random() < 0.25) {
      v.say(MORROW_SITE.landed[n === 1 ? 0 : Math.floor(Math.random() * MORROW_SITE.landed.length)]);
    }
  }, []);
  const onPhase = useCallback(p => {
    setPhase(p);
    if (p !== 'settled') setResult(null);
    if (p === 'held' || p === 'held-off') voice.current?.say(MORROW_SITE.firstPickup, {once: true, gap: 0});
  }, []);

  /* Left alone with the die, he suggests picking it up. Twice, at most. */
  useEffect(() => {
    if (!ready || !onScreen || result || phase !== 'idle') return undefined;
    const t = setTimeout(() => {
      const line = MORROW_SITE.invite[invites.current];
      if (line && voice.current?.say(line, {once: true})) invites.current++;
    }, 11000);
    return () => clearTimeout(t);
  }, [ready, onScreen, result, phase]);
  const onReady = useCallback(() => setReady(true), []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem('gf-site-muted', next ? '1' : '0'); } catch { /* private mode */ }
    audio.current?.setMuted(next);
    voice.current?.setMuted(next);
    if (!next) api.unlockSound();
  };

  const still = (
    <div className="dice-still">
      <img src={assetUrl('images/die-still-900.webp')} alt="A garnet glass die from Glass & Fortune resting on the game's ornate table" width="900" height="591" loading="eager" />
    </div>
  );

  const lost = phase === 'lost';
  const status = phase === 'held' ? 'Let go to throw.'
    : phase === 'held-off' ? 'Drop it on the mat.'
    : phase === 'rolling' ? 'Tumbling…'
    : phase === 'cocked' ? MORROW_SITE.cocked.text
    : lost ? MORROW_SITE.dropped.text
    : result ? result.line
    : HERO.invitation;

  return (
    <div className={`dice-stage${ready ? ' is-ready' : ''}`} ref={box} data-phase={phase}>
      <div className="dice-frame" ref={frame}>
        {supported ? (
          <SceneBoundary fallback={still}>
            <Suspense fallback={still}>
              {go ? <DiceScene
                api={api}
                frameRef={frame}
                visible={visible}
                reducedMotion={reducedMotion}
                lowPower={lowPower}
                onResult={onResult}
                onPhase={onPhase}
                onImpact={onImpact}
                onReady={onReady}
              /> : still}
            </Suspense>
          </SceneBoundary>
        ) : still}
        {supported && !ready && <p className="dice-loading" aria-hidden="true">The glass is warming…</p>}
      </div>

      <div className="dice-controls">
        <p className={`dice-status${result ? ' has-result' : ''}${lost ? ' is-morrow' : ''}`} aria-live="polite">
          {result && !lost && <span className="dice-face" aria-hidden="true">{result.value}</span>}
          {lost && <span className="dice-speaker">Morrow</span>}
          <span>{supported ? status : 'A garnet die from the game, waiting for your hand.'}</span>
        </p>
        {/* What Morrow is saying out loud, written out underneath, so a
            muted visitor gets the line too. The row keeps its height so
            nothing on the page jumps when he speaks. */}
        <p className="dice-morrow" aria-live="polite">
          {saying && <><span className="dice-speaker">Morrow</span><span>{saying}</span></>}
        </p>
        {supported && (
          <div className="dice-buttons">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => (lost ? api.fetch?.() : api.roll?.())}
              disabled={!ready || phase === 'held' || phase === 'held-off'}
            >
              {lost ? 'Fetch the die' : 'Roll the die'}
            </button>
            <button type="button" className="btn-icon" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? 'Turn dice sound on' : 'Turn dice sound off'} title={muted ? 'Sound off' : 'Sound on'}>
              {muted ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
