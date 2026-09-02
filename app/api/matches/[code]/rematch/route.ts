import {
  createMatchCode,
  createPlayerToken,
  ensureJottoSchema,
  errorResponse,
  getJottoDb,
  getMatch,
  isSecretWord,
  normalizeCode,
  normalizeName,
  normalizePlayerKey,
  normalizeWord,
  playerRole,
  publicMatchState,
} from "../../../_shared/jotto-db";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const { code: rawCode } = await context.params;
  const sourceCode = normalizeCode(rawCode);
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const name = normalizeName(body.name);
  const playerKey = normalizePlayerKey(body.playerKey);
  const secret = normalizeWord(body.secret);
  if (!name) return errorResponse("Enter your name");
  if (!isSecretWord(secret)) return errorResponse("Choose a valid five-letter word with no repeated letters");

  let source = await getMatch(db, sourceCode);
  if (!source) return errorResponse("Match not found", 404);
  if (!playerRole(source, token)) return errorResponse("Player token is invalid", 403);
  if (source.status !== "finished") return errorResponse("Finish this match before starting a rematch", 409);

  let rematchCode = source.rematch_code;
  if (!rematchCode) {
    let candidate = createMatchCode();
    for (let tries = 0; tries < 4 && await getMatch(db, candidate); tries += 1) candidate = createMatchCode();
    if (await getMatch(db, candidate)) return errorResponse("Could not create a rematch", 503);
    const claim = await db.prepare(`UPDATE jotto_matches SET rematch_code = ?, updated_at = ?
      WHERE code = ? AND status = 'finished' AND rematch_code IS NULL`)
      .bind(candidate, new Date().toISOString(), sourceCode)
      .run();
    if ((claim.meta.changes ?? 0) === 1) {
      rematchCode = candidate;
      const newToken = createPlayerToken();
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO jotto_matches
        (code, status, player1_token, player1_name, player1_key, player1_secret,
          current_turn, created_at, updated_at)
        VALUES (?, 'waiting', ?, ?, ?, ?, 1, ?, ?)`)
        .bind(rematchCode, newToken, name, playerKey || null, secret, now, now)
        .run();
      const created = await getMatch(db, rematchCode);
      return Response.json({ token: newToken, match: await publicMatchState(db, created!, newToken) }, { status: 201 });
    }
    source = await getMatch(db, sourceCode);
    rematchCode = source?.rematch_code ?? null;
  }

  if (!rematchCode) return errorResponse("The rematch is not ready yet", 503);
  const rematch = await getMatch(db, rematchCode);
  if (!rematch) return errorResponse("The rematch is still being prepared", 503);
  if (rematch.status !== "waiting" || rematch.player2_token) return errorResponse("This rematch has already started", 409);
  if (playerKey && rematch.player1_key === playerKey) return errorResponse("Your rematch is waiting for your friend", 409);

  const newToken = createPlayerToken();
  const result = await db.prepare(`UPDATE jotto_matches
    SET player2_token = ?, player2_name = ?, player2_key = ?, player2_secret = ?,
      status = 'active', updated_at = ?
    WHERE code = ? AND status = 'waiting' AND player2_token IS NULL`)
    .bind(newToken, name, playerKey || null, secret, new Date().toISOString(), rematchCode)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return errorResponse("Your friend joined this rematch first", 409);
  const joined = await getMatch(db, rematchCode);
  return Response.json({ token: newToken, match: await publicMatchState(db, joined!, newToken) });
}
