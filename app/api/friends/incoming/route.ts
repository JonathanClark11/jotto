import {
  ensureCinqSchema,
  errorResponse,
  getCinqDb,
  normalizePlayerKey,
} from "../../_shared/cinq-db";

// Players who added this device's friend ID. Keyed by the private playerKey, so only the
// owner can read it; a friend ID alone never reveals who added you.
export async function GET(request: Request) {
  const db = getCinqDb();
  await ensureCinqSchema(db);
  const playerKey = normalizePlayerKey(new URL(request.url).searchParams.get("playerKey"));
  if (!playerKey) return errorResponse("Player profile not found");
  const rows = await db.prepare(`SELECT p.friend_code AS friendCode, p.name AS name
    FROM cinq_friend_adds a
    JOIN cinq_players p ON p.player_key = a.adder_key
    WHERE a.target_key = ?
    ORDER BY a.created_at`)
    .bind(playerKey)
    .all<{ friendCode: string; name: string }>();
  return Response.json({ friends: rows.results ?? [] });
}
