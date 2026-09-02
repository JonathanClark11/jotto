CREATE TABLE `jotto_daily_results` (
	`date` text NOT NULL,
	`player_key` text NOT NULL,
	`guesses` integer NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY(`date`, `player_key`)
);
--> statement-breakpoint
CREATE TABLE `jotto_guesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_code` text NOT NULL,
	`player` integer NOT NULL,
	`turn_number` integer NOT NULL,
	`word` text NOT NULL,
	`match_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jotto_guesses_player_word_idx` ON `jotto_guesses` (`match_code`,`player`,`word`);--> statement-breakpoint
CREATE TABLE `jotto_matches` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`player1_token` text NOT NULL,
	`player2_token` text,
	`player1_secret` text NOT NULL,
	`player2_secret` text,
	`current_turn` integer DEFAULT 1 NOT NULL,
	`winner` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
