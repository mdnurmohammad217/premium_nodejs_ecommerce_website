import { PosModules } from './PosModules.tsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  Printer,
  PauseCircle,
  UserPlus,
  Users,
  Receipt,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  LayoutDashboard,
  Package,
  LayoutGrid,
  Calculator,
  Volume2,
  VolumeX,
  ShoppingCart,
  Clock,
  CheckCircle2,
  Layers,
  ChevronUp,
  UserRound,
  Search,
  Vault,
} from 'lucide-react';
import { Product, Category, SiteSettings } from '../../types/index.ts';
import { posSounds, isSoundEnabled, setSoundEnabled, preloadPosSounds } from '../../lib/posSounds.ts';
import { MiniCalculator } from '../admin/MiniCalculator.tsx';
import { CashDrawerPanel } from './CashDrawerPanel.tsx';
import { DrawerSettings, openDrawer, readDrawerSettings, saveDrawerSettings, shouldAutoOpen, printSlip, noSaleSlipHtml } from '../../lib/cashDrawer.ts';
import { paymentMethodLabel } from '../../lib/paymentLabels.ts';
import {
  Button,
  IconButton,
  Modal,
  EmptyState,
  ErrorState,
  Field,
  SearchInput,
  useDebounced,
  useToasts,
  tint,
} from '../admin/ui.tsx';

interface PosTerminalProps {
  onBackToStore: () => void;
  /** Where the top-left button goes — the dashboard, not the storefront */
  onOpenDashboard?: () => void;
}

interface PosCartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  /** Distinguishes two variations of one product; plain products key by id */
  lineKey?: string;
  variationId?: number;
}

interface Variation {
  id: number;
  label: string;
  price: number | null;
  salePrice: number | null;
  stock: number;
  image?: string;
}

// The server fills in the same values when a sale has no named customer, so
// the walk-in identity stays a single constant on both sides.
const WALK_IN = { name: 'Walk-in Customer', phone: '01900000000' };

const PAPER_KEY = 'pos:receipt-paper';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'bkash', label: 'bKash', icon: Smartphone },
  { id: 'nagad', label: 'Nagad', icon: Wallet },
  { id: 'card', label: 'Card', icon: CreditCard },
];

const fs = (size: string): React.CSSProperties => ({ fontSize: `var(--ds-fs-${size})` });

const lineKeyOf = (item: PosCartItem) => item.lineKey ?? String(item.product.id);

const hideBrokenImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.style.display = 'none';
};

/** A keyboard hint shown next to a control on wide screens */
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    className="hidden xl:inline-flex items-center font-semibold"
    style={{
      ...fs('2xs'),
      padding: '1px 5px',
      borderRadius: 'var(--ds-r-xs)',
      border: '1px solid currentColor',
      opacity: 0.6,
      fontFamily: 'var(--font-mono)',
    }}
  >
    {children}
  </kbd>
);

export const PosTerminal: React.FC<PosTerminalProps> = ({ onBackToStore, onOpenDashboard }) => {
  // Back-office modules (purchase, expenses, counter, reports...) open over the till
  const [isModulesOpen, setIsModulesOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id?: number; name: string; phone: string }>(
    WALK_IN
  );
  const [heldOrders, setHeldOrders] = useState<any[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  const [settings, setSettings] = useState<SiteSettings>({});
  const [cashier, setCashier] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [calcOpen, setCalcOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [paper, setPaper] = useState<'mm58' | 'mm80' | null>(() => {
    try {
      const stored = localStorage.getItem(PAPER_KEY);
      return stored === 'mm58' || stored === 'mm80' ? stored : null;
    } catch {
      return null;
    }
  });

  const [variationFor, setVariationFor] = useState<Product | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variationsError, setVariationsError] = useState(false);

  // Cash drawer: per-computer settings (localStorage)
  const [drawer, setDrawer] = useState<DrawerSettings>(() => readDrawerSettings());
  const [drawerPanel, setDrawerPanel] = useState(false);
  const updateDrawer = (next: DrawerSettings) => {
    setDrawer(next);
    saveDrawerSettings(next);
  };

  // Products beyond the first page are found on the server as you type
  const [serverResults, setServerResults] = useState<Product[]>([]);
  const [scanBusy, setScanBusy] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  // Scans can arrive faster than React re-renders, so stock checks read the
  // latest cart from a ref rather than from a possibly stale closure.
  const cartRef = useRef<PosCartItem[]>([]);
  const toasts = useToasts();

  const commitCart = (next: PosCartItem[]) => {
    cartRef.current = next;
    setCart(next);
  };

  const currency = settings?.general?.currency || '৳';
  const storeName =
    settings?.invoice_config?.businessName ||
    settings?.general?.storeName ||
    settings?.logo_config?.pharmacyName ||
    '';
  const logoUrl = settings?.logo_config?.desktopLogoUrl || settings?.invoice_config?.logoUrl || '';
  // Receipts: the invoice logo, else the website logo (unless switched off in Invoice settings)
  const receiptLogo =
    settings?.invoice_config?.showLogo === false
      ? ''
      : settings?.invoice_config?.logoUrl || settings?.logo_config?.desktopLogoUrl || settings?.logo_config?.mobileLogoUrl || '';
  const paperSize: 'mm58' | 'mm80' =
    paper || (settings?.invoice_config?.defaultSize === 'mm58' ? 'mm58' : 'mm80');

  const fmt = (value: number | string) =>
    `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError(false);
    fetch('/api/pos/products')
      .then((res) => res.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setProducts([]);
        setProductsError(true);
      })
      .finally(() => setProductsLoading(false));
  }, []);

  // Load products and categories for POS
  // Decode the counter sounds up front so the first scan beeps instantly
  useEffect(() => {
    void preloadPosSounds();
  }, []);

  useEffect(() => {
    loadProducts();

    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setCategories([]);
      });

    fetch('/api/pos/held-orders')
      .then((res) => res.json())
      .then((data) => setHeldOrders(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setHeldOrders([]);
      });

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setSettings(data && typeof data === 'object' ? data : {}))
      .catch(() => {});

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCashier(data?.user?.name || ''))
      .catch(() => {});
  }, [loadProducts]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Customer lookup for the picker
  const debouncedCustomerQuery = useDebounced(customerQuery, 250);
  useEffect(() => {
    if (!customerPickerOpen) return;
    let cancelled = false;
    setCustomerLoading(true);
    fetch(`/api/pos/customers?q=${encodeURIComponent(debouncedCustomerQuery)}`)
      .then((res) => res.json())
      .then((data) => !cancelled && setCustomerResults(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setCustomerResults([]))
      .finally(() => !cancelled && setCustomerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedCustomerQuery, customerPickerOpen]);

  // Filter products by category and query
  const filteredProducts = (products || []).filter((p) => {
    const matchesCat =
      selectedCategory === 'all' || String(p.categoryId) === String(selectedCategory);
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.genericName && p.genericName.toLowerCase().includes(q)) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q));
    return matchesCat && matchesQuery;
  });

  const debouncedSearch = useDebounced(searchQuery, 250);
  useEffect(() => {
    const term = debouncedSearch.trim();
    // v3.14 — a chosen category also asks the server, so a shop with more
    // products than the first page still sees all of that category's items
    if (term.length < 2 && selectedCategory === 'all') {
      setServerResults([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ limit: term.length >= 2 ? '60' : '3000' });
    if (term.length >= 2) params.set('q', term);
    if (selectedCategory !== 'all') params.set('categoryId', selectedCategory);
    fetch(`/api/pos/products?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => !cancelled && setServerResults(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setServerResults([]));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedCategory]);

  const visibleProducts = useMemo(() => {
    if ((!searchQuery.trim() && selectedCategory === 'all') || serverResults.length === 0) return filteredProducts;
    const seen = new Set(filteredProducts.map((p) => p.id));
    return [...filteredProducts, ...serverResults.filter((p) => !seen.has(p.id))];
  }, [filteredProducts, serverResults, searchQuery, selectedCategory]);

  const refuse = (message: string) => {
    posSounds.error();
    toasts.push(message, 'error');
  };

  /** Adds one unit of a line, respecting the stock the line carries */
  const addLine = (lineProduct: Product, key: string, unitPrice: number, variationId?: number) => {
    const current = cartRef.current;
    const existing = current.find((item) => lineKeyOf(item) === key);
    if (existing) {
      if (existing.quantity >= lineProduct.stock) {
        refuse(`Only ${lineProduct.stock} in stock — can't add more.`);
        return;
      }
      commitCart(
        current.map((item) =>
          lineKeyOf(item) === key ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      commitCart([
        ...current,
        { product: lineProduct, quantity: 1, unitPrice, discount: 0, lineKey: key, variationId },
      ]);
    }
    posSounds.add();
  };

  const openVariationPicker = (product: Product) => {
    setVariationFor(product);
    setVariations([]);
    setVariationsError(false);
    setVariationsLoading(true);
    fetch(`/api/products/${product.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => setVariations(Array.isArray(data?.variations) ? data.variations : []))
      .catch(() => setVariationsError(true))
      .finally(() => setVariationsLoading(false));
  };

  const addVariation = (product: Product, variation: Variation) => {
    if (variation.stock <= 0) {
      refuse(`"${variation.label}" is out of stock.`);
      return;
    }
    const unitPrice = Number(
      variation.salePrice ?? variation.price ?? (product.salePrice || product.price)
    );
    addLine(
      {
        ...product,
        name: `${product.name} — ${variation.label}`,
        stock: variation.stock,
        image: variation.image || product.image,
      },
      `${product.id}:v${variation.id}`,
      unitPrice,
      variation.id
    );
    setVariationFor(null);
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      refuse(`"${product.name}" is out of stock.`);
      return;
    }
    if ((product as any).hasVariations) {
      openVariationPicker(product);
      return;
    }
    addLine(product, String(product.id), Number(product.salePrice || product.price));
  };

  // Handle barcode / fast search enter key
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchQuery.trim();
    const term = raw.toLowerCase();
    if (!term || scanBusy) return;

    // A simple product already on screen with this exact barcode/SKU: no round trip
    const local = products.find((p) => p.barcode?.toLowerCase() === term || p.sku.toLowerCase() === term);
    if (local && !(local as any).hasVariations) {
      addToCart(local);
      setSearchQuery('');
      barcodeInputRef.current?.focus();
      return;
    }

    // Exact lookup on the server: a variation barcode adds that exact size/colour
    setScanBusy(true);
    try {
      const res = await fetch(`/api/pos/scan?code=${encodeURIComponent(raw)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.type === 'variation' && data.product && data.variation) {
          addVariation(data.product, data.variation);
          setSearchQuery('');
          return;
        }
        if (data?.type === 'product' && data.product) {
          addToCart(data.product);
          setSearchQuery('');
          return;
        }
      }
      // Not a code: take the first product matching the typed name
      const match = visibleProducts[0];
      if (match) {
        addToCart(match);
        setSearchQuery('');
      } else {
        refuse('No product matches this code or name.');
      }
    } catch {
      const match = local || visibleProducts[0];
      if (match) {
        addToCart(match);
        setSearchQuery('');
      } else {
        refuse('No product matches this code or name.');
      }
    } finally {
      setScanBusy(false);
      barcodeInputRef.current?.focus();
    }
  };

  const updateQuantity = (key: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(key);
      return;
    }
    const current = cartRef.current;
    const line = current.find((item) => lineKeyOf(item) === key);
    if (!line) return;
    if (qty > line.product.stock) {
      refuse(`Stock limit reached: only ${line.product.stock} available.`);
      return;
    }
    commitCart(current.map((item) => (lineKeyOf(item) === key ? { ...item, quantity: qty } : item)));
    posSounds.tick();
  };

  const removeFromCart = (key: string) => {
    commitCart(cartRef.current.filter((item) => lineKeyOf(item) !== key));
    posSounds.remove();
  };

  const clearCart = () => {
    commitCart([]);
    setDiscountAmount(0);
    setCashReceived('');
  };

  const handleClearClick = () => {
    if (cartRef.current.length === 0) return;
    clearCart();
    posSounds.clear();
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const taxAmount = (subtotal * taxPercent) / 100;
  const grandTotal = Math.max(0, subtotal - discountAmount + taxAmount);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const numCashReceived = Number(cashReceived) || grandTotal;
  const changeAmount = Math.max(0, numCashReceived - grandTotal);
  const shortBy = cashReceived && Number(cashReceived) < grandTotal ? grandTotal - Number(cashReceived) : 0;

  const quickCash = useMemo(() => {
    if (grandTotal <= 0) return [] as number[];
    const values = new Set<number>([Math.ceil(grandTotal)]);
    [100, 500, 1000].forEach((step) => values.add(Math.ceil(grandTotal / step) * step));
    return Array.from(values).sort((a, b) => a - b).slice(0, 4);
  }, [grandTotal]);

  // Hold Order
  const handleHoldOrder = async () => {
    const current = cartRef.current;
    if (current.length === 0) return;
    try {
      const res = await fetch('/api/pos/hold-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: selectedCustomer.name,
          items: current,
          note: `Held with ${current.length} items`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setHeldOrders((prev) => [
          ...prev,
          {
            id: data.holdId,
            customer: selectedCustomer.name,
            items: current,
            createdAt: new Date().toISOString(),
          },
        ]);
        clearCart();
        posSounds.hold();
        toasts.push('Sale put on hold.', 'info');
        setCartSheetOpen(false);
      }
    } catch (e) {
      console.error(e);
      refuse("Couldn't put the sale on hold.");
    }
  };

  // Recall Held Order
  const handleRecallOrder = (hold: any) => {
    commitCart(Array.isArray(hold.items) ? hold.items : []);
    setSelectedCustomer({ name: hold.customer, phone: WALK_IN.phone });
    // Remove from server
    fetch(`/api/pos/held-orders/${hold.id}`, { method: 'DELETE' });
    setHeldOrders((prev) => prev.filter((h) => h.id !== hold.id));
    setHeldOpen(false);
    posSounds.tick();
  };

  // Quick Add Customer
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;

    try {
      const res = await fetch('/api/pos/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCustName, phone: newCustPhone }),
      });
      const created = await res.json();
      setSelectedCustomer({ id: created.id, name: created.name, phone: created.phone });
      setIsCustomerModalOpen(false);
      setNewCustName('');
      setNewCustPhone('');
    } catch (err) {
      console.error(err);
    }
  };

  // Complete Sale & Print Receipt
  const handleCompleteSale = async () => {
    const current = cartRef.current;
    if (current.length === 0 || isProcessingSale) return;
    setIsProcessingSale(true);

    try {
      const res = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id || null,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          // The sale handler reads only the fields it knows, so variationId
          // rides along for the record without changing how the sale is booked.
          items: current.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            ...(i.variationId ? { variationId: i.variationId } : {}),
          })),
          discount: discountAmount,
          tax: taxAmount,
          cashReceived: numCashReceived,
          paymentMethod,
          cashierName: cashier || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sale failed');
      }

      setReceiptData({
        order: data.order,
        items: data.items,
        cashier: cashier || data.order?.cashierName || '',
        change: changeAmount,
      });

      // Update local product stocks instantly
      setProducts((prev) =>
        prev.map((p) => {
          const sold = current
            .filter((c) => c.product.id === p.id)
            .reduce((sum, c) => sum + c.quantity, 0);
          return sold ? { ...p, stock: p.stock - sold } : p;
        })
      );

      clearCart();
      setCartSheetOpen(false);
      posSounds.pay();
      afterSale(data.order, paymentMethod);
    } catch (err: any) {
      refuse(err.message || "Couldn't complete the sale.");
    } finally {
      setIsProcessingSale(false);
    }
  };

  const printReceipt = () => {
    window.print();
    posSounds.drawer();
  };

  /** Records a drawer opening (never blocks the till) */
  const logDrawer = (body: Record<string, any>) =>
    fetch('/api/pos/drawer-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: drawer.mode, ...body }),
    }).catch(() => undefined);

  /**
   * After a sale is saved: open the drawer and/or print the receipt, as set
   * up for this computer in Cash drawer → Setup.
   */
  const afterSale = (order: any, method: string) => {
    const printSoon = () => window.setTimeout(() => window.print(), 350);
    const opens = shouldAutoOpen(drawer, method);
    if (opens && drawer.mode === 'printer') {
      // The printer driver opens the drawer while it prints the receipt
      printSoon();
      posSounds.drawer();
      void logDrawer({ kind: 'sale', orderNumber: order?.orderNumber, amount: order?.total, method, ok: true });
      return;
    }
    if (opens) {
      void openDrawer(drawer).then((result) => {
        if (result.ok) posSounds.drawer();
        else toasts.push(`Drawer: ${result.message}`, 'error');
        void logDrawer({ kind: 'sale', orderNumber: order?.orderNumber, amount: order?.total, method, ok: result.ok, reason: result.ok ? '' : result.message });
      });
    }
    if (drawer.autoPrint) printSoon();
  };

  /** Manual open (F7 / Drawer button): straight away when no reason is asked */
  const quickOpenDrawer = () => {
    if (drawer.mode === 'off' || drawer.askReason) {
      setDrawerPanel(true);
      return;
    }
    void openDrawer(drawer, {
      interactive: true,
      print: () => printSlip(noSaleSlipHtml({ storeName, cashier, reason: '' }), paperSize),
    }).then((result) => {
      if (result.ok) posSounds.drawer();
      toasts.push(result.ok ? 'Drawer opened.' : result.message, result.ok ? 'success' : 'error');
      void logDrawer({ kind: 'manual', ok: result.ok, reason: '' });
    });
  };

  const choosePaper = (size: 'mm58' | 'mm80') => {
    setPaper(size);
    try {
      localStorage.setItem(PAPER_KEY, size);
    } catch {
      /* private mode — the choice just won't persist */
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) posSounds.tick();
  };

  // Keyboard shortcuts: F2 search, F4 hold, F7 cash drawer, F8 pay, F9 modules
  const shortcutActions = useRef({ hold: handleHoldOrder, pay: handleCompleteSale, drawer: quickOpenDrawer, blocked: false });
  // While the back-office modules cover the till, only F9 (to return) applies
  shortcutActions.current = { hold: handleHoldOrder, pay: handleCompleteSale, drawer: quickOpenDrawer, blocked: isModulesOpen };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F9') {
        event.preventDefault();
        setIsModulesOpen((open) => !open);
      } else if (shortcutActions.current.blocked) {
        return;
      } else if (event.key === 'F2') {
        event.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (event.key === 'F4') {
        event.preventDefault();
        shortcutActions.current.hold();
      } else if (event.key === 'F8') {
        event.preventDefault();
        shortcutActions.current.pay();
      } else if (event.key === 'F7') {
        event.preventDefault();
        shortcutActions.current.drawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isWalkIn = !selectedCustomer.id && selectedCustomer.name === WALK_IN.name;
  const customerLabel = isWalkIn ? 'Walk-in Customer' : selectedCustomer.name;

  /* ---------------------------------------------------------------------- */
  /* Cart panel — rendered in the side column on desktop and in the bottom   */
  /* sheet on phones. A render function, not a component, so its inputs keep */
  /* focus across re-renders.                                                */
  /* ---------------------------------------------------------------------- */
  const renderCart = () => (
    <div className="flex flex-col h-full min-h-0">
      {/* Customer */}
      <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--ds-border)' }}>
        <div
          className="flex items-center gap-3 p-2.5"
          style={{
            borderRadius: 'var(--ds-r-lg)',
            background: 'var(--ds-surface-2)',
            border: '1px solid var(--ds-border-soft)',
          }}
        >
          <span
            className="flex items-center justify-center shrink-0 font-bold"
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--ds-r-full)',
              background: tint(0.12),
              color: 'var(--primary-ink, var(--primary))',
              ...fs('md'),
            }}
          >
            {isWalkIn ? <UserRound className="w-4 h-4" /> : selectedCustomer.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate" style={fs('md')}>
              {customerLabel}
            </div>
            <div className="truncate ds-num" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
              {isWalkIn ? 'No customer selected' : selectedCustomer.phone}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isWalkIn && (
              <IconButton
                icon={X}
                label="Switch to Walk-in Customer"
                size="sm"
                tone="plain"
                onClick={() => setSelectedCustomer(WALK_IN)}
              />
            )}
            <IconButton
              icon={Users}
              label="Search Customers"
              size="sm"
              onClick={() => {
                setCustomerQuery('');
                setCustomerPickerOpen(true);
              }}
            />
            <IconButton
              icon={UserPlus}
              label="New Customer"
              size="sm"
              tone="primary"
              onClick={() => setIsCustomerModalOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <span
              className="flex items-center justify-center mb-3"
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--ds-r-xl)',
                background: 'var(--ds-surface-3)',
                color: 'var(--ds-text-faint)',
              }}
            >
              <Barcode className="w-6 h-6" />
            </span>
            <p className="font-semibold" style={fs('md')}>
              Cart is empty
            </p>
            <p style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>
              Scan a barcode or tap a product.
            </p>
          </div>
        ) : (
          <ul>
            {cart.map((item) => {
              const key = lineKeyOf(item);
              return (
                <li
                  key={key}
                  className="py-3 flex items-center gap-3 ds-fade-in"
                  style={{ borderBottom: '1px solid var(--ds-border-soft)' }}
                >
                  <span
                    className="relative shrink-0 overflow-hidden flex items-center justify-center"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--ds-r-md)',
                      background: 'var(--ds-surface-3)',
                      color: 'var(--ds-text-faint)',
                    }}
                  >
                    <Package className="w-4 h-4" />
                    {item.product.image && (
                      <img
                        src={item.product.image}
                        alt=""
                        loading="lazy"
                        onError={hideBrokenImage}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold ds-clamp-1" style={fs('base')}>
                      {item.product.name}
                    </div>
                    <div className="ds-num truncate" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
                      {fmt(item.unitPrice)} / {item.product.unit || 'unit'}
                      {item.product.batchNumber ? ` · Batch ${item.product.batchNumber}` : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div
                        className="inline-flex items-center overflow-hidden"
                        style={{ border: '1px solid var(--ds-border-strong)', borderRadius: 'var(--ds-r-md)' }}
                      >
                        <button
                          type="button"
                          aria-label="Decrease Quantity"
                          onClick={() => updateQuantity(key, item.quantity - 1)}
                          className="flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--ds-surface-3)]"
                          style={{ width: 'var(--ds-h-sm)', height: 'var(--ds-h-sm)', color: 'var(--ds-text-soft)' }}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span
                          className="ds-num font-bold text-center"
                          style={{ minWidth: 32, ...fs('md') }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase Quantity"
                          onClick={() => updateQuantity(key, item.quantity + 1)}
                          className="flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--ds-surface-3)]"
                          style={{ width: 'var(--ds-h-sm)', height: 'var(--ds-h-sm)', color: 'var(--ds-text-soft)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="ds-num font-bold" style={fs('md')}>
                      {fmt(item.unitPrice * item.quantity)}
                    </span>
                    <IconButton
                      icon={Trash2}
                      label="Remove"
                      size="sm"
                      tone="plain"
                      onClick={() => removeFromCart(key)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Checkout */}
      <div
        className="shrink-0 px-4 pt-3 pb-4 space-y-3"
        style={{ borderTop: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="ds-label" style={{ marginBottom: 4 }}>
              Discount ({currency})
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={discountAmount || ''}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              placeholder="0"
              className="ds-input ds-num"
              style={{ height: 'var(--ds-h-sm)' }}
            />
          </label>
          <label className="block">
            <span className="ds-label" style={{ marginBottom: 4 }}>
              VAT / Tax (%)
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={taxPercent || ''}
              onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
              placeholder="0"
              className="ds-input ds-num"
              style={{ height: 'var(--ds-h-sm)' }}
            />
          </label>
        </div>

        <div className="space-y-1" style={fs('base')}>
          <div className="flex justify-between" style={{ color: 'var(--ds-text-soft)' }}>
            <span>
              Subtotal · <span className="ds-num">{itemCount}</span> item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="ds-num">{fmt(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between" style={{ color: 'var(--ds-success-text)' }}>
              <span>Discount</span>
              <span className="ds-num">−{fmt(discountAmount)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between" style={{ color: 'var(--ds-text-soft)' }}>
              <span>
                VAT (<span className="ds-num">{taxPercent}</span>%)
              </span>
              <span className="ds-num">+{fmt(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-1">
            <span className="font-semibold" style={{ ...fs('md'), color: 'var(--ds-text-soft)' }}>
              Grand Total
            </span>
            <span
              className="ds-num font-bold"
              style={{ ...fs('3xl'), letterSpacing: 'var(--ds-tracking-tight)', lineHeight: 1.1 }}
            >
              {fmt(grandTotal)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Payment Method">
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPaymentMethod(m.id)}
                className="flex flex-col items-center justify-center gap-0.5 font-semibold cursor-pointer transition-all"
                style={{
                  height: 'var(--ds-h-lg)',
                  borderRadius: 'var(--ds-r-md)',
                  ...fs('xs'),
                  background: active ? tint(0.1) : 'var(--ds-surface)',
                  color: active ? 'var(--primary-ink, var(--primary))' : 'var(--ds-text-soft)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--ds-border)'}`,
                  boxShadow: active ? 'var(--ds-ring)' : 'none',
                }}
              >
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="ds-label" style={{ marginBottom: 4 }}>
              Cash Received
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder={String(Math.round(grandTotal * 100) / 100)}
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              className="ds-input ds-num font-bold"
            />
          </label>
          <div
            className="flex flex-col justify-center px-3"
            style={{
              borderRadius: 'var(--ds-r-md)',
              background: shortBy > 0 ? 'var(--ds-danger-soft)' : 'var(--ds-success-soft)',
              color: shortBy > 0 ? 'var(--ds-danger-text)' : 'var(--ds-success-text)',
              minHeight: 'var(--ds-h-md)',
              alignSelf: 'end',
              paddingTop: 4,
              paddingBottom: 4,
            }}
          >
            <span style={fs('2xs')} className="font-semibold">
              {shortBy > 0 ? 'Balance Due' : 'Change Due'}
            </span>
            <span className="ds-num font-bold" style={fs('lg')}>
              {fmt(shortBy > 0 ? shortBy : changeAmount)}
            </span>
          </div>
        </div>

        {quickCash.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto ds-scroll-hide">
            {quickCash.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCashReceived(String(value))}
                className="ds-btn ds-btn-secondary ds-btn-sm ds-num shrink-0"
              >
                {fmt(value)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            icon={PauseCircle}
            onClick={handleHoldOrder}
            disabled={cart.length === 0}
            className="flex-1"
            title="Hold (F4)"
          >
            Hold
          </Button>
          <IconButton
            icon={Trash2}
            label="Clear Cart"
            tone="danger"
            onClick={handleClearClick}
            disabled={cart.length === 0}
          />
        </div>

        <button
          type="button"
          onClick={handleCompleteSale}
          disabled={cart.length === 0 || isProcessingSale}
          className="ds-btn ds-btn-primary ds-btn-block"
          style={{ height: 52, borderRadius: 'var(--ds-r-lg)', ...fs('lg') }}
        >
          {isProcessingSale ? <span className="ds-spinner" style={{ borderTopColor: 'var(--primary-foreground)' }} /> : <Receipt className="w-5 h-5" />}
          <span>{isProcessingSale ? 'Processing...' : 'Charge'}</span>
          {!isProcessingSale && <span className="ds-num">{fmt(grandTotal)}</span>}
          <Kbd>F8</Kbd>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="admin-shell pos-root flex flex-col overflow-hidden"
      style={
        {
          height: '100dvh',
          background: 'var(--ds-bg)',
          color: 'var(--ds-text)',
          '--pos-topbar-h': '60px',
          '--pos-cart-w': '400px',
        } as React.CSSProperties
      }
    >
      {isModulesOpen && <PosModules onClose={() => setIsModulesOpen(false)} currency={currency} />}
      <CashDrawerPanel
        open={drawerPanel}
        onClose={() => {
          setDrawerPanel(false);
          barcodeInputRef.current?.focus();
        }}
        settings={drawer}
        onChange={updateDrawer}
        storeName={storeName}
        cashier={cashier}
        paper={paperSize}
        currency={currency}
      />

      {/* Top bar */}
      <header
        className="shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 no-print"
        style={{
          height: 'var(--pos-topbar-h)',
          background: 'var(--ds-surface)',
          borderBottom: '1px solid var(--ds-border)',
          boxShadow: 'var(--ds-shadow-xs)',
        }}
      >
        <IconButton
          icon={LayoutDashboard}
          label="Back to Dashboard"
          onClick={onOpenDashboard || onBackToStore}
        />

        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              onError={hideBrokenImage}
              className="hidden sm:block shrink-0 object-contain"
              style={{ height: 32, maxWidth: 120 }}
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold truncate" style={fs('lg')}>
                {storeName || 'POS'}
              </span>
              {storeName && <span className="ds-badge ds-badge-primary hidden sm:inline-flex">POS</span>}
            </div>
            <div
              className="hidden md:flex items-center gap-2 truncate"
              style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}
            >
              {cashier && (
                <>
                  <span className="truncate">Cashier: {cashier}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="ds-num whitespace-nowrap">
                {now.toLocaleDateString('en-GB')}{' '}
                {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setHeldOpen(true)}
            className="ds-btn ds-btn-secondary relative"
            style={{ padding: '0 10px' }}
            title="Held Sales"
            aria-label="Held Sales"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden lg:inline">Held</span>
            {heldOrders.length > 0 && (
              <span
                className="ds-num absolute -top-1.5 -right-1.5 flex items-center justify-center font-bold"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 'var(--ds-r-full)',
                  background: 'var(--ds-warning)',
                  color: 'var(--ds-text-invert)',
                  ...fs('2xs'),
                }}
              >
                {heldOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDrawerPanel(true)}
            className="ds-btn ds-btn-secondary"
            style={{ padding: '0 10px' }}
            title="Cash drawer (F7)"
            aria-label="Cash drawer"
          >
            <Vault className="w-4 h-4" />
            <span className="hidden lg:inline">Drawer</span>
            <Kbd>F7</Kbd>
          </button>

          <button
            type="button"
            onClick={() => setIsModulesOpen(true)}
            className="ds-btn ds-btn-soft"
            style={{ padding: '0 10px' }}
            title="Modules (F9)"
            aria-label="Modules"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden lg:inline">Modules</span>
            <Kbd>F9</Kbd>
          </button>

          <IconButton icon={Calculator} label="Calculator" onClick={() => setCalcOpen(true)} />
          <IconButton
            icon={soundOn ? Volume2 : VolumeX}
            label={soundOn ? 'Mute Sounds' : 'Unmute Sounds'}
            tone={soundOn ? 'default' : 'warning'}
            onClick={toggleSound}
          />
        </div>
      </header>

      {/* Workspace */}
      <div className="flex-1 min-h-0 flex">
        {/* Catalogue */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 space-y-3">
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <Barcode
                className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--primary-ink, var(--primary))' }}
              />
              <input
                ref={barcodeInputRef}
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Scan a barcode or search by name, generic or SKU"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ds-input"
                style={{
                  height: 'var(--ds-h-lg)',
                  paddingLeft: 44,
                  paddingRight: searchQuery ? 44 : 64,
                  ...fs('md'),
                  boxShadow: 'var(--ds-shadow-xs)',
                }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear Search"
                  onClick={() => {
                    setSearchQuery('');
                    barcodeInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                  style={{
                    width: 'var(--ds-h-sm)',
                    height: 'var(--ds-h-sm)',
                    borderRadius: 'var(--ds-r-sm)',
                    color: 'var(--ds-text-muted)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--ds-text-faint)' }}
                >
                  <Kbd>F2</Kbd>
                </span>
              )}
            </form>

            <div className="flex gap-2 overflow-x-auto ds-scroll-hide pb-1">
              {[{ id: 'all', name: 'All Products' }, ...categories.map((c) => ({ id: String(c.id), name: c.name }))].map(
                (cat) => {
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className="shrink-0 whitespace-nowrap font-semibold cursor-pointer transition-all"
                      style={{
                        height: 'var(--ds-h-sm)',
                        padding: '0 14px',
                        borderRadius: 'var(--ds-r-full)',
                        ...fs('sm'),
                        background: active ? 'var(--primary)' : 'var(--ds-surface)',
                        color: active ? 'var(--primary-foreground)' : 'var(--ds-text-soft)',
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--ds-border)'}`,
                      }}
                    >
                      {cat.name}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-1 pb-24 lg:pb-4">
            {productsLoading ? (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="ds-card-flat p-2.5 space-y-2">
                    <span className="ds-skeleton block w-full" style={{ aspectRatio: '4 / 3' }} />
                    <span className="ds-skeleton block h-3.5 w-4/5" />
                    <span className="ds-skeleton block h-3.5 w-2/5" />
                  </div>
                ))}
              </div>
            ) : productsError ? (
              <ErrorState message="Couldn't load products." onRetry={loadProducts} />
            ) : visibleProducts.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No products found"
                description={searchQuery ? 'Try a different name, generic or barcode.' : 'This category has no products.'}
              />
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
              >
                {visibleProducts.map((p) => {
                  const isOut = p.stock <= 0;
                  const isLow = !isOut && p.stock <= (p.lowStockThreshold || 10);
                  const inCart = cart
                    .filter((item) => item.product.id === p.id)
                    .reduce((sum, item) => sum + item.quantity, 0);
                  const hasVariations = Boolean((p as any).hasVariations);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      aria-disabled={isOut}
                      className={`group relative text-left flex flex-col overflow-hidden transition-all ${
                        isOut ? 'cursor-not-allowed' : 'cursor-pointer ds-card-hover'
                      }`}
                      style={{
                        background: 'var(--ds-surface)',
                        border: `1px solid ${inCart ? 'var(--primary)' : 'var(--ds-border)'}`,
                        borderRadius: 'var(--ds-r-lg)',
                        boxShadow: inCart ? 'var(--ds-ring)' : 'var(--ds-shadow-xs)',
                        opacity: isOut ? 0.55 : 1,
                        filter: isOut ? 'grayscale(1)' : undefined,
                      }}
                    >
                      <div
                        className="relative w-full flex items-center justify-center overflow-hidden"
                        style={{ aspectRatio: '4 / 3', background: 'var(--ds-surface-2)', color: 'var(--ds-text-faint)' }}
                      >
                        <Package className="w-7 h-7" />
                        {p.image && (
                          <img
                            src={p.image}
                            alt=""
                            loading="lazy"
                            onError={hideBrokenImage}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                        <span
                          className={`ds-badge ds-num absolute top-2 right-2 ${
                            isOut ? 'ds-badge-danger' : isLow ? 'ds-badge-warning' : 'ds-badge-success'
                          }`}
                          style={{ ...fs('2xs'), padding: '2px 7px' }}
                        >
                          {isOut ? 'Out of Stock' : `Stock ${p.stock}`}
                        </span>
                        {inCart > 0 && (
                          <span
                            className="ds-num absolute top-2 left-2 flex items-center justify-center font-bold"
                            style={{
                              minWidth: 22,
                              height: 22,
                              padding: '0 6px',
                              borderRadius: 'var(--ds-r-full)',
                              background: 'var(--primary)',
                              color: 'var(--primary-foreground)',
                              ...fs('xs'),
                            }}
                          >
                            {inCart}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col p-2.5 gap-0.5">
                        <span className="font-semibold ds-clamp-2" style={{ ...fs('base'), lineHeight: 1.3 }}>
                          {p.name}
                        </span>
                        {(p.genericName || p.dosage) && (
                          <span className="ds-clamp-1" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
                            {[p.genericName, p.dosage].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        <div className="mt-auto pt-1.5 flex items-end justify-between gap-1">
                          <span className="ds-num font-bold" style={{ ...fs('md'), color: 'var(--primary-ink, var(--primary))' }}>
                            {fmt(p.salePrice || p.price)}
                          </span>
                          {hasVariations ? (
                            <span
                              className="inline-flex items-center gap-1"
                              style={{ ...fs('2xs'), color: 'var(--ds-text-muted)' }}
                            >
                              <Layers className="w-3 h-3" />
                              Variations
                            </span>
                          ) : (
                            <span className="truncate" style={{ ...fs('2xs'), color: 'var(--ds-text-muted)' }}>
                              {p.unit || ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Cart column (desktop) */}
        <aside
          className="hidden lg:flex flex-col shrink-0 min-h-0"
          style={{
            width: 'var(--pos-cart-w)',
            background: 'var(--ds-surface)',
            borderLeft: '1px solid var(--ds-border)',
          }}
        >
          {renderCart()}
        </aside>
      </div>

      {/* Sticky cart bar (phones and tablets) */}
      <div
        className="lg:hidden fixed left-0 right-0 bottom-0 px-3 pb-3 pt-2 no-print"
        style={{
          zIndex: 'var(--ds-z-sticky)' as any,
          background: 'linear-gradient(to top, var(--ds-bg) 70%, transparent)',
        }}
      >
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="ds-btn ds-btn-primary ds-btn-block justify-between"
          style={{ height: 52, borderRadius: 'var(--ds-r-lg)', boxShadow: 'var(--ds-shadow-lg)', ...fs('md') }}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            <span>
              Cart (<span className="ds-num">{itemCount}</span>) · <span className="ds-num">{fmt(grandTotal)}</span>
            </span>
          </span>
          <ChevronUp className="w-5 h-5" />
        </button>
      </div>

      {/* Cart bottom sheet */}
      {cartSheetOpen && (
        <div className="lg:hidden fixed inset-0 flex flex-col justify-end" style={{ zIndex: 'var(--ds-z-overlay)' as any }}>
          <div
            className="absolute inset-0 ds-fade-in"
            style={{ background: 'var(--ds-overlay)' }}
            onClick={() => setCartSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cart"
            className="relative flex flex-col ds-slide-up"
            style={{
              height: '92dvh',
              background: 'var(--ds-surface)',
              borderTopLeftRadius: 'var(--ds-r-2xl)',
              borderTopRightRadius: 'var(--ds-r-2xl)',
              boxShadow: 'var(--ds-shadow-xl)',
            }}
          >
            <div className="shrink-0 flex items-center justify-between px-4 pt-2 pb-1">
              <span
                aria-hidden
                className="absolute left-1/2 -translate-x-1/2 top-2"
                style={{ width: 40, height: 4, borderRadius: 'var(--ds-r-full)', background: 'var(--ds-border-strong)' }}
              />
              <span className="font-bold pt-3" style={fs('lg')}>
                Cart · <span className="ds-num">{itemCount}</span> item{itemCount === 1 ? '' : 's'}
              </span>
              <IconButton icon={X} label="Close" tone="plain" onClick={() => setCartSheetOpen(false)} />
            </div>
            <div className="flex-1 min-h-0">{renderCart()}</div>
          </div>
        </div>
      )}

      <MiniCalculator open={calcOpen} onClose={() => setCalcOpen(false)} variant="centered" currency={currency} />

      {/* Variation picker */}
      <Modal
        open={Boolean(variationFor)}
        onClose={() => setVariationFor(null)}
        title="Choose Variation"
        subtitle={variationFor?.name}
        width="max-w-md"
      >
        {variationsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index} className="ds-skeleton block w-full" style={{ height: 56 }} />
            ))}
          </div>
        ) : variationsError ? (
          <ErrorState
            message="Couldn't load variations."
            onRetry={() => variationFor && openVariationPicker(variationFor)}
          />
        ) : variations.length === 0 ? (
          <EmptyState icon={Layers} title="No variations available" />
        ) : (
          <div className="space-y-2">
            {variations.map((v) => {
              const out = v.stock <= 0;
              const price = v.salePrice ?? v.price ?? Number(variationFor?.salePrice || variationFor?.price || 0);
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={out}
                  onClick={() => variationFor && addVariation(variationFor, v)}
                  className="w-full flex items-center gap-3 p-2.5 text-left transition-all cursor-pointer disabled:cursor-not-allowed ds-card-hover"
                  style={{
                    border: '1px solid var(--ds-border)',
                    borderRadius: 'var(--ds-r-lg)',
                    background: 'var(--ds-surface)',
                    opacity: out ? 0.5 : 1,
                  }}
                >
                  <span
                    className="relative shrink-0 overflow-hidden flex items-center justify-center"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--ds-r-md)',
                      background: 'var(--ds-surface-3)',
                      color: 'var(--ds-text-faint)',
                    }}
                  >
                    <Package className="w-4 h-4" />
                    {(v.image || variationFor?.image) && (
                      <img
                        src={v.image || variationFor?.image || ''}
                        alt=""
                        loading="lazy"
                        onError={hideBrokenImage}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate" style={fs('md')}>
                      {v.label}
                    </span>
                    <span
                      className={`ds-badge ds-num ${out ? 'ds-badge-danger' : v.stock <= 10 ? 'ds-badge-warning' : 'ds-badge-success'}`}
                      style={{ ...fs('2xs'), padding: '1px 7px' }}
                    >
                      {out ? 'Out of Stock' : `Stock ${v.stock}`}
                    </span>
                  </span>
                  <span className="ds-num font-bold shrink-0" style={{ ...fs('md'), color: 'var(--primary-ink, var(--primary))' }}>
                    {fmt(price)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Held orders */}
      <Modal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title="Held Sales"
        subtitle={heldOrders.length ? `${heldOrders.length} on hold` : undefined}
        width="max-w-md"
      >
        {heldOrders.length === 0 ? (
          <EmptyState icon={PauseCircle} title="No held sales" description="Sales you put on hold will appear here." />
        ) : (
          <div className="space-y-2">
            {[...heldOrders].reverse().map((hold) => {
              const items: PosCartItem[] = Array.isArray(hold.items) ? hold.items : [];
              const total = items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0);
              return (
                <div
                  key={hold.id}
                  className="flex items-center gap-3 p-3"
                  style={{ border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-r-lg)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={fs('md')}>
                      {hold.customer === WALK_IN.name ? 'Walk-in Customer' : hold.customer}
                    </div>
                    <div className="ds-num" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
                      {items.length} item{items.length === 1 ? '' : 's'} · {fmt(total)}
                      {hold.createdAt
                        ? ` · ${new Date(hold.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => handleRecallOrder(hold)}>
                    Recall
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Customer picker */}
      <Modal
        open={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        title="Select Customer"
        width="max-w-md"
        footer={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              setCustomerPickerOpen(false);
              setIsCustomerModalOpen(true);
            }}
          >
            New Customer
          </Button>
        }
      >
        <div className="space-y-3">
          <SearchInput
            value={customerQuery}
            onChange={setCustomerQuery}
            placeholder="Name or phone number"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setSelectedCustomer(WALK_IN);
              setCustomerPickerOpen(false);
            }}
            className="w-full flex items-center gap-3 p-2.5 text-left cursor-pointer transition-colors hover:bg-[var(--ds-surface-2)]"
            style={{ border: '1px dashed var(--ds-border-strong)', borderRadius: 'var(--ds-r-lg)' }}
          >
            <UserRound className="w-4 h-4" style={{ color: 'var(--ds-text-muted)' }} />
            <span className="font-semibold" style={fs('md')}>
              Walk-in Customer
            </span>
          </button>
          {customerLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <span key={index} className="ds-skeleton block w-full" style={{ height: 48 }} />
              ))}
            </div>
          ) : customerResults.length === 0 ? (
            <EmptyState icon={Users} title="No customers found" />
          ) : (
            <div className="space-y-1.5">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone });
                    setCustomerPickerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 text-left cursor-pointer transition-colors hover:bg-[var(--ds-surface-2)]"
                  style={{
                    border: `1px solid ${selectedCustomer.id === c.id ? 'var(--primary)' : 'var(--ds-border)'}`,
                    borderRadius: 'var(--ds-r-lg)',
                  }}
                >
                  <span
                    className="flex items-center justify-center shrink-0 font-bold"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--ds-r-full)',
                      background: tint(0.12),
                      color: 'var(--primary-ink, var(--primary))',
                      ...fs('sm'),
                    }}
                  >
                    {String(c.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate" style={fs('md')}>
                      {c.name}
                    </span>
                    <span className="block ds-num" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
                      {c.phone}
                    </span>
                  </span>
                  {selectedCustomer.id === c.id && (
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* New Customer Modal */}
      <Modal
        open={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="New Customer"
        width="max-w-sm"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <Field label="Customer Name" required>
            <input
              type="text"
              required
              autoFocus
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Full name"
              className="ds-input"
            />
          </Field>
          <Field label="Phone Number" required>
            <input
              type="tel"
              required
              inputMode="tel"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="Mobile number"
              className="ds-input ds-num"
            />
          </Field>
          <Button type="submit" variant="primary" block icon={UserPlus}>
            Save Customer
          </Button>
        </form>
      </Modal>

      {/* Thermal Printable Receipt Dialog (58mm / 80mm format) */}
      {/* Hand-built rather than the shared Modal: the print stylesheet pins
          #printable-receipt to the page corner, which only works while no
          ancestor between it and this fixed layer is positioned or transformed. */}
      {receiptData && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 ds-fade-in"
          style={{ zIndex: 'var(--ds-z-modal)' as any, background: 'var(--ds-overlay)' }}
          onClick={(event) => event.target === event.currentTarget && setReceiptData(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sale Complete"
            className="w-full max-w-md overflow-y-auto ds-fade-in"
            style={{
              maxHeight: '92dvh',
              background: 'var(--ds-surface)',
              borderRadius: 'var(--ds-r-xl)',
              boxShadow: 'var(--ds-shadow-xl)',
            }}
          >
          <div className="p-5 space-y-4">
            <div
              className="flex items-center gap-3 p-3"
              style={{
                borderRadius: 'var(--ds-r-lg)',
                background: 'var(--ds-success-soft)',
                color: 'var(--ds-success-text)',
              }}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={fs('md')}>
                  Payment received
                </div>
                <div className="ds-num" style={fs('sm')}>
                  Change Due: {fmt(receiptData.change)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>Paper Size</span>
              <div
                className="inline-flex p-0.5"
                style={{ background: 'var(--ds-surface-3)', borderRadius: 'var(--ds-r-md)' }}
              >
                {(['mm58', 'mm80'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => choosePaper(size)}
                    className="ds-num font-semibold cursor-pointer transition-all"
                    style={{
                      height: 28,
                      padding: '0 12px',
                      borderRadius: 'var(--ds-r-sm)',
                      ...fs('sm'),
                      background: paperSize === size ? 'var(--ds-surface)' : 'transparent',
                      color: paperSize === size ? 'var(--ds-text)' : 'var(--ds-text-muted)',
                      boxShadow: paperSize === size ? 'var(--ds-shadow-sm)' : 'none',
                    }}
                  >
                    {size === 'mm58' ? '58mm' : '80mm'}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="flex justify-center p-3"
              style={{ background: 'var(--ds-surface-3)', borderRadius: 'var(--ds-r-lg)' }}
            >
              <div
                id="printable-receipt"
                className="text-center space-y-2.5"
                style={{
                  width: paperSize === 'mm58' ? '58mm' : '80mm',
                  maxWidth: '100%',
                  background: 'var(--ds-surface)',
                  color: 'var(--ds-text)',
                  padding: 10,
                  fontFamily: 'var(--font-mono)',
                  ...fs(paperSize === 'mm58' ? '2xs' : 'xs'),
                  lineHeight: 1.45,
                }}
              >
                {(storeName || receiptLogo || settings?.invoice_config?.address || settings?.general?.address) && (
                  <div className="pb-2" style={{ borderBottom: '1px dashed currentColor' }}>
                    {receiptLogo && (
                      <img
                        src={receiptLogo}
                        alt=""
                        onError={hideBrokenImage}
                        style={{ display: 'block', margin: '0 auto 6px', maxHeight: 44, maxWidth: '72%', width: 'auto', height: 'auto', objectFit: 'contain' }}
                      />
                    )}
                    {storeName && (
                      <div className="font-bold uppercase" style={fs('md')}>
                        {storeName}
                      </div>
                    )}
                    {(settings?.invoice_config?.address || settings?.general?.address) && (
                      <div>{settings?.invoice_config?.address || settings?.general?.address}</div>
                    )}
                    {(settings?.invoice_config?.phone || settings?.general?.phone) && (
                      <div>{settings?.invoice_config?.phone || settings?.general?.phone}</div>
                    )}
                    {settings?.invoice_config?.drugLicense && <div>DL: {settings.invoice_config.drugLicense}</div>}
                    {settings?.invoice_config?.vatRegistration && (
                      <div>VAT: {settings.invoice_config.vatRegistration}</div>
                    )}
                  </div>
                )}

                <div className="text-left pb-2 space-y-0.5" style={{ borderBottom: '1px dashed currentColor' }}>
                  <div>
                    Receipt #: <strong>{receiptData.order.orderNumber}</strong>
                  </div>
                  <div>Date: {new Date(receiptData.order.createdAt).toLocaleString('en-GB')}</div>
                  <div>
                    Customer: {receiptData.order.customerName} ({receiptData.order.customerPhone})
                  </div>
                  {receiptData.cashier && <div>Cashier: {receiptData.cashier}</div>}
                </div>

                <div className="text-left pb-2" style={{ borderBottom: '1px dashed currentColor' }}>
                  <div className="grid grid-cols-12 font-bold pb-1 mb-1" style={{ borderBottom: '1px solid currentColor' }}>
                    <span className="col-span-6">ITEM</span>
                    <span className="col-span-2 text-center">QTY</span>
                    <span className="col-span-4 text-right">TOTAL</span>
                  </div>
                  {receiptData.items.map((it: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 py-0.5">
                      <span className="col-span-6 min-w-0">
                        <span className="block truncate">{it.productName}</span>
                        {it.variationLabel && <span className="block truncate" style={{ opacity: 0.75 }}>{it.variationLabel}</span>}
                      </span>
                      <span className="col-span-2 text-center">{it.quantity}</span>
                      <span className="col-span-4 text-right">
                        {currency}
                        {it.subtotal}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-right space-y-0.5">
                  <div>
                    Subtotal: {currency}
                    {receiptData.order.subtotal}
                  </div>
                  {Number(receiptData.order.discount) > 0 && (
                    <div>
                      Discount: -{currency}
                      {receiptData.order.discount}
                    </div>
                  )}
                  {Number(receiptData.order.tax) > 0 && (
                    <div>
                      VAT: +{currency}
                      {receiptData.order.tax}
                    </div>
                  )}
                  <div className="font-bold pt-1" style={{ ...fs('sm'), borderTop: '1px solid currentColor' }}>
                    Total Payable: {currency}
                    {receiptData.order.total}
                  </div>
                  <div>
                    Paid via {paymentMethodLabel(receiptData.order.paymentMethod, (settings as any)?.payment?.methods)}: {currency}
                    {receiptData.order.cashReceived || receiptData.order.total}
                  </div>
                  <div>
                    Change Returned: {currency}
                    {receiptData.change}
                  </div>
                </div>

                {(settings?.invoice_config?.footerNote || settings?.invoice_config?.termsNote) && (
                  <div className="pt-2" style={{ borderTop: '1px dashed currentColor' }}>
                    {settings?.invoice_config?.footerNote && <p>{settings.invoice_config.footerNote}</p>}
                    {settings?.invoice_config?.termsNote && <p>{settings.invoice_config.termsNote}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            className="px-5 py-4 flex items-center justify-end gap-2"
            style={{ borderTop: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)' }}
          >
            <Button onClick={() => setReceiptData(null)}>New Sale</Button>
            <Button variant="primary" icon={Printer} onClick={printReceipt}>
              Print Receipt
            </Button>
          </div>
          </div>
        </div>
      )}

      {toasts.node}
    </div>
  );
};
