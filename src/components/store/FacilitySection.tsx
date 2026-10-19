import React, { useMemo, useState } from 'react';
import { Factory, Check, Images, ArrowRight } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { facilitySectionOf, paragraphsOf } from '../../lib/homeExtras.ts';
import { responsiveImg, sized } from '../../lib/img.ts';
import { useT } from '../../lib/i18n.tsx';
import { AccentTitle } from './glow/GlowParts.tsx';
import { Lightbox, type LightboxPhoto } from './Lightbox.tsx';

/**
 * v3.14 — company profile: the factory and the lab (Dashboard → Website →
 * Trust & Facility). A big photo with two small ones beside the text; the
 * "Explore Our Facility" button (or any photo) opens the whole gallery in a
 * full-screen viewer. Hidden while switched off.
 */
export const FacilitySection: React.FC<{ settings?: SiteSettings; variant?: 'classic' | 'glow' }> = ({ settings, variant = 'classic' }) => {
  const t = useT();
  const cfg = useMemo(() => facilitySectionOf(settings), [settings]);
  const [viewing, setViewing] = useState<number | null>(null);

  // The gallery the viewer walks through: the cover first (if it is not in the gallery already)
  const photos: LightboxPhoto[] = useMemo(() => {
    const list = cfg.gallery.map((photo) => ({ url: photo.url, caption: photo.caption }));
    if (cfg.cover && !list.some((photo) => photo.url === cfg.cover)) list.unshift({ url: cfg.cover, caption: '' });
    return list;
  }, [cfg.gallery, cfg.cover]);

  if (!cfg.enabled) return null;
  const paragraphs = paragraphsOf(t(cfg.text));
  const cover = photos[0];
  const small = photos.slice(1, 3);
  const extra = Math.max(0, photos.length - 3);
  const accentClass = variant === 'glow' ? 'text-(--glow-accent-title)' : 'text-(--primary)';
  const indexOf = (url: string) => Math.max(0, photos.findIndex((photo) => photo.url === url));

  const text = (
    <div className={`min-w-0 ${cover ? '' : 'max-w-3xl mx-auto text-center'}`}>
      {cfg.eyebrow && (
        <p className="inline-flex items-center gap-1.5 h-8 px-(--ds-s-3) rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary) text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
          <Factory className="w-4 h-4" aria-hidden />
          {t(cfg.eyebrow)}
        </p>
      )}
      <AccentTitle
        title={cfg.title}
        as="h2"
        accentClass={accentClass}
        className="mt-(--ds-s-3) text-[26px] sm:text-[34px] lg:text-[40px] leading-[1.15] font-(--ds-fw-bold) tracking-tight"
      />
      <div className={`mt-(--ds-s-4) space-y-(--ds-s-3) ${cover ? '' : 'text-start sm:text-center'}`}>
        {paragraphs.map((part, index) => (
          <p key={index} className="text-(length:--ds-fs-base) sm:text-(length:--ds-fs-md) leading-relaxed text-(--ds-text-soft)">
            {part}
          </p>
        ))}
      </div>
      {cfg.points.length > 0 && (
        <ul className={`mt-(--ds-s-5) grid gap-(--ds-s-2) sm:grid-cols-2 ${cover ? '' : 'text-start max-w-xl mx-auto'}`}>
          {cfg.points.map((point, index) => (
            <li key={index} className="flex items-start gap-(--ds-s-2) text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-text)">
              <span className="mt-0.5 w-5 h-5 shrink-0 rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) inline-flex items-center justify-center">
                <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
              </span>
              <span>{t(point)}</span>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && cfg.buttonText && (
        <button
          type="button"
          onClick={() => setViewing(0)}
          className="group mt-(--ds-s-6) inline-flex items-center gap-(--ds-s-2) h-12 ps-(--ds-s-5) pe-(--ds-s-4) rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-md) font-(--ds-fw-semibold) shadow-(--ds-shadow-md) hover:brightness-110 active:scale-[0.98] transition-[filter,transform] cursor-pointer"
        >
          <Images className="w-5 h-5" aria-hidden />
          {t(cfg.buttonText)}
          <span className="ms-1 inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-(--ds-r-full) bg-white/18 text-(length:--ds-fs-xs) font-(--ds-fw-bold) ds-num">
            {photos.length}
          </span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
        </button>
      )}
    </div>
  );

  const pictures = cover && (
    <div className={`relative ${cfg.imageSide === 'end' ? 'lg:order-2' : ''}`}>
      <button
        type="button"
        onClick={() => setViewing(0)}
        aria-label={`${t('Photos')} (${photos.length})`}
        className="group relative block w-full aspect-[4/3] rounded-[24px] overflow-hidden bg-(--ds-surface-3) shadow-(--ds-shadow-lg) cursor-zoom-in"
      >
        <img
          {...responsiveImg(cover.url, '(min-width: 1024px) 600px, 100vw', 1400)}
          alt={cover.caption || ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.45))]" aria-hidden />
        {photos.length > 1 && (
          <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 h-9 px-(--ds-s-3) rounded-(--ds-r-full) bg-black/45 backdrop-blur text-white text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
            <Images className="w-4 h-4" aria-hidden />
            <span className="ds-num">{photos.length}</span> {t('photos')}
          </span>
        )}
      </button>
      {small.length > 0 && (
        <div className="hidden sm:flex absolute -bottom-6 end-4 lg:-end-6 gap-(--ds-s-3)">
          {small.map((photo, index) => {
            const last = index === small.length - 1 && extra > 0;
            return (
              <button
                key={photo.url}
                type="button"
                onClick={() => setViewing(indexOf(photo.url))}
                aria-label={photo.caption || t('Photo {n} of {total}', { n: indexOf(photo.url) + 1, total: photos.length })}
                className="relative w-32 lg:w-36 aspect-[4/3] rounded-(--ds-r-xl) overflow-hidden ring-4 ring-(--ds-bg,var(--ds-surface)) bg-(--ds-surface-3) shadow-(--ds-shadow-lg) cursor-zoom-in hover:-translate-y-1 transition-transform"
              >
                <img src={sized(photo.url, 320)} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                {last && (
                  <span className="absolute inset-0 bg-black/55 text-white inline-flex items-center justify-center text-(length:--ds-fs-lg) font-(--ds-fw-bold) ds-num">
                    +{extra}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <section aria-label={t(cfg.title).replace(/\*/g, '')} className="max-w-7xl mx-auto px-(--ds-s-4)">
      {cover ? (
        <div className="grid lg:grid-cols-2 gap-(--ds-s-10) lg:gap-(--ds-s-16) items-center">
          {pictures}
          {text}
        </div>
      ) : (
        text
      )}
      <Lightbox photos={photos} index={viewing} onClose={() => setViewing(null)} onIndexChange={setViewing} title={t(cfg.title).replace(/\*/g, '')} />
    </section>
  );
};

export default FacilitySection;
