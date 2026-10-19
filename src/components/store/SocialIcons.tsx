import React from 'react';
import { BRAND_ICONS, SOCIAL_NETWORKS, SOCIAL_KEYS, socialMeta, type SocialNetwork } from './BrandIcons.tsx';
import type { SiteSettings, SocialConfig } from '../../types/index.ts';

/**
 * v3.11 — the shop's social media icons, in the order and style chosen in
 * Dashboard → Website → Footer & Social. One component, so the footer, the
 * contact page and any later placement always show the same icons.
 */

export interface SocialLink {
  key: SocialNetwork;
  label: string;
  href: string;
}

const whatsappHref = (raw?: string) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return '';
  const intl = digits.startsWith('880') ? digits : digits.startsWith('0') ? `88${digits}` : digits;
  return `https://wa.me/${intl}`;
};

const telegramHref = (raw?: string) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://t.me/${text.replace(/^@/, '')}`;
};

/** Accepts "facebook.com/x" as well as full links; anything that is not a web link is dropped */
const webHref = (raw?: string) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(text)) return `https://${text}`;
  return '';
};

/** Saved order first, then any network the saved order does not know yet */
export const orderedSocialKeys = (order?: string[]): SocialNetwork[] => {
  const known = (order || []).filter((key): key is SocialNetwork => SOCIAL_KEYS.includes(key as SocialNetwork));
  const unique = Array.from(new Set(known));
  return [...unique, ...SOCIAL_KEYS.filter((key) => !unique.includes(key))];
};

export function socialLinksOf(settings?: SiteSettings): SocialLink[] {
  const social: SocialConfig = settings?.social_config || {};
  const footer: any = settings?.footer_config || {};
  const legacy: Partial<Record<SocialNetwork, string>> = {
    facebook: footer.facebookUrl,
    instagram: footer.instagramUrl,
    youtube: footer.youtubeUrl,
    tiktok: footer.tiktokUrl,
    messenger: footer.messengerUrl,
    whatsapp: footer.whatsappNumber || settings?.general?.whatsapp,
  };
  const links: SocialLink[] = [];
  for (const key of orderedSocialKeys(social.order)) {
    const entry = (social as any)[key] || {};
    if (entry.enabled === false) continue;
    const raw = entry.url || legacy[key] || '';
    const href = key === 'whatsapp' ? whatsappHref(raw) : key === 'telegram' ? telegramHref(raw) : webHref(raw);
    if (!href) continue;
    links.push({ key, label: socialMeta(key)?.label || key, href });
  }
  return links;
}

interface SocialIconsProps {
  links: SocialLink[];
  /** Overrides the saved style */
  iconStyle?: SocialConfig['iconStyle'];
  iconShape?: SocialConfig['iconShape'];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Dashboard preview: links do nothing */
  preview?: boolean;
}

const SIZES = { sm: { box: 32, icon: 15 }, md: { box: 40, icon: 18 }, lg: { box: 46, icon: 21 } };

export const SocialIcons: React.FC<SocialIconsProps> = ({ links, iconStyle = 'brand', iconShape = 'circle', size = 'md', className = '', preview }) => {
  if (links.length === 0) return null;
  const dims = SIZES[size] || SIZES.md;
  const radius = iconShape === 'square' ? '6px' : iconShape === 'rounded' ? '12px' : '999px';
  return (
    <ul className={`flex items-center flex-wrap gap-(--ds-s-2) ${className}`} aria-label="Social media">
      {links.map(({ key, label, href }) => {
        const meta = SOCIAL_NETWORKS.find((item) => item.key === key)!;
        const Icon = BRAND_ICONS[key];
        // Pinterest's mark is itself a round badge, so it is drawn a little larger
        const iconSize = key === 'pinterest' ? dims.icon + 4 : dims.icon;
        const style: React.CSSProperties & Record<string, string | number> = {
          width: dims.box,
          height: dims.box,
          borderRadius: radius,
          '--brand': meta.color,
          '--brand-bg': meta.background || meta.color,
          '--brand-ink': meta.ink,
        };
        const tone =
          iconStyle === 'brand'
            ? 'bg-(image:--brand-bg) bg-(--brand) text-(--brand-ink) shadow-[0_4px_12px_-4px_var(--brand)] hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_var(--brand)]'
            : iconStyle === 'outline'
            ? 'border-2 border-(--brand) text-(--brand) hover:bg-(image:--brand-bg) hover:bg-(--brand) hover:text-(--brand-ink) hover:border-transparent'
            : 'bg-[var(--footer-tile,var(--ds-surface-3))] border border-[var(--footer-border,var(--ds-border))] text-[var(--footer-heading,var(--ds-text))] hover:bg-(image:--brand-bg) hover:bg-(--brand) hover:text-(--brand-ink) hover:border-transparent hover:-translate-y-0.5';
        return (
          <li key={key}>
            <a
              href={preview ? undefined : href}
              target={preview ? undefined : '_blank'}
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
              style={style}
              className={`inline-flex items-center justify-center transition-[transform,box-shadow,background-color,color,border-color] duration-(--ds-dur) ease-(--ds-ease) active:scale-95 ${tone}`}
            >
              <Icon style={{ width: iconSize, height: iconSize }} />
            </a>
          </li>
        );
      })}
    </ul>
  );
};
