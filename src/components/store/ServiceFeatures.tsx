import React from 'react';
import {
  ShieldCheck,
  Truck,
  Headphones,
  RotateCcw,
  BadgeCheck,
  Clock,
  CreditCard,
  Gift,
  Stethoscope,
  PackageCheck,
} from 'lucide-react';
import { ServiceFeaturesConfig } from '../../types/index.ts';

/** Icon names the dashboard offers, resolved to real components */
const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  ShieldCheck,
  Truck,
  Headphones,
  RotateCcw,
  BadgeCheck,
  Clock,
  CreditCard,
  Gift,
  Stethoscope,
  PackageCheck,
};

/**
 * The trust cards above the footer. Every card — icon, title and text — comes
 * from Dashboard → Website → Footer & Social; with nothing saved there the
 * strip is simply not shown.
 */
export const ServiceFeatures: React.FC<{ config?: ServiceFeaturesConfig }> = ({ config }) => {
  if (!config || config.isEnabled === false) return null;

  const items = (config.items || []).filter((item) => item.isActive !== false && (item.title || item.description));
  if (items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-(--ds-s-3) sm:gap-(--ds-s-4)">
        {items.map((item, index) => {
          const Icon = ICONS[item.icon] || ShieldCheck;
          return (
            <div
              key={item.id || index}
              className="ds-card ds-card-hover h-full p-(--ds-card-pad-sm) flex items-start gap-(--ds-s-3)"
            >
              <span className="w-11 h-11 shrink-0 rounded-(--ds-r-md) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
                <Icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                {item.title && (
                  <h3 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) leading-snug">{item.title}</h3>
                )}
                {item.description && (
                  <p className="mt-(--ds-s-1) text-(length:--ds-fs-sm) text-(--ds-text-muted) leading-(--ds-lh-bn)">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
