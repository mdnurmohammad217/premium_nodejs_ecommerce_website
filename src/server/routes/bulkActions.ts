/**
 * Bulk actions — orders and products (status, courier, delete)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerBulkActionRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { orders, products } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import type * as Server from '../../../server.ts';


export interface RegisterBulkActionRoutesDeps {
  actorName: typeof Server.actorName;
  API_COURIERS: typeof Server.API_COURIERS;
  app: typeof Server.app;
  assignOrders: typeof Server.assignOrders;
  bookWithCourier: typeof Server.bookWithCourier;
  courierName: typeof Server.courierName;
  courierTrackingUrl: typeof Server.courierTrackingUrl;
  deleteOrderAndRestock: typeof Server.deleteOrderAndRestock;
  deleteProductForGood: typeof Server.deleteProductForGood;
  notifyOrderStatusSms: typeof Server.notifyOrderStatusSms;
  syncOrderStock: typeof Server.syncOrderStock;
}

export function registerBulkActionRoutes(deps: RegisterBulkActionRoutesDeps) {
// ===========================================================================
// BULK ACTIONS — orders and products
// ===========================================================================

function parseIds(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

deps.app.post('/api/admin/orders/bulk', async (req: any, res) => {
  const ids = parseIds(req.body?.ids);
  const action = String(req.body?.action || '');
  if (ids.length === 0) return res.status(400).json({ error: 'No orders selected.' });

  try {
    if (action === 'delete') {
      let removed = 0;
      for (const id of ids) {
        if (await deps.deleteOrderAndRestock(id, deps.actorName(req))) removed += 1;
      }
      return res.json({ success: true, affected: removed });
    }

    if (action === 'status') {
      const status = String(req.body?.status || '');
      const allowed = [
        'pending',
        'processing',
        'confirmed',
        'shipped',
        'on_hold',
        'delivered',
        'completed',
        'cancelled',
        'refunded',
        'returned',
        'partially_returned',
      ];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
      for (const id of ids) {
        const before = await db.select({ orderStatus: orders.orderStatus }).from(orders).where(eq(orders.id, id)).limit(1);
        if (before.length === 0) continue;
        await db.transaction(async (tx) => {
          await deps.syncOrderStock(tx, id, status, deps.actorName(req));
          await tx.update(orders).set({ orderStatus: status, updatedAt: new Date() }).where(eq(orders.id, id));
        });
        void deps.notifyOrderStatusSms(id, before[0]?.orderStatus);
      }
      return res.json({ success: true, affected: ids.length });
    }

    if (action === 'assign') {
      const result = await deps.assignOrders(ids, req.body?.staffId ?? null);
      return res.json({ success: true, ...result });
    }

    if (action === 'payment') {
      const paymentStatus = String(req.body?.paymentStatus || '');
      if (!['paid', 'unpaid', 'refunded'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'Unknown payment status.' });
      }
      for (const id of ids) {
        await db.update(orders).set({ paymentStatus, updatedAt: new Date() }).where(eq(orders.id, id));
      }
      return res.json({ success: true, affected: ids.length });
    }

    // Hand a whole selection to the courier in one go. Orders already dispatched
    // keep their existing consignment id rather than getting a second one.
    if (action === 'courier') {
      const courier = String(req.body?.courier || 'steadfast');
      const useApi = deps.API_COURIERS.includes(courier);
      if (!useApi && courier !== 'manual') {
        return res.status(400).json({
          error: `${courier.toUpperCase()} has no API connection here. Send those orders one by one with their consignment IDs.`,
        });
      }
      const dispatched: Array<{ id: number; orderNumber: string; consignmentId: string; trackingUrl: string }> = [];
      const failed: Array<{ id: number; orderNumber: string; error: string }> = [];
      let skipped = 0;

      for (const id of ids) {
        const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        const order = rows[0];
        if (!order) continue;
        // Cancelled/refunded orders, and orders that already have a parcel, are left alone
        if (['cancelled', 'refunded'].includes(order.orderStatus || '') || order.consignmentId) {
          skipped += 1;
          continue;
        }
        try {
          let consignment = `LOCAL-${order.orderNumber}`;
          let trackingCode: string | null = null;
          let courierStatus = 'in_transit';
          if (useApi) {
            const booked = await deps.bookWithCourier(courier, order);
            consignment = booked.consignmentId;
            trackingCode = booked.trackingCode || null;
            courierStatus = booked.courierStatus;
          }
          await db
            .update(orders)
            .set({
              orderStatus: ['delivered', 'completed'].includes(order.orderStatus || '') ? order.orderStatus : 'shipped',
              courierService: courier,
              consignmentId: consignment,
              trackingCode,
              courierStatus,
              courierSentAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(orders.id, id));
          void deps.notifyOrderStatusSms(order.id, order.orderStatus, {
            courier: courier === 'manual' ? 'our delivery team' : deps.courierName(courier),
            trackingUrl: deps.courierTrackingUrl(courier, consignment, trackingCode, order.orderNumber),
          });
          dispatched.push({
            id: order.id,
            orderNumber: order.orderNumber,
            consignmentId: consignment,
            trackingUrl: deps.courierTrackingUrl(courier, consignment, trackingCode, order.orderNumber),
          });
        } catch (error: any) {
          failed.push({ id: order.id, orderNumber: order.orderNumber, error: error?.message || 'failed' });
        }
      }

      return res.json({ success: true, affected: dispatched.length, skipped, dispatched, failed, courier });
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (error: any) {
    console.error('orders bulk:', error);
    res.status(500).json({ error: 'Could not complete the bulk action.' });
  }
});

deps.app.post('/api/admin/products/bulk', async (req, res) => {
  const ids = parseIds(req.body?.ids);
  const action = String(req.body?.action || '');
  if (ids.length === 0) return res.status(400).json({ error: 'No products selected.' });

  try {
    if (action === 'delete') {
      let affected = 0;
      for (const id of ids) {
        const result = await deps.deleteProductForGood(id);
        if (result !== 'missing') affected += 1;
      }
      return res.json({ success: true, affected });
    }

    if (action === 'status') {
      const status = String(req.body?.status || '');
      if (!['active', 'draft', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Unknown status.' });
      }
      for (const id of ids) {
        await db.update(products).set({ status }).where(eq(products.id, id));
      }
      return res.json({ success: true, affected: ids.length });
    }

    if (action === 'category') {
      const categoryId = Number(req.body?.categoryId) || null;
      for (const id of ids) {
        await db.update(products).set({ categoryId }).where(eq(products.id, id));
      }
      return res.json({ success: true, affected: ids.length });
    }

    if (action === 'flag') {
      const flag = String(req.body?.flag || '');
      const value = Boolean(req.body?.value);
      const map: Record<string, any> = {
        featured: { featured: value },
        flashSale: { isFlashSale: value },
        bestSeller: { isBestSeller: value },
        newArrival: { isNewArrival: value },
        freeShipping: { freeShipping: value },
      };
      if (!map[flag]) return res.status(400).json({ error: 'Unknown flag.' });
      for (const id of ids) {
        await db.update(products).set(map[flag]).where(eq(products.id, id));
      }
      return res.json({ success: true, affected: ids.length });
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (error: any) {
    console.error('products bulk:', error);
    res.status(500).json({ error: 'Could not complete the bulk action.' });
  }
});

  return {  };
}
