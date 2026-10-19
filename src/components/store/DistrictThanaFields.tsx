import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Map as MapIcon, ChevronDown, Search, X, Check } from 'lucide-react';
import type { BdDistrict } from '../../lib/bdGeo.ts';
import { placeLabel, type CheckoutGeoConfig } from '../../lib/geoShipping.ts';

/** The district list is ~30 KB, so it is fetched only when a checkout shows these fields */
let geoPromise: Promise<BdDistrict[]> | null = null;
export function loadBdDistricts(): Promise<BdDistrict[]> {
  if (!geoPromise) geoPromise = import('../../lib/bdGeo.ts').then((mod) => mod.BD_DISTRICTS);
  return geoPromise;
}

export function useBdDistricts(active = true): BdDistrict[] {
  const [list, setList] = useState<BdDistrict[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    loadBdDistricts()
      .then((rows) => alive && setList(rows))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active]);
  return list;
}

interface Props {
  config: CheckoutGeoConfig;
  district: string;
  thana: string;
  onChange: (next: { district: string; thana: string }) => void;
  errors?: { district?: string; thana?: string };
  /** Labels shown above the two dropdowns */
  districtLabel?: string;
  thanaLabel?: string;
  /** Visual style: the shop's checkout, or a landing page's own colours */
  variant?: 'store' | 'landing';
  idPrefix?: string;
  /** Landing pages: classes for each select (their own field style) */
  selectClassFor?: (key: 'district' | 'thana') => string;
}

/* ------------------------------------------------------------------------ */
/* v3.12.1 — a dropdown you can type into                                     */
/* ------------------------------------------------------------------------ */

interface Option {
  value: string;
  label: string;
  /** Extra words that also match (the other language) */
  alt: string;
}

/** Lower-case, no spaces or punctuation: "Cox's Bazar" and "coxs bazar" match */
const fold = (text: string) => text.toLowerCase().replace(/[\s.'’()\-_/]+/g, '');

/**
 * Click (or tap) it and a list opens with a search box on top: type a few
 * letters in English or Bangla — "dha", "ঢাকা", "mirpur" — or just scroll the
 * list. Arrow keys, Enter and Escape work too. It replaces the plain browser
 * dropdown, where 64 districts and 500+ thanas could only be scrolled.
 */
const SearchSelect: React.FC<{
  id: string;
  value: string;
  options: Option[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  invalid?: boolean;
  icon: React.ReactNode;
  triggerClass: string;
  landing?: boolean;
  onChange: (value: string) => void;
}> = ({ id, value, options, placeholder, searchPlaceholder, emptyText, disabled, invalid, icon, triggerClass, landing, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;

  const current = options.find((option) => option.value === value);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return options;
    const starts: Option[] = [];
    const contains: Option[] = [];
    for (const option of options) {
      const hay = [fold(option.label), fold(option.alt), fold(option.value)];
      if (hay.some((text) => text.startsWith(q))) starts.push(option);
      else if (hay.some((text) => text.includes(q))) contains.push(option);
    }
    return [...starts, ...contains];
  }, [options, query]);

  const close = (focusTrigger = true) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const at = Math.max(0, options.findIndex((option) => option.value === value));
    setActive(at);
  };

  // Close when clicking or tapping outside
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Focus the search box and bring the list into view when it opens
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      boxRef.current?.querySelector('[data-panel]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Keep the highlighted row visible
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => setActive(0), [query]);

  const choose = (option: Option) => {
    onChange(option.value);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(shown.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">{icon}</span>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openList();
          }
        }}
        className={`${triggerClass} w-full text-left truncate pr-9 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={current ? '' : 'opacity-70'}>{current ? current.label : placeholder}</span>
      </button>
      {/* The shop's field style draws its own arrow; landing pages get this one */}
      {landing && (
        <ChevronDown
          className={`w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      )}

      {open && (
        <div
          data-panel
          // scroll-margin keeps the list clear of the phone's bottom order bar
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 overflow-hidden scroll-mb-28 ${
            landing
              ? 'rounded-xl border border-black/10 bg-white text-[#111827] shadow-2xl'
              : 'rounded-(--ds-r-lg) border border-(--ds-border) bg-(--ds-surface) shadow-(--ds-shadow-xl)'
          }`}
        >
          <div className={`p-2 border-b ${landing ? 'border-black/10' : 'border-(--ds-border-soft)'}`}>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={shown[active] ? `${id}-opt-${active}` : undefined}
                autoComplete="off"
                enterKeyHint="search"
                className={
                  landing
                    ? 'w-full h-11 pl-9 pr-9 rounded-lg border border-black/15 bg-white text-base outline-none focus:border-black/40'
                    : 'ds-input h-11 pl-9 pr-9'
                }
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-[min(300px,45vh)] overflow-y-auto overscroll-contain py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm opacity-70">{emptyText}</li>
            ) : (
              shown.map((option, index) => {
                const selected = option.value === value;
                const highlighted = index === active;
                return (
                  <li
                    key={option.value}
                    id={`${id}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={`mx-1 px-3 min-h-11 flex items-center gap-2 rounded-lg cursor-pointer text-[15px] ${
                      highlighted ? (landing ? 'bg-black/5' : 'bg-(--ds-surface-2)') : ''
                    } ${selected ? 'font-semibold' : ''}`}
                  >
                    <span className="flex-1 min-w-0 truncate">{option.label}</span>
                    {selected && <Check className={`w-4 h-4 shrink-0 ${landing ? '' : 'text-(--primary)'}`} />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Two dropdowns — District (জেলা), then the Thana / Upazila (থানা) of that
 * district. v3.12.1: each one can be searched (English or Bangla) or scrolled.
 */
export const DistrictThanaFields: React.FC<Props> = ({
  config,
  district,
  thana,
  onChange,
  errors = {} as { district?: string; thana?: string },
  districtLabel,
  thanaLabel,
  variant = 'store',
  idPrefix = 'co',
  selectClassFor,
}) => {
  const districts = useBdDistricts(true);
  const selected = useMemo(() => districts.find((d) => d.n === district), [districts, district]);
  const lang = config.language;
  const bn = lang === 'bn';
  // Landing pages are written in Bangla, so their hints are Bangla too
  // unless the shop chose English only
  const bnText = bn || (variant === 'landing' && lang !== 'en');

  const dLabel = districtLabel || (lang === 'en' ? 'District' : bn ? 'জেলা' : 'District (জেলা)');
  const tLabel = thanaLabel || (lang === 'en' ? 'Thana / Upazila' : bn ? 'থানা / উপজেলা' : 'Thana (থানা)');

  const triggerClass = (key: 'district' | 'thana') =>
    selectClassFor ? `${selectClassFor(key)} h-12 pl-9 cursor-pointer` : 'ds-select h-(--ds-h-lg) pl-9 cursor-pointer';

  const districtOptions = useMemo<Option[]>(
    () => districts.map((d) => ({ value: d.n, label: placeLabel(d.n, d.b, lang), alt: `${d.n} ${d.b}` })),
    [districts, lang]
  );
  const thanaOptions = useMemo<Option[]>(
    () => (selected?.t || []).map(([en, bnName]) => ({ value: en, label: placeLabel(en, bnName, lang), alt: `${en} ${bnName}` })),
    [selected, lang]
  );

  return (
    <div className={variant === 'landing' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)'} data-geo-fields>
      <div>
        <label htmlFor={`${idPrefix}-district`} className={variant === 'landing' ? 'lp-geo-label block mb-1.5 text-sm font-semibold' : 'ds-label ds-required'}>
          {dLabel}
        </label>
        <SearchSelect
          id={`${idPrefix}-district`}
          value={district}
          options={districtOptions}
          placeholder={districts.length === 0 ? (bnText ? 'লোড হচ্ছে…' : 'Loading…') : bnText ? 'জেলা বাছাই করুন' : 'Choose district'}
          searchPlaceholder={bnText ? 'জেলা খুঁজুন…' : 'Search… (Dhaka / ঢাকা)'}
          emptyText={bnText ? 'এই নামে কোনো জেলা নেই' : 'No district with that name'}
          disabled={districts.length === 0}
          invalid={Boolean(errors.district)}
          icon={<MapIcon className="w-4 h-4" />}
          triggerClass={`${triggerClass('district')} ${!selectClassFor && errors.district ? 'ds-input-error' : ''}`}
          landing={variant === 'landing'}
          onChange={(next) => onChange({ district: next, thana: '' })}
        />
        {errors.district && <p className={variant === 'landing' ? 'mt-1.5 text-sm font-medium text-red-600' : 'ds-error-text'}>{errors.district}</p>}
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-thana`}
          className={variant === 'landing' ? 'lp-geo-label block mb-1.5 text-sm font-semibold' : `ds-label ${config.requireThana ? 'ds-required' : ''}`}
        >
          {tLabel}
        </label>
        <SearchSelect
          id={`${idPrefix}-thana`}
          value={thana}
          options={thanaOptions}
          placeholder={!selected ? (bnText ? 'আগে জেলা বাছাই করুন' : 'Choose the district first') : bnText ? 'থানা বাছাই করুন' : 'Choose thana'}
          searchPlaceholder={bnText ? 'থানা / উপজেলা খুঁজুন…' : 'Search… (Mirpur / মিরপুর)'}
          emptyText={bnText ? 'এই নামে কোনো থানা নেই' : 'No thana with that name'}
          disabled={!selected}
          invalid={Boolean(errors.thana)}
          icon={<MapPin className="w-4 h-4" />}
          triggerClass={`${triggerClass('thana')} ${!selectClassFor && errors.thana ? 'ds-input-error' : ''}`}
          landing={variant === 'landing'}
          onChange={(next) => onChange({ district, thana: next })}
        />
        {errors.thana && <p className={variant === 'landing' ? 'mt-1.5 text-sm font-medium text-red-600' : 'ds-error-text'}>{errors.thana}</p>}
      </div>
    </div>
  );
};
