import { useT } from '../../lib/i18n.tsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import {
  FileText,
  CheckCircle2,
  Lock,
  ArrowLeft,
  AlertCircle,
  Minus,
  Plus,
  X,
  TicketPercent,
  ChevronDown,
  ShieldAlert,
  Phone,
  ShoppingBag,
  Check,
  Gift,
  Truck,
  CreditCard,
  User,
  MapPin,
  StickyNote,
  ShieldCheck,
  BadgeCheck,
  Banknote,
  RotateCcw,
  Headphones,
} from 'lucide-react';
import { normalizeBdPhone, BD_PHONE_RE } from '../../lib/phone.ts';
import { useCart } from '../../context/CartContext.tsx';
import { wholesaleQuantityProblems } from '../../lib/wholesale.ts';
import { tracking } from '../../lib/tracking.ts';
import confetti from 'canvas-confetti';
import { SiteSettings, PaymentMethodConfig, ShippingZoneConfig } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { ctaAnimation } from '../../lib/ctaAnimation.ts';
import { computeShipping, freeShippingLabel, parseCharges } from '../../lib/shipping.ts';
import { cleanGeoConfig, zoneForPlace } from '../../lib/geoShipping.ts';
import { DistrictThanaFields } from './DistrictThanaFields.tsx';
import { GATEWAY_LOOK, isOnlineGateway, startOnlinePayment } from '../../lib/onlinePayment.ts';
import { routeToPath } from './Header.tsx';

/** A manual method from the dashboard, or an online gateway (bKash / Nagad / SSLCommerz) */
type CheckoutMethod = PaymentMethodConfig & { online?: boolean };

interface CheckoutViewProps {
  onBack: () => void;
  onOrderSuccess: (order: any) => void;
  settings?: SiteSettings;
}

/** Fallbacks used when the dashboard has not overridden a label. */
const L = {
  deliverySectionTitle: 'Delivery details',
  nameLabel: "Recipient's full name",
  namePlaceholder: 'Your full name',
  phoneLabel: 'Mobile number',
  phonePlaceholder: '01XXXXXXXXX',
  addressLabel: 'Full delivery address',
  addressPlaceholder: 'House, road, area, thana, district',
  zoneLabel: 'Delivery area',
  notesLabel: 'Order note (optional)',
  notesPlaceholder: 'Any special instructions for us',
  paymentSectionTitle: 'Payment method',
  summaryTitle: 'Order summary',
  subtotalLabel: 'Subtotal',
  discountLabel: 'Discount',
  deliveryLabel: 'Delivery charge',
  totalLabel: 'Total',
  submitLabel: 'Confirm order',
  trxIdLabel: 'Transaction ID (TrxID)',
  senderNumberLabel: 'Number you sent it from',
};

const CHECKOUT_KEY_STORAGE = 'pharma:checkout-key';
const TRACK_DEBOUNCE_MS = 1200;

const newSessionKey = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * One key per checkout attempt, kept in sessionStorage so a refresh or a
 * detour back to the cart still updates the same abandoned-checkout record
 * instead of opening a new one.
 */
const readSessionKey = (): string => {
  try {
    const existing = sessionStorage.getItem(CHECKOUT_KEY_STORAGE);
    if (existing) return existing;
    const created = newSessionKey();
    sessionStorage.setItem(CHECKOUT_KEY_STORAGE, created);
    return created;
  } catch {
    return newSessionKey();
  }
};

const clearSessionKey = () => {
  try {
    sessionStorage.removeItem(CHECKOUT_KEY_STORAGE);
  } catch {
    /* private mode */
  }
};

/** The cart context may carry a variation per line; read it without depending on its type. */
const variationIdOf = (item: any): number | undefined => {
  const id = Number(item?.variationId);
  return Number.isFinite(id) && id > 0 ? id : undefined;
};
const variationLabelOf = (item: any): string => String(item?.variationLabel || '');
const lineKeyOf = (item: any) => `${item.product.id}:${variationIdOf(item) ?? ''}`;
const unitPriceOf = (item: any) => {
  // "0.00" is a truthy string: treat only a positive sale price as a sale
  const sale = Number(item.product.salePrice);
  return sale > 0 ? sale : Number(item.product.price) || 0;
};

const hideBrokenImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = IMAGE_PLACEHOLDER;
};

export const CheckoutView: React.FC<CheckoutViewProps> = ({ onBack, onOrderSuccess, settings }) => {
  const t = useT();
  const {
    items,
    subtotal,
    couponDiscount,
    appliedCoupon,
    clearCart,
    updateQuantity,
    removeFromCart,
    applyCouponCode,
    removeCoupon,
  } = useCart();

  const currency = settings?.general?.currency || '৳';
  const cfg = settings?.checkout_config || {};
  // v3.13 — a label still at its English default is shown in the visitor's language
  const label = (key: keyof typeof L) => t((cfg as any)[key] || L[key]);
  const money = (value: number) => `${currency}${value.toLocaleString('en-BD')}`;
  const placeOrderCta = ctaAnimation(settings, 'placeOrder');

  // Delivery zones and payment methods are dashboard-managed. The order API
  // resolves the shipping charge from this same zone list, so the amount shown
  // here is exactly what the customer is billed.
  // v3.11 — Dashboard → Checkout → Delivery can be switched off: no area,
  // no charge, nothing to choose (the server bills no delivery either)
  const deliveryOn = cfg.deliveryEnabled !== false;
  const design: 'classic' | 'express' | 'split' = cfg.design === 'express' || cfg.design === 'split' ? cfg.design : 'classic';
  const notesOn = cfg.showNotes !== false;
  const couponOn = cfg.showCoupon !== false;
  const zones: ShippingZoneConfig[] = useMemo(
    () => (deliveryOn ? (settings?.shipping?.zones || []).filter((z: any) => z && z.id && z.enabled !== false) : []),
    [settings?.shipping?.zones, deliveryOn]
  );

  // Cash on delivery first, then the online gateways, then manual methods
  const methods: CheckoutMethod[] = useMemo(() => {
    const manual = (settings?.payment?.methods || [])
      .filter((m) => m.enabled !== false && !isOnlineGateway(m.id))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const online: CheckoutMethod[] = (settings?.online_payments || []).map((gateway) => ({
      id: gateway.id,
      name: gateway.name,
      description: gateway.description || '',
      logoUrl: (gateway as any).logoUrl || '',
      requiresTxId: false,
      enabled: true,
      online: true,
    }));
    const cod = manual.filter((m) => m.id === 'cod');
    const list = [...cod, ...online, ...manual.filter((m) => m.id !== 'cod')];
    // Nothing set up yet: the order still goes through as cash on delivery
    // (the server accepts it the same way) instead of being impossible
    return list.length > 0
      ? list
      : [{ id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive your order', enabled: true, requiresTxId: false } as CheckoutMethod];
  }, [settings?.payment?.methods, settings?.online_payments]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [shippingZone, setShippingZone] = useState('');
  // v3.9 — district & thana (Dashboard → System Configuration → Shipping)
  const geo = useMemo(() => cleanGeoConfig((settings as any)?.checkout_geo_config), [settings]);
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const autoShip = deliveryOn && geo.enabled && geo.autoShipping;
  const autoZone = autoShip ? zoneForPlace(geo, zones, district, thana) : '';
  const [paymentMethod, setPaymentMethod] = useState('');
  const [blockedNotice, setBlockedNotice] = useState<{ message: string; reason?: string } | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  // The cart drops a coupon by itself when the order falls below its minimum:
  // replace the green "applied" line so it never contradicts the total
  const lastCouponRef = useRef<any>(appliedCoupon);
  useEffect(() => {
    const previous = lastCouponRef.current;
    lastCouponRef.current = appliedCoupon;
    if (previous?.code && !appliedCoupon) {
      setCouponMsg((msg) => {
        if (!msg?.ok) return msg;
        const minOrder = Number(previous.minOrder) || 0;
        return {
          ok: false,
          text:
            minOrder > 0
              ? t('Coupon {code} was removed — it needs an order of at least {amount}.', { code: previous.code, amount: money(minOrder) })
              : t('Coupon {code} was removed.', { code: previous.code }),
        };
      });
    }
  }, [appliedCoupon]);
  // Phones: the order's products are shown by default; the shopper can fold them away
  const [summaryOpen, setSummaryOpen] = useState(true);

  const sessionKeyRef = useRef<string>('');
  if (!sessionKeyRef.current) sessionKeyRef.current = readSessionKey();
  const trackTimerRef = useRef<number | null>(null);
  const trackPendingRef = useRef(false);
  const lastTrackedRef = useRef('');
  const orderPlacedRef = useRef(false);
  const checkoutTrackedRef = useRef(false);
  const blockedRef = useRef<HTMLDivElement>(null);

  // Preselect the first configured zone / method once settings arrive
  useEffect(() => {
    if (autoShip) return; // the district decides
    if (zones.length === 0) {
      if (shippingZone) setShippingZone('');
      return;
    }
    if (!shippingZone || !zones.some((zone) => zone.id === shippingZone)) setShippingZone(zones[0].id);
  }, [zones, shippingZone, autoShip]);

  // Automatic delivery charge: the area follows the chosen district / thana
  useEffect(() => {
    if (!autoShip) return;
    setShippingZone(autoZone);
  }, [autoZone, autoShip]);

  useEffect(() => {
    if (!paymentMethod && methods.length > 0) setPaymentMethod(methods[0].id);
  }, [methods, paymentMethod]);

  // Same choice the server makes: the picked area, else the first one (an
  // automatic area that matches no rule falls back the same way)
  const activeZone =
    zones.find((z) => z.id === shippingZone) || (zones.length > 0 && (!autoShip || Boolean(district)) ? zones[0] : undefined);
  const zoneRequired = deliveryOn && zones.length > 0 && !autoShip;
  const activeMethod = methods.find((m) => m.id === paymentMethod);

  // Delivery charge: zone charge, products with free delivery or their own
  // charge, and the store's free-delivery offer — the same rules the order
  // API bills with (src/lib/shipping.ts).
  const shippingLines = useMemo(
    () =>
      items.map((item) => ({
        quantity: item.quantity,
        lineTotal: unitPriceOf(item) * item.quantity,
        freeShipping: Boolean((item.product as any).freeShipping),
        charges: parseCharges((item.product as any).shippingCharges),
      })),
    [items]
  );
  const isWholesaleCart = items.some((item) => item.product.isWholesale);
  const shippingFor = (zone?: ShippingZoneConfig) =>
    deliveryOn
      ? computeShipping({ zone, lines: shippingLines, rules: settings?.free_shipping_config, wholesale: isWholesaleCart })
      : computeShipping({ zone: null, lines: [], rules: null });
  const shipping = shippingFor(activeZone);
  const shippingCost = shipping.charge;
  const total = Math.max(0, subtotal - couponDiscount + shippingCost);
  const freeRules = settings?.free_shipping_config;
  const showFreeProgress =
    deliveryOn &&
    Boolean(freeRules?.enabled && freeRules?.showProgress !== false) &&
    !shipping.free &&
    (shipping.remainingForFree > 0 || shipping.remainingItemsForFree > 0);
  const freeTarget = Number(freeRules?.minSubtotal) || 0;
  const freeProgress = freeTarget > 0 ? Math.min(100, Math.round(((freeTarget - shipping.remainingForFree) / freeTarget) * 100)) : 0;

  const hasPrescriptionMed = items.some((i) => i.product.requiresPrescription);

  // InitiateCheckout belongs to the moment the page opens, not the submit —
  // a customer who leaves half way still started a checkout.
  useEffect(() => {
    if (checkoutTrackedRef.current || items.length === 0) return;
    checkoutTrackedRef.current = true;
    tracking.initiateCheckout(items, Math.max(0, subtotal - couponDiscount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  /* ------------------------------------------------ abandoned-checkout capture */
  const sendTrack = useCallback(() => {
    if (trackTimerRef.current) {
      window.clearTimeout(trackTimerRef.current);
      trackTimerRef.current = null;
    }
    trackPendingRef.current = false;
    if (orderPlacedRef.current || items.length === 0) return;
    // Nothing identifies the shopper yet, so there is nothing to follow up on
    if (!customerName.trim() && !customerPhone.trim()) return;

    const payload = {
      sessionKey: sessionKeyRef.current,
      customerName: customerName.trim(),
      customerPhone: customerPhone.replace(/[\s-]+/g, ''),
      customerAddress: customerAddress.trim(),
      shippingZone,
      district: district || undefined,
      thana: thana || undefined,
      paymentMethod,
      items: items.map((item) => ({
        productId: item.product.id,
        variationId: variationIdOf(item) ?? undefined,
        name: item.product.name,
        image: item.product.image || '',
        price: unitPriceOf(item),
        quantity: item.quantity,
        variationLabel: variationLabelOf(item) || undefined,
      })),
    };
    const body = JSON.stringify(payload);
    if (body === lastTrackedRef.current) return;
    lastTrackedRef.current = body;

    try {
      fetch('/api/checkout/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        /* capture is best-effort and must never disturb the checkout */
      });
    } catch {
      /* ignore */
    }
  }, [customerName, customerPhone, customerAddress, shippingZone, paymentMethod, items, district, thana]);

  useEffect(() => {
    if (trackTimerRef.current) window.clearTimeout(trackTimerRef.current);
    trackPendingRef.current = true;
    trackTimerRef.current = window.setTimeout(sendTrack, TRACK_DEBOUNCE_MS);
    return () => {
      if (trackTimerRef.current) window.clearTimeout(trackTimerRef.current);
    };
    // Only the customer's own inputs should restart the timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName, customerPhone, customerAddress, shippingZone, paymentMethod]);

  // Leaving the page inside the debounce window still records what was typed
  const sendTrackRef = useRef(sendTrack);
  sendTrackRef.current = sendTrack;
  useEffect(
    () => () => {
      if (trackPendingRef.current) sendTrackRef.current();
    },
    []
  );

  /* ------------------------------------------------------------ progress steps */
  const cleanPhoneNow = customerPhone.replace(/[\s-]+/g, '');
  const phoneValid = BD_PHONE_RE.test(cleanPhoneNow);
  const infoDone = Boolean(customerName.trim()) && phoneValid;
  const geoDone = !geo.enabled || (Boolean(district) && (!geo.requireThana || Boolean(thana)));
  const deliveryDone = infoDone && Boolean(customerAddress.trim()) && (!zoneRequired || Boolean(shippingZone)) && geoDone;
  const paymentDone =
    deliveryDone && Boolean(paymentMethod) && (!activeMethod?.requiresTxId || Boolean(transactionId.trim()));
  const steps = [
    { id: 'info', label: 'Details', done: infoDone },
    { id: 'delivery', label: 'Delivery', done: deliveryDone },
    { id: 'payment', label: 'Payment', done: paymentDone },
  ];
  const currentStep = steps.findIndex((s) => !s.done);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBlockedNotice(null);

    if (items.length === 0) {
      setErrorMsg('Your cart is empty.');
      return;
    }

    const quantityProblems = wholesaleQuantityProblems(items);
    if (quantityProblems.length > 0) {
      setErrorMsg(quantityProblems.join(' '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Field-by-field validation so the customer is told exactly what is missing
    const errors: Record<string, string> = {};
    const cleanPhone = customerPhone.replace(/[\s-]+/g, '');

    if (!customerName.trim()) errors.name = t('{field} is required', { field: label('nameLabel') });

    if (!cleanPhone) {
      errors.phone = t('{field} is required', { field: label('phoneLabel') });
    } else if (!/^\d+$/.test(cleanPhone)) {
      errors.phone = t('Use digits only in the number');
    } else if (cleanPhone.length !== 11) {
      errors.phone = t('The number must be exactly 11 digits (you entered {n})', { n: cleanPhone.length });
    } else if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      errors.phone = t('The number must start with 013 to 019 (for example 01712345678)');
    }

    if (geo.enabled && !district) errors.district = t('Please choose your district (জেলা)');
    if (geo.enabled && district && geo.requireThana && !thana) errors.thana = t('Please choose your thana (থানা)');
    if (!customerAddress.trim()) errors.address = t('{field} is required', { field: label('addressLabel') });
    // Only when there are areas to choose from — no areas (or delivery
    // switched off) never blocks an order any more
    if (zoneRequired && !shippingZone) errors.zone = t('Please choose: {field}', { field: label('zoneLabel') });
    if (!paymentMethod) errors.payment = t('Please choose: {field}', { field: label('paymentSectionTitle') });
    if (activeMethod?.requiresTxId && !transactionId.trim())
      errors.trx = `${activeMethod.name}: ${t('{field} is required', { field: label('trxIdLabel') })}`;

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setErrorMsg(
        Object.keys(errors).length === 1
          ? Object.values(errors)[0]
          : `${Object.keys(errors).length} fields still need attention — see the ones marked in red below.`
      );
      // Bring the first problem field into view
      const firstKey = Object.keys(errors)[0];
      document.getElementById(`co-${firstKey}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (!checkoutTrackedRef.current) {
        checkoutTrackedRef.current = true;
        tracking.initiateCheckout(items, total);
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone: cleanPhone,
          customerAddress,
          shippingZone: deliveryOn ? activeZone?.id || shippingZone : '',
          district: geo.enabled ? district : undefined,
          thana: geo.enabled ? thana : undefined,
          paymentMethod,
          transactionId: transactionId || null,
          senderNumber: senderNumber || null,
          notes,
          couponCode: appliedCoupon?.code || null,
          checkoutSessionKey: sessionKeyRef.current,
          items: items.map((i) => {
            const variationId = variationIdOf(i);
            return variationId
              ? { productId: i.product.id, quantity: i.quantity, variationId }
              : { productId: i.product.id, quantity: i.quantity };
          }),
        }),
      });

      const data = await res.json();

      // A blocked device IP or blocked customer gets its own explanation rather
      // than the generic inline error, because there is nothing to retry.
      if (res.status === 403 && data.blocked) {
        setBlockedNotice({ message: data.error || data.message || '', reason: data.reason || '' });
        window.setTimeout(
          () => blockedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          50
        );
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'The order could not be completed.');
      }

      orderPlacedRef.current = true;
      if (trackTimerRef.current) window.clearTimeout(trackTimerRef.current);
      clearSessionKey();

      if (!isOnlineGateway(paymentMethod)) {
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch {
          /* confetti is cosmetic */
        }
      }

      tracking.purchase(data.order, items);
      clearCart();

      // Online gateway: the order is saved; now the customer pays on the
      // gateway's page. If the payment cannot start, the result page offers
      // "try again" or "cash on delivery instead" for this same order.
      if (data.payment?.gateway && isOnlineGateway(data.order?.paymentMethod)) {
        try {
          await startOnlinePayment(data.order, '/checkout');
          return; // the browser is on its way to the gateway
        } catch (payError: any) {
          window.location.href = routeToPath('payment-result', {
            order: data.order.orderNumber,
            status: 'failed',
            gateway: data.order.paymentMethod,
            message: payError?.message || '',
          });
          return;
        }
      }
      onOrderSuccess(data.order);
    } catch (err: any) {
      console.error('Order submission error:', err);
      setErrorMsg(err.message || 'Something went wrong while placing your order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-(--ds-s-4) py-(--ds-s-16) text-center ds-fade-in">
        <span className="mx-auto w-14 h-14 rounded-(--ds-r-xl) inline-flex items-center justify-center bg-(--ds-surface-3) text-(--ds-text-faint)">
          <ShoppingBag className="w-6 h-6" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">
          Your cart is empty
        </h1>
        <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted) leading-(--ds-lh-bn)">
          Add products to your cart before checking out.
        </p>
        <button onClick={onBack} className="ds-btn ds-btn-primary mt-(--ds-s-5)">
          Browse products
        </button>
      </div>
    );
  }

  const errorClass = (key: string) => (fieldErrors[key] ? 'ds-input-error' : '');
  const clearError = (key: string) => setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  /* ------------------------------------------------------------ small pieces */

  const sectionTitle = (index: number, title: string, done: boolean) => (
    <div className="flex items-center gap-(--ds-s-3) pb-(--ds-s-4) mb-(--ds-s-4) border-b border-(--ds-border-soft)">
      <span
        className={`w-7 h-7 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-(length:--ds-fs-sm) font-(--ds-fw-bold) ds-num transition-colors ${
          done ? 'bg-(--primary) text-(--primary-foreground)' : 'bg-(--ds-surface-3) text-(--ds-text-soft)'
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : index}
      </span>
      <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">{title}</h2>
    </div>
  );

  /** Split / express headings: a quiet eyebrow line instead of a numbered card header */
  const eyebrow = (title: string, done: boolean, Icon: React.ComponentType<{ className?: string }>) => (
    <div className="flex items-center gap-(--ds-s-2) mb-(--ds-s-3)">
      <span
        className={`w-7 h-7 shrink-0 rounded-(--ds-r-md) inline-flex items-center justify-center transition-colors ${
          done ? 'bg-(--primary) text-(--primary-foreground)' : 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)'
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
      </span>
      <h2 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) tracking-[-0.01em]">{title}</h2>
    </div>
  );

  /** Text input with an icon inside it (split + express designs) */
  const withIcon = (Icon: React.ComponentType<{ className?: string }>, node: React.ReactNode, top = false) => (
    <div className="relative">
      <Icon
        className={`w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) pointer-events-none ${top ? 'top-3.5' : 'top-1/2 -translate-y-1/2'}`}
      />
      {node}
    </div>
  );

  const iconPad = design === 'classic' ? '' : 'pl-10';

  const nameField = (
    <div>
      <label htmlFor="co-name" className="ds-label ds-required">
        {label('nameLabel')}
      </label>
      {(() => {
        const input = (
          <input
            id="co-name"
            name="name"
            autoComplete="name"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              clearError('name');
            }}
            aria-invalid={Boolean(fieldErrors.name) || undefined}
            placeholder={label('namePlaceholder')}
            className={`ds-input co-field h-(--ds-h-lg) ${iconPad} ${errorClass('name')}`}
          />
        );
        return design === 'classic' ? input : withIcon(User, input);
      })()}
      {fieldErrors.name && <p className="ds-error-text">{fieldErrors.name}</p>}
    </div>
  );

  const phoneField = (
    <div>
      <label htmlFor="co-phone" className="ds-label ds-required">
        {label('phoneLabel')}
      </label>
      <div className="relative">
        {design !== 'classic' && (
          <Phone className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          id="co-phone"
          name="tel"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={customerPhone}
          onChange={(e) => {
            // v3.11 — autofill gives "+880 1712-345678"; it is folded to 01712345678
            // (it used to be refused for being longer than 11 digits, so it never showed)
            setCustomerPhone(normalizeBdPhone(e.target.value));
            clearError('phone');
          }}
          aria-invalid={Boolean(fieldErrors.phone) || undefined}
          placeholder={label('phonePlaceholder')}
          className={`ds-input co-field h-(--ds-h-lg) ds-num pr-10 ${iconPad} ${errorClass('phone')}`}
        />
        {phoneValid && (
          <BadgeCheck className="w-4.5 h-4.5 text-(--ds-success) absolute right-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>
      {fieldErrors.phone && <p className="ds-error-text">{fieldErrors.phone}</p>}
    </div>
  );

  const geoFields = geo.enabled ? (
    <DistrictThanaFields
      config={geo}
      district={district}
      thana={thana}
      errors={{ district: fieldErrors.district, thana: fieldErrors.thana }}
      onChange={(next) => {
        setDistrict(next.district);
        setThana(next.thana);
        setFieldErrors((prev) => ({ ...prev, district: '', thana: '', zone: '' }));
      }}
    />
  ) : null;

  const addressField = (
    <div>
      <label htmlFor="co-address" className="ds-label ds-required">
        {label('addressLabel')}
      </label>
      {(() => {
        const input = (
          <textarea
            id="co-address"
            name="street-address"
            rows={design === 'express' ? 2 : 3}
            autoComplete="street-address"
            value={customerAddress}
            onChange={(e) => {
              setCustomerAddress(e.target.value);
              clearError('address');
            }}
            aria-invalid={Boolean(fieldErrors.address) || undefined}
            placeholder={label('addressPlaceholder')}
            className={`ds-textarea co-field resize-none ${iconPad} ${fieldErrors.address ? 'border-(--ds-danger)' : ''}`}
          />
        );
        return design === 'classic' ? input : withIcon(MapPin, input, true);
      })()}
      {fieldErrors.address && <p className="ds-error-text">{fieldErrors.address}</p>}
    </div>
  );

  const zonePrice = (zone: ShippingZoneConfig, compact = false) => {
    const quote = shippingFor(zone);
    return quote.free ? (
      <span className="inline-flex items-center gap-(--ds-s-1) shrink-0">
        {quote.baseCharge > 0 && !compact && (
          <span className="text-(length:--ds-fs-sm) text-(--ds-text-muted) line-through ds-num">{money(quote.baseCharge)}</span>
        )}
        <span className="inline-flex items-center gap-1 h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-xs) font-(--ds-fw-bold)">
          <Truck className="w-3 h-3" /> Free
        </span>
      </span>
    ) : (
      <span className="text-(length:--ds-fs-base) font-(--ds-fw-bold) text-(--ds-text) ds-num shrink-0">{money(quote.charge)}</span>
    );
  };

  /** Delivery area: cards (classic, split) or a row of pills (express). Nothing at all while delivery is off. */
  const zoneField = (style: 'cards' | 'pills') => {
    if (!deliveryOn) return null;
    let body: React.ReactNode;
    if (autoShip) {
      if (!activeZone) {
        body = (
          <p className="text-(length:--ds-fs-base) text-(--ds-text-muted) p-(--ds-s-3) rounded-(--ds-r-md) border border-dashed border-(--ds-border-strong) flex items-center gap-(--ds-s-2)">
            <Truck className="w-4 h-4 shrink-0" />
            {zones.length === 0 ? 'The delivery charge will be confirmed when we call you.' : 'Choose your district to see the delivery charge.'}
          </p>
        );
      } else {
        body = (
          <div className="p-(--ds-s-3) rounded-(--ds-r-md) border border-(--primary) bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] flex items-center gap-(--ds-s-3)">
            <Truck className="w-5 h-5 shrink-0 text-(--primary)" />
            <span className="min-w-0 flex-1">
              <span className="block text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text)">{activeZone.name}</span>
              <span className="block text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                Set automatically for {[thana, district].filter(Boolean).join(', ')}
                {activeZone.eta ? ` · ${activeZone.eta}` : ''}
              </span>
            </span>
            {zonePrice(activeZone)}
          </div>
        );
      }
    } else if (zones.length === 0) {
      // No areas set up: nothing to choose, nothing blocks the order
      return null;
    } else if (style === 'pills') {
      body = (
        <div className="flex flex-wrap gap-(--ds-s-2)">
          {zones.map((zone) => {
            const active = zone.id === activeZone?.id;
            return (
              <button
                key={zone.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setShippingZone(zone.id);
                  clearError('zone');
                }}
                className={`co-pill inline-flex items-center gap-(--ds-s-2) min-h-11 px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-full) border text-left cursor-pointer transition-all duration-(--ds-dur-fast) ${
                  active
                    ? 'border-(--primary) bg-(--primary) text-(--primary-foreground) shadow-(--ds-shadow-sm)'
                    : 'border-(--ds-border-strong) bg-(--ds-surface) text-(--ds-text) hover:border-(--primary)'
                }`}
              >
                <Truck className="w-4 h-4 shrink-0 opacity-80" />
                <span className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">{zone.name}</span>
                <span className={`text-(length:--ds-fs-sm) font-(--ds-fw-bold) ds-num ${active ? '' : 'text-(--primary)'}`}>
                  {shippingFor(zone).free ? 'Free' : money(shippingFor(zone).charge)}
                </span>
              </button>
            );
          })}
        </div>
      );
    } else {
      body = (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-2)">
          {zones.map((zone) => {
            const active = zone.id === activeZone?.id;
            return (
              <button
                key={zone.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setShippingZone(zone.id);
                  clearError('zone');
                }}
                className={`text-left p-(--ds-s-3) rounded-(--ds-r-md) border transition-colors duration-(--ds-dur-fast) cursor-pointer flex items-start gap-(--ds-s-3) ${
                  active
                    ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] shadow-(--ds-ring)'
                    : 'border-(--ds-border-strong) bg-(--ds-surface) hover:border-(--ds-text-faint)'
                }`}
              >
                <span
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded-(--ds-r-full) border-2 ${
                    active ? 'border-(--primary) bg-(--primary) shadow-[inset_0_0_0_2px_var(--ds-surface)]' : 'border-(--ds-border-strong)'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-(--ds-s-2)">
                    <span className="text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text)">{zone.name}</span>
                    {zonePrice(zone)}
                  </span>
                  {zone.eta && <span className="block text-(length:--ds-fs-sm) text-(--ds-text-muted) mt-0.5">{zone.eta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div id="co-zone" role="radiogroup" aria-label={label('zoneLabel')}>
        <span className={`ds-label ${zoneRequired ? 'ds-required' : ''}`}>{label('zoneLabel')}</span>
        {body}
        {fieldErrors.zone && <p className="ds-error-text">{fieldErrors.zone}</p>}
      </div>
    );
  };

  const notesField = notesOn ? (
    <div>
      <label htmlFor="co-notes" className="ds-label">
        {label('notesLabel')}
      </label>
      {(() => {
        const input = (
          <textarea
            id="co-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={label('notesPlaceholder')}
            className={`ds-textarea co-field resize-none min-h-0 ${iconPad}`}
          />
        );
        return design === 'classic' ? input : withIcon(StickyNote, input, true);
      })()}
    </div>
  ) : null;

  const methodBadge = (method: CheckoutMethod) =>
    method.logoUrl ? (
      <img
        src={method.logoUrl}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
        className="h-8 w-auto max-w-20 object-contain shrink-0"
      />
    ) : method.online ? (
      <span
        className="shrink-0 inline-flex items-center justify-center h-7 min-w-12 px-(--ds-s-2) rounded-(--ds-r-sm) text-white text-(length:--ds-fs-2xs) font-(--ds-fw-black) tracking-wide"
        style={{ background: GATEWAY_LOOK[method.id as keyof typeof GATEWAY_LOOK]?.color }}
      >
        {GATEWAY_LOOK[method.id as keyof typeof GATEWAY_LOOK]?.short}
      </span>
    ) : null;

  const chooseMethod = (method: CheckoutMethod) => {
    setPaymentMethod(method.id);
    clearError('payment');
    tracking.addPaymentInfo(method.id, total);
  };

  /** Payment: a list (classic, split) or tiles (express) */
  const paymentField = (style: 'list' | 'tiles') => (
    <div>
      <div id="co-payment" role="radiogroup" aria-label={label('paymentSectionTitle')}>
        {style === 'tiles' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-(--ds-s-2)">
            {methods.map((method) => {
              const active = method.id === paymentMethod;
              const look = GATEWAY_LOOK[method.id as keyof typeof GATEWAY_LOOK];
              return (
                <button
                  key={method.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseMethod(method)}
                  className={`relative text-left min-h-20 p-(--ds-s-3) rounded-(--ds-r-lg) border-2 flex flex-col justify-between gap-(--ds-s-2) cursor-pointer transition-all duration-(--ds-dur-fast) ${
                    active
                      ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_7%,var(--ds-surface))] shadow-(--ds-shadow-sm)'
                      : 'border-(--ds-border) bg-(--ds-surface) hover:border-(--ds-border-strong)'
                  }`}
                >
                  <span className="flex items-start justify-between gap-(--ds-s-2)">
                    {method.logoUrl || method.online ? (
                      methodBadge(method)
                    ) : (
                      <span
                        className="w-8 h-8 rounded-(--ds-r-md) inline-flex items-center justify-center"
                        style={{ background: look?.soft || 'var(--ds-surface-3)', color: look?.color || 'var(--ds-text-soft)' }}
                      >
                        {method.id === 'cod' ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                      </span>
                    )}
                    <span
                      className={`w-5 h-5 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center ${
                        active ? 'bg-(--primary) text-(--primary-foreground)' : 'border-2 border-(--ds-border-strong)'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                    </span>
                  </span>
                  <span className="text-(length:--ds-fs-sm) font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug) ds-clamp-2">{method.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-(--ds-s-2)">
            {methods.map((method) => {
              const active = method.id === paymentMethod;
              return (
                <button
                  key={method.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseMethod(method)}
                  className={`w-full text-left p-(--ds-s-3) rounded-(--ds-r-md) border flex items-start gap-(--ds-s-3) transition-colors duration-(--ds-dur-fast) cursor-pointer ${
                    active
                      ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] shadow-(--ds-ring)'
                      : 'border-(--ds-border-strong) bg-(--ds-surface) hover:border-(--ds-text-faint)'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 shrink-0 rounded-(--ds-r-full) border-2 ${
                      active ? 'border-(--primary) bg-(--primary) shadow-[inset_0_0_0_2px_var(--ds-surface)]' : 'border-(--ds-border-strong)'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-(--ds-s-2) flex-wrap">
                      <span className="text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text)">{method.name}</span>
                      {method.online && (
                        <span
                          className="inline-flex items-center gap-1 h-5 px-(--ds-s-2) rounded-(--ds-r-full) text-(length:--ds-fs-2xs) font-(--ds-fw-bold)"
                          style={{
                            background: GATEWAY_LOOK[method.id as keyof typeof GATEWAY_LOOK]?.soft,
                            color: GATEWAY_LOOK[method.id as keyof typeof GATEWAY_LOOK]?.color,
                          }}
                        >
                          <CreditCard className="w-3 h-3" /> Pay online now
                        </span>
                      )}
                      {method.accountType && !method.online && <span className="ds-badge ds-badge-neutral">{method.accountType}</span>}
                    </span>
                    {method.description && (
                      <span className="block text-(length:--ds-fs-sm) text-(--ds-text-muted) mt-0.5">{method.description}</span>
                    )}
                    {method.accountNumber && (
                      <span className="block text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) mt-(--ds-s-1) ds-num">
                        Number: {method.accountNumber}
                      </span>
                    )}
                    {active && method.instructions && (
                      <span className="block text-(length:--ds-fs-sm) text-(--ds-text-soft) mt-(--ds-s-1) leading-(--ds-lh-bn) whitespace-pre-line">
                        {method.instructions}
                      </span>
                    )}
                  </span>
                  {methodBadge(method)}
                </button>
              );
            })}
          </div>
        )}
        {fieldErrors.payment && <p className="ds-error-text">{fieldErrors.payment}</p>}
      </div>

      {/* Tiles keep the details of the chosen method underneath */}
      {style === 'tiles' && activeMethod && (activeMethod.description || activeMethod.accountNumber || activeMethod.instructions) && (
        <div className="mt-(--ds-s-3) p-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-surface-2) border border-(--ds-border-soft) text-(length:--ds-fs-sm) text-(--ds-text-soft) leading-(--ds-lh-bn) ds-fade-in">
          {activeMethod.description && <p>{activeMethod.description}</p>}
          {activeMethod.accountNumber && (
            <p className="mt-(--ds-s-1) font-(--ds-fw-semibold) text-(--ds-text) ds-num">
              {activeMethod.accountType ? `${activeMethod.accountType} · ` : ''}Number: {activeMethod.accountNumber}
            </p>
          )}
          {activeMethod.instructions && <p className="mt-(--ds-s-1) whitespace-pre-line">{activeMethod.instructions}</p>}
        </div>
      )}

      {activeMethod?.requiresTxId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4) mt-(--ds-s-4) ds-fade-in">
          <div>
            <label htmlFor="co-trx" className="ds-label ds-required">
              {label('trxIdLabel')}
            </label>
            <input
              id="co-trx"
              value={transactionId}
              onChange={(e) => {
                setTransactionId(e.target.value);
                clearError('trx');
              }}
              aria-invalid={Boolean(fieldErrors.trx) || undefined}
              placeholder="TrxID"
              className={`ds-input co-field h-(--ds-h-lg) ${errorClass('trx')}`}
            />
            {fieldErrors.trx && <p className="ds-error-text">{fieldErrors.trx}</p>}
          </div>
          <div>
            <label htmlFor="co-sender" className="ds-label">
              {label('senderNumberLabel')}
            </label>
            <input
              id="co-sender"
              type="tel"
              inputMode="numeric"
              value={senderNumber}
              onChange={(e) => setSenderNumber(normalizeBdPhone(e.target.value))}
              placeholder="01XXXXXXXXX"
              className="ds-input co-field h-(--ds-h-lg) ds-num"
            />
          </div>
        </div>
      )}
    </div>
  );

  const alerts = (
    <>
      {blockedNotice && (
        <div ref={blockedRef} role="alert" className="ds-card ds-fade-in p-(--ds-card-pad) flex items-start gap-(--ds-s-3) border-(--ds-warning)">
          <span className="w-10 h-10 shrink-0 rounded-(--ds-r-full) bg-(--ds-warning-soft) text-(--ds-warning-text) inline-flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">We can't take this order</h2>
            {blockedNotice.message && (
              <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-soft) leading-(--ds-lh-bn)">{blockedNotice.message}</p>
            )}
            {blockedNotice.reason && (
              <p className="mt-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-text-muted)">Reason: {blockedNotice.reason}</p>
            )}
            <div className="mt-(--ds-s-3) flex flex-wrap gap-(--ds-s-2)">
              {settings?.general?.phone && (
                <a href={`tel:${settings.general.phone}`} className="ds-btn ds-btn-soft ds-btn-sm">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Talk to us</span>
                </a>
              )}
              <button type="button" onClick={() => setBlockedNotice(null)} className="ds-btn ds-btn-ghost ds-btn-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-4) py-(--ds-s-3) text-(length:--ds-fs-base) ds-fade-in"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {hasPrescriptionMed && (
        <div className="flex items-start gap-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(--ds-warning-text) px-(--ds-s-4) py-(--ds-s-3) text-(length:--ds-fs-base) leading-(--ds-lh-bn)">
          <FileText className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            Your cart contains prescription medicine. Before it is sent, our pharmacist will call your number to verify the
            prescription.
          </p>
        </div>
      )}
    </>
  );

  /* ------------------------------------------------------------ summary parts */

  const itemsList = (compact = false) => (
    // pt/pr leave room for the quantity badge over each photo's corner
    <ul className={`space-y-(--ds-s-3) ${compact ? '' : 'max-h-80'} overflow-y-auto pt-(--ds-s-2) pr-(--ds-s-2) -mt-(--ds-s-1)`}>
      {items.map((item) => {
        const { product, quantity } = item;
        const unit = unitPriceOf(item);
        const maxQty = Math.max(1, product.stock ?? quantity);
        const variation = variationLabelOf(item);
        return (
          <li key={lineKeyOf(item)} className="flex gap-(--ds-s-3) items-start">
            <span className="relative shrink-0">
              <img
                src={product.image ? sized(product.image, 160) : IMAGE_PLACEHOLDER}
                alt={product.name}
                loading="lazy"
                onError={hideBrokenImage}
                className={`${design === 'split' ? 'w-16 h-16' : 'w-14 h-14'} rounded-(--ds-r-md) object-cover bg-(--ds-surface-2) border border-(--ds-border)`}
              />
              <span className="absolute -top-2 -right-2 z-1 min-w-5 h-5 px-1 rounded-(--ds-r-full) bg-(--ds-text-soft) text-(--ds-text-invert) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) inline-flex items-center justify-center ds-num ring-2 ring-(--ds-surface)">
                {quantity}
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-(--ds-s-2)">
                <div className="min-w-0">
                  <p className="text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) leading-(--ds-lh-snug) ds-clamp-2">{product.name}</p>
                  {variation && <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted) mt-0.5">{variation}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(product.id, (item as any).variationId)}
                  aria-label={`Remove ${product.name}`}
                  title="Remove"
                  className="ds-btn ds-btn-ghost ds-btn-icon ds-btn-sm shrink-0 hover:text-(--ds-danger)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-(--ds-s-2) flex items-center justify-between gap-(--ds-s-2)">
                <div className="inline-flex items-center rounded-(--ds-r-sm) border border-(--ds-border) bg-(--ds-surface)">
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, quantity - 1, (item as any).variationId)}
                    aria-label="Decrease quantity"
                    className="w-8 h-8 inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-l-(--ds-r-sm) cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-(length:--ds-fs-sm) font-(--ds-fw-bold) ds-num">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, Math.min(maxQty, quantity + 1), (item as any).variationId)}
                    aria-label="Increase quantity"
                    disabled={quantity >= maxQty}
                    className="w-8 h-8 inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-r-(--ds-r-sm) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <span className="text-(length:--ds-fs-base) font-(--ds-fw-bold) text-(--ds-text) ds-num shrink-0">{money(unit * quantity)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const couponBox = !couponOn ? null : (
    <div>
      {appliedCoupon?.code ? (
        <div className="flex items-center justify-between gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)">
          <span className="flex items-center gap-(--ds-s-2) min-w-0">
            <TicketPercent className="w-4 h-4 shrink-0" />
            <span className="truncate">
              <strong className="font-(--ds-fw-bold)">{appliedCoupon.code}</strong> applied — you save {money(couponDiscount)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              removeCoupon();
              setCouponMsg(null);
            }}
            className="font-(--ds-fw-semibold) hover:underline cursor-pointer shrink-0"
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowCoupon((v) => !v)}
            aria-expanded={showCoupon}
            className="w-full flex items-center justify-between gap-(--ds-s-2) text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) cursor-pointer"
          >
            <span className="flex items-center gap-(--ds-s-2)">
              <TicketPercent className="w-4 h-4 text-(--primary)" />
              <span>Have a coupon code?</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-(--ds-text-muted) transition-transform duration-(--ds-dur) ${showCoupon ? 'rotate-180' : ''}`} />
          </button>

          {showCoupon && (
            <div className="mt-(--ds-s-3) ds-fade-in">
              <div className="flex items-stretch gap-(--ds-s-2)">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
                    }
                  }}
                  placeholder="Enter coupon code"
                  aria-label="Coupon code"
                  className="ds-input co-field flex-1 min-w-0 uppercase"
                />
                <button
                  type="button"
                  disabled={couponBusy || !couponInput.trim()}
                  onClick={async () => {
                    setCouponBusy(true);
                    setCouponMsg(null);
                    const res = await applyCouponCode(couponInput.trim());
                    setCouponMsg({ ok: res.success, text: res.message || (res.success ? 'Coupon applied' : 'This coupon is not valid') });
                    setCouponBusy(false);
                    if (res.success) setErrorMsg(null);
                  }}
                  className="ds-btn ds-btn-secondary shrink-0"
                >
                  {couponBusy ? <span className="ds-spinner" /> : 'Apply'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {couponMsg && (
        <p className={`mt-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-medium) ${couponMsg.ok ? 'text-(--ds-success-text)' : 'text-(--ds-danger-text)'}`}>
          {couponMsg.text}
        </p>
      )}
    </div>
  );

  const totalsList = (
    <dl className="space-y-(--ds-s-2) text-(length:--ds-fs-base)">
      <div className="flex justify-between gap-(--ds-s-3) text-(--ds-text-soft)">
        <dt>
          {label('subtotalLabel')} <span className="text-(--ds-text-faint) ds-num">({itemCount})</span>
        </dt>
        <dd className="font-(--ds-fw-semibold) text-(--ds-text) ds-num">{money(subtotal)}</dd>
      </div>

      {couponDiscount > 0 && (
        <div className="flex justify-between gap-(--ds-s-3) text-(--ds-success-text)">
          <dt>
            {label('discountLabel')}
            {appliedCoupon?.code ? ` (${appliedCoupon.code})` : ''}
          </dt>
          <dd className="font-(--ds-fw-semibold) ds-num">−{money(couponDiscount)}</dd>
        </div>
      )}

      {deliveryOn ? (
        <div className="flex justify-between gap-(--ds-s-3) text-(--ds-text-soft)">
          <dt className="min-w-0">
            {label('deliveryLabel')}
            {activeZone ? ` (${activeZone.name})` : ''}
            {shipping.free && (
              <span className="block text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-success-text)">{freeShippingLabel(shipping.reason)}</span>
            )}
          </dt>
          <dd className="font-(--ds-fw-semibold) text-(--ds-text) ds-num shrink-0">
            {shipping.free ? (
              <span className="inline-flex items-center gap-(--ds-s-1)">
                {shipping.baseCharge > 0 && <span className="line-through text-(--ds-text-muted) font-(--ds-fw-medium)">{money(shipping.baseCharge)}</span>}
                <span className="text-(--ds-success-text) font-(--ds-fw-bold)">Free</span>
              </span>
            ) : (
              money(shippingCost)
            )}
          </dd>
        </div>
      ) : cfg.deliveryOffNote ? (
        <div className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
          <Truck className="w-3.5 h-3.5 shrink-0" />
          <span>{cfg.deliveryOffNote}</span>
        </div>
      ) : null}

      {showFreeProgress && (
        <div className="rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) p-(--ds-s-3) space-y-(--ds-s-2)">
          <p className="flex items-start gap-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
            <Gift className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {shipping.remainingForFree > 0 && shipping.remainingItemsForFree > 0
                ? t('Add {amount} more or {n} more item(s) for free delivery!', { amount: money(shipping.remainingForFree), n: shipping.remainingItemsForFree })
                : shipping.remainingForFree > 0
                ? t('Add {amount} more for free delivery!', { amount: money(shipping.remainingForFree) })
                : t('Add {n} more item(s) for free delivery!', { n: shipping.remainingItemsForFree })}
            </span>
          </p>
          {freeTarget > 0 && (
            <span className="block h-1.5 rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--ds-success)_20%,transparent)] overflow-hidden">
              <span className="block h-full rounded-(--ds-r-full) bg-(--ds-success) transition-[width] duration-(--ds-dur)" style={{ width: `${freeProgress}%` }} />
            </span>
          )}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-(--ds-s-3) pt-(--ds-s-3) mt-(--ds-s-1) border-t border-(--ds-border-soft)">
        <dt className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">{label('totalLabel')}</dt>
        <dd className="text-(length:--ds-fs-2xl) font-(--ds-fw-black) text-(--primary) ds-num">{money(total)}</dd>
      </div>
    </dl>
  );

  /** The summary renders in two places — collapsible on phones, sticky on desktop */
  const summaryBody = (
    <>
      {itemsList()}
      {couponBox && <div className="mt-(--ds-s-4) pt-(--ds-s-4) border-t border-(--ds-border-soft)">{couponBox}</div>}
      <div className="mt-(--ds-s-4) pt-(--ds-s-4) border-t border-(--ds-border-soft)">{totalsList}</div>
    </>
  );

  const spinner = (
    <span
      className="ds-spinner"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary-foreground) 40%, transparent)',
        borderTopColor: 'var(--primary-foreground)',
      }}
    />
  );

  const submitText = activeMethod?.online ? (
    <>
      Pay <span className="ds-num">{money(total)}</span> with{' '}
      {GATEWAY_LOOK[activeMethod.id as keyof typeof GATEWAY_LOOK]?.short || activeMethod.name}
    </>
  ) : (
    <>
      {label('submitLabel')} <span className="ds-num">({money(total)})</span>
    </>
  );

  const submitButton = (className: string) => (
    <button
      type="submit"
      form="checkout-form"
      disabled={isSubmitting}
      className={`ds-btn ds-btn-primary ds-btn-lg ds-btn-block ${className} ${placeOrderCta.className}`}
      style={placeOrderCta.style}
    >
      {isSubmitting ? spinner : <Lock className="w-4 h-4" />}
      <span className="truncate min-w-0">{submitText}</span>
    </button>
  );

  const secureLine = (
    <p className="flex items-center justify-center gap-(--ds-s-1) text-(length:--ds-fs-xs) text-(--ds-text-muted)">
      <Lock className="w-3 h-3" />
      <span>Your details are sent securely</span>
    </p>
  );

  const trustRow = (
    <div className="grid grid-cols-3 gap-(--ds-s-2) text-center">
      {[
        { icon: ShieldCheck, text: 'Secure checkout' },
        { icon: RotateCcw, text: 'Easy returns' },
        { icon: Headphones, text: 'Friendly support' },
      ].map(({ icon: Icon, text }) => (
        <div key={text} className="flex flex-col items-center gap-1 text-(length:--ds-fs-xs) text-(--ds-text-muted)">
          <span className="w-8 h-8 rounded-(--ds-r-full) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
            <Icon className="w-4 h-4" />
          </span>
          <span className="leading-(--ds-lh-snug)">{text}</span>
        </div>
      ))}
    </div>
  );

  /**
   * Phones: the order button stays on screen at the bottom with the total,
   * so the shopper never scrolls back down to find it. (The bottom menu bar is
   * hidden on the checkout, so nothing is covered.)
   */
  const mobileBar = (
    <div
      data-bottom-bar
      className="co-mobile-bar lg:hidden fixed inset-x-0 bottom-0 z-(--ds-z-header) bg-(--ds-surface)/95 backdrop-blur-md border-t border-(--ds-border) shadow-[0_-8px_24px_rgba(19,25,34,0.08)] print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-3xl mx-auto px-(--ds-s-3) py-(--ds-s-2) flex items-center gap-(--ds-s-3)">
        <div className="min-w-0 shrink-0">
          <span className="block text-(length:--ds-fs-2xs) uppercase tracking-(--ds-tracking-wide) font-(--ds-fw-semibold) text-(--ds-text-muted)">
            {label('totalLabel')}
          </span>
          <span className="block text-(length:--ds-fs-xl) font-(--ds-fw-black) text-(--ds-text) ds-num leading-none mt-0.5">{money(total)}</span>
        </div>
        <button
          type="submit"
          form="checkout-form"
          disabled={isSubmitting}
          className={`ds-btn ds-btn-primary ds-btn-lg flex-1 min-w-0 ${placeOrderCta.className}`}
          style={placeOrderCta.style}
        >
          {isSubmitting ? spinner : <Lock className="w-4 h-4" />}
          <span className="truncate min-w-0">
            {activeMethod?.online ? t('Pay with {name}', { name: GATEWAY_LOOK[activeMethod.id as keyof typeof GATEWAY_LOOK]?.short || activeMethod.name }) : label('submitLabel')}
          </span>
        </button>
      </div>
    </div>
  );

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) transition-colors cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4" />
      <span>Back to store</span>
    </button>
  );

  const stepsBar = (
    <ol className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-sm)" aria-label="Checkout steps">
      {steps.map((step, index) => {
        const isCurrent = index === currentStep;
        return (
          <React.Fragment key={step.id}>
            <li
              aria-current={isCurrent ? 'step' : undefined}
              className={`inline-flex items-center gap-(--ds-s-1) font-(--ds-fw-semibold) whitespace-nowrap ${
                step.done ? 'text-(--primary)' : isCurrent ? 'text-(--ds-text)' : 'text-(--ds-text-faint)'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-(--ds-r-full) inline-flex items-center justify-center text-(length:--ds-fs-2xs) ds-num ${
                  step.done
                    ? 'bg-(--primary) text-(--primary-foreground)'
                    : isCurrent
                    ? 'border border-(--ds-text) text-(--ds-text)'
                    : 'border border-(--ds-border-strong)'
                }`}
              >
                {step.done ? <Check className="w-3 h-3" /> : index + 1}
              </span>
              {step.label}
            </li>
            {index < steps.length - 1 && <li aria-hidden className="w-5 sm:w-8 h-px bg-(--ds-border-strong)" />}
          </React.Fragment>
        );
      })}
    </ol>
  );

  /** Phones: the order's products fold away above the form */
  const mobileSummary = (tinted = false) => (
    <div className={`lg:hidden ds-card mb-(--ds-s-4) overflow-hidden ${tinted ? 'co-split-panel' : ''}`}>
      <button
        type="button"
        onClick={() => setSummaryOpen((v) => !v)}
        aria-expanded={summaryOpen}
        className={`w-full flex items-center justify-between gap-(--ds-s-3) px-(--ds-card-pad-sm) h-(--ds-h-lg) cursor-pointer ${tinted ? '' : 'bg-(--ds-surface-2)'}`}
      >
        <span className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--primary)">
          <ShoppingBag className="w-4 h-4" />
          <span>{summaryOpen ? t('Hide order summary') : t('Show order summary ({n})', { n: itemCount })}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-(--ds-dur) ${summaryOpen ? 'rotate-180' : ''}`} />
        </span>
        <span className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) ds-num">{money(total)}</span>
      </button>
      {summaryOpen && <div className="p-(--ds-card-pad-sm) ds-fade-in">{summaryBody}</div>}
    </div>
  );

  const formProps = {
    id: 'checkout-form',
    onSubmit: handleSubmitOrder,
    onBlur: sendTrack,
    noValidate: true,
  };

  /* ================================================================ EXPRESS */
  if (design === 'express') {
    return (
      <div className="co-page co-express max-w-3xl mx-auto px-(--ds-s-3) sm:px-(--ds-s-4) pt-(--ds-s-5) sm:pt-(--ds-s-8) pb-32 lg:pb-(--ds-s-12)">
        <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-5)">
          <div className="min-w-0">
            {backLink}
            <h1 className="mt-(--ds-s-2) text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-black) text-(--ds-text)">Quick checkout</h1>
            <p className="mt-1 text-(length:--ds-fs-sm) text-(--ds-text-muted)">Fill in your details below — it takes less than a minute.</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-(--ds-s-3) rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-xs) font-(--ds-fw-bold) shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure
          </span>
        </div>

        <form {...formProps} className="ds-card overflow-hidden">
          {/* Order at the top: what is being bought, editable in place */}
          <div className="p-(--ds-s-4) sm:p-(--ds-s-6) bg-[color-mix(in_srgb,var(--primary)_5%,var(--ds-surface))] border-b border-(--ds-border-soft)">
            <div className="flex items-center justify-between gap-(--ds-s-2) mb-(--ds-s-2)">
              <h2 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) flex items-center gap-(--ds-s-2)">
                <ShoppingBag className="w-4 h-4 text-(--primary)" /> {label('summaryTitle')}
              </h2>
              <span className="ds-badge ds-badge-neutral ds-num">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            {itemsList(true)}
          </div>

          <div className="p-(--ds-s-4) sm:p-(--ds-s-6) space-y-(--ds-s-6)">
            {alerts}

            <section className="space-y-(--ds-s-4)">
              {eyebrow(label('deliverySectionTitle'), deliveryDone, User)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
                {nameField}
                {phoneField}
              </div>
              {geoFields}
              {addressField}
              {zoneField('pills')}
              {notesField}
            </section>

            <section>
              {eyebrow(label('paymentSectionTitle'), paymentDone, CreditCard)}
              {paymentField('tiles')}
            </section>

            {couponBox && <section className="pt-(--ds-s-5) border-t border-(--ds-border-soft)">{couponBox}</section>}

            <section className="rounded-(--ds-r-lg) bg-(--ds-surface-2) border border-(--ds-border-soft) p-(--ds-s-4)">{totalsList}</section>

            <div className="hidden lg:block space-y-(--ds-s-2)">
              {submitButton('h-14 text-(length:--ds-fs-lg)')}
              {secureLine}
            </div>
          </div>
        </form>
        {mobileBar}
      </div>
    );
  }

  /* ================================================================== SPLIT */
  if (design === 'split') {
    return (
      <div className="co-page co-split max-w-6xl mx-auto px-(--ds-s-3) sm:px-(--ds-s-4) pt-(--ds-s-5) sm:pt-(--ds-s-8) pb-32 lg:pb-(--ds-s-12)">
        <div className="ds-card p-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* Left: the form, open and airy */}
          <div className="p-(--ds-s-4) sm:p-(--ds-s-8) lg:p-(--ds-s-10) min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-(--ds-s-3) mb-(--ds-s-6)">
              <div className="min-w-0">
                {backLink}
                <h1 className="mt-(--ds-s-2) text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-black) text-(--ds-text)">Checkout</h1>
              </div>
              {stepsBar}
            </div>

            {mobileSummary(true)}

            <form {...formProps} className="space-y-(--ds-s-8)">
              {alerts}

              <section>
                {eyebrow('Contact', infoDone, User)}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
                  {nameField}
                  {phoneField}
                </div>
              </section>

              <section className="pt-(--ds-s-6) border-t border-dashed border-(--ds-border)">
                {eyebrow(label('deliverySectionTitle'), deliveryDone, MapPin)}
                <div className="space-y-(--ds-s-4)">
                  {geoFields}
                  {addressField}
                  {zoneField('cards')}
                  {notesField}
                </div>
              </section>

              <section className="pt-(--ds-s-6) border-t border-dashed border-(--ds-border)">
                {eyebrow(label('paymentSectionTitle'), paymentDone, CreditCard)}
                {paymentField('list')}
              </section>
            </form>
          </div>

          {/* Right: a tinted panel with the order */}
          <aside className="co-split-panel hidden lg:block border-l border-(--ds-border-soft)">
            <div className="sticky top-(--ds-s-4) p-(--ds-s-8) space-y-(--ds-s-5)">
              <div className="flex items-baseline justify-between gap-(--ds-s-2)">
                <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">{label('summaryTitle')}</h2>
                <span className="text-(length:--ds-fs-sm) text-(--ds-text-muted) ds-num">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              {summaryBody}
              <div className="space-y-(--ds-s-2)">
                {submitButton('h-13')}
                {secureLine}
              </div>
              <div className="pt-(--ds-s-4) border-t border-(--ds-border-soft)">{trustRow}</div>
            </div>
          </aside>
        </div>
        {mobileBar}
      </div>
    );
  }

  /* ================================================================ CLASSIC */
  return (
    <div className="co-page co-classic max-w-6xl mx-auto px-(--ds-s-3) sm:px-(--ds-s-4) pt-(--ds-s-5) sm:pt-(--ds-s-8) pb-32 lg:pb-(--ds-s-10)">
      {/* Header: back link + step progress */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-(--ds-s-3) mb-(--ds-s-5)">
        <div className="min-w-0">
          {backLink}
          <h1 className="mt-(--ds-s-2) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Checkout</h1>
        </div>
        {stepsBar}
      </div>

      {mobileSummary()}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-(--ds-s-5) lg:gap-(--ds-s-6) items-start">
        {/* ---------- Left: the form ---------- */}
        <form {...formProps} className="space-y-(--ds-s-4) sm:space-y-(--ds-s-5) min-w-0">
          {alerts}

          {/* 1 — customer */}
          <section className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad-lg)">
            {sectionTitle(1, 'Contact details', infoDone)}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
              {nameField}
              {phoneField}
            </div>
          </section>

          {/* 2 — delivery */}
          <section className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad-lg)">
            {sectionTitle(2, label('deliverySectionTitle'), deliveryDone)}
            <div className="space-y-(--ds-s-4)">
              {/* v3.10 — district and thana come first, the street address after them */}
              {geoFields}
              {addressField}
              {zoneField('cards')}
              {notesField}
            </div>
          </section>

          {/* 3 — payment */}
          <section className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad-lg)">
            {sectionTitle(3, label('paymentSectionTitle'), paymentDone)}
            {paymentField('list')}
          </section>
        </form>

        {/* ---------- Right: sticky summary ---------- */}
        <aside className="hidden lg:block lg:sticky lg:top-(--ds-s-6)">
          <section className="ds-card p-(--ds-card-pad)">
            <div className="flex items-baseline justify-between gap-(--ds-s-2) pb-(--ds-s-4) mb-(--ds-s-4) border-b border-(--ds-border-soft)">
              <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">{label('summaryTitle')}</h2>
              <span className="text-(length:--ds-fs-sm) text-(--ds-text-muted) ds-num">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            {summaryBody}

            <div className="mt-(--ds-s-5) space-y-(--ds-s-2)">
              {submitButton('')}
              {secureLine}
            </div>
          </section>
        </aside>
      </div>
      {mobileBar}
    </div>
  );
};
