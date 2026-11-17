ALTER TABLE `albums` ADD `private_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `albums_private_token_unique` ON `albums` (`private_token`);