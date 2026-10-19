import React, { startTransition, useEffect, useRef, useState } from 'react';

/**
 * v3.12 — draw a home-page section only when it is about to come into view.
 *
 * The home page used to build every section (a few hundred product cards,
 * the brand strip, reviews, blog, videos, footer) before the first picture
 * could appear, which kept slow phones busy for seconds. Sections below the
 * first screen now start as an empty block and are drawn — in small,
 * interruptible slices — once the visitor scrolls within ~1.5 screens of them.
 * Search engines render with a very tall window, so they still see everything.
 */
export const DeferredSection: React.FC<{
  children: React.ReactNode;
  /** Height kept free until the section is drawn */
  minHeight?: number | string;
  /** How early to start drawing, before the section reaches the screen */
  margin?: string;
  className?: string;
}> = ({ children, minHeight = 320, margin = '900px 0px', className }) => {
  const holder = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(() => typeof window === 'undefined' || !('IntersectionObserver' in window));

  useEffect(() => {
    if (show) return;
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          startTransition(() => setShow(true));
        }
      },
      { rootMargin: margin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [show, margin]);

  if (show) return <>{children}</>;
  return <div ref={holder} aria-hidden="true" className={className} style={{ minHeight }} />;
};
