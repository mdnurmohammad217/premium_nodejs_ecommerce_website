/**
 * Product import / export (Dashboard → Products → Import / Export)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerProductImportExportRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import express from 'express';
import { type ImportProduct, type ImportCategoryStep, absoluteUrl as absoluteLink, absolutiseHtml, toCsv, OUR_CSV_COLUMNS, productToCsvRow, type ImportSource, readImportFile, downloadImage, imageLinksInHtml, type ImportVariation } from '../productTransfer.ts';
import { inArray, eq, and, asc, or } from 'drizzle-orm';
import { products, categories, brands, productVariations, productAttributes, attributes } from '../../db/schema.ts';
import { db } from '../../db/index.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type * as Server from '../../../server.ts';

import type { MediaItem } from './mediaLibrary.ts';


export interface ImportOptions {
  mode: 'update' | 'skip' | 'new';
  downloadImages: boolean;
  createCategories: boolean;
  importStock: boolean;
  status: 'keep' | 'active' | 'draft';
}

export interface ImportJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  source: ImportSource;
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  categoriesCreated: number;
  brandsCreated: number;
  imagesDownloaded: number;
  imagesFailed: number;
  current: string;
  errors: Array<{ name: string; error: string }>;
  startedAt: number;
  finishedAt?: number;
  by: string;
}

export interface RegisterProductImportExportRoutesDeps {
  actorName: typeof Server.actorName;
  app: typeof Server.app;
  APP_VERSION: typeof Server.APP_VERSION;
  appendToMediaLibrary: typeof Server.appendToMediaLibrary;
  buildVariationLabel: typeof Server.buildVariationLabel;
  cache: typeof Server.cache;
  findBarcodeOwner: typeof Server.findBarcodeOwner;
  humanSize: typeof Server.humanSize;
  insertOne: typeof Server.insertOne;
  MEDIA_MAX_BYTES: typeof Server.MEDIA_MAX_BYTES;
  MEDIA_TYPES: typeof Server.MEDIA_TYPES;
  NOT_DELETED: typeof Server.NOT_DELETED;
  parseValues: typeof Server.parseValues;
  privateResponse: typeof Server.privateResponse;
  productExtras: typeof Server.productExtras;
  publicOrigin: typeof Server.publicOrigin;
  rememberGeneric: typeof Server.rememberGeneric;
  saveUploadedFile: typeof Server.saveUploadedFile;
  scheduleCacheVersionBump: typeof Server.scheduleCacheVersionBump;
  shippingChargesValue: typeof Server.shippingChargesValue;
  shopDay: typeof Server.shopDay;
  slugify: typeof Server.slugify;
  uploadsDir: typeof Server.uploadsDir;
}

export function registerProductImportExportRoutes(deps: RegisterProductImportExportRoutesDeps) {
// ===========================================================================
// v3.9 — PRODUCT IMPORT / EXPORT (Dashboard → Products → Import / Export)
// Export: a JSON (everything) or CSV (Excel-friendly) file with full picture
// links. Import: our JSON / CSV, a WooCommerce or a Shopify CSV. Categories and
// brands are matched by name (created when missing), pictures are downloaded
// into this shop, and the work runs in the background with a progress bar.
// ===========================================================================

async function exportableProducts(req: express.Request): Promise<ImportProduct[]> {
  const origin = deps.publicOrigin(req);
  const ids = String(req.query.ids || '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const conditions: any[] = [deps.NOT_DELETED];
  if (ids.length) conditions.push(inArray(products.id, ids));
  if (req.query.status && req.query.status !== 'all') conditions.push(eq(products.status, String(req.query.status)));
  if (req.query.categoryId) conditions.push(eq(products.categoryId, Number(req.query.categoryId)));
  const rows = await db.select().from(products).where(and(...conditions)).orderBy(asc(products.id));
  const [allCategories, allBrands] = await Promise.all([db.select().from(categories), db.select().from(brands)]);
  const productIds = rows.map((r) => r.id);
  const variationRows = productIds.length
    ? await db.select().from(productVariations).where(inArray(productVariations.productId, productIds)).orderBy(asc(productVariations.sortOrder), asc(productVariations.id))
    : [];
  const attributeRows = productIds.length ? await db.select().from(productAttributes).where(inArray(productAttributes.productId, productIds)) : [];
  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const pathOf = (id: number | null) => {
    const out: ImportCategoryStep[] = [];
    let current = id ? catById.get(id) : undefined;
    let guard = 0;
    while (current && guard < 5) {
      out.unshift({ name: current.name, slug: current.slug, image: absoluteLink(current.image, origin), icon: current.icon });
      current = current.parentId ? catById.get(current.parentId) : undefined;
      guard += 1;
    }
    return out;
  };
  const money = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
  const parse = (v: any) => {
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  return rows.map((p) => {
    const brand = p.brandId ? allBrands.find((b) => b.id === p.brandId) : null;
    const gallery = (parse(p.images) || []).map((u: string) => absoluteLink(u, origin)).filter(Boolean) as string[];
    return {
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      barcode: p.barcode,
      genericName: p.genericName,
      categoryPath: pathOf(p.categoryId),
      brand: brand ? { name: brand.name, slug: brand.slug, logo: absoluteLink(brand.logo, origin) } : null,
      description: absolutiseHtml(p.description, origin),
      shortDescription: p.shortDescription,
      howToUse: absolutiseHtml(p.howToUse, origin),
      seoTitle: (p as any).seoTitle || null,
      seoDescription: (p as any).seoDescription || null,
      seoImage: absoluteLink((p as any).seoImage, origin) || null,
      tags: (p as any).tags || null,
      price: Number(p.price),
      salePrice: money(p.salePrice),
      costPrice: money(p.costPrice),
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      unit: p.unit,
      dosage: p.dosage,
      requiresPrescription: Boolean(p.requiresPrescription),
      batchNumber: p.batchNumber,
      expiryDate: p.expiryDate,
      featured: Boolean(p.featured),
      isFlashSale: Boolean(p.isFlashSale),
      isBestSeller: Boolean(p.isBestSeller),
      isNewArrival: Boolean(p.isNewArrival),
      image: absoluteLink(p.image, origin),
      images: gallery,
      videoUrl: p.videoUrl,
      freeShipping: Boolean(p.freeShipping),
      shippingCharges: parse(p.shippingCharges),
      wholesaleEnabled: Boolean(p.wholesaleEnabled),
      wholesalePrice: money(p.wholesalePrice),
      wholesaleMinQty: p.wholesaleMinQty,
      wholesaleMaxQty: p.wholesaleMaxQty,
      status: p.status || 'active',
      highlights: parse(p.highlights),
      optionDisplay: parse(p.optionDisplay),
      variations: variationRows
        .filter((v) => v.productId === p.id)
        .map((v) => ({
          combination: parse(v.combination) || {},
          label: v.label,
          sku: v.sku,
          price: money(v.price),
          salePrice: money(v.salePrice),
          stock: v.stock,
          image: absoluteLink(v.image, origin),
          status: v.status,
          barcode: v.barcode,
          wholesalePrice: money(v.wholesalePrice),
        })),
      attributes: attributeRows
        .filter((a) => a.productId === p.id)
        .map((a) => ({ name: a.attributeName, values: deps.parseValues(a.value) })),
    };
  });
}

deps.app.get('/api/admin/products/export', async (req, res) => {
  try {
    const list = await exportableProducts(req);
    const stamp = deps.shopDay();
    deps.privateResponse(res);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.csv"`);
      return res.send(toCsv(OUR_CSV_COLUMNS, list.map(productToCsvRow)));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.json"`);
    res.send(
      JSON.stringify(
        { format: 'shop-products', version: 1, app: deps.APP_VERSION, source: deps.publicOrigin(req), exportedAt: new Date().toISOString(), count: list.length, products: list },
        null,
        1
      )
    );
  } catch (error: any) {
    console.error('product export:', error);
    res.status(500).json({ error: 'Could not export the products.' });
  }
});

const importDrafts = new Map<string, { source: ImportSource; products: ImportProduct[]; at: number }>();
const importJobs = new Map<string, ImportJob>();
const pruneImportState = () => {
  const now = Date.now();
  for (const [key, draft] of importDrafts) if (now - draft.at > 60 * 60 * 1000) importDrafts.delete(key);
  for (const [key, job] of importJobs) if (job.finishedAt && now - job.finishedAt > 6 * 60 * 60 * 1000) importJobs.delete(key);
};

/** Step 1: read the file and show what is in it before anything is saved */
deps.app.post('/api/admin/products/import/preview', async (req, res) => {
  try {
    pruneImportState();
    const text = String(req.body?.text || '');
    if (text.length > 38 * 1024 * 1024) return res.status(400).json({ error: 'The file is too large (max 38 MB).' });
    const parsed = readImportFile(text);
    if (!parsed.products.length) return res.status(400).json({ error: 'No products were found in this file.' });
    if (parsed.products.length > 20000) return res.status(400).json({ error: 'At most 20,000 products can be imported at a time.' });
    const token = crypto.randomBytes(12).toString('hex');
    importDrafts.set(token, { ...parsed, at: Date.now() });
    const skus = parsed.products.map((p) => String(p.sku || '').trim()).filter(Boolean);
    const slugs = parsed.products.map((p) => String(p.slug || '').trim()).filter(Boolean);
    let existing = 0;
    if (skus.length || slugs.length) {
      const found = new Set<string>();
      for (let i = 0; i < Math.max(skus.length, slugs.length); i += 500) {
        const skuPart = skus.slice(i, i + 500);
        const slugPart = slugs.slice(i, i + 500);
        const conds: any[] = [];
        if (skuPart.length) conds.push(inArray(products.sku, skuPart));
        if (slugPart.length) conds.push(inArray(products.slug, slugPart));
        const rows = await db.select({ sku: products.sku, slug: products.slug }).from(products).where(and(deps.NOT_DELETED, or(...conds)));
        rows.forEach((r) => {
          found.add(`sku:${r.sku}`);
          found.add(`slug:${r.slug}`);
        });
      }
      existing = parsed.products.filter((p) => (p.sku && found.has(`sku:${p.sku}`)) || (p.slug && found.has(`slug:${p.slug}`))).length;
    }
    const pictures = parsed.products.reduce((n, p) => n + (p.image ? 1 : 0) + (p.images?.length || 0), 0);
    const categoriesInFile = new Set(parsed.products.map((p) => (p.categoryPath || []).map((c) => c.name).join(' > ')).filter(Boolean));
    res.json({
      token,
      source: parsed.source,
      count: parsed.products.length,
      existing,
      pictures,
      variations: parsed.products.reduce((n, p) => n + (p.variations?.length || 0), 0),
      categories: Array.from(categoriesInFile).slice(0, 50),
      categoryCount: categoriesInFile.size,
      sample: parsed.products.slice(0, 25).map((p) => ({
        name: p.name,
        sku: p.sku || '',
        price: p.price,
        salePrice: p.salePrice ?? null,
        stock: p.stock ?? 0,
        category: (p.categoryPath || []).map((c) => c.name).join(' > '),
        image: p.image || '',
        variations: p.variations?.length || 0,
      })),
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Could not read the file.' });
  }
});

/** Step 2: start the import; it runs in the background */
deps.app.post('/api/admin/products/import', async (req, res) => {
  pruneImportState();
  const draft = importDrafts.get(String(req.body?.token || ''));
  if (!draft) return res.status(400).json({ error: 'Please choose the file again (the preview expired).' });
  if (Array.from(importJobs.values()).some((job) => job.status === 'running')) {
    return res.status(409).json({ error: 'Another import is still running. Please wait for it to finish.' });
  }
  const body = req.body?.options || {};
  const options: ImportOptions = {
    mode: ['update', 'skip', 'new'].includes(body.mode) ? body.mode : 'update',
    downloadImages: body.downloadImages !== false,
    createCategories: body.createCategories !== false,
    importStock: body.importStock !== false,
    status: ['keep', 'active', 'draft'].includes(body.status) ? body.status : body.status === 'inactive' ? 'draft' : 'keep',
  };
  importDrafts.delete(String(req.body.token));
  const job: ImportJob = {
    id: crypto.randomBytes(8).toString('hex'),
    status: 'running',
    source: draft.source,
    total: draft.products.length,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    categoriesCreated: 0,
    brandsCreated: 0,
    imagesDownloaded: 0,
    imagesFailed: 0,
    current: '',
    errors: [],
    startedAt: Date.now(),
    by: deps.actorName(req),
  };
  importJobs.set(job.id, job);
  const origin = deps.publicOrigin(req);
  void runProductImport(job, draft.products, options, origin)
    .then(() => {
      job.status = 'done';
    })
    .catch((error) => {
      console.error('product import:', error);
      job.status = 'failed';
      job.errors.push({ name: '—', error: error?.message || 'Import stopped' });
    })
    .finally(async () => {
      job.finishedAt = Date.now();
      job.current = '';
      try {
        await deps.cache.invalidate();
      } catch {}
      deps.scheduleCacheVersionBump();
    });
  res.json({ jobId: job.id, total: job.total });
});

/** The newest import (so the window can show it again after the page was left) */
deps.app.get('/api/admin/products/import-latest', (_req, res) => {
  deps.privateResponse(res);
  const latest = Array.from(importJobs.values()).sort((a, b) => b.startedAt - a.startedAt)[0];
  res.json({ job: latest && (latest.status === 'running' || Date.now() - (latest.finishedAt || 0) < 10 * 60_000) ? latest : null });
});

deps.app.get('/api/admin/products/import/:id', (req, res) => {
  const job = importJobs.get(String(req.params.id));
  if (!job) return res.status(404).json({ error: 'This import is no longer available.' });
  deps.privateResponse(res);
  res.json(job);
});

async function runProductImport(job: ImportJob, list: ImportProduct[], options: ImportOptions, origin: string) {
  const categoryRows = await db.select().from(categories);
  const brandRows = await db.select().from(brands);
  const attributeRows = await db.select().from(attributes);
  const mediaItems: MediaItem[] = [];
  const imageCache = new Map<string, string>();
  const lower = (v: any) => String(v || '').trim().toLowerCase();

  const uniqueValue = async (table: 'categories' | 'brands' | 'products-slug' | 'products-sku' | 'attributes', base: string) => {
    const clean = base.slice(0, 180) || `item-${Date.now().toString(36)}`;
    for (let n = 1; n < 500; n += 1) {
      const candidate = n === 1 ? clean : `${clean}-${n}`;
      let taken = false;
      if (table === 'categories') taken = categoryRows.some((c) => c.slug === candidate);
      else if (table === 'brands') taken = brandRows.some((b) => b.slug === candidate);
      else if (table === 'attributes') taken = attributeRows.some((a) => a.slug === candidate);
      else {
        const column = table === 'products-slug' ? products.slug : products.sku;
        taken = (await db.select({ id: products.id }).from(products).where(eq(column, candidate)).limit(1)).length > 0;
      }
      if (!taken) return candidate;
    }
    return `${clean}-${crypto.randomBytes(3).toString('hex')}`;
  };

  /** A picture from the file → a picture of this shop */
  const localImage = async (link: string | null | undefined): Promise<string | null> => {
    const text = String(link || '').trim();
    if (!text) return null;
    if (!/^https?:\/\//i.test(text)) return text; // already a path of this shop
    if (origin && text.startsWith(`${origin}/uploads/`)) {
      const name = text.slice(`${origin}/uploads/`.length);
      if (!name.includes('/') && fs.existsSync(path.join(deps.uploadsDir, name))) return `/uploads/${name}`;
    }
    if (!options.downloadImages) return text;
    if (imageCache.has(text)) return imageCache.get(text) || null;
    try {
      const file = await downloadImage(text, deps.MEDIA_MAX_BYTES);
      const ext = deps.MEDIA_TYPES[file.mime] || (/\.(jpe?g|png|webp|gif|avif)$/i.exec(file.fileName)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
      const cleanName = file.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'image';
      const fileName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${cleanName}.${ext}`;
      const url = await deps.saveUploadedFile(fileName, file.buffer);
      mediaItems.push({
        id: `med-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        title: cleanName,
        url,
        type: file.mime,
        size: deps.humanSize(file.buffer.byteLength),
        createdAt: new Date().toISOString(),
      });
      job.imagesDownloaded += 1;
      imageCache.set(text, url);
      return url;
    } catch (error: any) {
      job.imagesFailed += 1;
      // A picture that is gone (404) or is not a picture is left out; any other
      // problem (slow site, timeout) keeps the original link so it still shows.
      const gone = /^HTTP 4|Not a picture|private network|Only http/.test(String(error?.message || ''));
      imageCache.set(text, gone ? '' : text);
      return gone ? null : text;
    }
  };

  const localiseHtml = async (html: string | null | undefined) => {
    if (!html || !options.downloadImages) return html ?? null;
    let out = String(html);
    for (const link of Array.from(new Set(imageLinksInHtml(out)))) {
      const local = await localImage(link);
      if (local && local !== link) out = out.split(link).join(local);
    }
    return out;
  };

  const categoryFor = async (pathSteps: ImportCategoryStep[] | undefined): Promise<number | null> => {
    const steps = (pathSteps || []).filter((s) => s && String(s.name || '').trim()).slice(0, 3);
    let parentId: number | null = null;
    let found: number | null = null;
    for (let depth = 0; depth < steps.length; depth += 1) {
      const step = steps[depth];
      const match = categoryRows.find(
        (c) => (c.parentId ?? null) === parentId && ((step.slug && c.slug === step.slug) || lower(c.name) === lower(step.name))
      );
      if (match) {
        parentId = match.id;
        found = match.id;
        continue;
      }
      if (!options.createCategories) break;
      const slug = await uniqueValue('categories', deps.slugify(step.slug || step.name));
      const created = await deps.insertOne(db, categories, {
        name: String(step.name).trim().slice(0, 191),
        slug,
        icon: step.icon || 'Tag',
        image: await localImage(step.image),
        parentId,
        level: depth + 1,
        sortOrder: 0,
        featured: false,
        showOnHome: false,
      });
      if (!created?.id) break;
      categoryRows.push(created);
      job.categoriesCreated += 1;
      parentId = created.id;
      found = created.id;
    }
    return found;
  };

  const brandFor = async (brand: ImportProduct['brand']): Promise<number | null> => {
    if (!brand || !String(brand.name || '').trim()) return null;
    const match = brandRows.find((b) => (brand.slug && b.slug === brand.slug) || lower(b.name) === lower(brand.name));
    if (match) return match.id;
    if (!options.createCategories) return null;
    const created = await deps.insertOne(db, brands, {
      name: String(brand.name).trim().slice(0, 191),
      slug: await uniqueValue('brands', deps.slugify(brand.slug || brand.name)),
      logo: await localImage(brand.logo),
    });
    if (!created?.id) return null;
    brandRows.push(created);
    job.brandsCreated += 1;
    return created.id;
  };

  const barcodeFree = async (code: string | null | undefined, productId: number | null) => {
    const value = String(code || '').trim();
    if (!value) return null;
    const owner = await deps.findBarcodeOwner([value], { productId });
    return owner ? null : value.slice(0, 64);
  };

  const money = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(2));

  for (const item of list) {
    job.current = String(item.name || '').slice(0, 120);
    try {
      const sku = String(item.sku || '').trim().slice(0, 100);
      const slug = String(item.slug || '').trim().slice(0, 180);
      let existing: any = null;
      if (options.mode !== 'new') {
        if (sku) existing = (await db.select().from(products).where(and(eq(products.sku, sku), deps.NOT_DELETED)).limit(1))[0] || null;
        if (!existing && slug) existing = (await db.select().from(products).where(and(eq(products.slug, slug), deps.NOT_DELETED)).limit(1))[0] || null;
      }
      if (existing && options.mode === 'skip') {
        job.skipped += 1;
        continue;
      }

      // v3.9 — an existing product is only changed where the file says something:
      // a sheet with just Name + SKU + Price never wipes pictures, category,
      // cost price or anything else. A new product gets defaults for the rest.
      const given = (key: keyof ImportProduct) => !existing || (item as any)[key] !== undefined;
      const values: Record<string, any> = { name: String(item.name).trim().slice(0, 255) };
      const put = (key: keyof ImportProduct, column: string, value: () => any) => {
        if (given(key)) values[column] = value();
      };

      if (given('categoryPath')) values.categoryId = await categoryFor(item.categoryPath);
      if (given('brand')) values.brandId = await brandFor(item.brand);
      if (given('image')) {
        const image = await localImage(item.image);
        // A picture that could not be fetched never replaces the one already there
        if (image || !existing || !item.image) values.image = image;
      }
      if (given('images')) {
        const gallery: string[] = [];
        for (const link of item.images || []) {
          const local = await localImage(link);
          if (local && !gallery.includes(local)) gallery.push(local);
        }
        if (gallery.length || !existing || !(item.images || []).length) values.images = gallery.length ? JSON.stringify(gallery) : null;
      }
      const priceGiven = item.price !== undefined && item.price !== null;
      const price = priceGiven ? Number(item.price) || 0 : Number(existing?.price || 0);
      if (priceGiven || !existing) values.price = price.toFixed(2);
      if (given('salePrice') || (priceGiven && existing?.salePrice && Number(existing.salePrice) >= price)) {
        const sale = given('salePrice') ? money(item.salePrice) : null;
        values.salePrice = sale && Number(sale) > 0 && Number(sale) < price ? sale : null;
      }
      put('genericName', 'genericName', () => (item.genericName ? String(item.genericName).slice(0, 255) : null));
      if (given('description')) values.description = await localiseHtml(item.description);
      put('shortDescription', 'shortDescription', () => item.shortDescription || null);
      put('costPrice', 'costPrice', () => money(item.costPrice) || '0.00');
      put('lowStockThreshold', 'lowStockThreshold', () =>
        Number.isFinite(Number(item.lowStockThreshold)) && item.lowStockThreshold !== null ? Number(item.lowStockThreshold) : 10
      );
      put('unit', 'unit', () => (item.unit ? String(item.unit).slice(0, 50) : 'Pcs'));
      put('dosage', 'dosage', () => (item.dosage ? String(item.dosage).slice(0, 50) : null));
      put('requiresPrescription', 'requiresPrescription', () => Boolean(item.requiresPrescription));
      put('batchNumber', 'batchNumber', () => (item.batchNumber ? String(item.batchNumber).slice(0, 100) : null));
      put('expiryDate', 'expiryDate', () => (item.expiryDate ? String(item.expiryDate).slice(0, 20) : null));
      put('featured', 'featured', () => Boolean(item.featured));
      put('isFlashSale', 'isFlashSale', () => Boolean(item.isFlashSale));
      put('isBestSeller', 'isBestSeller', () => Boolean(item.isBestSeller));
      put('isNewArrival', 'isNewArrival', () => Boolean(item.isNewArrival));
      put('videoUrl', 'videoUrl', () => (item.videoUrl ? String(item.videoUrl).trim().slice(0, 1000) : null));
      put('freeShipping', 'freeShipping', () => Boolean(item.freeShipping));
      put('shippingCharges', 'shippingCharges', () => deps.shippingChargesValue(item.shippingCharges));
      if (given('wholesalePrice') || given('wholesaleEnabled')) {
        const wholesalePrice = given('wholesalePrice') ? money(item.wholesalePrice) : existing?.wholesalePrice ?? null;
        values.wholesalePrice = wholesalePrice;
        const wantOn = given('wholesaleEnabled') ? Boolean(item.wholesaleEnabled) : Boolean(existing?.wholesaleEnabled);
        values.wholesaleEnabled = Boolean(wantOn && wholesalePrice && Number(wholesalePrice) > 0);
      }
      put('wholesaleMinQty', 'wholesaleMinQty', () => (item.wholesaleMinQty ? Math.max(1, Math.floor(Number(item.wholesaleMinQty))) || null : null));
      put('wholesaleMaxQty', 'wholesaleMaxQty', () => (item.wholesaleMaxQty ? Math.max(1, Math.floor(Number(item.wholesaleMaxQty))) || null : null));
      // Statuses of this shop: active (published), draft, archived
      const statusFrom = (raw: any) => {
        const value = String(raw || '').toLowerCase();
        if (value === 'archived') return 'archived';
        if (['draft', 'inactive', 'hidden', 'private', 'pending'].includes(value)) return 'draft';
        return 'active';
      };
      if (options.status !== 'keep') values.status = options.status;
      else if (given('status')) values.status = statusFrom(item.status);
      const extras: any = {};
      if (given('highlights')) extras.highlights = Array.isArray(item.highlights) ? item.highlights : [];
      if (given('optionDisplay')) extras.optionDisplay = item.optionDisplay && typeof item.optionDisplay === 'object' ? item.optionDisplay : {};
      if (given('howToUse')) extras.howToUse = (await localiseHtml(item.howToUse)) || '';
      // v3.15 — SEO and tags
      for (const key of ['seoTitle', 'seoDescription', 'seoImage', 'tags'] as const) {
        if (given(key)) extras[key] = (item as any)[key] || '';
      }
      Object.assign(values, deps.productExtras(extras));
      if (!existing) {
        values.stock = options.importStock ? Math.max(0, Math.floor(Number(item.stock ?? item.stockIfNew ?? 0) || 0)) : 0;
      } else if (options.importStock && item.stock !== undefined && item.stock !== null) {
        values.stock = Math.max(0, Math.floor(Number(item.stock) || 0));
      }

      let productId: number;
      if (existing) {
        if (item.barcode) values.barcode = (await barcodeFree(item.barcode, existing.id)) ?? existing.barcode;
        await db.update(products).set(values).where(eq(products.id, existing.id));
        productId = existing.id;
        job.updated += 1;
      } else {
        values.slug = await uniqueValue('products-slug', deps.slugify(slug || item.name));
        values.sku = await uniqueValue('products-sku', sku || `IMP-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`);
        values.barcode = await barcodeFree(item.barcode, null);
        const created = await deps.insertOne(db, products, values);
        if (!created?.id) throw new Error('Could not save the product');
        productId = created.id;
        job.created += 1;
      }

      // Variations: matched by their options so stock history stays on the same row
      const variations = Array.isArray(item.variations) ? item.variations.filter((v) => v && v.combination && typeof v.combination === 'object') : [];
      if (variations.length) {
        const current = await db.select().from(productVariations).where(eq(productVariations.productId, productId));
        const keyOf = (combination: any) =>
          JSON.stringify(
            Object.keys(combination || {})
              .sort()
              .map((k) => [lower(k), lower(combination[k])])
          );
        const keep = new Set<number>();
        let total = 0;
        for (let index = 0; index < variations.length; index += 1) {
          const v = variations[index];
          const match = current.find((row) => {
            try {
              return keyOf(JSON.parse(row.combination)) === keyOf(v.combination);
            } catch {
              return false;
            }
          });
          // As for the product: an existing option only changes where the file says so
          const has = (key: keyof ImportVariation) => !match || (v as any)[key] !== undefined;
          const row: Record<string, any> = {
            productId,
            combination: JSON.stringify(v.combination),
            label: String(v.label || deps.buildVariationLabel(v.combination) || `Variation ${index + 1}`).slice(0, 255),
            sortOrder: index,
          };
          if (has('sku')) row.sku = v.sku ? String(v.sku).slice(0, 100) : null;
          if (has('price')) row.price = money(v.price);
          if (has('salePrice')) row.salePrice = money(v.salePrice);
          if (has('image')) {
            const picture = await localImage(v.image);
            if (picture || !match || !v.image) row.image = picture;
          }
          if (has('status')) row.status = v.status === 'inactive' ? 'inactive' : 'active';
          if (has('barcode')) row.barcode = v.barcode ? (await barcodeFree(v.barcode, productId)) ?? match?.barcode ?? null : null;
          if (has('wholesalePrice')) row.wholesalePrice = money(v.wholesalePrice) && Number(v.wholesalePrice) > 0 ? money(v.wholesalePrice) : null;
          const stockGiven = v.stock !== undefined && v.stock !== null;
          if (!match) row.stock = options.importStock && stockGiven ? Math.max(0, Math.floor(Number(v.stock) || 0)) : 0;
          else if (options.importStock && stockGiven) row.stock = Math.max(0, Math.floor(Number(v.stock) || 0));
          if (match) {
            await db.update(productVariations).set(row).where(eq(productVariations.id, match.id));
            keep.add(match.id);
            total += row.stock ?? match.stock ?? 0;
          } else {
            const created = await deps.insertOne(db, productVariations, row);
            if (created?.id) keep.add(created.id);
            total += row.stock ?? 0;
          }
        }
        for (const row of current) if (!keep.has(row.id)) await db.delete(productVariations).where(eq(productVariations.id, row.id));
        await db.update(products).set({ hasVariations: true, stock: total }).where(eq(products.id, productId));
      }

      // Attributes (Color, Size …): the shop-wide list gains any new value
      const attributeList = Array.isArray(item.attributes) ? item.attributes.filter((a) => a && String(a.name || '').trim()) : [];
      if (attributeList.length) {
        await db.delete(productAttributes).where(eq(productAttributes.productId, productId));
        for (const attribute of attributeList.slice(0, 20)) {
          const valuesList = Array.from(new Set((attribute.values || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, 100);
          if (!valuesList.length) continue;
          let row = attributeRows.find((a) => lower(a.name) === lower(attribute.name));
          if (!row) {
            row = await deps.insertOne(db, attributes, {
              name: String(attribute.name).trim().slice(0, 191),
              slug: await uniqueValue('attributes', deps.slugify(attribute.name)),
              values: JSON.stringify(valuesList),
              sortOrder: attributeRows.length,
            });
            if (!row?.id) continue;
            attributeRows.push(row);
          } else {
            const known = deps.parseValues(row.values);
            const merged = Array.from(new Set([...known, ...valuesList]));
            if (merged.length !== known.length) {
              await db.update(attributes).set({ values: JSON.stringify(merged) }).where(eq(attributes.id, row.id));
              row.values = JSON.stringify(merged);
            }
          }
          await db.insert(productAttributes).values({ productId, attributeId: row.id, attributeName: row.name, value: JSON.stringify(valuesList) });
        }
      }
      if (item.genericName) await deps.rememberGeneric(item.genericName);
    } catch (error: any) {
      job.failed += 1;
      if (job.errors.length < 200) job.errors.push({ name: String(item.name || '—').slice(0, 120), error: String(error?.message || error).slice(0, 300) });
    } finally {
      job.processed += 1;
    }
  }
  await deps.appendToMediaLibrary(mediaItems.reverse());
}

  return {  };
}
