import {STEPS} from '../data/content.js';
import Picture from './Picture.jsx';

export default function HowToPlay() {
  return (
    <section className="section how" id="how-to-play" aria-labelledby="how-title">
      <div className="container">
        <header className="section-head reveal">
          <p className="eyebrow">How to Play</p>
          <h2 id="how-title">Four moves from roll to fortune.</h2>
          <p className="section-intro">No rules to memorise before your first cast. Morrow’s practice hand walks you through it in the game.</p>
        </header>
        <ol className="steps">
          {STEPS.map(step => (
            <li key={step.n} className="step reveal">
              <div className="step-art">
                <Picture id={step.image} widths={[560]} sizes="(max-width: 700px) 92vw, 280px" alt={step.alt} width="560" height="170" />
              </div>
              <span className="step-numeral" aria-hidden="true">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
