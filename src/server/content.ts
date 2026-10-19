/**
 * v3.6 content features: size guides, review moderation, blog and landing
 * pages. Public reads are cheap single-table queries (and are cached by the
 * response cache); every write is admin-only.
 */
import type express from 'express';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { blogPosts, landingPages, productVariations, products, reviews, sizeGuides, siteSettings } from '../db/schema.ts';
import {
  DEFAULT_LANDING_SHIPPING,
  defaultLandingContent,
  normalizeLandingContent,
  type LandingProductLink,
  type LandingTemplateId,
} from '../lib/landingTemplates.ts';

export interface ContentDeps {
  requireAdmin: express.RequestHandler;
  clientIp: (req: express.Request) => string;
  readSession: (token?: string | null) => { role: string } | null;
  getBearer: (req: express.Request) => string | null;
}

const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : []);

export function slugifyText(input: string): string {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 150);
  return base || `page-${Date.now().toString(36)}`;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const cleanText = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

/** Visitor counters are buffered and written once a minute — a busy page costs no extra writes */
function viewCounter(flush: (id: number, count: number) => Promise<any>) {
  const pending = new Map<number, number>();
  setInterval(async () => {
    if (pending.size === 0) return;
    const batch = Array.from(pending.entries());
    pending.clear();
    for (const [id, count] of batch) {
      try {
        await flush(id, count);
      } catch {
        /* a lost view count is not worth an error */
      }
    }
  }, 60_000).unref?.();
  return (id: number) => {
    if (!id) return;
    if (pending.size > 20_000) return;
    pending.set(id, (pending.get(id) || 0) + 1);
  };
}

async function uniqueSlug(table: any, column: any, idColumn: any, wanted: string, exceptId?: number): Promise<string> {
  const base = slugifyText(wanted);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await db.select({ id: idColumn }).from(table).where(eq(column, candidate)).limit(1);
    if (clash.length === 0 || (exceptId && clash[0].id === exceptId)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Product fields a landing page may show — never cost or wholesale prices */
function shopProduct(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    image: row.image,
    images: row.images,
    price: row.price,
    salePrice: row.salePrice,
    stock: row.stock,
    unit: row.unit,
    hasVariations: Boolean(row.hasVariations),
    freeShipping: Boolean(row.freeShipping),
    shippingCharges: row.shippingCharges || null,
    status: row.status,
  };
}

export async function recalcProductRating(productId: number) {
  const result: any = await db.execute(
    sql`SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0) AS avg FROM reviews WHERE product_id = ${productId} AND status = 'approved'`
  );
  const row = rowsOf(result)[0] || {};
  const count = Number(row.n) || 0;
  await db
    .update(products)
    .set({ rating: count ? Number(row.avg).toFixed(2) : '0.00', reviewCount: count })
    .where(eq(products.id, productId));
}

export function registerContent(app: express.Express, deps: ContentDeps) {
  const admin = deps.requireAdmin;

  /* ================================================================ SIZE GUIDES */

  const guideOut = (row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    columns: parseJson<string[]>(row.columns, []),
    rows: parseJson<string[][]>(row.rows, []),
    image: row.image || '',
    note: row.note || '',
    status: row.status,
    updatedAt: row.updatedAt,
  });

  const guideBody = (body: any) => {
    const columns = (Array.isArray(body?.columns) ? body.columns : []).map((cell: any) => cleanText(cell, 60)).slice(0, 12);
    const rows = (Array.isArray(body?.rows) ? body.rows : [])
      .slice(0, 60)
      .map((row: any) => (Array.isArray(row) ? row : []).slice(0, columns.length).map((cell: any) => cleanText(cell, 60)));
    return {
      name: cleanText(body?.name, 191),
      description: cleanText(body?.description, 1000) || null,
      columns: JSON.stringify(columns),
      rows: JSON.stringify(rows.map((row: string[]) => columns.map((_: string, index: number) => row[index] || ''))),
      image: cleanText(body?.image, 1000) || null,
      note: cleanText(body?.note, 1000) || null,
      status: body?.status === 'inactive' ? 'inactive' : 'active',
    };
  };

  app.get('/api/size-guides/:id', async (req, res) => {
    const row = (await db.select().from(sizeGuides).where(eq(sizeGuides.id, Number(req.params.id) || 0)).limit(1))[0];
    if (!row || row.status !== 'active') return res.status(404).json({ error: 'Size guide not found.' });
    res.json(guideOut(row));
  });

  app.get('/api/admin/size-guides', admin, async (_req, res) => {
    const rows = await db.select().from(sizeGuides).orderBy(desc(sizeGuides.id));
    const counts = rowsOf(
      await db.execute(sql`SELECT size_guide_id AS id, COUNT(*) AS n FROM products WHERE size_guide_id IS NOT NULL AND status <> 'deleted' GROUP BY size_guide_id`)
    );
    const byId = new Map(counts.map((row: any) => [Number(row.id), Number(row.n)]));
    res.json(rows.map((row) => ({ ...guideOut(row), productCount: byId.get(row.id) || 0 })));
  });

  app.post('/api/admin/size-guides', admin, async (req, res) => {
    const values = guideBody(req.body);
    if (!values.name) return res.status(400).json({ error: 'Give the size guide a name.' });
    if (JSON.parse(values.columns).length === 0) return res.status(400).json({ error: 'Add at least one column.' });
    await db.insert(sizeGuides).values(values);
    const row = (await db.select().from(sizeGuides).orderBy(desc(sizeGuides.id)).limit(1))[0];
    res.json({ success: true, guide: guideOut(row) });
  });

  app.put('/api/admin/size-guides/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const values = guideBody(req.body);
    if (!values.name) return res.status(400).json({ error: 'Give the size guide a name.' });
    await db.update(sizeGuides).set({ ...values, updatedAt: new Date() }).where(eq(sizeGuides.id, id));
    const row = (await db.select().from(sizeGuides).where(eq(sizeGuides.id, id)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Size guide not found.' });
    res.json({ success: true, guide: guideOut(row) });
  });

  app.delete('/api/admin/size-guides/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    await db.update(products).set({ sizeGuideId: null }).where(eq(products.sizeGuideId, id));
    await db.delete(sizeGuides).where(eq(sizeGuides.id, id));
    res.json({ success: true });
  });

  /* ================================================================ REVIEWS (moderation) */

  app.get('/api/admin/reviews', admin, async (req, res) => {
    const status = String(req.query.status || 'all');
    const search = cleanText(req.query.search, 100);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));
    const conditions: any[] = [];
    if (['approved', 'pending', 'hidden'].includes(status)) conditions.push(eq(reviews.status, status));
    if (search) {
      conditions.push(or(like(reviews.userName, `%${search}%`), like(reviews.comment, `%${search}%`), like(products.name, `%${search}%`)));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        userName: reviews.userName,
        userPhone: reviews.userPhone,
        rating: reviews.rating,
        comment: reviews.comment,
        status: reviews.status,
        reply: reviews.reply,
        createdAt: reviews.createdAt,
        productName: products.name,
        productSlug: products.slug,
        productImage: products.image,
      })
      .from(reviews)
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where)
      .orderBy(desc(reviews.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const totalRow = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(reviews)
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(where);
    const summary = rowsOf(await db.execute(sql`SELECT status, COUNT(*) AS n FROM reviews GROUP BY status`));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      rows,
      total: Number(totalRow[0]?.n) || 0,
      page,
      limit,
      counts: Object.fromEntries(summary.map((row: any) => [row.status, Number(row.n)])),
    });
  });

  app.patch('/api/admin/reviews/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const row = (await db.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Review not found.' });
    const patch: any = {};
    if (['approved', 'pending', 'hidden'].includes(req.body?.status)) patch.status = req.body.status;
    if (req.body?.reply !== undefined) patch.reply = cleanText(req.body.reply, 2000) || null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to change.' });
    await db.update(reviews).set(patch).where(eq(reviews.id, id));
    await recalcProductRating(row.productId);
    res.json({ success: true });
  });

  app.delete('/api/admin/reviews/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const row = (await db.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Review not found.' });
    await db.delete(reviews).where(eq(reviews.id, id));
    await recalcProductRating(row.productId);
    res.json({ success: true });
  });

  /* ================================================================ BLOG */

  const countBlogView = viewCounter((id, count) => db.execute(sql`UPDATE blog_posts SET views = views + ${count} WHERE id = ${id}`));

  const postCard = (row: any) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || '',
    coverImage: row.coverImage || '',
    author: row.author || '',
    category: row.category || '',
    publishedAt: row.publishedAt || row.createdAt,
    views: row.views || 0,
    readMinutes: Math.max(1, Math.round(String(row.content || '').split(/\s+/).length / 180)),
  });
  const PUBLISHED = and(eq(blogPosts.status, 'published'), sql`(${blogPosts.publishedAt} IS NULL OR ${blogPosts.publishedAt} <= NOW())`);

  app.get('/api/blog', async (req, res) => {
    const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));
    const page = Math.max(1, Number(req.query.page) || 1);
    const category = cleanText(req.query.category, 100);
    const where = category ? and(PUBLISHED, eq(blogPosts.category, category)) : PUBLISHED;
    const rows = await db
      .select()
      .from(blogPosts)
      .where(where)
      .orderBy(desc(sql`COALESCE(${blogPosts.publishedAt}, ${blogPosts.createdAt})`), desc(blogPosts.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const total = await db.select({ n: sql<number>`COUNT(*)` }).from(blogPosts).where(where);
    const categories = rowsOf(
      await db.execute(sql`SELECT category, COUNT(*) AS n FROM blog_posts WHERE status = 'published' AND category IS NOT NULL AND category <> '' GROUP BY category ORDER BY n DESC LIMIT 20`)
    );
    res.json({
      posts: rows.map(postCard),
      total: Number(total[0]?.n) || 0,
      page,
      limit,
      categories: categories.map((row: any) => ({ name: row.category, count: Number(row.n) })),
    });
  });

  app.get('/api/blog/:slug', async (req, res) => {
    const slug = String(req.params.slug || '');
    const row = (await db.select().from(blogPosts).where(and(eq(blogPosts.slug, slug), PUBLISHED)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    const more = await db
      .select()
      .from(blogPosts)
      .where(and(PUBLISHED, sql`${blogPosts.id} <> ${row.id}`))
      .orderBy(desc(sql`COALESCE(${blogPosts.publishedAt}, ${blogPosts.createdAt})`))
      .limit(3);
    res.json({
      post: {
        ...postCard(row),
        content: row.content || '',
        tags: String(row.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        metaTitle: row.metaTitle || '',
        metaDescription: row.metaDescription || '',
      },
      more: more.map(postCard),
    });
  });

  app.post('/api/blog/:id/view', (req, res) => {
    countBlogView(Number(req.params.id) || 0);
    res.json({ ok: true });
  });

  const postBody = (body: any) => {
    const status = body?.status === 'published' ? 'published' : 'draft';
    let publishedAt: Date | null = null;
    if (body?.publishedAt) {
      const parsed = new Date(body.publishedAt);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
    }
    if (status === 'published' && !publishedAt) publishedAt = new Date();
    return {
      title: cleanText(body?.title, 255),
      excerpt: cleanText(body?.excerpt, 600) || null,
      content: String(body?.content ?? '').slice(0, 400_000),
      coverImage: cleanText(body?.coverImage, 1000) || null,
      author: cleanText(body?.author, 191) || null,
      category: cleanText(body?.category, 100) || null,
      tags: cleanText(body?.tags, 255) || null,
      status,
      metaTitle: cleanText(body?.metaTitle, 255) || null,
      metaDescription: cleanText(body?.metaDescription, 500) || null,
      publishedAt,
    };
  };

  app.get('/api/admin/blog', admin, async (_req, res) => {
    const rows = await db.select().from(blogPosts).orderBy(desc(blogPosts.id)).limit(1000);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(rows.map((row) => ({ ...postCard(row), status: row.status, updatedAt: row.updatedAt })));
  });

  app.get('/api/admin/blog/:id', admin, async (req, res) => {
    const row = (await db.select().from(blogPosts).where(eq(blogPosts.id, Number(req.params.id) || 0)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(row);
  });

  app.post('/api/admin/blog', admin, async (req, res) => {
    const values = postBody(req.body);
    if (!values.title) return res.status(400).json({ error: 'The post needs a title.' });
    const slug = await uniqueSlug(blogPosts, blogPosts.slug, blogPosts.id, req.body?.slug || values.title);
    await db.insert(blogPosts).values({ ...values, slug });
    const row = (await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1))[0];
    res.json({ success: true, post: row });
  });

  app.put('/api/admin/blog/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const current = (await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1))[0];
    if (!current) return res.status(404).json({ error: 'Post not found.' });
    const values = postBody(req.body);
    if (!values.title) return res.status(400).json({ error: 'The post needs a title.' });
    // Keep the original publish date when a published post is edited
    if (values.status === 'published' && current.publishedAt && !req.body?.publishedAt) values.publishedAt = current.publishedAt;
    const slug = req.body?.slug ? await uniqueSlug(blogPosts, blogPosts.slug, blogPosts.id, req.body.slug, id) : current.slug;
    await db.update(blogPosts).set({ ...values, slug, updatedAt: new Date() }).where(eq(blogPosts.id, id));
    const row = (await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1))[0];
    res.json({ success: true, post: row });
  });

  app.delete('/api/admin/blog/:id', admin, async (req, res) => {
    await db.delete(blogPosts).where(eq(blogPosts.id, Number(req.params.id) || 0));
    res.json({ success: true });
  });

  /* ================================================================ LANDING PAGES */

  const countLandingView = viewCounter((id, count) => db.execute(sql`UPDATE landing_pages SET views = views + ${count} WHERE id = ${id}`));

  const pageOut = (row: any) => {
    const template = (row.template === 'organic' ? 'organic' : 'fashion') as LandingTemplateId;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      template,
      status: row.status,
      content: normalizeLandingContent(row.content, template),
      products: parseJson<LandingProductLink[]>(row.products, []),
      shipping: { ...DEFAULT_LANDING_SHIPPING, ...parseJson<any>(row.shipping, {}) },
      views: row.views || 0,
      ordersCount: row.ordersCount || 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  /** Products (and their offered options) for a landing page, in the page's order */
  async function landingProducts(links: LandingProductLink[]) {
    const ids = links.map((link) => Number(link.productId)).filter(Boolean);
    if (ids.length === 0) return [];
    const rows = await db.select().from(products).where(inArray(products.id, ids));
    const variations = await db
      .select()
      .from(productVariations)
      .where(and(inArray(productVariations.productId, ids), eq(productVariations.status, 'active')))
      .orderBy(asc(productVariations.sortOrder), asc(productVariations.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const out: any[] = [];
    for (const link of links) {
      const row = byId.get(Number(link.productId));
      if (!row || row.status !== 'active') continue;
      const allowed = Array.isArray(link.variationIds) && link.variationIds.length ? new Set(link.variationIds.map(Number)) : null;
      const options = row.hasVariations
        ? variations
            .filter((variation) => variation.productId === row.id && (!allowed || allowed.has(variation.id)))
            .map((variation) => ({
              id: variation.id,
              label: variation.label,
              combination: parseJson<Record<string, string>>(variation.combination, {}),
              price: variation.price,
              salePrice: variation.salePrice,
              stock: Number(variation.stock || 0),
              image: variation.image || '',
              // v3.15 — the option's own SKU: it is this option's id in the Meta catalog
              sku: String(variation.sku || '').trim(),
            }))
        : [];
      if (row.hasVariations && options.length === 0) continue;
      out.push({ ...shopProduct(row), variations: options, preselect: Boolean(link.preselect), qty: Math.max(1, Number(link.qty) || 1) });
    }
    return out;
  }

  app.get('/api/lp/:slug', async (req, res) => {
    const slug = String(req.params.slug || '');
    const row = (await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1))[0];
    // Drafts and switched-off pages open only for a signed-in admin (the Preview button)
    const session = deps.readSession(deps.getBearer(req));
    const isAdmin = session?.role === 'admin';
    if (!row || (row.status !== 'active' && !isAdmin)) return res.status(404).json({ error: 'This page is not available.' });
    if (isAdmin) res.setHeader('Cache-Control', 'private, no-store');
    const page = pageOut(row);
    res.json({ page: { ...page, views: undefined, ordersCount: undefined }, products: await landingProducts(page.products), preview: row.status !== 'active' });
  });

  app.post('/api/lp/:id/view', (req, res) => {
    countLandingView(Number(req.params.id) || 0);
    res.json({ ok: true });
  });

  app.get('/api/admin/landing-pages', admin, async (_req, res) => {
    const rows = await db.select().from(landingPages).orderBy(desc(landingPages.id));
    const stats = rowsOf(
      await db.execute(
        sql`SELECT landing_page_id AS id, COUNT(*) AS n, COALESCE(SUM(CASE WHEN order_status NOT IN ('cancelled','returned') THEN total ELSE 0 END), 0) AS revenue FROM orders WHERE landing_page_id IS NOT NULL GROUP BY landing_page_id`
      )
    );
    const byId = new Map(stats.map((row: any) => [Number(row.id), { orders: Number(row.n), revenue: Number(row.revenue) }]));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(
      rows.map((row) => {
        const page = pageOut(row);
        return {
          id: page.id,
          title: page.title,
          slug: page.slug,
          template: page.template,
          status: page.status,
          productCount: page.products.length,
          views: page.views,
          orders: byId.get(row.id)?.orders || 0,
          revenue: byId.get(row.id)?.revenue || 0,
          image: page.content.hero.image || '',
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        };
      })
    );
  });

  app.get('/api/admin/landing-pages/:id', admin, async (req, res) => {
    const row = (await db.select().from(landingPages).where(eq(landingPages.id, Number(req.params.id) || 0)).limit(1))[0];
    if (!row) return res.status(404).json({ error: 'Landing page not found.' });
    const page = pageOut(row);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ page, products: await landingProducts(page.products) });
  });

  const productLinks = (raw: any): LandingProductLink[] =>
    (Array.isArray(raw) ? raw : [])
      .slice(0, 30)
      .map((item: any) => ({
        productId: Number(item?.productId) || 0,
        variationIds: Array.isArray(item?.variationIds) ? item.variationIds.map(Number).filter(Boolean).slice(0, 100) : [],
        preselect: Boolean(item?.preselect),
        qty: Math.min(99, Math.max(1, Number(item?.qty) || 1)),
      }))
      .filter((item) => item.productId > 0);

  const shippingBody = (raw: any) => {
    const mode = ['store', 'custom', 'free'].includes(raw?.mode) ? raw.mode : 'store';
    const charges: Record<string, number> = {};
    for (const [zone, value] of Object.entries(raw?.charges || {})) {
      if (value === '' || value === null || value === undefined) continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) charges[cleanText(zone, 64)] = parsed;
    }
    const positive = (value: any) => (Number(value) > 0 ? Number(value) : null);
    return { mode, charges, freeMinQuantity: positive(raw?.freeMinQuantity), freeMinSubtotal: positive(raw?.freeMinSubtotal) };
  };

  /** One click: a ready page from a template, optionally with products already attached */
  app.post('/api/admin/landing-pages', admin, async (req, res) => {
    const template: LandingTemplateId = req.body?.template === 'organic' ? 'organic' : 'fashion';
    const links = productLinks(req.body?.products || (req.body?.productIds || []).map((id: any) => ({ productId: id, preselect: true })));
    let title = cleanText(req.body?.title, 191);
    let heroImage = '';
    if (links.length > 0) {
      const first = (await db.select().from(products).where(eq(products.id, links[0].productId)).limit(1))[0];
      if (first) {
        if (!title) title = first.name;
        heroImage = first.image || '';
      }
    }
    if (!title) title = template === 'organic' ? 'Organic offer' : 'New offer';
    const content = defaultLandingContent(template, title);
    if (heroImage) content.hero.image = heroImage;
    if (links.length > 0 && links.every((link) => !link.preselect)) links[0].preselect = true;
    const slug = await uniqueSlug(landingPages, landingPages.slug, landingPages.id, req.body?.slug || title);
    await db.insert(landingPages).values({
      title,
      slug,
      template,
      status: req.body?.status === 'active' ? 'active' : 'draft',
      content: JSON.stringify(content),
      products: JSON.stringify(links),
      shipping: JSON.stringify(DEFAULT_LANDING_SHIPPING),
    });
    const row = (await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1))[0];
    res.json({ success: true, page: pageOut(row) });
  });

  app.put('/api/admin/landing-pages/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const current = (await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1))[0];
    if (!current) return res.status(404).json({ error: 'Landing page not found.' });
    const template: LandingTemplateId = req.body?.template === 'organic' ? 'organic' : req.body?.template === 'fashion' ? 'fashion' : (current.template as LandingTemplateId);
    const patch: any = { template, updatedAt: new Date() };
    if (req.body?.title !== undefined) patch.title = cleanText(req.body.title, 191) || current.title;
    if (req.body?.slug !== undefined && slugifyText(req.body.slug) !== current.slug) {
      patch.slug = await uniqueSlug(landingPages, landingPages.slug, landingPages.id, req.body.slug, id);
    }
    if (['draft', 'active', 'inactive'].includes(req.body?.status)) patch.status = req.body.status;
    if (req.body?.content !== undefined) {
      const content = JSON.stringify(normalizeLandingContent(req.body.content, template));
      if (content.length > 2_000_000) return res.status(413).json({ error: 'The page is too large. Use images from the media library.' });
      patch.content = content;
    }
    if (req.body?.products !== undefined) patch.products = JSON.stringify(productLinks(req.body.products));
    if (req.body?.shipping !== undefined) patch.shipping = JSON.stringify(shippingBody(req.body.shipping));
    await db.update(landingPages).set(patch).where(eq(landingPages.id, id));
    const row = (await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1))[0];
    const page = pageOut(row);
    res.json({ success: true, page, products: await landingProducts(page.products) });
  });

  app.patch('/api/admin/landing-pages/:id/status', admin, async (req, res) => {
    const status = ['draft', 'active', 'inactive'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Unknown status.' });
    await db.update(landingPages).set({ status, updatedAt: new Date() }).where(eq(landingPages.id, Number(req.params.id) || 0));
    res.json({ success: true, status });
  });

  app.post('/api/admin/landing-pages/:id/duplicate', admin, async (req, res) => {
    const current = (await db.select().from(landingPages).where(eq(landingPages.id, Number(req.params.id) || 0)).limit(1))[0];
    if (!current) return res.status(404).json({ error: 'Landing page not found.' });
    const title = `${current.title} (copy)`.slice(0, 191);
    const slug = await uniqueSlug(landingPages, landingPages.slug, landingPages.id, `${current.slug}-copy`);
    await db.insert(landingPages).values({
      title,
      slug,
      template: current.template,
      status: 'draft',
      content: current.content,
      products: current.products,
      shipping: current.shipping,
    });
    const row = (await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1))[0];
    res.json({ success: true, page: pageOut(row) });
  });

  app.delete('/api/admin/landing-pages/:id', admin, async (req, res) => {
    // Orders keep the page name they were placed from
    await db.delete(landingPages).where(eq(landingPages.id, Number(req.params.id) || 0));
    res.json({ success: true });
  });
}

/** Used by the order route: the landing page an order claims to come from */
export async function loadLandingForOrder(id: number) {
  if (!id) return null;
  const row = (await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1))[0];
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id,
    title: row.title,
    products: parseJson<LandingProductLink[]>(row.products, []),
    shipping: { ...DEFAULT_LANDING_SHIPPING, ...parseJson<any>(row.shipping, {}) },
  };
}

export async function countLandingOrder(id: number) {
  try {
    await db.execute(sql`UPDATE landing_pages SET orders_count = orders_count + 1 WHERE id = ${id}`);
  } catch {
    /* statistics only */
  }
}

/** Settings reader shared by the order route */
export async function readJsonSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1))[0];
    return row ? { ...(fallback as any), ...JSON.parse(row.value) } : fallback;
  } catch {
    return fallback;
  }
}

