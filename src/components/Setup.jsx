export function Setup({ vals, actions }) {
  return (
    <div className="setup-screen" data-screen-label="Rival setup">
      <div className="setup-title">{vals.setupTitle}</div>
      <div className="setup-blurb">{vals.setupBlurb}</div>
      <label className="player-name-label" htmlFor="player-name">YOUR NAME</label>
      <input
        id="player-name"
        className="player-name-input"
        value={vals.setupName}
        onChange={(event) => actions.setSetupName(event.target.value)}
        placeholder="e.g. Alex"
        autoComplete="name"
        maxLength={24}
      />
      <div className="secret-word-label">YOUR SECRET WORD</div>
    </div>
  );
}
