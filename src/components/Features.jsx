import {FEATURES} from '../data/content.js';
import Picture from './Picture.jsx';
import WishlistButton from './WishlistButton.jsx';

const ITEM_NAMES = {
  charm_monochrome_moth: 'Monochrome Moth',
  charm_rainbow_thread: 'Rainbow Thread',
  charm_hush_bell: 'Hush Bell',
  curio_velvet_glove: 'Velvet Glove',
  curio_lucky_cup: 'Lucky Cup',
  curio_glass_leech: 'Glass Leech',
};

function Shot({feature}) {
  if (feature.image === 'thread-lantern') {
    return <Picture id="thread-lantern" widths={[640, 1168]} sizes="(max-width: 900px) 92vw, 560px" alt={feature.alt} width="1168" height="784" />;
  }
  return <Picture id={feature.image} widths={[640, 1280]} sizes="(max-width: 900px) 92vw, 720px" alt={feature.alt} width="1280" height="720" />;
}

export default function Features() {
  return (
    <section className="section features" id="features" aria-labelledby="features-title">
      <div className="container">
        <header className="section-head reveal">
          <p className="eyebrow">Inside the Parlour</p>
          <h2 id="features-title">Every cast is a small decision with large consequences.</h2>
        </header>

        {FEATURES.map((f, i) => (
          <article key={f.id} className={`feature feature-${f.id}${i % 2 ? ' is-flipped' : ''}`}>
            <div className="feature-copy reveal">
              <p className="eyebrow">{f.eyebrow}</p>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
            <figure className="feature-media reveal">
              <div className={f.image === 'thread-lantern' ? 'art-frame' : 'shot-frame'}>
                <Shot feature={f} />
              </div>
              {f.cards && (
                <ul className="card-fan" aria-label="Some of the Charms and Curios">
                  {f.cards.map(c => (
                    <li key={c}>
                      <Picture id={c} widths={[360]} sizes="120px" alt={ITEM_NAMES[c]} width="360" height="242" />
                      <span>{ITEM_NAMES[c]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </figure>
          </article>
        ))}

        <div className="mid-cta reveal">
          <p>Like the look of the table?</p>
          <WishlistButton />
        </div>
      </div>
    </section>
  );
}
