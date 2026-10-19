/**
 * v3.11 — the tables the server reads and writes with plain SQL.
 *
 * They were missing from schema.ts, so `drizzle-kit push` / `generate` saw
 * them as "not in the schema" and offered to DROP them (order numbers, SMS
 * log, returns, license state, uploaded-image backup …). They are declared
 * here exactly as ensureSchema() creates them, and drizzle.config.ts reads
 * both files, so the tooling and the live database agree.
 *
 * The app itself does not import this file: these tables keep being used
 * through SQL, as before. Keep each definition in step with its CREATE TABLE
 * in src/server (schema-upgrades.ts, v3x-schema.ts, license.ts).
 */
import {
  mysqlTable,
  int,
  varchar,
  text,
  mediumtext,
  decimal,
  boolean,
  timestamp,
  datetime,
  bigint,
  tinyint,
  char,
  index,
  uniqueIndex,
  primaryKey,
  customType,
} from 'drizzle-orm/mysql-core';

const mediumblob = customType<{ data: Buffer }>({
  dataType() {
    return 'mediumblob';
  },
});

/** Order number counters (ORD-…, POS-…, returns) */
export const orderCounters = mysqlTable('order_counters', {
  name: varchar('name', { length: 32 }).primaryKey(),
  value: int('value').notNull().default(1000),
});

/** Every SMS the shop sent (or tried to) */
export const smsLogs = mysqlTable(
  'sms_logs',
  {
    id: int('id').autoincrement().primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    message: text('message').notNull(),
    event: varchar('event', { length: 40 }),
    orderId: int('order_id'),
    provider: varchar('provider', { length: 32 }),
    status: varchar('status', { length: 16 }).notNull(),
    response: text('response'),
    segments: int('segments').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    orderIdx: index('idx_sms_order').on(table.orderId),
    createdIdx: index('idx_sms_created').on(table.createdAt),
  })
);

/** Courier delivery history per phone number (fraud check cache) */
export const fraudChecks = mysqlTable('fraud_checks', {
  phone: varchar('phone', { length: 20 }).primaryKey(),
  data: mediumtext('data').notNull(),
  total: int('total').notNull().default(0),
  success: int('success').notNull().default(0),
  cancelled: int('cancelled').notNull().default(0),
  ratio: decimal('ratio', { precision: 5, scale: 1 }).notNull().default('0.0'),
  checkedAt: timestamp('checked_at').defaultNow(),
});

/** Contact page messages */
export const contactMessages = mysqlTable(
  'contact_messages',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 191 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    email: varchar('email', { length: 191 }),
    address: text('address'),
    message: text('message'),
    status: varchar('status', { length: 16 }).notNull().default('new'),
    adminNote: text('admin_note'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    pageUrl: varchar('page_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_contact_status').on(table.status, table.createdAt),
    phoneIdx: index('idx_contact_phone').on(table.phone),
  })
);

/** Sales → Returns */
export const orderReturns = mysqlTable(
  'order_returns',
  {
    id: int('id').autoincrement().primaryKey(),
    returnNumber: varchar('return_number', { length: 32 }).notNull(),
    orderId: int('order_id').notNull(),
    orderNumber: varchar('order_number', { length: 64 }).notNull(),
    customerName: varchar('customer_name', { length: 191 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    items: mediumtext('items').notNull(),
    itemsAmount: decimal('items_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    refundAmount: decimal('refund_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    refundMethod: varchar('refund_method', { length: 20 }),
    reason: varchar('reason', { length: 191 }),
    note: text('note'),
    restocked: boolean('restocked').notNull().default(true),
    status: varchar('status', { length: 16 }).notNull().default('received'),
    createdBy: varchar('created_by', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
    refundedAt: timestamp('refunded_at'),
  },
  (table) => ({
    numberIdx: uniqueIndex('uniq_return_number').on(table.returnNumber),
    orderIdx: index('idx_returns_order').on(table.orderId),
    createdIdx: index('idx_returns_created').on(table.createdAt),
  })
);

/** License Server v2 client state (one row) */
export const licenseState = mysqlTable('license_state', {
  id: tinyint('id').primaryKey(),
  installationId: char('installation_id', { length: 64 }).notNull(),
  licenseKeyEnc: text('license_key_enc'),
  licenseKeyMask: varchar('license_key_mask', { length: 64 }),
  token: text('token'),
  tokenJti: varchar('token_jti', { length: 128 }),
  domain: varchar('domain', { length: 191 }),
  productSlug: varchar('product_slug', { length: 100 }),
  productName: varchar('product_name', { length: 191 }),
  publicKey: varchar('public_key', { length: 600 }),
  keyId: varchar('key_id', { length: 64 }),
  everActivated: boolean('ever_activated').notNull().default(false),
  requiresActivation: boolean('requires_activation').notNull().default(false),
  activatedAt: bigint('activated_at', { mode: 'number' }),
  lastSyncAt: bigint('last_sync_at', { mode: 'number' }),
  lastAttemptAt: bigint('last_attempt_at', { mode: 'number' }),
  nextCheckAt: bigint('next_check_at', { mode: 'number' }),
  lastResult: varchar('last_result', { length: 255 }),
  lastError: varchar('last_error', { length: 255 }),
  serverReachable: boolean('server_reachable'),
  consecutiveFailures: int('consecutive_failures').notNull().default(0),
  backoffUntil: bigint('backoff_until', { mode: 'number' }),
  updatedAt: bigint('updated_at', { mode: 'number' }),
});

/** License audit log */
export const licenseEvents = mysqlTable(
  'license_events',
  {
    id: int('id').autoincrement().primaryKey(),
    event: varchar('event', { length: 40 }).notNull(),
    level: varchar('level', { length: 10 }).notNull().default('info'),
    message: varchar('message', { length: 500 }),
    httpStatus: int('http_status'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    createdIdx: index('idx_license_events_created').on(table.createdAt),
  })
);

/** Forgot-password requests (OTP by SMS / link by email) */
export const passwordResetRequests = mysqlTable(
  'password_reset_requests',
  {
    id: int('id').autoincrement().primaryKey(),
    accountType: varchar('account_type', { length: 16 }).notNull(),
    accountId: int('account_id'),
    accountName: varchar('account_name', { length: 191 }),
    identifier: varchar('identifier', { length: 191 }).notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    destination: varchar('destination', { length: 191 }),
    codeHash: char('code_hash', { length: 64 }),
    tokenHash: char('token_hash', { length: 64 }),
    attempts: int('attempts').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull(),
    error: varchar('error', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    expiresAt: datetime('expires_at').notNull(),
    verifiedAt: datetime('verified_at'),
    usedAt: datetime('used_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    identifierIdx: index('idx_reset_identifier').on(table.identifier, table.createdAt),
    tokenIdx: index('idx_reset_token').on(table.tokenHash),
    ipIdx: index('idx_reset_ip').on(table.ipAddress, table.createdAt),
  })
);

/** Database copy of uploaded images (restores a lost uploads folder) */
export const mediaFiles = mysqlTable(
  'media_files',
  {
    fileName: varchar('file_name', { length: 191 }).notNull(),
    part: int('part').notNull().default(0),
    parts: int('parts').notNull().default(1),
    mime: varchar('mime', { length: 80 }),
    size: int('size').notNull().default(0),
    data: mediumblob('data').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fileName, table.part] }),
  })
);

/** POS cash drawer openings */
export const posDrawerEvents = mysqlTable(
  'pos_drawer_events',
  {
    id: int('id').autoincrement().primaryKey(),
    kind: varchar('kind', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 191 }),
    orderNumber: varchar('order_number', { length: 64 }),
    amount: decimal('amount', { precision: 12, scale: 2 }),
    method: varchar('method', { length: 24 }),
    ok: boolean('ok').notNull().default(true),
    cashier: varchar('cashier', { length: 100 }),
    userId: int('user_id'),
    device: varchar('device', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    createdIdx: index('idx_drawer_created').on(table.createdAt),
    kindIdx: index('idx_drawer_kind').on(table.kind, table.createdAt),
  })
);

/** Expenses → Categories */
export const expenseCategories = mysqlTable(
  'expense_categories',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 20 }),
    description: varchar('description', { length: 255 }),
    monthlyBudget: decimal('monthly_budget', { precision: 12, scale: 2 }),
    sortOrder: int('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex('uq_expense_category_name').on(table.name),
  })
);

/** POS "Hold sale" bills */
export const posHeldOrders = mysqlTable(
  'pos_held_orders',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    customer: varchar('customer', { length: 191 }),
    items: mediumtext('items').notNull(),
    note: text('note'),
    cashier: varchar('cashier', { length: 191 }),
    userSub: varchar('user_sub', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    createdIdx: index('idx_held_created').on(table.createdAt),
  })
);

/** v3.11 — which order used which coupon */
export const couponUsages = mysqlTable(
  'coupon_usages',
  {
    id: int('id').autoincrement().primaryKey(),
    couponId: int('coupon_id').notNull(),
    couponCode: varchar('coupon_code', { length: 64 }).notNull(),
    orderId: int('order_id').notNull(),
    orderNumber: varchar('order_number', { length: 64 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    discount: decimal('discount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    released: boolean('released').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    orderIdx: uniqueIndex('uq_coupon_usage_order').on(table.orderId),
    couponIdx: index('idx_coupon_usage_coupon').on(table.couponId),
    phoneIdx: index('idx_coupon_usage_phone').on(table.customerPhone),
  })
);

/** v3.11 — search by photo: fingerprints of product images */
export const productImageIndex = mysqlTable('product_image_index', {
  productId: int('product_id').primaryKey(),
  imageUrl: varchar('image_url', { length: 1000 }).notNull(),
  descriptor: text('descriptor').notNull(),
  version: int('version').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow(),
});
