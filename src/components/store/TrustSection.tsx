import React, { useMemo, useState } from 'react';
import { ShieldCheck, BadgeCheck, Maximize2 } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { paragraphsOf, trustSectionOf, type TrustBadge } from '../../lib/homeExtras.ts';
import { responsiveImg, sized } from '../../lib/img.ts';
import { useT } from '../../lib/i18n.tsx';
import { AccentTitle } from './glow/GlowParts.tsx';
import { Lightbox } from './Lightbox.tsx';

/**
 * A drawn round seal with the badge's short name, used until the shop uploads
 * the real logo. Plain shapes only — not a copy of any organisation's mark.
 */
export const TrustSeal: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
  const text = String(name || '').trim().toUpperCase().slice(0, 6) || '✓';
  const size = text.length <= 3 ? 30 : text.length === 4 ? 25 : text.length === 5 ? 21 : 18;
  // 20 small bumps around the edge
  const points: string[] = [];
  for (let i = 0; i < 40; i++) {
    const angle = (Math.PI * 2 * i) / 40 - Math.PI / 2;
    const r = i % 2 === 0 ? 48 : 44;
    points.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={name}>
      <polygon points={points.join(' ')} fill="var(--primary)" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--primary-foreground, #fff)" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="33" fill="var(--primary-foreground, #fff)" fillOpacity="0.12" />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--primary-foreground, #fff)"
        fontSize={size}
        fontWeight={800}
        letterSpacing="0.5"
        style={{ fontFamily: 'inherit' }}
      >
        {text}
      </text>
      <path d="M41 30.5l3 3 6-6" fill="none" stroke="var(--primary-foreground, #fff)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(5 -3)" />
    </svg>
  );
};

const BadgeCard: React.FC<{ badge: TrustBadge; onOpen?: () => void }> = ({ badge, onOpen }) => {
  const t = useT();
  const body = (
    <>
      <span className="flex items-center justify-center h-16 sm:h-[72px] w-full">
        {badge.logo ? (
          <img
            src={sized(badge.logo, 240)}
            alt={badge.name || ''}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-[85%] object-contain"
          />
        ) : (
          <TrustSeal name={badge.name} className="h-16 w-16 sm:h-[72px] sm:w-[72px] drop-shadow-sm" />
        )}
      </span>
      <span className="block mt-(--ds-s-3) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) leading-tight">{badge.name}</span>
      {badge.label && <span className="block mt-0.5 text-(length:--ds-fs-sm) text-(--ds-text-muted) leading-snug">{t(badge.label)}</span>}
      {onOpen && (
        <span className="mt-(--ds-s-2) inline-flex items-center gap-1 text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--primary)">
          <Maximize2 className="w-3.5 h-3.5" aria-hidden />
          {t('View certificate')}
        </span>
      )}
    </>
  );
  const shell =
    'w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] lg:w-[calc(20%-0.8rem)] flex flex-col items-center text-center rounded-(--ds-r-xl) bg-(--ds-surface) border border-(--ds-border) px-(--ds-s-3) py-(--ds-s-5) shadow-(--ds-shadow-xs)';
  if (!onOpen) return <li className={shell}>{body}</li>;
  return (
    <li className="contents">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${badge.name} — ${t('View certificate')}`}
        className={`${shell} cursor-pointer transition-[transform,box-shadow,border-color] duration-(--ds-dur) hover:-translate-y-1 hover:shadow-(--ds-shadow-md) hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] focus-visible:outline-2 focus-visible:outline-(--primary)`}
      >
        {body}
      </button>
    </li>
  );
};

/**
 * v3.14 — "Why choose us" block with certificate badges (Dashboard → Website
 * → Trust & Facility). The badges show the uploaded logos (or a drawn seal
 * until a logo is uploaded); a badge with a certificate picture opens it full
 * size. Hidden while switched off.
 */
export const TrustSection: React.FC<{ settings?: SiteSettings; variant?: 'classic' | 'glow' }> = ({ settings, variant = 'classic' }) => {
  const t = useT();
  const cfg = useMemo(() => trustSectionOf(settings), [settings]);
  const [viewing, setViewing] = useState<number | null>(null);
  const certificates = useMemo(
    () => cfg.badges.filter((badge) => badge.certificate).map((badge) => ({ url: badge.certificate, caption: [badge.name, badge.label].filter(Boolean).join(' — ') })),
    [cfg.badges]
  );
  if (!cfg.enabled) return null;
  const paragraphs = paragraphsOf(t(cfg.text));
  if (!cfg.title && paragraphs.length === 0 && cfg.badges.length === 0) return null;

  const dark = cfg.tone === 'dark';
  const accentClass = dark ? 'text-(--glow-accent-on-primary)' : variant === 'glow' ? 'text-(--glow-accent-title)' : 'text-(--primary)';
  const hasImage = Boolean(cfg.image);
  const box =
    cfg.tone === 'plain'
      ? 'bg-transparent'
      : dark
      ? 'bg-(--primary) text-(--primary-foreground)'
      : 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_7%,var(--ds-surface)),color-mix(in_srgb,var(--primary)_3%,var(--ds-surface)))] border border-[color-mix(in_srgb,var(--primary)_12%,transparent)]';
  const padded = cfg.tone !== 'plain';

  return (
    <section aria-label={t(cfg.title).replace(/\*/g, '')} className="max-w-7xl mx-auto px-(--ds-s-4)">
      <div className={`relative overflow-hidden rounded-[28px] ${box} ${padded ? 'px-(--ds-s-5) py-(--ds-s-8) sm:px-(--ds-s-10) sm:py-(--ds-s-12) lg:px-(--ds-s-12)' : ''}`}>
        {padded && (
          <ShieldCheck
            aria-hidden
            className={`pointer-events-none absolute -top-10 -end-10 w-64 h-64 sm:w-80 sm:h-80 ${dark ? 'text-white/[0.06]' : 'text-[color-mix(in_srgb,var(--primary)_6%,transparent)]'}`}
            strokeWidth={1.2}
          />
        )}

        <div className={`relative ${hasImage ? 'grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-(--ds-s-8) lg:gap-(--ds-s-12) items-center' : 'max-w-3xl mx-auto text-center'}`}>
          <div className="min-w-0">
            {cfg.eyebrow && (
              <p
                className={`inline-flex items-center gap-1.5 h-8 px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) ${
                  dark ? 'bg-white/12 text-white' : 'bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)'
                }`}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden />
                {t(cfg.eyebrow)}
              </p>
            )}
            <AccentTitle
              title={cfg.title}
              as="h2"
              accentClass={accentClass}
              color={dark ? 'var(--primary-foreground)' : undefined}
              className="mt-(--ds-s-3) text-[26px] sm:text-[34px] lg:text-[40px] leading-[1.15] font-(--ds-fw-bold) tracking-tight"
            />
            <div className={`mt-(--ds-s-4) space-y-(--ds-s-3) ${hasImage ? '' : 'mx-auto text-start sm:text-center'}`}>
              {paragraphs.map((text, index) => (
                <p
                  key={index}
                  className={`leading-relaxed ${index === 0 ? 'text-(length:--ds-fs-md) sm:text-[17px]' : 'text-(length:--ds-fs-base) sm:text-(length:--ds-fs-md)'} ${
                    dark ? 'text-white/88' : index === 0 ? 'text-(--ds-text)' : 'text-(--ds-text-soft)'
                  }`}
                >
                  {text}
                </p>
              ))}
            </div>
          </div>

          {hasImage && (
            <div className="relative">
              <div className="relative aspect-[4/3] lg:aspect-[5/4] rounded-[24px] overflow-hidden bg-(--ds-surface-3) shadow-(--ds-shadow-lg)">
                <img {...responsiveImg(cfg.image, '(min-width: 1024px) 520px, 100vw', 1200)} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
              </div>
              {cfg.badges.length > 0 && (
                <div className="absolute -bottom-4 start-4 sm:start-6 flex items-center gap-(--ds-s-3) ps-2 pe-(--ds-s-4) py-2 rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-text) shadow-(--ds-shadow-lg) border border-(--ds-border)">
                  <span className="flex -space-x-2 rtl:space-x-reverse">
                    {cfg.badges.slice(0, 3).map((badge) => (
                      <span key={badge.id} className="w-8 h-8 rounded-(--ds-r-full) bg-(--ds-surface) ring-2 ring-(--ds-surface) overflow-hidden inline-flex items-center justify-center">
                        {badge.logo ? <img src={sized(badge.logo, 64)} alt="" className="w-full h-full object-contain" /> : <TrustSeal name={badge.name} className="w-8 h-8" />}
                      </span>
                    ))}
                  </span>
                  <span className="text-(length:--ds-fs-sm) font-(--ds-fw-bold) whitespace-nowrap">
                    <BadgeCheck className="inline w-4 h-4 me-1 -mt-0.5 text-(--primary)" aria-hidden />
                    {t('{n} certifications', { n: cfg.badges.length })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {cfg.badges.length > 0 && (
          <div className={`relative ${hasImage ? 'mt-(--ds-s-12)' : 'mt-(--ds-s-8)'}`}>
            {cfg.badgesTitle && (
              <p
                className={`flex items-center gap-(--ds-s-3) mb-(--ds-s-5) text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm) font-(--ds-fw-bold) uppercase tracking-[0.12em] ${
                  dark ? 'text-white/75' : 'text-(--ds-text-muted)'
                }`}
              >
                <span className={`flex-1 h-px ${dark ? 'bg-white/20' : 'bg-(--ds-border)'}`} aria-hidden />
                <span className="text-center">{t(cfg.badgesTitle)}</span>
                <span className={`flex-1 h-px ${dark ? 'bg-white/20' : 'bg-(--ds-border)'}`} aria-hidden />
              </p>
            )}
            <ul className="flex flex-wrap justify-center gap-(--ds-s-3) lg:gap-(--ds-s-4)">
              {cfg.badges.map((badge) => {
                const certIndex = badge.certificate ? certificates.findIndex((item) => item.url === badge.certificate) : -1;
                return <BadgeCard key={badge.id} badge={badge} onOpen={certIndex >= 0 ? () => setViewing(certIndex) : undefined} />;
              })}
            </ul>
          </div>
        )}
      </div>

      <Lightbox photos={certificates} index={viewing} onClose={() => setViewing(null)} onIndexChange={setViewing} title={t('Certificates')} />
    </section>
  );
};

export default TrustSection;
