ALTER TABLE `albums` ADD `on_front` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- A site set up before this version keeps its front page in the library's order; a new one starts shuffled.
INSERT OR IGNORE INTO `settings` (`key`, `value`) SELECT 'layout.home_order', '"sequence"' WHERE EXISTS (SELECT 1 FROM `users`);
