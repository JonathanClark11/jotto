import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFriendList, normalizeFriendCode, removeFriend, upsertFriend } from '../src/game/friends.js';

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
