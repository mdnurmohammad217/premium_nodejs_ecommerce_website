import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  GalleryHorizontal,
  ChevronDown,
  Monitor,
  Smartphone,
  X,
} from 'lucide-react';
import { MediaPicker } from './MediaPicker.tsx';
import {
  Card,
  CardHeader,
  Button,
  IconButton,
  Field,
  Toggle,
  Badge,
  tint,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SectionLoader,
  useToasts,
} from './ui.tsx';
import { HeroBanner } from '../../types/index.ts';

type BannerDraft = Partial<HeroBanner> & { imageUrl?: string };

const emptyDraft: BannerDraft = {
  title: '',
  subtitle: '',
  badge: '',
  buttonText: '',
  buttonUrl: '',
  imageUrl: '',
  mobileImageUrl: '',
  sortOrder: 0,
  status: 'active',
};

const hideBroken = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.style.display = 'none';
};

/**
 * Hero banner management. Writes straight to /api/admin/banners, and the
 * storefront hero renders exactly these rows — nothing is hardcoded there.
 */
export const AdminBannerTab: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const toasts = useToasts();
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<BannerDraft>(emptyDraft);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/banners');
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch {
      setLoadError('Could not load banners.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notifyStorefront = () => {
    window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
    onChanged?.();
  };

  const startAdd = () => {
    setDraft({ ...emptyDraft, sortOrder: banners.length + 1 });
    setShowOverlay(false);
    setFormError('');
    setEditingId('new');
  };

  const startEdit = (banner: HeroBanner) => {
    setDraft({ ...banner });
    setShowOverlay(!!(banner.title || banner.subtitle || banner.badge || banner.buttonText));
    setFormError('');
    setEditingId(banner.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError('');
  };

  const save = async () => {
    if (!draft.imageUrl) {
      setFormError('Select a desktop banner image.');
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      const isNew = editingId === 'new';
      const res = await fetch(isNew ? '/api/admin/banners' : `/api/admin/banners/${editingId}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title || '',
          subtitle: draft.subtitle || null,
          badge: draft.badge || null,
          buttonText: draft.buttonText || null,
          buttonUrl: draft.buttonUrl || null,
          imageUrl: draft.imageUrl,
          mobileImageUrl: draft.mobileImageUrl || null,
          sortOrder: Number(draft.sortOrder || 0),
          status: draft.status || 'active',
        }),
      });
      if (!res.ok) throw new Error('save failed');
      await load();
      cancelEdit();
      notifyStorefront();
      toasts.push('Banner saved.');
    } catch {
      setFormError('Could not save the banner.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (deleteId === null) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await fetch(`/api/admin/banners/${id}`, { method: 'DELETE' });
      await load();
      notifyStorefront();
      toasts.push('Banner deleted.');
    } catch {
      toasts.push('Could not delete the banner.', 'error');
    }
  };

  const patch = async (banner: HeroBanner, changes: Partial<HeroBanner>) => {
    try {
      await fetch(`/api/admin/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...banner, ...changes }),
      });
      await load();
      notifyStorefront();
    } catch {
      toasts.push('Could not update the banner.', 'error');
    }
  };

  const move = (banner: HeroBanner, direction: -1 | 1) => {
    const ordered = [...banners].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const index = ordered.findIndex((b) => b.id === banner.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    patch(banner, { sortOrder: swapWith.sortOrder || 0 });
    patch(swapWith, { sortOrder: banner.sortOrder || 0 });
  };

  const setField = (key: keyof BannerDraft, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Homepage Banners"
        subtitle="The homepage hero slider shows only the banners added here."
        icon={GalleryHorizontal}
        actions={
          <Button variant="primary" icon={Plus} onClick={startAdd}>
            <span className="hidden sm:inline">New Banner</span>
          </Button>
        }
      />

      {editingId !== null && (
        <div
          className="mb-5 ds-fade-in"
          style={{
            padding: 'var(--ds-s-4)',
            borderRadius: 'var(--ds-r-lg)',
            border: `1px solid ${tint(0.3)}`,
            background: 'var(--a-surface)',
            boxShadow: 'var(--ds-shadow-md)',
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h4 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
              {editingId === 'new' ? 'Add New Banner' : 'Edit Banner'}
            </h4>
            <IconButton icon={X} tone="plain" size="sm" label="Close" onClick={cancelEdit} />
          </div>
          <div className="space-y-4">
            {formError && (
              <div
                style={{
                  padding: 'var(--ds-s-3)',
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--ds-danger-soft)',
                  color: 'var(--ds-danger-text)',
                  fontSize: 'var(--a-fs-md)',
                }}
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MediaPicker
                label="Desktop Banner Image (Required)"
                value={draft.imageUrl}
                onChange={(url) => setField('imageUrl', url)}
                modalTitle="Select Banner Image"
              />
              <MediaPicker
                label="Mobile Banner Image (Optional)"
                value={draft.mobileImageUrl || ''}
                onChange={(url) => setField('mobileImageUrl', url)}
                modalTitle="Mobile Banner Image"
              />
            </div>

            {(draft.imageUrl || draft.mobileImageUrl) && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                <div>
                  <span className="a-label flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </span>
                  <span
                    className="block overflow-hidden"
                    style={{ aspectRatio: '3 / 1', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}
                  >
                    {draft.imageUrl && (
                      <img src={draft.imageUrl} alt="" loading="lazy" onError={hideBroken} className="w-full h-full object-cover" />
                    )}
                  </span>
                </div>
                <div>
                  <span className="a-label flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </span>
                  <span
                    className="block overflow-hidden"
                    style={{ width: 90, aspectRatio: '4 / 5', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}
                  >
                    {(draft.mobileImageUrl || draft.imageUrl) && (
                      <img
                        src={draft.mobileImageUrl || draft.imageUrl}
                        alt=""
                        loading="lazy"
                        onError={hideBroken}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Link / URL (Optional)">
                <input
                  className="a-field"
                  value={draft.buttonUrl || ''}
                  placeholder="shop or https://..."
                  onChange={(e) => setField('buttonUrl', e.target.value)}
                />
              </Field>
              <Field label="Sort Order">
                <input
                  type="number"
                  className="a-field ds-num"
                  value={String(draft.sortOrder ?? 0)}
                  onChange={(e) => setField('sortOrder', Number(e.target.value))}
                />
              </Field>
            </div>

            <div style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface-2)' }}>
              <button
                type="button"
                onClick={() => setShowOverlay((v) => !v)}
                className="w-full flex items-center justify-between gap-2 font-semibold cursor-pointer"
                style={{ padding: 'var(--ds-s-3)', fontSize: 'var(--a-fs-md)' }}
                aria-expanded={showOverlay}
              >
                Text Overlay on Image (Optional)
                <ChevronDown
                  className="w-4 h-4 transition-transform"
                  style={{ transform: showOverlay ? 'rotate(180deg)' : undefined }}
                />
              </button>
              {showOverlay && (
                <div className="space-y-3" style={{ padding: '0 var(--ds-s-3) var(--ds-s-3)' }}>
                  <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    Leave these empty to show only the image, with no text overlay.
                  </p>
                  <Field label="Title">
                    <input className="a-field" value={draft.title || ''} onChange={(e) => setField('title', e.target.value)} />
                  </Field>
                  <Field label="Subtitle">
                    <input className="a-field" value={draft.subtitle || ''} onChange={(e) => setField('subtitle', e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Badge">
                      <input className="a-field" value={draft.badge || ''} onChange={(e) => setField('badge', e.target.value)} />
                    </Field>
                    <Field label="Button Text">
                      <input
                        className="a-field"
                        value={draft.buttonText || ''}
                        onChange={(e) => setField('buttonText', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <Toggle
              checked={(draft.status || 'active') === 'active'}
              onChange={(value) => setField('status', value ? 'active' : 'inactive')}
              label="Active"
              description="Inactive banners are not shown in the slider."
            />
          </div>
          <div className="flex items-center justify-end gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--a-border)' }}>
            <Button onClick={cancelEdit}>Cancel</Button>
            <Button variant="primary" icon={Save} onClick={save} loading={isSaving}>
              Save
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <SectionLoader height={84} />
          <SectionLoader height={84} />
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : banners.length === 0 ? (
        <div style={{ borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--a-border-strong)' }}>
          <EmptyState
            icon={GalleryHorizontal}
            title="No banners yet"
            description="Add your first banner to show it in the homepage slider."
            action={
              <Button icon={Plus} onClick={startAdd}>
                Add Banner
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...banners]
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((banner, index, list) => {
              const active = banner.status === 'active';
              return (
                <div
                  key={banner.id}
                  className="flex items-center gap-3 flex-wrap sm:flex-nowrap"
                  style={{
                    padding: 'var(--ds-s-2)',
                    borderRadius: 'var(--ds-r-md)',
                    border: '1px solid var(--a-border)',
                    background: 'var(--a-surface)',
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  <span
                    className="shrink-0 overflow-hidden"
                    style={{
                      width: 120,
                      height: 64,
                      borderRadius: 'var(--ds-r-sm)',
                      background: 'var(--a-surface-3)',
                      border: '1px solid var(--a-border)',
                    }}
                  >
                    <img
                      src={banner.imageUrl}
                      alt={banner.title || 'banner'}
                      loading="lazy"
                      onError={hideBroken}
                      className="w-full h-full object-cover"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {banner.title || '(Banner without text)'}
                    </p>
                    <p className="truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      Sort order: <span className="ds-num">{banner.sortOrder ?? 0}</span>
                      {banner.buttonUrl ? ` • Link: ${banner.buttonUrl}` : ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge status={active ? 'active' : 'inactive'} dot>
                        {active ? 'Active' : 'Inactive'}
                      </Badge>
                      {banner.mobileImageUrl && (
                        <Badge tone={{ bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)' }}>Has Mobile Image</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                    <IconButton size="sm" tone="plain" label="Move up" icon={ArrowUp} disabled={index === 0} onClick={() => move(banner, -1)} />
                    <IconButton
                      size="sm"
                      tone="plain"
                      label="Move down"
                      icon={ArrowDown}
                      disabled={index === list.length - 1}
                      onClick={() => move(banner, 1)}
                    />
                    <IconButton
                      size="sm"
                      label={active ? 'Deactivate' : 'Activate'}
                      icon={active ? Eye : EyeOff}
                      onClick={() => patch(banner, { status: active ? 'inactive' : 'active' })}
                    />
                    <IconButton size="sm" label="Edit" icon={Pencil} onClick={() => startEdit(banner)} />
                    <IconButton size="sm" tone="danger" label="Delete" icon={Trash2} onClick={() => setDeleteId(banner.id)} />
                  </div>
                </div>
              );
            })}
        </div>
      )}


      <ConfirmDialog
        open={deleteId !== null}
        title="Delete banner?"
        message="Are you sure you want to delete this banner? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </Card>
  );
};
