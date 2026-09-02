import {
  ensureJottoSchema,
  errorResponse,
  getJottoDb,
  normalizePlayerKey,
} from "../_shared/jotto-db";

type ResultRow = {
  player_name: string;
  won: number;
  guesses: number;
  completed_at: string;
};

export async function GET(request: Request) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const playerKey = normalizePlayerKey(new URL(request.url).searchParams.get("playerKey"));
  if (!playerKey) return errorResponse("Player profile not found", 400);

  const own = await db.prepare(`SELECT player_name, won, guesses, completed_at
    FROM jortal_player_results WHERE player_key = ? ORDER BY completed_at DESC`)
    .bind(playerKey)
    .all<ResultRow>();
  const rows = own.results ?? [];
  const comparable = rows.filter((row) => Number(row.guesses) > 0);
  const population = await db.prepare(`SELECT guesses FROM jortal_player_results
    WHERE guesses > 0`).all<{ guesses: number }>();
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

  return Response.json({
    playerName: rows[0]?.player_name ?? null,
    gamesPlayed: rows.length,
    wins: wins.length,
    winRate: rows.length ? Math.round((wins.length / rows.length) * 100) : 0,
    averageGuesses: average === null ? null : Number(average.toFixed(1)),
    averagePercentile: percentiles.length
      ? Math.round(percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length)
      : null,
    bestGame: wins.length ? Math.min(...wins.map((row) => Number(row.guesses))) : null,
    currentStreak,
  });
}
