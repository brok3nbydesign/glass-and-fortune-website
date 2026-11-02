import {FINAL_CTA} from '../data/content.js';
import {RELEASE_LABEL} from '../config.js';
import {assetUrl} from '../assetUrl.js';
import WishlistButton from './WishlistButton.jsx';

export default function SteamCTA() {
  return (
    <section className="section final-cta" id="wishlist" aria-labelledby="final-title">
      <div className="final-backdrop" aria-hidden="true">
        <img src={assetUrl('images/parlour-1712.webp')} srcSet={`${assetUrl('images/parlour-960.webp')} 960w, ${assetUrl('images/parlour-1712.webp')} 1712w`} sizes="100vw" alt="" loading="lazy" />
      </div>
      <div className="container final-inner reveal">
        <img className="final-logo" src={assetUrl('images/logo-520.webp')} alt="Glass & Fortune" width="520" height="234" loading="lazy" />
        <p className="release-badge">{RELEASE_LABEL}</p>
        <h2 id="final-title">{FINAL_CTA.title}</h2>
        <p className="final-text">{FINAL_CTA.text}</p>
        <WishlistButton size="btn-large" />
      </div>
    </section>
  );
}
