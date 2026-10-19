import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus, Pencil, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  SearchInput,
  Toolbar,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  Modal,
  ConfirmDialog,
  Field,
  Toggle,
  useToasts,
  ACCENTS,
} from './ui.tsx';

interface GenericRow {
  id: number;
  name: string;
  description?: string | null;
  productCount: number;
}

/**
 * Dashboard → Products → Generic Names.
 * The list the product form suggests from. On the website a product's generic
 * name links to every product that shares it (/shop?generic=…).
 */
export const AdminGenericsPage: React.FC = () => {
  const toasts = useToasts();
  const [rows, setRows] = useState<GenericRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; name: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState<GenericRow | null>(null);
  const [clearProducts, setClearProducts] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/generics');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load generic names.');
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? rows.filter((row) => row.name.toLowerCase().includes(term)) : rows;
  }, [rows, search]);

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      toasts.push('Enter a generic name.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(editing.id ? `/api/admin/generics/${editing.id}` : '/api/admin/generics', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: editing.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      toasts.push(
        editing.id
          ? data.renamedProducts
            ? `Saved. Renamed on ${data.renamedProducts} product${data.renamedProducts === 1 ? '' : 's'}.`
            : 'Saved.'
          : `"${name}" added.`
      );
      setEditing(null);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/generics/${deleting.id}${clearProducts ? '?clearProducts=1' : ''}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      toasts.push(`"${deleting.name}" removed.`);
      setDeleting(null);
      setClearProducts(false);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Generic Names"
        subtitle="Generic names you pick on products. On the website each one links to all products that share it."
        icon={FlaskConical}
        accent={ACCENTS.teal}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ id: null, name: '', description: '' })}>
              Add Generic Name
            </Button>
          </>
        }
      />

      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search generic names" className="w-full sm:w-80" />
        </Toolbar>
      </Card>

      <TableWrap>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>Generic Name</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Products</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <LoadingRows rows={6} cols={4} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={FlaskConical}
                      title={search ? 'No match' : 'No generic names yet'}
                      description="Add one here, or type a generic name on a product — it is added to this list automatically."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="font-semibold">{row.name}</td>
                    <td style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{row.description || '—'}</td>
                    <td className="ds-num" style={{ textAlign: 'right' }}>
                      {row.productCount}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <IconButton
                          icon={ExternalLink}
                          label="View on website"
                          onClick={() => window.open(`/shop?generic=${encodeURIComponent(row.name)}`, '_blank', 'noopener')}
                        />
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          onClick={() => setEditing({ id: row.id, name: row.name, description: row.description || '' })}
                        />
                        <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(row)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </TableWrap>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Generic Name' : 'Add Generic Name'}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Generic Name" required hint={editing.id ? 'Renaming also renames it on every product that uses it.' : undefined}>
              <input
                className="a-field"
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="e.g. Paracetamol"
              />
            </Field>
            <Field label="Description" hint="Optional, for your own reference.">
              <textarea
                className="a-field"
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.name || ''}"?`}
        message="It is removed from the generic name list."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => {
          setDeleting(null);
          setClearProducts(false);
        }}
      >
        {deleting && deleting.productCount > 0 && (
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: 'var(--a-surface-2, var(--ds-surface-2))', border: '1px solid var(--a-border, var(--ds-border))' }}
          >
            <Toggle
              checked={clearProducts}
              onChange={setClearProducts}
              label={`Also clear it from ${deleting.productCount} product${deleting.productCount === 1 ? '' : 's'}`}
              description="Leave off to keep the name on those products."
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

