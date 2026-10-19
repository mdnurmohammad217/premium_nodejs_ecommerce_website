CREATE TABLE `abandoned_checkouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_key` varchar(64) NOT NULL,
	`customer_name` varchar(191),
	`customer_phone` varchar(32),
	`customer_address` text,
	`shipping_zone` varchar(100),
	`payment_method` varchar(32),
	`items` mediumtext,
	`item_count` int DEFAULT 0,
	`cart_total` decimal(12,2) DEFAULT '0',
	`ip_address` varchar(64),
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`recovered_order_id` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `abandoned_checkouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `abandoned_checkouts_session_key_unique` UNIQUE(`session_key`)
);
--> statement-breakpoint
CREATE TABLE `attributes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`values` text,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `attributes_id` PRIMARY KEY(`id`),
	CONSTRAINT `attributes_name_unique` UNIQUE(`name`),
	CONSTRAINT `attributes_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `blocked_ips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`note` text,
	`created_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `blocked_ips_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_ips_ip_unique` UNIQUE(`ip`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`logo` text,
	`description` text,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`description` text,
	`image` text,
	`icon` varchar(64),
	`featured` boolean DEFAULT false,
	`show_on_home` boolean DEFAULT false,
	`parent_id` int,
	`level` int DEFAULT 1,
	`sort_order` int DEFAULT 0,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `counter_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`opened_by` varchar(191) NOT NULL,
	`opening_cash` decimal(12,2) NOT NULL DEFAULT '0',
	`closing_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`difference` decimal(12,2),
	`status` varchar(16) NOT NULL DEFAULT 'open',
	`note` text,
	`opened_at` timestamp DEFAULT (now()),
	`closed_at` timestamp,
	CONSTRAINT `counter_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`type` varchar(16) NOT NULL,
	`value` decimal(12,2) NOT NULL,
	`min_order` decimal(12,2) DEFAULT '0',
	`max_discount` decimal(12,2),
	`usage_limit` int DEFAULT 100,
	`used_count` int DEFAULT 0,
	`expires_at` varchar(20),
	`status` varchar(32) DEFAULT 'active',
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `customer_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int,
	`customer_name` varchar(191) NOT NULL,
	`order_id` int,
	`amount` decimal(12,2) NOT NULL,
	`method` varchar(32) DEFAULT 'cash',
	`reference` varchar(100),
	`note` text,
	`payment_date` varchar(20) NOT NULL,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `customer_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(191),
	`password_hash` varchar(255),
	`address` text,
	`total_orders` int DEFAULT 0,
	`total_spent` decimal(12,2) DEFAULT '0',
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`last_ip` varchar(64),
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` text,
	`amount` decimal(12,2) NOT NULL,
	`payment_method` varchar(32) DEFAULT 'cash',
	`expense_date` varchar(20) NOT NULL,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `generics_id` PRIMARY KEY(`id`),
	CONSTRAINT `generics_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `hero_banners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255),
	`subtitle` text,
	`badge` varchar(100),
	`button_text` varchar(100),
	`button_url` varchar(255),
	`image_url` text NOT NULL,
	`mobile_image_url` text,
	`bg_gradient` varchar(255),
	`sort_order` int DEFAULT 0,
	`status` varchar(32) DEFAULT 'active',
	CONSTRAINT `hero_banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`quantity` int NOT NULL,
	`previous_stock` int NOT NULL,
	`new_stock` int NOT NULL,
	`reference` varchar(100),
	`notes` text,
	`performed_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manufacturers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`contact` varchar(100),
	`address` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `manufacturers_id` PRIMARY KEY(`id`),
	CONSTRAINT `manufacturers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`product_id` int NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`variation_id` int,
	`variation_label` varchar(255),
	`sku` varchar(100),
	`unit_price` decimal(12,2) NOT NULL,
	`quantity` int NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`batch_number` varchar(100),
	`expiry_date` varchar(20),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_number` varchar(64) NOT NULL,
	`source` varchar(16) DEFAULT 'web',
	`customer_id` int,
	`customer_name` varchar(191) NOT NULL,
	`customer_phone` varchar(32) NOT NULL,
	`customer_address` text,
	`subtotal` decimal(12,2) NOT NULL,
	`discount` decimal(12,2) DEFAULT '0',
	`shipping_charge` decimal(12,2) DEFAULT '0',
	`tax` decimal(12,2) DEFAULT '0',
	`total` decimal(12,2) NOT NULL,
	`cash_received` decimal(12,2) DEFAULT '0',
	`change_amount` decimal(12,2) DEFAULT '0',
	`payment_method` varchar(32) NOT NULL DEFAULT 'cod',
	`payment_status` varchar(32) DEFAULT 'unpaid',
	`order_status` varchar(32) DEFAULT 'pending',
	`shipping_zone` varchar(100),
	`transaction_id` varchar(100),
	`sender_number` varchar(32),
	`notes` text,
	`cashier_name` varchar(191),
	`ip_address` varchar(64),
	`user_agent` text,
	`courier_service` varchar(64),
	`consignment_id` varchar(128),
	`courier_status` varchar(64),
	`courier_sent_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`)
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `password_resets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pre_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_name` varchar(191) NOT NULL,
	`customer_phone` varchar(32) NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`product_id` int,
	`quantity` int NOT NULL DEFAULT 1,
	`advance` decimal(12,2) DEFAULT '0',
	`expected_date` varchar(20),
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`note` text,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `pre_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_attributes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`attribute_id` int NOT NULL,
	`attribute_name` varchar(191) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `product_attributes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `product_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_groups_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `product_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`issue_type` varchar(32) NOT NULL DEFAULT 'damage',
	`issued_to` varchar(191),
	`note` text,
	`issue_date` varchar(20) NOT NULL,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `product_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_variations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`combination` text NOT NULL,
	`label` varchar(255) NOT NULL,
	`sku` varchar(100),
	`price` decimal(12,2),
	`sale_price` decimal(12,2),
	`stock` int NOT NULL DEFAULT 0,
	`image` text,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`sort_order` int DEFAULT 0,
	CONSTRAINT `product_variations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`generic_name` varchar(255),
	`slug` varchar(191) NOT NULL,
	`sku` varchar(100) NOT NULL,
	`barcode` varchar(100),
	`category_id` int,
	`brand_id` int,
	`description` text,
	`short_description` text,
	`price` decimal(12,2) NOT NULL,
	`sale_price` decimal(12,2),
	`cost_price` decimal(12,2) DEFAULT '0',
	`stock` int NOT NULL DEFAULT 0,
	`low_stock_threshold` int DEFAULT 10,
	`unit` varchar(50) DEFAULT 'Strip',
	`dosage` varchar(50),
	`requires_prescription` boolean DEFAULT false,
	`batch_number` varchar(100),
	`expiry_date` varchar(20),
	`featured` boolean DEFAULT false,
	`is_flash_sale` boolean DEFAULT false,
	`is_best_seller` boolean DEFAULT false,
	`is_new_arrival` boolean DEFAULT false,
	`rating` decimal(3,2) DEFAULT '5.00',
	`review_count` int DEFAULT 0,
	`image` text,
	`images` text,
	`has_variations` boolean DEFAULT false,
	`video_url` text,
	`status` varchar(32) DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchase_id` int NOT NULL,
	`product_id` int NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`batch_number` varchar(100),
	`expiry_date` varchar(20),
	CONSTRAINT `purchase_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_return_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`return_id` int NOT NULL,
	`product_id` int NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`batch_number` varchar(100),
	CONSTRAINT `purchase_return_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`return_number` varchar(64) NOT NULL,
	`supplier_id` int,
	`supplier_name` varchar(191) NOT NULL,
	`purchase_id` int,
	`total` decimal(12,2) NOT NULL,
	`reason` text,
	`return_date` varchar(20) NOT NULL,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `purchase_returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_returns_return_number_unique` UNIQUE(`return_number`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_number` varchar(64) NOT NULL,
	`supplier_id` int,
	`supplier_name` varchar(191) NOT NULL,
	`total` decimal(12,2) NOT NULL,
	`paid` decimal(12,2) DEFAULT '0',
	`status` varchar(32) DEFAULT 'completed',
	`purchase_date` varchar(20),
	`notes` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchases_invoice_number_unique` UNIQUE(`invoice_number`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`user_name` varchar(191) NOT NULL,
	`user_phone` varchar(32),
	`rating` int NOT NULL,
	`comment` text NOT NULL,
	`status` varchar(32) DEFAULT 'approved',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_name` varchar(191) NOT NULL,
	`designation` varchar(100),
	`month` varchar(20) NOT NULL,
	`basic` decimal(12,2) NOT NULL DEFAULT '0',
	`bonus` decimal(12,2) DEFAULT '0',
	`deduction` decimal(12,2) DEFAULT '0',
	`net_pay` decimal(12,2) NOT NULL,
	`paid_on` varchar(20),
	`status` varchar(32) DEFAULT 'paid',
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `salaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(191) NOT NULL,
	`value` mediumtext NOT NULL,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_id` int,
	`supplier_name` varchar(191) NOT NULL,
	`purchase_id` int,
	`amount` decimal(12,2) NOT NULL,
	`method` varchar(32) DEFAULT 'cash',
	`reference` varchar(100),
	`note` text,
	`payment_date` varchar(20) NOT NULL,
	`recorded_by` varchar(191),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `supplier_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(191),
	`company` varchar(191),
	`address` text,
	`balance` decimal(12,2) DEFAULT '0',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uid` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL DEFAULT 'Admin User',
	`role` varchar(32) NOT NULL DEFAULT 'admin',
	`phone` varchar(32),
	`avatar` text,
	`password_hash` varchar(255),
	`job_role` varchar(100),
	`permissions` text,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_uid_unique` UNIQUE(`uid`)
);
--> statement-breakpoint
ALTER TABLE `customer_payments` ADD CONSTRAINT `customer_payments_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_attributes` ADD CONSTRAINT `product_attributes_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_attributes` ADD CONSTRAINT `product_attributes_attribute_id_attributes_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_issues` ADD CONSTRAINT `product_issues_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variations` ADD CONSTRAINT `product_variations_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchase_id_purchases_id_fk` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_return_id_purchase_returns_id_fk` FOREIGN KEY (`return_id`) REFERENCES `purchase_returns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_abandoned_status` ON `abandoned_checkouts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_abandoned_phone` ON `abandoned_checkouts` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `idx_blocked_ip` ON `blocked_ips` (`ip`);--> statement-breakpoint
CREATE INDEX `idx_categories_parent` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_level` ON `categories` (`level`);--> statement-breakpoint
CREATE INDEX `idx_counter_status` ON `counter_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cust_pay_customer` ON `customer_payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_cust_pay_date` ON `customer_payments` (`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_customers_phone` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_expenses_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_banners_status_order` ON `hero_banners` (`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_inventory_product` ON `inventory_transactions` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_status` ON `orders` (`order_status`);--> statement-breakpoint
CREATE INDEX `idx_orders_created` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_phone` ON `orders` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `idx_orders_source` ON `orders` (`source`);--> statement-breakpoint
CREATE INDEX `idx_orders_ip` ON `orders` (`ip_address`);--> statement-breakpoint
CREATE INDEX `idx_reset_token` ON `password_resets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_reset_customer` ON `password_resets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_preorders_status` ON `pre_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_prod_attr_product` ON `product_attributes` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_issues_date` ON `product_issues` (`issue_date`);--> statement-breakpoint
CREATE INDEX `idx_variation_product` ON `product_variations` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_variation_sku` ON `product_variations` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_products_status` ON `products` (`status`);--> statement-breakpoint
CREATE INDEX `idx_products_category` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_products_brand` ON `products` (`brand_id`);--> statement-breakpoint
CREATE INDEX `idx_products_barcode` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_reviews_product` ON `reviews` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_salary_month` ON `salaries` (`month`);--> statement-breakpoint
CREATE INDEX `idx_sup_pay_supplier` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_sup_pay_date` ON `supplier_payments` (`payment_date`);