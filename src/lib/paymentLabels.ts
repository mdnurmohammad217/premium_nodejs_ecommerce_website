/**
 * Human names for the payment method stored on an order.
 *
 * Orders store a short id: 'cod', 'cash', 'bkash', or — for a manual
 * "send money" option added in System Configuration → Payments — an id like
 * 'gw-596726'. Invoices, receipts and order screens used to print that id
 * as it was ("GW-596726"). This turns it into the name the shop gave it.
 * Shared by the server (invoice API) and the browser.
 */

export interface PaymentMethodLike {
  id: string;
  name?: string;
  accountType?: string;
  logoUrl?: string;
}

const BUILT_IN: Record<string, string> = {
  cod: 'Cash on Delivery',
  cash: 'Cash',
  card: 'Card',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  upay: 'Upay',
  sslcommerz: 'SSLCommerz (Card / Mobile Banking)',
  bank: 'Bank Transfer',
  due: 'Due (Credit)',
  credit: 'Due (Credit)',
  mixed: 'Mixed Payment',
};

/** The display name for a payment method id */
export function paymentMethodLabel(method: any, methods?: PaymentMethodLike[] | null): string {
  const id = String(method ?? '').trim();
  if (!id) return '—';
  const configured = Array.isArray(methods) ? methods.find((entry) => entry && String(entry.id) === id) : null;
  if (configured?.name && String(configured.name).trim()) return String(configured.name).trim();
  const known = BUILT_IN[id.toLowerCase()];
  if (known) return known;
  // A manual gateway that was renamed or removed later: never print the raw id
  if (/^gw-\d+$/i.test(id)) return 'Manual payment';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The logo the shop uploaded for a payment method, if any */
export function paymentMethodLogo(method: any, methods?: PaymentMethodLike[] | null): string {
  const id = String(method ?? '').trim();
  const configured = Array.isArray(methods) ? methods.find((entry) => entry && String(entry.id) === id) : null;
  return configured?.logoUrl ? String(configured.logoUrl) : '';
}

const STATUS: Record<string, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  pending: 'Pending',
  partial: 'Partly paid',
  failed: 'Failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  verifying: 'Verifying',
};

export function paymentStatusLabel(status: any): string {
  const key = String(status ?? '').trim().toLowerCase();
  if (!key) return '';
  return STATUS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}
