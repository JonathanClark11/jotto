import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { deriveView, formatTimeLeft, turnWarnLevel } from '../src/game/deriveView.js';
import { todayKey } from '../src/game/logic.js';

// deriveView reads daily history from localStorage; stub it for node.
let store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
beforeEach(() => { store = {}; });

const INK = '#1C1B18', ACC = '#0E7C86', DIM = '#D5D1C7', FADE = '#B7B2A6';

function makeState(overrides = {}) {
  return {
    screen: 'game', mode: 'solo', view: 'you',
    input: '', setupInput: '', setupName: '', mySecret: 'BRAVE', rivalSecret: '',
    myGuesses: [], rivalGuesses: [], marks: {}, groups: [],
    tool: 'type', pendingTool: null, pendingLetters: [],
    matchStatus: 'active', matchBusy: false, yourTurn: true,
    result: null, reviewing: false, error: '',
    friends: [], savedMatches: [], removedFriends: [],
    profileName: '', opponentName: '',
    ...overrides,
  };
}

const actions = {
  tapLetter: (ch) => `letter:${ch}`,
  tapTool: (id) => `tool:${id}`,
  removeGroup: (i) => `remove:${i}`,
};

const view = (state, secretList = [], showWordsLeft = false) => deriveView(state, actions, secretList, showWordsLeft);
const key = (v, ch) => v.letters.find((l) => l.ch === ch);

// --- screen flags and in-progress state ---

test('in-progress solo game sets screen flags and header label', () => {
  const v = view(makeState({ myGuesses: [{ word: 'ABCDE', count: 1 }] }));
  assert.equal(v.isGame, true);
  assert.equal(v.isRival, false);
  assert.equal(v.isHome, false);
  assert.equal(v.showBack, true);
  assert.equal(v.headerLabel, 'SOLO · GUESS 2');
  assert.equal(v.showResult, false);
  assert.equal(v.showBoard, true);
});

test('home screen hides header and board', () => {
  const v = view(makeState({ screen: 'home' }));
  assert.equal(v.isHome, true);
  assert.equal(v.showHeader, false);
  assert.equal(v.showBack, false);
  assert.equal(v.headerLabel, '');
  assert.equal(v.showBoard, false);
});

test('header labels for daily, setup, multiplayer and friend screens', () => {
  assert.equal(view(makeState({ mode: 'daily' })).headerLabel, 'DAILY · GUESS 1');
  assert.equal(view(makeState({ mode: 'rival' })).headerLabel, 'RIVAL · GUESS 1');
  assert.equal(view(makeState({ screen: 'setup' })).headerLabel, 'RIVAL · PICK A WORD');
  assert.equal(view(makeState({ screen: 'multiplayer' })).headerLabel, 'MULTIPLAYER');
  assert.equal(view(makeState({ screen: 'friend' })).headerLabel, 'FRIEND');
});

test('input tiles always number five and mark filled vs empty', () => {
  const v = view(makeState({ input: 'BR' }));
  assert.equal(v.tiles.length, 5);
  assert.deepEqual(v.tiles.map((t) => t.ch), ['B', 'R', '', '', '']);
  assert.equal(v.tiles[0].style.border, '1.5px solid ' + INK);
  assert.equal(v.tiles[4].style.border, '1.5px dashed ' + FADE);
});

// --- action button ---

test('GUESS action is enabled only with a full 5-letter input', () => {
  assert.equal(view(makeState({ input: 'BRAV' })).actionStyle.cursor, 'default');
  const full = view(makeState({ input: 'BRAVE' }));
  assert.equal(full.actionStyle.cursor, 'pointer');
  assert.equal(full.actionLabel, 'GUESS');
});

test('action is disabled while a match request is busy', () => {
  const v = view(makeState({ input: 'BRAVE', matchBusy: true }));
  assert.equal(v.actionStyle.cursor, 'default');
  assert.equal(v.actionLabel, 'SAVING…');
});

test('rival game off-turn queues guesses; waiting match disables input', () => {
  const offTurn = view(makeState({ mode: 'rival', yourTurn: false, input: 'BRAVE' }));
  assert.equal(offTurn.actionLabel, 'QUEUE GUESS');
  assert.equal(view(makeState({ mode: 'rival', yourTurn: false, pendingGuess: 'BRAVE' })).actionLabel, 'UPDATE QUEUED GUESS');
  const waiting = view(makeState({ mode: 'rival', matchStatus: 'waiting', input: 'BRAVE' }));
  assert.equal(waiting.actionStyle.cursor, 'default');
  assert.equal(waiting.showBoard, false);
});

test('setup action needs a name and a full word', () => {
  const noName = view(makeState({ screen: 'setup', setupInput: 'BRAVE', setupName: '  ' }));
  assert.equal(noName.actionStyle.cursor, 'default');
  const ready = view(makeState({ screen: 'setup', setupInput: 'BRAVE', setupName: 'Jo' }));
  assert.equal(ready.actionStyle.cursor, 'pointer');
  assert.equal(ready.actionLabel, 'START MATCH');
  assert.equal(ready.tiles.map((t) => t.ch).join(''), 'BRAVE');
});

// --- guess rows ---

test('guess rows style zero and hot (4+) counts', () => {
  const v = view(makeState({ myGuesses: [{ word: 'ABCDE', count: 0 }, { word: 'FGHIJ', count: 4 }, { word: 'KLMNO', count: 2 }] }));
  assert.deepEqual(v.myRows.map((r) => r.count), ['0', '4', '2']);
  assert.equal(v.myRows[0].wordStyle.textDecoration, 'line-through');
  assert.equal(v.myRows[1].countStyle.background, ACC);
  assert.equal(v.myRows[2].countStyle.background, undefined);
  assert.equal(v.histEmpty, false);
  assert.equal(view(makeState()).histEmpty, true);
});

test('row letters reflect circled, crossed and auto-eliminated marks', () => {
  const v = view(makeState({
    myGuesses: [{ word: 'ABCDE', count: 1 }, { word: 'FGHIJ', count: 0 }],
    marks: { A: 'has', B: 'elim' },
  }));
  const [a, b, c] = v.myRows[0].chars;
  assert.equal(a.style.color, ACC);                 // circled
  assert.equal(b.style.textDecoration, 'line-through'); // manually crossed
  // A is circled and accounts for the full count of 1, so C is auto-crossed
  assert.equal(c.style.color, DIM);
  assert.equal(c.style.textDecoration, 'line-through');
  // zero-count guess letters are auto-crossed
  assert.equal(v.myRows[1].chars[0].style.textDecoration, 'line-through');
});

test('group membership adds a superscript count to uncrossed row letters', () => {
  const v = view(makeState({
    myGuesses: [{ word: 'ABCDE', count: 2 }],
    groups: [{ letters: ['A', 'B'], count: 1 }],
  }));
  assert.equal(v.myRows[0].chars[0].sup, '1');
  assert.ok(v.myRows[0].chars[0].supStyle);
  assert.equal(v.myRows[0].chars[2].sup, '');
  assert.equal(v.hasGroups, true);
  assert.equal(v.groupChips[0].label, '1 of A B');
});

test('rival rows ignore the player marks', () => {
  const v = view(makeState({ rivalGuesses: [{ word: 'ABCDE', count: 2 }], marks: { A: 'has' } }));
  assert.notEqual(v.rivalRows[0].chars[0].style.color, ACC);
  assert.equal(v.rivalEmpty, false);
});

// --- keyboard ---

test('keyboard has 26 letters in rows of 10, 9 and 7', () => {
  const v = view(makeState());
  assert.equal(v.letters.length, 26);
  assert.deepEqual(v.keyboardRows.map((r) => r.length), [10, 9, 7]);
  assert.equal(v.keyboardRows[0][0].ch, 'Q');
  assert.equal(key(v, 'A').onTap(), 'letter:A');
});

test('keyboard keys show elim, has and auto-elim status', () => {
  const v = view(makeState({
    myGuesses: [{ word: 'FGHIJ', count: 0 }],
    marks: { A: 'has', B: 'elim' },
  }));
  assert.equal(key(v, 'A').style.background, ACC);
  assert.equal(key(v, 'B').style.textDecoration, 'line-through');
  assert.equal(key(v, 'F').style.textDecoration, 'line-through'); // auto-elim from 0-count guess
  assert.equal(key(v, 'Z').style.textDecoration, undefined);
});

test('keyboard tells explicit ✕, explicit ✓ and auto-eliminated letters apart', () => {
  const v = view(makeState({
    myGuesses: [{ word: 'FGHIJ', count: 0 }],
    marks: { A: 'has', B: 'elim' },
  }));
  // explicit ✕: red tint + red strike + corner ✕
  assert.equal(key(v, 'B').style.color, '#B4443A');
  assert.equal(key(v, 'B').style.background, '#FBECE9');
  assert.deepEqual(key(v, 'B').marker, { glyph: '✕', color: '#B4443A' });
  // explicit ✓: filled teal + corner ✓
  assert.equal(key(v, 'A').style.background, ACC);
  assert.equal(key(v, 'A').marker.glyph, '✓');
  // auto-eliminated: quiet fade, no corner mark, and not the explicit red
  assert.equal(key(v, 'F').style.color, DIM);
  assert.equal(key(v, 'F').marker, null);
  assert.notEqual(key(v, 'F').style.color, key(v, 'B').style.color);
  // untouched letters carry no mark
  assert.equal(key(v, 'Z').marker, null);
});

test('an explicit ✕ stays red even if the game would also auto-eliminate that letter', () => {
  const v = view(makeState({ myGuesses: [{ word: 'ABCDE', count: 0 }], marks: { B: 'elim' } }));
  assert.equal(key(v, 'B').style.color, '#B4443A');
  assert.equal(key(v, 'C').style.color, DIM);
});

test('guess-row letters use red for an explicit ✕ and the quiet fade for auto-eliminated ones', () => {
  const v = view(makeState({
    myGuesses: [{ word: 'ABCDE', count: 1 }, { word: 'FGHIJ', count: 0 }],
    marks: { A: 'has', B: 'elim' },
  }));
  const [, b, c] = v.myRows[0].chars;
  assert.equal(b.style.color, '#B4443A');
  assert.equal(c.style.color, DIM);
});

test('the ✕ tool pill is red when active, ✓ stays teal', () => {
  const elim = view(makeState({ tool: 'elim' })).tools.find((t) => t.key === 'elim');
  const has = view(makeState({ tool: 'has' })).tools.find((t) => t.key === 'has');
  assert.equal(elim.style.background, '#B4443A');
  assert.equal(has.style.background, ACC);
  assert.equal(view(makeState({ tool: 'type' })).tools.find((t) => t.key === 'elim').style.background, 'transparent');
});

test('a circled letter stays circled even if a 0-count guess contains it', () => {
  const v = view(makeState({ myGuesses: [{ word: 'ABCDE', count: 0 }], marks: { A: 'has' } }));
  assert.equal(key(v, 'A').style.background, ACC);
  assert.equal(key(v, 'B').style.textDecoration, 'line-through');
});

test('repeated letters in a guess are handled and autoElim marks them once', () => {
  const v = view(makeState({ myGuesses: [{ word: 'EERIE', count: 0 }] }));
  assert.equal(v.myRows[0].chars.length, 5);
  assert.equal(key(v, 'E').style.textDecoration, 'line-through');
  assert.equal(key(v, 'R').style.textDecoration, 'line-through');
});

test('letters in several groups get a joined badge and the first group color', () => {
  const v = view(makeState({ groups: [{ letters: ['A', 'B'], count: 1 }, { letters: ['A', 'C'], count: 2 }] }));
  assert.equal(key(v, 'A').badge, '1·2');
  assert.equal(key(v, 'B').badge, '1');
  assert.equal(key(v, 'A').badgeStyle.color, '#C58A2D');
  assert.equal(key(v, 'Z').badge, '');
});

test('pending group letters get an outline; keyboard is plain off the game screen', () => {
  const v = view(makeState({ pendingTool: '2', pendingLetters: ['Q'] }));
  assert.ok(key(v, 'Q').style.outline.startsWith('2px dashed'));
  assert.equal(v.pendingHint, 'Tap letters, then “2 OF” again to save the group');
  const home = view(makeState({ screen: 'home', marks: { A: 'has' } }));
  assert.notEqual(key(home, 'A').style.background, ACC);
  assert.equal(home.pendingHint, '');
});

test('setup keyboard highlights letters already typed', () => {
  const v = view(makeState({ screen: 'setup', setupInput: 'BR' }));
  assert.equal(key(v, 'B').style.background, INK);
  assert.notEqual(key(v, 'Z').style.background, INK);
});

test('tool pills mark the active tool, preferring a pending tool', () => {
  const plain = view(makeState({ tool: 'elim' }));
  assert.equal(plain.tools.length, 6);
  assert.equal(plain.tools.find((t) => t.key === 'elim').style.background, '#B4443A'); // ✕ is red, not teal
  assert.equal(plain.tools.find((t) => t.key === 'type').style.background, 'transparent');
  const pending = view(makeState({ tool: 'elim', pendingTool: '3' }));
  assert.equal(pending.tools.find((t) => t.key === '3').style.background, '#0E7C86');
  assert.equal(pending.tools.find((t) => t.key === 'elim').style.background, 'transparent');
  assert.equal(pending.tools[0].onTap(), 'tool:type');
});

// --- words remaining ---

test('wordsLeftText counts consistent candidates with singular/plural wording', () => {
  const state = makeState({ myGuesses: [{ word: 'ABCDE', count: 5 }] });
  const list = ['ABCDE', 'EDCBA', 'FGHIJ'];
  assert.equal(view(state, list, true).wordsLeftText, '2 possible words remaining');
  assert.equal(view(makeState({ myGuesses: [{ word: 'ABCDE', count: 0 }] }), list, true).wordsLeftText, '1 possible word remaining');
  assert.equal(view(state, list, false).wordsLeftText, '');
  assert.equal(view(state, [], true).wordsLeftText, '');
  assert.equal(view(makeState({ screen: 'home' }), list, true).wordsLeftText, '');
});

// --- results: won / lost / daily ---

test('solo win shows SOLVED with singular and plural guess wording', () => {
  const won = view(makeState({ rivalSecret: 'BRAVE', result: { won: true, n: 4 } }));
  assert.equal(won.resultKicker, 'SOLVED');
  assert.equal(won.resultSub, 'You cracked it in 4 guesses.');
  assert.equal(won.resultKickerStyle.color, ACC);
  assert.equal(won.showResult, true);
  assert.equal(won.showAgain, true);
  assert.equal(won.showRematch, false);
  assert.equal(view(makeState({ rivalSecret: 'BRAVE', result: { won: true, n: 1 } })).resultSub, 'You cracked it in 1 guess.');
});

test('reviewing a finished game hides the result panel', () => {
  assert.equal(view(makeState({ result: { won: true, n: 3 }, reviewing: true })).showResult, false);
});

test('rival win uses the opponent name, with a fallback', () => {
  const named = view(makeState({ mode: 'rival', opponentName: 'Sam', rivalSecret: 'BRAVE', result: { won: true, n: 3, multiplayer: true } }));
  assert.equal(named.resultSub, 'You cracked Sam’s word in 3 guesses.');
  assert.equal(named.showRematch, true);
  assert.equal(named.showAgain, false);
  const anon = view(makeState({ mode: 'rival', rivalSecret: 'BRAVE', result: { won: true, n: 3, multiplayer: true } }));
  assert.equal(anon.resultSub, 'You cracked your friend’s word in 3 guesses.');
});

test('loss shows the opponent winning and reveals their word styling', () => {
  const v = view(makeState({ mode: 'rival', opponentName: 'Sam', mySecret: 'BRAVE', rivalSecret: 'CRANE', result: { won: false, n: 1, multiplayer: true } }));
  assert.equal(v.resultKicker, 'SAM WINS');
  assert.equal(v.resultSub, 'Sam cracked BRAVE in 1 guess. Their word was:');
  assert.equal(v.resultKickerStyle.color, '#B4443A');
  assert.equal(v.revealTiles.map((t) => t.ch).join(''), 'CRANE');
  assert.equal(v.revealTiles[0].style.background, undefined);
  assert.equal(v.revealTiles[0].style.color, INK);
});

test('loss without an opponent name falls back to FRIEND', () => {
  const v = view(makeState({ rivalSecret: 'CRANE', result: { won: false, n: 2 } }));
  assert.equal(v.resultKicker, 'FRIEND WINS');
  assert.equal(v.resultSub.startsWith('Your friend cracked'), true);
});

test('won reveal tiles are filled; no result means no reveal tiles', () => {
  const won = view(makeState({ rivalSecret: 'CRANE', result: { won: true, n: 2 } }));
  assert.equal(won.revealTiles.length, 5);
  assert.equal(won.revealTiles[0].style.background, ACC);
  const none = view(makeState({ rivalSecret: 'CRANE' }));
  assert.deepEqual(none.revealTiles, []);
  assert.equal(none.resultKicker, '');
});

test('daily result shows the daily message and hides again/rematch', () => {
  const v = view(makeState({ mode: 'daily', result: { won: true, daily: true, n: 5 } }));
  assert.equal(v.isDailyResult, true);
  assert.equal(v.resultKicker, 'SOLVED');
  assert.equal(v.resultSub, 'You cracked today’s word in 5 guesses.');
  assert.equal(v.showAgain, false);
  assert.equal(v.showRematch, false);
  assert.equal(v.histBars.length, 0);
  assert.equal(v.statPlayed, '–');
});

// --- daily stats / share view ---

test('daily stats build a histogram, overflow bucket and rank', () => {
  const v = view(makeState({
    mode: 'daily',
    result: { won: true, daily: true, n: 3 },
    dailyStats: {
      totalPlayers: 10, averageGuesses: 4.5, rank: 2,
      buckets: [{ guesses: 3, players: 4 }, { guesses: 5, players: 2 }, { guesses: 14, players: 1 }],
    },
  }));
  assert.equal(v.histBars.length, 12);
  assert.equal(v.histBars[11].label, '12+');
  assert.equal(v.histBars[2].style.background, ACC);      // your bucket (3)
  assert.equal(v.histBars[2].style.height, 54);           // tallest bar
  assert.equal(v.histBars[0].style.height, 3);            // minimum height
  assert.equal(v.histBars[11].style.height, Math.round((1 / 4) * 54));
  assert.equal(v.statPlayed, '10');
  assert.equal(v.statAvg, '4.5');
  assert.equal(v.statRank, '2/10');
  assert.equal(v.dailyRankLabel, 'RANK 2 OF 10 TODAY');
});

test('daily stats without rank or average fall back to dashes', () => {
  const v = view(makeState({
    result: { won: true, daily: true, n: 20 },
    dailyStats: { totalPlayers: 3, buckets: [] },
  }));
  assert.equal(v.statAvg, '–');
  assert.equal(v.statRank, '–');
  assert.equal(v.dailyRankLabel, '');
  assert.equal(v.histBars.length, 10);
  assert.equal(v.histBars[9].label, '10+');
  assert.equal(v.histBars[9].style.background, ACC);      // n clamps into the last bucket
});

test('daily stats are ignored for non-daily results', () => {
  const v = view(makeState({ result: { won: true, n: 3 }, dailyStats: { totalPlayers: 5, buckets: [] } }));
  assert.equal(v.isDailyResult, false);
  assert.equal(v.histBars.length, 0);
  assert.equal(v.statPlayed, '–');
});

// --- local history ---

test('with no history the daily card is not complete', () => {
  const v = view(makeState({ screen: 'home' }));
  assert.equal(v.dailyComplete, false);
  assert.equal(v.hasDailyHistory, false);
  assert.deepEqual(v.localHistory, []);
  assert.match(v.dailyDateLabel, /^[A-Z]{3} \d{1,2}$/);
  assert.match(v.dailySub, /^One word for everyone/);
});

test('today’s history record marks the daily complete and sorts history newest first', () => {
  const today = todayKey();
  store['cinq-daily-history'] = JSON.stringify([
    { date: '2026-09-02', n: 4, won: true },
    { date: today, n: 1, won: true },
    { date: '2026-09-03', n: 6, won: true, puzzleNumber: 99 },
  ]);
  const v = view(makeState({ screen: 'home' }));
  assert.equal(v.dailyComplete, true);
  assert.equal(v.hasDailyHistory, true);
  assert.match(v.dailySub, /^Solved in 1 guess\. /);
  assert.equal(v.localHistory[0].date, today);
  assert.equal(v.localHistory[1].puzzleNumber, 99);        // existing number kept
  assert.equal(v.localHistory[2].puzzleNumber, 2);         // derived from date (epoch 2026-09-01)
  store['cinq-daily-history'] = JSON.stringify([{ date: today, n: 3, won: true }]);
  assert.match(view(makeState({ screen: 'home' })).dailySub, /^Solved in 3 guesses\. /);
});

test('corrupt history storage is treated as empty', () => {
  store['cinq-daily-history'] = '{not json';
  const v = view(makeState({ screen: 'home' }));
  assert.equal(v.dailyComplete, false);
  assert.deepEqual(v.localHistory, []);
});

// --- multiplayer lists ---

test('friend matches get status labels and sort by friend name', () => {
  const v = view(makeState({
    screen: 'multiplayer',
    savedMatches: [
      { code: 'B', friendName: 'zed', status: 'waiting', updatedAt: '2026-09-01' },
      { code: 'A', friendName: 'Amy', status: 'active', yourTurn: true, updatedAt: '2026-09-01' },
      { code: 'C', friendName: 'amy', status: 'finished', winner: 'host', role: 'host', updatedAt: '2026-09-02' },
      { code: 'D', friendName: 'Bob', status: 'active', pendingGuess: 'ABCDE' },
      { code: 'E', friendName: 'Cy', status: 'active' },
      { code: 'F', friendName: 'Di', status: 'finished', winner: 'guest', role: 'host' },
    ],
  }));
  const label = (code) => v.friendMatches.find((m) => m.code === code).statusLabel;
  assert.equal(label('B'), 'WAITING FOR FRIEND');
  assert.equal(label('A'), 'YOUR TURN');
  assert.equal(label('C'), 'YOU WON');
  assert.equal(label('D'), 'GUESS QUEUED');
  assert.equal(label('E'), 'NOT YOUR TURN');
  assert.equal(label('F'), 'GAME FINISHED');
  assert.equal(v.friendMatches[v.friendMatches.length - 1].code, 'B');
  assert.equal(v.friendMatches[0].code, 'C');             // same name, newest first
});

test('active friend games exclude finished ones and put your turn first', () => {
  const v = view(makeState({
    screen: 'multiplayer',
    savedMatches: [
      { code: 'A', friendName: 'Amy', status: 'active', updatedAt: '2026-09-03' },
      { code: 'B', friendName: 'Bob', status: 'active', yourTurn: true, updatedAt: '2026-09-01' },
      { code: 'C', friendName: 'Cy', status: 'finished', updatedAt: '2026-09-04' },
    ],
  }));
  assert.deepEqual(v.activeFriendGames.map((m) => m.code), ['B', 'A']);
  assert.equal(v.yourTurnCount, 1);
  assert.equal(v.lobbyError, '');
});

test('lobby error only surfaces on the multiplayer screen', () => {
  assert.equal(view(makeState({ screen: 'multiplayer', error: 'bad code' })).lobbyError, 'bad code');
  assert.equal(view(makeState({ screen: 'game', error: 'bad code' })).lobbyError, '');
  assert.equal(view(makeState({ screen: 'game', error: 'bad code' })).error, 'bad code');
});

test('friendDetail is null outside the friend screen', () => {
  assert.equal(view(makeState()).friendDetail, null);
  assert.equal(view(makeState({ screen: 'friend' })).friendDetail, null); // no selectedFriend
});

// --- rival view tabs and setup copy ---

test('rival tabs switch which board is shown', () => {
  const you = view(makeState({ mode: 'rival', view: 'you' }));
  assert.equal(you.showYou, true);
  assert.equal(you.showRival, false);
  const rival = view(makeState({ mode: 'rival', view: 'rival' }));
  assert.equal(rival.showYou, false);
  assert.equal(rival.showRival, true);
  assert.equal(rival.rivalTabStyle.background, INK);
  assert.equal(view(makeState({ mode: 'solo', view: 'rival' })).showYou, true);
});

test('setup copy depends on profile and rematch intent', () => {
  assert.equal(view(makeState({ screen: 'setup' })).setupTitle, 'Your name and secret word');
  const named = view(makeState({ screen: 'setup', profileName: 'Jo' }));
  assert.equal(named.setupTitle, 'Pick your secret word');
  assert.equal(named.hasProfileName, true);
  assert.match(view(makeState({ screen: 'setup', setupIntent: 'rematch', opponentName: 'Sam' })).setupBlurb, /rematch with Sam/);
  assert.match(view(makeState({ screen: 'setup', setupIntent: 'rematch' })).setupBlurb, /your friend/);
  assert.equal(view(makeState({ rematchCode: 'XYZ' })).rematchLabel, 'JOIN REMATCH');
  assert.equal(view(makeState()).rematchLabel, 'REMATCH');
});

// --- turn countdown, warnings and forfeit labels (issue #44) ---
const DAY = 86400000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const startedAgo = (ms) => new Date(NOW - ms).toISOString();
const on = { expiryEnabled: true, now: NOW };
const viewAt = (state, opts = on) => deriveView(state, actions, [], false, opts);
const rivalState = (o = {}) => makeState({
  mode: 'rival', matchStatus: 'active', matchCode: 'ABCD1234', yourTurn: true,
  opponentName: 'Sam', matchUpdatedAt: startedAgo(0), ...o,
});

test('formatTimeLeft labels and boundaries', () => {
  assert.equal(formatTimeLeft(startedAgo(0), NOW), '14 DAYS LEFT');
  assert.equal(formatTimeLeft(startedAgo(11 * DAY + 1), NOW), '2 DAYS LEFT');
  assert.equal(formatTimeLeft(startedAgo(12 * DAY), NOW), '2 DAYS LEFT');
  assert.equal(formatTimeLeft(startedAgo(12 * DAY + 1), NOW), '1 DAY LEFT');
  assert.equal(formatTimeLeft(startedAgo(13 * DAY), NOW), '1 DAY LEFT');
  assert.equal(formatTimeLeft(startedAgo(13 * DAY + 1), NOW), 'LESS THAN A DAY LEFT');
  assert.equal(formatTimeLeft(startedAgo(14 * DAY - 1), NOW), 'LESS THAN A DAY LEFT');
  assert.equal(formatTimeLeft(startedAgo(14 * DAY), NOW), 'EXPIRED');
  assert.equal(formatTimeLeft(startedAgo(20 * DAY), NOW), 'EXPIRED');
  assert.equal(formatTimeLeft('', NOW), '');
  assert.equal(formatTimeLeft('garbage', NOW), '');
});

test('turnWarnLevel flips at the 3 day and 1 day thresholds', () => {
  assert.equal(turnWarnLevel(startedAgo(10 * DAY), NOW), null); // exactly 4 days left
  assert.equal(turnWarnLevel(startedAgo(10 * DAY + 1), NOW), 3);
  assert.equal(turnWarnLevel(startedAgo(12 * DAY + 1), NOW), 1);
  assert.equal(turnWarnLevel(startedAgo(15 * DAY), NOW), 1);
  assert.equal(turnWarnLevel(undefined, NOW), null);
});

test('banner on your turn shows days left and escalates', () => {
  let b = viewAt(rivalState()).turnBanner;
  assert.equal(b.text, 'YOUR TURN · 14 DAYS LEFT');
  assert.equal(b.level, '');
  assert.equal(viewAt(rivalState()).turnToast, null);

  const warn = viewAt(rivalState({ matchUpdatedAt: startedAgo(11 * DAY - 1) }));
  assert.equal(warn.turnBanner.text, 'YOUR TURN · 3 DAYS LEFT · PLAY OR FORFEIT');
  assert.equal(warn.turnBanner.level, 'warn');
  assert.deepEqual(warn.turnToast.key, 'ABCD1234:3');

  const urgent = viewAt(rivalState({ matchUpdatedAt: startedAgo(13 * DAY + 5) }));
  assert.equal(urgent.turnBanner.text, 'YOUR TURN · LESS THAN A DAY LEFT · PLAY OR FORFEIT');
  assert.equal(urgent.turnBanner.level, 'urgent');
  assert.equal(urgent.turnToast.key, 'ABCD1234:1');

  const expired = viewAt(rivalState({ matchUpdatedAt: startedAgo(15 * DAY) }));
  assert.equal(expired.turnBanner.text, 'YOUR TURN · EXPIRED');
  assert.equal(expired.turnToast, null);
});

test('banner on opponent turn shows a small time line', () => {
  const b = viewAt(rivalState({ yourTurn: false, matchUpdatedAt: startedAgo(2 * DAY) })).turnBanner;
  assert.equal(b.text, 'NOT YOUR TURN');
  assert.equal(b.sub, 'Sam has 12 days to play');
  const one = viewAt(rivalState({ yourTurn: false, matchUpdatedAt: startedAgo(12 * DAY + 1) })).turnBanner;
  assert.equal(one.sub, 'Sam has 1 day to play');
  const less = viewAt(rivalState({ yourTurn: false, matchUpdatedAt: startedAgo(13 * DAY + 1) })).turnBanner;
  assert.equal(less.sub, 'Sam has less than a day to play');
  assert.equal(viewAt(rivalState({ yourTurn: false })).turnToast, null);
});

test('no countdown for non-active matches or missing updatedAt', () => {
  assert.equal(viewAt(rivalState({ matchStatus: 'waiting' })).turnBanner, null);
  assert.equal(viewAt(rivalState({ matchStatus: 'finished' })).turnBanner, null);
  assert.equal(viewAt(rivalState({ matchUpdatedAt: '' })).turnBanner, null);
  assert.equal(viewAt(makeState()).turnBanner, null);
});

test('everything is hidden when TURN_EXPIRY_ENABLED is false', () => {
  const off = { expiryEnabled: false, now: NOW };
  const old = startedAgo(13 * DAY + 5);
  const v = viewAt(rivalState({
    matchUpdatedAt: old,
    savedMatches: [{ code: 'ABCD1234', token: 't', friendName: 'Sam', status: 'active', yourTurn: true, role: 1, updatedAt: old }],
  }), off);
  assert.equal(v.turnBanner, null);
  assert.equal(v.turnToast, null);
  assert.equal(v.activeFriendGames[0].statusLabel, 'YOUR TURN');
  // default (no opts) follows the config constant, which ships false
  assert.equal(deriveView(rivalState({ matchUpdatedAt: old }), actions, [], false).turnBanner, null);
});

test('friend cards append time left only at or under the first threshold', () => {
  const card = (ago, extra = {}) => viewAt(makeState({
    savedMatches: [{ code: 'AAAA1111', token: 't', friendName: 'Sam', status: 'active', yourTurn: true, role: 1, updatedAt: startedAgo(ago), ...extra }],
  })).activeFriendGames[0].statusLabel;
  assert.equal(card(5 * DAY), 'YOUR TURN');
  assert.equal(card(10 * DAY), 'YOUR TURN');
  assert.equal(card(10 * DAY + 1), 'YOUR TURN · 3 DAYS LEFT');
  assert.equal(card(13 * DAY + 5), 'YOUR TURN · LESS THAN A DAY LEFT');
  assert.equal(card(11 * DAY, { yourTurn: false }), 'NOT YOUR TURN · 3 DAYS LEFT');
  assert.equal(card(11 * DAY, { status: 'waiting', yourTurn: false }), 'WAITING FOR FRIEND');
});

test('friend history shows forfeit labels only when flagged and enabled', () => {
  const friend = { friendName: 'Sam', friendCode: 'SAM1' };
  const mk = (extra) => ({ code: 'M1', token: 't', friendName: 'Sam', friendCode: 'SAM1', status: 'finished', role: 1, winner: 1, updatedAt: startedAgo(DAY), ...extra });
  const label = (matches, opts = on) => viewAt(makeState({
    screen: 'friend', selectedFriend: friend, friends: [{ friendCode: 'SAM1', name: 'Sam' }], savedMatches: matches,
  }), opts).friendDetail.matches[0].resultLabel;
  assert.equal(label([mk({})]), 'WIN');
  assert.equal(label([mk({ forfeit: true })]), 'WIN (FORFEIT)');
  assert.equal(label([mk({ forfeit: true, winner: 2 })]), 'LOSS (FORFEIT)');
  assert.equal(label([mk({ forfeit: true })], { expiryEnabled: false, now: NOW }), 'WIN');
});
