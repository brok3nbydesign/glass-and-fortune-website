/* Morrow's voice around the die.

   Recordings live in public/audio/voice (see MORROW_SITE_LINES.md). Nothing
   is downloaded until he actually speaks, nothing plays before the visitor
   has touched the page — browsers block that anyway — and only one line is
   ever in the air at once. The speaker button mutes him with the glass. */
import {assetUrl} from '../../assetUrl.js';

const GAP = 18000;          // quiet between lines, in ms
const VOLUME = 0.95;

export function createMorrowVoice({muted = false} = {}) {
  const clips = new Map();
  const spoken = new Set();
  let current = null;
  let last = -Infinity;
  let allowed = false;       // set once the visitor has interacted
  let off = muted;
  let onChange = null;

  function clip(file) {
    let a = clips.get(file);
    if (!a) {
      a = new Audio(assetUrl(`audio/voice/${file}.mp3`));
      a.preload = 'none';
      a.volume = VOLUME;
      clips.set(file, a);
    }
    return a;
  }

  function finish(a) {
    if (current !== a) return;
    current = null;
    onChange?.(null);
  }

  /* `line` is {file, text}. Returns true if he actually speaks. */
  function say(line, {once = false, gap = GAP} = {}) {
    if (!line || off || !allowed) return false;
    if (once && spoken.has(line.file)) return false;
    const now = performance.now();
    if (now - last < gap) return false;
    if (current && !current.paused && !current.ended) return false;
    const a = clip(line.file);
    a.currentTime = 0;
    const started = a.play();
    if (started && typeof started.catch === 'function') {
      started.catch(() => { finish(a); });
    }
    a.onended = () => finish(a);
    a.onerror = () => finish(a);
    current = a;
    last = now;
    spoken.add(line.file);
    onChange?.(line.text);
    return true;
  }

  return {
    say,
    /* Called from the first real interaction, so nothing is attempted while
       the browser would refuse it anyway. */
    allow() { allowed = true; },
    get allowed() { return allowed; },
    setMuted(on) {
      off = on;
      if (on && current) { current.pause(); finish(current); }
    },
    /* The caption follows the voice, so what he says is also readable. */
    onCaption(fn) { onChange = fn; },
    dispose() {
      if (current) current.pause();
      current = null;
      onChange = null;
      clips.clear();
    },
  };
}
