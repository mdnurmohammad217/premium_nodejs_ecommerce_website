/**
 * Core tables, generated from database/database.sql by scripts/make-base-schema.ts.
 * Do not edit by hand — edit database.sql and run the script again.
 *
 * ensureSchema() creates any of these that are missing (with foreign key
 * checks switched off for that one connection, so the order does not
 * matter). Existing tables and their data are never changed.
 */
export const BASE_TABLES: Array<{ name: string; ddl: string }> = [
  {
    "name": "abandoned_checkouts",
    "ddl": "CREATE TABLE IF NOT EXISTS `abandoned_checkouts` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `session_key` varchar(64) NOT NULL,\n  `customer_name` varchar(191) DEFAULT NULL,\n  `customer_phone` varchar(32) DEFAULT NULL,\n  `customer_address` text DEFAULT NULL,\n  `shipping_zone` varchar(100) DEFAULT NULL,\n  `payment_method` varchar(32) DEFAULT NULL,\n  `items` mediumtext DEFAULT NULL,\n  `item_count` int(11) DEFAULT 0,\n  `cart_total` decimal(12,2) DEFAULT 0.00,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'active',\n  `recovered_order_id` int(11) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `abandoned_checkouts_session_key_unique` (`session_key`),\n  KEY `idx_abandoned_status` (`status`),\n  KEY `idx_abandoned_phone` (`customer_phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "admin_notifications",
    "ddl": "CREATE TABLE IF NOT EXISTS `admin_notifications` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `type` varchar(50) NOT NULL,\n  `title` varchar(255) NOT NULL,\n  `body` text DEFAULT NULL,\n  `link_tab` varchar(64) DEFAULT NULL,\n  `is_read` tinyint(1) NOT NULL DEFAULT 0,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_admin_notifications_read` (`is_read`,`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "order_counters",
    "ddl": "CREATE TABLE IF NOT EXISTS `order_counters` (\n  `name` varchar(32) NOT NULL,\n  `value` int(11) NOT NULL DEFAULT 1000,\n  PRIMARY KEY (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "sms_logs",
    "ddl": "CREATE TABLE IF NOT EXISTS `sms_logs` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `phone` varchar(32) NOT NULL,\n  `message` text NOT NULL,\n  `event` varchar(40) DEFAULT NULL,\n  `order_id` int(11) DEFAULT NULL,\n  `provider` varchar(32) DEFAULT NULL,\n  `status` varchar(16) NOT NULL,\n  `response` text DEFAULT NULL,\n  `segments` int(11) NOT NULL DEFAULT 1,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_sms_order` (`order_id`),\n  KEY `idx_sms_created` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "fraud_checks",
    "ddl": "CREATE TABLE IF NOT EXISTS `fraud_checks` (\n  `phone` varchar(20) NOT NULL,\n  `data` mediumtext NOT NULL,\n  `total` int(11) NOT NULL DEFAULT 0,\n  `success` int(11) NOT NULL DEFAULT 0,\n  `cancelled` int(11) NOT NULL DEFAULT 0,\n  `ratio` decimal(5,1) NOT NULL DEFAULT 0,\n  `checked_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "contact_messages",
    "ddl": "CREATE TABLE IF NOT EXISTS `contact_messages` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `phone` varchar(32) NOT NULL,\n  `email` varchar(191) DEFAULT NULL,\n  `address` text DEFAULT NULL,\n  `message` text DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'new',\n  `admin_note` text DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `user_agent` varchar(500) DEFAULT NULL,\n  `page_url` varchar(500) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_contact_status` (`status`,`created_at`),\n  KEY `idx_contact_phone` (`phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "order_returns",
    "ddl": "CREATE TABLE IF NOT EXISTS `order_returns` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `return_number` varchar(32) NOT NULL,\n  `order_id` int(11) NOT NULL,\n  `order_number` varchar(64) NOT NULL,\n  `customer_name` varchar(191) DEFAULT NULL,\n  `customer_phone` varchar(32) DEFAULT NULL,\n  `items` mediumtext NOT NULL,\n  `items_amount` decimal(12,2) NOT NULL DEFAULT 0,\n  `refund_amount` decimal(12,2) NOT NULL DEFAULT 0,\n  `refund_method` varchar(20) DEFAULT NULL,\n  `reason` varchar(191) DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `restocked` tinyint(1) NOT NULL DEFAULT 1,\n  `status` varchar(16) NOT NULL DEFAULT 'received',\n  `created_by` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `refunded_at` timestamp NULL DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uniq_return_number` (`return_number`),\n  KEY `idx_returns_order` (`order_id`),\n  KEY `idx_returns_created` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "attributes",
    "ddl": "CREATE TABLE IF NOT EXISTS `attributes` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `slug` varchar(191) NOT NULL,\n  `values` text DEFAULT NULL,\n  `sort_order` int(11) DEFAULT 0,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `attributes_name_unique` (`name`),\n  UNIQUE KEY `attributes_slug_unique` (`slug`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "blocked_ips",
    "ddl": "CREATE TABLE IF NOT EXISTS `blocked_ips` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `ip` varchar(64) NOT NULL,\n  `note` text DEFAULT NULL,\n  `created_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `blocked_ips_ip_unique` (`ip`),\n  KEY `idx_blocked_ip` (`ip`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "brands",
    "ddl": "CREATE TABLE IF NOT EXISTS `brands` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `slug` varchar(191) NOT NULL,\n  `logo` text DEFAULT NULL,\n  `description` text DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `brands_slug_unique` (`slug`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "categories",
    "ddl": "CREATE TABLE IF NOT EXISTS `categories` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `slug` varchar(191) NOT NULL,\n  `description` text DEFAULT NULL,\n  `image` text DEFAULT NULL,\n  `icon` varchar(64) DEFAULT NULL,\n  `featured` tinyint(1) DEFAULT 0,\n  `show_on_home` tinyint(1) DEFAULT 0,\n  `parent_id` int(11) DEFAULT NULL,\n  `level` int(11) DEFAULT 1,\n  `sort_order` int(11) DEFAULT 0,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `categories_slug_unique` (`slug`),\n  KEY `idx_categories_parent` (`parent_id`),\n  KEY `idx_categories_level` (`level`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "counter_sessions",
    "ddl": "CREATE TABLE IF NOT EXISTS `counter_sessions` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `opened_by` varchar(191) NOT NULL,\n  `opening_cash` decimal(12,2) NOT NULL DEFAULT 0.00,\n  `closing_cash` decimal(12,2) DEFAULT NULL,\n  `expected_cash` decimal(12,2) DEFAULT NULL,\n  `difference` decimal(12,2) DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'open',\n  `note` text DEFAULT NULL,\n  `opened_at` timestamp NULL DEFAULT current_timestamp(),\n  `closed_at` timestamp NULL DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_counter_status` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "coupons",
    "ddl": "CREATE TABLE IF NOT EXISTS `coupons` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `code` varchar(64) NOT NULL,\n  `type` varchar(16) NOT NULL,\n  `value` decimal(12,2) NOT NULL,\n  `min_order` decimal(12,2) DEFAULT 0.00,\n  `max_discount` decimal(12,2) DEFAULT NULL,\n  `usage_limit` int(11) DEFAULT 100,\n  `used_count` int(11) DEFAULT 0,\n  `expires_at` varchar(20) DEFAULT NULL,\n  `status` varchar(32) DEFAULT 'active',\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `coupons_code_unique` (`code`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "customer_payments",
    "ddl": "CREATE TABLE IF NOT EXISTS `customer_payments` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `customer_id` int(11) DEFAULT NULL,\n  `customer_name` varchar(191) NOT NULL,\n  `order_id` int(11) DEFAULT NULL,\n  `amount` decimal(12,2) NOT NULL,\n  `method` varchar(32) DEFAULT 'cash',\n  `reference` varchar(100) DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `payment_date` varchar(20) NOT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_cust_pay_customer` (`customer_id`),\n  KEY `idx_cust_pay_date` (`payment_date`),\n  CONSTRAINT `customer_payments_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "customers",
    "ddl": "CREATE TABLE IF NOT EXISTS `customers` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `phone` varchar(32) NOT NULL,\n  `email` varchar(191) DEFAULT NULL,\n  `password_hash` varchar(255) DEFAULT NULL,\n  `address` text DEFAULT NULL,\n  `total_orders` int(11) DEFAULT 0,\n  `total_spent` decimal(12,2) DEFAULT 0.00,\n  `status` varchar(16) NOT NULL DEFAULT 'active',\n  `last_ip` varchar(64) DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `customer_type` varchar(16) NOT NULL DEFAULT 'regular',\n  `wholesale_status` varchar(16) DEFAULT NULL,\n  `business_name` varchar(191) DEFAULT NULL,\n  `business_address` text DEFAULT NULL,\n  `business_type` varchar(100) DEFAULT NULL,\n  `wholesale_applied_at` timestamp NULL DEFAULT NULL,\n  `wholesale_reviewed_at` timestamp NULL DEFAULT NULL,\n  `wholesale_note` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `password_changed_at` bigint(20) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_customers_phone` (`phone`),\n  KEY `idx_customers_wholesale` (`customer_type`,`wholesale_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "expenses",
    "ddl": "CREATE TABLE IF NOT EXISTS `expenses` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `category` varchar(100) NOT NULL,\n  `description` text DEFAULT NULL,\n  `amount` decimal(12,2) NOT NULL,\n  `payment_method` varchar(32) DEFAULT 'cash',\n  `expense_date` varchar(20) NOT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_expenses_date` (`expense_date`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "generics",
    "ddl": "CREATE TABLE IF NOT EXISTS `generics` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `description` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `generics_name_unique` (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "hero_banners",
    "ddl": "CREATE TABLE IF NOT EXISTS `hero_banners` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `title` varchar(255) DEFAULT NULL,\n  `subtitle` text DEFAULT NULL,\n  `badge` varchar(100) DEFAULT NULL,\n  `button_text` varchar(100) DEFAULT NULL,\n  `button_url` varchar(255) DEFAULT NULL,\n  `image_url` text NOT NULL,\n  `mobile_image_url` text DEFAULT NULL,\n  `bg_gradient` varchar(255) DEFAULT NULL,\n  `sort_order` int(11) DEFAULT 0,\n  `status` varchar(32) DEFAULT 'active',\n  PRIMARY KEY (`id`),\n  KEY `idx_banners_status_order` (`status`,`sort_order`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "inventory_transactions",
    "ddl": "CREATE TABLE IF NOT EXISTS `inventory_transactions` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `product_id` int(11) NOT NULL,\n  `type` varchar(32) NOT NULL,\n  `quantity` int(11) NOT NULL,\n  `previous_stock` int(11) NOT NULL,\n  `new_stock` int(11) NOT NULL,\n  `reference` varchar(100) DEFAULT NULL,\n  `notes` text DEFAULT NULL,\n  `performed_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_inventory_product` (`product_id`),\n  CONSTRAINT `inventory_transactions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "manufacturers",
    "ddl": "CREATE TABLE IF NOT EXISTS `manufacturers` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `contact` varchar(100) DEFAULT NULL,\n  `address` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `manufacturers_name_unique` (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "order_items",
    "ddl": "CREATE TABLE IF NOT EXISTS `order_items` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `order_id` int(11) NOT NULL,\n  `product_id` int(11) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `variation_id` int(11) DEFAULT NULL,\n  `variation_label` varchar(255) DEFAULT NULL,\n  `sku` varchar(100) DEFAULT NULL,\n  `unit_price` decimal(12,2) NOT NULL,\n  `quantity` int(11) NOT NULL,\n  `subtotal` decimal(12,2) NOT NULL,\n  `batch_number` varchar(100) DEFAULT NULL,\n  `expiry_date` varchar(20) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `order_items_product_id_products_id_fk` (`product_id`),\n  KEY `idx_order_items_order` (`order_id`),\n  CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\n  CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "orders",
    "ddl": "CREATE TABLE IF NOT EXISTS `orders` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `order_number` varchar(64) NOT NULL,\n  `source` varchar(16) DEFAULT 'web',\n  `customer_id` int(11) DEFAULT NULL,\n  `customer_name` varchar(191) NOT NULL,\n  `customer_phone` varchar(32) NOT NULL,\n  `customer_address` text DEFAULT NULL,\n  `subtotal` decimal(12,2) NOT NULL,\n  `discount` decimal(12,2) DEFAULT 0.00,\n  `shipping_charge` decimal(12,2) DEFAULT 0.00,\n  `tax` decimal(12,2) DEFAULT 0.00,\n  `total` decimal(12,2) NOT NULL,\n  `cash_received` decimal(12,2) DEFAULT 0.00,\n  `change_amount` decimal(12,2) DEFAULT 0.00,\n  `payment_method` varchar(32) NOT NULL DEFAULT 'cod',\n  `payment_status` varchar(32) DEFAULT 'unpaid',\n  `order_status` varchar(32) DEFAULT 'pending',\n  `shipping_zone` varchar(100) DEFAULT NULL,\n  `transaction_id` varchar(100) DEFAULT NULL,\n  `sender_number` varchar(32) DEFAULT NULL,\n  `notes` text DEFAULT NULL,\n  `cashier_name` varchar(191) DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `user_agent` text DEFAULT NULL,\n  `courier_service` varchar(64) DEFAULT NULL,\n  `consignment_id` varchar(128) DEFAULT NULL,\n  `courier_status` varchar(64) DEFAULT NULL,\n  `courier_sent_at` timestamp NULL DEFAULT NULL,\n  `tracking_code` varchar(128) DEFAULT NULL,\n  `is_wholesale` tinyint(1) DEFAULT 0,\n  `landing_page_id` int(11) DEFAULT NULL,\n  `landing_page_name` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `orders_order_number_unique` (`order_number`),\n  KEY `orders_customer_id_customers_id_fk` (`customer_id`),\n  KEY `idx_orders_status` (`order_status`),\n  KEY `idx_orders_created` (`created_at`),\n  KEY `idx_orders_phone` (`customer_phone`),\n  KEY `idx_orders_source` (`source`),\n  KEY `idx_orders_ip` (`ip_address`),\n  KEY `idx_orders_wholesale` (`is_wholesale`),\n  KEY `idx_orders_landing` (`landing_page_id`),\n  CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "password_resets",
    "ddl": "CREATE TABLE IF NOT EXISTS `password_resets` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `customer_id` int(11) NOT NULL,\n  `token_hash` varchar(128) NOT NULL,\n  `expires_at` timestamp NOT NULL,\n  `used_at` timestamp NULL DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_reset_token` (`token_hash`),\n  KEY `idx_reset_customer` (`customer_id`),\n  CONSTRAINT `password_resets_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "license_state",
    "ddl": "CREATE TABLE IF NOT EXISTS `license_state` (\n  `id` tinyint(4) NOT NULL,\n  `installation_id` char(64) NOT NULL,\n  `license_key_enc` text DEFAULT NULL,\n  `license_key_mask` varchar(64) DEFAULT NULL,\n  `token` text DEFAULT NULL,\n  `token_jti` varchar(128) DEFAULT NULL,\n  `domain` varchar(191) DEFAULT NULL,\n  `product_slug` varchar(100) DEFAULT NULL,\n  `product_name` varchar(191) DEFAULT NULL,\n  `public_key` varchar(600) DEFAULT NULL,\n  `key_id` varchar(64) DEFAULT NULL,\n  `ever_activated` tinyint(1) NOT NULL DEFAULT 0,\n  `requires_activation` tinyint(1) NOT NULL DEFAULT 0,\n  `activated_at` bigint(20) DEFAULT NULL,\n  `last_sync_at` bigint(20) DEFAULT NULL,\n  `last_attempt_at` bigint(20) DEFAULT NULL,\n  `next_check_at` bigint(20) DEFAULT NULL,\n  `last_result` varchar(255) DEFAULT NULL,\n  `last_error` varchar(255) DEFAULT NULL,\n  `server_reachable` tinyint(1) DEFAULT NULL,\n  `consecutive_failures` int(11) NOT NULL DEFAULT 0,\n  `backoff_until` bigint(20) DEFAULT NULL,\n  `updated_at` bigint(20) DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "license_events",
    "ddl": "CREATE TABLE IF NOT EXISTS `license_events` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `event` varchar(40) NOT NULL,\n  `level` varchar(10) NOT NULL DEFAULT 'info',\n  `message` varchar(500) DEFAULT NULL,\n  `http_status` int(11) DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_license_events_created` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "password_reset_requests",
    "ddl": "CREATE TABLE IF NOT EXISTS `password_reset_requests` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `account_type` varchar(16) NOT NULL,\n  `account_id` int(11) DEFAULT NULL,\n  `account_name` varchar(191) DEFAULT NULL,\n  `identifier` varchar(191) NOT NULL,\n  `channel` varchar(16) NOT NULL,\n  `destination` varchar(191) DEFAULT NULL,\n  `code_hash` char(64) DEFAULT NULL,\n  `token_hash` char(64) DEFAULT NULL,\n  `attempts` int(11) NOT NULL DEFAULT 0,\n  `status` varchar(16) NOT NULL,\n  `error` varchar(255) DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `user_agent` varchar(255) DEFAULT NULL,\n  `expires_at` datetime NOT NULL,\n  `verified_at` datetime DEFAULT NULL,\n  `used_at` datetime DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_reset_identifier` (`identifier`,`created_at`),\n  KEY `idx_reset_token` (`token_hash`),\n  KEY `idx_reset_ip` (`ip_address`,`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "pre_orders",
    "ddl": "CREATE TABLE IF NOT EXISTS `pre_orders` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `customer_name` varchar(191) NOT NULL,\n  `customer_phone` varchar(32) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `product_id` int(11) DEFAULT NULL,\n  `quantity` int(11) NOT NULL DEFAULT 1,\n  `advance` decimal(12,2) DEFAULT 0.00,\n  `expected_date` varchar(20) DEFAULT NULL,\n  `status` varchar(32) NOT NULL DEFAULT 'pending',\n  `note` text DEFAULT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_preorders_status` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "product_attributes",
    "ddl": "CREATE TABLE IF NOT EXISTS `product_attributes` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `product_id` int(11) NOT NULL,\n  `attribute_id` int(11) NOT NULL,\n  `attribute_name` varchar(191) NOT NULL,\n  `value` text NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `product_attributes_attribute_id_attributes_id_fk` (`attribute_id`),\n  KEY `idx_prod_attr_product` (`product_id`),\n  CONSTRAINT `product_attributes_attribute_id_attributes_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attributes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\n  CONSTRAINT `product_attributes_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "product_groups",
    "ddl": "CREATE TABLE IF NOT EXISTS `product_groups` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `description` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `product_groups_name_unique` (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "product_issues",
    "ddl": "CREATE TABLE IF NOT EXISTS `product_issues` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `product_id` int(11) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `quantity` int(11) NOT NULL,\n  `issue_type` varchar(32) NOT NULL DEFAULT 'damage',\n  `issued_to` varchar(191) DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `issue_date` varchar(20) NOT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `product_issues_product_id_products_id_fk` (`product_id`),\n  KEY `idx_issues_date` (`issue_date`),\n  CONSTRAINT `product_issues_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "product_variations",
    "ddl": "CREATE TABLE IF NOT EXISTS `product_variations` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `product_id` int(11) NOT NULL,\n  `combination` text NOT NULL,\n  `label` varchar(255) NOT NULL,\n  `sku` varchar(100) DEFAULT NULL,\n  `price` decimal(12,2) DEFAULT NULL,\n  `sale_price` decimal(12,2) DEFAULT NULL,\n  `stock` int(11) NOT NULL DEFAULT 0,\n  `image` text DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'active',\n  `sort_order` int(11) DEFAULT 0,\n  `barcode` varchar(64) DEFAULT NULL,\n  `wholesale_price` decimal(12,2) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_variation_product` (`product_id`),\n  KEY `idx_variation_sku` (`sku`),\n  KEY `idx_variation_barcode` (`barcode`),\n  CONSTRAINT `product_variations_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "products",
    "ddl": "CREATE TABLE IF NOT EXISTS `products` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(255) NOT NULL,\n  `generic_name` varchar(255) DEFAULT NULL,\n  `slug` varchar(191) NOT NULL,\n  `sku` varchar(100) NOT NULL,\n  `barcode` varchar(100) DEFAULT NULL,\n  `category_id` int(11) DEFAULT NULL,\n  `brand_id` int(11) DEFAULT NULL,\n  `description` text DEFAULT NULL,\n  `short_description` text DEFAULT NULL,\n  `price` decimal(12,2) NOT NULL,\n  `sale_price` decimal(12,2) DEFAULT NULL,\n  `cost_price` decimal(12,2) DEFAULT 0.00,\n  `stock` int(11) NOT NULL DEFAULT 0,\n  `low_stock_threshold` int(11) DEFAULT 10,\n  `unit` varchar(50) DEFAULT 'Strip',\n  `dosage` varchar(50) DEFAULT NULL,\n  `requires_prescription` tinyint(1) DEFAULT 0,\n  `batch_number` varchar(100) DEFAULT NULL,\n  `expiry_date` varchar(20) DEFAULT NULL,\n  `featured` tinyint(1) DEFAULT 0,\n  `is_flash_sale` tinyint(1) DEFAULT 0,\n  `is_best_seller` tinyint(1) DEFAULT 0,\n  `is_new_arrival` tinyint(1) DEFAULT 0,\n  `rating` decimal(3,2) DEFAULT 5.00,\n  `review_count` int(11) DEFAULT 0,\n  `image` text DEFAULT NULL,\n  `images` text DEFAULT NULL,\n  `has_variations` tinyint(1) DEFAULT 0,\n  `video_url` text DEFAULT NULL,\n  `wholesale_enabled` tinyint(1) DEFAULT 0,\n  `wholesale_price` decimal(12,2) DEFAULT NULL,\n  `wholesale_min_qty` int(11) DEFAULT NULL,\n  `wholesale_max_qty` int(11) DEFAULT NULL,\n  `size_guide_id` int(11) DEFAULT NULL,\n  `free_shipping` tinyint(1) DEFAULT 0,\n  `shipping_charges` text DEFAULT NULL,\n  `status` varchar(32) DEFAULT 'active',\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `products_slug_unique` (`slug`),\n  UNIQUE KEY `products_sku_unique` (`sku`),\n  KEY `idx_products_status` (`status`),\n  KEY `idx_products_category` (`category_id`),\n  KEY `idx_products_brand` (`brand_id`),\n  KEY `idx_products_barcode` (`barcode`),\n  KEY `idx_products_name` (`name`),\n  CONSTRAINT `products_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\n  CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "purchase_items",
    "ddl": "CREATE TABLE IF NOT EXISTS `purchase_items` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `purchase_id` int(11) NOT NULL,\n  `product_id` int(11) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `quantity` int(11) NOT NULL,\n  `unit_cost` decimal(12,2) NOT NULL,\n  `subtotal` decimal(12,2) NOT NULL,\n  `batch_number` varchar(100) DEFAULT NULL,\n  `expiry_date` varchar(20) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `purchase_items_purchase_id_purchases_id_fk` (`purchase_id`),\n  KEY `purchase_items_product_id_products_id_fk` (`product_id`),\n  CONSTRAINT `purchase_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\n  CONSTRAINT `purchase_items_purchase_id_purchases_id_fk` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "purchase_return_items",
    "ddl": "CREATE TABLE IF NOT EXISTS `purchase_return_items` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `return_id` int(11) NOT NULL,\n  `product_id` int(11) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `quantity` int(11) NOT NULL,\n  `unit_cost` decimal(12,2) NOT NULL,\n  `subtotal` decimal(12,2) NOT NULL,\n  `batch_number` varchar(100) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `purchase_return_items_return_id_purchase_returns_id_fk` (`return_id`),\n  KEY `purchase_return_items_product_id_products_id_fk` (`product_id`),\n  CONSTRAINT `purchase_return_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\n  CONSTRAINT `purchase_return_items_return_id_purchase_returns_id_fk` FOREIGN KEY (`return_id`) REFERENCES `purchase_returns` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "purchase_returns",
    "ddl": "CREATE TABLE IF NOT EXISTS `purchase_returns` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `return_number` varchar(64) NOT NULL,\n  `supplier_id` int(11) DEFAULT NULL,\n  `supplier_name` varchar(191) NOT NULL,\n  `purchase_id` int(11) DEFAULT NULL,\n  `total` decimal(12,2) NOT NULL,\n  `reason` text DEFAULT NULL,\n  `return_date` varchar(20) NOT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `purchase_returns_return_number_unique` (`return_number`),\n  KEY `purchase_returns_supplier_id_suppliers_id_fk` (`supplier_id`),\n  CONSTRAINT `purchase_returns_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "purchases",
    "ddl": "CREATE TABLE IF NOT EXISTS `purchases` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `invoice_number` varchar(64) NOT NULL,\n  `supplier_id` int(11) DEFAULT NULL,\n  `supplier_name` varchar(191) NOT NULL,\n  `total` decimal(12,2) NOT NULL,\n  `paid` decimal(12,2) DEFAULT 0.00,\n  `status` varchar(32) DEFAULT 'completed',\n  `purchase_date` varchar(20) DEFAULT NULL,\n  `notes` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `purchases_invoice_number_unique` (`invoice_number`),\n  KEY `purchases_supplier_id_suppliers_id_fk` (`supplier_id`),\n  CONSTRAINT `purchases_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "reviews",
    "ddl": "CREATE TABLE IF NOT EXISTS `reviews` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `product_id` int(11) NOT NULL,\n  `user_name` varchar(191) NOT NULL,\n  `user_phone` varchar(32) DEFAULT NULL,\n  `rating` int(11) NOT NULL,\n  `comment` text NOT NULL,\n  `status` varchar(32) DEFAULT 'approved',\n  `reply` text DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_reviews_product` (`product_id`),\n  KEY `idx_reviews_status` (`status`,`created_at`),\n  CONSTRAINT `reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "salaries",
    "ddl": "CREATE TABLE IF NOT EXISTS `salaries` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `employee_name` varchar(191) NOT NULL,\n  `designation` varchar(100) DEFAULT NULL,\n  `month` varchar(20) NOT NULL,\n  `basic` decimal(12,2) NOT NULL DEFAULT 0.00,\n  `bonus` decimal(12,2) DEFAULT 0.00,\n  `deduction` decimal(12,2) DEFAULT 0.00,\n  `net_pay` decimal(12,2) NOT NULL,\n  `paid_on` varchar(20) DEFAULT NULL,\n  `status` varchar(32) DEFAULT 'paid',\n  `note` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_salary_month` (`month`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "site_settings",
    "ddl": "CREATE TABLE IF NOT EXISTS `site_settings` (\n  `key` varchar(191) NOT NULL,\n  `value` mediumtext NOT NULL,\n  PRIMARY KEY (`key`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "supplier_payments",
    "ddl": "CREATE TABLE IF NOT EXISTS `supplier_payments` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `supplier_id` int(11) DEFAULT NULL,\n  `supplier_name` varchar(191) NOT NULL,\n  `purchase_id` int(11) DEFAULT NULL,\n  `amount` decimal(12,2) NOT NULL,\n  `method` varchar(32) DEFAULT 'cash',\n  `reference` varchar(100) DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `payment_date` varchar(20) NOT NULL,\n  `recorded_by` varchar(191) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_sup_pay_supplier` (`supplier_id`),\n  KEY `idx_sup_pay_date` (`payment_date`),\n  CONSTRAINT `supplier_payments_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "suppliers",
    "ddl": "CREATE TABLE IF NOT EXISTS `suppliers` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `phone` varchar(32) NOT NULL,\n  `email` varchar(191) DEFAULT NULL,\n  `company` varchar(191) DEFAULT NULL,\n  `address` text DEFAULT NULL,\n  `balance` decimal(12,2) DEFAULT 0.00,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "users",
    "ddl": "CREATE TABLE IF NOT EXISTS `users` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `uid` varchar(191) NOT NULL,\n  `email` varchar(191) NOT NULL,\n  `name` varchar(191) NOT NULL DEFAULT 'Admin User',\n  `role` varchar(32) NOT NULL DEFAULT 'admin',\n  `phone` varchar(32) DEFAULT NULL,\n  `avatar` text DEFAULT NULL,\n  `password_hash` varchar(255) DEFAULT NULL,\n  `job_role` varchar(100) DEFAULT NULL,\n  `permissions` text DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'active',\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `password_changed_at` bigint(20) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `users_uid_unique` (`uid`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "size_guides",
    "ddl": "CREATE TABLE IF NOT EXISTS `size_guides` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(191) NOT NULL,\n  `description` text DEFAULT NULL,\n  `columns` text NOT NULL,\n  `rows` mediumtext NOT NULL,\n  `image` text DEFAULT NULL,\n  `note` text DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'active',\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "blog_posts",
    "ddl": "CREATE TABLE IF NOT EXISTS `blog_posts` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `title` varchar(255) NOT NULL,\n  `slug` varchar(191) NOT NULL,\n  `excerpt` text DEFAULT NULL,\n  `content` mediumtext DEFAULT NULL,\n  `cover_image` text DEFAULT NULL,\n  `author` varchar(191) DEFAULT NULL,\n  `category` varchar(100) DEFAULT NULL,\n  `tags` varchar(255) DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'draft',\n  `meta_title` varchar(255) DEFAULT NULL,\n  `meta_description` text DEFAULT NULL,\n  `views` int(11) NOT NULL DEFAULT 0,\n  `published_at` timestamp NULL DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_blog_slug` (`slug`),\n  KEY `idx_blog_status` (`status`,`published_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "landing_pages",
    "ddl": "CREATE TABLE IF NOT EXISTS `landing_pages` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `title` varchar(191) NOT NULL,\n  `slug` varchar(191) NOT NULL,\n  `template` varchar(32) NOT NULL DEFAULT 'fashion',\n  `status` varchar(16) NOT NULL DEFAULT 'draft',\n  `content` mediumtext DEFAULT NULL,\n  `products` text DEFAULT NULL,\n  `shipping` text DEFAULT NULL,\n  `views` int(11) NOT NULL DEFAULT 0,\n  `orders_count` int(11) NOT NULL DEFAULT 0,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_landing_slug` (`slug`),\n  KEY `idx_landing_status` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "payment_transactions",
    "ddl": "CREATE TABLE IF NOT EXISTS `payment_transactions` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `order_id` int(11) NOT NULL,\n  `order_number` varchar(64) NOT NULL,\n  `gateway` varchar(32) NOT NULL,\n  `amount` decimal(12,2) NOT NULL,\n  `currency` varchar(8) NOT NULL DEFAULT 'BDT',\n  `status` varchar(16) NOT NULL DEFAULT 'initiated',\n  `reference` varchar(100) NOT NULL,\n  `gateway_ref` varchar(191) DEFAULT NULL,\n  `gateway_txn_id` varchar(191) DEFAULT NULL,\n  `message` varchar(255) DEFAULT NULL,\n  `payload` text DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_payment_tx_reference` (`reference`),\n  KEY `idx_payment_tx_order` (`order_id`),\n  KEY `idx_payment_tx_gateway_ref` (`gateway_ref`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "media_files",
    "ddl": "CREATE TABLE IF NOT EXISTS `media_files` (\n  `file_name` varchar(191) NOT NULL,\n  `part` int(11) NOT NULL DEFAULT 0,\n  `parts` int(11) NOT NULL DEFAULT 1,\n  `mime` varchar(80) DEFAULT NULL,\n  `size` int(11) NOT NULL DEFAULT 0,\n  `data` mediumblob NOT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`file_name`,`part`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "pos_drawer_events",
    "ddl": "CREATE TABLE IF NOT EXISTS `pos_drawer_events` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `kind` varchar(16) NOT NULL,\n  `reason` varchar(191) DEFAULT NULL,\n  `order_number` varchar(64) DEFAULT NULL,\n  `amount` decimal(12,2) DEFAULT NULL,\n  `method` varchar(24) DEFAULT NULL,\n  `ok` tinyint(1) NOT NULL DEFAULT 1,\n  `cashier` varchar(100) DEFAULT NULL,\n  `user_id` int(11) DEFAULT NULL,\n  `device` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_drawer_created` (`created_at`),\n  KEY `idx_drawer_kind` (`kind`,`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "expense_categories",
    "ddl": "CREATE TABLE IF NOT EXISTS `expense_categories` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `name` varchar(100) NOT NULL,\n  `color` varchar(20) DEFAULT NULL,\n  `description` varchar(255) DEFAULT NULL,\n  `monthly_budget` decimal(12,2) DEFAULT NULL,\n  `sort_order` int(11) NOT NULL DEFAULT 0,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_expense_category_name` (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "pos_held_orders",
    "ddl": "CREATE TABLE IF NOT EXISTS `pos_held_orders` (\n  `id` varchar(64) NOT NULL,\n  `customer` varchar(191) DEFAULT NULL,\n  `items` mediumtext NOT NULL,\n  `note` text DEFAULT NULL,\n  `cashier` varchar(191) DEFAULT NULL,\n  `user_sub` varchar(64) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_held_created` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "coupon_usages",
    "ddl": "CREATE TABLE IF NOT EXISTS `coupon_usages` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `coupon_id` int(11) NOT NULL,\n  `coupon_code` varchar(64) NOT NULL,\n  `order_id` int(11) NOT NULL,\n  `order_number` varchar(64) DEFAULT NULL,\n  `customer_phone` varchar(32) DEFAULT NULL,\n  `discount` decimal(12,2) NOT NULL DEFAULT 0.00,\n  `released` tinyint(1) NOT NULL DEFAULT 0,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_coupon_usage_order` (`order_id`),\n  KEY `idx_coupon_usage_coupon` (`coupon_id`),\n  KEY `idx_coupon_usage_phone` (`customer_phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "product_image_index",
    "ddl": "CREATE TABLE IF NOT EXISTS `product_image_index` (\n  `product_id` int(11) NOT NULL,\n  `image_url` varchar(1000) NOT NULL,\n  `descriptor` text NOT NULL,\n  `version` int(11) NOT NULL DEFAULT 1,\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`product_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "live_chat_conversations",
    "ddl": "CREATE TABLE IF NOT EXISTS `live_chat_conversations` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `token` varchar(64) NOT NULL,\n  `customer_name` varchar(191) NOT NULL,\n  `customer_phone` varchar(32) DEFAULT NULL,\n  `customer_id` int(11) DEFAULT NULL,\n  `status` varchar(16) NOT NULL DEFAULT 'open',\n  `page_url` varchar(500) DEFAULT NULL,\n  `page_title` varchar(255) DEFAULT NULL,\n  `ip_address` varchar(64) DEFAULT NULL,\n  `user_agent` varchar(500) DEFAULT NULL,\n  `unread_admin` int(11) NOT NULL DEFAULT 0,\n  `unread_customer` int(11) NOT NULL DEFAULT 0,\n  `last_message` varchar(255) DEFAULT NULL,\n  `last_sender` varchar(16) DEFAULT NULL,\n  `last_message_at` timestamp NULL DEFAULT current_timestamp(),\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  `updated_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uniq_live_chat_token` (`token`),\n  KEY `idx_live_chat_status` (`status`,`last_message_at`),\n  KEY `idx_live_chat_unread` (`unread_admin`),\n  KEY `idx_live_chat_phone` (`customer_phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  },
  {
    "name": "live_chat_messages",
    "ddl": "CREATE TABLE IF NOT EXISTS `live_chat_messages` (\n  `id` int(11) NOT NULL AUTO_INCREMENT,\n  `conversation_id` int(11) NOT NULL,\n  `sender` varchar(16) NOT NULL,\n  `author` varchar(100) DEFAULT NULL,\n  `body` text NOT NULL,\n  `created_at` timestamp NULL DEFAULT current_timestamp(),\n  PRIMARY KEY (`id`),\n  KEY `idx_live_chat_msg_conv` (`conversation_id`,`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  }
];
