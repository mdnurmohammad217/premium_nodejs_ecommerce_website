/**
 * v3.9 — the shape of product pictures (Dashboard → Product Card → Product
 * image shape). Square (1:1) or portrait 400 × 600 (2:3) and a few more, or
 * any width × height. Every product card, the product page gallery and the
 * loading placeholders follow it through two CSS variables, so the whole
 * shop changes at once and nothing is cut off unexpectedly.
 */
export type ProductRatio = '1:1' | '2:3' | '3:4' | '4:5' | '4:3' | 'custom';

export interface ProductImageConfig {
  ratio?: ProductRatio;
  width?: number;
  height?: number;
  /** cover = fill the frame (edges may be trimmed), contain = always show the whole picture */
  fit?: 'cover' | 'contain';
}

export const PRODUCT_RATIOS: Array<{ id: ProductRatio; label: string; hint: string; size: string; w: number; h: number }> = [
  { id: '1:1', label: 'Square', hint: '1:1 — e.g. 800 × 800 px', size: '800 × 800 px', w: 1, h: 1 },
  { id: '2:3', label: 'Portrait 400 × 600', hint: '2:3 — fashion, clothing', size: '400 × 600 px (or 800 × 1200 px for sharper pictures)', w: 2, h: 3 },
  { id: '3:4', label: 'Portrait 3:4', hint: 'e.g. 600 × 800 px', size: '600 × 800 px', w: 3, h: 4 },
  { id: '4:5', label: 'Portrait 4:5', hint: 'e.g. 800 × 1000 px (Instagram)', size: '800 × 1000 px', w: 4, h: 5 },
  { id: '4:3', label: 'Landscape 4:3', hint: 'e.g. 800 × 600 px', size: '800 × 600 px', w: 4, h: 3 },
  { id: 'custom', label: 'Custom size', hint: 'Any width × height', size: '', w: 1, h: 1 },
];

export function productImageCss(config?: ProductImageConfig | null): { ratio: string; fit: 'cover' | 'contain' } {
  const cfg = config || {};
  const fit = cfg.fit === 'contain' ? 'contain' : 'cover';
  if (cfg.ratio === 'custom') {
    const w = Math.max(1, Math.min(5000, Number(cfg.width) || 0));
    const h = Math.max(1, Math.min(5000, Number(cfg.height) || 0));
    if (w > 0 && h > 0 && w / h > 0.2 && w / h < 5) return { ratio: `${w} / ${h}`, fit };
    return { ratio: '1 / 1', fit };
  }
  const preset = PRODUCT_RATIOS.find((item) => item.id === cfg.ratio) || PRODUCT_RATIOS[0];
  return { ratio: `${preset.w} / ${preset.h}`, fit };
}

/** Writes the two CSS variables the cards and the gallery read */
export function applyProductImageVars(config?: ProductImageConfig | null) {
  if (typeof document === 'undefined') return;
  const css = productImageCss(config);
  document.documentElement.style.setProperty('--product-ratio', css.ratio);
  document.documentElement.style.setProperty('--product-fit', css.fit);
}
