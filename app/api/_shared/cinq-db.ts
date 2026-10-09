import { env } from "cloudflare:workers";
import { TURN_EXPIRY_ENABLED, TURN_EXPIRY_MS } from "../../../src/config.js";
import { GUESS_WORDS } from "../../../src/data/guessWords.js";
import { WORDS } from "../../../src/data/words.js";

const SECRET_SET = new Set<string>(WORDS);
const GUESS_SET = new Set<string>(GUESS_WORDS);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type MatchRow = {
  code: string;
  status: "waiting" | "active" | "finished";
  player1_token: string;
  player2_token: string | null;
  player1_name: string;
  player2_name: string | null;
  player1_key: string | null;
  player2_key: string | null;
  player1_secret: string;
  player2_secret: string | null;
  current_turn: number;
  winner: number | null;
  rematch_code: string | null;
  created_at: string;
  updated_at: string;
};

type GuessRow = {
  player: number;
  word: string;
  match_count: number;
  turn_number: number;
};

export function getCinqDb(): D1Database {
  if (!env.DB) throw new Error("Cinq's database binding is unavailable");
  return env.DB;
}

export async function ensureCinqSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_matches (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      player1_token TEXT NOT NULL,
      player2_token TEXT,
      player1_name TEXT NOT NULL DEFAULT 'Player 1',
      player2_name TEXT,
      player1_key TEXT,
      player2_key TEXT,
      player1_secret TEXT NOT NULL,
      player2_secret TEXT,
      current_turn INTEGER NOT NULL DEFAULT 1,
      winner INTEGER,
      rematch_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_guesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_code TEXT NOT NULL,
      player INTEGER NOT NULL,
      turn_number INTEGER NOT NULL,
      word TEXT NOT NULL,
      match_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS cinq_guesses_player_word_idx
      ON cinq_guesses (match_code, player, word)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_pending_guesses (
      match_code TEXT NOT NULL,
      player INTEGER NOT NULL,
      word TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (match_code, player)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_daily_results (
      date TEXT NOT NULL,
      player_key TEXT NOT NULL,
      guesses INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (date, player_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_player_results (
      match_code TEXT NOT NULL,
      player_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      won INTEGER NOT NULL,
      guesses INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (match_code, player_key)
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS cinq_player_results_match_player_idx
      ON cinq_player_results (match_code, player_key)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_players (
      player_key TEXT PRIMARY KEY,
      friend_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cinq_friend_adds (
      adder_key TEXT NOT NULL,
      target_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (adder_key, target_key)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS cinq_friend_adds_target_idx
      ON cinq_friend_adds (target_key)`),
  ]);
  const matchColumns = await db.prepare("PRAGMA table_info(cinq_matches)").all<{ name: string }>();
  const columnNames = new Set((matchColumns.results ?? []).map((column) => column.name));
  if (!columnNames.has("player1_name")) {
    await db.prepare("ALTER TABLE cinq_matches ADD COLUMN player1_name TEXT NOT NULL DEFAULT 'Player 1'").run();
  }
  if (!columnNames.has("player2_name")) {
    await db.prepare("ALTER TABLE cinq_matches ADD COLUMN player2_name TEXT").run();
  }
  if (!columnNames.has("player1_key")) {
    await db.prepare("ALTER TABLE cinq_matches ADD COLUMN player1_key TEXT").run();
  }
  if (!columnNames.has("player2_key")) {
    await db.prepare("ALTER TABLE cinq_matches ADD COLUMN player2_key TEXT").run();
  }
  if (!columnNames.has("rematch_code")) {
    await db.prepare("ALTER TABLE cinq_matches ADD COLUMN rematch_code TEXT").run();
  }
}

export function normalizeWord(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8)
    : "";
}

export function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";
}

export function normalizePlayerKey(value: unknown) {
  if (typeof value !== "string") return "";
  const key = value.trim().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
  return key.length >= 8 ? key : "";
}

export function isSecretWord(word: string) {
  return word.length === 5 && new Set(word).size === 5 && SECRET_SET.has(word);
}

export function isGuessWord(word: string) {
  return word.length === 5 && new Set(word).size === 5 && (SECRET_SET.has(word) || GUESS_SET.has(word));
}

export function sharedLetters(a: string, b: string) {
  let count = 0;
  for (const letter of a) if (b.includes(letter)) count += 1;
  return count;
}

function randomText(length: number, alphabet: string) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function createMatchCode() {
  return randomText(8, CODE_ALPHABET);
}

export function createPlayerToken() {
  return randomText(48, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
}

export const FRIEND_CODE_LENGTH = 6;

export function createFriendCode() {
  return randomText(FRIEND_CODE_LENGTH, CODE_ALPHABET);
}

export function normalizeFriendCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, FRIEND_CODE_LENGTH)
    : "";
}

export type PlayerRow = {
  player_key: string;
  friend_code: string;
  name: string;
};

/**
 * Anonymous player profile: the device's playerKey maps to a short, shareable friend ID
 * and a fixed display name. No accounts; the key never leaves the device except to prove ownership.
 */
export async function upsertPlayer(db: D1Database, playerKey: string, name: string) {
  const now = new Date().toISOString();
  const existing = await db.prepare("SELECT player_key, friend_code, name FROM cinq_players WHERE player_key = ?")
    .bind(playerKey)
    .first<PlayerRow>();
  if (existing) {
    if (name && existing.name !== name) {
      await db.prepare("UPDATE cinq_players SET name = ?, updated_at = ? WHERE player_key = ?")
        .bind(name, now, playerKey)
        .run();
      return { ...existing, name };
    }
    return existing;
  }
  if (!name) return null;
  for (let tries = 0; tries < 6; tries += 1) {
    const friendCode = createFriendCode();
    const result = await db.prepare(`INSERT OR IGNORE INTO cinq_players
      (player_key, friend_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(playerKey, friendCode, name, now, now)
      .run();
    if ((result.meta.changes ?? 0) === 1) return { player_key: playerKey, friend_code: friendCode, name };
    // Lost a race for this playerKey, or the friend code collided: re-check, else retry with a new code.
    const raced = await db.prepare("SELECT player_key, friend_code, name FROM cinq_players WHERE player_key = ?")
      .bind(playerKey)
      .first<PlayerRow>();
    if (raced) return raced;
  }
  return null;
}

export async function getPlayerByFriendCode(db: D1Database, friendCode: string) {
  return db.prepare("SELECT player_key, friend_code, name FROM cinq_players WHERE friend_code = ?")
    .bind(friendCode)
    .first<PlayerRow>();
}

export async function getMatch(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM cinq_matches WHERE code = ?")
    .bind(code)
    .first<MatchRow>();
}

// Mutable so tests can flip the flag; production reads the constant from src/config.js.
export const turnExpiry = { enabled: TURN_EXPIRY_ENABLED };

/** Epoch ms when the player on turn forfeits, or null if the match is not active. updated_at is the turn start. */
export function turnDeadline(match: MatchRow): number | null {
  if (match.status !== "active") return null;
  const started = Date.parse(match.updated_at);
  return Number.isNaN(started) ? null : started + TURN_EXPIRY_MS;
}

/**
 * Settles an active match whose turn deadline has passed: the non-turn player wins. No-op while
 * turnExpiry.enabled is false. The guarded UPDATE loses to a guess that bumped updated_at first.
 * Returns the refreshed row (or the original if nothing changed).
 */
export async function expireIfOverdue(
  db: D1Database,
  match: MatchRow,
  now: number = Date.now(),
): Promise<MatchRow> {
  if (!turnExpiry.enabled) return match;
  const deadline = turnDeadline(match);
  if (deadline === null || now <= deadline) return match;
  const nowIso = new Date(now).toISOString();
  const winner = match.current_turn === 1 ? 2 : 1;
  const result = await db.prepare(`UPDATE cinq_matches
    SET status = 'finished', winner = ?, updated_at = ?
    WHERE code = ? AND status = 'active' AND current_turn = ? AND updated_at = ?`)
    .bind(winner, nowIso, match.code, match.current_turn, match.updated_at)
    .run();
  const settledHere = (result.meta.changes ?? 0) === 1;
  const fresh = (await getMatch(db, match.code)) ?? match;
  if (settledHere) {
    await db.prepare("DELETE FROM cinq_pending_guesses WHERE match_code = ?").bind(match.code).run();
  }
  // recordPlayerResults is INSERT OR IGNORE, so also covers a settle whose follow-up writes were interrupted.
  if (fresh.status === "finished") await recordPlayerResults(db, fresh, fresh.updated_at);
  return fresh;
}

export function playerRole(match: MatchRow, token: string) {
  if (token === match.player1_token) return 1;
  if (token && token === match.player2_token) return 2;
  return 0;
}

export async function publicMatchState(db: D1Database, match: MatchRow, token: string) {
  const role = playerRole(match, token);
  if (!role) return null;
  const allGuesses = await db.prepare(
    "SELECT player, word, match_count, turn_number FROM cinq_guesses WHERE match_code = ? ORDER BY turn_number, id",
  ).bind(match.code).all<GuessRow>();
  const rows = allGuesses.results ?? [];
  const opponent = role === 1 ? 2 : 1;
  const yourName = role === 1 ? match.player1_name : match.player2_name;
  const opponentName = role === 1 ? match.player2_name : match.player1_name;
  const yourSecret = role === 1 ? match.player1_secret : match.player2_secret;
  const opponentSecret = role === 1 ? match.player2_secret : match.player1_secret;
  const pending = await db.prepare(
    "SELECT word FROM cinq_pending_guesses WHERE match_code = ? AND player = ?",
  ).bind(match.code, role).first<{ word: string }>();
  const shape = (row: GuessRow) => ({ word: row.word, count: row.match_count });
  const opponentKey = role === 1 ? match.player2_key : match.player1_key;
  const opponentPlayer = opponentKey
    ? await db.prepare("SELECT friend_code FROM cinq_players WHERE player_key = ?")
      .bind(opponentKey)
      .first<{ friend_code: string }>()
    : null;

  const deadline = turnDeadline(match);
  // No schema flag for forfeits: a finished match is expired when the winner never guessed the loser's secret.
  const loserSecret = match.winner === 1 ? match.player2_secret : match.player1_secret;
  const expired = match.status === "finished" && Boolean(match.winner)
    && !rows.some((row) => row.player === match.winner && row.word === loserSecret);

  return {
    code: match.code,
    status: match.status,
    role,
    currentTurn: match.current_turn,
    yourTurn: match.status === "active" && match.current_turn === role,
    winner: match.winner,
    opponentJoined: Boolean(match.player2_token),
    yourName: yourName || "Player",
    opponentName: opponentName || null,
    opponentFriendCode: opponentPlayer?.friend_code ?? null,
    yourSecret,
    opponentSecret: match.status === "finished" ? opponentSecret : null,
    yourGuesses: rows.filter((row) => row.player === role).map(shape),
    opponentGuesses: rows.filter((row) => row.player === opponent).map(shape),
    pendingGuess: pending?.word ?? null,
    rematchCode: match.status === "finished" ? match.rematch_code : null,
    updatedAt: match.updated_at,
    turnDeadline: deadline === null ? null : new Date(deadline).toISOString(),
    expired,
  };
}

export async function recordPlayerResults(db: D1Database, match: MatchRow, completedAt: string) {
  if (!match.winner) return;
  const counts = await db.prepare(`SELECT player, COUNT(*) AS guesses
    FROM cinq_guesses WHERE match_code = ? GROUP BY player`)
    .bind(match.code)
    .all<{ player: number; guesses: number }>();
  const byPlayer = new Map((counts.results ?? []).map((row) => [Number(row.player), Number(row.guesses)]));
  const rows = [
    { key: match.player1_key, name: match.player1_name, player: 1 },
    { key: match.player2_key, name: match.player2_name, player: 2 },
  ].filter((row) => row.key && row.name);
  if (!rows.length) return;
  await db.batch(rows.map((row) => db.prepare(`INSERT OR IGNORE INTO cinq_player_results
    (match_code, player_key, player_name, won, guesses, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(match.code, row.key, row.name, match.winner === row.player ? 1 : 0,
      byPlayer.get(row.player) ?? 0, completedAt)));
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
