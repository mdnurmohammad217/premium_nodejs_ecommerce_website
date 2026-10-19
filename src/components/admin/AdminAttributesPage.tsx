import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  ChevronRight,
  Tags,
  MousePointerClick,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  IconButton,
  Badge,
  SearchInput,
  EmptyState,
  ErrorState,
  SectionLoader,
  ConfirmDialog,
  Field,
  Modal,
  useToasts,
  ACCENTS,
  tint,
} from './ui.tsx';

interface Attribute {
  id: number;
  name: string;
  slug: string;
  values: string[];
  sortOrder?: number;
}

/**
 * Attributes — the option sets a product can carry (Dosage, Pack Size, Type).
 * The list of sets sits on the left and the selected set's values on the right,
 * so adding ten values is ten keystrokes and Enter rather than ten dialogs.
 */
export const AdminAttributesPage: React.FC = () => {
  const toasts = useToasts();
  const [rows, setRows] = useState<Attribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValues, setNewValues] = useState('');

  const [renaming, setRenaming] = useState<Attribute | null>(null);
  const [renameText, setRenameText] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Attribute | null>(null);
  const [valueInput, setValueInput] = useState('');
  const [addingValue, setAddingValue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/attributes');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: Attribute[] = Array.isArray(data)
        ? data.map((row: any) => ({ ...row, values: Array.isArray(row.values) ? row.values : [] }))
        : [];
      setRows(list);
      setSelectedId((current) =>
        current && list.some((row) => row.id === current) ? current : list[0]?.id ?? null
      );
    } catch {
      setError('Could not load attributes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        row.values.some((value) => value.toLowerCase().includes(term))
    );
  }, [rows, search]);

  const selected = rows.find((row) => row.id === selectedId) || null;
  const totalValues = useMemo(() => rows.reduce((sum, row) => sum + row.values.length, 0), [rows]);

  /** Every value change is a PUT of the whole list — the endpoint replaces it */
  const saveValues = async (attribute: Attribute, values: string[]) => {
    const res = await fetch(`/api/admin/attributes/${attribute.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'failed');
    setRows((list) => list.map((row) => (row.id === attribute.id ? { ...row, values } : row)));
  };

  const create = async () => {
    if (!newName.trim()) return toasts.push('Enter an attribute name.', 'error');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), values: newValues }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push('Attribute created.');
      setCreateOpen(false);
      setNewName('');
      setNewValues('');
      await load();
      if (data?.id) setSelectedId(data.id);
    } catch (err: any) {
      toasts.push(err.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    if (!renameText.trim()) return toasts.push('Enter an attribute name.', 'error');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/attributes/${renaming.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push('Name updated.');
      setRenaming(null);
      load();
    } catch (err: any) {
      toasts.push(err.message || 'Could not update.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/attributes/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('Attribute deleted.');
      setConfirmDelete(null);
      if (selectedId === confirmDelete.id) setSelectedId(null);
      load();
    } catch {
      toasts.push('Could not delete.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addValue = async () => {
    if (!selected) return;
    const entries = valueInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => !selected.values.includes(value));

    if (entries.length === 0) {
      setValueInput('');
      return;
    }

    setAddingValue(true);
    try {
      await saveValues(selected, [...selected.values, ...entries]);
      setValueInput('');
    } catch {
      toasts.push('Could not add the value.', 'error');
    } finally {
      setAddingValue(false);
    }
  };

  const removeValue = async (attribute: Attribute, value: string) => {
    try {
      await saveValues(
        attribute,
        attribute.values.filter((item) => item !== value)
      );
    } catch {
      toasts.push('Could not delete the value.', 'error');
    }
  };

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Attributes"
        subtitle="Product variation sets — attributes added here can be selected in the product form"
        icon={Layers}
        accent={ACCENTS.indigo}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setNewName('');
                setNewValues('');
                setCreateOpen(true);
              }}
            >
              Add Attribute
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ------------------------------------------------ list of attributes */}
        <Card className="lg:col-span-5 xl:col-span-4" padded={false}>
          <div className="p-3 border-b" style={{ borderColor: 'var(--a-border)' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search attributes or values" />
            <div
              className="flex items-center gap-3 mt-2.5 px-1"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
            >
              <span>
                <span className="ds-num font-bold" style={{ color: 'var(--a-text)' }}>
                  {rows.length}
                </span>{' '}
                attributes
              </span>
              <span>
                <span className="ds-num font-bold" style={{ color: 'var(--a-text)' }}>
                  {totalValues}
                </span>{' '}
                values
              </span>
            </div>
          </div>

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : loading ? (
            <div className="p-4">
              <SectionLoader lines={6} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'Nothing found' : 'No attributes yet'}
              description={
                search
                  ? 'Try a different name.'
                  : 'For example, create an attribute called "Dosage" and add values like 500mg and 20mg.'
              }
              icon={Layers}
            />
          ) : (
            <ul className="list-none m-0 p-2 space-y-1">
              {filtered.map((row) => {
                const isActive = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer transition-colors"
                      style={{
                        borderRadius: 'var(--ds-r-md)',
                        background: isActive ? tint(0.1) : 'transparent',
                        color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text)',
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {row.name}
                        </span>
                        <span
                          className="block truncate"
                          style={{
                            fontSize: 'var(--a-fs-sm)',
                            color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-muted)',
                          }}
                        >
                          {row.values.length > 0 ? row.values.join(', ') : 'No values'}
                        </span>
                      </span>

                      <span
                        className="ds-num shrink-0 inline-flex items-center justify-center font-bold"
                        style={{
                          minWidth: 26,
                          height: 22,
                          padding: '0 6px',
                          borderRadius: 'var(--ds-r-full)',
                          background: isActive ? 'var(--primary)' : 'var(--a-surface-3)',
                          color: isActive ? 'var(--primary-foreground)' : 'var(--a-text-soft)',
                          fontSize: 'var(--a-fs-sm)',
                        }}
                      >
                        {row.values.length}
                      </span>

                      <ChevronRight
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ opacity: isActive ? 1 : 0.3 }}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* -------------------------------------------- values of the selected */}
        <div className="lg:col-span-7 xl:col-span-8">
          {loading && !selected ? (
            <Card>
              <SectionLoader lines={4} />
            </Card>
          ) : !selected ? (
            <Card>
              <EmptyState
                title="Select an attribute"
                description="Pick an attribute from the list on the left to see its values here."
                icon={MousePointerClick}
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={selected.name}
                subtitle={`/${selected.slug}`}
                icon={Tags}
                accent={ACCENTS.indigo}
                actions={
                  <>
                    <IconButton
                      icon={Pencil}
                      tone="primary"
                      label="Rename"
                      onClick={() => {
                        setRenaming(selected);
                        setRenameText(selected.name);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label="Delete Attribute"
                      onClick={() => setConfirmDelete(selected)}
                    />
                  </>
                }
              />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  className="a-field flex-1"
                  value={valueInput}
                  onChange={(event) => setValueInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addValue();
                    }
                  }}
                  placeholder="Type a new value and press Enter"
                />
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={addValue}
                  loading={addingValue}
                  disabled={!valueInput.trim()}
                  className="shrink-0"
                >
                  Add Value
                </Button>
              </div>

              <div className="mt-4">
                {selected.values.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center text-center gap-1 py-8 px-4"
                    style={{
                      borderRadius: 'var(--ds-r-lg)',
                      border: '1px dashed var(--a-border-strong)',
                      background: 'var(--a-surface-2)',
                    }}
                  >
                    <Tags className="w-5 h-5" style={{ color: 'var(--a-text-faint)' }} />
                    <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      No values
                    </span>
                    <span style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
                      Add values in the field above — separate several with commas.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="a-label" style={{ marginBottom: 0 }}>
                        Values
                      </span>
                      <Badge tone={{ bg: 'var(--a-surface-3)', fg: 'var(--a-text-soft)' }}>
                        <span className="ds-num">{selected.values.length}</span> values
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selected.values.map((value) => (
                        <span
                          key={value}
                          className="inline-flex items-center gap-1.5 pl-3 pr-1.5"
                          style={{
                            height: 'var(--ds-h-sm)',
                            borderRadius: 'var(--ds-r-full)',
                            background: 'var(--a-surface-2)',
                            border: '1px solid var(--a-border)',
                            fontSize: 'var(--a-fs-md)',
                            fontWeight: 'var(--ds-fw-semibold)',
                          }}
                        >
                          {value}
                          <button
                            type="button"
                            onClick={() => removeValue(selected, value)}
                            aria-label={`Delete ${value}`}
                            title={`Delete ${value}`}
                            className="inline-flex items-center justify-center cursor-pointer transition-colors"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 'var(--ds-r-full)',
                              color: 'var(--a-text-muted)',
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Attribute"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} loading={saving}>
              Create Attribute
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Attribute name" required>
            <input
              className="a-field"
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Dosage, Pack Size"
            />
          </Field>
          <Field label="Values">
            <textarea
              className="a-field"
              rows={3}
              value={newValues}
              onChange={(event) => setNewValues(event.target.value)}
              placeholder="Separate with commas — e.g. 10mg, 50mg, 100mg"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename Attribute"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" onClick={rename} loading={saving}>
              Save Changes
            </Button>
          </>
        }
      >
        <Field label="Attribute name" required>
          <input
            className="a-field"
            autoFocus
            value={renameText}
            onChange={(event) => setRenameText(event.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete attribute?"
        message={`"${confirmDelete?.name || ''}" and all its values will be deleted — it will also be removed from any products that use it.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
