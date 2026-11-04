ALTER TABLE `google_tokens` ADD `email` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `gcal_sync` integer DEFAULT 1 NOT NULL;