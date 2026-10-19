/**
 * v3.12 — smaller pictures for every screen.
 *
 * Product photos, banners and category pictures are uploaded at full camera
 * size (often 1–3 MB) but shown as a 160–400 px card on a phone. A request for
 * an uploaded picture with `?w=<width>` now gets a WebP copy made for that
 * width (about 15–40 KB for a product card instead of ~500 KB):
 *
 *   /uploads/1720000000_ab12cd_shirt.jpg?w=400   → 400 px wide WebP
 *
 * - Copies are made once and kept in a cache folder beside the uploads, so
 *   only the first visitor waits a few milliseconds.
 * - Widths snap to a short fixed list, so nobody can fill the disk by asking
 *   for every width from 1 to 5000.
 * - A picture is never made larger than the original.
 * - GIF (animation) and SVG are always sent as they are.
 * - `sharp` is an optional package: if the host could not install it, the
 *   original file is sent exactly as before — nothing breaks.
 * - Uploaded file names are unique (time + random), so both the original and
 *   the copies can be cached by browsers and Cloudflare for a year.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type express from 'express';

export const RESIZE_WIDTHS = [96, 160, 240, 320, 400, 480, 640, 800, 1080, 1280, 1600, 1920] as const;
const RESIZABLE = /\.(jpe?g|png|webp|avif)$/i;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/;
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

type SharpFn = (input: string | Buffer, options?: any) => any;

let sharpLoader: Promise<SharpFn | null> | null = null;
let sharpError = '';

/** Loads sharp once; null when the package is missing or cannot start on this host. */
export function loadSharp(): Promise<SharpFn | null> {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((mod: any) => {
        const sharp: any = mod?.default || mod;
        try {
          // Shared hosting: one picture at a time, no in-memory cache
          sharp.concurrency(1);
          sharp.cache(false);
        } catch {
          /* older builds */
        }
        return sharp as SharpFn;
      })
      .catch((error: any) => {
        sharpError = String(error?.message || error).slice(0, 300);
        console.warn('[images] sharp is not available — pictures are sent at their original size.', sharpError);
        return null;
      });
  }
  return sharpLoader;
}

export function imageResizeStatus() {
  return { checked: Boolean(sharpLoader), error: sharpError };
}

export function snapWidth(raw: unknown): number | null {
  const wanted = Number(raw);
  if (!Number.isFinite(wanted) || wanted <= 0) return null;
  for (const width of RESIZE_WIDTHS) if (width >= wanted) return width;
  return RESIZE_WIDTHS[RESIZE_WIDTHS.length - 1];
}

function pickCacheDir(uploadsDir: string): string {
  const candidates = [`${uploadsDir}-cache`, path.join(os.tmpdir(), 'shop-image-cache')];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      /* try the next one */
    }
  }
  return '';
}

export function createImageResizer(options: { uploadsDir: string; extraDirs?: string[] }) {
  const { uploadsDir } = options;
  const sourceDirs = [uploadsDir, ...(options.extraDirs || [])];
  let cacheDir = '';
  let cacheChecked = false;
  const inflight = new Map<string, Promise<string | null>>();
  /** At most two pictures are being made at the same moment */
  let running = 0;
  const waiting: Array<() => void> = [];
  const slot = async () => {
    if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
  };
  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };

  const findSource = (name: string): string | null => {
    for (const dir of sourceDirs) {
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        /* not in this folder */
      }
    }
    return null;
  };

  async function makeCopy(source: string, target: string, width: number): Promise<string | null> {
    const sharp = await loadSharp();
    if (!sharp) return null;
    await slot();
    try {
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await sharp(source, { failOn: 'none', limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: width <= 480 ? 72 : 78, effort: 4 })
        .toFile(temp);
      await fs.promises.rename(temp, target);
      return target;
    } catch (error: any) {
      console.warn('[images] could not resize', path.basename(source), String(error?.message || error).slice(0, 200));
      return null;
    } finally {
      release();
    }
  }

  const middleware: express.RequestHandler = async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = decodeURIComponent(req.path.replace(/^\/+/, ''));
    const width = snapWidth(req.query.w);
    if (!width || !SAFE_NAME.test(name) || name.includes('..') || !RESIZABLE.test(name)) return next();

    if (!cacheChecked) {
      cacheDir = pickCacheDir(uploadsDir);
      cacheChecked = true;
    }
    if (!cacheDir) return next();

    const source = findSource(name);
    // Not on disk (yet): the normal chain sends — or restores — the original
    if (!source) return next();

    const target = path.join(cacheDir, `${name.replace(/\.[^.]+$/, '')}__w${width}.webp`);
    try {
      let ready: string | null = null;
      try {
        const [made, original] = [fs.statSync(target), fs.statSync(source)];
        if (made.size > 0 && made.mtimeMs >= original.mtimeMs) ready = target;
      } catch {
        /* not made yet */
      }
      if (!ready) {
        let job = inflight.get(target);
        if (!job) {
          job = makeCopy(source, target, width).finally(() => inflight.delete(target));
          inflight.set(target, job);
        }
        ready = await job;
      }
      if (!ready) return next();
      res.setHeader('Cache-Control', IMMUTABLE_CACHE);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type('image/webp');
      return res.sendFile(ready, (error) => {
        if (error && !res.headersSent) next();
      });
    } catch {
      return next();
    }
  };

  return { middleware };
}

/**
 * Same list the website builds in src/lib/img.ts (srcSet), so a preload in the
 * page head asks for exactly the file the picture will use.
 */
const PAGE_STEPS = [160, 240, 320, 400, 480, 640, 800, 1080, 1280, 1600, 1920];
export function uploadSrcSet(url: string, maxWidth: number, minWidth = 160): string {
  const clean = String(url || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/uploads/') || !RESIZABLE.test(clean)) return '';
  const top = Math.min(1920, maxWidth * 2);
  const steps = PAGE_STEPS.filter((value) => value >= minWidth && value <= top);
  if (!steps.length || steps[steps.length - 1] < top) {
    const cover = PAGE_STEPS.find((value) => value >= top);
    if (cover && !steps.includes(cover)) steps.push(cover);
  }
  return steps.map((value) => `${clean}?w=${value} ${value}w`).join(', ');
}

/** One resized copy (the same address src/lib/img.ts `sized` builds) */
export function uploadSized(url: string, width: number): string {
  const clean = String(url || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/uploads/') || !RESIZABLE.test(clean)) return url;
  const step = PAGE_STEPS.find((value) => value >= width) || PAGE_STEPS[PAGE_STEPS.length - 1];
  return `${clean}?w=${step}`;
}

/**
 * Width and height of an uploaded picture (as shown, after EXIF rotation),
 * read once with sharp and remembered. Null when unknown.
 */
const sizeCache = new Map<string, { width: number; height: number } | null>();
export async function uploadedImageSize(url: string, dirs: string[]): Promise<{ width: number; height: number } | null> {
  const clean = String(url || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/uploads/') || !RESIZABLE.test(clean)) return null;
  const name = decodeURIComponent(clean.slice('/uploads/'.length));
  if (!SAFE_NAME.test(name) || name.includes('..')) return null;
  if (sizeCache.has(name)) return sizeCache.get(name) || null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  for (const dir of dirs) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const meta = await sharp(file).metadata();
      if (meta?.width && meta?.height) {
        const turned = Number(meta.orientation) >= 5;
        const size = { width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
        if (sizeCache.size > 500) sizeCache.clear();
        sizeCache.set(name, size);
        return size;
      }
    } catch {
      /* unreadable */
    }
  }
  return null;
}
