export function RivalLobby({ vals, actions }) {
  return (
    <div className="rival-lobby" data-screen-label="Rival lobby">
      <div>
        <div className="setup-title">Play a friend</div>
        <div className="setup-blurb">
          Create a private match and share its link, or enter a friend&rsquo;s code. You&rsquo;ll alternate one guess at a time.
        </div>
      </div>

      <button className="primary-lobby-btn" onClick={actions.beginCreateMatch}>CREATE A MATCH</button>

      <div className="lobby-divider"><span>OR JOIN</span></div>
      <label className="code-label" htmlFor="match-code">MATCH CODE</label>
      <input
        id="match-code"
        className="match-code-input"
        value={vals.joinCode}
        onChange={(event) => actions.setJoinCode(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') actions.beginJoinMatch(); }}
        placeholder="8 CHARACTERS"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck="false"
        maxLength={8}
      />
      <button className="secondary-lobby-btn" onClick={actions.beginJoinMatch}>JOIN MATCH</button>
      <div className="lobby-error" role="status">{vals.lobbyError}</div>
    </div>
  );
}
