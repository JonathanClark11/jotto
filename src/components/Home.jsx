export function Home({ vals, actions }) {
  return (
    <div className="home-screen" data-screen-label="Home">
      <div className="home-title">CINQ</div>
      <div className="home-blurb">
        Guess the secret five-letter word. Every guess earns a count &mdash; how many of its letters are in the word.
      </div>

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
        <div className="mode-title">RIVAL</div>
        <div className="mode-sub">Invite a friend. Take turns guessing each other&rsquo;s secret word.</div>
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

      {vals.friendMatches.length > 0 && (
        <div className="friend-games">
          <div className="friend-games-title">FRIEND GAMES</div>
          {vals.friendMatches.map((match) => (
            <button
              className="friend-game-row"
              key={match.code}
              onClick={() => actions.resumeRival(match.code, match.token)}
            >
              <span>
                <strong>{match.friendName}</strong>
                <small>{match.code}</small>
              </span>
              <span className={`friend-game-status ${match.yourTurn ? 'is-your-turn' : ''}`}>
                {match.statusLabel}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="home-footnote">5 LETTERS &middot; NO REPEATS</div>
    </div>
  );
}
