CREATE TABLE `calendar_feeds` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_token_unique` ON `calendar_feeds` (`token`);