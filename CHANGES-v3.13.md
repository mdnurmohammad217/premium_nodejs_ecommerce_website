# v3.13 — কী কী নতুন

## ১) নতুন Theme: Home page আর Single product page-এর "Glow" design
- **Dashboard → Website → Themes**-এ দুইটা বাছাই আছে, আলাদা আলাদা:
  - **Home page:** Classic অথবা Glow
  - **Single product page:** Classic অথবা Glow
- **Classic** = আপনার এখনকার design। এর কিছুই বদলানো হয়নি, নষ্টও হয়নি। নতুন install বা upgrade-এর পর website Classic-এই থাকে, আপনি না বদলানো পর্যন্ত।
- Glow বেছে **Save Themes** চাপলে সাথে সাথে website-এ চলে আসে। আবার Classic বাছলে আগের design ফিরে আসে।

### Glow home page — ১৮টা section, প্রতিটা on/off করা যায়
- Section-গুলো: Hero banner, Categories, Promo cards (হালকা + গাঢ় সবুজ card), **Our Best Sellers Products** (category tab সহ), Countdown offer (দুই পাশে ছবি), **Deals of the Day**, Weekly deals-এর চওড়া banner, **New Arrival** (লম্বা ছবি + ৩×২ product), Flash sale, All products, Category অনুযায়ী product row, Brands, Features, Reviews, Blog, **FAQ**, "Need help?" contact card, Videos।
- **Themes → Glow home page sections**-এ প্রতিটা section-এর পাশে:
  - **On/off switch:** বন্ধ করলে website-এ দেখায় না।
  - **↑ ↓ বাটন:** section-গুলো উপরে-নিচে সাজানো যায়।
  - **Edit:** title, ছোট লেখা, বাটনের লেখা, link, ছবি (Media Library থেকে), countdown কখন শেষ হবে, FAQ-এর প্রশ্ন-উত্তর সব বদলানো যায়।
  - **Reset** চাপলে সব section আবার শুরুর মতো হয়ে যায়।
- Title-এর কিছু শব্দ সোনালি রঙে দেখাতে চাইলে শব্দগুলো `*` দিয়ে ঘিরে দিন। যেমন: `Our *Best Sellers* Products`
- Countdown-এর শেষ সময় খালি রাখলে প্রতিদিন রাত ১২টায় নতুন করে শুরু হয়। পার হয়ে যাওয়া তারিখ দিলে section নিজে থেকে লুকিয়ে যায়, তাই "00:00:00" কখনো দেখায় না।

### Glow product page
- বড় gallery, দুই পাশে গোল তীর বাটন, নিচে ছোট ছবি। Video থাকলে সেটাও দেখায়।
- Category, নাম, **In Stock** pill, তারা + review সংখ্যা, সোনালি দাম + কাটা পুরনো দাম।
- Size/রঙ ইত্যাদি **pill বাটন**, qty-এর − / + বাটন, **Add To Cart** (সবুজ), **Buy Now** (সোনালি), wishlist-এর হার্ট।
- Call / WhatsApp বাটন, ছোট trust row (Cash on delivery, Fast delivery, Easy returns — লেখা বদলানো যায়)।
- **SKU, Tags, Share** (Facebook, X, Pinterest, WhatsApp, Copy link)।
- **Themes → Glow product page**-এ প্রতিটা অংশ on/off করা যায়।
- Phone-এ নিচে আগের মতো Add to Cart / Buy Now bar থাকে।

### Glow রঙ
- Glow আপনার brand colour (System Configuration → Theme & Colors) ব্যবহার করে, সাথে একটা দ্বিতীয় **Accent colour** (দাম, রঙিন শব্দ, Buy Now)। Default সোনালি `#B8914A`।
- ছবির মতো হুবহু গাঢ় সবুজ চাইলে **"Also set my brand colour to Glow deep green"** টিক দিয়ে Save করুন। পরে System Configuration থেকে আবার বদলানো যায়।
- হালকা রঙ বাছলেও ছোট লেখা নিজে থেকে একটু গাঢ় হয়, যাতে পড়া যায়।

### নতুন Product card design: Glow
- **Website → Product Card**-এ "Glow" design যোগ হয়েছে: "% off" pill, mouse রাখলে পাশে হার্ট / বড় করে দেখা / ব্যাগ icon, flash sale-এ countdown, category + rating, পুরো চওড়া Buy Now।
- Glow home page নিজে থেকেই এই card ব্যবহার করে। Classic home-এ চাইলে Product Card থেকে বেছে নিতে পারেন।

## ২) Mobile-এ আরো সুন্দর (Responsiveness)
- Glow home, Glow product page, shop, cart, checkout ৩২০px (ছোট iPhone SE) থেকে ১৫৩৬px পর্যন্ত **৮টা মাপে** পরীক্ষা করা হয়েছে, ৫টা ভাষাতেই। কোথাও পাশে scroll বা কাটা লেখা নেই।
- Phone-এ section-গুলো এক কলামে আসে। Product ২টা করে পাশাপাশি থাকে, বাটন আঙুলে চাপার মতো বড় (৪৪px+)।
- Phone-এ promo card আর banner-এর লম্বা লেখা আর countdown-এর দুই পাশের ছবি লুকানো থাকে, যাতে page ছোট আর হালকা থাকে এবং তাড়াতাড়ি খোলে।
- Dashboard-এর card-এর উপরের Save বাটন phone-এ এখন লেখার নিচে চলে যায়, তাই লেখা চেপে যায় না।

## ৩) Category design: ৪টা design
- **Dashboard → Website → Home Sections → Categories → Design**:
  - **Tiles:** চারকোনা ছবি, নিচে নাম (আগের design, default)
  - **Circles:** গোল ছবি, চারপাশে রিং
  - **Cards:** লম্বা ছবি, ছবির উপরেই নাম + "Shop now"
  - **Chips:** ছোট pill, phone-এ খুব কম জায়গা নেয়
- প্রতিটা design **Slide** আর **Grid** দুইভাবেই চলে (v3.12.2-এর মতো phone-এ ২/৩/৪টা করে)।
- বাছাইয়ের সময় প্রতিটার ছোট ছবি দেখা যায়।

## ৪) Website-এ ভাষা: English, বাংলা, हिन्दी, العربية, Français
- Default **English**। কাস্টমার নিজে ভাষা বদলাতে পারে, পরের বার এলেও সেই ভাষাই থাকে।
- ভাষা বদলানোর বাটন:
  - **Header-এ** গ্লোব icon-এর pill (tablet/computer)। চাপলে প্রতিটা ভাষা নিজের লিপিতে দেখায় (বাংলা, हिन्दी, العربية …), তাই যে ভাষাতেই page থাকুক কাস্টমার নিজের ভাষা চিনতে পারে।
  - **Phone-এর side menu-তে** একদম উপরে ভাষার chip।
  - **Footer-এর** নিচে ভাষার নাম।
- **Dashboard → Website → Languages**:
  - পুরো switcher on/off।
  - কোন কোন ভাষা দেখাবে, কোনটা default, কোন ক্রমে।
  - Header / Phone menu / Footer — কোথায় কোথায় দেখাবে।
  - Link দিয়েও ভাষা খোলা যায়, যেমন `yourshop.com/?lang=bn` (Facebook ad-এ কাজে লাগে)।
- **Arabic** ডান থেকে বামে (RTL) পুরো page উল্টে সাজায়, প্রথম লোডেই।
- হিন্দি আর আরবির জন্য সুন্দর font (Noto Sans) যোগ হয়েছে, শুধু সেই ভাষা খুললে load হয়।
- কী অনুবাদ হয়: website-এর নিজের সব লেখা — menu, বাটন, cart, checkout, product page, review, message, error ইত্যাদি (প্রতি ভাষায় ৬৫০+ লেখা)।
- কী অনুবাদ হয় না: product-এর নাম/বিবরণ আর Dashboard-এ আপনি নিজে যা লিখেছেন — সেগুলো যেমন লিখেছেন তেমনই দেখায়।
- **Dashboard আর POS সবসময় English** থাকে।

## ৫) আগে যে সমস্যাগুলো পেয়েছিলাম — ঠিক করা হলো
- **পুরনো client-এর নাম সরানো হয়েছে:** README, package.json, report file, database backup-এর header, email settings-এর placeholder থেকে। এখন সবখানে "Topper IT" / "Your shop name"।
- **server.ts ছোট করা হয়েছে:** ১৭,২৬০ লাইন থেকে ১০,১০৮ লাইন। Email, SMS, Returns, Couriers, Fraud checker, Media library, Expenses, Wholesale accounts ইত্যাদি ১৬টা অংশ `src/server/routes/` folder-এ আলাদা file-এ গেছে।
  - সব API আগের মতোই কাজ করে। ৩৩২টা route আগের ঠিক একই ক্রমে বসে, পরীক্ষা করে মিলিয়ে দেখা হয়েছে।
- **html2canvas দুইবার load হতো**, এখন একবার। Invoice-এর PDF download আগের মতোই কাজ করে, কাস্টমারের download কিছুটা কমেছে।

## জেনে রাখুন
- Upload করার পর একবার **`npm install`** চালাবেন (হিন্দি আর আরবি font-এর ২টা নতুন package আছে), তারপর **`npm run build`**।
- **Database-এ কোনো পরিবর্তন নেই।** নতুন setting-গুলো প্রথম Save-এর সময় নিজে তৈরি হয়।
- Product page-এ বিবরণের default শিরোনাম আগে বাংলায় "পণ্যের বিবরণ" লেখা থাকত। এখন এটা "Product details" এবং কাস্টমারের বাছা ভাষায় দেখায় (বাংলা বাছলে "পণ্যের বিবরণ")। নিজের শিরোনাম দেওয়া থাকলে সেটাই দেখায়।
- Staff-কে Themes/Languages বদলানোর অনুমতি দিতে **Staff → Permissions → Website** দিন।
