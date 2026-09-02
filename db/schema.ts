import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const matches = sqliteTable("jotto_matches", {
  code: text("code").primaryKey(),
  status: text("status").notNull().default("waiting"),
  player1Token: text("player1_token").notNull(),
  player2Token: text("player2_token"),
  player1Name: text("player1_name").notNull().default("Player 1"),
  player2Name: text("player2_name"),
  player1Key: text("player1_key"),
  player2Key: text("player2_key"),
  player1Secret: text("player1_secret").notNull(),
  player2Secret: text("player2_secret"),
  currentTurn: integer("current_turn").notNull().default(1),
  winner: integer("winner"),
  rematchCode: text("rematch_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const playerResults = sqliteTable(
  "jortal_player_results",
  {
    matchCode: text("match_code").notNull(),
    playerKey: text("player_key").notNull(),
    playerName: text("player_name").notNull(),
    won: integer("won").notNull(),
    guesses: integer("guesses").notNull(),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchCode, table.playerKey] }),
    uniqueIndex("jortal_player_results_match_player_idx").on(table.matchCode, table.playerKey),
  ],
);

export const pendingGuesses = sqliteTable(
  "jotto_pending_guesses",
  {
    matchCode: text("match_code").notNull(),
    player: integer("player").notNull(),
    word: text("word").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchCode, table.player] })],
);

export const guesses = sqliteTable(
  "jotto_guesses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchCode: text("match_code").notNull(),
    player: integer("player").notNull(),
    turnNumber: integer("turn_number").notNull(),
    word: text("word").notNull(),
    matchCount: integer("match_count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("jotto_guesses_player_word_idx").on(
      table.matchCode,
      table.player,
      table.word,
    ),
  ],
);

export const dailyResults = sqliteTable(
  "jotto_daily_results",
  {
    date: text("date").notNull(),
    playerKey: text("player_key").notNull(),
    guesses: integer("guesses").notNull(),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.date, table.playerKey] })],
);
