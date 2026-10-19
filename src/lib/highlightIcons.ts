import {
  Gem,
  Leaf,
  Flower2,
  Gift,
  Sparkles,
  ShieldCheck,
  Truck,
  BadgeCheck,
  Heart,
  Star,
  Shirt,
  Droplets,
  Sun,
  Award,
  Recycle,
  Clock,
  ThumbsUp,
  Package,
} from 'lucide-react';

/**
 * v3.9 — icons a product's description highlights can use (Products → edit →
 * General → Highlights). Kept to a small, recognisable set so every product
 * page looks consistent.
 */
export const HIGHLIGHT_ICONS: Record<string, { icon: typeof Gem; label: string }> = {
  Gem: { icon: Gem, label: 'Premium / diamond' },
  Leaf: { icon: Leaf, label: 'Light / natural' },
  Flower2: { icon: Flower2, label: 'Design / flower' },
  Gift: { icon: Gift, label: 'Gift / festival' },
  Sparkles: { icon: Sparkles, label: 'Sparkle / new' },
  ShieldCheck: { icon: ShieldCheck, label: 'Guarantee' },
  BadgeCheck: { icon: BadgeCheck, label: 'Original / verified' },
  Award: { icon: Award, label: 'Best quality' },
  Truck: { icon: Truck, label: 'Fast delivery' },
  Heart: { icon: Heart, label: 'Loved' },
  Star: { icon: Star, label: 'Top rated' },
  Shirt: { icon: Shirt, label: 'Clothing / fabric' },
  Droplets: { icon: Droplets, label: 'Washable / liquid' },
  Sun: { icon: Sun, label: 'Summer / fresh' },
  Recycle: { icon: Recycle, label: 'Eco friendly' },
  Clock: { icon: Clock, label: 'Long lasting' },
  ThumbsUp: { icon: ThumbsUp, label: 'Recommended' },
  Package: { icon: Package, label: 'Packaging' },
};

export interface ProductHighlight {
  icon: string;
  text: string;
}

export const parseHighlights = (raw: any): ProductHighlight[] => {
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list)
      ? list
          .map((item: any) => ({ icon: String(item?.icon || 'Sparkles'), text: String(item?.text || '') }))
          .filter((item: ProductHighlight) => item.text.trim())
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
};

export type OptionDisplayMode = 'text' | 'image' | 'color';

export const parseOptionDisplay = (raw: any): Record<string, OptionDisplayMode> => {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, OptionDisplayMode> = {};
    for (const [name, mode] of Object.entries(value)) {
      if (mode === 'text' || mode === 'image' || mode === 'color') out[name] = mode;
    }
    return out;
  } catch {
    return {};
  }
};

/** Common colour names (English and Bengali) → a swatch colour */
const COLOR_WORDS: Record<string, string> = {
  red: '#dc2626', লাল: '#dc2626', maroon: '#7f1d1d', blue: '#2563eb', নীল: '#2563eb', navy: '#1e3a8a', 'navy blue': '#1e3a8a',
  'sky blue': '#38bdf8', green: '#16a34a', সবুজ: '#16a34a', 'olive': '#556b2f', black: '#111827', কালো: '#111827',
  white: '#ffffff', সাদা: '#ffffff', 'off white': '#f5f0e6', cream: '#f3e8d0', yellow: '#facc15', হলুদ: '#facc15',
  orange: '#f97316', কমলা: '#f97316', pink: '#ec4899', গোলাপি: '#ec4899', purple: '#7c3aed', বেগুনি: '#7c3aed',
  violet: '#7c3aed', brown: '#78350f', বাদামি: '#78350f', grey: '#6b7280', gray: '#6b7280', ধূসর: '#6b7280',
  golden: '#d4a017', gold: '#d4a017', silver: '#c0c0c0', beige: '#d6c5a3', teal: '#0d9488', magenta: '#c026d3',
  coffee: '#6f4e37', mint: '#a7f3d0', peach: '#fbcfb5', lavender: '#c4b5fd', 'light blue': '#93c5fd', 'dark green': '#14532d',
};

/** A colour for an option value: a #hex, rgb() or a known colour name */
export function swatchColor(value: string): string | null {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^rgba?\(/i.test(text)) return text;
  const key = text.toLowerCase();
  return COLOR_WORDS[key] || COLOR_WORDS[key.replace(/\s*colou?r$/, '')] || null;
}
