import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  FolderTree,
  Home,
  Star,
  RefreshCw,
  GripVertical,
  Layers,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { MediaPicker } from './MediaPicker.tsx';
import {
  PageHeader,
  StatCard,
  Card,
  Button,
  IconButton,
  Badge,
  SearchInput,
  Select,
  Toolbar,
  EmptyState,
  ErrorState,
  SectionLoader,
  Drawer,
  ConfirmDialog,
  Field,
  Toggle,
  Thumb,
  useToasts,
  ACCENTS,
  tint,
} from './ui.tsx';
import { Category } from '../../types/index.ts';

interface CategoryManagerProps {
  onRefreshCategories?: () => void;
}

type Draft = {
  id?: number;
  name: string;
  slug: string;
  image: string;
  parentId: number | null;
  showOnHome: boolean;
  featured: boolean;
  sortOrder: number;
};

const emptyDraft: Draft = {
  name: '',
  slug: '',
  image: '',
  parentId: null,
  showOnHome: false,
  featured: false,
  sortOrder: 0,
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/(^-|-$)/g, '');

const LEVEL_LABEL = ['', 'Main Category', 'Subcategory', 'Sub-subcategory'];
const LEVEL_ACCENT = ['', 'var(--primary)', ACCENTS.indigo, ACCENTS.violet];

/** One rendered line of the tree, carrying what a drag needs to know */
interface TreeRow {
  cat: Category;
  depth: number;
  siblingIds: number[];
}

const flatten = (nodes: Category[]): Category[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children || [])]);

/**
 * Category Manager — three levels (category → subcategory → sub-subcategory)
 * shown as an indented tree. Rows expand to reveal their children, siblings can
 * be dragged into a new order, and the two switches control where a category
 * surfaces on the storefront: "home" gives it its own product section on the
 * home page, "featured" puts it in the featured category slider.
 */
export const AdminCategoryManager: React.FC<CategoryManagerProps> = ({ onRefreshCategories }) => {
  const toasts = useToasts();
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  // Top-level rows open themselves the first time the tree arrives, so the
  // second level is visible without a click on a fresh page load.
  const autoExpanded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/categories?tree=1');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const roots: Category[] = Array.isArray(data) ? data : [];
      setTree(roots);
      if (!autoExpanded.current && roots.length > 0) {
        autoExpanded.current = true;
        setExpanded(new Set(roots.filter((node) => (node.children || []).length > 0).map((n) => n.id)));
      }
    } catch {
      setError('Could not load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const afterChange = async () => {
    await load();
    onRefreshCategories?.();
    window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
  };

  const all = useMemo(() => flatten(tree), [tree]);

  const stats = useMemo(
    () => ({
      total: all.length,
      subs: all.filter((cat) => (cat.level || 1) > 1).length,
      home: all.filter((cat) => Boolean(cat.showOnHome)).length,
      featured: all.filter((cat) => Boolean(cat.featured)).length,
    }),
    [all]
  );

  const term = search.trim().toLowerCase();

  /** A node stays in the tree when it — or anything under it — matches */
  const subtreeMatches = useCallback(
    (cat: Category): boolean => {
      const levelOk = levelFilter === 'all' || String(cat.level || 1) === levelFilter;
      const textOk =
        !term ||
        cat.name.toLowerCase().includes(term) ||
        String(cat.slug || '').toLowerCase().includes(term);
      if (levelOk && textOk) return true;
      return (cat.children || []).some(subtreeMatches);
    },
    [term, levelFilter]
  );

  const filtering = Boolean(term) || levelFilter !== 'all';

  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (nodes: Category[], depth: number) => {
      const visible = nodes.filter(subtreeMatches);
      const siblingIds = visible.map((node) => node.id);
      for (const node of visible) {
        out.push({ cat: node, depth, siblingIds });
        const children = node.children || [];
        // While a filter is on the whole matching path stays open, so a deep hit
        // is never hidden behind a collapsed parent.
        if (children.length > 0 && (filtering || expanded.has(node.id))) walk(children, depth + 1);
      }
    };
    walk(tree, 1);
    return out;
  }, [tree, expanded, subtreeMatches, filtering]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(new Set(all.filter((c) => (c.children || []).length > 0).map((c) => c.id)));

  /* ------------------------------------------------------------------ form */

  const descendantIds = (cat?: Category): number[] =>
    cat ? flatten(cat.children || []).map((node) => node.id) : [];

  const editingNode = draft.id ? all.find((cat) => cat.id === draft.id) : undefined;
  const blockedParents = draft.id ? [draft.id, ...descendantIds(editingNode)] : [];

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'No parent (main category)' },
      ...all
        .filter((cat) => (cat.level || 1) < 3 && !blockedParents.includes(cat.id))
        .map((cat) => ({
          value: String(cat.id),
          label: `${'— '.repeat((cat.level || 1) - 1)}${cat.name} · ${LEVEL_LABEL[cat.level || 1]}`,
        })),
    ],
    [all, blockedParents.join(',')]
  );

  const openAdd = (parentId: number | null) => {
    setDraft({ ...emptyDraft, parentId });
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (cat: Category) => {
    setDraft({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      image: cat.image || '',
      parentId: cat.parentId ?? null,
      showOnHome: Boolean(cat.showOnHome),
      featured: Boolean(cat.featured),
      sortOrder: cat.sortOrder || 0,
    });
    setFormError('');
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setFormError('Enter a category name.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || slugify(draft.name),
        image: draft.image || null,
        parentId: draft.parentId,
        showOnHome: draft.showOnHome,
        featured: draft.featured,
        sortOrder: draft.sortOrder,
      };

      const res = await fetch(
        draft.id ? `/api/admin/categories/${draft.id}` : '/api/admin/categories',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');

      toasts.push(draft.id ? 'Category updated.' : 'Category added.');
      setDrawerOpen(false);
      setDraft(emptyDraft);
      await afterChange();
    } catch (err: any) {
      setFormError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = async (cat: Category, field: 'showOnHome' | 'featured') => {
    const next = !cat[field];
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cat.name,
          slug: cat.slug,
          image: cat.image,
          icon: cat.icon,
          featured: field === 'featured' ? next : Boolean(cat.featured),
          showOnHome: field === 'showOnHome' ? next : Boolean(cat.showOnHome),
        }),
      });
      if (!res.ok) throw new Error();
      await afterChange();
    } catch {
      toasts.push('Could not update.', 'error');
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      const parts: string[] = [];
      if (data.movedProducts) {
        parts.push(
          `${data.movedProducts} product${data.movedProducts === 1 ? '' : 's'} moved to ${data.movedTo ? 'the parent category' : 'Uncategorised'}`
        );
      }
      if (data.movedSubcategories) {
        parts.push(`${data.movedSubcategories} subcategor${data.movedSubcategories === 1 ? 'y' : 'ies'} moved up one level`);
      }
      toasts.push(parts.length ? `Category deleted. ${parts.join('; ')}.` : 'Category deleted.');
      setConfirmDelete(null);
      await afterChange();
    } catch (err: any) {
      toasts.push(err.message || 'Could not delete.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------------- ordering */

  /** Dropping a row on a sibling moves it there and renumbers that whole level */
  const dropOn = async (row: TreeRow) => {
    const from = dragging;
    setDragging(null);
    setDropTarget(null);
    if (from === null || from === row.cat.id) return;
    if (!row.siblingIds.includes(from)) {
      toasts.push('Categories can only be reordered within the same level.', 'warning');
      return;
    }

    const order = [...row.siblingIds];
    order.splice(order.indexOf(from), 1);
    order.splice(order.indexOf(row.cat.id), 0, from);

    setReordering(true);
    try {
      const res = await fetch('/api/admin/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: order.map((id, index) => ({ id, sortOrder: index + 1 })),
        }),
      });
      if (!res.ok) throw new Error();
      await afterChange();
    } catch {
      toasts.push('Could not save the new order.', 'error');
    } finally {
      setReordering(false);
    }
  };

  /* ----------------------------------------------------------------- render */

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Categories"
        subtitle="A three-level category tree — drag to reorder, and control home page and featured placement"
        icon={FolderTree}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openAdd(null)}>
              Add Category
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Categories" value={stats.total} icon={FolderTree} loading={loading} />
        <StatCard
          label="Subcategories"
          value={stats.subs}
          icon={Layers}
          color={ACCENTS.indigo}
          loading={loading}
        />
        <StatCard
          label="Shown on Home Page"
          value={stats.home}
          icon={Home}
          color={ACCENTS.teal}
          loading={loading}
        />
        <StatCard
          label="Featured"
          value={stats.featured}
          icon={Star}
          color={ACCENTS.amber}
          loading={loading}
        />
      </div>

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by category name or slug"
            className="flex-1 min-w-0"
          />
          <div className="grid grid-cols-2 lg:flex gap-2 shrink-0">
            <Select
              value={levelFilter}
              onChange={setLevelFilter}
              className="lg:w-[170px]"
              options={[
                { value: 'all', label: 'All Levels' },
                { value: '1', label: LEVEL_LABEL[1] },
                { value: '2', label: LEVEL_LABEL[2] },
                { value: '3', label: LEVEL_LABEL[3] },
              ]}
            />
            {expanded.size > 0 ? (
              <Button icon={ChevronsDownUp} onClick={() => setExpanded(new Set())}>
                Collapse All
              </Button>
            ) : (
              <Button icon={ChevronsUpDown} onClick={expandAll}>
                Expand All
              </Button>
            )}
          </div>
        </Toolbar>
      </Card>

      <Card padded={false}>
        {reordering && <div className="ds-progress-line" />}

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3" style={{ paddingLeft: index % 2 ? 26 : 0 }}>
                <span className="ds-skeleton shrink-0" style={{ width: 38, height: 38, borderRadius: 'var(--ds-r-md)' }} />
                <SectionLoader lines={2} className="flex-1" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtering ? 'Nothing found' : 'No categories yet'}
            description={
              filtering
                ? 'Try a different name or level.'
                : 'Add your first category to organise products — you can then nest subcategories inside it.'
            }
            icon={FolderTree}
            action={
              filtering ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    setLevelFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button variant="primary" icon={Plus} onClick={() => openAdd(null)}>
                  Add Category
                </Button>
              )
            }
          />
        ) : (
          <ul className="list-none m-0 p-0">
            {rows.map((row) => {
              const { cat, depth } = row;
              const level = cat.level || 1;
              const children = cat.children || [];
              const isOpen = filtering || expanded.has(cat.id);
              const isDragTarget = dropTarget === cat.id && dragging !== cat.id;

              return (
                <li
                  key={cat.id}
                  draggable
                  onDragStart={() => setDragging(cat.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    if (dragging === null || !row.siblingIds.includes(dragging)) return;
                    event.preventDefault();
                    setDropTarget(cat.id);
                  }}
                  onDragLeave={() => setDropTarget((current) => (current === cat.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropOn(row);
                  }}
                  className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t transition-colors"
                  style={{
                    borderColor: 'var(--a-border-soft)',
                    background: isDragTarget ? tint(0.08) : undefined,
                    opacity: dragging === cat.id ? 0.45 : 1,
                    boxShadow: isDragTarget ? `inset 0 2px 0 0 var(--primary)` : undefined,
                  }}
                >
                  <div
                    className="flex items-center gap-2 min-w-0 flex-1"
                    style={{ paddingLeft: (depth - 1) * 20 }}
                  >
                    <span
                      className="hidden sm:flex items-center shrink-0 cursor-grab active:cursor-grabbing"
                      style={{ color: 'var(--a-text-faint)' }}
                      aria-hidden
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpand(cat.id)}
                      disabled={children.length === 0}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                      aria-expanded={isOpen}
                      className="inline-flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-25 disabled:cursor-default"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 'var(--ds-r-full)',
                        border: '1px solid var(--a-border)',
                        color: 'var(--a-text-soft)',
                        background: children.length > 0 ? 'var(--a-surface)' : 'transparent',
                      }}
                    >
                      <ChevronRight
                        className="w-3.5 h-3.5 transition-transform"
                        style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
                      />
                    </button>

                    <Thumb src={cat.image} alt={cat.name} size={38} />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {cat.name}
                        </span>
                        {cat.showOnHome && (
                          <Badge tone={{ bg: 'var(--ds-teal-soft)', fg: 'var(--ds-teal)' }} dot>
                            On Home Page
                          </Badge>
                        )}
                        {cat.featured && (
                          <Badge tone={{ bg: 'var(--ds-amber-soft)', fg: 'var(--ds-warning-text)' }} dot>
                            Featured
                          </Badge>
                        )}
                      </div>
                      <div
                        className="flex items-center gap-2 flex-wrap mt-0.5"
                        style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                      >
                        <span style={{ color: LEVEL_ACCENT[level], fontWeight: 'var(--ds-fw-semibold)' }}>
                          {LEVEL_LABEL[level]}
                        </span>
                        <span className="truncate">/{cat.slug}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end shrink-0">
                    <span
                      className="inline-flex items-center gap-1 px-2 whitespace-nowrap"
                      style={{
                        height: 'var(--ds-h-sm)',
                        borderRadius: 'var(--ds-r-md)',
                        background: 'var(--a-surface-2)',
                        border: '1px solid var(--a-border)',
                        fontSize: 'var(--a-fs-sm)',
                        color: 'var(--a-text-soft)',
                      }}
                      title="Number of products in this category"
                    >
                      <span className="ds-num font-bold">{cat.productCount || 0}</span> products
                    </span>

                    {children.length > 0 && (
                      <span
                        className="hidden sm:inline-flex items-center gap-1 px-2 whitespace-nowrap"
                        style={{
                          height: 'var(--ds-h-sm)',
                          borderRadius: 'var(--ds-r-md)',
                          background: tint(0.08),
                          fontSize: 'var(--a-fs-sm)',
                          color: 'var(--primary-ink, var(--primary))',
                        }}
                      >
                        <span className="ds-num font-bold">{children.length}</span> sub
                      </span>
                    )}

                    <IconButton
                      icon={Home}
                      size="sm"
                      tone={cat.showOnHome ? 'success' : 'plain'}
                      label={cat.showOnHome ? 'Hide home page section' : 'Show home page section'}
                      onClick={() => toggleFlag(cat, 'showOnHome')}
                    />
                    <IconButton
                      icon={Star}
                      size="sm"
                      tone={cat.featured ? 'warning' : 'plain'}
                      label={cat.featured ? 'Remove from featured' : 'Mark as featured'}
                      onClick={() => toggleFlag(cat, 'featured')}
                    />

                    {level < 3 && (
                      <IconButton
                        icon={Plus}
                        size="sm"
                        label="Add Subcategory"
                        onClick={() => openAdd(cat.id)}
                      />
                    )}
                    <IconButton
                      icon={Pencil}
                      size="sm"
                      tone="primary"
                      label="Edit"
                      onClick={() => openEdit(cat)}
                    />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={`Delete ${cat.name}`}
                      onClick={() => setConfirmDelete(cat)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit Category' : 'New Category'}
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft.id ? 'Save Changes' : 'Add Category'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Category name" required error={formError && !draft.name.trim() ? formError : undefined}>
            <input
              className="a-field"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: current.id ? current.slug : slugify(event.target.value),
                }))
              }
              placeholder="e.g. Tablets"
            />
          </Field>

          <Field label="Slug">
            <div className="flex items-stretch gap-2">
              <input
                className="a-field flex-1"
                value={draft.slug}
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
                placeholder="tablet"
              />
              <IconButton
                icon={RefreshCw}
                label="Generate slug from name"
                onClick={() => setDraft((current) => ({ ...current, slug: slugify(current.name) }))}
              />
            </div>
          </Field>

          <Field label="Parent category">
            <Select
              value={draft.parentId === null ? '' : String(draft.parentId)}
              onChange={(value) =>
                setDraft((current) => ({ ...current, parentId: value ? Number(value) : null }))
              }
              options={parentOptions}
            />
          </Field>

          <Field label="Sort order">
            <input
              type="number"
              min={0}
              className="a-field ds-num"
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
              placeholder="0"
            />
          </Field>

          <MediaPicker
            value={draft.image}
            onChange={(url) => setDraft((current) => ({ ...current, image: url }))}
            label="Category image"
          />

          <div
            className="pt-4 space-y-3 border-t"
            style={{ borderColor: 'var(--a-border)' }}
          >
            <Toggle
              checked={draft.showOnHome}
              onChange={(value) => setDraft((current) => ({ ...current, showOnHome: value }))}
              label="Show a section on the home page"
            />
            <Toggle
              checked={draft.featured}
              onChange={(value) => setDraft((current) => ({ ...current, featured: value }))}
              label="Featured category"
            />
          </div>

          {formError && draft.name.trim() && (
            <div
              className="px-3 py-2.5"
              style={{
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--ds-danger-soft)',
                border: '1px solid color-mix(in srgb, var(--ds-danger) 24%, transparent)',
                color: 'var(--ds-danger-text)',
                fontSize: 'var(--a-fs-md)',
              }}
            >
              {formError}
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete category?"
        message={`"${confirmDelete?.name || ''}" will be deleted. Its products are kept and move to ${
          confirmDelete?.parentId ? 'the parent category' : '"Uncategorised"'
        }.${
          (confirmDelete?.children || []).length > 0
            ? ` Its ${(confirmDelete?.children || []).length} subcategor${(confirmDelete?.children || []).length === 1 ? 'y moves' : 'ies move'} up one level${confirmDelete?.parentId ? '' : ' and become main categories'}.`
            : ''
        }`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
