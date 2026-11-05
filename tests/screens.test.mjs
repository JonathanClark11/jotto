import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/jsx-hooks.mjs', import.meta.url);

// deriveView reads daily history from localStorage; stub it for node.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { mount } = await import('./helpers/react-stub.mjs');
const { Home } = await import('../src/components/Home.jsx');
const { StatsPanel } = await import('../src/components/StatsPanel.jsx');
const { Board } = await import('../src/components/Board.jsx');
const { Setup } = await import('../src/components/Setup.jsx');
const { deriveView } = await import('../src/game/deriveView.js');
const { computeLocalStats, todayKey } = await import('../src/game/logic.js');

// Walks the element tree a component returned and collects every element that matches.
function findAll(node, match, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, match, out));
  else if (node && typeof node === 'object' && node.props) {
    if (match(node)) out.push(node);
    findAll(node.props.children, match, out);
  }
  return out;
}

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}

const byClass = (tree, cls) => findAll(tree, (n) => new RegExp(`(^|\\s)${cls}(\\s|$)`).test(n.props.className ?? ''));
const render = (Component, vals, actions = {}) => mount(() => Component({ vals, actions })).tree;

// ---- Home ----

const homeVals = (over = {}) => ({
  dailyComplete: false, dailyDateLabel: 'OCT 23', dailySub: 'One word for everyone.', yourTurnCount: 0,
  playerStats: null, hasDailyHistory: false, ...over,
});

test('Home renders Daily, Solo and Multiplayer cards that call their handlers', () => {
  const calls = [];
  const actions = {
    openHowTo: () => calls.push('howto'), startDaily: () => calls.push('daily'), startSolo: () => calls.push('solo'),
    startRival: () => calls.push('rival'), openStats: () => calls.push('stats'),
  };
  const tree = render(Home, homeVals(), actions);
  const cards = byClass(tree, 'mode-card');
  assert.deepEqual(cards.map((c) => textOf(byClass(c, 'mode-title')[0])), ['DAILY', 'SOLO', 'MULTIPLAYER']);
  assert.match(textOf(cards[0]), /OCT 23/);
  assert.match(textOf(cards[0]), /One word for everyone\./);
  cards.forEach((c) => c.props.onClick());
  byClass(tree, 'home-help-btn')[0].props.onClick();
  assert.deepEqual(calls, ['daily', 'solo', 'rival', 'howto']);
});

test('Home daily card highlights only once today is complete', () => {
  const open = byClass(render(Home, homeVals()), 'mode-card')[0];
  assert.match(open.props.className, /plain-card/);
  assert.equal(byClass(open, 'accent').length, 0);
  const done = byClass(render(Home, homeVals({ dailyComplete: true })), 'mode-card')[0];
  assert.match(done.props.className, /daily-card/);
  assert.equal(byClass(done, 'accent').length, 1);
});

test('Home shows the YOUR TURN badge only when games are waiting', () => {
  assert.equal(byClass(render(Home, homeVals()), 'friends-turn-badge').length, 0);
  assert.equal(textOf(byClass(render(Home, homeVals({ yourTurnCount: 3 })), 'friends-turn-badge')[0]), '3 YOUR TURN');
});

test('Home daily history link and rival stats appear only with data', () => {
  assert.equal(byClass(render(Home, homeVals()), 'daily-history-link').length, 0);
  assert.equal(byClass(render(Home, homeVals()), 'player-stats-card').length, 0);
  assert.equal(byClass(render(Home, homeVals({ playerStats: { gamesPlayed: 0 } })), 'player-stats-card').length, 0);

  let opened = 0;
  const playerStats = { gamesPlayed: 4, playerName: 'Sam', winRate: 75, averageGuesses: null, averagePercentile: 0, bestGame: null, currentStreak: 2 };
  const tree = render(Home, homeVals({ hasDailyHistory: true, playerStats }), { openStats: () => { opened += 1; } });
  byClass(tree, 'daily-history-link')[0].props.onClick();
  assert.equal(opened, 1);
  const text = textOf(byClass(tree, 'player-stats-card')[0]);
  assert.match(text, /Sam/);
  assert.match(text, /4GAMES/);
  assert.match(text, /75%WINS/);
  assert.match(text, /–AVG GUESSES/);
  assert.match(text, /–AVG PERCENTILE/);
  assert.match(text, /BEST – · CURRENT STREAK 2/);
});

// ---- StatsPanel ----

const statsVals = (history, over = {}) => ({ localStats: computeLocalStats(history), localHistory: history, shareCopiedDate: null, ...over });
const statValues = (tree) => Object.fromEntries(byClass(tree, 'stat').map((s) => [textOf(byClass(s, 'stat-label')[0]), textOf(byClass(s, 'stat-value')[0])]));
const dayKey = (offset) => {
  const d = new Date(todayKey() + 'T12:00:00');
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('StatsPanel with zero games shows both empty states and no stat grid', () => {
  const tree = render(StatsPanel, statsVals([]));
  assert.equal(byClass(tree, 'stats-grid').length, 0);
  assert.equal(byClass(tree, 'stats-empty').length, 2);
  assert.doesNotMatch(textOf(tree), /NaN|Infinity|undefined/);
});

test('StatsPanel shows a typical record with wins, DNFs and per-row share buttons', () => {
  const history = [
    { date: '2026-10-03', puzzleNumber: 12, n: 1, won: true, guesses: [] },
    { date: '2026-10-02', puzzleNumber: 11, n: 6, won: false },
    { date: '2026-10-01', puzzleNumber: 10, n: 4, won: true, guesses: [] },
  ];
  const shared = [];
  const tree = render(StatsPanel, statsVals(history, { shareCopiedDate: '2026-10-03' }), { shareHistoryItem: (d) => shared.push(d) });
  const values = statValues(tree);
  assert.equal(values.PLAYED, '3');
  assert.equal(values['WIN %'], '67%');
  assert.doesNotMatch(textOf(tree), /NaN|Infinity|undefined/);
  const rows = byClass(tree, 'stats-history-row');
  assert.equal(rows.length, 3);
  assert.match(textOf(rows[0]), /#12/);
  assert.match(textOf(rows[0]), /OCT 3/);
  assert.match(textOf(rows[0]), /1 guess(?!es)/);
  assert.match(textOf(rows[1]), /6 guesses/);
  assert.equal(textOf(byClass(rows[0], 'stats-result-badge')[0]), 'WIN');
  assert.equal(textOf(byClass(rows[1], 'stats-result-badge')[0]), 'DNF');
  assert.match(byClass(rows[1], 'stats-result-badge')[0].props.className, /stats-badge-loss/);
  // Share only for records that kept their guesses; the copied row flips to a check.
  assert.equal(byClass(rows[1], 'stats-share-btn').length, 0);
  assert.equal(textOf(byClass(rows[0], 'stats-share-btn')[0]), '✓');
  assert.equal(textOf(byClass(rows[2], 'stats-share-btn')[0]), 'SHARE');
  byClass(rows[2], 'stats-share-btn')[0].props.onClick();
  assert.deepEqual(shared, ['2026-10-01']);
});

test('StatsPanel close and DONE both call closeStats', () => {
  let closed = 0;
  const tree = render(StatsPanel, statsVals([]), { closeStats: () => { closed += 1; } });
  byClass(tree, 'stats-close-btn')[0].props.onClick();
  byClass(tree, 'stats-done-btn')[0].props.onClick();
  assert.equal(closed, 2);
});

test('StatsPanel handles a long streak and an all-DNF record without NaN or division by zero', () => {
  const streak = Array.from({ length: 400 }, (_, i) => ({ date: dayKey(i), puzzleNumber: 400 - i, n: 3, won: true }));
  const long = render(StatsPanel, statsVals(streak));
  const values = statValues(long);
  assert.equal(values.STREAK, '400');
  assert.equal(values.BEST, '400');
  assert.equal(values['WIN %'], '100%');
  assert.doesNotMatch(textOf(long), /NaN|Infinity|undefined/);
  assert.equal(byClass(long, 'stats-history-row').length, 400);

  const dnf = render(StatsPanel, statsVals([{ date: dayKey(0), puzzleNumber: 1, n: 6, won: false }]));
  const dnfValues = statValues(dnf);
  assert.equal(dnfValues['WIN %'], '0%');
  assert.equal(dnfValues.STREAK, '0');
  assert.doesNotMatch(textOf(dnf), /NaN|Infinity|undefined/);
});

// ---- Board ----

function gameState(over = {}) {
  return {
    screen: 'game', mode: 'solo', view: 'you',
    input: '', setupInput: '', setupName: '', mySecret: 'BRAVE', rivalSecret: '',
    myGuesses: [], rivalGuesses: [], marks: {}, groups: [],
    tool: 'type', pendingTool: null, pendingLetters: [],
    matchStatus: 'active', matchBusy: false, yourTurn: true,
    result: null, reviewing: false, error: '',
    friends: [], savedMatches: [], removedFriends: [],
    profileName: '', opponentName: '',
    ...over,
  };
}

const boardActions = (calls = []) => ({
  tapLetter: (ch) => calls.push(['letter', ch]), tapTool: (id) => calls.push(['tool', id]), removeGroup: (i) => calls.push(['group', i]),
  backspace: () => calls.push(['backspace']), action: () => calls.push(['action']),
});
const mountBoard = (state, calls = []) => {
  const actions = boardActions(calls);
  return render(Board, deriveView(state, actions, [], false), actions);
};
const keyEl = (tree, ch) => findAll(tree, (n) => n.props.className === 'key' && n.props.children?.[0]?.props?.children === ch)[0];

test('Board renders the active row as five tiles with the typed letters', () => {
  const tree = mountBoard(gameState({ input: 'CRA' }));
  const tiles = byClass(tree, 'tiles-row')[0].props.children;
  assert.deepEqual(tiles.map((t) => t.props.children), ['C', 'R', 'A', '', '']);
  assert.match(tiles[0].props.style.border, /solid/);
  assert.match(tiles[4].props.style.border, /dashed/);
});

test('Board shows the error line, the tool pills and the keyboard layout', () => {
  const calls = [];
  const tree = mountBoard(gameState({ error: 'Not a word' }), calls);
  assert.equal(textOf(byClass(tree, 'error-line')[0]), 'Not a word');
  const pills = byClass(tree, 'tool-pill');
  assert.deepEqual(pills.map(textOf), ['TYPE', '✕', '✓', '1 OF', '2 OF', '3 OF']);
  pills[1].props.onClick();
  assert.deepEqual(calls, [['tool', 'elim']]);
  assert.deepEqual(byClass(tree, 'keyboard-row').map((r) => findAll(r, (n) => n.props.className === 'key').length), [10, 9, 7]);
});

test('Board keys, backspace and the action button call their handlers', () => {
  const calls = [];
  const tree = mountBoard(gameState({ input: 'CRANE' }), calls);
  keyEl(tree, 'Q').props.onClick();
  byClass(tree, 'key-backspace')[0].props.onClick();
  byClass(tree, 'action-btn')[0].props.onClick();
  assert.deepEqual(calls, [['letter', 'Q'], ['backspace'], ['action']]);
});

test('Board marks letters: ✓ is teal with a corner check, ✕ is red with a corner cross', () => {
  const tree = mountBoard(gameState({ myGuesses: [{ word: 'ABCDE', count: 1 }], marks: { A: 'has', B: 'elim' } }));
  const a = keyEl(tree, 'A');
  const b = keyEl(tree, 'B');
  assert.equal(a.props.style.background, '#0E7C86');
  assert.equal(textOf(a), 'A✓');
  assert.equal(b.props.style.background, '#FBECE9');
  assert.equal(b.props.style.color, '#A63A30');
  assert.equal(textOf(b), 'B✕');
  assert.equal(textOf(keyEl(tree, 'Z')), 'Z');
});

test('Board auto-eliminated keys fade with no corner mark, unlike an explicit ✕', () => {
  const tree = mountBoard(gameState({ myGuesses: [{ word: 'FGHIJ', count: 0 }], marks: { B: 'elim' } }));
  const auto = keyEl(tree, 'F');
  const explicit = keyEl(tree, 'B');
  assert.equal(auto.props.style.textDecoration, 'line-through');
  assert.equal(auto.props.style.color, '#D5D1C7');
  assert.equal(textOf(auto), 'F');
  assert.equal(textOf(explicit), 'B✕');
  assert.notEqual(auto.props.style.color, explicit.props.style.color);
});

test('Board shows group chips and badges, and removing a chip calls removeGroup', () => {
  const calls = [];
  const tree = mountBoard(gameState({ groups: [{ count: 2, letters: ['A', 'B', 'C'] }] }), calls);
  assert.equal(textOf(byClass(tree, 'group-chips')[0]), '2 of A B C✕');
  byClass(tree, 'group-chip-remove')[0].props.onClick();
  assert.deepEqual(calls, [['group', 0]]);
  assert.equal(textOf(keyEl(tree, 'A')), 'A2');
});

test('Board hides game-only tools outside a game and dims itself for an inactive rival match', () => {
  const setup = mountBoard(gameState({ screen: 'setup', setupInput: 'BR' }));
  assert.equal(byClass(setup, 'tools-row').length, 0);
  assert.deepEqual(byClass(setup, 'tiles-row')[0].props.children.map((t) => t.props.children), ['B', 'R', '', '', '']);
  assert.doesNotMatch(setup.props.className, /board-disabled/);
  assert.match(mountBoard(gameState({ mode: 'rival', matchStatus: 'finished' })).props.className, /board-disabled/);
  assert.doesNotMatch(mountBoard(gameState({ mode: 'rival', matchStatus: 'active' })).props.className, /board-disabled/);
});

// ---- Setup ----

test('Setup asks for a name and shows the secret word label when no profile exists', () => {
  const typed = [];
  const vals = deriveView(gameState({ screen: 'setup', setupName: 'Al' }), {}, [], false);
  const tree = render(Setup, vals, { setSetupName: (v) => typed.push(v) });
  assert.equal(textOf(byClass(tree, 'setup-title')[0]), 'Your name and secret word');
  assert.match(textOf(byClass(tree, 'setup-blurb')[0]), /Introduce yourself/);
  const input = findAll(tree, (n) => n.type === 'input')[0];
  assert.equal(input.props.value, 'Al');
  assert.equal(input.props.maxLength, 24);
  input.props.onChange({ target: { value: 'Alex' } });
  assert.deepEqual(typed, ['Alex']);
  assert.equal(byClass(tree, 'playing-as').length, 0);
  assert.equal(textOf(byClass(tree, 'secret-word-label')[0]), 'YOUR SECRET WORD');
});

test('Setup with a saved profile shows PLAYING AS instead of the name input', () => {
  const vals = deriveView(gameState({ screen: 'setup', profileName: 'Sam' }), {}, [], false);
  const tree = render(Setup, vals);
  assert.equal(textOf(byClass(tree, 'setup-title')[0]), 'Pick your secret word');
  assert.equal(textOf(byClass(tree, 'playing-as')[0]), 'PLAYING AS Sam');
  assert.equal(findAll(tree, (n) => n.type === 'input').length, 0);
});

test('Setup rematch intent names the opponent', () => {
  const vals = deriveView(gameState({ screen: 'setup', profileName: 'Sam', setupIntent: 'rematch', opponentName: 'Jo' }), {}, [], false);
  assert.match(textOf(byClass(render(Setup, vals), 'setup-blurb')[0]), /rematch with Jo/);
});

test('Setup submit goes through the Board action button, enabled only with a name and five letters', () => {
  const calls = [];
  const submit = (state) => {
    const actions = boardActions(calls);
    const vals = deriveView(state, actions, [], false);
    return { vals, button: byClass(render(Board, vals, actions), 'action-btn')[0] };
  };
  const ready = submit(gameState({ screen: 'setup', setupName: 'Al', setupInput: 'BRAVE' }));
  assert.equal(ready.button.props.style.background, '#1C1B18');
  ready.button.props.onClick();
  assert.deepEqual(calls, [['action']]);
  assert.equal(submit(gameState({ screen: 'setup', setupName: '', setupInput: 'BRAVE' })).button.props.style.background, '#D8D4CA');
  assert.equal(submit(gameState({ screen: 'setup', setupName: 'Al', setupInput: 'BRA' })).button.props.style.background, '#D8D4CA');
});
