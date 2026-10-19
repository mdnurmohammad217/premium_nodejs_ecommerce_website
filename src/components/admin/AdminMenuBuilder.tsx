import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ListTree,
  Plus,
  Trash2,
  Save,
  GripVertical,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Tags,
  Link2,
  FolderTree,
  IndentIncrease,
  IndentDecrease,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Undo2,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  IconButton,
  TabStrip,
  SegmentedTabs,
  Badge,
  EmptyState,
  ErrorState,
  SectionLoader,
  LoadingRows,
  TableWrap,
  Field,
  Select,
  Toggle,
  useToasts,
  tint,
  mix,
} from './ui.tsx';
import { NavigationMenuItem, SiteSettings } from '../../types/index.ts';

interface Props {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
}

/**
 * One entry of `settings.navigation_menu`. The base fields are what the
 * storefront header has always read; the rest describe category entries and
 * one level of nesting. Top-level entries carry their sub-items in `children`,
 * so an older header that ignores `children` still renders the top row.
 */
type MenuItem = NavigationMenuItem & {
  type?: 'link' | 'category';
  categoryId?: number;
  categorySlug?: string;
  /** Render the category's live sub-categories as a dropdown */
  includeChildren?: boolean;
  children?: MenuItem[];
};

interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  parentId?: number | null;
  sortOrder?: number;
  featured?: boolean;
  children?: CategoryNode[];
}

const ICON_CHOICES = [
  'Home',
  'ShoppingBag',
  'Pill',
  'Zap',
  'Info',
  'Phone',
  'HelpCircle',
  'Compass',
  'Heart',
  'Tag',
  'Truck',
  'FileText',
];

const ICON_OPTIONS = [{ value: '', label: 'No Icon' }, ...ICON_CHOICES.map((name) => ({ value: name, label: name }))];

const newId = () => `nav-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isExternalUrl = (url: string) => /^https?:\/\//i.test(url.trim());
const categoryUrl = (slug: string) => `shop?category=${encodeURIComponent(slug)}`;

/** Leading slashes are dropped for internal paths; the header resolves them either way */
const cleanUrl = (url: string) => {
  const value = url.trim();
  return isExternalUrl(value) ? value : value.replace(/^\/+/, '');
};

/** Reads whatever is stored — including items saved before nesting existed — into the editor tree */
function toTree(raw: unknown): MenuItem[] {
  const list = Array.isArray(raw) ? (raw as MenuItem[]) : [];
  const normalise = (item: MenuItem): MenuItem => ({
    ...item,
    id: String(item.id || newId()),
    title: String(item.title || ''),
    url: String(item.url || ''),
    icon: item.icon || '',
    isActive: item.isActive !== false,
    type: item.type === 'category' || item.categoryId ? 'category' : 'link',
    children: undefined,
  });
  return [...list]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((item) => ({
      ...normalise(item),
      // Only one level of nesting is supported, so deeper items are lifted up a level.
      children: [...(Array.isArray(item.children) ? item.children : [])]
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(normalise),
    }));
}

/** The exact shape written to `navigation_menu` — see the component comment */
function toPayload(tree: MenuItem[], categoryById: Map<number, CategoryNode>): MenuItem[] {
  const shape = (item: MenuItem, index: number): MenuItem => {
    const base: MenuItem = {
      id: item.id,
      title: item.title.trim(),
      url: cleanUrl(item.url),
      sortOrder: index + 1,
      isActive: item.isActive !== false,
      isExternal: false,
      type: item.type === 'category' ? 'category' : 'link',
    };
    if (item.icon) base.icon = item.icon;
    if (base.type === 'category' && item.categoryId) {
      const category = categoryById.get(Number(item.categoryId));
      const slug = category?.slug || item.categorySlug || '';
      base.categoryId = Number(item.categoryId);
      base.categorySlug = slug;
      // Follow a renamed slug so the link never points at a dead category page
      base.url = slug ? categoryUrl(slug) : base.url;
      base.includeChildren = Boolean(item.includeChildren);
    }
    base.isExternal = isExternalUrl(base.url);
    return base;
  };
  return tree.map((item, index) => {
    const top = shape(item, index);
    const children = (item.children || []).map(shape);
    return children.length > 0 ? { ...top, children } : top;
  });
}

/** Where an item sits: `parent` is the top-level index of its parent, or null */
interface Loc {
  parent: number | null;
  index: number;
}

function locate(tree: MenuItem[], id: string): Loc | null {
  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].id === id) return { parent: null, index: i };
    const kids = tree[i].children || [];
    for (let j = 0; j < kids.length; j += 1) {
      if (kids[j].id === id) return { parent: i, index: j };
    }
  }
  return null;
}

const clone = (tree: MenuItem[]) => tree.map((item) => ({ ...item, children: [...(item.children || [])] }));

function removeAt(tree: MenuItem[], loc: Loc): [MenuItem[], MenuItem] {
  const next = clone(tree);
  const list = loc.parent === null ? next : next[loc.parent].children!;
  const [item] = list.splice(loc.index, 1);
  return [next, item];
}

/**
 * Menu Builder — the header navigation and the navbar category strip.
 *
 * Rows reorder by dragging the handle (HTML5 drag & drop, so no extra
 * dependency) and also have up/down and indent/outdent buttons, because
 * dragging is awkward on touch screens.
 *
 * Saved shape (settings key `navigation_menu`, read by the storefront header):
 *   Array<{
 *     id: string; title: string; url: string; icon?: string;
 *     sortOrder: number;            // 1-based, within its own level
 *     isActive: boolean; isExternal: boolean;
 *     type: 'link' | 'category';
 *     categoryId?: number; categorySlug?: string;   // category items only
 *     includeChildren?: boolean;    // show the category's sub-categories as a dropdown
 *     children?: Array<same, without children>;     // manual one-level sub-menu
 *   }>
 * A category item's `url` is always `shop?category=<slug>`.
 */
export const AdminMenuBuilder: React.FC<Props> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [tab, setTab] = useState<'menu' | 'categories'>('menu');

  // Built once so the editor and the saved snapshot share the ids toTree() fills in
  const [initialTree] = useState<MenuItem[]>(() => toTree(settings.navigation_menu));
  const [items, setItems] = useState<MenuItem[]>(initialTree);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialTree));
  const [savingMenu, setSavingMenu] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);

  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');
  const [navbarCategories, setNavbarCategories] = useState<CategoryNode[]>([]);
  const [savingCats, setSavingCats] = useState(false);

  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const catDragIndex = useRef<number | null>(null);

  const dirty = JSON.stringify(items) !== savedSnapshot;

  // Pick up settings the dashboard loads after first paint, but never throw
  // away edits the operator has not saved yet.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (dirtyRef.current) return;
    const tree = toTree(settings.navigation_menu);
    setItems(tree);
    setSavedSnapshot(JSON.stringify(tree));
  }, [settings.navigation_menu]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const res = await fetch('/api/categories?tree=1');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || '');
      const roots = [...(data as CategoryNode[])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
      );
      setCategoryTree(roots);
      setNavbarCategories(roots);
    } catch (error: any) {
      setCategoriesError(error?.message || 'Could not load categories.');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const categoryById = useMemo(() => {
    const map = new Map<number, CategoryNode>();
    const walk = (list: CategoryNode[]) =>
      list.forEach((node) => {
        map.set(node.id, node);
        walk(node.children || []);
      });
    walk(categoryTree);
    return map;
  }, [categoryTree]);

  /** Every category, indented by depth, for the pickers */
  const categoryOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    const walk = (list: CategoryNode[], depth: number) =>
      list.forEach((node) => {
        out.push({ value: String(node.id), label: `${'— '.repeat(depth)}${node.name}` });
        walk(node.children || [], depth + 1);
      });
    walk(categoryTree, 0);
    return out;
  }, [categoryTree]);

  /* ------------------------------------------------------------ tree edits */
  const update = (id: string, changes: Partial<MenuItem>) => {
    setInvalidIds((list) => list.filter((x) => x !== id));
    setItems((tree) =>
      tree.map((item) =>
        item.id === id
          ? { ...item, ...changes }
          : {
              ...item,
              children: (item.children || []).map((child) => (child.id === id ? { ...child, ...changes } : child)),
            }
      )
    );
  };

  const removeItem = (id: string) => {
    const loc = locate(items, id);
    if (!loc) return;
    const [next, removed] = removeAt(items, loc);
    // A removed parent's sub-items move up rather than vanish with it
    if (loc.parent === null && removed.children?.length) {
      next.splice(loc.index, 0, ...removed.children.map((child) => ({ ...child, children: [] })));
    }
    setItems(next);
  };

  const move = (id: string, delta: -1 | 1) => {
    const loc = locate(items, id);
    if (!loc) return;
    const next = clone(items);
    const list = loc.parent === null ? next : next[loc.parent].children!;
    const target = loc.index + delta;
    if (target < 0 || target >= list.length) return;
    [list[loc.index], list[target]] = [list[target], list[loc.index]];
    setItems(next);
  };

  /** Nest under the item above; only one level deep, so an item with its own sub-items cannot be nested */
  const canIndent = (loc: Loc, item: MenuItem) =>
    loc.parent === null && loc.index > 0 && (item.children || []).length === 0;

  const indent = (id: string) => {
    const loc = locate(items, id);
    if (!loc || !canIndent(loc, items[loc.index])) return;
    const [next, item] = removeAt(items, loc);
    const parent = next[loc.index - 1];
    parent.children = [...(parent.children || []), { ...item, children: [] }];
    setItems(next);
  };

  const outdent = (id: string) => {
    const loc = locate(items, id);
    if (!loc || loc.parent === null) return;
    const [next, item] = removeAt(items, loc);
    next.splice(loc.parent + 1, 0, { ...item, children: [] });
    setItems(next);
  };

  /** Drop `dragged` just before `targetId`, at the target's level */
  const dropBefore = (draggedId: string, targetId: string | null) => {
    if (draggedId === targetId) return;
    const from = locate(items, draggedId);
    if (!from) return;
    const [without, item] = removeAt(items, from);
    const hasKids = (item.children || []).length > 0;

    if (targetId === null) {
      without.push(item);
      return setItems(without);
    }
    const to = locate(without, targetId);
    // Dropped onto one of its own sub-items: nothing sensible to do
    if (!to) return;
    if (to.parent !== null && !hasKids) {
      without[to.parent].children!.splice(to.index, 0, { ...item, children: [] });
    } else {
      // An item that has sub-items stays top level, landing before the target's parent
      without.splice(to.parent === null ? to.index : to.parent, 0, item);
    }
    setItems(without);
  };

  const dragHandlers = (id: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragId.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropTarget !== id) setDropTarget(id);
    },
    onDragLeave: () => setDropTarget((current) => (current === id ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const from = dragId.current;
      dragId.current = null;
      setDropTarget(null);
      if (from) dropBefore(from, id === '__end' ? null : id);
    },
  });

  const handleProps = (id: string) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      dragId.current = id;
      event.dataTransfer.effectAllowed = 'move';
      // Firefox will not start a drag without data on the transfer
      event.dataTransfer.setData('text/plain', id);
      const row = (event.currentTarget as HTMLElement).closest('[data-menu-row]') as HTMLElement | null;
      if (row) event.dataTransfer.setDragImage(row, 16, 16);
    },
    onDragEnd: () => {
      dragId.current = null;
      setDropTarget(null);
    },
  });

  /* ------------------------------------------------------------ add items */
  const [addKind, setAddKind] = useState<'link' | 'category'>('link');
  const [newLink, setNewLink] = useState({ title: '', url: '', icon: '' });
  const [newCat, setNewCat] = useState({ categoryId: '', title: '', icon: '', includeChildren: true });

  const addLink = () => {
    if (!newLink.title.trim() || !newLink.url.trim()) {
      return toasts.push('Enter both a title and a link.', 'error');
    }
    const id = newId();
    setItems((tree) => [
      ...tree,
      {
        id,
        type: 'link',
        title: newLink.title.trim(),
        url: cleanUrl(newLink.url),
        icon: newLink.icon,
        sortOrder: tree.length + 1,
        isActive: true,
        children: [],
      },
    ]);
    setNewLink({ title: '', url: '', icon: '' });
    toasts.push('Added to the menu. Save to publish.', 'info');
  };

  const addCategory = () => {
    const category = categoryById.get(Number(newCat.categoryId));
    if (!category) return toasts.push('Select a category.', 'error');
    const hasKids = (category.children || []).length > 0;
    setItems((tree) => [
      ...tree,
      {
        id: newId(),
        type: 'category',
        title: newCat.title.trim() || category.name,
        url: categoryUrl(category.slug),
        icon: newCat.icon,
        categoryId: category.id,
        categorySlug: category.slug,
        includeChildren: hasKids && newCat.includeChildren,
        sortOrder: tree.length + 1,
        isActive: true,
        children: [],
      },
    ]);
    setNewCat({ categoryId: '', title: '', icon: '', includeChildren: true });
    toasts.push('Category added to the menu. Save to publish.', 'info');
  };

  /* ----------------------------------------------------------------- save */
  const saveMenu = async () => {
    const problems: string[] = [];
    const check = (item: MenuItem) => {
      const missingTitle = !item.title.trim();
      const missingTarget =
        item.type === 'category'
          ? !item.categoryId || (categoryTree.length > 0 && !categoryById.has(Number(item.categoryId)))
          : !item.url.trim();
      if (missingTitle || missingTarget) problems.push(item.id);
    };
    items.forEach((item) => {
      check(item);
      (item.children || []).forEach(check);
    });
    if (problems.length > 0) {
      setInvalidIds(problems);
      setExpanded(problems[0]);
      return toasts.push('Items marked in red are missing a title or link/category.', 'error');
    }

    const payload = toPayload(items, categoryById);
    setSavingMenu(true);
    try {
      // Write only this key: posting the whole settings object also rewrote
      // every other section, and its failures were swallowed, so a rejected
      // save still reported success.
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ navigation_menu: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '');

      // Keep the dashboard's copy of settings current, so saving another
      // settings page afterwards cannot write the old menu back.
      await onSaveSettings({ ...settings, navigation_menu: payload as NavigationMenuItem[] });

      const tree = toTree(payload);
      setItems(tree);
      setSavedSnapshot(JSON.stringify(tree));
      setInvalidIds([]);
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
      toasts.push('Menu saved.');
    } catch (error: any) {
      toasts.push(error?.message || 'Could not save the menu.', 'error');
    } finally {
      setSavingMenu(false);
    }
  };

  const discard = () => {
    setItems(JSON.parse(savedSnapshot));
    setInvalidIds([]);
    setExpanded(null);
  };

  /* -------------------------------------------------------- navbar category */
  const reorderList = <T,>(list: T[], from: number, to: number): T[] => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const saveCategories = async () => {
    if (navbarCategories.length === 0) return;
    setSavingCats(true);
    try {
      const res = await fetch('/api/admin/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: navbarCategories.map((row, index) => ({
            id: row.id,
            sortOrder: index + 1,
            featured: Boolean(row.featured),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '');
      }
      toasts.push('Category order saved.');
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
      loadCategories();
    } catch (error: any) {
      toasts.push(error?.message || 'Could not save.', 'error');
    } finally {
      setSavingCats(false);
    }
  };

  const catRowProps = (index: number) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      catDragIndex.current = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    },
    onDragOver: (event: React.DragEvent) => {
      if (catDragIndex.current === null) return;
      event.preventDefault();
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const from = catDragIndex.current;
      catDragIndex.current = null;
      if (from === null || from === index) return;
      setNavbarCategories((list) => reorderList(list, from, index));
    },
    onDragEnd: () => {
      catDragIndex.current = null;
    },
  });

  /* --------------------------------------------------------------- render */
  const totalCount = items.reduce((sum, item) => sum + 1 + (item.children || []).length, 0);
  const selectedCategory = categoryById.get(Number(newCat.categoryId));
  const selectedHasKids = (selectedCategory?.children || []).length > 0;

  const renderRow = (item: MenuItem, loc: Loc, siblings: number) => {
    const isChild = loc.parent !== null;
    const isOpen = expanded === item.id;
    const invalid = invalidIds.includes(item.id);
    const isCategory = item.type === 'category';
    const category = isCategory ? categoryById.get(Number(item.categoryId)) : undefined;
    const kidsCount = (category?.children || []).length;
    const missingCategory = isCategory && !categoriesLoading && categoryTree.length > 0 && !category;
    const TypeIcon = isCategory ? FolderTree : Link2;
    const isDropTarget = dropTarget === item.id;

    return (
      <div
        key={item.id}
        data-menu-row
        {...dragHandlers(item.id)}
        className="ds-fade-in"
        style={{
          marginLeft: isChild ? 'var(--ds-s-6)' : 0,
          borderRadius: 'var(--ds-r-md)',
          background: item.isActive === false ? 'var(--a-surface-2)' : 'var(--a-surface)',
          border: `1px solid ${invalid ? 'var(--ds-danger)' : isOpen ? tint(0.35) : 'var(--a-border)'}`,
          boxShadow: isDropTarget ? `0 -3px 0 0 var(--primary)` : isOpen ? 'var(--ds-shadow-sm)' : undefined,
          transition: 'box-shadow var(--ds-dur-fast) var(--ds-ease), border-color var(--ds-dur-fast) var(--ds-ease)',
        }}
      >
        <div className="flex items-center gap-2" style={{ padding: 'var(--ds-s-2)' }}>
          <span
            {...handleProps(item.id)}
            className="hidden sm:flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
            style={{ width: 'var(--ds-h-sm)', height: 'var(--ds-h-sm)', color: 'var(--a-text-muted)' }}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </span>

          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 'var(--ds-h-sm)',
              height: 'var(--ds-h-sm)',
              borderRadius: 'var(--ds-r-sm)',
              background: isCategory ? mix('var(--ds-violet)', 0.12) : tint(0.12),
              color: isCategory ? 'var(--ds-violet)' : 'var(--primary)',
            }}
          >
            <TypeIcon className="w-4 h-4" />
          </span>

          <button
            type="button"
            onClick={() => setExpanded(isOpen ? null : item.id)}
            className="flex-1 min-w-0 text-left cursor-pointer"
            aria-expanded={isOpen}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                {item.title || <span style={{ color: 'var(--ds-danger-text)' }}>Untitled</span>}
              </span>
              {item.isActive === false && (
                <EyeOff className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--a-text-faint)' }} />
              )}
            </span>
            <span className="flex items-center gap-1.5 min-w-0 flex-wrap" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              {isCategory ? (
                <>
                  <span className="truncate">{category?.name || item.categorySlug || 'Category'}</span>
                  {item.includeChildren && kidsCount > 0 && (
                    <Badge tone={{ bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)' }}>
                      Dropdown · <span className="ds-num">{kidsCount}</span>
                    </Badge>
                  )}
                  {missingCategory && <Badge status="cancelled">Category Deleted</Badge>}
                </>
              ) : (
                <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                  {item.url ? (isExternalUrl(item.url) ? item.url : `/${item.url.replace(/^\/+/, '')}`) : '—'}
                </span>
              )}
              {!isChild && (item.children || []).length > 0 && (
                <Badge tone={{ bg: tint(0.1), fg: 'var(--primary)' }}>
                  Submenu · <span className="ds-num">{item.children!.length}</span>
                </Badge>
              )}
            </span>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden md:flex items-center gap-1">
              <IconButton
                icon={ArrowUp}
                size="sm"
                tone="plain"
                label="Move up"
                disabled={loc.index === 0}
                onClick={() => move(item.id, -1)}
              />
              <IconButton
                icon={ArrowDown}
                size="sm"
                tone="plain"
                label="Move down"
                disabled={loc.index === siblings - 1}
                onClick={() => move(item.id, 1)}
              />
              {isChild ? (
                <IconButton icon={IndentDecrease} size="sm" tone="plain" label="Move out of submenu" onClick={() => outdent(item.id)} />
              ) : (
                <IconButton
                  icon={IndentIncrease}
                  size="sm"
                  tone="plain"
                  label="Make submenu of item above"
                  disabled={!canIndent(loc, item)}
                  onClick={() => indent(item.id)}
                />
              )}
            </span>
            <IconButton
              icon={isOpen ? ChevronUp : ChevronDown}
              size="sm"
              label={isOpen ? 'Close' : 'Edit'}
              onClick={() => setExpanded(isOpen ? null : item.id)}
            />
          </div>
        </div>

        {isOpen && (
          <div
            className="border-t space-y-3 ds-fade-in"
            style={{ borderColor: 'var(--a-border-soft)', padding: 'var(--ds-s-3)' }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Label" required error={invalid && !item.title.trim() ? 'Enter a label.' : undefined}>
                <input
                  className="a-field"
                  value={item.title}
                  onChange={(e) => update(item.id, { title: e.target.value })}
                />
              </Field>

              {isCategory ? (
                <Field
                  label="Category"
                  required
                  error={invalid && (!item.categoryId || missingCategory) ? 'Select a category.' : undefined}
                >
                  <Select
                    value={item.categoryId ? String(item.categoryId) : ''}
                    onChange={(value) => {
                      const next = categoryById.get(Number(value));
                      update(item.id, {
                        categoryId: next?.id,
                        categorySlug: next?.slug,
                        url: next ? categoryUrl(next.slug) : item.url,
                      });
                    }}
                    options={[{ value: '', label: 'Select a category' }, ...categoryOptions]}
                  />
                </Field>
              ) : (
                <Field
                  label="Link (URL)"
                  required
                  hint="e.g. shop, offers, page/about or https://..."
                  error={invalid && !item.url.trim() ? 'Enter a link.' : undefined}
                >
                  <input
                    className="a-field"
                    value={item.url}
                    style={{ fontFamily: 'var(--font-mono)' }}
                    onChange={(e) => update(item.id, { url: e.target.value })}
                  />
                </Field>
              )}

              <Field label="Icon (Optional)">
                <Select value={item.icon || ''} onChange={(value) => update(item.id, { icon: value })} options={ICON_OPTIONS} />
              </Field>

              <div className="flex flex-col justify-end gap-3 sm:pb-1">
                <Toggle
                  checked={item.isActive !== false}
                  onChange={(value) => update(item.id, { isActive: value })}
                  label="Active"
                  description="When off, it is hidden on the storefront."
                />
              </div>
            </div>

            {isCategory && (
              <Toggle
                checked={Boolean(item.includeChildren)}
                disabled={kidsCount === 0}
                onChange={(value) => update(item.id, { includeChildren: value })}
                label="Show Subcategories in Dropdown"
                description={
                  kidsCount > 0
                    ? `${kidsCount} ${kidsCount === 1 ? 'subcategory' : 'subcategories'}. New subcategories appear automatically.`
                    : 'This category has no subcategories.'
                }
              />
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              {/* Phones get the reorder controls here, since the row itself has no room */}
              <div className="flex items-center gap-1 md:hidden">
                <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={loc.index === 0} onClick={() => move(item.id, -1)} />
                <IconButton
                  icon={ArrowDown}
                  size="sm"
                  label="Move down"
                  disabled={loc.index === siblings - 1}
                  onClick={() => move(item.id, 1)}
                />
                {isChild ? (
                  <IconButton icon={IndentDecrease} size="sm" label="Move out of submenu" onClick={() => outdent(item.id)} />
                ) : (
                  <IconButton
                    icon={IndentIncrease}
                    size="sm"
                    label="Make submenu of item above"
                    disabled={!canIndent(loc, item)}
                    onClick={() => indent(item.id)}
                  />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                className="ml-auto text-[var(--ds-danger-text)]"
                onClick={() => {
                  removeItem(item.id);
                  setExpanded(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Menu Builder"
        subtitle="Drag rows to reorder, or use the arrows. Changes apply to the storefront header."
        icon={ListTree}
        actions={
          tab === 'menu' ? (
            <>
              {dirty && (
                <Button variant="ghost" icon={Undo2} onClick={discard} disabled={savingMenu}>
                  <span className="hidden sm:inline">Discard</span>
                </Button>
              )}
              <Button variant="primary" icon={Save} onClick={saveMenu} loading={savingMenu} disabled={!dirty && !savingMenu}>
                Save Changes
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              icon={Save}
              onClick={saveCategories}
              loading={savingCats}
              disabled={navbarCategories.length === 0}
            >
              Save Changes
            </Button>
          )
        }
      />

      <div className="mb-4">
        <TabStrip
          active={tab}
          onChange={(id) => setTab(id as 'menu' | 'categories')}
          tabs={[
            { id: 'menu', label: 'Header Menu', icon: ListTree },
            { id: 'categories', label: 'Navbar Categories', icon: Tags },
          ]}
        />
      </div>

      {tab === 'menu' && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <Card padded={false}>
            <div
              className="flex items-center justify-between gap-3 border-b"
              style={{ padding: 'var(--ds-s-4) var(--ds-card-pad-sm)', borderColor: 'var(--a-border)' }}
            >
              <div className="min-w-0">
                <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                  Header menu items
                </h3>
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <span className="ds-num">{totalCount}</span> {totalCount === 1 ? 'item' : 'items'} · Drag the handle to reorder; use the buttons on the right to make a submenu
                </p>
              </div>
              {dirty && <Badge status="draft" dot>Unsaved</Badge>}
            </div>

            <div className="space-y-2" style={{ padding: 'var(--ds-card-pad-sm)' }}>
              {items.length === 0 ? (
                <EmptyState
                  title="No menu items"
                  description="Add the links your customers need in the header."
                  icon={ListTree}
                />
              ) : (
                <>
                  {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                      {renderRow(item, { parent: null, index }, items.length)}
                      {(item.children || []).map((child, childIndex) =>
                        renderRow(child, { parent: index, index: childIndex }, item.children!.length)
                      )}
                    </React.Fragment>
                  ))}
                  {/* Drop here to move an item to the very end */}
                  <div
                    {...dragHandlers('__end')}
                    className="hidden sm:flex items-center justify-center"
                    style={{
                      height: 'var(--ds-h-md)',
                      borderRadius: 'var(--ds-r-md)',
                      border: `1px dashed ${dropTarget === '__end' ? 'var(--primary)' : 'var(--a-border)'}`,
                      background: dropTarget === '__end' ? tint(0.06) : 'transparent',
                      fontSize: 'var(--a-fs-sm)',
                      color: 'var(--a-text-faint)',
                    }}
                  >
                    Drop here to move to the end
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Add menu item" icon={Plus} />
            <SegmentedTabs
              className="mb-4"
              active={addKind}
              onChange={(id) => setAddKind(id as 'link' | 'category')}
              tabs={[
                { id: 'link', label: 'Custom Link', icon: Link2 },
                { id: 'category', label: 'Category', icon: FolderTree },
              ]}
            />

            {addKind === 'link' ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addLink();
                }}
              >
                <Field label="Title" required>
                  <input
                    className="a-field"
                    value={newLink.title}
                    onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                    placeholder="e.g. Offers"
                  />
                </Field>
                <Field label="Link" required hint="Relative path, e.g. shop or page/about">
                  <div className="relative">
                    <input
                      className="a-field"
                      value={newLink.url}
                      onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                      placeholder="shop"
                      style={{ fontFamily: 'var(--font-mono)', paddingRight: isExternalUrl(newLink.url) ? 'var(--ds-s-10)' : undefined }}
                    />
                    {isExternalUrl(newLink.url) && (
                      <ExternalLink
                        className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--a-text-muted)' }}
                      />
                    )}
                  </div>
                </Field>
                <Field label="Icon">
                  <Select value={newLink.icon} onChange={(value) => setNewLink({ ...newLink, icon: value })} options={ICON_OPTIONS} />
                </Field>
                <Button type="submit" variant="primary" icon={Plus} block>
                  Add to menu
                </Button>
              </form>
            ) : categoriesLoading ? (
              <SectionLoader lines={4} />
            ) : categoriesError ? (
              <ErrorState message={categoriesError} onRetry={loadCategories} />
            ) : categoryOptions.length === 0 ? (
              <EmptyState title="No categories yet" description="Create a category first." icon={FolderTree} />
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCategory();
                }}
              >
                <Field label="Category" required>
                  <Select
                    value={newCat.categoryId}
                    onChange={(value) => setNewCat({ ...newCat, categoryId: value })}
                    options={[{ value: '', label: 'Select a category' }, ...categoryOptions]}
                  />
                </Field>
                <Field label="Label" hint="Leave empty to use the category name.">
                  <input
                    className="a-field"
                    value={newCat.title}
                    onChange={(e) => setNewCat({ ...newCat, title: e.target.value })}
                    placeholder={selectedCategory?.name || 'Name shown in the menu'}
                  />
                </Field>
                <Field label="Icon">
                  <Select value={newCat.icon} onChange={(value) => setNewCat({ ...newCat, icon: value })} options={ICON_OPTIONS} />
                </Field>
                <Toggle
                  checked={selectedHasKids && newCat.includeChildren}
                  disabled={!selectedHasKids}
                  onChange={(value) => setNewCat({ ...newCat, includeChildren: value })}
                  label="Show Subcategories in Dropdown"
                  description={
                    !selectedCategory
                      ? 'Shown once you select a category.'
                      : selectedHasKids
                      ? `${selectedCategory.children!.length} ${selectedCategory.children!.length === 1 ? 'subcategory' : 'subcategories'} will show in the dropdown.`
                      : 'This category has no subcategories.'
                  }
                />
                <Button type="submit" variant="primary" icon={Plus} block disabled={!selectedCategory}>
                  Add to menu
                </Button>
              </form>
            )}

            <p className="mt-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              New items are added to the end of the list. Press <strong>Save Changes</strong> to publish.
            </p>
          </Card>
        </div>
      )}

      {tab === 'categories' && (
        <TableWrap>
          <div
            className="border-b"
            style={{ padding: 'var(--ds-s-4) var(--ds-card-pad-sm)', borderColor: 'var(--a-border)' }}
          >
            <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Navbar Category Links
            </h3>
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Drag to reorder or use the toggles to control visibility
            </p>
          </div>

          {categoriesError ? (
            <ErrorState message={categoriesError} onRetry={loadCategories} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }} />
                  <th>Visible</th>
                  <th>Category name</th>
                  <th>Slug</th>
                  <th>Current order</th>
                  <th style={{ textAlign: 'right' }}>Move</th>
                </tr>
              </thead>
              <tbody>
                {categoriesLoading ? (
                  <LoadingRows rows={5} cols={6} />
                ) : navbarCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <EmptyState title="No categories yet" icon={Tags} />
                    </td>
                  </tr>
                ) : (
                  navbarCategories.map((row, index) => (
                    <tr key={row.id} {...catRowProps(index)} className="cursor-grab active:cursor-grabbing">
                      <td>
                        <GripVertical className="w-4 h-4" style={{ color: 'var(--a-text-muted)' }} />
                      </td>
                      <td>
                        <Toggle
                          checked={Boolean(row.featured)}
                          label="Visible"
                          onChange={(value) =>
                            setNavbarCategories((list) =>
                              list.map((entry) => (entry.id === row.id ? { ...entry, featured: value } : entry))
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-2" style={{ minWidth: 140 }}>
                          <span className="font-semibold">{row.name}</span>
                          {row.featured && <Badge tone={{ bg: tint(0.12), fg: 'var(--primary)' }}>On Navbar</Badge>}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-warning-text)' }}>{row.slug}</code>
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center justify-center font-bold ds-num"
                          style={{
                            minWidth: 'var(--ds-h-sm)',
                            height: 28,
                            borderRadius: 'var(--ds-r-sm)',
                            background: 'var(--a-surface-2)',
                            border: '1px solid var(--a-border)',
                          }}
                        >
                          {index + 1}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            icon={ArrowUp}
                            size="sm"
                            label="Move up"
                            disabled={index === 0}
                            onClick={() => setNavbarCategories((list) => reorderList(list, index, index - 1))}
                          />
                          <IconButton
                            icon={ArrowDown}
                            size="sm"
                            label="Move down"
                            disabled={index === navbarCategories.length - 1}
                            onClick={() => setNavbarCategories((list) => reorderList(list, index, index + 1))}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </TableWrap>
      )}
    </div>
  );
};
