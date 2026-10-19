/**
 * v3.12 — right-sized pictures.
 *
 * The server sends a WebP copy of any uploaded picture made for the width the
 * page asks for (`/uploads/x.jpg?w=400`, see src/server/image-resize.ts).
 * These helpers build those addresses and the `srcset` list, so the browser
 * downloads a 400 px picture for a 400 px card instead of the 3000 px original.
 *
 * Only this shop's own uploads are resized. Pictures from other sites, SVG
 * logos, GIFs and data: URLs are used exactly as given.
 */

const STEPS = [160, 240, 320, 400, 480, 640, 800, 1080, 1280, 1600, 1920];
const RESIZABLE = /\.(jpe?g|png|webp|avif)$/i;

/** Path of an uploaded picture on this shop, or null when it is not one */
function uploadPath(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  let value = url.trim();
  if (typeof window !== 'undefined' && value.startsWith(window.location.origin + '/uploads/')) {
    value = value.slice(window.location.origin.length);
  }
  if (!value.startsWith('/uploads/')) return null;
  const clean = value.split('?')[0].split('#')[0];
  if (!RESIZABLE.test(clean)) return null;
  return clean;
}

export const canResize = (url?: string | null) => uploadPath(url) !== null;

/** One picture at (about) this many CSS pixels wide */
export function sized(url: string | null | undefined, width: number): string {
  const path = uploadPath(url);
  if (!path) return url || '';
  const step = STEPS.find((value) => value >= width) || STEPS[STEPS.length - 1];
  return `${path}?w=${step}`;
}

/**
 * `srcset` for a picture shown up to `maxWidth` CSS pixels wide (the list also
 * covers 2x screens). Empty string when the picture cannot be resized.
 */
export function srcSet(url: string | null | undefined, maxWidth: number, minWidth = 160): string {
  const path = uploadPath(url);
  if (!path) return '';
  const top = Math.min(1920, maxWidth * 2);
  const steps = STEPS.filter((value) => value >= minWidth && value <= top);
  if (!steps.length || steps[steps.length - 1] < top) {
    const cover = STEPS.find((value) => value >= top);
    if (cover && !steps.includes(cover)) steps.push(cover);
  }
  return steps.map((value) => `${path}?w=${value} ${value}w`).join(', ');
}

/**
 * Props for an <img>: a small default `src` plus `srcSet`/`sizes`, so old
 * browsers still get a reasonable picture.
 */
export function responsiveImg(url: string | null | undefined, sizes: string, maxWidth: number, minWidth = 160) {
  const set = srcSet(url, maxWidth, minWidth);
  if (!set) return { src: url || '' };
  return { src: sized(url, maxWidth), srcSet: set, sizes };
}
