import { ensureJottoSchema, errorResponse, getJottoDb } from "../_shared/jotto-db";

type Bucket = { guesses: number; players: number };

async function statsFor(db: D1Database, date: string, yourGuesses: number | null) {
  const grouped = await db.prepare(`SELECT guesses, COUNT(*) AS players
    FROM jotto_daily_results WHERE date = ? GROUP BY guesses ORDER BY guesses`)
    .bind(date)
    .all<Bucket>();
  const buckets = (grouped.results ?? []).map((row) => ({
    guesses: Number(row.guesses),
    players: Number(row.players),
  }));
  const total = buckets.reduce((sum, row) => sum + row.players, 0);
  const totalGuesses = buckets.reduce((sum, row) => sum + row.guesses * row.players, 0);
  const rank = yourGuesses === null
    ? null
    : 1 + buckets.filter((row) => row.guesses < yourGuesses).reduce((sum, row) => sum + row.players, 0);
  return {
    date,
    totalPlayers: total,
    averageGuesses: total ? Number((totalGuesses / total).toFixed(1)) : null,
    rank,
    buckets,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const guesses = params.get("guesses");
  if (!validDate(date)) return errorResponse("A valid date is required");
  return Response.json(await statsFor(db, date, guesses ? Number(guesses) : null));
}

export async function POST(request: Request) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const body = await request.json().catch(() => ({}));
  if (!validDate(body.date)) return errorResponse("A valid date is required");
  if (typeof body.playerKey !== "string" || body.playerKey.length < 16 || body.playerKey.length > 128) {
    return errorResponse("A valid anonymous player key is required");
  }
  const guesses = Number(body.guesses);
  if (!Number.isInteger(guesses) || guesses < 1 || guesses > 50) return errorResponse("Guess count is invalid");
  await db.prepare(`INSERT OR IGNORE INTO jotto_daily_results
    (date, player_key, guesses, completed_at) VALUES (?, ?, ?, ?)`)
    .bind(body.date, body.playerKey, guesses, new Date().toISOString())
    .run();
  return Response.json(await statsFor(db, body.date, guesses));
}
