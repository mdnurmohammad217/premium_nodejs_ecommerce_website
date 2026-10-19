import React, { useEffect, useState } from 'react';
import {
  Globe,
  Save,
  Zap,
  LayoutGrid,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Share2,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  Button,
  Field,
  Toggle,
  Select,
  IconButton,
  EmptyState,
  useToasts,
  tint,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { SiteSettings, SeoConfig } from '../../types/index.ts';

interface PanelProps {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
}

const hideBroken = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.style.display = 'none';
};

/* -------------------------------------------------------------------------- */
/* Browser tab title / meta / link-share preview                               */
/* -------------------------------------------------------------------------- */

type SeoDraft = Required<Omit<SeoConfig, 'faviconUrl'>>;

const DEFAULT_SEO: SeoDraft = {
  siteTitle: '',
  titleSuffix: '',
  metaDescription: '',
  metaKeywords: '',
  ogImageUrl: '',
};

const pickSeo = (seo?: SeoConfig): SeoDraft => ({
  siteTitle: seo?.siteTitle || '',
  titleSuffix: seo?.titleSuffix || '',
  metaDescription: seo?.metaDescription || '',
  metaKeywords: seo?.metaKeywords || '',
  ogImageUrl: seo?.ogImageUrl || '',
});

const PreviewLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    className="block font-semibold mb-1.5"
    style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
  >
    {children}
  </span>
);

/**
 * Browser tab title, meta description, keywords and the share image.
 *
 * The server writes these into <head> for crawlers (Facebook, WhatsApp,
 * Google), falling back to the store name, the store tagline and the desktop
 * logo when a field is blank. The previews use the same fallbacks so what the
 * owner sees here is what a shared link actually unfurls as. The favicon is
 * edited next to the logo, so this panel never writes it.
 */
export const AdminSiteMetaPanel: React.FC<PanelProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [draft, setDraft] = useState<SeoDraft>(() => ({ ...DEFAULT_SEO, ...pickSeo(settings.seo_config) }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...DEFAULT_SEO, ...pickSeo(settings.seo_config) });
  }, [settings.seo_config]);

  const set = (patch: Partial<SeoDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, seo_config: { ...(settings.seo_config || {}), ...draft } });
      toasts.push('SEO and share preview saved.');
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const storeName = String(
    settings.general?.storeName || settings.logo_config?.pharmacyName || ''
  ).trim();
  const shareTitle = draft.siteTitle.trim() || storeName || 'Your store name';
  const shareDescription = draft.metaDescription.trim() || String(settings.general?.tagline || '').trim();
  const shareImage = draft.ogImageUrl || settings.logo_config?.desktopLogoUrl || '';
  const faviconUrl = settings.seo_config?.faviconUrl || '';
  const domain = typeof window !== 'undefined' ? window.location.host : '';
  const tabCaption = `${shareTitle}${draft.titleSuffix ? ` ${draft.titleSuffix}` : ''}`;
  const descLength = draft.metaDescription.length;
  const descTone =
    descLength === 0
      ? 'var(--a-text-muted)'
      : descLength > 160
      ? 'var(--ds-danger-text)'
      : descLength >= 110
      ? 'var(--ds-success-text)'
      : 'var(--ds-warning-text)';

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="SEO & Link Sharing"
        subtitle="What appears in the browser tab, Google search and links shared on Facebook/WhatsApp."
        icon={Globe}
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving}>
            Save
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-5">
        {/* ---------------------------------------------------------- form */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Browser Tab Title" hint="Shown in the browser tab and as the search result title.">
              <input
                className="a-field"
                value={draft.siteTitle}
                onChange={(e) => set({ siteTitle: e.target.value })}
                placeholder={storeName || 'Your store name'}
              />
            </Field>
            <Field label="Title Suffix" hint="Added to the end of inner page titles, e.g. “| Store Name”.">
              <input
                className="a-field"
                value={draft.titleSuffix}
                onChange={(e) => set({ titleSuffix: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <label className="a-label">Meta Description</label>
            <textarea
              className="a-field"
              rows={3}
              value={draft.metaDescription}
              onChange={(e) => set({ metaDescription: e.target.value })}
              placeholder="Describe your store in one or two lines"
            />
            <div
              className="flex items-center justify-between gap-2 mt-1"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
            >
              <span>140–160 characters works best</span>
              <span className="ds-num font-semibold" style={{ color: descTone }}>
                {descLength}/160
              </span>
            </div>
          </div>

          <Field label="Meta Keywords" hint="Separate with commas.">
            <input
              className="a-field"
              value={draft.metaKeywords}
              onChange={(e) => set({ metaKeywords: e.target.value })}
              placeholder="e.g. online pharmacy, medicine, home delivery"
            />
          </Field>

          <Field
            label="Share Image (OG Image)"
            hint="Recommended size 1200 × 630 px. The desktop logo is used if left empty."
          >
            <MediaPicker
              value={draft.ogImageUrl}
              onChange={(url) => set({ ogImageUrl: url })}
              modalTitle="Select Share Image"
            />
          </Field>
        </div>

        {/* ------------------------------------------------------ previews */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4 space-y-4">
            <div>
              <PreviewLabel>Browser Tab</PreviewLabel>
              <div
                className="flex items-end px-3 pt-2"
                style={{ background: 'var(--ds-surface-3)', borderRadius: 'var(--ds-r-md)' }}
              >
                <span
                  className="flex items-center gap-2 min-w-0 px-3 py-2"
                  style={{
                    maxWidth: '100%',
                    width: 260,
                    background: 'var(--ds-surface)',
                    borderRadius: 'var(--ds-r-sm) var(--ds-r-sm) 0 0',
                  }}
                >
                  <span
                    className="shrink-0 overflow-hidden inline-flex items-center justify-center"
                    style={{ width: 16, height: 16, borderRadius: 'var(--ds-r-xs)', background: tint(0.14) }}
                  >
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt=""
                        loading="lazy"
                        onError={hideBroken}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Globe className="w-3 h-3" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                    )}
                  </span>
                  <span className="truncate flex-1 font-medium" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    {tabCaption}
                  </span>
                  <X className="w-3 h-3 shrink-0" style={{ color: 'var(--a-text-muted)' }} />
                </span>
              </div>
            </div>

            <div>
              <PreviewLabel>Google Search Result</PreviewLabel>
              <div
                style={{
                  padding: 'var(--ds-s-3)',
                  borderRadius: 'var(--ds-r-md)',
                  border: '1px solid var(--a-border)',
                  background: 'var(--ds-surface)',
                }}
              >
                <span className="block truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-soft)' }}>
                  {domain}
                </span>
                <span
                  className="block ds-clamp-1 font-medium"
                  style={{ fontSize: 'var(--ds-fs-lg)', color: 'var(--ds-info-text)' }}
                >
                  {shareTitle}
                </span>
                <span
                  className="block ds-clamp-2"
                  style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}
                >
                  {shareDescription || 'Your meta description will appear here.'}
                </span>
              </div>
            </div>

            <div>
              <PreviewLabel>Facebook / WhatsApp Link Share</PreviewLabel>
              <div
                className="overflow-hidden"
                style={{
                  borderRadius: 'var(--ds-r-md)',
                  border: '1px solid var(--a-border)',
                  background: 'var(--ds-surface)',
                  boxShadow: 'var(--ds-shadow-xs)',
                }}
              >
                <div
                  className="relative flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: '1.91 / 1', background: 'var(--ds-surface-3)' }}
                >
                  <ImageIcon className="w-8 h-8 absolute" style={{ color: 'var(--a-text-faint)' }} />
                  {shareImage && (
                    <img
                      key={shareImage}
                      src={shareImage}
                      alt=""
                      loading="lazy"
                      onError={hideBroken}
                      className="relative w-full h-full"
                      style={{
                        objectFit: draft.ogImageUrl ? 'cover' : 'contain',
                        background: 'var(--ds-surface)',
                        padding: draft.ogImageUrl ? 0 : 'var(--ds-s-6)',
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    padding: 'var(--ds-s-2) var(--ds-s-3) var(--ds-s-3)',
                    background: 'var(--ds-surface-2)',
                    borderTop: '1px solid var(--a-border)',
                  }}
                >
                  <span
                    className="block truncate uppercase"
                    style={{ fontSize: 'var(--a-fs-2xs)', color: 'var(--a-text-muted)', letterSpacing: 'var(--ds-tracking-wide)' }}
                  >
                    {domain}
                  </span>
                  <span className="block font-bold ds-clamp-2" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {shareTitle}
                  </span>
                  {shareDescription && (
                    <span
                      className="block ds-clamp-1"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                    >
                      {shareDescription}
                    </span>
                  )}
                </div>
              </div>
              <p
                className="flex items-start gap-1.5 mt-2"
                style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
              >
                <Share2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This is exactly how your site link looks when shared on Facebook, Messenger or WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/* The four trust cards above the footer                                       */
/* -------------------------------------------------------------------------- */

const ICON_CHOICES = [
  'ShieldCheck',
  'Truck',
  'Headphones',
  'RotateCcw',
  'BadgeCheck',
  'Clock',
  'CreditCard',
  'Gift',
  'Stethoscope',
  'PackageCheck',
];

const newFeature = () => ({
  id: `f${Date.now().toString(36)}`,
  icon: 'ShieldCheck',
  title: '',
  description: '',
  isActive: true,
});

/** Editor for the four content cards that sit just above the footer. */
export const AdminServiceFeaturesPanel: React.FC<PanelProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [draft, setDraft] = useState<any>(
    settings.service_features || { isEnabled: true, items: [] }
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.service_features) setDraft(settings.service_features);
  }, [settings.service_features]);

  const items: any[] = Array.isArray(draft.items) ? draft.items : [];

  const update = (index: number, patch: any) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    setDraft({ ...draft, items: next });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, items: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, service_features: draft });
      toasts.push('Feature cards saved.');
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addCard = () => setDraft({ ...draft, items: [...items, newFeature()] });

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Footer Feature Cards"
        subtitle="Trust cards shown just above the footer."
        icon={LayoutGrid}
        actions={
          <>
            <Button icon={Plus} onClick={addCard} disabled={items.length >= 6}>
              <span className="hidden sm:inline">Add Card</span>
            </Button>
            <Button variant="primary" icon={Save} onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <Toggle
          checked={draft.isEnabled !== false}
          onChange={(value) => setDraft({ ...draft, isEnabled: value })}
          label="Show This Section on the Storefront"
        />
      </div>

      {items.length === 0 ? (
        <div
          style={{ borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--a-border-strong)' }}
        >
          <EmptyState
            icon={LayoutGrid}
            title="No cards yet"
            description="Add up to four cards, such as fast delivery or a genuine product guarantee."
            action={
              <Button icon={Plus} onClick={addCard}>
                Add Card
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {items.map((item, index) => (
            <div
              key={item.id || index}
              style={{
                padding: 'var(--ds-s-4)',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <span className="font-bold flex-1 ds-num" style={{ fontSize: 'var(--a-fs-md)' }}>
                  Card {index + 1}
                </span>
                <Toggle
                  checked={item.isActive !== false}
                  onChange={(value) => update(index, { isActive: value })}
                  label="Active"
                />
                <IconButton
                  icon={ChevronUp}
                  size="sm"
                  tone="plain"
                  label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  icon={ChevronDown}
                  size="sm"
                  tone="plain"
                  label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  tone="danger"
                  label="Delete card"
                  onClick={() => setDraft({ ...draft, items: items.filter((_, i) => i !== index) })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Icon">
                  <Select
                    value={item.icon || 'ShieldCheck'}
                    onChange={(value) => update(index, { icon: value })}
                    options={ICON_CHOICES.map((name) => ({ value: name, label: name }))}
                  />
                </Field>
                <Field label="Title" className="sm:col-span-2">
                  <input
                    className="a-field"
                    value={item.title || ''}
                    onChange={(e) => update(index, { title: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Description" className="mt-3">
                <textarea
                  className="a-field"
                  rows={2}
                  value={item.description || ''}
                  onChange={(e) => update(index, { description: e.target.value })}
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/* Today's Flash Sale                                                          */
/* -------------------------------------------------------------------------- */

/** On/off switch and copy for the Today's Flash Sale strip. */
export const AdminFlashSalePanel: React.FC<PanelProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [draft, setDraft] = useState<any>(settings.flash_sale_config || { isEnabled: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.flash_sale_config) setDraft(settings.flash_sale_config);
  }, [settings.flash_sale_config]);

  const save = async () => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, flash_sale_config: draft });
      toasts.push('Flash sale settings saved.');
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Today's Flash Sale"
        subtitle="Turn the homepage flash sale strip on or off and edit its text."
        icon={Zap}
        accent="var(--ds-amber)"
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving}>
            Save
          </Button>
        }
      />

      <div className="mb-4">
        <Toggle
          checked={draft.isEnabled !== false}
          onChange={(value) => setDraft({ ...draft, isEnabled: value })}
          label="Show Flash Sale Section"
          description="When off, the whole strip is hidden from the homepage."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Heading">
          <input
            className="a-field"
            value={draft.heading || ''}
            onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
          />
        </Field>
        <Field label="Badge Text">
          <input
            className="a-field"
            value={draft.badgeText || ''}
            onChange={(e) => setDraft({ ...draft, badgeText: e.target.value })}
          />
        </Field>
        <Field label="Subheading" className="sm:col-span-2 lg:col-span-1">
          <input
            className="a-field"
            value={draft.subheading || ''}
            onChange={(e) => setDraft({ ...draft, subheading: e.target.value })}
          />
        </Field>
        <Field label="Countdown (Hours)" hint="How many hours the timer runs each day.">
          <input
            type="number"
            min={1}
            max={72}
            className="a-field ds-num"
            value={draft.countdownHours ?? 14}
            onChange={(e) => setDraft({ ...draft, countdownHours: Number(e.target.value) })}
          />
        </Field>
        <Field label="Max Products">
          <input
            type="number"
            min={1}
            max={24}
            className="a-field ds-num"
            value={draft.maxProducts ?? 8}
            onChange={(e) => setDraft({ ...draft, maxProducts: Number(e.target.value) })}
          />
        </Field>
      </div>
    </Card>
  );
};
