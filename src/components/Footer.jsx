import {STUDIO, SOCIAL_LINKS, STEAM_URL} from '../config.js';
import {assetUrl} from '../assetUrl.js';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <a className="footer-logo" href="#top" aria-label="Glass & Fortune, back to top">
          <img src={assetUrl('images/logo-240.png')} alt="" width="240" height="108" loading="lazy" />
        </a>
        <p className="footer-studio">
          Developed by <a href={STUDIO.url} target="_blank" rel="noopener">{STUDIO.name}</a>
        </p>
        <ul className="footer-links">
          {STEAM_URL && <li><a href={STEAM_URL} target="_blank" rel="noopener">Steam</a></li>}
          {SOCIAL_LINKS.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener me">{s.label}</a></li>)}
        </ul>
        <p className="footer-legal">© {year} {STUDIO.name}. Glass &amp; Fortune and all game artwork are the property of {STUDIO.name}.</p>
      </div>
    </footer>
  );
}
