import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import './helpers/route-hooks.mjs';
import { createFakeD1 } from './helpers/fakeD1.mjs';
import { WORDS } from '../src/data/words.js';
import { normalizeMatchCode, matchCodeError, friendIdError } from '../src/game/multiplayerInput.js';
import { normalizeFriendCode, upsertFriend } from '../src/game/friends.js';

globalThis.__cinqTestEnv = {};
const create = await import('../app/api/matches/route.ts');
const join = await import('../app/api/matches/[code]/join/route.ts');

const [SECRET1, SECRET2] = WORDS.filter((_, i) => i % 97 === 0).slice(0, 2);
const KEY1 = 'player-key-0001';
const KEY2 = 'player-key-0002';

let db;
beforeEach(() => {
  db = createFakeD1();
  globalThis.__cinqTestEnv.DB = db;
});

const call = async (handler, body, code) => {
  const request = new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await (code === undefined ? handler(request) : handler(request, { params: Promise.resolve({ code }) }));
  return { status: res.status, json: await res.json() };
};

test('normalizeMatchCode uppercases, drops spaces and symbols, and caps at 8', () => {
  assert.equal(normalizeMatchCode('  abcd efgh  '), 'ABCDEFGH');
  assert.equal(normalizeMatchCode('ab-cd_ef!gh'), 'ABCDEFGH');
  assert.equal(normalizeMatchCode('abcdefghjk'), 'ABCDEFGH');
});

test('normalizeMatchCode removes characters outside the code alphabet and tolerates non-strings', () => {
  assert.equal(normalizeMatchCode('a0b1c'), 'ABC');
  assert.equal(normalizeMatchCode(undefined), '');
  assert.equal(normalizeMatchCode(null), '');
});

test('matchCodeError rejects short codes before any request and accepts 8 characters', () => {
  assert.equal(matchCodeError(''), 'Enter the 8-character match code');
  assert.equal(matchCodeError('ABCDEFG'), 'Enter the 8-character match code');
  assert.equal(matchCodeError('ABCDEFGH'), '');
});

test('friendIdError rejects wrong length and your own friend ID', () => {
  assert.equal(friendIdError('', 'ABCD23'), 'Friend IDs are 6 characters');
  assert.equal(friendIdError('ABCD2', 'ABCD23'), 'Friend IDs are 6 characters');
  assert.equal(friendIdError('ABCD23', 'ABCD23'), 'That is your own friend ID');
  assert.equal(friendIdError('WXYZ45', 'ABCD23'), '');
  assert.equal(friendIdError('WXYZ45', ''), '');
});

test('friend ID input is normalized the same way before validation', () => {
  const code = normalizeFriendCode(' abcd-23 ');
  assert.equal(code, 'ABCD23');
  assert.equal(friendIdError(code, 'ABCD23'), 'That is your own friend ID');
  assert.equal(friendIdError(normalizeFriendCode('abc'), ''), 'Friend IDs are 6 characters');
});

test('adding a friend who is already saved does not create a duplicate', () => {
  let friends = upsertFriend([], { friendCode: 'wxyz45', name: 'Bob' });
  friends = upsertFriend(friends, { friendCode: 'WXYZ45', name: 'Bob' });
  assert.equal(friends.length, 1);
});

test('join route: unknown code gives "Match not found" and a normalized lowercase code works', async () => {
  const missing = await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, normalizeMatchCode('abcdefgh'));
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'Match not found');
  const made = await call(create.POST, { name: 'Ann', secret: SECRET1, playerKey: KEY1 });
  const typed = ` ${made.json.match.code.toLowerCase()} `;
  const ok = await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, normalizeMatchCode(typed));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.match.status, 'active');
});

test('join route: a full match gives the "already has two players" message', async () => {
  const made = await call(create.POST, { name: 'Ann', secret: SECRET1, playerKey: KEY1 });
  const code = made.json.match.code;
  await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, code);
  const full = await call(join.POST, { name: 'Cy', secret: SECRET2, playerKey: 'player-key-0003' }, code);
  assert.equal(full.status, 409);
  assert.equal(full.json.error, 'This match already has two players');
});

test('join errors and responses never include a playerKey', async () => {
  const made = await call(create.POST, { name: 'Ann', secret: SECRET1, playerKey: KEY1 });
  const code = made.json.match.code;
  const results = [
    made,
    await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, 'ABCDEFGH'),
    await call(join.POST, { name: '', secret: SECRET2, playerKey: KEY2 }, code),
    await call(join.POST, { name: 'Bob', secret: 'AAAAA', playerKey: KEY2 }, code),
    await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, code),
    await call(join.POST, { name: 'Cy', secret: SECRET2, playerKey: 'player-key-0003' }, code),
  ];
  for (const { json } of results) {
    const text = JSON.stringify(json);
    for (const key of [KEY1, KEY2, 'player-key-0003']) assert.ok(!text.includes(key), text);
  }
});
