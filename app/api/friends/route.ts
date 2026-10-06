import {
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  getPlayerByFriendCode,
  normalizeFriendCode,
  normalizePlayerKey,
} from "../_shared/cinq-db";

// Adds a friend by friend ID and remembers who added whom, so the person who shared
// their ID sees the new friend show up without having to add them back.
export async function POST(request: Request) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const body = await request.json().catch(() => ({}));
  const playerKey = normalizePlayerKey(body.playerKey);
  const friendCode = normalizeFriendCode(body.friendCode);
  if (!playerKey) return errorResponse("Player profile not found");
  if (friendCode.length !== 6) return errorResponse("Friend IDs are 6 characters");
  const target = await getPlayerByFriendCode(db, friendCode);
  if (!target) return errorResponse("No player found with that friend ID", 404);
  if (target.player_key === playerKey) return errorResponse("That is your own friend ID");
  await db.prepare(`INSERT OR IGNORE INTO cinq_friend_adds (adder_key, target_key, created_at)
    VALUES (?, ?, ?)`)
    .bind(playerKey, target.player_key, new Date().toISOString())
    .run();
  return Response.json({ friendCode: target.friend_code, name: target.name });
}
