/**
 * v3.9 — moving products between shops (Dashboard → Products → Import / Export).
 *
 * Export writes a file another shop running this software reads back with
 * everything attached: price, sale and cost price, stock, category (with its
 * parents), brand, pictures (as full web links so the other shop can download
 * them), variations, attributes and the product page extras.
 *
 * Import reads three kinds of file and turns each into the same plain list:
 *   • our own JSON export  (full detail — the best way between two of our shops)
 *   • our own CSV export   (opens in Excel / Google Sheets for bulk edits)
 *   • a WooCommerce or Shopify product CSV (moving from a WordPress / Shopify shop)
 *
 * Nothing here touches the database; server.ts does that.
 */
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

/* ------------------------------------------------------------------ types */

export interface ImportCategoryStep {
  name: string;
  slug?: string;
  image?: string | null;
  icon?: string | null;
}

export interface ImportVariation {
  combination: Record<string, string>;
  label?: string;
  sku?: string | null;
  price?: number | null;
  salePrice?: number | null;
  stock?: number;
  image?: string | null;
  status?: string;
  barcode?: string | null;
  wholesalePrice?: number | null;
}

export interface ImportProduct {
  name: string;
  slug?: string;
  sku?: string;
  barcode?: string | null;
  genericName?: string | null;
  categoryPath?: ImportCategoryStep[];
  brand?: { name: string; slug?: string; logo?: string | null } | null;
  description?: string | null;
  shortDescription?: string | null;
  howToUse?: string | null;
  /** v3.15 — product SEO and tags */
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImage?: string | null;
  tags?: string | null;
  /** Missing = keep the existing price (a new product gets 0) */
  price?: number;
  /** Starting stock when the product is new and the file has no stock number */
  stockIfNew?: number;
  salePrice?: number | null;
  costPrice?: number | null;
  stock?: number;
  lowStockThreshold?: number | null;
  unit?: string | null;
  dosage?: string | null;
  requiresPrescription?: boolean;
  batchNumber?: string | null;
  expiryDate?: string | null;
  featured?: boolean;
  isFlashSale?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  image?: string | null;
  images?: string[];
  videoUrl?: string | null;
  freeShipping?: boolean;
  shippingCharges?: any;
  wholesaleEnabled?: boolean;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  wholesaleMaxQty?: number | null;
  status?: string;
  highlights?: any;
  optionDisplay?: any;
  variations?: ImportVariation[];
  attributes?: Array<{ name: string; values: string[] }>;
}

export type ImportSource = 'json' | 'csv' | 'woocommerce' | 'shopify';

/* ------------------------------------------------------------------ CSV */

/** RFC 4180 CSV reader: quoted cells, "" escapes, new lines inside quotes, BOM, ; or , */
export function parseCsv(text: string): string[][] {
  let input = String(text || '');
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
  const firstLine = input.slice(0, input.indexOf('\n') === -1 ? input.length : input.indexOf('\n'));
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvCellOut(value: any): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: any[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCellOut).join(',')).join('\r\n') + '\r\n';
}

/** Rows → objects keyed by a normalised header (lower case, single spaces) */
function rowsToRecords(rows: string[][]): Array<Record<string, string>> {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  return rows.slice(1).map((r) => {
    const out: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key && out[key] === undefined) out[key] = (r[i] ?? '').trim();
    });
    return out;
  });
}

/* ------------------------------------------------------------------ helpers */

const num = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[৳$,\s]/g, '').replace(/^Tk\.?/i, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
const int = (value: any): number | null => {
  const n = num(value);
  return n === null ? null : Math.round(n);
};
const bool = (value: any): boolean => /^(1|yes|true|y|on|visible|publish|published|active)$/i.test(String(value ?? '').trim());
const json = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};
const str = (value: any): string | null => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? text : null;
};
const splitList = (value: any, separators = /\s*[|,]\s*/): string[] =>
  String(value ?? '')
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean);
const pathFromText = (value: any): ImportCategoryStep[] =>
  String(value ?? '')
    .split(/\s*>\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

/* ------------------------------------------------------------------ our CSV */

export const OUR_CSV_COLUMNS = [
  'Name',
  'SKU',
  'Slug',
  'Barcode',
  'Category',
  'Brand',
  'Regular price',
  'Sale price',
  'Cost price',
  'Stock',
  'Low stock alert',
  'Unit',
  'Status',
  'Featured',
  'Flash sale',
  'Best seller',
  'New arrival',
  'Free shipping',
  'Short description',
  'Description',
  'How to use',
  'Image',
  'Gallery images',
  'Video URL',
  'Generic name',
  'Dosage',
  'Requires prescription',
  'Batch number',
  'Expiry date',
  'Wholesale enabled',
  'Wholesale price',
  'Wholesale min qty',
  'Wholesale max qty',
  'Variations (JSON)',
  'Attributes (JSON)',
  'Highlights (JSON)',
  'Option display (JSON)',
  'Shipping charges (JSON)',
  // v3.15
  'SEO title',
  'SEO description',
  'SEO image',
  'Tags',
];

export function productToCsvRow(p: ImportProduct): any[] {
  return [
    p.name,
    p.sku,
    p.slug,
    p.barcode,
    (p.categoryPath || []).map((c) => c.name).join(' > '),
    p.brand?.name || '',
    p.price,
    p.salePrice ?? '',
    p.costPrice ?? '',
    p.stock ?? 0,
    p.lowStockThreshold ?? '',
    p.unit,
    p.status,
    p.featured ? 1 : 0,
    p.isFlashSale ? 1 : 0,
    p.isBestSeller ? 1 : 0,
    p.isNewArrival ? 1 : 0,
    p.freeShipping ? 1 : 0,
    p.shortDescription,
    p.description,
    p.howToUse,
    p.image,
    (p.images || []).join(' | '),
    p.videoUrl,
    p.genericName,
    p.dosage,
    p.requiresPrescription ? 1 : 0,
    p.batchNumber,
    p.expiryDate,
    p.wholesaleEnabled ? 1 : 0,
    p.wholesalePrice ?? '',
    p.wholesaleMinQty ?? '',
    p.wholesaleMaxQty ?? '',
    p.variations && p.variations.length ? p.variations : '',
    p.attributes && p.attributes.length ? p.attributes : '',
    p.highlights || '',
    p.optionDisplay || '',
    p.shippingCharges || '',
    p.seoTitle || '',
    p.seoDescription || '',
    p.seoImage || '',
    p.tags || '',
  ];
}

/**
 * Our own CSV. Only the columns that are in the file are imported: a sheet
 * cut down to Name + SKU + Regular price updates the prices and leaves every
 * other detail of an existing product alone. A blank Stock cell is "not
 * given" too (never "set to 0").
 */
function fromOurCsv(records: Array<Record<string, string>>): ImportProduct[] {
  const header = new Set(Object.keys(records[0] || {}));
  type Reader = (value: string) => any;
  const fields: Array<[string, keyof ImportProduct, Reader]> = [
    ['sku', 'sku', (v) => str(v) || undefined],
    ['slug', 'slug', (v) => str(v) || undefined],
    ['barcode', 'barcode', str],
    ['category', 'categoryPath', pathFromText],
    ['brand', 'brand', (v) => (str(v) ? { name: v.trim() } : null)],
    ['regular price', 'price', (v) => num(v) ?? undefined],
    ['sale price', 'salePrice', num],
    ['cost price', 'costPrice', num],
    ['stock', 'stock', (v) => int(v) ?? undefined],
    ['low stock alert', 'lowStockThreshold', int],
    ['unit', 'unit', str],
    ['status', 'status', (v) => str(v) || undefined],
    ['featured', 'featured', bool],
    ['flash sale', 'isFlashSale', bool],
    ['best seller', 'isBestSeller', bool],
    ['new arrival', 'isNewArrival', bool],
    ['free shipping', 'freeShipping', bool],
    ['short description', 'shortDescription', str],
    ['description', 'description', str],
    ['how to use', 'howToUse', str],
    ['seo title', 'seoTitle', str],
    ['seo description', 'seoDescription', str],
    ['seo image', 'seoImage', str],
    ['tags', 'tags', str],
    ['image', 'image', str],
    ['gallery images', 'images', (v) => splitList(v, /\s*\|\s*/)],
    ['video url', 'videoUrl', str],
    ['generic name', 'genericName', str],
    ['dosage', 'dosage', str],
    ['requires prescription', 'requiresPrescription', bool],
    ['batch number', 'batchNumber', str],
    ['expiry date', 'expiryDate', str],
    ['wholesale enabled', 'wholesaleEnabled', bool],
    ['wholesale price', 'wholesalePrice', num],
    ['wholesale min qty', 'wholesaleMinQty', int],
    ['wholesale max qty', 'wholesaleMaxQty', int],
    ['variations (json)', 'variations', (v) => (Array.isArray(json(v)) ? json(v) : undefined)],
    ['attributes (json)', 'attributes', (v) => (Array.isArray(json(v)) ? json(v) : undefined)],
    ['highlights (json)', 'highlights', json],
    ['option display (json)', 'optionDisplay', json],
    ['shipping charges (json)', 'shippingCharges', json],
  ];
  return records
    .filter((r) => str(r['name']))
    .map((r) => {
      const product: any = { name: r['name'] };
      for (const [column, key, read] of fields) {
        if (!header.has(column)) continue;
        const value = read(r[column] ?? '');
        if (value !== undefined) product[key] = value;
      }
      return product as ImportProduct;
    });
}

/* ------------------------------------------------------------------ WooCommerce */

function wooAttributes(r: Record<string, string>): Array<{ name: string; values: string[] }> {
  const out: Array<{ name: string; values: string[] }> = [];
  for (let n = 1; n <= 10; n += 1) {
    const name = str(r[`attribute ${n} name`]);
    if (!name) continue;
    out.push({ name, values: splitList(r[`attribute ${n} value(s)`], /\s*,\s*/) });
  }
  return out;
}

function fromWooCommerce(records: Array<Record<string, string>>): ImportProduct[] {
  const parents = new Map<string, ImportProduct>();
  const list: ImportProduct[] = [];
  const pending: Array<Record<string, string>> = [];
  for (const r of records) {
    const type = String(r['type'] || 'simple').toLowerCase();
    if (type.includes('variation') && !type.includes('variable')) {
      pending.push(r);
      continue;
    }
    if (!str(r['name'])) continue;
    const regular = num(r['regular price']);
    const sale = num(r['sale price']);
    const categories = String(r['categories'] || '').split(/\s*,\s*/).filter(Boolean);
    const images = splitList(r['images'], /\s*,\s*/);
    const attributes = wooAttributes(r);
    // Only what the file really has: an existing product keeps everything else
    const product: any = { name: r['name'], variations: [] };
    if (str(r['sku'])) product.sku = r['sku'].trim();
    if (categories.length) product.categoryPath = pathFromText(categories[0]);
    if (str(r['brands'])) product.brand = { name: String(r['brands']).split(',')[0].trim() };
    if ('description' in r) product.description = str(r['description']);
    if ('short description' in r) product.shortDescription = str(r['short description']);
    if (regular !== null || sale !== null) product.price = regular ?? sale ?? 0;
    if ('sale price' in r) product.salePrice = regular !== null && sale !== null && sale < regular ? sale : null;
    if (int(r['stock']) !== null) product.stock = int(r['stock']);
    else if ('in stock?' in r) {
      if (/^(1|yes|true)$/i.test(r['in stock?'] || '')) product.stockIfNew = 10; // stock not tracked: a new product starts with 10
      else product.stock = 0;
    }
    if ('published' in r) product.status = r['published'] === '1' || bool(r['published']) ? 'active' : 'draft';
    if ('is featured?' in r) product.featured = bool(r['is featured?']);
    if (images.length) {
      product.image = images[0];
      product.images = images.slice(1);
    }
    const usable = attributes.filter((a) => a.values.length);
    if (usable.length) product.attributes = usable;
    list.push(product);
    if (str(r['id'])) parents.set(`id:${r['id']}`, product);
    if (product.sku) parents.set(product.sku, product);
  }
  for (const r of pending) {
    const parentKey = String(r['parent'] || '').trim();
    const parent = parents.get(parentKey) || parents.get(`id:${parentKey.replace(/^id:/, '')}`);
    if (!parent) continue;
    const combination: Record<string, string> = {};
    for (const attr of wooAttributes(r)) if (attr.values[0]) combination[attr.name] = attr.values[0];
    const regular = num(r['regular price']);
    const sale = num(r['sale price']);
    const image = splitList(r['images'], /\s*,\s*/)[0] || null;
    parent.variations!.push({
      combination,
      sku: str(r['sku']),
      price: regular,
      salePrice: regular !== null && sale !== null && sale < regular ? sale : null,
      stock: int(r['stock']) ?? 0,
      image,
      status: r['published'] === '0' || r['published'] === '-1' ? 'inactive' : 'active',
    });
  }
  for (const p of list) {
    if (p.variations && p.variations.length) {
      p.stock = p.variations.reduce((s, v) => s + (v.stock || 0), 0);
      if (!p.price) {
        const prices = p.variations.map((v) => v.price || 0).filter((n) => n > 0);
        p.price = prices.length ? Math.min(...prices) : 0;
      }
    }
  }
  return list;
}

/* ------------------------------------------------------------------ Shopify */

function fromShopify(records: Array<Record<string, string>>): ImportProduct[] {
  const byHandle = new Map<string, ImportProduct & { _options: string[] }>();
  const order: string[] = [];
  for (const r of records) {
    const handle = str(r['handle']);
    if (!handle) continue;
    let product = byHandle.get(handle);
    if (!product) {
      if (!str(r['title'])) continue;
      product = {
        name: r['title'],
        slug: handle,
        images: [],
        variations: [],
        _options: [1, 2, 3].map((n) => str(r[`option${n} name`]) || '').filter(Boolean),
      } as any;
      // Only what the file really has: an existing product keeps everything else
      const q: any = product;
      if ('body (html)' in r) q.description = str(r['body (html)']);
      if (str(r['vendor'])) q.brand = { name: r['vendor'].trim() };
      const path = pathFromText(r['product category'] || r['type']).slice(-3);
      if (path.length) q.categoryPath = path;
      if ('status' in r || 'published' in r) q.status = /^(active|true)$/i.test(r['status'] || r['published'] || '') ? 'active' : 'draft';
      byHandle.set(handle, product!);
      order.push(handle);
    }
    const p = product!;
    const img = str(r['image src']);
    if (img) {
      if (!p.image) p.image = img;
      else if (img !== p.image && !p.images!.includes(img)) p.images!.push(img);
    }
    const price = num(r['variant price']);
    if (price === null) continue;
    const compare = num(r['variant compare at price']);
    const regular = compare && compare > price ? compare : price;
    const sale = compare && compare > price ? price : null;
    const combination: Record<string, string> = {};
    p._options.forEach((name, i) => {
      const value = str(r[`option${i + 1} value`]);
      if (name && value && !(name === 'Title' && value === 'Default Title')) combination[name] = value;
    });
    const stockGiven = int(r['variant inventory qty']);
    const stock = stockGiven ?? 0;
    if (Object.keys(combination).length === 0) {
      p.sku = str(r['variant sku']) || p.sku;
      p.barcode = str(r['variant barcode']) || p.barcode;
      p.price = regular;
      p.salePrice = sale;
      if (stockGiven !== null) p.stock = stockGiven;
      const cost = num(r['cost per item']);
      if (cost !== null) p.costPrice = cost;
    } else {
      p.variations!.push({
        combination,
        sku: str(r['variant sku']),
        barcode: str(r['variant barcode']),
        price: regular,
        salePrice: sale,
        stock,
        image: str(r['variant image']),
      });
    }
  }
  return order.map((h) => {
    const p = byHandle.get(h)!;
    const { _options, ...rest } = p as any;
    if (!rest.images.length) delete rest.images;
    if (rest.variations.length) {
      rest.stock = rest.variations.reduce((s: number, v: ImportVariation) => s + (v.stock || 0), 0);
      const prices = rest.variations.map((v: ImportVariation) => v.price || 0).filter((n: number) => n > 0);
      rest.price = prices.length ? Math.min(...prices) : 0;
      rest.attributes = _options
        .filter((name: string) => name !== 'Title')
        .map((name: string) => ({
          name,
          values: Array.from(new Set(rest.variations.map((v: ImportVariation) => v.combination[name]).filter(Boolean))) as string[],
        }));
    }
    return rest as ImportProduct;
  });
}

/* ------------------------------------------------------------------ entry */

export function readImportFile(text: string): { source: ImportSource; products: ImportProduct[] } {
  const trimmed = String(text || '').replace(/^﻿/, '').trim();
  if (!trimmed) throw new Error('The file is empty.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('This JSON file could not be read. Please export it again.');
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : null;
    if (!list) throw new Error('No products were found in this JSON file.');
    return {
      source: 'json',
      products: list
        .filter((p: any) => p && str(p.name))
        .map((p: any) => {
          const out = { ...p };
          if ('price' in out) out.price = num(out.price) ?? undefined;
          if ('images' in out && !Array.isArray(out.images)) delete out.images;
          return out;
        }),
    };
  }
  const records = rowsToRecords(parseCsv(trimmed));
  if (!records.length) throw new Error('No product rows were found in this CSV file.');
  const keys = Object.keys(records[0]);
  if (keys.includes('handle') && keys.includes('title')) return { source: 'shopify', products: fromShopify(records) };
  if (keys.includes('regular price') && (keys.includes('type') || keys.includes('in stock?') || keys.includes('categories'))) {
    return { source: 'woocommerce', products: fromWooCommerce(records) };
  }
  if (!keys.includes('name')) throw new Error('The CSV needs a "Name" column. Use the CSV from Export as a template.');
  return { source: 'csv', products: fromOurCsv(records) };
}

/* ------------------------------------------------------------------ links */

/** A picture link as a full web address, so another shop can download it */
export function absoluteUrl(value: string | null | undefined, origin: string): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^(https?:)?\/\//i.test(text)) return text.startsWith('//') ? `https:${text}` : text;
  if (/^data:/i.test(text)) return null;
  if (!origin) return text;
  return `${origin}${text.startsWith('/') ? '' : '/'}${text}`;
}

/** Makes every <img src> inside a description a full link */
export function absolutiseHtml(html: string | null | undefined, origin: string): string | null {
  if (!html) return html ?? null;
  return String(html).replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (_m, start, quote, src) => {
    return `${start}${quote}${absoluteUrl(src, origin) || src}${quote}`;
  });
}

export function imageLinksInHtml(html: string | null | undefined): string[] {
  const out: string[] = [];
  String(html || '').replace(/<img\b[^>]*?\bsrc=(["'])(https?:\/\/[^"']+)\1/gi, (_m, _q, src) => {
    out.push(src);
    return '';
  });
  return out;
}

/* ------------------------------------------------------------------ downloads */

/** Addresses a picture may never be fetched from (this server, the LAN, cloud metadata …) */
// Two lists: Node also matches IPv4 addresses against IPv4-mapped IPv6 rules,
// so the IPv6 rules must never see an IPv4 address.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) BLOCKED_V4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 96], // unspecified, loopback and IPv4-compatible
  ['::ffff:0:0', 96], // IPv4-mapped — the IPv4 part is checked on its own below
  ['64:ff9b::', 96], // NAT64
  ['2002::', 16], // 6to4
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) BLOCKED_V6.addSubnet(address, prefix, 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const ip = String(address || '').replace(/^\[|\]$/g, '');
  if (net.isIPv4(ip)) return BLOCKED_V4.check(ip, 'ipv4');
  if (net.isIPv6(ip)) return BLOCKED_V6.check(ip, 'ipv6');
  return true;
}

const allowPrivate = () => /^(1|true|yes|on)$/i.test(String(process.env.PRODUCT_IMPORT_ALLOW_PRIVATE || ''));

/**
 * DNS lookup used for the connection itself: the address is checked at the
 * moment the socket connects, so a name that changes its answer between a
 * check and the download (DNS rebinding) cannot reach a private address.
 */
function safeLookup(hostname: string, options: any, callback: any) {
  dns.lookup(hostname, { ...(typeof options === 'object' ? options : {}), all: true }, (error, addresses: any) => {
    if (error) return callback(error);
    const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }]) as Array<{ address: string; family: number }>;
    const bad = !allowPrivate() && (list.length === 0 || list.some((item) => isPrivateAddress(item.address)));
    if (bad) return callback(new Error('This picture link points inside a private network.'));
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function requestOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<{ status: number; location?: string; mime: string; buffer?: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup as any,
        headers: { 'User-Agent': 'Mozilla/5.0 (product import)', Accept: 'image/*' },
      },
      (res) => {
        const status = res.statusCode || 0;
        const mime = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: String(res.headers.location), mime });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ status, mime });
        }
        if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
          res.destroy();
          return reject(new Error('Not a picture'));
        }
        if (Number(res.headers['content-length'] || 0) > maxBytes) {
          res.destroy();
          return reject(new Error('Picture is larger than 8 MB'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error('Picture is larger than 8 MB'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status, mime, buffer: Buffer.concat(chunks) }));
        res.on('error', reject);
      }
    );
    // One deadline for the whole download, body included (a site that trickles bytes is cut off)
    const timer = setTimeout(() => req.destroy(new Error('The picture took too long to download')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Downloads one picture from another website: public addresses only (checked
 * when connecting), JPG/PNG/WEBP/GIF/AVIF only — never SVG, which can carry
 * script — at most `maxBytes`, 25 seconds in all, up to 3 redirects.
 */
export async function downloadImage(link: string, maxBytes: number): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
  let url = new URL(link);
  for (let hop = 0; hop < 4; hop += 1) {
    if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) picture links can be downloaded.');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // An address typed straight into the link never goes through the lookup above
    if (net.isIP(host) && !allowPrivate() && isPrivateAddress(host)) throw new Error('This picture link points inside a private network.');
    const answer = await requestOnce(url, maxBytes, 25_000);
    if (answer.location) {
      url = new URL(answer.location, url);
      continue;
    }
    if (!answer.buffer) throw new Error(`HTTP ${answer.status}`);
    const fileName = decodeURIComponent(url.pathname.split('/').pop() || 'image');
    return { buffer: answer.buffer, mime: answer.mime, fileName };
  }
  throw new Error('Too many redirects');
}
