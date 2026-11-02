import {useCallback, useEffect, useRef, useState} from 'react';
import {GALLERY} from '../data/content.js';
import {assetUrl} from '../assetUrl.js';
import Picture from './Picture.jsx';

function Lightbox({index, onClose, onStep}) {
  const item = GALLERY[index];
  const dialog = useRef();
  const closeBtn = useRef();
  const touch = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeBtn.current?.focus();
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'Tab') {
        /* Keep focus inside the viewer while it is open. */
        const f = [...dialog.current.querySelectorAll('button')];
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, onStep]);

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Screenshot ${index + 1} of ${GALLERY.length}: ${item.caption}`}
      ref={dialog}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1);
      }}
    >
      <figure className="lightbox-figure" key={item.id}>
        <img
          src={assetUrl(`images/${item.id}-1920.webp`)}
          srcSet={`${assetUrl(`images/${item.id}-1280.webp`)} 1280w, ${assetUrl(`images/${item.id}-1920.webp`)} 1920w`}
          sizes="94vw"
          alt={item.alt}
          width="1920"
          height="1080"
        />
        <figcaption>
          <span className="lightbox-count">{index + 1} / {GALLERY.length}</span> {item.caption}
        </figcaption>
      </figure>
      <button type="button" className="lightbox-btn lightbox-prev" onClick={() => onStep(-1)} aria-label="Previous screenshot">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className="lightbox-btn lightbox-next" onClick={() => onStep(1)} aria-label="Next screenshot">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className="lightbox-btn lightbox-close" onClick={onClose} aria-label="Close" ref={closeBtn}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export default function Gallery() {
  const [open, setOpen] = useState(-1);
  const step = useCallback(d => setOpen(i => (i + d + GALLERY.length) % GALLERY.length), []);
  const close = useCallback(() => setOpen(-1), []);

  return (
    <section className="section gallery" id="gallery" aria-labelledby="gallery-title">
      <div className="container">
        <header className="section-head reveal">
          <p className="eyebrow">Gallery</p>
          <h2 id="gallery-title">Straight from the table.</h2>
          <p className="section-intro">Every image is a screenshot from the game in development.</p>
        </header>
        <ul className="gallery-grid">
          {GALLERY.map((g, i) => (
            <li key={g.id} className={`reveal${i === 0 ? ' is-wide' : ''}`}>
              <button type="button" className="gallery-item" onClick={() => setOpen(i)} aria-label={`View larger: ${g.caption}`}>
                <Picture id={g.id} widths={[640, 1280]} sizes={i === 0 ? '(max-width: 700px) 92vw, 760px' : '(max-width: 700px) 92vw, 380px'} alt={g.alt} width="1280" height="720" />
                <span className="gallery-caption">{g.caption}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open >= 0 && <Lightbox index={open} onClose={close} onStep={step} />}
    </section>
  );
}
