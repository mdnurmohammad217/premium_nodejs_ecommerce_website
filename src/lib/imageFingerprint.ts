/**
 * v3.11 — search by photo.
 *
 * A picture is boiled down, IN THE BROWSER, to a small numeric fingerprint:
 *
 *   h  colour histogram of the product (hue × saturation × brightness, plus greys)
 *   l  colour layout: the average colour of a 4 × 4 grid over the product
 *   e  shape: edge directions in four quarters of the product
 *   d  a 64-bit difference hash of the product's light and dark pattern
 *   a  the product's width / height
 *
 * Before measuring, the plain background (white table, studio backdrop …) is
 * found from the picture's border and cut away, so a phone photo of a box on
 * a desk and the shop's photo of the same box on white still look alike.
 *
 * Only this fingerprint (about 1 KB of numbers) is sent to the server. The
 * shopper's photo itself never leaves their device, and nothing is stored.
 * Product images are fingerprinted the same way by the dashboard (Website →
 * Search box → Photo search → Update index).
 *
 * compareFingerprints() is pure maths and runs on the server.
 */

export const FINGERPRINT_VERSION = 1;

export interface ImageFingerprint {
  v: number;
  /** colour histogram, sums to 1 (112 values) */
  h: number[];
  /** 4×4 grid × (L, a, b), each 0…1 (48 values) */
  l: number[];
  /** edge orientation: 2×2 cells × 8 directions, unit length (32 values) */
  e: number[];
  /** 64-bit dHash as 16 hex characters */
  d: string;
  /** aspect ratio of the product (width / height) */
  a: number;
}

const HUE_BINS = 12;
const SAT_BINS = 3;
const VAL_BINS = 3;
const GREY_BINS = 4;
export const HIST_SIZE = HUE_BINS * SAT_BINS * VAL_BINS + GREY_BINS; // 112
const GRID = 4;
const FEATURE_SIZE = 64;

/* ------------------------------------------------------------------ maths */

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

/** sRGB → CIE Lab, each scaled to 0…1 */
function rgbToLab01(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(y) - 16;
  const A = 500 * (f(x) - f(y));
  const Bv = 200 * (f(y) - f(z));
  return [L / 100, (A + 128) / 256, (Bv + 128) / 256];
}

const round = (value: number, places = 4) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};

/* ------------------------------------------------------- browser extraction */

interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Colour of the picture's border (median of the outer ring) */
function borderColour(px: PixelData): [number, number, number] {
  const { data, width, height } = px;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  const median = (list: number[]) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] || 0;
  return [median(rs), median(gs), median(bs)];
}

/** Which pixels belong to the product (differ clearly from the border colour) */
function foregroundMask(px: PixelData): { mask: Uint8Array; box: { x0: number; y0: number; x1: number; y1: number } | null } {
  const { data, width, height } = px;
  const [br, bg, bb] = borderColour(px);
  // A busy border (the product fills the photo) is not a background at all
  let borderSpread = 0;
  let borderCount = 0;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      if (edge) {
        borderSpread += dist;
        borderCount += 1;
      }
      if (dist > 38) {
        mask[y * width + x] = 1;
        count += 1;
      }
    }
  }
  const busyBorder = borderCount > 0 && borderSpread / borderCount > 45;
  if (busyBorder || count < width * height * 0.04) return { mask: mask.fill(1), box: null };

  // Bounding box from rows / columns that are at least 2 % product (ignores specks)
  const rowHits = new Array(height).fill(0);
  const colHits = new Array(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        rowHits[y] += 1;
        colHits[x] += 1;
      }
    }
  }
  const rowMin = width * 0.02;
  const colMin = height * 0.02;
  let y0 = rowHits.findIndex((n) => n > rowMin);
  let y1 = height - 1 - [...rowHits].reverse().findIndex((n) => n > rowMin);
  let x0 = colHits.findIndex((n) => n > colMin);
  let x1 = width - 1 - [...colHits].reverse().findIndex((n) => n > colMin);
  if (y0 < 0 || x0 < 0 || y1 <= y0 || x1 <= x0) return { mask: mask.fill(1), box: null };
  const padX = Math.round((x1 - x0) * 0.03);
  const padY = Math.round((y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - padX);
  y0 = Math.max(0, y0 - padY);
  x1 = Math.min(width - 1, x1 + padX);
  y1 = Math.min(height - 1, y1 + padY);
  return { mask, box: { x0, y0, x1, y1 } };
}

/** Loads an image (File, Blob, object URL or same-origin URL) into a canvas-ready element */
export function loadImage(source: string | Blob, timeoutMs = 20000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl = '';
    if (typeof source !== 'string') objectUrl = URL.createObjectURL(source);
    // A picture that never answers must not stall the indexing (or the search)
    const timer = window.setTimeout(() => {
      img.onload = img.onerror = null;
      img.src = '';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('The picture took too long to load.'));
    }, timeoutMs);
    img.decoding = 'async';
    img.onload = () => {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('The picture could not be opened.'));
    };
    img.src = objectUrl || (source as string);
  });
}

/** The fingerprint of one picture (browser only) */
export function fingerprintImage(img: HTMLImageElement | HTMLCanvasElement | ImageBitmap): ImageFingerprint {
  const srcW = (img as any).naturalWidth || img.width;
  const srcH = (img as any).naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('The picture is empty.');

  // 1. Small working copy (fast, and smooths away camera noise)
  const scale = Math.min(1, 192 / Math.max(srcW, srcH));
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  wctx.fillStyle = '#ffffff'; // transparent PNGs count as white
  wctx.fillRect(0, 0, w, h);
  wctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  const full = wctx.getImageData(0, 0, w, h);

  // 2. Cut the background away
  const { box, mask: fullMask } = foregroundMask({ data: full.data, width: w, height: h });
  const cx0 = box ? box.x0 : 0;
  const cy0 = box ? box.y0 : 0;
  const cw = box ? box.x1 - box.x0 + 1 : w;
  const ch = box ? box.y1 - box.y0 + 1 : h;

  // 3. The product, stretched to a fixed square for the measurements
  const feat = document.createElement('canvas');
  feat.width = FEATURE_SIZE;
  feat.height = FEATURE_SIZE;
  const fctx = feat.getContext('2d', { willReadFrequently: true })!;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(work, cx0, cy0, cw, ch, 0, 0, FEATURE_SIZE, FEATURE_SIZE);
  const px = fctx.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE);
  // The product mask, carried over from the working copy into the square
  const mask = new Uint8Array(FEATURE_SIZE * FEATURE_SIZE);
  for (let fy = 0; fy < FEATURE_SIZE; fy += 1) {
    const sy = Math.min(h - 1, cy0 + Math.floor(((fy + 0.5) / FEATURE_SIZE) * ch));
    for (let fx = 0; fx < FEATURE_SIZE; fx += 1) {
      const sx = Math.min(w - 1, cx0 + Math.floor(((fx + 0.5) / FEATURE_SIZE) * cw));
      mask[fy * FEATURE_SIZE + fx] = fullMask[sy * w + sx];
    }
  }

  return computeFingerprint(px.data, FEATURE_SIZE, FEATURE_SIZE, mask, cw / ch);
}

/**
 * Soft histogram: a colour near the edge of a bin is shared with the
 * neighbouring bin, so a slightly darker or paler photo (phone camera, room
 * light) still lands in the same place as the shop's photo.
 */
function addToHistogram(hist: number[], r: number, g: number, b: number, weight: number) {
  const [hue, sat, val] = rgbToHsv(r, g, b);
  // Grey-ness fades in over a small band instead of a hard cut
  const greyShare = sat < 0.1 || val < 0.08 ? 1 : sat > 0.24 && val > 0.18 ? 0 : Math.max(sat < 0.24 ? (0.24 - sat) / 0.14 : 0, val < 0.18 ? (0.18 - val) / 0.1 : 0);
  const colourShare = 1 - Math.min(1, greyShare);
  if (greyShare > 0) {
    const pos = Math.min(GREY_BINS - 1, Math.max(0, val * GREY_BINS - 0.5));
    const lo = Math.floor(pos);
    const hi = Math.min(GREY_BINS - 1, lo + 1);
    const f = pos - lo;
    const base = HUE_BINS * SAT_BINS * VAL_BINS;
    hist[base + lo] += weight * Math.min(1, greyShare) * (1 - f);
    hist[base + hi] += weight * Math.min(1, greyShare) * f;
  }
  if (colourShare <= 0) return;
  const split = (pos: number, size: number, circular: boolean): Array<[number, number]> => {
    const p = pos - 0.5;
    let lo = Math.floor(p);
    const f = p - lo;
    let hi = lo + 1;
    if (circular) {
      lo = ((lo % size) + size) % size;
      hi = ((hi % size) + size) % size;
    } else {
      if (lo < 0) return [[0, 1]];
      if (hi > size - 1) return [[size - 1, 1]];
    }
    return [
      [lo, 1 - f],
      [hi, f],
    ];
  };
  const hues = split((hue / 360) * HUE_BINS, HUE_BINS, true);
  const sats = split(Math.min(0.9999, Math.max(0, (sat - 0.1) / 0.9)) * SAT_BINS, SAT_BINS, false);
  const vals = split(Math.min(0.9999, Math.max(0, (val - 0.08) / 0.92)) * VAL_BINS, VAL_BINS, false);
  for (const [hb, hw] of hues) {
    for (const [sb, sw] of sats) {
      for (const [vb, vw] of vals) {
        hist[(hb * SAT_BINS + sb) * VAL_BINS + vb] += weight * colourShare * hw * sw * vw;
      }
    }
  }
}

/** Pure part of the extraction: pixels (RGBA) + product mask → fingerprint */
export function computeFingerprint(data: Uint8ClampedArray | number[], width: number, height: number, mask: Uint8Array, aspect: number): ImageFingerprint {
  const hist = new Array(HIST_SIZE).fill(0);
  const grid = new Array(GRID * GRID * 3).fill(0);
  const gridCount = new Array(GRID * GRID).fill(0);
  const grey = new Float32Array(width * height);
  let fgTotal = 0;

  // Every picture is measured as "the product on white": whatever surrounds
  // the product (a desk, a hand, a coloured backdrop) is painted white first,
  // exactly like the shop's own product photos. Colours are counted only on
  // the product itself.
  let fgCount = 0;
  for (let p = 0; p < width * height; p += 1) fgCount += mask[p] ? 1 : 0;
  const masked = fgCount > 0 && fgCount < width * height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const background = masked && !mask[p];
      const r = background ? 255 : data[i];
      const g = background ? 255 : data[i + 1];
      const b = background ? 255 : data[i + 2];
      grey[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      const weight = background ? 0 : 1;
      fgTotal += weight;
      if (weight > 0) addToHistogram(hist, r, g, b, weight);
      const cell = Math.min(GRID - 1, Math.floor((y / height) * GRID)) * GRID + Math.min(GRID - 1, Math.floor((x / width) * GRID));
      const [L, A, B] = rgbToLab01(r, g, b);
      grid[cell * 3] += L;
      grid[cell * 3 + 1] += A;
      grid[cell * 3 + 2] += B;
      gridCount[cell] += 1;
    }
  }
  const h = hist.map((n) => round(n / Math.max(1e-9, fgTotal), 4));
  const l: number[] = [];
  for (let c = 0; c < GRID * GRID; c += 1) {
    const n = Math.max(1, gridCount[c]);
    l.push(round(grid[c * 3] / n, 3), round(grid[c * 3 + 1] / n, 3), round(grid[c * 3 + 2] / n, 3));
  }

  // Edge directions (Sobel), weighted by strength, in 2 × 2 cells
  const e = new Array(32).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (dx: number, dy: number) => grey[(y + dy) * width + (x + dx)];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag < 40) continue;
      let angle = Math.atan2(gy, gx); // −π … π, folded to 0 … π (direction, not sign)
      if (angle < 0) angle += Math.PI;
      const bin = Math.min(7, Math.floor((angle / Math.PI) * 8));
      const cell = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      e[cell * 8 + bin] += mag;
    }
  }
  const eNorm = Math.sqrt(e.reduce((sum, v) => sum + v * v, 0)) || 1;

  // dHash: 9 × 8 grey, each pixel brighter than its right neighbour?
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const sample = (sx: number) => {
        const px = Math.min(width - 1, Math.floor(((sx + 0.5) / 9) * width));
        const py = Math.min(height - 1, Math.floor(((y + 0.5) / 8) * height));
        return grey[py * width + px];
      };
      bits += sample(x) > sample(x + 1) ? '1' : '0';
    }
  }
  let d = '';
  for (let i = 0; i < 64; i += 4) d += parseInt(bits.slice(i, i + 4), 2).toString(16);

  return {
    v: FINGERPRINT_VERSION,
    h,
    l,
    e: e.map((v) => round(v / eNorm, 4)),
    d,
    a: round(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 3),
  };
}

/* ------------------------------------------------------------ comparison */

/** Checks a fingerprint that arrived over the network; returns a clean copy or null */
export function cleanFingerprint(raw: any): ImageFingerprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const nums = (list: any, size: number) =>
    Array.isArray(list) && list.length === size && list.every((n: any) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2)
      ? (list as number[])
      : null;
  const h = nums(raw.h, HIST_SIZE);
  const l = nums(raw.l, GRID * GRID * 3);
  const e = nums(raw.e, 32);
  const d = typeof raw.d === 'string' && /^[0-9a-f]{16}$/.test(raw.d) ? raw.d : null;
  const a = Number(raw.a);
  if (!h || !l || !e || !d || !Number.isFinite(a) || a <= 0 || a > 50) return null;
  return { v: Number(raw.v) || FINGERPRINT_VERSION, h, l, e, d, a };
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) => n.toString(2).split('').filter((c) => c === '1').length);

/** 0 … 1: how alike two pictures are */
export function compareFingerprints(x: ImageFingerprint, y: ImageFingerprint): number {
  // colour histogram: intersection, fine (hue × saturation × brightness) and
  // coarse (hue only) — the coarse one forgives a different camera / light
  let fine = 0;
  for (let i = 0; i < HIST_SIZE; i += 1) fine += Math.min(x.h[i], y.h[i]);
  const coarse = (h: number[]) => {
    const out = new Array(HUE_BINS + GREY_BINS).fill(0);
    for (let i = 0; i < HUE_BINS * SAT_BINS * VAL_BINS; i += 1) out[Math.floor(i / (SAT_BINS * VAL_BINS))] += h[i];
    for (let g = 0; g < GREY_BINS; g += 1) out[HUE_BINS + g] += h[HUE_BINS * SAT_BINS * VAL_BINS + g];
    return out;
  };
  const cx = coarse(x.h);
  const cy = coarse(y.h);
  let rough = 0;
  for (let i = 0; i < cx.length; i += 1) rough += Math.min(cx[i], cy[i]);
  const hist = 0.45 * fine + 0.55 * rough;
  // colour layout: mean absolute difference, Lab weighted
  let layoutDiff = 0;
  for (let i = 0; i < x.l.length; i += 1) layoutDiff += Math.abs(x.l[i] - y.l[i]) * (i % 3 === 0 ? 1 : 2.2);
  const layout = Math.max(0, 1 - (layoutDiff / x.l.length) * 3.2);
  // shape: cosine of the edge histograms
  let dot = 0;
  for (let i = 0; i < 32; i += 1) dot += x.e[i] * y.e[i];
  const edges = Math.max(0, dot);
  // light / dark pattern
  let distance = 0;
  for (let i = 0; i < 16; i += 1) distance += POPCOUNT[parseInt(x.d[i], 16) ^ parseInt(y.d[i], 16)];
  const hash = 1 - distance / 64;
  // proportions
  const aspect = Math.max(0, 1 - Math.min(1, Math.abs(Math.log(x.a / y.a)) / 1.1));

  return 0.4 * hist + 0.24 * layout + 0.18 * edges + 0.1 * hash + 0.08 * aspect;
}
