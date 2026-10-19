import React, { useEffect, useState } from 'react';
import { FileWarning, ArrowLeft, AlertCircle } from 'lucide-react';
import { InvoiceView, InvoiceSize } from '../admin/InvoiceView.tsx';

interface Props {
  orderNumber: string;
  phone?: string;
  onClose: () => void;
  currency?: string;
}

/**
 * Customer-facing invoice. The API only hands the payload over when the phone
 * number on the order matches, so a guessed order number is not enough to read
 * somebody else's invoice.
 */
export const CustomerInvoiceView: React.FC<Props> = ({ orderNumber, phone, onClose, currency = '৳' }) => {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState<InvoiceSize>('a4');
  const [phoneInput, setPhoneInput] = useState(phone || '');

  const load = (checkPhone: string) => {
    setLoading(true);
    setError('');
    fetch(
      `/api/orders/${encodeURIComponent(orderNumber)}/invoice?phone=${encodeURIComponent(checkPhone)}`
    )
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Invoice not found.');
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setSize((payload.invoiceConfig?.defaultSize as InvoiceSize) || 'a4');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (phone) load(phone);
    else setLoading(false);
  }, [orderNumber, phone]);

  if (loading) {
    // An invoice-shaped skeleton, so the page does not jump when it arrives
    return (
      <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-10)" aria-busy="true">
        <div className="ds-card p-(--ds-card-pad-lg) space-y-(--ds-s-5)">
          <div className="flex justify-between gap-(--ds-s-4)">
            <div className="space-y-(--ds-s-2) flex-1">
              <div className="ds-skeleton h-6 w-2/5" />
              <div className="ds-skeleton h-3 w-3/5" />
            </div>
            <div className="ds-skeleton h-12 w-24" />
          </div>
          <div className="ds-skeleton h-px w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-(--ds-s-4)">
              <div className="ds-skeleton h-4 w-1/2" />
              <div className="ds-skeleton h-4 w-16" />
            </div>
          ))}
          <div className="ds-skeleton h-8 w-1/3 ml-auto" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-md mx-auto px-(--ds-s-4) py-(--ds-s-16) ds-fade-in">
        <div className="ds-card p-(--ds-card-pad-lg) text-center">
          <span className="mx-auto w-14 h-14 rounded-(--ds-r-full) inline-flex items-center justify-center bg-(--ds-warning-soft) text-(--ds-warning-text)">
            <FileWarning className="w-6 h-6" />
          </span>
          <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">
            Verify to View Your Invoice
          </h1>
          <p className="mt-(--ds-s-2) text-(length:--ds-fs-base) text-(--ds-text-soft) leading-(--ds-lh-bn)">
            Enter the mobile number used for order <strong className="font-(--ds-fw-bold) text-(--ds-text) ds-num break-all">{orderNumber}</strong> to view
            its invoice.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-(--ds-s-4) flex items-start gap-(--ds-s-2) text-left rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form
            className="mt-(--ds-s-5) flex gap-(--ds-s-2)"
            onSubmit={(e) => {
              e.preventDefault();
              load(phoneInput);
            }}
          >
            <input
              type="tel"
              inputMode="numeric"
              aria-label="Mobile number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="ds-input h-(--ds-h-lg) flex-1 min-w-0 ds-num"
            />
            <button type="submit" className="ds-btn ds-btn-primary ds-btn-lg shrink-0">
              View
            </button>
          </form>
        </div>

        <div className="mt-(--ds-s-4) text-center">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <InvoiceView
      order={data.order}
      items={data.items || []}
      config={data.invoiceConfig}
      general={data.general}
      size={size}
      onSizeChange={setSize}
      onClose={onClose}
      currency={currency}
    />
  );
};
