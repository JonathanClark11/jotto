CREATE TABLE `jortal_player_results` (
	`match_code` text NOT NULL,
	`player_key` text NOT NULL,
	`player_name` text NOT NULL,
	`won` integer NOT NULL,
	`guesses` integer NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY(`match_code`, `player_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jortal_player_results_match_player_idx` ON `jortal_player_results` (`match_code`,`player_key`);--> statement-breakpoint
ALTER TABLE `jotto_matches` ADD `player1_key` text;--> statement-breakpoint
ALTER TABLE `jotto_matches` ADD `player2_key` text;--> statement-breakpoint
ALTER TABLE `jotto_matches` ADD `rematch_code` text;