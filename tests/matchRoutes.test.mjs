import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import './helpers/route-hooks.mjs';
import { createFakeD1 } from './helpers/fakeD1.mjs';
import { WORDS } from '../src/data/words.js';
import { TURN_EXPIRY_MS } from '../src/config.js';

globalThis.__cinqTestEnv = {};
const { turnExpiry } = await import('../app/api/_shared/cinq-db.ts');
const create = await import('../app/api/matches/route.ts');
const join = await import('../app/api/matches/[code]/join/route.ts');
const guess = await import('../app/api/matches/[code]/guess/route.ts');
const matchGet = await import('../app/api/matches/[code]/route.ts');
const rematch = await import('../app/api/matches/[code]/rematch/route.ts');

const [SECRET1, SECRET2, WORD_A, WORD_B] = WORDS.filter((_, i) => i % 97 === 0).slice(0, 4);
const KEY1 = 'player-key-0001';
const KEY2 = 'player-key-0002';

let db;
beforeEach(() => {
  db = createFakeD1();
  globalThis.__cinqTestEnv.DB = db;
});

const req = (body, raw) => new Request('http://test/api', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: raw ?? JSON.stringify(body),
});
const ctx = (code) => ({ params: Promise.resolve({ code }) });
const call = async (handler, body, code, raw) => {
  const res = await (code === undefined ? handler(req(body, raw)) : handler(req(body, raw), ctx(code)));
  return { status: res.status, json: await res.json() };
};

const newMatch = (name = 'Ann', secret = SECRET1, playerKey = KEY1) =>
  call(create.POST, { name, secret, playerKey });
const activeMatch = async () => {
  const a = await newMatch();
  const b = await call(join.POST, { name: 'Bob', secret: SECRET2, playerKey: KEY2 }, a.json.match.code);
  return { code: a.json.match.code, t1: a.json.token, t2: b.json.token };
};
const finish = (code) => db.sqlite.prepare("UPDATE cinq_matches SET status = 'finished', winner = 1 WHERE code = ?").run(code);

test('create: rejects missing name, bad secret and malformed JSON', async () => {
  assert.equal((await call(create.POST, { secret: SECRET1 })).status, 400);
  assert.equal((await call(create.POST, { name: '   ', secret: SECRET1 })).json.error, 'Enter your name');
  for (const secret of [undefined, 42, 'ZZZZZ', 'ab', 'AAAAA']) {
    const r = await call(create.POST, { name: 'Ann', secret });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /valid five-letter word/);
  }
  assert.equal((await call(create.POST, undefined, undefined, '{not json')).status, 400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_matches').get().n, 0);
});

test('create: valid input returns 201, token and a waiting match without the opponent secret', async () => {
  const r = await newMatch('  Ann   Lee ');
  assert.equal(r.status, 201);
  assert.equal(r.json.match.status, 'waiting');
  assert.equal(r.json.match.yourName, 'Ann Lee');
  assert.equal(r.json.match.code.length, 8);
  assert.equal(r.json.match.opponentSecret, null);
});

test('join: invalid or unknown code, bad name or secret', async () => {
  assert.equal((await call(join.POST, { name: 'Bob', secret: SECRET2 }, '!!')).status, 404);
  assert.equal((await call(join.POST, { name: 'Bob', secret: SECRET2 }, 'ABCDEFGH')).status, 404);
  const { json } = await newMatch();
  const code = json.match.code;
  assert.equal((await call(join.POST, { secret: SECRET2 }, code)).status, 400);
  assert.equal((await call(join.POST, { name: 'Bob', secret: 'AAAAA' }, code)).status, 400);
  assert.equal(db.sqlite.prepare('SELECT status FROM cinq_matches WHERE code = ?').get(code).status, 'waiting');
});

test('join: lowercase code works; full or finished match gives 409', async () => {
  const { code } = await activeMatch();
  const full = await call(join.POST, { name: 'Cy', secret: SECRET2 }, code);
  assert.equal(full.status, 409);
  const waiting = await newMatch('Dee');
  const ok = await call(join.POST, { name: 'Bob', secret: SECRET2 }, waiting.json.match.code.toLowerCase());
  assert.equal(ok.status, 200);
  assert.equal(ok.json.match.status, 'active');
  finish(code);
  assert.equal((await call(join.POST, { name: 'Cy', secret: SECRET2 }, code)).status, 409);
});

test('guess: missing, short, repeated-letter and non-dictionary words are rejected', async () => {
  const { code, t1 } = await activeMatch();
  for (const word of [undefined, null, 7, '', 'ABC', 'AAAAA', 'ZZZZZ', 'TOOLONG']) {
    const r = await call(guess.POST, { token: t1, word }, code);
    assert.equal(r.status, 400);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_guesses').get().n, 0);
});

test('guess: unknown match 404, bad or missing token 403, inactive match 409', async () => {
  assert.equal((await call(guess.POST, { token: 'x', word: WORD_A }, 'ABCDEFGH')).status, 404);
  const waiting = await newMatch();
  const wcode = waiting.json.match.code;
  assert.equal((await call(guess.POST, { word: WORD_A }, wcode)).status, 403);
  assert.equal((await call(guess.POST, { token: 'nope', word: WORD_A }, wcode)).status, 403);
  assert.equal((await call(guess.POST, { token: waiting.json.token, word: WORD_A }, wcode)).status, 409);
  const { code, t1 } = await activeMatch();
  finish(code);
  assert.equal((await call(guess.POST, { token: t1, word: WORD_A }, code)).status, 409);
});

test('guess: in-turn guess is recorded and duplicate guess is 409', async () => {
  const { code, t1 } = await activeMatch();
  const first = await call(guess.POST, { token: t1, word: WORD_A.toLowerCase() }, code);
  assert.equal(first.status, 200);
  assert.equal(first.json.match.yourGuesses.length, 1);
  assert.equal(first.json.match.currentTurn, 2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_guesses').get().n, 1);
  const dup = await call(guess.POST, { token: t1, word: WORD_A }, code);
  assert.equal(dup.status, 409);
});

test('guess: out of turn is queued, not applied, and the latest queued word wins', async () => {
  const { code, t2 } = await activeMatch();
  const early = await call(guess.POST, { token: t2, word: WORD_A }, code);
  assert.equal(early.status, 200);
  assert.equal(early.json.queued, true);
  assert.equal(early.json.match.pendingGuess, WORD_A);
  await call(guess.POST, { token: t2, word: WORD_B }, code);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_guesses').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT word FROM cinq_pending_guesses').get().word, WORD_B);
  assert.equal(db.sqlite.prepare('SELECT current_turn FROM cinq_matches WHERE code = ?').get(code).current_turn, 1);
});

test('guess: guessing the opponent secret finishes the match', async () => {
  const { code, t1 } = await activeMatch();
  const win = await call(guess.POST, { token: t1, word: SECRET2 }, code);
  assert.equal(win.status, 200);
  assert.equal(win.json.match.status, 'finished');
  assert.equal(win.json.match.winner, 1);
  assert.equal(win.json.match.opponentSecret, SECRET2);
});

test('rematch: validation, token and status checks', async () => {
  const { code, t1, t2 } = await activeMatch();
  assert.equal((await call(rematch.POST, { token: t1, secret: SECRET1 }, code)).json.error, 'Enter your name');
  assert.equal((await call(rematch.POST, { token: t1, name: 'Ann', secret: 'AAAAA' }, code)).status, 400);
  assert.equal((await call(rematch.POST, { token: t1, name: 'Ann', secret: SECRET1 }, 'ABCDEFGH')).status, 404);
  assert.equal((await call(rematch.POST, { token: 'bad', name: 'Ann', secret: SECRET1 }, code)).status, 403);
  assert.equal((await call(rematch.POST, { name: 'Ann', secret: SECRET1 }, code)).status, 403);
  assert.equal((await call(rematch.POST, { token: t1, name: 'Ann', secret: SECRET1 }, code)).status, 409);
  finish(code);
  const first = await call(rematch.POST, { token: t1, name: 'Ann', secret: SECRET1, playerKey: KEY1 }, code);
  assert.equal(first.status, 201);
  assert.equal(first.json.match.status, 'waiting');
  const same = await call(rematch.POST, { token: t1, name: 'Ann', secret: SECRET1, playerKey: KEY1 }, code);
  assert.equal(same.status, 409);
  const second = await call(rematch.POST, { token: t2, name: 'Bob', secret: SECRET2, playerKey: KEY2 }, code);
  assert.equal(second.status, 200);
  assert.equal(second.json.match.status, 'active');
  assert.equal(second.json.match.code, first.json.match.code);
  const late = await call(rematch.POST, { token: t2, name: 'Bob', secret: SECRET2, playerKey: 'player-key-0003' }, code);
  assert.equal(late.status, 409);
});

const backdate = (code, ms) => db.sqlite.prepare('UPDATE cinq_matches SET updated_at = ? WHERE code = ?')
  .run(new Date(Date.now() - ms).toISOString(), code);

test('guess: overdue match is 409 expired when enabled, accepted when disabled', async () => {
  const { code, t1 } = await activeMatch();
  backdate(code, TURN_EXPIRY_MS + 60_000);
  const off = await call(guess.POST, { token: t1, word: WORD_A }, code);
  assert.equal(off.status, 200);
  const second = await activeMatch();
  backdate(second.code, TURN_EXPIRY_MS + 60_000);
  turnExpiry.enabled = true;
  try {
    const on = await call(guess.POST, { token: second.t1, word: WORD_A }, second.code);
    assert.equal(on.status, 409);
    assert.equal(on.json.error, 'This match has expired');
    const queued = await call(guess.POST, { token: second.t2, word: WORD_B }, second.code);
    assert.equal(queued.status, 409);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_pending_guesses').get().n, 0);
    assert.equal(db.sqlite.prepare('SELECT winner FROM cinq_matches WHERE code = ?').get(second.code).winner, 2);
  } finally {
    turnExpiry.enabled = false;
  }
});

test('match GET: settles an overdue match when enabled and reports expired', async () => {
  const { code, t1 } = await activeMatch();
  backdate(code, TURN_EXPIRY_MS + 60_000);
  const get = () => matchGet.GET(new Request('http://test/api', { headers: { 'x-cinq-player': t1 } }), ctx(code))
    .then(async (res) => ({ status: res.status, json: await res.json() }));
  const off = await get();
  assert.equal(off.json.match.status, 'active');
  assert.equal(off.json.match.expired, false);
  assert.ok(off.json.match.turnDeadline);
  turnExpiry.enabled = true;
  try {
    const on = await get();
    assert.equal(on.json.match.status, 'finished');
    assert.equal(on.json.match.winner, 2);
    assert.equal(on.json.match.expired, true);
  } finally {
    turnExpiry.enabled = false;
  }
});
