import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { indexProductQuietly } from '../../lib/imageIndexer.ts';
import {
  Package,
  PackageX,
  AlertTriangle,
  Wallet,
  Eye,
  Trash2,
  Edit2,
  Copy,
  Plus,
  RotateCcw,
  ChevronDown,
  Download,
  RefreshCw,
  Boxes,
  Star,
  StarOff,
  Image as ImageIcon,
  Search as SearchIcon,
  Settings2,
  Layers,
  Truck,
  ShieldCheck,
  BadgeDollarSign,
  Shapes,
  Info,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  Pill,
  Upload,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  StatusSelect,
  SearchInput,
  Select,
  Checkbox,
  BulkBar,
  BulkAction,
  SortableTh,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pagination,
  Drawer,
  ConfirmDialog,
  Field,
  Toggle,
  Thumb,
  Money,
  useSelection,
  useToasts,
  mix,
  ACCENTS,
  useDebounced,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { ProductTransferModal } from './ProductTransferModal.tsx';
import { ProductSeoFields } from './ProductSeoFields.tsx';
import { HIGHLIGHT_ICONS, parseHighlights, parseOptionDisplay, type ProductHighlight, type OptionDisplayMode } from '../../lib/highlightIcons.ts';
import {
  ProductVariationsEditor,
  VariationState,
  emptyVariationState,
  variationStateFromApi,
  variationPayload,
  firstInvalidStock,
  totalVariationStock,
} from './ProductVariationsEditor.tsx';
import { generateStoreBarcode } from '../../lib/barcode.ts';
import { printBarcodeLabels } from '../../lib/barcodeLabels.ts';
import {
  categoryTree,
  categoryPath,
  descendantIds,
  indentLabel,
  chargesToDraft,
  chargesToPayload,
  ProductFlags,
  StockPill,
  SummaryTile,
  FormPanel,
  Note,
  ProductVideoField,
  SizeGuidePicker,
  SizeGuidePreview,
  SizeGuideSummary,
  DeliveryChargesEditor,
} from './ProductsParts.tsx';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { videoEmbed } from '../../lib/landingTemplates.ts';
import type { ShippingZoneConfig } from '../../types/index.ts';

interface Props {
  categories: any[];
  brands: any[];
  currency?: string;
  onRefresh?: () => void;
  /** Open straight into the create form (sidebar → Add New Product) */
  startCreating?: boolean;
  /** Switch the dashboard to another tab (used for "Manage size guides") */
  onOpenTab?: (tab: string) => void;
  /** Delivery zones from System Configuration → Shipping (settings.shipping.zones) */
  shippingZones?: ShippingZoneConfig[];
}

type FormTab =
  | 'general'
  | 'pricing'
  | 'inventory'
  | 'gallery'
  | 'variations'
  | 'shipping'
  | 'seo'
  | 'advanced';

const FORM_TABS: Array<{ id: FormTab; label: string; icon: any; color: string }> = [
  { id: 'general', label: 'General', icon: Settings2, color: 'var(--primary-ink, var(--primary))' },
  { id: 'pricing', label: 'Pricing', icon: BadgeDollarSign, color: 'var(--ds-success)' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, color: 'var(--ds-amber)' },
  { id: 'gallery', label: 'Gallery', icon: ImageIcon, color: 'var(--ds-rose)' },
  { id: 'variations', label: 'Variations', icon: Shapes, color: 'var(--ds-violet)' },
  { id: 'shipping', label: 'Delivery', icon: Truck, color: 'var(--ds-teal)' },
  { id: 'seo', label: 'SEO', icon: SearchIcon, color: 'var(--ds-info)' },
  { id: 'advanced', label: 'Advanced', icon: ShieldCheck, color: 'var(--ds-gray-600)' },
];

/** Percentage with at most one decimal, or null when it cannot be computed */
const percent = (part: number, whole: number) =>
  whole > 0 && Number.isFinite(part) ? Math.round((part / whole) * 1000) / 10 : null;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

/** Colour of the thin strip on each row/card, by publish status */
const STATUS_STRIP: Record<string, string> = {
  active: 'var(--ds-success)',
  draft: 'var(--ds-warning)',
  archived: 'var(--ds-gray-400)',
};

const emptyProduct = () => ({
  id: null as number | null,
  name: '',
  genericName: '',
  slug: '',
  sku: '',
  barcode: '',
  categoryId: '',
  brandId: '',
  shortDescription: '',
  description: '',
  price: '',
  salePrice: '',
  costPrice: '',
  stock: 0,
  lowStockThreshold: 10,
  unit: 'Strip',
  dosage: '',
  requiresPrescription: false,
  batchNumber: '',
  expiryDate: '',
  featured: false,
  isFlashSale: false,
  isBestSeller: false,
  isNewArrival: false,
  wholesaleEnabled: false,
  wholesalePrice: '' as string | number | null,
  wholesaleMinQty: '' as string | number | null,
  wholesaleMaxQty: '' as string | number | null,
  image: '',
  images: [] as string[],
  status: 'active',
  manageStock: true,
  attributes: [] as Array<{ attributeId: number; value: string[] }>,
  /** YouTube / Shorts / Facebook video or reel / mp4 link */
  videoUrl: '',
  /** Size chart shown on the product page */
  sizeGuideId: null as number | null,
  /** This product always ships free */
  freeShipping: false,
  /** Own delivery charge per zone id, as typed (blank = the zone's normal charge) */
  shippingCharges: {} as Record<string, string>,
  /** v3.9 — how each option group shows on the product page: text, picture or colour */
  optionDisplay: {} as Record<string, OptionDisplayMode>,
  /** v3.9 — icon + text highlights beside the description */
  highlights: [] as ProductHighlight[],
  /** v3.9 — the "How to use" tab */
  howToUse: '',
  /** v3.15 — SEO tab: Google title / description, share picture, tags */
  seoTitle: '',
  seoDescription: '',
  seoImage: '',
  tags: '',
});

const isLow = (row: any) => row.stock > 0 && row.stock <= (row.lowStockThreshold ?? 10);

/** Unit value a stock figure is worth — cost price where known, sell price otherwise */
const unitValue = (row: any) => Number(row.costPrice) || Number(row.salePrice || row.price) || 0;

type SortField = 'newest' | 'oldest' | 'name' | 'price' | 'stock';

/**
 * A select sized and tinted like BulkAction, for the choices that belong to a
 * bulk operation. `placeholder` turns it into a fire-and-reset picker: choosing
 * an entry runs the action and the control falls back to its label.
 */
const BarSelect: React.FC<{
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, label, options, onChange, placeholder, disabled }) => (
  <span className="relative inline-flex shrink-0">
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="appearance-none font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        height: 32,
        padding: '0 26px 0 10px',
        border: 'none',
        borderRadius: 'var(--ds-r-sm)',
        background: 'color-mix(in srgb, var(--ds-text-invert) 12%, transparent)',
        color: 'var(--ds-text-invert)',
        fontSize: 'var(--a-fs-md)',
      }}
    >
      {placeholder !== undefined && (
        <option value="" style={{ color: 'var(--ds-text)', background: 'var(--ds-surface)' }}>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          style={{ color: 'var(--ds-text)', background: 'var(--ds-surface)' }}
        >
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--ds-text-invert)' }}
    />
  </span>
);

/**
 * Products — the catalogue: what is published, what is running out and what it
 * is all worth, with the full product form in a right-hand slide-over.
 *
 * The whole catalogue is loaded once and filtered, sorted and paged in the
 * browser, so switching a filter is instant; only saving goes back to the API.
 * Wide screens get a table; phones and tablets get a card per product.
 */
export const AdminProductsPage: React.FC<Props> = ({
  categories,
  brands,
  currency = '৳',
  onRefresh,
  startCreating,
  onOpenTab,
  shippingZones,
}) => {
  const toasts = useToasts();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  /** 'all' | 'active' | 'draft' | 'archived' | 'unpublished' (draft + archived) */
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [brand, setBrand] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  /** Extra "show only" filter: free delivery, video, variations, prescription, featured */
  const [flagFilter, setFlagFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  // 20 rows per page (the owner's preference); 10/50/100 remain in the picker
  const [pageSize, setPageSize] = useState(20);
  // Newest upload first, so a product you just added is at the top of page 1
  // (this used to sort by name, which buried new products mid-list).
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({
    field: 'newest',
    dir: 'desc',
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Generic Names list (Products → Generic Names), offered as suggestions on the form */
  const [genericOptions, setGenericOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!drawerOpen) return;
    fetch('/api/generics')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setGenericOptions(Array.isArray(list) ? list.map((item: any) => String(item.name)) : []))
      .catch(() => setGenericOptions([]));
  }, [drawerOpen]);
  const [formTab, setFormTab] = useState<FormTab>('general');
  const [draft, setDraft] = useState(emptyProduct());
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  /** The form as it was opened, to tell whether leaving it would lose changes */
  const draftBaseline = useRef('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [attributeList, setAttributeList] = useState<any[]>([]);

  // Variations live beside the draft rather than inside it, so the product
  // payload keeps exactly the keys the products endpoint has always received.
  const [variations, setVariations] = useState<VariationState>(emptyVariationState());
  const [variationsDirty, setVariationsDirty] = useState(false);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variationsError, setVariationsError] = useState('');

  /* Size guides — loaded the first time the form opens */
  const [sizeGuides, setSizeGuides] = useState<SizeGuideSummary[]>([]);
  const [sizeGuidesState, setSizeGuidesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const loadSizeGuides = useCallback(async () => {
    setSizeGuidesState('loading');
    try {
      const res = await fetch('/api/admin/size-guides');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) throw new Error();
      setSizeGuides(data);
      setSizeGuidesState('ready');
    } catch {
      setSizeGuidesState('error');
    }
  }, []);
  useEffect(() => {
    if (drawerOpen && sizeGuidesState === 'idle') loadSizeGuides();
  }, [drawerOpen, sizeGuidesState, loadSizeGuides]);

  /* Delivery zones — from the shell when it passes them, otherwise read once from the public settings */
  const [fetchedZones, setFetchedZones] = useState<ShippingZoneConfig[] | null>(null);
  useEffect(() => {
    if (shippingZones !== undefined || !drawerOpen || fetchedZones !== null) return;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFetchedZones(Array.isArray(data?.shipping?.zones) ? data.shipping.zones : []))
      .catch(() => setFetchedZones([]));
  }, [shippingZones, drawerOpen, fetchedZones]);
  const enabledZones = useMemo(() => {
    const list = shippingZones ?? fetchedZones;
    return list ? list.filter((zone) => zone && zone.id && zone.enabled !== false) : null;
  }, [shippingZones, fetchedZones]);

  /*
   * v3.15 — one page at a time from the server (filters, sorting and the
   * summary numbers are worked out in the database), so the page stays fast
   * with 20 000–50 000 products.
   */
  const debouncedSearch = useDebounced(search, 300);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ all: 0, active: 0, draft: 0, archived: 0, unpublished: 0, out: 0, low: 0, value: 0 });
  const requestNo = useRef(0);
  const load = useCallback(async () => {
    const mine = ++requestNo.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
        stock: stockFilter,
        flag: flagFilter,
        sort: sort.field,
        dir: sort.dir,
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (category !== 'all') params.set('category', category);
      if (brand !== 'all') params.set('brand', brand);
      const res = await fetch(`/api/admin/products/list?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.rows)) throw new Error();
      if (mine !== requestNo.current) return; // a newer request is on its way
      setRows(data.rows);
      setTotal(Number(data.total) || 0);
      if (data.summary) setSummary(data.summary);
      if (Number(data.page) && Number(data.page) !== page) setPage(Number(data.page));
    } catch {
      if (mine === requestNo.current) setError('Could not load products.');
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
  }, [page, pageSize, status, stockFilter, flagFilter, sort.field, sort.dir, debouncedSearch, category, brand]);

  useEffect(() => {
    load();
  }, [load]);

  // A new search starts from page 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetch('/api/admin/attributes')
      .then((res) => res.json())
      .then((data) => setAttributeList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadVariations = useCallback(async (productId: number) => {
    setVariationsLoading(true);
    setVariationsError('');
    try {
      const res = await fetch(`/api/admin/products/${productId}/variations`);
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'failed');
      setVariations(variationStateFromApi(data));
      setVariationsDirty(false);
    } catch (error: any) {
      setVariations(emptyVariationState());
      setVariationsError(error.message && error.message !== 'failed' ? error.message : 'Could not load variations.');
    } finally {
      setVariationsLoading(false);
    }
  }, []);

  const resetVariations = () => {
    setVariations(emptyVariationState());
    setVariationsDirty(false);
    setVariationsError('');
    setVariationsLoading(false);
  };

  const editVariations = (next: VariationState) => {
    setVariations(next);
    setVariationsDirty(true);
  };

  const openCreate = () => {
    const fresh = emptyProduct();
    draftBaseline.current = JSON.stringify(fresh);
    setDraft(fresh);
    resetVariations();
    setFormTab('general');
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (startCreating) openCreate();
  }, [startCreating]);

  /* ---------------------------------------------------------------------- */
  /* Categories                                                              */
  /* ---------------------------------------------------------------------- */

  const categoryById = useMemo(() => new Map(categories.map((item) => [String(item.id), item])), [categories]);
  const categoryOptions = useMemo(
    () =>
      categoryTree(categories).map(({ item, depth }) => ({
        value: String(item.id),
        label: indentLabel(String(item.name), depth),
      })),
    [categories]
  );
  /** The chosen category and everything under it — a main category shows its subs' products too */
  const categoryScope = useMemo(
    () => (category === 'all' ? null : descendantIds(categories, category)),
    [categories, category]
  );
  const pathOf = useCallback((id: any) => categoryPath(categoryById, id), [categoryById]);

  /* ---------------------------------------------------------------------- */
  /* Filtering, sorting, paging                                              */
  /* ---------------------------------------------------------------------- */

  // The server already filtered, sorted and paged (v3.15)
  const paged = rows;

  const selection = useSelection(paged);
  // v3.9 — Import / Export window
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null);

  // summary: from the server with each page (whole catalogue)

  const categoryName = (id: any) => categories.find((item) => item.id === id)?.name || '';

  const toggleSort = (field: string) =>
    setSort((current) =>
      current.field === field
        ? { field: current.field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { field: field as SortField, dir: 'asc' }
    );

  const resetFilters = () => {
    setSearch('');
    setStatus('all');
    setCategory('all');
    setBrand('all');
    setStockFilter('all');
    setFlagFilter('all');
    setPage(1);
  };

  const panelFilterCount =
    Number(status !== 'all') +
    Number(category !== 'all') +
    Number(brand !== 'all') +
    Number(stockFilter !== 'all') +
    Number(flagFilter !== 'all');
  const filtersActive = Boolean(search) || panelFilterCount > 0;

  /** Summary tiles toggle their filter: a second tap goes back to everything */
  const tileStatus = (next: string) => {
    setStatus((current) => (current === next ? 'all' : next));
    setPage(1);
  };
  const tileStock = (next: string) => {
    setStockFilter((current) => (current === next ? 'all' : next));
    setPage(1);
  };

  /* ---------------------------------------------------------------------- */
  /* Add / edit                                                             */
  /* ---------------------------------------------------------------------- */

  /** v3.14 — the list rows leave out the long texts; read the whole product */
  const fullProduct = async (product: any) => {
    const res = await fetch(`/api/admin/products/${product.id}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error) throw new Error(data?.error || 'Could not load the product.');
    return data;
  };

  const openEdit = async (listRow: any) => {
    let product: any;
    try {
      product = await fullProduct(listRow);
    } catch (error: any) {
      toasts.push(error.message || 'Could not load the product.', 'error');
      return;
    }
    resetVariations();
    loadVariations(product.id);
    const productAttributes: Array<{ attributeId: number; value: string[] }> = [];

    let gallery: string[] = [];
    try {
      gallery = product.images
        ? typeof product.images === 'string'
          ? JSON.parse(product.images)
          : product.images
        : [];
    } catch {
      gallery = [];
    }

    const loaded = {
      ...emptyProduct(),
      ...product,
      categoryId: product.categoryId ? String(product.categoryId) : '',
      brandId: product.brandId ? String(product.brandId) : '',
      wholesaleEnabled: Boolean(product.wholesaleEnabled),
      wholesalePrice: product.wholesalePrice ?? '',
      wholesaleMinQty: product.wholesaleMinQty ?? '',
      wholesaleMaxQty: product.wholesaleMaxQty ?? '',
      images: Array.isArray(gallery) ? gallery : [],
      attributes: productAttributes,
      videoUrl: product.videoUrl ? String(product.videoUrl) : '',
      sizeGuideId: product.sizeGuideId ? Number(product.sizeGuideId) : null,
      freeShipping: Boolean(product.freeShipping),
      shippingCharges: chargesToDraft(product.shippingCharges),
      optionDisplay: parseOptionDisplay(product.optionDisplay),
      highlights: parseHighlights(product.highlights),
      howToUse: product.howToUse ? String(product.howToUse) : '',
      seoTitle: product.seoTitle || '',
      seoDescription: product.seoDescription || '',
      seoImage: product.seoImage || '',
      tags: product.tags || '',
    };
    draftBaseline.current = JSON.stringify(loaded);
    setDraft(loaded);
    setFormTab('general');
    setDrawerOpen(true);
  };

  const save = async (publish: boolean) => {
    if (!draft.name.trim()) {
      setFormTab('general');
      toasts.push('Enter a product name.', 'error');
      return;
    }
    if (!draft.price && draft.price !== 0) {
      setFormTab('pricing');
      toasts.push('Enter a regular price.', 'error');
      return;
    }
    // Options priced one by one need no separate product price: the lowest
    // option price becomes the product's wholesale ("from") price.
    const optionWholesale = variations.rows
      .map((row) => Number(row.wholesalePrice))
      .filter((value) => Number.isFinite(value) && value > 0);
    const wholesalePrice =
      draft.wholesaleEnabled && !(Number(draft.wholesalePrice) > 0) && optionWholesale.length > 0
        ? Math.min(...optionWholesale)
        : draft.wholesalePrice;
    if (draft.wholesaleEnabled && !(Number(wholesalePrice) > 0)) {
      setFormTab('pricing');
      toasts.push(
        variations.rows.length > 0
          ? 'Enter a wholesale price (or one for each variation in the Variations tab), or switch wholesale off.'
          : 'Enter a wholesale price, or switch wholesale off.',
        'error'
      );
      return;
    }
    const badWholesale = variations.rows.findIndex(
      (row) => row.wholesalePrice.trim() !== '' && (!Number.isFinite(Number(row.wholesalePrice)) || Number(row.wholesalePrice) < 0)
    );
    if (badWholesale >= 0) {
      setFormTab('variations');
      toasts.push(`Enter a valid wholesale price for variation ${badWholesale + 1}, or leave it blank.`, 'error');
      return;
    }
    if (
      Number(draft.wholesaleMinQty) > 0 &&
      Number(draft.wholesaleMaxQty) > 0 &&
      Number(draft.wholesaleMaxQty) < Number(draft.wholesaleMinQty)
    ) {
      setFormTab('pricing');
      toasts.push('Maximum wholesale quantity cannot be less than the minimum.', 'error');
      return;
    }
    const video = String(draft.videoUrl || '').trim();
    if (video && !videoEmbed(video)) {
      setFormTab('gallery');
      toasts.push('The product video link is not recognised. Use a YouTube, Facebook or .mp4 link, or remove it.', 'error');
      return;
    }
    // Validated before anything is written, so a bad stock cell never leaves a
    // half-saved product behind.
    const badRow = firstInvalidStock(variations.rows);
    if (badRow >= 0) {
      setFormTab('variations');
      toasts.push(`Enter the stock for variation ${badRow + 1} as a number.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...draft,
        wholesalePrice,
        status: publish ? 'active' : 'draft',
        categoryId: draft.categoryId || null,
        brandId: draft.brandId || null,
        images: draft.images,
        videoUrl: video || null,
        sizeGuideId: draft.sizeGuideId ? Number(draft.sizeGuideId) : null,
        freeShipping: Boolean(draft.freeShipping),
        shippingCharges: chargesToPayload(draft.shippingCharges),
        optionDisplay: draft.optionDisplay || {},
        highlights: (draft.highlights || []).filter((item: ProductHighlight) => item.text.trim()),
        howToUse: draft.howToUse || '',
      };
      const res = await fetch(draft.id ? `/api/admin/products/${draft.id}` : '/api/admin/products', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');

      const productId = draft.id || data.product?.id;
      // v3.8: the separate Attributes tab is gone — options are set as
      // Variations. Attributes saved on older products are left untouched.

      // Runs after the product write because the variations endpoint recomputes
      // products.stock from the rows — the other order would let the product
      // PUT overwrite that total. Only sent when the operator touched the set,
      // so an edit whose variations failed to load can never wipe them.
      const sendVariations = draft.id ? variationsDirty : variations.rows.length > 0;
      if (productId && sendVariations) {
        const variationRes = await fetch(`/api/admin/products/${productId}/variations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variations: variationPayload(variations.rows) }),
        });
        const variationData = await variationRes.json().catch(() => ({}));
        if (!variationRes.ok || variationData?.error) {
          // The product itself is saved. Keep the drawer open on it as an edit,
          // so pressing save again retries the variations instead of creating
          // a second copy of the product.
          setDraft((current) => ({ ...current, id: productId }));
          setFormTab('variations');
          toasts.push(
            `Product saved, but the variations could not be saved: ${variationData?.error || 'Please try again.'}`,
            'error'
          );
          load();
          onRefresh?.();
          return;
        }
        setVariationsDirty(false);
      }

      // v3.11 — keep the search-by-photo index in step with the product picture
      if (productId && payload.image) indexProductQuietly({ id: Number(productId), image: String(payload.image) });

      toasts.push(draft.id ? 'Product updated.' : 'Product added.');
      setDrawerOpen(false);
      load();
      onRefresh?.();
      // The size guide list shows how many products use each guide
      if (sizeGuidesState === 'ready') loadSizeGuides();
    } catch (error: any) {
      toasts.push(error.message || 'Could not save the product.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (product: any, next: string) => {
    setRows((list) => list.map((row) => (row.id === product.id ? { ...row, status: next } : row)));
    try {
      await fetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, status: next }),
      });
      toasts.push('Status updated.');
    } catch {
      toasts.push('Could not update the status.', 'error');
      load();
    }
  };

  const duplicate = async (listRow: any) => {
    try {
      const product = await fullProduct(listRow);
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...product,
          id: undefined,
          name: `${product.name} (Copy)`,
          slug: '',
          sku: '',
          status: 'draft',
        }),
      });
      if (!res.ok) throw new Error();
      toasts.push('Product duplicated.');
      load();
    } catch {
      toasts.push('Could not duplicate the product.', 'error');
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('Product deleted.');
      setConfirmDelete(null);
      load();
      onRefresh?.();
    } catch {
      toasts.push('Could not delete the product.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Bulk                                                                    */
  /* ---------------------------------------------------------------------- */

  const runBulk = async (body: Record<string, any>, describe: (data: any) => string) => {
    if (selection.count === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selection.selected, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      toasts.push(describe(data));
      selection.clear();
      load();
      onRefresh?.();
    } catch (error: any) {
      toasts.push(error.message || 'Could not complete the bulk action.', 'error');
    } finally {
      setBulkBusy(false);
      setConfirmBulkDelete(false);
    }
  };


  /* ---------------------------------------------------------------------- */
  /* Row parts shared by the table and the cards                            */
  /* ---------------------------------------------------------------------- */

  const statusSelectFor = (row: any) => (
    <StatusSelect
      value={row.status === 'active' ? 'published' : row.status === 'archived' ? 'archived' : 'draft'}
      options={[
        { value: 'published', label: 'Published' },
        { value: 'draft', label: 'Draft' },
        { value: 'archived', label: 'Archived' },
      ]}
      onChange={(next) => changeStatus(row, next === 'published' ? 'active' : next)}
    />
  );

  const priceFor = (row: any, large = false) => {
    const onSale = Boolean(row.salePrice) && Number(row.salePrice) < Number(row.price);
    const off = onSale ? percent(Number(row.price) - Number(row.salePrice), Number(row.price)) : null;
    return (
      <span className="inline-flex flex-col items-end">
        <span style={{ fontSize: large ? 'var(--a-fs-lg)' : undefined, color: onSale ? 'var(--ds-success-text)' : undefined }}>
          <Money value={onSale ? row.salePrice : row.price} currency={currency} bold />
        </span>
        {onSale && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 'var(--a-fs-sm)' }}>
            <span className="line-through" style={{ color: 'var(--a-text-muted)' }}>
              <Money value={row.price} currency={currency} />
            </span>
            {off !== null && (
              <span
                className="font-bold ds-num"
                style={{
                  padding: '0 5px',
                  borderRadius: 'var(--ds-r-xs)',
                  background: 'var(--ds-rose-soft)',
                  color: 'var(--ds-rose)',
                  fontSize: 'var(--ds-fs-xs)',
                }}
              >
                −{Math.round(off)}%
              </span>
            )}
          </span>
        )}
      </span>
    );
  };

  const actionsFor = (row: any) => (
    <>
      <IconButton icon={Edit2} tone="primary" label="Edit" onClick={() => openEdit(row)} />
      <IconButton icon={Copy} label="Duplicate" onClick={() => duplicate(row)} />
      <IconButton
        icon={Eye}
        tone="success"
        label="View on Site"
        onClick={() => window.open(`/product/${row.slug}`, '_blank')}
      />
      <IconButton icon={Trash2} tone="danger" label="Delete" onClick={() => setConfirmDelete(row)} />
    </>
  );

  const emptyNode = (
    <EmptyState
      title={filtersActive ? 'No products match these filters' : 'No products yet'}
      description={
        filtersActive
          ? 'Try a different category, brand or stock level.'
          : 'Add your first product to start building your catalog.'
      }
      icon={Package}
      action={
        filtersActive ? (
          <Button icon={RotateCcw} onClick={resetFilters}>
            Reset Filters
          </Button>
        ) : (
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Add Product
          </Button>
        )
      }
    />
  );

  const columnCount = 7;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeTabMeta = FORM_TABS.find((tab) => tab.id === formTab) || FORM_TABS[0];
  const chosenGuide = draft.sizeGuideId
    ? sizeGuides.find((guide) => Number(guide.id) === Number(draft.sizeGuideId))
    : undefined;

  return (
    <div>
      {toasts.node}
      <ProductTransferModal
        open={transfer !== null}
        initialMode={transfer || 'export'}
        selectedIds={selection.selected}
        onClose={() => setTransfer(null)}
        onImported={() => {
          load();
          onRefresh?.();
        }}
      />

      <PageHeader
        title="Product Catalog"
        subtitle="Add products, keep an eye on prices and stock, and control what is published"
        icon={Package}
        actions={
          <>
            <Button icon={Upload} onClick={() => setTransfer('import')}>
              Import
            </Button>
            <Button icon={Download} onClick={() => setTransfer('export')}>
              Export
            </Button>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Add Product
            </Button>
          </>
        }
      />

      {/* Summary — each tile filters the list */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3 mb-5">
        <SummaryTile
          label="All Products"
          value={summary.all}
          icon={Package}
          color={ACCENTS.indigo}
          loading={loading}
          active={status === 'all' && stockFilter === 'all'}
          onClick={() => {
            setStatus('all');
            setStockFilter('all');
            setPage(1);
          }}
        />
        <SummaryTile
          label="Published"
          value={summary.active}
          icon={CheckCircle2}
          color="var(--ds-success)"
          text="var(--ds-success-text)"
          loading={loading}
          active={status === 'active'}
          onClick={() => tileStatus('active')}
        />
        <SummaryTile
          label="Draft / Archived"
          value={summary.unpublished}
          icon={FileText}
          color={ACCENTS.amber}
          text="var(--ds-warning-text)"
          loading={loading}
          active={status === 'unpublished'}
          note={`${summary.draft} draft · ${summary.archived} archived`}
          onClick={() => tileStatus('unpublished')}
        />
        <SummaryTile
          label="Low Stock"
          value={summary.low}
          icon={AlertTriangle}
          color="var(--ds-warning)"
          text="var(--ds-warning-text)"
          loading={loading}
          active={stockFilter === 'low'}
          onClick={() => tileStock('low')}
        />
        <SummaryTile
          label="Out of Stock"
          value={summary.out}
          icon={PackageX}
          color="var(--ds-danger)"
          text="var(--ds-danger-text)"
          loading={loading}
          active={stockFilter === 'out'}
          onClick={() => tileStock('out')}
        />
        <SummaryTile
          label="Stock Value"
          value={<Money value={summary.value} currency={currency} />}
          icon={Wallet}
          color={ACCENTS.teal}
          loading={loading}
          note="At cost price"
        />
      </div>

      {/* Filters — collapsible on phones */}
      <Card className="mb-4" padded={false}>
        <div className="p-3 flex flex-col sm:flex-row gap-2.5">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by name, SKU, generic name or barcode"
            className="flex-1 min-w-0"
          />
          <div className="flex items-center gap-2">
            <Button
              icon={SlidersHorizontal}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="lg:hidden flex-1 sm:flex-none"
            >
              Filters
              {panelFilterCount > 0 && (
                <span
                  className="ds-num inline-flex items-center justify-center font-bold"
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'var(--primary)',
                    color: '#fff',
                    fontSize: 'var(--ds-fs-xs)',
                  }}
                >
                  {panelFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={resetFilters}
              disabled={!filtersActive}
              className="flex-1 sm:flex-none"
            >
              Reset
            </Button>
          </div>
        </div>

        <div
          className={`${filtersOpen ? 'grid' : 'hidden'} lg:grid grid-cols-2 lg:grid-cols-6 gap-2.5 px-3 pb-3 pt-3 border-t`}
          style={{ borderColor: 'var(--a-border-soft)' }}
        >
          <Field label="Category" className="col-span-2 sm:col-span-1">
            <Select
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={[{ value: 'all', label: 'All Categories' }, ...categoryOptions]}
            />
          </Field>
          <Field label="Brand">
            <Select
              value={brand}
              onChange={(value) => {
                setBrand(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Brands' },
                ...brands.map((item) => ({ value: String(item.id), label: item.name })),
              ]}
            />
          </Field>
          <Field label="Stock">
            <Select
              value={stockFilter}
              onChange={(value) => {
                setStockFilter(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Stock' },
                { value: 'in', label: 'In Stock' },
                { value: 'low', label: 'Low Stock' },
                { value: 'out', label: 'Out of Stock' },
                { value: 'wholesale', label: 'Wholesale Only' },
              ]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Statuses' },
                ...STATUS_OPTIONS,
                { value: 'unpublished', label: 'Draft + Archived' },
              ]}
            />
          </Field>
          <Field label="Show Only">
            <Select
              value={flagFilter}
              onChange={(value) => {
                setFlagFilter(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'free', label: 'Free delivery' },
                { value: 'video', label: 'With video' },
                { value: 'variations', label: 'With variations' },
                { value: 'rx', label: 'Prescription (Rx)' },
                { value: 'featured', label: 'Featured' },
                { value: 'sizeguide', label: 'With size guide' },
              ]}
            />
          </Field>
          <Field label="Sort By">
            <Select
              value={['newest', 'oldest'].includes(sort.field) ? sort.field : `${sort.field}:${sort.dir}`}
              onChange={(value) => {
                const [field, dir] = value.split(':');
                setSort({ field: field as SortField, dir: (dir as 'asc' | 'desc') || 'desc' });
                setPage(1);
              }}
              options={[
                { value: 'newest', label: 'Newest First' },
                { value: 'oldest', label: 'Oldest First' },
                { value: 'name:asc', label: 'Name A–Z' },
                { value: 'name:desc', label: 'Name Z–A' },
                { value: 'price:asc', label: 'Price Low–High' },
                { value: 'price:desc', label: 'Price High–Low' },
                { value: 'stock:asc', label: 'Stock Low–High' },
                { value: 'stock:desc', label: 'Stock High–Low' },
              ]}
            />
          </Field>
        </div>
      </Card>

      {/* List — table on wide screens, cards below */}
      <div className="a-card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--a-border)', background: 'var(--a-surface-2)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="xl:hidden inline-flex items-center justify-center" style={{ minWidth: 36, minHeight: 36 }}>
              <Checkbox
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAll}
                label="Select all on this page"
              />
            </span>
            <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
              {selection.count > 0 ? (
                <>
                  <span className="ds-num">{selection.count}</span> selected
                </>
              ) : (
                <>
                  <span className="ds-num">{total}</span> product{total === 1 ? '' : 's'}
                </>
              )}
            </span>
            {filtersActive && !loading && (
              <span className="hidden sm:inline" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                filtered from <span className="ds-num">{summary.all}</span>
              </span>
            )}
          </div>
          <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            Page {page} of {pageCount}
          </span>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden xl:block overflow-x-auto">
              <table style={{ '--ds-td-x': '12px' } as React.CSSProperties}>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <Checkbox
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        label="Select all"
                      />
                    </th>
                    <SortableTh label="Product" field="name" sort={sort} onSort={toggleSort} />
                    <th className="hidden 2xl:table-cell">Category</th>
                    <SortableTh label="Price" field="price" sort={sort} onSort={toggleSort} align="right" />
                    <SortableTh label="Stock" field="stock" sort={sort} onSort={toggleSort} />
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows rows={Math.min(pageSize, 10)} cols={columnCount} />
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={columnCount} style={{ padding: 0 }}>
                        {emptyNode}
                      </td>
                    </tr>
                  ) : (
                    paged.map((row) => {
                      const picked = selection.isSelected(row.id);
                      const path = pathOf(row.categoryId);
                      return (
                        <tr key={row.id} data-selected={picked || undefined}>
                          <td style={{ boxShadow: `inset 3px 0 0 ${STATUS_STRIP[row.status] || 'var(--ds-gray-300)'}` }}>
                            <Checkbox
                              checked={picked}
                              onChange={() => selection.toggle(row.id)}
                              label={`Select ${row.name}`}
                            />
                          </td>

                          <td>
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="shrink-0 cursor-pointer"
                                aria-label={`Edit ${row.name}`}
                              >
                                <Thumb src={row.image} alt={row.name} size={48} />
                              </button>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="block text-left font-semibold truncate cursor-pointer hover:underline"
                                  style={{ maxWidth: 320, fontSize: 'var(--a-fs-md)', color: 'inherit' }}
                                  title={row.name}
                                >
                                  {row.name}
                                </button>
                                <div
                                  className="truncate"
                                  style={{ maxWidth: 320, fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                                >
                                  {row.genericName ? `${row.genericName} · ` : ''}
                                  <span className="ds-num">{row.sku}</span>
                                  {path.length > 0 && <span className="2xl:hidden"> · {path.join(' › ')}</span>}
                                </div>
                                <ProductFlags row={row} className="mt-1" />
                              </div>
                            </div>
                          </td>

                          <td className="hidden 2xl:table-cell" style={{ maxWidth: 200 }}>
                            {path.length > 0 ? (
                              <div className="min-w-0" title={path.join(' › ')}>
                                {path.length > 1 && (
                                  <div
                                    className="truncate"
                                    style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
                                  >
                                    {path.slice(0, -1).join(' › ')}
                                  </div>
                                )}
                                <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-sm)' }}>
                                  {path[path.length - 1]}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                            )}
                          </td>

                          <td style={{ textAlign: 'right' }}>{priceFor(row)}</td>

                          <td>
                            <StockPill
                              stock={Number(row.stock) || 0}
                              low={isLow(row)}
                              unit={row.unit}
                              variations={Boolean(row.hasVariations)}
                            />
                          </td>

                          <td>{statusSelectFor(row)}</td>

                          <td>
                            <div className="flex items-center justify-end gap-1.5">{actionsFor(row)}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Phone / tablet cards */}
            <div
              className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 p-2.5 sm:p-3"
              style={{ background: 'var(--a-surface-2)' }}
            >
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="a-card p-3 space-y-3">
                    <div className="flex gap-3">
                      <span className="ds-skeleton shrink-0" style={{ width: 64, height: 64, borderRadius: 10 }} />
                      <div className="flex-1 space-y-2">
                        <span className="ds-skeleton block h-4 w-4/5" />
                        <span className="ds-skeleton block h-3 w-1/2" />
                      </div>
                    </div>
                    <span className="ds-skeleton block h-8 w-full" />
                  </div>
                ))
              ) : paged.length === 0 ? (
                <div className="col-span-full a-card">{emptyNode}</div>
              ) : (
                paged.map((row) => {
                  const picked = selection.isSelected(row.id);
                  const path = pathOf(row.categoryId);
                  return (
                    <article
                      key={row.id}
                      className="a-card p-3 flex flex-col gap-2.5 min-w-0"
                      style={{
                        borderLeft: `4px solid ${STATUS_STRIP[row.status] || 'var(--ds-gray-300)'}`,
                        ...(picked
                          ? { borderColor: 'var(--primary)', background: mix('var(--primary)', 0.05) }
                          : {}),
                      }}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="inline-flex items-center justify-center shrink-0 -ml-1"
                          style={{ width: 32, height: 36 }}
                        >
                          <Checkbox
                            checked={picked}
                            onChange={() => selection.toggle(row.id)}
                            label={`Select ${row.name}`}
                          />
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="shrink-0 cursor-pointer"
                          aria-label={`Edit ${row.name}`}
                        >
                          <Thumb src={row.image} alt={row.name} size={60} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="block text-left font-semibold line-clamp-2 cursor-pointer"
                            style={{ fontSize: 'var(--a-fs-md)', color: 'inherit', lineHeight: 1.35 }}
                          >
                            {row.name}
                          </button>
                          <div className="truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                            {row.genericName ? `${row.genericName} · ` : ''}
                            <span className="ds-num">{row.sku}</span>
                          </div>
                          {path.length > 0 && (
                            <div
                              className="truncate"
                              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}
                              title={path.join(' › ')}
                            >
                              {path.join(' › ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <ProductFlags row={row} />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {priceFor(row, true)}
                        <StockPill
                          stock={Number(row.stock) || 0}
                          low={isLow(row)}
                          unit={row.unit}
                          variations={Boolean(row.hasVariations)}
                        />
                      </div>

                      <div
                        className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-auto border-t"
                        style={{ borderColor: 'var(--a-border-soft)' }}
                      >
                        {statusSelectFor(row)}
                        <div className="flex items-center gap-1.5">{actionsFor(row)}</div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Bulk actions */}
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BarSelect
          value=""
          label="Change Status"
          placeholder="Status"
          disabled={bulkBusy}
          options={STATUS_OPTIONS}
          onChange={(next) => {
            if (!next) return;
            runBulk(
              { action: 'status', status: next },
              (data) => `Status updated for ${data.affected || 0} product(s).`
            );
          }}
        />

        <BarSelect
          value=""
          label="Change Category"
          placeholder="Category"
          disabled={bulkBusy}
          options={categoryOptions}
          onChange={(next) => {
            if (!next) return;
            runBulk(
              { action: 'category', categoryId: Number(next) },
              (data) => `Category changed for ${data.affected || 0} product(s).`
            );
          }}
        />

        <BulkAction
          icon={Star}
          disabled={bulkBusy}
          onClick={() =>
            runBulk(
              { action: 'flag', flag: 'featured', value: true },
              (data) => `${data.affected || 0} product(s) marked as featured.`
            )
          }
        >
          Feature
        </BulkAction>

        <BulkAction
          icon={StarOff}
          disabled={bulkBusy}
          onClick={() =>
            runBulk(
              { action: 'flag', flag: 'featured', value: false },
              (data) => `${data.affected || 0} product(s) removed from featured.`
            )
          }
        >
          Unfeature
        </BulkAction>

        <BulkAction
          icon={Truck}
          disabled={bulkBusy}
          onClick={() =>
            runBulk(
              { action: 'flag', flag: 'freeShipping', value: true },
              (data) => `Free delivery switched on for ${data.affected || 0} product(s).`
            )
          }
        >
          Free delivery on
        </BulkAction>

        <BulkAction
          icon={Truck}
          disabled={bulkBusy}
          onClick={() =>
            runBulk(
              { action: 'flag', flag: 'freeShipping', value: false },
              (data) => `Free delivery switched off for ${data.affected || 0} product(s).`
            )
          }
        >
          Free delivery off
        </BulkAction>

        <BulkAction
          icon={Trash2}
          tone="danger"
          disabled={bulkBusy}
          onClick={() => setConfirmBulkDelete(true)}
        >
          Delete
        </BulkAction>
      </BulkBar>

      {/* ------------------------------------------------------------------ */}
      {/* Add / edit product                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit Product' : 'New Product'}
        subtitle={draft.id ? draft.name : 'Fill in the details and publish'}
        width="max-w-4xl"
        footer={
          <>
            <Button onClick={() => save(false)} loading={saving}>
              Save Draft
            </Button>
            <Button variant="primary" onClick={() => save(true)} loading={saving}>
              {draft.id ? 'Update' : 'Publish'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col sm:flex-row gap-5">
          <nav
            className="sm:w-44 shrink-0 flex sm:flex-col gap-1 overflow-x-auto ds-scroll-hide -mx-1 px-1 sm:mx-0 sm:px-0"
            aria-label="Product form sections"
          >
            {FORM_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = formTab === tab.id;
              const hint =
                tab.id === 'variations' && variations.rows.length > 0
                  ? String(variations.rows.length)
                  : tab.id === 'shipping' && draft.freeShipping
                  ? 'Free'
                  : tab.id === 'gallery' && String(draft.videoUrl || '').trim()
                  ? 'Video'
                  : '';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFormTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className="px-2.5 font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer text-left shrink-0 transition-colors"
                  style={{
                    height: 'var(--ds-h-md)',
                    borderRadius: 'var(--ds-r-md)',
                    fontSize: 'var(--a-fs-md)',
                    background: isActive ? mix(tab.color, 0.12) : 'transparent',
                    color: isActive ? tab.color : 'var(--a-text-soft)',
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 'var(--ds-r-xs)',
                      background: isActive ? mix(tab.color, 0.16) : mix(tab.color, 0.09),
                      color: tab.color,
                    }}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                  </span>
                  {tab.label}
                  {hint && (
                    <span
                      className="ds-num rounded-full px-1.5 font-bold"
                      style={{ fontSize: 'var(--ds-fs-2xs)', background: mix(tab.color, 0.14), color: tab.color }}
                    >
                      {hint}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 space-y-4">
            <div
              className="flex items-center gap-2 font-bold pb-2 border-b"
              style={{ fontSize: 'var(--a-fs-lg)', borderColor: 'var(--a-border-soft)' }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: 999, background: activeTabMeta.color }}
                aria-hidden
              />
              {activeTabMeta.label}
            </div>

            {formTab === 'general' && (
              <>
                <Field label="Product Name" required>
                  <input
                    className="a-field"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="Enter product name"
                  />
                </Field>
                <Field
                  label="Generic Name"
                  hint="Pick from your Generic Names list or type a new one — it is added to the list and links to all products with this generic."
                >
                  <input
                    className="a-field"
                    list="product-generic-options"
                    value={draft.genericName || ''}
                    onChange={(event) => setDraft({ ...draft, genericName: event.target.value })}
                    placeholder="e.g. Paracetamol"
                  />
                  <datalist id="product-generic-options">
                    {genericOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Short Description">
                  <textarea
                    className="a-field"
                    rows={2}
                    value={draft.shortDescription || ''}
                    onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })}
                    placeholder="A line or two about the product"
                  />
                </Field>
                <Field label="Full Description">
                  <textarea
                    className="a-field"
                    rows={5}
                    value={draft.description || ''}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    placeholder="Full product description"
                  />
                </Field>
                <Field
                  label="Highlights (shown beside the description)"
                  hint="Up to 4 short points with an icon — e.g. Premium fabric, Light & comfortable."
                >
                  <div className="space-y-2">
                    {(draft.highlights || []).map((item: ProductHighlight, index: number) => {
                      const Icon = HIGHLIGHT_ICONS[item.icon]?.icon || HIGHLIGHT_ICONS.Sparkles.icon;
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center justify-center shrink-0"
                            style={{ width: 38, height: 38, borderRadius: 999, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink, var(--primary))' }}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <select
                            className="a-field"
                            style={{ width: 170 }}
                            value={item.icon}
                            onChange={(event) => {
                              const next = [...draft.highlights];
                              next[index] = { ...item, icon: event.target.value };
                              setDraft({ ...draft, highlights: next });
                            }}
                          >
                            {Object.entries(HIGHLIGHT_ICONS).map(([key, meta]) => (
                              <option key={key} value={key}>
                                {meta.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="a-field flex-1 min-w-0"
                            value={item.text}
                            maxLength={80}
                            placeholder="e.g. প্রিমিয়াম মানের কাপড়"
                            onChange={(event) => {
                              const next = [...draft.highlights];
                              next[index] = { ...item, text: event.target.value };
                              setDraft({ ...draft, highlights: next });
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            tone="danger"
                            label="Remove highlight"
                            onClick={() => setDraft({ ...draft, highlights: draft.highlights.filter((_: any, i: number) => i !== index) })}
                          />
                        </div>
                      );
                    })}
                    {(draft.highlights || []).length < 4 && (
                      <Button
                        size="sm"
                        icon={Plus}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            highlights: [
                              ...(draft.highlights || []),
                              { icon: ['Gem', 'Leaf', 'Flower2', 'Gift'][(draft.highlights || []).length] || 'Sparkles', text: '' },
                            ],
                          })
                        }
                      >
                        Add highlight
                      </Button>
                    )}
                  </div>
                </Field>
                <Field label="How to use (optional)" hint="Shows a “How To Use” tab on the product page. Leave empty to hide the tab.">
                  <textarea
                    className="a-field"
                    rows={3}
                    value={draft.howToUse || ''}
                    onChange={(event) => setDraft({ ...draft, howToUse: event.target.value })}
                    placeholder="Care, washing or usage instructions"
                  />
                </Field>
                <CategoryCascade
                  categories={categories}
                  value={String(draft.categoryId || '')}
                  onChange={(value) => setDraft({ ...draft, categoryId: value })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Brand">
                    <Select
                      value={String(draft.brandId || '')}
                      onChange={(value) => setDraft({ ...draft, brandId: value })}
                      options={[
                        { value: '', label: 'Select a brand' },
                        ...brands.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Toggle
                    checked={draft.featured}
                    onChange={(value) => setDraft({ ...draft, featured: value })}
                    label="Featured Product"
                    description="Shown in the featured section on the homepage"
                  />
                  <Toggle
                    checked={draft.isFlashSale}
                    onChange={(value) => setDraft({ ...draft, isFlashSale: value })}
                    label="Flash Sale"
                    description="Included in today's flash sale"
                  />
                </div>
              </>
            )}

            {formTab === 'pricing' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label={`Regular Price (${currency})`} required>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="a-field ds-num"
                      value={draft.price}
                      onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                    />
                  </Field>
                  <Field label={`Sale Price (${currency})`}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="a-field ds-num"
                      value={draft.salePrice || ''}
                      onChange={(event) => setDraft({ ...draft, salePrice: event.target.value })}
                    />
                  </Field>
                  <Field label={`Cost Price (${currency})`}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="a-field ds-num"
                      value={draft.costPrice || ''}
                      onChange={(event) => setDraft({ ...draft, costPrice: event.target.value })}
                    />
                  </Field>
                </div>

                {(() => {
                  const regular = Number(draft.price) || 0;
                  const sale = Number(draft.salePrice) || 0;
                  const cost = Number(draft.costPrice) || 0;
                  const onSale = sale > 0 && sale < regular;
                  const selling = onSale ? sale : regular;
                  const discount = onSale ? percent(regular - sale, regular) : null;
                  const profit = selling - cost;
                  const margin = cost > 0 ? percent(profit, selling) : null;
                  const saleInvalid = sale > 0 && regular > 0 && sale >= regular;
                  const tile = (
                    label: string,
                    value: React.ReactNode,
                    note: string,
                    tone: { bg: string; fg: string }
                  ) => (
                    <div className="p-3.5" style={{ borderRadius: 'var(--ds-r-md)', background: tone.bg }}>
                      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{label}</div>
                      <div
                        className="font-bold ds-num leading-tight"
                        style={{ fontSize: 'var(--ds-fs-xl)', color: tone.fg }}
                      >
                        {value}
                      </div>
                      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{note}</div>
                    </div>
                  );
                  const neutral = { bg: 'var(--a-surface-2)', fg: 'var(--a-text)' };
                  return (
                    <>
                      {saleInvalid && (
                        <p className="ds-error-text">Sale price should be lower than the regular price.</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {tile(
                          'Selling Price',
                          <Money value={selling} currency={currency} />,
                          onSale ? 'Sells at the sale price' : 'Sells at the regular price',
                          neutral
                        )}
                        {tile(
                          'Discount',
                          discount === null ? '—' : `${discount}%`,
                          onSale ? `${currency}${(regular - sale).toLocaleString('en-US', { maximumFractionDigits: 2 })} off` : 'No sale price',
                          discount === null ? neutral : { bg: 'var(--ds-amber-soft)', fg: 'var(--ds-warning-text)' }
                        )}
                        {tile(
                          'Profit Margin',
                          margin === null ? '—' : `${margin}%`,
                          margin === null
                            ? 'Add a cost price to calculate'
                            : `${profit < 0 ? '-' : ''}${currency}${Math.abs(profit).toLocaleString('en-US', { maximumFractionDigits: 2 })} per unit`,
                          margin === null
                            ? neutral
                            : margin < 0
                            ? { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' }
                            : { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' }
                        )}
                      </div>
                    </>
                  );
                })()}

                {variations.rows.length > 0 && (
                  <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                    Variations without their own price will sell at this price.
                  </p>
                )}

                {/* Wholesale — only approved wholesale customers ever see or pay this price */}
                <div
                  className="space-y-3"
                  style={{
                    padding: 'var(--ds-s-4)',
                    borderRadius: 'var(--ds-r-md)',
                    border: `1px solid ${draft.wholesaleEnabled ? 'var(--ds-indigo)' : 'var(--a-border)'}`,
                    background: draft.wholesaleEnabled ? 'var(--ds-indigo-soft)' : 'var(--a-surface-2)',
                  }}
                >
                  <Toggle
                    checked={Boolean(draft.wholesaleEnabled)}
                    onChange={(value) => setDraft({ ...draft, wholesaleEnabled: value })}
                    label="Enable Wholesale"
                    description="Approved wholesale customers see only the wholesale price. Regular customers keep seeing the regular/sale price."
                  />
                  {draft.wholesaleEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field
                        label={variations.rows.length > 0 ? `Wholesale Price (${currency}) — all options` : `Wholesale Price (${currency})`}
                        required={variations.rows.length === 0}
                        hint={variations.rows.length > 0 ? 'Different price per option? Set it in the Variations tab.' : undefined}
                      >
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="a-field ds-num"
                          value={draft.wholesalePrice ?? ''}
                          onChange={(event) => setDraft({ ...draft, wholesalePrice: event.target.value })}
                        />
                      </Field>
                      <Field label="Minimum Quantity" hint="Optional">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="a-field ds-num"
                          value={draft.wholesaleMinQty ?? ''}
                          onChange={(event) => setDraft({ ...draft, wholesaleMinQty: event.target.value })}
                          placeholder="No minimum"
                        />
                      </Field>
                      <Field label="Maximum Quantity" hint="Optional">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="a-field ds-num"
                          value={draft.wholesaleMaxQty ?? ''}
                          onChange={(event) => setDraft({ ...draft, wholesaleMaxQty: event.target.value })}
                          placeholder="No maximum"
                        />
                      </Field>
                    </div>
                  )}
                  {draft.wholesaleEnabled &&
                    Number(draft.wholesalePrice) > 0 &&
                    Number(draft.costPrice) > 0 &&
                    Number(draft.wholesalePrice) < Number(draft.costPrice) && (
                      <p className="ds-error-text">The wholesale price is below the cost price.</p>
                    )}
                </div>
              </>
            )}

            {formTab === 'variations' && (
              <ProductVariationsEditor
                value={variations}
                onChange={editVariations}
                library={attributeList}
                currency={currency}
                basePrice={draft.price}
                wholesaleEnabled={Boolean(draft.wholesaleEnabled)}
                baseWholesalePrice={draft.wholesalePrice}
                productName={draft.name}
                display={draft.optionDisplay || {}}
                onDisplayChange={(next) => setDraft({ ...draft, optionDisplay: next })}
                loading={variationsLoading}
                error={variationsError}
                onRetry={draft.id ? () => loadVariations(draft.id as number) : undefined}
              />
            )}

            {formTab === 'inventory' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="SKU" hint="Leave blank to generate one automatically">
                    <input
                      className="a-field ds-num"
                      value={draft.sku || ''}
                      onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Barcode"
                    hint={variations.rows.length > 0 ? 'Each variation can have its own barcode (Variations tab).' : 'Scanned at the POS. No barcode on the pack? Generate one and print a label.'}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        className="a-field ds-num flex-1 min-w-0"
                        value={draft.barcode || ''}
                        onChange={(event) => setDraft({ ...draft, barcode: event.target.value })}
                      />
                      {!String(draft.barcode || '').trim() ? (
                        <Button size="sm" variant="soft" onClick={() => setDraft({ ...draft, barcode: generateStoreBarcode() })}>
                          Generate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            printBarcodeLabels(
                              [
                                {
                                  name: draft.name || 'Product',
                                  price: Number(draft.salePrice) > 0 ? Number(draft.salePrice) : Number(draft.price) || null,
                                  code: String(draft.barcode).trim(),
                                },
                              ],
                              { layout: 'roll38', currency }
                            )
                          }
                        >
                          Print label
                        </Button>
                      )}
                    </div>
                  </Field>
                </div>
                {variations.rows.length > 0 && (
                  <div
                    className="flex items-start gap-2.5 p-3"
                    style={{
                      borderRadius: 'var(--ds-r-md)',
                      background: 'var(--ds-info-soft)',
                      color: 'var(--ds-info-text)',
                      fontSize: 'var(--a-fs-md)',
                    }}
                  >
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Stock for this product is tracked per variation, and the total is the sum of all variations —
                      to change it, use the{' '}
                      <button
                        type="button"
                        onClick={() => setFormTab('variations')}
                        className="font-bold underline cursor-pointer"
                      >
                        Variations
                      </button>{' '}
                      tab.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Stock Quantity"
                    hint={variations.rows.length > 0 ? 'Total stock across all variations' : undefined}
                  >
                    {variations.rows.length > 0 ? (
                      <input
                        type="number"
                        readOnly
                        aria-readonly="true"
                        className="a-field ds-num"
                        style={{ background: 'var(--a-surface-3)', color: 'var(--a-text-muted)' }}
                        value={totalVariationStock(variations.rows)}
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        className="a-field ds-num"
                        value={draft.stock}
                        onChange={(event) => setDraft({ ...draft, stock: Number(event.target.value) })}
                      />
                    )}
                  </Field>
                  <Field label="Low Stock Threshold">
                    <input
                      type="number"
                      min={0}
                      className="a-field ds-num"
                      value={draft.lowStockThreshold}
                      onChange={(event) =>
                        setDraft({ ...draft, lowStockThreshold: Number(event.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <Field label="Unit" hint="Shown after the price on the product page, e.g. ৳65 / Strip. Pick one or type your own.">
                    <input
                      className="a-field"
                      list="product-unit-options"
                      value={draft.unit ?? ''}
                      maxLength={50}
                      placeholder="Strip"
                      onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                      onBlur={(event) => setDraft({ ...draft, unit: event.target.value.trim() || 'Pcs' })}
                    />
                    <datalist id="product-unit-options">
                      {['Strip', 'Box', 'Bottle', 'Pcs', 'Tablet', 'Capsule', 'Tube', 'Sachet', 'Jar', 'Pack', 'Pair', 'Set', 'Kg', 'Gram', 'Litre', 'ml', 'Dozen', 'Piece'].map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                  </Field>
                  <SizeGuidePicker
                    value={draft.sizeGuideId}
                    onChange={(id) => setDraft({ ...draft, sizeGuideId: id })}
                    guides={sizeGuides}
                    loading={sizeGuidesState === 'loading' || sizeGuidesState === 'idle'}
                    error={sizeGuidesState === 'error' ? 'Could not load the size guides.' : undefined}
                    onRetry={loadSizeGuides}
                    onManage={
                      onOpenTab
                        ? () => {
                            // Another dashboard tab replaces this page, so unsaved edits would be lost
                            const dirty = variationsDirty || JSON.stringify(draft) !== draftBaseline.current;
                            if (dirty) setConfirmLeave(true);
                            else {
                              setDrawerOpen(false);
                              onOpenTab('size-guides');
                            }
                          }
                        : undefined
                    }
                  />
                </div>
                <SizeGuidePreview guide={chosenGuide} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Batch Number">
                    <input
                      className="a-field ds-num"
                      value={draft.batchNumber || ''}
                      onChange={(event) => setDraft({ ...draft, batchNumber: event.target.value })}
                    />
                  </Field>
                  <Field label="Expiry Date">
                    <input
                      type="date"
                      className="a-field ds-num"
                      value={draft.expiryDate || ''}
                      onChange={(event) => setDraft({ ...draft, expiryDate: event.target.value })}
                    />
                  </Field>
                </div>
              </>
            )}

            {formTab === 'shipping' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Dosage / Size">
                    <input
                      className="a-field"
                      value={draft.dosage || ''}
                      onChange={(event) => setDraft({ ...draft, dosage: event.target.value })}
                      placeholder="e.g. 500mg"
                    />
                  </Field>
                </div>

                <FormPanel
                  icon={Pill}
                  color="var(--ds-danger)"
                  title="Prescription"
                  highlighted={Boolean(draft.requiresPrescription)}
                >
                  <Toggle
                    checked={draft.requiresPrescription}
                    onChange={(value) => setDraft({ ...draft, requiresPrescription: value })}
                    label="Prescription Required"
                    description="The customer is told before checkout"
                  />
                </FormPanel>

                <FormPanel
                  icon={Truck}
                  color="var(--ds-teal)"
                  title="Free delivery"
                  description="Customers pay nothing to ship this product."
                  highlighted={Boolean(draft.freeShipping)}
                >
                  <Toggle
                    checked={Boolean(draft.freeShipping)}
                    onChange={(value) => setDraft({ ...draft, freeShipping: value })}
                    label="Free delivery"
                    description={
                      draft.freeShipping
                        ? 'On — this product ships free in every zone.'
                        : 'Off — the zone charge (or the own charge below) applies.'
                    }
                  />
                </FormPanel>

                <FormPanel
                  icon={BadgeDollarSign}
                  color="var(--ds-info)"
                  title="Own delivery charge"
                  description="For heavy or bulky items. Leave a zone blank to use its normal charge."
                  action={
                    Object.values(draft.shippingCharges || {}).some((value) => String(value ?? '').trim() !== '') &&
                    !draft.freeShipping ? (
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, shippingCharges: {} })}
                        className="inline-flex items-center gap-1 font-semibold cursor-pointer"
                        style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)', minHeight: 36 }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Clear all
                      </button>
                    ) : undefined
                  }
                >
                  {draft.freeShipping && (
                    <Note>Free delivery is on, so these charges are not used. They are kept in case you switch it off.</Note>
                  )}
                  <DeliveryChargesEditor
                    zones={enabledZones}
                    charges={draft.shippingCharges || {}}
                    onChange={(next) => setDraft({ ...draft, shippingCharges: next })}
                    disabled={Boolean(draft.freeShipping)}
                    currency={currency}
                  />
                </FormPanel>

                <Note>
                  <div className="font-bold mb-1">How delivery is charged</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      Free-delivery products cost nothing to ship. If every product in an order is free delivery, the
                      order ships free.
                    </li>
                    <li>
                      When an order mixes products with different charges, the highest single charge applies — it is
                      one parcel.
                    </li>
                    <li>
                      Store-wide free delivery (System Configuration → Shipping) can still make the whole order free.
                    </li>
                  </ul>
                </Note>
              </>
            )}

            {formTab === 'seo' && (
              <ProductSeoFields draft={draft} setDraft={setDraft} />
            )}

            {formTab === 'gallery' && (
              <>
                <Field label="Main Image">
                  <MediaPicker
                    value={draft.image || ''}
                    onChange={(url) => setDraft({ ...draft, image: url })}
                    label="Main Image"
                  />
                </Field>

                <div>
                  <label className="a-label">Gallery Images</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {draft.images.map((url, index) => (
                      <div key={index} className="relative">
                        <img
                          src={url}
                          alt={`Gallery ${index + 1}`}
                          loading="lazy"
                          onError={(event) => {
                            const img = event.currentTarget;
                            img.onerror = null;
                            img.src = IMAGE_PLACEHOLDER;
                          }}
                          className="w-full aspect-square object-cover"
                          style={{
                            borderRadius: 'var(--ds-r-md)',
                            border: '1px solid var(--a-border)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, images: draft.images.filter((_, i) => i !== index) })
                          }
                          className="absolute top-1.5 right-1.5 flex items-center justify-center cursor-pointer"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 'var(--ds-r-full)',
                            background: 'var(--ds-surface)',
                            boxShadow: 'var(--ds-shadow-sm)',
                            color: 'var(--ds-danger)',
                          }}
                          aria-label="Remove Image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <MediaPicker
                      value=""
                      onChange={(url) => url && setDraft({ ...draft, images: [...draft.images, url] })}
                      label="Add Image to Gallery"
                    />
                  </div>
                </div>

                <ProductVideoField
                  value={draft.videoUrl || ''}
                  onChange={(value) => setDraft({ ...draft, videoUrl: value })}
                />
              </>
            )}

            {formTab === 'advanced' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Toggle
                    checked={draft.isBestSeller}
                    onChange={(value) => setDraft({ ...draft, isBestSeller: value })}
                    label="Best Seller"
                  />
                  <Toggle
                    checked={draft.isNewArrival}
                    onChange={(value) => setDraft({ ...draft, isNewArrival: value })}
                    label="New Arrival"
                  />
                </div>
                <Field label="Status">
                  <Select
                    value={draft.status}
                    onChange={(value) => setDraft({ ...draft, status: value })}
                    options={STATUS_OPTIONS}
                  />
                </Field>
              </>
            )}
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this product?"
        message={`${
          confirmDelete?.name || 'This product'
        } will be deleted from the dashboard, the shop and the POS. Past orders keep their lines.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="Size guides open in their own page, which closes this product form. Save the product first to keep your changes, or leave and lose them."
        confirmLabel="Leave Without Saving"
        cancelLabel="Stay Here"
        tone="primary"
        onConfirm={() => {
          setConfirmLeave(false);
          setDrawerOpen(false);
          onOpenTab?.('size-guides');
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected products?"
        message={`${selection.count} product(s) will be deleted from the dashboard, the shop and the POS. Past orders keep their lines.`}
        confirmLabel="Delete"
        busy={bulkBusy}
        onConfirm={() => runBulk({ action: 'delete' }, (data) => `${Number(data.affected || 0)} product(s) deleted.`)}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
};

/**
 * Main category → sub category → sub-sub category. Only the main category is
 * needed; the other two are optional and list only the children of the level
 * above. The product is filed under the deepest one chosen, and shop pages for
 * a parent category include everything filed under its children.
 */
const CategoryCascade: React.FC<{ categories: any[]; value: string; onChange: (value: string) => void }> = ({ categories, value, onChange }) => {
  const byId = React.useMemo(() => new Map(categories.map((item) => [String(item.id), item])), [categories]);
  const childrenOf = (parent: string | null) =>
    categories
      .filter((item) => (parent === null ? !item.parentId || !byId.has(String(item.parentId)) : String(item.parentId) === parent))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

  // Walk up from the saved category to fill the three boxes
  const chain: string[] = [];
  let cursor = value ? byId.get(value) : null;
  let guard = 0;
  while (cursor && guard < 6) {
    chain.unshift(String(cursor.id));
    cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
    guard += 1;
  }
  const [main = '', sub = '', subSub = ''] = chain;
  const subOptions = main ? childrenOf(main) : [];
  const subSubOptions = sub ? childrenOf(sub) : [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Field label="Main category">
        <Select
          value={main}
          onChange={(next) => onChange(next)}
          options={[{ value: '', label: 'Select a category' }, ...childrenOf(null).map((item) => ({ value: String(item.id), label: item.name }))]}
        />
      </Field>
      <Field label="Sub category" hint={main && subOptions.length === 0 ? 'No sub categories yet' : 'Optional'}>
        <Select
          value={sub}
          disabled={!main || subOptions.length === 0}
          onChange={(next) => onChange(next || main)}
          options={[{ value: '', label: main ? 'None' : 'Choose a main category first' }, ...subOptions.map((item) => ({ value: String(item.id), label: item.name }))]}
        />
      </Field>
      <Field label="Sub-sub category" hint={sub && subSubOptions.length === 0 ? 'None under this sub category' : 'Optional'}>
        <Select
          value={subSub}
          disabled={!sub || subSubOptions.length === 0}
          onChange={(next) => onChange(next || sub)}
          options={[{ value: '', label: sub ? 'None' : 'Choose a sub category first' }, ...subSubOptions.map((item) => ({ value: String(item.id), label: item.name }))]}
        />
      </Field>
    </div>
  );
};
