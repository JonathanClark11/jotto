# Usage metrics from D1

There is no analytics sink yet (#36), but D1 already holds the facts. `scripts/d1-metrics.mjs` **prints** read-only
`SELECT` queries as ready-to-paste `wrangler d1 execute` commands. It never connects to anything itself.

## How to run

```bash
node scripts/d1-metrics.mjs                    # print every command
node scripts/d1-metrics.mjs rematch-rate       # print one (ids below)
node scripts/d1-metrics.mjs | grep '^npx' | head -1 | sh   # run the first one
```

Copy a printed `npx wrangler d1 execute cinq --remote --command "..."` line into a terminal that is logged in to
Cloudflare (`npx wrangler whoami`). Every query is a single `SELECT`: nothing is written. Per-day queries cover the
last 30 days (UTC dates; timestamps are ISO strings).

The live tables are the `cinq_*` ones created in `app/api/_shared/cinq-db.ts`. `db/schema.ts` mirrors four of them as
`jotto_*`/`jortal_*` and has no players or friends tables, so `tests/d1-metrics.test.mjs` checks the matches, guesses,
daily-results and player-results columns against `db/schema.ts`, and runs every query against an in-memory SQLite
built from the `cinq-db.ts` DDL.

## Queries

| Id | Answers | Source |
| --- | --- | --- |
| `new-players` | New players per day. | `cinq_players.created_at` |
| `matches-created` | Matches created per day. | `cinq_matches.created_at` |
| `both-guessed` | Per creation day: matches, matches where player 1 and player 2 each have at least one guess, and the share. Low share means invitees are not playing. | `cinq_matches`, `cinq_guesses` |
| `matches-finished` | Matches finished per day (`status = 'finished'`, dated by `updated_at`), and how many have a winner recorded (turn-expiry forfeits set one too, so expect these to match). | `cinq_matches` |
| `rematch-rate` | Per creation day: finished matches, how many have a `rematch_code`, and the rate. | `cinq_matches` |
| `daily-completions` | Daily-puzzle completions per day and average guesses. | `cinq_daily_results` |
| `returning-7d` | Players active in the last 7 days and how many of them were active on 2 or more distinct days. | `cinq_daily_results`, `cinq_player_results`, `cinq_matches.player1_key` |

## Caveats

- Activity for `returning-7d` is a proxy: a daily result, a finished-match result, or creating a match. Joining or
  guessing in someone else's match is not counted, because those rows carry no timestamped player key.
- `matches-finished` uses `updated_at`, which is the last change to the match; a finished match is not touched again.
- Players are anonymous keys; no query selects names, tokens, secrets or codes.
