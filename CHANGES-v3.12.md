# v3.12.0 — কী কী নতুন / কী ঠিক হলো

## ১) Facebook ও Google দিয়ে Login (on/off সহ)
- কাস্টমার এখন Sign in ও Create account পেজে **"Google"** / **"Facebook"** বাটনে এক ট্যাপে login বা নতুন account খুলতে পারবে।
- চালু/বন্ধ: **Dashboard → System Configuration → Social Login**।
  - একটা মূল সুইচ আছে (বন্ধ করলে কোথাও বাটন দেখাবে না)।
  - Google ও Facebook-এর আলাদা সুইচ আছে।
  - Google-এর Client ID / Secret আর Facebook-এর App ID / Secret এখানে বসাবেন।
- কার্ডে **Redirect URI** লেখা থাকে। Copy চেপে সেটা Google Cloud / Meta for Developers-এ বসিয়ে দিন। তার আগে `.env`-এ `APP_URL=https://আপনার-ডোমেইন` থাকতে হবে।
- নিরাপত্তা:
  - Secret কখনো ওয়েবসাইটে পাঠানো হয় না।
  - শুধু কাস্টমার account এভাবে login করতে পারে, Dashboard account পারে না।
  - অন্য কেউ link বানিয়ে কাউকে নিজের account-এ ঢোকাতে পারে না।
  - কোনো e-mail দিয়ে আগে থেকেই password-ওয়ালা account থাকলে সেটার সাথে নিজে নিজে জোড়া লাগে না। তখন বলা হয় password দিয়ে login করতে।
  - Google/Facebook account-এর ফোন নম্বর প্রথম order থেকে নেওয়া হয়। ওই নম্বর দিয়ে অন্য কেউ নতুন password বসিয়ে account দখল করতে পারে না।

## ২) Category নিজে নিজে স্লাইড + New Arrival section
- Home-এর category সারি এখন একটা একটা করে মসৃণভাবে সরে, শেষে গিয়ে আবার শুরু থেকে চলে।
  - কেউ ছুঁলে, মাউস রাখলে বা স্ক্রল করলে থেমে থাকে।
  - চালু/বন্ধ ও গতি: **Website → Home Sections → Category slider**।
- Category-র ঠিক নিচে **New Arrivals** section।
  - **Website → Home Sections → New Arrival section**-এ product খুঁজে **Add** চাপুন, সরাতে **×** চাপুন। সাথে সাথে সেভ হয়।
  - Product edit পেজের "New Arrival" সুইচও একই কাজ করে।
  - চালু/বন্ধ, শিরোনাম, কয়টা দেখাবে, Grid/Slide ঠিক করা যায়।
  - "View All" চাপলে Shop পেজে শুধু New Arrival product দেখায়।
  - Shop-এর filter-এও "New Arrivals Only" আছে।

## ৩) PDF রিপোর্টের সমস্যাগুলো
- **Meta description:** আর কখনো খালি থাকে না। নিজে না লিখলে দোকানের নাম আর category থেকে বানিয়ে নেয়। নিজের লেখা দিতে চাইলে **Website → Branding & SEO**।
- **H1, পেজের লেখা, link:** server এখন প্রতিটা পেজে Google/Facebook-এর পড়ার মতো লেখা পাঠায়।
  - এতে থাকে H1, বিবরণ, category ও product-এর link আর দাম, এবং ফোন/WhatsApp/e-mail link।
  - কাস্টমার এটা দেখে না, ডিজাইনেও কোনো পরিবর্তন নেই।
- **Structured data:** দোকান (logo, ফোন, ঠিকানা, social link), সার্চ বক্স, product (দাম, stock, ছবি, review), breadcrumb আর blog যোগ হয়েছে।
- **Analytics / Pixel:**
  - GTM, GA4 আর Meta Pixel এখন page source-এ থাকে, তাই checker টুল এগুলো দেখতে পায়।
  - ID বসাতে হবে **System Configuration → Pixel / Tags**-এ। ID না থাকলে কিছু লোড হয় না।
  - Speed-এর জন্য script লোড হয় প্রথম scroll/tap-এর পর (অথবা ৫ সেকেন্ড পরে)। কোনো event হারায় না। Tags পেজের সুইচ দিয়ে এটা বন্ধ করা যায়।
- **Contact:** Home-এর নিচে নতুন **"Need help?"** block।
  - এতে আছে tap-to-call, WhatsApp, e-mail আর ছোট message form। Message যায় Dashboard → Messages-এ।
  - চালু/বন্ধ আর লেখা বদলানো: **Website → Home Sections**।
- **ছোট বাটন (tap target):** banner-এর dot বাটন বড় করা হয়েছে। লেখার রঙ পড়ার মতো গাঢ় করা হয়েছে (accessibility 100)।
- **ছবি লোড না হওয়া / বড় ছবি:** ছবি এখন প্রতিটা screen-এর মাপে ছোট WebP হয়ে যায়।
  - ৩ MB-র ছবি ফোনে প্রায় ২০–৬০ KB হয়।
  - Original ছবি যেমন ছিল তেমনই থাকে।
- **SPF / DMARC:** এগুলো ডোমেইনের DNS setting, app-এর ভিতরে নয়। কী বসাতে হবে তা README-তে লেখা আছে।

## ৪) Hostinger-এর ৩টা Vulnerability
- esbuild 0.18.20 / 0.25.12 সরানো হয়েছে, এখন esbuild **0.28.2** আর Vite **7**।
- drizzle-kit আর install হয় না (পুরনো esbuild এটার মাধ্যমেই ঢুকত)।
- `npm audit` → **0 vulnerabilities**।
- Node **20.19+ অথবা 22** লাগবে (Hostinger-এ Node version 22 বেছে নিন)।

## ৫) PageSpeed (Google-এর একই Lighthouse দিয়ে মাপা)
| পেজ | আগে | এখন |
|---|---|---|
| Home — Mobile | 66 | **95–97** |
| Home — Desktop | — | **100** |
| Product — Mobile / Desktop | 65 | **93 / 99** |
| Shop — Mobile / Desktop | 85 | **92 / 100** |
| SEO | 92 | **100** |
| Accessibility | 91 | **100** |
| Best practices | 100 | **100** |
| CLS (layout লাফানো) | 0.07–0.38 | **0** |

কীভাবে এই উন্নতি হলো:
- Home/Product/Shop পেজের প্রথম screen server থেকেই সাথে সাথে দেখায়।
- নিচের section-গুলো scroll করে কাছে এলে তবেই তৈরি হয়।
- Product পেজ, drawer আর footer প্রয়োজনের সময় লোড হয়।
- পেজের মোট ওজন **৬.৫ MB → ০.৪ MB**।

ফল ইন্টারনেট আর server-এর গতি অনুযায়ী কিছুটা ওঠানামা করে। upload করার পর pagespeed.web.dev-এ নিজে check করে নিন।

## ৬) Footer-এর উপরে Video section
- **Website → Home Sections → Videos (above the footer)**।
  - YouTube link বসান (সাধারণ link, youtu.be, Shorts সব চলে)। শিরোনাম YouTube থেকে নিজে চলে আসে।
  - তীর চিহ্ন দিয়ে ক্রম বদলানো যায়।
  - "View all videos" বাটনে নিজের channel-এর link দেওয়া যায়।
  - চালু/বন্ধ করা যায়।
- পেজের সাথে শুধু ছবি লোড হয়। Play চাপলে popup player খোলে, তাই speed কমে না।

## Database
- নতুন: `customers.google_id`, `customers.facebook_id` আর ৪টা index। App চালু হলে এগুলো নিজে যোগ হয়।
- নতুন database হলে `database/database.sql` import করুন (৫২টা table)।
- পুরনো দোকানে কিছু import লাগে না। Host যদি ALTER করতে না দেয়, তাহলে **`database/upgrade-v3.12.sql`** একবার চালান। দুইবার চালালেও কোনো error হয় না, কোনো data মোছে না।
- `/api/health` এখন আলাদা করে বলে "user/password ভুল" নাকি "user-কে database-এ যোগ করা হয়নি"।

## Upload করার পর যা করবেন
1. Hostinger-এ Node.js version 22 বেছে নিন।
2. `.env`-এ `APP_URL=https://আপনার-ডোমেইন` দিন।
3. Redeploy করুন।
4. `/api/health` খুলে দেখুন `"status":"ok"` দেখাচ্ছে কিনা।
5. Website → Home Sections-এ New Arrival product, video আর contact block ঠিক করুন।
6. System Configuration → Social Login, Pixel আর Tags-এ নিজের key ও ID বসান।
