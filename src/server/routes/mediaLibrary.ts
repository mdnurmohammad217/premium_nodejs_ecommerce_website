/**
 * Media library
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerMediaLibraryRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { mimeForFile } from '../media-store.ts';
import crypto from 'crypto';
import path from 'path';
import { APP_DIR } from '../env.ts';
import type * as Server from '../../../server.ts';


export interface MediaItem {
  id: string;
  title: string;
  url: string;
  type: string;
  size: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface RegisterMediaLibraryRoutesDeps {
  app: typeof Server.app;
  mediaStore: typeof Server.mediaStore;
  privateResponse: typeof Server.privateResponse;
  saveUploadedFile: typeof Server.saveUploadedFile;
  uploadsDir: typeof Server.uploadsDir;
}

export function registerMediaLibraryRoutes(deps: RegisterMediaLibraryRoutesDeps) {
// ==========================================
// MEDIA LIBRARY APIS
// ==========================================
// The media library contains ONLY real uploads — no stock/demo images.
//
// v3.7: the list is built from the files themselves (uploads folder + the
// database copy), with titles taken from the saved index. The index used to be
// the only record, so anything that overwrote it (an old settings screen
// saving its stale copy, or the 600-entry cap) made uploaded images vanish
// from the library although the files were still there.
async function readMediaIndex(): Promise<MediaItem[]> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'media_library'));
  if (rows.length === 0) return [];
  try {
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readRemovedMedia(): Promise<Set<string>> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'media_library_removed'));
  if (rows.length === 0) return new Set();
  try {
    const parsed = JSON.parse(rows[0].value);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** "1719912345678_ab12cd_front_view.jpg" → "front view" */
function titleFromFileName(name: string): string {
  const bare = name.replace(/\.[^.]+$/, '').replace(/^\d{10,}_[0-9a-f]{6,8}_?/, '');
  return bare.replace(/_/g, ' ').trim() || name;
}

deps.app.get('/api/media', async (_req, res) => {
  try {
    deps.privateResponse(res);
    const [index, removed, files] = await Promise.all([readMediaIndex(), readRemovedMedia(), deps.mediaStore.listFiles()]);
    const fileByUrl = new Map(files.map((file) => [`/uploads/${file.name}`, file]));
    const seen = new Set<string>();
    const items: Array<MediaItem & { missing?: boolean }> = [];
    for (const entry of index) {
      if (!entry?.url || removed.has(entry.url) || seen.has(entry.url)) continue;
      seen.add(entry.url);
      const local = entry.url.startsWith('/uploads/');
      // A library entry whose file exists nowhere any more is flagged, not hidden
      items.push(local && !fileByUrl.has(entry.url) ? { ...entry, missing: true } : entry);
    }
    for (const file of files) {
      const url = `/uploads/${file.name}`;
      if (seen.has(url) || removed.has(url)) continue;
      seen.add(url);
      items.push({
        id: `file-${file.name}`,
        title: titleFromFileName(file.name),
        url,
        type: mimeForFile(file.name),
        size: file.size ? humanSize(file.size) : '—',
        createdAt: file.createdAt || new Date(0).toISOString(),
      });
    }
    items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json(items.slice(0, 5000));
  } catch (error: any) {
    console.error('Failed to get media:', error);
    res.json([]);
  }
});

/** Image types the library accepts, mapped to the extension written to disk. */
const MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};
/** 8MB per file, checked on the decoded bytes rather than the base64 text. */
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
/** Keep the library index from outgrowing the settings row it lives in. */
const MEDIA_LIBRARY_MAX = 3000;

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Writes one picked file to the uploads folder and returns its library entry.
 * Throws with a message meant for the operator when the file is rejected.
 */
async function storeMediaFile(input: {
  dataUrl?: string;
  url?: string;
  fileName?: string;
  title?: string;
}): Promise<MediaItem> {
  const { dataUrl, fileName, title } = input;
  let finalUrl = String(input.url || '').trim();
  let mime = 'image/jpeg';
  let bytes = 0;

  if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    const matches = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!matches) throw new Error('Could not read the file. Please try again.');

    mime = matches[1].toLowerCase();
    const ext = MEDIA_TYPES[mime];
    if (!ext) {
      throw new Error('Only JPG, PNG, WEBP, GIF, AVIF or SVG images can be uploaded.');
    }

    const buffer = Buffer.from(matches[2], 'base64');
    bytes = buffer.byteLength;
    if (bytes > MEDIA_MAX_BYTES) {
      throw new Error(`Image is too large (${humanSize(bytes)}). The maximum upload size is 8 MB.`);
    }

    const cleanName = (fileName || 'image')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'image';
    const uniqueFileName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${cleanName}.${ext}`;
    finalUrl = await deps.saveUploadedFile(uniqueFileName, buffer);
  }

  if (!finalUrl) throw new Error('Provide an image or an image URL.');

  return {
    id: `med-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    title: title || fileName || 'Uploaded image',
    url: finalUrl,
    type: mime,
    size: bytes ? humanSize(bytes) : '—',
    createdAt: new Date().toISOString(),
  };
}

/** Reads the library index, prepends the new entries and saves it back. */
async function appendToMediaLibrary(items: MediaItem[]): Promise<void> {
  if (items.length === 0) return;
  const row = await db.select().from(siteSettings).where(eq(siteSettings.key, 'media_library'));
  let existing: MediaItem[] = [];
  if (row.length > 0) {
    try {
      const parsed = JSON.parse(row[0].value);
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = [];
    }
  }
  const merged = [...items, ...existing].slice(0, MEDIA_LIBRARY_MAX);
  const value = JSON.stringify(merged);
  await db
    .insert(siteSettings)
    .values({ key: 'media_library', value })
    .onDuplicateKeyUpdate({ set: { value } });
}

deps.app.post('/api/media/upload', async (req, res) => {
  try {
    const item = await storeMediaFile(req.body || {});
    await appendToMediaLibrary([item]);
    res.json(item);
  } catch (error: any) {
    console.error('Failed to upload media:', error);
    res.status(400).json({ error: error?.message || 'Failed to upload media' });
  }
});

/**
 * Multi-file upload (item 21). Each file is handled independently so one bad
 * file cannot fail the whole batch — the response reports what went in and what
 * was rejected, and the picker shows that per file.
 */
deps.app.post('/api/media/upload-bulk', async (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (files.length === 0) return res.status(400).json({ error: 'No files selected.' });
  if (files.length > 25) return res.status(400).json({ error: 'You can upload up to 25 images at a time.' });

  const uploaded: MediaItem[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      uploaded.push(await storeMediaFile(file || {}));
    } catch (error: any) {
      failed.push({
        fileName: String(file?.fileName || 'image'),
        error: error?.message || 'Upload failed.',
      });
    }
  }

  try {
    await appendToMediaLibrary(uploaded);
  } catch (error: any) {
    console.error('Failed to save the media library index:', error);
    return res.status(500).json({ error: 'Could not save the media library.' });
  }

  res.json({ success: failed.length === 0, uploaded, failed, total: files.length });
});

deps.app.delete('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const list = await readMediaIndex();
    const entry = list.find((m: any) => m.id === id);
    const url = entry?.url || (id.startsWith('file-') ? `/uploads/${id.slice(5)}` : '');
    if (entry) {
      await db
        .update(siteSettings)
        .set({ value: JSON.stringify(list.filter((m: any) => m.id !== id)) })
        .where(eq(siteSettings.key, 'media_library'));
    }
    // The file itself stays (a product or banner may still use it); it is only
    // taken off the library list, and stays off it.
    if (url) {
      const removed = Array.from(await readRemovedMedia());
      if (!removed.includes(url)) {
        const value = JSON.stringify([url, ...removed].slice(0, 20000));
        await db
          .insert(siteSettings)
          .values({ key: 'media_library_removed', value })
          .onDuplicateKeyUpdate({ set: { value } });
      }
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

/** Uploads folder + database copy, for System Configuration → Database & Cache */
deps.app.get('/api/admin/media/status', async (_req, res) => {
  try {
    deps.privateResponse(res);
    const appDir = path.resolve(APP_DIR);
    const dir = path.resolve(deps.uploadsDir);
    res.json({
      uploadsDir: (_req as any).session?.role === 'admin' ? dir : '',
      insideApp: dir === appDir || dir.startsWith(appDir + path.sep),
      configured: Boolean(String(process.env.UPLOADS_DIR || '').trim()),
      ...(await deps.mediaStore.status()),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not read the image storage status.' });
  }
});

  return { MEDIA_MAX_BYTES, MEDIA_TYPES, appendToMediaLibrary, humanSize };
}
