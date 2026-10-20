import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/jsx-hooks.mjs', import.meta.url);

const { mount } = await import('./helpers/react-stub.mjs');
const { Intro } = await import('../src/components/Intro.jsx');
const { FriendDetail } = await import('../src/components/FriendDetail.jsx');
const { Result } = await import('../src/components/Result.jsx');
const { INTRO_CARDS } = await import('../src/game/intro.js');
const { setSink, trackIntroClosed } = await import('../src/game/track.js');

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
const buttonWithText = (tree, text) => findAll(tree, (n) => n.type === 'button' && textOf(n) === text)[0];

// ---- Intro ----

function mountIntro(kind) {
  const done = [];
  const view = mount(() => Intro({ kind, onDone: (completed) => done.push(completed) }));
  return { view, done, get tree() { return view.tree; } };
}

const next = (page) => byClass(page.tree, 'intro-next')[0];

test('Intro howto opens on the first card with Skip and NEXT', () => {
  const page = mountIntro('howto');
  assert.equal(textOf(byClass(page.tree, 'intro-title')[0]), INTRO_CARDS.howto[0].title);
  assert.equal(page.tree.props['data-intro'], 'howto');
  assert.equal(page.tree.props.role, 'dialog');
  assert.equal(textOf(byClass(page.tree, 'intro-skip')[0]), 'SKIP');
  assert.equal(textOf(next(page)), 'NEXT');
  assert.equal(byClass(page.tree, 'intro-dot').length, INTRO_CARDS.howto.length);
  assert.equal(byClass(page.tree, 'intro-demo').length, 0);
});

test('Intro howto marks card shows the ✕, ✓ and AUTO tool buttons', () => {
  const page = mountIntro('howto');
  const marksIndex = INTRO_CARDS.howto.findIndex((c) => c.demo === 'marks');
  for (let i = 0; i < marksIndex; i += 1) next(page).props.onClick();
  const text = textOf(byClass(page.tree, 'intro-demo')[0]);
  assert.match(text, /✕/);
  assert.match(text, /✓/);
  assert.match(text, /AUTO/);
  assert.equal(byClass(page.tree, 'demo-pill-elim').length, 1);
  assert.equal(byClass(page.tree, 'demo-pill-has').length, 1);
});

test('Intro howto groups card shows the N OF pill and four group keys', () => {
  const page = mountIntro('howto');
  const groupsIndex = INTRO_CARDS.howto.findIndex((c) => c.demo === 'groups');
  for (let i = 0; i < groupsIndex; i += 1) next(page).props.onClick();
  assert.equal(textOf(byClass(page.tree, 'demo-pill-group')[0]), '2 OF');
  assert.equal(byClass(page.tree, 'demo-key-group').length, 4);
});

test('Intro NEXT walks every card, then the last card finishes with LET’S PLAY and onDone(true)', () => {
  const page = mountIntro('howto');
  const last = INTRO_CARDS.howto.length - 1;
  for (let i = 0; i < last; i += 1) {
    assert.equal(textOf(byClass(page.tree, 'intro-title')[0]), INTRO_CARDS.howto[i].title);
    assert.equal(textOf(next(page)), 'NEXT');
    next(page).props.onClick();
    assert.deepEqual(page.done, []);
  }
  assert.equal(textOf(byClass(page.tree, 'intro-title')[0]), INTRO_CARDS.howto[last].title);
  assert.equal(textOf(next(page)), 'LET’S PLAY');
  next(page).props.onClick();
  assert.deepEqual(page.done, [true]);
});

test('Intro SKIP calls onDone(false) from any card', () => {
  const page = mountIntro('howto');
  next(page).props.onClick();
  byClass(page.tree, 'intro-skip')[0].props.onClick();
  assert.deepEqual(page.done, [false]);
});

test('Intro multiplayer is a single card with no dots and a GOT IT button', () => {
  const page = mountIntro('multiplayer');
  assert.equal(page.tree.props['data-intro'], 'multiplayer');
  assert.equal(byClass(page.tree, 'intro-dot').length, 0);
  assert.equal(textOf(next(page)), 'GOT IT');
  next(page).props.onClick();
  assert.deepEqual(page.done, [true]);
});

test('Intro close goes through track(): howto_completed on finish only, nothing on skip or multiplayer', () => {
  const events = [];
  setSink((name, props) => events.push([name, props]));
  try {
    // Same wiring as App.closeIntro: onDone feeds trackIntroClosed.
    const howto = (completed) => trackIntroClosed('howto', completed);
    const page = mount(() => Intro({ kind: 'howto', onDone: howto }));
    byClass(page.tree, 'intro-skip')[0].props.onClick();
    assert.deepEqual(events, []);
    for (let i = 0; i < INTRO_CARDS.howto.length; i += 1) byClass(page.tree, 'intro-next')[0].props.onClick();
    assert.deepEqual(events, [['howto_completed', {}]]);

    events.length = 0;
    const mp = mount(() => Intro({ kind: 'multiplayer', onDone: (completed) => trackIntroClosed('multiplayer', completed) }));
    byClass(mp.tree, 'intro-next')[0].props.onClick();
    assert.deepEqual(events, []);
  } finally { setSink(null); }
});

// ---- FriendDetail ----

const match = (over = {}) => ({
  code: 'ABCDEFGH', token: 'tok', dateLabel: 'Oct 1', resultLabel: 'WIN', finished: true, won: true, counts: '5 guesses', ...over,
});

function mountFriend(friendOver = {}) {
  const calls = [];
  const actions = {
    challengeFriend: (f) => calls.push(['challengeFriend', f]),
    resumeRival: (code, token) => calls.push(['resumeRival', code, token]),
    removeSelectedFriend: () => calls.push(['removeSelectedFriend']),
  };
  const friendDetail = { friendName: 'Sam', friendCode: 'ABCDEF', wins: 3, losses: 2, played: 5, rematchMatch: null, matches: [], ...friendOver };
  const view = mount(() => FriendDetail({ vals: { friendDetail }, actions }));
  return { view, calls, friendDetail, get tree() { return view.tree; } };
}

test('FriendDetail shows the friend name, ID and head-to-head counts', () => {
  const page = mountFriend();
  assert.equal(textOf(byClass(page.tree, 'mp-name')[0]), 'Sam');
  assert.equal(textOf(byClass(page.tree, 'friend-detail-id')[0]), 'ABCDEF');
  const cells = byClass(page.tree, 'h2h-cell').map(textOf);
  assert.deepEqual(cells, ['3YOUR WINS', '2SAM WINS', '5PLAYED']);
});

test('FriendDetail hides the ID line when there is no friend code', () => {
  assert.equal(byClass(mountFriend({ friendCode: '' }).tree, 'friend-detail-id').length, 0);
});

test('FriendDetail with no history shows the empty state and no rows', () => {
  const page = mountFriend();
  assert.equal(textOf(byClass(page.tree, 'mp-empty')[0]), 'No matches with Sam yet.');
  assert.equal(byClass(page.tree, 'friend-game-card').length, 0);
});

test('FriendDetail history rows show win, loss and forfeit labels with the right pill class', () => {
  const page = mountFriend({
    matches: [
      match({ code: 'AAAAAAAA', resultLabel: 'WIN', won: true }),
      match({ code: 'BBBBBBBB', resultLabel: 'LOSS (FORFEIT)', won: false }),
      match({ code: 'CCCCCCCC', resultLabel: 'IN PROGRESS', finished: false, won: false }),
    ],
  });
  assert.equal(byClass(page.tree, 'mp-empty').length, 0);
  const rows = byClass(page.tree, 'friend-game-card');
  assert.equal(rows.length, 3);
  const pills = byClass(page.tree, 'result-pill');
  assert.deepEqual(pills.map(textOf), ['WIN', 'LOSS (FORFEIT)', 'IN PROGRESS']);
  assert.match(pills[0].props.className, /result-pill--win/);
  assert.match(pills[1].props.className, /result-pill--loss/);
  assert.doesNotMatch(pills[2].props.className, /result-pill--(win|loss)/);
  assert.deepEqual(byClass(page.tree, 'friend-game-card-code').map(textOf), ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC']);
});

test('FriendDetail tapping a row resumes that match with its token', () => {
  const page = mountFriend({ matches: [match({ code: 'AAAAAAAA', token: 't1' }), match({ code: 'BBBBBBBB', token: 't2' })] });
  byClass(page.tree, 'friend-game-card')[1].props.onClick();
  assert.deepEqual(page.calls, [['resumeRival', 'BBBBBBBB', 't2']]);
});

test('FriendDetail remove button is labelled with the name and calls the handler', () => {
  const page = mountFriend();
  const remove = byClass(page.tree, 'remove-friend-btn')[0];
  assert.equal(textOf(remove), 'REMOVE SAM');
  remove.props.onClick();
  assert.deepEqual(page.calls, [['removeSelectedFriend']]);
});

test('FriendDetail primary button reads CHALLENGE, or REMATCH when a rematch is available, and passes the friend', () => {
  const fresh = mountFriend();
  const btn = byClass(fresh.tree, 'primary-lobby-btn')[0];
  assert.equal(textOf(btn), 'CHALLENGE');
  btn.props.onClick();
  assert.deepEqual(fresh.calls, [['challengeFriend', fresh.friendDetail]]);
  assert.equal(textOf(byClass(mountFriend({ rematchMatch: { code: 'AAAAAAAA' } }).tree, 'primary-lobby-btn')[0]), 'REMATCH');
});

// ---- Result ----

function mountResult(valsOver = {}) {
  const calls = [];
  const actions = Object.fromEntries(['reviewResult', 'shareResult', 'beginRematch', 'playAgain', 'goHome'].map((k) => [k, () => calls.push(k)]));
  const vals = {
    resultKicker: 'SOLVED', resultKickerStyle: {}, resultSub: 'You cracked Sam’s word in 4 guesses.',
    revealTiles: [...'CRATE'].map((ch, key) => ({ key, ch, style: {} })),
    isDailyResult: false, histBars: [], playerStats: null,
    shareFeedback: '', showRematch: false, rematchLabel: 'REMATCH', showAgain: false,
    ...valsOver,
  };
  const view = mount(() => Result({ vals, actions }));
  return { view, calls, get tree() { return view.tree; } };
}

test('Result win variant shows SOLVED, the reveal tiles and the sub line', () => {
  const page = mountResult({ showRematch: true });
  const text = textOf(page.tree);
  assert.match(text, /SOLVED/);
  assert.match(text, /You cracked Sam’s word in 4 guesses\./);
  assert.equal(textOf(byClass(page.tree, 'reveal-row')[0]), 'CRATE');
});

test('Result loss variant shows the opponent-wins headline and their word', () => {
  const page = mountResult({
    resultKicker: 'SAM WINS', resultSub: 'Sam cracked PLANT in 3 guesses. Their word was:',
    revealTiles: [...'SLATE'].map((ch, key) => ({ key, ch, style: {} })), showRematch: true,
  });
  assert.equal(textOf(page.tree.props.children[0]), 'SAM WINS');
  assert.equal(textOf(byClass(page.tree, 'result-sub')[0]), 'Sam cracked PLANT in 3 guesses. Their word was:');
  assert.equal(textOf(byClass(page.tree, 'reveal-row')[0]), 'SLATE');
});

test('Result forfeit variant renders the headline it is given and still offers the rematch', () => {
  const page = mountResult({ resultKicker: 'SAM WINS', resultSub: 'Sam’s turn expired. You forfeited.', showRematch: true, rematchLabel: 'REMATCH SAM' });
  assert.equal(textOf(byClass(page.tree, 'result-sub')[0]), 'Sam’s turn expired. You forfeited.');
  assert.equal(textOf(byClass(page.tree, 'rematch-btn')[0]), 'REMATCH SAM');
});

test('Result rematch button calls beginRematch and shows the label', () => {
  const page = mountResult({ showRematch: true, rematchLabel: 'REMATCH SAM' });
  const btn = byClass(page.tree, 'rematch-btn')[0];
  assert.equal(textOf(btn), 'REMATCH SAM');
  btn.props.onClick();
  assert.deepEqual(page.calls, ['beginRematch']);
});

test('Result hides rematch and play-again unless the flags are set', () => {
  const page = mountResult();
  assert.equal(byClass(page.tree, 'rematch-btn').length, 0);
  assert.equal(byClass(page.tree, 'play-again-btn').length, 0);
  const again = mountResult({ showAgain: true });
  byClass(again.tree, 'play-again-btn')[0].props.onClick();
  assert.deepEqual(again.calls, ['playAgain']);
});

test('Result view, share and home buttons call their handlers; share shows feedback', () => {
  const page = mountResult();
  buttonWithText(page.tree, 'VIEW GAME').props.onClick();
  buttonWithText(page.tree, 'SHARE RESULT').props.onClick();
  buttonWithText(page.tree, 'HOME').props.onClick();
  assert.deepEqual(page.calls, ['reviewResult', 'shareResult', 'goHome']);
  assert.ok(buttonWithText(mountResult({ shareFeedback: 'COPIED' }).tree, 'COPIED'));
});

test('Result daily variant shows loading, then rank and stats', () => {
  const loading = mountResult({ isDailyResult: true, dailyStatsLoading: true });
  assert.match(textOf(loading.tree), /CALCULATING TODAY/);
  assert.equal(byClass(loading.tree, 'stats-row').length, 0);

  const loaded = mountResult({
    isDailyResult: true, dailyStatsLoading: false, dailyRankLabel: 'TOP 10%',
    histBars: [{ key: 1, style: {}, labelStyle: {}, label: '1' }], statPlayed: 12, statAvg: '4.2', statRank: '#2',
  });
  const text = textOf(loaded.tree);
  assert.match(text, /TOP 10%/);
  assert.match(text, /12PLAYERS/);
  assert.match(text, /#2YOUR RANK/);
  assert.equal(byClass(loaded.tree, 'hist-bar-col').length, 1);
  assert.match(textOf(mountResult({ isDailyResult: true, dailyStatsLoading: false }).tree), /FIRST RESULT TODAY/);
});

test('Result player stats show only with games played and a rematch', () => {
  const playerStats = { gamesPlayed: 7, winRate: 57, averageGuesses: 5.1, averagePercentile: 62 };
  const shown = textOf(byClass(mountResult({ playerStats, showRematch: true }).tree, 'result-player-stats')[0]);
  assert.match(shown, /7 GAMES/);
  assert.match(shown, /57% WINS/);
  assert.match(shown, /62th PERCENTILE/);
  assert.equal(byClass(mountResult({ playerStats, showRematch: false }).tree, 'result-player-stats').length, 0);
  assert.equal(byClass(mountResult({ playerStats: { ...playerStats, gamesPlayed: 0 }, showRematch: true }).tree, 'result-player-stats').length, 0);
});
