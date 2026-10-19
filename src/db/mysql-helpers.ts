import { eq, SQL } from 'drizzle-orm';

/**
 * MySQL has no `RETURNING` clause (that is a PostgreSQL feature), so these three
 * helpers reproduce exactly what `.returning()` used to give us: the affected
 * row(s), in the same array shape, so every API response stays unchanged.
 *
 * insertReturning  -> INSERT, then read the row back by LAST_INSERT_ID()
 * updateReturning  -> UPDATE, then re-read the rows matched by the same predicate
 * deleteReturning  -> read the rows first, then DELETE them
 *
 * All three accept either `db` or a transaction handle (`tx`), so they work
 * inside db.transaction(...) blocks the same way.
 */

type AnyDb = any;
type AnyTable = any;

const readInsertId = (result: any): number => {
  const meta = Array.isArray(result) ? result[0] : result;
  const id = meta?.insertId ?? meta?.lastInsertRowid ?? 0;
  return Number(id) || 0;
};

export async function insertReturning<T = any>(
  dbOrTx: AnyDb,
  table: AnyTable,
  values: any
): Promise<T[]> {
  const result = await dbOrTx.insert(table).values(values);

  // Tables keyed by something other than an auto-increment id (site_settings)
  if (!table.id) return [] as T[];

  const insertId = readInsertId(result);
  if (!insertId) return [] as T[];

  return (await dbOrTx.select().from(table).where(eq(table.id, insertId)).limit(1)) as T[];
}

export async function updateReturning<T = any>(
  dbOrTx: AnyDb,
  table: AnyTable,
  values: any,
  where: SQL | undefined
): Promise<T[]> {
  await dbOrTx.update(table).set(values).where(where);
  return (await dbOrTx.select().from(table).where(where)) as T[];
}

export async function deleteReturning<T = any>(
  dbOrTx: AnyDb,
  table: AnyTable,
  where: SQL | undefined
): Promise<T[]> {
  const rows = (await dbOrTx.select().from(table).where(where)) as T[];
  await dbOrTx.delete(table).where(where);
  return rows;
}
