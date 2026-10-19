/**
 * Landing page templates. Both templates use the same editable content shape,
 * so the dashboard editor is one form and switching template keeps the text.
 * Shared by the server (one-click create) and the dashboard (reset section).
 */

export type LandingTemplateId = 'fashion' | 'organic';

export interface LandingContent {
  theme: { primary: string; accent: string; background: string };
  topBar: { enabled: boolean; text: string };
  hero: {
    badge: string;
    title: string;
    highlight: string;
    subtitle: string;
    image: string;
    ctaText: string;
    bullets: string[];
  };
  video: { enabled: boolean; title: string; url: string };
  features: { enabled: boolean; title: string; items: Array<{ title: string; text: string }> };
  gallery: { enabled: boolean; title: string; images: string[] };
  benefits: { enabled: boolean; title: string; items: string[] };
  offer: { enabled: boolean; title: string; text: string; endsAt: string };
  reviews: { enabled: boolean; title: string; images: string[]; items: Array<{ name: string; text: string; rating: number }> };
  faq: { enabled: boolean; title: string; items: Array<{ q: string; a: string }> };
  checkout: {
    title: string;
    subtitle: string;
    productsTitle: string;
    buttonText: string;
    nameLabel: string;
    phoneLabel: string;
    addressLabel: string;
    noteEnabled: boolean;
    notePlaceholder: string;
    codText: string;
  };
  footer: { text: string; phone: string; whatsapp: string };
  pixel: { metaPixelId: string };
  seo: { title: string; description: string; image: string };
}

export interface LandingProductLink {
  productId: number;
  /** Options offered for a variable product; empty = every active option */
  variationIds?: number[];
  /** Ticked when the page opens */
  preselect?: boolean;
  qty?: number;
}

export interface LandingShippingConfig {
  mode: 'store' | 'custom' | 'free';
  charges: Record<string, number | string | null>;
  freeMinQuantity: number | null;
  freeMinSubtotal: number | null;
}

export const LANDING_TEMPLATES: Array<{ id: LandingTemplateId; name: string; description: string; swatch: [string, string] }> = [
  { id: 'fashion', name: 'Fashion — Teal', description: 'Clean and modern. Made for clothing, shoes, gadgets and lifestyle products.', swatch: ['#0d9488', '#f59e0b'] },
  { id: 'organic', name: 'Organic — Honey', description: 'Warm and natural. Made for honey, food, oils, herbal and home-made products.', swatch: ['#d97706', '#15803d'] },
];

const COMMON_CHECKOUT = {
  productsTitle: 'প্রোডাক্ট নির্বাচন করুন',
  nameLabel: 'আপনার নাম',
  phoneLabel: 'মোবাইল নাম্বার',
  addressLabel: 'সম্পূর্ণ ঠিকানা',
  noteEnabled: false,
  notePlaceholder: 'অতিরিক্ত কোনো তথ্য (ঐচ্ছিক)',
  codText: 'পণ্য হাতে পেয়ে টাকা পরিশোধ করুন',
};

export function defaultLandingContent(template: LandingTemplateId, title = ''): LandingContent {
  if (template === 'organic') {
    return {
      theme: { primary: '#d97706', accent: '#15803d', background: '#fffbeb' },
      topBar: { enabled: true, text: 'খাঁটি পণ্যের নিশ্চয়তা — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি' },
      hero: {
        badge: '১০০% প্রাকৃতিক',
        title: title || 'সুন্দরবনের খাঁটি মধু',
        highlight: 'সরাসরি মৌচাক থেকে আপনার ঘরে',
        subtitle: 'কোনো ভেজাল, চিনি বা কেমিক্যাল ছাড়া সংগ্রহ করা খাঁটি মধু। পুরো পরিবারের জন্য নিশ্চিন্তে বেছে নিন।',
        image: '',
        ctaText: 'এখনই অর্ডার করুন',
        bullets: ['ল্যাব টেস্টেড ও ভেজালমুক্ত', 'চিনি ছাড়া প্রাকৃতিক স্বাদ', 'পণ্য হাতে পেয়ে টাকা দিন'],
      },
      video: { enabled: false, title: 'ভিডিওতে দেখে নিন', url: '' },
      features: {
        enabled: true,
        title: 'কেন আমাদের পণ্য বেছে নেবেন?',
        items: [
          { title: 'সরাসরি সংগ্রহ', text: 'মধ্যস্বত্বভোগী ছাড়া সরাসরি উৎস থেকে সংগ্রহ করা।' },
          { title: 'ভেজালমুক্ত', text: 'প্রতিটি ব্যাচ পরীক্ষা করে তবেই প্যাক করা হয়।' },
          { title: 'নিরাপদ প্যাকেজিং', text: 'ফুড-গ্রেড বোতলে লিক-প্রুফ প্যাকিং।' },
          { title: 'দ্রুত ডেলিভারি', text: 'ঢাকায় ১-২ দিন, ঢাকার বাইরে ২-৩ দিনে।' },
        ],
      },
      gallery: { enabled: true, title: 'আমাদের পণ্য', images: [] },
      benefits: {
        enabled: true,
        title: 'যেভাবে ব্যবহার করবেন',
        items: ['সকালে কুসুম গরম পানির সাথে', 'চা বা লেবু পানিতে চিনির বদলে', 'রুটি, পিঠা ও নাস্তার সাথে', 'শিশু থেকে বয়স্ক সবার জন্য'],
      },
      offer: { enabled: true, title: 'সীমিত সময়ের অফার', text: 'অফার চলাকালীন অর্ডারে বিশেষ মূল্য — স্টক শেষ হওয়ার আগেই অর্ডার করুন।', endsAt: '' },
      reviews: {
        enabled: true,
        title: 'কাস্টমারদের মতামত',
        images: [],
        // Real customer words and screenshots only — added by the owner
        items: [],
      },
      faq: {
        enabled: true,
        title: 'সচরাচর জিজ্ঞাসা',
        items: [
          { q: 'কিভাবে অর্ডার করবো?', a: 'নিচের ফর্মে নাম, মোবাইল নাম্বার ও ঠিকানা দিয়ে "অর্ডার কনফার্ম করুন" চাপুন। আমরা ফোন করে কনফার্ম করবো।' },
          { q: 'টাকা কখন দিতে হবে?', a: 'পণ্য হাতে পেয়ে ডেলিভারি ম্যানকে টাকা দেবেন।' },
          { q: 'পণ্য খারাপ হলে কি করবো?', a: 'ডেলিভারির সময় পণ্য দেখে নিন। কোনো সমস্যা থাকলে সাথে সাথে আমাদের জানান।' },
        ],
      },
      checkout: {
        ...COMMON_CHECKOUT,
        title: 'অর্ডার করতে নিচের তথ্যগুলো দিন',
        subtitle: 'অর্ডার কনফার্ম করতে আমাদের প্রতিনিধি আপনাকে কল করবেন',
        buttonText: 'অর্ডার কনফার্ম করুন',
      },
      footer: { text: 'যেকোনো প্রয়োজনে কল করুন', phone: '', whatsapp: '' },
      pixel: { metaPixelId: '' },
      seo: { title: '', description: '', image: '' },
    };
  }
  return {
    theme: { primary: '#0d9488', accent: '#f59e0b', background: '#f0fdfa' },
    topBar: { enabled: true, text: 'সারা বাংলাদেশে হোম ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন' },
    hero: {
      badge: 'নতুন কালেকশন',
      title: title || 'প্রিমিয়াম কটন টি-শার্ট',
      highlight: 'আরামদায়ক, টেকসই, স্টাইলিশ',
      subtitle: '১০০% কম্বড কটন কাপড়। বারবার ধোয়ার পরও রং ও ফিটিং ঠিক থাকে — প্রতিদিনের ব্যবহারের জন্য পারফেক্ট।',
      image: '',
      ctaText: 'এখনই অর্ডার করুন',
      bullets: ['প্রিমিয়াম কোয়ালিটি কাপড়', 'M থেকে XXL সব সাইজ', 'পণ্য হাতে পেয়ে টাকা দিন'],
    },
    video: { enabled: false, title: 'ভিডিওতে দেখুন', url: '' },
    features: {
      enabled: true,
      title: 'কেন আমাদের থেকে কিনবেন?',
      items: [
        { title: 'প্রিমিয়াম কাপড়', text: 'নরম, আরামদায়ক ও ঘাম শোষণকারী।' },
        { title: 'পারফেক্ট ফিটিং', text: 'সব সাইজের জন্য মাপমতো কাটিং।' },
        { title: 'রং নষ্ট হয় না', text: 'বারবার ধোয়ার পরও নতুনের মতো।' },
        { title: 'দ্রুত ডেলিভারি', text: 'ঢাকায় ১-২ দিন, ঢাকার বাইরে ২-৩ দিনে।' },
      ],
    },
    gallery: { enabled: true, title: 'প্রোডাক্টের ছবি', images: [] },
    benefits: {
      enabled: true,
      title: 'অর্ডারের আগে জেনে নিন',
      items: ['সাইজ মিলিয়ে অর্ডার করুন — সাইজ চার্ট দেওয়া আছে', 'ডেলিভারির সময় পণ্য চেক করে নিন', 'সাইজ না মিললে সহজ এক্সচেঞ্জ', 'অর্ডার কনফার্মেশনের জন্য কল রিসিভ করুন'],
    },
    offer: { enabled: true, title: 'অফার সীমিত সময়ের জন্য', text: 'একসাথে একাধিক পিস নিলে ডেলিভারি চার্জ ফ্রি!', endsAt: '' },
    reviews: {
      enabled: true,
      title: 'আমাদের কাস্টমাররা যা বলছেন',
      images: [],
      // Real customer words and screenshots only — added by the owner
      items: [],
    },
    faq: {
      enabled: true,
      title: 'সচরাচর জিজ্ঞাসা',
      items: [
        { q: 'কিভাবে অর্ডার করবো?', a: 'প্রোডাক্ট ও সাইজ বেছে নিয়ে নিচের ফর্মটি পূরণ করুন। আমরা কল করে অর্ডার কনফার্ম করবো।' },
        { q: 'ডেলিভারি চার্জ কত?', a: 'ডেলিভারি চার্জ চেকআউটে দেখানো আছে — এলাকা বেছে নিলেই মোট টাকা দেখতে পাবেন।' },
        { q: 'সাইজ না মিললে?', a: 'ডেলিভারির সময় ট্রাই করে দেখুন, না মিললে এক্সচেঞ্জ করে দেওয়া হবে।' },
      ],
    },
    checkout: {
      ...COMMON_CHECKOUT,
      title: 'অর্ডার করতে নিচের ফর্মটি পূরণ করুন',
      subtitle: 'সঠিক তথ্য দিন — অর্ডার কনফার্ম করতে আমরা কল করবো',
      buttonText: 'অর্ডার কনফার্ম করুন',
    },
    footer: { text: 'যেকোনো প্রয়োজনে কল করুন', phone: '', whatsapp: '' },
    pixel: { metaPixelId: '' },
    seo: { title: '', description: '', image: '' },
  };
}

/** Fills anything missing (older pages, partial saves) from the template defaults */
export function normalizeLandingContent(raw: unknown, template: LandingTemplateId): LandingContent {
  const base = defaultLandingContent(template);
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  if (!value || typeof value !== 'object') return base;
  const out: any = { ...base };
  for (const key of Object.keys(base) as Array<keyof LandingContent>) {
    const section = value[key];
    if (section && typeof section === 'object' && !Array.isArray(section)) out[key] = { ...(base as any)[key], ...section };
  }
  return out as LandingContent;
}

export const DEFAULT_LANDING_SHIPPING: LandingShippingConfig = { mode: 'store', charges: {}, freeMinQuantity: null, freeMinSubtotal: null };

/** YouTube / Facebook / direct video link → something an <iframe>/<video> can play */
export function videoEmbed(url: string): { kind: 'youtube' | 'facebook' | 'file'; src: string; vertical?: boolean } | null {
  const value = String(url || '').trim();
  if (!value) return null;
  const yt =
    value.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i) ||
    value.match(/youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{6,20})/i);
  if (yt) {
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1&playsinline=1`, vertical: /shorts\//i.test(value) };
  }
  if (/(facebook\.com|fb\.watch)\//i.test(value)) {
    return {
      kind: 'facebook',
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false&width=734`,
      vertical: /\/reel\//i.test(value),
    };
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(value) || value.startsWith('/uploads/')) return { kind: 'file', src: value };
  return null;
}
