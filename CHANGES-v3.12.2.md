# v3.12.2 — কী কী নতুন

## ১) Chat widget: ১টা থাকলে সরাসরি, বেশি থাকলে list
- **Dashboard → Marketing & Tools → Chat Widget**-এ যতগুলো contact option চালু (Show টিক দেওয়া) আছে, সেই অনুযায়ী বাটন নিজে বদলে যায়।
- **২টা বা বেশি চালু থাকলে** (যেমন WhatsApp + Messenger + Call):
  - ভাসমান বাটনে চাপলে list খোলে।
  - কাস্টমার সেখান থেকে যেটা চায় বেছে নেয় (আগের মতোই)।
- **শুধু ১টা চালু থাকলে** (যেমন শুধু WhatsApp):
  - ভাসমান বাটনটাই সেই app-এর বাটন হয়ে যায় (WhatsApp-এর সবুজ রঙ আর icon)।
  - চাপলেই সরাসরি WhatsApp খোলে, মাঝে কোনো list আসে না।
  - Messenger, Call, Telegram সহ যেকোনো একটার জন্যও একই নিয়ম।
- ১টা চালু থাকলে Greeting bubble, "Text beside the button" আর business hours-এর সবুজ/ধূসর বিন্দু আগের মতোই কাজ করে। Bubble-এ চাপলেও সরাসরি সেই app খোলে।
- Dashboard-এর Contact options-এর উপরে লেখা থাকে এখন কোন অবস্থা চলছে (১টা = সরাসরি, ২+টা = list)। Live preview-তেও সেটা দেখা যায়।
- "Button colour" আর "Button icon" শুধু ২টা বা বেশি option থাকলে ব্যবহার হয়। ১টা থাকলে বাটন সেই app-এর নিজের রঙ আর icon নেয়।

## ২) Category: Slide অথবা Grid
- **Dashboard → Website → Home Sections → Categories → Layout**-এ দুইটা বাছাই আছে:
  - **Slide:** আগের মতো এক সারি, নিজে নিজে সরে। "Slide by itself" আর Speed সেটিং আগের মতোই আছে।
  - **Grid:** সব featured category সারির পর সারি, একটার নিচে আরেকটা।
- Grid-এ কয়টা করে দেখাবে তা বেছে নেওয়া যায়:
  - **Per row on phones:** ২ / ৩ / ৪টা করে (ডিফল্ট **২টা**)।
  - **Per row on computers:** ৪ / ৫ / ৬ / ৮টা করে (ডিফল্ট **৬টা**)।
  - Tablet নিজে মাঝামাঝি একটা মাপ নেয়।
- Grid-এ ছবি প্রতিটা ঘরের মাপে আসে, তাই ২টা করে দেখালেও ছবি ঝাপসা হয় না।
- পুরনো দোকানে কিছু না বদলালে Slide-ই থাকে, তাই আপডেটের পর website আগের মতোই দেখায়।

## ৩) Header menu-র লেখা ছোট
- Header-এর menu bar-এর লেখা (Home, All Products, Offers …) **16px থেকে 14.5px** করা হয়েছে।
- Menu-র icon-ও সেই অনুযায়ী একটু ছোট (18px থেকে 16px)।
- Marketplace আর Transparent header-এর এক লাইনের menu-তে লেখা 14.5px থেকে 13.5px।
- ৪টা header design-এই এই পরিবর্তন হয়েছে। Menu-র উচ্চতা, রঙ আর hover আগের মতোই আছে।
- Dropdown আর mega menu-র লেখা বদলানো হয়নি।

## যা যা টেস্ট করা হয়েছে
- TypeScript check-এ কোনো error নেই। `npm run build` সফল। `npm audit`-এ ০টা vulnerability।
- Build করা server নতুন MariaDB database-এ চালিয়ে দেখা হয়েছে (৫২টা table, `/api/health` ঠিক আছে)।
- **Chat:**
  - ৩টা option চালু থাকলে বাটনে চাপলে ৩টার list খোলে।
  - ১টা চালু থাকলে (অন্যটা Show বন্ধ) বাটনটা WhatsApp হয়ে যায়, link সরাসরি `wa.me/8801…`।
  - ফোন, tablet আর computer তিন মাপেই দেখা হয়েছে।
- **Category Grid:** ফোনে ২টা করে (৫ সারি), tablet-এ ৪টা, computer-এ ৬টা করে। Slide-এ ফিরলে আগের মতো সরে।
- Dashboard-এর Home Sections আর Chat Widget page খুলে দেখা হয়েছে। Browser console-এ কোনো error নেই।
- Project-এর নিজের responsive check চালানো হয়েছে: ৮টা screen size-এ (320px থেকে 1536px) সব page চেক হয়েছে, কোথাও পাশে স্ক্রল হয় না।

## Update করার নিয়ম
- Database-এ কোনো পরিবর্তন নেই, কিছু import করতে হবে না।
- সার্ভারের পুরনো `.env` রেখে দিন (zip-এ `.env` নেই)।
- নতুন file upload করুন, তারপর `npm install` → `npm run build` → Redeploy/Restart।
- Category Grid চাইলে: Website → Home Sections → Categories → **Grid** বাছুন, কয়টা করে দেখাবে ঠিক করুন, তারপর **Save Home Sections** চাপুন।
