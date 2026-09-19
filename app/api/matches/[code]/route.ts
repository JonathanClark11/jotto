import {
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  getMatch,
  normalizeCode,
  publicMatchState,
} from "../../_shared/cinq-db";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const token = request.headers.get("x-cinq-player") ?? "";
  const match = await getMatch(db, code);
  if (!match) return errorResponse("Match not found", 404);
  const state = await publicMatchState(db, match, token);
  if (!state) return errorResponse("This match link is not valid for this player", 403);
  return Response.json({ match: state });
}
