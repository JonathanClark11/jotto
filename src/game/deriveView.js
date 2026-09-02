import { autoElim, groupColor, GROUP_TOOL_COLORS, shared, todayKey, loadHistory } from './logic.js';

const INK = '#1C1B18', ACC = '#0E7C86', TILE = '#F1EFE9',
  DIM = '#D5D1C7', FADE = '#B7B2A6', AMBER = '#C58A2D';

// Pure translation of game state -> everything the screens need to render.
// Mirrors the Claude Design prototype's renderVals(), so every visual rule
// (colors, badge math, auto-cross-out logic) stays exactly as designed.
export function deriveView(state, actions, secretList, showWordsLeft) {
  const s = state;
  const autoE = autoElim(s.myGuesses, s.marks);
  const isHome = s.screen === 'home', isSetup = s.screen === 'setup';
  const isRivalLobby = s.screen === 'rivalLobby', isGame = s.screen === 'game';
  const isRival = isGame && s.mode === 'rival';
  const isDuel = isRival;
  const inputEnabled = !isRival || s.matchStatus === 'active';
  const inputStr = isSetup ? s.setupInput : s.input;

  const tileBase = { width: 52, height: 60, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 };
  const tiles = [];
  for (let i = 0; i < 5; i++) {
    const ch = inputStr[i] || '';
    tiles.push({
      ch,
      style: { ...tileBase, ...(ch ? { border: '1.5px solid ' + INK } : { border: '1.5px dashed ' + FADE }) },
    });
  }

  const mkRows = (arr, useMarks) => arr.map((g) => {
    const zero = g.count === 0, hot = g.count >= 4;
    const chars = g.word.split('').map((ch) => {
      const st = {
        fontSize: 19, fontWeight: 600, width: '1.42em', textAlign: 'center',
        color: zero ? FADE : INK, position: 'relative',
        textDecoration: zero ? 'line-through' : 'none', textDecorationColor: DIM,
      };
      let sup = '', supStyle = null;
      if (useMarks) {
        const circled = s.marks[ch] === 'has';
        const crossed = !circled && (s.marks[ch] === 'elim' || autoE[ch]);
        if (crossed) Object.assign(st, { color: DIM, textDecoration: 'line-through', textDecorationColor: FADE });
        else if (circled) Object.assign(st, {
          color: ACC, textDecoration: 'none',
          boxShadow: 'inset 0 0 0 1.5px ' + ACC, borderRadius: '50%',
          width: '1.32em', height: '1.32em', lineHeight: '1.32em',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 .05em', boxSizing: 'border-box',
        });
        if (!circled && !crossed) {
          const gi = s.groups.findIndex((gr) => gr.letters.indexOf(ch) >= 0);
          const grp = gi >= 0 ? s.groups[gi] : null;
          if (grp) {
            const gc = groupColor(gi).c;
            Object.assign(st, { outline: '1.5px dashed ' + gc, outlineOffset: '-1px', borderRadius: 7 });
            sup = String(grp.count);
            supStyle = { position: 'absolute', top: -4, right: -2, fontSize: 9, fontWeight: 800, color: gc };
          }
        }
      }
      return { ch, style: st, sup, supStyle };
    });
    return {
      key: g.word,
      word: g.word,
      chars,
      wordStyle: {
        fontSize: 19, letterSpacing: '.42em', fontWeight: 600,
        color: zero ? FADE : INK,
        textDecoration: zero ? 'line-through' : 'none', textDecorationColor: DIM,
      },
      count: String(g.count),
      countStyle: hot
        ? { width: 28, height: 28, borderRadius: '50%', background: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flex: 'none' }
        : { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #C9C5BB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: zero ? FADE : '#5C594F', flex: 'none', boxSizing: 'border-box' },
    };
  });
  const myRows = mkRows(s.myGuesses, true);
  const rivalRows = mkRows(s.rivalGuesses, false);

  const alpha = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('');
  const letters = alpha.map((ch) => {
    const st = { height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, position: 'relative', cursor: 'pointer', userSelect: 'none', background: TILE, color: INK };
    let badge = '';
    let badgeColor = ACC;
    if (isGame) {
      const mark = s.marks[ch];
      const memberIdx = [];
      s.groups.forEach((g, gi2) => { if (g.letters.indexOf(ch) >= 0) memberIdx.push(gi2); });
      if (mark === 'elim' || (autoE[ch] && mark !== 'has')) Object.assign(st, { background: '#FAF9F6', color: DIM, textDecoration: 'line-through' });
      else if (mark === 'has') Object.assign(st, { background: ACC, color: '#fff' });
      if (memberIdx.length) {
        badgeColor = groupColor(memberIdx[0]).c;
        st.boxShadow = 'inset 0 0 0 1.5px ' + badgeColor;
        badge = memberIdx.map((gi2) => s.groups[gi2].count).join('·');
      }
      if (s.pendingTool && s.pendingLetters.indexOf(ch) >= 0) { st.outline = '2px dashed ' + AMBER; st.outlineOffset = '-2px'; }
    } else if (isSetup && s.setupInput.indexOf(ch) >= 0) {
      Object.assign(st, { background: INK, color: '#FAF9F6' });
    }
    return {
      ch, style: st, badge,
      badgeStyle: { position: 'absolute', top: 2, right: 5, fontSize: 9, fontWeight: 800, color: badgeColor },
      onTap: () => actions.tapLetter(ch),
    };
  });
  const keyboardRows = [letters.slice(0, 10), letters.slice(10, 19), letters.slice(19)];

  const toolDefs = [
    { id: 'type', label: 'TYPE' }, { id: 'elim', label: '✕' }, { id: 'has', label: '✓' },
    { id: '1', label: '1 OF' }, { id: '2', label: '2 OF' }, { id: '3', label: '3 OF' },
  ];
  const tools = toolDefs.map((t) => {
    const active = s.pendingTool ? s.pendingTool === t.id : s.tool === t.id;
    const tc = GROUP_TOOL_COLORS[t.id] ? GROUP_TOOL_COLORS[t.id].c : ACC;
    return {
      key: t.id,
      label: t.label,
      onTap: () => actions.tapTool(t.id),
      style: {
        padding: '8px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        userSelect: 'none', letterSpacing: '.04em', flex: '1', textAlign: 'center',
        border: '1.5px solid ' + (active ? tc : '#DAD6CC'),
        background: active ? tc : 'transparent', color: active ? '#fff' : '#5C594F',
        boxSizing: 'border-box',
      },
    };
  });

  const groupChips = s.groups.map((g, i) => {
    const gc = groupColor(i);
    return {
      key: i,
      label: g.count + ' of ' + g.letters.join(' '),
      onRemove: () => actions.removeGroup(i),
      style: {
        display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
        borderRadius: 999, background: gc.bg, fontSize: 11, fontWeight: 700,
        color: gc.c, letterSpacing: '.06em',
      },
    };
  });

  let wordsLeftText = '';
  if (showWordsLeft && isGame && secretList.length) {
    const n = secretList.filter((w) => s.myGuesses.every((g) => shared(g.word, w) === g.count)).length;
    wordsLeftText = n.toLocaleString() + (n === 1 ? ' possible word remaining' : ' possible words remaining');
  }

  let headerLabel = '';
  if (isGame) {
    const modeName = s.mode === 'solo' ? 'SOLO' : (s.mode === 'daily' ? 'DAILY' : 'RIVAL');
    headerLabel = modeName + ' · GUESS ' + (s.myGuesses.length + 1);
  }
  if (isSetup) headerLabel = 'RIVAL · PICK A WORD';
  if (isRivalLobby) headerLabel = 'RIVAL · FRIEND MATCH';

  const todayKeyVal = todayKey();
  const hist = loadHistory();
  const todayRec = hist.find((h) => h.date === todayKeyVal);
  const dailyComplete = Boolean(todayRec);
  const dailyDateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const dailySub = todayRec
    ? 'Solved in ' + todayRec.n + (todayRec.n === 1 ? ' guess. ' : ' guesses. ') + 'Tap to see today’s real results.'
    : 'One word for everyone, every day. Solve it and compare with completed players.';

  const tabBase = { flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', cursor: 'pointer', userSelect: 'none' };
  const youTabStyle = { ...tabBase, ...(s.view === 'you' ? { background: INK, color: '#FAF9F6' } : { background: TILE, color: '#5C594F' }) };
  const rivalTabStyle = { ...tabBase, ...(s.view === 'rival' ? { background: INK, color: '#FAF9F6' } : { background: TILE, color: '#5C594F' }) };

  const canAct = isSetup
    ? s.setupName.trim().length > 0 && s.setupInput.length === 5 && !s.matchBusy
    : s.input.length === 5 && inputEnabled && !s.matchBusy;
  const actionStyle = {
    flex: 1, padding: '15px 0', borderRadius: 10,
    background: canAct ? INK : '#D8D4CA', color: '#FAF9F6',
    fontSize: 15, fontWeight: 700, letterSpacing: '.14em', textAlign: 'center',
    cursor: canAct ? 'pointer' : 'default', userSelect: 'none',
  };

  const r = s.result;
  const revealBase = { width: 46, height: 54, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 };
  const revealTiles = (r ? s.rivalSecret : '').split('').map((ch, i) => ({
    key: i,
    ch,
    style: { ...revealBase, ...(r && r.won ? { background: ACC, color: '#fff' } : { border: '1.5px solid ' + INK, color: INK }) },
  }));
  let resultKicker = '', resultSub = '';
  if (r && r.daily) {
    resultKicker = 'SOLVED';
    resultSub = 'You cracked today’s word in ' + r.n + (r.n === 1 ? ' guess.' : ' guesses.');
  } else if (r && r.won) {
    resultKicker = 'SOLVED';
    resultSub = (s.mode === 'solo' ? 'You cracked it in ' : `You cracked ${s.opponentName || 'your friend'}’s word in `) + r.n + (r.n === 1 ? ' guess.' : ' guesses.');
  } else if (r) {
    resultKicker = (s.opponentName || 'FRIEND').toUpperCase() + ' WINS';
    resultSub = (s.opponentName || 'Your friend') + ' cracked ' + s.mySecret + ' in ' + r.n + (r.n === 1 ? ' guess.' : ' guesses.') + ' Their word was:';
  }

  const isDailyResult = !!(r && r.daily);
  let histBars = [], statPlayed = '–', statAvg = '–', statRank = '–', dailyRankLabel = '';
  if (isDailyResult && s.dailyStats?.totalPlayers) {
    const actual = s.dailyStats.buckets || [];
    const byGuess = new Map(actual.map((bucket) => [Number(bucket.guesses), Number(bucket.players)]));
    const maxRecorded = Math.max(10, ...actual.map((bucket) => Number(bucket.guesses)));
    const lastBucket = Math.min(12, maxRecorded);
    const buckets = [];
    for (let guesses = 1; guesses < lastBucket; guesses += 1) {
      buckets.push({ guesses, players: byGuess.get(guesses) || 0, label: String(guesses) });
    }
    let overflow = 0;
    for (const bucket of actual) if (Number(bucket.guesses) >= lastBucket) overflow += Number(bucket.players);
    buckets.push({ guesses: lastBucket, players: overflow, label: lastBucket + '+' });
    const maxPlayers = Math.max(1, ...buckets.map((bucket) => bucket.players));
    const yourBucket = Math.min(r.n, lastBucket);
    histBars = buckets.map((bucket) => ({
      key: bucket.guesses,
      label: bucket.label,
      style: {
        width: 17, height: Math.max(3, Math.round((bucket.players / maxPlayers) * 54)),
        background: bucket.guesses === yourBucket ? ACC : '#E4E1DA', borderRadius: 3,
      },
      labelStyle: { fontSize: 9, fontWeight: bucket.guesses === yourBucket ? 800 : 600, color: bucket.guesses === yourBucket ? ACC : FADE },
    }));
    statPlayed = String(s.dailyStats.totalPlayers);
    statAvg = String(s.dailyStats.averageGuesses ?? '–');
    statRank = s.dailyStats.rank ? s.dailyStats.rank + '/' + s.dailyStats.totalPlayers : '–';
    dailyRankLabel = s.dailyStats.rank
      ? 'RANK ' + s.dailyStats.rank + ' OF ' + s.dailyStats.totalPlayers + ' TODAY'
      : '';
  }

  const friendMatches = (s.savedMatches || []).slice().sort((a, b) => {
    const nameOrder = (a.friendName || '').localeCompare(b.friendName || '', undefined, { sensitivity: 'base' });
    if (nameOrder) return nameOrder;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  }).map((match) => {
    let statusLabel = 'NOT YOUR TURN';
    if (match.status === 'waiting') statusLabel = 'WAITING FOR FRIEND';
    else if (match.status === 'finished') statusLabel = match.winner === match.role ? 'YOU WON' : 'GAME FINISHED';
    else if (match.yourTurn) statusLabel = 'YOUR TURN';
    else if (match.pendingGuess) statusLabel = 'GUESS QUEUED';
    return { ...match, statusLabel };
  });

  return {
    isHome, isSetup, isRivalLobby, isGame, isDuel, isRival,
    dailyDateLabel, dailySub, dailyComplete,
    isDailyResult, dailyRankLabel, dailyStatsLoading: s.dailyStatsLoading,
    histBars, statPlayed, statAvg, statRank,
    showAgain: !!(r && !r.daily && !r.multiplayer),
    showRematch: !!(r && r.multiplayer),
    rematchLabel: s.rematchCode ? 'JOIN REMATCH' : 'REMATCH',
    showBoard: isSetup || (isGame && (!isRival || s.matchStatus !== 'waiting')),
    showBack: !isHome,
    headerLabel,
    youTabStyle, rivalTabStyle,
    rivalBadge: s.rivalNew,
    showYou: !isDuel || s.view === 'you', showRival: isDuel && s.view === 'rival',
    histEmpty: s.myGuesses.length === 0, rivalEmpty: s.rivalGuesses.length === 0,
    myRows, rivalRows,
    mySecretSpaced: s.mySecret.split('').join(' '),
    thinking: s.thinking,
    wordsLeftText,
    matchCode: s.matchCode,
    matchStatus: s.matchStatus,
    yourTurn: s.yourTurn,
    opponentJoined: s.opponentJoined,
    inviteCopied: s.inviteCopied,
    matchBusy: s.matchBusy,
    friendMatches,
    joinCode: s.joinCode,
    lobbyError: isRivalLobby ? s.error : '',
    setupName: s.setupName,
    setupTitle: 'Your name and secret word',
    setupBlurb: s.setupIntent === 'rematch'
      ? `Choose a fresh word for your rematch with ${s.opponentName || 'your friend'}.`
      : 'Introduce yourself, then choose the word your friend will try to crack.',
    myName: s.myName,
    opponentName: s.opponentName || 'Friend',
    pendingGuess: s.pendingGuess,
    reviewing: s.reviewing,
    tiles, letters, keyboardRows, tools,
    groupChips, hasGroups: s.groups.length > 0,
    pendingHint: s.pendingTool ? 'Tap letters, then “' + s.pendingTool + ' OF” again to save the group' : '',
    error: s.error,
    actionLabel: isSetup
      ? (s.matchBusy ? 'CONNECTING…' : 'START MATCH')
      : (s.matchBusy ? 'SAVING…' : (isRival && !s.yourTurn ? (s.pendingGuess ? 'UPDATE QUEUED GUESS' : 'QUEUE GUESS') : 'GUESS')),
    actionStyle,
    showResult: !!r && !s.reviewing,
    resultKicker,
    resultKickerStyle: { fontSize: 13, letterSpacing: '.24em', fontWeight: 800, color: r && r.won ? ACC : '#B4443A' },
    resultSub,
    revealTiles,
    playerStats: s.playerStats,
    playerStatsLoading: s.playerStatsLoading,
    shareFeedback: s.shareFeedback,
  };
}
