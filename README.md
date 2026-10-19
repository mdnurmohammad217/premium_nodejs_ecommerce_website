# Topper IT — E-commerce Website + POS System

Production deployment guide.

**Stack:** React 19 + Vite (frontend) · Express + TypeScript (API) · **MySQL / MariaDB** + Drizzle ORM
**Runtime:** Node.js 20.19+ or 22 (single Node process serves both the API and the built frontend)
**Hosting:** Built and tested for Hostinger's Node.js hosting (hPanel) with a MySQL/MariaDB database

---

## 1. Project structure

```
.
├── src/
│   ├── components/
│   │   ├── store/        # storefront (header, hero, product page, cart, checkout, invoice, footer)
│   │   ├── admin/        # dashboard — ui.tsx holds the shared design system
│   │   └── pos/          # POS terminal + back-office modules
│   ├── components/admin/ui.tsx   # buttons, cards, tables, drawers used by every admin page
│   ├── context/          # Auth, Cart, Theme providers
│   ├── db/               # Drizzle schema + dev seed
│   ├── lib/              # api client, tracking, shipping rules, landing templates, online payments
│   ├── server/           # license, cache (Redis/memory), payments, blog/landing/reviews, hardening
│   │   └── routes/       # v3.13: API sections moved out of server.ts (email, SMS, returns, couriers, media, v3.14 live chat …)
│   ├── lib/translations/ # v3.13: website text in Bangla, Hindi, Arabic, French (one file per language)
│   ├── components/store/glow/  # v3.13: the "Glow" home page design
│   └── index.css         # design tokens (colors, Public Sans type scale, animations)
├── server.ts             # app setup, auth, guards, core API routes; calls src/server/routes/*
├── scripts/
│   ├── responsive-check.mjs   # 8-breakpoint layout + console sweep
│   ├── make-upgrade-sql.ts    # rewrites database/upgrade-v3.12.sql from src/server/schema-upgrades.ts
│   ├── make-base-schema.ts    # rewrites src/server/base-schema.ts (tables created on an empty database)
│   └── dev-restart.sh         # restart the local dev server
├── database/database.sql # full schema + indexes + initial settings (complete for v3.12)
├── database/upgrade-v3.12.sql # one-file upgrade for any older store (v3.1 … v3.13 → v3.14)
├── drizzle/              # generated migrations
├── (uploads folder)      # outside the app — see Step 7 (UPLOADS_DIR)
├── .env.example
└── README.md
```

---

## 2. Deployment — step by step

### Step 1 — Upload files
Upload the project to the server (or `git clone`). Do **not** upload `node_modules` or `.env`.

```bash
cd /var/www/my-shop
```

### Step 2 — Create and import the database

**On Hostinger (hPanel):**

1. `Databases -> Management` -> create a new MySQL database and user.
   Note the generated names — they are prefixed, e.g. `u123456789_shop`.
2. Grant that user **All Privileges** on the database.
3. Open `phpMyAdmin` for that database -> **Import** tab -> choose
   `database/database.sql` -> **Go**.

**From a terminal / VPS instead:**

```bash
mysql -u <user> -p -e "CREATE DATABASE <db> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u <user> -p <db> < database/database.sql
```

The file contains tables, foreign keys, indexes and the initial settings rows. It contains
no user data and no passwords. It is safe to re-run: the settings insert uses
`ON DUPLICATE KEY UPDATE` and will not overwrite what you configure later.

The store starts empty — there is **no demo data**. Add your own categories, brands and
products from the dashboard. (Demo rows left over from older versions are removed
automatically on the first start of v3.6.)

### Step 3 — Configure environment variables

```bash
cp .env.example .env
nano .env
```

Required:

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection — copy exactly from hPanel -> Databases |
| `DB_POOL_LIMIT` | max pooled connections (5 on shared hosting) |
| `SESSION_SECRET` | signs admin/staff session tokens — **must** be set |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first dashboard login (empty = `admin@nomail.com` / `password`); a new pair here also resets a forgotten owner login — see Step 9 |
| `PORT` | port the Node process listens on (default 3000) |

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> If `SESSION_SECRET` is empty the server generates a random one per process, which logs
> everyone out on every restart. Never leave it blank in production.

### Step 4 — Install dependencies

```bash
npm ci --omit=dev || npm install
```

### Step 5 — Build

```bash
npm run build
```

Produces `dist/` (frontend assets) and `dist/server.cjs` (bundled API server).

### Step 6 — Migrations (only when the schema changes later)

**Updating an existing store:** you do not need to run any SQL. On start the server
checks for every column/table it needs and adds the missing ones (additive only —
existing data is never changed). The log shows `[schema] upgraded: ...` the first time.
If your database user may not ALTER/CREATE tables, run **`database/upgrade-v3.12.sql`** once in
phpMyAdmin instead. It is one file for every version from v3.1 to v3.11: each column and index
is checked before it is added, so it runs without a single error on any older store and can
safely be run twice. (It replaces upgrade-v3.11.sql, upgrade-v3.9.sql and the older files.)
On a completely **empty** database (nothing imported) the server now creates every table by
itself on the first start, so a missed import no longer breaks sign-in.
Each upgrade step runs on its own, so one refused statement no longer skips the rest. If
MySQL is not reachable when the app starts, the upgrade is retried every 30 seconds.
**Dashboard → System Configuration → Database & Cache** shows whether every table is
present and has a **Repair** button that runs the same safe, add-only upgrade again.

For your own future schema changes:

```bash
npx drizzle-kit@0.31 generate --config=src/db/drizzle.config.ts   # create migration
npx drizzle-kit@0.31 migrate  --config=src/db/drizzle.config.ts   # apply it
```

`drizzle-kit` is no longer installed with the shop (v3.12: it brought an old `esbuild` that
hosting security scanners report); `npx` fetches it only when you run it. It reads the same `DB_*` variables. On shared hosting where outbound CLI access to
MySQL is restricted, generate the migration locally and paste the resulting
`drizzle/*.sql` into phpMyAdmin -> SQL instead. For a first install, Step 2 covers everything.

### Step 7 — Where uploaded images are kept

Uploaded logos, banners and product photos are stored **outside the app folder**, so
replacing the app with a new version never deletes them:

- set `UPLOADS_DIR=/home/<you>/shop-uploads` in `.env` (recommended — an absolute path
  outside the app folder), or
- leave it empty: they go to a folder next to the app, `<app-folder>-uploads`
  (or `<app>/storage/uploads` if that is not writable).

The start-up log prints the folder in use (`[uploads] images are stored in …`). Files
left in the old `public/uploads` folder are copied over automatically and keep working.

**Since v3.7 every uploaded image also has a copy in the database** (`media_files`
table, split into 512 KB parts). If the images folder is ever emptied or replaced — a
redeploy, a host that rebuilds the app folder, a moved app — each image is written back
from the database the first time someone opens it, so a logo or product photo never
goes missing. Images uploaded before v3.7 are copied into the database automatically in
the background after the first start. `MEDIA_DB_BACKUP=off` in `.env` turns the copy
off. **Dashboard → System Configuration → Database & Cache → Uploaded images** shows the
folder, how many images have a database copy and how many were restored.

Back up this folder together with the database. It must be writable by the app:

```bash
mkdir -p /home/<you>/shop-uploads && chmod -R 775 /home/<you>/shop-uploads
```

### Step 8 — Start the application

```bash
npm start            # node dist/server.cjs
```

**On Hostinger:** `Website -> Node.js` -> set Application root, Startup file `dist/server.cjs`,
Node version 20.19+ (or 22), then add every `.env` variable in the panel's Environment Variables section and
press **Restart**. Hostinger supplies the port, so leave `PORT` unset there.

**On a VPS**, keep it alive with PM2:

```bash
npm i -g pm2
pm2 start dist/server.cjs --name my-shop
pm2 save && pm2 startup
```

Nginx reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 20M;          # media uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then issue TLS: `certbot --nginx -d your-domain.com`

### Step 9 — Admin login

1. Open `https://your-domain.com/login` (or click the account icon). There is one
   login page for everyone: the owner, staff and customers all sign in there, and each
   lands in the right place. Opening `/admin` or `/pos` while signed out goes to the same
   page and returns you to that screen after signing in.
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. When both are empty the first login is
   **`admin@nomail.com` / `password`**.
3. Go to **Admin Account & Security** and change the password immediately
   (stored as a salted PBKDF2 hash, never in plain text). Until you do, the dashboard home
   shows a warning.

   **Forgot the password / the .env login "does not work"?** Write a new `ADMIN_EMAIL` +
   `ADMIN_PASSWORD` pair in `.env` (on Hostinger: the panel's Environment Variables), restart
   the app and sign in with that pair — it replaces the saved login and signs the owner out
   everywhere else (the dashboard bell shows a notification when that happens). Once you change
   the password from the dashboard, that same `.env` pair stops working (so a leaked `.env` is not
   a permanent key); put a new pair in to recover again. After upgrading to v3.11 the pair that
   is in `.env` right now works once in this way — remove `ADMIN_PASSWORD` from `.env` if you do
   not want that. Changing the password from the dashboard also signs the owner out on every
   other device.
   The app reads the `.env` in its own folder (the one holding `dist/`) even when the host
   starts it from another folder; `DOTENV_PATH=/full/path/.env` points it at one exact file.
   `/api/health` shows `"env": "loaded"` or `"not found"`.
   If sign-in says the **database is not connected**, open `https://your-domain.com/api/health`:
   it shows `"database": {"status": "connected", …}` or `"disconnected"` with the error code and
   a hint what to fix (wrong password, wrong database name, MySQL not running, tables missing).
4. Then configure, in order:
   - **Header & Logo** — logo is reused automatically on the login page and footer
   - **Hero Banners** — desktop + optional mobile image, sort order, link, active state
   - **Navigation Menu** — the storefront menu renders exactly this list
   - **Footer & Credits** — contact block, social links (per-channel enable/disable)
   - **CMS Pages & Policies** — privacy, terms, refund, return, shipping content
   - **Store & Gateways** — payment methods and shipping zones

---

## 2a. License (License Server v2)

The app is licensed by your License Server (API contract: *License Server v2 — eCommerce/POS Client*).
Until a license is activated, the owner who signs in sees **only the License page** (plus
Account & Security); after activation the whole dashboard opens. The POS and every
back-office API are refused **by the server** (`src/server/license.ts`).
**Customers are never affected:** the website, product pages, cart and checkout keep
working whatever the license state, and a License Server outage never changes anything.
A store that has *never* been activated shows visitors a small, closable notice at most
once every 6 hours (it is decided from the local database, so a server outage can never
trigger it on a licensed shop).

1. Put these in `.env` and restart: `LICENSE_SERVER_URL`, `LICENSE_PRODUCT_SLUG`, and —
   recommended — `LICENSE_PUBLIC_KEY` + `LICENSE_KEY_ID` from `GET /api/v2/license/public-key`
   (see `.env.example`). Only the **public** key belongs in this project.
2. Sign in with the **owner** account (Super Admin) on the real domain, e.g. `https://yourshop.com/admin`,
   and enter the license key. The license binds to that domain and to this installation.
3. Keep `SESSION_SECRET` fixed: it also encrypts the saved license key.

How it behaves:
- The signed token is verified locally (Ed25519 signature, `QCT` type, key id, domain,
  installation id, product slug/type, expiry, state, grace/block times). Every server answer
  is verified too (`LSR1` signature, nonce, action, jti).
- Checks run on the signed schedule in the token (3/7/14/30/60/90 days). A network error,
  timeout, 5xx or 429 **never** changes the license — the last good token is kept and the
  next try backs off (a 429 waits exactly `retryAfterMs`). If the License Server is down,
  an activated shop keeps working.
- Revoked / suspended / expired: the new signed token is stored even when `success=false`.
  During the grace period everything works and the Super Admin sees a warning on every
  dashboard page; at the signed block time the dashboard and POS lock — even offline. The
  website and its checkout keep taking orders.
- Another domain, an unknown installation (403 `requireActivation`), a tampered token or a
  token from an unknown key → locked until activated again; tampering is reported to
  `POST /api/v2/license/report`.
- **Dashboard → System → License**: status, product, masked key, domain, installation ID,
  type, expiry, activation date, last sync, next check, grace/block, server connectivity,
  support, recent activity, *Check now* and *Deactivate* (releases the seat).
- **Moved the site / restored a backup on another domain (v3.9).** A copied database also
  copies the old site's license, so the new address opens only the License page with
  *"Website moved to a new domain?"*. Sign in as the owner, enter the license key for the
  **new** domain and press **Activate on this domain**: the copy gets its own installation ID
  and its own activation. The old website keeps its license — nothing is changed there. If
  the key is refused, the saved record is put back exactly as it was.
- New back-office endpoints are protected automatically: everything under `/api/admin`,
  `/api/pos`, `/api/dashboard`, `/api/media`, and any other request made with an
  admin/staff session that is not a public storefront read. Courier webhooks and payment
  callbacks are never blocked, so deliveries and payments always get recorded.

---

## 2b. What to configure after the first login

Everything below is editable from the dashboard — no code change needed.

| What | Where |
|---|---|
| Store name, phone, address, currency | Settings → Store |
| Browser tab title, meta description, favicon | Website → Branding |
| Logo (desktop + mobile), header text | Website → Branding |
| Footer text, social links, the 4 cards above the footer | Website → Footer & Social |
| Hero banners, Today's Flash Sale on/off | Website → Hero Slider |
| Policy pages (about, privacy, terms, returns…) | Website → Legal Pages |
| Header menu order (drag & drop) | Menu Builder |
| Product card design (4 styles), "Add to Cart" / "Buy Now" captions | Product Card |
| Button attention animation (Buy Now, Place Order, Add to Cart) | Product Card → Button animation |
| Footer background colour (presets or custom) | Website → Footer & Social |
| Database health check, one-click repair, speed-cache status | System Configuration → Database & Cache |
| Maintenance mode (close the site while you work) | System Configuration → Maintenance Mode |
| Email (SMTP) for password reset codes and contact copies | System Configuration → Email & Password Reset |
| How "Forgot password?" codes are sent (SMS / email) and the reset log | System Configuration → Email & Password Reset |
| Password reset SMS wording | SMS → Automatic messages → Password reset code |
| Owner recovery mobile number | Account & Security |
| Contact page text, hotline, WhatsApp, email, address, hours, map, form fields | Customers → Messages → Contact page |
| Messages sent from the Contact page | Customers → Messages → Inbox |
| Set a customer's password / text or email them a reset link | Customers → open customer → Password & login |
| Checkout page wording | Checkout Labels |
| Delivery zones and charges | System Configuration → Shipping |
| Free delivery (by order total and/or item count, per area) | System Configuration → Shipping → Free delivery offer |
| Free delivery or own delivery charge for one product | Products → edit → Delivery tab |
| bKash / Nagad / SSLCommerz online payments (sandbox or live) | System Configuration → Payments → Online payment gateways |
| Manual send-money numbers (bKash/Nagad/Rocket personal, bank) and COD | System Configuration → Payments |
| Product video (YouTube / Facebook / mp4) | Products → edit → Gallery |
| Size charts (presets, add rows/columns) and picking one per product | Products → Size Guides · Products → edit → Inventory |
| Sub / sub-sub category of a product | Products → edit → General (Main → Sub → Sub-sub) |
| Product page switches: Specifications / Reviews tabs, reviews on/off, approval, sticky buy bar, video, size guide, related | Product Page |
| Approve, hide, reply to or delete reviews | Products → Reviews |
| Blog posts, blog on/off, the home page blog section | Blog |
| Customer review screenshots section (above the blog) | Review Screenshots |
| Landing pages (2 templates, own products, delivery, pixel, checkout) | Landing Pages |
| Courier credentials (Steadfast, Pathao, RedX) | System Configuration → Integrations |
| Meta Pixel + Conversions API token | System Configuration → Pixel |
| GTM / GA4 | System Configuration → Tags |
| Brand colour (re-skins the whole dashboard) | System Configuration → Theme & Colors |
| Invoice header, footer note, paper size | invoice_config (Orders → print dialog) |
| Staff accounts and per-module permissions | Staff & Access |
| Blocked IP addresses | Customers → IP Block |
| SQL backup download | Backup & Restore |

---

## 2b-1. Online payments (bKash, Nagad, SSLCommerz)

1. **System Configuration → Payments → Online payment gateways.** Turn a gateway on, keep
   **Sandbox** while testing, paste the credentials, **Save**, then **Test connection**.
2. Set `APP_URL` in `.env` to your real `https://` address — the gateways send customers back
   to `APP_URL/api/payments/...`. For SSLCommerz also paste the IPN URL shown on that screen
   into the SSLCommerz merchant panel.
3. Switch to **Live** when the merchant account is approved.

How it stays safe: the order is saved first (stock and price are decided by the server);
the amount sent to the gateway is read from the saved order, never from the browser; every
"success" is confirmed server-to-server (SSLCommerz validation API / IPN, bKash execute +
status query, Nagad verify) and the paid amount must match before the order is marked
**Paid**. A failed or cancelled payment leaves the order saved: the customer can try again
or switch that same order to cash on delivery. Dashboard → Orders shows every payment
attempt and has **Re-check with gateway** for payments whose customer closed the tab.
Credentials never reach the storefront or the dashboard (secrets are shown masked).

SSLCommerz details (checked in v3.9): the request carries every field SSLCommerz requires
(including `cus_postcode`, city from the district picked at checkout); the browser return
and the IPN may arrive at the same moment, and only one of them marks the order paid and
notifies you; a late "fail" never undoes a confirmed payment; a card SSLCommerz flags as
risky (`risk_level = 1`) is marked paid but the notification and the payment record say
**HIGH RISK** — check the customer before sending the parcel.

## 2b-2. Landing pages

**Landing Pages → Create landing page**: choose *Fashion — Teal* or *Organic — Honey*, pick
products (simple or with variations) — the page is ready in one click at `/lp/<link>`.
Every text, image, colour and section (video, features, gallery, offer countdown, reviews,
FAQ, checkout labels, footer) is edited in the section-based editor with a live phone
preview. Each page can have its own delivery charges or free delivery, and an extra Meta
Pixel ID (the store pixel always fires too). Orders from a page are marked with its name in
Orders, and the list shows views, orders and revenue per page.

## 2b-3. Speed and heavy traffic

- The busiest public pages (settings, categories, brands, product lists and pages, blog,
  landing pages, sitemap) are cached. Many visitors asking for the same page at the same
  moment cause **one** database read. Any save in the dashboard or POS clears the cache
  instantly. Set `REDIS_URL` to share the cache between several processes/servers; without
  it (or if Redis goes down) the in-memory cache is used automatically.
- A broken request can no longer hang or crash the app: errors in any route answer with a
  clean JSON error, unexpected errors are logged without stopping the shop, and restarts
  finish the requests in flight first.
- Public write endpoints (orders, payment start, checkout capture, reviews) have generous
  per-IP limits that stop scripts without affecting shoppers on shared mobile networks.
- `DB_POOL_LIMIT` (default 10) sets the number of MySQL connections.

---

## 2b-4. POS barcodes and the cash drawer (v3.7)

- **Barcode per variation:** Products → edit → Variations has a *Barcode (POS)* column.
  Type the printed code, or press *Generate barcodes* (in-store codes starting with 20)
  and *Print labels* (38×25 mm, 50×25 mm or an A4 sheet of 65). Scanning a variation's
  barcode at the POS adds exactly that size/colour — no picker. The same code can never be
  used twice (another option, another product's barcode or SKU).
- **Cash drawer:** POS → *Drawer* (or **F7**). Choose how this computer reaches the drawer:
  - *Through the receipt printer* (recommended — the drawer cable goes into the printer):
    in the Windows printer driver set *Cash Drawer → Open before printing*. After a cash
    sale the POS prints the receipt by itself and the printer opens the drawer. For no
    print pop-up, start Chrome with `--kiosk-printing` and make the receipt printer the
    default printer.
  - *COM port* (Chrome/Edge): the POS sends the standard ESC p kick command directly —
    instant, nothing printed. *USB printer, direct* is for printers on the WinUSB driver.
  - Opening without a sale asks for a reason; every opening (sale, no-sale, test) is logged
    with the cashier's name (`pos_drawer_events`).

## 2b-5. Wholesale prices in one place (v3.7)

Customers → **Wholesale Prices** lists every product with its regular, selling and cost
price, the wholesale switch, wholesale price, minimum and maximum quantity — and, under a
product with variations, each option's own wholesale price (blank = the product's
wholesale price). *Quick fill* sets "X % below the selling/regular price" for the page or
the selected rows. Approved wholesale buyers are charged the option's price by the server;
nothing sent by a browser decides a price.

## 2b-6. Sales Report and POS Sales Report (v3.8)

Dashboard → **Reports** has three pages:

- **Sales Report** — website orders: total sales (what customers were charged: product
  sales − discounts + delivery), number of orders, items sold, average order, product
  sales, discounts, delivery charges, estimated gross profit (from each product's cost
  price) and returns (with the total after returns); a sales-by-day/week/month
  chart; how customers paid, order statuses, delivery zones, order sources (website or a
  landing page), best-selling products and categories; and every order in the period.
- **POS Sales Report** — counter sales: the same figures plus VAT, sales per cashier,
  cash vs bKash/card, and the busiest hours of the day.
- **Profit & Expenses** — the existing profit and expense report.

Pick a period (Today, Yesterday, Last 7/30 days, This/Last month, This year or custom
dates), group by day, week (Saturday–Friday) or month, and filter by order status,
payment method or cashier. The two headline figures compare against the previous period
of the same length. Cancelled, refunded, returned and failed-payment orders are left out
of the totals by default.
*Export CSV* downloads the order list and the best-seller list; *Print* prints the report
on A4. Days are counted in `REPORT_TIMEZONE` (default `Asia/Dhaka`), so a sale at
11:30 pm is on the right day whatever time zone the server runs in.

## 2b-7. Deleting categories, brands, customers and more (v3.8)

- **Category:** its products move to the parent category (or to *Uncategorised* for a top
  category); sub-categories move up one level. No product is deleted.
- **Brand:** its products simply lose the brand.
- **Customer:** Customers → trash icon, the drawer's *Delete* button, or tick several and
  *Delete*. Their past orders stay (with the name and phone printed on them) and are
  unlinked from the account. A customer with due payments recorded in the ledger can't be
  deleted — settle or remove those payments first; the message says so.
- **Supplier:** refused with a clear message while purchases, returns or payments exist.
- **Staff:** you can't delete the account you are signed in with.
- **Order:** deleting an order puts its stock back (variation stock too), minus anything
  a return already restocked.

## 2b-8. First load, animations and the hero slider (v3.8)

- The page arrives with the shop's colours, logo and hero banners already inside it, so a
  reload shows your own store straight away — never the software's default green colours
  or placeholder logo first. The dashboard and POS open in your colours too. A change in
  *Theme*, *Logo* or *Banners* shows on the next reload (the page data follows every save).
- Sections fade and rise gently into place while scrolling and product cards cascade in.
  Visitors whose phone or computer is set to *reduce motion* get the page without any
  animation, and printing always shows everything.
- The hero slider glides continuously in one direction (the last slide flows into the
  first), with the text rising in, progress dots, swipe on phones, and a pause while
  hovered or when the tab is hidden. Since v3.9 the banner frame follows the picture's own
  shape on desktop, so nothing is cut off (upload banners at 1920 × 600 or similar).

## 2b-9. New in v3.9 — where to find it

| Feature | Where |
|---|---|
| Product picture shape (square, 400 × 600 portrait, 3:4, 4:5, 4:3 or any size; fill or show whole picture) | Website → **Product Card** → *Product image shape* |
| Import / export products between shops (JSON with everything, CSV for Excel, WooCommerce CSV, Shopify CSV; pictures are downloaded into the new shop, categories/brands created by name) | Products → **Import** / **Export** |
| Four header designs (Classic, Transparent, Centered Boutique, Marketplace) | Website → **Header Design** |
| "My Account" button with icon instead of "Sign In" | every header design |
| Phone side menu: logo + close inside the banner, editable promo (text, button, link, on/off) | Website → Mobile Nav → **Mobile menu** |
| Assign orders to staff, returned / cancelled orders put stock back once, advance payment in Edit Order | Orders (row menu, bulk bar, Edit Order) |
| Add Order by hand (with variations, district/thana, advance) | Orders → **Add Order** |
| Order numbers from 01 (ORD-01, POS-01 …), prefix and digits editable; all times in Bangladesh time | System Configuration → **Orders** |
| District + thana dropdowns at checkout (all 64 districts), delivery charge chosen automatically from them (on/off) | System Configuration → Shipping → **District & Thana at checkout** |
| Custom CSS / JS / Head snippet / Body snippet (website only — never the dashboard or POS) | Marketing & Tools → **Custom Code** |
| Expenses: list, categories with budgets, monthly report | **Expenses** |
| Product page: pill tabs, description card with icon highlights, "How to use" tab | Products → edit → General; Website → Product Page |
| Variation options shown as picture, colour swatch or text | Products → edit → Variations |
| One thank-you page for the website checkout, landing pages and online payments (text, language and buttons editable) | Website → **Checkout Labels** → *Thank-you page* |
| Dashboard stat cards (today, month, profit, stock value …) | Dashboard |
| POS: held bills survive a restart; "My Orders" for each cashier | POS |

Safety work in this version: every stock change (website and landing checkout, POS, manual
orders, purchases, returns, damage/issue, stock adjust) locks the product rows first, so two
sales at the same moment can no longer sell the same last piece; the dashboard now loads
each page on first use (the first download is about 18 times smaller); the broken
`/api/download-zip` route was removed.

## 2b-10. New in v3.10 — where to find it

| Feature | Where |
|---|---|
| Staff can use the website dashboard, each one only the parts ticked for them (21 modules, grouped, with *Select all*) | **Staff & Access** → add / edit a staff account → *Module access* |
| Home page sections as a grid or a slider — one default, plus Flash Sale, All Products and every category on its own | Website → **Home Sections** |
| Brand list on the shop page (logo + product count); the Prescription filter is gone | Shop page sidebar / filter sheet |
| Brand name on product cards (optional) | Website → Product Card → *Brand name* |
| Phone side menu: arrows only on items that have a sub-menu, tap to open; categories in one sliding row (4.5 visible) | Website → Menu Builder (sub-menus) and Website → Mobile Nav → **Mobile menu** |
| Transparent header shows the logo alone (no white box) | Website → Header Design → Transparent |
| District and thana above the full address | Checkout, landing page order form, Orders → Add Order |
| A signed-in customer always finds their orders in **My Account**, also when the order used another phone number | Storefront → My Account |
| Variation pictures as a tidy grid of tiles | Products → edit → Variations |
| Orders page: tighter rows, same table at 80 – 125 % zoom (the layout follows the room the table really has, the sidebar folds on narrow screens) | Orders |
| Larger dashboard text | whole dashboard |

**Staff & Access in short.** *Administrator* accounts open everything. A *Staff* account opens
only what is ticked — the menu hides the rest and the server refuses it, so typing an address
by hand does not help. Nothing ticked = no access. The rule table is one file,
`src/lib/permissions.ts`, used by both the dashboard menu and the server; a route that is not
listed there is closed to staff. Four things always stay with administrators: backup / restore,
Custom Code, the License page and the owner's own account. *System Configuration* holds the
payment gateways, courier, e-mail and SMS gateway keys — tick it only for someone you trust
like yourself. A staff member with *Staff & Access* can manage accounts that have the same or
less access than their own, never an administrator and never their own account.

When updating from v3.9: every existing staff account keeps the POS (the module *POS Terminal*
is ticked for them once, automatically). The POS back-office panels now follow the modules too:
*Daily Expenses* needs Expenses, *Purchase* needs Purchases, *Stock Adjustment / Inventory Log /
Stock Issue* need Stock Management, *Suppliers* needs Suppliers. Tick those for the staff who
use them. (v3.12 replaced `database/upgrade-v3.9.sql` / `upgrade-v3.11.sql` with `database/upgrade-v3.12.sql`.)

**Speed.** `npm run build` no longer reads `NODE_ENV` from `.env`. With `NODE_ENV=development`
in `.env` (the usual leftover from testing on a PC) the build used to ship React's slow
development version — the main files were about twice as large — and the built server ran in
development mode. The build is now always a production build, and `npm start` always runs in
production mode whatever `.env` says. The shop, cart, checkout, sign-in and chat pages load
on first use and are fetched in the background right after the home page appears.

## 2b-16. New in v3.15 — where to find it

| Feature | Where |
|---|---|
| **Pixel runs once:** choose where the Meta Pixel lives — on the website, or inside your GTM container (then the website stops loading its own copy, so Ads Manager no longer counts orders twice) | System Configuration → **Pixel** → *Where does your Meta Pixel run?* |
| **Add to Cart / Buy Now colours and text size** (filled or outline, text colour, size on cards and on the product page, weight, corners) | Online Store → Store Design → **Product Card** → *Button colours & text size* |
| **Fonts** for the website (text and headings separately) and for the dashboard + POS — 45 Google Fonts incl. Bangla, Arabic and Hindi, or any other Google font by name | System Configuration → **Fonts** |
| **4 new premium card designs:** Luxe, Boutique, Editorial, Spotlight | Online Store → Store Design → **Product Card** → *Card design* |
| **Luxe home page:** a premium Shopify-style home (big hero picture, moving announcement band, category picture tiles, featured collection with tabs, image with text, sliding new arrivals, promo tiles …); every section on/off, movable and editable | Online Store → Store Design → **Themes** → Home page: *Luxe* |
| **Product SEO:** SEO title, meta description, share picture and tags for each product (with Google and shared-link previews) | Products → Edit → **SEO** tab |
| Phone side menu: search results now open inside the menu instead of being hidden | automatic |
| Search box camera button: a light tint on hover instead of turning black | automatic |
| **Sidebar regrouped**: Sales, Catalog, Customers, Finance, Online Store (Store Design / Store Content), Marketing, Settings — every page appears once | automatic |
| **Large catalogues (20 000 – 50 000 products):** Products, Customers and Stock pages, the header search and product pickers load from the server page by page; Meta catalog feed cached; Conversions API events sent in batches | automatic |

Database: four new product columns (`seo_title`, `seo_description`, `seo_image`, `tags`)
and a few indexes, added by the server on start (or run `database/upgrade-v3.12.sql`).
See `CHANGES-v3.15.md`.

## 2b-15. New in v3.14 — where to find it

| Feature | Where |
|---|---|
| **Hero layout:** banner across the page (as before), or **categories on the left + banner on the right** (sub-categories open on hover); hero can also be switched off | Website → **Hero Banners** → *Hero layout* |
| **Trust & certificates:** "Why choose us" text with certificate badges (logo + certificate picture that opens full size) | Website → **Trust & Facility** |
| **Factory & lab:** company profile with photos; "Explore Our Facility" opens a full-screen gallery | Website → **Trust & Facility** |
| **Live chat:** chat box on the website; answer in the dashboard (unread badge, sound, quick replies, close / reopen) | Turn on: Marketing & Tools → **Chat Widget** → *Live chat*; answer: **Live Chat** (sidebar) |
| Products page counts and lists **every** product (it stopped at 500); header search, Offers picker, order form, POS categories, Offers page and Flash Sale use the whole catalogue too | automatic |
| Header menu items a little closer together | automatic |
| Arabic: the banner slider and the product / brand rows now move the right way | automatic |
| Dashboard times (Messages, SMS log, Returns, password resets, expenses, cash drawer) were 6 hours off in Bangladesh | automatic |

Database: two new tables for the live chat, created by the server on start (or run
`database/upgrade-v3.12.sql`). See `CHANGES-v3.14.md`.

## 2b-14. New in v3.13 — where to find it

| Feature | Where |
|---|---|
| **Themes:** pick the design of the home page and of the single product page — *Classic* (the design you had, unchanged and still the default) or the new *Glow* design | Website → **Themes** |
| Glow home page: 18 sections (hero, categories, promo cards, best sellers with tabs, countdown offer, deals of the day, weekly banner, new arrivals, flash sale, all products, category rows, brands, features, reviews, blog, FAQ, contact, videos) — each one on/off, moved up/down and edited (titles, texts, images, links, countdown end) | Website → **Themes** → *Glow home page sections* |
| Glow accent colour (prices, highlighted words, Buy Now); write `*words*` in a title to colour them | Website → **Themes** → *Glow colours* |
| Glow product page: every part on/off (thumbnails, stock badge, rating, SKU, tags, share, trust row, call/WhatsApp buttons, related products) | Website → **Themes** → *Glow product page* |
| New product card design **Glow** (discount pill, hover icons, countdown on flash-sale items) | Website → **Product Card** |
| Category designs: **Tiles**, **Circles**, **Cards**, **Chips** — each works as Slide or Grid | Website → **Home Sections** → *Categories* |
| **Website languages:** English (default), বাংলা, हिन्दी, العربية (right-to-left), Français — choose which are offered, the default and the order; switcher in the header, phone menu and footer (each on/off). A link can open a language: `/?lang=bn` | Website → **Languages** |

Dashboard and POS always stay in English. Product names, descriptions and the texts you typed in the
dashboard are shown as you typed them; the language switch translates the website's own words
(buttons, menus, cart, checkout, product page, messages).

After uploading run `npm install` once (two new font packages for Hindi and Arabic). No database change;
see `CHANGES-v3.13.md`.

## 2b-13. New in v3.12.2 — where to find it

| Feature | Where |
|---|---|
| Chat widget: with **one** contact option shown the floating button is that app (its icon and colour) and opens it directly; with two or more it opens the list as before | Marketing & Tools → **Chat Widget** |
| Home categories as **Slide** (one moving row) or **Grid** (rows under each other; 2/3/4 per row on phones, 4/5/6/8 on computers) | Website → **Home Sections** → *Categories* |
| Header menu bar text one step smaller (14.5px; 13.5px in the one-line Marketplace / Transparent menus) | automatic |

No database change; see `CHANGES-v3.12.2.md`.

## 2b-12. New in v3.12 — where to find it

| Feature | Where |
|---|---|
| **Continue with Google / Facebook** for customers (sign-in and sign-up pages). Main switch + one switch per provider; keys stay on the server | System Configuration → **Social Login** |
| **Category slider moves by itself** (smooth, one category at a time; pauses while touched) — on/off and speed | Website → **Home Sections** → *Category slider* |
| **New Arrival** section under the categories with the products you add (search → Add; remove with ×) — on/off, title, how many, grid / slide. *View All* opens the shop filtered to New Arrivals | Website → **Home Sections** → *New Arrival section* (or the *New Arrival* switch on a product) |
| **YouTube videos** above the footer (paste links; title filled in from YouTube; order with arrows; "View all videos" → your channel) — on/off. Only the picture loads with the page; the player opens on tap | Website → **Home Sections** → *Videos* |
| **"Need help?" block** near the bottom of the home page: tap-to-call, WhatsApp, e-mail and a short message form (arrives in Messages) — on/off, own texts | Website → **Home Sections** → *“Need help?” contact block* |
| Pictures are sent at the size each screen needs, as WebP (a 3 MB photo becomes ~20–60 KB on a phone). Original uploads are kept as they are | automatic (`?w=` on `/uploads/…`) |
| PageSpeed: the home and product pages show their first screen straight from the server, page parts load when needed, sections below the first screen are drawn when scrolled to | automatic |
| SEO: meta description is never empty, structured data (shop, search box, product with price/stock, breadcrumbs, blog posts), a plain-HTML copy of each page's text for crawlers, clean canonical links | automatic; write your own description in Website → **Branding & SEO** |
| GTM / GA4 / Meta Pixel are now in the page source (tag checkers see them); they load after the first tap or scroll for speed — switch off to load at once | System Configuration → **Tags** |
| Readable brand colour: a colour too light for white text is darkened just enough (WCAG AA) | automatic |
| Security: `npm audit` clean (esbuild 0.28, Vite 7; drizzle-kit not installed any more) | — |

**Social Login set-up.** Set `APP_URL=https://your-domain.com` in `.env` (the address Google and
Facebook send customers back to is built from it). Then in System Configuration → Social Login:
*Google* — Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* →
*Web application*; paste the **Authorized redirect URI** shown on the card; copy the Client ID
and Client secret into the card; publish the OAuth consent screen. *Facebook* — Meta for
Developers → create an app → add *Facebook Login* → Settings → paste the **Valid OAuth Redirect
URI** shown on the card; copy App ID and App secret (Settings → Basic) into the card; switch the
app to *Live*. Turn on the main switch and save. A customer whose e-mail already has an account
is signed in to that account; anyone else gets a new customer account (the phone number is
added from their first order). Dashboard accounts never sign in this way.

**Pictures (sharp).** Resizing uses the `sharp` package (installed with `npm install`). If a host
cannot run it, the server log says `sharp is not available` and pictures are simply sent at
their original size — nothing breaks. Copies are kept in a folder beside the uploads
(`<uploads>-cache`); it can be deleted at any time and is rebuilt on demand.

**E-mail records (SPF / DMARC).** These are DNS settings of your domain, not part of the app.
In your DNS (Cloudflare / Hostinger → DNS) add a TXT record on `@` such as
`v=spf1 include:_spf.mail.hostinger.com ~all` (use the include your mail provider gives you) and
a TXT record on `_dmarc` such as `v=DMARC1; p=none; rua=mailto:you@your-domain.com`.

## 2b-11. New in v3.11 — where to find it

| Feature | Where |
|---|---|
| Database status in the health check: connected / disconnected, response time, table count, schema state, and when it fails the error code plus a hint what to fix (HTTP 503) | `https://your-domain.com/api/health` |
| Default login `admin@nomail.com` / `password`; `.env` login now always works (also for recovery) | Step 9 |
| Three checkout designs — **Classic** (numbered cards, summary on the right), **Express** (one quick page, products on top, big tap targets, payment tiles) and **Modern split** (open form beside a tinted order panel) — plus a sticky order bar on phones | Dashboard → **Checkout Page** → *Checkout Design* |
| Delivery charge can be switched **off** completely: no delivery area field, no charge, orders still go through (optional note, e.g. "Delivery charge included") | Dashboard → **Checkout Page** → *Delivery* |
| Phone number is filled in by the browser's / Google's autofill too (+880, spaces and dashes are cleaned up) | Checkout, sign-up, landing page order form |
| 13 social networks (Facebook, X, Instagram, LinkedIn, YouTube, TikTok, WhatsApp, Messenger, Telegram, Pinterest, Threads, Snapchat, Discord) as brand-coloured circles, quiet tiles (colour on hover) or outlines — circle / rounded / square, in your own order | Website → **Footer & Social** → *Social media links* |
| Footer columns (about, quick links, policy links, contact) moved left / right or hidden, social icons placed where you want; every link moved up / down | Website → **Footer & Social** → *Footer layout*, *Quick links*, *Policy & support links* |
| Back-to-top button with a scroll-progress ring (right or left; on phones it sits above the bottom menu) | Website → **Footer & Social** → *Back-to-top button* |
| Search placeholder **"Search products....."** with an animated typing hint (your own phrases, speed) | Website → **Search & Shop** |
| **Search by photo**: the customer takes or picks a photo and gets the most similar products. The photo is read inside the customer's browser — it is never uploaded or saved. Turn on, then press *Update index* once (products you save later are added automatically) | Website → **Search & Shop** → *Search by photo* |
| Shop page: 20 products per page with page numbers 1, 2, 3 … (count adjustable) | Website → **Search & Shop** → *Products per page* |
| **Courier Report**: per courier — parcels, products, amount, COD, delivered / returned / on the way, delivery rate, day-by-day chart and the parcel list (CSV export) | Reports → **Courier Report** |
| **RedX** and **Carrybee** courier booking, status sync and webhooks (next to Steadfast and Pathao) | System Configuration → **Integrations**; then Orders → *Send to courier* |
| **MiM SMS** gateway (with balance check) | **SMS** → provider *MiM SMS* |
| Coupons: status, expiry date (valid to the end of that day, shop time zone), usage limit (0 = no limit) and minimum order are checked on the server for every order; a cancelled or deleted order gives its use back. Older versions saved a limit of 100 when the field was left empty — set it to 0 for coupons that should stay unlimited | Coupons |
| Public Sans font across the dashboard, POS and website (Bangla text keeps Noto Sans Bengali) | everywhere |
| New "are you sure?" window for every delete (also the cart's *Remove All*) | everywhere |

**RedX.** Paste the *API Access Token* from the RedX merchant panel (Developer API) without the
word "Bearer", press *Test Connection* and pick the pickup store (optional). When an order is
sent, choose the delivery **area** (searchable list from RedX). For live status, write any long
random text as *Webhook Secret* and give RedX the *Callback URL* shown on the card
(`https://your-domain.com/api/webhooks/redx?token=…`). Each webhook is double-checked with
RedX's API before the order changes. *Sandbox* uses RedX's test server.

**Carrybee.** Enter *Client ID*, *Client Secret* and *Client Context* from the Carrybee merchant
panel, press *Test Connection* and pick the store. When an order is sent, choose city → zone
(→ area), or leave it empty: Carrybee's address lookup reads the customer's address (then the
district / thana is used). Webhook: register `https://your-domain.com/api/webhooks/carrybee` in
the Carrybee panel with the same *Webhook Secret* as on the card (sent as the
`X-Carrybee-Webhook-Signature` header; without a secret every update is re-checked with
Carrybee's API).

**MiM SMS.** Dashboard → SMS → choose *MiM SMS*, enter your MiM **user name** (the e-mail you
sign in with), the **API key** and the approved **Sender Name**, save, then check the balance /
send a test SMS. Numbers are sent as 8801XXXXXXXXX automatically.

**Database.** Two new tables (`coupon_usages`, `product_image_index`) and one index on
`orders` — added by themselves on the first start. For hosts that refuse ALTER/CREATE, run
`database/upgrade-v3.12.sql` once. **Never run `drizzle-kit push`** against the live database:
it wants to rebuild tables the app manages itself (the config now refuses unless you set
`DRIZZLE_ALLOW_PUSH=1`).

## 2c. Tracking: how duplicate events are avoided

Every event fires once, from one place:

- The Meta Pixel snippet is injected **without** its own `PageView`. `tracking.pageView()`
  is the only thing that sends one, so a session no longer starts with two.
- Every event carries a generated `eventID`. The same id goes to the browser pixel
  and to the Conversions API relay (`POST /api/track/capi`), which is exactly what
  Meta matches on to merge the pair into one conversion.
- Events fired before the settings have loaded (the first PageView, ViewContent on a
  product link opened directly) wait in a queue and are sent once the pixel is ready.
- `Purchase` is sent to the Conversions API **by the server** from the order route
  (order number = event id), with hashed phone/name and the `_fbp`/`_fbc` cookies,
  so it counts even when an ad blocker stops the browser pixel.
- Graph API version: `META_GRAPH_VERSION` in `server.ts` (currently v25.0).
- GTM: all events are GA4-format dataLayer pushes. If a GTM ID is set, add GA4 inside
  GTM; the separate GA4 ID is only loaded when there is no GTM container.
- `Purchase` is recorded per order id in `localStorage`, so refreshing or going back
  to the thank-you page cannot count a sale twice.
- **v3.15 — one pixel only.** If the Meta Pixel tag is also inside your GTM container,
  set System Configuration → Pixel → *Where does your Meta Pixel run?* to **Inside my
  GTM container**. The website then stops loading its own pixel (no double PageView /
  Purchase); the dataLayer events carry `event_id`, so map it in GTM to keep the
  browser/server pair merged. The `_fbc` (from `?fbclid`) and `_fbp` cookies are set
  as soon as the page loads, so the server events match the ad click.
- Conversions API events from the browser relay are batched (up to 500 per request,
  sent every 2 s) and limited per visitor, so a traffic spike does not flood Meta.
- Events covered: PageView, ViewContent, ViewCategory, Search, AddToCart,
  AddToWishlist, InitiateCheckout, AddPaymentInfo, Contact, CompleteRegistration,
  Purchase. System Configuration → Pixel lists them and shows a live connection check.

The Conversions API access token is stored server-side only — `GET /api/settings`
strips it and exposes just a `capiEnabled` flag.

---

## 2d. Invoices

- Three paper sizes: **A4**, **80mm** and **58mm**; the `@page` size switches with the selection.
- Header, footer note, terms, signature label and logo come from **System Configuration →
  Invoice & Receipt** (`invoice_config`). Without an invoice logo the website logo is used,
  so every invoice and POS receipt carries a logo, always at the same standard size.
- The payment line shows the method's name (e.g. "bKash Personal" for a manual send-money
  option, "Cash on Delivery"), never the internal id, plus the transaction id when given.
- Customers can open their own invoice at `/invoice/<orderNumber>?phone=<their phone>`;
  the API refuses the request unless the phone matches the order.
- The courier consignment ID is printed once the order is handed to a courier.
- Long invoices print and download (PDF) in full: every line, the totals and the footer,
  continuing on a second page when needed (v3.8).

---

## 3. Separate frontend / backend hosting (optional)

The default build is a single Node deployment. To split them:

- **Backend:** deploy `dist/server.cjs` + `.env` on the Node host.
- **Frontend:** serve `dist/` from any static host / CDN, and proxy `/api/*` and `/uploads/*`
  to the backend origin (frontend calls same-origin relative paths like `/api/products`).

---

## 4. Security notes

Built in, nothing to configure:

- Salted PBKDF2 password hashing (120k iterations); legacy hashes upgrade on login.
- HMAC-signed stateless session tokens, 12 h TTL.
- Staff permissions are re-read from the database on **every** request, so
  deactivating an account or removing a module takes effect immediately, even
  for a session that is already open.
- Login throttle: 5 failed attempts per IP per 15 minutes.
- Password reset: 6-digit codes by SMS or email (10 / 30 minutes), 5 tries per code,
  one code a minute and five an hour per account, fifteen an hour per device. Codes
  and links are stored only as hashes and never shown in the dashboard or SMS log.
  The answer is the same whether or not an account exists. After a reset every
  session signed in before it stops working.
- Links in reset emails use `APP_URL` (set it to your real `https://` address).
- Security headers on every response (nosniff, SAMEORIGIN, Referrer-Policy,
  Permissions-Policy, HSTS in production); `X-Powered-By` removed.
- Request body capped at 12 MB.
- Blocked IPs and blocked customers are rejected at the order API, not just in the UI.
- Secrets (courier credentials, Conversions API token, password hashes) are never
  returned by the public settings endpoint.


- All `/api/admin/*`, `/api/dashboard/*`, `/api/media/*` routes require an **admin** session;
  `/api/pos/*` requires admin or staff. Anonymous visitors can only read the public catalog.
- Session tokens are HMAC-signed with `SESSION_SECRET` and expire after 12 hours.
- Passwords use salted PBKDF2 (120k iterations). Hashes from older builds are upgraded
  automatically on the next successful login.
- Never commit `.env`. Rotate `SESSION_SECRET` if it is ever exposed (this logs everyone out).

---

## 5. Local development

```bash
cp .env.example .env     # point DB_* at a local MySQL/MariaDB
npm install
npm run dev              # tsx server.ts — API + Vite dev server on :3000
npm run lint             # tsc --noEmit
```

There is no demo catalogue in this version; add a few products from the dashboard to try
the store locally.


---

## 6. Database engine

This project runs on **MySQL 5.7+ / MariaDB 10.4+** (Hostinger's default). It was migrated from
PostgreSQL; if you are looking at older notes, these are the differences that matter:

- Connection uses `mysql2` (`DB_*` variables). The old `SQL_*` names still work as a fallback.
- `numeric` columns are `decimal`, and money values are still returned as strings (`"1250.00"`),
  so API responses are unchanged.
- MySQL has no `RETURNING`, so `src/db/mysql-helpers.ts` provides `insertReturning`,
  `updateReturning` and `deleteReturning`, which return the same arrays the code expected before.
- Columns that are unique, filtered or sorted are `varchar` rather than `text`, because MySQL
  cannot index a `TEXT` column without a prefix length.
- Search uses `LIKE`; MySQL's default `utf8mb4_unicode_ci` collation is already case-insensitive,
  so results match the old `ILIKE` behaviour.
- The database and every table use `utf8mb4` so Bengali text stores and sorts correctly.
