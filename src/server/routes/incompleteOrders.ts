/**
 * Incomplete / abandoned checkouts
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerIncompleteOrderRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { abandonedCheckouts, products, productVariations } from '../../db/schema.ts';
import { desc, eq, and } from 'drizzle-orm';
import type * as Server from '../../../server.ts';


export interface RegisterIncompleteOrderRoutesDeps {
  app: typeof Server.app;
  attachItemImages: typeof Server.attachItemImages;
  clientIp: typeof Server.clientIp;
  deleteOne: typeof Server.deleteOne;
  INTERNAL_ORDER_KEY: typeof Server.INTERNAL_ORDER_KEY;
  PORT: typeof Server.PORT;
}

export function registerIncompleteOrderRoutes(deps: RegisterIncompleteOrderRoutesDeps) {
// ===========================================================================
// INCOMPLETE / ABANDONED CHECKOUTS
// The storefront posts here as the shopper fills the checkout form. Nothing is
// created in `orders`, so All Orders only ever shows real orders.
// ===========================================================================

deps.app.post('/api/checkout/track', async (req, res) => {
  try {
    const { sessionKey, customerName, customerPhone, customerAddress, shippingZone, paymentMethod, items } =
      req.body || {};
    if (!sessionKey) return res.status(400).json({ error: 'session key required' });

    // Nothing worth recording until they have typed something identifying
    const phone = String(customerPhone || '').replace(/[\s-]+/g, '');
    const hasSomething = Boolean(String(customerName || '').trim() || phone);
    if (!hasSomething) return res.json({ ok: true, skipped: true });

    const list = Array.isArray(items) ? items : [];
    const cartTotal = list.reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    const values = {
      sessionKey: String(sessionKey).slice(0, 64),
      customerName: customerName || null,
      customerPhone: phone || null,
      customerAddress: customerAddress || null,
      shippingZone: shippingZone || null,
      district: req.body?.district ? String(req.body.district).slice(0, 64) : null,
      thana: req.body?.thana ? String(req.body.thana).slice(0, 100) : null,
      paymentMethod: paymentMethod || null,
      items: JSON.stringify(list).slice(0, 600000),
      itemCount: list.reduce((sum: number, item: any) => sum + Number(item.quantity || 1), 0),
      cartTotal: cartTotal.toFixed(2),
      ipAddress: deps.clientIp(req) || null,
      status: 'active',
      updatedAt: new Date(),
    };

    await db
      .insert(abandonedCheckouts)
      .values(values)
      .onDuplicateKeyUpdate({ set: { ...values, sessionKey: undefined as any } });

    res.json({ ok: true });
  } catch (error: any) {
    // Never let tracking break a checkout
    res.json({ ok: false });
  }
});

deps.app.get('/api/admin/incomplete-orders', async (req, res) => {
  try {
    const status = String(req.query.status || 'active');
    const rows =
      status === 'all'
        ? await db.select().from(abandonedCheckouts).orderBy(desc(abandonedCheckouts.updatedAt)).limit(300)
        : await db
            .select()
            .from(abandonedCheckouts)
            .where(eq(abandonedCheckouts.status, status))
            .orderBy(desc(abandonedCheckouts.updatedAt))
            .limit(300);

    // The snapshot's picture is whatever the browser had (often empty for
    // options or gallery-only products): fill it in from the catalogue.
    const parsed = rows.map((row) => {
      try {
        return { row, items: row.items ? JSON.parse(row.items) : [] };
      } catch {
        return { row, items: [] };
      }
    });
    const allLines = parsed.flatMap((entry) => entry.items as any[]);
    const enriched = await deps.attachItemImages(
      allLines.map((line: any) => ({ productId: Number(line.productId) || null, variationId: Number(line.variationId) || null }))
    );
    let cursor = 0;
    res.json(
      parsed.map(({ row, items }) => ({
        ...row,
        items: (items as any[]).map((line: any) => {
          const extra = enriched[cursor++];
          return { ...line, image: line.image || extra?.image || '', productSlug: extra?.productSlug || null };
        }),
      }))
    );
  } catch (error: any) {
    console.error('incomplete orders:', error);
    res.status(500).json({ error: 'Could not load incomplete orders.' });
  }
});

/**
 * Turn an incomplete checkout into a real order. Goes through the normal
 * order route, so stock, current prices, shipping and customer records work
 * exactly as for a website order. The dashboard may correct the details and
 * quantities first; a line whose option was not recorded is matched by its
 * option label, or the dashboard is asked to pick one.
 */
deps.app.post('/api/admin/incomplete-orders/:id/convert', async (req, res) => {
  try {
    const rows = await db.select().from(abandonedCheckouts).where(eq(abandonedCheckouts.id, Number(req.params.id))).limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Incomplete order not found.' });
    if (row.status === 'recovered' && row.recoveredOrderId) {
      return res.status(409).json({ error: 'This checkout was already converted into an order.', orderId: row.recoveredOrderId });
    }
    const body = req.body || {};
    let snapshot: any[] = [];
    try {
      snapshot = row.items ? JSON.parse(row.items) : [];
    } catch {
      snapshot = [];
    }
    const requested: any[] = Array.isArray(body.items) && body.items.length > 0 ? body.items : snapshot;

    const lines: Array<{ productId: number; variationId?: number; quantity: number }> = [];
    const needChoice: Array<{ index: number; productId: number; name: string; options: Array<{ id: number; label: string; stock: number }> }> = [];
    for (let index = 0; index < requested.length; index += 1) {
      const line = requested[index];
      const productId = Number(line.productId);
      const quantity = Math.floor(Number(line.quantity));
      if (!productId || !(quantity >= 1)) continue;
      const productRows = await db
        .select({ id: products.id, name: products.name, hasVariations: products.hasVariations })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (productRows.length === 0) continue;
      let variationId = Number(line.variationId) || undefined;
      if (!variationId && productRows[0].hasVariations) {
        const options = await db
          .select({ id: productVariations.id, label: productVariations.label, stock: productVariations.stock })
          .from(productVariations)
          .where(and(eq(productVariations.productId, productId), eq(productVariations.status, 'active')));
        const label = String(line.variationLabel || '').trim().toLowerCase();
        const match = label ? options.find((option) => option.label.trim().toLowerCase() === label) : undefined;
        if (match) variationId = match.id;
        else {
          needChoice.push({ index, productId, name: productRows[0].name, options });
          continue;
        }
      }
      lines.push({ productId, variationId, quantity });
    }
    if (needChoice.length > 0) {
      return res.status(422).json({ error: 'Choose the option for each highlighted product.', needChoice });
    }
    if (lines.length === 0) return res.status(400).json({ error: 'There is nothing left in this cart to order.' });

    const payload = {
      customerName: String(body.customerName ?? row.customerName ?? '').trim(),
      customerPhone: String(body.customerPhone ?? row.customerPhone ?? '').trim(),
      customerAddress: String(body.customerAddress ?? row.customerAddress ?? '').trim(),
      shippingZone: body.shippingZone ?? row.shippingZone ?? undefined,
      paymentMethod: body.paymentMethod ?? row.paymentMethod ?? 'cod',
      notes: [String(body.note || '').trim(), '[Converted from an incomplete checkout by the shop]'].filter(Boolean).join('\n'),
      checkoutSessionKey: row.sessionKey,
      items: lines,
    };
    if (!payload.customerName || !payload.customerPhone || !payload.customerAddress) {
      return res.status(400).json({ error: 'Name, phone and address are needed to place the order.' });
    }

    const response = await fetch(`http://127.0.0.1:${deps.PORT}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-order-key': deps.INTERNAL_ORDER_KEY,
        // Keep the shopper's own IP on the order, not the server's
        ...(row.ipAddress ? { 'x-real-ip': row.ipAddress } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || !data?.order) {
      return res.status(response.status >= 400 ? response.status : 400).json({ error: data?.error || 'Could not create the order.' });
    }
    // The order route closes the row by session key; make sure it is linked
    await db
      .update(abandonedCheckouts)
      .set({ status: 'recovered', recoveredOrderId: data.order.id })
      .where(eq(abandonedCheckouts.id, row.id));
    res.json({ success: true, order: data.order });
  } catch (error: any) {
    console.error('convert incomplete:', error);
    res.status(500).json({ error: 'Could not convert this checkout.' });
  }
});

deps.app.delete('/api/admin/incomplete-orders/:id', async (req, res) => {
  try {
    const row = await deps.deleteOne(db, abandonedCheckouts, eq(abandonedCheckouts.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete.' });
  }
});

  return {  };
}
