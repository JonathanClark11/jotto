import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRST_MATCH_KEY, setSink, track, trackFriendAdded, trackHowToOpened, trackIntroClosed, trackMatchStarted,
} from '../src/game/track.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

function capture() {
  const events = [];
  setSink((name, props) => events.push([name, props]));
  return events;
}

test.afterEach(() => setSink(null));

test('default sink does nothing and never throws', () => {
  assert.doesNotThrow(() => track('anything', { a: 1 }));
  assert.doesNotThrow(() => track('anything'));
});

test('a throwing sink never propagates', () => {
  setSink(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => track('x'));
  assert.doesNotThrow(() => trackFriendAdded());
});

test('setSink with a non-function restores the no-op', () => {
  const events = capture();
  setSink('nope');
  track('x');
  assert.equal(events.length, 0);
});

test('howto_opened fires once per open', () => {
  const events = capture();
  trackHowToOpened();
  assert.deepEqual(events, [['howto_opened', {}]]);
});

test('howto_completed fires once on completion, not on skip or other intros', () => {
  const events = capture();
  trackIntroClosed('howto', false);
  trackIntroClosed('multiplayer', true);
  assert.equal(events.length, 0);
  trackIntroClosed('howto', true);
  assert.deepEqual(events, [['howto_completed', {}]]);
});

test('first_match_started fires once per device, across intents', () => {
  const events = capture();
  const storage = memoryStorage();
  trackMatchStarted('create', storage);
  trackMatchStarted('join', storage);
  assert.deepEqual(events, [['first_match_started', { intent: 'create' }]]);
  assert.equal(storage.data[FIRST_MATCH_KEY], '1');
});

test('first_match_started does not fire when the flag is already set', () => {
  const events = capture();
  trackMatchStarted('create', memoryStorage({ [FIRST_MATCH_KEY]: '1' }));
  assert.equal(events.length, 0);
});

test('rematch_started fires once per rematch and is separate from first_match_started', () => {
  const events = capture();
  const storage = memoryStorage({ [FIRST_MATCH_KEY]: '1' });
  trackMatchStarted('rematch', storage);
  assert.deepEqual(events, [['rematch_started', {}]]);
  trackMatchStarted('rematch', storage);
  assert.equal(events.length, 2);
});

test('broken storage does not throw or repeat first_match_started', () => {
  const events = capture();
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => trackMatchStarted('create', broken));
  assert.equal(events.length, 0);
});

test('friend_added fires once with no props', () => {
  const events = capture();
  trackFriendAdded();
  assert.deepEqual(events, [['friend_added', {}]]);
});
