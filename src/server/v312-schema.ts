/**
 * v3.12 additions to the database. Additive only: new columns are added when
 * missing and nothing existing is changed, so a live store keeps every
 * product, order, customer and POS record. server.ts runs these on start
 * (see ensureSchema); database/upgrade-v3.12.sql has the same for hosts
 * where the app may not ALTER tables.
 */

export const V312_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  // "Continue with Google / Facebook": the account id at that provider
  { table: 'customers', column: 'google_id', ddl: 'VARCHAR(64) DEFAULT NULL' },
  { table: 'customers', column: 'facebook_id', ddl: 'VARCHAR(64) DEFAULT NULL' },
];

export const V312_INDEXES: Array<{ table: string; name: string; ddl: string }> = [
  { table: 'customers', name: 'idx_customers_google', ddl: '(`google_id`)' },
  { table: 'customers', name: 'idx_customers_facebook', ddl: '(`facebook_id`)' },
  { table: 'customers', name: 'idx_customers_email', ddl: '(`email`)' },
  { table: 'products', name: 'idx_products_new_arrival', ddl: '(`is_new_arrival`,`status`)' },
];

export const V312_TABLES: Array<{ name: string; ddl: string }> = [];
