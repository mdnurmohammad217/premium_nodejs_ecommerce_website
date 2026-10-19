import React from 'react';
import { Phone, MapPin, Truck, Megaphone } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';

interface TopBarProps {
  settings?: SiteSettings;
  onTrackOrder?: () => void;
  onOpenPos?: () => void;
  onOpenAdmin?: () => void;
}

/** Readable text colour for a background the owner picked */
const contrastText = (hex: string): string => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
};

/**
 * The thin strip above the header (Dashboard → Website → Header & Logo).
 *
 * Two modes, and only ever one of them on screen:
 * - Info: address, hotline and the shipping message.
 * - News ticker: one line of text scrolling right to left without end.
 * Background and text colour are chosen in the dashboard.
 */
export const TopBar: React.FC<TopBarProps> = ({ settings }) => {
  const topbar = settings?.topbar;
  const general = settings?.general;

  if (topbar?.enabled === false) return null;

  const mode = topbar?.mode === 'ticker' ? 'ticker' : 'info';
  const bg = (topbar?.bgColor || '').trim();
  const text = (topbar?.textColor || '').trim() || (bg ? contrastText(bg) : '');
  const style: React.CSSProperties = bg ? { background: bg, color: text } : {};
  const colourClass = bg ? '' : 'bg-(--ds-gray-900) text-(--ds-gray-300)';
  const visibility = topbar?.showOnMobile === false ? 'hidden md:block' : 'block';
  const accent = bg ? 'currentColor' : 'var(--primary)';

  if (mode === 'ticker') {
    const message = (topbar?.tickerText || '').trim();
    if (!message) return null;
    // Speed is "seconds for one pass"; the text is duplicated so the loop is seamless
    const seconds = Math.min(120, Math.max(8, Number(topbar?.tickerSpeed) || 30));
    return (
      <div
        className={`${visibility} ${colourClass} text-(length:--ds-fs-sm) overflow-hidden`}
        style={style}
        role="marquee"
        aria-label={message}
      >
        <div className="ticker-viewport h-9 flex items-center">
          <div className="ticker-track" style={{ animationDuration: `${seconds}s` }} aria-hidden>
            {[0, 1].map((copy) => (
              <span key={copy} className="ticker-item">
                {Array.from({ length: 3 }).map((_, index) => (
                  <span key={index} className="inline-flex items-center gap-(--ds-s-2) pr-(--ds-s-16)">
                    <Megaphone className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
                    <span className="font-(--ds-fw-medium) whitespace-nowrap">{message}</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const address = (general?.address || topbar?.addressText || '').trim();
  const phone = (general?.phone || general?.whatsapp || topbar?.phoneText || '').trim();
  const deliveryMsg = (topbar?.deliveryMessage || '').trim();

  if (!address && !phone && !deliveryMsg) return null;

  return (
    <div className={`${visibility} ${colourClass} text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm)`} style={style}>
      <div className="max-w-7xl mx-auto px-(--ds-s-4) min-h-9 py-(--ds-s-1) flex flex-wrap items-center justify-center md:justify-between gap-x-(--ds-s-6) gap-y-0.5">
        <div className="flex items-center gap-(--ds-s-6) min-w-0">
          {address && (
            <span className="hidden md:inline-flex items-center gap-(--ds-s-2) min-w-0">
              <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
              <span className="truncate">{address}</span>
            </span>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-(--ds-s-2) shrink-0 font-(--ds-fw-semibold) hover:opacity-80 transition-opacity"
              style={bg ? undefined : { color: 'var(--ds-gray-100)' }}
            >
              <Phone className="w-3.5 h-3.5" style={{ color: accent }} />
              <span>
                Hotline: <span className="ds-num">{phone}</span>
              </span>
            </a>
          )}
        </div>
        {/* The shipping message: always shown (it used to be hidden when the line was long) */}
        {deliveryMsg && (
          <span
            className="inline-flex items-center gap-(--ds-s-2) min-w-0 font-(--ds-fw-medium)"
            style={bg ? undefined : { color: 'var(--ds-gray-100)' }}
          >
            <Truck className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
            <span>{deliveryMsg}</span>
          </span>
        )}
      </div>
    </div>
  );
};
