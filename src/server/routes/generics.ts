/**
 * Generic names
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerGenericRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { products, generics } from '../../db/schema.ts';
import { sql, eq, asc } from 'drizzle-orm';
import { insertReturning } from '../../db/mysql-helpers.ts';
import type * as Server from '../../../server.ts';


export interface RegisterGenericRoutesDeps {
  app: typeof Server.app;
}

export function registerGenericRoutes(deps: RegisterGenericRoutesDeps) {
// ==========================================
// GENERIC NAMES
// ==========================================
/**
 * Generic names (Paracetamol, Omeprazole…) are managed from the dashboard and
 * picked on the product form. Products store the name itself, so a product
 * page can link straight to /shop?generic=<name>. Names typed on products
 * before this list existed are imported into it the first time it is opened.
 */
deps.app.get('/api/admin/generics', async (_req, res) => {
  try {
    const used = await db
      .select({ name: products.genericName, count: sql<number>`count(*)` })
      .from(products)
      .where(sql`${products.genericName} IS NOT NULL AND ${products.genericName} <> '' AND ${products.status} <> 'deleted'`)
      .groupBy(products.genericName);
    const listed = await db.select().from(generics);
    const known = new Set(listed.map((row) => row.name.trim().toLowerCase()));
    const missing = used
      .map((row) => String(row.name || '').trim())
      .filter((name) => name && !known.has(name.toLowerCase()));
    for (const name of Array.from(new Set(missing))) {
      await db.insert(generics).values({ name }).catch(() => undefined);
    }
    const rows = missing.length > 0 ? await db.select().from(generics) : listed;
    const counts = new Map(used.map((row) => [String(row.name || '').trim().toLowerCase(), Number(row.count)]));
    res.json(
      rows
        .map((row) => ({ ...row, productCount: counts.get(row.name.trim().toLowerCase()) || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  } catch (error: any) {
    console.error('generics list:', error);
    res.status(500).json({ error: 'Could not load generic names.' });
  }
});

deps.app.post('/api/admin/generics', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Enter a generic name.' });
    const found = await db.select().from(generics).where(eq(generics.name, name)).limit(1);
    if (found.length > 0) return res.status(409).json({ error: `"${name}" is already in the list.` });
    const inserted = await insertReturning(db, generics, {
      name: name.slice(0, 191),
      description: String(req.body?.description || '').trim() || null,
    });
    res.json({ success: true, generic: { ...inserted[0], productCount: 0 } });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not add the generic name.' });
  }
});

/** Renaming a generic also renames it on every product that uses it */
deps.app.put('/api/admin/generics/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Enter a generic name.' });
    const rows = await db.select().from(generics).where(eq(generics.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Generic name not found.' });
    const clash = await db.select().from(generics).where(eq(generics.name, name)).limit(1);
    if (clash.length > 0 && clash[0].id !== id) return res.status(409).json({ error: `"${name}" is already in the list.` });

    const oldName = rows[0].name;
    await db
      .update(generics)
      .set({ name: name.slice(0, 191), description: String(req.body?.description || '').trim() || null })
      .where(eq(generics.id, id));
    let renamed = 0;
    if (oldName !== name) {
      const affected = await db.select({ id: products.id }).from(products).where(eq(products.genericName, oldName));
      renamed = affected.length;
      if (renamed > 0) await db.update(products).set({ genericName: name }).where(eq(products.genericName, oldName));
    }
    res.json({ success: true, renamedProducts: renamed });
  } catch {
    res.status(500).json({ error: 'Could not update the generic name.' });
  }
});

/** Removes the name from the list; products keep their text unless asked */
deps.app.delete('/api/admin/generics/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(generics).where(eq(generics.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Generic name not found.' });
    if (String(req.query.clearProducts) === '1') {
      await db.update(products).set({ genericName: null }).where(eq(products.genericName, rows[0].name));
    }
    await db.delete(generics).where(eq(generics.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete the generic name.' });
  }
});

/** Public list for the product form autocomplete and shop filters */
deps.app.get('/api/generics', async (_req, res) => {
  try {
    const rows = await db.select({ id: generics.id, name: generics.name }).from(generics).orderBy(asc(generics.name));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

  return {  };
}
