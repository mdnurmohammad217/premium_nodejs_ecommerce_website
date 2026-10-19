# v3.15 — কী কী নতুন

## ১) Facebook Pixel, GTM আর Meta Catalog — একটা অর্ডার একবারই গোনা হবে
- **Ads Manager-এ অর্ডার বেশি দেখানোর আসল কারণ:** Pixel দুই জায়গা থেকে চলত। একটা website-এর নিজের Pixel, আরেকটা GTM container-এর ভেতরের Pixel tag। তাই একই PageView আর Purchase দুবার যেত।
- **নতুন অপশন:** System Configuration → **Pixel** → *Where does your Meta Pixel run?*
  - **On this website (recommended):** website নিজেই Pixel চালায়। GTM-এ Meta Pixel tag রাখবেন না।
  - **Inside my GTM container:** Pixel যদি GTM-এ থাকে, এটা বাছুন। তখন website নিজের Pixel আর লোড করে না, তাই কিছুই দুবার যায় না। প্রতিটা dataLayer event-এ `event_id` থাকে। GTM-এ এটা Pixel-এর Event ID হিসেবে বসাতে হবে, কীভাবে বসাবেন সেটা পাশেই লেখা আছে।
- Pixel পাতায় নতুন ব্যাখ্যা: একটা বিক্রি কীভাবে একবারই গোনা হয় (browser + server-এর event একই ID পায়, তাই Meta দুটোকে একটা ধরে)।
- Test Event Code চালু থাকলে সতর্কবার্তা দেখায়। পরীক্ষা শেষে এটা খালি করতে হয়, না হলে event-গুলো "test" হিসেবে যায়।
- Facebook বিজ্ঞাপন থেকে কেউ এলে (`?fbclid`) page লোড হওয়ার সাথে সাথেই `_fbc` আর `_fbp` cookie তৈরি হয়। তাই Purchase-সহ server-এর event-গুলো সঠিক বিজ্ঞাপনের সাথে মেলে।
- Purchase-এর আগে Pixel আবার init হওয়া বন্ধ করা হয়েছে, এতে browser-এ "duplicate pixel" warning আর আসে না।
- Tags পাতার "Send customer data to the dataLayer" switch আগে website পর্যন্ত পৌঁছাত না। এখন কাজ করে।
- **Meta Catalog:** variation-সহ product-এর ID এখন সব জায়গায় একই নিয়মে তৈরি হয় (product page, landing page, cart, feed)। তাই catalog-এর ID আর event-এর `content_ids` সবসময় মেলে। Feed ১০ মিনিট cache থাকে, settings save করলে নতুন করে তৈরি হয়।
- Conversions API event-গুলো একসাথে পাঠানো হয় (প্রতি request-এ ৫০০টা পর্যন্ত, প্রতি ২ সেকেন্ডে)। প্রতি ভিজিটরের জন্য সীমাও আছে। তাই অনেক ভিড়েও Meta-তে চাপ পড়ে না, কোনো event হারায়ও না।

## ২) Add to Cart আর Buy Now বাটনের রং ও লেখার সাইজ
- **Online Store → Store Design → Product Card → Button colours & text size**
- Add to Cart আর Buy Now দুটোর জন্য আলাদা করে ঠিক করা যায়:
  - রং: ১০টা তৈরি রং, color picker, অথবা নিজের hex code
  - **Filled** (ভরা রং) অথবা **Outline** (শুধু বর্ডার)
  - লেখার রং। খালি রাখলে সাদা বা কালোর মধ্যে যেটা ভালো পড়া যায় সেটা নিজে বসে।
- লেখার সাইজ আলাদা করে বাড়ানো-কমানো যায়: **product card-এ** (১১–১৮ px) আর **product page-এ** (১৩–২২ px)।
- লেখার মোটা ভাব (Medium থেকে Extra bold) আর কোণ (Square / Rounded / Pill) বেছে নেওয়া যায়।
- পাশে live preview দেখায়, card design-এর ছবিগুলোও সাথে সাথে বদলায়।
- **Reset** চাপলে আবার design-এর নিজের রং-এ ফিরে যায়।
- সব card design, product page আর phone-এর নিচের বাটনগুলোতে একসাথে কাজ করে।

## ৩) Phone-এর side menu-তে search করলে product লুকিয়ে যেত — ঠিক হলো
- এখন search-এর ফল menu-র ভেতরে search box-এর ঠিক নিচে খোলে। ভাষার অংশ বা banner আর ফলগুলোকে ঢেকে দেয় না।

## ৪) Website আর Dashboard-এর font বদলানো
- **System Configuration → Fonts**
- তিনটা আলাদা জিনিস বেছে নেওয়া যায়:
  - **Website text:** menu, বিবরণ, দাম, বাটন
  - **Website headings:** section-এর শিরোনাম আর product-এর নাম (serif font দিলে premium দেখায়)
  - **Dashboard & POS:** শুধু আপনি আর staff দেখেন
- ৪৫টা বাছাই করা Google Font আছে, ধরন অনুযায়ী সাজানো:
  - Modern sans: Inter, Poppins, Roboto, Montserrat, DM Sans, Manrope …
  - Elegant serif: Playfair Display, Cormorant Garamond, Lora …
  - Headings with character
  - **বাংলা:** Hind Siliguri, Noto Sans Bengali, Anek Bangla, Baloo Da 2, Tiro Bangla, Galada …
  - Arabic আর Hindi
- **Another Google font…** বেছে fonts.google.com-এর যেকোনো font-এর নাম লিখেও ব্যবহার করা যায়।
- Save করার আগেই English আর বাংলা লেখায় preview দেখায়।
- Font server থেকেই page-এ বসে যায়, তাই page খোলার সময় font লাফিয়ে বদলায় না। English font-এ বাংলা অক্ষর না থাকলেও বাংলা লেখা Noto Sans Bengali-তে পরিষ্কার দেখায়।
- **Built-in fonts** চাপলে আগের font-এ (Public Sans) ফিরে যায়। এটা আপনার নিজের server-এ থাকে, তাই সবচেয়ে দ্রুত।

## ৫) Product card-এর ৪টা নতুন premium design
- **Online Store → Store Design → Product Card → Card design.** এখন মোট ৯টা design।
  - **Luxe:** Shopify-র boutique-এর মতো। চারপাশে কোনো বর্ডার নেই, লেখা মাঝখানে, brand ছোট বড়-হাতের অক্ষরে, নাম heading font-এ, star rating থাকে। Computer-এ ছবির উপর mouse রাখলে নিচ থেকে "Add to Cart" উঠে আসে।
  - **Boutique:** নরম ছায়ার card, গোল লাল ছাড়ের সিল, star আর review-এর সংখ্যা, "Save ৳…" লেখা। নিচে ছোট cart বাটন আর চওড়া Buy Now।
  - **Editorial:** ম্যাগাজিনের মতো। চৌকো ছবি, বড় নাম heading font-এ, পাতলা দাগ, বড়-হাতের অক্ষরে বাটন।
  - **Spotlight:** ছবির উপর rating, বড় দাম আর তার নিচে কত সাশ্রয় হচ্ছে, চওড়া Buy Now আর পাশে cart বাটন।
- সব design phone, tablet আর computer-এ ঠিকমতো দেখায়, Arabic-এও। বাটনের রং/সাইজের setting এদের উপরও কাজ করে।

## ৬) Search box-এর camera বাটন hover করলে কালো হয়ে যেত — ঠিক হলো
- এখন mouse রাখলে brand রঙের হালকা একটু গাঢ় ছায়া আসে, icon দেখা যায়।

## ৭) নতুন premium home page: Luxe (Shopify-স্টাইল)
- **Online Store → Store Design → Themes → Home page → Luxe** বেছে Save দিন। Classic আর Glow আগের মতোই আছে, যখন খুশি বদলানো যায়।
- Luxe-এর section-গুলো:
  - **Hero:** আপনার banner slider, অথবা একটা বড় ছবির উপর শিরোনাম, লেখা আর দুটো বাটন (phone-এর জন্য আলাদা ছবিও দেওয়া যায়)।
  - **Announcement band:** "Cash on delivery • Fast home delivery …" লেখাগুলো ধীরে ধীরে সরে যায়। লেখা আর গতি ঠিক করা যায়।
  - **Shop by category:** বড় ছবির টাইলে category দেখায়।
  - **Featured collection:** Best Sellers / New Arrivals / On Sale tab-সহ।
  - **Image with text:** বড় ছবির পাশে আপনার গল্প আর একটা বাটন।
  - **New arrivals:** product-এর সারি, আঙুল দিয়ে টানা যায় বা তীর দিয়ে সরানো যায়।
  - **Promo tiles:** ২–৩টা ছবির টাইল, শিরোনাম আর link-সহ।
  - এছাড়া Flash sale, Category sections, All products, Brands, Service features, Trust & certificates, Factory & lab, Review screenshots, Blog, Need help, Videos।
- প্রতিটা section চালু/বন্ধ করা যায়, উপরে-নিচে সরানো যায়, আর **Edit** চেপে লেখা ও ছবি বদলানো যায়। শিরোনামে `*শব্দ*` লিখলে সেই শব্দ accent রঙে দেখায়।
- এই page-এ কোন card design চলবে, সেটা আলাদা করে বেছে নেওয়া যায় (default: Luxe)।
- ছবি না দিলেও খালি দেখায় না, brand রঙের সুন্দর background আসে।
- Section-গুলো scroll করে কাছে এলে তবেই লোড হয়, তাই home page দ্রুত খোলে।

## ৮) প্রতিটা product-এর SEO: title, description, ছবি, tag
- **Products → Edit → SEO tab**
  - **SEO title:** Google-এর নীল শিরোনাম আর browser tab-এর লেখা (৬০ অক্ষরের counter আছে)।
  - **Meta description:** Google-এ শিরোনামের নিচের দুই লাইন (১৬০ অক্ষরের counter আছে)।
  - **Share picture:** Facebook, WhatsApp বা Messenger-এ link শেয়ার করলে যে ছবি দেখায় (1200 × 630 px)।
  - **Tags:** লিখে Enter বা কমা চাপুন, ২০টা পর্যন্ত। Tag-গুলো product page-এ #tag হিসেবে দেখায় (চাপলে সেই tag-এর product খোঁজে), আর shop-এর search-এও কাজ করে।
- পাশে **Google preview** আর **shared link preview** দেখায়।
- কোনো ঘর খালি রাখলে আগের মতো product-এর নাম, ছোট বিবরণ আর মূল ছবি ব্যবহার হয়।
- সবকিছু server থেকেই page-এ বসে, তাই Google আর Facebook সঠিক তথ্য পায়। `keywords` meta tag-ও যোগ হয়।
- Excel/CSV import-export-এ SEO title, SEO description, SEO image আর Tags কলাম যোগ হয়েছে।

## ৯) Dashboard menu গুছানো হলো — একই জিনিস দুবার নেই
- Sidebar এখন কাজ অনুযায়ী ভাগ করা:
  - **Sales:** Orders, Live Chat, Landing Pages, POS Terminal
  - **Catalog:** Products, Stock Management, Suppliers & Purchases
  - **Customers**
  - **Finance:** Reports, Expenses
  - **Online Store:**
    - **Store Design:** Themes, Home Sections, Hero Banners, Header Design, Product Card, Product Page, Checkout Page, Footer & Social, Mobile Menu
    - **Store Content:** Branding & SEO, Menu Builder, Pages & Policies, Trust & Facility, Blog, Review Screenshots, Search & Shop, Languages
  - **Marketing:** Offers & Flash Sale, Coupons, SMS, Meta Catalog, Chat Widget, Fraud Checker
  - **Settings:** System Configuration, Staff & Access, Account & Security, License
- আগে "Website" পাতার ভেতরে আরেক সারি tab ছিল, আর sidebar-এও Themes, Languages, Trust আলাদা করে ছিল। এখন প্রতিটা পাতা sidebar-এ শুধু একবার আছে, আর পাতা খুললে তার নিজের নাম ও ছোট বিবরণ দেখায়।
- Custom Code এখন শুধু System Configuration-এ আছে (আগে Marketing-এও ছিল)।

## ১০) গতি আর বড় catalogue (২০ হাজার – ৫০ হাজার product)
- **Products পাতা:** সব product একসাথে আনার বদলে server থেকে page ধরে আনে। Search, category, brand, stock, status আর sort সব server-এ হয়। উপরের সংখ্যাগুলো (All, Published, Draft, Low/Out of stock, Stock value) server গুনে দেয়। Edit চাপলে শুধু সেই product পুরোটা আসে।
- **Customers পাতা আর Stock Management:** একইভাবে page ধরে আসে, সংখ্যাগুলো server গোনে।
- **Dashboard-এর উপরের search:** server থেকে orders, products আর customers খোঁজে (প্রতিটার ৫টা করে)।
- **Product বাছাইয়ের ঘর** (Offers, order form, supplier purchase, stock adjust): টাইপ করলে খোঁজে। পুরো catalogue আর লোড করে না।
- Brands-এর product সংখ্যা database নিজে গোনে।
- নতুন database index যোগ হয়েছে: product (status, best seller, featured, flash sale), customer (মোট কেনাকাটা), stock-এর লেনদেন।
- Live chat-এর মেসেজ বা notification এলে পুরো website-এর cache আর মুছে যায় না।
- **পরীক্ষা:**
  - ২০,৬১৬টা product-এ Products পাতা ৩০–৯০ ms-এ আসে।
  - একসাথে ১০০ জন ভিজিটর দিয়ে ২০,০০০ request চালানো হয়েছে (home, shop, search, product page): একটাও error হয়নি। গড়ে প্রতি সেকেন্ডে ৩১৫টা request, ৯৯% request ১ সেকেন্ডের মধ্যে, memory প্রায় ৩৮০ MB।

## জেনে রাখুন
- **Database:** product table-এ ৪টা নতুন column (`seo_title`, `seo_description`, `seo_image`, `tags`) আর কয়েকটা index লাগে।
  - Server চালু হলে এগুলো নিজে থেকেই যোগ হয়।
  - Database user-এর অনুমতি না থাকলে `database/upgrade-v3.12.sql` phpMyAdmin-এ চালান।
  - পুরনো কোনো data বদলায় না।
- Upload-এর পর `npm install` আর `npm run build` করুন, তারপর app restart দিন।
- **নিজে থেকে কিছু বদলায় না:**
  - Home page Classic-ই থাকে।
  - Card design আগেরটাই থাকে।
  - বাটনের রং design-এর নিজেরটাই থাকে।
  - Font Public Sans-ই থাকে।
  - Pixel "On this website"-ই থাকে।

  নতুন কিছু চাইলে Dashboard থেকে বেছে নিন।
- **GTM ব্যবহার করলে:** GTM-এ Meta Pixel tag থাকলে System Configuration → Pixel-এ **Inside my GTM container** অবশ্যই বেছে নিন। এটাই double order বন্ধ করে।
