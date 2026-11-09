import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/jsx-hooks.mjs', import.meta.url);
register('./helpers/app-hooks.mjs', import.meta.url);

// deriveView and the intro helpers read localStorage; the intro flags are controlled per test.
let storage = {};
globalThis.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
};

const { mount } = await import('./helpers/react-stub.mjs');
const { default: App } = await import('../src/App.jsx');
const { GetTheApp } = await import('../src/components/GetTheApp.jsx');
const { Header } = await import('../src/components/Header.jsx');
const { Home } = await import('../src/components/Home.jsx');
const { Setup } = await import('../src/components/Setup.jsx');
const { Game } = await import('../src/components/Game.jsx');
const { Board } = await import('../src/components/Board.jsx');
const { Result } = await import('../src/components/Result.jsx');
const { Multiplayer } = await import('../src/components/Multiplayer.jsx');
const { FriendDetail } = await import('../src/components/FriendDetail.jsx');
const { StatsPanel } = await import('../src/components/StatsPanel.jsx');
const { Intro } = await import('../src/components/Intro.jsx');
const { freshRound } = await import('../src/game/cinqState.js');
const { INTRO_KEYS } = await import('../src/game/intro.js');

const WEBVIEW_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const SAFARI_UA = `${WEBVIEW_UA.replace('Mobile/15E148', 'Version/18.0 Mobile/15E148 Safari/604.1')}`;
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

// Collects every element in a returned tree whose type matches.
function findAll(node, match, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, match, out));
  else if (node && typeof node === 'object' && node.props) {
    if (match(node)) out.push(node);
    findAll(node.props.children, match, out);
  }
  return out;
}
const ofType = (tree, type) => findAll(tree, (n) => n.type === type);
const has = (tree, type) => ofType(tree, type).length > 0;

// Runs fn with the browser globals the gate reads, then restores them. Capacitor is not native under node, so
// only the user agent, the webkit bridge, the location and sessionStorage decide the mode.
function withBrowser({ ua = DESKTOP_UA, url = 'https://cinq.example.workers.dev/', bridge = false, hydrating = false } = {}, fn) {
  const names = ['navigator', 'location', 'sessionStorage', 'webkit', '__hydrating'];
  const saved = Object.fromEntries(names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const session = {};
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('navigator', { userAgent: ua });
  define('location', new URL(url));
  define('sessionStorage', {
    getItem: (k) => (k in session ? session[k] : null),
    setItem: (k, v) => { session[k] = String(v); },
  });
  define('webkit', bridge ? { messageHandlers: { bridge: {} } } : undefined);
  define('__hydrating', hydrating);
  try { return fn(session); } finally {
    names.forEach((n) => (saved[n] ? Object.defineProperty(globalThis, n, saved[n]) : delete globalThis[n]));
  }
}

const renderApp = () => mount(() => App()).tree;

// App returns <GameApp/> in game mode; render that component too and hand back its element tree.
function renderGame(state, { actions = {}, intro = {} } = {}) {
  storage = { [INTRO_KEYS.multiplayer]: '1', ...intro };
  globalThis.__cinq = { state, actions, secretList: [], showWordsLeft: false };
  const outer = renderApp();
  assert.equal(typeof outer.type, 'function', 'game mode renders the GameApp component');
  const handle = mount(() => outer.type(outer.props));
  return { tree: handle.tree, handle };
}

const roundState = (over = {}) => ({
  ...freshRound(), screen: 'home', mode: 'solo', showStats: false, friends: [], savedMatches: [], removedFriends: [],
  selectedFriend: null, mySecret: '', rivalSecret: 'CRANE', matchStatus: '', matchCode: '', opponentName: '', myName: '',
  ...over,
});

// ---- the native-app gate ----

test('a desktop browser gets the GetTheApp landing page, not the game', () => {
  withBrowser({}, () => {
    const tree = renderApp();
    assert.equal(tree.type, GetTheApp);
  });
});

test('Safari on iPhone gets the landing page (it has a Safari/ token)', () => {
  withBrowser({ ua: SAFARI_UA }, () => assert.equal(renderApp().type, GetTheApp));
});

test('an iOS webview user agent without Safari/ renders the game, not the landing page', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    globalThis.__cinq = { state: roundState(), actions: {}, secretList: [], showWordsLeft: false };
    const tree = renderApp();
    assert.notEqual(tree.type, GetTheApp);
    assert.equal(typeof tree.type, 'function');
  });
});

test('the native bridge renders the game even with a desktop user agent', () => {
  withBrowser({ bridge: true }, () => {
    globalThis.__cinq = { state: roundState(), actions: {}, secretList: [], showWordsLeft: false };
    assert.notEqual(renderApp().type, GetTheApp);
  });
});

test('?web=1 bypasses the gate and the choice sticks for the session', () => {
  withBrowser({ url: 'https://cinq.example.workers.dev/?web=1' }, (session) => {
    globalThis.__cinq = { state: roundState(), actions: {}, secretList: [], showWordsLeft: false };
    assert.notEqual(renderApp().type, GetTheApp);
    assert.equal(session['cinq-web-ok'], '1');
    // a later page without the query string still skips the gate
    globalThis.location = new URL('https://cinq.example.workers.dev/');
    assert.notEqual(renderApp().type, GetTheApp);
  });
});

test('other ?web values do not bypass the gate', () => {
  withBrowser({ url: 'https://cinq.example.workers.dev/?web=0' }, () => assert.equal(renderApp().type, GetTheApp));
});

test('preview hosts (tailnet and localhost) skip the gate without ?web=1', () => {
  for (const url of ['https://jons-mac-mini.tail712946.ts.net/', 'http://localhost:3000/']) {
    withBrowser({ url }, () => {
      globalThis.__cinq = { state: roundState(), actions: {}, secretList: [], showWordsLeft: false };
      assert.notEqual(renderApp().type, GetTheApp, url);
    });
  }
});

test('the server render and first hydration pass render a blank shell, never the landing page', () => {
  for (const ua of [DESKTOP_UA, WEBVIEW_UA]) {
    withBrowser({ ua, hydrating: true }, () => {
      const tree = renderApp();
      assert.equal(tree.type, 'div');
      assert.equal(tree.props.className, 'app-shell');
      assert.equal(tree.props.children, undefined);
    });
  }
});

// ---- screen routing ----

test('home shows only Home, with no header', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree } = renderGame(roundState({ screen: 'home' }));
    assert.equal(tree.props.className, 'app-shell');
    assert.ok(has(tree, Home));
    assert.ok(!has(tree, Header));
    for (const other of [Setup, Game, Board, Result, Multiplayer, FriendDetail, StatsPanel, Intro]) assert.ok(!has(tree, other));
  });
});

test('setup shows the header, Setup and the Board', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree } = renderGame(roundState({ screen: 'setup' }));
    assert.ok(has(tree, Header));
    assert.ok(has(tree, Setup));
    assert.ok(has(tree, Board));
    assert.ok(!has(tree, Home));
    assert.ok(!has(tree, Game));
  });
});

test('game shows Game and Board with the back header; a finished round adds Result', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const playing = renderGame(roundState({ screen: 'game', mode: 'solo' })).tree;
    assert.ok(has(playing, Header));
    assert.ok(has(playing, Game));
    assert.ok(has(playing, Board));
    assert.ok(!has(playing, Result));

    const done = renderGame(roundState({ screen: 'game', mode: 'solo', result: { won: true, n: 3, attempts: 3 } })).tree;
    assert.ok(has(done, Result));
    const reviewing = renderGame(roundState({ screen: 'game', mode: 'solo', result: { won: true, n: 3, attempts: 3 }, reviewing: true })).tree;
    assert.ok(!has(reviewing, Result));
  });
});

test('a rival match still waiting for a friend shows Game without the Board', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree } = renderGame(roundState({ screen: 'game', mode: 'rival', matchStatus: 'waiting', matchCode: 'ABCD2345' }));
    assert.ok(has(tree, Game));
    assert.ok(!has(tree, Board));
  });
});

test('multiplayer shows the Multiplayer lobby', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree } = renderGame(roundState({ screen: 'multiplayer' }));
    assert.ok(has(tree, Header));
    assert.ok(has(tree, Multiplayer));
    assert.ok(!has(tree, Home));
  });
});

test('friend detail shows FriendDetail only when a friend is selected, and its back button closes the friend', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const calls = [];
    const actions = { closeFriend: () => calls.push('closeFriend'), goHome: () => calls.push('goHome') };
    const friend = { name: 'Pal', code: 'ABCDEF' };
    const { tree } = renderGame(roundState({ screen: 'friend', selectedFriend: friend }), { actions });
    assert.ok(has(tree, FriendDetail));
    ofType(tree, Header)[0].props.onHome();
    assert.deepEqual(calls, ['closeFriend']);

    const empty = renderGame(roundState({ screen: 'friend', selectedFriend: null })).tree;
    assert.ok(!has(empty, FriendDetail));
  });
});

test('the header back button goes home on other screens', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const calls = [];
    const actions = { closeFriend: () => calls.push('closeFriend'), goHome: () => calls.push('goHome') };
    const { tree } = renderGame(roundState({ screen: 'multiplayer' }), { actions });
    ofType(tree, Header)[0].props.onHome();
    assert.deepEqual(calls, ['goHome']);
  });
});

test('the stats panel overlays the current screen when showStats is set', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree } = renderGame(roundState({ screen: 'home', showStats: true }));
    assert.ok(has(tree, StatsPanel));
    assert.ok(has(tree, Home));
  });
});

// ---- how-to and multiplayer intros ----

test('the HOW TO PLAY button opens the how-to intro and finishing it marks it seen and closes it', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const { tree, handle } = renderGame(roundState({ screen: 'home' }));
    assert.ok(!has(tree, Intro));
    ofType(tree, Home)[0].props.actions.openHowTo();
    const open = ofType(handle.tree, Intro);
    assert.equal(open.length, 1);
    assert.equal(open[0].props.kind, 'howto');
    open[0].props.onDone(true);
    assert.ok(!has(handle.tree, Intro));
    assert.equal(storage[INTRO_KEYS.howto], '1');
  });
});

test('Home gets the game actions plus openHowTo', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    const startDaily = () => {};
    const { tree } = renderGame(roundState({ screen: 'home' }), { actions: { startDaily } });
    const homeActions = ofType(tree, Home)[0].props.actions;
    assert.equal(homeActions.startDaily, startDaily);
    assert.equal(typeof homeActions.openHowTo, 'function');
  });
});

test('the multiplayer rules intro opens once on first setup, and not again after it was seen', () => {
  withBrowser({ ua: WEBVIEW_UA }, () => {
    storage = {};
    globalThis.__cinq = { state: roundState({ screen: 'setup' }), actions: {}, secretList: [], showWordsLeft: false };
    const outer = renderApp();
    const first = mount(() => outer.type(outer.props));
    // The intro is opened by a state change during the first render; the stub keeps the pre-change tree, so render again.
    first.render();
    const intro = ofType(first.tree, Intro);
    assert.equal(intro.length, 1);
    assert.equal(intro[0].props.kind, 'multiplayer');
    intro[0].props.onDone(false);
    assert.equal(storage[INTRO_KEYS.multiplayer], '1');
    assert.ok(!has(first.tree, Intro));

    const seen = renderGame(roundState({ screen: 'setup' })).handle;
    seen.render();
    assert.ok(!has(seen.tree, Intro));
  });
});
