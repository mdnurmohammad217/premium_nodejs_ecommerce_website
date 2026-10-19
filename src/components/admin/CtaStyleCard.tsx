import React, { useEffect, useRef } from 'react';
import { Palette, ShoppingCart, Zap, RotateCcw } from 'lucide-react';
import { Card, CardHeader, Field, Select, Button } from './ui.tsx';
import { applyCtaStyle, DEFAULT_CTA_STYLE, type CtaButtonLook, type CtaStyleConfig } from '../../lib/ctaStyle.ts';
import { isHexColor } from '../../lib/contrast.ts';

const SWATCHES = ['#111111', '#1E4A2C', '#0F8A5F', '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#B8914A', '#F59E0B'];

const ColourRow: React.FC<{
  title: string;
  icon: React.ComponentType<any>;
  value: CtaButtonLook;
  onChange: (next: CtaButtonLook) => void;
}> = ({ title, icon: Icon, value, onChange }) => (
  <div className="p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
        <Icon className="w-4 h-4" /> {title}
      </span>
      {value.bg && (
        <button type="button" onClick={() => onChange({ ...value, bg: '', fg: '' })} className="inline-flex items-center gap-1 cursor-pointer" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
          <RotateCcw className="w-3.5 h-3.5" /> Design's own colour
        </button>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((colour) => (
        <button
          key={colour}
          type="button"
          aria-label={`Colour ${colour}`}
          aria-pressed={value.bg.toLowerCase() === colour.toLowerCase()}
          onClick={() => onChange({ ...value, bg: colour })}
          className="w-7 h-7 cursor-pointer"
          style={{
            borderRadius: 999,
            background: colour,
            boxShadow: value.bg.toLowerCase() === colour.toLowerCase() ? '0 0 0 2px var(--a-surface), 0 0 0 4px var(--primary)' : 'inset 0 0 0 1px rgba(0,0,0,.12)',
          }}
        />
      ))}
      <input
        type="color"
        aria-label={`${title} colour`}
        value={isHexColor(value.bg) ? value.bg : '#111111'}
        onChange={(event) => onChange({ ...value, bg: event.target.value })}
        style={{ width: 34, height: 30, padding: 2, borderRadius: 'var(--ds-r-sm)', border: '1px solid var(--a-border)' }}
      />
      <input
        className="a-field ds-num"
        style={{ width: 110, height: 32 }}
        value={value.bg}
        placeholder="Default"
        onChange={(event) => onChange({ ...value, bg: event.target.value.trim() })}
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Look">
        <Select
          value={value.style}
          onChange={(next) => onChange({ ...value, style: next as CtaButtonLook['style'] })}
          options={[
            { value: 'filled', label: 'Filled' },
            { value: 'outline', label: 'Outline' },
          ]}
        />
      </Field>
      <Field label="Text colour" hint="Empty = black or white, whichever reads best">
        <div className="flex gap-1.5">
          <input
            type="color"
            aria-label={`${title} text colour`}
            value={isHexColor(value.fg) ? value.fg : '#ffffff'}
            onChange={(event) => onChange({ ...value, fg: event.target.value })}
            style={{ width: 34, height: 36, padding: 2, borderRadius: 'var(--ds-r-sm)', border: '1px solid var(--a-border)' }}
          />
          <input className="a-field ds-num" value={value.fg} placeholder="Auto" onChange={(event) => onChange({ ...value, fg: event.target.value.trim() })} />
        </div>
      </Field>
    </div>
  </div>
);

/**
 * v3.15 — Product Card page → "Button colours & text size": the colour of
 * Add to Cart and Buy Now (filled or outline), their text size on cards and on
 * the product page, the weight and the corners. Empty = each design's own.
 */
export const CtaStyleCard: React.FC<{ value: CtaStyleConfig; onChange: (next: CtaStyleConfig) => void }> = ({ value, onChange }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    applyCtaStyle(value, previewRef.current);
  }, [value]);
  const set = (patch: Partial<CtaStyleConfig>) => onChange({ ...value, ...patch });
  const sizes = (from: number, to: number) => [
    { value: '0', label: "Design's own" },
    ...Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: `${from + i} px` })),
  ];

  return (
    <Card>
      <CardHeader
        icon={Palette}
        title="Button colours & text size"
        subtitle="Add to Cart and Buy Now everywhere on the website: product cards, the product page and the bar at the bottom of the phone screen."
        actions={
          <Button size="sm" icon={RotateCcw} onClick={() => onChange(DEFAULT_CTA_STYLE)}>
            Reset
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <ColourRow title="Add to Cart" icon={ShoppingCart} value={value.atc} onChange={(atc) => set({ atc })} />
        <ColourRow title="Buy Now" icon={Zap} value={value.buy} onChange={(buy) => set({ buy })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
        <Field label="Text size on cards">
          <Select value={String(value.cardFontSize)} onChange={(next) => set({ cardFontSize: Number(next) })} options={sizes(11, 18)} />
        </Field>
        <Field label="Text size on product page">
          <Select value={String(value.pageFontSize)} onChange={(next) => set({ pageFontSize: Number(next) })} options={sizes(13, 22)} />
        </Field>
        <Field label="Text weight">
          <Select
            value={value.fontWeight}
            onChange={(next) => set({ fontWeight: next as CtaStyleConfig['fontWeight'] })}
            options={[
              { value: '', label: "Design's own" },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
              { value: '800', label: 'Extra bold' },
            ]}
          />
        </Field>
        <Field label="Corners">
          <Select
            value={value.radius}
            onChange={(next) => set({ radius: next as CtaStyleConfig['radius'] })}
            options={[
              { value: '', label: "Design's own" },
              { value: 'square', label: 'Square' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'pill', label: 'Pill' },
            ]}
          />
        </Field>
      </div>

      {/* live preview (the same classes the website uses) */}
      <div ref={previewRef} className="mt-4 p-4 grid gap-4 sm:grid-cols-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
        <div>
          <p className="mb-2 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
            On a product card
          </p>
          <div className="grid gap-2" style={{ maxWidth: 220 }}>
            <button type="button" className="ds-btn ds-btn-soft cta-atc cta-card ds-btn-block h-(--ds-h-md) text-(length:--ds-fs-sm)">
              <ShoppingCart className="w-4 h-4" /> Add to Cart
            </button>
            <button type="button" className="ds-btn ds-btn-primary cta-buy cta-card ds-btn-block h-(--ds-h-md) text-(length:--ds-fs-sm)">
              <Zap className="w-4 h-4" /> Buy Now
            </button>
          </div>
        </div>
        <div>
          <p className="mb-2 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
            On the product page
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="ds-btn ds-btn-soft cta-atc cta-page ds-btn-lg ds-btn-block text-(length:--ds-fs-md)">
              <ShoppingCart className="w-5 h-5" /> Add to Cart
            </button>
            <button type="button" className="ds-btn ds-btn-primary cta-buy cta-page ds-btn-lg ds-btn-block text-(length:--ds-fs-md)">
              <Zap className="w-5 h-5" /> Buy Now
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};
