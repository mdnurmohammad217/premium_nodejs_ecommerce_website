import React, { useEffect, useMemo, useRef, useState } from 'react';
import { markBootShopUsed, peekBootShop } from '../../lib/boot.ts';
import { getToken } from '../../lib/api.ts';
import { SlidersHorizontal, Search, X, PackageSearch, ChevronDown, ChevronRight, ChevronLeft, FlaskConical } from 'lucide-react';
import { cachedGet } from '../../lib/dataCache.ts';
import { StoreLink } from './Header.tsx';
import { Product, Category, Brand, SiteSettings } from '../../types/index.ts';
import { tracking } from '../../lib/tracking.ts';
import { ProductCard } from './ProductCard.tsx';
import { ProductCardSkeleton } from './CategorySection.tsx';

interface ShopViewProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  initialCategory?: string;
  initialFlashSale?: boolean;
  /** v3.12 — only the products marked New Arrival */
  initialNewArrival?: boolean;
  /** Search term from the URL (?search=) */
  initialSearch?: string;
  /** True while the catalogue is still loading, to show skeleton cards */
  isLoading?: boolean;
  onSelectProduct: (product: Product) => void;
  onClearFilter?: () => void;
  settings?: SiteSettings;
  onQuickBuy?: (product: Product) => void;
  /** /shop?brand=<slug> — every product of one brand */
  initialBrand?: string;
  /** /shop?generic=<name> — every product with one generic name */
  initialGeneric?: string;
  onNavigate?: (view: string, params?: any) => void;
}

interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

/** v3.11 — products per page (Dashboard → Website → Shop page can change it) */
const DEFAULT_PAGE_SIZE = 20;

interface BrowseResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  facets: { total?: number; categories: Record<string, number>; brands: Record<string, number>; price: { min: number; max: number } };
}

/** 1 … 4 5 [6] 7 8 … 20 */
const pageList = (page: number, pages: number): Array<number | '…'> => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('…');
  for (let n = from; n <= to; n += 1) out.push(n);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
};

const SORT_OPTIONS = [
  { value: 'popular', label: 'Newest First' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name', label: 'Name (A-Z)' },
];

const priceOf = (p: Product) => Number(p.salePrice || p.price) || 0;

/** The category list may arrive flat (with parentId) or already nested */
const flattenCategories = (list: Category[]): Category[] => {
  const out: Category[] = [];
  const walk = (items: Category[], parentId?: number | null) =>
    items.forEach((item) => {
      out.push({ ...item, parentId: item.parentId ?? parentId ?? null });
      if (Array.isArray(item.children) && item.children.length) walk(item.children, item.id);
    });
  walk(list);
  return out.filter((item, index) => out.findIndex((other) => other.id === item.id) === index);
};

export const ShopView: React.FC<ShopViewProps> = ({
  products: catalogProducts,
  categories,
  brands,
  initialCategory,
  initialFlashSale,
  initialNewArrival,
  initialSearch,
  isLoading,
  onSelectProduct,
  settings,
  onQuickBuy,
  initialBrand,
  initialGeneric,
  onNavigate,
}) => {
  /** A brand or generic page shows exactly that set of products */
  const scope = initialBrand ? { key: 'brand', value: initialBrand } : initialGeneric ? { key: 'generic', value: initialGeneric } : null;
  const scopeBrand = initialBrand
    ? brands.find((b) => b.slug === initialBrand || String(b.id) === initialBrand) || null
    : null;
  const pageSize = Math.min(60, Math.max(4, Number((settings as any)?.shop_config?.pageSize) || DEFAULT_PAGE_SIZE));

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [onlyRx, setOnlyRx] = useState<boolean | null>(null);
  const [onlyFlashSale, setOnlyFlashSale] = useState<boolean>(initialFlashSale || false);
  const [onlyNew, setOnlyNew] = useState<boolean>(initialNewArrival || false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [page, setPage] = useState(() => {
    try {
      return Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1);
    } catch {
      return 1;
    }
  });
  // v3.12 — opened directly: the first page came with the page itself (src/lib/boot.ts)
  const bootKey = useRef('');
  const [result, setResult] = useState<BrowseResult | null>(() => {
    const params = new URLSearchParams();
    params.set('pageSize', String(pageSize));
    if (scope) {
      params.set(scope.key, scope.value);
      if (scope.key === 'brand') params.set('scope', 'brand');
    }
    if (initialCategory) params.set('category', initialCategory);
    if (initialFlashSale) params.set('flashSale', '1');
    if (initialNewArrival) params.set('newArrival', '1');
    let firstPage = 1;
    try {
      firstPage = Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1);
    } catch {
      /* page 1 */
    }
    const key = `${params.toString()}&page=${firstPage}`;
    const data = initialSearch ? null : peekBootShop(key, Boolean(getToken()));
    if (data) bootKey.current = key;
    return data;
  });
  const [fetching, setFetching] = useState(() => !bootKey.current);
  const gridTopRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // The header search navigates here with ?search=; follow it when it changes
  useEffect(() => {
    setSearchQuery(initialSearch || '');
  }, [initialSearch]);

  // Price bounds come from the whole catalogue (server facets), so the range always covers it
  const priceBounds = useMemo(
    () => ({ min: result?.facets.price.min || 0, max: result?.facets.price.max || 0 }),
    [result?.facets.price.min, result?.facets.price.max]
  );

  const [minPrice, setMinPrice] = useState<number>(() => priceBounds.min);
  const [maxPrice, setMaxPrice] = useState<number>(() => priceBounds.max);
  const [priceTouched, setPriceTouched] = useState(false);

  // Keep the range in step with the catalog until the shopper moves it
  useEffect(() => {
    if (priceTouched) return;
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
  }, [priceBounds.min, priceBounds.max, priceTouched]);

  /* ---- Category tree ----------------------------------------------------- */
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const categoryTree = useMemo(() => {
    const byId = new Map<number, CategoryNode>();
    flatCategories.forEach((category) => byId.set(category.id, { category, children: [] }));
    const roots: CategoryNode[] = [];
    byId.forEach((node) => {
      const parent = node.category.parentId ? byId.get(node.category.parentId) : undefined;
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    });
    const sort = (nodes: CategoryNode[]) => {
      nodes.sort(
        (a, b) =>
          (a.category.sortOrder ?? 0) - (b.category.sortOrder ?? 0) ||
          a.category.name.localeCompare(b.category.name)
      );
      nodes.forEach((node) => sort(node.children));
    };
    sort(roots);
    return roots;
  }, [flatCategories]);

  /** A category and every category beneath it */
  const descendantIds = useMemo(() => {
    const map = new Map<number, Set<number>>();
    const collect = (node: CategoryNode): Set<number> => {
      const ids = new Set<number>([node.category.id]);
      node.children.forEach((child) => collect(child).forEach((id) => ids.add(id)));
      map.set(node.category.id, ids);
      return ids;
    };
    categoryTree.forEach(collect);
    return map;
  }, [categoryTree]);

  const activeCategory = useMemo(
    () =>
      selectedCategory === 'all'
        ? null
        : flatCategories.find((c) => c.slug === selectedCategory || String(c.id) === selectedCategory) || null,
    [selectedCategory, flatCategories]
  );

  // Open the branch that holds the selected category
  useEffect(() => {
    if (!activeCategory) return;
    const open: Record<number, boolean> = {};
    let parentId = activeCategory.parentId;
    let guard = 0;
    while (parentId && guard++ < 20) {
      open[parentId] = true;
      parentId = flatCategories.find((c) => c.id === parentId)?.parentId ?? null;
    }
    setExpanded((prev) => ({ ...prev, ...open }));
  }, [activeCategory?.id]);

  const categoryCounts = result?.facets.categories || {};
  const countFor = (categoryId: number) => {
    const ids = descendantIds.get(categoryId);
    let sum = 0;
    ids?.forEach((id) => (sum += categoryCounts[String(id)] || 0));
    return sum;
  };
  const catalogueTotal = Number(result?.facets.total) || 0;

  const brandOptions = useMemo(
    () =>
      // v3.10 — every brand is listed (with its product count), like the categories
      brands
        .map((brand) => ({ brand, count: result?.facets.brands[String(brand.id)] || 0 }))
        .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || String(a.brand.name).localeCompare(String(b.brand.name))),
    [brands, result?.facets.brands]
  );

  /* ---- Server query (filters, sort and one page) -------------------------- */
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const [debouncedPrice, setDebouncedPrice] = useState({ min: 0, max: 0 });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPrice(priceTouched ? { min: minPrice, max: maxPrice } : { min: 0, max: 0 }), 400);
    return () => window.clearTimeout(timer);
  }, [minPrice, maxPrice, priceTouched]);

  const filterKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('pageSize', String(pageSize));
    if (scope) {
      params.set(scope.key, scope.value);
      if (scope.key === 'brand') params.set('scope', 'brand');
    } else if (selectedBrand !== 'all') params.set('brand', selectedBrand);
    // The server takes a slug or an id, so the key does not change when the
    // category list arrives (that used to reset a reloaded ?page=3 to page 1)
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (onlyRx !== null) params.set('rx', onlyRx ? '1' : '0');
    if (onlyFlashSale) params.set('flashSale', '1');
    if (onlyNew) params.set('newArrival', '1');
    if (onlyInStock) params.set('inStock', '1');
    if (debouncedPrice.min > 0) params.set('minPrice', String(debouncedPrice.min));
    if (debouncedPrice.max > 0) params.set('maxPrice', String(debouncedPrice.max));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (sortBy !== 'popular') params.set('sort', sortBy);
    return params.toString();
  }, [pageSize, scope?.key, scope?.value, selectedBrand, selectedCategory, onlyRx, onlyFlashSale, onlyNew, onlyInStock, debouncedPrice.min, debouncedPrice.max, debouncedSearch, sortBy]);

  // A new filter starts from the first page again
  const lastFilterKey = useRef(filterKey);
  const resetPending = useRef(false);
  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      if (page !== 1) {
        resetPending.current = true;
        setPage(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    // The filter just changed and page 1 is on its way: skip the old page's request
    if (resetPending.current) {
      if (page !== 1) return;
      resetPending.current = false;
    }
    // The page's own copy of exactly this request is already on screen
    if (bootKey.current && bootKey.current === `${filterKey}&page=${page}`) {
      bootKey.current = '';
      markBootShopUsed();
      setFetching(false);
      return;
    }
    bootKey.current = '';
    markBootShopUsed();
    let cancelled = false;
    setFetching(true);
    const url = `/api/products/browse?${filterKey}&page=${page}`;
    const apply = (data: any) => {
      if (cancelled || !data || !Array.isArray(data.items)) return;
      setResult(data as BrowseResult);
      if (data.page && data.page !== page) setPage(data.page);
    };
    cachedGet(url, { onFresh: apply, ttl: 30_000 })
      .then(apply)
      .catch(() => {
        if (!cancelled) setResult((prev) => prev || { items: [], total: 0, page: 1, pageSize, pages: 1, facets: { categories: {}, brands: {}, price: { min: 0, max: 0 } } });
      })
      .finally(() => !cancelled && setFetching(false));
    return () => {
      cancelled = true;
    };
  }, [filterKey, page, pageSize]);

  // The page number lives in the address bar, so reload / back keep the place
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (page > 1) url.searchParams.set('page', String(page));
      else url.searchParams.delete('page');
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
    } catch {
      /* ignore */
    }
  }, [page]);

  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), result?.pages || 1);
    if (target === page) return;
    setPage(target);
    const top = gridTopRef.current ? gridTopRef.current.getBoundingClientRect().top + window.scrollY - 90 : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const pageItems: Product[] = result?.items || [];
  const totalCount = result?.total ?? 0;

  // Search and category-view analytics (debounced so typing is not a firehose)
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) return;
    const timer = window.setTimeout(() => tracking.search(term, totalCount), 700);
    return () => window.clearTimeout(timer);
  }, [searchQuery, totalCount]);

  useEffect(() => {
    if (activeCategory && result) tracking.viewCategory(activeCategory, pageItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, Boolean(result)]);

  // The drawer covers the page on phones; the page behind must not scroll
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const priceFiltered = priceTouched && (minPrice !== priceBounds.min || maxPrice !== priceBounds.max);
  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    (selectedBrand !== 'all' ? 1 : 0) +
    (onlyRx !== null ? 1 : 0) +
    (onlyFlashSale ? 1 : 0) +
    (onlyNew ? 1 : 0) +
    (onlyInStock ? 1 : 0) +
    (priceFiltered ? 1 : 0);

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedBrand('all');
    setOnlyRx(null);
    setOnlyFlashSale(false);
    setOnlyNew(false);
    setOnlyInStock(false);
    setSearchQuery('');
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    setPriceTouched(false);
    setSortBy('popular');
  };

  /* ---- Filter panel (sidebar on desktop, drawer on phones) --------------- */
  const sectionTitle = 'text-(length:--ds-fs-xs) font-(--ds-fw-bold) uppercase tracking-(--ds-tracking-wide) text-(--ds-text-muted)';

  const rowClass = (active: boolean) =>
    `flex-1 min-w-0 flex items-center justify-between gap-(--ds-s-2) h-(--ds-h-sm) px-(--ds-s-2) rounded-(--ds-r-sm) text-left text-(length:--ds-fs-base) transition-colors duration-(--ds-dur-fast) cursor-pointer ${
      active
        ? 'bg-(--primary) text-(--primary-foreground) font-(--ds-fw-semibold)'
        : 'text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--ds-text)'
    }`;

  const renderCategory = (node: CategoryNode, depth: number): React.ReactNode => {
    const { category } = node;
    const active = activeCategory?.id === category.id;
    const hasChildren = node.children.length > 0;
    const open = Boolean(expanded[category.id]);
    return (
      <li key={category.id}>
        <div className="flex items-center gap-(--ds-s-1)" style={{ paddingLeft: `calc(var(--ds-s-3) * ${depth})` }}>
          <button type="button" onClick={() => setSelectedCategory(category.slug)} className={rowClass(active)}>
            <span className="truncate">{category.name}</span>
            <span className="ds-num shrink-0 text-(length:--ds-fs-xs) opacity-90">{countFor(category.id)}</span>
          </button>
          {hasChildren && (
            <button
              type="button"
              aria-label={open ? 'Collapse' : 'Expand'}
              aria-expanded={open}
              onClick={() => setExpanded((prev) => ({ ...prev, [category.id]: !open }))}
              className="shrink-0 w-(--ds-h-sm) h-(--ds-h-sm) flex items-center justify-center rounded-(--ds-r-sm) text-(--ds-text-muted) hover:bg-(--ds-surface-3) cursor-pointer"
            >
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="rtl:rotate-180 w-4 h-4" />}
            </button>
          )}
        </div>
        {hasChildren && open && (
          <ul className="mt-0.5 space-y-0.5">{node.children.map((child) => renderCategory(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const toggleRow = (label: string, checked: boolean, onChange: (next: boolean) => void) => (
    <label className="flex items-center justify-between gap-(--ds-s-3) min-h-(--ds-h-sm) cursor-pointer text-(length:--ds-fs-base) text-(--ds-text)">
      <span>{label}</span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="w-9 h-5 rounded-(--ds-r-full) bg-(--ds-border-strong) peer-checked:bg-(--primary) peer-focus-visible:shadow-(--ds-ring) transition-colors duration-(--ds-dur-fast)" />
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-(--ds-r-full) bg-(--ds-surface) shadow-(--ds-shadow-sm) transition-transform duration-(--ds-dur-fast) peer-checked:translate-x-4" />
      </span>
    </label>
  );

  const filterPanel = (
    <div className="space-y-(--ds-s-6)">
      {/* Price first — it is the filter shoppers reach for most */}
      {priceBounds.max > 0 && (
        <section className="space-y-(--ds-s-3)">
          <h4 className={sectionTitle}>Price</h4>
          <div className="flex items-end gap-(--ds-s-2)">
            <label className="flex-1 min-w-0">
              <span className="block mb-(--ds-s-1) text-(length:--ds-fs-xs) text-(--ds-text-muted)">Min</span>
              <input
                type="number"
                inputMode="numeric"
                min={priceBounds.min}
                max={maxPrice}
                value={minPrice}
                onChange={(e) => {
                  setPriceTouched(true);
                  setMinPrice(Math.min(Number(e.target.value) || 0, maxPrice));
                }}
                className="ds-input ds-num h-(--ds-h-sm) px-(--ds-s-2) text-(length:--ds-fs-base)"
              />
            </label>
            <span className="pb-(--ds-s-2) text-(--ds-text-faint)">–</span>
            <label className="flex-1 min-w-0">
              <span className="block mb-(--ds-s-1) text-(length:--ds-fs-xs) text-(--ds-text-muted)">Max</span>
              <input
                type="number"
                inputMode="numeric"
                min={minPrice}
                max={priceBounds.max}
                value={maxPrice}
                onChange={(e) => {
                  setPriceTouched(true);
                  setMaxPrice(Math.max(Number(e.target.value) || 0, minPrice));
                }}
                className="ds-input ds-num h-(--ds-h-sm) px-(--ds-s-2) text-(length:--ds-fs-base)"
              />
            </label>
          </div>
          <input
            type="range"
            min={priceBounds.min}
            max={priceBounds.max}
            step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
            value={maxPrice}
            onChange={(e) => {
              setPriceTouched(true);
              setMaxPrice(Math.max(Number(e.target.value), minPrice));
            }}
            className="w-full cursor-pointer accent-(--primary)"
            aria-label="Maximum price"
          />
        </section>
      )}

      <section className="space-y-(--ds-s-2)">
        <h4 className={sectionTitle}>Category</h4>
        <ul className="space-y-0.5">
          <li className="flex">
            <button type="button" onClick={() => setSelectedCategory('all')} className={rowClass(!activeCategory)}>
              <span className="truncate">All Categories</span>
              <span className="ds-num shrink-0 text-(length:--ds-fs-xs) opacity-90">{catalogueTotal}</span>
            </button>
          </li>
          {categoryTree.map((node) => renderCategory(node, 0))}
        </ul>
      </section>

      {brandOptions.length > 0 && !initialBrand && (
        <section className="space-y-(--ds-s-2)">
          <h4 className={sectionTitle}>Brand</h4>
          <ul className="space-y-0.5 max-h-64 overflow-y-auto pr-(--ds-s-1)">
            <li className="flex">
              <button type="button" onClick={() => setSelectedBrand('all')} className={rowClass(selectedBrand === 'all')}>
                <span className="truncate">All Brands</span>
              </button>
            </li>
            {brandOptions.map(({ brand, count }) => (
              <li key={brand.id} className="flex">
                <button
                  type="button"
                  onClick={() => setSelectedBrand(brand.slug || String(brand.id))}
                  className={rowClass(selectedBrand === (brand.slug || String(brand.id)))}
                >
                  <span className="flex items-center gap-(--ds-s-2) min-w-0">
                    {brand.logo ? (
                      <img src={brand.logo} alt="" loading="lazy" className="w-5 h-5 shrink-0 object-contain rounded-[4px] bg-white" />
                    ) : null}
                    <span className="truncate">{brand.name}</span>
                  </span>
                  <span className="ds-num shrink-0 text-(length:--ds-fs-xs) opacity-90">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-(--ds-s-1) pt-(--ds-s-4) border-t border-(--ds-border-soft)">
        {toggleRow('In Stock Only', onlyInStock, setOnlyInStock)}
        {toggleRow('Flash Sale Only', onlyFlashSale, setOnlyFlashSale)}
        {toggleRow('New Arrivals Only', onlyNew, setOnlyNew)}
      </section>
    </div>
  );

  const showSkeleton = fetching && !result;

  /** Heading for a brand or generic page, with a way back to everything */
  const scopeBanner = scope ? (
    <div className="ds-card-flat flex items-center gap-(--ds-s-4) p-(--ds-s-4) sm:p-(--ds-s-5)">
      {initialBrand ? (
        <span className="shrink-0 w-24 h-14 sm:w-32 sm:h-16 rounded-(--ds-r-md) border border-(--ds-border) bg-(--ds-surface) flex items-center justify-center p-(--ds-s-2)">
          {scopeBrand?.logo ? (
            <img src={scopeBrand.logo} alt={scopeBrand.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-(length:--ds-fs-xl) font-(--ds-fw-black) text-(--ds-text-soft)">
              {(scopeBrand?.name || initialBrand).charAt(0).toUpperCase()}
            </span>
          )}
        </span>
      ) : (
        <span className="shrink-0 w-12 h-12 rounded-(--ds-r-lg) bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary) flex items-center justify-center">
          <FlaskConical className="w-6 h-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">
          {initialBrand ? 'Brand' : 'Generic name'}
        </p>
        <h1 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text) truncate">
          {initialBrand ? scopeBrand?.name || initialBrand : initialGeneric}
        </h1>
        {initialBrand && scopeBrand?.description && (
          <p className="mt-0.5 text-(length:--ds-fs-sm) text-(--ds-text-soft) ds-clamp-1">{scopeBrand.description}</p>
        )}
      </div>
      {onNavigate && (
        <StoreLink
          to={{ view: 'shop', params: {} }}
          onNavigate={onNavigate}
          className="shrink-0 ds-btn ds-btn-secondary ds-btn-sm"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">All products</span>
        </StoreLink>
      )}
    </div>
  ) : null;

  return (
    <div className="max-w-(--ds-page-max) mx-auto px-(--ds-gutter) py-(--ds-s-6) sm:py-(--ds-s-8)">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-(--ds-s-6) lg:gap-(--ds-s-8) items-start">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block sticky store-sticky ds-card-flat p-(--ds-card-pad-sm) max-h-[calc(100vh-var(--store-header-h,0px)-var(--ds-s-8))] overflow-y-auto">
          <div className="flex items-center justify-between mb-(--ds-s-5)">
            <h3 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">
              <SlidersHorizontal className="w-4 h-4 text-(--ds-text-muted)" />
              Filters
            </h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          {filterPanel}
        </aside>

        <main className="min-w-0 space-y-(--ds-s-4)">
          {scopeBanner}
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-(--ds-s-2) sm:gap-(--ds-s-3)">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 text-(--ds-text-faint) pointer-events-none" />
              <input
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ds-input h-(--ds-h-lg) pl-(--ds-s-10)"
                aria-label="Search products"
              />
            </div>
            <div className="flex items-center gap-(--ds-s-2)">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden ds-btn ds-btn-secondary h-(--ds-h-lg) flex-1 sm:flex-none"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ds-num inline-flex items-center justify-center min-w-5 h-5 px-(--ds-s-1) rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-2xs)">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="ds-select h-(--ds-h-lg) flex-1 sm:flex-none sm:w-52"
                aria-label="Sort by"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div ref={gridTopRef} className="flex flex-wrap items-center justify-between gap-(--ds-s-2) min-h-(--ds-h-sm)">
            <p className="text-(length:--ds-fs-base) text-(--ds-text-muted)">
              {showSkeleton ? (
                <span className="ds-skeleton inline-block w-28 h-4 align-middle" />
              ) : (
                <>
                  <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text)">{totalCount}</span>
                  {totalCount === 1 ? ' product' : ' products'}
                  {activeCategory && <> · {activeCategory.name}</>}
                  {searchQuery.trim() && <> · “{searchQuery.trim()}”</>}
                </>
              )}
            </p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-soft) hover:text-(--ds-text) cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Clear All Filters
              </button>
            )}
          </div>

          {showSkeleton ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) md:gap-(--ds-s-4)">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : totalCount === 0 && !fetching ? (
            <div className="ds-card-flat px-(--ds-s-6) py-(--ds-s-16) text-center">
              <div className="w-14 h-14 mx-auto mb-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-surface-3) text-(--ds-text-muted) flex items-center justify-center">
                <PackageSearch className="w-6 h-6" />
              </div>
              <h3 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">No products found</h3>
              <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">
                Try changing your filters or searching for something else.
              </p>
              {(activeFilterCount > 0 || searchQuery.trim()) && (
                <button type="button" onClick={resetFilters} className="ds-btn ds-btn-primary mt-(--ds-s-5)">
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) md:gap-(--ds-s-4) transition-opacity duration-(--ds-dur) ${
                  fetching ? 'opacity-60' : 'opacity-100'
                }`}
                aria-busy={fetching || undefined}
              >
                {pageItems.map((prod, index) => (
                  <ProductCard
                    key={prod.id}
                    product={prod}
                    priority={index < 2}
                    config={settings?.product_card_config}
                    onSelect={onSelectProduct}
                    onQuickBuy={onQuickBuy}
                  />
                ))}
              </div>

              {/* v3.11 — numbered pages: ‹ 1 2 3 … 10 › */}
              {result && result.pages > 1 && (
                <nav aria-label="Pages" className="flex flex-col items-center gap-(--ds-s-3) pt-(--ds-s-6)">
                  <div className="flex items-center gap-(--ds-s-1) sm:gap-(--ds-s-2) flex-wrap justify-center">
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                      aria-label="Prev — previous page"
                      className="shop-page-btn inline-flex items-center gap-1 px-(--ds-s-3)"
                    >
                      <ChevronLeft className="rtl:rotate-180 w-4 h-4" />
                      <span className="hidden sm:inline">Prev</span>
                    </button>
                    {pageList(page, result.pages).map((item, index) =>
                      item === '…' ? (
                        <span key={`gap-${index}`} className="w-8 text-center text-(--ds-text-faint) select-none">
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => goToPage(item)}
                          aria-current={item === page ? 'page' : undefined}
                          className={`shop-page-btn ds-num min-w-10 ${item === page ? 'is-current' : ''}`}
                        >
                          {item}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= result.pages}
                      aria-label="Next page"
                      className="shop-page-btn inline-flex items-center gap-1 px-(--ds-s-3)"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="rtl:rotate-180 w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                    Showing <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text)">{(page - 1) * result.pageSize + 1}</span>–
                    <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text)">{Math.min(page * result.pageSize, totalCount)}</span> of{' '}
                    <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text)">{totalCount}</span> products
                  </p>
                </nav>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-(--ds-z-modal)" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-(--ds-overlay) ds-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(88vw,360px)] flex flex-col bg-(--ds-surface) shadow-(--ds-shadow-xl) ds-slide-right">
            <div className="flex items-center justify-between h-14 px-(--ds-s-4) border-b border-(--ds-border)">
              <h3 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
                <SlidersHorizontal className="w-4 h-4 text-(--ds-text-muted)" />
                Filters
              </h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="w-(--ds-h-md) h-(--ds-h-md) flex items-center justify-center rounded-(--ds-r-md) text-(--ds-text-soft) hover:bg-(--ds-surface-3) cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-(--ds-s-4)">{filterPanel}</div>
            <div className="flex gap-(--ds-s-2) p-(--ds-s-4) border-t border-(--ds-border) pb-[calc(var(--ds-s-4)+env(safe-area-inset-bottom))]">
              <button type="button" onClick={resetFilters} className="ds-btn ds-btn-secondary h-(--ds-h-lg)">
                Reset
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="ds-btn ds-btn-primary h-(--ds-h-lg) flex-1"
              >
                Show <span className="ds-num">{totalCount}</span> {totalCount === 1 ? 'Product' : 'Products'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
