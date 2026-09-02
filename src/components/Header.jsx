export function Header({ showBack, onHome, headerLabel }) {
  return (
    <div className="header-row">
      <div className="header-left">
        {showBack && (
          <button className="back-btn hoverable" onClick={onHome} aria-label="Back to home">
            &#8249;
          </button>
        )}
        <div className="logo">JORTAL</div>
      </div>
      <div className="header-label">{headerLabel}</div>
    </div>
  );
}
