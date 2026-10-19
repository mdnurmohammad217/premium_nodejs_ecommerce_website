import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Package,
  Plus,
  Minus,
  Trash2,
  Search,
  User,
  Phone,
  MapPin,
  Wallet,
  UserCheck,
  StickyNote,
  Truck,
  Loader2,
} from 'lucide-react';
import { Drawer, Button, IconButton, Field, Select, Card, Money, Thumb, mix } from './ui.tsx';
import { cleanGeoConfig, zoneForPlace, placeLabel } from '../../lib/geoShipping.ts';
import { useBdDistricts } from '../store/DistrictThanaFields.tsx';

export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_returned', label: 'Partly Returned' },
  { value: 'returned', label: 'Returned' },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partly paid (advance)' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

interface Line {
  key: string;
  productId: number;
  productName: string;
  image?: string | null;
  variationId: number | null;
  variations: Array<{ id: number; label: string; stock: number; price: any; salePrice: any; image?: string | null; status?: string }>;
  hasVariations: boolean;
  quantity: number;
  unitPrice: number;
  /** stock left on the shelf (for the hint) */
  stock: number;
}

interface StaffOption {
  id: number;
  name: string;
  jobRole?: string | null;
  openOrders?: number;
}

interface Props {
  open: boolean;
  /** null = Add Order; a number = edit that order */
  orderId: number | null;
  onClose: () => void;
  onSaved: (order: any, created: boolean) => void;
  currency?: string;
  settings?: any;
  paymentChoices: Array<{ value: string; label: string }>;
  staff: StaffOption[];
  notify: (message: string, kind?: 'success' | 'error' | 'info' | 'warning') => void;
}

const positive = (value: any) => (value != null && Number(value) > 0 ? Number(value) : null);
const listPrice = (product: any, variation?: any) =>
  variation
    ? positive(variation.salePrice) ?? positive(variation.price) ?? positive(product?.salePrice) ?? Number(product?.price || 0)
    : positive(product?.salePrice) ?? Number(product?.price || 0);

/**
 * v3.15 — products come from the server as you type (30 matches at a time),
 * or by id for an order being edited — never the whole catalogue, which with
 * 20 000+ products made the form slow to open.
 */
async function searchProducts(term: string): Promise<any[]> {
  const params = new URLSearchParams({ all: '1', limit: '30' });
  if (term.trim()) params.set('search', term.trim());
  const rows = await fetch(`/api/admin/products?${params.toString()}`)
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
async function productsByIds(ids: number[]): Promise<any[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const rows = await fetch(`/api/admin/products?all=1&ids=${unique.join(',')}`)
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
/** Kept for callers from older versions (nothing is cached any more) */
export const forgetOrderFormProducts = () => undefined;

async function loadVariations(productId: number) {
  try {
    const res = await fetch(`/api/admin/products/${productId}/variations`);
    const rows = res.ok ? await res.json() : [];
    return (Array.isArray(rows) ? rows : []).filter((row: any) => row.status !== 'inactive');
  } catch {
    return [];
  }
}

/**
 * Orders → Add Order / Edit Order.
 *
 * One form for both: the customer (phone look-up fills a known customer),
 * district & thana, delivery area and charge, the products with their size /
 * colour, discount, advance payment (the courier collects the rest), payment
 * and order status, the staff member who handles it, and a note. The server
 * re-checks stock and prices on save.
 */
export const OrderFormDrawer: React.FC<Props> = ({
  open,
  orderId,
  onClose,
  onSaved,
  currency = '৳',
  settings,
  paymentChoices,
  staff,
  notify,
}) => {
  const editing = orderId !== null;
  const zones: Array<{ id: string; name: string; charge: number; enabled?: boolean }> = useMemo(
    () => (settings?.shipping?.zones || []).filter((zone: any) => zone && zone.enabled !== false),
    [settings?.shipping?.zones]
  );
  const geo = useMemo(() => cleanGeoConfig(settings?.checkout_geo_config), [settings?.checkout_geo_config]);
  const districts = useBdDistricts(open);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [zone, setZone] = useState('');
  const [shippingCharge, setShippingCharge] = useState<string>('');
  const [chargeTouched, setChargeTouched] = useState(false);
  const [discount, setDiscount] = useState<string>('0');
  const [advance, setAdvance] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [orderStatus, setOrderStatus] = useState('pending');
  const [transactionId, setTransactionId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lookup, setLookup] = useState<any[]>([]);
  const lookupTimer = useRef<number | null>(null);

  /* ------------------------------------------------------------ open / load */
  useEffect(() => {
    if (!open) return;
    setError('');
    setQuery('');
    setPickerOpen(false);
    setLookup([]);
    searchProducts('').then(setResultsList);
    if (!editing) {
      setOrderNumber('');
      setLines([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setDistrict('');
      setThana('');
      setZone(zones[0]?.name || '');
      setShippingCharge(zones[0] ? String(zones[0].charge) : '0');
      setChargeTouched(false);
      setDiscount('0');
      setAdvance('0');
      setPaymentMethod('cod');
      setPaymentStatus('unpaid');
      setOrderStatus('pending');
      setTransactionId('');
      setAssignedTo('');
      setNotes('');
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const order = data.order || {};
        setOrderNumber(order.orderNumber || '');
        setCustomerName(order.customerName || '');
        setCustomerPhone(order.customerPhone || '');
        setCustomerAddress(order.customerAddress || '');
        setDistrict(order.district || '');
        setThana(order.thana || '');
        setZone(order.shippingZone || '');
        setShippingCharge(String(Number(order.shippingCharge || 0)));
        setChargeTouched(true);
        setDiscount(String(Number(order.discount || 0)));
        setAdvance(String(Number(order.advancePaid || 0)));
        setPaymentMethod(order.paymentMethod || 'cod');
        setPaymentStatus(order.paymentStatus || 'unpaid');
        setOrderStatus(order.orderStatus || 'pending');
        setTransactionId(order.transactionId || '');
        setAssignedTo(order.assignedTo ? String(order.assignedTo) : '');
        setNotes(order.notes || '');
        const catalogue = await productsByIds((data.items || []).map((item: any) => Number(item.productId)));
        rememberProducts(catalogue);
        const built: Line[] = [];
        for (const item of data.items || []) {
          const product = catalogue.find((row) => row.id === item.productId);
          const variations = item.variationId || product?.hasVariations ? await loadVariations(item.productId) : [];
          built.push({
            key: `${item.productId}:${item.variationId || 0}:${built.length}`,
            productId: item.productId,
            productName: item.productName,
            image: item.image || product?.image,
            variationId: item.variationId || null,
            variations,
            hasVariations: variations.length > 0,
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            stock: Number(product?.stock ?? 0),
          });
        }
        setLines(built);
      } catch {
        setError('Could not load this order.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  /* -------------------------------------------------------- delivery charge */
  const zoneMatch = zones.find((z) => z.name === zone || z.id === zone);
  // District with automatic charges: the area follows the district / thana
  useEffect(() => {
    if (!open || !geo.enabled || !geo.autoShipping || !district) return;
    const id = zoneForPlace(geo, zones, district, thana);
    const found = zones.find((z) => z.id === id);
    if (found && found.name !== zone) {
      setZone(found.name);
      if (!chargeTouched) setShippingCharge(String(found.charge));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, thana, open]);

  const chooseZone = (value: string) => {
    setZone(value);
    const found = zones.find((z) => z.name === value);
    if (found && !chargeTouched) setShippingCharge(String(found.charge));
  };

  /* ---------------------------------------------------------------- picker */
  const [resultsList, setResultsListState] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  /** Every product seen in this form (search results + the order's own lines), by id */
  const rememberProducts = (rows: any[]) =>
    setProducts((current) => {
      const byId = new Map(current.map((row) => [row.id, row]));
      rows.forEach((row) => byId.set(row.id, row));
      return Array.from(byId.values());
    });
  const setResultsList = (rows: any[]) => {
    setResultsListState(rows);
    rememberProducts(rows);
  };
  useEffect(() => {
    if (!open || !pickerOpen) return;
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const rows = await searchProducts(query);
      if (cancelled) return;
      setResultsList(rows);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, pickerOpen]);
  const results = resultsList;

  const addProduct = async (product: any) => {
    setPickerOpen(false);
    setQuery('');
    let variations: Line['variations'] = [];
    if (product.hasVariations) variations = await loadVariations(product.id);
    const firstInStock = variations.find((v) => Number(v.stock) > 0) || variations[0] || null;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && line.variationId === (firstInStock?.id || null));
      if (existing) {
        return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [
        ...current,
        {
          key: `${product.id}:${firstInStock?.id || 0}:${Date.now()}`,
          productId: product.id,
          productName: product.name,
          image: firstInStock?.image || product.image,
          variationId: firstInStock?.id || null,
          variations,
          hasVariations: variations.length > 0,
          quantity: 1,
          unitPrice: listPrice(product, firstInStock),
          stock: Number(firstInStock ? firstInStock.stock : product.stock) || 0,
        },
      ];
    });
  };

  const updateLine = (key: string, changes: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));

  /* ------------------------------------------------------------ customer */
  const onPhone = (value: string) => {
    const clean = value.replace(/[^\d+\s-]/g, '');
    setCustomerPhone(clean);
    if (editing) return;
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    const digits = clean.replace(/\D/g, '');
    if (digits.length < 4) return setLookup([]);
    lookupTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/orders-customer-lookup?q=${encodeURIComponent(digits)}`);
        setLookup(res.ok ? await res.json() : []);
      } catch {
        setLookup([]);
      }
    }, 280);
  };

  /* ---------------------------------------------------------------- totals */
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const delivery = Math.max(0, Number(shippingCharge) || 0);
  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountValue + delivery);
  const advanceValue = Math.max(0, Number(advance) || 0);
  const due = Math.max(0, total - advanceValue);
  const shownPaymentStatus =
    advanceValue > 0 && !['paid', 'refunded', 'failed'].includes(paymentStatus)
      ? advanceValue + 0.005 >= total
        ? 'paid'
        : 'partial'
      : paymentStatus;

  const selectedDistrict = districts.find((d) => d.n === district);

  /* ------------------------------------------------------------------ save */
  const save = async () => {
    setError('');
    if (!customerName.trim()) return setError('Enter the customer’s name.');
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 10) return setError('Enter a valid phone number.');
    if (lines.length === 0) return setError('Add at least one product.');
    const missing = lines.find((line) => line.hasVariations && !line.variationId);
    if (missing) return setError(`Choose a size / colour for ${missing.productName}.`);
    if (advanceValue > total + 0.005) return setError('The advance cannot be more than the order total.');
    setSaving(true);
    try {
      const body: any = {
        customerName: customerName.trim(),
        customerPhone: digits,
        customerAddress: customerAddress.trim(),
        district: district || null,
        thana: thana || null,
        shippingZone: zone,
        shippingCharge: delivery,
        discount: discountValue,
        advancePaid: advanceValue,
        paymentMethod,
        paymentStatus,
        orderStatus,
        transactionId: transactionId.trim() || null,
        notes,
        assignedTo: assignedTo ? Number(assignedTo) : null,
        items: lines.map((line) => ({
          productId: line.productId,
          variationId: line.variationId || undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      };
      const res = await fetch(editing ? `/api/admin/orders/${orderId}` : '/api/admin/orders', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the order.');
      forgetOrderFormProducts();
      notify(editing ? 'Order updated.' : `Order ${data.order?.orderNumber || ''} created.`);
      onSaved(data.order, !editing);
    } catch (err: any) {
      setError(err.message || 'Could not save the order.');
    } finally {
      setSaving(false);
    }
  };

  const sectionTitle = (icon: React.ReactNode, text: string, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 mb-3">
      <span className="font-bold flex items-center gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
        <span style={{ color: 'var(--primary-ink, var(--primary))' }}>{icon}</span>
        {text}
      </span>
      {extra}
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${orderNumber || 'Order'}` : 'Add Order'}
      subtitle={editing ? 'Products, prices, delivery charge, advance payment and customer details' : 'A phone, Facebook or WhatsApp order — stock is taken when you save'}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={loading}>
            {editing ? 'Save Changes' : 'Create Order'}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16" style={{ color: 'var(--a-text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" /> Loading order…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Customer */}
          <Card>
            {sectionTitle(<User className="w-4 h-4" />, 'Customer')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Phone" required>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--a-text-faint)' }} />
                  <input
                    className="a-field ds-num"
                    style={{ paddingLeft: 34 }}
                    inputMode="tel"
                    value={customerPhone}
                    placeholder="01XXXXXXXXX"
                    onChange={(event) => onPhone(event.target.value)}
                    onBlur={() => window.setTimeout(() => setLookup([]), 200)}
                  />
                  {lookup.length > 0 && (
                    <div
                      className="absolute left-0 right-0 mt-1 overflow-hidden"
                      style={{
                        zIndex: 5,
                        background: 'var(--a-surface)',
                        border: '1px solid var(--a-border-strong)',
                        borderRadius: 'var(--ds-r-md)',
                        boxShadow: 'var(--ds-shadow-lg)',
                      }}
                    >
                      {lookup.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setCustomerPhone(row.phone || '');
                            setCustomerName(row.name || '');
                            if (row.address) setCustomerAddress(row.address);
                            setLookup([]);
                          }}
                          className="w-full text-left px-3 py-2 cursor-pointer hover:brightness-95"
                          style={{ background: 'var(--a-surface)', fontSize: 'var(--a-fs-md)' }}
                        >
                          <span className="font-semibold">{row.name}</span>{' '}
                          <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                            {row.phone}
                          </span>
                          {Number(row.totalOrders) > 0 && (
                            <span style={{ color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-sm)' }}> · {row.totalOrders} orders</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Name" required>
                <input className="a-field" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="District (জেলা)">
                <Select
                  value={district}
                  onChange={(value) => {
                    setDistrict(value);
                    setThana('');
                  }}
                  options={[
                    { value: '', label: districts.length ? '— Choose —' : 'Loading…' },
                    ...districts.map((d) => ({ value: d.n, label: placeLabel(d.n, d.b, 'both') })),
                    ...(district && !districts.some((d) => d.n === district) ? [{ value: district, label: district }] : []),
                  ]}
                />
              </Field>
              <Field label="Thana (থানা)">
                <Select
                  value={thana}
                  disabled={!selectedDistrict}
                  onChange={setThana}
                  options={[
                    { value: '', label: selectedDistrict ? '— Choose —' : 'Choose the district first' },
                    ...(selectedDistrict?.t || []).map(([en, bn]) => ({ value: en, label: placeLabel(en, bn, 'both') })),
                    ...(thana && !(selectedDistrict?.t || []).some(([en]) => en === thana) ? [{ value: thana, label: thana }] : []),
                  ]}
                />
              </Field>
            </div>
            <Field label="Delivery Address" className="mt-3">
              <textarea
                className="a-field"
                rows={2}
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
                placeholder="House, road, area"
              />
            </Field>
          </Card>

          {/* Products */}
          <Card padded={false}>
            <div className="p-4 pb-3 border-b" style={{ borderColor: 'var(--a-border)' }}>
              {sectionTitle(<Package className="w-4 h-4" />, 'Products')}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--a-text-faint)' }} />
                <input
                  className="a-field"
                  style={{ paddingLeft: 34 }}
                  value={query}
                  placeholder="Search a product by name, SKU or barcode…"
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setPickerOpen(false), 200)}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPickerOpen(true);
                  }}
                />
                {pickerOpen && (
                  <div
                    className="absolute left-0 right-0 mt-1 overflow-y-auto"
                    style={{
                      zIndex: 6,
                      maxHeight: 300,
                      background: 'var(--a-surface)',
                      border: '1px solid var(--a-border-strong)',
                      borderRadius: 'var(--ds-r-md)',
                      boxShadow: 'var(--ds-shadow-lg)',
                    }}
                  >
                    {results.length === 0 ? (
                      <p className="p-3" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                        {searching ? 'Searching…' : 'No product matches.'}
                      </p>
                    ) : (
                      results.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => addProduct(product)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer hover:brightness-95"
                          style={{ background: 'var(--a-surface)', borderBottom: '1px solid var(--a-border-soft)' }}
                        >
                          <Thumb src={product.image} alt={product.name} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                              {product.name}
                            </span>
                            <span className="block" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                              {product.hasVariations ? 'Has sizes / colours · ' : ''}Stock {product.stock}
                            </span>
                          </span>
                          <Money value={listPrice(product)} currency={currency} bold />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="p-4" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                No products yet — search above to add one.
              </p>
            ) : (
              lines.map((line) => {
                const variation = line.variations.find((v) => v.id === line.variationId);
                return (
                  <div
                    key={line.key}
                    className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
                    style={{ borderBottom: '1px solid var(--a-border-soft)' }}
                  >
                    <div className="flex items-center gap-3 w-full md:w-auto md:flex-1 min-w-0">
                      <Thumb src={variation?.image || line.image} alt={line.productName} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {line.productName}
                        </div>
                        {line.hasVariations ? (
                          <select
                            className="a-field mt-1"
                            style={{ height: 32, padding: '0 8px', fontSize: 'var(--a-fs-sm)' }}
                            value={line.variationId ? String(line.variationId) : ''}
                            onChange={(event) => {
                              const next = line.variations.find((v) => String(v.id) === event.target.value);
                              const product = products.find((p) => p.id === line.productId);
                              updateLine(line.key, {
                                variationId: next ? next.id : null,
                                unitPrice: next ? listPrice(product, next) : line.unitPrice,
                                stock: next ? Number(next.stock) : line.stock,
                              });
                            }}
                          >
                            <option value="">Choose size / colour</option>
                            {line.variations.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label} — stock {v.stock}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Stock {line.stock}</div>
                        )}
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5">
                      <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Price</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="a-field ds-num"
                        style={{ width: 96 }}
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.key, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      <IconButton icon={Minus} label="Decrease" onClick={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })} />
                      <input
                        className="a-field ds-num text-center"
                        style={{ width: 48, padding: '0 4px' }}
                        value={line.quantity}
                        inputMode="numeric"
                        onChange={(event) => updateLine(line.key, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                      />
                      <IconButton icon={Plus} label="Increase" onClick={() => updateLine(line.key, { quantity: line.quantity + 1 })} />
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-right" style={{ minWidth: 72 }}>
                        <Money value={line.unitPrice * line.quantity} currency={currency} bold />
                      </span>
                      <IconButton
                        icon={Trash2}
                        tone="danger"
                        label="Remove Product"
                        onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {/* Delivery & payment */}
          <Card>
            {sectionTitle(<Truck className="w-4 h-4" />, 'Delivery & payment')}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Delivery Zone">
                <Select
                  value={zoneMatch?.name || zone}
                  onChange={chooseZone}
                  options={[
                    ...(zones.length === 0 ? [{ value: '', label: 'No zones set up' }] : []),
                    ...zones.map((z) => ({ value: z.name, label: `${z.name} (${currency}${z.charge})` })),
                    ...(zone && !zoneMatch ? [{ value: zone, label: zone }] : []),
                  ]}
                />
              </Field>
              <Field label={`Delivery Charge (${currency})`}>
                <input
                  type="number"
                  min={0}
                  className="a-field ds-num"
                  value={shippingCharge}
                  onChange={(event) => {
                    setShippingCharge(event.target.value);
                    setChargeTouched(true);
                  }}
                />
              </Field>
              <Field label={`Discount (${currency})`}>
                <input type="number" min={0} className="a-field ds-num" value={discount} onChange={(event) => setDiscount(event.target.value)} />
              </Field>
            </div>

            <div
              className="mt-3 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
              style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-success)', 0.07), border: `1px solid ${mix('var(--ds-success)', 0.25)}` }}
            >
              <Field label={`Advance Payment (${currency})`} hint="Money the customer already paid. The courier collects only the rest.">
                <div className="relative">
                  <Wallet className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ds-success-text)' }} />
                  <input
                    type="number"
                    min={0}
                    className="a-field ds-num"
                    style={{ paddingLeft: 34 }}
                    value={advance}
                    onChange={(event) => setAdvance(event.target.value)}
                  />
                </div>
              </Field>
              <Field label="Advance Transaction ID (optional)">
                <input
                  className="a-field ds-num"
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                  placeholder="bKash / Nagad TrxID"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Payment Method">
                <Select
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  options={[
                    ...paymentChoices,
                    ...(paymentMethod && !paymentChoices.some((c) => c.value === paymentMethod) ? [{ value: paymentMethod, label: paymentMethod }] : []),
                  ]}
                />
              </Field>
              <Field label="Payment Status" hint={shownPaymentStatus !== paymentStatus ? `Will be saved as “${PAYMENT_STATUS_OPTIONS.find((o) => o.value === shownPaymentStatus)?.label}”` : undefined}>
                <Select value={paymentStatus} onChange={setPaymentStatus} options={PAYMENT_STATUS_OPTIONS} />
              </Field>
              <Field label="Order Status">
                <Select
                  value={orderStatus}
                  onChange={setOrderStatus}
                  options={editing ? ORDER_STATUS_OPTIONS : ORDER_STATUS_OPTIONS.filter((o) => !['cancelled', 'refunded', 'returned', 'partially_returned'].includes(o.value))}
                />
              </Field>
            </div>
          </Card>

          {/* Staff & note */}
          <Card>
            {sectionTitle(<UserCheck className="w-4 h-4" />, 'Handled by')}
            <Field label="Assign to staff" hint="The staff member sees this order under POS → My Orders.">
              <Select
                value={assignedTo}
                onChange={setAssignedTo}
                options={[
                  { value: '', label: 'Not assigned' },
                  ...staff.map((s) => ({
                    value: String(s.id),
                    label: `${s.name}${s.jobRole ? ` — ${s.jobRole}` : ''}${s.openOrders ? ` (${s.openOrders} open)` : ''}`,
                  })),
                ]}
              />
            </Field>
            <Field label="Internal Note" className="mt-3">
              <div className="relative">
                <StickyNote className="w-4 h-4 absolute left-3 top-3" style={{ color: 'var(--a-text-faint)' }} />
                <textarea className="a-field" style={{ paddingLeft: 34 }} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </Field>
          </Card>

          {/* Totals */}
          <Card>
            <div className="space-y-1.5" style={{ fontSize: 'var(--a-fs-md)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--a-text-muted)' }}>Subtotal</span>
                <Money value={subtotal} currency={currency} />
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--a-text-muted)' }}>Discount</span>
                <span>
                  −<Money value={discountValue} currency={currency} />
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--a-text-muted)' }}>Delivery Charge</span>
                <Money value={delivery} currency={currency} />
              </div>
              <div className="flex justify-between pt-2 border-t font-bold" style={{ borderColor: 'var(--a-border)', fontSize: 'var(--a-fs-lg)' }}>
                <span>Grand Total</span>
                <Money value={total} currency={currency} bold />
              </div>
              {advanceValue > 0 && (
                <>
                  <div className="flex justify-between" style={{ color: 'var(--ds-success-text)' }}>
                    <span>Advance paid</span>
                    <span>
                      −<Money value={advanceValue} currency={currency} />
                    </span>
                  </div>
                  <div className="flex justify-between font-bold" style={{ fontSize: 'var(--a-fs-lg)', color: 'var(--primary-ink, var(--primary))' }}>
                    <span>Due (collect on delivery)</span>
                    <Money value={due} currency={currency} bold />
                  </div>
                </>
              )}
            </div>
          </Card>

          {error && (
            <p
              role="alert"
              className="p-3 flex items-start gap-2"
              style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-danger-soft)', color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-md)' }}
            >
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 hidden" />
              {error}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
};
