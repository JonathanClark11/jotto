import { useState } from 'react';
import { INTRO_CARDS } from '../game/intro.js';

// Skippable card walkthrough. onDone(completed) is called once: true after the last card, false on skip.
export function Intro({ kind, onDone }) {
  const cards = INTRO_CARDS[kind];
  const [index, setIndex] = useState(0);
  const last = index === cards.length - 1;
  const card = cards[index];

  return (
    <div className="intro-overlay" role="dialog" aria-modal="true" aria-label={card.title} data-intro={kind}>
      <div className="intro-card">
        <button className="intro-skip hoverable" onClick={() => onDone(false)}>SKIP</button>
        <div className="intro-title">{card.title}</div>
        <div className="intro-body">{card.body}</div>
        {card.demo === 'marks' && (
          <div className="intro-demo" aria-hidden="true">
            <div className="intro-demo-item"><span className="demo-pill demo-pill-elim">✕</span><span className="demo-key demo-key-elim"><i>✕</i>Q</span><small>not in</small></div>
            <div className="intro-demo-item"><span className="demo-pill demo-pill-has">✓</span><span className="demo-key demo-key-has"><i>✓</i>E</span><small>in</small></div>
            <div className="intro-demo-item"><span className="demo-pill demo-pill-blank">AUTO</span><span className="demo-key demo-key-auto">Z</span><small>crossed out for you</small></div>
          </div>
        )}
        {card.demo === 'groups' && (
          <div className="intro-demo" aria-hidden="true">
            <div className="intro-demo-item"><span className="demo-pill demo-pill-group">2 OF</span></div>
            <div className="intro-demo-item">
              {['C', 'R', 'A', 'T'].map((l) => <span key={l} className="demo-key demo-key-group"><b>2</b>{l}</span>)}
              <small>exactly 2 of these are in</small>
            </div>
          </div>
        )}
        {cards.length > 1 && (
          <div className="intro-dots" aria-hidden="true">
            {cards.map((c, i) => <span key={c.title} className={i === index ? 'intro-dot on' : 'intro-dot'} />)}
          </div>
        )}
        <button className="intro-next" onClick={() => (last ? onDone(true) : setIndex(index + 1))}>
          {last ? (kind === 'howto' ? 'LET’S PLAY' : 'GOT IT') : 'NEXT'}
        </button>
      </div>
    </div>
  );
}
