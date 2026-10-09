import { useEffect, useState } from 'react';
import { APP_NAME, APP_STORE_URL, OPEN_IN_APP_ENABLED } from '../config.js';
import { buildAppLink, parseInvite } from '../game/platform.js';

// Shown instead of the game in any normal browser. Cinqle only plays inside the iOS app, so a shared
// link that lands here points people to the app and shows the code to enter if the app doesn't open itself.
export function GetTheApp() {
  const [invite] = useState(() => parseInvite(globalThis.location?.search));
  const [friendName, setFriendName] = useState('');
  const [copied, setCopied] = useState(false);
  const [openTried, setOpenTried] = useState(false);

  useEffect(() => {
    if (invite?.kind !== 'friend') return undefined;
    let cancelled = false;
    fetch(`/api/players/${invite.code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.name) setFriendName(data.name); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [invite]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: the code is shown on screen */ }
  };

  // Try the cinqle:// scheme. If the app opened, the page goes to the background; if we are still visible after
  // a moment the app is not installed or is too old to know the scheme, so say what to do.
  const openInApp = () => {
    window.location.href = buildAppLink(invite);
    window.setTimeout(() => { if (document.visibilityState === 'visible') setOpenTried(true); }, 1600);
  };

  let headline = `${APP_NAME} is an iPhone app`;
  let steps = null;
  if (invite?.kind === 'friend') {
    headline = friendName ? `${friendName} wants to play ${APP_NAME} with you` : `Add a friend on ${APP_NAME}`;
    steps = (
      <>
        <div className="landing-code-label">FRIEND ID</div>
        <button className="landing-code" onClick={copyCode} aria-label="Copy friend ID">{invite.code}</button>
        <div className="landing-note">
          {copied ? 'Copied.' : 'Tap the ID to copy it.'} Open {APP_NAME}, go to Multiplayer, and add this friend ID.
        </div>
      </>
    );
  } else if (invite?.kind === 'join') {
    headline = `You were invited to a ${APP_NAME} match`;
    steps = (
      <>
        <div className="landing-code-label">MATCH CODE</div>
        <button className="landing-code" onClick={copyCode} aria-label="Copy match code">{invite.code}</button>
        <div className="landing-note">
          {copied ? 'Copied.' : 'Tap the code to copy it.'} Open {APP_NAME}, go to Multiplayer, and join with this match code.
        </div>
      </>
    );
  }

  return (
    <div className="app-shell landing-shell" data-screen-label="Get the app">
      <img src="/cinqle-title.png" alt={APP_NAME} className="home-title-img" />
      <div className="landing-headline">{headline}</div>
      <div className="landing-sub">
        Guess the secret five-letter word, and play friends turn by turn. {APP_NAME} is only available in the iOS app.
      </div>
      {OPEN_IN_APP_ENABLED && (
        <>
          <button className="landing-store-btn landing-open-btn" onClick={openInApp}>OPEN IN {APP_NAME.toUpperCase()}</button>
          {openTried && (
            <div className="landing-note">
              Nothing opened? Install or update {APP_NAME} from the App Store, then try again.
            </div>
          )}
        </>
      )}
      <a className={OPEN_IN_APP_ENABLED ? 'landing-store-btn landing-store-alt' : 'landing-store-btn'} href={APP_STORE_URL}>GET {APP_NAME.toUpperCase()} ON THE APP STORE</a>
      {steps}
      <div className="landing-foot">Already have the app? Open it from your home screen.</div>
    </div>
  );
}
