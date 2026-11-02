import {useState} from 'react';
import {TRAILER_YOUTUBE_ID} from '../config.js';
import {assetUrl} from '../assetUrl.js';

/* Shows a poster until the visitor asks for the video, so nothing from
   YouTube loads (and nothing plays) unless they press play. */
export default function Trailer() {
  const [playing, setPlaying] = useState(false);
  const hasVideo = !!TRAILER_YOUTUBE_ID;

  return (
    <section className="section trailer" id="trailer" aria-labelledby="trailer-title">
      <div className="container">
        <header className="section-head reveal">
          <p className="eyebrow">Gameplay</p>
          <h2 id="trailer-title">See the glass in motion.</h2>
        </header>
        <div className="video-frame reveal">
          {playing && hasVideo ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(TRAILER_YOUTUBE_ID)}?autoplay=1&rel=0`}
              title="Glass & Fortune gameplay trailer"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <>
              <img src={assetUrl('images/trailer-poster-1280.webp')} alt="" loading="lazy" width="1280" height="720" />
              {hasVideo ? (
                <button type="button" className="video-play" onClick={() => setPlaying(true)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
                  <span>Play the trailer</span>
                </button>
              ) : (
                <div className="video-soon">
                  <span className="video-soon-mark" aria-hidden="true">◆</span>
                  <p>The gameplay trailer is being cut.</p>
                  <p className="muted">Until then, the screenshots below are taken straight from the game.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
