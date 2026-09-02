import {
  createMatchCode,
  createPlayerToken,
  ensureJottoSchema,
  errorResponse,
  getJottoDb,
  getMatch,
  isSecretWord,
  normalizeName,
  normalizePlayerKey,
  normalizeWord,
  publicMatchState,
} from "../_shared/jotto-db";

export async function POST(request: Request) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const body = await request.json().catch(() => ({}));
  const name = normalizeName(body.name);
  const playerKey = normalizePlayerKey(body.playerKey);
  const secret = normalizeWord(body.secret);
  if (!name) return errorResponse("Enter your name");
  if (!isSecretWord(secret)) return errorResponse("Choose a valid five-letter word with no repeated letters");

  let code = createMatchCode();
  for (let tries = 0; tries < 4 && await getMatch(db, code); tries += 1) code = createMatchCode();
  if (await getMatch(db, code)) return errorResponse("Could not create a unique match code", 503);

  const token = createPlayerToken();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO jotto_matches
    (code, status, player1_token, player1_name, player1_key, player1_secret, current_turn, created_at, updated_at)
    VALUES (?, 'waiting', ?, ?, ?, ?, 1, ?, ?)`)
    .bind(code, token, name, playerKey || null, secret, now, now)
    .run();
  const match = await getMatch(db, code);
  return Response.json({ token, match: await publicMatchState(db, match!, token) }, { status: 201 });
}
