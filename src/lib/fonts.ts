/**
 * v3.15 — typefaces for the website and the dashboard
 * (Dashboard → System Configuration → Fonts).
 *
 * The built-in face stays Public Sans (self-hosted, see index.css). When the
 * owner picks another one it comes from Google Fonts: the server writes the
 * <link> and a small <style> into the page head (so the first paint already
 * uses it), and the browser does the same after a save. Bengali, Hindi and
 * Arabic text keeps falling through to the Noto faces when the chosen font
 * has no letters for them.
 *
 * Used by the server (head HTML) and the browser (live switch), so it must
 * not touch `document` outside applyFontConfig.
 */

export type FontCategory = 'sans' | 'serif' | 'display' | 'bangla' | 'arabic' | 'devanagari';

export interface FontChoice {
  family: string;
  category: FontCategory;
  /** Weights asked from Google — only ones the family has, or the request fails */
  weights: string;
}

export const FONT_CHOICES: FontChoice[] = [
  // Clean, modern sans faces
  { family: 'Inter', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Poppins', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Roboto', category: 'sans', weights: '400;500;700;900' },
  { family: 'Open Sans', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Lato', category: 'sans', weights: '400;700;900' },
  { family: 'Montserrat', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Nunito', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'DM Sans', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Manrope', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Outfit', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Figtree', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Urbanist', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Rubik', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Work Sans', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Raleway', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Jost', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Mulish', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Lexend', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Sora', category: 'sans', weights: '400;500;600;700;800' },
  { family: 'Barlow', category: 'sans', weights: '400;500;600;700;800' },
  // Elegant serif faces (beauty, fashion, premium shops)
  { family: 'Playfair Display', category: 'serif', weights: '400;500;600;700;800' },
  { family: 'Cormorant Garamond', category: 'serif', weights: '400;500;600;700' },
  { family: 'Lora', category: 'serif', weights: '400;500;600;700' },
  { family: 'Merriweather', category: 'serif', weights: '400;700;900' },
  { family: 'DM Serif Display', category: 'serif', weights: '400' },
  { family: 'Libre Baskerville', category: 'serif', weights: '400;700' },
  { family: 'EB Garamond', category: 'serif', weights: '400;500;600;700;800' },
  { family: 'Fraunces', category: 'serif', weights: '400;500;600;700;800' },
  // Headings with character
  { family: 'Marcellus', category: 'display', weights: '400' },
  { family: 'Cinzel', category: 'display', weights: '400;500;600;700;800' },
  { family: 'Bebas Neue', category: 'display', weights: '400' },
  { family: 'Oswald', category: 'display', weights: '400;500;600;700' },
  // Bengali
  { family: 'Hind Siliguri', category: 'bangla', weights: '400;500;600;700' },
  { family: 'Noto Sans Bengali', category: 'bangla', weights: '400;500;600;700;800' },
  { family: 'Noto Serif Bengali', category: 'bangla', weights: '400;500;600;700;800' },
  { family: 'Anek Bangla', category: 'bangla', weights: '400;500;600;700;800' },
  { family: 'Baloo Da 2', category: 'bangla', weights: '400;500;600;700;800' },
  { family: 'Tiro Bangla', category: 'bangla', weights: '400' },
  { family: 'Galada', category: 'bangla', weights: '400' },
  // Arabic and Hindi
  { family: 'Cairo', category: 'arabic', weights: '400;500;600;700;800' },
  { family: 'Tajawal', category: 'arabic', weights: '400;500;700;800' },
  { family: 'Noto Kufi Arabic', category: 'arabic', weights: '400;500;600;700;800' },
  { family: 'Mukta', category: 'devanagari', weights: '400;500;600;700;800' },
  { family: 'Hind', category: 'devanagari', weights: '400;500;600;700' },
];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Modern sans',
  serif: 'Elegant serif',
  display: 'Headings with character',
  bangla: 'Bangla',
  arabic: 'Arabic',
  devanagari: 'Hindi',
};

export interface FontConfig {
  /** Body text of the website; '' = built-in Public Sans */
  website: string;
  /** Headings and product names on the website; '' = same as the body */
  heading: string;
  /** Dashboard and POS; '' = built-in Public Sans, 'website' = same as the website */
  dashboard: string;
}

export const DEFAULT_FONT_CONFIG: FontConfig = { website: '', heading: '', dashboard: '' };

/** Google Fonts family names: letters, digits and spaces */
const SAFE_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{1,59}$/;
export const isSafeFamily = (value: unknown): value is string => typeof value === 'string' && SAFE_FAMILY.test(value.trim());

export function fontConfigOf(settings: any): FontConfig {
  const raw = (settings && settings.font_config) || {};
  const family = (value: any) => (isSafeFamily(value) ? String(value).trim() : '');
  return {
    website: family(raw.website),
    heading: family(raw.heading),
    dashboard: raw.dashboard === 'website' ? 'website' : family(raw.dashboard),
  };
}

/** The built-in stack (keep in step with --font-sans in index.css) */
export const BUILT_IN_STACK =
  '"Public Sans Variable", "Public Sans", "Noto Sans Bengali Variable", "Noto Sans Bengali", "Hind Siliguri", "Noto Sans Devanagari Variable", "Noto Sans Arabic Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

const SCRIPT_FALLBACKS =
  '"Noto Sans Bengali Variable", "Noto Sans Bengali", "Hind Siliguri", "Noto Sans Devanagari Variable", "Noto Sans Arabic Variable"';

export function fontStack(family: string): string {
  if (!family) return BUILT_IN_STACK;
  const choice = FONT_CHOICES.find((item) => item.family === family);
  const generic = choice && (choice.category === 'serif' || family.includes('Serif')) ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `"${family}", ${SCRIPT_FALLBACKS}, ${generic}`;
}

/** One stylesheet address per family, so a family Google does not have never breaks the others */
export function googleFontUrls(family: string): string[] {
  if (!family) return [];
  const name = family.replace(/ /g, '+');
  const choice = FONT_CHOICES.find((item) => item.family === family);
  if (choice) return [`https://fonts.googleapis.com/css2?family=${name}:wght@${choice.weights}&display=swap`];
  // A family typed by the owner: weight 400 always exists; the bold weights
  // come from a second request so a one-weight family still loads.
  return [`https://fonts.googleapis.com/css2?family=${name}&display=swap`, `https://fonts.googleapis.com/css2?family=${name}:wght@600;700&display=swap`];
}

/** Families one side of the shop needs */
export function familiesFor(cfg: FontConfig, side: 'website' | 'dashboard'): string[] {
  const list =
    side === 'website' ? [cfg.website, cfg.heading] : [cfg.dashboard === 'website' ? cfg.website : cfg.dashboard];
  return Array.from(new Set(list.filter(Boolean)));
}

/** The CSS for the chosen faces ('' when everything is the built-in face) */
export function fontCss(cfg: FontConfig): string {
  const rules: string[] = [];
  const root: string[] = [];
  if (cfg.website) root.push(`--font-sans:${fontStack(cfg.website)}`);
  if (cfg.heading) root.push(`--font-display:${fontStack(cfg.heading)}`);
  if (root.length) rules.push(`html:root{${root.join(';')}}`);
  // The dashboard reads --a-font. It follows --font-sans by default, so a
  // website face would leak into it unless the built-in one is set again.
  const dashboard = cfg.dashboard === 'website' ? cfg.website : cfg.dashboard;
  if (dashboard) rules.push(`html .admin-shell{--a-font:${fontStack(dashboard)}}`);
  else if (cfg.website) rules.push(`html .admin-shell{--a-font:${BUILT_IN_STACK}}`);
  return rules.join('');
}

/** <link> + <style> for the page head, written by the server */
export function fontHeadHtml(cfg: FontConfig, side: 'website' | 'dashboard'): string {
  const css = fontCss(cfg);
  if (!css) return '';
  const urls = familiesFor(cfg, side).flatMap(googleFontUrls);
  const links = urls.length
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${urls
        .map((url) => `<link rel="stylesheet" href="${url}" data-font-link>`)
        .join('')}`
    : '';
  return `${links}<style id="font-config">${css}</style>`;
}

/** Same as fontHeadHtml, in the browser (after a save, or when moving between the shop and the dashboard) */
export function applyFontConfig(cfg: FontConfig, side: 'website' | 'dashboard') {
  if (typeof document === 'undefined') return;
  const head = document.head;
  const wanted = new Set(familiesFor(cfg, side).flatMap(googleFontUrls));
  // Keep the links the page already has (no re-download), add the missing ones
  head.querySelectorAll<HTMLLinkElement>('link[data-font-link]').forEach((link) => {
    if (wanted.has(link.href)) wanted.delete(link.href);
  });
  if (wanted.size && !head.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"]')) {
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.gstatic.com';
    pre.crossOrigin = '';
    head.appendChild(pre);
  }
  wanted.forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fontLink = '';
    head.appendChild(link);
  });
  let style = document.getElementById('font-config') as HTMLStyleElement | null;
  const css = fontCss(cfg);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = 'font-config';
    head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
