export function Home({ vals, actions }) {
  return (
    <div className="home-screen" data-screen-label="Home">
      <img src="/cinqle-title.png" alt="Cinqle" className="home-title-img" />
      <div className="home-blurb">
        Guess the secret five-letter word. Every guess earns a count &mdash; how many of its letters are in the word.
      </div>
      <button className="home-help-btn hoverable" onClick={actions.openHowTo}>HOW TO PLAY</button>

      <button
        className={`mode-card card-hoverable ${vals.dailyComplete ? 'daily-card' : 'plain-card'}`}
        onClick={actions.startDaily}
      >
        <div className="mode-card-head">
          <div className={`mode-title ${vals.dailyComplete ? 'accent' : ''}`}>DAILY</div>
          <div className="mode-date">{vals.dailyDateLabel}</div>
        </div>
        <div className="mode-sub">{vals.dailySub}</div>
      </button>

      <button className="mode-card plain-card card-hoverable" onClick={actions.startSolo}>
        <div className="mode-title">SOLO</div>
        <div className="mode-sub">The computer picks a word. Crack it in as few guesses as you can.</div>
      </button>

      <button className="mode-card plain-card card-hoverable" onClick={actions.startRival}>
        <div className="mode-card-head">
          <div className="mode-title">MULTIPLAYER</div>
          {vals.yourTurnCount > 0 && (
            <span className="friends-turn-badge">{vals.yourTurnCount} YOUR TURN</span>
          )}
        </div>
        <div className="mode-sub">Play friends. Take turns guessing each other&rsquo;s secret word, rematch, and keep a friends list.</div>
      </button>

      {vals.playerStats?.gamesPlayed > 0 && (
        <div className="player-stats-card">
          <div className="player-stats-head">
            <span>YOUR RIVAL STATS</span>
            <strong>{vals.playerStats.playerName}</strong>
          </div>
          <div className="player-stats-grid">
            <div><strong>{vals.playerStats.gamesPlayed}</strong><span>GAMES</span></div>
            <div><strong>{vals.playerStats.winRate}%</strong><span>WINS</span></div>
            <div><strong>{vals.playerStats.averageGuesses ?? '–'}</strong><span>AVG GUESSES</span></div>
            <div><strong>{vals.playerStats.averagePercentile ? `${vals.playerStats.averagePercentile}th` : '–'}</strong><span>AVG PERCENTILE</span></div>
          </div>
          <div className="player-stats-foot">
            BEST {vals.playerStats.bestGame ?? '–'} &middot; CURRENT STREAK {vals.playerStats.currentStreak}
          </div>
        </div>
      )}

      {vals.hasDailyHistory && (
        <button className="daily-history-link" onClick={actions.openStats}>DAILY HISTORY &rsaquo;</button>
      )}

      <div className="home-footnote">5 LETTERS &middot; NO REPEATS</div>
      <div className="home-attribution">a game by Colin Graydon</div>
      <div className="home-privacy">
        <a href="/privacy" className="home-privacy-link">Privacy Policy</a>
      </div>
    </div>
  );
}
