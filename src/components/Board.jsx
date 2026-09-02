export function Board({ vals, actions }) {
  return (
    <div className={`board ${vals.isRival && vals.matchStatus !== 'active' ? 'board-disabled' : ''}`}>
      <div className="tiles-row">
        {vals.tiles.map((t, i) => (
          <div key={i} style={t.style}>{t.ch}</div>
        ))}
      </div>
      <div className="error-line">{vals.error}</div>

      {vals.isGame && (
        <>
          <div className="tools-row">
            {vals.tools.map((tool) => (
              <div key={tool.key} className="tool-pill" style={tool.style} onClick={tool.onTap}>
                {tool.label}
              </div>
            ))}
          </div>
          {vals.pendingHint && <div className="pending-hint">{vals.pendingHint}</div>}
          {vals.hasGroups && (
            <div className="group-chips">
              {vals.groupChips.map((g) => (
                <div key={g.key} style={g.style}>
                  <span>{g.label}</span>
                  <button className="group-chip-remove" onClick={g.onRemove}>&#10005;</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="keyboard">
        {vals.keyboardRows.map((row, rowIndex) => (
          <div className={`keyboard-row keyboard-row-${rowIndex + 1}`} key={rowIndex}>
            {row.map((L) => (
              <div key={L.ch} className="key" style={L.style} onClick={L.onTap}>
                <span>{L.ch}</span>
                {L.badge && <span style={L.badgeStyle}>{L.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="bottom-row">
        <button className="backspace-btn hoverable" onClick={actions.backspace}>&#9003;</button>
        <div className="action-btn" style={vals.actionStyle} onClick={actions.action}>
          {vals.actionLabel}
        </div>
      </div>
    </div>
  );
}
