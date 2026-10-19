import { useEffect, useRef, useState } from 'react';

/**
 * Fly-to-cart.
 *
 * When a product goes into the cart, a copy of its image lifts off from where
 * it sits, arcs toward the cart icon while shrinking, and the icon bounces as
 * it lands. The cart badge holds its old number until that moment, so the count
 * visibly ticks up on arrival.
 *
 * Performance notes, since this runs on every add:
 * - Only `transform` and `opacity` are animated, via the Web Animations API, so
 *   the browser composites the flight on the GPU without touching layout.
 * - The flying element is a clone of the image the customer is looking at. It
 *   reuses the already-decoded source, so nothing new is downloaded.
 * - The clone is `position: fixed` and out of flow: the page never shifts.
 *
 * The cart logic is untouched — callers add the item immediately as before.
 * This module only decides what the customer SEES and when the badge updates.
 */

const FLIGHT_MS = 720;
/** Size the image shrinks to as it reaches the icon */
const LANDING_SIZE = 26;

let pendingFlights = 0;
const landingListeners = new Set<() => void>();

export function isCartFlightPending(): boolean {
  return pendingFlights > 0;
}

/** Subscribe to "an item just landed in the cart"; returns the unsubscribe */
export function onCartLanded(listener: () => void): () => void {
  landingListeners.add(listener);
  return () => {
    landingListeners.delete(listener);
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The cart icon to fly to: whichever element marked `data-cart-target` is
 * actually visible right now — the header cart on desktop, or the bottom-bar
 * cart on a phone when the header one is hidden.
 */
function findCartTarget(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target]'));
  const visible = candidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  });
  // Prefer the header cart when both are on screen
  return (
    visible.find((el) => el.dataset.cartTarget === 'header') ||
    visible[0] ||
    null
  );
}

function bounce(target: HTMLElement | null) {
  if (!target) return;
  target.classList.remove('cart-landing');
  // Force a reflow of this one element so the animation can restart
  void target.offsetWidth;
  target.classList.add('cart-landing');
  const done = () => {
    target.classList.remove('cart-landing');
    target.removeEventListener('animationend', done);
  };
  target.addEventListener('animationend', done);
}

function land(target: HTMLElement | null, onLand?: () => void) {
  pendingFlights = Math.max(0, pendingFlights - 1);
  bounce(target);
  landingListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* a listener failing must not stop the others */
    }
  });
  onLand?.();
}

/** Quadratic Bézier point */
const qb = (p0: number, p1: number, p2: number, t: number) =>
  (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

/**
 * Animate `source` (an image, or an element containing one) into the cart.
 * `onLand` runs when it arrives — use it for anything that should follow the
 * flight, such as opening the cart drawer.
 */
export function flyToCart(source: Element | null | undefined, options: { onLand?: () => void } = {}): void {
  const { onLand } = options;
  const target = findCartTarget();

  pendingFlights += 1;

  const image =
    source instanceof HTMLImageElement
      ? source
      : (source?.querySelector?.('img') as HTMLImageElement | null) || null;

  const from = (image || (source as HTMLElement | null))?.getBoundingClientRect?.();

  // Nothing to fly, nowhere to land, or the visitor asked for less motion:
  // skip the flight but still give the landing feedback.
  if (!from || from.width === 0 || !target || prefersReducedMotion() || typeof document === 'undefined') {
    land(target, onLand);
    return;
  }

  const to = target.getBoundingClientRect();

  // Start from a square the size of the visible image, capped so a huge
  // product-page photo doesn't fill the screen mid-flight.
  const size = Math.min(Math.max(Math.min(from.width, from.height), 48), 180);
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const endX = to.left + to.width / 2;
  const endY = to.top + to.height / 2;

  // The control point sits above the higher of the two ends, which gives the
  // path its arc; the horizontal midpoint is nudged toward the start so the
  // curve rises first and then swoops in.
  const controlX = startX + (endX - startX) * 0.35;
  const controlY = Math.min(startY, endY) - Math.max(90, Math.abs(endX - startX) * 0.25);

  let clone: HTMLElement;
  if (image) {
    const copy = image.cloneNode(false) as HTMLImageElement;
    copy.removeAttribute('id');
    copy.removeAttribute('loading');
    copy.alt = '';
    clone = copy;
  } else {
    const box = document.createElement('div');
    box.style.background = 'var(--primary)';
    clone = box;
  }
  clone.className = 'fly-to-cart-clone';
  clone.setAttribute('aria-hidden', 'true');
  clone.style.width = `${size}px`;
  clone.style.height = `${size}px`;
  document.body.appendChild(clone);

  const endScale = LANDING_SIZE / size;
  const steps = 14;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = qb(startX, controlX, endX, t) - size / 2;
    const y = qb(startY, controlY, endY, t) - size / 2;
    const scale = 1 + (endScale - 1) * t;
    frames.push({
      transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`,
      opacity: t < 0.85 ? 1 : 1 - (t - 0.85) * 3,
      offset: t,
    });
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clone.remove();
    land(target, onLand);
  };

  try {
    const animation = clone.animate(frames, {
      duration: FLIGHT_MS,
      easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)',
      fill: 'forwards',
    });
    animation.onfinish = finish;
    animation.oncancel = finish;
  } catch {
    finish();
    return;
  }

  // Safety net: a backgrounded tab can pause animations; never leave the badge
  // stuck or a clone on the page.
  window.setTimeout(finish, FLIGHT_MS + 400);
}

/**
 * The number a cart badge should show. It follows the real count, except that
 * an increase caused by an in-flight add waits for the landing — and the badge
 * "pops" when it updates.
 */
export function useLandedCartCount(actual: number): { count: number; popKey: number } {
  const [shown, setShown] = useState(actual);
  const [popKey, setPopKey] = useState(0);
  const latest = useRef(actual);
  const shownRef = useRef(actual);
  latest.current = actual;

  const show = (value: number) => {
    if (value === shownRef.current) return;
    if (value > shownRef.current) setPopKey((key) => key + 1);
    shownRef.current = value;
    setShown(value);
  };

  useEffect(() => {
    // An increase from an item still in the air waits for its landing
    if (actual > shownRef.current && isCartFlightPending()) return;
    show(actual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  useEffect(() => onCartLanded(() => show(latest.current)), []);

  return { count: shown, popKey };
}
