ALTER TABLE `activations` ADD `scope_id` text NOT NULL REFERENCES scopes(id);--> statement-breakpoint
ALTER TABLE `ntp_events` DROP COLUMN `site_ready`;