import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/jsx-hooks.mjs', import.meta.url);

const { mount } = await import('./helpers/react-stub.mjs');
const { Game } = await import('../src/components/Game.jsx');
const { Header } = await import('../src/components/Header.jsx');

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

const soloVals = (over = {}) => ({
  isRival: false, isDuel: false, showYou: true, showRival: false, histEmpty: false, rivalEmpty: false,
  myRows: [], rivalRows: [], ...over,
});
const row = (key, word, count) => ({
  key, count,
  chars: [...word].map((ch) => ({ ch, style: {} })),
});
const render = (vals, actions = {}) => mount(() => Game({ vals, actions })).tree;

// ---- Game ----

test('Game solo shows the empty-state note before any guess', () => {
  const tree = render(soloVals({ histEmpty: true }));
  assert.equal(tree.props['data-screen-label'], 'Game');
  assert.equal(textOf(byClass(tree, 'empty-note')[0]), 'Make your first guess');
  assert.equal(byClass(tree, 'guess-row').length, 0);
  assert.equal(byClass(tree, 'turn-banner').length, 0);
  assert.equal(byClass(tree, 'duel-tabs').length, 0);
});

test('Game solo renders one guess row per guess with its letters and count', () => {
  const tree = render(soloVals({ myRows: [row('a', 'CRANE', 2), row('b', 'SLOTH', 1)], wordsLeftText: '42 words left' }));
  const rows = byClass(tree, 'guess-row');
  assert.equal(rows.length, 2);
  assert.equal(textOf(byClass(rows[0], 'guess-row-letters')[0]), 'CRANE');
  assert.match(textOf(rows[0]), /CRANE2$/);
  assert.match(textOf(rows[1]), /SLOTH1$/);
  assert.equal(textOf(byClass(tree, 'words-left-card')[0]), '42 words left');
  assert.equal(byClass(tree, 'empty-note').length, 0);
});

test('Game shows letter superscripts only when a char has one', () => {
  const myRows = [{ key: 'a', count: 1, chars: [{ ch: 'A', style: {}, sup: '2', supStyle: {} }, { ch: 'B', style: {} }] }];
  const spans = findAll(render(soloVals({ myRows })), (n) => n.type === 'span' && textOf(n) === '2');
  assert.equal(spans.length, 1);
});

test('Game VIEW RESULTS button appears only when reviewing and calls showResults', () => {
  assert.equal(byClass(render(soloVals()), 'results-return-btn').length, 0);
  let called = 0;
  const tree = render(soloVals({ reviewing: true }), { showResults: () => { called += 1; } });
  const [btn] = byClass(tree, 'results-return-btn');
  assert.equal(textOf(btn), 'VIEW RESULTS');
  btn.props.onClick();
  assert.equal(called, 1);
});

test('Game rival waiting state shows the invite card, hides history and copies the link', () => {
  let copied = 0;
  const vals = soloVals({ isRival: true, matchStatus: 'waiting', matchCode: 'ABCD', inviteCopied: false });
  const tree = render(vals, { copyInvite: () => { copied += 1; } });
  assert.equal(textOf(byClass(tree, 'turn-banner')[0]), 'WAITING FOR YOUR FRIENDABCD');
  assert.equal(textOf(byClass(tree, 'waiting-code')[0]), 'ABCD');
  assert.equal(byClass(tree, 'history-scroll').length, 0);
  const [btn] = byClass(tree, 'copy-invite-btn');
  assert.equal(textOf(btn), 'COPY INVITE LINK');
  btn.props.onClick();
  assert.equal(copied, 1);
  const done = render({ ...vals, inviteCopied: true });
  assert.equal(textOf(byClass(done, 'copy-invite-btn')[0]), 'LINK COPIED');
});

test('Game rival banner reflects whose turn it is', () => {
  const base = soloVals({ isRival: true, matchStatus: 'active', matchCode: 'XY', opponentName: 'Sam' });
  const mine = render({ ...base, yourTurn: true });
  assert.match(byClass(mine, 'turn-banner')[0].props.className, /your-turn/);
  assert.equal(textOf(byClass(mine, 'turn-banner')[0].props.children[0]), 'YOUR TURN');
  assert.equal(byClass(mine, 'queued-guess-card').length, 0);

  const theirs = render({ ...base, yourTurn: false });
  assert.doesNotMatch(byClass(theirs, 'turn-banner')[0].props.className, /your-turn/);
  assert.equal(textOf(byClass(theirs, 'turn-banner')[0].props.children[0]), 'NOT YOUR TURN');
  assert.match(textOf(byClass(theirs, 'queued-guess-card')[0]), /Type a guess now and it will play after Sam/);
});

test('Game rival banner prefers a custom banner with level class and sub text', () => {
  const vals = soloVals({
    isRival: true, matchStatus: 'active', yourTurn: true, matchCode: 'XY', opponentName: 'Sam',
    turnBanner: { text: '1 HOUR LEFT', level: 'warn', sub: 'Guess soon' },
  });
  const tree = render(vals);
  const banner = byClass(tree, 'turn-banner')[0];
  assert.match(banner.props.className, /turn-banner--warn/);
  assert.equal(textOf(banner.props.children[0]), '1 HOUR LEFT');
  assert.equal(textOf(byClass(tree, 'turn-sub')[0]), 'Guess soon');
});

test('Game queued guess card names the pending guess', () => {
  const vals = soloVals({ isRival: true, matchStatus: 'active', yourTurn: false, opponentName: 'Sam', pendingGuess: 'CRANE' });
  const card = byClass(render(vals), 'queued-guess-card')[0];
  assert.match(textOf(card), /CRANE IS QUEUED/);
  assert.match(textOf(card), /replace it before Sam guesses/);
});

test('Game duel tabs switch view and show the rival badge', () => {
  const views = [];
  const vals = soloVals({
    isDuel: true, matchStatus: 'active', opponentName: 'Sam', rivalBadge: true,
    youTabStyle: {}, rivalTabStyle: {},
  });
  const tree = render(vals, { setView: (v) => views.push(v) });
  const tabs = byClass(tree, 'tab');
  assert.equal(tabs.length, 2);
  assert.equal(textOf(tabs[0]), 'YOUR GUESSES');
  assert.match(textOf(tabs[1]), /SAM/);
  assert.equal(byClass(tabs[1], 'rival-dot').length, 1);
  tabs[0].props.onClick();
  tabs[1].props.onClick();
  assert.deepEqual(views, ['you', 'rival']);
  assert.equal(byClass(render({ ...vals, rivalBadge: false }), 'rival-dot').length, 0);
});

test('Game rival view shows the secret word and the rival rows instead of mine', () => {
  const vals = soloVals({
    isDuel: true, matchStatus: 'active', isRival: false, opponentName: 'Sam', showYou: false, showRival: true,
    mySecretSpaced: 'C R A N E', rivalRows: [{ key: 'r', word: 'SLOTH', count: 3 }],
  });
  const tree = render(vals);
  assert.match(textOf(byClass(tree, 'your-word-label')[0]), /C R A N E/);
  assert.match(textOf(byClass(tree, 'guess-row')[0]), /SLOTH3/);
  assert.equal(byClass(tree, 'words-left-card').length, 0);
  const empty = render({ ...vals, rivalRows: [], rivalEmpty: true });
  assert.match(textOf(byClass(empty, 'empty-note')[0]), /hasn.t guessed yet/);
});

test('Game shows a thinking note while waiting for the opponent guess', () => {
  const vals = soloVals({
    isRival: true, isDuel: true, matchStatus: 'active', yourTurn: false, opponentName: 'Sam',
    showYou: false, showRival: true, mySecretSpaced: 'C R A N E', youTabStyle: {}, rivalTabStyle: {},
  });
  assert.match(textOf(byClass(render(vals), 'thinking-note')[0]), /Waiting for Sam.s guess/);
  assert.equal(byClass(render({ ...vals, yourTurn: true }), 'thinking-note').length, 0);
});

test('Game turn toast shows once, dismisses on click and claims the key', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const vals = soloVals({ turnToast: { key: 'AB:1h', text: 'One hour left' } });
    const h = mount(() => Game({ vals, actions: {} }));
    assert.equal(byClass(h.tree, 'turn-toast').length, 0);
    await new Promise((r) => setTimeout(r, 10));
    const [toast] = byClass(h.tree, 'turn-toast');
    assert.equal(textOf(toast), 'One hour left');
    assert.equal(toast.props.role, 'status');
    assert.match(store.get('cinq-turn-toasts'), /AB:1h/);
    toast.props.onClick();
    assert.equal(byClass(h.tree, 'turn-toast').length, 0);
    h.unmount();

    // A second mount with the same key must not show it again.
    const again = mount(() => Game({ vals, actions: {} }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(byClass(again.tree, 'turn-toast').length, 0);
    again.unmount();
  } finally {
    delete globalThis.localStorage;
  }
});

// ---- Header ----

test('Header renders the logo and header label without a back button by default', () => {
  const tree = Header({ headerLabel: 'DAILY' });
  assert.equal(textOf(byClass(tree, 'logo')[0]), 'CINQLE');
  assert.equal(textOf(byClass(tree, 'header-label')[0]), 'DAILY');
  assert.equal(byClass(tree, 'back-btn').length, 0);
});

test('Header back button appears with showBack and calls onHome', () => {
  let home = 0;
  const tree = Header({ showBack: true, onHome: () => { home += 1; }, headerLabel: '' });
  const [btn] = byClass(tree, 'back-btn');
  assert.equal(btn.props['aria-label'], 'Back to home');
  btn.props.onClick();
  assert.equal(home, 1);
});
