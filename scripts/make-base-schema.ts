/**
 * Writes src/server/base-schema.ts from database/database.sql.
 *   npx tsx scripts/make-base-schema.ts
 *
 * The server uses the list to create every core table that is missing when
 * it starts (v3.11) — so a fresh database works even if database.sql was
 * never imported, or an import stopped half-way. Existing tables are never
 * touched (CREATE TABLE IF NOT EXISTS).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // v3.14 — works when the folder name has spaces

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlText = fs.readFileSync(path.join(root, 'database', 'database.sql'), 'utf8');

const tables: Array<{ name: string; ddl: string }> = [];
const seen = new Set<string>();
const re = /CREATE TABLE (?:IF NOT EXISTS )?`([a-z0-9_]+)` \(([\s\S]*?)\n\s*\) ENGINE=([^;]+);/g;
let match: RegExpExecArray | null;
while ((match = re.exec(sqlText))) {
  const [, name, body, engine] = match;
  if (seen.has(name)) continue;
  seen.add(name);
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  tables.push({ name, ddl: `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  ${lines.join('\n  ')}\n) ENGINE=${engine.trim()}` });
}

const out = `/**
 * Core tables, generated from database/database.sql by scripts/make-base-schema.ts.
 * Do not edit by hand — edit database.sql and run the script again.
 *
 * ensureSchema() creates any of these that are missing (with foreign key
 * checks switched off for that one connection, so the order does not
 * matter). Existing tables and their data are never changed.
 */
export const BASE_TABLES: Array<{ name: string; ddl: string }> = ${JSON.stringify(tables, null, 2)};
`;
fs.writeFileSync(path.join(root, 'src', 'server', 'base-schema.ts'), out);
console.log(`base-schema.ts: ${tables.length} tables`);
