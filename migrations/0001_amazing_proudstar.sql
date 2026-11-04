CREATE TABLE `line_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_state` (
	`line_user_id` text PRIMARY KEY NOT NULL,
	`list_json` text,
	`list_at` text,
	`pending_media` text,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`fail_window_at` text
);
