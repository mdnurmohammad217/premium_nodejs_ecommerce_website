/**
 * v3.12 — what search engines and link checkers read before any script runs.
 *
 * The storefront is drawn in the browser, so a crawler that does not run
 * JavaScript (Facebook, link previews, SEO audit tools, the first pass of
 * Google) used to find an empty page: no heading, about six words, no links
 * and no phone number. The server now writes, into every storefront page:
 *
 *  1. Structured data (JSON-LD): the shop (OnlineStore with logo, phone,
 *     address and social profiles), the site search box, and on a product page
 *     the Product with its price, stock and picture plus the breadcrumb.
 *  2. A plain-HTML copy of the page's text inside #root: the H1, a short
 *     description, category and product links with prices, and a tappable
 *     phone number / WhatsApp / e-mail. React replaces it the moment the page
 *     starts, so visitors never see it; it is visually hidden meanwhile (screen
 *     readers can still read it) and has no effect on layout or speed scores.
 */

export interface SeoProduct {
  name: string;
  slug: string;
  price: number;
  salePrice?: number | null;
  image?: string | null;
  sku?: string | null;
  stock?: number | null;
  description?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  brandName?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}

export interface SeoCategory {
  name: string;
  slug: string;
}

export interface SeoInput {
  origin: string;
  path: string;
  siteName: string;
  title: string;
  description: string;
  logo?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  currency: string;
  currencyCode: string;
  social: string[];
  categories: SeoCategory[];
  products: SeoProduct[];
  /** The product of a /product/… page */
  product?: SeoProduct | null;
  /** The category of a /shop?category=… page */
  category?: SeoCategory | null;
  /** A blog post or CMS page */
  article?: { title: string; description: string; image?: string; published?: string; modified?: string } | null;
}

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** JSON inside <script> must never close the tag early */
const jsonForScript = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export const plainText = (html: unknown, max = 300) =>
  String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Bangladeshi numbers become +8801XXXXXXXXX for tel: and wa.me links */
export function internationalPhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (/^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
  return digits;
}

const absolute = (origin: string, url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
};

/**
 * A description for the home page when the owner has not written one
 * (Dashboard → Website → SEO). Search engines show this under the title.
 */
export function fallbackDescription(siteName: string, tagline: string, categoryNames: string[]): string {
  const name = siteName && siteName !== 'Online Store' ? siteName : '';
  const lead = name ? (tagline ? `${name} — ${tagline}.` : `${name} — shop online in Bangladesh.`) : tagline ? `${tagline}.` : 'Shop online in Bangladesh.';
  const cats = categoryNames.filter(Boolean).slice(0, 4);
  const body = cats.length
    ? ` Shop ${cats.join(', ')} and more with fast home delivery and cash on delivery.`
    : ' Order online with fast home delivery and cash on delivery.';
  const text = `${lead}${body}`;
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')}…` : text;
}

const money = (symbol: string, value: number) =>
  `${symbol}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function productSchema(input: SeoInput, product: SeoProduct) {
  const url = `${input.origin}/product/${encodeURIComponent(product.slug)}`;
  const price = Number(product.salePrice) > 0 ? Number(product.salePrice) : Number(product.price);
  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    sku: product.sku || undefined,
    description: plainText(product.description, 500) || undefined,
    image: product.image ? [absolute(input.origin, product.image)] : undefined,
    category: product.categoryName || undefined,
    brand: product.brandName ? { '@type': 'Brand', name: product.brandName } : undefined,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: input.currencyCode || 'BDT',
      price: Number(price.toFixed(2)),
      availability:
        product.stock === null || product.stock === undefined || Number(product.stock) > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: input.siteName },
    },
  };
  // Only real reviews give stars in search results
  if (Number(product.reviewCount) > 0 && Number(product.rating) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(Number(product.rating).toFixed(1)),
      reviewCount: Number(product.reviewCount),
    };
  }
  return schema;
}

export function renderJsonLd(input: SeoInput): string {
  const { origin } = input;
  const phone = internationalPhone(input.phone);
  const store: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${origin}/#store`,
    name: input.siteName,
    url: `${origin}/`,
    description: input.description || undefined,
    logo: input.logo ? absolute(origin, input.logo) : undefined,
    image: input.logo ? absolute(origin, input.logo) : undefined,
    telephone: phone || undefined,
    email: input.email || undefined,
    address: input.address ? { '@type': 'PostalAddress', streetAddress: input.address, addressCountry: 'BD' } : undefined,
    sameAs: input.social.length ? input.social : undefined,
    contactPoint: phone
      ? { '@type': 'ContactPoint', telephone: phone, contactType: 'customer service', availableLanguage: ['Bengali', 'English'] }
      : undefined,
  };
  const blocks: any[] = [
    store,
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: input.siteName,
      url: `${origin}/`,
      publisher: { '@id': `${origin}/#store` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${origin}/shop?search={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  const crumbs: Array<{ name: string; url: string }> = [{ name: 'Home', url: `${origin}/` }];
  if (input.product) {
    blocks.push(productSchema(input, input.product));
    if (input.product.categoryName && input.product.categorySlug) {
      crumbs.push({ name: input.product.categoryName, url: `${origin}/shop?category=${encodeURIComponent(input.product.categorySlug)}` });
    }
    crumbs.push({ name: input.product.name, url: `${origin}/product/${encodeURIComponent(input.product.slug)}` });
  } else if (input.category) {
    crumbs.push({ name: 'Shop', url: `${origin}/shop` });
    crumbs.push({ name: input.category.name, url: `${origin}/shop?category=${encodeURIComponent(input.category.slug)}` });
    if (input.products.length) {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: input.category.name,
        itemListElement: input.products.slice(0, 20).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${origin}/product/${encodeURIComponent(item.slug)}`,
          name: item.name,
        })),
      });
    }
  } else if (input.article) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': input.path.startsWith('/blog/') ? 'BlogPosting' : 'WebPage',
      headline: input.article.title,
      description: input.article.description || undefined,
      image: input.article.image ? [absolute(origin, input.article.image)] : undefined,
      datePublished: input.article.published || undefined,
      dateModified: input.article.modified || input.article.published || undefined,
      mainEntityOfPage: `${origin}${input.path}`,
      publisher: { '@id': `${origin}/#store` },
    });
  }
  if (crumbs.length > 1) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: crumb.url })),
    });
  }
  return blocks.map((block) => `<script type="application/ld+json">${jsonForScript(block)}</script>`).join('');
}

/** Plain HTML copy of the page's text (see the note at the top) */
export function renderSnapshot(input: SeoInput): string {
  const { origin } = input;
  const parts: string[] = [];
  const product = input.product;
  const heading = product ? product.name : input.category ? input.category.name : input.article ? input.article.title : input.title || input.siteName;
  parts.push(`<h1>${esc(heading)}</h1>`);

  if (product) {
    const price = Number(product.salePrice) > 0 ? Number(product.salePrice) : Number(product.price);
    // Products with options carry their stock per option (stock = null): not "out of stock"
    const soldOut = product.stock !== null && product.stock !== undefined && Number(product.stock) <= 0;
    parts.push(`<p>${esc(money(input.currency, price))}${soldOut ? ' — out of stock' : ' — in stock'}</p>`);
    const text = plainText(product.description, 600);
    if (text) parts.push(`<p>${esc(text)}</p>`);
    if (product.categoryName && product.categorySlug) {
      parts.push(`<p>Category: <a href="/shop?category=${esc(encodeURIComponent(product.categorySlug))}">${esc(product.categoryName)}</a></p>`);
    }
  } else if (input.article) {
    if (input.article.description) parts.push(`<p>${esc(input.article.description)}</p>`);
  } else if (input.description) {
    parts.push(`<p>${esc(input.description)}</p>`);
  }

  if (input.categories.length) {
    parts.push(
      `<nav aria-label="Categories"><h2>Categories</h2><ul>${input.categories
        .slice(0, 30)
        .map((cat) => `<li><a href="/shop?category=${esc(encodeURIComponent(cat.slug))}">${esc(cat.name)}</a></li>`)
        .join('')}</ul></nav>`
    );
  }
  const list = input.products.filter((item) => !product || item.slug !== product.slug).slice(0, 24);
  if (list.length) {
    parts.push(
      `<section><h2>${esc(product ? 'More products' : input.category ? `${input.category.name} products` : 'Products')}</h2><ul>${list
        .map((item) => {
          const price = Number(item.salePrice) > 0 ? Number(item.salePrice) : Number(item.price);
          return `<li><a href="/product/${esc(encodeURIComponent(item.slug))}">${esc(item.name)}</a> — ${esc(money(input.currency, price))}</li>`;
        })
        .join('')}</ul></section>`
    );
  }

  const phone = internationalPhone(input.phone);
  const whatsapp = internationalPhone(input.whatsapp || input.phone).replace(/^\+/, '');
  const contact: string[] = [];
  if (phone) contact.push(`Call <a href="tel:${esc(phone)}">${esc(input.phone)}</a>`);
  if (input.whatsapp && whatsapp) contact.push(`<a href="https://wa.me/${esc(whatsapp)}">WhatsApp</a>`);
  if (input.email) contact.push(`<a href="mailto:${esc(input.email)}">${esc(input.email)}</a>`);
  contact.push(`<a href="/page/contact">Contact us</a>`);
  parts.push(
    `<footer><h2>Contact ${esc(input.siteName)}</h2><p>${contact.join(' · ')}</p>${
      input.address ? `<address>${esc(input.address)}</address>` : ''
    }<p><a href="${esc(origin)}/">Home</a> · <a href="/shop">Shop</a> · <a href="/offers">Offers</a> · <a href="/track">Track order</a></p></footer>`
  );
  return `<div class="seo-snapshot">${parts.join('')}</div>`;
}
