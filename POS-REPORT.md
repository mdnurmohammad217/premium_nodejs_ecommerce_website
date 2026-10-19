# POS System — Full Feature Report

**Topper IT — Point of Sale & Back Office**
Version 2.0 · MySQL / MariaDB · React 19 + Express

---

## 1. এক নজরে

POS টা দুইটা অংশে ভাগ করা:

| অংশ | কী করে | কোথায় |
|---|---|---|
| **Counter Terminal** | দোকানে বসে বিক্রি করা — barcode scan, cart, discount, payment, receipt print | `/pos` |
| **Back-Office Modules** | ১৯টা ERP module — purchase, ledger, expense, salary, report, backup | `/pos` → **Modules (F9)** |

দুটোই একই স্ক্রিনে, Modules একটা overlay হিসেবে খোলে — মানে বিক্রি করতে করতে module-এ ঢুকে আবার এক ক্লিকে বিলে ফেরত আসা যায়।

উপরে বাঁ পাশে **Dashboard** বাটন — সরাসরি অ্যাডমিন ড্যাশবোর্ডে নিয়ে যায় (আগে storefront-এ যেত)।

---

## 2. Counter Terminal (বিক্রির স্ক্রিন)

### পণ্য খোঁজা ও কার্টে যোগ করা
- **Barcode scanner support** — scan করলে সরাসরি বিলে চলে যায় (`Enter` key দিয়ে)
- নাম / generic name / SKU / barcode — যেকোনোটা দিয়ে search
- **Product tile-এ এখন ছবি দেখা যায়** — ছবি, SKU, generic name, dosage, unit, stock badge, দাম
- Category tab দিয়ে filter (All Medicines, Prescription, OTC, Vitamins, Diabetes, Baby Care…)
- Stock অনুযায়ী রঙ: সবুজ (ভালো), হলুদ (১০ বা কম), লাল (শেষ)
- Out of stock পণ্য tile disabled — ভুল করে বিলে যাবে না

### বিল তৈরি
- পরিমাণ বাড়ানো / কমানো / লাইন মুছে ফেলা
- **প্রতি লাইনে আলাদা discount**
- পুরো বিলে discount (৳) + VAT/Tax (%)
- **Hold Sale** — চলতি বিল সরিয়ে রেখে নতুন কাস্টমার ধরা, পরে ফিরিয়ে আনা
- Walk-in customer, অথবা নাম-মোবাইল দিয়ে নতুন কাস্টমার তৈরি
- পুরনো কাস্টমার search করে যোগ করা

### পেমেন্ট
- **Cash / bKash / Nagad / Card**
- Cash received লিখলে **change to return** নিজে হিসাব করে দেয়
- বিল সেভ হলেই stock কমে যায় এবং inventory log-এ entry পড়ে (transaction-এর ভিতরে, তাই অর্ধেক সেভ হওয়ার সুযোগ নেই)

### রসিদ
- **58mm / 80mm thermal receipt** print
- দোকানের নাম, ঠিকানা, ফোন, drug license — সব dashboard থেকে আসে
- Cashier নাম ও counter নম্বর রসিদে থাকে

### Sales Return
- পুরনো বিল খুঁজে পণ্য ফেরত নেওয়া
- ফেরত নিলে stock আবার বেড়ে যায় + inventory log-এ `return` entry

---

## 3. Back-Office Modules (১৯টা)

### 📦 Stock & Procurement

**1. Purchase (Stock Inward)**
সাপ্লায়ার থেকে মাল ঢোকানো। পণ্য, পরিমাণ, unit cost, batch number, expiry date — লাইন ধরে ধরে। সেভ করলে invoice তৈরি হয়, stock বাড়ে, inventory log-এ entry পড়ে। কত টাকা দিলেন সেটাও লেখা যায় — বাকিটা due হিসেবে supplier ledger-এ যায়।

**2. Supplier**
সাপ্লায়ার ডিরেক্টরি — নাম, ফোন, কোম্পানি, ঠিকানা, opening balance। এখান থেকে যোগ করা যায়, ড্যাশবোর্ডের **Suppliers & Inward** পেজ থেকে edit/delete-ও করা যায়।

**3. Purchase Return**
সাপ্লায়ারকে মাল ফেরত পাঠানো। কারণ লেখা যায়। ফেরত দিলে stock কমে, `purchase_return` log হয়, আলাদা return number তৈরি হয় (PR-xxxxxxxxxx)। **স্টকে না থাকলে ফেরত দিতে দেয় না** — negative stock হওয়ার সুযোগ নেই।

**4. Short List**
যেসব পণ্যের stock threshold-এর নিচে নেমে গেছে — কী কী কিনতে হবে তার লিস্ট।

**5. Expired List**
মেয়াদ শেষ / কাছাকাছি পণ্য। কত দিনের মধ্যে expire হবে সেটা নিজে সেট করা যায় (default 90 দিন)।

**6. Product Inventory Log**
প্রতিটা stock movement-এর পূর্ণ ইতিহাস — sale, purchase, adjustment, return, issue, order edit। আগে কত ছিল → এখন কত, কে করেছে, কোন reference-এ। অডিট ট্রেইল।

**7. Product Adjustment**
গণনা করে দেখলেন মিলছে না — বাড়ানো বা কমানো, সাথে কারণ। প্রতিটা adjustment log-এ থাকে।

**8. Product Issue**
বিক্রি ছাড়া মাল বের হওয়া — damage, sample, internal use, expired। stock কমে, আলাদা রেকর্ড থাকে, তাই বিক্রির হিসাবের সাথে মিশে যায় না।

---

### 💰 Money

**9. Daily Expenses**
দোকানের খরচ — ক্যাটাগরি, পরিমাণ, পেমেন্ট মেথড, তারিখ। রিপোর্টে profit হিসাবের সময় বাদ যায়।

**10. Open Counter (Cash Drawer)**
দিন শুরুতে opening cash লিখে counter খোলা, দিনশেষে closing cash লিখে বন্ধ করা। সিস্টেম নিজে expected cash হিসাব করে **difference** দেখিয়ে দেয় — ক্যাশ কম-বেশি ধরা পড়ে।

**11. Customer Ledger**
কোন কাস্টমারের কত বাকি। মোট কেনা − মোট আদায় = due। এখান থেকেই টাকা আদায় (cash/bKash/Nagad/bank) রেকর্ড করা যায়, সাথে সাথে due কমে যায়।

**12. Supplier Ledger**
কোন সাপ্লায়ারকে কত দিতে হবে। মোট বিল − মোট পরিশোধ = due। পেমেন্ট দিলে supplier-এর balance নিজে কমে যায়।

**13. Salary**
কর্মচারীর বেতন — basic + bonus − deduction = **net pay** নিজে হিসাব করে। মাস ধরে ধরে রেকর্ড, রিপোর্টে খরচ হিসেবে যায়।

---

### 📋 Sales & Customer

**14. Pre Order**
কাস্টমার যে পণ্য এখন নেই সেটার অগ্রিম অর্ডার — নাম, ফোন, পণ্য, পরিমাণ, অগ্রিম টাকা, কবে আসবে। Status: pending → ordered → arrived → delivered / cancelled।

**15. Sales Summary**
আজকের বিক্রি, বিলের সংখ্যা, cash received, payment method অনুযায়ী ভাগ।

---

### 🗂 Master Data & Admin

**16. Master Data**
তিনটা লিস্ট এক জায়গায় — **Generic** (মলিকিউল), **Company** (ম্যানুফ্যাকচারার), **Product Group** (শেলফ/গ্রুপ)। add/edit/delete। একই নাম দুইবার দিলে পরিষ্কার মেসেজ দেয়, 500 error দেয় না।

**17. Reports**
যেকোনো তারিখ থেকে তারিখ পর্যন্ত — revenue, discount, shipping, expenses, purchases, salaries, **net profit**, average order value, দিন-ভিত্তিক চার্ট, সবচেয়ে বেশি বিক্রি হওয়া পণ্য, payment method breakdown। CSV export।

**18. User List (Access Control)**
স্টাফ একাউন্ট তৈরি — নাম, ইমেইল, পাসওয়ার্ড, job role। তারপর **কোন কোন module-এ ঢুকতে পারবে** সেটা টিক দিয়ে ঠিক করা: dashboard, orders, products, categories, brands, attributes, inventory, suppliers, purchases, customers, coupons, pos, reports, expenses, salaries, website, settings, users — ১৮টা module।

**19. Backup**
পুরো ডাটাবেসের `.sql` ডাম্প ডাউনলোড — ৩০টা টেবিল। `REPLACE INTO` ব্যবহার করে, তাই বারবার import করলেও সমস্যা নেই। কোন টেবিলে কত row আছে সেটাও দেখায়।

---

## 4. Access Control কীভাবে কাজ করে

এটা গুরুত্বপূর্ণ, তাই আলাদা করে বলছি:

1. **Staff & Access** পেজ থেকে একাউন্ট তৈরি করে module permission দিন
2. স্টাফ সেই ইমেইল-পাসওয়ার্ড দিয়ে **একই login page** থেকে ঢোকে
3. যে module-এ permission নেই সেখানে ঢুকতে চাইলে **403** — শুধু UI-তে লুকানো না, **সার্ভার নিজে আটকায়**
4. **permission প্রতি request-এ ডাটাবেস থেকে পড়া হয়** — মানে কারো permission কেড়ে নিলে বা একাউন্ট বন্ধ করলে সে ইতিমধ্যে লগইন থাকলেও **সাথে সাথে** বন্ধ হয়ে যায়, টোকেনের মেয়াদ শেষ হওয়ার অপেক্ষা করতে হয় না

টেস্ট করে দেখানো:

```
staff (pos, orders, customers permission) →
  GET /api/pos/pre-orders   → 200  ✅ (orders আছে)
  GET /api/pos/salaries     → 403  ✅ (salaries নেই)
  GET /api/admin/users      → 403  ✅ (admin-only)
একাউন্ট inactive করার পর →
  GET /api/pos/pre-orders   → 401  ✅ সাথে সাথে বন্ধ
```

---

## 5. ডাটাবেস টেবিল যেগুলো POS ব্যবহার করে

| টেবিল | কাজ |
|---|---|
| `products` | পণ্য, stock, batch, expiry |
| `inventory_transactions` | প্রতিটা stock movement |
| `orders` / `order_items` | বিক্রি (web + pos দুটোই, `source` দিয়ে আলাদা) |
| `customers` | কাস্টমার, due, status |
| `customer_payments` | কাস্টমারের টাকা আদায় |
| `suppliers` | সাপ্লায়ার |
| `purchases` / `purchase_items` | ক্রয় বিল |
| `purchase_returns` / `purchase_return_items` | সাপ্লায়ারকে ফেরত |
| `supplier_payments` | সাপ্লায়ারকে পরিশোধ |
| `expenses` | দৈনিক খরচ |
| `counter_sessions` | ক্যাশ ড্রয়ার session |
| `pre_orders` | প্রি-অর্ডার |
| `product_issues` | damage / sample / internal |
| `salaries` | বেতন |
| `generics` / `manufacturers` / `product_groups` | মাস্টার ডাটা |
| `users` | স্টাফ একাউন্ট + permission |

---

## 6. নিরাপত্তা

- POS-এর সব API (`/api/pos/*`) **login ছাড়া ঢোকা যায় না** — ৪০১
- প্রতিটা module-এ আলাদা permission gate
- পাসওয়ার্ড **PBKDF2 (120,000 iteration)** দিয়ে salted hash — পুরনো hash লগইনের সময় নিজে upgrade হয়
- Login throttle — এক IP থেকে ৫ বার ভুল হলে ১৫ মিনিট বন্ধ
- সব stock পরিবর্তন **database transaction**-এর ভিতরে — বিদ্যুৎ চলে গেলেও অর্ধেক সেভ হবে না
- স্টকে নেই এমন পণ্য বিক্রি / ফেরত / issue করা যায় না

---

## 7. কীবোর্ড শর্টকাট

| কী | কাজ |
|---|---|
| `F9` | Modules খোলা |
| `Enter` (barcode field) | স্ক্যান করা পণ্য বিলে যোগ |
| `Esc` | খোলা modal/drawer বন্ধ |

---

## 8. যা যা টেস্ট করে দেখা হয়েছে

লাইভ MariaDB-র বিরুদ্ধে চালিয়ে:

- ১৯টা module-ই লোড হয় ✅
- Purchase → stock বাড়ে, log পড়ে ✅
- Purchase return → stock কমে, স্টকের বেশি ফেরত আটকায় ✅
- Customer/Supplier ledger due হিসাব ঠিক ✅
- Master data duplicate → 409 (500 না) ✅
- Pre-order status পরিবর্তন ✅
- Product issue → stock কমে ✅
- Salary net pay হিসাব ✅
- Reports date range ✅
- Backup ডাউনলোড → খালি ডাটাবেসে restore → সব ডাটা ফিরে আসে ✅
- Staff permission + live revocation ✅
- POS terminal-এ ছবি ও Dashboard বাটন ✅

---

*Report generated for Topper IT — v2.0*
