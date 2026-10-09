# Design: 14-day turn expiry (forfeit) for multiplayer matches

Status: proposal, no code in this PR. Issue #35.

## Rule

In an `active` multiplayer match, the player whose turn it is forfeits if they have not played within 14 days of their turn starting. The opponent wins. A `waiting` match (no opponent yet) is out of scope.

The window is one constant:

- Name: `TURN_EXPIRY_DAYS` (value `14`), plus derived `TURN_EXPIRY_MS`, plus warning thresholds `TURN_WARN_DAYS = [3, 1]`.
- Location: `src/config.js`, next to `APP_NAME`. That file is already imported by the client, and `app/api/_shared/cinq-db.ts` already imports from `src/` (`src/data/words.js`), so server and client share one source of truth and the UI countdown can never disagree with enforcement.

## Turn start time

Today the match row has no explicit turn timestamp. The candidates:

| Source | Meaning | Verdict |
| --- | --- | --- |
| `cinq_matches.updated_at` | Set on create, join, guess, rematch claim | Usable, see below |
| `cinq_guesses.created_at` | Time of each guess | Correct but needs a query per match |

Everything that writes `updated_at` (all in `app/api/`):

1. `matches/route.ts` create: row is `waiting`, irrelevant.
2. `matches/[code]/join/route.ts` and `rematch/route.ts` join branch: sets `status = 'active'`. Player 1 is on turn (`current_turn` defaults to 1), so this is the correct turn start for the first turn.
3. `matches/[code]/guess/route.ts` final batch `UPDATE cinq_matches SET ... updated_at = ?`: runs when the player on turn guesses, so it is the start of the opponent's turn. Correct.
4. `matches/[code]/rematch/route.ts` claim (`SET rematch_code = ?, updated_at = ?`): guarded by `status = 'finished'`, so it never touches an active match.

The queued-guess path (a player submitting while it is not their turn, which upserts `cinq_pending_guesses`) does NOT touch `updated_at`. That matters: a player cannot extend their own clock, or the opponent's, by queueing a guess. When a queued word exists and the on-turn player guesses, the queued guess is inserted in the same batch with the same `now`, and `updated_at` is bumped once. That is still the correct start of the next turn.

Nothing else bumps `updated_at` for active matches, so **`updated_at` is a faithful turn-start timestamp for `status = 'active'` rows and no schema change is required to ship the feature.** The turn deadline is `updated_at + TURN_EXPIRY_MS`.

Caveat to keep honest: this relies on a convention. If a later change writes `updated_at` for another reason (for example a rename or a "nudge" feature), it would silently extend the deadline. If Jon prefers an explicit column, the additive option is below. It is not required.

### Optional additive schema (only if Jon wants it)

Apply by hand. Nothing here is in this PR, and no migration file is added.

```sql
ALTER TABLE cinq_matches ADD COLUMN turn_started_at TEXT;
ALTER TABLE cinq_matches ADD COLUMN expired_at TEXT;
ALTER TABLE cinq_player_results ADD COLUMN forfeit INTEGER NOT NULL DEFAULT 0;
```

Note: the runtime tables are named `cinq_*` (see `ensureCinqSchema` in `app/api/_shared/cinq-db.ts`), while `db/schema.ts` still declares `jotto_*` and `jortal_*` names. The SQL above targets the live `cinq_*` tables. See open questions.

`ensureCinqSchema` auto-adds missing columns with `PRAGMA table_info` + `ALTER TABLE`, so adding a column there would also work, but the issue asks for hand-applied SQL, so any column goes through Jon.

Recommended minimum without any column: store nothing new. Mark an expired match as `status = 'finished'`, `winner = <opponent>`, and distinguish a forfeit from a normal win by the absence of a winning guess (see History and stats). The `forfeit` flag column is the only addition worth considering, because it makes the UI label and stats filter exact instead of inferred.

## Enforcement: lazy-on-read vs cron

Recommendation: **lazy expiry on read, with a small sweep on stats reads. No cron.**

### Why lazy fits this app

- The client already polls constantly. In a game, `useCinq.js` calls `syncMatch` every 2200 ms. On home, multiplayer and friend screens, `refreshSavedMatches` hits `GET /api/matches/:code` for every saved match every 8000 ms. So any match someone cares about is read often, and each read can settle expiry.
- There is no server-side friends or match list endpoint. `savedMatches` lives in device storage and is refreshed through the per-match GET. The read path is therefore a single function: `publicMatchState` / the GET in `app/api/matches/[code]/route.ts`.
- No wrangler change. `wrangler.jsonc` is hands-off for ordinary PRs and currently has no `triggers`, no `scheduled` handler, and `worker/index.ts` exports only `fetch`.
- A match nobody opens has no observer, so settling it late is invisible. The one place lateness is visible is stats, handled by the sweep below.

### Implementation sketch (for the build issue)

Add to `app/api/_shared/cinq-db.ts`:

- `turnDeadline(match: MatchRow): number | null` returns `Date.parse(match.updated_at) + TURN_EXPIRY_MS` for active matches, else null.
- `expireIfOverdue(db, match): Promise<MatchRow>`: if `status === 'active'` and now > deadline, run one guarded statement and return the refreshed row:

```sql
UPDATE cinq_matches
SET status = 'finished', winner = ?, updated_at = ?
WHERE code = ? AND status = 'active' AND current_turn = ? AND updated_at = ?
```

  The `WHERE` clause repeats the optimistic-concurrency pattern already used by the guess route (`status = 'active' AND current_turn = ?`), plus `updated_at = ?` so a guess landing at the last second wins the race. `meta.changes === 1` means this request settled it; then call `recordPlayerResults` (same pattern as the guess route after `getMatch`). It is idempotent because `recordPlayerResults` uses `INSERT OR IGNORE` on `(match_code, player_key)`.
- Call `expireIfOverdue` in three places: right after `getMatch` in `matches/[code]/route.ts` GET, in the guess route (so a late guess after day 14 gets a 409 "This match has expired" instead of being accepted), and in the stats sweep.
- Guess route ordering matters: expire check must come before the duplicate/pending logic, otherwise a queued guess could be accepted on an already-expired match.
- `winner` is the non-turn player: `match.current_turn === 1 ? 2 : 1`.

### Stats sweep

`player-stats` reads only `cinq_player_results`, so an expired-but-never-opened match would be missing from a player's record. In `app/api/player-stats/route.ts`, before the query, settle the caller's own overdue matches:

```sql
SELECT * FROM cinq_matches
WHERE status = 'active' AND updated_at < ?          -- cutoff = now - TURN_EXPIRY_MS
  AND (player1_key = ? OR player2_key = ?)
```

then `expireIfOverdue` each row. It is bounded to one player's matches, so cost is small. Add an index only if it shows up as slow (`cinq_matches(player1_key)`, `cinq_matches(player2_key)`, hand-applied).

### Cron alternative (not recommended)

Pros: stats are exactly current without any read; could later drive push notifications for warnings. Cons: needs a wrangler change and a new worker entry point, plus `ensureCinqSchema` and a D1 scan of all active matches daily, for no user-visible gain given the polling above.

If Jon chooses cron anyway, he would need to:

1. Add to `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 8 * * *"] }
```

2. Add a `scheduled(event, env, ctx)` export to the `worker` object in `worker/index.ts` that calls the same `expireIfOverdue` over `SELECT code FROM cinq_matches WHERE status='active' AND updated_at < ?`. Note `getCinqDb()` reads `env` from `cloudflare:workers`, so the same helpers work there.
3. Keep lazy-on-read anyway as a backstop, because cron is at best daily and the deadline is exact.

## UI

All strings are derived from `updatedAt` (already sent by `publicMatchState`) and the shared constant, so the API response needs only one optional addition: `turnDeadline` (ISO string) and, for convenience, `expired: boolean`. Computing from `updatedAt` on the client is also fine and needs no API change.

Deriving in `src/game/deriveView.js` (which already builds `statusLabel` and uses `formatLastPlayed`): add a `formatTimeLeft(updatedAt)` helper next to `formatLastPlayed`, returning `"14 DAYS LEFT"`, `"3 DAYS LEFT"`, `"1 DAY LEFT"`, `"LESS THAN A DAY LEFT"`, or `"EXPIRED"`.

Where it shows:

1. In-game turn banner (`src/components/Game.jsx`, `.turn-banner`). Your turn: `YOUR TURN · 12 DAYS LEFT`. Opponent's turn: `NOT YOUR TURN` plus a small sub-line `Friend has 12 days to play`. Show the countdown only when the match is `active`.
2. Friend game cards (`src/components/Multiplayer.jsx`, `.friend-game-card-status`): append the time left to `statusLabel` in `activeFriendGames` only when at or under the first warning threshold, to avoid clutter on fresh games.
3. Home badge (`src/components/Home.jsx`, `friends-turn-badge`): no change at first. Optionally tint it when any of your turns is within 1 day.

### Warning timing

Thresholds: **3 days and 1 day left**, defined by `TURN_WARN_DAYS`.

- Player on turn: from 3 days left, the banner turns to the warning style and reads `YOUR TURN · 3 DAYS LEFT, PLAY OR FORFEIT`. At 1 day, the style escalates and the Home card gets a badge. A one-time in-app toast on opening the match the first time each threshold is crossed (remember in device storage keyed by `code:threshold`).
- Opponent: informational only, at the same thresholds: `Friend has 3 days left before they forfeit`. No toast, to avoid nagging someone who is waiting.
- There is no push channel in the app today (no accounts, anonymous `playerKey`), so warnings are only visible when the app is open. State that plainly in the open questions: a 14 day rule with in-app-only warnings means some players will forfeit without seeing one.

## History and stats

An expired match is stored as a finished match: `status = 'finished'`, `winner = opponent`. Consequences, using existing code:

- `playerResults` (`cinq_player_results`): `recordPlayerResults` already writes `won = 1` for the winner and `won = 0` for the other. Forfeit: opponent gets a win, forfeiter gets a loss. Needs one tweak: the function `return`s when `!match.winner` (fine, winner is set) and computes `guesses` from `cinq_guesses` counts, so a forfeit records the guesses actually made.
- Friend history (`deriveView.js`, `friendDetail.matches`): `finished` is true, `won = winner === role`, so it renders `WIN` or `LOSS` with no change. Add a label `WIN (FORFEIT)` / `LOSS (FORFEIT)` when the match is flagged as a forfeit. `counts` is only shown when both `yourCount` and `theirCount` are set, so forfeits with unequal guesses show fine.
- Head to head (`friends.js` `headToHead`): counts `winner === role` as a win and everything else finished as a loss, so forfeits count automatically. Decision for Jon: they should (the rule is "loses").
- Rematch: a forfeited match is `finished`, so `rematchMatch` in `buildFriendList` and the rematch button work unchanged. Nice side effect: it gives the pair a path back into play.
- `player-stats` (`app/api/player-stats/route.ts`): `gamesPlayed`, `wins`, `winRate`, `currentStreak` include forfeits. Exclude forfeit rows from the guess-based figures, because a forfeit guess count is not a solve: `averageGuesses`, `averagePercentile`, `bestGame`, and the `population` query. Today those filter on `guesses > 0`, which would wrongly include a forfeiting winner or loser. Cleanest fix is a `forfeit` column (above) and `AND forfeit = 0` in those three queries. Without the column, a forfeit can be detected by `won = 1` and the match having no winning guess, but that needs a join and is brittle.
- `daily-stats` (`cinq_daily_results`): untouched. It is the solo daily puzzle, unrelated to multiplayer matches, so expiry does not apply.
- Revealing secrets: `publicMatchState` only returns `opponentSecret` when `status === 'finished'`, so after a forfeit both players see the opponent's word. This is a fine consequence and arguably a nice resolution.

## Edge cases

- Guess lands after the deadline but before anything settled it: the guess route calls `expireIfOverdue` first and rejects with 409. Server time is the only clock.
- Race at the deadline: handled by the `updated_at = ?` guard; exactly one of guess or expiry wins.
- Clock display skew: the client shows days left from device time. Server decides; the UI may show "1 day left" for a match the server has just expired. Acceptable, and the next poll (at most 2.2 s in game) corrects it.
- Pending (queued) guess on an expired match: deleted by the same cleanup the guess route does at finish (`DELETE FROM cinq_pending_guesses WHERE match_code = ?`); include it in `expireIfOverdue`.
- Old matches that are already stale when this ships: every existing active match with `updated_at` older than 14 days would be forfeited on first read. Recommend a grace start: either a `TURN_EXPIRY_ENFORCED_FROM` ISO date constant (deadline = max(updated_at, enforced_from) + window) or a one-time clock reset. See open questions.
- Kill switch: guard `expireIfOverdue` behind a boolean in `src/config.js` (`TURN_EXPIRY_ENABLED`, default `false` until Jon flips it), so the rule can be turned off by a one-line change. Ship UI and server together behind it.

## Follow-up issues (proposed breakdown)

1. **Server: lazy turn expiry.** Add `TURN_EXPIRY_*` constants to `src/config.js`, `turnDeadline` and `expireIfOverdue` in `cinq-db.ts`, call from match GET and guess route (409 on expired), `recordPlayerResults` on settle, `turnDeadline` added to `publicMatchState`. Tests in `tests/cinq-db.test.mjs` (deadline math, guarded update, idempotent result recording, race at boundary). Behind `TURN_EXPIRY_ENABLED = false`.
2. **Stats: forfeit handling.** Player-stats sweep of the caller's overdue matches, exclude forfeits from guess-based figures, and (if approved) the `forfeit` column SQL for Jon. Tests in `tests/api-stats.test.mjs`. Depends on 1.
3. **UI: countdown, warnings, history labels.** `formatTimeLeft` and thresholds in `deriveView.js`, `Game.jsx` banner, `Multiplayer.jsx` cards, one-time toasts, `WIN/LOSS (FORFEIT)` in friend history. Tests in `tests/deriveView.test.mjs`. Can start in parallel with 1 using `updatedAt` alone.

## Open questions for Jon

1. Add the `forfeit` column (and optionally `turn_started_at`/`expired_at`), or accept inference from `updated_at` and keep the feature schema-free? Recommendation: add only `cinq_player_results.forfeit`.
2. Table naming: `db/schema.ts` declares `jotto_*` / `jortal_player_results` but the live code uses `cinq_*`. Which is the real production D1 name? The SQL in this doc assumes `cinq_*`.
3. Warnings are in-app only (no accounts, no push). Is that acceptable, or should expiry wait for push or email?
4. Grandfathering: forfeit stale active matches immediately at launch, or start every active clock fresh at the enable date?
5. Should a forfeit count in head-to-head and `winRate`? This design says yes.
6. Should the on-turn player who has a queued guess still forfeit? Queued guesses are for the opponent's turn mechanics, and this design treats queueing as not a move (it does not touch `updated_at`).
7. 14 days applies to every turn including the first. Is a shorter window for the very first move (for example a match joined but never started) wanted?
