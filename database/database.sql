-- ============================================================
-- E-commerce + POS — full database schema
-- MySQL / MariaDB (Hostinger compatible)
--
-- Import (phpMyAdmin): Import tab -> choose this file -> Go
-- Import (CLI):        mysql -u <user> -p <database> < database/database.sql
--
-- Contains the table structure, foreign keys and indexes only — no rows,
-- no passwords, no API keys.
--
-- The first time the application starts on an empty database it creates:
--   * the owner account (from ADMIN_EMAIL / ADMIN_PASSWORD in .env)
--   * the settings rows and a starter attribute set (Type, Dosage, Pack Size …)
-- There is NO demo data: the store starts empty and ready for real products.
--
-- 48 tables.
--
-- Upgrading an existing store? You do not need to import anything: the
-- server adds any missing columns/tables by itself on start (see
-- ensureSchema() in server.ts). database/upgrade-v3.6.sql and
-- database/upgrade-v3.7.sql do the same by hand if you prefer phpMyAdmin.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


CREATE TABLE `abandoned_checkouts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `session_key` varchar(64) NOT NULL,
  `customer_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(32) DEFAULT NULL,
  `customer_address` text DEFAULT NULL,
  `shipping_zone` varchar(100) DEFAULT NULL,
  `payment_method` varchar(32) DEFAULT NULL,
  `items` mediumtext DEFAULT NULL,
  `item_count` int(11) DEFAULT 0,
  `cart_total` decimal(12,2) DEFAULT 0.00,
  `ip_address` varchar(64) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `recovered_order_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `abandoned_checkouts_session_key_unique` (`session_key`),
  KEY `idx_abandoned_status` (`status`),
  KEY `idx_abandoned_phone` (`customer_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `admin_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text DEFAULT NULL,
  `link_tab` varchar(64) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_notifications_read` (`is_read`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `order_counters` (
  `name` varchar(32) NOT NULL,
  `value` int(11) NOT NULL DEFAULT 1000,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `sms_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `phone` varchar(32) NOT NULL,
  `message` text NOT NULL,
  `event` varchar(40) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `provider` varchar(32) DEFAULT NULL,
  `status` varchar(16) NOT NULL,
  `response` text DEFAULT NULL,
  `segments` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sms_order` (`order_id`),
  KEY `idx_sms_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `fraud_checks` (
  `phone` varchar(20) NOT NULL,
  `data` mediumtext NOT NULL,
  `total` int(11) NOT NULL DEFAULT 0,
  `success` int(11) NOT NULL DEFAULT 0,
  `cancelled` int(11) NOT NULL DEFAULT 0,
  `ratio` decimal(5,1) NOT NULL DEFAULT 0,
  `checked_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `contact_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'new',
  `admin_note` text DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `page_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_contact_status` (`status`,`created_at`),
  KEY `idx_contact_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `order_returns` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_number` varchar(32) NOT NULL,
  `order_id` int(11) NOT NULL,
  `order_number` varchar(64) NOT NULL,
  `customer_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(32) DEFAULT NULL,
  `items` mediumtext NOT NULL,
  `items_amount` decimal(12,2) NOT NULL DEFAULT 0,
  `refund_amount` decimal(12,2) NOT NULL DEFAULT 0,
  `refund_method` varchar(20) DEFAULT NULL,
  `reason` varchar(191) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `restocked` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(16) NOT NULL DEFAULT 'received',
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `refunded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_return_number` (`return_number`),
  KEY `idx_returns_order` (`order_id`),
  KEY `idx_returns_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `attributes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `values` text DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `attributes_name_unique` (`name`),
  UNIQUE KEY `attributes_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `blocked_ips` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(64) NOT NULL,
  `note` text DEFAULT NULL,
  `created_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `blocked_ips_ip_unique` (`ip`),
  KEY `idx_blocked_ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `brands` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `logo` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `brands_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `image` text DEFAULT NULL,
  `icon` varchar(64) DEFAULT NULL,
  `featured` tinyint(1) DEFAULT 0,
  `show_on_home` tinyint(1) DEFAULT 0,
  `parent_id` int(11) DEFAULT NULL,
  `level` int(11) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_slug_unique` (`slug`),
  KEY `idx_categories_parent` (`parent_id`),
  KEY `idx_categories_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `counter_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `opened_by` varchar(191) NOT NULL,
  `opening_cash` decimal(12,2) NOT NULL DEFAULT 0.00,
  `closing_cash` decimal(12,2) DEFAULT NULL,
  `expected_cash` decimal(12,2) DEFAULT NULL,
  `difference` decimal(12,2) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'open',
  `note` text DEFAULT NULL,
  `opened_at` timestamp NULL DEFAULT current_timestamp(),
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_counter_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `coupons` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `type` varchar(16) NOT NULL,
  `value` decimal(12,2) NOT NULL,
  `min_order` decimal(12,2) DEFAULT 0.00,
  `max_discount` decimal(12,2) DEFAULT NULL,
  `usage_limit` int(11) DEFAULT 100,
  `used_count` int(11) DEFAULT 0,
  `expires_at` varchar(20) DEFAULT NULL,
  `status` varchar(32) DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupons_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `customer_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) DEFAULT NULL,
  `customer_name` varchar(191) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `method` varchar(32) DEFAULT 'cash',
  `reference` varchar(100) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `payment_date` varchar(20) NOT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_cust_pay_customer` (`customer_id`),
  KEY `idx_cust_pay_date` (`payment_date`),
  CONSTRAINT `customer_payments_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `customers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `total_orders` int(11) DEFAULT 0,
  `total_spent` decimal(12,2) DEFAULT 0.00,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `last_ip` varchar(64) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `customer_type` varchar(16) NOT NULL DEFAULT 'regular',
  `wholesale_status` varchar(16) DEFAULT NULL,
  `business_name` varchar(191) DEFAULT NULL,
  `business_address` text DEFAULT NULL,
  `business_type` varchar(100) DEFAULT NULL,
  `wholesale_applied_at` timestamp NULL DEFAULT NULL,
  `wholesale_reviewed_at` timestamp NULL DEFAULT NULL,
  `wholesale_note` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `password_changed_at` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customers_phone` (`phone`),
  KEY `idx_customers_wholesale` (`customer_type`,`wholesale_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(32) DEFAULT 'cash',
  `expense_date` varchar(20) NOT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_expenses_date` (`expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `generics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `generics_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `hero_banners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `subtitle` text DEFAULT NULL,
  `badge` varchar(100) DEFAULT NULL,
  `button_text` varchar(100) DEFAULT NULL,
  `button_url` varchar(255) DEFAULT NULL,
  `image_url` text NOT NULL,
  `mobile_image_url` text DEFAULT NULL,
  `bg_gradient` varchar(255) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `status` varchar(32) DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `idx_banners_status_order` (`status`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `inventory_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `type` varchar(32) NOT NULL,
  `quantity` int(11) NOT NULL,
  `previous_stock` int(11) NOT NULL,
  `new_stock` int(11) NOT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `performed_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inventory_product` (`product_id`),
  CONSTRAINT `inventory_transactions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `manufacturers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `contact` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `manufacturers_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `variation_id` int(11) DEFAULT NULL,
  `variation_label` varchar(255) DEFAULT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `quantity` int(11) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `batch_number` varchar(100) DEFAULT NULL,
  `expiry_date` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `order_items_product_id_products_id_fk` (`product_id`),
  KEY `idx_order_items_order` (`order_id`),
  CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_number` varchar(64) NOT NULL,
  `source` varchar(16) DEFAULT 'web',
  `customer_id` int(11) DEFAULT NULL,
  `customer_name` varchar(191) NOT NULL,
  `customer_phone` varchar(32) NOT NULL,
  `customer_address` text DEFAULT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `discount` decimal(12,2) DEFAULT 0.00,
  `shipping_charge` decimal(12,2) DEFAULT 0.00,
  `tax` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL,
  `cash_received` decimal(12,2) DEFAULT 0.00,
  `change_amount` decimal(12,2) DEFAULT 0.00,
  `payment_method` varchar(32) NOT NULL DEFAULT 'cod',
  `payment_status` varchar(32) DEFAULT 'unpaid',
  `order_status` varchar(32) DEFAULT 'pending',
  `shipping_zone` varchar(100) DEFAULT NULL,
  `transaction_id` varchar(100) DEFAULT NULL,
  `sender_number` varchar(32) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `cashier_name` varchar(191) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `courier_service` varchar(64) DEFAULT NULL,
  `consignment_id` varchar(128) DEFAULT NULL,
  `courier_status` varchar(64) DEFAULT NULL,
  `courier_sent_at` timestamp NULL DEFAULT NULL,
  `tracking_code` varchar(128) DEFAULT NULL,
  `is_wholesale` tinyint(1) DEFAULT 0,
  `landing_page_id` int(11) DEFAULT NULL,
  `landing_page_name` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_order_number_unique` (`order_number`),
  KEY `orders_customer_id_customers_id_fk` (`customer_id`),
  KEY `idx_orders_status` (`order_status`),
  KEY `idx_orders_created` (`created_at`),
  KEY `idx_orders_phone` (`customer_phone`),
  KEY `idx_orders_source` (`source`),
  KEY `idx_orders_ip` (`ip_address`),
  KEY `idx_orders_wholesale` (`is_wholesale`),
  KEY `idx_orders_landing` (`landing_page_id`),
  CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) NOT NULL,
  `token_hash` varchar(128) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reset_token` (`token_hash`),
  KEY `idx_reset_customer` (`customer_id`),
  CONSTRAINT `password_resets_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `license_state` (
  `id` tinyint(4) NOT NULL,
  `installation_id` char(64) NOT NULL,
  `license_key_enc` text DEFAULT NULL,
  `license_key_mask` varchar(64) DEFAULT NULL,
  `token` text DEFAULT NULL,
  `token_jti` varchar(128) DEFAULT NULL,
  `domain` varchar(191) DEFAULT NULL,
  `product_slug` varchar(100) DEFAULT NULL,
  `product_name` varchar(191) DEFAULT NULL,
  `public_key` varchar(600) DEFAULT NULL,
  `key_id` varchar(64) DEFAULT NULL,
  `ever_activated` tinyint(1) NOT NULL DEFAULT 0,
  `requires_activation` tinyint(1) NOT NULL DEFAULT 0,
  `activated_at` bigint(20) DEFAULT NULL,
  `last_sync_at` bigint(20) DEFAULT NULL,
  `last_attempt_at` bigint(20) DEFAULT NULL,
  `next_check_at` bigint(20) DEFAULT NULL,
  `last_result` varchar(255) DEFAULT NULL,
  `last_error` varchar(255) DEFAULT NULL,
  `server_reachable` tinyint(1) DEFAULT NULL,
  `consecutive_failures` int(11) NOT NULL DEFAULT 0,
  `backoff_until` bigint(20) DEFAULT NULL,
  `updated_at` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `license_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event` varchar(40) NOT NULL,
  `level` varchar(10) NOT NULL DEFAULT 'info',
  `message` varchar(500) DEFAULT NULL,
  `http_status` int(11) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_license_events_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `password_reset_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_type` varchar(16) NOT NULL,
  `account_id` int(11) DEFAULT NULL,
  `account_name` varchar(191) DEFAULT NULL,
  `identifier` varchar(191) NOT NULL,
  `channel` varchar(16) NOT NULL,
  `destination` varchar(191) DEFAULT NULL,
  `code_hash` char(64) DEFAULT NULL,
  `token_hash` char(64) DEFAULT NULL,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL,
  `error` varchar(255) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reset_identifier` (`identifier`,`created_at`),
  KEY `idx_reset_token` (`token_hash`),
  KEY `idx_reset_ip` (`ip_address`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `pre_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(191) NOT NULL,
  `customer_phone` varchar(32) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `advance` decimal(12,2) DEFAULT 0.00,
  `expected_date` varchar(20) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `note` text DEFAULT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_preorders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `product_attributes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `attribute_id` int(11) NOT NULL,
  `attribute_name` varchar(191) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `product_attributes_attribute_id_attributes_id_fk` (`attribute_id`),
  KEY `idx_prod_attr_product` (`product_id`),
  CONSTRAINT `product_attributes_attribute_id_attributes_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attributes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `product_attributes_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `product_groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_groups_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `product_issues` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `issue_type` varchar(32) NOT NULL DEFAULT 'damage',
  `issued_to` varchar(191) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `issue_date` varchar(20) NOT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `product_issues_product_id_products_id_fk` (`product_id`),
  KEY `idx_issues_date` (`issue_date`),
  CONSTRAINT `product_issues_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `product_variations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `combination` text NOT NULL,
  `label` varchar(255) NOT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `price` decimal(12,2) DEFAULT NULL,
  `sale_price` decimal(12,2) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `image` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `sort_order` int(11) DEFAULT 0,
  `barcode` varchar(64) DEFAULT NULL,
  `wholesale_price` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_variation_product` (`product_id`),
  KEY `idx_variation_sku` (`sku`),
  KEY `idx_variation_barcode` (`barcode`),
  CONSTRAINT `product_variations_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `generic_name` varchar(255) DEFAULT NULL,
  `slug` varchar(191) NOT NULL,
  `sku` varchar(100) NOT NULL,
  `barcode` varchar(100) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `brand_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `short_description` text DEFAULT NULL,
  `price` decimal(12,2) NOT NULL,
  `sale_price` decimal(12,2) DEFAULT NULL,
  `cost_price` decimal(12,2) DEFAULT 0.00,
  `stock` int(11) NOT NULL DEFAULT 0,
  `low_stock_threshold` int(11) DEFAULT 10,
  `unit` varchar(50) DEFAULT 'Strip',
  `dosage` varchar(50) DEFAULT NULL,
  `requires_prescription` tinyint(1) DEFAULT 0,
  `batch_number` varchar(100) DEFAULT NULL,
  `expiry_date` varchar(20) DEFAULT NULL,
  `featured` tinyint(1) DEFAULT 0,
  `is_flash_sale` tinyint(1) DEFAULT 0,
  `is_best_seller` tinyint(1) DEFAULT 0,
  `is_new_arrival` tinyint(1) DEFAULT 0,
  `rating` decimal(3,2) DEFAULT 5.00,
  `review_count` int(11) DEFAULT 0,
  `image` text DEFAULT NULL,
  `images` text DEFAULT NULL,
  `has_variations` tinyint(1) DEFAULT 0,
  `video_url` text DEFAULT NULL,
  `wholesale_enabled` tinyint(1) DEFAULT 0,
  `wholesale_price` decimal(12,2) DEFAULT NULL,
  `wholesale_min_qty` int(11) DEFAULT NULL,
  `wholesale_max_qty` int(11) DEFAULT NULL,
  `size_guide_id` int(11) DEFAULT NULL,
  `free_shipping` tinyint(1) DEFAULT 0,
  `shipping_charges` text DEFAULT NULL,
  `status` varchar(32) DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_slug_unique` (`slug`),
  UNIQUE KEY `products_sku_unique` (`sku`),
  KEY `idx_products_status` (`status`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_brand` (`brand_id`),
  KEY `idx_products_barcode` (`barcode`),
  KEY `idx_products_name` (`name`),
  CONSTRAINT `products_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `purchase_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_cost` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `batch_number` varchar(100) DEFAULT NULL,
  `expiry_date` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_items_purchase_id_purchases_id_fk` (`purchase_id`),
  KEY `purchase_items_product_id_products_id_fk` (`product_id`),
  CONSTRAINT `purchase_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `purchase_items_purchase_id_purchases_id_fk` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `purchase_return_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_cost` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `batch_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_return_items_return_id_purchase_returns_id_fk` (`return_id`),
  KEY `purchase_return_items_product_id_products_id_fk` (`product_id`),
  CONSTRAINT `purchase_return_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `purchase_return_items_return_id_purchase_returns_id_fk` FOREIGN KEY (`return_id`) REFERENCES `purchase_returns` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `purchase_returns` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_number` varchar(64) NOT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `supplier_name` varchar(191) NOT NULL,
  `purchase_id` int(11) DEFAULT NULL,
  `total` decimal(12,2) NOT NULL,
  `reason` text DEFAULT NULL,
  `return_date` varchar(20) NOT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_returns_return_number_unique` (`return_number`),
  KEY `purchase_returns_supplier_id_suppliers_id_fk` (`supplier_id`),
  CONSTRAINT `purchase_returns_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `purchases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(64) NOT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `supplier_name` varchar(191) NOT NULL,
  `total` decimal(12,2) NOT NULL,
  `paid` decimal(12,2) DEFAULT 0.00,
  `status` varchar(32) DEFAULT 'completed',
  `purchase_date` varchar(20) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchases_invoice_number_unique` (`invoice_number`),
  KEY `purchases_supplier_id_suppliers_id_fk` (`supplier_id`),
  CONSTRAINT `purchases_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `user_name` varchar(191) NOT NULL,
  `user_phone` varchar(32) DEFAULT NULL,
  `rating` int(11) NOT NULL,
  `comment` text NOT NULL,
  `status` varchar(32) DEFAULT 'approved',
  `reply` text DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reviews_product` (`product_id`),
  KEY `idx_reviews_status` (`status`,`created_at`),
  CONSTRAINT `reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `salaries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_name` varchar(191) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `month` varchar(20) NOT NULL,
  `basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `bonus` decimal(12,2) DEFAULT 0.00,
  `deduction` decimal(12,2) DEFAULT 0.00,
  `net_pay` decimal(12,2) NOT NULL,
  `paid_on` varchar(20) DEFAULT NULL,
  `status` varchar(32) DEFAULT 'paid',
  `note` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_salary_month` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `site_settings` (
  `key` varchar(191) NOT NULL,
  `value` mediumtext NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `supplier_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) DEFAULT NULL,
  `supplier_name` varchar(191) NOT NULL,
  `purchase_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `method` varchar(32) DEFAULT 'cash',
  `reference` varchar(100) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `payment_date` varchar(20) NOT NULL,
  `recorded_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sup_pay_supplier` (`supplier_id`),
  KEY `idx_sup_pay_date` (`payment_date`),
  CONSTRAINT `supplier_payments_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `company` varchar(191) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `balance` decimal(12,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL DEFAULT 'Admin User',
  `role` varchar(32) NOT NULL DEFAULT 'admin',
  `phone` varchar(32) DEFAULT NULL,
  `avatar` text DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `job_role` varchar(100) DEFAULT NULL,
  `permissions` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `password_changed_at` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_uid_unique` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v3.6 — size guides, blog, landing pages, online payments
CREATE TABLE `size_guides` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `columns` text NOT NULL,
  `rows` mediumtext NOT NULL,
  `image` text DEFAULT NULL,
  `note` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `blog_posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `excerpt` text DEFAULT NULL,
  `content` mediumtext DEFAULT NULL,
  `cover_image` text DEFAULT NULL,
  `author` varchar(191) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `views` int(11) NOT NULL DEFAULT 0,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_slug` (`slug`),
  KEY `idx_blog_status` (`status`,`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `landing_pages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `template` varchar(32) NOT NULL DEFAULT 'fashion',
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `content` mediumtext DEFAULT NULL,
  `products` text DEFAULT NULL,
  `shipping` text DEFAULT NULL,
  `views` int(11) NOT NULL DEFAULT 0,
  `orders_count` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_landing_slug` (`slug`),
  KEY `idx_landing_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `payment_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `order_number` varchar(64) NOT NULL,
  `gateway` varchar(32) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(8) NOT NULL DEFAULT 'BDT',
  `status` varchar(16) NOT NULL DEFAULT 'initiated',
  `reference` varchar(100) NOT NULL,
  `gateway_ref` varchar(191) DEFAULT NULL,
  `gateway_txn_id` varchar(191) DEFAULT NULL,
  `message` varchar(255) DEFAULT NULL,
  `payload` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_tx_reference` (`reference`),
  KEY `idx_payment_tx_order` (`order_id`),
  KEY `idx_payment_tx_gateway_ref` (`gateway_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `media_files` (
  `file_name` varchar(191) NOT NULL,
  `part` int(11) NOT NULL DEFAULT 0,
  `parts` int(11) NOT NULL DEFAULT 1,
  `mime` varchar(80) DEFAULT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `data` mediumblob NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`file_name`,`part`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pos_drawer_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kind` varchar(16) NOT NULL,
  `reason` varchar(191) DEFAULT NULL,
  `order_number` varchar(64) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `method` varchar(24) DEFAULT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT 1,
  `cashier` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `device` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_drawer_created` (`created_at`),
  KEY `idx_drawer_kind` (`kind`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT IGNORE INTO `order_counters` (`name`, `value`) VALUES ('orders', 1000), ('returns', 1000);

-- >>> v3.2 – v3.12 additions (generated) >>>
-- Everything later versions added, so a fresh import is complete even when
-- the app is not allowed to ALTER tables. Safe to run on an existing database.
-- Tables
CREATE TABLE IF NOT EXISTS `license_state` (
  `id` tinyint(4) NOT NULL,
  `installation_id` char(64) NOT NULL,
  `license_key_enc` text DEFAULT NULL,
  `license_key_mask` varchar(64) DEFAULT NULL,
  `token` text DEFAULT NULL,
  `token_jti` varchar(128) DEFAULT NULL,
  `domain` varchar(191) DEFAULT NULL,
  `product_slug` varchar(100) DEFAULT NULL,
  `product_name` varchar(191) DEFAULT NULL,
  `public_key` varchar(600) DEFAULT NULL,
  `key_id` varchar(64) DEFAULT NULL,
  `ever_activated` tinyint(1) NOT NULL DEFAULT 0,
  `requires_activation` tinyint(1) NOT NULL DEFAULT 0,
  `activated_at` bigint(20) DEFAULT NULL,
  `last_sync_at` bigint(20) DEFAULT NULL,
  `last_attempt_at` bigint(20) DEFAULT NULL,
  `next_check_at` bigint(20) DEFAULT NULL,
  `last_result` varchar(255) DEFAULT NULL,
  `last_error` varchar(255) DEFAULT NULL,
  `server_reachable` tinyint(1) DEFAULT NULL,
  `consecutive_failures` int(11) NOT NULL DEFAULT 0,
  `backoff_until` bigint(20) DEFAULT NULL,
  `updated_at` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `license_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event` varchar(40) NOT NULL,
  `level` varchar(10) NOT NULL DEFAULT 'info',
  `message` varchar(500) DEFAULT NULL,
  `http_status` int(11) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_license_events_created` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `size_guides` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `columns` text NOT NULL,
  `rows` mediumtext NOT NULL,
  `image` text DEFAULT NULL,
  `note` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `excerpt` text DEFAULT NULL,
  `content` mediumtext DEFAULT NULL,
  `cover_image` text DEFAULT NULL,
  `author` varchar(191) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `views` int(11) NOT NULL DEFAULT 0,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_slug` (`slug`),
  KEY `idx_blog_status` (`status`,`published_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `landing_pages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `template` varchar(32) NOT NULL DEFAULT 'fashion',
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `content` mediumtext DEFAULT NULL,
  `products` text DEFAULT NULL,
  `shipping` text DEFAULT NULL,
  `views` int(11) NOT NULL DEFAULT 0,
  `orders_count` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_landing_slug` (`slug`),
  KEY `idx_landing_status` (`status`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `order_number` varchar(64) NOT NULL,
  `gateway` varchar(32) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(8) NOT NULL DEFAULT 'BDT',
  `status` varchar(16) NOT NULL DEFAULT 'initiated',
  `reference` varchar(100) NOT NULL,
  `gateway_ref` varchar(191) DEFAULT NULL,
  `gateway_txn_id` varchar(191) DEFAULT NULL,
  `message` varchar(255) DEFAULT NULL,
  `payload` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_tx_reference` (`reference`),
  KEY `idx_payment_tx_order` (`order_id`),
  KEY `idx_payment_tx_gateway_ref` (`gateway_ref`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_files` (
  `file_name` varchar(191) NOT NULL,
  `part` int(11) NOT NULL DEFAULT 0,
  `parts` int(11) NOT NULL DEFAULT 1,
  `mime` varchar(80) DEFAULT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `data` mediumblob NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`file_name`,`part`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pos_drawer_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kind` varchar(16) NOT NULL,
  `reason` varchar(191) DEFAULT NULL,
  `order_number` varchar(64) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `method` varchar(24) DEFAULT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT 1,
  `cashier` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `device` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_drawer_created` (`created_at`),
  KEY `idx_drawer_kind` (`kind`,`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `color` varchar(20) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `monthly_budget` decimal(12,2) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_category_name` (`name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pos_held_orders` (
  `id` varchar(64) NOT NULL,
  `customer` varchar(191) DEFAULT NULL,
  `items` mediumtext NOT NULL,
  `note` text DEFAULT NULL,
  `cashier` varchar(191) DEFAULT NULL,
  `user_sub` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_held_created` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupon_usages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `coupon_id` int(11) NOT NULL,
  `coupon_code` varchar(64) NOT NULL,
  `order_id` int(11) NOT NULL,
  `order_number` varchar(64) DEFAULT NULL,
  `customer_phone` varchar(32) DEFAULT NULL,
  `discount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `released` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupon_usage_order` (`order_id`),
  KEY `idx_coupon_usage_coupon` (`coupon_id`),
  KEY `idx_coupon_usage_phone` (`customer_phone`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_image_index` (
  `product_id` int(11) NOT NULL,
  `image_url` varchar(1000) NOT NULL,
  `descriptor` text NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`product_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `live_chat_conversations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `customer_name` varchar(191) NOT NULL,
  `customer_phone` varchar(32) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'open',
  `page_url` varchar(500) DEFAULT NULL,
  `page_title` varchar(255) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `unread_admin` int(11) NOT NULL DEFAULT 0,
  `unread_customer` int(11) NOT NULL DEFAULT 0,
  `last_message` varchar(255) DEFAULT NULL,
  `last_sender` varchar(16) DEFAULT NULL,
  `last_message_at` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_live_chat_token` (`token`),
  KEY `idx_live_chat_status` (`status`,`last_message_at`),
  KEY `idx_live_chat_unread` (`unread_admin`),
  KEY `idx_live_chat_phone` (`customer_phone`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `live_chat_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) NOT NULL,
  `sender` varchar(16) NOT NULL,
  `author` varchar(100) DEFAULT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_live_chat_msg_conv` (`conversation_id`,`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text DEFAULT NULL,
  `link_tab` varchar(64) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_notifications_read` (`is_read`,`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_counters` (
  `name` varchar(32) NOT NULL,
  `value` int(11) NOT NULL DEFAULT 1000,
  PRIMARY KEY (`name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sms_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `phone` varchar(32) NOT NULL,
  `message` text NOT NULL,
  `event` varchar(40) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `provider` varchar(32) DEFAULT NULL,
  `status` varchar(16) NOT NULL,
  `response` text DEFAULT NULL,
  `segments` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sms_order` (`order_id`),
  KEY `idx_sms_created` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fraud_checks` (
  `phone` varchar(20) NOT NULL,
  `data` mediumtext NOT NULL,
  `total` int(11) NOT NULL DEFAULT 0,
  `success` int(11) NOT NULL DEFAULT 0,
  `cancelled` int(11) NOT NULL DEFAULT 0,
  `ratio` decimal(5,1) NOT NULL DEFAULT 0,
  `checked_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`phone`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_returns` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_number` varchar(32) NOT NULL,
  `order_id` int(11) NOT NULL,
  `order_number` varchar(64) NOT NULL,
  `customer_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(32) DEFAULT NULL,
  `items` mediumtext NOT NULL,
  `items_amount` decimal(12,2) NOT NULL DEFAULT 0,
  `refund_amount` decimal(12,2) NOT NULL DEFAULT 0,
  `refund_method` varchar(20) DEFAULT NULL,
  `reason` varchar(191) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `restocked` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(16) NOT NULL DEFAULT 'received',
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `refunded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_return_number` (`return_number`),
  KEY `idx_returns_order` (`order_id`),
  KEY `idx_returns_created` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'new',
  `admin_note` text DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `page_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_contact_status` (`status`,`created_at`),
  KEY `idx_contact_phone` (`phone`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_type` varchar(16) NOT NULL,
  `account_id` int(11) DEFAULT NULL,
  `account_name` varchar(191) DEFAULT NULL,
  `identifier` varchar(191) NOT NULL,
  `channel` varchar(16) NOT NULL,
  `destination` varchar(191) DEFAULT NULL,
  `code_hash` char(64) DEFAULT NULL,
  `token_hash` char(64) DEFAULT NULL,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL,
  `error` varchar(255) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reset_identifier` (`identifier`,`created_at`),
  KEY `idx_reset_token` (`token_hash`),
  KEY `idx_reset_ip` (`ip_address`,`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columns (each one is added only when it is missing)
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `wholesale_enabled` TINYINT(1) DEFAULT 0', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'wholesale_enabled');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `wholesale_price` DECIMAL(12,2) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'wholesale_price');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `wholesale_min_qty` INT(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'wholesale_min_qty');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `wholesale_max_qty` INT(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'wholesale_max_qty');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `customer_type` VARCHAR(16) NOT NULL DEFAULT ''regular''', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'customer_type');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `wholesale_status` VARCHAR(16) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'wholesale_status');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `business_name` VARCHAR(191) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'business_name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `business_address` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'business_address');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `business_type` VARCHAR(100) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'business_type');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `wholesale_applied_at` TIMESTAMP NULL DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'wholesale_applied_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `wholesale_reviewed_at` TIMESTAMP NULL DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'wholesale_reviewed_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `wholesale_note` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'wholesale_note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `tracking_code` VARCHAR(128) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tracking_code');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `is_wholesale` TINYINT(1) DEFAULT 0', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'is_wholesale');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `password_changed_at` BIGINT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'password_changed_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD COLUMN `password_changed_at` BIGINT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `size_guide_id` INT(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'size_guide_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `free_shipping` TINYINT(1) DEFAULT 0', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'free_shipping');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `shipping_charges` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'shipping_charges');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `reviews` ADD COLUMN `reply` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'reply');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `reviews` ADD COLUMN `ip_address` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'ip_address');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `landing_page_id` INT(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'landing_page_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `landing_page_name` VARCHAR(191) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'landing_page_name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `product_variations` ADD COLUMN `barcode` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'barcode');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `product_variations` ADD COLUMN `wholesale_price` DECIMAL(12,2) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'wholesale_price');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `advance_paid` DECIMAL(12,2) NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'advance_paid');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `assigned_to` INT(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'assigned_to');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `assigned_name` VARCHAR(191) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'assigned_name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `assigned_at` TIMESTAMP NULL DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'assigned_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `stock_released` TINYINT(1) NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'stock_released');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `district` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'district');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `thana` VARCHAR(100) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'thana');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD COLUMN `created_by` VARCHAR(191) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'created_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `option_display` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'option_display');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `highlights` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'highlights');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `how_to_use` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'how_to_use');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `abandoned_checkouts` ADD COLUMN `district` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'abandoned_checkouts' AND COLUMN_NAME = 'district');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `abandoned_checkouts` ADD COLUMN `thana` VARCHAR(100) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'abandoned_checkouts' AND COLUMN_NAME = 'thana');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `google_id` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'google_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD COLUMN `facebook_id` VARCHAR(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'facebook_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `seo_title` VARCHAR(191) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'seo_title');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `seo_description` VARCHAR(500) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'seo_description');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `seo_image` TEXT DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'seo_image');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD COLUMN `tags` VARCHAR(500) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'tags');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Indexes
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD INDEX `idx_customers_wholesale` (`customer_type`,`wholesale_status`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'idx_customers_wholesale');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_wholesale` (`is_wholesale`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_wholesale');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_landing` (`landing_page_id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_landing');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `reviews` ADD INDEX `idx_reviews_status` (`status`,`created_at`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'idx_reviews_status');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `product_variations` ADD INDEX `idx_variation_barcode` (`barcode`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND INDEX_NAME = 'idx_variation_barcode');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_assigned` (`assigned_to`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_assigned');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `expenses` ADD INDEX `idx_expenses_category` (`category`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND INDEX_NAME = 'idx_expenses_category');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_courier` (`courier_service`,`created_at`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_courier');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD INDEX `idx_customers_google` (`google_id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'idx_customers_google');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD INDEX `idx_customers_facebook` (`facebook_id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'idx_customers_facebook');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD INDEX `idx_customers_email` (`email`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'idx_customers_email');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD INDEX `idx_products_new_arrival` (`is_new_arrival`,`status`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_new_arrival');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD INDEX `idx_products_status_id` (`status`,`id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_status_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD INDEX `idx_products_flash` (`is_flash_sale`,`status`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_flash');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD INDEX `idx_products_best` (`is_best_seller`,`status`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_best');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `products` ADD INDEX `idx_products_featured` (`featured`,`status`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_featured');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `customers` ADD INDEX `idx_customers_spent` (`total_spent`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'idx_customers_spent');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `inventory_transactions` ADD INDEX `idx_inventory_created` (`created_at`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_transactions' AND INDEX_NAME = 'idx_inventory_created');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- <<< v3.2 – v3.12 additions <<<
