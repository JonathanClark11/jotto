import assert from 'node:assert/strict';
import test from 'node:test';
import { GUESS_WORDS } from '../src/data/guessWords.js';
import { WORDS } from '../src/data/words.js';
import { TURN_EXPIRY_ENABLED, TURN_EXPIRY_MS, TURN_EXPIRY_DAYS, TURN_WARN_DAYS } from '../src/config.js';
import { createFakeD1 } from './helpers/fakeD1.mjs';
import {
  ensureCinqSchema, expireIfOverdue, getMatch, isGuessWord, normalizeCode, normalizeWord, playerRole,
  publicMatchState, recordPlayerResults, sharedLetters, turnDeadline, turnExpiry,
} from '../app/api/_shared/cinq-db.ts';

test('normalizeWord trims and uppercases, and returns empty for non-strings', () => {
  assert.equal(normalizeWord('  crane '), 'CRANE');
  assert.equal(normalizeWord('Crane'), 'CRANE');
  for (const value of [undefined, null, 42, {}, ['crane']]) assert.equal(normalizeWord(value), '');
});

test('normalizeCode uppercases, strips invalid characters, and caps at 8', () => {
  assert.equal(normalizeCode('  abcd-2345 '), 'ABCD2345');
  assert.equal(normalizeCode('abcdefghjk'), 'ABCDEFGH');
  assert.equal(normalizeCode('01 io'), 'IO');
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(12345678), '');
});

test('isGuessWord requires 5 distinct letters from the dictionaries', () => {
  assert.equal(isGuessWord(WORDS[0]), true);
  assert.equal(isGuessWord(GUESS_WORDS[0]), true);
  assert.equal(isGuessWord('CRAN'), false);
  assert.equal(isGuessWord('CRANES'), false);
  assert.equal(isGuessWord('LLAMA'), false);
  assert.equal(isGuessWord('ZZZZZ'), false);
  assert.equal(isGuessWord(''), false);
});

test('sharedLetters counts letters of the first word found in the second', () => {
  assert.equal(sharedLetters('CRANE', 'BUILD'), 0);
  assert.equal(sharedLetters('CRANE', 'CLOSE'), 2);
  assert.equal(sharedLetters('CRANE', 'CRANE'), 5);
  assert.equal(sharedLetters('CRANE', 'NACRE'), 5);
  assert.equal(sharedLetters('CRANE', 'PLANT'), sharedLetters('PLANT', 'CRANE'));
  assert.equal(sharedLetters('', 'CRANE'), 0);
});

test('playerRole maps tokens to player 1, player 2, or 0 for unknown or empty tokens', () => {
  const match = { player1_token: 'tok-one', player2_token: 'tok-two' };
  assert.equal(playerRole(match, 'tok-one'), 1);
  assert.equal(playerRole(match, 'tok-two'), 2);
  assert.equal(playerRole(match, 'nope'), 0);
  assert.equal(playerRole(match, ''), 0);
  assert.equal(playerRole({ ...match, player2_token: null }, ''), 0);
  assert.equal(playerRole({ ...match, player2_token: null }, 'tok-two'), 0);
});

const T0 = Date.parse('2026-10-01T00:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

async function seedActive({ turn = 1, updatedAt = iso(T0) } = {}) {
  const db = createFakeD1();
  await ensureCinqSchema(db);
  db.sqlite.prepare(`INSERT INTO cinq_matches (code, status, player1_token, player2_token, player1_name, player2_name,
    player1_key, player2_key, player1_secret, player2_secret, current_turn, created_at, updated_at)
    VALUES ('MATCH234', 'active', 't1', 't2', 'Ann', 'Bob', 'key-one-0001', 'key-two-0002', 'CRANE', 'BUILD', ?, ?, ?)`)
    .run(turn, iso(T0), updatedAt);
  db.sqlite.prepare("INSERT INTO cinq_pending_guesses (match_code, player, word, created_at) VALUES ('MATCH234', 2, 'PLANT', ?)")
    .run(iso(T0));
  return { db, match: await getMatch(db, 'MATCH234') };
}

test('turn expiry config: disabled by default, 14 days, warnings at 3 and 1', () => {
  assert.equal(TURN_EXPIRY_ENABLED, false);
  assert.equal(TURN_EXPIRY_DAYS, 14);
  assert.equal(TURN_EXPIRY_MS, 14 * 24 * 60 * 60 * 1000);
  assert.deepEqual(TURN_WARN_DAYS, [3, 1]);
});

test('turnDeadline is updated_at plus the window for active matches only', () => {
  const base = { status: 'active', updated_at: iso(T0) };
  assert.equal(turnDeadline(base), T0 + TURN_EXPIRY_MS);
  assert.equal(turnDeadline({ ...base, status: 'waiting' }), null);
  assert.equal(turnDeadline({ ...base, status: 'finished' }), null);
  assert.equal(turnDeadline({ ...base, updated_at: 'garbage' }), null);
});

test('expireIfOverdue is a no-op while the flag is false', async () => {
  const { db, match } = await seedActive();
  assert.equal(turnExpiry.enabled, false);
  const out = await expireIfOverdue(db, match, T0 + TURN_EXPIRY_MS * 5);
  assert.equal(out.status, 'active');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_player_results').get().n, 0);
});

test('expireIfOverdue settles an overdue match with the non-turn player as winner', async () => {
  turnExpiry.enabled = true;
  try {
    for (const turn of [1, 2]) {
      const { db, match } = await seedActive({ turn });
      const before = await expireIfOverdue(db, match, T0 + TURN_EXPIRY_MS);
      assert.equal(before.status, 'active', 'exactly at the deadline is not yet overdue');
      const out = await expireIfOverdue(db, match, T0 + TURN_EXPIRY_MS + 1);
      assert.equal(out.status, 'finished');
      assert.equal(out.winner, turn === 1 ? 2 : 1);
      assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_pending_guesses').get().n, 0);
      const results = db.sqlite.prepare('SELECT player_key, won FROM cinq_player_results ORDER BY player_key').all();
      assert.deepEqual(results.map((r) => r.won), turn === 1 ? [0, 1] : [1, 0]);
      const state = await publicMatchState(db, out, 't1');
      assert.equal(state.expired, true);
      assert.equal(state.turnDeadline, null);
    }
  } finally {
    turnExpiry.enabled = false;
  }
});

test('expireIfOverdue does not settle a fresh turn', async () => {
  turnExpiry.enabled = true;
  try {
    const { db, match } = await seedActive();
    assert.equal((await expireIfOverdue(db, match, T0 + 1000)).status, 'active');
  } finally {
    turnExpiry.enabled = false;
  }
});

test('guarded update loses the race when updated_at changed', async () => {
  turnExpiry.enabled = true;
  try {
    const { db, match } = await seedActive();
    // A guess lands at the last second: turn passes to player 2 and updated_at moves.
    db.sqlite.prepare("UPDATE cinq_matches SET current_turn = 2, updated_at = ? WHERE code = 'MATCH234'")
      .run(iso(T0 + TURN_EXPIRY_MS - 1000));
    const out = await expireIfOverdue(db, match, T0 + TURN_EXPIRY_MS + 1);
    assert.equal(out.status, 'active');
    assert.equal(out.winner, null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_player_results').get().n, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cinq_pending_guesses').get().n, 1);
  } finally {
    turnExpiry.enabled = false;
  }
});

test('expireIfOverdue and recordPlayerResults are idempotent', async () => {
  turnExpiry.enabled = true;
  try {
    const { db, match } = await seedActive();
    const now = T0 + TURN_EXPIRY_MS + 1;
    await expireIfOverdue(db, match, now);
    const settled = await expireIfOverdue(db, match, now + 5000);
    await recordPlayerResults(db, settled, iso(now + 9000));
    const rows = db.sqlite.prepare('SELECT * FROM cinq_player_results').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].completed_at, iso(now));
  } finally {
    turnExpiry.enabled = false;
  }
});

test('publicMatchState exposes turnDeadline for active matches and expired=false for normal wins', async () => {
  const { db, match } = await seedActive();
  const active = await publicMatchState(db, match, 't1');
  assert.equal(active.turnDeadline, iso(T0 + TURN_EXPIRY_MS));
  assert.equal(active.expired, false);
  db.sqlite.prepare("INSERT INTO cinq_guesses (match_code, player, turn_number, word, match_count, created_at) VALUES ('MATCH234', 1, 1, 'BUILD', 5, ?)").run(iso(T0));
  db.sqlite.prepare("UPDATE cinq_matches SET status = 'finished', winner = 1 WHERE code = 'MATCH234'").run();
  const won = await publicMatchState(db, await getMatch(db, 'MATCH234'), 't1');
  assert.equal(won.expired, false);
});
