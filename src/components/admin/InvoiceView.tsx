import React, { useMemo, useRef, useState } from 'react';
import { printInvoices, downloadInvoicePdf } from '../../lib/printDocument.ts';
import { X, Printer, Download, FileText } from 'lucide-react';
import { paymentMethodLabel, paymentStatusLabel } from '../../lib/paymentLabels.ts';

export type InvoiceSize = 'a4' | 'mm80' | 'mm58';

interface InvoiceViewProps {
  order: any;
  items: any[];
  config?: any;
  general?: any;
  size: InvoiceSize;
  onSizeChange: (size: InvoiceSize) => void;
  onClose: () => void;
  currency?: string;
  /** Hide the size switcher — used on the customer-facing download */
  compact?: boolean;
}

const SIZE_META: Record<InvoiceSize, { label: string; width: string; page: string }> = {
  a4: { label: 'A4', width: '210mm', page: 'A4 portrait' },
  mm80: { label: '80mm', width: '80mm', page: '80mm auto' },
  mm58: { label: '58mm', width: '58mm', page: '58mm auto' },
};

const money = (value: any, currency = '৳') =>
  `${currency}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Printable invoice in three paper sizes.
 *
 * A4 is the full document (logo block, billing panel, itemised table, totals,
 * signature); 80mm and 58mm collapse to a thermal receipt layout. The @page
 * rule is injected per size so the browser's print dialog picks the right paper
 * without the operator changing anything.
 */
interface InvoicePaperProps {
  order: any;
  items: any[];
  config?: any;
  general?: any;
  size: InvoiceSize;
  currency?: string;
  className?: string;
}

/**
 * The invoice itself — no toolbar, no overlay. Used by the invoice viewer,
 * by bulk printing (many papers, one per page) and by the PDF download.
 */
export const InvoicePaper = React.forwardRef<HTMLDivElement, InvoicePaperProps>(
  ({ order, items, config, general, size, currency = '৳', className = '' }, ref) => {
  const meta = SIZE_META[size];
  const thermal = size !== 'a4';

  const invoice = {
    businessName: config?.businessName || general?.storeName || 'Invoice',
    tagline: config?.tagline || '',
    // The invoice's own logo, else the website logo — every invoice carries one
    logoUrl: config?.logoUrl || general?.logoUrl || '',
    address: config?.address || general?.address || '',
    phone: config?.phone || general?.phone || '',
    email: config?.email || general?.email || '',
    drugLicense: config?.drugLicense || '',
    vatRegistration: config?.vatRegistration || '',
    invoicePrefix: config?.invoicePrefix || 'INV-',
    footerNote: config?.footerNote || '',
    termsNote: config?.termsNote || '',
    showLogo: config?.showLogo !== false,
    showSignature: config?.showSignature !== false,
    signatureLabel: config?.signatureLabel || 'Authorised signature',
  };

  const paymentName = order.paymentMethodLabel || paymentMethodLabel(order.paymentMethod, general?.paymentMethods);
  const paymentState = paymentStatusLabel(order.paymentStatus);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [items]
  );

  return (
    <div
      ref={ref}
      className={`invoice-print-root bg-white ${className}`}
      style={{
        width: meta.width,
        maxWidth: '100%',
        padding: thermal ? '10px' : '28px 30px',
        fontFamily: 'var(--font-sans)',
        color: '#111827',
        fontSize: thermal ? '11px' : '13px',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div
        className={thermal ? 'text-center' : 'flex items-start justify-between gap-6'}
        style={{ paddingBottom: thermal ? 8 : 16, borderBottom: '2px solid #111827' }}
      >
        <div className={thermal ? '' : 'min-w-0'}>
          {invoice.showLogo && invoice.logoUrl && (
            // Standard logo box: any shape of logo fits without stretching
            <img
              src={invoice.logoUrl}
              alt={invoice.businessName}
              data-invoice-logo=""
              style={{
                display: 'block',
                width: 'auto',
                height: 'auto',
                maxHeight: thermal ? 44 : 64,
                maxWidth: thermal ? '72%' : 220,
                objectFit: 'contain',
                margin: thermal ? '0 auto 6px' : '0 0 10px',
              }}
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div style={{ fontSize: thermal ? '14px' : '20px', fontWeight: 800 }}>
            {invoice.businessName}
          </div>
          {invoice.tagline && <div style={{ color: '#6b7280' }}>{invoice.tagline}</div>}
          <div style={{ color: '#6b7280', marginTop: 3 }}>
            {invoice.address}
            {invoice.phone && <div>Phone: {invoice.phone}</div>}
            {invoice.email && !thermal && <div>{invoice.email}</div>}
            {invoice.drugLicense && <div>Drug License: {invoice.drugLicense}</div>}
            {invoice.vatRegistration && !thermal && <div>VAT: {invoice.vatRegistration}</div>}
          </div>
        </div>

        {!thermal && (
          <div className="text-right shrink-0">
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>INVOICE</div>
            <div style={{ color: '#6b7280', marginTop: 4 }}>
              <div>
                <strong>{invoice.invoicePrefix}</strong>
                {order.orderNumber}
              </div>
              <div>{new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })}</div>
              {order.consignmentId && (
                <div>
                  Consignment: <strong>{order.consignmentId}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {thermal && (
        <div style={{ textAlign: 'center', padding: '6px 0', borderBottom: '1px dashed #9ca3af' }}>
          <div style={{ fontWeight: 700 }}>
            {invoice.invoicePrefix}
            {order.orderNumber}
          </div>
          <div style={{ color: '#6b7280' }}>
            {new Date(order.createdAt || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
          </div>
          {order.consignmentId && <div>CN: {order.consignmentId}</div>}
        </div>
      )}

      {/* Billing block */}
      {thermal ? (
        <div style={{ padding: '6px 0', borderBottom: '1px dashed #9ca3af' }}>
          <div>
            <strong>{order.customerName}</strong>
          </div>
          <div>{order.customerPhone}</div>
          <div style={{ color: '#6b7280' }}>{order.customerAddress}</div>
          <div style={{ marginTop: 3 }}>
            Payment: <strong>{paymentName}</strong>
            {paymentState ? ` · ${paymentState}` : ''}
          </div>
          {order.transactionId && <div style={{ color: '#6b7280' }}>TrxID: {order.transactionId}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6" style={{ padding: '16px 0' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8c95a6', fontWeight: 700 }}>
              Bill To
            </div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{order.customerName}</div>
            <div>{order.customerPhone}</div>
            <div style={{ color: '#6b7280' }}>{order.customerAddress}</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#8c95a6', fontWeight: 700 }}>
              Payment
            </div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{paymentName}</div>
            {paymentState && <div style={{ color: '#6b7280' }}>{paymentState}</div>}
            {order.transactionId && <div style={{ color: '#6b7280' }}>TrxID: {order.transactionId}</div>}
            {order.shippingZone && <div style={{ color: '#6b7280' }}>{order.shippingZone}</div>}
            {order.courierService && (
              <div style={{ color: '#6b7280' }}>Courier: {order.courierService}</div>
            )}
          </div>
        </div>
      )}

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: thermal ? 6 : 0 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: thermal ? '4px 0' : '10px 8px',
                borderBottom: '1px solid #d1d5db',
                fontSize: thermal ? '10px' : '11px',
                textTransform: 'uppercase',
                color: '#6b7280',
              }}
            >
              Item
            </th>
            <th
              style={{
                textAlign: 'center',
                padding: thermal ? '4px 0' : '10px 8px',
                borderBottom: '1px solid #d1d5db',
                fontSize: thermal ? '10px' : '11px',
                textTransform: 'uppercase',
                color: '#6b7280',
              }}
            >
              Qty
            </th>
            {!thermal && (
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 8px',
                  borderBottom: '1px solid #d1d5db',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: '#6b7280',
                }}
              >
                Price
              </th>
            )}
            <th
              style={{
                textAlign: 'right',
                padding: thermal ? '4px 0' : '10px 8px',
                borderBottom: '1px solid #d1d5db',
                fontSize: thermal ? '10px' : '11px',
                textTransform: 'uppercase',
                color: '#6b7280',
              }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id || index}>
              <td style={{ padding: thermal ? '4px 0' : '10px 8px', borderBottom: '1px solid #f1f3f7' }}>
                <div style={{ fontWeight: 600 }}>{item.productName}</div>
                {item.variationLabel && !String(item.productName || '').includes(item.variationLabel) && (
                  <div style={{ color: '#6b7280', fontSize: thermal ? '10px' : '12px' }}>{item.variationLabel}</div>
                )}
                {!thermal && item.sku && (
                  <div style={{ color: '#9ca3af', fontSize: '11px' }}>SKU: {item.sku}</div>
                )}
                {thermal && (
                  <div style={{ color: '#6b7280' }}>
                    {money(item.unitPrice, currency)} × {item.quantity}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: thermal ? '4px 0' : '10px 8px',
                  borderBottom: '1px solid #f1f3f7',
                  textAlign: 'center',
                }}
              >
                {item.quantity}
              </td>
              {!thermal && (
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f3f7', textAlign: 'right' }}>
                  {money(item.unitPrice, currency)}
                </td>
              )}
              <td
                style={{
                  padding: thermal ? '4px 0' : '10px 8px',
                  borderBottom: '1px solid #f1f3f7',
                  textAlign: 'right',
                  fontWeight: 700,
                }}
              >
                {money(item.subtotal, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div
        style={{
          marginTop: thermal ? 6 : 14,
          marginLeft: thermal ? 0 : 'auto',
          width: thermal ? '100%' : '58%',
        }}
      >
        {[
          ['Subtotal', money(order.subtotal ?? subtotal, currency)],
          ['Discount', `− ${money(order.discount, currency)}`],
          ['Delivery', money(order.shippingCharge, currency)],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{ display: 'flex', justifyContent: 'space-between', padding: thermal ? '2px 0' : '5px 8px' }}
          >
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: thermal ? '5px 0' : '9px 8px',
            borderTop: '2px solid #111827',
            marginTop: 4,
            fontSize: thermal ? '13px' : '16px',
            fontWeight: 800,
          }}
        >
          <span>Total</span>
          <span>{money(order.total, currency)}</span>
        </div>
        {Number(order.advancePaid) > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: thermal ? '2px 0' : '5px 8px' }}>
              <span style={{ color: '#047857' }}>Advance paid</span>
              <span style={{ fontWeight: 600, color: '#047857' }}>− {money(order.advancePaid, currency)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: thermal ? '4px 0' : '7px 8px',
                background: thermal ? 'transparent' : '#f3f4f6',
                fontWeight: 800,
                fontSize: thermal ? '12px' : '14px',
              }}
            >
              <span>Due (to collect)</span>
              <span>
                {money(order.paymentStatus === 'paid' ? 0 : Math.max(0, Number(order.total || 0) - Number(order.advancePaid || 0)), currency)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: thermal ? 8 : 26,
          paddingTop: thermal ? 6 : 14,
          borderTop: thermal ? '1px dashed #9ca3af' : '1px solid #e5e7eb',
          color: '#6b7280',
          textAlign: thermal ? 'center' : 'left',
        }}
      >
        {!thermal && invoice.showSignature && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
            <div style={{ textAlign: 'center', minWidth: 190 }}>
              <div style={{ height: 34 }} />
              <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 5 }}>{invoice.signatureLabel}</div>
            </div>
          </div>
        )}
        {invoice.termsNote && !thermal && <div style={{ marginBottom: 4 }}>{invoice.termsNote}</div>}
        {invoice.footerNote && <div style={{ fontWeight: 600 }}>{invoice.footerNote}</div>}
      </div>
    </div>
  );
  }
);
InvoicePaper.displayName = 'InvoicePaper';

export const InvoiceView: React.FC<InvoiceViewProps> = ({
  order,
  items,
  config,
  general,
  size,
  onSizeChange,
  onClose,
  currency = '৳',
  compact = false,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const prefix = config?.invoicePrefix || 'INV-';

  // Printed from an isolated frame: exactly this invoice, no blank extra pages
  const handlePrint = async () => {
    if (!printRef.current) return;
    setBusy('print');
    try {
      await printInvoices([printRef.current], size, `${prefix}${order.orderNumber}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setBusy('pdf');
    try {
      await downloadInvoicePdf([printRef.current], size, `${prefix}${order.orderNumber}`);
    } catch {
      // PDF engine failed to load (offline?) — fall back to the print dialog's "Save as PDF"
      await printInvoices([printRef.current], size, `${prefix}${order.orderNumber}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'rgba(15,23,42,0.55)' }}>
      {/* Toolbar (never printed) */}
      <div
        className="no-print flex items-center justify-between gap-3 px-4 py-3 shrink-0"
        style={{ background: '#fff', borderBottom: '1px solid #e9ecf2' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4" style={{ color: 'var(--primary-ink, var(--primary))' }} />
          <span className="font-bold truncate">
            {prefix}
            {order.orderNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!compact && (
            <div className="flex items-center gap-1 p-1 rounded-[10px]" style={{ background: '#f4f6fa' }}>
              {(Object.keys(SIZE_META) as InvoiceSize[]).map((key) => (
                <button
                  key={key}
                  onClick={() => onSizeChange(key)}
                  className="px-3 py-1.5 rounded-lg font-semibold cursor-pointer"
                  style={{
                    fontSize: '13px',
                    background: key === size ? 'var(--primary)' : 'transparent',
                    color: key === size ? '#fff' : '#5b6472',
                  }}
                >
                  {SIZE_META[key].label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="px-3 py-2 rounded-[10px] font-semibold flex items-center gap-2 cursor-pointer"
            style={{ border: '1px solid #dde2ea', fontSize: '13px' }}
          >
            <Download className="w-4 h-4" /> {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button
            onClick={handlePrint}
            disabled={busy !== null}
            className="px-3.5 py-2 rounded-[10px] font-bold text-white flex items-center gap-2 cursor-pointer"
            style={{ background: 'var(--primary)', fontSize: '13px' }}
          >
            <Printer className="w-4 h-4" /> {busy === 'print' ? 'Opening…' : 'Print'}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-[10px] flex items-center justify-center cursor-pointer"
            style={{ border: '1px solid #dde2ea' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Paper */}
      {/* items-start: the paper keeps its full height and the frame scrolls.
          It used to be stretched to the window height, so a long invoice ran
          past its white page and the PDF/print stopped at the visible part. */}
      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-8 flex justify-center items-start">
        <InvoicePaper
          ref={printRef}
          order={order}
          items={items}
          config={config}
          general={general}
          size={size}
          currency={currency}
          className="shadow-xl shrink-0"
        />
      </div>
    </div>
  );
};
