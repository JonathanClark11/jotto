import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFriendList, friendKey, headToHead, matchesForFriend, mergeIncoming, normalizeFriendCode, removeFriend, upsertFriend } from '../src/game/friends.js';

test('normalizeFriendCode strips ambiguous characters and caps at 6', () => {
  assert.equal(normalizeFriendCode(' ab-c d2e3f4g '), 'ABCD2E');
  assert.equal(normalizeFriendCode('0O1I'), '');
});

test('upsertFriend adds once and refreshes the name for the same friend ID', () => {
  let friends = upsertFriend([], { friendCode: 'abcd23', name: 'Sam' });
  friends = upsertFriend(friends, { friendCode: 'ABCD23', name: 'Sam' });
  assert.equal(friends.length, 1);
  friends = upsertFriend(friends, { friendCode: 'ABCD23', name: 'Samantha' });
  assert.equal(friends.length, 1);
  assert.equal(friends[0].name, 'Samantha');
  assert.equal(upsertFriend(friends, { friendCode: '', name: 'Nope' }).length, 1);
  assert.equal(removeFriend(friends, 'ABCD23').length, 0);
});

test('buildFriendList merges saved friends with match history and keeps legacy opponents', () => {
  const friends = [{ friendCode: 'ABCD23', name: 'Sam' }];
  const matches = [
    { code: 'M1', status: 'finished', friendName: 'Sam', friendCode: 'ABCD23', updatedAt: '2026-10-01T00:00:00Z', role: 1 },
    { code: 'M2', status: 'finished', friendName: 'Sam', friendCode: 'ABCD23', updatedAt: '2026-10-03T00:00:00Z', role: 1 },
    { code: 'M3', status: 'finished', friendName: 'Legacy Lou', updatedAt: '2026-10-02T00:00:00Z', role: 2 },
    { code: 'M4', status: 'waiting', friendName: 'Waiting for friend', updatedAt: '2026-10-04T00:00:00Z', role: 1 },
  ];
  const list = buildFriendList(friends, matches);
  assert.deepEqual(list.map((f) => f.friendName), ['Sam', 'Legacy Lou']);
  assert.equal(list[0].friendCode, 'ABCD23');
  assert.equal(list[0].rematchMatch.code, 'M2');
  assert.equal(list[1].friendCode, '');
});

test('buildFriendList shows a saved friend with no matches yet', () => {
  const list = buildFriendList([{ friendCode: 'ZZZZ22', name: 'New Pal' }], []);
  assert.equal(list.length, 1);
  assert.equal(list[0].rematchMatch, null);
});

test('mergeIncoming adds people who added us, skips removed ones, and is a no-op when nothing is new', () => {
  const friends = [{ friendCode: 'ABCD23', name: 'Sam' }];
  const incoming = [
    { friendCode: 'ABCD23', name: 'Sam' },
    { friendCode: 'ZZZZ22', name: 'Riley' },
    { friendCode: 'QQQQ33', name: 'Blocked Bo' },
  ];
  const merged = mergeIncoming(friends, incoming, ['QQQQ33']);
  assert.deepEqual(merged.map((f) => f.name), ['Sam', 'Riley']);
  assert.equal(mergeIncoming(merged, incoming, ['QQQQ33']), merged);
});

test('buildFriendList hides removed friends even when match history exists', () => {
  const friends = [{ friendCode: 'ABCD23', name: 'Sam' }];
  const matches = [
    { code: 'M1', status: 'finished', friendName: 'Sam', friendCode: 'ABCD23', updatedAt: '2026-10-03T00:00:00Z', role: 1 },
    { code: 'M2', status: 'finished', friendName: 'Legacy Lou', updatedAt: '2026-10-02T00:00:00Z', role: 2 },
  ];
  assert.deepEqual(buildFriendList(friends, matches, ['ABCD23']).map((f) => f.friendName), ['Legacy Lou']);
  assert.deepEqual(buildFriendList(friends, matches, ['ABCD23', 'name:legacy lou']), []);
  assert.equal(friendKey({ friendCode: '', friendName: 'Legacy Lou' }), 'name:legacy lou');
});

test('matchesForFriend + headToHead give the 1v1 record, newest first, ignoring waiting games', () => {
  const matches = [
    { code: 'A', status: 'finished', friendName: 'Sam', friendCode: 'ABCD23', winner: 1, role: 1, updatedAt: '2026-10-01T00:00:00Z' },
    { code: 'B', status: 'finished', friendName: 'Sam', friendCode: 'ABCD23', winner: 2, role: 1, updatedAt: '2026-10-02T00:00:00Z' },
    { code: 'C', status: 'finished', friendName: 'Sam', winner: 2, role: 2, updatedAt: '2026-10-03T00:00:00Z' },
    { code: 'D', status: 'active', friendName: 'Sam', friendCode: 'ABCD23', winner: null, role: 1, updatedAt: '2026-10-04T00:00:00Z' },
    { code: 'E', status: 'waiting', friendName: 'Waiting for friend', updatedAt: '2026-10-05T00:00:00Z' },
    { code: 'F', status: 'finished', friendName: 'Riley', friendCode: 'ZZZZ22', winner: 1, role: 1, updatedAt: '2026-10-05T00:00:00Z' },
  ];
  const history = matchesForFriend({ friendCode: 'ABCD23', friendName: 'Sam' }, matches);
  // C predates friend IDs (no code on the match) but is the same "Sam", so it counts too
  assert.deepEqual(history.map((m) => m.code), ['D', 'C', 'B', 'A']);
  assert.deepEqual(headToHead(history), { wins: 2, losses: 1, played: 3 });
  // a friend with a different ID never picks up Sam's matches
  assert.deepEqual(matchesForFriend({ friendCode: 'ZZZZ22', friendName: 'Riley' }, matches).map((m) => m.code), ['F']);
  // legacy friend with no friend ID matches by name
  const legacy = matchesForFriend({ friendCode: '', friendName: 'sam' }, matches);
  assert.deepEqual(legacy.map((m) => m.code), ['D', 'C', 'B', 'A']);
});
