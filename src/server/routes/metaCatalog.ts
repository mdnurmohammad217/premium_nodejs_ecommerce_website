/**
 * Meta catalog feed — /feeds/meta-catalog.csv (and .xml)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerMetaCatalogRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings, products, categories, brands, productVariations } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import express from 'express';
import crypto from 'crypto';
import type * as Server from '../../../server.ts';


export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  availability: 'in stock' | 'out of stock';
  condition: 'new';
  price: string;
  sale_price: string;
  link: string;
  image_link: string;
  additional_image_link: string;
  brand: string;
  item_group_id: string;
  google_product_category: string;
  product_type: string;
  quantity_to_sell_on_facebook: string;
  gtin: string;
  size: string;
  color: string;
  custom_label_0: string;
  custom_label_1: string;
}

export interface RegisterMetaCatalogRoutesDeps {
  app: typeof Server.app;
  catalogItemId: typeof Server.catalogItemId;
  htmlEscape: typeof Server.htmlEscape;
  smsStoreVars: typeof Server.smsStoreVars;
}

export function registerMetaCatalogRoutes(deps: RegisterMetaCatalogRoutesDeps) {
// ==========================================
// META CATALOG FEED — /feeds/meta-catalog.csv (and .xml)
// ==========================================
/**
 * A scheduled data feed for Meta Commerce Manager (Facebook / Instagram shop,
 * Advantage+ catalogue ads). Every item id equals the id the pixel sends
 * (catalogItemId), so ViewContent / AddToCart / Purchase match catalog items.
 * Products with options are listed once per option, grouped by item_group_id.
 * Wholesale prices and cost prices are never included.
 */
async function readCatalogConfig(): Promise<any> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'catalog_config'));
    const cfg = rows.length > 0 ? JSON.parse(rows[0].value) || {} : {};
    return {
      enabled: cfg.enabled !== false,
      feedKey: String(cfg.feedKey || ''),
      includeOutOfStock: cfg.includeOutOfStock !== false,
      brandFallback: String(cfg.brandFallback || ''),
      googleCategory: String(cfg.googleCategory || 'Health & Beauty > Health Care'),
      publicBaseUrl: String(cfg.publicBaseUrl || '').replace(/\/+$/, ''),
      excludeCategoryIds: Array.isArray(cfg.excludeCategoryIds) ? cfg.excludeCategoryIds.map(Number) : [],
    };
  } catch {
    return { enabled: true, feedKey: '', includeOutOfStock: true, brandFallback: '', googleCategory: '', publicBaseUrl: '', excludeCategoryIds: [] };
  }
}

const stripHtml = (value: any) =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function requestOrigin(req: express.Request): string {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Builds every feed row plus the list of products left out, with the reason */
/**
 * v3.15 — the public feed is built at most once every 10 minutes per address
 * (Meta fetches it on a schedule; with 20 000+ products rebuilding it on every
 * request was slow and heavy). Requests that arrive while it is being built
 * wait for that same build. The dashboard preview always builds fresh.
 */
const feedCache = new Map<string, { at: number; result: Promise<Awaited<ReturnType<typeof buildCatalogFresh>>> }>();
function buildCatalogCached(req: express.Request) {
  const key = requestOrigin(req);
  const hit = feedCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.result;
  const result = buildCatalogFresh(req);
  feedCache.set(key, { at: Date.now(), result });
  result.catch(() => feedCache.delete(key));
  return result;
}
const buildCatalog = buildCatalogFresh;

async function buildCatalogFresh(req: express.Request) {
  const cfg = await readCatalogConfig();
  const general = await deps.smsStoreVars();
  const origin = cfg.publicBaseUrl || requestOrigin(req);
  const abs = (url: any) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
  };
  let currencyCode = 'BDT';
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'general'));
    const code = rows.length > 0 ? String(JSON.parse(rows[0].value)?.currencyCode || '') : '';
    if (/^[A-Z]{3}$/i.test(code)) currencyCode = code.toUpperCase();
  } catch {
    /* default */
  }

  const productRows = await db
    .select({ product: products, category: categories, brand: brands })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .orderBy(desc(products.id));
  const variationRows = await db.select().from(productVariations).where(eq(productVariations.status, 'active'));
  const variationsBy = new Map<number, any[]>();
  variationRows.forEach((row) => {
    const list = variationsBy.get(row.productId) || [];
    list.push(row);
    variationsBy.set(row.productId, list);
  });

  const items: CatalogItem[] = [];
  const skipped: Array<{ id: number; name: string; reason: string }> = [];
  const money = (value: number) => `${value.toFixed(2)} ${currencyCode}`;

  for (const { product, category, brand } of productRows) {
    if (product.status === 'deleted') continue;
    if (product.status !== 'active') {
      skipped.push({ id: product.id, name: product.name, reason: 'Not published' });
      continue;
    }
    if (product.categoryId && cfg.excludeCategoryIds.includes(product.categoryId)) {
      skipped.push({ id: product.id, name: product.name, reason: 'Category excluded' });
      continue;
    }
    let gallery: string[] = [];
    try {
      gallery = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images as any) || [];
    } catch {
      gallery = [];
    }
    const mainImage = abs(product.image || gallery[0]);
    if (!mainImage) {
      skipped.push({ id: product.id, name: product.name, reason: 'No image' });
      continue;
    }
    const regular = Number(product.price) || 0;
    if (regular <= 0) {
      skipped.push({ id: product.id, name: product.name, reason: 'No price' });
      continue;
    }
    const description =
      stripHtml(product.description) || stripHtml(product.shortDescription) || `${product.name}${product.genericName ? ` (${product.genericName})` : ''}`;
    const base = {
      title: product.name.slice(0, 200),
      description: description.slice(0, 9999),
      condition: 'new' as const,
      link: `${origin}/product/${product.slug}`,
      additional_image_link: gallery
        .map(abs)
        .filter((url) => url && url !== mainImage)
        .slice(0, 10)
        .join(','),
      brand: (brand?.name || cfg.brandFallback || general.store || '').slice(0, 100),
      google_product_category: cfg.googleCategory,
      product_type: category?.name || '',
      custom_label_0: product.genericName || '',
      custom_label_1: product.requiresPrescription ? 'Prescription' : '',
    };
    const barcode = String(product.barcode || '').replace(/\D/g, '');
    const gtin = [8, 12, 13, 14].includes(barcode.length) ? barcode : '';
    const variations = product.hasVariations ? variationsBy.get(product.id) || [] : [];

    if (variations.length === 0) {
      const stock = Number(product.stock || 0);
      if (stock <= 0 && !cfg.includeOutOfStock) {
        skipped.push({ id: product.id, name: product.name, reason: 'Out of stock' });
        continue;
      }
      const sale = Number(product.salePrice) || 0;
      items.push({
        ...base,
        id: deps.catalogItemId(product.sku, product.id),
        image_link: mainImage,
        availability: stock > 0 ? 'in stock' : 'out of stock',
        price: money(regular),
        sale_price: sale > 0 && sale < regular ? money(sale) : '',
        item_group_id: '',
        quantity_to_sell_on_facebook: String(Math.max(0, stock)),
        gtin,
        size: '',
        color: '',
      });
      continue;
    }

    for (const variation of variations) {
      const stock = Number(variation.stock || 0);
      if (stock <= 0 && !cfg.includeOutOfStock) continue;
      let combination: Record<string, string> = {};
      try {
        combination = JSON.parse(variation.combination || '{}') || {};
      } catch {
        combination = {};
      }
      const pick = (pattern: RegExp) =>
        Object.entries(combination).find(([name]) => pattern.test(name))?.[1] || '';
      const vRegular = Number(variation.price) || regular;
      const vSale = Number(variation.salePrice) || (variation.price ? 0 : Number(product.salePrice) || 0);
      items.push({
        ...base,
        id: deps.catalogItemId(product.sku, product.id, variation.sku, variation.id),
        title: `${product.name} - ${variation.label}`.slice(0, 200),
        image_link: abs(variation.image) || mainImage,
        availability: stock > 0 ? 'in stock' : 'out of stock',
        price: money(vRegular),
        sale_price: vSale > 0 && vSale < vRegular ? money(vSale) : '',
        item_group_id: deps.catalogItemId(product.sku, product.id),
        quantity_to_sell_on_facebook: String(Math.max(0, stock)),
        gtin: '',
        size: String(pick(/size|weight|volume|pack|ml|gm|mg|সাইজ|ওজন/i)).slice(0, 100),
        color: String(pick(/colou?r|রং/i)).slice(0, 100),
        link: `${base.link}?variant=${variation.id}`,
      });
    }
  }
  return { cfg, items, skipped, origin };
}

const CATALOG_COLUMNS: Array<keyof CatalogItem> = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link',
  'additional_image_link', 'brand', 'item_group_id', 'google_product_category', 'product_type',
  'quantity_to_sell_on_facebook', 'gtin', 'size', 'color', 'custom_label_0', 'custom_label_1',
];

const csvCell = (value: any) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function serveCatalog(req: express.Request, res: express.Response, format: 'csv' | 'xml') {
  try {
    const cfg = await readCatalogConfig();
    if (!cfg.enabled) return res.status(404).type('text/plain').send('Catalog feed is switched off.');
    if (cfg.feedKey && String(req.query.key || '') !== cfg.feedKey) {
      return res.status(403).type('text/plain').send('Invalid feed key.');
    }
    const { items } = await buildCatalogCached(req);
    res.setHeader('Cache-Control', 'public, max-age=900');
    if (format === 'csv') {
      const lines = [CATALOG_COLUMNS.join(',')].concat(items.map((item) => CATALOG_COLUMNS.map((key) => csvCell(item[key])).join(',')));
      res.type('text/csv; charset=utf-8').send(`\ufeff${lines.join('\n')}\n`);
      return;
    }
    const x = (value: any) => deps.htmlEscape(value);
    const general = await deps.smsStoreVars();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${x(general.store)}</title>
<link>${x(requestOrigin(req))}</link>
<description>${x(general.store)} product catalog</description>
${items
  .map(
    (item) => `<item>
${CATALOG_COLUMNS.filter((key) => item[key] !== '')
  .map((key) =>
    key === 'additional_image_link'
      ? String(item[key]).split(',').map((url) => `<g:additional_image_link>${x(url)}</g:additional_image_link>`).join('')
      : `<g:${key}>${x(item[key])}</g:${key}>`
  )
  .join('\n')}
</item>`
  )
  .join('\n')}
</channel>
</rss>`;
    res.type('application/xml; charset=utf-8').send(xml);
  } catch (error: any) {
    console.error('catalog feed:', error);
    res.status(500).type('text/plain').send('Feed temporarily unavailable.');
  }
}

deps.app.get('/feeds/meta-catalog.csv', (req, res) => serveCatalog(req, res, 'csv'));
deps.app.get('/feeds/meta-catalog.xml', (req, res) => serveCatalog(req, res, 'xml'));

/** Dashboard: feed URLs, counts, what is left out and why, and a preview */
deps.app.get('/api/admin/catalog/summary', async (req, res) => {
  try {
    const { cfg, items, skipped, origin } = await buildCatalog(req);
    const keyPart = cfg.feedKey ? `?key=${encodeURIComponent(cfg.feedKey)}` : '';
    const warnings: string[] = [];
    const noDescription = items.filter((item) => item.description.length < 20).length;
    if (noDescription > 0) warnings.push(`${noDescription} item(s) have a very short description — Meta may reject them.`);
    const noBrand = items.filter((item) => !item.brand).length;
    if (noBrand > 0) warnings.push(`${noBrand} item(s) have no brand. Set a default brand below.`);
    if (!/^https:\/\//.test(origin)) warnings.push('Your site address is not HTTPS — Meta needs HTTPS links and images.');
    res.json({
      config: cfg,
      csvUrl: `${origin}/feeds/meta-catalog.csv${keyPart}`,
      xmlUrl: `${origin}/feeds/meta-catalog.xml${keyPart}`,
      counts: {
        items: items.length,
        products: new Set(items.map((item) => item.item_group_id || item.id)).size,
        inStock: items.filter((item) => item.availability === 'in stock').length,
        skipped: skipped.length,
      },
      skipped: skipped.slice(0, 100),
      warnings,
      preview: items.slice(0, 8),
    });
  } catch (error: any) {
    console.error('catalog summary:', error);
    res.status(500).json({ error: 'Could not build the catalog.' });
  }
});

deps.app.put('/api/admin/catalog/config', async (req, res) => {
  try {
    const body = req.body || {};
    const current = await readCatalogConfig();
    const value = JSON.stringify({
      enabled: body.enabled !== false,
      feedKey: body.regenerateKey || !current.feedKey ? crypto.randomBytes(12).toString('hex') : current.feedKey,
      includeOutOfStock: body.includeOutOfStock !== false,
      brandFallback: String(body.brandFallback || '').slice(0, 100),
      googleCategory: String(body.googleCategory || '').slice(0, 250),
      publicBaseUrl: String(body.publicBaseUrl || '').trim(),
      excludeCategoryIds: Array.isArray(body.excludeCategoryIds) ? body.excludeCategoryIds.map(Number).filter(Boolean) : [],
    });
    await db.insert(siteSettings).values({ key: 'catalog_config', value }).onDuplicateKeyUpdate({ set: { value } });
    feedCache.clear();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not save the catalog settings.' });
  }
});

  return {  };
}
