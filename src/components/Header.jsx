export function Header({ showBack, onHome, headerLabel, showStatsBtn, onStats }) {
  return (
    <div className="header-row">
      <div className="header-left">
        {showBack && (
          <button className="back-btn hoverable" onClick={onHome} aria-label="Back to home">
            &#8249;
          </button>
        )}
        <div className="logo">CINQ</div>
      </div>
      {showStatsBtn
        ? <button className="stats-btn hoverable" onClick={onStats} aria-label="Your stats">STATS</button>
        : <div className="header-label">{headerLabel}</div>
      }
    </div>
  );
}
