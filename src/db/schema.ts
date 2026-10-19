import {
  mysqlTable,
  int,
  varchar,
  text,
  mediumtext,
  decimal,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

/**
 * MySQL / MariaDB schema (Hostinger compatible).
 *
 * Column-type notes for anyone editing this file:
 * - MySQL cannot put a UNIQUE or regular index on a TEXT column, so every column
 *   that is unique, filtered, sorted or joined on is varchar(...). Free-form long
 *   content (descriptions, JSON blobs, notes) stays TEXT.
 * - `numeric` (Postgres) is `decimal` here; both return strings in JS, so all
 *   existing API responses keep the exact same shape ("1250.00").
 * - `serial` is avoided on purpose: MySQL serial is BIGINT UNSIGNED, which cannot
 *   be referenced by an INT foreign key. int().autoincrement() keeps FKs valid.
 */

// Users
export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  uid: varchar('uid', { length: 191 }).notNull().unique(), // Auth UID or system identifier
  email: varchar('email', { length: 191 }).notNull(),
  name: varchar('name', { length: 191 }).notNull().default('Admin User'),
  role: varchar('role', { length: 32 }).notNull().default('admin'), // 'super_admin', 'admin', 'manager', 'cashier', 'customer'
  phone: varchar('phone', { length: 32 }),
  avatar: text('avatar'),
  /** Salted PBKDF2 hash (pbkdf2$iterations$salt$derived). NULL = cannot log in. */
  passwordHash: varchar('password_hash', { length: 255 }),
  /** Free-text job title shown in the dashboard ("Cashier", "Stock Manager", ...) */
  jobRole: varchar('job_role', { length: 100 }),
  /** JSON string array of module permissions, e.g. ["orders","products"] */
  permissions: text('permissions'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Categories
export const categories = mysqlTable(
  'categories',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 191 }).notNull(),
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    description: text('description'),
    image: text('image'),
    icon: varchar('icon', { length: 64 }),
    featured: boolean('featured').default(false),
    /** Render a product section for this category on the home page */
    showOnHome: boolean('show_on_home').default(false),
    /**
     * Self-reference giving three usable levels: category -> subcategory ->
     * sub-subcategory. NULL parent = a top-level category.
     * `level` is denormalised so listings and filters don't have to walk the tree.
     */
    parentId: int('parent_id'),
    level: int('level').default(1),
    sortOrder: int('sort_order').default(0),
  },
  (table) => ({
    parentIdx: index('idx_categories_parent').on(table.parentId),
    levelIdx: index('idx_categories_level').on(table.level),
  })
);

// Brands
export const brands = mysqlTable('brands', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  logo: text('logo'),
  description: text('description'),
});

// Products
export const products = mysqlTable(
  'products',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    genericName: varchar('generic_name', { length: 255 }), // Paracetamol, Omeprazole, ...
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    sku: varchar('sku', { length: 100 }).notNull().unique(),
    barcode: varchar('barcode', { length: 100 }),
    categoryId: int('category_id').references(() => categories.id),
    brandId: int('brand_id').references(() => brands.id),
    description: text('description'),
    shortDescription: text('short_description'),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    salePrice: decimal('sale_price', { precision: 12, scale: 2 }),
    costPrice: decimal('cost_price', { precision: 12, scale: 2 }).default('0'),
    stock: int('stock').notNull().default(0),
    lowStockThreshold: int('low_stock_threshold').default(10),
    unit: varchar('unit', { length: 50 }).default('Strip'), // Strip, Box, Bottle, Pcs, Tablet
    dosage: varchar('dosage', { length: 50 }), // 500mg, 20mg, 100ml
    requiresPrescription: boolean('requires_prescription').default(false),
    batchNumber: varchar('batch_number', { length: 100 }),
    expiryDate: varchar('expiry_date', { length: 20 }), // 'YYYY-MM-DD'
    featured: boolean('featured').default(false),
    isFlashSale: boolean('is_flash_sale').default(false),
    isBestSeller: boolean('is_best_seller').default(false),
    isNewArrival: boolean('is_new_arrival').default(false),
    rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
    reviewCount: int('review_count').default(0),
    image: text('image'),
    images: text('images'), // JSON string array
    /** When true, stock/price come from product_variations rather than this row */
    hasVariations: boolean('has_variations').default(false),
    /** Optional YouTube/mp4 URL shown as the last gallery thumbnail */
    videoUrl: text('video_url'),
    /**
     * Wholesale. Only an APPROVED wholesale customer is ever charged
     * wholesalePrice, and that decision is made on the server for every
     * request — the browser never chooses the price.
     */
    wholesaleEnabled: boolean('wholesale_enabled').default(false),
    wholesalePrice: decimal('wholesale_price', { precision: 12, scale: 2 }),
    wholesaleMinQty: int('wholesale_min_qty'),
    wholesaleMaxQty: int('wholesale_max_qty'),
    /** v3.6 — size chart shown on the product page (Dashboard → Products → Size Guides) */
    sizeGuideId: int('size_guide_id'),
    /** v3.6 — this product always ships free */
    freeShipping: boolean('free_shipping').default(false),
    /** v3.6 — own delivery charge per shipping zone, JSON {"inside-dhaka": 80}; blank zones use the zone charge */
    shippingCharges: text('shipping_charges'),
    /** v3.9 — how each option group shows on the product page, JSON {"Color":"image","Size":"text"} */
    optionDisplay: text('option_display'),
    /** v3.9 — up to six highlights shown beside the description, JSON [{"icon":"Gem","text":"Premium fabric"}] */
    highlights: text('highlights'),
    /** v3.9 — the "How to use" tab on the product page */
    howToUse: text('how_to_use'),
    // v3.15 — product SEO (meta title / description / share picture) and tags
    seoTitle: varchar('seo_title', { length: 191 }),
    seoDescription: varchar('seo_description', { length: 500 }),
    seoImage: text('seo_image'),
    tags: varchar('tags', { length: 500 }),
    status: varchar('status', { length: 32 }).default('active'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_products_status').on(table.status),
    categoryIdx: index('idx_products_category').on(table.categoryId),
    brandIdx: index('idx_products_brand').on(table.brandId),
    barcodeIdx: index('idx_products_barcode').on(table.barcode),
    nameIdx: index('idx_products_name').on(table.name),
  })
);

// Customers
export const customers = mysqlTable(
  'customers',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 191 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    email: varchar('email', { length: 191 }),
    /** Salted PBKDF2 hash; NULL for guest/POS customers with no login */
    passwordHash: varchar('password_hash', { length: 255 }),
    address: text('address'),
    totalOrders: int('total_orders').default(0),
    totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).default('0'),
    /** 'active' | 'blocked' — blocked customers cannot place orders */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    /** Last device IP seen when this customer placed an order */
    lastIp: varchar('last_ip', { length: 64 }),
    note: text('note'),
    /** 'regular' | 'wholesale' */
    customerType: varchar('customer_type', { length: 16 }).notNull().default('regular'),
    /** Wholesale accounts only: 'pending' | 'approved' | 'rejected' | 'suspended' */
    wholesaleStatus: varchar('wholesale_status', { length: 16 }),
    businessName: varchar('business_name', { length: 191 }),
    businessAddress: text('business_address'),
    businessType: varchar('business_type', { length: 100 }),
    wholesaleAppliedAt: timestamp('wholesale_applied_at'),
    wholesaleReviewedAt: timestamp('wholesale_reviewed_at'),
    /** Reason shown to the customer when an application is rejected / suspended */
    wholesaleNote: text('wholesale_note'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    phoneIdx: index('idx_customers_phone').on(table.phone),
    wholesaleIdx: index('idx_customers_wholesale').on(table.customerType, table.wholesaleStatus),
  })
);

// Suppliers
export const suppliers = mysqlTable('suppliers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  email: varchar('email', { length: 191 }),
  company: varchar('company', { length: 191 }),
  address: text('address'),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Orders
export const orders = mysqlTable(
  'orders',
  {
    id: int('id').autoincrement().primaryKey(),
    orderNumber: varchar('order_number', { length: 64 }).notNull().unique(), // ORD-20260916-0001
    source: varchar('source', { length: 16 }).default('web'), // 'web', 'pos'
    customerId: int('customer_id').references(() => customers.id),
    customerName: varchar('customer_name', { length: 191 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
    customerAddress: text('customer_address'),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    discount: decimal('discount', { precision: 12, scale: 2 }).default('0'),
    shippingCharge: decimal('shipping_charge', { precision: 12, scale: 2 }).default('0'),
    tax: decimal('tax', { precision: 12, scale: 2 }).default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    cashReceived: decimal('cash_received', { precision: 12, scale: 2 }).default('0'),
    changeAmount: decimal('change_amount', { precision: 12, scale: 2 }).default('0'),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull().default('cod'),
    paymentStatus: varchar('payment_status', { length: 32 }).default('unpaid'),
    orderStatus: varchar('order_status', { length: 32 }).default('pending'),
    shippingZone: varchar('shipping_zone', { length: 100 }),
    transactionId: varchar('transaction_id', { length: 100 }),
    senderNumber: varchar('sender_number', { length: 32 }),
    notes: text('notes'),
    cashierName: varchar('cashier_name', { length: 191 }),
    /** Device IP captured at checkout (X-Forwarded-For aware) */
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    /** Courier handover */
    courierService: varchar('courier_service', { length: 64 }),
    consignmentId: varchar('consignment_id', { length: 128 }),
    courierStatus: varchar('courier_status', { length: 64 }),
    courierSentAt: timestamp('courier_sent_at'),
    /** Courier's own tracking code (Steadfast returns one beside the consignment id) */
    trackingCode: varchar('tracking_code', { length: 128 }),
    /** Placed by an approved wholesale customer at wholesale prices */
    isWholesale: boolean('is_wholesale').default(false),
    /** v3.6 — the landing page the order came from (name kept even if the page is deleted) */
    landingPageId: int('landing_page_id'),
    landingPageName: varchar('landing_page_name', { length: 191 }),
    /** v3.9 — paid in advance; the courier collects total − advance */
    advancePaid: decimal('advance_paid', { precision: 12, scale: 2 }).default('0'),
    /** v3.9 — the staff member handling this order (users.id) */
    assignedTo: int('assigned_to'),
    assignedName: varchar('assigned_name', { length: 191 }),
    assignedAt: timestamp('assigned_at'),
    /** v3.9 — 1 once the order's stock went back (cancelled / returned / refunded) */
    stockReleased: boolean('stock_released').default(false),
    /** v3.9 — district (zila) and thana/upazila chosen at checkout */
    district: varchar('district', { length: 64 }),
    thana: varchar('thana', { length: 100 }),
    /** v3.9 — who typed in a manual order from the dashboard */
    createdBy: varchar('created_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_orders_status').on(table.orderStatus),
    wholesaleIdx: index('idx_orders_wholesale').on(table.isWholesale),
    createdIdx: index('idx_orders_created').on(table.createdAt),
    phoneIdx: index('idx_orders_phone').on(table.customerPhone),
    sourceIdx: index('idx_orders_source').on(table.source),
    ipIdx: index('idx_orders_ip').on(table.ipAddress),
  })
);

// Order Items
export const orderItems = mysqlTable(
  'order_items',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    productName: varchar('product_name', { length: 255 }).notNull(),
    /** Which variation was bought, and its human label for the invoice */
    variationId: int('variation_id'),
    variationLabel: varchar('variation_label', { length: 255 }),
    sku: varchar('sku', { length: 100 }),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
    quantity: int('quantity').notNull(),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    batchNumber: varchar('batch_number', { length: 100 }),
    expiryDate: varchar('expiry_date', { length: 20 }),
  },
  (table) => ({
    orderIdx: index('idx_order_items_order').on(table.orderId),
  })
);

// Inventory Transactions
export const inventoryTransactions = mysqlTable(
  'inventory_transactions',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    type: varchar('type', { length: 32 }).notNull(), // sale, purchase, adjustment, return, expired, damage
    quantity: int('quantity').notNull(),
    previousStock: int('previous_stock').notNull(),
    newStock: int('new_stock').notNull(),
    reference: varchar('reference', { length: 100 }),
    notes: text('notes'),
    performedBy: varchar('performed_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    productIdx: index('idx_inventory_product').on(table.productId),
  })
);

// Purchases
export const purchases = mysqlTable('purchases', {
  id: int('id').autoincrement().primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 64 }).notNull().unique(),
  supplierId: int('supplier_id').references(() => suppliers.id),
  supplierName: varchar('supplier_name', { length: 191 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  paid: decimal('paid', { precision: 12, scale: 2 }).default('0'),
  status: varchar('status', { length: 32 }).default('completed'),
  purchaseDate: varchar('purchase_date', { length: 20 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Purchase Items
export const purchaseItems = mysqlTable('purchase_items', {
  id: int('id').autoincrement().primaryKey(),
  purchaseId: int('purchase_id')
    .notNull()
    .references(() => purchases.id),
  productId: int('product_id')
    .notNull()
    .references(() => products.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  quantity: int('quantity').notNull(),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  batchNumber: varchar('batch_number', { length: 100 }),
  expiryDate: varchar('expiry_date', { length: 20 }),
});

// Daily expenses (POS -> Daily Expenses)
export const expenses = mysqlTable(
  'expenses',
  {
    id: int('id').autoincrement().primaryKey(),
    category: varchar('category', { length: 100 }).notNull(),
    description: text('description'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 32 }).default('cash'),
    expenseDate: varchar('expense_date', { length: 20 }).notNull(),
    recordedBy: varchar('recorded_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    dateIdx: index('idx_expenses_date').on(table.expenseDate),
  })
);

// Counter / cash-drawer sessions (POS -> Open Counter)
export const counterSessions = mysqlTable(
  'counter_sessions',
  {
    id: int('id').autoincrement().primaryKey(),
    openedBy: varchar('opened_by', { length: 191 }).notNull(),
    openingCash: decimal('opening_cash', { precision: 12, scale: 2 }).notNull().default('0'),
    closingCash: decimal('closing_cash', { precision: 12, scale: 2 }),
    expectedCash: decimal('expected_cash', { precision: 12, scale: 2 }),
    difference: decimal('difference', { precision: 12, scale: 2 }),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    note: text('note'),
    openedAt: timestamp('opened_at').defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (table) => ({
    statusIdx: index('idx_counter_status').on(table.status),
  })
);

// Coupons
export const coupons = mysqlTable('coupons', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  type: varchar('type', { length: 16 }).notNull(), // 'percentage', 'fixed'
  value: decimal('value', { precision: 12, scale: 2 }).notNull(),
  minOrder: decimal('min_order', { precision: 12, scale: 2 }).default('0'),
  maxDiscount: decimal('max_discount', { precision: 12, scale: 2 }),
  usageLimit: int('usage_limit').default(100),
  usedCount: int('used_count').default(0),
  expiresAt: varchar('expires_at', { length: 20 }),
  status: varchar('status', { length: 32 }).default('active'),
});

// Site & Theme Settings (key/value JSON store)
export const siteSettings = mysqlTable('site_settings', {
  key: varchar('key', { length: 191 }).primaryKey(),
  // mediumtext (16 MB): TEXT's 64 KB limit silently broke large settings such as
  // CMS page HTML and any accidentally inlined image.
  value: mediumtext('value').notNull(), // JSON serialized
});

// Hero Banners
export const heroBanners = mysqlTable(
  'hero_banners',
  {
    id: int('id').autoincrement().primaryKey(),
    // Optional: a banner can be image-only, with no text overlay at all
    title: varchar('title', { length: 255 }),
    subtitle: text('subtitle'),
    badge: varchar('badge', { length: 100 }),
    buttonText: varchar('button_text', { length: 100 }),
    buttonUrl: varchar('button_url', { length: 255 }),
    imageUrl: text('image_url').notNull(),
    mobileImageUrl: text('mobile_image_url'),
    bgGradient: varchar('bg_gradient', { length: 255 }),
    sortOrder: int('sort_order').default(0),
    status: varchar('status', { length: 32 }).default('active'),
  },
  (table) => ({
    statusOrderIdx: index('idx_banners_status_order').on(table.status, table.sortOrder),
  })
);

// Reviews
export const reviews = mysqlTable(
  'reviews',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    userName: varchar('user_name', { length: 191 }).notNull(),
    userPhone: varchar('user_phone', { length: 32 }),
    rating: int('rating').notNull(),
    comment: text('comment').notNull(),
    status: varchar('status', { length: 32 }).default('approved'),
    /** v3.6 — the shop's public answer under the review */
    reply: text('reply'),
    /** v3.6 — device IP, used only to slow down review spam */
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    productIdx: index('idx_reviews_product').on(table.productId),
  })
);


// ---------------------------------------------------------------------------
// Ledgers, procurement returns, master data and HR
// ---------------------------------------------------------------------------

/** Money received from a customer (due collection / advance) */
export const customerPayments = mysqlTable(
  'customer_payments',
  {
    id: int('id').autoincrement().primaryKey(),
    customerId: int('customer_id').references(() => customers.id),
    customerName: varchar('customer_name', { length: 191 }).notNull(),
    orderId: int('order_id'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }).default('cash'),
    reference: varchar('reference', { length: 100 }),
    note: text('note'),
    paymentDate: varchar('payment_date', { length: 20 }).notNull(),
    recordedBy: varchar('recorded_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    customerIdx: index('idx_cust_pay_customer').on(table.customerId),
    dateIdx: index('idx_cust_pay_date').on(table.paymentDate),
  })
);

/** Money paid to a supplier against purchase bills */
export const supplierPayments = mysqlTable(
  'supplier_payments',
  {
    id: int('id').autoincrement().primaryKey(),
    supplierId: int('supplier_id').references(() => suppliers.id),
    supplierName: varchar('supplier_name', { length: 191 }).notNull(),
    purchaseId: int('purchase_id'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }).default('cash'),
    reference: varchar('reference', { length: 100 }),
    note: text('note'),
    paymentDate: varchar('payment_date', { length: 20 }).notNull(),
    recordedBy: varchar('recorded_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    supplierIdx: index('idx_sup_pay_supplier').on(table.supplierId),
    dateIdx: index('idx_sup_pay_date').on(table.paymentDate),
  })
);

/** Goods sent back to a supplier */
export const purchaseReturns = mysqlTable('purchase_returns', {
  id: int('id').autoincrement().primaryKey(),
  returnNumber: varchar('return_number', { length: 64 }).notNull().unique(),
  supplierId: int('supplier_id').references(() => suppliers.id),
  supplierName: varchar('supplier_name', { length: 191 }).notNull(),
  purchaseId: int('purchase_id'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason'),
  returnDate: varchar('return_date', { length: 20 }).notNull(),
  recordedBy: varchar('recorded_by', { length: 191 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const purchaseReturnItems = mysqlTable('purchase_return_items', {
  id: int('id').autoincrement().primaryKey(),
  returnId: int('return_id')
    .notNull()
    .references(() => purchaseReturns.id),
  productId: int('product_id')
    .notNull()
    .references(() => products.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  quantity: int('quantity').notNull(),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  batchNumber: varchar('batch_number', { length: 100 }),
});

/** Master data: generic molecules */
export const generics = mysqlTable('generics', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Master data: manufacturers / pharma companies */
export const manufacturers = mysqlTable('manufacturers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull().unique(),
  contact: varchar('contact', { length: 100 }),
  address: text('address'),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Master data: product groups / shelves */
export const productGroups = mysqlTable('product_groups', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Customer pre-orders / special requests */
export const preOrders = mysqlTable(
  'pre_orders',
  {
    id: int('id').autoincrement().primaryKey(),
    customerName: varchar('customer_name', { length: 191 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
    productName: varchar('product_name', { length: 255 }).notNull(),
    productId: int('product_id'),
    quantity: int('quantity').notNull().default(1),
    advance: decimal('advance', { precision: 12, scale: 2 }).default('0'),
    expectedDate: varchar('expected_date', { length: 20 }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    note: text('note'),
    recordedBy: varchar('recorded_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_preorders_status').on(table.status),
  })
);

/** Stock issued out of the counter (damage, sample, internal use) */
export const productIssues = mysqlTable(
  'product_issues',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    productName: varchar('product_name', { length: 255 }).notNull(),
    quantity: int('quantity').notNull(),
    issueType: varchar('issue_type', { length: 32 }).notNull().default('damage'),
    issuedTo: varchar('issued_to', { length: 191 }),
    note: text('note'),
    issueDate: varchar('issue_date', { length: 20 }).notNull(),
    recordedBy: varchar('recorded_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    dateIdx: index('idx_issues_date').on(table.issueDate),
  })
);

/** Staff salary payments */
export const salaries = mysqlTable(
  'salaries',
  {
    id: int('id').autoincrement().primaryKey(),
    employeeName: varchar('employee_name', { length: 191 }).notNull(),
    designation: varchar('designation', { length: 100 }),
    month: varchar('month', { length: 20 }).notNull(),
    basic: decimal('basic', { precision: 12, scale: 2 }).notNull().default('0'),
    bonus: decimal('bonus', { precision: 12, scale: 2 }).default('0'),
    deduction: decimal('deduction', { precision: 12, scale: 2 }).default('0'),
    netPay: decimal('net_pay', { precision: 12, scale: 2 }).notNull(),
    paidOn: varchar('paid_on', { length: 20 }),
    status: varchar('status', { length: 32 }).default('paid'),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    monthIdx: index('idx_salary_month').on(table.month),
  })
);

// ---------------------------------------------------------------------------
// Product attributes / variations
// ---------------------------------------------------------------------------

export const attributes = mysqlTable('attributes', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull().unique(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  /** JSON string array of allowed values, e.g. ["10mg","50mg"] */
  values: text('values'),
  sortOrder: int('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const productAttributes = mysqlTable(
  'product_attributes',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    attributeId: int('attribute_id')
      .notNull()
      .references(() => attributes.id),
    attributeName: varchar('attribute_name', { length: 191 }).notNull(),
    /** JSON string array of the values picked for this product */
    value: text('value').notNull(),
  },
  (table) => ({
    productIdx: index('idx_prod_attr_product').on(table.productId),
  })
);


// ---------------------------------------------------------------------------
// Product variations
// A variation is one buyable combination (Colour: Red / Size: M) with its own
// SKU, price and — the important part — its own stock. Stock therefore lives
// on the variation when a product has any, and on the product row otherwise.
// ---------------------------------------------------------------------------

export const productVariations = mysqlTable(
  'product_variations',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    /** JSON object of the picked values, e.g. {"Color":"Red","Size":"M"} */
    combination: text('combination').notNull(),
    /** Human label built from the combination, e.g. "Red / M" */
    label: varchar('label', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 100 }),
    price: decimal('price', { precision: 12, scale: 2 }),
    salePrice: decimal('sale_price', { precision: 12, scale: 2 }),
    stock: int('stock').notNull().default(0),
    image: text('image'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    sortOrder: int('sort_order').default(0),
    /** v3.7 — printed barcode of this exact option, scanned at the POS */
    barcode: varchar('barcode', { length: 64 }),
    /** v3.7 — wholesale price of this option; blank = the product's wholesale price */
    wholesalePrice: decimal('wholesale_price', { precision: 12, scale: 2 }),
  },
  (table) => ({
    productIdx: index('idx_variation_product').on(table.productId),
    skuIdx: index('idx_variation_sku').on(table.sku),
  })
);

// ---------------------------------------------------------------------------
// Abandoned / incomplete checkouts
// A shopper who typed their details into checkout but never pressed confirm.
// These are NOT orders — they live in their own table so "All Orders" stays
// clean and "Incomplete Orders" has something real to show.
// ---------------------------------------------------------------------------

export const abandonedCheckouts = mysqlTable(
  'abandoned_checkouts',
  {
    id: int('id').autoincrement().primaryKey(),
    /** Browser-generated id so the same visitor updates one row, not many */
    sessionKey: varchar('session_key', { length: 64 }).notNull().unique(),
    customerName: varchar('customer_name', { length: 191 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    customerAddress: text('customer_address'),
    shippingZone: varchar('shipping_zone', { length: 100 }),
    /** v3.9 — district / thana typed so far */
    district: varchar('district', { length: 64 }),
    thana: varchar('thana', { length: 100 }),
    paymentMethod: varchar('payment_method', { length: 32 }),
    /** JSON cart snapshot: [{productId, variationId, name, image, qty, price}] */
    items: mediumtext('items'),
    itemCount: int('item_count').default(0),
    cartTotal: decimal('cart_total', { precision: 12, scale: 2 }).default('0'),
    ipAddress: varchar('ip_address', { length: 64 }),
    /** 'active' while they are still typing, 'recovered' once they order */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    recoveredOrderId: int('recovered_order_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_abandoned_status').on(table.status),
    phoneIdx: index('idx_abandoned_phone').on(table.customerPhone),
  })
);

// ---------------------------------------------------------------------------
// Customer password reset
// Only the hash of the token is stored, so a leaked table cannot be used to
// take over accounts.
// ---------------------------------------------------------------------------

export const passwordResets = mysqlTable(
  'password_resets',
  {
    id: int('id').autoincrement().primaryKey(),
    customerId: int('customer_id')
      .notNull()
      .references(() => customers.id),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    tokenIdx: index('idx_reset_token').on(table.tokenHash),
    customerIdx: index('idx_reset_customer').on(table.customerId),
  })
);

// ---------------------------------------------------------------------------
// Security: blocked IP addresses
// ---------------------------------------------------------------------------

export const blockedIps = mysqlTable(
  'blocked_ips',
  {
    id: int('id').autoincrement().primaryKey(),
    ip: varchar('ip', { length: 64 }).notNull().unique(),
    note: text('note'),
    createdBy: varchar('created_by', { length: 191 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    ipIdx: index('idx_blocked_ip').on(table.ip),
  })
);

// Relations (unchanged — relation definitions are dialect independent)
/**
 * Dashboard notifications (bell icon). Written by the server when something
 * needs the owner's attention, e.g. a new wholesale registration.
 */
export const adminNotifications = mysqlTable(
  'admin_notifications',
  {
    id: int('id').autoincrement().primaryKey(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    /** Dashboard tab to open when the notification is clicked */
    linkTab: varchar('link_tab', { length: 64 }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    readIdx: index('idx_admin_notifications_read').on(table.isRead, table.createdAt),
  })
);

/** v3.6 — size charts (Dashboard → Products → Size Guides) */
export const sizeGuides = mysqlTable('size_guides', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  description: text('description'),
  /** JSON string[] — the header row */
  columns: text('columns').notNull(),
  /** JSON string[][] — one array per size */
  rows: mediumtext('rows').notNull(),
  /** Optional "how to measure" picture */
  image: text('image'),
  note: text('note'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** v3.6 — blog */
export const blogPosts = mysqlTable(
  'blog_posts',
  {
    id: int('id').autoincrement().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    excerpt: text('excerpt'),
    content: mediumtext('content'),
    coverImage: text('cover_image'),
    author: varchar('author', { length: 191 }),
    category: varchar('category', { length: 100 }),
    tags: varchar('tags', { length: 255 }),
    /** 'published' | 'draft' */
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    metaTitle: varchar('meta_title', { length: 255 }),
    metaDescription: text('meta_description'),
    views: int('views').notNull().default(0),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_blog_status').on(table.status, table.publishedAt),
  })
);

/** v3.6 — landing pages (one product or combo, its own checkout) */
export const landingPages = mysqlTable(
  'landing_pages',
  {
    id: int('id').autoincrement().primaryKey(),
    title: varchar('title', { length: 191 }).notNull(),
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    /** 'fashion' | 'organic' */
    template: varchar('template', { length: 32 }).notNull().default('fashion'),
    /** 'draft' | 'active' | 'inactive' */
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    /** JSON: every text, image, colour and section switch of the page */
    content: mediumtext('content'),
    /** JSON: [{ productId, variationIds?, qty, preselect }] */
    products: text('products'),
    /** JSON: { mode: 'store'|'custom'|'free', charges, freeMinQty, freeMinSubtotal } */
    shipping: text('shipping'),
    views: int('views').notNull().default(0),
    ordersCount: int('orders_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_landing_status').on(table.status),
  })
);

/** v3.6 — online payments (SSLCommerz, bKash, Nagad) */
export const paymentTransactions = mysqlTable(
  'payment_transactions',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id').notNull(),
    orderNumber: varchar('order_number', { length: 64 }).notNull(),
    gateway: varchar('gateway', { length: 32 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('BDT'),
    /** 'initiated' | 'paid' | 'failed' | 'cancelled' */
    status: varchar('status', { length: 16 }).notNull().default('initiated'),
    /** Our own reference sent to the gateway (unique per attempt) */
    reference: varchar('reference', { length: 100 }).notNull().unique(),
    /** Gateway's session / payment id */
    gatewayRef: varchar('gateway_ref', { length: 191 }),
    /** Gateway's final transaction id (bank tran id, bKash trxID, Nagad issuer ref) */
    gatewayTxnId: varchar('gateway_txn_id', { length: 191 }),
    message: varchar('message', { length: 255 }),
    payload: text('payload'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    orderIdx: index('idx_payment_tx_order').on(table.orderId),
    refIdx: index('idx_payment_tx_gateway_ref').on(table.gatewayRef),
  })
);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  brand: one(brands, {
    fields: [products.brandId],
    references: [brands.id],
  }),
  reviews: many(reviews),
  orderItems: many(orderItems),
  inventoryTransactions: many(inventoryTransactions),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseItems),
}));
