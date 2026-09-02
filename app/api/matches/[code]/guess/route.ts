import {
  ensureJottoSchema,
  errorResponse,
  getJottoDb,
  getMatch,
  isGuessWord,
  normalizeCode,
  normalizeWord,
  playerRole,
  publicMatchState,
  recordPlayerResults,
  sharedLetters,
} from "../../../_shared/jotto-db";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const word = normalizeWord(body.word);
  if (!isGuessWord(word)) return errorResponse("That word is not in Jortal's dictionary");

  const match = await getMatch(db, code);
  if (!match) return errorResponse("Match not found", 404);
  const role = playerRole(match, token);
  if (!role) return errorResponse("Player token is invalid", 403);
  if (match.status !== "active") return errorResponse("This match is not active", 409);

  const duplicate = await db.prepare(
    "SELECT id FROM jotto_guesses WHERE match_code = ? AND player = ? AND word = ?",
  ).bind(code, role, word).first();
  if (duplicate) return errorResponse("You already guessed that word", 409);

  const now = new Date().toISOString();
  if (match.current_turn !== role) {
    await db.prepare(`INSERT INTO jotto_pending_guesses (match_code, player, word, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(match_code, player) DO UPDATE SET word = excluded.word, created_at = excluded.created_at`)
      .bind(code, role, word, now)
      .run();
    const queued = await getMatch(db, code);
    return Response.json({ match: await publicMatchState(db, queued!, token), queued: true });
  }

  const opponentSecret = role === 1 ? match.player2_secret : match.player1_secret;
  if (!opponentSecret) return errorResponse("Your friend has not joined yet", 409);
  const count = sharedLetters(word, opponentSecret);
  const won = word === opponentSecret;
  const turnRow = await db.prepare(
    "SELECT COALESCE(MAX(turn_number), 0) AS last_turn FROM jotto_guesses WHERE match_code = ?",
  ).bind(code).first<{ last_turn: number }>();
  const turnNumber = Number(turnRow?.last_turn ?? 0) + 1;
  const opponent = role === 1 ? 2 : 1;
  const queued = await db.prepare(
    "SELECT word FROM jotto_pending_guesses WHERE match_code = ? AND player = ?",
  ).bind(code, opponent).first<{ word: string }>();
  const queuedWord = queued?.word ?? "";
  const queuedSecret = role === 1 ? match.player1_secret : match.player2_secret;
  const queuedCount = queuedWord && queuedSecret ? sharedLetters(queuedWord, queuedSecret) : 0;
  const queuedWon = Boolean(queuedWord && queuedSecret && queuedWord === queuedSecret);
  const finalWinner = won ? role : (queuedWon ? opponent : null);
  const nextTurn = won ? role : (queuedWord ? role : opponent);
  const statements = [
    db.prepare(`INSERT INTO jotto_guesses
      (match_code, player, turn_number, word, match_count, created_at)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM jotto_matches
        WHERE code = ? AND status = 'active' AND current_turn = ?
      )`)
      .bind(code, role, turnNumber, word, count, now, code, role),
  ];
  if (!won && queuedWord) {
    statements.push(
      db.prepare(`INSERT INTO jotto_guesses
        (match_code, player, turn_number, word, match_count, created_at)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM jotto_matches
          WHERE code = ? AND status = 'active' AND current_turn = ?
        )`)
        .bind(code, opponent, turnNumber + 1, queuedWord, queuedCount, now, code, role),
    );
  }
  statements.push(
    db.prepare(`UPDATE jotto_matches
      SET status = ?, current_turn = ?, winner = ?, updated_at = ?
      WHERE code = ? AND status = 'active' AND current_turn = ?`)
      .bind(finalWinner ? "finished" : "active", nextTurn, finalWinner, now, code, role),
    db.prepare("DELETE FROM jotto_pending_guesses WHERE match_code = ? AND player = ?")
      .bind(code, role),
    db.prepare("DELETE FROM jotto_pending_guesses WHERE match_code = ? AND player = ?")
      .bind(code, opponent),
  );
  if (finalWinner) {
    statements.push(db.prepare("DELETE FROM jotto_pending_guesses WHERE match_code = ?").bind(code));
  }
  const [insertResult] = await db.batch(statements);
  if ((insertResult.meta.changes ?? 0) !== 1) return errorResponse("The turn changed before this guess was saved", 409);
  const updated = await getMatch(db, code);
  if (finalWinner) await recordPlayerResults(db, updated!, now);
  return Response.json({ match: await publicMatchState(db, updated!, token) });
}
