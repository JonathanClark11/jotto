CREATE TABLE `jotto_pending_guesses` (
	`match_code` text NOT NULL,
	`player` integer NOT NULL,
	`word` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`match_code`, `player`)
);
--> statement-breakpoint
ALTER TABLE `jotto_matches` ADD `player1_name` text DEFAULT 'Player 1' NOT NULL;--> statement-breakpoint
ALTER TABLE `jotto_matches` ADD `player2_name` text;