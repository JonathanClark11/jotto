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
