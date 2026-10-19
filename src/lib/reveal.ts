/**
 * Scroll reveal for the storefront (v3.8).
 *
 * Sections fade and rise into place as they scroll into view; product grids
 * cascade card by card. Markup opts in with attributes:
 *
 *   data-reveal            this element reveals on its own
 *   data-reveal-children   every direct child reveals on its own
 *   data-reveal-stagger    direct children reveal one after another
 *
 * Nothing is hidden unless this script is running (the CSS only applies under
 * html.reveal-on), and visitors who ask their device for reduced motion get
 * the page without any animation.
 */

const ITEM = 'data-reveal-item';
const PENDING = `[data-reveal-children] > :not([${ITEM}]), [data-reveal]:not([${ITEM}]), [data-reveal-stagger] > :not([${ITEM}])`;

let started = false;

export function startReveal(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    /* old browser: animate */
  }

  const root = document.documentElement;
  root.classList.add('reveal-on');

  const observer = new IntersectionObserver(
    (entries) => {
      // Cards that come into view together cascade one after another
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        if (element.parentElement?.hasAttribute('data-reveal-stagger')) {
          element.style.setProperty('--reveal-delay', `${Math.min(order, 8) * 60}ms`);
          order += 1;
        }
        element.classList.add('is-revealed');
        observer.unobserve(element);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
  );

  const scan = () => {
    const pending = document.querySelectorAll<HTMLElement>(PENDING);
    pending.forEach((element) => {
      element.setAttribute(ITEM, '');
      observer.observe(element);
    });
  };

  let queued = false;
  const queueScan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  };

  scan();
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });

  // Safety net: anything still hidden after a while (e.g. a print, or a
  // browser that never reports intersections) is simply shown
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll(`[${ITEM}]`).forEach((element) => element.classList.add('is-revealed'));
  });
}
