import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { queries, toCommand } from '../scripts/d1-metrics.mjs';

// The live D1 tables are the cinq_* ones created in cinq-db.ts; db/schema.ts mirrors them as jotto_*/jortal_*.
const ddl = [...readFileSync(new URL('../app/api/_shared/cinq-db.ts', import.meta.url), 'utf8').matchAll(/CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS[^`]*/g)].map((m) => m[0]);
const schemaSrc = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

function newDb() {
  const db = new DatabaseSync(':memory:');
  for (const stmt of ddl) db.exec(stmt);
  return db;
}

test('DDL was extracted for every table the queries use', () => {
  assert.equal(ddl.filter((s) => /TABLE/.test(s)).length, 7);
});

test('every query is a single read-only SELECT that survives shell double-quoting', () => {
  for (const q of queries) {
    const sql = q.sql;
    assert.match(sql, /^SELECT /, q.id);
    assert.ok(!sql.includes(';'), `${q.id}: no semicolons`);
    assert.ok(!/["`$\\]/.test(sql), `${q.id}: no shell-special characters`);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|ATTACH)\b/i.test(sql), `${q.id}: no writes`);
    assert.ok(toCommand(q).startsWith('npx wrangler d1 execute cinq --remote --command "SELECT '), q.id);
    assert.ok(!toCommand(q).includes('\n'), q.id);
  }
});

test('columns of shared tables exist in db/schema.ts', () => {
  const schemaCols = (dbName) => {
    const body = schemaSrc.split(`"${dbName}"`)[1].split(/\r?\n\}\);|\r?\n  \},/)[0];
    return new Set([...body.matchAll(/(?:text|integer)\("([a-z0-9_]+)"/g)].map((m) => m[1]));
  };
  const db = newDb();
  const pairs = { cinq_matches: 'jotto_matches', cinq_guesses: 'jotto_guesses', cinq_daily_results: 'jotto_daily_results', cinq_player_results: 'jortal_player_results' };
  for (const [live, drizzle] of Object.entries(pairs)) {
    const cols = db.prepare(`PRAGMA table_info(${live})`).all().map((c) => c.name);
    const expected = schemaCols(drizzle);
    for (const c of cols) assert.ok(expected.has(c), `${live}.${c} missing from db/schema.ts ${drizzle}`);
  }
});

test('every query runs on an empty database', () => {
  const db = newDb();
  for (const q of queries) assert.doesNotThrow(() => db.prepare(q.sql).all(), q.id);
});

test('queries compute the expected numbers on fixture data', () => {
  const db = newDb();
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const d = (n) => day(n).slice(0, 10);
  const player = db.prepare('INSERT INTO cinq_players (player_key, friend_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  player.run('a', 'AAA', 'A', day(1), day(1));
  player.run('b', 'BBB', 'B', day(1), day(1));
  player.run('old', 'OLD', 'O', day(60), day(60));
  const match = db.prepare('INSERT INTO cinq_matches (code, status, player1_token, player1_secret, player1_key, player2_key, rematch_code, winner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  match.run('M1', 'finished', 't', 's', 'a', 'b', 'M3', 1, day(2), day(2));
  match.run('M2', 'waiting', 't', 's', 'a', null, null, null, day(2), day(2));
  match.run('M3', 'finished', 't', 's', 'b', 'a', null, 2, day(1), day(1));
  const guess = db.prepare('INSERT INTO cinq_guesses (match_code, player, turn_number, word, match_count, created_at) VALUES (?, ?, 1, ?, 1, ?)');
  guess.run('M1', 1, 'CRANE', day(2));
  guess.run('M1', 2, 'SLATE', day(2));
  guess.run('M2', 1, 'CRANE', day(2));
  const daily = db.prepare('INSERT INTO cinq_daily_results (date, player_key, guesses, completed_at) VALUES (?, ?, ?, ?)');
  daily.run(d(0), 'a', 4, day(0));
  daily.run(d(0), 'b', 6, day(0));
  daily.run(d(1), 'a', 5, day(1));
  const run = (id) => db.prepare(queries.find((q) => q.id === id).sql).all().map((r) => ({ ...r }));

  assert.deepEqual(run('new-players'), [{ day: d(1), new_players: 2 }]);
  assert.deepEqual(run('matches-created'), [{ day: d(2), matches_created: 2 }, { day: d(1), matches_created: 1 }].sort((x, y) => x.day.localeCompare(y.day)));
  const both = run('both-guessed').find((r) => r.day === d(2));
  assert.deepEqual(both, { day: d(2), matches: 2, both_guessed: 1, share: 0.5 });
  assert.deepEqual(run('matches-finished').map((r) => r.finished), [1, 1]);
  assert.deepEqual(run('rematch-rate').find((r) => r.day === d(2)), { day: d(2), finished: 1, rematched: 1, rate: 1 });
  assert.deepEqual(run('daily-completions'), [{ day: d(1), completions: 1, avg_guesses: 5 }, { day: d(0), completions: 2, avg_guesses: 5 }]);
  // a: daily d0, d1 and matches => 3 days; b: daily d0 + match d1 => 2 days
  assert.deepEqual(run('returning-7d'), [{ active_players: 2, returning_players: 2 }]);
});

test('turn-expiry-exposure buckets active matches by age and counts only', () => {
  const db = newDb();
  const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const match = db.prepare('INSERT INTO cinq_matches (code, status, player1_token, player1_secret, player1_key, player2_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const run = () => ({ ...db.prepare(queries.find((q) => q.id === 'turn-expiry-exposure').sql).get() });
  assert.deepEqual(run(), { active_matches: 0, under_3d: 0, d3_to_7: 0, d7_to_14: 0, over_14d: 0, players_in_over_14d: 0, over_14d_share: 0 });
  match.run('A1', 'active', 't', 's', 'p1', 'p2', ago(40), ago(1));
  match.run('A2', 'active', 't', 's', 'p1', 'p3', ago(40), ago(5));
  match.run('A3', 'active', 't', 's', 'p4', 'p5', ago(40), ago(10));
  match.run('A4', 'active', 't', 's', 'p1', 'p2', ago(40), ago(15));
  match.run('A5', 'active', 't', 's', 'p2', 'p6', ago(40), ago(30));
  match.run('A6', 'active', 't', 's', null, null, ago(40), ago(20));
  match.run('W1', 'waiting', 't', 's', 'p7', null, ago(40), ago(50));
  match.run('F1', 'finished', 't', 's', 'p8', 'p9', ago(40), ago(50));
  // over 14d: A4 (p1,p2), A5 (p2,p6), A6 (no keys) => players p1, p2, p6
  assert.deepEqual(run(), { active_matches: 6, under_3d: 1, d3_to_7: 1, d7_to_14: 1, over_14d: 3, players_in_over_14d: 3, over_14d_share: 0.5 });
  assert.ok(!/player\w*_(key|token|secret)\s*,|\bcode\b/i.test(queries.find((q) => q.id === 'turn-expiry-exposure').sql.split('FROM')[0]), 'no identifying columns selected at top level');
});
