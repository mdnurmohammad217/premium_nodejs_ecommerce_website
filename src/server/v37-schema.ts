/**
 * v3.7 additions to the database. Additive only, like every upgrade: new
 * tables are CREATE TABLE IF NOT EXISTS and new columns are only ever ADDed,
 * so a live store keeps every product, order, customer and POS record as it
 * is. server.ts runs these automatically on start (see ensureSchema).
 */

export const V37_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  // POS: every variation can carry its own printed barcode
  { table: 'product_variations', column: 'barcode', ddl: 'VARCHAR(64) DEFAULT NULL' },
  // Wholesale: every variation can carry its own wholesale price
  { table: 'product_variations', column: 'wholesale_price', ddl: 'DECIMAL(12,2) DEFAULT NULL' },
];

export const V37_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  { table: 'product_variations', name: 'idx_variation_barcode', ddl: '(`barcode`)' },
];

export const V37_TABLES: Array<{ name: string; ddl: string }> = [
  {
    // A copy of every uploaded image, kept in the database. The files on disk
    // are what visitors are served; when a host wipes or replaces the folder
    // (a redeploy, a new version, a moved app) the image is written back from
    // here on its first request, so an uploaded logo or photo never goes
    // missing. Large files are split into parts so no single row comes near
    // MySQL's packet limit on shared hosting.
    name: 'media_files',
    ddl: `CREATE TABLE IF NOT EXISTS \`media_files\` (
      \`file_name\` varchar(191) NOT NULL,
      \`part\` int(11) NOT NULL DEFAULT 0,
      \`parts\` int(11) NOT NULL DEFAULT 1,
      \`mime\` varchar(80) DEFAULT NULL,
      \`size\` int(11) NOT NULL DEFAULT 0,
      \`data\` mediumblob NOT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`file_name\`,\`part\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // Every time the POS opens the cash drawer: after a cash sale, from the
    // "Open drawer" button (with a reason) or from the test button.
    name: 'pos_drawer_events',
    ddl: `CREATE TABLE IF NOT EXISTS \`pos_drawer_events\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`kind\` varchar(16) NOT NULL,
      \`reason\` varchar(191) DEFAULT NULL,
      \`order_number\` varchar(64) DEFAULT NULL,
      \`amount\` decimal(12,2) DEFAULT NULL,
      \`method\` varchar(24) DEFAULT NULL,
      \`ok\` tinyint(1) NOT NULL DEFAULT 1,
      \`cashier\` varchar(100) DEFAULT NULL,
      \`user_id\` int(11) DEFAULT NULL,
      \`device\` varchar(100) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_drawer_created\` (\`created_at\`),
      KEY \`idx_drawer_kind\` (\`kind\`,\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
