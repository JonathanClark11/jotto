export function Game({ vals, actions }) {
  return (
    <div className="game-screen" data-screen-label="Game">
      {vals.isRival && (
        <div className={`turn-banner ${vals.yourTurn ? 'your-turn' : ''}`}>
          <span>{vals.matchStatus === 'waiting' ? 'WAITING FOR YOUR FRIEND' : (vals.yourTurn ? 'YOUR TURN' : 'NOT YOUR TURN')}</span>
          <span className="turn-code">{vals.matchCode}</span>
        </div>
      )}

      {vals.reviewing && (
        <button className="results-return-btn" onClick={actions.showResults}>VIEW RESULTS</button>
      )}

      {vals.isRival && vals.matchStatus === 'waiting' && (
        <div className="waiting-card">
          <div className="waiting-kicker">MATCH CREATED</div>
          <div className="waiting-code">{vals.matchCode}</div>
          <div className="waiting-copy">Share the private link with your friend. The game starts when they choose a secret word.</div>
          <button className="copy-invite-btn" onClick={actions.copyInvite}>
            {vals.inviteCopied ? 'LINK COPIED' : 'COPY INVITE LINK'}
          </button>
        </div>
      )}

      {vals.isDuel && vals.matchStatus !== 'waiting' && (
        <div className="duel-tabs">
          <div className="tab" style={vals.youTabStyle} onClick={() => actions.setView('you')}>
            YOUR GUESSES
          </div>
          <div className="tab" style={vals.rivalTabStyle} onClick={() => actions.setView('rival')}>
            <span>{vals.opponentName.toUpperCase()}</span>
            {vals.rivalBadge && <span className="rival-dot" />}
          </div>
        </div>
      )}

      {!(vals.isRival && vals.matchStatus === 'waiting') && <div className="history-scroll">
        {vals.isRival && !vals.yourTurn && (
          <div className="queued-guess-card">
            <strong>{vals.pendingGuess ? `${vals.pendingGuess} IS QUEUED` : 'NOT YOUR TURN'}</strong>
            <span>{vals.pendingGuess ? `You can replace it before ${vals.opponentName} guesses.` : `Type a guess now and it will play after ${vals.opponentName}.`}</span>
          </div>
        )}
        {vals.showYou && (
          <>
            {vals.wordsLeftText && <div className="words-left-card">{vals.wordsLeftText}</div>}
            {vals.histEmpty && <div className="empty-note">Make your first guess</div>}
            {vals.myRows.map((row) => (
              <div className="guess-row" key={row.key}>
                <div className="guess-row-letters">
                  {row.chars.map((c, i) => (
                    <span key={i} style={c.style}>
                      <span>{c.ch}</span>
                      {c.sup && <span style={c.supStyle}>{c.sup}</span>}
                    </span>
                  ))}
                </div>
                <div style={row.countStyle}>{row.count}</div>
              </div>
            ))}
          </>
        )}

        {vals.showRival && (
          <>
            <div className="your-word-label">
              YOUR WORD &middot; <span style={{ color: '#0E7C86' }}>{vals.mySecretSpaced}</span>
            </div>
            {vals.rivalEmpty && <div className="empty-note">Your friend hasn&rsquo;t guessed yet</div>}
            {vals.rivalRows.map((row) => (
              <div className="guess-row" key={row.key}>
                <div style={row.wordStyle}>{row.word}</div>
                <div style={row.countStyle}>{row.count}</div>
              </div>
            ))}
            {vals.isRival && vals.matchStatus === 'active' && !vals.yourTurn && (
              <div className="thinking-note">Waiting for {vals.opponentName}&rsquo;s guess&hellip;</div>
            )}
          </>
        )}
      </div>}
    </div>
  );
}
