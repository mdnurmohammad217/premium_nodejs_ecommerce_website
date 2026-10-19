/**
 * v3.11 additions to the database. Additive only, like every upgrade: new
 * tables are CREATE TABLE IF NOT EXISTS and nothing existing is changed, so a
 * live store keeps every product, order, customer and POS record as it is.
 * server.ts runs these automatically on start (see ensureSchema).
 */

export const V311_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];

export const V311_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  // Courier report groups orders by courier and date
  { table: 'orders', name: 'idx_orders_courier', ddl: '(`courier_service`,`created_at`)' },
];

export const V311_TABLES: Array<{ name: string; ddl: string }> = [
  {
    // Which order used which coupon. coupons.used_count is the running total;
    // a cancelled / deleted order gives its use back (released = 1).
    name: 'coupon_usages',
    ddl: `CREATE TABLE IF NOT EXISTS \`coupon_usages\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`coupon_id\` int(11) NOT NULL,
      \`coupon_code\` varchar(64) NOT NULL,
      \`order_id\` int(11) NOT NULL,
      \`order_number\` varchar(64) DEFAULT NULL,
      \`customer_phone\` varchar(32) DEFAULT NULL,
      \`discount\` decimal(12,2) NOT NULL DEFAULT 0.00,
      \`released\` tinyint(1) NOT NULL DEFAULT 0,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_coupon_usage_order\` (\`order_id\`),
      KEY \`idx_coupon_usage_coupon\` (\`coupon_id\`),
      KEY \`idx_coupon_usage_phone\` (\`customer_phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // Search by photo: a small numeric fingerprint of each PRODUCT image
    // (colours, layout, shape), made in the admin's browser. Shoppers' photos
    // are never uploaded or stored — only their fingerprint is sent, compared
    // in memory and thrown away.
    name: 'product_image_index',
    ddl: `CREATE TABLE IF NOT EXISTS \`product_image_index\` (
      \`product_id\` int(11) NOT NULL,
      \`image_url\` varchar(1000) NOT NULL,
      \`descriptor\` text NOT NULL,
      \`version\` int(11) NOT NULL DEFAULT 1,
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`product_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
