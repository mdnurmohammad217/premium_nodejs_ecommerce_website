/**
 * Wholesale accounts
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerWholesaleAccountRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings, adminNotifications, customers, orders, products, customerPayments, categories, productVariations } from '../../db/schema.ts';
import { eq, and, desc, sql, or, like, inArray, asc } from 'drizzle-orm';
import { updateReturning, insertReturning } from '../../db/mysql-helpers.ts';
import { canOpenTab, hasModule } from '../../lib/permissions.ts';
import type * as Server from '../../../server.ts';

type CustomerRow = Server.CustomerRow;
type SessionPayload = Server.SessionPayload;


export interface RegisterWholesaleAccountRoutesDeps {
  app: typeof Server.app;
  categoryAndDescendants: typeof Server.categoryAndDescendants;
  hasSocialLogin: typeof Server.hasSocialLogin;
  isApprovedWholesale: typeof Server.isApprovedWholesale;
  loginThrottle: typeof Server.loginThrottle;
  makePasswordRecord: typeof Server.makePasswordRecord;
  parseWholesaleFields: typeof Server.parseWholesaleFields;
  privateResponse: typeof Server.privateResponse;
  publicProduct: typeof Server.publicProduct;
  requireRole: typeof Server.requireRole;
  SESSION_TTL_MS: typeof Server.SESSION_TTL_MS;
  signSession: typeof Server.signSession;
  sqlRows: typeof Server.sqlRows;
  wholesaleIdsCache: typeof Server.wholesaleIdsCache;
}

export function registerWholesaleAccountRoutes(deps: RegisterWholesaleAccountRoutesDeps) {
// ==========================================
// WHOLESALE ACCOUNTS
// ==========================================
const WHOLESALE_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

async function readWholesaleConfig(): Promise<{ autoApprove: boolean }> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'wholesale_config'));
    const cfg = rows.length > 0 ? JSON.parse(rows[0].value) : {};
    return { autoApprove: Boolean(cfg?.autoApprove) };
  } catch {
    return { autoApprove: false };
  }
}

async function notifyAdmin(type: string, title: string, body: string, linkTab?: string) {
  try {
    await db.insert(adminNotifications).values({ type, title, body, linkTab: linkTab || null });
  } catch (error: any) {
    console.error('Could not store notification:', error?.message || error);
  }
}

/** The part of a customer row the shopper may see about their own wholesale account */
function wholesaleProfile(customer: CustomerRow | null) {
  if (!customer) return null;
  return {
    customerType: customer.customerType || 'regular',
    wholesaleStatus: customer.customerType === 'wholesale' ? customer.wholesaleStatus || 'pending' : null,
    businessName: customer.businessName || '',
    businessAddress: customer.businessAddress || '',
    businessType: customer.businessType || '',
    wholesaleAppliedAt: customer.wholesaleAppliedAt || null,
    wholesaleReviewedAt: customer.wholesaleReviewedAt || null,
    wholesaleNote: customer.wholesaleNote || '',
  };
}

function readBusinessFields(body: any): { values: Record<string, string> } | { error: string } {
  const businessName = String(body?.businessName || '').trim();
  const businessAddress = String(body?.businessAddress || '').trim();
  const businessType = String(body?.businessType || '').trim();
  if (!businessName) return { error: 'Enter your business or shop name.' };
  if (!businessAddress) return { error: 'Enter your business address.' };
  if (!businessType) return { error: 'Choose your business type.' };
  return {
    values: {
      businessName: businessName.slice(0, 191),
      businessAddress: businessAddress.slice(0, 1000),
      businessType: businessType.slice(0, 100),
    },
  };
}

function customerSessionUser(customer: CustomerRow) {
  return {
    id: customer.id,
    uid: `customer_${customer.id}`,
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone,
    role: 'customer' as const,
    ...wholesaleProfile(customer),
  };
}

/**
 * New wholesale customer (public). Same account system as regular customers —
 * phone + password — with the business details and a wholesale status on top.
 * The account can sign in straight away; it is charged wholesale prices only
 * once its status is Approved (instantly when Auto Approval is on).
 */
deps.app.post('/api/auth/register-wholesale', deps.loginThrottle, async (req, res) => {
  try {
    const { name, phone, email, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please enter your full name.' });
    const cleanPhone = String(phone || '').replace(/[\s-]+/g, '');
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Enter a valid 11-digit mobile number (013-019).' });
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const business = readBusinessFields(req.body);
    if ('error' in business) return res.status(400).json({ error: business.error });

    const existing = await db.select().from(customers).where(eq(customers.phone, cleanPhone)).limit(1);
    if (existing.length > 0 && (existing[0].passwordHash || (await deps.hasSocialLogin(existing[0].id)))) {
      return res.status(409).json({
        error: 'An account with this number already exists. Sign in and apply for wholesale from My Account.',
      });
    }

    const { autoApprove } = await readWholesaleConfig();
    const now = new Date();
    const values = {
      name: String(name).trim(),
      email: cleanEmail || null,
      passwordHash: deps.makePasswordRecord(String(password)),
      customerType: 'wholesale',
      wholesaleStatus: autoApprove ? 'approved' : 'pending',
      wholesaleAppliedAt: now,
      wholesaleReviewedAt: autoApprove ? now : null,
      wholesaleNote: null,
      ...business.values,
    };

    let customer: CustomerRow;
    if (existing.length > 0) {
      // A guest/POS customer row for this number is claimed, not duplicated
      const updated = await updateReturning(db, customers, values, eq(customers.id, existing[0].id));
      customer = updated[0];
    } else {
      const inserted = await insertReturning(db, customers, { ...values, phone: cleanPhone });
      customer = inserted[0];
    }

    await notifyAdmin(
      'wholesale_registration',
      autoApprove ? 'New wholesale customer (auto-approved)' : 'New wholesale registration waiting for approval',
      `${customer.businessName} — ${customer.name}, ${customer.phone}`,
      'wholesale-customers'
    );

    const token = deps.signSession({
      sub: `customer_${customer.id}`,
      email: customer.email || '',
      name: customer.name,
      role: 'customer',
      exp: Date.now() + deps.SESSION_TTL_MS,
    });
    res.json({ success: true, token, user: customerSessionUser(customer) });
  } catch (error: any) {
    console.error('Wholesale registration failed:', error);
    res.status(500).json({ error: 'Could not complete the registration.' });
  }
});

/** A signed-in regular customer applies to become a wholesale customer */
deps.app.post('/api/account/wholesale/apply', deps.requireRole('customer'), async (req: any, res) => {
  try {
    const customerId = Number(String(req.session.sub).replace('customer_', ''));
    const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    const customer = rows[0];
    if (!customer) return res.status(404).json({ error: 'Account not found.' });
    if (customer.customerType === 'wholesale' && ['pending', 'approved'].includes(customer.wholesaleStatus || '')) {
      return res.status(409).json({ error: 'You already have a wholesale application or account.' });
    }
    if (customer.customerType === 'wholesale' && customer.wholesaleStatus === 'suspended') {
      return res.status(403).json({ error: 'Your wholesale account is suspended. Please contact the store.' });
    }
    const business = readBusinessFields(req.body);
    if ('error' in business) return res.status(400).json({ error: business.error });

    const { autoApprove } = await readWholesaleConfig();
    const now = new Date();
    const updated = await updateReturning(
      db,
      customers,
      {
        customerType: 'wholesale',
        wholesaleStatus: autoApprove ? 'approved' : 'pending',
        wholesaleAppliedAt: now,
        wholesaleReviewedAt: autoApprove ? now : null,
        wholesaleNote: null,
        ...business.values,
      },
      eq(customers.id, customerId)
    );
    await notifyAdmin(
      'wholesale_registration',
      autoApprove ? 'New wholesale customer (auto-approved)' : 'New wholesale application waiting for approval',
      `${business.values.businessName} — ${customer.name}, ${customer.phone}`,
      'wholesale-customers'
    );
    res.json({ success: true, user: customerSessionUser(updated[0]) });
  } catch (error: any) {
    console.error('Wholesale apply failed:', error);
    res.status(500).json({ error: 'Could not submit the application.' });
  }
});

/** Wholesale section of My Account: status, business, orders, products */
deps.app.get('/api/account/wholesale', deps.requireRole('customer'), async (req: any, res) => {
  try {
    deps.privateResponse(res);
    const customerId = Number(String(req.session.sub).replace('customer_', ''));
    const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    const customer = rows[0];
    if (!customer) return res.status(404).json({ error: 'Account not found.' });

    const wholesaleOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.isWholesale, true)))
      .orderBy(desc(orders.id))
      .limit(100);

    let productRows: any[] = [];
    if (deps.isApprovedWholesale(customer)) {
      productRows = await db
        .select()
        .from(products)
        .where(
          and(eq(products.status, 'active'), eq(products.wholesaleEnabled, true), sql`${products.wholesalePrice} > 0`)
        )
        .orderBy(desc(products.id))
        .limit(12);
    }

    res.json({
      profile: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email || '',
        address: customer.address || '',
        createdAt: customer.createdAt,
      },
      wholesale: wholesaleProfile(customer),
      orders: wholesaleOrders,
      products: productRows.map((row) => deps.publicProduct(row, true)),
    });
  } catch (error: any) {
    console.error('Wholesale account load failed:', error);
    res.status(500).json({ error: 'Could not load your wholesale account.' });
  }
});

/** Wholesale business details can be corrected by the customer; the status cannot */
deps.app.put('/api/account/wholesale', deps.requireRole('customer'), async (req: any, res) => {
  try {
    const customerId = Number(String(req.session.sub).replace('customer_', ''));
    const business = readBusinessFields(req.body);
    if ('error' in business) return res.status(400).json({ error: business.error });
    const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!rows[0] || rows[0].customerType !== 'wholesale') {
      return res.status(400).json({ error: 'This is not a wholesale account.' });
    }
    await db.update(customers).set(business.values).where(eq(customers.id, customerId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not save your business details.' });
  }
});

/* ------------------------------------------------------ admin: wholesale */

deps.app.get('/api/admin/wholesale/customers', async (req, res) => {
  try {
    const status = String(req.query.status || 'all');
    const search = String(req.query.search || '').trim();
    const conditions: any[] = [eq(customers.customerType, 'wholesale')];
    if (WHOLESALE_STATUSES.includes(status)) conditions.push(eq(customers.wholesaleStatus, status));
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(like(customers.name, term), like(customers.phone, term), like(customers.businessName, term), like(customers.email, term))
      );
    }
    const rows = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.wholesaleAppliedAt), desc(customers.id))
      .limit(1000);

    const ids = rows.map((row) => row.id);
    const stats = new Map<number, { count: number; total: number }>();
    if (ids.length > 0) {
      const orderStats = await db
        .select({
          customerId: orders.customerId,
          count: sql<number>`count(*)`,
          total: sql<string>`coalesce(sum(${orders.total}), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.isWholesale, true), inArray(orders.customerId, ids)))
        .groupBy(orders.customerId);
      orderStats.forEach((row) => stats.set(Number(row.customerId), { count: Number(row.count), total: Number(row.total) }));
    }

    const countRows = await db
      .select({ status: customers.wholesaleStatus, count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.customerType, 'wholesale'))
      .groupBy(customers.wholesaleStatus);
    const counts: Record<string, number> = { all: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 };
    countRows.forEach((row) => {
      counts[row.status || 'pending'] = Number(row.count);
      counts.all += Number(row.count);
    });

    res.json({
      customers: rows.map(({ passwordHash, ...row }) => ({
        ...row,
        wholesaleOrders: stats.get(row.id)?.count || 0,
        wholesaleSpent: (stats.get(row.id)?.total || 0).toFixed(2),
      })),
      counts,
      config: await readWholesaleConfig(),
    });
  } catch (error: any) {
    console.error('wholesale customers:', error);
    res.status(500).json({ error: 'Could not load wholesale customers.' });
  }
});

deps.app.patch('/api/admin/wholesale/customers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
    const nextStatus: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      suspend: 'suspended',
      reactivate: 'approved',
    };
    if (!nextStatus[action]) return res.status(400).json({ error: 'Unknown action.' });

    const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    const customer = rows[0];
    if (!customer || customer.customerType !== 'wholesale') {
      return res.status(404).json({ error: 'Wholesale customer not found.' });
    }
    await db
      .update(customers)
      .set({
        wholesaleStatus: nextStatus[action],
        wholesaleReviewedAt: new Date(),
        wholesaleNote: ['reject', 'suspend'].includes(action) ? note : null,
      })
      .where(eq(customers.id, id));
    const updated = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    const { passwordHash, ...row } = updated[0];
    res.json({ success: true, customer: row });
  } catch (error: any) {
    console.error('wholesale status:', error);
    res.status(500).json({ error: 'Could not update the account.' });
  }
});

/**
 * Delete a wholesale account. A customer with orders keeps their customer
 * record and order history (orders reference it); only the wholesale account
 * is removed and they become a regular customer. Without orders the row goes.
 */
deps.app.delete('/api/admin/wholesale/customers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    const customer = rows[0];
    if (!customer || customer.customerType !== 'wholesale') {
      return res.status(404).json({ error: 'Wholesale customer not found.' });
    }
    const orderCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.customerId, id));
    const payments = await db
      .select({ count: sql<number>`count(*)` })
      .from(customerPayments)
      .where(eq(customerPayments.customerId, id))
      .catch(() => [{ count: 0 }]);

    if (Number(orderCount[0]?.count || 0) > 0 || Number(payments[0]?.count || 0) > 0) {
      await db
        .update(customers)
        .set({
          customerType: 'regular',
          wholesaleStatus: null,
          businessName: null,
          businessAddress: null,
          businessType: null,
          wholesaleAppliedAt: null,
          wholesaleReviewedAt: null,
          wholesaleNote: null,
        })
        .where(eq(customers.id, id));
      return res.json({
        success: true,
        mode: 'downgraded',
        message: 'Wholesale account removed. The customer has order history, so they were kept as a regular customer.',
      });
    }
    const outcome = await deleteCustomerRecord(id);
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ success: true, mode: 'deleted', message: 'Wholesale customer deleted.' });
  } catch (error: any) {
    console.error('wholesale delete:', error);
    res.status(500).json({ error: 'Could not delete the account.' });
  }
});

/**
 * Deletes a customer (v3.8). Orders are never deleted: they keep the name,
 * phone and address they were placed with and are only unlinked from the
 * account. A customer with entries in the dues ledger is kept, because those
 * entries are money records — the operator is told what to do instead.
 */
async function deleteCustomerRecord(id: number): Promise<{ ok: true; detachedOrders: number } | { error: string; status: number }> {
  const found = (await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1))[0];
  if (!found) return { error: 'Customer not found.', status: 404 };
  const payments = await db
    .select({ count: sql<number>`count(*)` })
    .from(customerPayments)
    .where(eq(customerPayments.customerId, id))
    .catch(() => [{ count: 0 }]);
  const paymentCount = Number(payments[0]?.count || 0);
  if (paymentCount > 0) {
    return {
      error: `This customer has ${paymentCount} due/collection entr${paymentCount === 1 ? 'y' : 'ies'} in the customer ledger, so the record is kept. Remove those entries in POS → Customer Ledger first, or block the customer instead.`,
      status: 409,
    };
  }
  let detached = 0;
  await db.transaction(async (tx) => {
    const result: any = await tx.update(orders).set({ customerId: null }).where(eq(orders.customerId, id));
    detached = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
    await tx.execute(sql`DELETE FROM password_resets WHERE customer_id = ${id}`);
    await tx.execute(sql`DELETE FROM password_reset_requests WHERE account_type = 'customer' AND account_id = ${id}`).catch(() => undefined);
    await tx.delete(customers).where(eq(customers.id, id));
  });
  deps.wholesaleIdsCache.at = 0;
  return { ok: true, detachedOrders: detached };
}

deps.app.delete('/api/admin/customers/:id', async (req, res) => {
  try {
    const outcome = await deleteCustomerRecord(Number(req.params.id));
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
    res.json({
      success: true,
      detachedOrders: outcome.detachedOrders,
      message: outcome.detachedOrders
        ? `Customer deleted. ${outcome.detachedOrders === 1 ? 'Their order stays' : `Their ${outcome.detachedOrders} orders stay`} in All Orders with the name and phone they were placed with.`
        : 'Customer deleted.',
    });
  } catch (error: any) {
    console.error('customer delete:', error?.message || error);
    res.status(500).json({ error: 'Could not delete the customer. Please try again.' });
  }
});

deps.app.get('/api/admin/wholesale/config', async (_req, res) => {
  res.json(await readWholesaleConfig());
});

deps.app.put('/api/admin/wholesale/config', async (req, res) => {
  try {
    const value = JSON.stringify({ autoApprove: Boolean(req.body?.autoApprove) });
    await db.insert(siteSettings).values({ key: 'wholesale_config', value }).onDuplicateKeyUpdate({ set: { value } });
    res.json({ success: true, ...JSON.parse(value) });
  } catch {
    res.status(500).json({ error: 'Could not save the setting.' });
  }
});

/* ------------------------------------------------ wholesale price list */
/**
 * v3.7 — every wholesale price in one place: one row per product, with its
 * variations underneath. Only the dashboard reads or writes this; the
 * storefront keeps getting prices from the server's own rules.
 */
deps.app.get('/api/admin/wholesale/prices', async (req, res) => {
  try {
    deps.privateResponse(res);
    const q = String(req.query.q || '').trim();
    const categoryId = Number(req.query.category) || 0;
    const filter = String(req.query.filter || 'all');
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);

    const conditions: any[] = [sql`${products.status} <> 'deleted'`];
    if (q) {
      const term = `%${q}%`;
      conditions.push(
        or(
          like(products.name, term),
          like(products.genericName, term),
          like(products.sku, term),
          like(products.barcode, term),
          sql`${products.id} IN (SELECT product_id FROM product_variations WHERE barcode LIKE ${term} OR sku LIKE ${term} OR label LIKE ${term})`
        )
      );
    }
    if (categoryId) {
      const ids = await deps.categoryAndDescendants(categoryId);
      conditions.push(ids.length > 1 ? inArray(products.categoryId, ids) : eq(products.categoryId, categoryId));
    }
    if (filter === 'on') conditions.push(and(eq(products.wholesaleEnabled, true), sql`${products.wholesalePrice} > 0`));
    if (filter === 'off') conditions.push(or(eq(products.wholesaleEnabled, false), sql`${products.wholesaleEnabled} IS NULL`));
    if (filter === 'variations') conditions.push(eq(products.hasVariations, true));
    if (filter === 'below-cost') {
      conditions.push(sql`${products.wholesalePrice} > 0 AND ${products.costPrice} > 0 AND ${products.wholesalePrice} < ${products.costPrice}`);
    }

    const where = and(...conditions);
    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(products).where(where);
    const rows = await db
      .select({ product: products, category: categories })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(asc(products.name))
      .limit(limit)
      .offset((page - 1) * limit);

    const ids = rows.map((row) => row.product.id);
    const variationRows = ids.length
      ? await db
          .select()
          .from(productVariations)
          .where(inArray(productVariations.productId, ids))
          .orderBy(asc(productVariations.sortOrder), asc(productVariations.id))
      : [];
    const numOrNull = (value: any) => (value == null || value === '' ? null : Number(value));

    const stats: any = deps.sqlRows(
      await db.execute(
        sql`SELECT COUNT(*) AS total,
                   SUM(CASE WHEN wholesale_enabled = 1 AND wholesale_price > 0 THEN 1 ELSE 0 END) AS enabled
            FROM products WHERE status <> 'deleted'`
      )
    )[0] || {};

    res.json({
      total: Number(totalRows[0]?.count || 0),
      page,
      limit,
      stats: { products: Number(stats.total || 0), enabled: Number(stats.enabled || 0) },
      rows: rows.map(({ product, category }) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        image: product.image || '',
        unit: product.unit || '',
        status: product.status,
        categoryName: category?.name || '',
        price: numOrNull(product.price),
        salePrice: numOrNull(product.salePrice),
        costPrice: numOrNull(product.costPrice),
        stock: Number(product.stock || 0),
        hasVariations: Boolean(product.hasVariations),
        wholesaleEnabled: Boolean(product.wholesaleEnabled),
        wholesalePrice: numOrNull(product.wholesalePrice),
        wholesaleMinQty: product.wholesaleMinQty ?? null,
        wholesaleMaxQty: product.wholesaleMaxQty ?? null,
        variations: variationRows
          .filter((variation) => variation.productId === product.id)
          .map((variation) => ({
            id: variation.id,
            label: variation.label,
            sku: variation.sku || '',
            price: numOrNull(variation.price),
            salePrice: numOrNull(variation.salePrice),
            wholesalePrice: numOrNull(variation.wholesalePrice),
            stock: Number(variation.stock || 0),
            status: variation.status,
          })),
      })),
    });
  } catch (error: any) {
    console.error('wholesale prices:', error);
    res.status(500).json({ error: 'Could not load wholesale prices.' });
  }
});

deps.app.put('/api/admin/wholesale/prices', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
  if (items.length === 0) return res.status(400).json({ error: 'Nothing to save.' });
  const saved: number[] = [];
  const errors: Array<{ id: number; name: string; error: string }> = [];

  for (const item of items) {
    const id = Number(item?.id);
    if (!id) continue;
    try {
      const current = (await db.select().from(products).where(eq(products.id, id)).limit(1))[0];
      if (!current) {
        errors.push({ id, name: `#${id}`, error: 'Product not found.' });
        continue;
      }
      const variationPrices: Array<{ id: number; price: number | null }> = [];
      for (const variation of Array.isArray(item.variations) ? item.variations : []) {
        const raw = variation?.wholesalePrice;
        const price = raw === '' || raw == null ? null : Number(raw);
        if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Enter valid wholesale prices for the options.');
        variationPrices.push({ id: Number(variation.id), price: price && price > 0 ? price : null });
      }

      // A product with options priced one by one needs no separate default:
      // the lowest option price becomes the product's wholesale price (the
      // "from" price in the wholesale catalogue).
      const patch: any = {
        wholesaleEnabled: item.wholesaleEnabled,
        wholesalePrice: item.wholesalePrice,
        wholesaleMinQty: item.wholesaleMinQty,
        wholesaleMaxQty: item.wholesaleMaxQty,
      };
      const optionPrices = variationPrices.map((entry) => entry.price).filter((price): price is number => price != null);
      const productPrice = patch.wholesalePrice === '' || patch.wholesalePrice == null ? null : Number(patch.wholesalePrice);
      if (!(productPrice && productPrice > 0) && optionPrices.length > 0) patch.wholesalePrice = Math.min(...optionPrices);

      const parsed = deps.parseWholesaleFields(patch, current);
      if ('error' in parsed) {
        errors.push({ id, name: current.name, error: parsed.error });
        continue;
      }
      await db.transaction(async (tx) => {
        await tx.update(products).set(parsed.values).where(eq(products.id, id));
        for (const entry of variationPrices) {
          if (!entry.id) continue;
          await tx
            .update(productVariations)
            .set({ wholesalePrice: entry.price != null ? entry.price.toFixed(2) : null })
            .where(and(eq(productVariations.id, entry.id), eq(productVariations.productId, id)));
        }
      });
      saved.push(id);
    } catch (error: any) {
      errors.push({ id, name: `#${id}`, error: error?.message || 'Could not save.' });
    }
  }
  deps.wholesaleIdsCache.at = 0;
  res.status(saved.length === 0 && errors.length > 0 ? 400 : 200).json({ success: errors.length === 0, saved: saved.length, errors });
});

/* --------------------------------------------------- admin notifications */

deps.app.get('/api/admin/notifications', async (req: any, res) => {
  try {
    const session = req.session as SessionPayload;
    if (session?.role !== 'admin') {
      // Staff: only the notifications that lead to a page they may open
      const mayOpen = (tab: string | null) => Boolean(tab) && canOpenTab(session, String(tab));
      const recent = await db.select().from(adminNotifications).orderBy(desc(adminNotifications.id)).limit(200);
      const mine = recent.filter((row) => mayOpen(row.linkTab));
      let newMessages = 0;
      let pendingWholesale = 0;
      if (hasModule(session, 'wholesale')) {
        const pending = await db
          .select({ count: sql<number>`count(*)` })
          .from(customers)
          .where(and(eq(customers.customerType, 'wholesale'), eq(customers.wholesaleStatus, 'pending')));
        pendingWholesale = Number(pending[0]?.count || 0);
      }
      if (hasModule(session, 'customers')) {
        try {
          newMessages = Number(deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'`))?.[0]?.n || 0);
        } catch {
          newMessages = 0;
        }
      }
      return res.json({
        notifications: mine.slice(0, 30),
        unread: mine.filter((row) => !row.isRead).length,
        pendingWholesale,
        newMessages,
      });
    }
    const rows = await db
      .select()
      .from(adminNotifications)
      .orderBy(desc(adminNotifications.id))
      .limit(30);
    const unread = await db
      .select({ count: sql<number>`count(*)` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false));
    const pendingWholesale = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.customerType, 'wholesale'), eq(customers.wholesaleStatus, 'pending')));
    let newMessages = 0;
    try {
      newMessages = Number(deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'`))?.[0]?.n || 0);
    } catch {
      newMessages = 0;
    }
    res.json({
      notifications: rows,
      unread: Number(unread[0]?.count || 0),
      pendingWholesale: Number(pendingWholesale[0]?.count || 0),
      newMessages,
    });
  } catch {
    res.json({ notifications: [], unread: 0, pendingWholesale: 0 });
  }
});

deps.app.post('/api/admin/notifications/read', async (req: any, res) => {
  try {
    const id = Number(req.body?.id);
    const session = req.session as SessionPayload;
    if (session?.role !== 'admin') {
      // Staff mark only their own notifications as read
      const open = await db
        .select({ id: adminNotifications.id, linkTab: adminNotifications.linkTab })
        .from(adminNotifications)
        .where(id ? eq(adminNotifications.id, id) : eq(adminNotifications.isRead, false));
      const ids = open.filter((row) => row.linkTab && canOpenTab(session, row.linkTab)).map((row) => row.id);
      if (ids.length > 0) await db.update(adminNotifications).set({ isRead: true }).where(inArray(adminNotifications.id, ids));
      return res.json({ success: true });
    }
    if (id) await db.update(adminNotifications).set({ isRead: true }).where(eq(adminNotifications.id, id));
    else await db.update(adminNotifications).set({ isRead: true }).where(eq(adminNotifications.isRead, false));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

  return { customerSessionUser, notifyAdmin };
}
