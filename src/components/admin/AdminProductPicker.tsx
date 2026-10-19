import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus } from 'lucide-react';

/**
 * v3.15 — "+ Add product" box that searches the server as you type (20
 * matches at a time). Used where a form used to list the whole catalogue in
 * one dropdown, which does not work with 20 000+ products.
 */
export const AdminProductPicker: React.FC<{
  onPick: (product: any) => void;
  placeholder?: string;
  className?: string;
  /** Only published products */
  activeOnly?: boolean;
  /** Text after the name, e.g. the stock */
  detail?: (product: any) => string;
}> = ({ onPick, placeholder = 'Add a product — type a name, SKU or barcode', className = '', activeOnly = false, detail }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ all: '1', limit: '20' });
      if (query.trim()) params.set('search', query.trim());
      if (activeOnly) params.set('status', 'active');
      const data = await fetch(`/api/admin/products?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []);
      if (cancelled) return;
      setRows(Array.isArray(data) ? data : []);
      setActive(0);
      setBusy(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, activeOnly]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (product: any) => {
    onPick(product);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--a-text-faint)' }} />
      <input
        className="a-field"
        style={{ paddingLeft: 34 }}
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || rows.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((value) => Math.min(rows.length - 1, value + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((value) => Math.max(0, value - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(rows[active]);
          } else if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1 overflow-y-auto"
          style={{
            zIndex: 20,
            maxHeight: 300,
            background: 'var(--a-surface)',
            border: '1px solid var(--a-border-strong)',
            borderRadius: 'var(--ds-r-md)',
            boxShadow: 'var(--ds-shadow-lg)',
          }}
        >
          {rows.length === 0 ? (
            <p className="p-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              {busy ? 'Searching…' : 'No product matches.'}
            </p>
          ) : (
            rows.map((product, index) => (
              <button
                key={product.id}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(product)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer"
                style={{ background: index === active ? 'var(--a-surface-2)' : 'transparent' }}
              >
                {product.image ? (
                  <img src={product.image} alt="" className="w-8 h-8 object-cover shrink-0" style={{ borderRadius: 6 }} loading="lazy" />
                ) : (
                  <span className="w-8 h-8 shrink-0" style={{ borderRadius: 6, background: 'var(--a-surface-3)' }} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    {product.name}
                  </span>
                  <span className="block truncate ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    {[product.sku, detail ? detail(product) : `Stock ${product.stock}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
