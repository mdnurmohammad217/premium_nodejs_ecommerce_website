/**
 * v3.9 additions to the database. Additive only, like every upgrade: new
 * tables are CREATE TABLE IF NOT EXISTS and new columns are only ever ADDed,
 * so a live store keeps every product, order, customer and POS record as it
 * is. server.ts runs these automatically on start (see ensureSchema).
 */

export const V39_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  // Orders: money the customer paid in advance (the rest is collected on delivery)
  { table: 'orders', column: 'advance_paid', ddl: 'DECIMAL(12,2) NOT NULL DEFAULT 0' },
  // Orders: the staff member who handles the order
  { table: 'orders', column: 'assigned_to', ddl: 'INT(11) DEFAULT NULL' },
  { table: 'orders', column: 'assigned_name', ddl: 'VARCHAR(191) DEFAULT NULL' },
  { table: 'orders', column: 'assigned_at', ddl: 'TIMESTAMP NULL DEFAULT NULL' },
  // Orders: 1 = the order's stock has been put back (cancelled / returned / refunded)
  { table: 'orders', column: 'stock_released', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
  // Orders: district (zila) and thana/upazila picked at checkout
  { table: 'orders', column: 'district', ddl: 'VARCHAR(64) DEFAULT NULL' },
  { table: 'orders', column: 'thana', ddl: 'VARCHAR(100) DEFAULT NULL' },
  // Orders: who typed in a manual (dashboard) order
  { table: 'orders', column: 'created_by', ddl: 'VARCHAR(191) DEFAULT NULL' },
  // Products: how each option group is shown on the product page, e.g. {"Color":"image","Size":"text"}
  { table: 'products', column: 'option_display', ddl: 'TEXT DEFAULT NULL' },
  // Products: the icon + text highlights under the description, and the "How to use" tab
  { table: 'products', column: 'highlights', ddl: 'TEXT DEFAULT NULL' },
  { table: 'products', column: 'how_to_use', ddl: 'TEXT DEFAULT NULL' },
  // Incomplete checkouts keep the district / thana too
  { table: 'abandoned_checkouts', column: 'district', ddl: 'VARCHAR(64) DEFAULT NULL' },
  { table: 'abandoned_checkouts', column: 'thana', ddl: 'VARCHAR(100) DEFAULT NULL' },
];

export const V39_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  { table: 'orders', name: 'idx_orders_assigned', ddl: '(`assigned_to`)' },
  { table: 'expenses', name: 'idx_expenses_category', ddl: '(`category`)' },
];

export const V39_TABLES: Array<{ name: string; ddl: string }> = [
  {
    // Dashboard → Expenses → Categories
    name: 'expense_categories',
    ddl: `CREATE TABLE IF NOT EXISTS \`expense_categories\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`name\` varchar(100) NOT NULL,
      \`color\` varchar(20) DEFAULT NULL,
      \`description\` varchar(255) DEFAULT NULL,
      \`monthly_budget\` decimal(12,2) DEFAULT NULL,
      \`sort_order\` int(11) NOT NULL DEFAULT 0,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_expense_category_name\` (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // POS "Hold Sale": kept in the database so a restart never loses a held bill
    name: 'pos_held_orders',
    ddl: `CREATE TABLE IF NOT EXISTS \`pos_held_orders\` (
      \`id\` varchar(64) NOT NULL,
      \`customer\` varchar(191) DEFAULT NULL,
      \`items\` mediumtext NOT NULL,
      \`note\` text DEFAULT NULL,
      \`cashier\` varchar(191) DEFAULT NULL,
      \`user_sub\` varchar(64) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_held_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
