import type { MatchRow } from "../_shared/cinq-db";
import { TURN_EXPIRY_MS } from "../../../src/config.js";
import {
  ensureCinqSchema,
  errorResponse,
  expireIfOverdue,
  forfeitedMatchSql,
  getCinqDb,
  normalizePlayerKey,
  turnExpiry,
} from "../_shared/cinq-db";

type ResultRow = {
  player_name: string;
  won: number;
  guesses: number;
  completed_at: string;
  forfeit?: number;
};

export async function GET(request: Request) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const playerKey = normalizePlayerKey(new URL(request.url).searchParams.get("playerKey"));
  if (!playerKey) return errorResponse("Player profile not found", 400);

  let own;
  let population;
  if (turnExpiry.enabled) {
    // Settle this player's overdue matches first so they are in their record, then drop forfeits from guess stats.
    const cutoff = new Date(Date.now() - TURN_EXPIRY_MS).toISOString();
    const overdue = await db.prepare(`SELECT * FROM cinq_matches
      WHERE status = 'active' AND (player1_key = ? OR player2_key = ?) AND updated_at < ?`)
      .bind(playerKey, playerKey, cutoff)
      .all<MatchRow>();
    for (const match of overdue.results ?? []) await expireIfOverdue(db, match);
    own = await db.prepare(`SELECT r.player_name, r.won, r.guesses, r.completed_at,
      ${forfeitedMatchSql("m")} AS forfeit
      FROM cinq_player_results r LEFT JOIN cinq_matches m ON m.code = r.match_code
      WHERE r.player_key = ? ORDER BY r.completed_at DESC`)
      .bind(playerKey)
      .all<ResultRow>();
    population = await db.prepare(`SELECT r.guesses FROM cinq_player_results r
      LEFT JOIN cinq_matches m ON m.code = r.match_code
      WHERE r.guesses > 0 AND ${forfeitedMatchSql("m")} = 0`).all<{ guesses: number }>();
  } else {
    own = await db.prepare(`SELECT player_name, won, guesses, completed_at
      FROM cinq_player_results WHERE player_key = ? ORDER BY completed_at DESC`)
      .bind(playerKey)
      .all<ResultRow>();
    population = await db.prepare(`SELECT guesses FROM cinq_player_results
      WHERE guesses > 0`).all<{ guesses: number }>();
  }
  const rows = own.results ?? [];
  const comparable = rows.filter((row) => Number(row.guesses) > 0 && !row.forfeit);
  const allGuesses = (population.results ?? []).map((row) => Number(row.guesses));
  const average = comparable.length
    ? comparable.reduce((sum, row) => sum + Number(row.guesses), 0) / comparable.length
    : null;
  const percentiles = comparable.map((row) => {
    if (!allGuesses.length) return 100;
    const atOrBelow = allGuesses.filter((guesses) => guesses >= Number(row.guesses)).length;
    return (atOrBelow / allGuesses.length) * 100;
  });
  let currentStreak = 0;
  for (const row of rows) {
    if (!row.won) break;
    currentStreak += 1;
  }
  const wins = rows.filter((row) => Boolean(row.won));
  const bestWins = wins.filter((row) => !row.forfeit);

  return Response.json({
    playerName: rows[0]?.player_name ?? null,
    gamesPlayed: rows.length,
    wins: wins.length,
    winRate: rows.length ? Math.round((wins.length / rows.length) * 100) : 0,
    averageGuesses: average === null ? null : Number(average.toFixed(1)),
    averagePercentile: percentiles.length
      ? Math.round(percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length)
      : null,
    bestGame: bestWins.length ? Math.min(...bestWins.map((row) => Number(row.guesses))) : null,
    currentStreak,
  });
}
