import React, { useCallback, useEffect, useState } from 'react';
import { normalizeBdPhone } from '../../lib/phone.ts';
import { XCircle, Clock, RefreshCw, Banknote, Phone, ArrowLeft, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Order, SiteSettings } from '../../types/index.ts';
import { OrderSuccessView } from './OrderSuccessView.tsx';
import { GATEWAY_LOOK, clearPendingPayment, isOnlineGateway, readPendingPayment, startOnlinePayment } from '../../lib/onlinePayment.ts';

interface Props {
  params: { order?: string; status?: string; gateway?: string; message?: string };
  settings?: SiteSettings;
  onNavigate: (view: string, params?: any) => void;
  onTrack: (orderNumber: string) => void;
}

type Phase = 'ask-phone' | 'checking' | 'paid' | 'cod' | 'failed' | 'waiting';

/**
 * Where SSLCommerz / bKash / Nagad send the customer back. The address says
 * what the gateway reported, but the page always asks our server, which has
 * confirmed the payment with the gateway itself.
 */
export const PaymentResultView: React.FC<Props> = ({ params, settings, onNavigate, onTrack }) => {
  const orderNumber = String(params.order || '');
  const pending = readPendingPayment();
  const [phone, setPhone] = useState(pending && pending.orderNumber === orderNumber ? pending.phone : '');
  const [phoneInput, setPhoneInput] = useState('');
  const [phase, setPhase] = useState<Phase>(phone ? 'checking' : 'ask-phone');
  const [info, setInfo] = useState<any>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState<'' | 'retry' | 'cod'>('');
  const [error, setError] = useState('');
  const currency = settings?.general?.currency || '৳';
  const gateway = String(info?.paymentMethod || params.gateway || pending?.gateway || '');
  const look = GATEWAY_LOOK[gateway as keyof typeof GATEWAY_LOOK];

  const loadOrder = useCallback(async (number: string, mobile: string) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(number)}/invoice?phone=${encodeURIComponent(mobile)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.order) setOrder({ ...data.order, items: data.items } as Order);
  }, []);

  const check = useCallback(
    async (mobile: string, attempt = 0) => {
      if (!orderNumber) return;
      try {
        const res = await fetch(`/api/payments/status?order=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(mobile)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'We could not find this order.');
          setPhase('ask-phone');
          return;
        }
        setInfo(data);
        if (data.paymentStatus === 'paid') {
          setPhase('paid');
          clearPendingPayment();
          await loadOrder(orderNumber, mobile);
          try {
            confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 } });
          } catch {
            /* cosmetic */
          }
          return;
        }
        if (!isOnlineGateway(data.paymentMethod)) {
          setPhase('cod');
          clearPendingPayment();
          await loadOrder(orderNumber, mobile);
          return;
        }
        // The gateway said "paid" but our confirmation (IPN) may be a moment behind
        if (params.status === 'paid' && attempt < 5) {
          setPhase('waiting');
          window.setTimeout(() => check(mobile, attempt + 1), 2000);
          return;
        }
        setPhase('failed');
      } catch {
        setError('Could not reach the shop. Check your connection and try again.');
        setPhase('failed');
      }
    },
    [orderNumber, params.status, loadOrder]
  );

  useEffect(() => {
    if (phone) check(phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const retry = async () => {
    setBusy('retry');
    setError('');
    try {
      await startOnlinePayment({ orderNumber, customerPhone: phone, paymentMethod: gateway }, pending?.returnTo);
    } catch (err: any) {
      setError(err.message);
      setBusy('');
    }
  };

  const switchToCod = async () => {
    setBusy('cod');
    setError('');
    try {
      const res = await fetch('/api/payments/switch-to-cod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change the payment method.');
      clearPendingPayment();
      await loadOrder(orderNumber, phone);
      setPhase('cod');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!orderNumber) {
    return (
      <div className="max-w-md mx-auto px-(--ds-s-4) py-(--ds-s-16) text-center">
        <p className="text-(--ds-text-muted)">No order was given.</p>
        <button type="button" onClick={() => onNavigate('home')} className="ds-btn ds-btn-primary mt-(--ds-s-4)">
          Go to the shop
        </button>
      </div>
    );
  }

  if (phase === 'paid' || phase === 'cod') {
    return (
      <div>
        <div className="max-w-3xl mx-auto px-(--ds-s-4) pt-(--ds-s-6)">
          <div
            role="status"
            className={`flex items-start gap-(--ds-s-3) rounded-(--ds-r-lg) p-(--ds-s-4) ${
              phase === 'paid' ? 'bg-(--ds-success-soft) text-(--ds-success-text)' : 'bg-(--ds-info-soft) text-(--ds-info-text)'
            }`}
          >
            {phase === 'paid' ? <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" /> : <Banknote className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="text-(length:--ds-fs-base)">
              <p className="font-(--ds-fw-bold)">
                {phase === 'paid' ? `Payment received${look ? ` via ${look.short}` : ''}` : 'Cash on delivery'}
              </p>
              <p>
                {phase === 'paid'
                  ? `${currency}${Number(info?.total || order?.total || 0).toLocaleString('en-BD')} is paid. Your order is confirmed.`
                  : 'Your order is confirmed. Please pay the delivery person when it arrives.'}
              </p>
            </div>
          </div>
        </div>
        {order ? (
          <OrderSuccessView order={order} settings={settings} onTrack={onTrack} onContinueShopping={() => onNavigate('home')} />
        ) : (
          <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-8) flex flex-wrap gap-(--ds-s-2)">
            <button type="button" onClick={() => onTrack(orderNumber)} className="ds-btn ds-btn-primary">
              Track order {orderNumber}
            </button>
            <button type="button" onClick={() => onNavigate('home')} className="ds-btn ds-btn-soft">
              Continue shopping
            </button>
          </div>
        )}
      </div>
    );
  }

  const failed = phase === 'failed';
  const cancelled = params.status === 'cancelled' || info?.lastAttempt?.status === 'cancelled';

  return (
    <div className="max-w-lg mx-auto px-(--ds-s-4) py-(--ds-s-10) sm:py-(--ds-s-16)">
      <div className="ds-card overflow-hidden">
        <div
          className="px-(--ds-s-5) pt-(--ds-s-8) pb-(--ds-s-6) text-center text-white"
          style={{
            background:
              phase === 'checking' || phase === 'waiting' || phase === 'ask-phone'
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : cancelled
                ? 'linear-gradient(135deg, #d97706, #b45309)'
                : 'linear-gradient(135deg, #e11d48, #9f1239)',
          }}
        >
          <span className="mx-auto w-16 h-16 inline-flex items-center justify-center rounded-full bg-white/20">
            {phase === 'checking' || phase === 'waiting' ? (
              <span className="ds-spinner w-7 h-7" style={{ borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
            ) : phase === 'ask-phone' ? (
              <Phone className="w-8 h-8" />
            ) : cancelled ? (
              <Clock className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </span>
          <h1 className="mt-(--ds-s-3) text-(length:--ds-fs-2xl) font-(--ds-fw-bold)">
            {phase === 'checking'
              ? 'Checking your payment…'
              : phase === 'waiting'
              ? 'Confirming your payment…'
              : phase === 'ask-phone'
              ? 'Find your order'
              : cancelled
              ? 'Payment cancelled'
              : 'Payment not completed'}
          </h1>
          <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) opacity-90 ds-num">Order {orderNumber}</p>
        </div>

        <div className="p-(--ds-s-5) space-y-(--ds-s-4)">
          {phase === 'ask-phone' && (
            <form
              className="space-y-(--ds-s-3)"
              onSubmit={(event) => {
                event.preventDefault();
                const clean = phoneInput.replace(/[\s-]+/g, '');
                if (!/^01[3-9]\d{8}$/.test(clean)) {
                  setError('Enter the 11-digit mobile number used for the order.');
                  return;
                }
                setError('');
                setPhase('checking');
                setPhone(clean);
              }}
            >
              <p className="text-(length:--ds-fs-base) text-(--ds-text-soft)">Enter the mobile number you used for this order.</p>
              <input
                className="ds-input h-(--ds-h-lg) ds-num"
                inputMode="numeric"
                placeholder="01XXXXXXXXX"
                value={phoneInput}
                onChange={(e) => setPhoneInput(normalizeBdPhone(e.target.value))}
                type="tel"
                autoComplete="tel"
                autoFocus
              />
              <button type="submit" className="ds-btn ds-btn-primary ds-btn-block">
                Continue
              </button>
            </form>
          )}

          {(phase === 'checking' || phase === 'waiting') && (
            <p className="text-center text-(length:--ds-fs-base) text-(--ds-text-muted)">Please don’t close this page. This takes a few seconds.</p>
          )}

          {failed && (
            <>
              <p className="text-(length:--ds-fs-base) text-(--ds-text-soft) leading-(--ds-lh-bn)">
                {cancelled
                  ? 'You left the payment page before paying. Your order is saved — pay now, or choose cash on delivery.'
                  : params.message || info?.lastAttempt?.message
                  ? `${params.message || info?.lastAttempt?.message}. Your order is saved — you can try again or pay on delivery.`
                  : 'The payment did not go through. No money was taken for this order. Your order is saved — try again or pay on delivery.'}
              </p>
              {info?.total && (
                <div className="flex items-center justify-between rounded-(--ds-r-md) bg-(--ds-surface-2) px-(--ds-s-4) py-(--ds-s-3)">
                  <span className="text-(--ds-text-muted)">Amount</span>
                  <span className="ds-num text-(length:--ds-fs-xl) font-(--ds-fw-black) text-(--ds-text)">
                    {currency}
                    {Number(info.total).toLocaleString('en-BD')}
                  </span>
                </div>
              )}
              <div className="grid gap-(--ds-s-2)">
                {isOnlineGateway(gateway) && (
                  <button
                    type="button"
                    onClick={retry}
                    disabled={Boolean(busy)}
                    className="ds-btn ds-btn-lg ds-btn-block text-white"
                    style={{ background: look?.color || 'var(--primary)' }}
                  >
                    {busy === 'retry' ? <span className="ds-spinner" /> : <RefreshCw className="w-4 h-4" />}
                    Try again with {look?.short || 'online payment'}
                  </button>
                )}
                <button type="button" onClick={switchToCod} disabled={Boolean(busy)} className="ds-btn ds-btn-soft ds-btn-lg ds-btn-block">
                  {busy === 'cod' ? <span className="ds-spinner" /> : <Banknote className="w-4 h-4" />}
                  Pay cash on delivery instead
                </button>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-danger-text)">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-(--ds-s-2) pt-(--ds-s-2) border-t border-(--ds-border-soft)">
            <button type="button" onClick={() => onNavigate('home')} className="ds-btn ds-btn-ghost ds-btn-sm">
              <ArrowLeft className="w-4 h-4" /> Back to shop
            </button>
            {settings?.general?.phone && (
              <a href={`tel:${settings.general.phone}`} className="ds-btn ds-btn-ghost ds-btn-sm">
                <Phone className="w-4 h-4" /> Call us
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
