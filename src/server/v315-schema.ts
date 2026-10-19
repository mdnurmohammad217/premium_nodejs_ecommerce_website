/**
 * v3.15 additions to the database. Additive only: new columns and indexes are
 * added when missing; nothing existing is changed or removed. server.ts runs
 * these on start (ensureSchema); database/upgrade-v3.12.sql has the same.
 */

export const V315_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  // Per-product SEO (product form → SEO tab)
  { table: 'products', column: 'seo_title', ddl: 'VARCHAR(191) DEFAULT NULL' },
  { table: 'products', column: 'seo_description', ddl: 'VARCHAR(500) DEFAULT NULL' },
  { table: 'products', column: 'seo_image', ddl: 'TEXT DEFAULT NULL' },
  // Comma-separated tags: shown on the product page and found by the search
  { table: 'products', column: 'tags', ddl: 'VARCHAR(500) DEFAULT NULL' },
];

export const V315_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  // Newest published products (shop, home sections) without a full sort
  { table: 'products', name: 'idx_products_status_id', ddl: '(`status`,`id`)' },
  // Home sections: flash sale, best sellers, featured
  { table: 'products', name: 'idx_products_flash', ddl: '(`is_flash_sale`,`status`)' },
  { table: 'products', name: 'idx_products_best', ddl: '(`is_best_seller`,`status`)' },
  { table: 'products', name: 'idx_products_featured', ddl: '(`featured`,`status`)' },
  // Customers page sorted by spending (its default)
  { table: 'customers', name: 'idx_customers_spent', ddl: '(`total_spent`)' },
  // Stock page: the latest stock movements
  { table: 'inventory_transactions', name: 'idx_inventory_created', ddl: '(`created_at`)' },
];

export const V315_TABLES: Array<{ name: string; ddl: string }> = [];
