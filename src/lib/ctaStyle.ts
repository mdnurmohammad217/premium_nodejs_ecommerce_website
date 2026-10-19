/**
 * v3.15 — colours and text size of the Add to Cart and Buy Now buttons
 * (Dashboard → Website → Product Card → Button colours & text size).
 *
 * Every Add to Cart button on the website carries the class `cta-atc`, every
 * Buy Now `cta-buy`; buttons on product cards also carry `cta-card`, those on
 * the product page `cta-page`. This file turns the setting into CSS variables
 * on <html> (with a data- flag per part), and index.css applies them — so a
 * card design keeps its own look until the owner picks a colour, and every
 * design follows the same choice once they do.
 */
import { isHexColor, textOnColor } from './contrast.ts';

export interface CtaButtonLook {
  /** Background colour; empty = the design's own colour */
  bg: string;
  /** Text colour; empty = black or white, whichever reads best on bg */
  fg: string;
  /** filled = solid colour; outline = coloured border and text on white */
  style: 'filled' | 'outline';
}

export interface CtaStyleConfig {
  atc: CtaButtonLook;
  buy: CtaButtonLook;
  /** Text size on product cards in px; 0 = the design's own size */
  cardFontSize: number;
  /** Text size on the product page in px; 0 = the design's own size */
  pageFontSize: number;
  /** '' = the design's own weight */
  fontWeight: '' | '500' | '600' | '700' | '800';
  /** Corner shape; '' = the design's own */
  radius: '' | 'square' | 'rounded' | 'pill';
}

export const DEFAULT_CTA_STYLE: CtaStyleConfig = {
  atc: { bg: '', fg: '', style: 'filled' },
  buy: { bg: '', fg: '', style: 'filled' },
  cardFontSize: 0,
  pageFontSize: 0,
  fontWeight: '',
  radius: '',
};

const look = (raw: any): CtaButtonLook => ({
  bg: isHexColor(raw?.bg) ? String(raw.bg).trim() : '',
  fg: isHexColor(raw?.fg) ? String(raw.fg).trim() : '',
  style: raw?.style === 'outline' ? 'outline' : 'filled',
});
const size = (value: any) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 11 && n <= 22 ? n : 0;
};

export function ctaStyleOf(settings: any): CtaStyleConfig {
  const raw = (settings && settings.cta_button_style) || {};
  return {
    atc: look(raw.atc),
    buy: look(raw.buy),
    cardFontSize: size(raw.cardFontSize),
    pageFontSize: size(raw.pageFontSize),
    fontWeight: ['500', '600', '700', '800'].includes(String(raw.fontWeight)) ? raw.fontWeight : '',
    radius: ['square', 'rounded', 'pill'].includes(String(raw.radius)) ? raw.radius : '',
  };
}

const RADIUS = { square: '4px', rounded: '10px', pill: '999px' };

/** Sets (or clears) the CSS variables and flags on an element (default: <html>) */
export function applyCtaStyle(cfg: CtaStyleConfig, target?: HTMLElement | null) {
  if (typeof document === 'undefined') return;
  const el = target || document.documentElement;
  const part = (key: 'atc' | 'buy', value: CtaButtonLook) => {
    if (!value.bg) {
      delete el.dataset[`cta${key === 'atc' ? 'Atc' : 'Buy'}`];
      return;
    }
    const fg = value.fg || textOnColor(value.bg);
    el.style.setProperty(`--cta-${key}-bg`, value.bg);
    el.style.setProperty(`--cta-${key}-fg`, value.style === 'outline' ? value.fg || value.bg : fg);
    el.style.setProperty(`--cta-${key}-hover-fg`, fg);
    el.dataset[`cta${key === 'atc' ? 'Atc' : 'Buy'}`] = value.style;
  };
  part('atc', cfg.atc);
  part('buy', cfg.buy);
  const setOrClear = (name: string, flag: string, value: string) => {
    if (value) {
      el.style.setProperty(name, value);
      el.dataset[flag] = '1';
    } else {
      el.style.removeProperty(name);
      delete el.dataset[flag];
    }
  };
  setOrClear('--cta-card-fs', 'ctaCardFs', cfg.cardFontSize ? `${cfg.cardFontSize}px` : '');
  setOrClear('--cta-page-fs', 'ctaPageFs', cfg.pageFontSize ? `${cfg.pageFontSize}px` : '');
  setOrClear('--cta-fw', 'ctaFw', cfg.fontWeight);
  setOrClear('--cta-radius', 'ctaRadius', cfg.radius ? RADIUS[cfg.radius] : '');
}
