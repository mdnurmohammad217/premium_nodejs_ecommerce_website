/**
 * v3.6 additions to the database. Everything here is additive: new tables
 * are CREATE TABLE IF NOT EXISTS and new columns are only ever ADDed, so a
 * live store keeps every product, order, customer and POS record untouched.
 * server.ts runs these automatically on start (see ensureSchema).
 */

export const V36_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'products', column: 'size_guide_id', ddl: 'INT(11) DEFAULT NULL' },
  { table: 'products', column: 'free_shipping', ddl: 'TINYINT(1) DEFAULT 0' },
  { table: 'products', column: 'shipping_charges', ddl: 'TEXT DEFAULT NULL' },
  { table: 'reviews', column: 'reply', ddl: 'TEXT DEFAULT NULL' },
  { table: 'reviews', column: 'ip_address', ddl: 'VARCHAR(64) DEFAULT NULL' },
  { table: 'orders', column: 'landing_page_id', ddl: 'INT(11) DEFAULT NULL' },
  { table: 'orders', column: 'landing_page_name', ddl: 'VARCHAR(191) DEFAULT NULL' },
];

export const V36_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  { table: 'orders', name: 'idx_orders_landing', ddl: '(`landing_page_id`)' },
  { table: 'reviews', name: 'idx_reviews_status', ddl: '(`status`,`created_at`)' },
];

export const V36_TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: 'size_guides',
    ddl: `CREATE TABLE IF NOT EXISTS \`size_guides\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`name\` varchar(191) NOT NULL,
      \`description\` text DEFAULT NULL,
      \`columns\` text NOT NULL,
      \`rows\` mediumtext NOT NULL,
      \`image\` text DEFAULT NULL,
      \`note\` text DEFAULT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'active',
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'blog_posts',
    ddl: `CREATE TABLE IF NOT EXISTS \`blog_posts\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`title\` varchar(255) NOT NULL,
      \`slug\` varchar(191) NOT NULL,
      \`excerpt\` text DEFAULT NULL,
      \`content\` mediumtext DEFAULT NULL,
      \`cover_image\` text DEFAULT NULL,
      \`author\` varchar(191) DEFAULT NULL,
      \`category\` varchar(100) DEFAULT NULL,
      \`tags\` varchar(255) DEFAULT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'draft',
      \`meta_title\` varchar(255) DEFAULT NULL,
      \`meta_description\` text DEFAULT NULL,
      \`views\` int(11) NOT NULL DEFAULT 0,
      \`published_at\` timestamp NULL DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_blog_slug\` (\`slug\`),
      KEY \`idx_blog_status\` (\`status\`,\`published_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'landing_pages',
    ddl: `CREATE TABLE IF NOT EXISTS \`landing_pages\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`title\` varchar(191) NOT NULL,
      \`slug\` varchar(191) NOT NULL,
      \`template\` varchar(32) NOT NULL DEFAULT 'fashion',
      \`status\` varchar(16) NOT NULL DEFAULT 'draft',
      \`content\` mediumtext DEFAULT NULL,
      \`products\` text DEFAULT NULL,
      \`shipping\` text DEFAULT NULL,
      \`views\` int(11) NOT NULL DEFAULT 0,
      \`orders_count\` int(11) NOT NULL DEFAULT 0,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_landing_slug\` (\`slug\`),
      KEY \`idx_landing_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'payment_transactions',
    ddl: `CREATE TABLE IF NOT EXISTS \`payment_transactions\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`order_id\` int(11) NOT NULL,
      \`order_number\` varchar(64) NOT NULL,
      \`gateway\` varchar(32) NOT NULL,
      \`amount\` decimal(12,2) NOT NULL,
      \`currency\` varchar(8) NOT NULL DEFAULT 'BDT',
      \`status\` varchar(16) NOT NULL DEFAULT 'initiated',
      \`reference\` varchar(100) NOT NULL,
      \`gateway_ref\` varchar(191) DEFAULT NULL,
      \`gateway_txn_id\` varchar(191) DEFAULT NULL,
      \`message\` varchar(255) DEFAULT NULL,
      \`payload\` text DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_payment_tx_reference\` (\`reference\`),
      KEY \`idx_payment_tx_order\` (\`order_id\`),
      KEY \`idx_payment_tx_gateway_ref\` (\`gateway_ref\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
