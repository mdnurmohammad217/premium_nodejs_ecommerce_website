import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Save, Check, Receipt } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Select } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { InvoicePaper, InvoiceSize } from './InvoiceView.tsx';
import { InvoiceConfig, SiteSettings } from '../../types/index.ts';

const DEFAULTS: InvoiceConfig = {
  businessName: '',
  tagline: '',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
  drugLicense: '',
  vatRegistration: '',
  invoicePrefix: 'INV-',
  footerNote: '',
  termsNote: '',
  showLogo: true,
  showSignature: true,
  signatureLabel: 'Authorized Signature',
  defaultSize: 'a4',
};

const SAMPLE_ORDER = {
  orderNumber: 'ORD-1001',
  createdAt: new Date().toISOString(),
  customerName: 'Rahim Uddin',
  customerPhone: '01712345678',
  customerAddress: 'House 12, Road 5, Dhanmondi, Dhaka',
  paymentMethod: 'cod',
  paymentStatus: 'unpaid',
  shippingZone: 'Inside Dhaka',
  subtotal: 1180,
  discount: 50,
  shippingCharge: 60,
  total: 1190,
};
const SAMPLE_ITEMS = [
  { id: 1, productName: 'Napa Extra 500mg', sku: 'NPX-500', unitPrice: 30, quantity: 10, subtotal: 300 },
  { id: 2, productName: 'Premium Cotton T-Shirt', variationLabel: 'L / Teal', sku: 'TS-L-T', unitPrice: 440, quantity: 2, subtotal: 880 },
];

/**
 * System Configuration → Invoice & Receipt: what every invoice, 80/58 mm
 * receipt and POS slip shows. The logo falls back to the website logo, so an
 * invoice always carries one.
 */
export const InvoiceSettingsPanel: React.FC<{
  settings: SiteSettings;
  onSave: (next: InvoiceConfig) => Promise<void> | void;
}> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<InvoiceConfig>({ ...DEFAULTS, ...(settings.invoice_config || {}) });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [preview, setPreview] = useState<InvoiceSize>((settings.invoice_config?.defaultSize as InvoiceSize) || 'a4');

  useEffect(() => {
    setDraft({ ...DEFAULTS, ...(settings.invoice_config || {}) });
  }, [settings.invoice_config]);

  const general: any = settings.general || {};
  const siteLogo = settings.logo_config?.desktopLogoUrl || settings.logo_config?.mobileLogoUrl || '';
  const previewGeneral = useMemo(
    () => ({ ...general, logoUrl: siteLogo, paymentMethods: (settings.payment?.methods || []).map((m) => ({ id: m.id, name: m.name })) }),
    [general, siteLogo, settings.payment?.methods]
  );

  const patch = (changes: Partial<InvoiceConfig>) => {
    setSavedAt(0);
    setDraft((current) => ({ ...current, ...changes }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(0), 2500);
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof InvoiceConfig, placeholder = '', max = 191) => (
    <input
      className="a-field"
      value={String(draft[key] ?? '')}
      placeholder={placeholder}
      maxLength={max}
      onChange={(event) => patch({ [key]: event.target.value } as Partial<InvoiceConfig>)}
    />
  );

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
      <Card>
        <CardHeader
          title="Invoice & Receipt"
          subtitle="Shown on every invoice (A4, 80 mm, 58 mm), the customer's download and the POS receipt."
          icon={FileText}
          accent="var(--ds-indigo)"
        />
        <div className="space-y-4">
          <Field label="Invoice logo" hint={siteLogo ? 'Leave empty to use your website logo (shown in the preview).' : 'Upload your logo here, or set the website logo in Website → Logo & Header.'}>
            <MediaPicker value={draft.logoUrl || ''} onChange={(url) => patch({ logoUrl: url })} modalTitle="Invoice logo" hideUrlInput />
          </Field>
          <Toggle checked={draft.showLogo !== false} onChange={(value) => patch({ showLogo: value })} label="Show the logo on invoices and receipts" description="Printed at a standard size — any shape of logo fits without stretching." />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business name">{text('businessName', general.storeName || 'Your shop name')}</Field>
            <Field label="Tagline" hint="Optional">{text('tagline', 'e.g. Your trusted pharmacy')}</Field>
            <Field label="Phone">{text('phone', general.phone || '01XXXXXXXXX', 60)}</Field>
            <Field label="Email" hint="A4 invoices only">{text('email', general.email || 'shop@example.com')}</Field>
          </div>
          <Field label="Address">{text('address', general.address || 'Shop address', 300)}</Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Drug License No.">{text('drugLicense', 'DL-XXXX', 80)}</Field>
            <Field label="VAT / BIN">{text('vatRegistration', 'Optional', 80)}</Field>
            <Field label="Invoice number prefix">{text('invoicePrefix', 'INV-', 12)}</Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Default paper size" hint="What Print uses first">
              <Select
                value={draft.defaultSize || 'a4'}
                onChange={(value) => patch({ defaultSize: value as InvoiceConfig['defaultSize'] })}
                options={[
                  { value: 'a4', label: 'A4 page' },
                  { value: 'mm80', label: '80 mm receipt' },
                  { value: 'mm58', label: '58 mm receipt' },
                ]}
              />
            </Field>
            <Field label="Signature line label">{text('signatureLabel', 'Authorized Signature', 60)}</Field>
          </div>
          <Toggle checked={draft.showSignature !== false} onChange={(value) => patch({ showSignature: value })} label="Signature line on A4 invoices" />
          <Field label="Footer note" hint="e.g. Thank you for shopping with us">
            <textarea className="a-field" rows={2} maxLength={300} value={draft.footerNote || ''} onChange={(event) => patch({ footerNote: event.target.value })} />
          </Field>
          <Field label="Terms" hint="A4 invoices, e.g. return policy">
            <textarea className="a-field" rows={2} maxLength={500} value={draft.termsNote || ''} onChange={(event) => patch({ termsNote: event.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" icon={savedAt ? Check : Save} loading={saving} onClick={save}>
              {savedAt ? 'Saved' : 'Save invoice settings'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Preview"
          subtitle="A sample order with your settings"
          icon={Receipt}
          accent="var(--ds-indigo)"
          actions={
            <div className="inline-flex items-center gap-1 p-1" style={{ background: 'var(--a-surface-2)', borderRadius: 'var(--ds-r-md)' }} role="tablist">
              {(['a4', 'mm80', 'mm58'] as InvoiceSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  role="tab"
                  aria-selected={preview === size}
                  onClick={() => setPreview(size)}
                  className="px-2.5 font-semibold cursor-pointer"
                  style={{
                    height: 28,
                    borderRadius: 'var(--ds-r-sm)',
                    fontSize: 'var(--a-fs-sm)',
                    background: preview === size ? 'var(--primary)' : 'transparent',
                    color: preview === size ? '#fff' : 'var(--a-text-soft)',
                  }}
                >
                  {size === 'a4' ? 'A4' : size === 'mm80' ? '80mm' : '58mm'}
                </button>
              ))}
            </div>
          }
        />
        <div className="overflow-auto p-3 flex justify-center" style={{ background: 'var(--a-surface-2)', borderRadius: 'var(--ds-r-md)', maxHeight: 720 }}>
          <div style={{ zoom: preview === 'a4' ? 0.62 : 1 } as React.CSSProperties}>
            <InvoicePaper order={SAMPLE_ORDER} items={SAMPLE_ITEMS} config={draft} general={previewGeneral} size={preview} currency={general.currency || '৳'} className="shadow-lg" />
          </div>
        </div>
      </Card>
    </div>
  );
};
