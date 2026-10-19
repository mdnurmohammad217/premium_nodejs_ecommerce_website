/**
 * Expenses (Dashboard → Expenses: list, categories, monthly report)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerExpenseRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { sql, eq, inArray, asc, and, or, like, desc, getTableColumns } from 'drizzle-orm';
import { insertReturning, updateReturning } from '../../db/mysql-helpers.ts';
import { expenses, users, orders, products, generics, orderItems, productVariations, reviews, productAttributes, inventoryTransactions, categories, suppliers, purchases, purchaseItems, coupons, heroBanners, brands, customers } from '../../db/schema.ts';
import { parseCharges } from '../../lib/shipping.ts';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';


export interface RegisterExpenseRoutesDeps {
  actorName: typeof Server.actorName;
  categoryAndDescendants: typeof Server.categoryAndDescendants;
  app: typeof Server.app;
  findVariationBarcodeClash: typeof Server.findVariationBarcodeClash;
  lockProductRows: typeof Server.lockProductRows;
  privateResponse: typeof Server.privateResponse;
  shopDay: typeof Server.shopDay;
  slugify: typeof Server.slugify;
  sqlRows: typeof Server.sqlRows;
  updateOne: typeof Server.updateOne;
}

export function registerExpenseRoutes(deps: RegisterExpenseRoutesDeps) {
// ===========================================================================
// v3.9 — EXPENSES (Dashboard → Expenses: Expense List, Categories, Monthly Report)
// Same `expenses` table the POS "Daily Expenses" module writes to, so both
// places show the same money. Categories have a colour and an optional
// monthly budget; renaming one renames it on every expense.
// ===========================================================================
const DEFAULT_EXPENSE_CATEGORIES: Array<[string, string]> = [
  ['Office Rent', '#6366f1'],
  ['Salary & Wages', '#0ea5e9'],
  ['Utilities', '#14b8a6'],
  ['Marketing & Ads', '#0891b2'],
  ['Transport & Delivery', '#f59e0b'],
  ['Packaging', '#a855f7'],
  ['Maintenance & Repairs', '#ef4444'],
  ['Office Supplies', '#22c55e'],
  ['Food & Entertainment', '#f97316'],
  ['Miscellaneous', '#64748b'],
];

let expenseCategoriesReady = false;
async function ensureExpenseCategories() {
  if (expenseCategoriesReady) return;
  const count = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM expense_categories`))[0];
  if (Number(count?.n) === 0) {
    let order = 0;
    for (const [name, color] of DEFAULT_EXPENSE_CATEGORIES) {
      order += 1;
      await db.execute(sql`INSERT IGNORE INTO expense_categories (name, color, sort_order) VALUES (${name}, ${color}, ${order})`);
    }
  }
  // Categories typed on older expenses (POS) become real categories
  await db.execute(sql`INSERT IGNORE INTO expense_categories (name, color, sort_order)
    SELECT DISTINCT e.category, '#64748b', 100 FROM expenses e
    WHERE e.category IS NOT NULL AND e.category <> '' AND e.category NOT IN (SELECT name FROM expense_categories)`);
  expenseCategoriesReady = true;
}

const monthKey = (day: string) => day.slice(0, 7);
function monthBounds(offset = 0): { from: string; to: string; label: string } {
  const today = deps.shopDay();
  const [y, m] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + offset, 1, 12));
  const first = date.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  return { from: first, to: end, label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

deps.app.get('/api/admin/expense-categories', async (_req, res) => {
  try {
    await ensureExpenseCategories();
    const thisMonth = monthBounds(0);
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT c.id, c.name, c.color, c.description, c.monthly_budget AS monthlyBudget, c.sort_order AS sortOrder,
          COUNT(e.id) AS expenseCount, COALESCE(SUM(e.amount), 0) AS totalAmount,
          COALESCE(SUM(CASE WHEN e.expense_date BETWEEN ${thisMonth.from} AND ${thisMonth.to} THEN e.amount ELSE 0 END), 0) AS thisMonth
        FROM expense_categories c LEFT JOIN expenses e ON e.category = c.name
        GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC`)
    );
    res.json(rows.map((row: any) => ({ ...row, expenseCount: Number(row.expenseCount) || 0, totalAmount: Number(row.totalAmount) || 0, thisMonth: Number(row.thisMonth) || 0 })));
  } catch (error: any) {
    console.error('expense categories:', error);
    res.status(500).json({ error: 'Could not load expense categories.' });
  }
});

const cleanColor = (value: any) => (/^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : '#64748b');
const cleanBudget = (value: any) => (value === '' || value == null || !(Number(value) > 0) ? null : Number(value).toFixed(2));

deps.app.post('/api/admin/expense-categories', async (req, res) => {
  try {
    await ensureExpenseCategories();
    const name = String(req.body?.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Enter a category name.' });
    const exists = deps.sqlRows(await db.execute(sql`SELECT id FROM expense_categories WHERE name = ${name} LIMIT 1`))[0];
    if (exists) return res.status(409).json({ error: 'A category with this name already exists.' });
    const max = deps.sqlRows(await db.execute(sql`SELECT COALESCE(MAX(sort_order), 0) AS m FROM expense_categories`))[0];
    await db.execute(sql`INSERT INTO expense_categories (name, color, description, monthly_budget, sort_order)
      VALUES (${name}, ${cleanColor(req.body?.color)}, ${String(req.body?.description || '').slice(0, 255) || null}, ${cleanBudget(req.body?.monthlyBudget)}, ${Number(max?.m || 0) + 1})`);
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('expense category create:', error);
    res.status(500).json({ error: 'Could not add the category.' });
  }
});

deps.app.put('/api/admin/expense-categories/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = deps.sqlRows(await db.execute(sql`SELECT * FROM expense_categories WHERE id = ${id} LIMIT 1`))[0];
    if (!current) return res.status(404).json({ error: 'Category not found.' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 100) : current.name;
    if (!name) return res.status(400).json({ error: 'Enter a category name.' });
    if (name !== current.name) {
      const clash = deps.sqlRows(await db.execute(sql`SELECT id FROM expense_categories WHERE name = ${name} AND id <> ${id} LIMIT 1`))[0];
      if (clash) return res.status(409).json({ error: 'Another category already has this name.' });
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE expense_categories SET name = ${name},
          color = ${req.body?.color !== undefined ? cleanColor(req.body.color) : current.color},
          description = ${req.body?.description !== undefined ? String(req.body.description).slice(0, 255) || null : current.description},
          monthly_budget = ${req.body?.monthlyBudget !== undefined ? cleanBudget(req.body.monthlyBudget) : current.monthly_budget}
        WHERE id = ${id}`);
      if (name !== current.name) await tx.execute(sql`UPDATE expenses SET category = ${name} WHERE category = ${current.name}`);
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('expense category update:', error);
    res.status(500).json({ error: 'Could not update the category.' });
  }
});

deps.app.delete('/api/admin/expense-categories/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = deps.sqlRows(await db.execute(sql`SELECT * FROM expense_categories WHERE id = ${id} LIMIT 1`))[0];
    if (!current) return res.status(404).json({ error: 'Category not found.' });
    const moveTo = String(req.query.moveTo || '').trim();
    const used = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM expenses WHERE category = ${current.name}`))[0];
    if (Number(used?.n) > 0) {
      if (!moveTo) return res.status(409).json({ error: `${used.n} expense(s) use this category. Choose another category to move them to.`, inUse: Number(used.n) });
      const target = deps.sqlRows(await db.execute(sql`SELECT name FROM expense_categories WHERE name = ${moveTo} AND id <> ${id} LIMIT 1`))[0];
      if (!target) return res.status(400).json({ error: 'Choose a valid category to move the expenses to.' });
      await db.execute(sql`UPDATE expenses SET category = ${target.name} WHERE category = ${current.name}`);
    }
    await db.execute(sql`DELETE FROM expense_categories WHERE id = ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('expense category delete:', error);
    res.status(500).json({ error: 'Could not delete the category.' });
  }
});

deps.app.get('/api/admin/expenses', async (req, res) => {
  try {
    await ensureExpenseCategories();
    const conditions: any[] = [];
    const category = String(req.query.category || '');
    if (category && category !== 'all') conditions.push(sql`e.category = ${category}`);
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) conditions.push(sql`e.expense_date >= ${from}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) conditions.push(sql`e.expense_date <= ${to}`);
    const method = String(req.query.method || '');
    if (method && method !== 'all') conditions.push(sql`e.payment_method = ${method}`);
    const search = String(req.query.search || '').trim();
    if (search) conditions.push(sql`(e.description LIKE ${`%${search}%`} OR e.category LIKE ${`%${search}%`} OR e.recorded_by LIKE ${`%${search}%`})`);
    const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(5, Number(req.query.pageSize) || 20));

    const totals = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n, COALESCE(SUM(e.amount), 0) AS total FROM expenses e ${where}`))[0];
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT e.id, e.category, e.description, e.amount, e.payment_method AS paymentMethod, e.expense_date AS expenseDate,
          e.recorded_by AS recordedBy, e.created_at AS createdAt, c.color
        FROM expenses e LEFT JOIN expense_categories c ON c.name = e.category
        ${where}
        ORDER BY e.expense_date DESC, e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`)
    );
    const thisMonth = monthBounds(0);
    const lastMonth = monthBounds(-1);
    const sums = deps.sqlRows(
      await db.execute(sql`SELECT COALESCE(SUM(amount), 0) AS allTime,
          COALESCE(SUM(CASE WHEN expense_date BETWEEN ${thisMonth.from} AND ${thisMonth.to} THEN amount ELSE 0 END), 0) AS thisMonth,
          COALESCE(SUM(CASE WHEN expense_date BETWEEN ${lastMonth.from} AND ${lastMonth.to} THEN amount ELSE 0 END), 0) AS lastMonth,
          COALESCE(SUM(CASE WHEN expense_date = ${deps.shopDay()} THEN amount ELSE 0 END), 0) AS today,
          COUNT(*) AS allCount
        FROM expenses`)
    )[0];
    res.json({
      rows: rows.map((row: any) => ({ ...row, amount: Number(row.amount) || 0, createdAt: utcIso(row.createdAt) })),
      total: Number(totals?.n) || 0,
      page,
      pageSize,
      stats: {
        allTime: Number(sums?.allTime) || 0,
        allCount: Number(sums?.allCount) || 0,
        visible: Number(totals?.total) || 0,
        thisMonth: Number(sums?.thisMonth) || 0,
        lastMonth: Number(sums?.lastMonth) || 0,
        today: Number(sums?.today) || 0,
        thisMonthLabel: thisMonth.label,
        lastMonthLabel: lastMonth.label,
      },
    });
  } catch (error: any) {
    console.error('expenses list:', error);
    res.status(500).json({ error: 'Could not load expenses.' });
  }
});

function cleanExpenseBody(body: any, actor: string) {
  const category = String(body?.category || '').trim().slice(0, 100);
  const amount = Number(body?.amount);
  const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.expenseDate || '')) ? String(body.expenseDate) : deps.shopDay();
  if (!category) return { error: 'Choose a category.' };
  if (!(amount > 0) || amount > 999_999_999) return { error: 'Enter a valid amount.' };
  return {
    values: {
      category,
      description: String(body?.description || '').trim().slice(0, 2000) || null,
      amount: amount.toFixed(2),
      paymentMethod: String(body?.paymentMethod || 'cash').slice(0, 32),
      expenseDate,
      recordedBy: actor,
    },
  };
}

deps.app.post('/api/admin/expenses', async (req: any, res) => {
  try {
    const cleaned = cleanExpenseBody(req.body, deps.actorName(req));
    if ('error' in cleaned) return res.status(400).json({ error: cleaned.error });
    await ensureExpenseCategories();
    await db.execute(sql`INSERT IGNORE INTO expense_categories (name, color, sort_order) VALUES (${cleaned.values!.category}, '#64748b', 100)`);
    const inserted = await insertReturning(db, expenses, cleaned.values);
    res.status(201).json({ success: true, expense: inserted[0] });
  } catch (error: any) {
    console.error('expense create:', error);
    res.status(500).json({ error: 'Could not add the expense.' });
  }
});

deps.app.put('/api/admin/expenses/:id', async (req: any, res) => {
  try {
    const cleaned = cleanExpenseBody(req.body, deps.actorName(req));
    if ('error' in cleaned) return res.status(400).json({ error: cleaned.error });
    const { recordedBy, ...values } = cleaned.values!;
    const row = await deps.updateOne(db, expenses, values, eq(expenses.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ success: true, expense: row });
  } catch (error: any) {
    console.error('expense update:', error);
    res.status(500).json({ error: 'Could not update the expense.' });
  }
});

deps.app.delete('/api/admin/expenses/:id', async (req, res) => {
  try {
    await db.delete(expenses).where(eq(expenses.id, Number(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete the expense.' });
  }
});

/** Monthly Report: a year's months, each category's share and the budget */
deps.app.get('/api/admin/expenses/monthly', async (req, res) => {
  try {
    await ensureExpenseCategories();
    const year = Math.min(2100, Math.max(2000, Number(req.query.year) || Number(deps.shopDay().slice(0, 4))));
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT SUBSTRING(expense_date, 1, 7) AS month, category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
        FROM expenses WHERE expense_date BETWEEN ${`${year}-01-01`} AND ${`${year}-12-31`}
        GROUP BY SUBSTRING(expense_date, 1, 7), category`)
    );
    const categories = deps.sqlRows(
      await db.execute(sql`SELECT name, color, monthly_budget AS monthlyBudget FROM expense_categories ORDER BY sort_order ASC, name ASC`)
    );
    const months = Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`;
      const list = rows.filter((row: any) => row.month === key);
      const byCategory: Record<string, number> = {};
      list.forEach((row: any) => (byCategory[row.category] = Number(row.total) || 0));
      return {
        month: key,
        label: new Date(Date.UTC(year, index, 1, 12)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        total: list.reduce((sum: number, row: any) => sum + (Number(row.total) || 0), 0),
        count: list.reduce((sum: number, row: any) => sum + (Number(row.n) || 0), 0),
        byCategory,
      };
    });
    const byCategory = categories.map((cat: any) => ({
      name: cat.name,
      color: cat.color,
      monthlyBudget: cat.monthlyBudget === null ? null : Number(cat.monthlyBudget),
      total: rows.filter((row: any) => row.category === cat.name).reduce((sum: number, row: any) => sum + (Number(row.total) || 0), 0),
    }));
    const years = deps.sqlRows(await db.execute(sql`SELECT DISTINCT SUBSTRING(expense_date, 1, 4) AS y FROM expenses ORDER BY y DESC`)).map((row: any) => Number(row.y));
    if (!years.includes(year)) years.unshift(year);
    res.json({ year, years, months, byCategory, total: months.reduce((sum, m) => sum + m.total, 0), currentMonth: monthKey(deps.shopDay()) });
  } catch (error: any) {
    console.error('expense monthly:', error);
    res.status(500).json({ error: 'Could not build the monthly report.' });
  }
});

/** v3.9 — give an order to a staff member (or take it back: staffId null) */
async function assignOrders(ids: number[], staffIdRaw: any): Promise<{ affected: number; name: string | null }> {
  const staffId = staffIdRaw === null || staffIdRaw === '' || staffIdRaw === undefined ? null : Number(staffIdRaw);
  let name: string | null = null;
  if (staffId !== null) {
    if (!Number.isFinite(staffId) || staffId <= 0) throw Object.assign(new Error('Choose a staff member.'), { status: 400 });
    const staff = (await db.select().from(users).where(eq(users.id, staffId)).limit(1))[0];
    if (!staff || staff.status !== 'active') throw Object.assign(new Error('That staff account is not active.'), { status: 400 });
    name = staff.name;
  }
  if (ids.length === 0) return { affected: 0, name };
  await db
    .update(orders)
    .set({ assignedTo: staffId, assignedName: name, assignedAt: staffId ? new Date() : null, updatedAt: new Date() })
    .where(inArray(orders.id, ids));
  return { affected: ids.length, name };
}

deps.app.patch('/api/admin/orders/:id/assign', async (req, res) => {
  try {
    const result = await assignOrders([Number(req.params.id)], req.body?.staffId);
    const order = (await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1))[0];
    res.json({ success: true, ...result, order });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not assign the order.' });
  }
});

/** Active staff for the "Assign to" pickers */
deps.app.get('/api/admin/orders-staff', async (_req, res) => {
  try {
    const rows = await db
      .select({ id: users.id, name: users.name, jobRole: users.jobRole, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.name));
    const counts = deps.sqlRows(
      await db.execute(sql`SELECT assigned_to AS id, COUNT(*) AS n FROM orders
        WHERE assigned_to IS NOT NULL AND order_status IN ('pending','processing','confirmed','on_hold','shipped') GROUP BY assigned_to`)
    );
    const open = new Map(counts.map((row: any) => [Number(row.id), Number(row.n) || 0]));
    res.json(rows.map((row) => ({ ...row, openOrders: open.get(row.id) || 0 })));
  } catch (error: any) {
    console.error('orders staff:', error);
    res.status(500).json({ error: 'Could not load staff.' });
  }
});

// Admin Product CRUD
/** Admin catalog: every product, whatever its status (the public list hides drafts). */
/**
 * v3.14 — `?all=1` returns EVERY product (no 500 cap: the Products page showed
 * "500" for a shop with 624). It sends a light row without the long texts
 * (description, how-to-use, highlights), which the edit form reads from
 * GET /api/admin/products/:id when it opens. Without `all`, the old capped
 * full-row list is kept for anything that still asks for it.
 */
const { description: _d, shortDescription: _sd, howToUse: _h, highlights: _hl, ...LIST_COLUMNS } = getTableColumns(products);
deps.app.get('/api/admin/products', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    if (String(req.query.all || '') === '1') {
      // v3.15 — pickers ask for a few matches (limit), or for given products (ids)
      const where: any[] = [NOT_DELETED];
      if (search) {
        where.push(
          or(
            like(products.name, `%${search}%`),
            like(products.sku, `%${search}%`),
            like(products.genericName, `%${search}%`),
            like(products.barcode, `%${search}%`)
          )
        );
      }
      const ids = String(req.query.ids || '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
        .slice(0, 500);
      if (ids.length) where.push(inArray(products.id, ids));
      if (req.query.status === 'active') where.push(eq(products.status, 'active'));
      const limit = Math.min(200000, Math.max(1, Math.floor(Number(req.query.limit)) || 200000));
      const rows = await db.select(LIST_COLUMNS).from(products).where(and(...where)).orderBy(desc(products.id)).limit(limit);
      deps.privateResponse(res);
      return res.json(rows);
    }
    const limit = Math.min(1000, Number(req.query.limit) || 500);
    const rows = search
      ? await db
          .select()
          .from(products)
          .where(
            and(
              NOT_DELETED,
              or(
                like(products.name, `%${search}%`),
                like(products.sku, `%${search}%`),
                like(products.genericName, `%${search}%`),
                like(products.barcode, `%${search}%`),
                // a variation's own barcode or SKU finds its product (v3.7)
                sql`${products.id} IN (SELECT product_id FROM product_variations WHERE barcode LIKE ${`%${search}%`} OR sku LIKE ${`%${search}%`})`
              )
            )
          )
          .orderBy(desc(products.id))
          .limit(limit)
      : await db.select().from(products).where(NOT_DELETED).orderBy(desc(products.id)).limit(limit);
    res.json(rows);
  } catch (error: any) {
    console.error('admin products:', error);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

/**
 * Wholesale fields of the product form, validated. Returns an error message
 * instead of values when the combination makes no sense, so a product can
 * never be switched to wholesale without a price a buyer could be charged.
 */
function parseWholesaleFields(p: any, current?: any): { values: Record<string, any> } | { error: string } {
  const touched = ['wholesaleEnabled', 'wholesalePrice', 'wholesaleMinQty', 'wholesaleMaxQty'].some(
    (key) => p[key] !== undefined
  );
  if (!touched) return { values: {} };

  const enabled = p.wholesaleEnabled !== undefined ? Boolean(p.wholesaleEnabled) : Boolean(current?.wholesaleEnabled);
  const priceRaw = p.wholesalePrice !== undefined ? p.wholesalePrice : current?.wholesalePrice;
  const price = priceRaw === '' || priceRaw == null ? null : Number(priceRaw);
  const intOrNull = (raw: any, fallback: any) => {
    const value = raw !== undefined ? raw : fallback;
    if (value === '' || value == null) return null;
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const minQty = intOrNull(p.wholesaleMinQty, current?.wholesaleMinQty);
  const maxQty = intOrNull(p.wholesaleMaxQty, current?.wholesaleMaxQty);

  if (price !== null && (!Number.isFinite(price) || price < 0)) return { error: 'Enter a valid wholesale price.' };
  if (enabled && !(price && price > 0)) return { error: 'Set a wholesale price to enable wholesale for this product.' };
  if (minQty && maxQty && maxQty < minQty) {
    return { error: 'Maximum wholesale quantity cannot be less than the minimum.' };
  }
  return {
    values: {
      wholesaleEnabled: enabled,
      wholesalePrice: price !== null ? price.toFixed(2) : null,
      wholesaleMinQty: minQty,
      wholesaleMaxQty: maxQty,
    },
  };
}

/** Keep the Generic Names list complete: a name typed on a product is added to it */
async function rememberGeneric(name: any) {
  const clean = String(name || '').trim();
  if (!clean) return;
  try {
    const found = await db.select({ id: generics.id }).from(generics).where(eq(generics.name, clean)).limit(1);
    if (found.length === 0) await db.insert(generics).values({ name: clean });
  } catch {
    /* a duplicate from a parallel save is harmless */
  }
}

/** Per-zone delivery charges from the product form → JSON column (blank = none) */
function shippingChargesValue(raw: any): string | null {
  const parsed = parseCharges(raw);
  return parsed ? JSON.stringify(parsed) : null;
}

/** v3.9 — product page extras sent by the product form, cleaned */
function productExtras(p: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (p.optionDisplay !== undefined) {
    const clean: Record<string, string> = {};
    if (p.optionDisplay && typeof p.optionDisplay === 'object') {
      for (const [name, mode] of Object.entries(p.optionDisplay)) {
        if (['text', 'image', 'color'].includes(String(mode))) clean[String(name).slice(0, 60)] = String(mode);
      }
    }
    out.optionDisplay = Object.keys(clean).length ? JSON.stringify(clean) : null;
  }
  if (p.highlights !== undefined) {
    const list = (Array.isArray(p.highlights) ? p.highlights : [])
      .map((item: any) => ({ icon: String(item?.icon || 'Sparkles').slice(0, 40), text: String(item?.text || '').trim().slice(0, 80) }))
      .filter((item: any) => item.text)
      .slice(0, 6);
    out.highlights = list.length ? JSON.stringify(list) : null;
  }
  if (p.howToUse !== undefined) out.howToUse = String(p.howToUse || '').trim().slice(0, 20000) || null;
  // v3.15 — SEO tab: meta title / description, share picture, tags
  if (p.seoTitle !== undefined) out.seoTitle = String(p.seoTitle || '').replace(/\s+/g, ' ').trim().slice(0, 191) || null;
  if (p.seoDescription !== undefined) out.seoDescription = String(p.seoDescription || '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  if (p.seoImage !== undefined) out.seoImage = String(p.seoImage || '').trim().slice(0, 2000) || null;
  if (p.tags !== undefined) {
    const list = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(','))
      .map((tag: any) => String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 40))
      .filter(Boolean);
    const unique = Array.from(new Map(list.map((tag: string) => [tag.toLowerCase(), tag])).values()).slice(0, 20);
    out.tags = unique.join(', ').slice(0, 500) || null;
  }
  return out;
}

deps.app.post('/api/admin/products', async (req, res) => {
  try {
    const p = req.body;
    const slug = p.slug || deps.slugify(p.name);
    const sku = p.sku || `MED-${Date.now().toString().slice(-6)}`;
    const wholesale = parseWholesaleFields(p);
    if ('error' in wholesale) return res.status(400).json({ error: wholesale.error });
    const variationClash = await deps.findVariationBarcodeClash([p.barcode, sku], null);
    if (variationClash) return res.status(400).json({ error: variationClash });

    const inserted = await insertReturning(db, products, {
        ...wholesale.values,
        name: p.name,
        genericName: p.genericName || null,
        slug,
        sku,
        barcode: p.barcode || null,
        categoryId: p.categoryId ? Number(p.categoryId) : null,
        brandId: p.brandId ? Number(p.brandId) : null,
        description: p.description || null,
        shortDescription: p.shortDescription || null,
        price: Number(p.price || 0).toFixed(2),
        salePrice: p.salePrice ? Number(p.salePrice).toFixed(2) : null,
        costPrice: p.costPrice ? Number(p.costPrice).toFixed(2) : '0.00',
        stock: Number(p.stock || 0),
        lowStockThreshold: Number(p.lowStockThreshold || 10),
        unit: p.unit || 'Strip',
        dosage: p.dosage || null,
        requiresPrescription: Boolean(p.requiresPrescription),
        batchNumber: p.batchNumber || null,
        expiryDate: p.expiryDate || null,
        featured: Boolean(p.featured),
        isFlashSale: Boolean(p.isFlashSale),
        isBestSeller: Boolean(p.isBestSeller),
        isNewArrival: Boolean(p.isNewArrival),
        image: p.image || null,
        images: typeof p.images === 'string' ? p.images : p.images ? JSON.stringify(p.images) : null,
        videoUrl: p.videoUrl ? String(p.videoUrl).trim().slice(0, 1000) : null,
        sizeGuideId: p.sizeGuideId ? Number(p.sizeGuideId) : null,
        freeShipping: Boolean(p.freeShipping),
        shippingCharges: shippingChargesValue(p.shippingCharges),
        status: p.status || 'active',
        ...productExtras(p),
      });

    await rememberGeneric(p.genericName);
    res.json({ success: true, product: inserted[0] });
  } catch (error: any) {
    console.error('Failed to create product:', error);
    res.status(500).json({ error: error.message || 'Failed to create product' });
  }
});

/**
 * v3.15 — the Products page asks for one page at a time: filters, sorting and
 * paging run in the database, and the summary numbers come from one SQL
 * count. Works the same with 50 products or 50 000 (the v3.14 page loaded the
 * whole catalogue into the browser, ~20 MB at 50 000 products).
 */
/** v3.15 — products per brand, counted in the database (Brands page) */
deps.app.get('/api/admin/brands/product-counts', async (_req, res) => {
  try {
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT brand_id AS brandId, COUNT(*) AS n FROM products WHERE status <> 'deleted' AND brand_id IS NOT NULL GROUP BY brand_id`)
    );
    deps.privateResponse(res);
    res.json(Object.fromEntries(rows.map((row: any) => [Number(row.brandId), Number(row.n) || 0])));
  } catch (error: any) {
    console.error('brand counts:', error);
    res.status(500).json({ error: 'Could not count products.' });
  }
});

deps.app.get('/api/admin/products/list', async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const where: any[] = [NOT_DELETED];
    const search = String(q.search || '').trim().slice(0, 100);
    if (search) {
      const term = `%${search}%`;
      where.push(
        or(
          like(products.name, term),
          like(products.sku, term),
          like(products.genericName, term),
          // v3.15 — product tags are searchable too
          like(products.tags, term),
          like(products.barcode, term),
          sql`${products.id} IN (SELECT product_id FROM product_variations WHERE barcode LIKE ${term} OR sku LIKE ${term})`
        )
      );
    }
    const status = String(q.status || 'all');
    if (status === 'unpublished') where.push(sql`${products.status} <> 'active'`);
    else if (['active', 'draft', 'archived'].includes(status)) where.push(eq(products.status, status));
    const categoryId = Number(q.category);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      const ids = await deps.categoryAndDescendants(categoryId);
      where.push(inArray(products.categoryId, ids.length ? ids : [categoryId]));
    }
    const brandId = Number(q.brand);
    if (Number.isInteger(brandId) && brandId > 0) where.push(eq(products.brandId, brandId));
    const lowThreshold = sql`COALESCE(${products.lowStockThreshold}, 10)`;
    switch (String(q.stock || 'all')) {
      case 'in':
        where.push(sql`${products.stock} > 0`);
        break;
      case 'low':
        where.push(sql`${products.stock} > 0 AND ${products.stock} <= ${lowThreshold}`);
        break;
      case 'out':
        where.push(sql`${products.stock} <= 0`);
        break;
      case 'wholesale':
        where.push(sql`${products.wholesaleEnabled} = 1 AND ${products.wholesalePrice} > 0`);
        break;
    }
    switch (String(q.flag || 'all')) {
      case 'free':
        where.push(sql`${products.freeShipping} = 1`);
        break;
      case 'video':
        where.push(sql`COALESCE(${products.videoUrl}, '') <> ''`);
        break;
      case 'variations':
        where.push(sql`${products.hasVariations} = 1`);
        break;
      case 'rx':
        where.push(sql`${products.requiresPrescription} = 1`);
        break;
      case 'featured':
        where.push(sql`${products.featured} = 1`);
        break;
      case 'sizeguide':
        where.push(sql`${products.sizeGuideId} IS NOT NULL`);
        break;
    }
    const dir = q.dir === 'asc' ? 'asc' : 'desc';
    const effectivePrice = sql`COALESCE(NULLIF(${products.salePrice}, 0), ${products.price})`;
    const order = (() => {
      switch (String(q.sort || 'newest')) {
        case 'oldest':
          return [asc(products.id)];
        case 'price':
          return [dir === 'asc' ? sql`${effectivePrice} ASC` : sql`${effectivePrice} DESC`, desc(products.id)];
        case 'stock':
          return [dir === 'asc' ? asc(products.stock) : desc(products.stock), desc(products.id)];
        case 'name':
          return [dir === 'asc' ? asc(products.name) : desc(products.name), desc(products.id)];
        default:
          return [desc(products.id)];
      }
    })();
    const pageSize = Math.min(200, Math.max(5, Math.floor(Number(q.pageSize)) || 20));
    const condition = and(...where);
    const [countRow] = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM products WHERE ${condition}`));
    const total = Number(countRow?.n || 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pageCount, Math.max(1, Math.floor(Number(q.page)) || 1));
    const rows = await db
      .select(LIST_COLUMNS)
      .from(products)
      .where(condition)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    // The cards at the top describe the whole catalogue, whatever is filtered
    const [summary] = deps.sqlRows(
      await db.execute(sql`SELECT COUNT(*) AS allCount,
          SUM(status = 'active') AS active, SUM(status = 'draft') AS draft, SUM(status = 'archived') AS archived,
          SUM(status <> 'active') AS unpublished, SUM(stock <= 0) AS outCount,
          SUM(stock > 0 AND stock <= COALESCE(low_stock_threshold, 10)) AS low,
          COALESCE(SUM(GREATEST(stock, 0) * COALESCE(NULLIF(cost_price, 0), NULLIF(sale_price, 0), price, 0)), 0) AS value
        FROM products WHERE status <> 'deleted'`)
    );
    deps.privateResponse(res);
    res.json({
      rows,
      total,
      page,
      pageSize,
      summary: {
        all: Number(summary?.allCount || 0),
        active: Number(summary?.active || 0),
        draft: Number(summary?.draft || 0),
        archived: Number(summary?.archived || 0),
        unpublished: Number(summary?.unpublished || 0),
        out: Number(summary?.outCount || 0),
        low: Number(summary?.low || 0),
        value: Number(summary?.value || 0),
      },
    });
  } catch (error: any) {
    console.error('admin product list:', error);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

/** v3.14 — one product with every field, for the edit form and Duplicate */
deps.app.get('/api/admin/products/:id', async (req, res, next) => {
  // Words such as /export or /import-latest belong to other routes
  if (!/^\d+$/.test(String(req.params.id))) return next();
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(products).where(and(NOT_DELETED, eq(products.id, id))).limit(1);
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    res.json(row);
  } catch (error: any) {
    console.error('admin product:', error);
    res.status(500).json({ error: 'Could not load the product.' });
  }
});

deps.app.put('/api/admin/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body;

    if (p.barcode || p.sku) {
      const variationClash = await deps.findVariationBarcodeClash([p.barcode, p.sku], Number(id));
      if (variationClash) return res.status(400).json({ error: variationClash });
    }

    const updateData: any = {};
    if (p.name !== undefined) updateData.name = p.name;
    if (p.genericName !== undefined) updateData.genericName = p.genericName;
    if (p.sku !== undefined) updateData.sku = p.sku;
    if (p.barcode !== undefined) updateData.barcode = p.barcode;
    if (p.categoryId !== undefined) updateData.categoryId = p.categoryId ? Number(p.categoryId) : null;
    if (p.brandId !== undefined) updateData.brandId = p.brandId ? Number(p.brandId) : null;
    if (p.description !== undefined) updateData.description = p.description;
    if (p.shortDescription !== undefined) updateData.shortDescription = p.shortDescription;
    if (p.price !== undefined) updateData.price = Number(p.price).toFixed(2);
    if (p.salePrice !== undefined) updateData.salePrice = p.salePrice ? Number(p.salePrice).toFixed(2) : null;
    if (p.costPrice !== undefined) updateData.costPrice = Number(p.costPrice || 0).toFixed(2);
    if (p.stock !== undefined) updateData.stock = Number(p.stock);
    if (p.lowStockThreshold !== undefined) updateData.lowStockThreshold = Number(p.lowStockThreshold);
    if (p.unit !== undefined) updateData.unit = p.unit;
    if (p.dosage !== undefined) updateData.dosage = p.dosage;
    if (p.requiresPrescription !== undefined) updateData.requiresPrescription = Boolean(p.requiresPrescription);
    if (p.batchNumber !== undefined) updateData.batchNumber = p.batchNumber;
    if (p.expiryDate !== undefined) updateData.expiryDate = p.expiryDate;
    if (p.featured !== undefined) updateData.featured = Boolean(p.featured);
    if (p.isFlashSale !== undefined) updateData.isFlashSale = Boolean(p.isFlashSale);
    if (p.isBestSeller !== undefined) updateData.isBestSeller = Boolean(p.isBestSeller);
    if (p.isNewArrival !== undefined) updateData.isNewArrival = Boolean(p.isNewArrival);
    if (p.image !== undefined) updateData.image = p.image;
    if (p.images !== undefined)
      updateData.images =
        typeof p.images === 'string' ? p.images : p.images ? JSON.stringify(p.images) : null;
    if (p.status !== undefined) updateData.status = p.status;
    if (p.videoUrl !== undefined) updateData.videoUrl = p.videoUrl ? String(p.videoUrl).trim().slice(0, 1000) : null;
    if (p.sizeGuideId !== undefined) updateData.sizeGuideId = p.sizeGuideId ? Number(p.sizeGuideId) : null;
    if (p.freeShipping !== undefined) updateData.freeShipping = Boolean(p.freeShipping);
    if (p.shippingCharges !== undefined) updateData.shippingCharges = shippingChargesValue(p.shippingCharges);
    Object.assign(updateData, productExtras(p));

    const currentRows = await db.select().from(products).where(eq(products.id, Number(id))).limit(1);
    if (currentRows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    const wholesale = parseWholesaleFields(p, currentRows[0]);
    if ('error' in wholesale) return res.status(400).json({ error: wholesale.error });
    Object.assign(updateData, wholesale.values);

    const updated = await updateReturning(db, products, updateData, eq(products.id, Number(id)));

    if (p.genericName !== undefined) await rememberGeneric(p.genericName);
    res.json({ success: true, product: updated[0] });
  } catch (error: any) {
    console.error('Failed to update product:', error);
    res.status(500).json({ error: error.message || 'Failed to update product' });
  }
});

/**
 * Deleting a product. It used to only switch the product to "inactive", so it
 * stayed in the dashboard list for ever. Now:
 *   • never sold / purchased → the product and its variations, attributes,
 *     reviews and stock log are removed completely;
 *   • part of an order, purchase or stock issue → it is marked "deleted": gone
 *     from the dashboard, shop, POS and every list, while past invoices keep
 *     their line (they carry their own name and price). Its slug and SKU are
 *     freed so a new product can use them.
 */
const NOT_DELETED = sql`${products.status} <> 'deleted'`;

async function productIsReferenced(id: number): Promise<boolean> {
  const hasRow = (result: any) => (Array.isArray(result?.[0]) ? result[0].length > 0 : Array.isArray(result) && result.length > 0);
  const checks = await Promise.all([
    db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).limit(1),
    db.execute(sql`SELECT 1 AS x FROM purchase_items WHERE product_id = ${id} LIMIT 1`),
    db.execute(sql`SELECT 1 AS x FROM purchase_return_items WHERE product_id = ${id} LIMIT 1`),
    db.execute(sql`SELECT 1 AS x FROM product_issues WHERE product_id = ${id} LIMIT 1`),
  ]);
  return (checks[0] as any[]).length > 0 || checks.slice(1).some(hasRow);
}

async function deleteProductForGood(id: number): Promise<'removed' | 'hidden' | 'missing'> {
  const found = (
    await db
      .select({ id: products.id, slug: products.slug, sku: products.sku, status: products.status })
      .from(products)
      .where(eq(products.id, id))
      .limit(1)
  )[0];
  if (!found) return 'missing';
  if (await productIsReferenced(id)) {
    if (found.status !== 'deleted') {
      await db
        .update(products)
        .set({
          status: 'deleted',
          featured: false,
          isFlashSale: false,
          isBestSeller: false,
          isNewArrival: false,
          slug: `${String(found.slug).slice(0, 150)}--deleted-${id}`,
          sku: `${String(found.sku).slice(0, 80)}-DEL${id}`,
        })
        .where(eq(products.id, id));
      await db.update(productVariations).set({ status: 'inactive' }).where(eq(productVariations.productId, id));
    }
    return 'hidden';
  }
  await db.transaction(async (tx) => {
    await tx.delete(reviews).where(eq(reviews.productId, id));
    await tx.delete(productAttributes).where(eq(productAttributes.productId, id));
    await tx.delete(productVariations).where(eq(productVariations.productId, id));
    await tx.delete(inventoryTransactions).where(eq(inventoryTransactions.productId, id));
    await tx.delete(products).where(eq(products.id, id));
  });
  return 'removed';
}

deps.app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const result = await deleteProductForGood(Number(req.params.id));
    if (result === 'missing') return res.status(404).json({ error: 'Product not found.' });
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Failed to delete product:', error);
    res.status(500).json({ error: 'Could not delete the product.' });
  }
});

// Admin Inventory Stock & Adjustments
/**
 * v3.15 — the stock list is filtered, searched and paged in the database and
 * sends only the columns the screen shows. It used to send every product with
 * every field (descriptions included) — hundreds of MB with 50 000 products,
 * and the dashboard asked for it each time it opened.
 *   ?filter=all|in|low|out|alert|expiring|expired  (alert = low + out)
 *   ?search=  ?page=  ?pageSize=  (default page size 25, max 500)
 */
deps.app.get('/api/admin/inventory', async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const threshold = sql`COALESCE(${products.lowStockThreshold}, 10)`;
    const where: any[] = [NOT_DELETED];
    switch (String(q.filter || 'all')) {
      case 'in':
        where.push(sql`${products.stock} > ${threshold}`);
        break;
      case 'low':
        where.push(sql`${products.stock} > 0 AND ${products.stock} <= ${threshold}`);
        break;
      case 'out':
        where.push(sql`${products.stock} <= 0`);
        break;
      case 'alert':
        where.push(sql`${products.stock} <= ${threshold}`);
        break;
      case 'expiring':
        where.push(sql`${products.expiryDate} IS NOT NULL AND ${products.expiryDate} >= CURDATE() AND ${products.expiryDate} <= (CURDATE() + INTERVAL 90 DAY)`);
        break;
      case 'expired':
        where.push(sql`${products.expiryDate} IS NOT NULL AND ${products.expiryDate} < CURDATE()`);
        break;
    }
    const search = String(q.search || '').trim().slice(0, 100);
    if (search) {
      const term = `%${search}%`;
      where.push(or(like(products.name, term), like(products.sku, term), like(products.batchNumber, term), like(products.barcode, term)));
    }
    const condition = and(...where);
    const pageSize = Math.min(500, Math.max(5, Math.floor(Number(q.pageSize)) || 25));
    const [countRow] = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM products WHERE ${condition}`));
    const total = Number(countRow?.n || 0);
    const page = Math.min(Math.max(1, Math.ceil(total / pageSize)), Math.max(1, Math.floor(Number(q.page)) || 1));
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        image: products.image,
        unit: products.unit,
        stock: products.stock,
        lowStockThreshold: products.lowStockThreshold,
        batchNumber: products.batchNumber,
        expiryDate: products.expiryDate,
        costPrice: products.costPrice,
        price: products.price,
        salePrice: products.salePrice,
        status: products.status,
        hasVariations: products.hasVariations,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(condition)
      .orderBy(asc(products.stock), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [stats] = deps.sqlRows(
      await db.execute(sql`SELECT COUNT(*) AS total,
          SUM(stock > COALESCE(low_stock_threshold, 10)) AS inStock,
          SUM(stock > 0 AND stock <= COALESCE(low_stock_threshold, 10)) AS low,
          SUM(stock <= 0) AS outCount,
          SUM(expiry_date IS NOT NULL AND expiry_date >= CURDATE() AND expiry_date <= (CURDATE() + INTERVAL 90 DAY)) AS expiring,
          SUM(expiry_date IS NOT NULL AND expiry_date < CURDATE()) AS expired,
          COALESCE(SUM(GREATEST(stock, 0) * COALESCE(cost_price, 0)), 0) AS value
        FROM products WHERE status <> 'deleted'`)
    );

    // Also get latest inventory transactions
    const transactions = await db
      .select({
        tx: inventoryTransactions,
        productName: products.name,
        sku: products.sku,
      })
      .from(inventoryTransactions)
      .leftJoin(products, eq(inventoryTransactions.productId, products.id))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(25);

    deps.privateResponse(res);
    res.json({
      stockList: rows.map((row) => ({ ...row, categoryName: row.categoryName || 'General' })),
      total,
      page,
      pageSize,
      stats: {
        total: Number(stats?.total || 0),
        inStock: Number(stats?.inStock || 0),
        low: Number(stats?.low || 0),
        out: Number(stats?.outCount || 0),
        expiring: Number(stats?.expiring || 0),
        expired: Number(stats?.expired || 0),
        value: Number(stats?.value || 0),
      },
      recentTransactions: transactions.map((t) => ({
        ...t.tx,
        productName: t.productName || 'Unknown',
        sku: t.sku || '',
      })),
    });
  } catch (error: any) {
    console.error('Failed to get inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Stock Adjustment API
deps.app.post('/api/admin/inventory/adjust', async (req, res) => {
  try {
    const { productId, adjustmentType, quantity, reason, notes, performedBy } = req.body;
    const numQty = Number(quantity);

    if (!productId || isNaN(numQty) || numQty === 0) {
      return res.status(400).json({ error: 'Valid Product ID and Quantity are required' });
    }

    const prodRows = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
    if (prodRows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentProd = prodRows[0];
    const prevStock = currentProd.stock;

    // Adjustment type: 'increase' or 'decrease' (e.g. damage, expired)
    let delta = numQty;
    if (adjustmentType === 'decrease' || adjustmentType === 'damage' || adjustmentType === 'expired') {
      delta = -Math.abs(numQty);
    } else {
      delta = Math.abs(numQty);
    }

    // v3.9 — read the stock again under a row lock, so a sale at the same
    // moment is never overwritten by the adjustment
    const { prevStock: lockedPrev, newStock } = await db.transaction(async (tx) => {
      const locked = (await tx.select().from(products).where(eq(products.id, currentProd.id)).limit(1).for('update'))[0];
      const before = Number(locked?.stock ?? prevStock);
      const after = Math.max(0, before + delta);
      await tx.update(products).set({ stock: after }).where(eq(products.id, currentProd.id));
      await tx.insert(inventoryTransactions).values({
        productId: currentProd.id,
        type: adjustmentType || 'adjustment',
        quantity: delta,
        previousStock: before,
        newStock: after,
        reference: reason || 'Manual Stock Adjustment',
        notes: notes || null,
        performedBy: performedBy || 'Inventory Manager',
      });
      return { prevStock: before, newStock: after };
    });

    res.json({ success: true, newStock, previousStock: lockedPrev });
  } catch (error: any) {
    console.error('Failed to adjust stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Admin Suppliers
deps.app.get('/api/admin/suppliers', async (_req, res) => {
  try {
    const data = await db.select().from(suppliers).orderBy(asc(suppliers.name));
    res.json(data);
  } catch (error: any) {
    console.error('Failed to get suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

deps.app.post('/api/admin/suppliers', async (req, res) => {
  try {
    const { name, phone, email, company, address } = req.body;
    const inserted = await insertReturning(db, suppliers, {
        name: name.trim(),
        phone: phone.trim(),
        email: email || null,
        company: company || null,
        address: address || null,
      });
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to add supplier:', error);
    res.status(500).json({ error: 'Failed to add supplier' });
  }
});

// Admin Purchases & Inward Stock Receiving
deps.app.get('/api/admin/purchases', async (_req, res) => {
  try {
    const data = await db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(50);
    res.json(data);
  } catch (error: any) {
    console.error('Failed to get purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

deps.app.post('/api/admin/purchases', async (req, res) => {
  try {
    const { supplierId, supplierName, items, notes, purchaseDate } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Purchase items required' });
    }

    const result = await db.transaction(async (tx) => {
      let total = 0;
      for (const item of items) {
        total += Number(item.unitCost) * Number(item.quantity);
      }
      await deps.lockProductRows(tx, items.map((item: any) => item.productId));

      const invoiceNumber = `PUR-${Date.now().toString().slice(-6)}`;

      const inserted = await insertReturning(tx, purchases, {
          invoiceNumber,
          supplierId: supplierId ? Number(supplierId) : null,
          supplierName: supplierName || 'General Supplier',
          total: total.toFixed(2),
          paid: total.toFixed(2),
          status: 'completed',
          purchaseDate: purchaseDate || deps.shopDay(),
          notes,
        });

      const createdPurchase = inserted[0];

      for (const item of items) {
        const prod = await tx.select().from(products).where(eq(products.id, Number(item.productId))).limit(1).for('update');
        if (prod.length > 0) {
          const prev = prod[0].stock;
          const qty = Number(item.quantity);
          const newStock = prev + qty;

          await tx
            .update(products)
            .set({
              stock: newStock,
              costPrice: Number(item.unitCost).toFixed(2),
              batchNumber: item.batchNumber || prod[0].batchNumber,
              expiryDate: item.expiryDate || prod[0].expiryDate,
            })
            .where(eq(products.id, prod[0].id));

          await tx.insert(purchaseItems).values({
            purchaseId: createdPurchase.id,
            productId: prod[0].id,
            productName: prod[0].name,
            quantity: qty,
            unitCost: Number(item.unitCost).toFixed(2),
            subtotal: (qty * Number(item.unitCost)).toFixed(2),
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
          });

          await tx.insert(inventoryTransactions).values({
            productId: prod[0].id,
            type: 'purchase',
            quantity: qty,
            previousStock: prev,
            newStock: newStock,
            reference: invoiceNumber,
            notes: `Purchase Inward #${invoiceNumber}`,
            performedBy: 'Procurement',
          });
        }
      }

      return createdPurchase;
    });

    res.json({ success: true, purchase: result });
  } catch (error: any) {
    console.error('Failed to create purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to record purchase' });
  }
});

// Admin Coupons List & Management
deps.app.get('/api/admin/coupons', async (_req, res) => {
  try {
    const data = await db.select().from(coupons).orderBy(desc(coupons.id));
    res.json(data);
  } catch (error: any) {
    console.error('Failed to get coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

/** v3.11 — one cleaner for creating and editing a coupon (0 / blank limit = unlimited, blank expiry = never) */
function cleanCouponInput(body: any): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  const code = String(body?.code || '').toUpperCase().trim().replace(/\s+/g, '').slice(0, 64);
  if (!code || !/^[A-Z0-9_-]+$/.test(code)) return { ok: false, error: 'Use letters, numbers, - or _ for the coupon code.' };
  const type = body?.type === 'fixed' ? 'fixed' : 'percentage';
  const value = Number(body?.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter a discount greater than 0.' };
  if (type === 'percentage' && value > 100) return { ok: false, error: 'Percentage cannot be more than 100.' };
  const minOrder = Math.max(0, Number(body?.minOrder) || 0);
  const maxDiscount = Number(body?.maxDiscount) > 0 ? Number(body.maxDiscount) : null;
  const usageLimit = Math.max(0, Math.floor(Number(body?.usageLimit) || 0));
  const expiry = String(body?.expiresAt || '').trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { ok: false, error: 'Pick a valid expiry date.' };
  const status = ['active', 'inactive', 'paused'].includes(String(body?.status)) ? String(body.status) : 'active';
  return {
    ok: true,
    value: {
      code,
      type,
      value: value.toFixed(2),
      minOrder: minOrder.toFixed(2),
      maxDiscount: maxDiscount !== null ? maxDiscount.toFixed(2) : null,
      usageLimit,
      expiresAt: expiry || null,
      status,
    },
  };
}

deps.app.post('/api/admin/coupons', async (req, res) => {
  try {
    const clean = cleanCouponInput(req.body);
    if ('error' in clean) return res.status(400).json({ error: clean.error });
    const taken = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, clean.value.code)).limit(1);
    if (taken.length > 0) return res.status(409).json({ error: `A coupon with the code ${clean.value.code} already exists.` });
    const inserted = await insertReturning(db, coupons, { ...clean.value, usedCount: 0 } as any);
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// Admin Hero Banners Management
deps.app.post('/api/admin/banners', async (req, res) => {
  try {
    const b = req.body;
    if (!b || !b.imageUrl) {
      return res.status(400).json({ error: 'Banner image (imageUrl) is required.' });
    }
    const inserted = await insertReturning(db, heroBanners, {
        title: b.title || null,
        subtitle: b.subtitle || null,
        badge: b.badge || null,
        buttonText: b.buttonText || null,
        buttonUrl: b.buttonUrl || null,
        imageUrl: b.imageUrl,
        mobileImageUrl: b.mobileImageUrl || null,
        bgGradient: b.bgGradient || null,
        sortOrder: Number(b.sortOrder || 0),
        status: b.status || 'active',
      });
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to add banner:', error);
    res.status(500).json({ error: 'Failed to add banner' });
  }
});

// Admin Categories CRUD
deps.app.post('/api/admin/categories', async (req, res) => {
  try {
    const { name, description, icon, image, featured, showOnHome, parentId, sortOrder } = req.body;
    const slug =
      req.body.slug || deps.slugify(name);

    // Depth is taken from the parent so the tree can never exceed 3 levels
    let level = 1;
    if (parentId) {
      const parentRows = await db
        .select()
        .from(categories)
        .where(eq(categories.id, Number(parentId)))
        .limit(1);

      if (parentRows.length === 0) {
        return res.status(400).json({ error: 'Parent category not found.' });
      }
      level = (parentRows[0].level || 1) + 1;
      if (level > 3) {
        return res.status(400).json({ error: 'Categories can only be nested up to 3 levels.' });
      }
    }

    const inserted = await insertReturning(db, categories, {
        name,
        slug,
        description: description || null,
        icon: icon || 'Pill',
        image: image || null,
        featured: Boolean(featured),
        showOnHome: Boolean(showOnHome),
        parentId: parentId ? Number(parentId) : null,
        level,
        sortOrder: Number(sortOrder || 0),
      });
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Admin Brands CRUD
deps.app.post('/api/admin/brands', async (req, res) => {
  try {
    const { name, description, logo } = req.body;
    const slug = req.body.slug || deps.slugify(name);
    const inserted = await insertReturning(db, brands, {
        name,
        slug,
        description: description || null,
        logo: logo || null,
      });
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create brand:', error);
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

// Admin Customers List
/** Customer rows for the dashboard: never the password hash, only whether one is set */
const customerForAdmin = (row: any) => {
  if (!row) return row;
  const { passwordHash, ...rest } = row;
  return { ...rest, hasPassword: Boolean(passwordHash) };
};

/**
 * v3.15 — the Customers page asks for one page at a time (search, filters,
 * sorting and the totals run in the database), so it stays fast with
 * hundreds of thousands of customers.
 */
deps.app.get('/api/admin/customers/list', async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const where: any[] = [sql`1 = 1`];
    const search = String(q.search || '').trim().slice(0, 100);
    if (search) {
      const term = `%${search}%`;
      where.push(or(like(customers.name, term), like(customers.phone, term), like(customers.email, term)));
    }
    const registered = sql`(COALESCE(${customers.email}, '') <> '' OR ${customers.passwordHash} IS NOT NULL)`;
    if (q.type === 'registered') where.push(registered);
    if (q.type === 'guest') where.push(sql`NOT ${registered}`);
    if (q.status === 'active') where.push(sql`COALESCE(${customers.status}, 'active') = 'active'`);
    else if (q.status && q.status !== 'all') where.push(eq(customers.status, String(q.status)));
    const order = (() => {
      switch (String(q.sort || 'spend_desc')) {
        case 'spend_asc':
          return [asc(customers.totalSpent), desc(customers.id)];
        case 'orders_desc':
          return [desc(customers.totalOrders), desc(customers.id)];
        case 'newest':
          return [desc(customers.id)];
        case 'name_asc':
          return [asc(customers.name), desc(customers.id)];
        default:
          return [desc(customers.totalSpent), desc(customers.id)];
      }
    })();
    const pageSize = Math.min(200, Math.max(5, Math.floor(Number(q.pageSize)) || 10));
    const condition = and(...where);
    const [countRow] = deps.sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM customers WHERE ${condition}`));
    const total = Number(countRow?.n || 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pageCount, Math.max(1, Math.floor(Number(q.page)) || 1));
    const rows = await db.select().from(customers).where(condition).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);
    const [stats] = deps.sqlRows(
      await db.execute(sql`SELECT COUNT(*) AS total, SUM(COALESCE(status, 'active') = 'active') AS active, SUM(status = 'blocked') AS blocked,
          SUM(total_orders > 1) AS repeatCount, COALESCE(SUM(total_spent), 0) AS spend FROM customers`)
    );
    deps.privateResponse(res);
    res.json({
      rows: rows.map(customerForAdmin),
      total,
      page,
      pageSize,
      stats: {
        total: Number(stats?.total || 0),
        active: Number(stats?.active || 0),
        blocked: Number(stats?.blocked || 0),
        repeat: Number(stats?.repeatCount || 0),
        spend: Number(stats?.spend || 0),
      },
    });
  } catch (error: any) {
    console.error('customer list:', error);
    res.status(500).json({ error: 'Could not load customers.' });
  }
});

deps.app.get('/api/admin/customers', async (_req, res) => {
  try {
    const data = await db.select().from(customers).orderBy(desc(customers.totalSpent));
    deps.privateResponse(res);
    res.json(data.map(customerForAdmin));
  } catch (error: any) {
    console.error('Failed to get customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

  return { NOT_DELETED, assignOrders, cleanCouponInput, customerForAdmin, deleteProductForGood, parseWholesaleFields, productExtras, rememberGeneric, shippingChargesValue };
}
