export function Multiplayer({ vals, actions }) {
  const { activeFriendGames, friendList } = vals;
  const editingName = !vals.hasProfileName || vals.profileEditing;

  return (
    <div className="multiplayer-screen" data-screen-label="Multiplayer">
      <div className="mp-profile">
        {editingName ? (
          <>
            <label className="player-name-label mp-name-label" htmlFor="profile-name">
              {vals.hasProfileName ? 'CHANGE YOUR NAME' : 'YOUR NAME'}
            </label>
            <div className="mp-inline-row">
              <input
                id="profile-name"
                className="player-name-input mp-name-input"
                value={vals.profileNameInput}
                onChange={(event) => actions.setProfileNameInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') actions.saveProfileName(); }}
                placeholder="e.g. Alex"
                autoComplete="name"
                maxLength={24}
              />
              <button className="mp-small-btn mp-small-btn--solid" onClick={actions.saveProfileName} disabled={vals.profileBusy}>
                {vals.profileBusy ? '…' : 'SAVE'}
              </button>
              {vals.hasProfileName && (
                <button className="mp-small-btn" onClick={actions.cancelEditProfile}>CANCEL</button>
              )}
            </div>
            {!vals.hasProfileName && (
              <div className="mp-hint">Pick it once. Friends see this name and you won&rsquo;t have to type it again.</div>
            )}
          </>
        ) : (
          <>
            <div className="mp-profile-top">
              <div>
                <div className="mp-kicker">PLAYING AS</div>
                <div className="mp-name">{vals.profileName}</div>
              </div>
              <button className="mp-link-btn" onClick={actions.editProfile}>EDIT</button>
            </div>
            <div className="mp-friend-id-row">
              <div>
                <div className="mp-kicker">YOUR FRIEND ID</div>
                <div className="mp-friend-id">{vals.friendCode || '······'}</div>
              </div>
              <button className="mp-small-btn mp-small-btn--solid" onClick={actions.shareFriendId} disabled={!vals.friendCode}>
                {vals.friendIdCopied ? 'SHARED' : 'SHARE'}
              </button>
            </div>
          </>
        )}
      </div>

      <button className="primary-lobby-btn" onClick={() => actions.beginCreateMatch()}>
        NEW MATCH
      </button>

      <div className="mp-join">
        <label className="code-label" htmlFor="match-code">JOIN WITH A MATCH CODE</label>
        <div className="mp-inline-row">
          <input
            id="match-code"
            className="match-code-input mp-code-input"
            value={vals.joinCode}
            onChange={(event) => actions.setJoinCode(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') actions.beginJoinMatch(); }}
            placeholder="8 CHARACTERS"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            maxLength={8}
          />
          <button className="mp-small-btn mp-small-btn--solid" onClick={actions.beginJoinMatch}>JOIN</button>
        </div>
        <div className="lobby-error" role="status">{vals.lobbyError}</div>
      </div>

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

      <div className="friends-section">
        <div className="friends-section-title">FRIENDS</div>
        {friendList.length === 0 && (
          <div className="mp-empty">
            No friends yet. Share your friend ID, or add a friend&rsquo;s ID below. People you play will show up here too.
          </div>
        )}
        {friendList.map((friend) => (
          <div className="friend-list-row" key={friend.friendCode || friend.friendName}>
            <div className="friend-list-info">
              <strong className="friend-list-name">{friend.friendName}</strong>
              <span className="friend-list-date">
                {[friend.friendCode, friend.lastPlayedLabel].filter(Boolean).join(' · ')}
              </span>
            </div>
            <button className="friend-rematch-btn" onClick={() => actions.challengeFriend(friend)}>
              {friend.rematchMatch ? 'REMATCH' : 'CHALLENGE'}
            </button>
            {friend.friendCode && !friend.rematchMatch && (
              <button
                className="mp-remove-btn"
                onClick={() => actions.dropFriend(friend.friendCode)}
                aria-label={`Remove ${friend.friendName}`}
              >
                &#x2715;
              </button>
            )}
          </div>
        ))}

        <label className="code-label mp-add-label" htmlFor="friend-id">ADD A FRIEND BY ID</label>
        <div className="mp-inline-row">
          <input
            id="friend-id"
            className="match-code-input mp-code-input"
            value={vals.friendInput}
            onChange={(event) => actions.setFriendInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') actions.addFriend(); }}
            placeholder="6 CHARACTERS"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            maxLength={6}
          />
          <button className="mp-small-btn mp-small-btn--solid" onClick={actions.addFriend} disabled={vals.friendBusy}>
            {vals.friendBusy ? '…' : 'ADD'}
          </button>
        </div>
        <div className="lobby-error" role="status">{vals.friendError}</div>
      </div>
    </div>
  );
}
