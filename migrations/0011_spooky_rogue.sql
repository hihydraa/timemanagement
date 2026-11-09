CREATE TABLE `alarms` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`time` text NOT NULL,
	`days` text DEFAULT '' NOT NULL,
	`once_date` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_fired_date` text,
	`ring_count` integer DEFAULT 0 NOT NULL,
	`next_ring_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alarms_user_idx` ON `alarms` (`user_id`);--> statement-breakpoint
CREATE INDEX `alarms_time_idx` ON `alarms` (`enabled`,`time`);