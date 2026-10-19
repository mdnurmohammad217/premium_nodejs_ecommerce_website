import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Save,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Home,
  LayoutGrid,
  ShoppingCart,
  ShoppingBag,
  Compass,
  User,
  Heart,
  Search,
  Phone,
  MessageCircle,
  Tag,
  Zap,
  Menu,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Select, IconButton, EmptyState, useToasts, tint } from './ui.tsx';
import { SiteSettings } from '../../types/index.ts';

export interface MobileNavItem {
  id: string;
  icon: string;
  label: string;
  url: string;
  isActive: boolean;
  highlight: boolean;
}

export interface MobileNavConfig {
  isEnabled: boolean;
  showLabels: boolean;
  items: MobileNavItem[];
}

interface AdminMobileNavTabProps {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
}

const MAX_ITEMS = 5;

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Home,
  LayoutGrid,
  ShoppingCart,
  ShoppingBag,
  Compass,
  User,
  Heart,
  Search,
  Phone,
  MessageCircle,
  Tag,
  Zap,
  Menu,
};

const LINKS: Array<{ value: string; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'shop', label: 'Shop' },
  { value: 'categories', label: 'Categories' },
  { value: 'cart', label: 'Cart' },
  { value: 'track', label: 'Track Order' },
  { value: 'account', label: 'Account' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'offers', label: 'Offers' },
  { value: 'checkout', label: 'Checkout' },
];
const CUSTOM = '__custom__';
const isPreset = (url: string) => LINKS.some((link) => link.value === url);

/** Mirrors the server default so a fresh store starts from what it already shows */
const DEFAULT_CONFIG: MobileNavConfig = {
  isEnabled: true,
  showLabels: true,
  items: [
    { id: 'm1', icon: 'Home', label: 'Home', url: 'home', isActive: true, highlight: false },
    { id: 'm2', icon: 'LayoutGrid', label: 'Categories', url: 'categories', isActive: true, highlight: false },
    { id: 'm3', icon: 'ShoppingCart', label: 'Cart', url: 'cart', isActive: true, highlight: true },
    { id: 'm4', icon: 'Compass', label: 'Track', url: 'track', isActive: true, highlight: false },
    { id: 'm5', icon: 'User', label: 'Account', url: 'account', isActive: true, highlight: false },
  ],
};

const normalise = (raw: any): MobileNavConfig => {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG;
  const items: MobileNavItem[] = Array.isArray(raw.items)
    ? raw.items.slice(0, MAX_ITEMS).map((item: any, index: number) => ({
        id: String(item?.id || `m${index + 1}`),
        icon: ICONS[item?.icon] ? item.icon : 'Home',
        label: String(item?.label ?? ''),
        url: String(item?.url ?? 'home'),
        isActive: item?.isActive !== false,
        highlight: !!item?.highlight,
      }))
    : DEFAULT_CONFIG.items;
  return { isEnabled: raw.isEnabled !== false, showLabels: raw.showLabels !== false, items };
};

/**
 * The fixed bottom bar phones show on the storefront. Up to five slots; one of
 * them may be the raised "centre" button, which is usually the cart.
 */
export const AdminMobileNavTab: React.FC<AdminMobileNavTabProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const stored = (settings as any).mobile_nav_config;
  const [config, setConfig] = useState<MobileNavConfig>(() => normalise(stored));
  const [customSlots, setCustomSlots] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(normalise(stored));
  }, [stored]);

  const items = config.items;
  const setItems = (next: MobileNavItem[]) => setConfig((prev) => ({ ...prev, items: next }));
  const update = (index: number, patch: Partial<MobileNavItem>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  const setHighlight = (index: number) =>
    setItems(items.map((item, i) => ({ ...item, highlight: i === index ? !item.highlight : false })));

  const addItem = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems([
      ...items,
      { id: `m${Date.now().toString(36)}`, icon: 'Heart', label: '', url: 'wishlist', isActive: true, highlight: false },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, mobile_nav_config: config } as SiteSettings);
      toasts.push('Mobile navigation saved.');
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const visible = items.filter((item) => item.isActive);

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Mobile Navigation Bar"
        subtitle="Buttons pinned to the bottom of the screen on phones (up to 5)."
        icon={Smartphone}
        actions={
          <>
            <IconButton
              icon={RotateCcw}
              label="Reset to default"
              onClick={() => setConfig(DEFAULT_CONFIG)}
            />
            <Button variant="primary" icon={Save} onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        {/* ---------------------------------------------------------- form */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Toggle
              checked={config.isEnabled}
              onChange={(value) => setConfig((prev) => ({ ...prev, isEnabled: value }))}
              label="Enable Mobile Nav Bar"
              description="When off, the bar is hidden on phones."
            />
            <Toggle
              checked={config.showLabels}
              onChange={(value) => setConfig((prev) => ({ ...prev, showLabels: value }))}
              label="Show Labels Under Icons"
            />
          </div>

          {items.length === 0 ? (
            <div style={{ borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--a-border-strong)' }}>
              <EmptyState
                icon={Smartphone}
                title="No buttons"
                description="Add at least one button to the nav bar."
                action={
                  <Button icon={Plus} onClick={addItem}>
                    Add Button
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const custom = customSlots[item.id] || !isPreset(item.url);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 'var(--ds-s-4)',
                      borderRadius: 'var(--ds-r-md)',
                      background: 'var(--a-surface-2)',
                      border: `1px solid ${item.highlight ? tint(0.4) : 'var(--a-border)'}`,
                      opacity: item.isActive ? 1 : 0.7,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <span className="font-bold ds-num flex-1" style={{ fontSize: 'var(--a-fs-md)' }}>
                        Slot {index + 1}
                      </span>
                      <Toggle
                        checked={item.isActive}
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
                        label="Delete button"
                        onClick={() => setItems(items.filter((_, i) => i !== index))}
                      />
                    </div>

                    <div className="mb-3">
                      <span className="a-label">Icon</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ICONS).map(([name, Icon]) => {
                          const active = item.icon === name;
                          return (
                            <button
                              key={name}
                              type="button"
                              title={name}
                              aria-label={name}
                              aria-pressed={active}
                              onClick={() => update(index, { icon: name })}
                              className="inline-flex items-center justify-center cursor-pointer transition-all"
                              style={{
                                width: 'var(--ds-h-sm)',
                                height: 'var(--ds-h-sm)',
                                borderRadius: 'var(--ds-r-sm)',
                                background: active ? 'var(--primary)' : 'var(--a-surface)',
                                color: active ? 'var(--primary-foreground)' : 'var(--a-text-soft)',
                                border: `1px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                              }}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Label">
                        <input
                          className="a-field"
                          value={item.label}
                          maxLength={14}
                          onChange={(e) => update(index, { label: e.target.value })}
                          placeholder="e.g. Cart"
                        />
                      </Field>
                      <Field label="Link">
                        <Select
                          value={custom ? CUSTOM : item.url}
                          onChange={(value) => {
                            if (value === CUSTOM) {
                              setCustomSlots((prev) => ({ ...prev, [item.id]: true }));
                              if (isPreset(item.url)) update(index, { url: '' });
                            } else {
                              setCustomSlots((prev) => ({ ...prev, [item.id]: false }));
                              update(index, { url: value });
                            }
                          }}
                          options={[...LINKS, { value: CUSTOM, label: 'Custom URL' }]}
                        />
                      </Field>
                      {custom && (
                        <Field label="Custom URL" className="sm:col-span-2">
                          <input
                            className="a-field"
                            value={item.url}
                            onChange={(e) => update(index, { url: e.target.value })}
                            placeholder="/page/about or https://..."
                          />
                        </Field>
                      )}
                    </div>

                    <label
                      className="flex items-center gap-2 mt-3 cursor-pointer"
                      style={{ fontSize: 'var(--a-fs-md)' }}
                    >
                      <input
                        type="radio"
                        name="mobile-nav-highlight"
                        checked={item.highlight}
                        onChange={() => setHighlight(index)}
                        onClick={() => item.highlight && setHighlight(index)}
                        style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                      />
                      <span className="font-semibold">Highlighted Center Button</span>
                    </label>
                  </div>
                );
              })}

              {items.length < MAX_ITEMS && (
                <Button icon={Plus} onClick={addItem} block>
                  Add Button (<span className="ds-num">{items.length}/{MAX_ITEMS}</span>)
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- preview */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4">
            <span className="a-label">Live Preview</span>
            <div className="flex justify-center">
              <div
                className="relative overflow-hidden w-full flex flex-col"
                style={{
                  maxWidth: 260,
                  height: 460,
                  borderRadius: 'var(--ds-r-2xl)',
                  border: '8px solid var(--ds-gray-800)',
                  background: 'var(--ds-surface-2)',
                  boxShadow: 'var(--ds-shadow-lg)',
                }}
              >
                <div className="flex-1 p-3 space-y-2 overflow-hidden">
                  <span className="block" style={{ height: 30, borderRadius: 'var(--ds-r-sm)', background: 'var(--ds-surface)' }} />
                  <span className="block" style={{ height: 96, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-surface-3)' }} />
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((n) => (
                      <span key={n} className="block" style={{ height: 90, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-surface)' }} />
                    ))}
                  </div>
                </div>

                {config.isEnabled && visible.length > 0 ? (
                  <div
                    className="flex items-end justify-around px-1"
                    style={{
                      minHeight: 56,
                      paddingTop: 'var(--ds-s-1)',
                      paddingBottom: 'var(--ds-s-2)',
                      background: 'var(--ds-surface)',
                      borderTop: '1px solid var(--ds-border)',
                      boxShadow: 'var(--ds-shadow-md)',
                    }}
                  >
                    {visible.map((item, index) => {
                      const Icon = ICONS[item.icon] || Home;
                      const current = index === 0;
                      return (
                        <span key={item.id} className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
                          {item.highlight ? (
                            <span
                              className="inline-flex items-center justify-center"
                              style={{
                                width: 44,
                                height: 44,
                                marginTop: -22,
                                borderRadius: 'var(--ds-r-full)',
                                background: 'var(--primary)',
                                color: 'var(--primary-foreground)',
                                boxShadow: `0 6px 16px ${tint(0.35)}`,
                                border: '3px solid var(--ds-surface)',
                              }}
                            >
                              <Icon className="w-5 h-5" />
                            </span>
                          ) : (
                            <Icon
                              className="w-5 h-5"
                              style={{ color: current ? 'var(--primary-ink, var(--primary))' : 'var(--ds-text-muted)' }}
                            />
                          )}
                          {config.showLabels && (
                            <span
                              className="truncate max-w-full font-medium"
                              style={{
                                fontSize: 'var(--ds-fs-2xs)',
                                color: current || item.highlight ? 'var(--primary)' : 'var(--ds-text-muted)',
                              }}
                            >
                              {item.label || '—'}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="text-center px-3 py-3"
                    style={{
                      fontSize: 'var(--a-fs-sm)',
                      color: 'var(--a-text-muted)',
                      background: 'var(--ds-surface)',
                      borderTop: '1px solid var(--ds-border)',
                    }}
                  >
                    Nav bar is turned off
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
