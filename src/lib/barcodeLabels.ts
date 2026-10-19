import { code128Svg } from './barcode.ts';

/**
 * Barcode sticker printing for products and their variations.
 * Label printers (38×25 / 50×25 mm rolls) print one label per page; the A4
 * option fills a standard 65-label sheet (5 × 13, 38.1 × 21.2 mm).
 */

export type LabelLayout = 'roll38' | 'roll50' | 'a4';

export interface BarcodeLabel {
  name: string;
  option?: string;
  price?: number | null;
  code: string;
  copies?: number;
}

const escapeHtml = (value: string) =>
  String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

export const LABEL_LAYOUTS: Array<{ value: LabelLayout; label: string }> = [
  { value: 'roll38', label: 'Label printer — 38 × 25 mm' },
  { value: 'roll50', label: 'Label printer — 50 × 25 mm' },
  { value: 'a4', label: 'A4 sheet — 65 labels (38 × 21 mm)' },
];

export function printBarcodeLabels(labels: BarcodeLabel[], options: { layout: LabelLayout; currency?: string; showPrice?: boolean; storeName?: string }) {
  const { layout, currency = '৳', showPrice = true, storeName = '' } = options;
  const size = layout === 'roll50' ? { w: 50, h: 25 } : layout === 'roll38' ? { w: 38, h: 25 } : { w: 38.1, h: 21.2 };
  const items: string[] = [];
  for (const label of labels) {
    if (!label.code) continue;
    const copies = Math.max(1, Math.min(500, Math.floor(Number(label.copies) || 1)));
    const svg = code128Svg(label.code, { height: 34, fontSize: 10 });
    const html = `<div class="label">
        ${storeName ? `<div class="store">${escapeHtml(storeName)}</div>` : ''}
        <div class="name">${escapeHtml(label.name)}</div>
        ${label.option ? `<div class="option">${escapeHtml(label.option)}</div>` : ''}
        <div class="code">${svg}</div>
        ${showPrice && label.price != null && Number(label.price) > 0 ? `<div class="price">${escapeHtml(currency)}${Number(label.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>` : ''}
      </div>`;
    for (let i = 0; i < copies; i += 1) items.push(html);
  }
  if (items.length === 0) return false;

  const page =
    layout === 'a4'
      ? '@page{size:A4;margin:10.7mm 4.7mm}body{display:grid;grid-template-columns:repeat(5,38.1mm);grid-auto-rows:21.2mm;column-gap:2.5mm}'
      : `@page{size:${size.w}mm ${size.h}mm;margin:0}.label{page-break-after:always;break-after:page}`;
  const css = `${page}
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}
    .label{width:${size.w}mm;height:${size.h}mm;padding:1.2mm 1.6mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .store{font-size:6px;line-height:1.1;opacity:.8;white-space:nowrap;overflow:hidden;max-width:100%}
    .name{font-size:7.5px;font-weight:700;line-height:1.15;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .option{font-size:7px;line-height:1.15;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .code{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;margin:.4mm 0}
    .code svg{width:100%;height:100%;max-height:${layout === 'a4' ? 11 : 13}mm}
    .price{font-size:9px;font-weight:800;line-height:1.1}`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return false;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode labels</title><style>${css}</style></head><body>${items.join('')}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 2000);
    }
  }, 200);
  return true;
}
