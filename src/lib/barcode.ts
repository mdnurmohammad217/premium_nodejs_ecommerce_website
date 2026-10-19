/**
 * Barcodes for the POS: generate in-store codes and draw them as Code 128
 * (every USB/Bluetooth barcode scanner reads Code 128 out of the box).
 * No library — the symbology is a small table.
 */

// Code 128 bar/space widths for values 0–106 (106 = stop)
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const STOP = 106;

/** Code 128 symbol values for a text (set C for digit pairs, set B otherwise) */
export function code128Values(text: string): number[] {
  const value = String(text ?? '');
  if (!value) return [];
  const values: number[] = [];
  if (/^\d{2,}$/.test(value)) {
    values.push(START_C);
    const pairs = value.length - (value.length % 2);
    for (let i = 0; i < pairs; i += 2) values.push(Number(value.slice(i, i + 2)));
    if (value.length % 2) {
      values.push(CODE_B);
      values.push(value.charCodeAt(value.length - 1) - 32);
    }
  } else {
    values.push(START_B);
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 127) throw new Error('Barcodes can use letters, digits and common symbols only.');
      values.push(code - 32);
    }
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i += 1) sum += values[i] * i;
  values.push(sum % 103);
  values.push(STOP);
  return values;
}

/** The bar pattern as module widths, starting with a bar */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => PATTERNS[v].split('').map(Number));
}

/** An inline SVG of the barcode (with quiet zones), sized in modules */
export function code128Svg(text: string, options: { height?: number; showText?: boolean; fontSize?: number } = {}): string {
  const widths = code128Widths(text);
  if (widths.length === 0) return '';
  const height = options.height ?? 40;
  const quiet = 10;
  const textHeight = options.showText === false ? 0 : (options.fontSize ?? 9) + 3;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
    x += width;
  });
  const total = x + quiet;
  const label =
    options.showText === false
      ? ''
      : `<text x="${total / 2}" y="${height + textHeight - 2}" text-anchor="middle" font-family="monospace" font-size="${options.fontSize ?? 9}">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height + textHeight}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}</g>${label}</svg>`;
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch] as string);

/** EAN-13 check digit for 12 digits */
export function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * A new in-store barcode: 13 digits starting with 20 (the range reserved for
 * a shop's own codes, so it never clashes with a manufacturer's barcode) and
 * a valid EAN-13 check digit.
 */
export function generateStoreBarcode(taken: Iterable<string> = []): string {
  const used = new Set(Array.from(taken, (code) => String(code)));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const time = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0');
    const twelve = `20${time}${random}`;
    const code = `${twelve}${ean13CheckDigit(twelve)}`;
    if (!used.has(code)) return code;
  }
  return `20${Date.now().toString().slice(-10)}0`;
}
