import {
  ensureJottoSchema,
  errorResponse,
  getJottoDb,
  getMatch,
  normalizeCode,
  publicMatchState,
} from "../../_shared/jotto-db";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getJottoDb();
  await ensureJottoSchema(db);
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const token = request.headers.get("x-jotto-player") ?? "";
  const match = await getMatch(db, code);
  if (!match) return errorResponse("Match not found", 404);
  const state = await publicMatchState(db, match, token);
  if (!state) return errorResponse("This match link is not valid for this player", 403);
  return Response.json({ match: state });
}
