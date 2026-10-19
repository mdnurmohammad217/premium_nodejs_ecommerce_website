import * as dotenv from 'dotenv';

/**
 * v3.12 — drizzle-kit is no longer installed with the shop (it pulled in an old
 * esbuild that hosting security scanners flag). Run it on demand:
 *   npx drizzle-kit@0.31 generate --config=src/db/drizzle.config.ts
 */

dotenv.config();

/**
 * v3.11 — `drizzle-kit push` is blocked on purpose.
 * The shop upgrades its own database every time it starts (ensureSchema in
 * server.ts — additive only, never drops anything). drizzle-kit push does
 * not understand MariaDB / Hostinger MySQL fully: tested on a copy of a live
 * database it wanted to TRUNCATE the products, orders and customers tables
 * and drop indexes. `drizzle-kit generate` / `studio` still work.
 * (Set DRIZZLE_ALLOW_PUSH=1 only on an empty throw-away database.)
 */
if (process.argv.some((arg) => arg === 'push' || arg === 'drop') && process.env.DRIZZLE_ALLOW_PUSH !== '1') {
  throw new Error(
    'drizzle-kit push/drop is disabled for this project: the app upgrades its own database safely on start. ' +
      'Running push against a shop database can TRUNCATE tables. See src/db/drizzle.config.ts.'
  );
}

const host = process.env.DB_HOST || process.env.SQL_HOST;
const database = process.env.DB_NAME || process.env.SQL_DB_NAME;
const user = process.env.DB_USER || process.env.SQL_USER;
const password = process.env.DB_PASSWORD || process.env.SQL_PASSWORD;

if (!host) throw new Error('DB_HOST must be set in environment variables.');
if (!database) throw new Error('DB_NAME must be set in environment variables.');
if (!user) throw new Error('DB_USER must be set in environment variables.');

export default {
  // v3.11 — schema-extra.ts holds the tables used through plain SQL, so
  // drizzle-kit never offers to drop them
  schema: ['./src/db/schema.ts', './src/db/schema-extra.ts'],
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host,
    port: Number(process.env.DB_PORT || process.env.SQL_PORT) || 3306,
    user,
    password,
    database,
  },
  verbose: true,
};
