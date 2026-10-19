/**
 * Sends the customer to SSLCommerz / bKash / Nagad for an order that was
 * just placed. The server reads the amount from the order itself; the browser
 * only says which order (and proves it with the phone number on it).
 *
 * The order number and phone are kept in sessionStorage so the result page
 * (/payment/result) can show the order after the gateway sends them back.
 */
const PENDING_KEY = 'pharma:pending-payment';

export const ONLINE_GATEWAYS = ['sslcommerz', 'bkash', 'nagad'] as const;
export type OnlineGateway = (typeof ONLINE_GATEWAYS)[number];

export const isOnlineGateway = (method?: string | null): method is OnlineGateway =>
  Boolean(method) && (ONLINE_GATEWAYS as readonly string[]).includes(String(method));

export interface PendingPayment {
  orderNumber: string;
  phone: string;
  gateway: string;
  at: number;
  /** Where the order came from, so "Try again" can return there */
  returnTo?: string;
}

export function rememberPendingPayment(value: PendingPayment) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    /* private mode: the result page can still ask for the phone */
  }
}

export function readPendingPayment(): PendingPayment | null {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const raw = store().getItem(PENDING_KEY);
      if (raw) {
        const value = JSON.parse(raw);
        if (value?.orderNumber && Date.now() - Number(value.at || 0) < 24 * 3600 * 1000) return value;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function clearPendingPayment() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Starts the payment and leaves the page. Resolves only if something went
 * wrong (the promise rejects with a readable message) — on success the
 * browser is already on its way to the gateway.
 */
export async function startOnlinePayment(order: { orderNumber: string; customerPhone: string; paymentMethod: string }, returnTo?: string): Promise<void> {
  rememberPendingPayment({
    orderNumber: order.orderNumber,
    phone: order.customerPhone,
    gateway: order.paymentMethod,
    at: Date.now(),
    returnTo,
  });
  const res = await fetch(`/api/payments/${encodeURIComponent(order.paymentMethod)}/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber: order.orderNumber, phone: order.customerPhone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw new Error(data?.error || 'The payment could not be started. Please try again.');
  window.location.href = data.url;
}

export const GATEWAY_LOOK: Record<OnlineGateway, { color: string; soft: string; short: string }> = {
  sslcommerz: { color: '#1d4ed8', soft: '#dbeafe', short: 'Card / MFS' },
  bkash: { color: '#e2136e', soft: '#fce7f3', short: 'bKash' },
  nagad: { color: '#f7941d', soft: '#ffedd5', short: 'Nagad' },
};
