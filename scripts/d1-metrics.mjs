// Prints (never runs) read-only SQL for `wrangler d1 execute cinq --remote --command ...`.
// Usage: node scripts/d1-metrics.mjs [query-id ...]   (no ids = all queries)
// Tables are the live cinq_* tables created in app/api/_shared/cinq-db.ts; see docs/usage-metrics.md.
import { pathToFileURL } from 'node:url';

const WINDOW = "date('now', '-29 days')";

// Player activity: one row per (player, day) from rows that carry a player_key.
const ACTIVITY = `SELECT player_key, date(at) AS day FROM (
  SELECT player_key, completed_at AS at FROM cinq_daily_results
  UNION ALL SELECT player_key, completed_at AS at FROM cinq_player_results
  UNION ALL SELECT player1_key AS player_key, created_at AS at FROM cinq_matches WHERE player1_key IS NOT NULL
) GROUP BY player_key, day`;

export const queries = [
  {
    id: 'new-players',
    title: 'New players per day (last 30 days)',
    sql: `SELECT date(created_at) AS day, COUNT(*) AS new_players FROM cinq_players WHERE date(created_at) >= ${WINDOW} GROUP BY day ORDER BY day`,
  },
  {
    id: 'matches-created',
    title: 'Matches created per day (last 30 days)',
    sql: `SELECT date(created_at) AS day, COUNT(*) AS matches_created FROM cinq_matches WHERE date(created_at) >= ${WINDOW} GROUP BY day ORDER BY day`,
  },
  {
    id: 'both-guessed',
    title: 'Matches where both players guessed, by creation day',
    sql: `SELECT date(m.created_at) AS day, COUNT(*) AS matches, SUM(CASE WHEN EXISTS (SELECT 1 FROM cinq_guesses g WHERE g.match_code = m.code AND g.player = 1) AND EXISTS (SELECT 1 FROM cinq_guesses g WHERE g.match_code = m.code AND g.player = 2) THEN 1 ELSE 0 END) AS both_guessed, ROUND(1.0 * SUM(CASE WHEN EXISTS (SELECT 1 FROM cinq_guesses g WHERE g.match_code = m.code AND g.player = 1) AND EXISTS (SELECT 1 FROM cinq_guesses g WHERE g.match_code = m.code AND g.player = 2) THEN 1 ELSE 0 END) / COUNT(*), 3) AS share FROM cinq_matches m WHERE date(m.created_at) >= ${WINDOW} GROUP BY day ORDER BY day`,
  },
  {
    id: 'matches-finished',
    title: 'Matches finished per day (by last update; includes forfeits)',
    sql: `SELECT date(updated_at) AS day, COUNT(*) AS finished, SUM(CASE WHEN winner IS NOT NULL THEN 1 ELSE 0 END) AS with_winner FROM cinq_matches WHERE status = 'finished' AND date(updated_at) >= ${WINDOW} GROUP BY day ORDER BY day`,
  },
  {
    id: 'rematch-rate',
    title: 'Rematch rate: finished matches that started a rematch, by creation day',
    sql: `SELECT date(created_at) AS day, COUNT(*) AS finished, SUM(CASE WHEN rematch_code IS NOT NULL THEN 1 ELSE 0 END) AS rematched, ROUND(1.0 * SUM(CASE WHEN rematch_code IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 3) AS rate FROM cinq_matches WHERE status = 'finished' AND date(created_at) >= ${WINDOW} GROUP BY day ORDER BY day`,
  },
  {
    id: 'daily-completions',
    title: 'Daily-puzzle completions per day (last 30 days)',
    sql: `SELECT date AS day, COUNT(*) AS completions, ROUND(AVG(guesses), 2) AS avg_guesses FROM cinq_daily_results WHERE date >= ${WINDOW} GROUP BY date ORDER BY date`,
  },
  {
    id: 'returning-7d',
    title: '7-day returning players: active on 2+ distinct days in the last 7 days',
    sql: `SELECT COUNT(*) AS active_players, SUM(CASE WHEN days >= 2 THEN 1 ELSE 0 END) AS returning_players FROM (SELECT player_key, COUNT(*) AS days FROM (${ACTIVITY}) WHERE day >= date('now', '-6 days') GROUP BY player_key)`,
  },
];

export function toCommand(query) {
  return `npx wrangler d1 execute cinq --remote --command "${query.sql.replace(/\s+/g, ' ')}"`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((id) => !queries.some((q) => q.id === id));
  if (unknown.length) {
    console.error(`Unknown query id(s): ${unknown.join(', ')}. Known: ${queries.map((q) => q.id).join(', ')}`);
    process.exit(1);
  }
  for (const q of queries.filter((q) => !wanted.length || wanted.includes(q.id))) {
    console.log(`# ${q.id}: ${q.title}`);
    console.log(toCommand(q));
    console.log('');
  }
}
