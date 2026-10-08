import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'cloudflare:workers';
import * as players from '../app/api/players/route.ts';
import * as playerByCode from '../app/api/players/[code]/route.ts';
import { createFakeDb } from './support/fake-d1.mjs';

const KEY = 'device-key-1234';
const useDb = (seed) => (env.DB = createFakeDb(seed));
const post = (body) => players.POST(new Request('http://x/api/players', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));
const lookup = (code) => playerByCode.GET(new Request('http://x/api/players/' + code), { params: Promise.resolve({ code }) });
const seeded = { players: [{ player_key: KEY, friend_code: 'ABCD23', name: 'Ada' }] };

// --- POST /api/players ---

test('players POST rejects a missing, non-string, or too-short playerKey', async () => {
  const db = useDb();
  for (const playerKey of [undefined, null, 12345678, 'short', 'abc-123', '!!!!!!!!!!']) {
    const res = await post({ playerKey, name: 'Ada' });
    assert.equal(res.status, 400, String(playerKey));
    assert.equal((await res.json()).error, 'Player profile not found');
  }
  assert.equal(db.state.players.length, 0);
});

test('players POST treats unparseable JSON as an empty body', async () => {
  useDb();
  const res = await post('not json');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Player profile not found');
});

test('players POST rejects a new player with a missing or blank name', async () => {
  const db = useDb();
  for (const name of [undefined, null, 42, '', '   ']) {
    const res = await post({ playerKey: KEY, name });
    assert.equal(res.status, 400, String(name));
    assert.equal((await res.json()).error, 'Enter your name');
  }
  assert.equal(db.state.players.length, 0);
});

test('players POST creates a profile and returns a 6 character friend code', async () => {
  const db = useDb();
  const res = await post({ playerKey: KEY, name: 'Ada' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['friendCode', 'name']);
  assert.equal(body.name, 'Ada');
  assert.match(body.friendCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(db.state.players.length, 1);
  assert.equal(db.state.players[0].player_key, KEY);
});

test('players POST normalizes the name (trim, collapse spaces, cap at 24)', async () => {
  useDb();
  assert.equal((await (await post({ playerKey: KEY, name: '  Ada   Lovelace ' })).json()).name, 'Ada Lovelace');
  useDb();
  assert.equal((await (await post({ playerKey: KEY, name: 'x'.repeat(40) })).json()).name, 'x'.repeat(24));
});

test('players POST strips invalid characters from the playerKey before storing', async () => {
  const db = useDb();
  assert.equal((await post({ playerKey: ' ab!c@d#e$f%g^h ', name: 'Ada' })).status, 200);
  assert.equal(db.state.players[0].player_key, 'abcdefgh');
});

test('players POST for an existing player without a name returns the profile unchanged', async () => {
  const db = useDb(seeded);
  const res = await post({ playerKey: KEY });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { friendCode: 'ABCD23', name: 'Ada' });
  assert.equal(db.state.players.length, 1);
});

test('players POST renames an existing player and keeps the friend code', async () => {
  const db = useDb(seeded);
  const body = await (await post({ playerKey: KEY, name: 'Grace' })).json();
  assert.deepEqual(body, { friendCode: 'ABCD23', name: 'Grace' });
  assert.equal(db.state.players.length, 1);
  assert.equal(db.state.players[0].name, 'Grace');
});

// --- GET /api/players/[code] ---

test('players/[code] GET rejects codes that are not 6 valid characters', async () => {
  useDb(seeded);
  for (const code of ['', 'ABC', 'ABCD2', '0O1I00', '!!!!!!', '   ']) {
    const res = await lookup(code);
    assert.equal(res.status, 400, JSON.stringify(code));
    assert.equal((await res.json()).error, 'Friend IDs are 6 characters');
  }
});

test('players/[code] GET returns 404 for an unknown friend ID', async () => {
  useDb(seeded);
  const res = await lookup('ZZZZ99');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'No player found with that friend ID');
});

test('players/[code] GET returns only friendCode and name, never the playerKey', async () => {
  useDb(seeded);
  const res = await lookup('ABCD23');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { friendCode: 'ABCD23', name: 'Ada' });
});

test('players/[code] GET is case and whitespace tolerant, and ignores characters past six', async () => {
  useDb(seeded);
  assert.equal((await (await lookup(' abcd23 ')).json()).friendCode, 'ABCD23');
  assert.equal((await (await lookup('ab-cd23')).json()).friendCode, 'ABCD23');
  assert.equal((await (await lookup('abcd23zzzz')).json()).friendCode, 'ABCD23');
});

test('a profile created via POST can be looked up by its friend code', async () => {
  useDb();
  const created = await (await post({ playerKey: KEY, name: 'Ada' })).json();
  const found = await (await lookup(created.friendCode)).json();
  assert.deepEqual(found, created);
});
