CREATE TABLE `game_inventory` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`equipped` integer DEFAULT 0 NOT NULL,
	`acquired_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `game_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`points` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_ledger_ref_idx` ON `game_ledger` (`user_id`,`kind`,`ref`);--> statement-breakpoint
CREATE INDEX `game_ledger_user_idx` ON `game_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `game_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`honorific` text DEFAULT 'name' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
