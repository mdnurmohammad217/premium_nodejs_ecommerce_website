/**
 * Returns — Sales → Returns
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerReturnRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { sql, or, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { orders, orderItems, products, inventoryTransactions } from '../../db/schema.ts';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';


export interface RegisterReturnRoutesDeps {
  app: typeof Server.app;
  attachItemImages: typeof Server.attachItemImages;
  sqlRows: typeof Server.sqlRows;
}

export function registerReturnRoutes(deps: RegisterReturnRoutesDeps) {
// ==========================================
// RETURNS — Sales → Returns
// ==========================================
/**
 * A return records which lines came back, how many, whether they went back
 * into stock, and the money refunded. Quantities can never exceed what was
 * bought minus what was already returned, so partial returns add up correctly.
 * Stock goes back exactly the way a sale took it out (product total, the
 * option's own stock, and an inventory log line).
 */
const RETURN_REASONS = ['Damaged / defective', 'Wrong item sent', 'Expired / near expiry', 'Customer changed mind', 'Delivery refused', 'Other'];
const REFUND_METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'bank', 'store_credit', 'none'];

async function nextReturnNumber(tx: any): Promise<string> {
  await tx.execute(sql`INSERT IGNORE INTO order_counters (name, value) VALUES ('returns', 1000)`);
  await tx.execute(sql`UPDATE order_counters SET value = value + 1 WHERE name = 'returns'`);
  const rows = deps.sqlRows(await tx.execute(sql`SELECT value FROM order_counters WHERE name = 'returns'`));
  return `RET-${Number(rows?.[0]?.value)}`;
}

/** Units of each order line already returned (by earlier returns) */
async function returnedSoFar(orderId: number, runner: any = db): Promise<Map<number, number>> {
  const rows = deps.sqlRows(await runner.execute(sql`SELECT items FROM order_returns WHERE order_id = ${orderId}`));
  const map = new Map<number, number>();
  rows.forEach((row: any) => {
    try {
      (JSON.parse(row.items) || []).forEach((line: any) => {
        map.set(Number(line.orderItemId), (map.get(Number(line.orderItemId)) || 0) + Number(line.quantity || 0));
      });
    } catch {
      /* skip a broken row */
    }
  });
  return map;
}

/** What can still be returned from an order — feeds the "New Return" form */
deps.app.get('/api/admin/returns/order', async (req, res) => {
  try {
    const key = String(req.query.q || '').trim();
    if (!key) return res.status(400).json({ error: 'Enter an order number.' });
    const orderRows = await db
      .select()
      .from(orders)
      .where(or(eq(orders.orderNumber, key), eq(orders.orderNumber, key.toUpperCase()), eq(orders.id, Number(key) || -1)))
      .limit(1);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: `No order found for "${key}".` });
    const items = await deps.attachItemImages(await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)));
    const already = await returnedSoFar(order.id);
    res.json({
      order,
      items: items.map((item) => ({
        ...item,
        returned: already.get(item.id) || 0,
        returnable: Math.max(0, Number(item.quantity) - (already.get(item.id) || 0)),
      })),
      reasons: RETURN_REASONS,
    });
  } catch (error: any) {
    console.error('return lookup:', error);
    res.status(500).json({ error: 'Could not load the order.' });
  }
});

deps.app.get('/api/admin/returns', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const where: any[] = [sql`1 = 1`];
    if (['received', 'refunded'].includes(status)) where.push(sql`status = ${status}`);
    if (search) {
      const term = `%${search}%`;
      where.push(sql`(return_number LIKE ${term} OR order_number LIKE ${term} OR customer_name LIKE ${term} OR customer_phone LIKE ${term})`);
    }
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT id, return_number AS returnNumber, order_id AS orderId, order_number AS orderNumber,
          customer_name AS customerName, customer_phone AS customerPhone, items, items_amount AS itemsAmount,
          refund_amount AS refundAmount, refund_method AS refundMethod, reason, note, restocked, status,
          created_by AS createdBy, created_at AS createdAt, refunded_at AS refundedAt
        FROM order_returns WHERE ${sql.join(where, sql` AND `)} ORDER BY id DESC LIMIT 500`)
    ).map((row: any) => {
      let items: any[] = [];
      try {
        items = JSON.parse(row.items) || [];
      } catch {
        items = [];
      }
      return { ...row, items, restocked: Boolean(row.restocked), createdAt: utcIso(row.createdAt), refundedAt: utcIso(row.refundedAt) };
    });
    const stats = deps.sqlRows(
      await db.execute(sql`SELECT
          COUNT(*) AS total,
          COALESCE(SUM(refund_amount), 0) AS refunded,
          COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN refund_amount ELSE 0 END), 0) AS refundedMonth,
          SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END) AS countMonth,
          SUM(status = 'received') AS pendingRefunds
        FROM order_returns`)
    )[0] || {};
    let units = 0;
    rows.forEach((row: any) => row.restocked && row.items.forEach((line: any) => (units += Number(line.quantity || 0))));
    res.json({
      returns: rows,
      stats: {
        total: Number(stats.total || 0),
        refunded: Number(stats.refunded || 0),
        refundedMonth: Number(stats.refundedMonth || 0),
        countMonth: Number(stats.countMonth || 0),
        pendingRefunds: Number(stats.pendingRefunds || 0),
        restockedUnits: units,
      },
      reasons: RETURN_REASONS,
    });
  } catch (error: any) {
    console.error('returns list:', error);
    res.status(500).json({ error: 'Could not load returns.' });
  }
});

deps.app.post('/api/admin/returns', async (req: any, res) => {
  try {
    const body = req.body || {};
    const orderId = Number(body.orderId);
    const requested: Array<{ orderItemId: number; quantity: number }> = Array.isArray(body.items) ? body.items : [];
    const restock = body.restock !== false;
    const refundMethod = REFUND_METHODS.includes(body.refundMethod) ? body.refundMethod : 'cash';
    const refundNow = Boolean(body.refundNow);
    const reason = String(body.reason || '').slice(0, 191);
    const note = String(body.note || '').slice(0, 2000);

    const result = await db.transaction(async (tx) => {
      const orderRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRows[0];
      if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
      const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const already = await returnedSoFar(orderId, tx);

      const returnLines: any[] = [];
      for (const request of requested) {
        const line = lines.find((item) => item.id === Number(request.orderItemId));
        const quantity = Math.floor(Number(request.quantity));
        if (!line || !(quantity >= 1)) continue;
        const left = Number(line.quantity) - (already.get(line.id) || 0);
        if (quantity > left) {
          throw Object.assign(new Error(`Only ${left} of "${line.productName}" can still be returned.`), { status: 400 });
        }
        returnLines.push({
          orderItemId: line.id,
          productId: line.productId,
          variationId: line.variationId,
          productName: line.productName,
          variationLabel: line.variationLabel,
          quantity,
          unitPrice: Number(line.unitPrice),
          amount: Math.round(Number(line.unitPrice) * quantity * 100) / 100,
        });
      }
      if (returnLines.length === 0) throw Object.assign(new Error('Choose at least one item to return.'), { status: 400 });

      const itemsAmount = returnLines.reduce((sum, line) => sum + line.amount, 0);
      const refundAmount =
        body.refundAmount !== undefined && body.refundAmount !== ''
          ? Math.max(0, Number(body.refundAmount) || 0)
          : itemsAmount;

      // The stock of a cancelled / returned order already went back with its status
      if (restock && !order.stockReleased) {
        for (const line of returnLines) {
          if (!line.productId) continue;
          const productRows = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
          if (productRows.length === 0) continue;
          const previous = Number(productRows[0].stock || 0);
          await tx.update(products).set({ stock: previous + line.quantity }).where(eq(products.id, line.productId));
          if (line.variationId) {
            await tx.execute(sql`UPDATE product_variations SET stock = stock + ${line.quantity} WHERE id = ${line.variationId}`);
          }
          await tx.insert(inventoryTransactions).values({
            productId: line.productId,
            type: 'return',
            quantity: line.quantity,
            previousStock: previous,
            newStock: previous + line.quantity,
            reference: `Return for ${order.orderNumber}`,
            notes: reason || 'Customer return',
            performedBy: req.session?.name || 'Admin',
          });
        }
      }

      const returnNumber = await nextReturnNumber(tx);
      await tx.execute(sql`INSERT INTO order_returns
          (return_number, order_id, order_number, customer_name, customer_phone, items, items_amount, refund_amount,
           refund_method, reason, note, restocked, status, created_by, refunded_at)
        VALUES (${returnNumber}, ${order.id}, ${order.orderNumber}, ${order.customerName}, ${order.customerPhone},
          ${JSON.stringify(returnLines)}, ${itemsAmount.toFixed(2)}, ${refundAmount.toFixed(2)}, ${refundMethod},
          ${reason || null}, ${note || null}, ${restock && !order.stockReleased ? 1 : 0}, ${refundNow ? 'refunded' : 'received'},
          ${req.session?.name || 'Admin'}, ${refundNow ? new Date() : null})`);

      // Whole order back → Returned; part of it → Partially returned
      const totalBought = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
      const totalBack =
        Array.from(already.values()).reduce((sum, value) => sum + value, 0) +
        returnLines.reduce((sum, line) => sum + line.quantity, 0);
      const orderPatch: any = {
        orderStatus: totalBack >= totalBought ? 'returned' : 'partially_returned',
        updatedAt: new Date(),
      };
      if (refundNow && totalBack >= totalBought) orderPatch.paymentStatus = 'refunded';
      await tx.update(orders).set(orderPatch).where(eq(orders.id, order.id));
      return { returnNumber, refundAmount, orderNumber: order.orderNumber };
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (!error?.status) console.error('return create:', error);
    res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not save the return.' });
  }
});

/** Mark a return refunded (or change the amount / method / note) */
deps.app.patch('/api/admin/returns/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const sets: any[] = [];
    if (body.status === 'refunded') sets.push(sql`status = 'refunded', refunded_at = NOW()`);
    if (body.status === 'received') sets.push(sql`status = 'received', refunded_at = NULL`);
    if (body.refundAmount !== undefined) sets.push(sql`refund_amount = ${Math.max(0, Number(body.refundAmount) || 0).toFixed(2)}`);
    if (REFUND_METHODS.includes(body.refundMethod)) sets.push(sql`refund_method = ${body.refundMethod}`);
    if (body.note !== undefined) sets.push(sql`note = ${String(body.note).slice(0, 2000) || null}`);
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to change.' });
    await db.execute(sql`UPDATE order_returns SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not update the return.' });
  }
});

/** Undo a return: stock taken back out again, the order's status restored */
deps.app.delete('/api/admin/returns/:id', async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      const rows = deps.sqlRows(await tx.execute(sql`SELECT * FROM order_returns WHERE id = ${id} LIMIT 1`));
      const row = rows[0];
      if (!row) throw Object.assign(new Error('Return not found.'), { status: 404 });
      let lines: any[] = [];
      try {
        lines = JSON.parse(row.items) || [];
      } catch {
        lines = [];
      }
      if (Number(row.restocked)) {
        for (const line of lines) {
          if (!line.productId) continue;
          const productRows = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
          if (productRows.length === 0) continue;
          const previous = Number(productRows[0].stock || 0);
          const next = Math.max(0, previous - Number(line.quantity));
          await tx.update(products).set({ stock: next }).where(eq(products.id, line.productId));
          if (line.variationId) {
            await tx.execute(sql`UPDATE product_variations SET stock = GREATEST(0, stock - ${Number(line.quantity)}) WHERE id = ${line.variationId}`);
          }
          await tx.insert(inventoryTransactions).values({
            productId: line.productId,
            type: 'adjustment',
            quantity: -Number(line.quantity),
            previousStock: previous,
            newStock: next,
            reference: `Return ${row.return_number} cancelled`,
            notes: 'Return undone',
            performedBy: req.session?.name || 'Admin',
          });
        }
      }
      await tx.execute(sql`DELETE FROM order_returns WHERE id = ${id}`);
      const remaining = deps.sqlRows(await tx.execute(sql`SELECT COUNT(*) AS n FROM order_returns WHERE order_id = ${row.order_id}`))[0];
      await tx
        .update(orders)
        .set({ orderStatus: Number(remaining?.n || 0) > 0 ? 'partially_returned' : 'delivered', updatedAt: new Date() })
        .where(eq(orders.id, Number(row.order_id)));
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not undo the return.' });
  }
});

  return { returnedSoFar };
}
