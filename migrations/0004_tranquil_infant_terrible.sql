CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subtasks_task_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_series_occurrence_idx` ON `tasks` (`parent_task_id`,`recurrence_id`);