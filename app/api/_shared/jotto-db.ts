import { env } from "cloudflare:workers";
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

export function getJottoDb(): D1Database {
  if (!env.DB) throw new Error("Jortal's database binding is unavailable");
  return env.DB;
}

export async function ensureJottoSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS jotto_matches (
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
    db.prepare(`CREATE TABLE IF NOT EXISTS jotto_guesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_code TEXT NOT NULL,
      player INTEGER NOT NULL,
      turn_number INTEGER NOT NULL,
      word TEXT NOT NULL,
      match_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS jotto_guesses_player_word_idx
      ON jotto_guesses (match_code, player, word)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jotto_pending_guesses (
      match_code TEXT NOT NULL,
      player INTEGER NOT NULL,
      word TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (match_code, player)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jotto_daily_results (
      date TEXT NOT NULL,
      player_key TEXT NOT NULL,
      guesses INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (date, player_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jortal_player_results (
      match_code TEXT NOT NULL,
      player_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      won INTEGER NOT NULL,
      guesses INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (match_code, player_key)
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS jortal_player_results_match_player_idx
      ON jortal_player_results (match_code, player_key)`),
  ]);
  const matchColumns = await db.prepare("PRAGMA table_info(jotto_matches)").all<{ name: string }>();
  const columnNames = new Set((matchColumns.results ?? []).map((column) => column.name));
  if (!columnNames.has("player1_name")) {
    await db.prepare("ALTER TABLE jotto_matches ADD COLUMN player1_name TEXT NOT NULL DEFAULT 'Player 1'").run();
  }
  if (!columnNames.has("player2_name")) {
    await db.prepare("ALTER TABLE jotto_matches ADD COLUMN player2_name TEXT").run();
  }
  if (!columnNames.has("player1_key")) {
    await db.prepare("ALTER TABLE jotto_matches ADD COLUMN player1_key TEXT").run();
  }
  if (!columnNames.has("player2_key")) {
    await db.prepare("ALTER TABLE jotto_matches ADD COLUMN player2_key TEXT").run();
  }
  if (!columnNames.has("rematch_code")) {
    await db.prepare("ALTER TABLE jotto_matches ADD COLUMN rematch_code TEXT").run();
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

export async function getMatch(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM jotto_matches WHERE code = ?")
    .bind(code)
    .first<MatchRow>();
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
    "SELECT player, word, match_count, turn_number FROM jotto_guesses WHERE match_code = ? ORDER BY turn_number, id",
  ).bind(match.code).all<GuessRow>();
  const rows = allGuesses.results ?? [];
  const opponent = role === 1 ? 2 : 1;
  const yourName = role === 1 ? match.player1_name : match.player2_name;
  const opponentName = role === 1 ? match.player2_name : match.player1_name;
  const yourSecret = role === 1 ? match.player1_secret : match.player2_secret;
  const opponentSecret = role === 1 ? match.player2_secret : match.player1_secret;
  const pending = await db.prepare(
    "SELECT word FROM jotto_pending_guesses WHERE match_code = ? AND player = ?",
  ).bind(match.code, role).first<{ word: string }>();
  const shape = (row: GuessRow) => ({ word: row.word, count: row.match_count });

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
    yourSecret,
    opponentSecret: match.status === "finished" ? opponentSecret : null,
    yourGuesses: rows.filter((row) => row.player === role).map(shape),
    opponentGuesses: rows.filter((row) => row.player === opponent).map(shape),
    pendingGuess: pending?.word ?? null,
    rematchCode: match.status === "finished" ? match.rematch_code : null,
    updatedAt: match.updated_at,
  };
}

export async function recordPlayerResults(db: D1Database, match: MatchRow, completedAt: string) {
  if (!match.winner) return;
  const counts = await db.prepare(`SELECT player, COUNT(*) AS guesses
    FROM jotto_guesses WHERE match_code = ? GROUP BY player`)
    .bind(match.code)
    .all<{ player: number; guesses: number }>();
  const byPlayer = new Map((counts.results ?? []).map((row) => [Number(row.player), Number(row.guesses)]));
  const rows = [
    { key: match.player1_key, name: match.player1_name, player: 1 },
    { key: match.player2_key, name: match.player2_name, player: 2 },
  ].filter((row) => row.key && row.name);
  if (!rows.length) return;
  await db.batch(rows.map((row) => db.prepare(`INSERT OR IGNORE INTO jortal_player_results
    (match_code, player_key, player_name, won, guesses, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(match.code, row.key, row.name, match.winner === row.player ? 1 : 0,
      byPlayer.get(row.player) ?? 0, completedAt)));
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
