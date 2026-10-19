import React from 'react';
import { Heart, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext.tsx';
import { Product } from '../../types/index.ts';
import { ProductCard } from './ProductCard.tsx';
import { StoreLink } from './Header.tsx';

interface WishlistViewProps {
  onSelectProduct: (product: Product) => void;
  onNavigate: (view: string, param?: any) => void;
}

export const WishlistView: React.FC<WishlistViewProps> = ({ onSelectProduct, onNavigate }) => {
  const { wishlist, setIsCartDrawerOpen } = useCart();

  return (
    <div className="max-w-(--ds-page-max) mx-auto px-(--ds-gutter) py-(--ds-s-6) sm:py-(--ds-s-8) space-y-(--ds-s-5)">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-(--ds-s-3) pb-(--ds-s-4) border-b border-(--ds-border)">
        <div className="flex items-center gap-(--ds-s-3) min-w-0">
          <span className="shrink-0 w-11 h-11 rounded-(--ds-r-md) bg-(--ds-rose-soft) text-(--ds-rose) flex items-center justify-center">
            <Heart className="w-5 h-5 fill-current" />
          </span>
          <div className="min-w-0">
            <h1 className="text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">My Wishlist</h1>
            <p className="text-(length:--ds-fs-base) text-(--ds-text-muted)">
              <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text-soft)">{wishlist.length}</span> saved {wishlist.length === 1 ? 'product' : 'products'}
            </p>
          </div>
        </div>
        {wishlist.length > 0 && (
          <StoreLink
            to={{ view: 'shop', params: {} }}
            onNavigate={onNavigate}
            className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--primary) hover:underline"
          >
            Continue Shopping
            <ArrowRight className="w-4 h-4" />
          </StoreLink>
        )}
      </header>

      {wishlist.length === 0 ? (
        <div className="ds-card-flat max-w-md mx-auto px-(--ds-s-6) py-(--ds-s-12) text-center">
          <div className="w-14 h-14 mx-auto mb-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-rose-soft) text-(--ds-rose) flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Your wishlist is empty</h3>
          <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">
            Tap the heart icon on any product to save it here for later.
          </p>
          <StoreLink
            to={{ view: 'shop', params: {} }}
            onNavigate={onNavigate}
            className="ds-btn ds-btn-primary mt-(--ds-s-5)"
          >
            Browse Products
          </StoreLink>
        </div>
      ) : (
        <div data-reveal-stagger className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) md:gap-(--ds-s-4)">
          {wishlist.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={onSelectProduct}
              onQuickBuy={() => {
                setIsCartDrawerOpen(false);
                onNavigate('checkout');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
