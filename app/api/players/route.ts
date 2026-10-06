import {
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  normalizeName,
  normalizePlayerKey,
  upsertPlayer,
} from "../_shared/cinq-db";

// Creates (or renames) the anonymous profile for this device and returns its shareable friend ID.
export async function POST(request: Request) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const body = await request.json().catch(() => ({}));
  const name = normalizeName(body.name);
  const playerKey = normalizePlayerKey(body.playerKey);
  if (!playerKey) return errorResponse("Player profile not found");
  const player = await upsertPlayer(db, playerKey, name);
  if (!player) return errorResponse("Enter your name");
  return Response.json({ friendCode: player.friend_code, name: player.name });
}
