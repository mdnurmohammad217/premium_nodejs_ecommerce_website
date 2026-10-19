/**
 * v3.14 — settings for the new home page parts, each with its defaults:
 *
 *   hero_layout_config        Website → Hero Banners → Hero layout
 *                             (banner across the page, or categories + banner)
 *   trust_section_config      Website → Trust & Facility → "Why choose us"
 *                             text with certificate badges
 *   facility_section_config   Website → Trust & Facility → factory & lab
 *                             profile with a photo gallery
 *
 * Both home designs (Classic and Glow) read the same settings, so the content
 * is written once. The defaults are neutral: a shop fills in its own text,
 * badges and photos in the dashboard.
 */

const str = (value: unknown, fallback: string, max = 4000) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const newId = () => Math.random().toString(36).slice(2, 9);

/* ------------------------------------------------------------------ hero */

export const HERO_STYLES = ['full', 'split'] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];
export const HERO_HEIGHTS = ['small', 'medium', 'large'] as const;
export type HeroHeight = (typeof HERO_HEIGHTS)[number];

export interface HeroLayoutConfig {
  /** Show the hero at all (both home designs) */
  enabled: boolean;
  /** full = banner across the whole page (as before); split = categories on the left, banner on the right */
  style: HeroStyle;
  /** Heading of the category list */
  title: string;
  /** How many main categories the list shows before "View all" */
  count: number;
  /** Hovering a category opens its sub-categories beside the list */
  showSubcategories: boolean;
  /** Small category picture (or icon) before each name */
  showImages: boolean;
  /** Height of the split hero on computers */
  height: HeroHeight;
  /** On phones (where the list does not fit) show a row of category chips under the banner */
  phoneChips: boolean;
}

export const DEFAULT_HERO_LAYOUT: HeroLayoutConfig = {
  enabled: true,
  style: 'full',
  title: 'All Categories',
  count: 10,
  showSubcategories: true,
  showImages: true,
  height: 'medium',
  phoneChips: false,
};

export function heroLayoutOf(settings: any): HeroLayoutConfig {
  const raw = (settings && settings.hero_layout_config) || {};
  return {
    enabled: bool(raw.enabled, DEFAULT_HERO_LAYOUT.enabled),
    style: pick(raw.style, HERO_STYLES, DEFAULT_HERO_LAYOUT.style),
    title: str(raw.title, DEFAULT_HERO_LAYOUT.title, 60),
    count: clampInt(raw.count, 3, 30, DEFAULT_HERO_LAYOUT.count),
    showSubcategories: bool(raw.showSubcategories, DEFAULT_HERO_LAYOUT.showSubcategories),
    showImages: bool(raw.showImages, DEFAULT_HERO_LAYOUT.showImages),
    height: pick(raw.height, HERO_HEIGHTS, DEFAULT_HERO_LAYOUT.height),
    phoneChips: bool(raw.phoneChips, DEFAULT_HERO_LAYOUT.phoneChips),
  };
}

/* ----------------------------------------------------------------- trust */

export interface TrustBadge {
  id: string;
  /** Short name on the badge, e.g. "ISO" */
  name: string;
  /** Line under it, e.g. "Certified" */
  label: string;
  /** Uploaded logo; empty = a drawn seal with the name */
  logo: string;
  /** Uploaded certificate picture; when set, the badge opens it full size */
  certificate: string;
}

export interface TrustSectionConfig {
  enabled: boolean;
  eyebrow: string;
  /** *words* between stars are drawn in the accent colour */
  title: string;
  /** Paragraphs, separated by an empty line */
  text: string;
  /** Optional picture beside the text (product photo, team, factory) */
  image: string;
  badgesTitle: string;
  badges: TrustBadge[];
  /** soft = tinted background, plain = page background, dark = shop colour */
  tone: 'soft' | 'plain' | 'dark';
}

export const DEFAULT_TRUST_SECTION: TrustSectionConfig = {
  enabled: false,
  eyebrow: 'Trust & Quality',
  title: 'Why *Choose Us?*',
  text: 'Tell your customers why they can trust your products: where the ingredients come from, how they are made and checked, and the approvals and certificates you hold.',
  image: '',
  badgesTitle: 'Approved & certified by',
  badges: [],
  tone: 'soft',
};

export function trustBadgesOf(list: unknown): TrustBadge[] {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      id: str(item.id, '', 20) || newId(),
      name: str(item.name, '', 24).trim(),
      label: str(item.label, '', 40),
      logo: str(item.logo, '', 1000),
      certificate: str(item.certificate, '', 1000),
    }))
    .filter((item) => item.name || item.logo)
    .slice(0, 12);
}

export function trustSectionOf(settings: any): TrustSectionConfig {
  const raw = (settings && settings.trust_section_config) || {};
  return {
    enabled: bool(raw.enabled, DEFAULT_TRUST_SECTION.enabled),
    eyebrow: str(raw.eyebrow, DEFAULT_TRUST_SECTION.eyebrow, 80),
    title: str(raw.title, DEFAULT_TRUST_SECTION.title, 160),
    text: str(raw.text, DEFAULT_TRUST_SECTION.text, 6000),
    image: str(raw.image, '', 1000),
    badgesTitle: str(raw.badgesTitle, DEFAULT_TRUST_SECTION.badgesTitle, 120),
    badges: Array.isArray(raw.badges) ? trustBadgesOf(raw.badges) : DEFAULT_TRUST_SECTION.badges,
    tone: pick(raw.tone, ['soft', 'plain', 'dark'] as const, DEFAULT_TRUST_SECTION.tone),
  };
}

/* -------------------------------------------------------------- facility */

export interface FacilityPhoto {
  id: string;
  url: string;
  caption: string;
}

export interface FacilitySectionConfig {
  enabled: boolean;
  eyebrow: string;
  title: string;
  text: string;
  /** Short points with a tick, e.g. "European-standard machinery" */
  points: string[];
  buttonText: string;
  /** Big picture on the section; empty = the first gallery photo */
  cover: string;
  gallery: FacilityPhoto[];
  /** Which side the pictures are on (computers) */
  imageSide: 'start' | 'end';
}

export const DEFAULT_FACILITY_SECTION: FacilitySectionConfig = {
  enabled: false,
  eyebrow: 'Our Facility',
  title: 'Made in a *Modern Facility & Lab*',
  text: 'Show customers where your products are made: the production floor, the machines and the lab where every batch is checked.',
  points: ['Modern production machinery', 'In-house quality lab', 'Hygienic, controlled production'],
  buttonText: 'Explore Our Facility',
  cover: '',
  gallery: [],
  imageSide: 'start',
};

export function facilityPhotosOf(list: unknown): FacilityPhoto[] {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item === 'object' && typeof (item as any).url === 'string' && (item as any).url.trim())
    .map((item: any) => ({ id: str(item.id, '', 20) || newId(), url: str(item.url, '', 1000), caption: str(item.caption, '', 160) }))
    .slice(0, 40);
}

export function facilitySectionOf(settings: any): FacilitySectionConfig {
  const raw = (settings && settings.facility_section_config) || {};
  return {
    enabled: bool(raw.enabled, DEFAULT_FACILITY_SECTION.enabled),
    eyebrow: str(raw.eyebrow, DEFAULT_FACILITY_SECTION.eyebrow, 80),
    title: str(raw.title, DEFAULT_FACILITY_SECTION.title, 160),
    text: str(raw.text, DEFAULT_FACILITY_SECTION.text, 6000),
    points: Array.isArray(raw.points)
      ? raw.points.map((point: unknown) => str(point, '', 100).trim()).filter(Boolean).slice(0, 6)
      : DEFAULT_FACILITY_SECTION.points,
    buttonText: str(raw.buttonText, DEFAULT_FACILITY_SECTION.buttonText, 60),
    cover: str(raw.cover, '', 1000),
    gallery: facilityPhotosOf(raw.gallery),
    imageSide: pick(raw.imageSide, ['start', 'end'] as const, DEFAULT_FACILITY_SECTION.imageSide),
  };
}

/** Text with empty lines between paragraphs → paragraphs */
export const paragraphsOf = (text: string) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
