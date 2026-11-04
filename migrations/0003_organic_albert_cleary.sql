ALTER TABLE `user_settings` ADD `deadline_alert_time` text DEFAULT '15:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `evening_review_enabled` integer DEFAULT 1 NOT NULL;