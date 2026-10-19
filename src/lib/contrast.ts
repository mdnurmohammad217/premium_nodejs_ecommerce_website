/**
 * v3.12 — readable brand colour.
 *
 * Small text and button labels must reach a 4.5 : 1 contrast (WCAG AA; the
 * PageSpeed accessibility check). Many shop colours are a touch too light
 * for white text on them or for small text on white (emerald #059669 is
 * 3.8 : 1). The colour actually used is therefore the chosen one, darkened
 * just enough to reach about 5 : 1 — it looks the same family, and colours
 * that are already dark enough are not changed at all.
 */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function toRgb(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  let value = hex.slice(1);
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastWithWhite(hex: string): number {
  const rgb = toRgb(hex);
  if (!rgb) return 21;
  return 1.05 / (luminance(rgb) + 0.05);
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

/** The colour, darkened (towards black) only as much as needed for `target` : 1 on white */
export function readableOnWhite(hex: string, target = 5): string {
  const rgb = toRgb(String(hex || '').trim());
  if (!rgb) return hex;
  if (contrastWithWhite(toHex(rgb)) >= target) return hex;
  for (let step = 1; step <= 40; step += 1) {
    const keep = 1 - step * 0.02;
    const next = rgb.map((c) => c * keep);
    if (1.05 / (luminance(next as [number, number, number]) + 0.05) >= target) return toHex(next);
  }
  return '#1f2937';
}

export const isHexColor = (value: string) => HEX.test(String(value || '').trim());

/** `hex` moved `amount` (0–1) of the way towards `other` */
export function mixHex(hex: string, other: string, amount: number): string {
  const a = toRgb(String(hex || '').trim());
  const b = toRgb(other);
  if (!a || !b) return hex;
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
}

/** v3.12.1 — a hover shade for buttons: the same colour, a little darker */
export const hoverShade = (hex: string) => mixHex(hex, '#000000', 0.14);

/** v3.12.1 — a very light tint of the colour for soft backgrounds */
export const lightTint = (hex: string) => mixHex(hex, '#ffffff', 0.92);

/**
 * v3.12.1 — the text colour for labels ON the brand colour (buttons, badges).
 * White on most colours; near-black when the shop picks a light colour
 * (yellow, light pink …) so the button text never disappears.
 */
export function textOnColor(hex: string): string {
  const rgb = toRgb(String(hex || '').trim());
  if (!rgb) return '#ffffff';
  const onWhite = contrastWithWhite(toHex(rgb));
  const onDark = (luminance(rgb) + 0.05) / (luminance([17, 24, 39]) + 0.05);
  return onWhite >= 3 || onWhite >= onDark ? '#ffffff' : '#111827';
}

/** v3.13 — contrast ratio between two colours (1 – 21) */
export function contrastBetween(a: string, b: string): number {
  const x = toRgb(String(a || '').trim());
  const y = toRgb(String(b || '').trim());
  if (!x || !y) return 21;
  const [hi, lo] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * v3.13 — the Glow theme's accent colour in the shades it needs:
 *   accent  as chosen (decoration)
 *   title   for big headings on white (3 : 1)
 *   ink     for small text on white, and the background of small pills and
 *           buttons with white text (4.5 : 1)
 *   onPrimary  accent text on the shop colour (lightened if it would vanish)
 */
export function accentShades(accent: string, primary: string) {
  const ink = readableOnWhite(accent, 4.6);
  let onPrimary = accent;
  for (let step = 0; step <= 10 && contrastBetween(onPrimary, primary) < 3; step += 1) onPrimary = mixHex(accent, '#ffffff', step * 0.1);
  if (contrastBetween(onPrimary, primary) < 3) onPrimary = textOnColor(primary);
  return { accent, title: readableOnWhite(accent, 3.1), ink, fg: textOnColor(ink), onPrimary };
}
