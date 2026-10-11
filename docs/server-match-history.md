# Design: per-friend match history on the server

Status: proposal, no code in this PR. Issue #49. Jon decides the path.

## Problem

The per-friend 1v1 history (the list under a friend, the head-to-head record, the rematch button) is built from a list kept in the device's `localStorage`. Delete the app or switch phones and it is gone, and two devices show different histories. The server already stores every match, so the question is how little it takes to serve that history from there.

## What is stored locally today

`src/game/useCinq.js`, `storeMatchSummary`, key `MATCHES_KEY = 'cinq-rival-matches-v1'`. One row per match code, rewritten every time the match is refreshed:

| Field | Meaning | On the server today |
| --- | --- | --- |
| `code` | Match code | `cinq_matches.code` |
| `token` | This player's per-match bearer token | `cinq_matches.player1_token` / `player2_token` |
| `yourName`, `friendName` | Names at last refresh | `player1_name` / `player2_name` (current names live in `cinq_players.name`) |
| `friendCode` | Opponent's friend ID, `''` if unknown | `cinq_players.friend_code`, via `player{1,2}_key` |
| `yourCount`, `theirCount` | Guess counts | `COUNT(*)` over `cinq_guesses` |
| `status` | `waiting`, `active`, `finished` | `cinq_matches.status` |
| `yourTurn` | Derived | `current_turn` + `status` |
| `pendingGuess` | Queued guess | `cinq_pending_guesses` |
| `winner`, `role` | Winner (1 or 2) and which seat you are | `winner`; role from which `player*_key` matches |
| `updatedAt` | Last activity | `updated_at` |
| `forfeit` | Turn-expiry flag (PRs #45/#46) | Not stored, see below |

Friends (`src/game/friends.js`): `cinq-friends` (`{friendCode, name, addedAt}`) and `cinq-friends-removed` are also local only. `matchesForFriend` joins friend to matches by `friendCode`, falling back to a name match for old rows; `headToHead` counts finished matches where `winner === role`.

## What the server already holds

Live tables (`ensureCinqSchema`, named `cinq_*`; `db/schema.ts` still says `jotto_*`, see turn-expiry doc question 2):

- `cinq_matches`: `code`, `status`, `player1_key`, `player2_key`, names, `winner`, `rematch_code`, `created_at`, `updated_at`. **`player1_key` / `player2_key` are nullable.** They were added later by an `ALTER`, so matches played by older builds have `NULL` keys.
- `cinq_guesses`: every guess with `player` seat and `match_count`.
- `cinq_player_results`: one row per `(match_code, player_key)` with `won`, `guesses`, `completed_at`. Written on finish, `INSERT OR IGNORE`.
- `cinq_players`: `player_key` to `friend_code` and `name`.
- `cinq_friend_adds (adder_key, target_key)`: who added whom, with `cinq_friend_adds_target_idx`.

### Can history be derived with no new storage?

**Yes, for every match that has both player keys recorded.** For a caller `K` and a friend with key `F`:

```sql
SELECT * FROM cinq_matches
WHERE status = 'finished'
  AND ((player1_key = ? AND player2_key = ?) OR (player1_key = ? AND player2_key = ?))
```

Friend code resolves to `F` through `cinq_players`. Winner, guess counts, names, date and rematch link are all there. No new table is needed for the read path.

**Gaps:**

1. **Old matches with `NULL` keys.** Not derivable by key. Recoverable only by proof of participation (the match `token`), see Migration.
2. **Forfeits.** `winner` is set but nothing marks it as a forfeit. Needs the optional `cinq_player_results.forfeit` column from the turn-expiry doc (add-only), or the client keeps inferring from "winner set and no winning guess".
3. **Index.** No index on `player1_key` / `player2_key`. A per-player scan is bounded but unindexed. Add `CREATE INDEX IF NOT EXISTS cinq_matches_p1_idx ON cinq_matches (player1_key)` and the same for `player2_key`, hand-applied. `cinq_player_results` is keyed `(match_code, player_key)`, so a per-player query there also wants `(player_key, completed_at)`.
4. **Friend removal and the friends list** are not stored, only `cinq_friend_adds` (outgoing). See Privacy.
5. **In-progress matches.** Out of scope for history. Active games keep working off per-match tokens and the existing `GET /api/matches/:code`.

Recommendation: derive from `cinq_matches` (joined to `cinq_player_results` when the forfeit column exists). Do not create a separate history table, because a copy could disagree with the match row.

## Read endpoint proposal

```
GET /api/friends/:friendCode/history?playerKey=...&limit=20&before=<cursor>
```

Matches the existing style (`/api/friends/incoming` takes `playerKey` in the query string). A header is better hygiene because query strings reach logs (flagged in the identity doc); `X-Player-Key` is a cheap improvement if Jon wants it, but then it differs from the sibling endpoints. Recommendation: follow the existing pattern now, move all of them together later.

### Auth

`playerKey` is the credential, as everywhere else. The server resolves the caller, resolves `friendCode` to the friend's key, and only returns matches where **both** keys appear on the same row. Nothing is returned for a friend the caller never played, so the endpoint cannot be used to look up anyone's games by guessing friend IDs.

### Response

```json
{
  "friend": { "friendCode": "K7M2QX", "name": "Sam" },
  "record": { "wins": 5, "losses": 3, "played": 8 },
  "matches": [
    {
      "code": "ABC234",
      "role": 1,
      "winner": 2,
      "yourName": "Jon", "friendName": "Sam",
      "yourGuesses": 6, "theirGuesses": 5,
      "forfeit": false,
      "finishedAt": "2026-10-01T18:02:11.000Z",
      "rematchCode": null
    }
  ],
  "nextCursor": "2026-09-20T10:00:00.000Z|XYZ789"
}
```

- `record` is computed over all finished matches against that friend (a `COUNT` with `SUM(winner = role)`), not just the returned page, so the head-to-head is correct even when paginated. Forfeits are included, matching the turn-expiry decision.
- `matches` only holds `finished` rows. No secrets, no guess words, no per-match `token`. Opening an old match for the guess-by-guess review stays local-token-only; history rows are a summary. (If Jon wants the full replay later, it needs a token reissue, same limitation as in the identity doc.)
- `forfeit` is `false` until the column exists, then read from it.

### Pagination

Keyset, not offset: order by `updated_at DESC, code DESC`, cursor is `updated_at|code` of the last row, `limit` default 20, max 50. Stable while new matches finish, and cheap with the index above.

### Optional second endpoint

`GET /api/history/summary?playerKey=...` returning one row per opponent (`friendCode`, `name`, `wins`, `losses`, `latestAt`) in a single query, to rebuild the friend list on a fresh install without N calls. The player's existing friends-list rebuild from `cinq_friend_adds` (noted in the identity doc) would feed the same screen. Only needed if Jon wants the friends list to survive reinstall too; history by itself works from per-friend calls.

## Privacy rules

1. **Only the two players in a match can see it.** Enforced by requiring `playerKey` to equal `player1_key` or `player2_key` on every returned row, and the friend key to equal the other seat.
2. **A friend ID is not a credential.** It never reveals history, only a name and (via the existing add flow) lets you request to be added.
3. **No opponent secrets or guess words** in history. Revealing the opponent's word at the end of a match already happens in the match view for participants; history does not repeat it.
4. **Names** are the current `cinq_players.name` in the `friend` object and the name at match time on rows (`player*_name`), so a rename does not rewrite the past.
5. **Unknown or not-played friend codes** return `200` with empty `matches` and zeroed `record` (not `404`), so the endpoint cannot be used to test whether a friend ID exists. A malformed code returns `400`.
6. **Friend removal.** Removing a friend today is a local act (`cinq-friends-removed`). Proposed semantics: removal hides the person from the friends list and history screen on that account's devices, but **does not delete server rows**, because the match belongs to both players and the other player's history must stay intact. Because the removal list is also local, it would reset on reinstall. If Jon wants it durable, the additive option is `cinq_friend_removed (player_key, friend_key, created_at)`; the history endpoint would then filter removed friends unless the caller explicitly asks. Rematching or re-adding the person clears the removal. A hard "delete my history" is a separate, bigger feature (it would need to anonymize the opponent's rows rather than drop them); not proposed here.
7. **Account deletion / App Store data rules.** There are no accounts, but if Jon later adds "erase my data", history rows keyed to that `playerKey` are what it would null out. Worth keeping in mind when naming columns.

## Rate limiting

There is none anywhere in the API today and no wrangler change is allowed in this track, so options in increasing cost:

1. **None beyond cost control** (recommended for v1): the query is two indexed lookups and a page of at most 50 rows, and the key must match, so abuse is limited to a key-holder reading their own data.
2. **In-Worker soft limit** keyed on `playerKey`, using the Cache API or a small D1 counter table (`cinq_rate (bucket, window_start, n)`, add-only), for example 30 history reads per minute per key. It protects D1 read quota if the client has a polling bug.
3. **Cloudflare WAF rate rule** on `/api/friends/*/history` per IP. Dashboard configuration, outside the repo, so Jon's call.

Client side: fetch history when a friend screen opens and after a match finishes, not on the 2.2 s game poll or the 8 s home refresh. History changes only when a match ends.

## Migration (add-only)

### Schema

Everything is optional and add-only, applied by hand (no migration file in this track):

```sql
CREATE INDEX IF NOT EXISTS cinq_matches_p1_idx ON cinq_matches (player1_key);
CREATE INDEX IF NOT EXISTS cinq_matches_p2_idx ON cinq_matches (player2_key);
CREATE INDEX IF NOT EXISTS cinq_player_results_player_idx ON cinq_player_results (player_key, completed_at);
-- only if forfeit labels are wanted (same column as the turn-expiry doc):
ALTER TABLE cinq_player_results ADD COLUMN forfeit INTEGER NOT NULL DEFAULT 0;
-- only if durable friend removal is wanted:
CREATE TABLE IF NOT EXISTS cinq_friend_removed (
  player_key TEXT NOT NULL, friend_key TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (player_key, friend_key)
);
```

Nothing is renamed or dropped, so rolling the app back leaves the old client working: it ignores the new endpoint and keeps using local history. The history endpoint itself is a pure addition.

### Backfill of old local history

Matches with both keys need no upload: they appear automatically once the endpoint exists. For matches played before keys were recorded, the device still has `(code, token)`. Proposed one-time upload:

```
POST /api/history/claim   { playerKey, matches: [{ code, token }, ...] }   (max 100 per call)
```

For each pair the server loads the match, confirms `token` equals `player1_token` or `player2_token` (proof the caller played that seat), and then **only if that seat's key is `NULL`** sets it: `UPDATE cinq_matches SET player1_key = ? WHERE code = ? AND player1_key IS NULL`, plus `INSERT OR IGNORE` into `cinq_player_results` for finished matches (via the existing `recordPlayerResults` shape). This changes data, not schema, and never overwrites an existing key, so a stolen token cannot reassign a match that already has an owner. The call is idempotent; the response is `{ claimed, skipped }`.

Limits to be honest about: it only helps while the old install still exists. A reinstall that already lost `localStorage` cannot claim old matches, because the tokens are gone. Those matches are only recoverable if the same `playerKey` was restored first (identity doc) and they had keys already. Matches with `NULL` keys and no surviving token are permanently unattributable.

Also, old rows with `player2_key IS NULL` where the opponent never had a profile cannot be tied to a friend ID at all. The client's name-based grouping fallback in `buildFriendList` should stay for those local rows.

### Client reconciliation

The server is the source of truth for finished matches; local storage stays the source for active matches (it holds the tokens).

1. On opening a friend screen (and once at app start, after the key is hydrated): call the history endpoint and, if it is the first run on this install, call `/api/history/claim` with local `(code, token)` pairs for finished and active rows. Remember completion in `cinq-history-claimed-v1`.
2. Merge by `code`: a server row wins for `status`, `winner`, `role`, counts, `updatedAt`, `forfeit`. A local row keeps `token` and `pendingGuess`. A match only on the server is shown with no token (history only, review is unavailable, rematch works because rematch needs the code only if the existing rematch route accepts it: to confirm in implementation).
3. A match only local (never uploaded, offline) stays visible and is claimed next time.
4. `headToHead` should prefer the server `record` when present, because it covers pages the device has not loaded.
5. On failure or offline, render local data as today. History must never block the friends screen.
6. Keep `matchesForFriend`/`buildFriendList` working on the merged list, so the home badge and rematch logic need no rewrite.

## Interaction with turn-expiry forfeits (PRs #45/#46)

- An expired match is a normal `finished` match with `winner = non-turn player` (turn-expiry doc), so it appears in history with no special case on the read path.
- The `forfeit` flag is the only gap. Today the client sets it from `match.expired`; that value is not in `publicMatchState` and not stored. If the optional `cinq_player_results.forfeit` column ships, the history endpoint returns it exactly. Without the column, forfeits are indistinguishable from wins by a guess-less player, and the UI loses the `(FORFEIT)` label after a reinstall. Recommendation: ship the one column.
- Lazy expiry settles a match only when somebody reads it. A history read should therefore either call `expireIfOverdue` for the caller's overdue active matches against that friend (cheap, bounded), or accept that an unopened overdue match is missing from history until next opened. Recommendation: settle in the history read, same as the stats sweep in the turn-expiry doc.
- Behind `TURN_EXPIRY_ENABLED` (default off) there are no forfeits, so history ships independently of that flag.
- Head-to-head counts forfeits as losses (turn-expiry decision 5); the server `record` must use the same rule.

## Interaction with identity work (#48, `docs/identity-recovery.md`)

- History is keyed by `playerKey`. If identity recovery (Keychain or recovery code) restores the same key on a new install, history comes back with no upload at all. That is the cleanest path and covers most of the problem.
- If identity is **not** recovered, a reinstall mints a new `playerKey` and a new friend ID. Server history is still reachable only under the old key, so server-side history alone does **not** survive a reinstall. This is the key dependency: **#49 is mostly worthless without #48.** What #49 adds on its own is multi-device consistency for an existing key and not depending on `localStorage` eviction.
- The identity doc's "free wins" (friends list from `cinq_friend_adds`, stats from `cinq_player_results`) and this doc's endpoints should ship as one restore flow: restore key, fetch friends, fetch per-friend history.
- If recovery adds a way to merge two keys (old into new), history needs the same merge: `UPDATE cinq_matches SET player1_key = new WHERE player1_key = old` (and seat 2, and `cinq_player_results`). Not proposed unless Jon picks a merge-capable option.
- Shared Apple ID across devices (Keychain sync) means two devices act as one player; history merges naturally under one key.

## Rollout order

1. Hand-apply the indexes (and the `forfeit` column if approved).
2. Server: `GET /api/friends/:friendCode/history` and tests (participant-only access, pagination, record counts, empty result for strangers, forfeit flag).
3. Server: `POST /api/history/claim` and tests (token must match seat, never overwrites a non-null key, idempotent, 100 item cap).
4. Client: fetch and merge behind a config flag `SERVER_HISTORY_ENABLED` in `src/config.js` (default `false`), reconciliation as above, local fallback unchanged.
5. Flip the flag after checking real data. Flipping it back restores today's local-only behavior.

## Open questions for Jon

1. Is server history worth shipping before the identity decision (#48)? Without a recovered `playerKey` it does not survive reinstall. Recommendation: ship together, or after #48 picks a path.
2. Add `cinq_player_results.forfeit` (and the indexes)? Recommendation: yes, add-only.
3. Is the backfill claim endpoint worth it? It only helps players who still have the old install and have `NULL`-key matches. How many such rows exist? A one-off `SELECT COUNT(*) FROM cinq_matches WHERE player1_key IS NULL OR player2_key IS NULL` would tell.
4. Friend removal: keep it local (resets on reinstall), or add the durable `cinq_friend_removed` table?
5. `playerKey` in the query string vs a header for this and the existing endpoints?
6. Rate limiting: none for v1, an in-Worker soft limit, or a Cloudflare WAF rule?
7. Should history rows be tappable into a full replay? That needs a per-match token reissue for a player key, a new capability with its own privacy review.
8. Production table names: the SQL assumes `cinq_*` (see the same question in `docs/turn-expiry.md`).
