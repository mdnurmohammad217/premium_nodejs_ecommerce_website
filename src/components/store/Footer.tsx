import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import React from 'react';
import { SocialIcons, socialLinksOf } from './SocialIcons.tsx';
import { Phone, Mail, MapPin, ExternalLink, BadgeCheck } from 'lucide-react';
import { SiteSettings, FooterConfig, FooterLinkItem } from '../../types/index.ts';
import { BrandLogo, StoreLink } from './Header.tsx';

interface FooterProps {
  settings?: SiteSettings;
  onNavigate: (view: string, param?: any) => void;
}

/* ---------------------------------------------------------------------------
 * Colour schemes
 * ------------------------------------------------------------------------- */

export type FooterColorPreset =
  | 'brand-dark'
  | 'midnight'
  | 'charcoal'
  | 'forest'
  | 'plum'
  | 'ocean'
  | 'light'
  | 'custom';

/** The colour fields stored alongside the rest of `footer_config` */
export interface FooterColorConfig {
  colorPreset?: FooterColorPreset | string;
  backgroundColor?: string;
  textColor?: string;
}

export type FooterSettings = FooterConfig & FooterColorConfig;

interface FooterPreset {
  id: Exclude<FooterColorPreset, 'custom'>;
  label: string;
  /** background */
  bg: string;
  /** the ink every text shade is mixed from */
  ink: string;
  dark: boolean;
}

/**
 * The footer colour schemes offered in Dashboard → Website → Footer.
 *
 * These are fixed palette choices, not theme tokens: a dark footer needs its
 * own background and ink whatever the (light) storefront theme is, so the
 * literal colours are kept here, in this one map. Every other colour in the
 * footer — body text, muted text, borders, tiles, hover — is mixed from the
 * `bg` and `ink` of the chosen entry, so each scheme stays readable.
 */
export const FOOTER_PRESETS: FooterPreset[] = [
  // Deep navy tinted with the brand colour, so it always matches the theme
  { id: 'brand-dark', label: 'Brand dark', bg: 'color-mix(in srgb, var(--primary) 16%, #0b1220)', ink: '#e8edf5', dark: true },
  { id: 'midnight', label: 'Midnight', bg: '#0b1220', ink: '#e2e8f0', dark: true },
  { id: 'charcoal', label: 'Charcoal', bg: '#1b1c20', ink: '#e9e9ec', dark: true },
  { id: 'forest', label: 'Forest', bg: '#0f271c', ink: '#e1efe7', dark: true },
  { id: 'plum', label: 'Plum', bg: '#25142f', ink: '#f0e7f6', dark: true },
  { id: 'ocean', label: 'Ocean', bg: '#0a263b', ink: '#e1eef8', dark: true },
  // The gray scale token rather than --ds-text: the footer redefines --ds-text
  // from its own ink, and pointing back at it would be a circular reference.
  { id: 'light', label: 'Light', bg: 'var(--ds-surface)', ink: 'var(--ds-gray-900)', dark: false },
];

const DEFAULT_PRESET = FOOTER_PRESETS[0];
/** What a custom scheme starts from before the owner picks its colours */
export const CUSTOM_FALLBACK = FOOTER_PRESETS.find((preset) => preset.id === 'midnight') || DEFAULT_PRESET;

/** Relative luminance (0 dark … 1 light) of a #rgb / #rrggbb colour, or null */
export const hexLuminance = (value?: string): number | null => {
  const hex = (value || '').trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(hex)
    ? hex
        .split('')
        .map((c) => c + c)
        .join('')
    : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channel = (offset: number) => {
    const v = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

export interface FooterScheme {
  id: FooterColorPreset;
  dark: boolean;
  style: React.CSSProperties;
}

/**
 * The CSS custom properties a footer (or a preview of one) is painted with.
 * Everything inside reads only these, so one set of variables recolours the
 * whole footer.
 */
export const resolveFooterScheme = (config?: FooterColorConfig): FooterScheme => {
  const requested = config?.colorPreset || DEFAULT_PRESET.id;

  let id: FooterColorPreset;
  let bg: string;
  let ink: string;
  let dark: boolean;

  if (requested === 'custom') {
    id = 'custom';
    bg = (config?.backgroundColor || '').trim() || CUSTOM_FALLBACK.bg;
    const luminance = hexLuminance(bg);
    dark = luminance === null ? true : luminance < 0.4;
    // Without a chosen text colour, pick whichever ink reads on this background
    ink = (config?.textColor || '').trim() || (dark ? 'var(--ds-gray-50)' : 'var(--ds-gray-900)');
  } else {
    const preset = FOOTER_PRESETS.find((item) => item.id === requested) || DEFAULT_PRESET;
    id = preset.id;
    bg = preset.bg;
    ink = preset.ink;
    dark = preset.dark;
  }

  // On a dark background the brand colour is lifted toward white so links and
  // icons keep their contrast; on a light one it is used as is.
  const accent = dark ? 'color-mix(in srgb, var(--primary) 58%, var(--ds-text-invert))' : 'var(--primary)';

  const vars: Record<string, string> = {
    '--footer-bg': bg,
    '--footer-ink': ink,
    '--footer-heading': 'var(--footer-ink)',
    '--footer-text': `color-mix(in srgb, var(--footer-ink) ${dark ? 78 : 74}%, var(--footer-bg))`,
    '--footer-muted': `color-mix(in srgb, var(--footer-ink) ${dark ? 58 : 62}%, var(--footer-bg))`,
    '--footer-border': `color-mix(in srgb, var(--footer-ink) ${dark ? 12 : 10}%, transparent)`,
    '--footer-tile': `color-mix(in srgb, var(--footer-ink) ${dark ? 7 : 4}%, transparent)`,
    '--footer-accent': accent,
    '--footer-link-hover': accent,
    '--footer-glow': `color-mix(in srgb, var(--primary) ${dark ? 18 : 7}%, transparent)`,
    '--footer-bar': dark
      ? 'color-mix(in srgb, var(--ds-gray-900) 32%, var(--footer-bg))'
      : 'var(--ds-surface-2)',
    // Shared pieces such as the brand mark read the global text tokens; inside
    // the footer those follow the scheme too.
    '--ds-text': 'var(--footer-heading)',
    '--ds-text-soft': 'var(--footer-text)',
    '--ds-text-muted': 'var(--footer-muted)',
  };

  return { id, dark, style: vars as React.CSSProperties };
};

/* ---------------------------------------------------------------------------
 * Footer
 * ------------------------------------------------------------------------- */

const activeLinks = (links?: FooterLinkItem[]) =>
  (links || [])
    .filter((link) => link && link.isActive !== false && link.label && link.url)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

/** v3.11 — the footer's columns, in the order the owner arranged them */
export const FOOTER_SECTIONS = ['brand', 'quickLinks', 'policyLinks', 'contact'] as const;
export type FooterSectionId = (typeof FOOTER_SECTIONS)[number];

export const orderedFooterSections = (order?: string[]): FooterSectionId[] => {
  const known = Array.from(new Set((order || []).filter((id): id is FooterSectionId => (FOOTER_SECTIONS as readonly string[]).includes(id))));
  return [...known, ...FOOTER_SECTIONS.filter((id) => !known.includes(id))];
};

/** Width of each column on a wide screen */
const SECTION_WIDTH: Record<FooterSectionId, string> = { brand: '1.4fr', quickLinks: '1fr', policyLinks: '1fr', contact: '1.25fr' };

/**
 * Site footer. Every block is built from Dashboard → Website → Footer & Social
 * and the general store settings; a block with nothing configured is left out
 * rather than filled with sample text.
 */
export const Footer: React.FC<FooterProps> = ({ settings, onNavigate }) => {
  const footerConfig = settings?.footer_config as FooterSettings | undefined;
  const scheme = resolveFooterScheme(footerConfig);
  const general = settings?.general;
  const storeName = settings?.logo_config?.pharmacyName || general?.storeName || '';
  const hasLogo = Boolean(settings?.logo_config?.desktopLogoUrl || settings?.logo_config?.mobileLogoUrl);
  const showBrandMark = (footerConfig?.autoUseHeaderLogo ?? true) ? hasLogo || Boolean(storeName) : Boolean(storeName);

  const address = footerConfig?.address || general?.address || '';
  const phone = footerConfig?.phone || general?.phone || general?.whatsapp || '';
  const email = footerConfig?.email || general?.email || '';
  const drugLicense = footerConfig?.drugLicense || (general as any)?.drugLicenseNumber || '';
  const description = footerConfig?.description || '';

  // Social links: each one can be switched off, and they follow the saved order
  const socialLinks = footerConfig?.showSocialLinks === false ? [] : socialLinksOf(settings);
  const social = settings?.social_config;
  const placement = footerConfig?.socialPlacement === 'brand' || footerConfig?.socialPlacement === 'bottom' ? footerConfig.socialPlacement : 'contact';
  const socialBlock = (size: 'sm' | 'md' = 'md') =>
    socialLinks.length > 0 ? (
      <div className={size === 'sm' ? '' : 'mt-(--ds-s-6)'}>
        {footerConfig?.socialTitle && size !== 'sm' && (
          <p className="mb-(--ds-s-3) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--footer-heading)">{footerConfig.socialTitle}</p>
        )}
        <SocialIcons links={socialLinks} iconStyle={social?.iconStyle || 'brand'} iconShape={social?.iconShape || 'circle'} size={size} />
      </div>
    ) : null;

  const quickLinks = activeLinks(footerConfig?.quickLinks);
  const policyLinks = activeLinks(footerConfig?.policyLinks);
  const hidden = new Set(footerConfig?.hiddenSections || []);

  const hasContact = Boolean(phone || email || address || (placement === 'contact' && socialLinks.length));
  const hasBrandColumn = Boolean(showBrandMark || description || drugLicense || (placement === 'brand' && socialLinks.length));
  const present: Record<FooterSectionId, boolean> = {
    brand: hasBrandColumn,
    quickLinks: quickLinks.length > 0,
    policyLinks: policyLinks.length > 0,
    contact: hasContact,
  };
  const sections = orderedFooterSections(footerConfig?.sectionOrder).filter((id) => present[id] && !hidden.has(id));
  const columns = sections.length;
  const gridTemplate = sections.map((id) => SECTION_WIDTH[id]).join(' ');

  const year = new Date().getFullYear();
  const copyright = footerConfig?.copyrightText || `© ${year}${storeName ? ` ${storeName}` : ''}. All rights reserved.`;

  const linkClass =
    'inline-flex py-0.5 text-(length:--ds-fs-base) text-(--footer-text) hover:text-(--footer-link-hover) hover:translate-x-0.5 transition-[color,transform] duration-(--ds-dur) ease-(--ds-ease)';

  // A logo drawn for the light header can vanish on a dark footer, so on dark
  // schemes the uploaded image sits on a light plate.
  const logoOnPlate = scheme.dark && hasLogo;

  // Phones: the two link lists sit side by side; the other columns use the full width
  const span = (id: FooterSectionId) => (id === 'quickLinks' || id === 'policyLinks' ? 'col-span-1' : 'col-span-2 sm:col-span-1');

  const renderSection = (id: FooterSectionId) => {
    if (id === 'brand') {
      return (
        <div key={id} className={`space-y-(--ds-s-5) min-w-0 ${span(id)}`}>
          {showBrandMark &&
            (logoOnPlate ? (
              <span
                className="inline-flex max-w-full rounded-(--ds-r-lg) bg-(--ds-surface) px-(--ds-s-3) py-(--ds-s-2) shadow-(--ds-shadow-md)"
                // Inside the plate the brand mark goes back to dark ink
                style={{ ['--ds-text' as string]: 'var(--ds-gray-900)' }}
              >
                <BrandLogo settings={settings} onNavigate={onNavigate} size="sm" />
              </span>
            ) : (
              <BrandLogo settings={settings} onNavigate={onNavigate} size="sm" />
            ))}
          {description && <p className="max-w-sm text-(length:--ds-fs-base) leading-(--ds-lh-bn) text-(--footer-text)">{description}</p>}
          {drugLicense && footerConfig?.showLicenseSection !== false && (
            <p className="inline-flex items-center gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--footer-tile) border border-(--footer-border) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm) text-(--footer-text)">
              <BadgeCheck className="w-4 h-4 text-(--footer-accent) shrink-0" />
              <span>
                Drug license: <span className="ds-num font-(--ds-fw-semibold) text-(--footer-heading)">{drugLicense}</span>
              </span>
            </p>
          )}
          {placement === 'brand' && socialBlock()}
        </div>
      );
    }
    if (id === 'quickLinks' || id === 'policyLinks') {
      const list = id === 'quickLinks' ? quickLinks : policyLinks;
      const title =
        id === 'quickLinks' ? footerConfig?.quickLinksTitle || 'Quick links' : footerConfig?.policyLinksTitle || 'Policies & support';
      return (
        <div key={id} className={`min-w-0 ${span(id)}`}>
          <FooterColumn title={title}>
            {list.map((item) => (
              <li key={item.id}>
                <StoreLink to={item.url} newTab={item.isExternal} onNavigate={onNavigate} className={linkClass}>
                  {item.label}
                </StoreLink>
              </li>
            ))}
          </FooterColumn>
        </div>
      );
    }
    return (
      <div key={id} className={`min-w-0 ${span(id)}`}>
        <FooterHeading>{footerConfig?.contactTitle || 'Contact us'}</FooterHeading>
        <ul className="mt-(--ds-s-5) space-y-(--ds-s-3)">
          {phone && (
            <li>
              <a
                href={`tel:${phone}`}
                className="group flex items-center gap-(--ds-s-3) text-(length:--ds-fs-base) text-(--footer-text) hover:text-(--footer-link-hover) transition-colors"
              >
                <ContactIcon icon={Phone} />
                <span className="ds-num">{phone}</span>
              </a>
            </li>
          )}
          {email && (
            <li>
              <a
                href={`mailto:${email}`}
                className="group flex items-center gap-(--ds-s-3) text-(length:--ds-fs-base) text-(--footer-text) hover:text-(--footer-link-hover) transition-colors min-w-0"
              >
                <ContactIcon icon={Mail} />
                <span className="break-all">{email}</span>
              </a>
            </li>
          )}
          {address && (
            <li className="flex items-start gap-(--ds-s-3) text-(length:--ds-fs-base) text-(--footer-text)">
              <ContactIcon icon={MapPin} />
              <span className="leading-(--ds-lh-bn) pt-(--ds-s-1)">{address}</span>
            </li>
          )}
        </ul>
        {placement === 'contact' && socialBlock()}
      </div>
    );
  };

  return (
    <footer style={scheme.style} className="relative isolate mt-auto overflow-hidden bg-(--footer-bg) text-(--footer-text) print:hidden">
      {/* Brand accent: a hairline along the top edge and a soft glow beneath it */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--primary)_30%,var(--primary)_70%,transparent)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,var(--footer-glow),transparent_72%)]"
      />

      {columns > 0 && (
        <div className="max-w-7xl mx-auto px-(--ds-s-4) pt-(--ds-s-10) pb-(--ds-s-8) sm:pt-(--ds-s-12) sm:pb-(--ds-s-10) lg:pt-(--ds-s-16) lg:pb-(--ds-s-12)">
          <div
            style={{ ['--footer-cols' as string]: gridTemplate }}
            className={`grid grid-cols-2 gap-x-(--ds-s-6) sm:gap-x-(--ds-s-10) gap-y-(--ds-s-8) sm:gap-y-(--ds-s-10) ${columns >= 3 ? 'lg:grid-cols-(--footer-cols)' : ''}`}
          >
            {sections.map(renderSection)}
          </div>
        </div>
      )}

      <div className="border-t border-(--footer-border) bg-(--footer-bar)">
        <div className="max-w-7xl mx-auto px-(--ds-s-4) py-(--ds-s-5) flex flex-col sm:flex-row items-center justify-between gap-(--ds-s-3) text-(length:--ds-fs-sm) text-(--footer-muted) text-center sm:text-left">
          <p>{copyright}</p>

          {placement === 'bottom' && socialBlock('sm')}

          {/* v3.13 — website language */}
          <LanguageSwitcher variant="footer" />

          {footerConfig?.enableCredit !== false && footerConfig?.developerName && (
            <p className="inline-flex items-center gap-(--ds-s-1) flex-wrap justify-center">
              <span>{footerConfig.companyCredit || 'Designed & Developed by'}</span>
              {footerConfig.creditUrl ? (
                <a
                  href={footerConfig.creditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-(--ds-fw-semibold) text-(--footer-heading) hover:text-(--footer-link-hover) transition-colors"
                >
                  <span>{footerConfig.developerName}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="font-(--ds-fw-semibold) text-(--footer-heading)">{footerConfig.developerName}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
};

/** Column heading with a short accent rule under it */
const FooterHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div>
    <h2 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--footer-heading)">{children}</h2>
    <span aria-hidden className="mt-(--ds-s-2) block h-0.5 w-(--ds-s-6) rounded-(--ds-r-full) bg-(--footer-accent)" />
  </div>
);

const FooterColumn: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <nav className="min-w-0" aria-label={title}>
    <FooterHeading>{title}</FooterHeading>
    <ul className="mt-(--ds-s-5) space-y-(--ds-s-2)">{children}</ul>
  </nav>
);

const ContactIcon: React.FC<{ icon: React.ComponentType<{ className?: string }> }> = ({ icon: Icon }) => (
  <span className="w-(--ds-h-md) h-(--ds-h-md) shrink-0 rounded-(--ds-r-md) bg-(--footer-tile) border border-(--footer-border) text-(--footer-accent) inline-flex items-center justify-center transition-colors duration-(--ds-dur) group-hover:border-(--footer-accent)">
    <Icon className="w-4 h-4" />
  </span>
);
