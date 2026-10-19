import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { splitAccent } from '../../../lib/glowTheme.ts';
import { useT } from '../../../lib/i18n.tsx';
import { StoreLink } from '../Header.tsx';
import { responsiveImg } from '../../../lib/img.ts';

type NavigateFn = (view: string, params?: any) => void;

/**
 * v3.13 — small shared parts of the Glow theme.
 * Colours: --primary (the shop colour) and --glow-accent (the theme's second
 * colour, Dashboard → Website → Themes), with readable shades
 * --glow-accent-ink (text on white) and --glow-accent-fg (text on the accent).
 */

/** A title whose *starred* words are drawn in the accent colour (translated first) */
export const AccentTitle: React.FC<{
  title: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  /** Accent class (default: the accent ink colour) */
  accentClass?: string;
  /** Text colour of the plain words (headings are dark by default, see index.css) */
  color?: string;
}> = ({ title, as: Tag = 'h2', className = '', accentClass = 'text-(--glow-accent-title)', color }) => {
  const t = useT();
  const parts = splitAccent(t(title));
  if (!parts.length) return null;
  return (
    <Tag className={className} style={color ? { color } : undefined}>
      {parts.map((part, index) =>
        part.accent ? (
          <span key={index} className={accentClass}>
            {part.text}
          </span>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </Tag>
  );
};

/** Small heading above a title: "FAQs", "New Arrival" … */
export const Eyebrow: React.FC<{ text?: string; className?: string }> = ({ text, className = '' }) => {
  const t = useT();
  if (!text) return null;
  return <p className={`glow-eyebrow ${className}`}>{t(text)}</p>;
};

/** Pill button that follows a dashboard link (inside the shop or another site) */
export const GlowButton: React.FC<{
  to?: string;
  label?: string;
  onNavigate: NavigateFn;
  tone?: 'primary' | 'accent' | 'white' | 'outline';
  size?: 'md' | 'sm';
  className?: string;
  arrow?: boolean;
}> = ({ to, label, onNavigate, tone = 'primary', size = 'md', className = '', arrow = true }) => {
  const t = useT();
  if (!label) return null;
  const tones: Record<string, string> = {
    primary: 'bg-(--primary) text-(--primary-foreground) hover:bg-(--primary-hover)',
    accent: 'bg-(--glow-accent-strong) text-(--glow-accent-fg) hover:brightness-95',
    white: 'bg-white text-(--primary-ink,var(--primary)) hover:bg-white/90',
    outline: 'border border-(--ds-border-strong) bg-(--ds-surface) text-(--ds-text) hover:border-(--primary) hover:text-(--primary)',
  };
  return (
    <StoreLink
      to={to || '/shop'}
      onNavigate={onNavigate}
      className={`group/gb inline-flex items-center justify-center gap-(--ds-s-2) rounded-full font-(--ds-fw-semibold) whitespace-nowrap transition-[background-color,filter,color,border-color] duration-(--ds-dur) ${
        size === 'sm' ? 'h-10 px-(--ds-s-4) text-(length:--ds-fs-sm)' : 'h-12 px-(--ds-s-6) text-(length:--ds-fs-md)'
      } ${tones[tone]} ${className}`}
    >
      {t(label)}
      {arrow && <ArrowRight className="w-4 h-4 transition-transform group-hover/gb:translate-x-0.5 rtl:rotate-180 rtl:group-hover/gb:-translate-x-0.5" />}
    </StoreLink>
  );
};

/* ------------------------------------------------------------- countdown */

/**
 * End time of a countdown: the date set in the dashboard, or — when none is
 * set — midnight tonight, so a "today's deal" runs every day by itself.
 * Returns null when a set date has passed (the section then hides).
 */
export function countdownEnd(endsAt: string | undefined, now = Date.now()): number | null {
  const value = String(endsAt || '').trim();
  if (value) {
    const end = new Date(value).getTime();
    return Number.isFinite(end) && end > now ? end : null;
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

export function useCountdown(end: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!end) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);
  const left = end ? Math.max(0, end - now) : 0;
  const seconds = Math.floor(left / 1000);
  return {
    done: Boolean(end) && left <= 0,
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 04 : 14 : 48 : 18 with Days / Hours / Minutes / Seconds under the numbers */
export const CountdownBoxes: React.FC<{
  end: number | null;
  variant?: 'large' | 'chip';
  className?: string;
}> = ({ end, variant = 'large', className = '' }) => {
  const t = useT();
  const left = useCountdown(end);
  const cells: Array<[number, string, string]> = [
    [left.days, 'Days', 'Days'],
    [left.hours, 'Hours', 'Hours'],
    [left.minutes, 'Minutes', 'Mins'],
    [left.seconds, 'Seconds', 'Sec'],
  ];
  if (variant === 'chip') {
    return (
      <div
        dir="ltr"
        className={`flex items-center justify-between gap-1 px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-lg) bg-(--primary) text-(--primary-foreground) ${className}`}
        aria-label={t('Offer ends in')}
      >
        {cells.map(([value, , short], index) => (
          <React.Fragment key={short}>
            {index > 0 && <span className="opacity-70 font-(--ds-fw-bold)">:</span>}
            <span className="flex flex-col items-center leading-none min-w-0">
              <span className="ds-num text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--glow-accent-on-primary)">{pad(value)}</span>
              <span className="mt-1 text-[10px] opacity-90 truncate">{t(short)}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  }
  return (
    <div dir="ltr" className={`flex items-start justify-center gap-(--ds-s-2) sm:gap-(--ds-s-4) ${className}`} aria-label={t('Offer ends in')}>
      {cells.map(([value, long], index) => (
        <React.Fragment key={long}>
          {index > 0 && <span className="pt-1 text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text-soft)">:</span>}
          <span className="flex flex-col items-center min-w-[3rem] sm:min-w-[4.25rem]">
            <span className="ds-num text-(length:--ds-fs-3xl) sm:text-[40px] font-(--ds-fw-bold) leading-none text-(--ds-text)">{pad(value)}</span>
            <span className="mt-(--ds-s-2) text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-md) text-(--ds-text-soft)">{t(long)}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

/** Picture with a soft frame, or a quiet stand-in when none is uploaded */
export const GlowPicture: React.FC<{
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  width?: number;
}> = ({ src, alt = '', className = '', imgClassName = 'w-full h-full object-cover', sizes = '(min-width: 1024px) 600px, 100vw', width = 800 }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} overflow-hidden ${className}`}>
      {src && !broken ? (
        <img
          {...responsiveImg(src, sizes, width)}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.removeAttribute('srcset');
            setBroken(true);
          }}
          className={imgClassName}
        />
      ) : (
        <div className="absolute inset-0 glow-placeholder" aria-hidden />
      )}
    </div>
  );
};
