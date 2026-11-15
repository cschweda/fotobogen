CREATE TABLE `derivatives` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`kind` text NOT NULL,
	`format` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`path` text NOT NULL,
	`bytes` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `derivatives_photo_kind_format_unique` ON `derivatives` (`photo_id`,`kind`,`format`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`photo_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `modules` (
	`name` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`description` text,
	`alt` text,
	`original_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`width` integer,
	`height` integer,
	`thumbhash` text,
	`taken_at` integer,
	`camera` text,
	`lens` text,
	`focal_length` text,
	`aperture` text,
	`shutter` text,
	`iso` integer,
	`lat` real,
	`lng` real,
	`exif_json` text,
	`recipe_json` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_slug_unique` ON `photos` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_checksum_unique` ON `photos` (`checksum`);--> statement-breakpoint
CREATE INDEX `photos_listing_idx` ON `photos` (`visibility`,`status`,`sort_order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`session_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);