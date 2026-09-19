import {
  createPlayerToken,
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  getMatch,
  isSecretWord,
  normalizeCode,
  normalizeName,
  normalizePlayerKey,
  normalizeWord,
  publicMatchState,
} from "../../../_shared/cinq-db";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const body = await request.json().catch(() => ({}));
  const name = normalizeName(body.name);
  const playerKey = normalizePlayerKey(body.playerKey);
  const secret = normalizeWord(body.secret);
  if (!name) return errorResponse("Enter your name");
  if (!isSecretWord(secret)) return errorResponse("Choose a valid five-letter word with no repeated letters");

  const match = await getMatch(db, code);
  if (!match) return errorResponse("Match not found", 404);
  if (match.status !== "waiting" || match.player2_token) return errorResponse("This match already has two players", 409);

  const token = createPlayerToken();
  const result = await db.prepare(`UPDATE cinq_matches
    SET player2_token = ?, player2_name = ?, player2_key = ?, player2_secret = ?, status = 'active', updated_at = ?
    WHERE code = ? AND status = 'waiting' AND player2_token IS NULL`)
    .bind(token, name, playerKey || null, secret, new Date().toISOString(), code)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return errorResponse("Someone else joined this match first", 409);
  const updated = await getMatch(db, code);
  return Response.json({ token, match: await publicMatchState(db, updated!, token) });
}
