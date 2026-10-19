import React, { useMemo, useState } from 'react';
import { Save, Truck, Phone, MessageCircle, Type as TypeIcon, ShoppingBag, Info, PartyPopper, LayoutTemplate, Check } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Field, Toggle, useToasts } from './ui.tsx';
import { SiteSettings, CheckoutConfig, ProductContactConfig } from '../../types/index.ts';
import type { ThankYouConfig } from '../store/ThankYouView.tsx';

interface AdminCheckoutTabProps {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
}

/** Defaults shown as placeholders so the admin can see what the customer gets. */
type CheckoutLabelKey = Exclude<keyof CheckoutConfig, 'design' | 'deliveryEnabled' | 'deliveryOffNote' | 'showNotes' | 'showCoupon'>;

export const CHECKOUT_LABEL_DEFAULTS: Record<CheckoutLabelKey, string> = {
  deliverySectionTitle: 'Delivery Details',
  nameLabel: 'Full Name',
  namePlaceholder: 'Your full name',
  phoneLabel: 'Phone Number',
  phonePlaceholder: '01XXXXXXXXX',
  addressLabel: 'Delivery Address',
  addressPlaceholder: 'House/road, area, district',
  zoneLabel: 'Delivery Area',
  notesLabel: 'Order Notes (Optional)',
  notesPlaceholder: 'Any special delivery instructions',
  paymentSectionTitle: 'Payment Method',
  summaryTitle: 'Order Summary',
  subtotalLabel: 'Subtotal',
  discountLabel: 'Discount',
  deliveryLabel: 'Delivery Charge',
  totalLabel: 'Total',
  submitLabel: 'Place Order',
  trxIdLabel: 'Transaction ID (TrxID)',
  senderNumberLabel: 'Sender Number',
};

type LabelKey = CheckoutLabelKey;

/** v3.11 — the three checkout page designs, with a tiny drawing of each */
const DESIGNS: Array<{ id: 'classic' | 'express' | 'split'; name: string; text: string }> = [
  { id: 'classic', name: 'Classic', text: 'Numbered cards on the left, order summary on the right.' },
  { id: 'express', name: 'Express', text: 'One quick page: products on top, big tap targets, payment tiles.' },
  { id: 'split', name: 'Modern split', text: 'Open form beside a tinted order panel, fields with icons.' },
];

const DesignThumb: React.FC<{ id: string }> = ({ id }) => {
  const bar = (w: string, extra: React.CSSProperties = {}) => (
    <span style={{ display: 'block', height: 6, width: w, borderRadius: 3, background: 'var(--a-border-strong)', ...extra }} />
  );
  const box: React.CSSProperties = { borderRadius: 6, background: 'var(--a-surface)', border: '1px solid var(--a-border)', padding: 6, display: 'grid', gap: 4 };
  if (id === 'express') {
    return (
      <span style={{ display: 'grid', gap: 5, padding: 8, height: 92 }}>
        <span style={{ ...box, background: 'color-mix(in srgb, var(--primary) 10%, var(--a-surface))' }}>
          {bar('70%')}
          {bar('45%')}
        </span>
        <span style={{ ...box, gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ height: 14, borderRadius: 4, border: `1.5px solid ${i === 0 ? 'var(--primary)' : 'var(--a-border-strong)'}` }} />
          ))}
        </span>
        <span style={{ height: 10, borderRadius: 4, background: 'var(--primary)' }} />
      </span>
    );
  }
  if (id === 'split') {
    return (
      <span style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', height: 92, overflow: 'hidden', borderRadius: 6 }}>
        <span style={{ display: 'grid', gap: 5, padding: 8, alignContent: 'start' }}>
          {bar('60%')}
          <span style={{ height: 12, borderRadius: 4, border: '1px solid var(--a-border-strong)' }} />
          <span style={{ height: 12, borderRadius: 4, border: '1px solid var(--a-border-strong)' }} />
          <span style={{ height: 12, borderRadius: 4, border: '1px solid var(--a-border-strong)' }} />
        </span>
        <span style={{ display: 'grid', gap: 5, padding: 8, alignContent: 'start', background: 'color-mix(in srgb, var(--primary) 12%, var(--a-surface))' }}>
          {bar('80%')}
          {bar('60%')}
          {bar('70%')}
          <span style={{ height: 10, borderRadius: 4, background: 'var(--primary)', marginTop: 6 }} />
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6, padding: 8, height: 92 }}>
      <span style={{ display: 'grid', gap: 5, alignContent: 'start' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={box}>
            {bar(i === 1 ? '50%' : '70%')}
          </span>
        ))}
      </span>
      <span style={{ ...box, alignContent: 'start' }}>
        {bar('80%')}
        {bar('60%')}
        <span style={{ height: 10, borderRadius: 4, background: 'var(--primary)', marginTop: 8 }} />
      </span>
    </span>
  );
};

/** What each label is, in the owner's words, grouped the way the page is laid out */
const LABEL_GROUPS: Array<{ title: string; fields: Array<[LabelKey, string]> }> = [
  {
    title: 'Delivery Form',
    fields: [
      ['deliverySectionTitle', 'Section Title'],
      ['nameLabel', 'Name Label'],
      ['namePlaceholder', 'Name Placeholder'],
      ['phoneLabel', 'Phone Label'],
      ['phonePlaceholder', 'Phone Placeholder'],
      ['addressLabel', 'Address Label'],
      ['addressPlaceholder', 'Address Placeholder'],
      ['zoneLabel', 'Delivery Area Label'],
      ['notesLabel', 'Notes Label'],
      ['notesPlaceholder', 'Notes Placeholder'],
    ],
  },
  {
    title: 'Payment',
    fields: [
      ['paymentSectionTitle', 'Section Title'],
      ['trxIdLabel', 'Transaction ID Label'],
      ['senderNumberLabel', 'Sender Number Label'],
    ],
  },
  {
    title: 'Order Summary',
    fields: [
      ['summaryTitle', 'Section Title'],
      ['subtotalLabel', 'Subtotal'],
      ['discountLabel', 'Discount'],
      ['deliveryLabel', 'Delivery Charge'],
      ['totalLabel', 'Total'],
      ['submitLabel', 'Order Button Text'],
    ],
  },
];

/** A colour input needs a hex value, so resolve the theme token to one at runtime */
const cssColor = (token: string) => {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  } catch {
    return '';
  }
};

/**
 * Checkout label editor. Delivery zones and payment methods are configured once
 * in System Configuration — this page only owns the wording the customer reads
 * on the checkout page and the product-page contact buttons.
 */
export const AdminCheckoutTab: React.FC<AdminCheckoutTabProps> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [labels, setLabels] = useState<CheckoutConfig>(settings.checkout_config || {});
  const [contact, setContact] = useState<ProductContactConfig>(settings.product_contact_config || {});
  // v3.9 — thank-you page wording (website and landing-page checkout share it)
  const [thanks, setThanks] = useState<ThankYouConfig>(((settings as any).thank_you_config as ThankYouConfig) || {});
  const [saving, setSaving] = useState(false);

  const themeHex = useMemo(
    () => ({ call: cssColor('--primary'), whatsapp: cssColor('--ds-success') }),
    []
  );

  const save = async () => {
    setSaving(true);
    try {
      await onSaveSettings({
        ...settings,
        checkout_config: labels,
        product_contact_config: contact,
        thank_you_config: thanks,
      } as SiteSettings);
      toasts.push('Checkout settings saved.');
    } catch {
      toasts.push('Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const label = (key: LabelKey) => labels[key] || CHECKOUT_LABEL_DEFAULTS[key];
  const design = labels.design || 'classic';
  const deliveryOn = labels.deliveryEnabled !== false;
  const showCall = contact.showCallButton ?? false;
  const showWhatsapp = contact.showWhatsappButton ?? false;

  const contactBlock = (kind: 'call' | 'whatsapp') => {
    const isCall = kind === 'call';
    const enabled = isCall ? showCall : showWhatsapp;
    return (
      <div
        className="space-y-3"
        style={{
          padding: 'var(--ds-s-4)',
          borderRadius: 'var(--ds-r-md)',
          background: 'var(--a-surface-2)',
          border: '1px solid var(--a-border)',
        }}
      >
        <Toggle
          checked={enabled}
          onChange={(value) =>
            setContact((c) => ({ ...c, [isCall ? 'showCallButton' : 'showWhatsappButton']: value }))
          }
          label={isCall ? 'Show Call Now Button' : 'Show WhatsApp Button'}
        />
        <Field label={isCall ? 'Phone Number' : 'WhatsApp Number'}>
          <input
            className="a-field"
            inputMode="tel"
            value={(isCall ? contact.callNumber : contact.whatsappNumber) || ''}
            onChange={(e) =>
              setContact((c) => ({ ...c, [isCall ? 'callNumber' : 'whatsappNumber']: e.target.value }))
            }
            placeholder="01XXXXXXXXX"
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
          <Field label="Button Text">
            <input
              className="a-field"
              value={(isCall ? contact.callLabel : contact.whatsappLabel) || ''}
              onChange={(e) =>
                setContact((c) => ({ ...c, [isCall ? 'callLabel' : 'whatsappLabel']: e.target.value }))
              }
              placeholder={isCall ? 'Call Now' : 'WhatsApp'}
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              aria-label="Background color"
              value={(isCall ? contact.callBgColor || themeHex.call : contact.whatsappBgColor || themeHex.whatsapp) || undefined}
              onChange={(e) =>
                setContact((c) => ({ ...c, [isCall ? 'callBgColor' : 'whatsappBgColor']: e.target.value }))
              }
              className="cursor-pointer block"
              style={{
                width: 'var(--ds-h-md)',
                height: 'var(--ds-h-md)',
                padding: 2,
                borderRadius: 'var(--ds-r-sm)',
                border: '1px solid var(--a-border-strong)',
                background: 'var(--a-surface)',
              }}
            />
          </Field>
        </div>
      </div>
    );
  };

  const previewInput = (text: string) => (
    <span
      className="block truncate"
      style={{
        height: 'var(--ds-h-sm)',
        lineHeight: 'var(--ds-h-sm)',
        padding: '0 var(--ds-s-3)',
        borderRadius: 'var(--ds-r-sm)',
        border: '1px solid var(--ds-border)',
        background: 'var(--ds-surface)',
        color: 'var(--ds-text-faint)',
        fontSize: 'var(--a-fs-sm)',
      }}
    >
      {text}
    </span>
  );

  return (
    <div>
      {toasts.node}
      <PageHeader
        title="Checkout"
        subtitle="Choose the checkout design, switch delivery on or off, and edit every text on the checkout page."
        icon={ShoppingBag}
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving}>
            Save Changes
          </Button>
        }
      />

      {/* Shipping zones and payment methods intentionally live only in
          System Configuration — editing them in two places let the two copies
          drift apart, and the storefront only ever reads one of them. */}
      <div
        className="flex items-start gap-3 mb-5"
        style={{
          padding: 'var(--ds-s-4)',
          borderRadius: 'var(--ds-r-lg)',
          background: 'var(--ds-info-soft)',
          color: 'var(--ds-info-text)',
        }}
      >
        <Truck className="w-4 h-4 mt-0.5 shrink-0" />
        <p style={{ fontSize: 'var(--a-fs-md)', lineHeight: 'var(--ds-lh-normal)' }}>
          Delivery areas, charges and payment methods are managed in{' '}
          <strong>System Configuration</strong> (Shipping and Payments tabs). This page sets the
          checkout design, switches the delivery charge on or off, and edits the checkout wording.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* v3.11 — design picker and delivery switch */}
          <Card>
            <CardHeader
              title="Checkout Design"
              subtitle="Pick how the checkout page looks. All three work the same way and look good on phones."
              icon={LayoutTemplate}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Checkout design">
              {DESIGNS.map((item) => {
                const active = design === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLabels((prev) => ({ ...prev, design: item.id }))}
                    className="text-left cursor-pointer transition-all"
                    style={{
                      borderRadius: 'var(--ds-r-lg)',
                      border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                      background: active ? 'color-mix(in srgb, var(--primary) 5%, var(--a-surface))' : 'var(--a-surface)',
                      boxShadow: active ? 'var(--ds-ring)' : 'none',
                      overflow: 'hidden',
                    }}
                  >
                    <span className="block" style={{ background: 'var(--a-surface-2)', borderBottom: '1px solid var(--a-border)' }}>
                      <DesignThumb id={item.id} />
                    </span>
                    <span className="flex items-start gap-2" style={{ padding: 'var(--ds-s-3)' }}>
                      <span
                        className="inline-flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          background: active ? 'var(--primary)' : 'transparent',
                          border: active ? 'none' : '2px solid var(--a-border-strong)',
                          color: 'var(--primary-foreground)',
                        }}
                      >
                        {active && <Check className="w-3 h-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {item.name}
                        </span>
                        <span className="block" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', lineHeight: 'var(--ds-lh-snug)' }}>
                          {item.text}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Toggle
                checked={labels.showNotes !== false}
                onChange={(value) => setLabels((prev) => ({ ...prev, showNotes: value }))}
                label="Order note box"
                description="The optional “Order note” field."
              />
              <Toggle
                checked={labels.showCoupon !== false}
                onChange={(value) => setLabels((prev) => ({ ...prev, showCoupon: value }))}
                label="Coupon code box"
                description="“Have a coupon code?” in the order summary."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Delivery Charge"
              subtitle="Turn the delivery area and charge off when you do not charge for delivery (or the price already includes it)."
              icon={Truck}
            />
            <Toggle
              checked={deliveryOn}
              onChange={(value) => setLabels((prev) => ({ ...prev, deliveryEnabled: value }))}
              label={deliveryOn ? 'Delivery area & charge: ON' : 'Delivery area & charge: OFF'}
              description={
                deliveryOn
                  ? 'Customers choose a delivery area and its charge is added (areas and charges: System Configuration → Shipping).'
                  : 'The delivery field is hidden on the website and landing pages, and orders are placed with no delivery charge.'
              }
            />
            {!deliveryOn && (
              <div className="mt-3">
                <Field label="Note shown instead (optional)">
                  <input
                    className="a-field"
                    value={labels.deliveryOffNote || ''}
                    onChange={(e) => setLabels((prev) => ({ ...prev, deliveryOffNote: e.target.value }))}
                    placeholder="e.g. Delivery charge included in the price"
                    maxLength={120}
                  />
                </Field>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Product Page Call / WhatsApp Buttons"
              subtitle="One active button spans the full width; with both active, they sit side by side at equal width."
              icon={Phone}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contactBlock('call')}
              {contactBlock('whatsapp')}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Thank-you page"
              subtitle="Shown after every order — the website checkout, landing pages and online payments use the same page. Empty = the default text."
              icon={PartyPopper}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Language of the page">
                <select className="a-field" value={thanks.language || 'bn'} onChange={(e) => setThanks((p) => ({ ...p, language: e.target.value as 'bn' | 'en' }))}>
                  <option value="bn">বাংলা</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="Heading">
                <input
                  className="a-field"
                  value={thanks.title || ''}
                  onChange={(e) => setThanks((p) => ({ ...p, title: e.target.value }))}
                  placeholder={thanks.language === 'en' ? 'Thank you! Your order is confirmed' : 'ধন্যবাদ! আপনার অর্ডারটি সফল হয়েছে'}
                />
              </Field>
              <Field label="Message under the heading" className="md:col-span-2">
                <input
                  className="a-field"
                  value={thanks.message || ''}
                  onChange={(e) => setThanks((p) => ({ ...p, message: e.target.value }))}
                  placeholder={thanks.language === 'en' ? 'Our team will call you shortly to confirm the order.' : 'আমাদের প্রতিনিধি খুব শীঘ্রই আপনাকে কল করে অর্ডারটি কনফার্ম করবেন।'}
                />
              </Field>
              <Field label="Yellow note (leave one space to hide it)" className="md:col-span-2">
                <input
                  className="a-field"
                  value={thanks.note ?? ''}
                  onChange={(e) => setThanks((p) => ({ ...p, note: e.target.value === '' ? undefined : e.target.value }))}
                  placeholder={thanks.language === 'en' ? 'Please keep your phone on. Check the product on delivery, then pay.' : 'অনুগ্রহ করে আপনার ফোনটি চালু রাখুন। পণ্য হাতে পেয়ে দেখে-বুঝে টাকা পরিশোধ করুন।'}
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Toggle checked={thanks.showItems !== false} onChange={(v) => setThanks((p) => ({ ...p, showItems: v }))} label="Show the ordered products and totals" />
              <Toggle checked={thanks.showInvoice !== false} onChange={(v) => setThanks((p) => ({ ...p, showInvoice: v }))} label="Download invoice (PDF) button" />
              <Toggle checked={thanks.showWhatsapp !== false} onChange={(v) => setThanks((p) => ({ ...p, showWhatsapp: v }))} label="WhatsApp button" description="Uses the WhatsApp number in Settings → Store." />
              <Toggle checked={thanks.showCall !== false} onChange={(v) => setThanks((p) => ({ ...p, showCall: v }))} label="Call button" description="Uses the store phone number." />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Checkout Page Text"
              subtitle="Leave a field empty to use the grey default text shown inside it."
              icon={TypeIcon}
            />
            <div className="space-y-5">
              {LABEL_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4
                    className="font-bold mb-2 uppercase"
                    style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)', letterSpacing: 'var(--ds-tracking-wide)' }}
                  >
                    {group.title}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.fields.map(([key, name]) => (
                      <Field key={key} label={name}>
                        <input
                          className="a-field"
                          value={labels[key] || ''}
                          onChange={(e) => setLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={CHECKOUT_LABEL_DEFAULTS[key]}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------- preview */}
        <div className="min-w-0">
          <div className="xl:sticky xl:top-4 space-y-4">
            <Card>
              <span className="a-label">Product Page Buttons</span>
              {showCall || showWhatsapp ? (
                <div className="flex gap-2">
                  {showCall && (
                    <span
                      className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 font-bold truncate"
                      style={{
                        height: 'var(--ds-h-md)',
                        borderRadius: 'var(--ds-r-md)',
                        background: contact.callBgColor || 'var(--primary)',
                        color: 'var(--primary-foreground)',
                        fontSize: 'var(--a-fs-md)',
                      }}
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <span className="truncate">{contact.callLabel || 'Call Now'}</span>
                    </span>
                  )}
                  {showWhatsapp && (
                    <span
                      className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 font-bold truncate"
                      style={{
                        height: 'var(--ds-h-md)',
                        borderRadius: 'var(--ds-r-md)',
                        background: contact.whatsappBgColor || 'var(--ds-success)',
                        color: 'var(--primary-foreground)',
                        fontSize: 'var(--a-fs-md)',
                      }}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">{contact.whatsappLabel || 'WhatsApp'}</span>
                    </span>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <Info className="w-3.5 h-3.5" /> No contact buttons are enabled
                </p>
              )}
            </Card>

            <Card>
              <span className="a-label">Checkout Preview</span>
              <div
                className="space-y-2.5"
                style={{
                  padding: 'var(--ds-s-3)',
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--ds-surface-2)',
                  border: '1px solid var(--ds-border)',
                }}
              >
                <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  {label('deliverySectionTitle')}
                </span>
                {([
                  ['nameLabel', 'namePlaceholder'],
                  ['phoneLabel', 'phonePlaceholder'],
                  ['addressLabel', 'addressPlaceholder'],
                ] as Array<[LabelKey, LabelKey]>).map(([l, p]) => (
                  <div key={l}>
                    <span className="block mb-1 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-soft)' }}>
                      {label(l)}
                    </span>
                    {previewInput(label(p))}
                  </div>
                ))}
                <div className="ds-divider" />
                <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  {label('summaryTitle')}
                </span>
                {((deliveryOn ? ['subtotalLabel', 'deliveryLabel'] : ['subtotalLabel']) as LabelKey[]).map((key) => (
                  <div key={key} className="flex justify-between" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                    <span>{label(key)}</span>
                    <span className="ds-num">—</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  <span>{label('totalLabel')}</span>
                  <span className="ds-num">—</span>
                </div>
                <span
                  className="flex items-center justify-center font-bold"
                  style={{
                    height: 'var(--ds-h-md)',
                    borderRadius: 'var(--ds-r-md)',
                    background: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: 'var(--a-fs-md)',
                  }}
                >
                  {label('submitLabel')}
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
