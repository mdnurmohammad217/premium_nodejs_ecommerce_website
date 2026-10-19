CREATE TABLE `admin_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`link_tab` varchar(64),
	`is_read` boolean NOT NULL DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `admin_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`excerpt` text,
	`content` mediumtext,
	`cover_image` text,
	`author` varchar(191),
	`category` varchar(100),
	`tags` varchar(255),
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`meta_title` varchar(255),
	`meta_description` text,
	`views` int NOT NULL DEFAULT 0,
	`published_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `landing_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`template` varchar(32) NOT NULL DEFAULT 'fashion',
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`content` mediumtext,
	`products` text,
	`shipping` text,
	`views` int NOT NULL DEFAULT 0,
	`orders_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `landing_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `landing_pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`order_number` varchar(64) NOT NULL,
	`gateway` varchar(32) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'BDT',
	`status` varchar(16) NOT NULL DEFAULT 'initiated',
	`reference` varchar(100) NOT NULL,
	`gateway_ref` varchar(191),
	`gateway_txn_id` varchar(191),
	`message` varchar(255),
	`payload` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `payment_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_transactions_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `size_guides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text,
	`columns` text NOT NULL,
	`rows` mediumtext NOT NULL,
	`image` text,
	`note` text,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `size_guides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(191),
	`address` text,
	`message` text,
	`status` varchar(16) NOT NULL DEFAULT 'new',
	`admin_note` text,
	`ip_address` varchar(64),
	`user_agent` varchar(500),
	`page_url` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupon_usages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coupon_id` int NOT NULL,
	`coupon_code` varchar(64) NOT NULL,
	`order_id` int NOT NULL,
	`order_number` varchar(64),
	`customer_phone` varchar(32),
	`discount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`released` boolean NOT NULL DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `coupon_usages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_coupon_usage_order` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20),
	`description` varchar(255),
	`monthly_budget` decimal(12,2),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_expense_category_name` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `fraud_checks` (
	`phone` varchar(20) NOT NULL,
	`data` mediumtext NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`success` int NOT NULL DEFAULT 0,
	`cancelled` int NOT NULL DEFAULT 0,
	`ratio` decimal(5,1) NOT NULL DEFAULT '0.0',
	`checked_at` timestamp DEFAULT (now()),
	CONSTRAINT `fraud_checks_phone` PRIMARY KEY(`phone`)
);
--> statement-breakpoint
CREATE TABLE `license_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` varchar(40) NOT NULL,
	`level` varchar(10) NOT NULL DEFAULT 'info',
	`message` varchar(500),
	`http_status` int,
	`ip_address` varchar(64),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `license_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `license_state` (
	`id` tinyint NOT NULL,
	`installation_id` char(64) NOT NULL,
	`license_key_enc` text,
	`license_key_mask` varchar(64),
	`token` text,
	`token_jti` varchar(128),
	`domain` varchar(191),
	`product_slug` varchar(100),
	`product_name` varchar(191),
	`public_key` varchar(600),
	`key_id` varchar(64),
	`ever_activated` boolean NOT NULL DEFAULT false,
	`requires_activation` boolean NOT NULL DEFAULT false,
	`activated_at` bigint,
	`last_sync_at` bigint,
	`last_attempt_at` bigint,
	`next_check_at` bigint,
	`last_result` varchar(255),
	`last_error` varchar(255),
	`server_reachable` boolean,
	`consecutive_failures` int NOT NULL DEFAULT 0,
	`backoff_until` bigint,
	`updated_at` bigint,
	CONSTRAINT `license_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_files` (
	`file_name` varchar(191) NOT NULL,
	`part` int NOT NULL DEFAULT 0,
	`parts` int NOT NULL DEFAULT 1,
	`mime` varchar(80),
	`size` int NOT NULL DEFAULT 0,
	`data` mediumblob NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `media_files_file_name_part_pk` PRIMARY KEY(`file_name`,`part`)
);
--> statement-breakpoint
CREATE TABLE `order_counters` (
	`name` varchar(32) NOT NULL,
	`value` int NOT NULL DEFAULT 1000,
	CONSTRAINT `order_counters_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `order_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`return_number` varchar(32) NOT NULL,
	`order_id` int NOT NULL,
	`order_number` varchar(64) NOT NULL,
	`customer_name` varchar(191),
	`customer_phone` varchar(32),
	`items` mediumtext NOT NULL,
	`items_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`refund_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`refund_method` varchar(20),
	`reason` varchar(191),
	`note` text,
	`restocked` boolean NOT NULL DEFAULT true,
	`status` varchar(16) NOT NULL DEFAULT 'received',
	`created_by` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	`refunded_at` timestamp,
	CONSTRAINT `order_returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_return_number` UNIQUE(`return_number`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`account_type` varchar(16) NOT NULL,
	`account_id` int,
	`account_name` varchar(191),
	`identifier` varchar(191) NOT NULL,
	`channel` varchar(16) NOT NULL,
	`destination` varchar(191),
	`code_hash` char(64),
	`token_hash` char(64),
	`attempts` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL,
	`error` varchar(255),
	`ip_address` varchar(64),
	`user_agent` varchar(255),
	`expires_at` datetime NOT NULL,
	`verified_at` datetime,
	`used_at` datetime,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `password_reset_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_drawer_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(16) NOT NULL,
	`reason` varchar(191),
	`order_number` varchar(64),
	`amount` decimal(12,2),
	`method` varchar(24),
	`ok` boolean NOT NULL DEFAULT true,
	`cashier` varchar(100),
	`user_id` int,
	`device` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `pos_drawer_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_held_orders` (
	`id` varchar(64) NOT NULL,
	`customer` varchar(191),
	`items` mediumtext NOT NULL,
	`note` text,
	`cashier` varchar(191),
	`user_sub` varchar(64),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `pos_held_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_image_index` (
	`product_id` int NOT NULL,
	`image_url` varchar(1000) NOT NULL,
	`descriptor` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `product_image_index_product_id` PRIMARY KEY(`product_id`)
);
--> statement-breakpoint
CREATE TABLE `sms_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`message` text NOT NULL,
	`event` varchar(40),
	`order_id` int,
	`provider` varchar(32),
	`status` varchar(16) NOT NULL,
	`response` text,
	`segments` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `sms_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `abandoned_checkouts` ADD `district` varchar(64);--> statement-breakpoint
ALTER TABLE `abandoned_checkouts` ADD `thana` varchar(100);--> statement-breakpoint
ALTER TABLE `customers` ADD `customer_type` varchar(16) DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `wholesale_status` varchar(16);--> statement-breakpoint
ALTER TABLE `customers` ADD `business_name` varchar(191);--> statement-breakpoint
ALTER TABLE `customers` ADD `business_address` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `business_type` varchar(100);--> statement-breakpoint
ALTER TABLE `customers` ADD `wholesale_applied_at` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `wholesale_reviewed_at` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `wholesale_note` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_code` varchar(128);--> statement-breakpoint
ALTER TABLE `orders` ADD `is_wholesale` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `orders` ADD `landing_page_id` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `landing_page_name` varchar(191);--> statement-breakpoint
ALTER TABLE `orders` ADD `advance_paid` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_to` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_name` varchar(191);--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_released` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `orders` ADD `district` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `thana` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `created_by` varchar(191);--> statement-breakpoint
ALTER TABLE `product_variations` ADD `barcode` varchar(64);--> statement-breakpoint
ALTER TABLE `product_variations` ADD `wholesale_price` decimal(12,2);--> statement-breakpoint
ALTER TABLE `products` ADD `wholesale_enabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `products` ADD `wholesale_price` decimal(12,2);--> statement-breakpoint
ALTER TABLE `products` ADD `wholesale_min_qty` int;--> statement-breakpoint
ALTER TABLE `products` ADD `wholesale_max_qty` int;--> statement-breakpoint
ALTER TABLE `products` ADD `size_guide_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD `free_shipping` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `products` ADD `shipping_charges` text;--> statement-breakpoint
ALTER TABLE `products` ADD `option_display` text;--> statement-breakpoint
ALTER TABLE `products` ADD `highlights` text;--> statement-breakpoint
ALTER TABLE `products` ADD `how_to_use` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `reply` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `ip_address` varchar(64);--> statement-breakpoint
CREATE INDEX `idx_admin_notifications_read` ON `admin_notifications` (`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_blog_status` ON `blog_posts` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_landing_status` ON `landing_pages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_payment_tx_order` ON `payment_transactions` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_tx_gateway_ref` ON `payment_transactions` (`gateway_ref`);--> statement-breakpoint
CREATE INDEX `idx_contact_status` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contact_phone` ON `contact_messages` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_coupon_usage_coupon` ON `coupon_usages` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `idx_coupon_usage_phone` ON `coupon_usages` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `idx_license_events_created` ON `license_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_returns_order` ON `order_returns` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_returns_created` ON `order_returns` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reset_identifier` ON `password_reset_requests` (`identifier`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reset_token` ON `password_reset_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_reset_ip` ON `password_reset_requests` (`ip_address`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_drawer_created` ON `pos_drawer_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_drawer_kind` ON `pos_drawer_events` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_held_created` ON `pos_held_orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sms_order` ON `sms_logs` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_sms_created` ON `sms_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customers_wholesale` ON `customers` (`customer_type`,`wholesale_status`);--> statement-breakpoint
CREATE INDEX `idx_orders_wholesale` ON `orders` (`is_wholesale`);