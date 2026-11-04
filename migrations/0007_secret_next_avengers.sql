ALTER TABLE `tasks` ADD `snooze_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `work_start` text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `work_end` text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `work_days` text DEFAULT '1,2,3,4,5' NOT NULL;