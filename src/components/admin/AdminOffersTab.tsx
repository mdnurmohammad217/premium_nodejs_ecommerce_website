import React, { useEffect, useMemo, useState } from 'react';
import { Save, Tag, Check, PackageSearch, X } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Field,
  Toggle,
  SearchInput,
  EmptyState,
  Badge,
  useToasts,
  tint,
} from './ui.tsx';
import { Product, SiteSettings, OffersConfig } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';

interface AdminOffersTabProps {
  /** v3.15 — optional: the tab now asks the server for products itself */
  products?: Product[];
  settings: SiteSettings;
  onSaveSettings: (newSettings: SiteSettings) => Promise<void>;
}

const DEFAULT_HEADING = "Today's Offers";
const DEFAULT_BADGE = 'Limited Time';

const swapPlaceholder = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = IMAGE_PLACEHOLDER;
};

/**
 * The homepage "Today's Offers" strip: its heading, badge, default discount and
 * the hand-picked products. Its "view all" link opens the shop's flash-sale
 * filter, so the same selection also backs the flash-sale listing.
 */
export const AdminOffersTab: React.FC<AdminOffersTabProps> = ({ products: givenProducts = [], settings, onSaveSettings }) => {
  const toasts = useToasts();
  /*
   * v3.15 — products come from the server: the newest published ones, the
   * ones already chosen, and whatever the search box finds — not the whole
   * catalogue (which does not work with 20 000+ products).
   */
  const [pool, setPool] = useState<Product[]>(givenProducts);
  const addToPool = (rows: Product[]) =>
    setPool((current) => {
      const byId = new Map(current.map((row) => [row.id, row]));
      rows.forEach((row) => byId.set(row.id, row));
      return Array.from(byId.values());
    });
  const products = pool;
  const currentOffers: OffersConfig = settings.offers_config || {
    isEnabled: true,
    heading: DEFAULT_HEADING,
    badgeText: DEFAULT_BADGE,
    selectedProductIds: [],
    customDiscountPercent: 15,
    viewAllLink: '/shop?flashSale=true',
  };

  const [isEnabled, setIsEnabled] = useState(currentOffers.isEnabled !== false);
  const [heading, setHeading] = useState(currentOffers.heading || DEFAULT_HEADING);
  const [badgeText, setBadgeText] = useState(currentOffers.badgeText || DEFAULT_BADGE);
  const [discountPercent, setDiscountPercent] = useState<number>(currentOffers.customDiscountPercent || 15);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    currentOffers.selectedProductIds && currentOffers.selectedProductIds.length > 0
      ? currentOffers.selectedProductIds
      : products.slice(0, 5).map((p) => p.id)
  );
  const [searchFilter, setSearchFilter] = useState('');
  useEffect(() => {
    const ids = selectedIds.slice(0, 500);
    if (ids.length) {
      fetch(`/api/admin/products?all=1&ids=${ids.join(',')}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((rows) => Array.isArray(rows) && addToPool(rows))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ all: '1', status: 'active', limit: '60' });
      if (searchFilter.trim()) params.set('search', searchFilter.trim());
      fetch(`/api/admin/products?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((rows) => !cancelled && Array.isArray(rows) && addToPool(rows))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchFilter]);
  const [onlySelected, setOnlySelected] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleProduct = (id: number) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedConfig: OffersConfig = {
        isEnabled,
        heading,
        badgeText,
        selectedProductIds: selectedIds,
        customDiscountPercent: discountPercent,
        viewAllLink: '/shop?flashSale=true',
      };
      await onSaveSettings({ ...settings, offers_config: updatedConfig });
      toasts.push("Today's Offers settings saved.");
    } catch (err) {
      console.error(err);
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = searchFilter.toLowerCase();
    return products.filter(
      (p) =>
        (!onlySelected || selectedIds.includes(p.id)) &&
        (p.name.toLowerCase().includes(q) || (p.genericName && p.genericName.toLowerCase().includes(q)))
    );
  }, [products, searchFilter, onlySelected, selectedIds]);

  const selectedProducts = useMemo(
    () => selectedIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[],
    [selectedIds, products]
  );

  return (
    <div>
      {toasts.node}
      <PageHeader
        title="Today's Offers"
        subtitle="Manage the products, discount and badge in the homepage offers section."
        icon={Tag}
        accent="var(--ds-amber)"
        actions={
          <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
        {/* ------------------------------------------------ configuration */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Section Settings" icon={Tag} accent="var(--ds-amber)" />
            <div className="space-y-4">
              <Toggle
                checked={isEnabled}
                onChange={setIsEnabled}
                label="Show on Homepage"
                description="Turn the section on or off."
              />
              <Field label="Section Heading">
                <input
                  className="a-field"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder={DEFAULT_HEADING}
                />
              </Field>
              <Field label="Offer Badge Text">
                <input
                  className="a-field"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder={DEFAULT_BADGE}
                />
              </Field>
              <Field label="Default Discount Percentage">
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    className="a-field ds-num"
                    style={{ paddingRight: 'var(--ds-s-8)' }}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 font-bold"
                    style={{ right: 'var(--ds-s-3)', color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-md)' }}
                  >
                    %
                  </span>
                </div>
              </Field>
            </div>
          </Card>

          {/* Live look of the strip heading */}
          <Card>
            <span className="a-label">Preview</span>
            <div
              style={{
                padding: 'var(--ds-s-3)',
                borderRadius: 'var(--ds-r-md)',
                background: isEnabled ? 'var(--ds-amber-soft)' : 'var(--ds-surface-3)',
                opacity: isEnabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold" style={{ fontSize: 'var(--ds-fs-lg)' }}>
                  {heading || DEFAULT_HEADING}
                </span>
                {badgeText && (
                  <span
                    className="font-bold"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--ds-r-full)',
                      background: 'var(--ds-danger)',
                      color: 'var(--primary-foreground)',
                      fontSize: 'var(--ds-fs-2xs)',
                    }}
                  >
                    {badgeText}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-3 overflow-hidden">
                {selectedProducts.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className="shrink-0 overflow-hidden"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 'var(--ds-r-sm)',
                      background: 'var(--ds-surface)',
                      border: '1px solid var(--ds-border)',
                    }}
                  >
                    <img
                      src={p.image || IMAGE_PLACEHOLDER}
                      alt={p.name}
                      loading="lazy"
                      onError={swapPlaceholder}
                      className="w-full h-full object-contain"
                    />
                  </span>
                ))}
                {selectedProducts.length > 4 && (
                  <span
                    className="shrink-0 inline-flex items-center justify-center font-bold ds-num"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 'var(--ds-r-sm)',
                      background: 'var(--ds-surface)',
                      border: '1px solid var(--ds-border)',
                      fontSize: 'var(--a-fs-sm)',
                      color: 'var(--a-text-muted)',
                    }}
                  >
                    +{selectedProducts.length - 4}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Desktop shows 5 products per row, so selecting 5, 10 or 15 works best.
            </p>
          </Card>
        </div>

        {/* ----------------------------------------------- product picker */}
        <Card className="min-w-0">
          <CardHeader
            title="Offer Products"
            subtitle="Click a product to add or remove it."
            icon={PackageSearch}
            actions={
              <Badge tone={{ bg: tint(0.12), fg: 'var(--primary)' }}>
                <span className="ds-num">{selectedIds.length}</span> selected
              </Badge>
            }
          />

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
            <SearchInput
              value={searchFilter}
              onChange={setSearchFilter}
              placeholder="Search by name..."
              className="flex-1"
            />
            <div className="flex items-center gap-2 shrink-0">
              <Toggle checked={onlySelected} onChange={setOnlySelected} label="Selected Only" />
              {selectedIds.length > 0 && (
                <Button size="sm" variant="ghost" icon={X} onClick={() => setSelectedIds([])}>
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={products.length === 0 ? 'No products' : 'No results found'}
              description={
                products.length === 0 ? 'Add products first, then add them to the offer.' : 'Try searching with a different name.'
              }
            />
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2 overflow-y-auto pr-1"
              style={{ maxHeight: 560 }}
            >
              {filteredProducts.map((product) => {
                const isSelected = selectedIds.includes(product.id);
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    aria-pressed={isSelected}
                    className="flex items-center gap-2.5 text-left cursor-pointer transition-all min-w-0"
                    style={{
                      padding: 'var(--ds-s-2) var(--ds-s-3)',
                      borderRadius: 'var(--ds-r-md)',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--a-border)'}`,
                      background: isSelected ? tint(0.06) : 'var(--a-surface)',
                    }}
                  >
                    <span
                      className="shrink-0 overflow-hidden"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--ds-r-sm)',
                        border: '1px solid var(--a-border)',
                        background: 'var(--a-surface-2)',
                      }}
                    >
                      <img
                        src={product.image || IMAGE_PLACEHOLDER}
                        alt={product.name}
                        loading="lazy"
                        onError={swapPlaceholder}
                        className="w-full h-full object-contain"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {product.name}
                      </span>
                      <span className="block truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {product.brandName ? `${product.brandName} • ` : ''}
                        <span className="ds-num">৳{product.salePrice || product.price}</span>
                      </span>
                    </span>
                    <span
                      className="shrink-0 inline-flex items-center justify-center"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 'var(--ds-r-xs)',
                        background: isSelected ? 'var(--primary)' : 'var(--a-surface)',
                        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                        color: 'var(--primary-foreground)',
                      }}
                    >
                      {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
