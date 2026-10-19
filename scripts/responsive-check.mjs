/**
 * Responsiveness + console-error sweep.
 *
 * Visits every storefront and dashboard route at eight widths and reports:
 *  - horizontal overflow (document wider than the viewport)
 *  - elements that stick out past the right edge
 *  - console errors and failed network requests
 *
 * Run with the dev server up:  node scripts/responsive-check.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@nomail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'password';

const BREAKPOINTS = [
  { name: '320  iPhone SE', width: 320, height: 640 },
  { name: '375  iPhone', width: 375, height: 700 },
  { name: '414  Phone L', width: 414, height: 820 },
  { name: '640  Phablet', width: 640, height: 900 },
  { name: '768  Tablet', width: 768, height: 1024 },
  { name: '1024 Tablet L', width: 1024, height: 768 },
  { name: '1280 Laptop', width: 1280, height: 800 },
  { name: '1536 Desktop', width: 1536, height: 900 },
];

const STORE_ROUTES = [
  '/', '/shop', '/offers', '/wishlist', '/cart', '/checkout', '/track',
  '/login', '/signup', '/account', '/page/about', '/reset-password?token=demo',
];
const ADMIN_ROUTES = [
  'dashboard',
  'orders',
  'orders-incomplete',
  'products',
  'product-new',
  'categories',
  'brands',
  'attributes',
  'inventory',
  'customers',
  'ip-block',
  'purchases',
  'coupons',
  'reports',
  'web-branding',
  'navigation',
  'product-card',
  'checkout',
  'cfg-shipping',
  'cfg-payments',
  'cfg-pixel',
  'cfg-theme',
  'cfg-demo',
  'web-mobile',
  'web-footer',
  'offers',
  'staff',
  'account',
  // v3.9
  'expenses',
  'expense-categories',
  'expense-report',
  'cfg-orders',
  'cfg-code',
  'web-header',
  'license',
  // v3.10
  'web-home',
  'returns',
  'sms',
  // v3.11
  'web-search',
  'generics',
  'reports-courier',
  'cfg-integrations',
];

const results = [];

async function inspect(page, label, width) {
  // Let layout settle (fonts, lazy images, charts)
  await page.waitForTimeout(700);

  const report = await page.evaluate((viewportWidth) => {
    const docWidth = document.documentElement.scrollWidth;
    const offenders = [];
    if (docWidth > viewportWidth + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > viewportWidth + 1) {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed') continue;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 70),
            right: Math.round(rect.right),
          });
          if (offenders.length >= 4) break;
        }
      }
    }
    return { docWidth, offenders };
  }, width);

  if (report.docWidth > width + 1) {
    results.push({ label, width, docWidth: report.docWidth, offenders: report.offenders });
  }
}

const run = async () => {
  // CHROME_PATH lets the check use an already-installed Chrome/Chromium
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const consoleIssues = [];

  for (const bp of BREAKPOINTS) {
    const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const external = /connect\.facebook|googletagmanager|unsplash|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::ERR_ABORTED/i.test(text);
        if (!text.includes('favicon') && !external) {
          consoleIssues.push(`[${bp.width}] ${page.url()} :: ${text.slice(0, 160)}`);
        }
      }
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText || '';
      // Only same-origin failures matter here — this sandbox has no outbound
      // internet, so CDN images / GTM / the Meta pixel always fail.
      if (req.url().startsWith(BASE) && !req.url().includes('favicon')) {
        consoleIssues.push(`[${bp.width}] request failed ${req.url().slice(-60)} :: ${failure}`);
      }
    });

    // Sign in through the API and seed the token, which is more reliable than
    // driving the login form at every breakpoint.
    // ADMIN_TOKEN skips the sign-in (a token copied from the browser's storage)
    const auth = process.env.ADMIN_TOKEN
      ? { token: process.env.ADMIN_TOKEN }
      : await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        }).then((res) => res.json());

    if (!auth.token) {
      consoleIssues.push(`[${bp.width}] admin login failed: ${auth.error || 'no token'}`);
    }

    // Let this first load settle before moving on, otherwise its API calls are
    // cancelled mid-flight and show up as false "request failed" errors.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate((token) => localStorage.setItem('pharma_token', token), auth.token || '');

    for (const route of STORE_ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await inspect(page, `store ${route}`, bp.width);
    }

    for (const tab of ADMIN_ROUTES) {
      await page.goto(`${BASE}/admin/${tab}`, { waitUntil: 'domcontentloaded' });
      await inspect(page, `admin /${tab}`, bp.width);
    }

    await context.close();
  }

  await browser.close();

  console.log('\n=== HORIZONTAL OVERFLOW ===');
  if (results.length === 0) {
    console.log('none — every route fits its viewport at all 8 widths');
  } else {
    for (const row of results) {
      console.log(`${row.width}px  ${row.label}  doc=${row.docWidth}px`);
      for (const off of row.offenders) console.log(`      <${off.tag} class="${off.cls}"> right=${off.right}`);
    }
  }

  console.log('\n=== CONSOLE / NETWORK ERRORS ===');
  const unique = [...new Set(consoleIssues)];
  if (unique.length === 0) console.log('none');
  else unique.slice(0, 40).forEach((line) => console.log(line));
};

run().catch((err) => {
  console.error('sweep failed:', err);
  process.exit(1);
});
