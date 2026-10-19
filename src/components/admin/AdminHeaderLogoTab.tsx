import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Save,
  Info,
  Search,
  ShoppingCart,
  User,
  Menu,
  Heart,
  Phone,
  MapPin,
  Globe,
  X,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, useToasts, tint } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { SiteSettings, LogoConfig } from '../../types/index.ts';

interface AdminHeaderLogoTabProps {
  settings: SiteSettings;
  onSaveSettings: (newSettings: SiteSettings) => Promise<void>;
}

const hideBroken = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.style.display = 'none';
};

/** The logo as the storefront header draws it: the image, or the store name as text */
const LogoMark: React.FC<{ src: string; name: string; height: number }> = ({ src, name, height }) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Logo'}
        loading="lazy"
        onError={hideBroken}
        className="w-auto object-contain block"
        style={{ height, maxWidth: '60%' }}
      />
    );
  }
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span
        className="inline-flex items-center justify-center shrink-0 font-bold"
        style={{
          width: height,
          height,
          borderRadius: 'var(--ds-r-sm)',
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          fontSize: 'var(--ds-fs-md)',
        }}
      >
        {(name || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span
        className="font-bold truncate"
        style={{
          fontSize: 'var(--ds-fs-md)',
          color: name ? 'var(--ds-text)' : 'var(--ds-text-faint)',
        }}
      >
        {name || 'Store Name'}
      </span>
    </span>
  );
};

const TOPBAR_PRESETS = [
  { label: 'Default', bg: '', text: '' },
  { label: 'Brand', bg: '#0f6b4a', text: '#ffffff' },
  { label: 'Black', bg: '#111827', text: '#ffffff' },
  { label: 'Red', bg: '#c81e1e', text: '#ffffff' },
  { label: 'Blue', bg: '#1d4ed8', text: '#ffffff' },
  { label: 'Amber', bg: '#fbbf24', text: '#111827' },
  { label: 'Light', bg: '#f3f4f6', text: '#111827' },
];

const contrastText = (hex: string): string => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
};

/** Colour swatch + hex field; empty means "use the default" */
const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ label, value, onChange, placeholder }) => (
  <Field label={label}>
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#111827'}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 cursor-pointer"
        style={{ width: 38, height: 38, padding: 2, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}
      />
      <input
        type="text"
        className="a-field ds-num"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Use default colour"
          className="shrink-0 cursor-pointer"
          style={{ color: 'var(--a-text-muted)' }}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  </Field>
);

/**
 * Logo, favicon, store name and the thin top bar above the header.
 *
 * Every image goes through the media library rather than being inlined as a
 * data URL, so a large logo never bloats the settings row. The favicon is
 * written into seo_config because that is where the storefront and the
 * server-rendered <head> both read it.
 */
export const AdminHeaderLogoTab: React.FC<AdminHeaderLogoTabProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const currentLogo: LogoConfig = settings.logo_config || {};

  const [desktopLogoUrl, setDesktopLogoUrl] = useState(currentLogo.desktopLogoUrl || '');
  const [mobileLogoUrl, setMobileLogoUrl] = useState(currentLogo.mobileLogoUrl || '');
  // A mobile logo identical to the desktop one is how "same logo" was stored
  // before this switch existed, so treat that as the switch being on.
  const [sameOnMobile, setSameOnMobile] = useState(
    !currentLogo.mobileLogoUrl || currentLogo.mobileLogoUrl === currentLogo.desktopLogoUrl
  );
  const [pharmacyName, setPharmacyName] = useState(
    currentLogo.pharmacyName || settings.general?.storeName || ''
  );
  const [faviconUrl, setFaviconUrl] = useState(settings.seo_config?.faviconUrl || '');

  const [topbarAddress, setTopbarAddress] = useState(
    settings.general?.address || settings.topbar?.addressText || ''
  );
  const [topbarPhone, setTopbarPhone] = useState(
    settings.general?.phone || settings.topbar?.phoneText || ''
  );
  const [topbarDelivery, setTopbarDelivery] = useState(settings.topbar?.deliveryMessage || '');
  // Top bar mode: Info (address/phone/shipping) OR a scrolling news ticker — never both
  const [topbarMode, setTopbarMode] = useState<'info' | 'ticker' | 'off'>(
    settings.topbar?.enabled === false ? 'off' : settings.topbar?.mode === 'ticker' ? 'ticker' : 'info'
  );
  const [tickerText, setTickerText] = useState(settings.topbar?.tickerText || '');
  const [tickerSpeed, setTickerSpeed] = useState<number>(Number(settings.topbar?.tickerSpeed) || 30);
  const [topbarBg, setTopbarBg] = useState(settings.topbar?.bgColor || '');
  const [topbarText, setTopbarText] = useState(settings.topbar?.textColor || '');
  const [topbarMobile, setTopbarMobile] = useState(settings.topbar?.showOnMobile !== false);

  const [saving, setSaving] = useState(false);

  const effectiveMobileLogo = sameOnMobile ? desktopLogoUrl : mobileLogoUrl || desktopLogoUrl;
  const tabTitle = settings.seo_config?.siteTitle || pharmacyName || 'Your Store';

  const handleSave = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!pharmacyName.trim()) {
      toasts.push('Enter your store name.', 'warning');
      return;
    }
    if (topbarMode === 'ticker' && !tickerText.trim()) {
      toasts.push('Type the news ticker text, or choose another top bar option.', 'warning');
      return;
    }
    setSaving(true);
    try {
      // Spread the stored config first so keys this screen no longer edits
      // (tagline, badge text) survive the save untouched.
      const updatedLogoConfig: LogoConfig = {
        ...(settings.logo_config || {}),
        desktopLogoUrl,
        mobileLogoUrl: effectiveMobileLogo,
        pharmacyName,
      };

      await onSaveSettings({
        ...settings,
        logo_config: updatedLogoConfig,
        seo_config: { ...(settings.seo_config || {}), faviconUrl },
        general: {
          ...(settings.general as NonNullable<SiteSettings['general']>),
          storeName: pharmacyName,
          address: topbarAddress,
          phone: topbarPhone,
        },
        topbar: {
          ...(settings.topbar as NonNullable<SiteSettings['topbar']>),
          addressText: topbarAddress,
          phoneText: topbarPhone,
          deliveryMessage: topbarDelivery,
          enabled: topbarMode !== 'off',
          mode: topbarMode === 'ticker' ? 'ticker' : 'info',
          tickerText: tickerText.trim(),
          tickerSpeed,
          bgColor: topbarBg,
          textColor: topbarText,
          showOnMobile: topbarMobile,
        },
      });

      toasts.push('Logo and header settings saved.');
    } catch (err) {
      console.error(err);
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const mockIcon = { color: 'var(--ds-text-soft)' } as const;
  const mockBlock = { borderRadius: 'var(--ds-r-sm)', background: 'var(--ds-surface-3)' } as const;

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Logo & Header"
        subtitle="Logo, favicon, store name and the top bar above the header."
        icon={ImageIcon}
        actions={
          <Button variant="primary" icon={Save} onClick={() => handleSave()} loading={saving}>
            <span className="hidden sm:inline">Save Changes</span>
            <span className="sm:hidden">Save</span>
          </Button>
        }
      />

      <form
        onSubmit={handleSave}
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-5"
      >
        {/* ---------------------------------------------------------- form */}
        <div className="space-y-5 min-w-0">
          <div
            className="flex items-start gap-2.5"
            style={{
              padding: 'var(--ds-s-3)',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--ds-info-soft)',
              color: 'var(--ds-info-text)',
              fontSize: 'var(--a-fs-sm)',
              lineHeight: 'var(--ds-lh-normal)',
            }}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Recommended sizes: desktop logo <strong className="ds-num">240 × 60</strong> px, mobile logo{' '}
              <strong className="ds-num">160 × 50</strong> px (PNG or SVG with a transparent background), favicon{' '}
              <strong className="ds-num">512 × 512</strong> px square.
            </span>
          </div>

          <MediaPicker
            label="Desktop Logo"
            value={desktopLogoUrl}
            onChange={setDesktopLogoUrl}
            hideUrlInput
            modalTitle="Select Desktop Logo"
          />

          <div
            className="space-y-4"
            style={{
              padding: 'var(--ds-s-4)',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface-2)',
              border: '1px solid var(--a-border)',
            }}
          >
            <Toggle
              checked={sameOnMobile}
              onChange={(value) => {
                setSameOnMobile(value);
                if (value) setMobileLogoUrl(desktopLogoUrl);
              }}
              label="Use Same Logo on Mobile"
              description="Turn off to set a separate logo for small screens."
            />
            {!sameOnMobile && (
              <MediaPicker
                label="Mobile Logo"
                value={mobileLogoUrl}
                onChange={setMobileLogoUrl}
                hideUrlInput
                modalTitle="Select Mobile Logo"
              />
            )}
          </div>

          <MediaPicker
            label="Favicon (Browser Tab Icon)"
            value={faviconUrl}
            onChange={setFaviconUrl}
            hideUrlInput
            modalTitle="Select Favicon"
          />

          <Field label="Store Name" required hint="Shown in the header when there is no logo.">
            <input
              type="text"
              className="a-field"
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
              placeholder="Your store name"
            />
          </Field>

          <div className="ds-divider" />

          <div className="space-y-4">
            <div>
              <h4 className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Top Bar
              </h4>
              <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                The strip above the header. Show your contact details or a scrolling news line, one at a time.
              </p>
            </div>

            <div role="radiogroup" aria-label="Top bar content" className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'info', label: 'Contact info', hint: 'Address, hotline, shipping' },
                  { id: 'ticker', label: 'News ticker', hint: 'Scrolling announcement' },
                  { id: 'off', label: 'Hidden', hint: 'No top bar' },
                ] as const
              ).map((option) => {
                const active = topbarMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTopbarMode(option.id)}
                    className="text-left px-3 py-2.5 cursor-pointer transition-all"
                    style={{
                      borderRadius: 'var(--ds-r-md)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                      background: active ? tint(0.08) : 'var(--a-surface)',
                      boxShadow: active ? 'var(--ds-ring)' : 'none',
                    }}
                  >
                    <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {option.label}
                    </span>
                    <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {topbarMode === 'info' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Address">
                    <input
                      type="text"
                      className="a-field"
                      value={topbarAddress}
                      onChange={(e) => setTopbarAddress(e.target.value)}
                      placeholder="Store address"
                    />
                  </Field>
                  <Field label="Hotline Phone">
                    <input
                      type="text"
                      inputMode="tel"
                      className="a-field"
                      value={topbarPhone}
                      onChange={(e) => setTopbarPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                    />
                  </Field>
                </div>
                <Field label="Shipping Message" hint="Shown on the right of the top bar. Leave empty to hide it.">
                  <input
                    type="text"
                    className="a-field"
                    value={topbarDelivery}
                    onChange={(e) => setTopbarDelivery(e.target.value)}
                    placeholder="e.g. Home delivery all over Bangladesh"
                  />
                </Field>
              </div>
            )}

            {topbarMode === 'ticker' && (
              <div className="space-y-3">
                <Field label="News Ticker Text" required hint="Scrolls from right to left without stopping.">
                  <textarea
                    className="a-field"
                    rows={2}
                    value={tickerText}
                    onChange={(e) => setTickerText(e.target.value)}
                    placeholder="e.g. Eid offer: 10% off all vitamins until Friday"
                  />
                </Field>
                <Field label={`Speed: one pass every ${tickerSpeed}s`} hint="Lower is faster.">
                  <input
                    type="range"
                    min={8}
                    max={90}
                    step={1}
                    value={tickerSpeed}
                    onChange={(e) => setTickerSpeed(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                </Field>
              </div>
            )}

            {topbarMode !== 'off' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ColorField
                  label="Background Colour"
                  value={topbarBg}
                  onChange={setTopbarBg}
                  placeholder="Default (dark)"
                />
                <ColorField
                  label="Text Colour"
                  value={topbarText}
                  onChange={setTopbarText}
                  placeholder="Automatic"
                />
                <div className="sm:col-span-2 flex flex-wrap gap-1.5">
                  {TOPBAR_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setTopbarBg(preset.bg);
                        setTopbarText(preset.text);
                      }}
                      title={preset.label}
                      className="inline-flex items-center gap-1.5 px-2 h-7 cursor-pointer"
                      style={{
                        borderRadius: 'var(--ds-r-full)',
                        border: '1px solid var(--a-border)',
                        fontSize: 'var(--a-fs-xs)',
                        background: 'var(--a-surface)',
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 'var(--ds-r-full)',
                          background: preset.bg || 'var(--ds-gray-900)',
                          border: '1px solid var(--a-border)',
                        }}
                      />
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="sm:col-span-2">
                  <Toggle
                    checked={topbarMobile}
                    onChange={setTopbarMobile}
                    label="Show on Phones"
                    description="Turn off to show the top bar on tablets and computers only."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- preview */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4 space-y-4">
            <span className="a-label" style={{ marginBottom: 0 }}>
              Live Preview
            </span>

            {/* Desktop: browser tab + top bar + header */}
            <div
              className="overflow-hidden"
              style={{
                borderRadius: 'var(--ds-r-lg)',
                border: '1px solid var(--a-border)',
                background: 'var(--ds-surface-3)',
                boxShadow: 'var(--ds-shadow-sm)',
              }}
            >
              <div className="flex items-end gap-1.5 px-3 pt-2">
                <span className="flex gap-1 pb-2 shrink-0">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 'var(--ds-r-full)',
                        background: 'var(--ds-border-strong)',
                      }}
                    />
                  ))}
                </span>
                <span
                  className="flex items-center gap-1.5 min-w-0 px-2.5 py-1.5"
                  style={{
                    maxWidth: 200,
                    background: 'var(--ds-surface)',
                    borderRadius: 'var(--ds-r-sm) var(--ds-r-sm) 0 0',
                    fontSize: 'var(--a-fs-2xs)',
                    color: 'var(--ds-text-soft)',
                  }}
                >
                  <span
                    className="shrink-0 overflow-hidden inline-flex items-center justify-center"
                    style={{ width: 14, height: 14, borderRadius: 'var(--ds-r-xs)', background: tint(0.14) }}
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
                      <Globe className="w-2.5 h-2.5" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                    )}
                  </span>
                  <span className="truncate">{tabTitle}</span>
                  <X className="w-2.5 h-2.5 shrink-0" />
                </span>
              </div>

              <div style={{ background: 'var(--ds-surface)' }}>
                {topbarMode === 'ticker' && tickerText.trim() && (
                  <div
                    className="overflow-hidden px-3 py-1.5 whitespace-nowrap"
                    style={{
                      background: topbarBg || 'var(--ds-gray-900)',
                      color: topbarText || (topbarBg ? contrastText(topbarBg) : 'var(--ds-gray-100)'),
                      fontSize: 'var(--a-fs-2xs)',
                    }}
                  >
                    <span className="ticker-track" style={{ animationDuration: `${tickerSpeed}s` }}>
                      <span className="pr-10">{tickerText}</span>
                      <span className="pr-10">{tickerText}</span>
                    </span>
                  </div>
                )}
                {topbarMode === 'info' && (topbarAddress || topbarPhone || topbarDelivery) && (
                  <div
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                    style={{
                      background: topbarBg || 'var(--ds-gray-900)',
                      color: topbarText || (topbarBg ? contrastText(topbarBg) : 'var(--ds-gray-100)'),
                      fontSize: 'var(--a-fs-2xs)',
                    }}
                  >
                    <span className="truncate">{topbarDelivery}</span>
                    <span className="flex items-center gap-2.5 shrink-0">
                      {topbarPhone && (
                        <span className="flex items-center gap-1 ds-num">
                          <Phone className="w-2.5 h-2.5" />
                          {topbarPhone}
                        </span>
                      )}
                      {topbarAddress && (
                        <span className="hidden sm:flex items-center gap-1 truncate" style={{ maxWidth: 120 }}>
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{topbarAddress}</span>
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div
                  className="flex items-center gap-3 px-3"
                  style={{ height: 60, borderBottom: '1px solid var(--ds-border)' }}
                >
                  <div className="flex-1 min-w-0 flex items-center">
                    <LogoMark src={desktopLogoUrl} name={pharmacyName} height={34} />
                  </div>
                  <span
                    className="hidden sm:flex items-center gap-1.5 px-2.5 shrink-0"
                    style={{
                      width: 110,
                      height: 26,
                      borderRadius: 'var(--ds-r-full)',
                      background: 'var(--ds-surface-3)',
                      color: 'var(--ds-text-faint)',
                    }}
                  >
                    <Search className="w-3 h-3" />
                  </span>
                  <Heart className="w-4 h-4 shrink-0" style={mockIcon} />
                  <ShoppingCart className="w-4 h-4 shrink-0" style={mockIcon} />
                  <User className="w-4 h-4 shrink-0" style={mockIcon} />
                </div>
              </div>
            </div>

            {/* Mobile: the narrow header a phone shows */}
            <div className="flex justify-center">
              <div
                className="overflow-hidden w-full"
                style={{
                  maxWidth: 260,
                  borderRadius: 'var(--ds-r-2xl)',
                  border: '6px solid var(--ds-gray-800)',
                  background: 'var(--ds-surface-2)',
                  boxShadow: 'var(--ds-shadow-md)',
                }}
              >
                <div
                  className="flex items-center gap-2 px-3"
                  style={{
                    height: 50,
                    background: 'var(--ds-surface)',
                    borderBottom: '1px solid var(--ds-border)',
                  }}
                >
                  <Menu className="w-4 h-4 shrink-0" style={mockIcon} />
                  <div className="flex-1 min-w-0 flex items-center justify-center">
                    <LogoMark src={effectiveMobileLogo} name={pharmacyName} height={26} />
                  </div>
                  <ShoppingCart className="w-4 h-4 shrink-0" style={mockIcon} />
                </div>
                <div className="p-3 space-y-2">
                  <span className="block w-full" style={{ ...mockBlock, height: 70 }} />
                  <div className="grid grid-cols-2 gap-2">
                    <span className="block" style={{ ...mockBlock, height: 52 }} />
                    <span className="block" style={{ ...mockBlock, height: 52 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
};
