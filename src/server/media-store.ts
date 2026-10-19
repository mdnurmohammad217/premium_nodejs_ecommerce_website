/**
 * Uploaded images that cannot go missing.
 *
 * Every uploaded file is written to the uploads folder (what visitors are
 * served, fast) AND copied into the `media_files` table. Shared hosts replace
 * or wipe the app folder on a redeploy, and some move the app to a new folder
 * name, which used to take every uploaded logo, banner and product photo with
 * it. The database survives all of that, so when a file is not on disk any
 * more, the first request for it is answered from the database and the file is
 * written back to disk for the next visitor.
 *
 * - Files are split into 512 KB parts, so a row never comes near MySQL's
 *   max_allowed_packet on shared hosting.
 * - Files that were uploaded before this version are copied into the database
 *   in the background on start (backfill), a few at a time.
 * - MEDIA_DB_BACKUP=off turns the database copy off (disk only, as before).
 */
import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import type express from 'express';

const PART_BYTES = 512 * 1024;
/** Anything larger is not an image the library would have accepted */
const MAX_BACKUP_BYTES = 16 * 1024 * 1024;

export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
};

export const mimeForFile = (name: string) => IMAGE_MIME_BY_EXT[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
export const isImageFile = (name: string) => Boolean(IMAGE_MIME_BY_EXT[path.extname(name).slice(1).toLowerCase()]);

/** Only plain file names are ever looked up — no paths, no hidden files */
export const isSafeFileName = (name: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(name) && !name.includes('..');

export interface StoredFileInfo {
  name: string;
  size: number;
  createdAt: string;
  onDisk: boolean;
  inDatabase: boolean;
}

export function createMediaStore(options: { db: any; uploadsDir: string; legacyDirs: string[]; enabled: boolean }) {
  const { db, uploadsDir, legacyDirs } = options;
  const enabled = options.enabled;
  const known = new Set<string>();
  const inflight = new Map<string, Promise<{ buffer: Buffer; mime: string } | null>>();
  let tableMissing = false;
  let restoredCount = 0;
  let backfill = { running: false, done: false, copied: 0, failed: 0, at: '' };

  const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : []);

  const noteMissingTable = (error: any) => {
    if (/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(error?.message || error))) tableMissing = true;
  };

  /** Copy one file into the database. Never throws: the upload itself already succeeded on disk. */
  async function save(fileName: string, buffer: Buffer, mime?: string): Promise<boolean> {
    if (!enabled || !isSafeFileName(fileName) || buffer.length === 0 || buffer.length > MAX_BACKUP_BYTES) return false;
    try {
      const parts = Math.max(1, Math.ceil(buffer.length / PART_BYTES));
      const type = mime || mimeForFile(fileName);
      await db.execute(sql`DELETE FROM media_files WHERE file_name = ${fileName}`);
      for (let part = 0; part < parts; part += 1) {
        const chunk = buffer.subarray(part * PART_BYTES, (part + 1) * PART_BYTES);
        await db.execute(
          sql`INSERT INTO media_files (file_name, part, parts, mime, size, data) VALUES (${fileName}, ${part}, ${parts}, ${type}, ${buffer.length}, ${chunk})`
        );
      }
      known.add(fileName);
      tableMissing = false;
      return true;
    } catch (error: any) {
      noteMissingTable(error);
      if (!tableMissing) console.error(`[media] database copy of ${fileName} failed:`, error?.message || error);
      return false;
    }
  }

  async function loadFromDatabase(fileName: string): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!enabled || !isSafeFileName(fileName)) return null;
    const running = inflight.get(fileName);
    if (running) return running;
    const task = (async () => {
      try {
        const rows = rowsOf(await db.execute(sql`SELECT part, parts, mime, data FROM media_files WHERE file_name = ${fileName} ORDER BY part`));
        if (rows.length === 0) return null;
        const expected = Number(rows[0].parts) || 1;
        if (rows.length !== expected) return null;
        const buffer = Buffer.concat(rows.map((row) => (Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data))));
        return { buffer, mime: String(rows[0].mime || mimeForFile(fileName)) };
      } catch (error: any) {
        noteMissingTable(error);
        return null;
      }
    })().finally(() => inflight.delete(fileName));
    inflight.set(fileName, task);
    return task;
  }

  /**
   * Mounted on /uploads AFTER the static folders: it only runs for a file that
   * is not on disk. Answers from the database and writes the file back.
   */
  function restoreMiddleware(): express.RequestHandler {
    return async (req, res, next) => {
      if (!enabled || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
      let name = '';
      try {
        name = decodeURIComponent(req.path.replace(/^\/+/, ''));
      } catch {
        return next();
      }
      if (!isSafeFileName(name)) return next();
      const file = await loadFromDatabase(name);
      if (!file) return next();
      restoredCount += 1;
      fs.promises
        .mkdir(uploadsDir, { recursive: true })
        .then(() => fs.promises.writeFile(path.join(uploadsDir, name), file.buffer))
        .catch(() => {
          /* read-only disk: keep answering from the database */
        });
      res.setHeader('Content-Type', file.mime);
      res.setHeader('Content-Length', String(file.buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'HEAD') return res.end();
      res.end(file.buffer);
    };
  }

  async function databaseNames(): Promise<Map<string, { size: number; createdAt: string }>> {
    const out = new Map<string, { size: number; createdAt: string }>();
    if (!enabled) return out;
    try {
      const rows = rowsOf(await db.execute(sql`SELECT file_name, size, created_at FROM media_files WHERE part = 0`));
      for (const row of rows) {
        out.set(String(row.file_name), {
          size: Number(row.size) || 0,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        });
        known.add(String(row.file_name));
      }
    } catch (error: any) {
      noteMissingTable(error);
    }
    return out;
  }

  function diskFiles(): Map<string, { size: number; createdAt: string }> {
    const out = new Map<string, { size: number; createdAt: string }>();
    for (const dir of [uploadsDir, ...legacyDirs]) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (out.has(name) || !isSafeFileName(name) || !isImageFile(name)) continue;
        try {
          const stat = fs.statSync(path.join(dir, name));
          if (!stat.isFile()) continue;
          out.set(name, { size: stat.size, createdAt: stat.mtime.toISOString() });
        } catch {
          /* unreadable entry */
        }
      }
    }
    return out;
  }

  /** Every uploaded image this store has, from disk and from the database */
  async function listFiles(): Promise<StoredFileInfo[]> {
    const disk = diskFiles();
    const stored = await databaseNames();
    const names = new Set<string>([...disk.keys(), ...stored.keys()]);
    return Array.from(names).map((name) => {
      const a = disk.get(name);
      const b = stored.get(name);
      return {
        name,
        size: a?.size ?? b?.size ?? 0,
        createdAt: a?.createdAt || b?.createdAt || '',
        onDisk: Boolean(a),
        inDatabase: Boolean(b),
      };
    });
  }

  /** Copies every file on disk that is not in the database yet. Runs in the background. */
  async function runBackfill(): Promise<void> {
    if (!enabled || backfill.running) return;
    backfill = { running: true, done: false, copied: 0, failed: 0, at: new Date().toISOString() };
    try {
      const stored = await databaseNames();
      if (tableMissing) return;
      const disk = diskFiles();
      for (const [name, info] of disk) {
        if (stored.has(name) || info.size === 0 || info.size > MAX_BACKUP_BYTES) continue;
        let buffer: Buffer | null = null;
        for (const dir of [uploadsDir, ...legacyDirs]) {
          try {
            buffer = await fs.promises.readFile(path.join(dir, name));
            break;
          } catch {
            /* try the next folder */
          }
        }
        if (!buffer) continue;
        if (await save(name, buffer)) backfill.copied += 1;
        else backfill.failed += 1;
        // Leave the database room for real visitors
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      if (backfill.copied > 0) console.log(`[media] ${backfill.copied} existing image(s) copied into the database backup`);
    } catch (error: any) {
      console.error('[media] backfill stopped:', error?.message || error);
    } finally {
      backfill.running = false;
      backfill.done = true;
    }
  }

  async function status() {
    let files = 0;
    let bytes = 0;
    if (enabled) {
      try {
        const rows = rowsOf(await db.execute(sql`SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM media_files WHERE part = 0`));
        files = Number(rows[0]?.files) || 0;
        bytes = Number(rows[0]?.bytes) || 0;
      } catch (error: any) {
        noteMissingTable(error);
      }
    }
    const disk = diskFiles();
    let diskBytes = 0;
    for (const info of disk.values()) diskBytes += info.size;
    return {
      enabled,
      databaseFiles: files,
      databaseBytes: bytes,
      diskFiles: disk.size,
      diskBytes,
      restoredSinceStart: restoredCount,
      backfill,
      tableMissing,
    };
  }

  return { enabled, save, loadFromDatabase, restoreMiddleware, listFiles, runBackfill, status };
}
