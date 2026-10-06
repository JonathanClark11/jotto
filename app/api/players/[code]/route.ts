import {
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  getPlayerByFriendCode,
  normalizeFriendCode,
} from "../../_shared/cinq-db";

// Resolves a friend ID to a display name so it can be added to a friends list.
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const { code: rawCode } = await context.params;
  const code = normalizeFriendCode(rawCode);
  if (code.length !== 6) return errorResponse("Friend IDs are 6 characters", 400);
  const player = await getPlayerByFriendCode(db, code);
  if (!player) return errorResponse("No player found with that friend ID", 404);
  return Response.json({ friendCode: player.friend_code, name: player.name });
}
