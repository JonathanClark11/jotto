import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { register } from 'node:module';

register('./helpers/ts-hooks.mjs', import.meta.url);

// Minimal in-memory D1 stand-in covering only the statements the friends routes issue.
const players = new Map(); // player_key -> { player_key, friend_code, name }
let adds = []; // { adder_key, target_key, created_at }
let queries = [];

function statement(sql) {
  let args = [];
  const stmt = {
    bind(...a) { args = a; return stmt; },
    async run() {
      queries.push(sql);
      if (/INSERT OR IGNORE INTO cinq_friend_adds/.test(sql)) {
        const [adder_key, target_key, created_at] = args;
        if (!adds.some((r) => r.adder_key === adder_key && r.target_key === target_key)) {
          adds.push({ adder_key, target_key, created_at });
        }
      }
      return { meta: { changes: 1 }, results: [] };
    },
    async first() {
      queries.push(sql);
      if (/FROM cinq_players WHERE friend_code/.test(sql)) {
        return [...players.values()].find((p) => p.friend_code === args[0]) ?? null;
      }
      return null;
    },
    async all() {
      queries.push(sql);
      if (/PRAGMA table_info/.test(sql)) {
        return { results: ['player1_name', 'player2_name', 'player1_key', 'player2_key', 'rematch_code'].map((name) => ({ name })) };
      }
      if (/FROM cinq_friend_adds a/.test(sql)) {
        const rows = adds
          .filter((r) => r.target_key === args[0])
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((r) => players.get(r.adder_key))
          .filter(Boolean)
          .map((p) => ({ friendCode: p.friend_code, name: p.name }));
        return { results: rows };
      }
      return { results: [] };
    },
  };
  return stmt;
}

globalThis.__TEST_ENV__ = {
  DB: { prepare: statement, batch: async (stmts) => stmts.map(() => ({})) },
};

const { POST } = await import('../app/api/friends/route.ts');
const { GET } = await import('../app/api/friends/incoming/route.ts');

const ALICE = { player_key: 'alice-key-0001', friend_code: 'ABCD23', name: 'Alice' };
const BOB = { player_key: 'bob-key-000002', friend_code: 'WXYZ45', name: 'Bob' };

beforeEach(() => {
  players.clear();
  players.set(ALICE.player_key, ALICE);
  players.set(BOB.player_key, BOB);
  adds = [];
  queries = [];
});

function post(body, raw) {
  return POST(new Request('http://x/api/friends', {
    method: 'POST',
    body: raw ?? JSON.stringify(body),
  }));
}
const incoming = (qs) => GET(new Request(`http://x/api/friends/incoming${qs}`));
const insertCount = () => adds.length;

test('POST /friends rejects a missing or malformed playerKey', async () => {
  for (const playerKey of [undefined, null, 42, '', 'short', '!!!!!!!!!!']) {
    const res = await post({ playerKey, friendCode: BOB.friend_code });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Player profile not found' });
  }
  assert.equal(insertCount(), 0);
});

test('POST /friends rejects missing or malformed friend codes', async () => {
  // Normalization drops ambiguous chars (0, O, 1, I) and truncates at 6, so these all end up != 6 chars.
  for (const friendCode of [undefined, null, 123456, '', 'ABC', '0O1I0O', 'ab-c']) {
    const res = await post({ playerKey: ALICE.player_key, friendCode });
    assert.equal(res.status, 400, `friendCode ${String(friendCode)}`);
    assert.deepEqual(await res.json(), { error: 'Friend IDs are 6 characters' });
  }
  assert.equal(insertCount(), 0);
});

test('POST /friends treats an invalid JSON body like an empty one', async () => {
  const res = await post(null, 'not json{');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Player profile not found' });
});

test('POST /friends returns 404 for an unknown friend code', async () => {
  const res = await post({ playerKey: ALICE.player_key, friendCode: 'ZZZZZ9' });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'No player found with that friend ID' });
  assert.equal(insertCount(), 0);
});

test('POST /friends rejects adding your own friend ID', async () => {
  const res = await post({ playerKey: ALICE.player_key, friendCode: ALICE.friend_code });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'That is your own friend ID' });
  assert.equal(insertCount(), 0);
});

test('POST /friends adds a friend, normalizing the code, and returns only code and name', async () => {
  const res = await post({ playerKey: ` ${ALICE.player_key} `, friendCode: ' wx-yz45 ' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { friendCode: 'WXYZ45', name: 'Bob' });
  assert.equal(adds.length, 1);
  assert.equal(adds[0].adder_key, ALICE.player_key);
  assert.equal(adds[0].target_key, BOB.player_key);
});

test('POST /friends is idempotent for duplicate adds', async () => {
  const body = { playerKey: ALICE.player_key, friendCode: BOB.friend_code };
  const first = await post(body);
  const second = await post(body);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { friendCode: 'WXYZ45', name: 'Bob' });
  assert.equal(insertCount(), 1);
});

test('GET /friends/incoming rejects a missing or malformed playerKey', async () => {
  for (const qs of ['', '?playerKey=', '?playerKey=short', '?playerKey=%21%21%21%21%21%21%21%21']) {
    const res = await incoming(qs);
    assert.equal(res.status, 400, qs);
    assert.deepEqual(await res.json(), { error: 'Player profile not found' });
  }
  assert.equal(queries.some((q) => /cinq_friend_adds a/.test(q)), false);
});

test('GET /friends/incoming returns an empty list when nobody added you', async () => {
  const res = await incoming(`?playerKey=${ALICE.player_key}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { friends: [] });
});

test('GET /friends/incoming lists adders by friend code and name only, keyed by private playerKey', async () => {
  await post({ playerKey: ALICE.player_key, friendCode: BOB.friend_code });
  const bobsView = await (await incoming(`?playerKey=${BOB.player_key}`)).json();
  assert.deepEqual(bobsView, { friends: [{ friendCode: 'ABCD23', name: 'Alice' }] });
  // Knowing only a friend code reveals nothing; Alice has no incoming adds.
  assert.deepEqual(await (await incoming(`?playerKey=${ALICE.player_key}`)).json(), { friends: [] });
  assert.deepEqual(await (await incoming('?playerKey=WXYZ45')).json(), { error: 'Player profile not found' });
});
