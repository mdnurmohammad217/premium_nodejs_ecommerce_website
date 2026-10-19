# v3.12.1 — কী ঠিক হলো

## ১) Color theme এখন ঠিকমতো কাজ করে
- **Dashboard → System Configuration → Theme & Colors**-এ যে রঙ বাছবেন, website-এ ঠিক সেই রঙই দেখাবে।
  - আগে রঙটা নিজে নিজে একটু গাঢ় হয়ে যেত, তাই মনে হতো রঙ বদলাচ্ছে না।
- রঙ বাছলে Dashboard-এ সাথে সাথে দেখা যায়। **Save Theme** চাপলে website, Dashboard আর POS সবখানে বসে যায়।
  - Save হলে সবুজ বার্তা আসে। Save না হলে কারণসহ লাল বার্তা আসে।
- **"Your own colour"** অংশটা নতুন করে সাজানো হয়েছে।
  - **Brand colour:** button, link, দাম, icon, badge সব এই রঙে হয়।
  - **Button hover colour:** mouse রাখলে button-এর রঙ। Brand colour বাছলে এটা নিজে ঠিক হয়ে যায়।
  - নিচে **Preview** আছে, তাই Save করার আগেই দেখা যায় কেমন লাগবে।
  - আগের "Secondary" আর "Accent" রঙ website-এর কোথাও ব্যবহার হতো না, তাই সরিয়ে দেওয়া হয়েছে।
- হলুদ বা গোলাপির মতো হালকা রঙ বাছলে button-এর লেখা নিজে থেকে কালো হয়ে যায়, যাতে পড়া যায়।
- রঙের কোড অর্ধেক লিখলে (যেমন `#ea`) কিছু নষ্ট হয় না। পুরো কোড না লেখা পর্যন্ত আগের রঙই থাকে।
- PageSpeed-এর Accessibility-তে পুরো 100 পেতে চাইলে **"Use a slightly darker shade"** বাটন চাপুন। এটা রঙটাকে সামান্য গাঢ় করে, যাতে button-এর সাদা লেখা আরো স্পষ্ট হয়।
  - না চাপলেও website ঠিকঠাক চলে, শুধু Accessibility score কয়েক পয়েন্ট কম আসে (৯০-এর উপরেই থাকে)।

## ২) Hero banner আর সাদা হয়ে যায় না
- কিছুক্ষণ চলার পর banner সাদা হয়ে যেত। এটা হতো যেসব computer/phone-এ animation কমানো থাকে (Windows/Android-এর "reduce motion")।
- এখন banner প্রতিবার ঠিক জায়গায় ফিরে আসে, যত সময়ই চলুক।
- পরীক্ষা: animation চালু ও বন্ধ দুইভাবেই ৩০+ সেকেন্ড চালিয়ে দেখা হয়েছে, সবসময় ছবি দেখা যায়।

## ৩) Checkout-এ জেলা আর থানা খোঁজা যায়
- জেলা/থানা বাটনে চাপলে একটা list খোলে, উপরে **search box** থাকে।
  - ইংরেজি বা বাংলা দুইভাবেই লেখা যায় (যেমন `dha` বা `ঢাকা`, `mirpur` বা `মিরপুর`)।
  - যে নাম লেখার শুরুতে মেলে সেটা আগে আসে।
- কেউ না লিখে শুধু scroll করেও বেছে নিতে পারে।
- Keyboard-এ ↑ ↓ চেপে বাছা, Enter চেপে নেওয়া আর Esc চেপে বন্ধ করা যায়।
- জেলা বদলালে থানা নিজে খালি হয়ে যায়, যাতে ভুল থানা থেকে না যায়।
- Landing page-এর order form-এও একই সুবিধা আছে।

## ৪) Admin/Staff-এর জন্য My Account আর Track Order নেই
- Admin বা staff login থাকলে header-এর menu-তে শুধু **Dashboard** আর **Sign Out** দেখায়।
  - Pill-এ লেখা থাকে "Admin Panel" (staff হলে "Staff Panel")।
- কাস্টমার আগের মতোই **My Account**, **Track Order** আর **Sign Out** দেখে।
- Phone-এর নিচের bar-এ admin/staff "Account"-এর জায়গায় **Dashboard** পায়। "Track" বাটন তাদের জন্য দেখায় না।
- Phone-এর side menu-তে admin/staff "My Account"-এর বদলে **Dashboard** পায়।
- Menu Builder-এ বানানো website-এর মূল menu সবার জন্য একই থাকে।

## আরও যা ঠিক করা হলো
- **Tablet-এ menu-র সমস্যা:** tablet মাপের screen-এ (৭৬৮–১০২৩px) account menu-র লেখায় চাপলে কিছু হতো না। এখন ঠিক আছে।
- **Footer:** footer-এর শিরোনামের heading level ঠিক করা হয়েছে (SEO/Accessibility)। দেখতে কোনো পরিবর্তন নেই।
- **Dashboard-এ হালকা রঙ:** হালকা brand colour বাছলেও Dashboard আর POS-এর লেখা পড়া যায়।

## Update করার নিয়ম
- Database-এ কোনো পরিবর্তন নেই, তাই কিছু import করতে হবে না।
- নতুন file upload করে **Redeploy** করুন।
- তারপর Theme & Colors-এ একবার রঙ বেছে **Save Theme** চাপুন।
