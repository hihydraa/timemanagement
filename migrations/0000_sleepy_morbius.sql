CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`minutes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`refresh_token_enc` text,
	`access_token_enc` text,
	`expires_at` text,
	`scope` text
);
--> statement-breakpoint
CREATE TABLE `line_link_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text DEFAULT 'line_push' NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL,
	`ok` integer NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`remind_at` text NOT NULL,
	`sent_at` text,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminders_sent_remind_idx` ON `reminders` (`sent_at`,`remind_at`);--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text,
	`urgency` integer DEFAULT 2 NOT NULL,
	`importance` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`all_day` integer DEFAULT 0 NOT NULL,
	`start_at` text,
	`end_at` text,
	`due_at` text,
	`due_date` text,
	`estimate_minutes` integer,
	`recurrence_rule` text,
	`parent_task_id` text,
	`gcal_event_id` text,
	`gcal_synced_at` text,
	`source` text DEFAULT 'web' NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_user_due_idx` ON `tasks` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_start_idx` ON `tasks` (`user_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_status_idx` ON `tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`morning_digest_time` text DEFAULT '07:30' NOT NULL,
	`evening_review_time` text DEFAULT '20:00' NOT NULL,
	`remind_before_minutes` integer DEFAULT 30 NOT NULL,
	`quiet_hours_start` text DEFAULT '22:00' NOT NULL,
	`quiet_hours_end` text DEFAULT '06:30' NOT NULL,
	`line_notify_enabled` integer DEFAULT 1 NOT NULL,
	`gcal_sync_enabled` integer DEFAULT 0 NOT NULL,
	`gcal_calendar_id` text DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`google_sub` text,
	`line_user_id` text,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_line_user_id_unique` ON `users` (`line_user_id`);