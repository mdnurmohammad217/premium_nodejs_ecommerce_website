import React, { useState } from 'react';
import {
  Save,
  Plus,
  Trash2,
  ShieldCheck,
  Link as LinkIcon,
  Layers,
  Share2,
  Copyright,
  Contact,
  Eye,
  EyeOff,
  Palette,
  Check,
  Pipette,
  AlertTriangle,
  Phone,
  Mail,
  ArrowUp,
  ArrowDown,
  Pencil,
  LayoutGrid,
  GripVertical,
  ArrowUpToLine,
} from 'lucide-react';
import type { ScrollTopConfig } from '../store/ScrollTopButton.tsx';
import { SOCIAL_NETWORKS, BRAND_ICONS } from '../store/BrandIcons.tsx';
import { SocialIcons, socialLinksOf, orderedSocialKeys } from '../store/SocialIcons.tsx';
import { Card, CardHeader, Button, Field, Toggle, IconButton, useToasts } from './ui.tsx';
import { SiteSettings, SocialConfig, FooterLinkItem } from '../../types/index.ts';
import {
  FOOTER_PRESETS,
  CUSTOM_FALLBACK,
  FooterColorPreset,
  FooterSettings,
  hexLuminance,
  resolveFooterScheme,
  orderedFooterSections,
  type FooterSectionId,
} from '../store/Footer.tsx';

interface AdminFooterTabProps {
  settings: SiteSettings;
  onSave: (updated: SiteSettings) => Promise<void>;
}

/**
 * Structural defaults only — the link columns point at routes every store has.
 * Nothing about a particular business (name, phone, licence, credit line) is
 * pre-filled; the storefront falls back to the general store settings instead.
 */
const DEFAULT_FOOTER: FooterSettings = {
  colorPreset: 'brand-dark',
  backgroundColor: '',
  textColor: '',
  autoUseHeaderLogo: true,
  description: '',
  address: '',
  phone: '',
  email: '',
  drugLicense: '',
  copyrightText: '',
  companyCredit: '',
  websiteCredit: '',
  developerName: '',
  creditUrl: '',
  enableCredit: false,
  quickLinksTitle: 'Quick links',
  quickLinks: [
    { id: '1', label: 'Home', url: '/', isActive: true, sortOrder: 1 },
    { id: '2', label: 'All products', url: '/products', isActive: true, sortOrder: 2 },
    { id: '3', label: 'Medicine', url: '/medicine', isActive: true, sortOrder: 3 },
    { id: '4', label: "Today's offers", url: '/offers', isActive: true, sortOrder: 4 },
    { id: '5', label: 'Track your order', url: '/order-tracking', isActive: true, sortOrder: 5 },
    { id: '6', label: 'Wishlist', url: '/wishlist', isActive: true, sortOrder: 6 },
  ],
  policyLinksTitle: 'Policies & support',
  policyLinks: [
    { id: 'p1', label: 'About us', url: '/about', isActive: true, sortOrder: 1 },
    { id: 'p2', label: 'Contact & location', url: '/contact', isActive: true, sortOrder: 2 },
    { id: 'p3', label: 'Terms & conditions', url: '/terms', isActive: true, sortOrder: 3 },
    { id: 'p4', label: 'Privacy policy', url: '/privacy', isActive: true, sortOrder: 4 },
    { id: 'p5', label: 'Return & refund policy', url: '/refund', isActive: true, sortOrder: 5 },
    { id: 'p6', label: 'FAQ', url: '/faq', isActive: true, sortOrder: 6 },
  ],
  showLicenseSection: true,
  showPaymentMethods: true,
};

/** v3.11 — names shown for each footer column in the layout editor */
const SECTION_NAMES: Record<FooterSectionId, { name: string; text: string }> = {
  brand: { name: 'Logo & description', text: 'Logo, short introduction and drug license' },
  quickLinks: { name: 'Quick links', text: 'The first list of links' },
  policyLinks: { name: 'Policy & support links', text: 'The second list of links' },
  contact: { name: 'Contact us', text: 'Phone, email and address' },
};

/** Moves one entry of a list up (-1) or down (+1) */
function moveItem<T>(list: T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Up / down buttons used by every reorderable list on this page */
const MoveButtons: React.FC<{ index: number; count: number; onMove: (step: -1 | 1) => void; label: string }> = ({ index, count, onMove, label }) => (
  <span className="inline-flex items-center gap-1 shrink-0">
    <IconButton icon={ArrowUp} size="sm" label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)} />
    <IconButton icon={ArrowDown} size="sm" label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)} />
  </span>
);

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** WCAG contrast ratio between two hex colours, or null if either is not hex */
const contrastRatio = (a: string, b: string): number | null => {
  const la = hexLuminance(a);
  const lb = hexLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** One editable column of footer links */
const LinkColumn: React.FC<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  heading: string;
  headingFallback: string;
  onHeading: (value: string) => void;
  links: FooterLinkItem[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (label: string, url: string) => void;
  onMove: (index: number, step: -1 | 1) => void;
  onEdit: (id: string, changes: { label: string; url: string }) => void;
  examples: [string, string];
}> = ({ title, icon, heading, headingFallback, onHeading, links, onToggle, onRemove, onAdd, onMove, onEdit, examples }) => {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<{ id: string; label: string; url: string } | null>(null);

  const add = () => {
    if (!label.trim() || !url.trim()) return;
    onAdd(label.trim(), url.trim());
    setLabel('');
    setUrl('');
  };

  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      <Field label="Column heading" className="mb-4">
        <input
          className="a-field"
          value={heading || ''}
          placeholder={headingFallback}
          onChange={(e) => onHeading(e.target.value)}
        />
      </Field>

      {links.length === 0 ? (
        <p className="mb-4" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
          No links in this column yet.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {links.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-2 flex-wrap sm:flex-nowrap"
              style={{
                padding: 'var(--ds-s-2) var(--ds-s-2) var(--ds-s-2) var(--ds-s-3)',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
                opacity: item.isActive ? 1 : 0.6,
              }}
            >
              <GripVertical className="w-4 h-4 shrink-0 hidden sm:block" style={{ color: 'var(--a-text-faint)' }} />
              {editing?.id === item.id ? (
                <span className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    className="a-field"
                    value={editing.label}
                    autoFocus
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    aria-label="Link name"
                  />
                  <input
                    className="a-field"
                    value={editing.url}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editing.label.trim() && editing.url.trim()) {
                        onEdit(item.id, { label: editing.label.trim(), url: editing.url.trim() });
                        setEditing(null);
                      }
                    }}
                    aria-label="Link URL"
                  />
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {item.label}
                  </span>
                  <span
                    className="block truncate"
                    style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', fontFamily: 'var(--font-mono)' }}
                  >
                    {item.url}
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 shrink-0 ml-auto">
                {editing?.id === item.id ? (
                  <IconButton
                    icon={Check}
                    size="sm"
                    tone="success"
                    label="Done"
                    disabled={!editing.label.trim() || !editing.url.trim()}
                    onClick={() => {
                      onEdit(item.id, { label: editing.label.trim(), url: editing.url.trim() });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <IconButton icon={Pencil} size="sm" label="Edit" onClick={() => setEditing({ id: item.id, label: item.label, url: item.url })} />
                )}
                <MoveButtons index={index} count={links.length} onMove={(step) => onMove(index, step)} label={item.label} />
                <IconButton
                  icon={item.isActive ? Eye : EyeOff}
                  size="sm"
                  tone={item.isActive ? 'success' : 'default'}
                  label={item.isActive ? 'Visible — click to hide' : 'Hidden — click to show'}
                  onClick={() => onToggle(item.id)}
                />
                <IconButton icon={Trash2} size="sm" tone="danger" label="Delete" onClick={() => onRemove(item.id)} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <input
          className="a-field"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`Link name (e.g. ${examples[0]})`}
        />
        <input
          className="a-field"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={`URL (e.g. ${examples[1]})`}
        />
        <Button icon={Plus} onClick={add} disabled={!label.trim() || !url.trim()}>
          Add
        </Button>
      </div>
    </Card>
  );
};

/** A tiny footer drawn in a scheme's colours, used on each swatch */
const SchemeSwatch: React.FC<{ config: FooterSettings }> = ({ config }) => {
  const scheme = resolveFooterScheme(config);
  return (
    <span
      aria-hidden
      style={scheme.style}
      className="relative block overflow-hidden h-16 rounded-(--ds-r-md) bg-(--footer-bg) border border-(--a-border)"
    >
      <span className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--primary),transparent)]" />
      <span className="absolute left-(--ds-s-2) right-(--ds-s-2) top-(--ds-s-3) flex gap-(--ds-s-2)">
        {[0, 1, 2].map((col) => (
          <span key={col} className="flex-1 min-w-0 space-y-1">
            <span className="block h-1 w-3/4 rounded-(--ds-r-full) bg-(--footer-heading)" />
            <span className="block h-0.5 w-1/3 rounded-(--ds-r-full) bg-(--footer-accent)" />
            <span className="block h-1 w-full rounded-(--ds-r-full) bg-(--footer-muted) opacity-70" />
            <span className="block h-1 w-2/3 rounded-(--ds-r-full) bg-(--footer-muted) opacity-70" />
          </span>
        ))}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-3 bg-(--footer-bar) border-t border-(--footer-border)" />
    </span>
  );
};

/** A scaled-down footer in the chosen colours, filled with this store's own text */
const FooterPreview: React.FC<{ config: FooterSettings; settings: SiteSettings }> = ({ config, settings }) => {
  const scheme = resolveFooterScheme(config);
  const storeName = settings.logo_config?.pharmacyName || settings.general?.storeName || 'Your store';
  const quick = (config.quickLinks || []).filter((l) => l.isActive !== false).slice(0, 4);
  const policy = (config.policyLinks || []).filter((l) => l.isActive !== false).slice(0, 4);
  const phone = config.phone || settings.general?.phone || '';
  const email = config.email || settings.general?.email || '';
  const year = new Date().getFullYear();

  const heading = (text: string) => (
    <span className="block">
      <span className="block truncate font-(--ds-fw-bold) text-(--footer-heading) text-(length:--ds-fs-xs)">{text}</span>
      <span className="mt-1 block h-0.5 w-(--ds-s-4) rounded-(--ds-r-full) bg-(--footer-accent)" />
    </span>
  );

  return (
    <div
      style={scheme.style}
      className="relative isolate overflow-hidden rounded-(--ds-r-lg) border border-(--a-border) bg-(--footer-bg) text-(--footer-text)"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--primary)_30%,var(--primary)_70%,transparent)]" />
      <span className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-[radial-gradient(60%_100%_at_50%_0%,var(--footer-glow),transparent_72%)]" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 text-(length:--ds-fs-2xs)">
        <div className="col-span-2 sm:col-span-1 min-w-0 space-y-2">
          <span className="block truncate font-(--ds-fw-black) text-(--footer-heading) text-(length:--ds-fs-sm)">
            {storeName}
          </span>
          <span className="ds-clamp-2 leading-(--ds-lh-snug)">
            {config.description || 'Your footer description appears here.'}
          </span>
        </div>
        <div className="min-w-0 space-y-2">
          {heading(config.quickLinksTitle || 'Quick links')}
          {quick.map((link) => (
            <span key={link.id} className="block truncate">
              {link.label}
            </span>
          ))}
        </div>
        <div className="min-w-0 space-y-2">
          {heading(config.policyLinksTitle || 'Policies & support')}
          {policy.map((link) => (
            <span key={link.id} className="block truncate">
              {link.label}
            </span>
          ))}
        </div>
        <div className="col-span-2 sm:col-span-1 min-w-0 space-y-2">
          {heading(config.contactTitle || 'Contact us')}
          {[
            { icon: Phone, text: phone },
            { icon: Mail, text: email },
          ]
            .filter((row) => row.text)
            .map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5 min-w-0">
                <span className="w-5 h-5 shrink-0 rounded-(--ds-r-xs) inline-flex items-center justify-center bg-(--footer-tile) border border-(--footer-border) text-(--footer-accent)">
                  <Icon className="w-3 h-3" />
                </span>
                <span className="truncate ds-num">{text}</span>
              </span>
            ))}
        </div>
      </div>

      <div className="border-t border-(--footer-border) bg-(--footer-bar) px-4 py-2 text-(length:--ds-fs-2xs) text-(--footer-muted) truncate">
        {config.copyrightText || `© ${year} ${storeName}. All rights reserved.`}
      </div>
    </div>
  );
};

export const AdminFooterTab: React.FC<AdminFooterTabProps> = ({ settings, onSave }) => {
  const toasts = useToasts();
  const [footerConfig, setFooterConfig] = useState<FooterSettings>(
    () => (settings.footer_config as FooterSettings) || DEFAULT_FOOTER
  );

  // Social links live in their own settings key so the footer, chat widget and
  // any future placement all read the same source.
  const [socialConfig, setSocialConfig] = useState<SocialConfig>(() => settings.social_config || {});
  const [scrollTop, setScrollTop] = useState<ScrollTopConfig>(() => (settings as any).scroll_top_config || {});
  const [saving, setSaving] = useState(false);

  const patch = (changes: Partial<FooterSettings>) => setFooterConfig((prev) => ({ ...prev, ...changes }));
  const sectionOrder = orderedFooterSections(footerConfig.sectionOrder);
  const hiddenSections = footerConfig.hiddenSections || [];
  const socialOrder = orderedSocialKeys(socialConfig.order);
  const socialPreview = socialLinksOf({ ...settings, footer_config: footerConfig, social_config: socialConfig } as SiteSettings);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...settings, footer_config: footerConfig, social_config: socialConfig, scroll_top_config: scrollTop } as SiteSettings);
      toasts.push('Footer settings saved');
    } catch (e) {
      console.error(e);
      toasts.push('Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** The list as the website shows it (by sortOrder), renumbered after every move */
  const sortedLinks = (key: 'quickLinks' | 'policyLinks') =>
    (footerConfig[key] || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const renumber = (list: FooterLinkItem[]) => list.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const listOps = (key: 'quickLinks' | 'policyLinks') => ({
    links: sortedLinks(key),
    onMove: (index: number, step: -1 | 1) =>
      setFooterConfig((prev) => ({
        ...prev,
        [key]: renumber(moveItem((prev[key] || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), index, step)),
      })),
    onEdit: (id: string, changes: { label: string; url: string }) =>
      setFooterConfig((prev) => ({
        ...prev,
        [key]: (prev[key] || []).map((item) => (item.id === id ? { ...item, ...changes } : item)),
      })),
    onToggle: (id: string) =>
      setFooterConfig((prev) => ({
        ...prev,
        [key]: (prev[key] || []).map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item)),
      })),
    onRemove: (id: string) =>
      setFooterConfig((prev) => ({ ...prev, [key]: (prev[key] || []).filter((item) => item.id !== id) })),
    onAdd: (label: string, url: string) =>
      setFooterConfig((prev) => ({
        ...prev,
        [key]: [
          ...(prev[key] || []),
          { id: Date.now().toString(), label, url, isActive: true, sortOrder: Math.max(0, ...(prev[key] || []).map((item) => item.sortOrder || 0)) + 1 },
        ],
      })),
  });

  const general = settings.general;

  /* ---- colours ------------------------------------------------------------ */
  // Resolved the same way the storefront does, so an unknown value shows as the default
  const activePreset = resolveFooterScheme(footerConfig).id;
  const isCustom = activePreset === 'custom';
  const customScheme = resolveFooterScheme({ ...footerConfig, colorPreset: 'custom' });

  // The native colour input only takes #rrggbb, so an empty or free-form value
  // is shown as the colour the footer would actually use.
  const customBg = HEX_PATTERN.test(footerConfig.backgroundColor || '') ? (footerConfig.backgroundColor as string) : CUSTOM_FALLBACK.bg;
  const autoText = customScheme.dark ? CUSTOM_FALLBACK.ink : CUSTOM_FALLBACK.bg;
  const customText = HEX_PATTERN.test(footerConfig.textColor || '') ? (footerConfig.textColor as string) : autoText;
  const ratio = contrastRatio(customBg, customText);
  const lowContrast = isCustom && ratio !== null && ratio < 4.5;

  const presetOptions: Array<{ id: FooterColorPreset; label: string }> = [
    ...FOOTER_PRESETS.map(({ id, label }) => ({ id, label })),
    { id: 'custom', label: 'Custom' },
  ];

  const colourField = (
    key: 'backgroundColor' | 'textColor',
    label: string,
    shown: string,
    hint?: string
  ) => (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={shown}
          onChange={(e) => patch({ [key]: e.target.value })}
          className="cursor-pointer block shrink-0"
          style={{
            width: 'var(--ds-h-md)',
            height: 'var(--ds-h-md)',
            padding: 2,
            borderRadius: 'var(--ds-r-sm)',
            border: '1px solid var(--a-border-strong)',
            background: 'var(--a-surface)',
          }}
        />
        <input
          className="a-field ds-num"
          value={footerConfig[key] || ''}
          placeholder={key === 'textColor' ? `Auto (${shown})` : shown}
          onChange={(e) => patch({ [key]: e.target.value.trim() })}
          spellCheck={false}
          maxLength={7}
        />
        {key === 'textColor' && footerConfig.textColor && (
          <Button size="sm" variant="ghost" onClick={() => patch({ textColor: '' })}>
            Auto
          </Button>
        )}
      </div>
    </Field>
  );

  return (
    <div className="space-y-5">
      {toasts.node}

      <Card>
        <CardHeader
          title="Footer & credits"
          subtitle="Footer introduction, contact details, link columns, social links and copyright"
          icon={Layers}
          actions={
            <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
              <span className="hidden sm:inline">Save changes</span>
              <span className="sm:hidden">Save</span>
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <Toggle
              checked={footerConfig.autoUseHeaderLogo ?? true}
              onChange={(value) => patch({ autoUseHeaderLogo: value })}
              label="Use the header logo in the footer"
              description="When the header logo changes, the footer logo follows automatically"
            />
            <Field label="Footer description">
              <textarea
                className="a-field"
                rows={4}
                value={footerConfig.description || ''}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="A short introduction to your store..."
              />
            </Field>
          </div>

          <div
            className="space-y-3"
            style={{
              padding: 'var(--ds-s-4)',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface-2)',
              border: '1px solid var(--a-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <Contact className="w-4 h-4" style={{ color: 'var(--primary-ink, var(--primary))' }} />
              <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Footer contact details
              </span>
            </div>
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Leave blank to use the details from the general store settings.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Address" className="sm:col-span-2">
                <input
                  className="a-field"
                  value={footerConfig.address || ''}
                  onChange={(e) => patch({ address: e.target.value })}
                  placeholder={general?.address || 'Store address'}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="a-field"
                  inputMode="tel"
                  value={footerConfig.phone || ''}
                  onChange={(e) => patch({ phone: e.target.value })}
                  placeholder={general?.phone || '01XXXXXXXXX'}
                />
              </Field>
              <Field label="Email">
                <input
                  className="a-field"
                  type="email"
                  value={footerConfig.email || ''}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder={general?.email || 'you@example.com'}
                />
              </Field>
              <Field label="Drug license number" className="sm:col-span-2">
                <input
                  className="a-field"
                  value={footerConfig.drugLicense || ''}
                  onChange={(e) => patch({ drugLicense: e.target.value })}
                  placeholder="License number"
                />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ colours */}
      <Card>
        <CardHeader
          title="Footer colours"
          subtitle="Pick a scheme, or set your own background and text colour. Every part of the footer follows it."
          icon={Palette}
        />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5">
          <div className="space-y-4 min-w-0">
            <div role="radiogroup" aria-label="Footer colour scheme" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presetOptions.map((option) => {
                const selected = option.id === activePreset;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ colorPreset: option.id })}
                    className="relative text-left cursor-pointer transition-[border-color,box-shadow] duration-(--ds-dur-fast)"
                    style={{
                      padding: 'var(--ds-s-2)',
                      borderRadius: 'var(--ds-r-lg)',
                      background: 'var(--a-surface)',
                      border: `1px solid ${selected ? 'var(--primary)' : 'var(--a-border)'}`,
                      boxShadow: selected ? 'var(--ds-ring)' : undefined,
                    }}
                  >
                    <SchemeSwatch
                      config={option.id === 'custom' ? { ...footerConfig, colorPreset: 'custom' } : { colorPreset: option.id }}
                    />
                    <span className="mt-2 flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1 min-w-0 font-semibold truncate" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        {option.id === 'custom' && <Pipette className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate">{option.label}</span>
                      </span>
                      {selected && (
                        <span
                          className="inline-flex items-center justify-center shrink-0 rounded-(--ds-r-full)"
                          style={{
                            width: 'var(--ds-icon-md)',
                            height: 'var(--ds-icon-md)',
                            background: 'var(--primary)',
                            color: 'var(--primary-foreground)',
                          }}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {isCustom && (
              <div
                className="space-y-3 ds-fade-in"
                style={{
                  padding: 'var(--ds-s-4)',
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--a-surface-2)',
                  border: '1px solid var(--a-border)',
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {colourField('backgroundColor', 'Background colour', customBg)}
                  {colourField('textColor', 'Text colour', customText, 'Leave on Auto to pick a readable colour')}
                </div>
                {lowContrast && (
                  <p
                    className="flex items-start gap-2"
                    style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-warning-text)' }}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Low contrast (<span className="ds-num">{ratio?.toFixed(1)}:1</span>) — text may be hard to read.
                      Aim for at least 4.5:1.
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <span className="a-label flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Live preview
            </span>
            <FooterPreview config={{ ...footerConfig, colorPreset: activePreset }} settings={settings} />
          </div>
        </div>
      </Card>

      {/* v3.11 — column order and visibility */}
      <Card>
        <CardHeader
          title="Footer layout"
          subtitle="Arrange the footer columns with the arrows — the first one sits on the left. Hide a column with the eye."
          icon={LayoutGrid}
        />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
          <ul className="space-y-2">
            {sectionOrder.map((id, index) => {
              const visible = !hiddenSections.includes(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-3"
                  style={{
                    padding: 'var(--ds-s-2) var(--ds-s-2) var(--ds-s-2) var(--ds-s-3)',
                    borderRadius: 'var(--ds-r-md)',
                    background: 'var(--a-surface-2)',
                    border: '1px solid var(--a-border)',
                    opacity: visible ? 1 : 0.55,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center shrink-0 font-bold ds-num"
                    style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--a-surface)', border: '1px solid var(--a-border)', fontSize: 'var(--a-fs-sm)' }}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {SECTION_NAMES[id].name}
                    </span>
                    <span className="block truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      {SECTION_NAMES[id].text}
                    </span>
                  </span>
                  <MoveButtons
                    index={index}
                    count={sectionOrder.length}
                    label={SECTION_NAMES[id].name}
                    onMove={(step) => patch({ sectionOrder: moveItem(sectionOrder, index, step) })}
                  />
                  <IconButton
                    icon={visible ? Eye : EyeOff}
                    size="sm"
                    tone={visible ? 'success' : 'default'}
                    label={visible ? 'Shown — click to hide' : 'Hidden — click to show'}
                    onClick={() =>
                      patch({ hiddenSections: visible ? [...hiddenSections, id] : hiddenSections.filter((item) => item !== id) })
                    }
                  />
                </li>
              );
            })}
          </ul>
          <div className="space-y-3">
            <Field label="Social icons placement">
              <select
                className="a-field"
                value={footerConfig.socialPlacement || 'contact'}
                onChange={(e) => patch({ socialPlacement: e.target.value as any })}
              >
                <option value="contact">Under the contact details</option>
                <option value="brand">Under the logo & description</option>
                <option value="bottom">In the bottom bar (next to the copyright)</option>
              </select>
            </Field>
            <Field label="Heading above the social icons (optional)">
              <input
                className="a-field"
                value={footerConfig.socialTitle || ''}
                onChange={(e) => patch({ socialTitle: e.target.value })}
                placeholder="e.g. Follow us"
                maxLength={40}
              />
            </Field>
            <Toggle
              checked={footerConfig.showSocialLinks !== false}
              onChange={(value) => patch({ showSocialLinks: value })}
              label="Show social icons in the footer"
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <LinkColumn
          title="Quick links"
          icon={LinkIcon}
          heading={footerConfig.quickLinksTitle || ''}
          headingFallback="Quick links"
          onHeading={(value) => patch({ quickLinksTitle: value })}
          examples={['Offers', '/offers']}
          {...listOps('quickLinks')}
        />
        <LinkColumn
          title="Policy & support links"
          icon={ShieldCheck}
          heading={footerConfig.policyLinksTitle || ''}
          headingFallback="Policies & support"
          onHeading={(value) => patch({ policyLinksTitle: value })}
          examples={['Terms', '/terms']}
          {...listOps('policyLinks')}
        />
      </div>

      <Card>
        <CardHeader
          title="Social media links"
          subtitle="Add a link to show the icon. Use the arrows to set the order; switch one off to hide it without losing the link."
          icon={Share2}
        />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
          <ul className="space-y-2 min-w-0">
            {socialOrder.map((key, index) => {
              const meta = SOCIAL_NETWORKS.find((item) => item.key === key)!;
              const Icon = BRAND_ICONS[key];
              const entry = (socialConfig as any)[key] || {};
              const enabled = entry.enabled ?? true;
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 flex-wrap sm:flex-nowrap"
                  style={{
                    padding: 'var(--ds-s-2) var(--ds-s-2) var(--ds-s-2) var(--ds-s-3)',
                    borderRadius: 'var(--ds-r-md)',
                    background: 'var(--a-surface-2)',
                    border: '1px solid var(--a-border)',
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      background: meta.background || meta.color,
                      color: meta.ink,
                      opacity: enabled && entry.url ? 1 : 0.45,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <span className="block font-semibold mb-1" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      {meta.label}
                      {key === 'whatsapp' ? ' (number or link)' : key === 'telegram' ? ' (@username or link)' : ''}
                    </span>
                    <input
                      className="a-field"
                      value={entry.url || ''}
                      placeholder={meta.placeholder}
                      onChange={(e) =>
                        setSocialConfig((prev) => ({ ...prev, [key]: { ...((prev as any)[key] || {}), url: e.target.value } }))
                      }
                      aria-label={`${meta.label} link`}
                    />
                  </span>
                  <span className="inline-flex items-center gap-1 shrink-0 ml-auto">
                    <MoveButtons
                      index={index}
                      count={socialOrder.length}
                      label={meta.label}
                      onMove={(step) => setSocialConfig((prev) => ({ ...prev, order: moveItem(socialOrder, index, step) }))}
                    />
                    <IconButton
                      icon={enabled ? Eye : EyeOff}
                      size="sm"
                      tone={enabled ? 'success' : 'default'}
                      label={enabled ? 'Shown — click to hide' : 'Hidden — click to show'}
                      onClick={() =>
                        setSocialConfig((prev) => ({ ...prev, [key]: { ...((prev as any)[key] || {}), enabled: !enabled } }))
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="space-y-4 min-w-0">
            <Field label="Icon style">
              <div className="grid grid-cols-3 gap-2">
                {(['brand', 'tile', 'outline'] as const).map((style) => {
                  const active = (socialConfig.iconStyle || 'brand') === style;
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setSocialConfig((prev) => ({ ...prev, iconStyle: style }))}
                      className="cursor-pointer font-semibold"
                      style={{
                        padding: 'var(--ds-s-2)',
                        borderRadius: 'var(--ds-r-md)',
                        fontSize: 'var(--a-fs-sm)',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                        background: active ? 'color-mix(in srgb, var(--primary) 7%, var(--a-surface))' : 'var(--a-surface)',
                      }}
                    >
                      {style === 'brand' ? 'Brand colours' : style === 'tile' ? 'Quiet tiles' : 'Outline'}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Icon shape">
              <div className="grid grid-cols-3 gap-2">
                {(['circle', 'rounded', 'square'] as const).map((shape) => {
                  const active = (socialConfig.iconShape || 'circle') === shape;
                  return (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => setSocialConfig((prev) => ({ ...prev, iconShape: shape }))}
                      className="cursor-pointer font-semibold capitalize"
                      style={{
                        padding: 'var(--ds-s-2)',
                        borderRadius: 'var(--ds-r-md)',
                        fontSize: 'var(--a-fs-sm)',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                        background: active ? 'color-mix(in srgb, var(--primary) 7%, var(--a-surface))' : 'var(--a-surface)',
                      }}
                    >
                      {shape}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div>
              <span className="a-label flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Preview
              </span>
              <div
                style={{ ...resolveFooterScheme(footerConfig).style, padding: 'var(--ds-s-4)', borderRadius: 'var(--ds-r-lg)' }}
                className="bg-(--footer-bg)"
              >
                {socialPreview.length > 0 ? (
                  <SocialIcons links={socialPreview} iconStyle={socialConfig.iconStyle || 'brand'} iconShape={socialConfig.iconShape || 'circle'} preview />
                ) : (
                  <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--footer-muted)' }}>Add a link to see the icons here.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* v3.11 — back-to-top button */}
      <Card>
        <CardHeader
          title="Back-to-top button"
          subtitle="A round button that appears after scrolling down and takes the visitor back to the top. It always stays above the phone menu bar and the chat button."
          icon={ArrowUpToLine}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Toggle
            checked={scrollTop.enabled !== false}
            onChange={(value) => setScrollTop((prev) => ({ ...prev, enabled: value }))}
            label="Show the button"
          />
          <Toggle
            checked={scrollTop.showOnMobile !== false}
            onChange={(value) => setScrollTop((prev) => ({ ...prev, showOnMobile: value }))}
            label="Show on phones too"
          />
          <Field label="Side of the screen">
            <select
              className="a-field"
              value={scrollTop.position || 'right'}
              onChange={(e) => setScrollTop((prev) => ({ ...prev, position: e.target.value as 'left' | 'right' }))}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Copyright & developer credit" icon={Copyright} />
        <div className="mb-4">
          <Toggle
            checked={footerConfig.enableCredit ?? true}
            onChange={(value) => patch({ enableCredit: value })}
            label="Show the credit line"
            description="Whether the credit text appears at the very bottom of the footer"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Copyright text">
            <input
              className="a-field"
              value={footerConfig.copyrightText || ''}
              onChange={(e) => patch({ copyrightText: e.target.value })}
              placeholder={`© ${new Date().getFullYear()} Store name. All rights reserved.`}
            />
          </Field>
          <Field label="Company credit">
            <input
              className="a-field"
              value={footerConfig.companyCredit || ''}
              onChange={(e) => patch({ companyCredit: e.target.value })}
              placeholder="Designed & Developed by ..."
            />
          </Field>
          <Field label="Website credit / subtitle">
            <input
              className="a-field"
              value={footerConfig.websiteCredit || ''}
              onChange={(e) => patch({ websiteCredit: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Developer / agency">
              <input
                className="a-field"
                value={footerConfig.developerName || ''}
                onChange={(e) => patch({ developerName: e.target.value })}
                placeholder="Name"
              />
            </Field>
            <Field label="Link">
              <input
                className="a-field"
                value={footerConfig.creditUrl || ''}
                onChange={(e) => patch({ creditUrl: e.target.value })}
                placeholder="https://..."
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
};
