import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/jsx-hooks.mjs', import.meta.url);

const { mount } = await import('./helpers/react-stub.mjs');
const { GetTheApp } = await import('../src/components/GetTheApp.jsx');
const { APP_STORE_URL } = await import('../src/config.js');
const { setSink } = await import('../src/game/track.js');

const FRIEND = 'ABCDEF';
const MATCH = 'ABCDEFGH';

// Walks the element tree the component returned and collects every element that matches.
function findAll(node, match, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, match, out));
  else if (node && typeof node === 'object') {
    if (node.props && match(node)) out.push(node);
    if (node.props) findAll(node.props.children, match, out);
  }
  return out;
}

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}

const codeButton = (tree) => findAll(tree, (n) => n.type === 'button' && /landing-code\b/.test(n.props.className ?? ''))[0];
const storeLink = (tree) => findAll(tree, (n) => n.type === 'a')[0];

// Sets up the browser globals the component reads, mounts it, and returns helpers. Restores everything afterwards.
function visit(search, { clipboard, fetchImpl } = {}) {
  const events = [];
  setSink((name, props) => events.push([name, props]));
  const written = [];
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define('location', { search });
  define('window', { location: { search }, setTimeout: () => 0 });
  define('navigator', { clipboard: clipboard ?? { writeText: async (v) => { written.push(v); } } });
  define('fetch', fetchImpl ?? (async () => ({ ok: false, json: async () => null })));
  const view = mount(GetTheApp);
  return {
    events, written, view,
    get tree() { return view.tree; },
    restore() {
      view.unmount();
      setSink(null);
      for (const key of ['location', 'window', 'navigator', 'fetch']) {
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
        else delete globalThis[key];
      }
    },
  };
}

async function withVisit(search, opts, fn) {
  const page = visit(search, opts);
  try { await fn(page); } finally { page.restore(); }
}

test('bare visit shows the app pitch and no code', () => withVisit('', {}, (page) => {
  assert.equal(codeButton(page.tree), undefined);
  assert.match(textOf(page.tree), /is an iPhone app/);
  assert.doesNotMatch(textOf(page.tree), /FRIEND ID|MATCH CODE/);
}));

test('?friend=CODE shows the friend ID', () => withVisit(`?friend=${FRIEND}`, {}, (page) => {
  assert.match(textOf(page.tree), /FRIEND ID/);
  assert.equal(textOf(codeButton(page.tree)), FRIEND);
  assert.equal(codeButton(page.tree).props['aria-label'], 'Copy friend ID');
}));

test('?join=CODE shows the match code', () => withVisit(`?join=${MATCH}`, {}, (page) => {
  assert.match(textOf(page.tree), /MATCH CODE/);
  assert.equal(textOf(codeButton(page.tree)), MATCH);
  assert.equal(codeButton(page.tree).props['aria-label'], 'Copy match code');
}));

test('a malformed code is treated as a bare visit', () => withVisit('?friend=ZZ1', {}, (page) => {
  assert.equal(codeButton(page.tree), undefined);
}));

test('App Store link points at APP_STORE_URL', () => withVisit('', {}, (page) => {
  assert.equal(storeLink(page.tree).props.href, APP_STORE_URL);
}));

test('App Store tap fires landing_app_store_tapped with no props', () => withVisit(`?friend=${FRIEND}`, {}, (page) => {
  storeLink(page.tree).props.onClick();
  assert.deepEqual(page.events.at(-1), ['landing_app_store_tapped', {}]);
}));

test('landing_viewed fires once with booleans only, and never on re-render', () => withVisit(`?friend=${FRIEND}`, {}, async (page) => {
  await codeButton(page.tree).props.onClick(); // state change forces a re-render
  const viewed = page.events.filter(([name]) => name === 'landing_viewed');
  assert.deepEqual(viewed, [['landing_viewed', { has_friend_id: true, has_match_code: false }]]);
}));

test('landing_viewed flags a match code and a bare visit correctly', async () => {
  await withVisit(`?join=${MATCH}`, {}, (page) => {
    assert.deepEqual(page.events[0], ['landing_viewed', { has_friend_id: false, has_match_code: true }]);
  });
  await withVisit('', {}, (page) => {
    assert.deepEqual(page.events[0], ['landing_viewed', { has_friend_id: false, has_match_code: false }]);
  });
});

test('copy writes the friend ID and fires landing_code_copied with kind only', () => withVisit(`?friend=${FRIEND}`, {}, async (page) => {
  await codeButton(page.tree).props.onClick();
  assert.deepEqual(page.written, [FRIEND]);
  const copied = page.events.filter(([name]) => name === 'landing_code_copied');
  assert.deepEqual(copied, [['landing_code_copied', { kind: 'friend_id' }]]);
  assert.match(textOf(page.tree), /Copied\./);
}));

test('copy of a match code reports kind match_code and never leaks the value', () => withVisit(`?join=${MATCH}`, {}, async (page) => {
  await codeButton(page.tree).props.onClick();
  assert.deepEqual(page.written, [MATCH]);
  assert.deepEqual(page.events.filter(([name]) => name === 'landing_code_copied'), [['landing_code_copied', { kind: 'match_code' }]]);
  assert.doesNotMatch(JSON.stringify(page.events), new RegExp(`${FRIEND}|${MATCH}`));
}));

test('blocked clipboard: no event, no crash, code stays on screen', () => {
  const clipboard = { writeText: async () => { throw new Error('NotAllowedError'); } };
  return withVisit(`?friend=${FRIEND}`, { clipboard }, async (page) => {
    await assert.doesNotReject(async () => { await codeButton(page.tree).props.onClick(); });
    assert.equal(page.events.some(([name]) => name === 'landing_code_copied'), false);
    assert.equal(textOf(codeButton(page.tree)), FRIEND);
    assert.doesNotMatch(textOf(page.tree), /Copied\./);
  });
});

test('missing clipboard API is handled the same way', () => withVisit(`?join=${MATCH}`, { clipboard: undefined }, async (page) => {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  await assert.doesNotReject(async () => { await codeButton(page.tree).props.onClick(); });
  assert.equal(page.events.some(([name]) => name === 'landing_code_copied'), false);
}));

test('friend invite looks up the inviter name; a failed lookup keeps the generic headline', async () => {
  const fetched = [];
  const ok = async (url) => { fetched.push(url); return { ok: true, json: async () => ({ name: 'Sam' }) }; };
  const page = visit(`?friend=${FRIEND}`, { fetchImpl: ok });
  try {
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(fetched, [`/api/players/${FRIEND}`]);
    assert.match(textOf(page.tree), /Sam wants to play/);
  } finally { page.restore(); }
  await withVisit(`?friend=${FRIEND}`, { fetchImpl: async () => { throw new Error('offline'); } }, async (p) => {
    await new Promise((r) => setImmediate(r));
    assert.match(textOf(p.tree), /Add a friend on/);
  });
});

test('match invites and bare visits do not call the players API', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, json: async () => null }; };
  await withVisit(`?join=${MATCH}`, { fetchImpl }, () => {});
  await withVisit('', { fetchImpl }, () => {});
  assert.equal(calls, 0);
});
