import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingBag, Copy, ExternalLink, RefreshCw, Save, AlertTriangle, KeyRound, Package, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, Card, Button, Field, Toggle, StatCard, TableWrap, Thumb, useToasts, ACCENTS } from './ui.tsx';

/**
 * Marketing → Meta Catalog. A product feed Meta Commerce Manager fetches on a
 * schedule, for Facebook/Instagram shops and catalogue (Advantage+) ads. Item
 * ids match what the pixel sends, so ads can show the exact product a visitor
 * looked at.
 */
export const AdminCatalogPage: React.FC = () => {
  const toasts = useToasts();
  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/catalog/summary');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not build the catalog.');
      setData(json);
      setCfg((current: any) => current || json.config);
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    fetch('/api/categories')
      .then((res) => res.json())
      .then((list) => setCategories(Array.isArray(list) ? list : []))
      .catch(() => undefined);
  }, [load]);

  const save = async (regenerateKey = false) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/catalog/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, regenerateKey }),
      });
      if (!res.ok) throw new Error();
      toasts.push(regenerateKey ? 'New feed link created — update it in Commerce Manager.' : 'Catalog settings saved.');
      setCfg(null);
      await load();
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toasts.push('Link copied.');
    } catch {
      toasts.push('Copy failed — select the link and copy it.', 'error');
    }
  };

  const urlBox = (label: string, url?: string) => (
    <Field label={label}>
      <div className="flex gap-2">
        <input className="a-field ds-num" readOnly value={url || ''} onFocus={(e) => e.currentTarget.select()} />
        <Button icon={Copy} onClick={() => url && copy(url)} disabled={!url}>
          Copy
        </Button>
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>
          <Button icon={ExternalLink} disabled={!url}>
            Open
          </Button>
        </a>
      </div>
    </Field>
  );

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Meta Catalog"
        subtitle="Your products as a Facebook & Instagram catalogue — for the shop tab and catalogue ads."
        icon={ShoppingBag}
        accent={ACCENTS.indigo}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Save} onClick={() => save(false)} loading={saving} disabled={!cfg}>
              Save
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Catalog items" value={data?.counts?.items ?? '—'} icon={Package} color={ACCENTS.indigo} loading={loading && !data} />
        <StatCard label="Products" value={data?.counts?.products ?? '—'} icon={ShoppingBag} color={ACCENTS.violet} loading={loading && !data} />
        <StatCard label="In stock" value={data?.counts?.inStock ?? '—'} icon={CheckCircle2} color={ACCENTS.success} loading={loading && !data} />
        <StatCard label="Left out" value={data?.counts?.skipped ?? '—'} icon={XCircle} color={ACCENTS.danger} loading={loading && !data} />
      </div>

      <Card>
        <div className="space-y-3">
          {urlBox('Feed link (CSV) — paste this into Commerce Manager', data?.csvUrl)}
          {urlBox('Same feed as XML (also works for Google Merchant Center)', data?.xmlUrl)}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              The link contains a private key so only Meta can read your feed.
            </p>
            <Button size="sm" icon={KeyRound} onClick={() => save(true)} disabled={!cfg || saving}>
              New private link
            </Button>
          </div>
          {Array.isArray(data?.warnings) && data.warnings.length > 0 && (
            <div className="space-y-1 p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-warning-soft)', color: 'var(--ds-warning-text)' }}>
              {data.warnings.map((warning: string) => (
                <p key={warning} className="flex gap-2" style={{ fontSize: 'var(--a-fs-sm)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2" style={{ fontSize: 'var(--a-fs-lg)' }}>
          Connect it to Meta (one time)
        </h3>
        <ol className="space-y-1.5 list-decimal pl-5" style={{ fontSize: 'var(--a-fs-md)' }}>
          <li>Open <strong>Meta Commerce Manager</strong> → your catalogue (or create one: type <em>E-commerce</em>).</li>
          <li>Go to <strong>Catalogue → Data sources → Add items → Data feed</strong>.</li>
          <li>Choose <strong>Scheduled feed</strong>, paste the CSV link above, and set it to update <strong>every hour</strong> (or daily).</li>
          <li>Choose currency <strong>BDT</strong>, then upload. Meta checks every item and shows any problems.</li>
          <li>
            In <strong>Events Manager</strong>, connect this catalogue to your Pixel. The item ids already match the pixel's
            events, so catalogue ads can show each visitor the products they viewed.
          </li>
        </ol>
      </Card>

      {cfg && (
        <Card>
          <div className="space-y-4">
            <Toggle checked={cfg.enabled !== false} onChange={(value) => setCfg({ ...cfg, enabled: value })} label="Feed ON" description="Off: the link stops working." />
            <Toggle
              checked={cfg.includeOutOfStock !== false}
              onChange={(value) => setCfg({ ...cfg, includeOutOfStock: value })}
              label="Include out-of-stock products"
              description="They are listed as 'out of stock' (Meta stops advertising them). Turn off to leave them out."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Brand for products without a brand" hint="Meta requires a brand on every item.">
                <input className="a-field" value={cfg.brandFallback || ''} onChange={(e) => setCfg({ ...cfg, brandFallback: e.target.value })} />
              </Field>
              <Field label="Google product category" hint="Helps Meta place your products, e.g. Health & Beauty > Health Care.">
                <input className="a-field" value={cfg.googleCategory || ''} onChange={(e) => setCfg({ ...cfg, googleCategory: e.target.value })} />
              </Field>
              <Field label="Website address" hint="Used for product links and images. Must start with https://">
                <input
                  className="a-field ds-num"
                  value={cfg.publicBaseUrl || ''}
                  placeholder={window.location.origin}
                  onChange={(e) => setCfg({ ...cfg, publicBaseUrl: e.target.value })}
                />
              </Field>
            </div>
            {categories.length > 0 && (
              <Field label="Leave these categories out of the catalogue" hint="E.g. prescription medicines Meta does not allow in ads.">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((category) => {
                    const excluded = (cfg.excludeCategoryIds || []).includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            excludeCategoryIds: excluded
                              ? cfg.excludeCategoryIds.filter((id: number) => id !== category.id)
                              : [...(cfg.excludeCategoryIds || []), category.id],
                          })
                        }
                        className="px-2.5 h-8 cursor-pointer"
                        style={{
                          borderRadius: 'var(--ds-r-full)',
                          border: `1px solid ${excluded ? 'var(--ds-danger)' : 'var(--a-border)'}`,
                          background: excluded ? 'var(--ds-danger-soft)' : 'var(--a-surface)',
                          color: excluded ? 'var(--ds-danger-text)' : 'var(--a-text)',
                          textDecoration: excluded ? 'line-through' : 'none',
                          fontSize: 'var(--a-fs-sm)',
                        }}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
          </div>
        </Card>
      )}

      {data?.preview?.length > 0 && (
        <>
          <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
            Preview (first items in the feed)
          </h3>
          <TableWrap>
            <table className="a-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>ID</th>
                  <th>Price</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {data.preview.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Thumb src={item.image_link} alt={item.title} size={40} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate" style={{ maxWidth: 320 }}>{item.title}</div>
                          <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{item.brand}</div>
                        </div>
                      </div>
                    </td>
                    <td className="ds-num" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      {item.id}
                      {item.item_group_id && <div style={{ color: 'var(--a-text-muted)' }}>group {item.item_group_id}</div>}
                    </td>
                    <td className="ds-num" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      {item.sale_price ? (
                        <>
                          <strong>{item.sale_price}</strong>
                          <div style={{ textDecoration: 'line-through', color: 'var(--a-text-muted)' }}>{item.price}</div>
                        </>
                      ) : (
                        item.price
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--a-fs-sm)' }}>{item.availability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}

      {data?.skipped?.length > 0 && (
        <Card>
          <h3 className="font-bold mb-2" style={{ fontSize: 'var(--a-fs-lg)' }}>
            Left out of the catalogue
          </h3>
          <ul className="space-y-1" style={{ fontSize: 'var(--a-fs-md)' }}>
            {data.skipped.map((item: any) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="truncate">{item.name}</span>
                <span style={{ color: 'var(--a-text-muted)' }}>{item.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};
