import React, { useEffect, useRef, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import {
  Check,
  Copy,
  Compass,
  Download,
  MessageCircle,
  Phone,
  ShoppingBag,
  ClipboardCheck,
  BadgeCheck,
  PackageCheck,
  Truck,
  Home,
  MapPin,
  User,
  Wallet,
  CalendarClock,
  PhoneCall,
} from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { paymentMethodLabel, paymentStatusLabel } from '../../lib/paymentLabels.ts';
import { InvoicePaper, InvoiceSize } from '../admin/InvoiceView.tsx';
import { downloadInvoicePdf } from '../../lib/printDocument.ts';

/**
 * v3.9 — one thank-you page for every order: the website checkout, the
 * landing-page checkout and the return from an online payment all show this.
 * Wording is set in Dashboard → Website → Checkout → Thank-you page.
 */

export interface ThankYouConfig {
  language?: 'bn' | 'en';
  title?: string;
  message?: string;
  note?: string;
  showItems?: boolean;
  showInvoice?: boolean;
  showWhatsapp?: boolean;
  showCall?: boolean;
}

const TEXT = {
  bn: {
    title: 'ধন্যবাদ! আপনার অর্ডারটি সফল হয়েছে',
    message: 'আমাদের প্রতিনিধি খুব শীঘ্রই আপনাকে কল করে অর্ডারটি কনফার্ম করবেন।',
    note: 'অনুগ্রহ করে আপনার ফোনটি চালু রাখুন। পণ্য হাতে পেয়ে দেখে-বুঝে টাকা পরিশোধ করুন।',
    orderNo: 'অর্ডার নাম্বার',
    total: 'সর্বমোট',
    payment: 'পেমেন্ট',
    date: 'অর্ডারের সময়',
    copied: 'কপি হয়েছে',
    copy: 'কপি',
    steps: ['অর্ডার গ্রহণ', 'কনফার্ম', 'শিপমেন্ট', 'ডেলিভারি'],
    yourOrder: 'আপনার অর্ডার',
    items: 'টি পণ্য',
    subtotal: 'সাবটোটাল',
    discount: 'ডিসকাউন্ট',
    delivery: 'ডেলিভারি চার্জ',
    advance: 'অগ্রিম পরিশোধ',
    due: 'ডেলিভারিতে পরিশোধ করবেন',
    grand: 'সর্বমোট',
    recipient: 'প্রাপক',
    address: 'ডেলিভারি ঠিকানা',
    track: 'অর্ডার ট্র্যাক করুন',
    invoice: 'ইনভয়েস ডাউনলোড',
    preparing: 'PDF তৈরি হচ্ছে…',
    downloaded: 'ডাউনলোড হয়েছে ✓',
    whatsapp: 'WhatsApp',
    call: 'কল করুন',
    continue: 'আরও কেনাকাটা করুন',
    noItems: 'পণ্যের তালিকা লোড করা যায়নি। অর্ডার নাম্বার দিয়ে ট্র্যাকিং পেজে দেখতে পারবেন।',
    help: 'কোনো প্রশ্ন থাকলে কল করুন',
  },
  en: {
    title: 'Thank you! Your order is confirmed',
    message: 'Our team will call you shortly to confirm the order.',
    note: 'Please keep your phone on. Check the product on delivery, then pay.',
    orderNo: 'Order number',
    total: 'Total',
    payment: 'Payment',
    date: 'Placed on',
    copied: 'Copied',
    copy: 'Copy',
    steps: ['Order placed', 'Confirmed', 'Shipped', 'Delivered'],
    yourOrder: 'Your order',
    items: 'items',
    subtotal: 'Subtotal',
    discount: 'Discount',
    delivery: 'Delivery charge',
    advance: 'Paid in advance',
    due: 'Pay on delivery',
    grand: 'Total',
    recipient: 'Recipient',
    address: 'Delivery address',
    track: 'Track order',
    invoice: 'Download invoice',
    preparing: 'Preparing PDF…',
    downloaded: 'Downloaded ✓',
    whatsapp: 'WhatsApp',
    call: 'Call us',
    continue: 'Continue shopping',
    noItems: "We couldn't load the product list. You can see it on the tracking page with your order number.",
    help: 'Questions? Call us',
  },
};

const STEP_ICONS = [ClipboardCheck, BadgeCheck, Truck, PackageCheck];
const STEP_FOR_STATUS: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 1,
  packed: 1,
  shipped: 2,
  in_transit: 2,
  delivered: 3,
  completed: 3,
};

const toBnDigits = (text: string) => text.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

export const ThankYouView: React.FC<{
  orderNumber: string;
  phone?: string;
  /** What the page already knows, shown until the saved order arrives */
  fallback?: Record<string, any>;
  settings?: SiteSettings;
  /** Brand colour; the website uses --primary, a landing page its own accent */
  accent?: string;
  onTrack?: (orderNumber: string) => void;
  onContinue?: () => void;
  /** Extra message under the heading (e.g. "the online payment did not go through") */
  notice?: React.ReactNode;
  /** Inside a landing page section: no page padding */
  embedded?: boolean;
}> = ({ orderNumber, phone, fallback, settings, accent = 'var(--primary)', onTrack, onContinue, notice, embedded }) => {
  const config: ThankYouConfig = ((settings as any)?.thank_you_config as ThankYouConfig) || {};
  const lang = config.language === 'en' ? 'en' : 'bn';
  const t = TEXT[lang];
  const currency = settings?.general?.currency || '৳';
  const storePhone = settings?.general?.phone || '';
  const whatsapp = settings?.general?.whatsapp || storePhone;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const paperRef = useRef<HTMLDivElement>(null);
  const customerPhone = phone || fallback?.customerPhone || '';

  useEffect(() => {
    if (!orderNumber) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders/${encodeURIComponent(orderNumber)}/invoice?phone=${encodeURIComponent(customerPhone)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber, customerPhone]);

  const order: Record<string, any> = { ...(fallback || {}), ...(data?.order || {}) };
  const items: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(fallback?.items) ? fallback!.items : [];
  const num = (v: any) => Number(v || 0);
  const money = (value: any) => {
    const text = `${currency}${num(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return lang === 'bn' ? toBnDigits(text) : text;
  };
  const digits = (value: any) => (lang === 'bn' ? toBnDigits(String(value ?? '')) : String(value ?? ''));

  const total = num(order.total);
  const advance = num(order.advancePaid);
  const paidOnline = String(order.paymentStatus || '') === 'paid';
  const due = paidOnline ? 0 : Math.max(0, total - advance);
  const stepIndex = STEP_FOR_STATUS[String(order.orderStatus || 'pending')] ?? 0;
  const placedAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const placedText = placedAt.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  // The checkout usually writes the thana / district into the address already
  const place = [order.thana, order.district]
    .filter((part) => part && !String(order.customerAddress || '').toLowerCase().includes(String(part).toLowerCase()))
    .join(', ');
  const statusText = (status: string) => {
    if (lang !== 'bn') return paymentStatusLabel(status);
    const bn: Record<string, string> = { paid: 'পরিশোধিত', unpaid: 'ডেলিভারিতে পরিশোধ', pending: 'অপেক্ষমান', partial: 'আংশিক পরিশোধিত', failed: 'ব্যর্থ', refunded: 'ফেরত দেওয়া হয়েছে' };
    return bn[status] || paymentStatusLabel(status);
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  const invoiceUrl = `/invoice/${encodeURIComponent(orderNumber)}?phone=${encodeURIComponent(customerPhone)}`;
  const downloadInvoice = async () => {
    if (!data?.order || !paperRef.current) {
      window.open(invoiceUrl, '_blank');
      return;
    }
    setPdfState('working');
    try {
      const size = (data.invoiceConfig?.defaultSize as InvoiceSize) || 'a4';
      const prefix = data.invoiceConfig?.invoicePrefix || 'INV-';
      await downloadInvoicePdf([paperRef.current], size === 'a4' ? 'a4' : size, `${prefix}${orderNumber}`);
      setPdfState('done');
    } catch {
      setPdfState('error');
      window.open(invoiceUrl, '_blank');
    }
  };

  const openWhatsApp = () => {
    const text = encodeURIComponent(
      lang === 'bn'
        ? `আসসালামু আলাইকুম, আমি একটি অর্ডার করেছি। অর্ডার নাম্বার: ${orderNumber}`
        : `Hello! I've just placed order #${orderNumber}.`
    );
    const digitsOnly = String(whatsapp).replace(/\D/g, '');
    window.open(`https://wa.me/${digitsOnly.startsWith('88') ? digitsOnly : `88${digitsOnly}`}?text=${text}`, '_blank');
  };

  const track = () => {
    if (onTrack) onTrack(orderNumber);
    else window.location.href = `/track?order=${encodeURIComponent(orderNumber)}`;
  };

  const soft = (amount: number) => `color-mix(in srgb, ${accent} ${amount}%, transparent)`;
  const showItems = config.showItems !== false;
  const showInvoice = config.showInvoice !== false;
  const showWhatsapp = config.showWhatsapp !== false && Boolean(whatsapp);
  const showCall = config.showCall !== false && Boolean(storePhone);
  const itemCount = items.reduce((sum, item) => sum + num(item.quantity || 1), 0) || items.length;

  return (
    <div className={embedded ? 'ty-wrap' : 'ty-wrap max-w-3xl mx-auto px-4 py-8 sm:py-12'} style={{ ['--ty-accent' as any]: accent }}>
      <div className="ty-card overflow-hidden" style={{ borderRadius: 24, background: 'var(--ds-surface, #fff)', border: '1px solid var(--ds-border, #e5e7eb)', boxShadow: '0 30px 70px -40px rgba(15,23,42,.45)' }}>
        {/* ---------------------------------------------------------- hero */}
        <div className="relative px-5 pt-9 pb-7 sm:px-10 text-center overflow-hidden" style={{ background: `linear-gradient(160deg, ${soft(16)}, ${soft(4)} 60%, transparent)` }}>
          <span aria-hidden className="ty-confetti" />
          <span className="ty-badge relative mx-auto grid place-items-center" style={{ width: 88, height: 88, borderRadius: 999, background: accent, color: '#fff', boxShadow: `0 18px 40px -14px ${accent}` }}>
            <span aria-hidden className="ty-ring" style={{ borderColor: soft(45) }} />
            <Check className="w-11 h-11" strokeWidth={3} />
          </span>
          <h1 className="mt-5 font-extrabold leading-snug" style={{ fontSize: 'clamp(22px, 4.2vw, 30px)', color: 'var(--ds-text, #0f172a)' }}>
            {config.title || t.title}
          </h1>
          <p className="mt-2 mx-auto max-w-lg" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ds-text-soft, #475569)' }}>
            {config.message || t.message}
          </p>
          {notice && <div className="mt-4 mx-auto max-w-lg">{notice}</div>}

          {/* order number chip */}
          <div className="mt-5 inline-flex items-center gap-2 pl-4 pr-1.5 py-1.5" style={{ borderRadius: 999, background: 'var(--ds-surface, #fff)', border: `1.5px dashed ${soft(55)}` }}>
            <span style={{ fontSize: 13, color: 'var(--ds-text-muted, #64748b)' }}>{t.orderNo}</span>
            <span className="ds-num font-extrabold" style={{ fontSize: 17, color: 'var(--ds-text, #0f172a)', letterSpacing: '.02em' }}>
              {orderNumber}
            </span>
            <button
              type="button"
              onClick={copyNumber}
              className="inline-flex items-center gap-1 px-2.5 h-8 font-semibold cursor-pointer"
              style={{ borderRadius: 999, background: soft(12), color: accent, fontSize: 12 }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </div>

        {/* --------------------------------------------------- quick facts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px" style={{ background: 'var(--ds-border-soft, #eef2f7)', borderTop: '1px solid var(--ds-border-soft, #eef2f7)', borderBottom: '1px solid var(--ds-border-soft, #eef2f7)' }}>
          {[
            { icon: Wallet, label: t.total, value: money(total), strong: true },
            {
              icon: BadgeCheck,
              label: t.payment,
              value: paymentMethodLabel(order.paymentMethod, (settings as any)?.payment?.methods) || '—',
              sub: order.paymentStatus ? statusText(String(order.paymentStatus)) : '',
            },
            { icon: CalendarClock, label: t.date, value: placedText, wide: true },
          ].map((fact, index) => (
            <div key={index} className={`p-4 sm:p-5 flex items-start gap-3 ${fact.wide ? 'col-span-2 sm:col-span-1' : ''}`} style={{ background: 'var(--ds-surface, #fff)' }}>
              <span className="grid place-items-center shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: soft(10), color: accent }}>
                <fact.icon className="w-[18px] h-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 12, color: 'var(--ds-text-muted, #64748b)' }}>
                  {fact.label}
                </span>
                <span className="block font-bold ds-num leading-snug break-words" style={{ fontSize: fact.strong ? 19 : 15, color: fact.strong ? accent : 'var(--ds-text, #0f172a)' }}>
                  {fact.value}
                </span>
                {fact.sub && (
                  <span className="block" style={{ fontSize: 12, color: 'var(--ds-text-soft, #475569)' }}>
                    {fact.sub}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------------ progress */}
        <div className="px-5 sm:px-10 py-6">
          <ol className="flex items-start">
            {t.steps.map((label, index) => {
              const Icon = STEP_ICONS[index];
              const done = index <= stepIndex;
              const current = index === stepIndex;
              return (
                <React.Fragment key={label}>
                  <li className="flex flex-col items-center gap-2 min-w-0" style={{ flex: '0 0 auto', width: 72 }}>
                    <span
                      className={`grid place-items-center ${current ? 'ty-pulse' : ''}`}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        background: done ? accent : 'var(--ds-surface-3, #eef2f7)',
                        color: done ? '#fff' : 'var(--ds-text-faint, #94a3b8)',
                        boxShadow: current ? `0 0 0 6px ${soft(16)}` : 'none',
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-center font-semibold leading-tight" style={{ fontSize: 12, color: done ? 'var(--ds-text, #0f172a)' : 'var(--ds-text-faint, #94a3b8)' }}>
                      {label}
                    </span>
                  </li>
                  {index < t.steps.length - 1 && (
                    <li aria-hidden className="flex-1 mt-5 h-[3px]" style={{ borderRadius: 999, background: index < stepIndex ? accent : 'var(--ds-border, #e5e7eb)' }} />
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        </div>

        {/* --------------------------------------------------------- items */}
        {showItems && (
          <div className="mx-4 sm:mx-8 mb-5" style={{ borderRadius: 18, border: '1px solid var(--ds-border-soft, #eef2f7)', overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 sm:px-5 py-3" style={{ background: 'var(--ds-surface-2, #f8fafc)' }}>
              <span className="font-bold inline-flex items-center gap-2" style={{ fontSize: 15 }}>
                <ShoppingBag className="w-4 h-4" style={{ color: accent }} /> {t.yourOrder}
              </span>
              {itemCount > 0 && (
                <span className="ds-num" style={{ fontSize: 13, color: 'var(--ds-text-muted, #64748b)' }}>
                  {digits(itemCount)} {t.items}
                </span>
              )}
            </div>
            <ul>
              {loading && !items.length ? (
                Array.from({ length: 2 }).map((_, index) => (
                  <li key={index} className="flex items-center gap-3 px-4 sm:px-5 py-3" style={{ borderTop: '1px solid var(--ds-border-soft, #eef2f7)' }}>
                    <div className="ds-skeleton w-14 h-14 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="ds-skeleton h-3.5 w-1/2" />
                      <div className="ds-skeleton h-3 w-1/4" />
                    </div>
                  </li>
                ))
              ) : items.length === 0 ? (
                <li className="px-5 py-4" style={{ fontSize: 14, color: 'var(--ds-text-muted, #64748b)', borderTop: '1px solid var(--ds-border-soft, #eef2f7)' }}>
                  {t.noItems}
                </li>
              ) : (
                items.map((item, index) => (
                  <li key={item.id || index} className="flex items-center gap-3 px-4 sm:px-5 py-3" style={{ borderTop: '1px solid var(--ds-border-soft, #eef2f7)' }}>
                    <span className="relative shrink-0">
                      <img
                        src={item.image ? sized(item.image, 160) : IMAGE_PLACEHOLDER}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = IMAGE_PLACEHOLDER;
                        }}
                        className="w-14 h-14 object-cover"
                        style={{ borderRadius: 12, background: 'var(--ds-surface-2, #f8fafc)', border: '1px solid var(--ds-border-soft, #eef2f7)' }}
                      />
                      <span className="absolute -top-1.5 -right-1.5 grid place-items-center ds-num font-bold" style={{ minWidth: 20, height: 20, padding: '0 5px', borderRadius: 999, background: accent, color: '#fff', fontSize: 11 }}>
                        {digits(item.quantity)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold ds-clamp-2" style={{ fontSize: 14.5, color: 'var(--ds-text, #0f172a)' }}>
                        {item.productName || item.name}
                      </span>
                      {item.variationLabel && (
                        <span className="block" style={{ fontSize: 12, color: 'var(--ds-text-muted, #64748b)' }}>
                          {item.variationLabel}
                        </span>
                      )}
                      <span className="block ds-num" style={{ fontSize: 12.5, color: 'var(--ds-text-soft, #475569)' }}>
                        {money(item.unitPrice ?? item.price)} × {digits(item.quantity)}
                      </span>
                    </span>
                    <span className="font-bold ds-num shrink-0" style={{ fontSize: 15 }}>
                      {money(item.subtotal ?? num(item.unitPrice ?? item.price) * num(item.quantity))}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <dl className="px-4 sm:px-5 py-4 space-y-2" style={{ background: 'var(--ds-surface-2, #f8fafc)', borderTop: '1px solid var(--ds-border-soft, #eef2f7)', fontSize: 14 }}>
              {order.subtotal !== undefined && (
                <div className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--ds-text-soft, #475569)' }}>{t.subtotal}</dt>
                  <dd className="font-semibold ds-num">{money(order.subtotal)}</dd>
                </div>
              )}
              {num(order.discount) > 0 && (
                <div className="flex justify-between gap-3" style={{ color: 'var(--ds-success-text, #15803d)' }}>
                  <dt>{t.discount}</dt>
                  <dd className="font-semibold ds-num">− {money(order.discount)}</dd>
                </div>
              )}
              {order.shippingCharge !== undefined && (
                <div className="flex justify-between gap-3">
                  <dt className="min-w-0" style={{ color: 'var(--ds-text-soft, #475569)' }}>
                    {t.delivery}
                  </dt>
                  <dd className="font-semibold ds-num shrink-0">{money(order.shippingCharge)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3 pt-2" style={{ borderTop: '1px dashed var(--ds-border, #e5e7eb)' }}>
                <dt className="font-bold" style={{ fontSize: 15 }}>
                  {t.grand}
                </dt>
                <dd className="font-black ds-num" style={{ fontSize: 20, color: accent }}>
                  {money(total)}
                </dd>
              </div>
              {advance > 0 && !paidOnline && (
                <div className="flex justify-between gap-3" style={{ color: 'var(--ds-success-text, #15803d)' }}>
                  <dt>{t.advance}</dt>
                  <dd className="font-semibold ds-num">− {money(advance)}</dd>
                </div>
              )}
              {due > 0 && (advance > 0 || /cod|cash/i.test(String(order.paymentMethod || ''))) && (
                <div className="flex justify-between gap-3 px-3 py-2 mt-1" style={{ borderRadius: 10, background: soft(9) }}>
                  <dt className="font-semibold">{t.due}</dt>
                  <dd className="font-extrabold ds-num" style={{ color: accent }}>
                    {money(due)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* ---------------------------------------------------- delivery */}
        {(order.customerName || order.customerAddress) && (
          <div className="mx-4 sm:mx-8 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 p-4" style={{ borderRadius: 16, background: 'var(--ds-surface-2, #f8fafc)' }}>
              <User className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 12, color: 'var(--ds-text-muted, #64748b)' }}>
                  {t.recipient}
                </span>
                <span className="block font-bold" style={{ fontSize: 15 }}>
                  {order.customerName}
                </span>
                <span className="block ds-num" style={{ fontSize: 14, color: 'var(--ds-text-soft, #475569)' }}>
                  {order.customerPhone}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-3 p-4" style={{ borderRadius: 16, background: 'var(--ds-surface-2, #f8fafc)' }}>
              <MapPin className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 12, color: 'var(--ds-text-muted, #64748b)' }}>
                  {t.address}
                </span>
                <span className="block break-words" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {order.customerAddress}
                </span>
                {place && (
                  <span className="block font-semibold" style={{ fontSize: 13, color: 'var(--ds-text-soft, #475569)' }}>
                    {place}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- note */}
        {String(config.note ?? t.note).trim() && (
          <div className="mx-4 sm:mx-8 mb-6 flex items-start gap-2.5 px-4 py-3" style={{ borderRadius: 14, background: '#fffbeb', color: '#92400e', fontSize: 14, lineHeight: 1.6 }}>
            <PhoneCall className="w-4 h-4 shrink-0 mt-1" />
            <span>{config.note ?? t.note}</span>
          </div>
        )}

        {/* ----------------------------------------------------- actions */}
        <div className="px-4 sm:px-8 pb-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button type="button" onClick={track} className="inline-flex items-center justify-center gap-2 h-12 font-bold cursor-pointer" style={{ borderRadius: 14, background: accent, color: '#fff' }}>
            <Compass className="w-4 h-4" /> {t.track}
          </button>
          {showInvoice ? (
            <button
              type="button"
              onClick={downloadInvoice}
              disabled={pdfState === 'working'}
              className="inline-flex items-center justify-center gap-2 h-12 font-bold cursor-pointer disabled:opacity-60"
              style={{ borderRadius: 14, background: soft(10), color: accent }}
            >
              <Download className="w-4 h-4" /> {pdfState === 'working' ? t.preparing : pdfState === 'done' ? t.downloaded : t.invoice}
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {showWhatsapp && (
            <button type="button" onClick={openWhatsApp} className="inline-flex items-center justify-center gap-2 h-12 font-bold cursor-pointer" style={{ borderRadius: 14, background: '#e8f8ee', color: '#15803d' }}>
              <MessageCircle className="w-4 h-4" /> {t.whatsapp}
            </button>
          )}
          {showCall && (
            <a href={`tel:${storePhone}`} className="inline-flex items-center justify-center gap-2 h-12 font-bold" style={{ borderRadius: 14, border: '1.5px solid var(--ds-border, #e5e7eb)', color: 'var(--ds-text, #0f172a)' }}>
              <Phone className="w-4 h-4" /> {t.call} <span className="ds-num">{storePhone}</span>
            </a>
          )}
        </div>
      </div>

      {onContinue && (
        <div className="text-center mt-5">
          <button type="button" onClick={onContinue} className="inline-flex items-center gap-2 font-semibold cursor-pointer" style={{ fontSize: 15, color: 'var(--ds-text-muted, #64748b)' }}>
            <Home className="w-4 h-4" /> {t.continue}
          </button>
        </div>
      )}

      {/* Off-screen invoice, only used to make the PDF */}
      {data?.order && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <InvoicePaper
            ref={paperRef}
            order={data.order}
            items={data.items || []}
            config={data.invoiceConfig}
            general={data.general}
            size={(data.invoiceConfig?.defaultSize as InvoiceSize) || 'a4'}
            currency={currency}
          />
        </div>
      )}
    </div>
  );
};
