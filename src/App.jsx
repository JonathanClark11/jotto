import { useMemo } from 'react';
import { useCinq } from './game/useCinq.js';
import { deriveView } from './game/deriveView.js';
import { Header } from './components/Header.jsx';
import { Home } from './components/Home.jsx';
import { Friends } from './components/Friends.jsx';
import { RivalLobby } from './components/RivalLobby.jsx';
import { Setup } from './components/Setup.jsx';
import { Game } from './components/Game.jsx';
import { Board } from './components/Board.jsx';
import { Result } from './components/Result.jsx';
import { StatsPanel } from './components/StatsPanel.jsx';

function App() {
  const { state, actions, secretList, showWordsLeft } = useCinq();
  const vals = useMemo(
    () => deriveView(state, actions, secretList, showWordsLeft),
    [state, actions, secretList, showWordsLeft],
  );

  return (
    <div className="app-shell">
      <Header
        showBack={vals.showBack}
        onHome={actions.goHome}
        headerLabel={vals.headerLabel}
        showStatsBtn={vals.showStatsBtn}
        onStats={actions.openStats}
      />

      {vals.isHome && <Home vals={vals} actions={actions} />}
      {vals.isFriends && <Friends vals={vals} actions={actions} />}
      {vals.isRivalLobby && <RivalLobby vals={vals} actions={actions} />}
      {vals.isSetup && <Setup vals={vals} actions={actions} />}
      {vals.isGame && <Game vals={vals} actions={actions} />}
      {vals.showBoard && <Board vals={vals} actions={actions} />}
      {vals.showResult && <Result vals={vals} actions={actions} />}
      {vals.showStats && <StatsPanel vals={vals} actions={actions} />}
    </div>
  );
}

export default App;
