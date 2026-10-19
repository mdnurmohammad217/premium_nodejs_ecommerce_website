import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.ts';

declare global {
  var _mysqlPool: mysql.Pool | undefined;
}

/**
 * MySQL / MariaDB connection pool (Hostinger compatible).
 *
 * Hostinger gives a normal TCP MySQL host, so DB_HOST/DB_PORT are used.
 * Shared hosting plans cap concurrent connections, so the pool is small by
 * default and configurable through DB_POOL_LIMIT.
 */
export const createPool = () => {
  if (!global._mysqlPool) {
    global._mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || process.env.SQL_HOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.SQL_PORT) || 3306,
      user: process.env.DB_USER || process.env.SQL_USER,
      password: process.env.DB_PASSWORD || process.env.SQL_PASSWORD,
      database: process.env.DB_NAME || process.env.SQL_DB_NAME,
      waitForConnections: true,
      // 10 fits every Hostinger plan; raise DB_POOL_LIMIT on a VPS/cloud plan
      connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      // Keep money columns as strings so API responses stay byte-identical
      // to the previous PostgreSQL behaviour ("1250.00", not 1250).
      decimalNumbers: false,
      // v3.9: every connection works in UTC (see the 'connection' hook below).
      // Drizzle reads and writes timestamps as UTC; with the MySQL server and
      // the Node process in different time zones the old 'local' setting
      // shifted every order time by hours (an order at 12:12 showed as 18:12).
      timezone: 'Z',
      charset: 'utf8mb4_unicode_ci',
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    // TIMESTAMP columns are stored as UTC by MySQL itself, so reading them
    // with a UTC session gives the true moment for old and new rows alike.
    // The browser then shows it in the shop's own time zone (Asia/Dhaka).
    const core: any = (global._mysqlPool as any).pool;
    core?.on?.('connection', (connection: any) => {
      connection.query("SET time_zone = '+00:00'", (error: any) => {
        if (error) console.error('[db] could not set the session time zone:', error.message || error);
      });
    });
  }
  return global._mysqlPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema, mode: 'default' });
