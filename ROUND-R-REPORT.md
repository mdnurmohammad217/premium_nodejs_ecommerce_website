# v3.8 — Round R report

All 7 requests from this round are done, built and tested. The app version is **3.8.0**.
Updating from v3.7 needs **no SQL**: this version has no database changes. On a copy of a
v3.7 database every table and column stayed the same, and no product, order, customer,
stock or POS record was changed.

### সংক্ষেপে (বাংলায়)

1. **Reports** এ এখন আলাদা **Sales Report** (ওয়েবসাইটের অর্ডার) আর **POS Sales Report** (কাউন্টার সেল) আছে। দিন/সপ্তাহ/মাস অনুযায়ী চার্ট, পেমেন্ট মেথড, ক্যাশিয়ার, ব্যস্ত সময়, বেস্ট সেলার, CSV আর প্রিন্ট।
2. **Category, Brand, Customer** এখন ডিলিট হয়। প্রোডাক্ট বা অর্ডার কখনো মুছে যায় না। Category ডিলিট করলে তার প্রোডাক্ট প্যারেন্ট ক্যাটাগরিতে যায়। Brand ডিলিট করলে প্রোডাক্ট থেকে শুধু ব্র্যান্ডটা সরে যায়। Customer ডিলিট করলে তার অর্ডারগুলো All Orders এ থেকে যায়। পুরো সফটওয়্যারের সব ডিলিট বাটন চেক করা হয়েছে।
3. **Invoice** এখন পুরোটা প্রিন্ট ও PDF হয়: সব লাইন, টোটাল আর সিগনেচার। লম্বা হলে দ্বিতীয় পেজে চলে যায়।
4. **Variable product** খুললেই প্রথম in-stock variation (সাইজ/কালার) সিলেক্ট হয়ে থাকে।
5. **রিলোডের সময় সবুজ রং আর ডাক্তারি (pill) লোগো আর দেখা যায় না।** পেজ খোলার মুহূর্ত থেকেই আপনার রং, লোগো আর ব্যানার দেখায়। Dashboard আর POS এও তাই।
6. প্রোডাক্ট ফর্ম থেকে **Attributes** ট্যাব সরানো হয়েছে। Variations আগের মতোই আছে।
7. স্ক্রল করলে সেকশনগুলো স্মুথলি ভেসে ওঠে। প্রোডাক্ট কার্ডগুলো একটার পর একটা আসে। **Hero slider** এখন একদিকে স্মুথলি স্লাইড করে, ছবিতে হালকা zoom হয় আর নিচে progress dot থাকে।

---

## 1. What was asked → what was done

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Sales Report and POS Sales Report in Reports | **Reports** is now a menu with three pages: **Sales Report**, **POS Sales Report** and the existing **Profit & Expenses**.<br><br>**Periods:** Today, Yesterday, Last 7/30 days, This/Last month, This year, or custom dates. Group by day, week (Sat–Fri) or month.<br><br>**Headline figures:** Total sales, Orders/Sales, Items sold and Average. Total sales and Orders are compared with the previous period.<br><br>**Breakdown strip:** Product sales − Discounts + Delivery (VAT on POS) = Total sales, plus Gross profit (from cost prices), Returns (with the total after returns) and Cancelled/failed.<br><br>**Charts and lists:** sales-by-period chart; how customers paid; order status; delivery zones; order sources (website or landing page); weekdays; best-selling products and categories; every order in the period, with search. POS adds **Cashiers** and **Busiest hours**.<br><br>**Filters:** order status, payment method, cashier.<br><br>**Output:** *Export CSV* and *Print* (A4). Days are counted in Bangladesh time, whatever time zone the server uses. | Reports → Sales Report / POS Sales Report |
| 2 | Category, brand and customer can't be deleted; recheck every add/delete | **Category:** its products move to the parent category (or *Uncategorised*), and its subcategories move up one level. The dialog says exactly what will happen.<br><br>**Brand:** its products just lose the brand.<br><br>**Customer:** there was no delete at all; now there is a row trash button, a *Delete* button in the drawer, and tick-several → *Delete*. Their orders stay in All Orders (unlinked, with the name and phone they were placed with). A customer with dues in the customer ledger is kept, with a clear message.<br><br>**Every other delete** in the dashboard was checked:<br>• Supplier: clear message while purchases, returns or payments exist.<br>• Staff: you can't delete your own signed-in account.<br>• Order: deleting it now puts back variation stock too, and doesn't restock items a return already restocked.<br>• Attributes, coupons, banners, returns, blocked IPs, incomplete orders, blog, landing pages: all work. | Products → Categories / Brands · Customers |
| 3 | Invoice prints only the visible part | Fixed in all three places.<br>• **Viewer:** the page no longer stretches to the window and cut off.<br>• **Download PDF:** captures the whole invoice and continues on a new page.<br>• **Print:** every line, the totals, notes and signature. Table rows never split across pages, and the column headings repeat on page 2.<br><br>Tested with a 17-line invoice. | Orders → Print Invoice · POS |
| 4 | Variable products: first variation selected by default | The product page and landing pages open with the **first in-stock** option combination selected, so the price, stock and picture are right and *Add to Cart* works straight away.<br><br>Clicking an option that isn't available with the current choice jumps to the nearest combination that is in stock, so you never land on an out-of-stock mix. Options are never un-selected by a second click. | Product page · Landing pages |
| 5 | On reload a different green look with a doctor/pill logo appears first | **Cause:** the page started with the software's default green theme and a pill icon while it waited for your settings.<br><br>**Fix:** the server now puts your colours, logo and banners **inside the page itself**, and starts downloading the logo and the first banner immediately.<br>• The first paint is your store.<br>• Tested with the settings request slowed to 4 seconds: orange, your logo and the hero already show.<br>• The browser-tab icon uses your favicon or logo.<br>• The dashboard and POS also open in your colours.<br>• A saved change to Theme, Logo or Banners shows on the next reload. | Whole website |
| 6 | Remove the Attributes tab from the product form | Removed. The product form has no Attributes tab; Variations is unchanged. Existing attribute data in the database is left untouched. | Products → Add / Edit |
| 7 | Premium scroll animation; smooth hero slide | **Scroll:** sections fade and rise into place as you scroll, and product cards cascade in one after another (home, shop, offers, wishlist). Nothing is hidden if a script fails. Phones and computers set to *reduce motion* get no animation, and printing always shows everything.<br><br>**Hero:** one continuous direction (the last slide flows into the first, no rewind jump), a 0.9 s eased glide, a slow Ken Burns zoom on the picture, the heading and button rising in, and progress-bar dots. Swipe works on phones. It pauses while hovered or when the tab is hidden. | Home page and store pages |

**Also fixed during the recheck**

- The dashboard also flashed green on reload before your colours loaded; it now opens in your colours.
- A logo that failed to load once stayed hidden until the next reload; a new logo now always gets its chance to load.
- Customer-delete messages now use correct singular/plural wording.

---

## 2. Why these happened

- **Deletes failed:** the database protects links between tables. A category or brand still used by a product, including hidden or trashed products you can't see in the list, blocked the delete, and the screen only said "Failed". Customers had no delete route at all.
  - Every delete now moves or unlinks the records that point at the item first, in one safe step (all or nothing), and then deletes it.
  - Nothing else is deleted.
- **Invoice cut off:**
  - The invoice page was stretched to the height of the window.
  - The PDF maker copied only the visible box.
  - Both now use the invoice's full height.
- **Green first paint:** the colours, logo and banners only arrived after a separate request, so for a moment the software's defaults (green, pill icon, no banner) were drawn. Now they come inside the page.

---

## 3. Tests run on this build

| Suite | Result |
|---|---|
| **v3.8 in the browser**, phone and desktop:<br>• category/brand/customer delete (one and bulk)<br>• long invoice: viewer height, PDF pages, printed text has every line and the total<br>• variation preselected and Add to Cart at once<br>• first paint with slow settings: colour, logo, hero<br>• Attributes tab gone<br>• scroll reveal, hero loop and swipe<br>• Sales and POS reports: figures, chart, no sideways scroll, CSV, print | **37 / 37**, 0 console errors |
| Same, on a **fresh install** built from the zip, `database/database.sql`, memory cache | 34 / 37 on the first run. The other 3 checks assumed the demo shop's orange theme, logo and a product id. With the fresh shop given a logo and theme, all passed, and its 8-line invoice printed every line and the total. |
| v3.6 API regression (settings, cache, reviews, free delivery, blog, landing pages, bKash/Nagad/SSLCommerz…) — upgraded DB with Redis / fresh install | **81 / 81** · **81 / 81** |
| v3.7 API regression (image backup/restore, barcodes, wholesale per option, invoices, drawer…) — upgraded DB / fresh install | **66 / 66** · **66 / 66** |
| Storefront in the browser (v3.6 suite) / dashboard in the browser (v3.6 suite) / v3.7 browser suites | **36 / 36** · **52 / 52** · **34 / 34 + 8 / 8** |
| License Server v2 contract suite / license in the browser | **138 / 138** · **10 / 10** |
| **Upgrade of a v3.7 database copy** | 48 tables and 534 columns before and after, with no schema change. 47 tables are byte-identical. `media_files` grew only because v3.7's image backup copied files from disk, as designed. Reports and deletes work on it. |
| Category tree delete (3 levels) | The product moved to the parent, the subcategory moved up with its level corrected, and the public category menu updated at once |
| Theme change | The page's built-in colours follow a saved theme change on the very next load (tested with Redis) |

---

## 4. After you upload this version

1. **Back up** the database (Dashboard → Backup, or phpMyAdmin → Export). This is always good practice, even though nothing in the database changes this time.
2. Upload, run `npm install` and `npm run build`, then restart. No SQL to run.
3. Reload the website a few times; it should open in your colours with your logo from the very first moment.
   - If a phone still shows the old look once, that is the old version held in the browser; one more reload fixes it.
4. **Reports → Sales Report / POS Sales Report:** pick *This month* to check the figures.
   - *Gross profit* is only exact when products have a **cost price**; the card says *(est.)* until they all do.
5. Optional: if your server is outside Bangladesh and you want a different day boundary, set `REPORT_TIMEZONE` in `.env` (default `Asia/Dhaka`).

---

## 5. Security notes for this round

- **Page data:** the settings and banners built into the page are the same **public** ones the website already sends. Secrets stay server-side (payment credentials, Conversions API token, SMS keys). The data is escaped so it can't break out of the page, and only safe colour values are accepted into the built-in style.
- **Admin-only:** the reports and customer delete need a signed-in admin, and report answers are never cached publicly.
- **Deletes:** every delete keeps orders, stock history and ledgers intact. Records are moved or unlinked, never erased along the way.
- **License rules unchanged:**
  - Only the License Server **public** key is used.
  - Network errors, timeouts, 5xx and 429 never change the local license state.
  - The website and its checkout are never blocked by the license.

---

## 6. Files

**New:**
- `src/components/admin/AdminSalesReportPage.tsx`
- `src/lib/boot.ts`
- `src/lib/reveal.ts`
- `ROUND-R-REPORT.md`

**Changed:**
- `server.ts` (reports, deletes, page data, favicon)
- `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html`
- `src/context/ThemeContext.tsx`
- `src/lib/dataCache.ts`, `src/lib/printDocument.ts`
- `src/components/admin/`: `AdminLayout.tsx`, `AdminCustomersPage.tsx`, `AdminCategoryManager.tsx`, `AdminBrandsPage.tsx`, `AdminProductsPage.tsx`, `InvoiceView.tsx`
- `src/components/store/`: `HeroSlider.tsx`, `ProductDetailView.tsx`, `LandingPageView.tsx`, `Header.tsx`, `ShopView.tsx`, `OffersView.tsx`, `WishlistView.tsx`
- `README.md`, `.env.example`, `package.json`, `package-lock.json`

`database/database.sql` is unchanged (48 tables).
