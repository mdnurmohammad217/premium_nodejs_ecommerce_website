import React, { useEffect, useState } from 'react';
import {
  LayoutTemplate,
  ListChecks,
  Star,
  ShieldCheck,
  Smartphone,
  PlayCircle,
  Ruler,
  LayoutGrid,
  Save,
  Check,
  ArrowRight,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Toggle, useToasts, mix } from './ui.tsx';
import { ProductPageConfig, SiteSettings } from '../../types/index.ts';

const DEFAULTS: Required<ProductPageConfig> = {
  showSpecifications: true,
  showReviews: true,
  allowReviews: true,
  reviewsRequireApproval: false,
  stickyBuyBar: true,
  showVideo: true,
  showRelated: true,
  showSizeGuide: true,
  descriptionTitle: '',
  descriptionTabLabel: '',
  howToUseTabLabel: '',
};

/** A phone outline showing what the sticky bar switch changes */
const PhonePreview: React.FC<{ sticky: boolean }> = ({ sticky }) => (
  <div
    className="relative mx-auto overflow-hidden"
    style={{ width: 170, height: 300, borderRadius: 26, border: '6px solid #0f172a', background: 'var(--a-surface-2)' }}
    aria-hidden
  >
    <div style={{ height: 120, background: mix('var(--primary)', 0.14) }} />
    <div className="p-2.5 space-y-1.5">
      <div style={{ height: 9, width: '80%', borderRadius: 4, background: 'var(--a-border)' }} />
      <div style={{ height: 9, width: '50%', borderRadius: 4, background: 'var(--a-border)' }} />
      <div style={{ height: 16, width: '40%', borderRadius: 4, background: mix('var(--primary)', 0.3) }} />
      <div style={{ height: 30, borderRadius: 6, background: 'var(--a-border)' }} />
    </div>
    {sticky ? (
      <div className="absolute inset-x-0 bottom-0 flex gap-1.5 p-2" style={{ background: 'var(--a-surface)', boxShadow: '0 -6px 14px -8px rgba(15,23,42,.35)' }}>
        <span className="flex-1 inline-flex items-center justify-center gap-1" style={{ height: 26, borderRadius: 6, background: mix('var(--primary)', 0.14), color: 'var(--primary-ink, var(--primary))', fontSize: 9, fontWeight: 700 }}>
          <ShoppingCart className="w-3 h-3" /> Cart
        </span>
        <span className="flex-1 inline-flex items-center justify-center gap-1" style={{ height: 26, borderRadius: 6, background: 'var(--primary)', color: '#fff', fontSize: 9, fontWeight: 700 }}>
          <Zap className="w-3 h-3" /> Buy
        </span>
      </div>
    ) : (
      <div className="absolute inset-x-0 bottom-0 flex justify-around p-2" style={{ background: 'var(--a-surface)', borderTop: '1px solid var(--a-border)' }}>
        {[0, 1, 2, 3].map((n) => (
          <span key={n} style={{ width: 16, height: 16, borderRadius: 5, background: 'var(--a-border)' }} />
        ))}
      </div>
    )}
  </div>
);

/**
 * Product Page — switches for the single product page: which tabs show,
 * how reviews work, and the sticky Add to Cart / Buy Now bar on phones.
 */
export const AdminProductPageTab: React.FC<{
  settings: SiteSettings;
  onSave: (updated: SiteSettings) => Promise<void> | void;
  onOpenTab?: (tab: string) => void;
}> = ({ settings, onSave, onOpenTab }) => {
  const toasts = useToasts();
  const [config, setConfig] = useState<Required<ProductPageConfig>>({ ...DEFAULTS, ...(settings.product_page_config || {}) } as Required<ProductPageConfig>);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig({ ...DEFAULTS, ...(settings.product_page_config || {}) } as Required<ProductPageConfig>);
  }, [settings.product_page_config]);

  const set = (key: keyof ProductPageConfig, value: boolean | string) => {
    setSaved(false);
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...settings, product_page_config: config });
      setSaved(true);
      toasts.push('Product page settings saved.');
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      toasts.push('Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const row = (key: keyof ProductPageConfig, label: string, description: string, disabled = false) => (
    <div className="py-3 first:pt-0 last:pb-0" style={{ borderTop: '1px solid var(--a-border)' }}>
      <Toggle checked={Boolean(config[key])} onChange={(value) => set(key, value)} label={label} description={description} disabled={disabled} />
    </div>
  );

  return (
    <div>
      {toasts.node}
      <PageHeader
        title="Product Page"
        subtitle="Choose what the single product page shows — tabs, reviews, video, size guide and the sticky buy bar on phones."
        icon={LayoutTemplate}
        accent="var(--ds-indigo)"
        actions={
          <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
            {saved ? 'Saved' : 'Save changes'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-5">
          <Card accent="var(--ds-indigo)">
            <CardHeader title="Tabs under the product" subtitle="Description always shows. Turn the other tabs on or off." icon={ListChecks} accent="var(--ds-indigo)" />
            <div>
              {row('showSpecifications', 'Specifications tab', 'Brand, generic name, unit, dosage, SKU, batch and expiry.')}
              {row('showReviews', 'Reviews tab', 'Star rating summary and customer reviews. Also shows the rating near the product name.')}
            </div>
            <div className="mt-4 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--a-border)' }}>
              {(
                [
                  ['descriptionTabLabel', 'Description tab name', 'Description'],
                  ['descriptionTitle', 'Heading inside the tab', 'পণ্যের বিবরণ'],
                  ['howToUseTabLabel', '“How to use” tab name', 'How To Use'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key} className="block">
                  <span className="a-label">{label}</span>
                  <input
                    className="a-field"
                    value={String((config as any)[key] || '')}
                    placeholder={placeholder}
                    onChange={(event) => {
                      setSaved(false);
                      setConfig((current) => ({ ...current, [key]: event.target.value }));
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="mt-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              The highlights (icon + text) and the “How to use” text are set on each product: Products → edit → General.
            </p>
          </Card>

          <Card accent="var(--ds-amber)">
            <CardHeader
              title="Customer reviews"
              subtitle="Shoppers can review without signing in; spam is limited automatically."
              icon={Star}
              accent="var(--ds-amber)"
              actions={
                onOpenTab && (
                  <Button size="sm" iconRight={ArrowRight} onClick={() => onOpenTab('reviews')}>
                    Manage reviews
                  </Button>
                )
              }
            />
            <div>
              {row('allowReviews', 'Let customers write reviews', 'Shows a “Write a review” form in the Reviews tab.', !config.showReviews)}
              {row('reviewsRequireApproval', 'New reviews wait for my approval', 'Reviews appear only after you publish them in Products → Reviews.', !config.showReviews || !config.allowReviews)}
            </div>
            <p className="mt-3 inline-flex items-start gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" /> One device can send at most 5 reviews an hour and one per product a day.
            </p>
          </Card>

          <Card accent="var(--ds-teal)">
            <CardHeader title="Media and extras" icon={PlayCircle} accent="var(--ds-teal)" />
            <div>
              {row('showVideo', 'Product video', 'YouTube, Facebook or mp4 link added on the product form — plays inside the photo gallery.')}
              {row('showSizeGuide', 'Size guide button', 'Shown when the product has a size guide (Products → Size Guides).')}
              {row('showRelated', 'Related products', 'A row of products from the same category under the page.')}
            </div>
            {onOpenTab && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={Ruler} onClick={() => onOpenTab('size-guides')}>
                  Size guides
                </Button>
                <Button size="sm" icon={LayoutGrid} onClick={() => onOpenTab('product-card')}>
                  Product card & button text
                </Button>
              </div>
            )}
          </Card>
        </div>

        <Card accent="var(--primary)" className="xl:sticky" >
          <CardHeader title="Sticky buy bar (phones)" subtitle="Add to Cart and Buy Now stay at the bottom of the screen while shoppers scroll." icon={Smartphone} />
          <Toggle checked={config.stickyBuyBar} onChange={(value) => set('stickyBuyBar', value)} label="Show the sticky bar" description="When off, the normal bottom menu shows instead." />
          <div className="mt-4">
            <PhonePreview sticky={config.stickyBuyBar} />
          </div>
        </Card>
      </div>
    </div>
  );
};
