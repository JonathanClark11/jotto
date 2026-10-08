import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'cloudflare:workers';
import * as daily from '../app/api/daily-stats/route.ts';
import * as playerStats from '../app/api/player-stats/route.ts';
import { createFakeDb } from './support/fake-d1.mjs';

const KEY = 'abcdefgh12345678'; // 16 chars, the minimum accepted by daily-stats
const DATE = '2026-10-07';

function post(body) {
  return daily.POST(new Request('http://x/api/daily-stats', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}
const getDaily = (qs) => daily.GET(new Request(`http://x/api/daily-stats?${qs}`));
const getPlayer = (qs) => playerStats.GET(new Request(`http://x/api/player-stats?${qs}`));
const useDb = (seed) => (env.DB = createFakeDb(seed));
const rows = (date, guessList) => guessList.map((guesses, i) => ({ date, player_key: `player-key-${i}-padding`, guesses, completed_at: 't' }));

// --- daily-stats validation ---

test('daily GET rejects a missing or malformed date', async () => {
  useDb();
  for (const qs of ['', 'date=', 'date=2026-1-7', 'date=20261007', 'date=2026-10-07x', 'date=abcd-ef-gh']) {
    const res = await getDaily(qs);
    assert.equal(res.status, 400, qs);
    assert.equal((await res.json()).error, 'A valid date is required');
  }
});

test('daily POST rejects an invalid date', async () => {
  const db = useDb();
  for (const date of [undefined, null, 20261007, '2026/10/07', '10-07-2026', ' 2026-10-07']) {
    const res = await post({ date, playerKey: KEY, guesses: 5 });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'A valid date is required');
  }
  assert.equal(db.state.inserts, 0);
});

test('daily POST treats unparseable JSON as an empty body (invalid date)', async () => {
  useDb();
  const res = await post('not json');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'A valid date is required');
});

test('daily POST rejects playerKey that is missing, non-string, or outside 16-128 chars', async () => {
  const db = useDb();
  for (const playerKey of [undefined, null, 12345678901234567, 'a'.repeat(15), 'a'.repeat(129)]) {
    const res = await post({ date: DATE, playerKey, guesses: 5 });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'A valid anonymous player key is required');
  }
  assert.equal(db.state.inserts, 0);
});

test('daily POST accepts playerKey at the 16 and 128 character boundaries', async () => {
  useDb();
  assert.equal((await post({ date: DATE, playerKey: 'a'.repeat(16), guesses: 5 })).status, 200);
  assert.equal((await post({ date: DATE, playerKey: 'b'.repeat(128), guesses: 5 })).status, 200);
});

test('daily POST rejects guesses that are non-integer, out of 1-50, or not numeric', async () => {
  const db = useDb();
  for (const guesses of [0, -1, 51, 100, 2.5, 'abc', undefined, null, NaN, Infinity]) {
    const res = await post({ date: DATE, playerKey: KEY, guesses });
    assert.equal(res.status, 400, String(guesses));
    assert.equal((await res.json()).error, 'Guess count is invalid');
  }
  assert.equal(db.state.inserts, 0);
});

test('daily POST accepts guesses at the 1 and 50 boundaries, including numeric strings', async () => {
  useDb();
  assert.equal((await post({ date: DATE, playerKey: KEY, guesses: 1 })).status, 200);
  assert.equal((await post({ date: DATE, playerKey: 'z'.repeat(16), guesses: 50 })).status, 200);
  assert.equal((await post({ date: DATE, playerKey: 'y'.repeat(16), guesses: '7' })).status, 200);
});

// --- daily-stats stats / ranking ---

test('daily GET on an empty bucket returns null average and null rank', async () => {
  useDb();
  const body = await (await getDaily(`date=${DATE}`)).json();
  assert.deepEqual(body, { date: DATE, totalPlayers: 0, averageGuesses: null, rank: null, buckets: [] });
});

test('daily GET with a guesses param on an empty bucket ranks first', async () => {
  useDb();
  const body = await (await getDaily(`date=${DATE}&guesses=5`)).json();
  assert.equal(body.rank, 1);
  assert.equal(body.averageGuesses, null);
});

test('daily GET only counts results for the requested date', async () => {
  useDb({ daily: [...rows(DATE, [4]), ...rows('2026-10-06', [9, 9])] });
  const body = await (await getDaily(`date=${DATE}`)).json();
  assert.equal(body.totalPlayers, 1);
  assert.deepEqual(body.buckets, [{ guesses: 4, players: 1 }]);
});

test('daily GET computes buckets, average (1 decimal), and rank across buckets', async () => {
  useDb({ daily: rows(DATE, [3, 3, 4, 6, 6, 6]) });
  const body = await (await getDaily(`date=${DATE}&guesses=4`)).json();
  assert.deepEqual(body.buckets, [{ guesses: 3, players: 2 }, { guesses: 4, players: 1 }, { guesses: 6, players: 3 }]);
  assert.equal(body.totalPlayers, 6);
  assert.equal(body.averageGuesses, 4.7); // 28 / 6 = 4.666...
  assert.equal(body.rank, 3); // two players solved in fewer guesses
});

test('daily rank is 1 for the best score and ties share a rank', async () => {
  useDb({ daily: rows(DATE, [3, 3, 5]) });
  assert.equal((await (await getDaily(`date=${DATE}&guesses=2`)).json()).rank, 1);
  assert.equal((await (await getDaily(`date=${DATE}&guesses=3`)).json()).rank, 1);
  assert.equal((await (await getDaily(`date=${DATE}&guesses=5`)).json()).rank, 3);
  assert.equal((await (await getDaily(`date=${DATE}&guesses=9`)).json()).rank, 4);
});

test('daily POST stores the result and returns stats including the new entry', async () => {
  const db = useDb({ daily: rows(DATE, [3, 5]) });
  const body = await (await post({ date: DATE, playerKey: KEY, guesses: 4 })).json();
  assert.equal(db.state.daily.length, 3);
  assert.equal(body.totalPlayers, 3);
  assert.equal(body.averageGuesses, 4);
  assert.equal(body.rank, 2);
});

test('daily POST duplicate submission is ignored (INSERT OR IGNORE)', async () => {
  const db = useDb();
  await post({ date: DATE, playerKey: KEY, guesses: 4 });
  const body = await (await post({ date: DATE, playerKey: KEY, guesses: 2 })).json();
  assert.equal(db.state.inserts, 2);
  assert.equal(db.state.daily.length, 1);
  assert.equal(db.state.daily[0].guesses, 4); // first submission wins
  assert.equal(body.totalPlayers, 1);
  assert.equal(body.averageGuesses, 4);
  assert.equal(body.rank, 1); // rank reflects the guesses sent, stats reflect stored data
});

// --- player-stats validation ---

test('player-stats GET rejects a missing, non-string, or too-short playerKey', async () => {
  useDb();
  for (const qs of ['', 'playerKey=', 'playerKey=short', 'playerKey=abc-123', 'playerKey=%21%21%21%21%21%21%21%21%21%21']) {
    const res = await getPlayer(qs);
    assert.equal(res.status, 400, qs);
    assert.equal((await res.json()).error, 'Player profile not found');
  }
});

test('player-stats GET strips invalid characters before the length check', async () => {
  useDb();
  // 8 valid chars once the punctuation is removed -> accepted
  assert.equal((await getPlayer(`playerKey=${encodeURIComponent('ab!c@d#e$f%g^h&i')}`)).status, 200);
  // only 7 valid chars after stripping -> rejected
  assert.equal((await getPlayer(`playerKey=${encodeURIComponent('ab!c@d#e$f%g')}`)).status, 400);
});

// --- player-stats stats ---

test('player-stats GET for an unknown player returns zeroed stats', async () => {
  useDb({ player: [{ player_key: 'someone-else-1', player_name: 'X', won: 1, guesses: 5, completed_at: '2026-10-01' }] });
  const body = await (await getPlayer('playerKey=unknown-player-1')).json();
  assert.deepEqual(body, {
    playerName: null, gamesPlayed: 0, wins: 0, winRate: 0,
    averageGuesses: null, averagePercentile: null, bestGame: null, currentStreak: 0,
  });
});

test('player-stats GET computes record, average, best game and current streak', async () => {
  const k = 'player-aaaa-1';
  const r = (match, won, guesses, at) => ({ match_code: match, player_key: k, player_name: 'Ada', won, guesses, completed_at: at });
  useDb({
    player: [
      r('M1', 1, 6, '2026-10-01'),
      r('M2', 0, 8, '2026-10-02'),
      r('M3', 1, 5, '2026-10-03'),
      r('M4', 1, 4, '2026-10-04'), // most recent
    ],
  });
  const body = await (await getPlayer(`playerKey=${k}`)).json();
  assert.equal(body.playerName, 'Ada');
  assert.equal(body.gamesPlayed, 4);
  assert.equal(body.wins, 3);
  assert.equal(body.winRate, 75);
  assert.equal(body.averageGuesses, 5.8); // 23 / 4 = 5.75
  assert.equal(body.bestGame, 4);
  assert.equal(body.currentStreak, 2); // M4, M3 then the loss M2 breaks it
});

test('player-stats GET ignores zero-guess results for averages but counts them as games', async () => {
  const k = 'player-bbbb-1';
  useDb({
    player: [
      { match_code: 'M1', player_key: k, player_name: 'Bo', won: 1, guesses: 0, completed_at: '2026-10-01' },
      { match_code: 'M2', player_key: k, player_name: 'Bo', won: 0, guesses: 7, completed_at: '2026-10-02' },
    ],
  });
  const body = await (await getPlayer(`playerKey=${k}`)).json();
  assert.equal(body.gamesPlayed, 2);
  assert.equal(body.averageGuesses, 7);
});

test('player-stats GET percentile is the share of all results at or above the player guess count', async () => {
  const k = 'player-cccc-1';
  useDb({
    player: [
      { match_code: 'M1', player_key: k, player_name: 'Cy', won: 1, guesses: 4, completed_at: '2026-10-01' },
      { match_code: 'M2', player_key: 'other-player-1', player_name: 'D', won: 1, guesses: 6, completed_at: '2026-10-01' },
      { match_code: 'M3', player_key: 'other-player-2', player_name: 'E', won: 1, guesses: 8, completed_at: '2026-10-01' },
      { match_code: 'M4', player_key: 'other-player-3', player_name: 'F', won: 1, guesses: 3, completed_at: '2026-10-01' },
    ],
  });
  const body = await (await getPlayer(`playerKey=${k}`)).json();
  assert.equal(body.averagePercentile, 75); // 3 of 4 results have guesses >= 4
});

test('player-stats GET with only a loss has no best game and zero streak', async () => {
  const k = 'player-dddd-1';
  useDb({ player: [{ match_code: 'M1', player_key: k, player_name: 'Di', won: 0, guesses: 9, completed_at: '2026-10-01' }] });
  const body = await (await getPlayer(`playerKey=${k}`)).json();
  assert.equal(body.bestGame, null);
  assert.equal(body.currentStreak, 0);
  assert.equal(body.winRate, 0);
});
