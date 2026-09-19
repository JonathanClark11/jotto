export function Friends({ vals, actions }) {
  const { activeFriendGames, friendList } = vals;
  const hasAny = activeFriendGames.length > 0 || friendList.length > 0;

  if (!hasAny) {
    return (
      <div className="friends-screen" data-screen-label="Friends">
        <div className="friends-empty">
          <div className="friends-empty-title">NO FRIENDS YET</div>
          <div className="friends-empty-sub">
            Invite a friend to a rival match and they&apos;ll appear here once you play.
          </div>
          <button className="friends-invite-btn" onClick={actions.startRival}>
            INVITE A FRIEND
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-screen" data-screen-label="Friends">
      {activeFriendGames.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">ACTIVE GAMES</div>
          {activeFriendGames.map((match) => (
            <button
              className={`friend-game-card card-hoverable${match.yourTurn ? ' friend-game-card--your-turn' : ''}`}
              key={match.code}
              onClick={() => actions.resumeRival(match.code, match.token)}
            >
              <div className="friend-game-card-top">
                <strong className="friend-game-card-name">{match.friendName}</strong>
                {match.yourTurn && <span className="your-turn-badge">YOUR TURN</span>}
              </div>
              <div className="friend-game-card-bot">
                <span className="friend-game-card-code">{match.code}</span>
                <span className="friend-game-card-status">{match.statusLabel}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {friendList.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">FRIENDS</div>
          {friendList.map((friend) => (
            <div className="friend-list-row" key={friend.friendName}>
              <div className="friend-list-info">
                <strong className="friend-list-name">{friend.friendName}</strong>
                {friend.lastPlayedLabel && (
                  <span className="friend-list-date">{friend.lastPlayedLabel}</span>
                )}
              </div>
              {friend.rematchMatch && (
                <button
                  className="friend-rematch-btn"
                  onClick={() => actions.startRematchFrom(
                    friend.rematchMatch.code,
                    friend.rematchMatch.token,
                    friend.friendName,
                  )}
                >
                  REMATCH
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
