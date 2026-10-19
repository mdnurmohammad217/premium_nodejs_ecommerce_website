import React, { useMemo, useState } from 'react';
import { Layers, Plus, Trash2, Wand2, X, Boxes, PaintBucket, Barcode, Printer, Type, Image as ImageIcon } from 'lucide-react';
import type { OptionDisplayMode } from '../../lib/highlightIcons.ts';
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  SectionLoader,
  TableWrap,
  Toggle,
  Select,
  Modal,
  Field,
  tint,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { MediaLibraryModal } from './MediaLibraryModal.tsx';
import { generateStoreBarcode } from '../../lib/barcode.ts';
import { printBarcodeLabels, LABEL_LAYOUTS, LabelLayout } from '../../lib/barcodeLabels.ts';

/** One attribute the variations are built from, e.g. Color: [Red, Blue] */
export interface VariationOption {
  name: string;
  values: string[];
}

/**
 * A variation row as the form holds it. Numbers stay strings while editing so
 * an emptied input stays empty instead of snapping to 0.
 */
export interface VariationRow {
  /** stable React key — server ids only exist for rows that were saved */
  key: string;
  id?: number;
  combination: Record<string, string>;
  sku: string;
  /** printed barcode of this exact option, scanned at the POS */
  barcode: string;
  price: string;
  salePrice: string;
  /** wholesale price of this option; blank = the product's wholesale price */
  wholesalePrice: string;
  stock: string;
  image: string;
  status: 'active' | 'inactive';
}

export interface VariationState {
  options: VariationOption[];
  rows: VariationRow[];
}

export const emptyVariationState = (): VariationState => ({ options: [], rows: [] });

let keySeed = 0;
const nextKey = () => {
  keySeed += 1;
  return `v${Date.now().toString(36)}${keySeed}`;
};

/** Order-independent identity of a combination, so {Size,Color} matches {Color,Size} */
export const combinationKey = (combination: Record<string, string>) =>
  Object.keys(combination)
    .sort()
    .map((name) => `${name.trim().toLowerCase()}=${String(combination[name]).trim().toLowerCase()}`)
    .join('|');

export const variationLabel = (combination: Record<string, string>) =>
  Object.values(combination)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(' / ');

/** Turns the API response into editor state, rebuilding the option list from the combinations */
export function variationStateFromApi(list: any[]): VariationState {
  const options: VariationOption[] = [];
  const rows: VariationRow[] = (Array.isArray(list) ? list : []).map((item) => {
    const combination: Record<string, string> =
      item.combination && typeof item.combination === 'object' ? item.combination : {};
    Object.entries(combination).forEach(([name, value]) => {
      let option = options.find((entry) => entry.name === name);
      if (!option) {
        option = { name, values: [] };
        options.push(option);
      }
      if (!option.values.includes(String(value))) option.values.push(String(value));
    });
    return {
      key: nextKey(),
      id: item.id,
      combination,
      sku: item.sku || '',
      barcode: item.barcode || '',
      price: item.price == null ? '' : String(item.price),
      salePrice: item.salePrice == null ? '' : String(item.salePrice),
      wholesalePrice: item.wholesalePrice == null ? '' : String(item.wholesalePrice),
      stock: String(item.stock ?? 0),
      image: item.image || '',
      status: item.status === 'inactive' ? 'inactive' : 'active',
    };
  });
  return { options, rows };
}

/** The PUT body the variations endpoint expects */
export const variationPayload = (rows: VariationRow[]) =>
  rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    combination: row.combination,
    label: variationLabel(row.combination),
    sku: row.sku.trim(),
    barcode: (row.barcode || '').trim(),
    price: row.price,
    salePrice: row.salePrice,
    wholesalePrice: row.wholesalePrice ?? '',
    stock: Number(row.stock) || 0,
    image: row.image,
    status: row.status,
  }));

/** Index of the first row whose stock is missing or not a valid count, or -1 */
export const firstInvalidStock = (rows: VariationRow[]) =>
  rows.findIndex((row) => row.stock.trim() === '' || !Number.isFinite(Number(row.stock)) || Number(row.stock) < 0);

export const totalVariationStock = (rows: VariationRow[]) =>
  rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);

function cartesian(options: VariationOption[]): Array<Record<string, string>> {
  return options.reduce<Array<Record<string, string>>>(
    (combos, option) =>
      combos.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
    [{}]
  );
}

interface Props {
  value: VariationState;
  onChange: (next: VariationState) => void;
  /** global attribute library from /api/admin/attributes */
  library: Array<{ id: number; name: string; values?: string[] }>;
  currency: string;
  /** product-level price, shown as the fallback in blank price cells */
  basePrice?: string | number;
  /** show the per-option wholesale price column */
  wholesaleEnabled?: boolean;
  /** product-level wholesale price, shown in blank wholesale cells */
  baseWholesalePrice?: string | number | null;
  /** for barcode labels */
  productName?: string;
  storeName?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** v3.9 — how each option group shows on the product page */
  display?: Record<string, OptionDisplayMode>;
  onDisplayChange?: (next: Record<string, OptionDisplayMode>) => void;
}

const cellInput: React.CSSProperties = {
  minHeight: 'var(--ds-h-sm)',
  height: 'var(--ds-h-sm)',
  padding: '0 var(--ds-s-2)',
  fontSize: 'var(--a-fs-base)',
};

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({
  on,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className="px-3 font-semibold cursor-pointer whitespace-nowrap"
    style={{
      height: 'var(--ds-h-sm)',
      borderRadius: 'var(--ds-r-full)',
      fontSize: 'var(--a-fs-base)',
      background: on ? 'var(--primary)' : 'var(--a-surface-2)',
      color: on ? 'var(--primary-foreground)' : 'var(--a-text-soft)',
      border: `1px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`,
    }}
  >
    {children}
  </button>
);

/** Adds a value to one option; lives per option so each keeps its own draft text */
const ValueAdder: React.FC<{ onAdd: (value: string) => void }> = ({ onAdd }) => {
  const [text, setText] = useState('');
  const commit = () => {
    const value = text.trim();
    if (value) onAdd(value);
    setText('');
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        className="a-field"
        style={{ ...cellInput, width: 150 }}
        value={text}
        placeholder="New value"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <IconButton icon={Plus} size="sm" tone="primary" label="Add Value" onClick={commit} />
    </div>
  );
};

/**
 * Variations editor: the operator picks the attributes a product varies by,
 * generates every combination, then sets stock (and optionally price, SKU and
 * image) per combination. Saving is owned by the product form so a new product
 * can hold its variations until it has an id.
 */
export const ProductVariationsEditor: React.FC<Props> = ({
  value,
  onChange,
  library,
  currency,
  basePrice,
  wholesaleEnabled = false,
  baseWholesalePrice,
  productName = '',
  storeName = '',
  loading,
  error,
  onRetry,
  display = {},
  onDisplayChange,
}) => {
  const { options, rows } = value;
  const [customName, setCustomName] = useState('');
  const [bulk, setBulk] = useState({ price: '', salePrice: '', stock: '', wholesalePrice: '' });
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelLayout, setLabelLayout] = useState<LabelLayout>('roll38');
  const [labelCopies, setLabelCopies] = useState<'one' | 'stock'>('one');
  const [labelPrice, setLabelPrice] = useState(true);
  const [generatedNote, setGeneratedNote] = useState('');
  /** v3.10 — the media library, opened from an option's picture box */
  const [pickerFor, setPickerFor] = useState<{ title: string; apply: (url: string) => void } | null>(null);

  const libraryChoices = useMemo(
    () =>
      library.filter(
        (attribute) =>
          !options.some((option) => option.name.toLowerCase() === String(attribute.name).toLowerCase())
      ),
    [library, options]
  );

  const setOptions = (next: VariationOption[]) => {
    setGeneratedNote('');
    onChange({ ...value, options: next });
  };
  const setRows = (next: VariationRow[]) => onChange({ ...value, rows: next });

  const addOption = (name: string) => {
    const clean = name.trim();
    if (!clean || options.some((option) => option.name.toLowerCase() === clean.toLowerCase())) return;
    setOptions([...options, { name: clean, values: [] }]);
  };

  const updateOption = (index: number, values: string[]) =>
    setOptions(options.map((option, i) => (i === index ? { ...option, values } : option)));

  const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));

  const usableOptions = options.filter((option) => option.values.length > 0);
  const comboCount = usableOptions.length
    ? usableOptions.reduce((product, option) => product * option.values.length, 1)
    : 0;

  const generate = () => {
    const existing = new Map<string, VariationRow>(
      rows.map((row) => [combinationKey(row.combination), row] as [string, VariationRow])
    );
    const combos = cartesian(usableOptions);
    let kept = 0;
    const next = combos.map((combination): VariationRow => {
      const match = existing.get(combinationKey(combination));
      if (match) {
        kept += 1;
        return { ...match, combination };
      }
      return {
        key: nextKey(),
        combination,
        sku: '',
        barcode: '',
        price: '',
        salePrice: '',
        wholesalePrice: '',
        stock: '0',
        image: '',
        status: 'active' as const,
      };
    });
    const dropped = rows.length - kept;
    setRows(next);
    setGeneratedNote(
      `${next.length} ${next.length === 1 ? 'variation' : 'variations'} generated` +
        (kept ? ` · ${kept} kept with their existing data` : '') +
        (dropped > 0 ? ` · ${dropped} removed` : '')
    );
  };

  const patchRow = (key: string, patch: Partial<VariationRow>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const applyBulk = () => {
    const patch: Partial<VariationRow> = {};
    if (bulk.price.trim() !== '') patch.price = bulk.price;
    if (bulk.salePrice.trim() !== '') patch.salePrice = bulk.salePrice;
    if (bulk.stock.trim() !== '') patch.stock = bulk.stock;
    if (wholesaleEnabled && bulk.wholesalePrice.trim() !== '') patch.wholesalePrice = bulk.wholesalePrice;
    if (Object.keys(patch).length === 0) return;
    setRows(rows.map((row) => ({ ...row, ...patch })));
    setBulk({ price: '', salePrice: '', stock: '', wholesalePrice: '' });
  };

  /** Fills every empty barcode with a new in-store code (20…, EAN-13 valid) */
  const generateBarcodes = () => {
    const taken = new Set<string>(rows.map((row) => row.barcode).filter(Boolean));
    setRows(
      rows.map((row) => {
        if (row.barcode.trim()) return row;
        const code = generateStoreBarcode(taken);
        taken.add(code);
        return { ...row, barcode: code };
      })
    );
  };
  const missingBarcodes = rows.filter((row) => !row.barcode.trim()).length;

  const printLabels = () => {
    const priceOf = (row: VariationRow) => {
      const sale = Number(row.salePrice);
      const regular = Number(row.price);
      return sale > 0 ? sale : regular > 0 ? regular : Number(basePrice) || null;
    };
    const ok = printBarcodeLabels(
      rows
        .filter((row) => row.barcode.trim() && row.status === 'active')
        .map((row) => ({
          name: productName || 'Product',
          option: variationLabel(row.combination),
          price: priceOf(row),
          code: row.barcode.trim(),
          copies: labelCopies === 'stock' ? Math.max(1, Number(row.stock) || 1) : 1,
        })),
      { layout: labelLayout, currency, showPrice: labelPrice, storeName }
    );
    if (ok) setLabelsOpen(false);
  };

  const totalStock = totalVariationStock(rows);
  const activeCount = rows.filter((row) => row.status === 'active').length;
  const fallbackPrice = basePrice === '' || basePrice == null ? '' : String(basePrice);

  if (loading) {
    return (
      <Card>
        <SectionLoader lines={4} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card padded={false}>
        <ErrorState message={error} onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1 — options */}
      <Card>
        <CardHeader
          title="1. Options"
          subtitle="Choose the attributes this product varies by (e.g. color, size) and select their values"
          icon={Layers}
        />

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          {libraryChoices.length > 0 && (
            <Select
              value=""
              onChange={(name) => name && addOption(name)}
              className="sm:w-[220px]"
              options={[
                { value: '', label: 'Choose from attribute library' },
                ...libraryChoices.map((attribute) => ({ value: attribute.name, label: attribute.name })),
              ]}
            />
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              className="a-field flex-1 min-w-0"
              value={customName}
              placeholder="Or enter a custom option name"
              onChange={(event) => setCustomName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOption(customName);
                  setCustomName('');
                }
              }}
            />
            <Button
              icon={Plus}
              onClick={() => {
                addOption(customName);
                setCustomName('');
              }}
              disabled={!customName.trim()}
            >
              Add
            </Button>
          </div>
        </div>

        {options.length === 0 ? (
          <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
            No options selected yet. Pick one from the list above, or type a new name and add it.
          </p>
        ) : (
          <div className="space-y-3">
            {options.map((option, index) => {
              const libraryValues =
                library.find((attribute) => String(attribute.name).toLowerCase() === option.name.toLowerCase())
                  ?.values || [];
              const available = [
                ...libraryValues,
                ...option.values.filter((v) => !libraryValues.includes(v)),
              ];
              return (
                <div
                  key={option.name}
                  className="p-3"
                  style={{
                    borderRadius: 'var(--ds-r-md)',
                    border: '1px solid var(--a-border)',
                    background: 'var(--a-surface-2)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {option.name}
                      <span
                        className="ds-num ml-2 font-semibold"
                        style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                      >
                        {option.values.length} selected
                      </span>
                    </span>
                    <IconButton
                      icon={X}
                      size="sm"
                      tone="plain"
                      label={`Remove ${option.name}`}
                      onClick={() => removeOption(index)}
                    />
                  </div>
                  {onDisplayChange && (
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                      <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Show on the product page as</span>
                      {(
                        [
                          ['text', 'Text', Type],
                          ['image', 'Picture', ImageIcon],
                          ['color', 'Colour dot', PaintBucket],
                        ] as const
                      ).map(([mode, label, Icon]) => {
                        const current = display[option.name] || 'text';
                        const on = current === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onDisplayChange({ ...display, [option.name]: mode })}
                            className="inline-flex items-center gap-1.5 px-2.5 font-semibold cursor-pointer"
                            style={{
                              height: 28,
                              borderRadius: 'var(--ds-r-sm)',
                              fontSize: 'var(--a-fs-sm)',
                              background: on ? tint(0.12) : 'var(--a-surface)',
                              color: on ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
                              border: `1px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`,
                            }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {display[option.name] === 'image' && option.values.length > 0 && (
                    <div className="mb-3 p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface)', border: '1px solid var(--a-border-soft)' }}>
                      <p className="mb-2.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        Tap a box to choose the picture customers see for each {option.name.toLowerCase()}.
                      </p>
                      {rows.length === 0 ? (
                        <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          Generate the variations first, then pick a picture for each {option.name.toLowerCase()}.
                        </p>
                      ) : (
                        <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 104px))' }}>
                          {option.values.map((item) => {
                            const withImage = rows.find((row) => row.combination[option.name] === item && row.image);
                            const setPicture = (url: string) =>
                              setRows(rows.map((row) => (row.combination[option.name] === item ? { ...row, image: url } : row)));
                            return (
                              <div key={item} className="min-w-0">
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setPickerFor({ title: `${option.name}: ${item}`, apply: setPicture })}
                                    aria-label={`${withImage ? 'Change' : 'Choose'} the picture for ${item}`}
                                    className="group relative block w-full overflow-hidden cursor-pointer"
                                    style={{
                                      aspectRatio: '1 / 1',
                                      borderRadius: 'var(--ds-r-md)',
                                      border: withImage ? '1px solid var(--a-border)' : '1.5px dashed var(--a-border-strong)',
                                      background: 'var(--a-surface-2)',
                                    }}
                                  >
                                    {withImage ? (
                                      <>
                                        <img src={withImage.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                                        <span
                                          className="absolute inset-x-0 bottom-0 py-1 text-center font-semibold text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                                          style={{ fontSize: 'var(--a-fs-xs)', background: 'rgba(15,23,42,.62)' }}
                                        >
                                          Change
                                        </span>
                                      </>
                                    ) : (
                                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1" style={{ color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-xs)' }}>
                                        <ImageIcon className="w-5 h-5" />
                                        Add picture
                                      </span>
                                    )}
                                  </button>
                                  {withImage && (
                                    <button
                                      type="button"
                                      onClick={() => setPicture('')}
                                      aria-label={`Remove the picture for ${item}`}
                                      title="Remove picture"
                                      className="absolute inline-flex items-center justify-center cursor-pointer"
                                      style={{
                                        top: -7,
                                        right: -7,
                                        width: 22,
                                        height: 22,
                                        borderRadius: 999,
                                        background: 'var(--a-surface)',
                                        border: '1px solid var(--a-border-strong)',
                                        color: 'var(--ds-danger)',
                                        boxShadow: 'var(--ds-shadow-sm)',
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="mt-1.5 text-center font-semibold truncate" style={{ fontSize: 'var(--a-fs-sm)' }} title={item}>
                                  {item}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {available.map((item) => {
                      const on = option.values.includes(item);
                      return (
                        <Chip
                          key={item}
                          on={on}
                          onClick={() =>
                            updateOption(
                              index,
                              on ? option.values.filter((v) => v !== item) : [...option.values, item]
                            )
                          }
                        >
                          {item}
                        </Chip>
                      );
                    })}
                    <ValueAdder
                      onAdd={(item) => {
                        if (!option.values.includes(item)) updateOption(index, [...option.values, item]);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
          <span style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
            {generatedNote ||
              (comboCount > 0 ? (
                <>
                  <span className="ds-num">{comboCount}</span> combinations will be created. Stock and prices of
                  matching existing rows will be kept.
                </>
              ) : (
                'Select values to generate combinations.'
              ))}
          </span>
          <Button variant="primary" icon={Wand2} onClick={generate} disabled={comboCount === 0}>
            Generate Variations
          </Button>
        </div>
      </Card>

      {/* Step 2 — rows */}
      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="2. Variations"
            subtitle="Enter stock for each. Leave the price blank to use the product's base price."
            icon={Boxes}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No variations"
            description="Choose options above and click “Generate Variations”. Without variations, the product is sold as a simple single product."
            icon={Layers}
          />
        ) : (
          <>
            <div
              className="mx-5 mb-4 p-3 flex flex-col gap-2"
              style={{ borderRadius: 'var(--ds-r-md)', background: tint(0.06), border: `1px solid ${tint(0.16)}` }}
            >
              <div
                className="font-semibold flex items-center gap-2"
                style={{ fontSize: 'var(--a-fs-base)', color: 'var(--primary-ink, var(--primary))' }}
              >
                <PaintBucket className="w-4 h-4" />
                Set prices and stock for all variations at once
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className={`grid gap-2 flex-1 ${wholesaleEnabled ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="a-field ds-num"
                  style={cellInput}
                  placeholder={`Price (${currency})`}
                  value={bulk.price}
                  onChange={(event) => setBulk({ ...bulk, price: event.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="a-field ds-num"
                  style={cellInput}
                  placeholder={`Sale price (${currency})`}
                  value={bulk.salePrice}
                  onChange={(event) => setBulk({ ...bulk, salePrice: event.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  className="a-field ds-num"
                  style={cellInput}
                  placeholder="Stock"
                  value={bulk.stock}
                  onChange={(event) => setBulk({ ...bulk, stock: event.target.value })}
                />
                {wholesaleEnabled && (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="a-field ds-num"
                    style={cellInput}
                    placeholder={`Wholesale (${currency})`}
                    aria-label="Wholesale price for all variations"
                    value={bulk.wholesalePrice}
                    onChange={(event) => setBulk({ ...bulk, wholesalePrice: event.target.value })}
                  />
                )}
              </div>
              <Button
                size="sm"
                variant="soft"
                onClick={applyBulk}
                disabled={!bulk.price.trim() && !bulk.salePrice.trim() && !bulk.stock.trim() && !(wholesaleEnabled && bulk.wholesalePrice.trim())}
              >
                Apply to All
              </Button>
              </div>
            </div>

            {/* POS barcodes: one per option, so a scan adds the exact size/colour */}
            <div className="mx-5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="flex items-center gap-2" style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
                <Barcode className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                Give each variation its own barcode — scanning it at the POS adds that exact option.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="soft" icon={Wand2} onClick={generateBarcodes} disabled={missingBarcodes === 0}>
                  {missingBarcodes > 0 ? `Generate ${missingBarcodes} barcode${missingBarcodes === 1 ? '' : 's'}` : 'All have barcodes'}
                </Button>
                <Button size="sm" icon={Printer} onClick={() => setLabelsOpen(true)} disabled={rows.every((row) => !row.barcode.trim())}>
                  Print labels
                </Button>
              </div>
            </div>

            <div className="px-5">
              <TableWrap>
                <table style={{ minWidth: wholesaleEnabled ? 1200 : 1080 }}>
                  <thead>
                    <tr>
                      <th>Variation</th>
                      <th>SKU</th>
                      <th>Barcode (POS)</th>
                      <th style={{ textAlign: 'right' }}>Price ({currency})</th>
                      <th style={{ textAlign: 'right' }}>Sale Price</th>
                      {wholesaleEnabled && <th style={{ textAlign: 'right', color: 'var(--ds-indigo)' }}>Wholesale</th>}
                      <th style={{ textAlign: 'right' }}>
                        Stock <span style={{ color: 'var(--ds-danger)' }}>*</span>
                      </th>
                      <th>Image</th>
                      <th style={{ textAlign: 'center' }}>Active</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const label = variationLabel(row.combination);
                      const stockInvalid =
                        row.stock.trim() === '' || !Number.isFinite(Number(row.stock)) || Number(row.stock) < 0;
                      return (
                        <tr key={row.key} style={row.status === 'inactive' ? { opacity: 0.6 } : undefined}>
                          <td>
                            <div className="font-semibold whitespace-nowrap" style={{ fontSize: 'var(--a-fs-md)' }}>
                              {label || '—'}
                            </div>
                          </td>
                          <td>
                            <input
                              className="a-field ds-num"
                              style={{ ...cellInput, width: 130 }}
                              value={row.sku}
                              placeholder="Auto"
                              aria-label={`${label} SKU`}
                              onChange={(event) => patchRow(row.key, { sku: event.target.value })}
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <input
                                className="a-field ds-num"
                                style={{ ...cellInput, width: 140 }}
                                value={row.barcode}
                                placeholder="Scan or generate"
                                aria-label={`${label} barcode`}
                                onChange={(event) => patchRow(row.key, { barcode: event.target.value })}
                              />
                              {!row.barcode.trim() && (
                                <IconButton
                                  icon={Wand2}
                                  size="sm"
                                  tone="plain"
                                  label={`Generate a barcode for ${label}`}
                                  onClick={() =>
                                    patchRow(row.key, { barcode: generateStoreBarcode(rows.map((item) => item.barcode).filter(Boolean)) })
                                  }
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="a-field ds-num"
                              style={{ ...cellInput, width: 100, textAlign: 'right' }}
                              value={row.price}
                              placeholder={fallbackPrice || '—'}
                              aria-label={`${label} price`}
                              onChange={(event) => patchRow(row.key, { price: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="a-field ds-num"
                              style={{ ...cellInput, width: 100, textAlign: 'right' }}
                              value={row.salePrice}
                              placeholder="—"
                              aria-label={`${label} sale price`}
                              onChange={(event) => patchRow(row.key, { salePrice: event.target.value })}
                            />
                          </td>
                          {wholesaleEnabled && (
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="a-field ds-num"
                                style={{ ...cellInput, width: 100, textAlign: 'right', borderColor: 'var(--ds-indigo)' }}
                                value={row.wholesalePrice}
                                placeholder={baseWholesalePrice === '' || baseWholesalePrice == null ? '—' : String(baseWholesalePrice)}
                                aria-label={`${label} wholesale price`}
                                onChange={(event) => patchRow(row.key, { wholesalePrice: event.target.value })}
                              />
                            </td>
                          )}
                          <td>
                            <input
                              type="number"
                              min={0}
                              required
                              className={`a-field ds-num ${stockInvalid ? 'a-field-error' : ''}`}
                              style={{ ...cellInput, width: 84, textAlign: 'right' }}
                              value={row.stock}
                              aria-label={`${label} stock`}
                              aria-invalid={stockInvalid || undefined}
                              onChange={(event) => patchRow(row.key, { stock: event.target.value })}
                            />
                          </td>
                          <td style={{ minWidth: 200 }}>
                            <MediaPicker
                              value={row.image}
                              onChange={(url) => patchRow(row.key, { image: url })}
                              modalTitle={`${label} — Select Image`}
                              hideUrlInput
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="inline-flex">
                              <Toggle
                                checked={row.status === 'active'}
                                onChange={(on) => patchRow(row.key, { status: on ? 'active' : 'inactive' })}
                              />
                            </div>
                          </td>
                          <td>
                            <IconButton
                              icon={Trash2}
                              size="sm"
                              tone="danger"
                              label={`Delete ${label}`}
                              onClick={() => setRows(rows.filter((item) => item.key !== row.key))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}

        <div
          className="mt-4 px-5 py-3 border-t flex flex-wrap items-center gap-x-5 gap-y-1"
          style={{
            borderColor: 'var(--a-border)',
            background: 'var(--a-surface-2)',
            fontSize: 'var(--a-fs-md)',
            color: 'var(--a-text-soft)',
            borderBottomLeftRadius: 'var(--a-radius)',
            borderBottomRightRadius: 'var(--a-radius)',
          }}
        >
          <span>
            Variations: <strong className="ds-num">{rows.length}</strong>
          </span>
          <span>
            Active: <strong className="ds-num">{activeCount}</strong>
          </span>
          <span>
            Total Stock: <strong className="ds-num">{totalStock}</strong>
          </span>
          <span>
            Barcodes: <strong className="ds-num">{rows.length - missingBarcodes}</strong>/{rows.length}
          </span>
        </div>
      </Card>

      <Modal
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        title="Print barcode labels"
        subtitle="Stick one on each item; scanning it at the POS adds that exact option."
        footer={
          <>
            <Button onClick={() => setLabelsOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Printer} onClick={printLabels}>
              Print
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label size">
            <Select value={labelLayout} onChange={(value) => setLabelLayout(value as LabelLayout)} options={LABEL_LAYOUTS} />
          </Field>
          <Field label="How many">
            <Select
              value={labelCopies}
              onChange={(value) => setLabelCopies(value === 'stock' ? 'stock' : 'one')}
              options={[
                { value: 'one', label: 'One label per variation' },
                { value: 'stock', label: 'One label per item in stock' },
              ]}
            />
          </Field>
          <Toggle checked={labelPrice} onChange={setLabelPrice} label="Show the price on the label" />
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            Only active variations with a barcode are printed. Save the product first so the POS knows the new barcodes.
          </p>
        </div>
      </Modal>

      <MediaLibraryModal
        isOpen={Boolean(pickerFor)}
        onClose={() => setPickerFor(null)}
        onSelect={(url) => pickerFor?.apply(url)}
        title={pickerFor?.title || 'Select Image'}
      />
    </div>
  );
};
