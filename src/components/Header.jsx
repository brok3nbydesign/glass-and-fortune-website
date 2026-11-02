import {useEffect, useState} from 'react';
import {assetUrl} from '../assetUrl.js';
import WishlistButton from './WishlistButton.jsx';

const LINKS = [
  {href: '#game', label: 'The Game'},
  {href: '#how-to-play', label: 'How to Play'},
  {href: '#gallery', label: 'Gallery'},
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, {passive: true});
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="header-inner">
        <a className="header-logo" href="#top" aria-label="Glass & Fortune, back to top">
          <img src={assetUrl('images/logo-240.png')} alt="" width="240" height="108" />
        </a>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen(o => !o)}
        >
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          <span className="nav-toggle-bars" aria-hidden="true" />
        </button>
        <nav id="site-nav" className="site-nav" aria-label="Main">
          <ul>
            {LINKS.map(l => (
              <li key={l.href}><a href={l.href} onClick={() => setOpen(false)}>{l.label}</a></li>
            ))}
          </ul>
          <WishlistButton size="btn-small" />
        </nav>
      </div>
    </header>
  );
}
