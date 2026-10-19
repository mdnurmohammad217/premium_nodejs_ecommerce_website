/**
 * Every column, index and table added since the v3.1 schema
 * (database/database.sql of that time). server.ts adds whatever is missing on
 * start (ensureSchema); scripts/make-upgrade-sql.ts writes the same list to
 * database/upgrade-v3.12.sql for hosts where the app may not ALTER tables.
 */
import { LICENSE_TABLES } from './license.ts';
import { V36_TABLES, V36_COLUMNS, V36_INDEXES } from './v36-schema.ts';
import { V37_TABLES, V37_COLUMNS, V37_INDEXES } from './v37-schema.ts';
import { V39_TABLES, V39_COLUMNS, V39_INDEXES } from './v39-schema.ts';
import { V311_TABLES, V311_COLUMNS, V311_INDEXES } from './v311-schema.ts';
import { V312_TABLES, V312_COLUMNS, V312_INDEXES } from './v312-schema.ts';
import { V314_TABLES, V314_COLUMNS, V314_INDEXES } from './v314-schema.ts';
import { V315_TABLES, V315_COLUMNS, V315_INDEXES } from './v315-schema.ts';

export const SCHEMA_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'products', column: 'wholesale_enabled', ddl: 'TINYINT(1) DEFAULT 0' },
  { table: 'products', column: 'wholesale_price', ddl: 'DECIMAL(12,2) DEFAULT NULL' },
  { table: 'products', column: 'wholesale_min_qty', ddl: 'INT(11) DEFAULT NULL' },
  { table: 'products', column: 'wholesale_max_qty', ddl: 'INT(11) DEFAULT NULL' },
  { table: 'customers', column: 'customer_type', ddl: "VARCHAR(16) NOT NULL DEFAULT 'regular'" },
  { table: 'customers', column: 'wholesale_status', ddl: 'VARCHAR(16) DEFAULT NULL' },
  { table: 'customers', column: 'business_name', ddl: 'VARCHAR(191) DEFAULT NULL' },
  { table: 'customers', column: 'business_address', ddl: 'TEXT DEFAULT NULL' },
  { table: 'customers', column: 'business_type', ddl: 'VARCHAR(100) DEFAULT NULL' },
  { table: 'customers', column: 'wholesale_applied_at', ddl: 'TIMESTAMP NULL DEFAULT NULL' },
  { table: 'customers', column: 'wholesale_reviewed_at', ddl: 'TIMESTAMP NULL DEFAULT NULL' },
  { table: 'customers', column: 'wholesale_note', ddl: 'TEXT DEFAULT NULL' },
  { table: 'orders', column: 'tracking_code', ddl: 'VARCHAR(128) DEFAULT NULL' },
  { table: 'orders', column: 'is_wholesale', ddl: 'TINYINT(1) DEFAULT 0' },
  // v3.4 — sessions issued before a password reset are refused (epoch ms)
  { table: 'customers', column: 'password_changed_at', ddl: 'BIGINT DEFAULT NULL' },
  { table: 'users', column: 'password_changed_at', ddl: 'BIGINT DEFAULT NULL' },
  // v3.6 — size guides, per-product delivery, review replies, landing-page orders
  ...V36_COLUMNS,
  // v3.7 — variation barcodes (POS) and variation wholesale prices
  ...V37_COLUMNS,
  // v3.9 — advance payment, staff assignment, district/thana, option display
  ...V39_COLUMNS,
  // v3.11 — (no new columns; see v311-schema.ts)
  ...V311_COLUMNS,
  // v3.12 — Google / Facebook sign-in ids on customer accounts
  ...V312_COLUMNS,
  // v3.14 — (no new columns; live chat tables below)
  ...V314_COLUMNS,
  // v3.15 — product SEO fields and tags
  ...V315_COLUMNS,
];

export const SCHEMA_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  { table: 'customers', name: 'idx_customers_wholesale', ddl: '(`customer_type`,`wholesale_status`)' },
  { table: 'orders', name: 'idx_orders_wholesale', ddl: '(`is_wholesale`)' },
  ...V36_INDEXES,
  ...V37_INDEXES,
  ...V39_INDEXES,
  ...V311_INDEXES,
  ...V312_INDEXES,
  ...V314_INDEXES,
  ...V315_INDEXES,
];

export const SCHEMA_TABLES: Array<{ name: string; ddl: string }> = [
  // v3.5 — License Server v2 client state and its audit log
  ...LICENSE_TABLES,
  // v3.6 — size guides, blog, landing pages, online payments
  ...V36_TABLES,
  // v3.7 — database copy of uploaded images, POS cash drawer log
  ...V37_TABLES,
  // v3.9 — expense categories, held POS bills
  ...V39_TABLES,
  // v3.11 — coupon usage per order, product photo search index
  ...V311_TABLES,
  ...V312_TABLES,
  // v3.14 — live chat
  ...V314_TABLES,
  ...V315_TABLES,
  {
    name: 'admin_notifications',
    ddl: `CREATE TABLE IF NOT EXISTS \`admin_notifications\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`type\` varchar(50) NOT NULL,
      \`title\` varchar(255) NOT NULL,
      \`body\` text DEFAULT NULL,
      \`link_tab\` varchar(64) DEFAULT NULL,
      \`is_read\` tinyint(1) NOT NULL DEFAULT 0,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_admin_notifications_read\` (\`is_read\`,\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'order_counters',
    ddl: `CREATE TABLE IF NOT EXISTS \`order_counters\` (
      \`name\` varchar(32) NOT NULL,
      \`value\` int(11) NOT NULL DEFAULT 1000,
      PRIMARY KEY (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'sms_logs',
    ddl: `CREATE TABLE IF NOT EXISTS \`sms_logs\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`phone\` varchar(32) NOT NULL,
      \`message\` text NOT NULL,
      \`event\` varchar(40) DEFAULT NULL,
      \`order_id\` int(11) DEFAULT NULL,
      \`provider\` varchar(32) DEFAULT NULL,
      \`status\` varchar(16) NOT NULL,
      \`response\` text DEFAULT NULL,
      \`segments\` int(11) NOT NULL DEFAULT 1,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_sms_order\` (\`order_id\`),
      KEY \`idx_sms_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'fraud_checks',
    ddl: `CREATE TABLE IF NOT EXISTS \`fraud_checks\` (
      \`phone\` varchar(20) NOT NULL,
      \`data\` mediumtext NOT NULL,
      \`total\` int(11) NOT NULL DEFAULT 0,
      \`success\` int(11) NOT NULL DEFAULT 0,
      \`cancelled\` int(11) NOT NULL DEFAULT 0,
      \`ratio\` decimal(5,1) NOT NULL DEFAULT 0,
      \`checked_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'order_returns',
    ddl: `CREATE TABLE IF NOT EXISTS \`order_returns\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`return_number\` varchar(32) NOT NULL,
      \`order_id\` int(11) NOT NULL,
      \`order_number\` varchar(64) NOT NULL,
      \`customer_name\` varchar(191) DEFAULT NULL,
      \`customer_phone\` varchar(32) DEFAULT NULL,
      \`items\` mediumtext NOT NULL,
      \`items_amount\` decimal(12,2) NOT NULL DEFAULT 0,
      \`refund_amount\` decimal(12,2) NOT NULL DEFAULT 0,
      \`refund_method\` varchar(20) DEFAULT NULL,
      \`reason\` varchar(191) DEFAULT NULL,
      \`note\` text DEFAULT NULL,
      \`restocked\` tinyint(1) NOT NULL DEFAULT 1,
      \`status\` varchar(16) NOT NULL DEFAULT 'received',
      \`created_by\` varchar(100) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`refunded_at\` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_return_number\` (\`return_number\`),
      KEY \`idx_returns_order\` (\`order_id\`),
      KEY \`idx_returns_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'contact_messages',
    ddl: `CREATE TABLE IF NOT EXISTS \`contact_messages\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`name\` varchar(191) NOT NULL,
      \`phone\` varchar(32) NOT NULL,
      \`email\` varchar(191) DEFAULT NULL,
      \`address\` text DEFAULT NULL,
      \`message\` text DEFAULT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'new',
      \`admin_note\` text DEFAULT NULL,
      \`ip_address\` varchar(64) DEFAULT NULL,
      \`user_agent\` varchar(500) DEFAULT NULL,
      \`page_url\` varchar(500) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_contact_status\` (\`status\`,\`created_at\`),
      KEY \`idx_contact_phone\` (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'password_reset_requests',
    ddl: `CREATE TABLE IF NOT EXISTS \`password_reset_requests\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`account_type\` varchar(16) NOT NULL,
      \`account_id\` int(11) DEFAULT NULL,
      \`account_name\` varchar(191) DEFAULT NULL,
      \`identifier\` varchar(191) NOT NULL,
      \`channel\` varchar(16) NOT NULL,
      \`destination\` varchar(191) DEFAULT NULL,
      \`code_hash\` char(64) DEFAULT NULL,
      \`token_hash\` char(64) DEFAULT NULL,
      \`attempts\` int(11) NOT NULL DEFAULT 0,
      \`status\` varchar(16) NOT NULL,
      \`error\` varchar(255) DEFAULT NULL,
      \`ip_address\` varchar(64) DEFAULT NULL,
      \`user_agent\` varchar(255) DEFAULT NULL,
      \`expires_at\` datetime NOT NULL,
      \`verified_at\` datetime DEFAULT NULL,
      \`used_at\` datetime DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_reset_identifier\` (\`identifier\`,\`created_at\`),
      KEY \`idx_reset_token\` (\`token_hash\`),
      KEY \`idx_reset_ip\` (\`ip_address\`,\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
