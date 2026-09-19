function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export function StatsPanel({ vals, actions }) {
  const { localStats: s, localHistory } = vals;

  return (
    <div className="stats-overlay">
      <div className="stats-panel-head">
        <div className="stats-panel-title">YOUR STATS</div>
        <button className="stats-close-btn" onClick={actions.closeStats} aria-label="Close">&#x2715;</button>
      </div>

      {s.total === 0 ? (
        <div className="stats-empty">Complete your first daily puzzle to see stats.</div>
      ) : (
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-value accent">{s.currentStreak}</div>
            <div className="stat-label">STREAK</div>
          </div>
          <div className="stat">
            <div className="stat-value">{s.bestStreak}</div>
            <div className="stat-label">BEST</div>
          </div>
          <div className="stat">
            <div className="stat-value">{s.avgGuesses ?? '–'}</div>
            <div className="stat-label">AVG GUESSES</div>
          </div>
          <div className="stat">
            <div className="stat-value">{s.total}</div>
            <div className="stat-label">PLAYED</div>
          </div>
          <div className="stat">
            <div className="stat-value">{s.winPct}%</div>
            <div className="stat-label">WIN %</div>
          </div>
        </div>
      )}

      <div className="stats-section-title">HISTORY</div>

      {localHistory.length === 0 ? (
        <div className="stats-empty">No daily puzzles completed yet.</div>
      ) : (
        <div className="stats-history-scroll">
          {localHistory.map((record) => (
            <div className="stats-history-row" key={record.date}>
              <div className="stats-history-left">
                <span className="stats-puzzle-num">#{record.puzzleNumber}</span>
                <span className="stats-history-date">{fmtDate(record.date)}</span>
              </div>
              <div className="stats-history-right">
                <span className="stats-history-guesses">{record.n} {record.n === 1 ? 'guess' : 'guesses'}</span>
                <span className={`stats-result-badge ${record.won !== false ? 'stats-badge-win' : 'stats-badge-loss'}`}>
                  {record.won !== false ? 'WIN' : 'DNF'}
                </span>
                {record.guesses && (
                  <button
                    className="stats-share-btn"
                    onClick={() => actions.shareHistoryItem(record.date)}
                    aria-label="Share result"
                  >
                    {vals.shareCopiedDate === record.date ? '✓' : 'SHARE'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="home-btn hoverable stats-done-btn" onClick={actions.closeStats}>DONE</button>
    </div>
  );
}
