import { useMemo, useState, useSyncExternalStore } from 'react';
import { useCinq } from './game/useCinq.js';
import { deriveView } from './game/deriveView.js';
import { Header } from './components/Header.jsx';
import { Home } from './components/Home.jsx';
import { Multiplayer } from './components/Multiplayer.jsx';
import { FriendDetail } from './components/FriendDetail.jsx';
import { Setup } from './components/Setup.jsx';
import { Game } from './components/Game.jsx';
import { Board } from './components/Board.jsx';
import { Result } from './components/Result.jsx';
import { StatsPanel } from './components/StatsPanel.jsx';
import { Intro } from './components/Intro.jsx';
import { markIntroSeen, shouldShowIntro } from './game/intro.js';
import { clientMode } from './game/platform.js';
import { GetTheApp } from './components/GetTheApp.jsx';

function GameApp() {
  const { state, actions, secretList, showWordsLeft } = useCinq();
  const vals = useMemo(
    () => deriveView(state, actions, secretList, showWordsLeft),
    [state, actions, secretList, showWordsLeft],
  );

  // Intro currently open ('howto' | 'multiplayer' | null). The help button on Home reopens how-to.
  const [introOpen, setIntroOpen] = useState(null);
  const [mpChecked, setMpChecked] = useState(false);

  // How-to-play opens only when the HOW TO PLAY button is pressed. The multiplayer rules show once, the first
  // time someone starts or joins a match. Adjusting state during render is the React-sanctioned way to react.
  if (vals.isSetup && !mpChecked) {
    setMpChecked(true);
    if (shouldShowIntro('multiplayer')) setIntroOpen('multiplayer');
  }

  const closeIntro = () => {
    markIntroSeen(introOpen);
    setIntroOpen(null);
  };
  const homeActions = useMemo(() => ({ ...actions, openHowTo: () => setIntroOpen('howto') }), [actions]);

  return (
    <div className="app-shell">
      {vals.showHeader && (
        <Header
          showBack={vals.showBack}
          onHome={vals.isFriendDetail ? actions.closeFriend : actions.goHome}
          headerLabel={vals.headerLabel}
        />
      )}

      {vals.isHome && <Home vals={vals} actions={homeActions} />}
      {vals.isMultiplayer && <Multiplayer vals={vals} actions={actions} />}
      {vals.isFriendDetail && vals.friendDetail && <FriendDetail vals={vals} actions={actions} />}
      {vals.isSetup && <Setup vals={vals} actions={actions} />}
      {vals.isGame && <Game vals={vals} actions={actions} />}
      {vals.showBoard && <Board vals={vals} actions={actions} />}
      {vals.showResult && <Result vals={vals} actions={actions} />}
      {introOpen && <Intro key={introOpen} kind={introOpen} onDone={closeIntro} />}
      {vals.showStats && <StatsPanel vals={vals} actions={actions} />}
    </div>
  );
}

const subscribeNever = () => () => {};

// The game only runs inside the iOS app. Browsers get the "get the app" page. The server render and the first
// hydration pass render a blank shell so the native app never flashes the landing page.
function App() {
  const mode = useSyncExternalStore(subscribeNever, clientMode, () => 'pending');
  if (mode === 'pending') return <div className="app-shell" />;
  if (mode === 'landing') return <GetTheApp />;
  return <GameApp />;
}

export default App;
