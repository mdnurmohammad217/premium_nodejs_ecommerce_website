import type React from 'react';

/**
 * Attention animations for the Buy Now and Place Order buttons.
 *
 * The owner picks one per button in Dashboard -> Product Card -> Button
 * animation; the choice is stored in the `cta_animation_config` setting. The
 * keyframes themselves live in src/index.css (`.cta-anim-*`).
 */

export type CtaAnimation =
  | 'none'
  | 'shake'
  | 'wiggle'
  | 'pulse'
  | 'bounce'
  | 'heartbeat'
  | 'tada'
  | 'glow';

export type CtaTarget = 'buyNow' | 'placeOrder' | 'addToCart';

export interface CtaAnimationConfig {
  buyNow: CtaAnimation;
  placeOrder: CtaAnimation;
  addToCart: CtaAnimation;
  /** seconds between bursts */
  interval: number;
  intensity: 'subtle' | 'normal' | 'strong';
}

export const DEFAULT_CTA_ANIMATION: CtaAnimationConfig = {
  buyNow: 'shake',
  placeOrder: 'shake',
  addToCart: 'none',
  interval: 3.2,
  intensity: 'normal',
};

export const CTA_ANIMATION_OPTIONS: Array<{ id: CtaAnimation; label: string; description: string }> = [
  { id: 'none', label: 'None', description: 'The button stays still' },
  { id: 'shake', label: 'Shake', description: 'A quick side-to-side shake' },
  { id: 'wiggle', label: 'Wiggle', description: 'A small rotating wiggle' },
  { id: 'pulse', label: 'Pulse', description: 'Gently grows and settles' },
  { id: 'bounce', label: 'Bounce', description: 'A short hop upward' },
  { id: 'heartbeat', label: 'Heartbeat', description: 'Two quick beats' },
  { id: 'tada', label: 'Tada', description: 'A playful scale-and-tilt' },
  { id: 'glow', label: 'Glow', description: 'A ring of light radiates outward' },
];

const STRENGTH: Record<CtaAnimationConfig['intensity'], number> = {
  subtle: 0.6,
  normal: 1,
  strong: 1.5,
};

/** Merges whatever is saved with the defaults so a partial setting still works */
export function resolveCtaConfig(raw: any): CtaAnimationConfig {
  const merged = { ...DEFAULT_CTA_ANIMATION, ...(raw && typeof raw === 'object' ? raw : {}) };
  const interval = Number(merged.interval);
  return {
    ...merged,
    interval: Number.isFinite(interval) ? Math.min(10, Math.max(1.5, interval)) : DEFAULT_CTA_ANIMATION.interval,
    intensity: STRENGTH[merged.intensity as keyof typeof STRENGTH] ? merged.intensity : 'normal',
  };
}

/**
 * The className and style to spread onto a button:
 *
 *   const cta = ctaAnimation(settings, 'buyNow');
 *   <button className={`... ${cta.className}`} style={{ ...own, ...cta.style }}>
 */
export function ctaAnimation(
  settings: any,
  target: CtaTarget
): { className: string; style: React.CSSProperties } {
  const config = resolveCtaConfig(settings?.cta_animation_config);
  const kind = config[target];
  if (!kind || kind === 'none') return { className: '', style: {} };
  return {
    className: `cta-anim cta-anim-${kind}`,
    style: {
      ['--cta-interval' as any]: `${config.interval}s`,
      ['--cta-strength' as any]: STRENGTH[config.intensity],
    },
  };
}
