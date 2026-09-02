export function Result({ vals, actions }) {
  return (
    <div className="result-overlay" data-screen-label="Result">
      <div style={vals.resultKickerStyle}>{vals.resultKicker}</div>
      <div className="reveal-row">
        {vals.revealTiles.map((t) => (
          <div key={t.key} style={t.style}>{t.ch}</div>
        ))}
      </div>
      <div className="result-sub">{vals.resultSub}</div>

      {vals.isDailyResult && (
        <>
          {vals.dailyStatsLoading ? (
            <div className="daily-loading">CALCULATING TODAY&rsquo;S RANK&hellip;</div>
          ) : (
            <>
              <div className="daily-rank">{vals.dailyRankLabel || 'FIRST RESULT TODAY'}</div>
              {vals.histBars.length > 0 && (
                <>
                  <div className="hist-row">
                    {vals.histBars.map((b) => (
                      <div className="hist-bar-col" key={b.key}>
                        <div style={b.style}></div>
                        <div style={b.labelStyle}>{b.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hist-caption">GUESSES &middot; COMPLETED PLAYERS TODAY</div>
                </>
              )}
              <div className="stats-row">
                <div className="stat">
                  <div className="stat-value">{vals.statPlayed}</div>
                  <div className="stat-label">PLAYERS</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{vals.statAvg}</div>
                  <div className="stat-label">AVG GUESSES</div>
                </div>
                <div className="stat">
                  <div className="stat-value accent">{vals.statRank}</div>
                  <div className="stat-label">YOUR RANK</div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {vals.playerStats?.gamesPlayed > 0 && vals.showRematch && (
        <div className="result-player-stats">
          <span>{vals.playerStats.gamesPlayed} GAMES</span>
          <span>{vals.playerStats.winRate}% WINS</span>
          <span>{vals.playerStats.averageGuesses ?? '–'} AVG GUESSES</span>
          <span>{vals.playerStats.averagePercentile ? `${vals.playerStats.averagePercentile}th PERCENTILE` : '– PERCENTILE'}</span>
        </div>
      )}

      <button className="review-game-btn" onClick={actions.reviewResult}>VIEW GAME</button>
      <button className="share-result-btn" onClick={actions.shareResult}>
        {vals.shareFeedback || 'SHARE RESULT'}
      </button>
      {vals.showRematch && (
        <button className="rematch-btn" onClick={actions.beginRematch}>{vals.rematchLabel}</button>
      )}
      {vals.showAgain && (
        <button className="play-again-btn" onClick={actions.playAgain}>PLAY AGAIN</button>
      )}
      <button className="home-btn hoverable" onClick={actions.goHome}>HOME</button>
    </div>
  );
}
