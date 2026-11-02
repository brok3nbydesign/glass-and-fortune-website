import {ABOUT, HOSTS} from '../data/content.js';
import Picture from './Picture.jsx';

export default function GameOverview() {
  return (
    <section className="section overview" id="game" aria-labelledby="game-title">
      <div className="container overview-grid">
        <div className="overview-copy reveal">
          <p className="eyebrow">{ABOUT.eyebrow}</p>
          <h2 id="game-title">{ABOUT.title}</h2>
          {ABOUT.paragraphs.map((p, i) => <p key={i} className={i === 0 ? 'lead' : ''}>{p}</p>)}
        </div>
        <figure className="overview-shot reveal">
          <div className="shot-frame">
            <Picture id="shot-table" widths={[640, 1280]} sizes="(max-width: 900px) 92vw, 640px" alt="Gameplay: five glass dice on the table with Charms on the left, Curios on the right and the current hand reading Stained Full House" width="1280" height="720" />
          </div>
          <figcaption>Five dice, your Charms on the left, your Curios on the right.</figcaption>
        </figure>
      </div>

      <div className="container">
        <ul className="pillars">
          {ABOUT.pillars.map(p => (
            <li key={p.title} className="reveal">
              <span className="pillar-mark" aria-hidden="true">◆</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="container hosts reveal">
        <Picture className="hosts-morrow" id="morrow" widths={[420, 760]} sizes="(max-width: 700px) 46vw, 300px" alt="Morrow, a cat in a beaked mask, top hat and long coat, beside a small table of glass dice" width="760" height="1113" />
        <div className="hosts-copy">
          <p className="eyebrow">{HOSTS.eyebrow}</p>
          <h3>{HOSTS.title}</h3>
          <p>{HOSTS.text}</p>
        </div>
        <Picture className="hosts-tally" id="tally" widths={[300, 520]} sizes="(max-width: 700px) 30vw, 180px" alt="Tally, a small clockwork mouse" width="520" height="823" />
      </div>
    </section>
  );
}
