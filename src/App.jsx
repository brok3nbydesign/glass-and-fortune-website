import {useEffect} from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import GameOverview from './components/GameOverview.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import Features from './components/Features.jsx';
import Trailer from './components/Trailer.jsx';
import Gallery from './components/Gallery.jsx';
import SteamCTA from './components/SteamCTA.jsx';
import Footer from './components/Footer.jsx';

/* Sections fade up once as they enter the screen. With reduced motion, or
   without IntersectionObserver, everything is simply shown. */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')];
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      }
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function App() {
  useReveal();
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main">
        <Hero />
        <GameOverview />
        <HowToPlay />
        <Features />
        <Trailer />
        <Gallery />
        <SteamCTA />
      </main>
      <Footer />
    </>
  );
}
