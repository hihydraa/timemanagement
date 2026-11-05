CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`props_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_events_user_name_idx` ON `usage_events` (`user_id`,`name`,`created_at`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ui_mode` text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `analytics_opt_out` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `onboarding_done_at` text;--> statement-breakpoint
-- ผู้ใช้เดิมใช้ฟีเจอร์ครบอยู่แล้ว: โหมดเต็ม + ถือว่าผ่าน onboarding (ผู้ใช้ใหม่ได้ค่าเริ่มต้น simple)
INSERT OR IGNORE INTO `user_settings` (`user_id`) SELECT `id` FROM `users`;--> statement-breakpoint
UPDATE `user_settings` SET `ui_mode` = 'full', `onboarding_done_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now');
