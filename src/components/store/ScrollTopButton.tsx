import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { SiteSettings } from '../../types/index.ts';

/**
 * v3.11 — "Back to top" button.
 *
 * Appears once the visitor has scrolled down a little, shows how far down the
 * page they are (the ring fills up), and glides back to the top on a tap.
 * It always sits ABOVE whatever is fixed at the bottom of the screen — the
 * phone menu bar, the product page's buy bar — and above the chat button
 * when that is in the same corner, so it never covers either of them.
 *
 * Dashboard → Website → Footer & Social → Back-to-top button.
 */

export interface ScrollTopConfig {
  enabled?: boolean;
  /** Which side of the screen */
  position?: 'right' | 'left';
  /** Show on phones too */
  showOnMobile?: boolean;
}

/** Pages with their own bottom controls (or none at all) */
const HIDDEN_ON = ['checkout', 'pos', 'admin', 'dashboard', 'landing', 'order-success', 'payment-result'];

const RING = 2 * Math.PI * 21;
const GAP = 14;

export const ScrollTopButton: React.FC<{ settings?: SiteSettings; currentView: string }> = ({ settings, currentView }) => {
  const cfg: ScrollTopConfig = (settings as any)?.scroll_top_config || {};
  const enabled = cfg.enabled !== false && !HIDDEN_ON.includes(currentView);
  const side = cfg.position === 'left' ? 'left' : 'right';
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(GAP);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const ringRef = useRef<SVGCircleElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    /** How far up the button must sit so nothing fixed at the bottom is covered */
    const measure = () => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      let lift = GAP;
      document.querySelectorAll<HTMLElement>('[data-bottom-bar]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 || rect.top >= height) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        if (rect.bottom >= height - 2) lift = Math.max(lift, height - rect.top + GAP);
      });
      // The chat button in the same corner: stack above it
      document.querySelectorAll<HTMLElement>('[data-chat-widget]').forEach((el) => {
        if (el.dataset.chatWidget !== side) return;
        const rect = el.getBoundingClientRect();
        if (rect.height === 0) return;
        const sameSide = side === 'right' ? rect.right > width / 2 : rect.left < width / 2;
        if (sameSide && rect.top > height / 2) lift = Math.max(lift, height - rect.top + 10);
      });
      setBottom((prev) => (Math.abs(prev - lift) > 1 ? lift : prev));
    };

    const update = () => {
      frame.current = 0;
      const y = window.scrollY || document.documentElement.scrollTop;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, y / max));
      setVisible(y > Math.min(420, window.innerHeight * 0.6));
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING * (1 - progress));
      measure();
    };
    const onScroll = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(update);
    };
    const onResize = () => {
      setMobile(window.innerWidth < 1024);
      onScroll();
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // Bars and the chat button come and go (lazy loading, route changes)
    const timer = window.setInterval(measure, 1500);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearInterval(timer);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [enabled, side, currentView]);

  if (!enabled || (mobile && cfg.showOnMobile === false)) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`scroll-top-btn group fixed z-(--ds-z-sticky) print:hidden w-12 h-12 rounded-(--ds-r-full) inline-flex items-center justify-center bg-(--ds-surface)/95 backdrop-blur-md text-(--primary) shadow-[0_10px_28px_-10px_rgba(19,25,34,0.45)] ring-1 ring-(--ds-border) cursor-pointer transition-[opacity,transform,bottom] duration-300 ease-(--ds-ease) hover:bg-(--primary) hover:text-(--primary-foreground) hover:ring-(--primary) active:scale-90 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      style={{
        [side]: 16,
        bottom: `calc(${bottom}px + ${bottom === GAP ? 'env(safe-area-inset-bottom)' : '0px'})`,
      }}
      tabIndex={visible ? 0 : -1}
    >
      {/* Progress ring: fills as the page is scrolled */}
      <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="3" />
        <circle
          ref={ringRef}
          cx="24"
          cy="24"
          r="21"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING}
          style={{ transition: 'stroke-dashoffset 120ms linear' }}
        />
      </svg>
      <ArrowUp className="relative w-5 h-5 transition-transform duration-300 group-hover:-translate-y-0.5" strokeWidth={2.4} />
    </button>
  );
};
