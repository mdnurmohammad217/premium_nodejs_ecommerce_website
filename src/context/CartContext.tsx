import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product, CartItem } from '../types/index.ts';
import { tracking } from '../lib/tracking.ts';
import { getCacheTier } from '../lib/dataCache.ts';

/**
 * A cart line. A product with variations gets one line per variation, and the
 * line's `product` carries that variation's price, stock, SKU and image, so the
 * subtotal and every stock check keep reading `product` as they always have.
 */
export interface CartLine extends CartItem {
  variationId?: number;
  variationLabel?: string;
}

/** The variation a shopper picked on the product page */
export interface CartVariation {
  id: number;
  label: string;
}

/** Identity of a cart line: the same product in two sizes is two lines */
export const cartLineKey = (productId: number, variationId?: number | null): string =>
  `${productId}:${variationId || ''}`;

const keyOf = (line: CartLine) => cartLineKey(line.product.id, line.variationId);

interface CartContextType {
  items: CartLine[];
  addToCart: (
    product: Product,
    quantity?: number,
    openDrawer?: boolean,
    variation?: CartVariation | null
  ) => void;
  updateQuantity: (productId: number, quantity: number, variationId?: number | null) => void;
  removeFromCart: (productId: number, variationId?: number | null) => void;
  clearCart: () => void;
  subtotal: number;
  totalItems: number;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  appliedCoupon: any | null;
  couponDiscount: number;
  applyCouponCode: (code: string) => Promise<{ success: boolean; message?: string }>;
  removeCoupon: () => void;
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: number) => boolean;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  subtotal: 0,
  totalItems: 0,
  isCartDrawerOpen: false,
  setIsCartDrawerOpen: () => {},
  appliedCoupon: null,
  couponDiscount: 0,
  applyCouponCode: async () => ({ success: false }),
  removeCoupon: () => {},
  wishlist: [],
  toggleWishlist: () => {},
  isInWishlist: () => false,
});

/**
 * The price a cart line is charged at. A sale price of "0.00" arrives as a
 * truthy string, so `salePrice || price` used to price such a line at zero.
 */
export const linePrice = (product: Product): number => {
  const sale = Number(product?.salePrice);
  return sale > 0 ? sale : Number(product?.price) || 0;
};

/**
 * Wholesale buyers get a cart of their own. Their lines carry wholesale prices
 * and wholesale products only, so the two can never mix, and signing out (or
 * in) brings back the cart that belongs to that kind of account.
 */
const cartKeyFor = (tier: string) => (tier === 'w' ? 'pharma_cart_wholesale' : 'pharma_cart');

const loadCart = (tier: string): CartLine[] => {
  try {
    const saved = localStorage.getItem(cartKeyFor(tier));
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((line) => line && line.product && line.quantity > 0) : [];
  } catch {
    return [];
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tier, setTier] = useState<string>(() => getCacheTier());
  const [items, setItems] = useState<CartLine[]>(() => loadCart(getCacheTier()));

  useEffect(() => {
    const onTierChanged = (event: Event) => {
      const next = String((event as CustomEvent).detail || '');
      setTier(next);
      setItems(loadCart(next));
      setAppliedCoupon(null);
      setCouponDiscount(0);
    };
    window.addEventListener('pharma:tier-changed', onTierChanged);
    return () => window.removeEventListener('pharma:tier-changed', onTierChanged);
  }, []);

  const [wishlist, setWishlist] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('pharma_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponDiscountRaw, setCouponDiscount] = useState<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem(cartKeyFor(tier), JSON.stringify(items));
    } catch (e) {
      console.error(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem('pharma_wishlist', JSON.stringify(wishlist));
    } catch (e) {
      console.error(e);
    }
  }, [wishlist]);

  const subtotal = items.reduce((sum, item) => sum + linePrice(item.product) * item.quantity, 0);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  // v3.11 — the coupon follows the cart: a percentage coupon is worked out on
  // the current total (it used to keep the amount from the moment it was
  // applied), never more than the products cost, and it is taken off when
  // the cart drops under the coupon's minimum order.
  const couponDiscount = (() => {
    if (!appliedCoupon) return 0;
    const value = Number(appliedCoupon.value);
    if (!Number.isFinite(value) || value <= 0) return couponDiscountRaw;
    let amount = appliedCoupon.type === 'percentage' ? (subtotal * value) / 100 : value;
    const cap = Number(appliedCoupon.maxDiscount);
    if (appliedCoupon.type === 'percentage' && cap > 0) amount = Math.min(amount, cap);
    return Math.round(Math.max(0, Math.min(amount, subtotal)) * 100) / 100;
  })();
  useEffect(() => {
    if (!appliedCoupon) return;
    const minOrder = Number(appliedCoupon.minOrder) || 0;
    if (items.length === 0 || (minOrder > 0 && subtotal < minOrder)) {
      setAppliedCoupon(null);
      setCouponDiscount(0);
    }
  }, [appliedCoupon, subtotal, items.length]);

  const addToCart = (
    product: Product,
    quantity = 1,
    openDrawer = true,
    variation?: CartVariation | null
  ) => {
    const key = cartLineKey(product.id, variation?.id);
    setItems((prev) => {
      const existingIndex = prev.findIndex((line) => keyOf(line) === key);
      if (existingIndex > -1) {
        return prev.map((line, index) =>
          index === existingIndex ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      const line: CartLine = variation
        ? { product, quantity, variationId: variation.id, variationLabel: variation.label }
        : { product, quantity };
      return [...prev, line];
    });
    tracking.addToCart(product, quantity, variation?.id);
    if (openDrawer) setIsCartDrawerOpen(true);
  };

  /**
   * Callers written before variations existed pass only a product id. That id
   * still addresses the plain line; if the product only exists as variation
   * lines, the first of them is used so those callers keep working.
   */
  const findLineKey = (lines: CartLine[], productId: number, variationId?: number | null) => {
    const exact = cartLineKey(productId, variationId);
    if (lines.some((line) => keyOf(line) === exact)) return exact;
    if (variationId == null) {
      const fallback = lines.find((line) => line.product.id === productId);
      if (fallback) return keyOf(fallback);
    }
    return exact;
  };

  const updateQuantity = (productId: number, quantity: number, variationId?: number | null) => {
    if (quantity <= 0) {
      removeFromCart(productId, variationId);
      return;
    }
    setItems((prev) => {
      const key = findLineKey(prev, productId, variationId);
      return prev.map((line) => (keyOf(line) === key ? { ...line, quantity } : line));
    });
  };

  const removeFromCart = (productId: number, variationId?: number | null) => {
    setItems((prev) => {
      const key = findLineKey(prev, productId, variationId);
      return prev.filter((line) => keyOf(line) !== key);
    });
  };

  const clearCart = () => {
    setItems([]);
    setAppliedCoupon(null);
    setCouponDiscount(0);
  };

  const applyCouponCode = async (code: string) => {
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setAppliedCoupon(data);
        setCouponDiscount(Number(data.discount));
        return { success: true, message: `Coupon ${data.code} applied! Saved ৳${data.discount}` };
      } else {
        return { success: false, message: data.error || 'Invalid coupon' };
      }
    } catch {
      return { success: false, message: 'Network error validating coupon' };
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
  };

  const toggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const isInWishlist = (productId: number) => wishlist.some((p) => p.id === productId);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        subtotal,
        totalItems,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        appliedCoupon,
        couponDiscount,
        applyCouponCode,
        removeCoupon,
        wishlist,
        toggleWishlist,
        isInWishlist,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
