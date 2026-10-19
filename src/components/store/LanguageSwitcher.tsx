import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LANGUAGES, useLanguage, type LangCode } from '../../lib/i18n.tsx';

/**
 * v3.13 — the website language switcher (Dashboard → Website → Languages).
 *
 *   header  a globe pill in the header (tablets and computers) that opens a
 *           small card with every language written in its own script
 *   drawer  a row of language chips at the top of the phone menu
 *   footer  a quiet row of language names at the bottom of every page
 *
 * Each language is shown in its own script (বাংলা, हिन्दी, العربية …) so a
 * visitor recognises their language whatever language the page is in now.
 * Shows nothing when the switcher is off or only one language is offered.
 */
export const LanguageSwitcher: React.FC<{
  variant: 'header' | 'drawer' | 'footer';
  /** Header colour: normal bar, or white on a see-through / brand-coloured header */
  tone?: 'default' | 'light' | 'brand';
  className?: string;
  onChanged?: () => void;
}> = ({ variant, tone = 'default', className = '', onChanged }) => {
  const { lang, setLang, config, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const where = variant === 'header' ? config.showInHeader : variant === 'drawer' ? config.showInDrawer : config.showInFooter;
  if (!config.enabled || !where || config.languages.length < 2) return null;

  const choose = (code: LangCode) => {
    setLang(code);
    setOpen(false);
    onChanged?.();
  };
  const current = LANGUAGES[lang];

  /* ------------------------------------------------------------- drawer */
  if (variant === 'drawer') {
    return (
      <section className={className} translate="no">
        <h3 className="flex items-center gap-2 px-1 pb-2 text-[13px] font-(--ds-fw-bold) uppercase tracking-[0.08em] text-(--ds-text-soft)">
          <Globe className="w-4 h-4" />
          {t('Language')}
        </h3>
        <div role="radiogroup" aria-label={t('Language')} className="flex flex-wrap gap-2">
          {config.languages.map((code) => {
            const info = LANGUAGES[code];
            const on = code === lang;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={on}
                lang={info.tag}
                dir={info.dir}
                onClick={() => choose(code)}
                className={`inline-flex items-center gap-2 h-11 ps-1.5 pe-3.5 rounded-full border text-[14px] font-(--ds-fw-semibold) whitespace-nowrap transition-colors cursor-pointer ${
                  on
                    ? 'border-(--primary) bg-(--primary) text-(--primary-foreground)'
                    : 'border-(--ds-border) bg-(--ds-surface) text-(--ds-text) active:bg-(--ds-surface-3)'
                }`}
              >
                <span
                  className={`w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-[13px] font-(--ds-fw-bold) ${
                    on ? 'bg-white/20' : 'bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary-ink,var(--primary))'
                  }`}
                >
                  {info.mark}
                </span>
                <span>{info.native}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------- footer */
  if (variant === 'footer') {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-x-1 gap-y-1 ${className}`} translate="no" role="group" aria-label={t('Language')}>
        <Globe className="w-4 h-4 me-1 opacity-80" aria-hidden />
        {config.languages.map((code, index) => {
          const info = LANGUAGES[code];
          const on = code === lang;
          return (
            <React.Fragment key={code}>
              {index > 0 && <span aria-hidden className="opacity-40 px-0.5">·</span>}
              <button
                type="button"
                lang={info.tag}
                aria-pressed={on}
                onClick={() => choose(code)}
                className={`px-1.5 py-1 rounded-(--ds-r-sm) cursor-pointer transition-colors ${
                  on ? 'font-(--ds-fw-bold) text-(--footer-heading,inherit) underline underline-offset-4 decoration-2' : 'hover:text-(--footer-link-hover,inherit)'
                }`}
              >
                {info.native}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  /* ------------------------------------------------------------- header */
  const onDark = tone !== 'default';
  return (
    <div ref={boxRef} className={`relative ${className}`} translate="no">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t('Language')}: ${current.native}`}
        title={t('Language')}
        className={`inline-flex items-center gap-1.5 h-(--ds-h-lg) ps-2.5 pe-2 rounded-full border transition-colors cursor-pointer ${
          onDark
            ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
            : 'border-(--ds-border) bg-(--ds-surface) text-(--ds-text) hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]'
        }`}
      >
        <Globe className={`w-[18px] h-[18px] ${onDark ? '' : 'text-(--primary)'}`} />
        <span lang={current.tag} className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
          <span className="xl:hidden uppercase">{current.code}</span>
          <span className="hidden xl:inline">{current.native}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('Language')}
          className="ds-scale-in absolute end-0 top-full mt-(--ds-s-2) w-60 p-1.5 rounded-(--ds-r-lg) bg-(--ds-surface) border border-(--ds-border) shadow-(--ds-shadow-lg) z-(--ds-z-dropdown) text-(--ds-text)"
        >
          <p className="px-2.5 pt-1.5 pb-2 text-(length:--ds-fs-xs) font-(--ds-fw-bold) uppercase tracking-[0.08em] text-(--ds-text-muted)">{t('Choose language')}</p>
          {config.languages.map((code) => {
            const info = LANGUAGES[code];
            const on = code === lang;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => choose(code)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-(--ds-r-md) text-start cursor-pointer transition-colors ${
                  on ? 'bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]' : 'hover:bg-(--ds-surface-3)'
                }`}
              >
                <span
                  lang={info.tag}
                  className={`w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center text-[14px] font-(--ds-fw-bold) ${
                    on ? 'bg-(--primary) text-(--primary-foreground)' : 'bg-(--ds-surface-3) text-(--ds-text-soft)'
                  }`}
                >
                  {info.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span lang={info.tag} dir={info.dir} className="block text-(length:--ds-fs-md) font-(--ds-fw-semibold) leading-tight">
                    {info.native}
                  </span>
                  <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted)">{info.name}</span>
                </span>
                {on && <Check className="w-4 h-4 shrink-0 text-(--primary)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
