import {HERO} from '../data/content.js';
import {assetUrl} from '../assetUrl.js';
import WishlistButton from './WishlistButton.jsx';
import InteractiveDice from './InteractiveDice.jsx';

export default function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-backdrop" aria-hidden="true">
        <img
          src={assetUrl('images/parlour-empty-1531.webp')}
          srcSet={`${assetUrl('images/parlour-empty-960.webp')} 960w, ${assetUrl('images/parlour-empty-1531.webp')} 1531w`}
          sizes="100vw"
          alt=""
          fetchPriority="high"
        />
      </div>
      <div className="hero-inner">
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-logo">
            <img
              src={assetUrl('images/logo-900.webp')}
              srcSet={`${assetUrl('images/logo-520.webp')} 520w, ${assetUrl('images/logo-900.webp')} 900w`}
              sizes="(max-width: 760px) 86vw, 520px"
              width="900"
              height="405"
              alt="Glass & Fortune"
              fetchPriority="high"
            />
          </h1>
          <p className="kicker">{HERO.kicker}</p>
          <p className="hero-tagline">{HERO.tagline}</p>
          <p className="hero-description">{HERO.description}</p>
          <div className="hero-actions">
            <WishlistButton size="btn-large" />
            <a className="btn btn-ghost" href="#trailer">
              <svg className="play-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
              Watch gameplay
            </a>
          </div>
        </div>
        <InteractiveDice />
      </div>
    </section>
  );
}
