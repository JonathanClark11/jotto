export function FriendDetail({ vals, actions }) {
  const f = vals.friendDetail;
  return (
    <div className="friend-detail-screen" data-screen-label="Friend">
      <div className="mp-profile">
        <div className="mp-kicker">FRIEND</div>
        <div className="mp-name">{f.friendName}</div>
        {f.friendCode && <div className="friend-detail-id">{f.friendCode}</div>}
        <div className="h2h-row">
          <div className="h2h-cell">
            <strong>{f.wins}</strong>
            <span>YOUR WINS</span>
          </div>
          <div className="h2h-cell">
            <strong>{f.losses}</strong>
            <span>{f.friendName.toUpperCase()} WINS</span>
          </div>
          <div className="h2h-cell">
            <strong>{f.played}</strong>
            <span>PLAYED</span>
          </div>
        </div>
      </div>

      <button className="primary-lobby-btn" onClick={() => actions.challengeFriend(f)}>
        {f.rematchMatch ? 'REMATCH' : 'CHALLENGE'}
      </button>

      <div className="friends-section">
        <div className="friends-section-title">MATCH HISTORY</div>
        {f.matches.length === 0 && (
          <div className="mp-empty">No matches with {f.friendName} yet.</div>
        )}
        {f.matches.map((match) => (
          <button
            className="friend-game-card card-hoverable"
            key={match.code}
            onClick={() => actions.resumeRival(match.code, match.token)}
          >
            <div className="friend-game-card-top">
              <strong className="friend-game-card-name">{match.dateLabel}</strong>
              <span className={`result-pill ${match.finished ? (match.won ? 'result-pill--win' : 'result-pill--loss') : ''}`}>
                {match.resultLabel}
              </span>
            </div>
            <div className="friend-game-card-bot">
              <span className="friend-game-card-code">{match.code}</span>
              <span className="friend-game-card-status">{match.counts}</span>
            </div>
          </button>
        ))}
      </div>

      <button className="remove-friend-btn" onClick={actions.removeSelectedFriend}>
        REMOVE {f.friendName.toUpperCase()}
      </button>
    </div>
  );
}
