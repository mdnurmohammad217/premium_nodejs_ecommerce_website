import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Lightbulb,
  MessageSquareQuote,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, IconButton, PageHeader, Toggle, mix, tint, useToasts } from './ui.tsx';
import { MediaLibraryModal } from './MediaLibraryModal.tsx';
import { ReviewImagesConfig, SiteSettings } from '../../types/index.ts';
import { ReviewImagesSection } from '../store/ReviewImagesSection.tsx';

type ReviewImage = { id: string; url: string; caption?: string };

interface Draft {
  isEnabled: boolean;
  title: string;
  subtitle: string;
  images: ReviewImage[];
}

const MAX_IMAGES = 60;
const CAPTION_MAX = 160;

const newId = () => `rv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const normalise = (config?: ReviewImagesConfig): Draft => ({
  isEnabled: config?.isEnabled !== false,
  title: config?.title ?? 'What Our Customers Say',
  subtitle: config?.subtitle ?? 'Real messages and photos shared by our customers',
  images: (Array.isArray(config?.images) ? config!.images! : [])
    .filter((image) => image && image.url)
    // Deterministic ids for older entries saved without one, so reloading never looks like an edit
    .map((image, index) => ({ id: image.id || `rv_saved_${index}`, url: image.url, caption: image.caption || '' })),
});

/** What gets saved: captions trimmed, empty ones left out */
const toConfig = (draft: Draft): ReviewImagesConfig => ({
  isEnabled: draft.isEnabled,
  title: draft.title.trim(),
  subtitle: draft.subtitle.trim(),
  images: draft.images.map((image) => {
    const caption = (image.caption || '').trim();
    return caption ? { id: image.id, url: image.url, caption } : { id: image.id, url: image.url };
  }),
});

/**
 * Dashboard → Customer Reviews: screenshots of real customer messages and
 * reviews, shown on the home page above the blog.
 */
export const AdminReviewImagesPage: React.FC<{
  settings: SiteSettings;
  onSaveSettings: (s: SiteSettings) => Promise<void> | void;
}> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const savedKey = JSON.stringify(settings.review_images_config || null);
  const [draft, setDraft] = useState<Draft>(() => normalise(settings.review_images_config));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toConfig(normalise(settings.review_images_config))));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // A settings reload from the parent (e.g. after saving) becomes the new starting point
  useEffect(() => {
    const next = normalise(settings.review_images_config);
    setDraft(next);
    setBaseline(JSON.stringify(toConfig(next)));
  }, [savedKey]);

  const dirty = useMemo(() => JSON.stringify(toConfig(draft)) !== baseline, [draft, baseline]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patch = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));
  const setImages = (update: (images: ReviewImage[]) => ReviewImage[]) =>
    setDraft((current) => ({ ...current, images: update(current.images) }));

  const addUrls = (urls: string[]) => {
    const room = MAX_IMAGES - draft.images.length;
    const fresh = urls.filter((url) => url && !draft.images.some((image) => image.url === url));
    if (fresh.length === 0) {
      toasts.push('Those screenshots are already in the list.', 'info');
      return;
    }
    if (room <= 0) {
      toasts.push(`You can show up to ${MAX_IMAGES} screenshots.`, 'warning');
      return;
    }
    const accepted = fresh.slice(0, room);
    setImages((images) => [...images, ...accepted.map((url) => ({ id: newId(), url, caption: '' }))]);
    toasts.push(
      accepted.length < fresh.length
        ? `Added ${accepted.length}. The limit is ${MAX_IMAGES} screenshots.`
        : `Added ${accepted.length} screenshot${accepted.length === 1 ? '' : 's'}. Remember to save.`,
      accepted.length < fresh.length ? 'warning' : 'success'
    );
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.images.length || from === to) return;
    setImages((images) => {
      const next = [...images];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const config = toConfig(draft);
      await onSaveSettings({ ...settings, review_images_config: config });
      setBaseline(JSON.stringify(config));
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(0), 2500);
      toasts.push('Customer reviews saved.');
    } catch (error: any) {
      toasts.push(error?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(normalise(settings.review_images_config));
  };

  const count = draft.images.length;
  const previewConfig: ReviewImagesConfig = { ...toConfig(draft), isEnabled: true };

  return (
    <div className="pb-(--ds-s-4)">
      {toasts.node}

      <PageHeader
        title="Customer Reviews"
        subtitle="Screenshots of real customer messages and reviews, shown on the home page above the blog"
        icon={MessageSquareQuote}
        actions={
          <>
            <Button icon={ImagePlus} onClick={() => setPickerOpen(true)} disabled={count >= MAX_IMAGES}>
              Add screenshots
            </Button>
            <Button variant="primary" icon={savedAt && !dirty ? Check : Save} onClick={save} loading={saving} disabled={!dirty && !saving}>
              {savedAt && !dirty ? 'Saved' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
        {/* ------------------------------------------------------ settings */}
        <div className="space-y-5 xl:sticky xl:top-4">
          <Card>
            <CardHeader
              title="Section"
              subtitle="Shown on the home page, above the blog"
              actions={
                draft.isEnabled ? (
                  <Badge status="active" dot>
                    Visible
                  </Badge>
                ) : (
                  <Badge status="inactive" dot>
                    Hidden
                  </Badge>
                )
              }
            />
            <div className="space-y-4">
              <Toggle
                checked={draft.isEnabled}
                onChange={(value) => patch({ isEnabled: value })}
                label="Show on the home page"
                description={count === 0 ? 'Add at least one screenshot for the section to appear' : 'Turn off to hide the section without losing the images'}
              />
              <Field label="Title">
                <input
                  className="a-field"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => patch({ title: event.target.value })}
                  placeholder="What Our Customers Say"
                />
              </Field>
              <Field label="Subtitle" hint="Optional — one short line under the title">
                <input
                  className="a-field"
                  value={draft.subtitle}
                  maxLength={200}
                  onChange={(event) => patch({ subtitle: event.target.value })}
                  placeholder="Real messages and photos shared by our customers"
                />
              </Field>
            </div>
          </Card>

          <div
            className="flex items-start gap-3 p-4"
            style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--ds-warning-soft)', border: `1px solid ${mix('var(--ds-warning)', 0.3)}` }}
          >
            <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--ds-warning-text)' }} />
            <div style={{ fontSize: 'var(--a-fs-base)', color: 'var(--ds-warning-text)', lineHeight: 1.6 }}>
              <p className="font-bold">Use real screenshots of customer messages or reviews.</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Crop out phone numbers and profile names if the customer prefers.</li>
                <li>Portrait screenshots (chat messages) look best.</li>
                <li>Drag to reorder — the first ones are seen first.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ images */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader
              title={`Screenshots (${count})`}
              subtitle={`Add several at once. Up to ${MAX_IMAGES}. Captions are optional.`}
              actions={
                count > 0 ? (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)}>
                    Remove all
                  </Button>
                ) : undefined
              }
            />

            {count === 0 ? (
              <EmptyState
                icon={ImagePlus}
                title="No screenshots yet"
                description="Upload screenshots of happy customers' messages, Facebook reviews or WhatsApp chats."
                action={
                  <Button variant="primary" icon={ImagePlus} onClick={() => setPickerOpen(true)}>
                    Add screenshots
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
                {draft.images.map((image, index) => {
                  const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
                  return (
                    <div
                      key={image.id}
                      draggable
                      onDragStart={(event) => {
                        setDragIndex(index);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (overIndex !== index) setOverIndex(index);
                      }}
                      onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragIndex !== null) move(dragIndex, index);
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className="flex flex-col overflow-hidden transition-[box-shadow,opacity,transform]"
                      style={{
                        borderRadius: 'var(--ds-r-lg)',
                        border: `1px solid ${isOver ? 'var(--primary)' : 'var(--a-border)'}`,
                        background: 'var(--a-surface)',
                        boxShadow: isOver ? 'var(--ds-ring)' : 'var(--ds-shadow-xs)',
                        opacity: dragIndex === index ? 0.45 : 1,
                      }}
                    >
                      <div className="relative group" style={{ aspectRatio: '4 / 5', background: 'var(--a-surface-2)', cursor: 'grab' }}>
                        <img
                          src={image.url}
                          alt={image.caption || `Review ${index + 1}`}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          draggable={false}
                          onError={(event) => {
                            event.currentTarget.style.opacity = '0.25';
                          }}
                        />
                        <span
                          className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 font-bold ds-num"
                          style={{ fontSize: 'var(--a-fs-xs)', borderRadius: 'var(--ds-r-xs)', background: 'rgba(19,25,34,0.72)', color: '#fff' }}
                        >
                          <GripVertical className="w-3 h-3" />
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setImages((images) => images.filter((item) => item.id !== image.id))}
                          aria-label={`Remove screenshot ${index + 1}`}
                          title="Remove"
                          className="absolute top-2 right-2 inline-flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                          style={{ width: 28, height: 28, borderRadius: 'var(--ds-r-sm)', background: 'rgba(19,25,34,0.72)', color: '#fff' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-2 space-y-2">
                        <input
                          className="a-field"
                          style={{ fontSize: 'var(--a-fs-sm)' }}
                          value={image.caption || ''}
                          maxLength={CAPTION_MAX}
                          placeholder="Caption (optional)"
                          aria-label={`Caption for screenshot ${index + 1}`}
                          onChange={(event) =>
                            setImages((images) =>
                              images.map((item) => (item.id === image.id ? { ...item, caption: event.target.value } : item))
                            )
                          }
                        />
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <IconButton icon={ArrowUp} size="sm" label="Move earlier" disabled={index === 0} onClick={() => move(index, index - 1)} />
                            <IconButton
                              icon={ArrowDown}
                              size="sm"
                              label="Move later"
                              disabled={index === count - 1}
                              onClick={() => move(index, index + 1)}
                            />
                          </div>
                          {index !== 0 && (
                            <button
                              type="button"
                              onClick={() => move(index, 0)}
                              className="font-semibold cursor-pointer hover:underline"
                              style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--primary-ink, var(--primary))' }}
                            >
                              Move to first
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {count < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:brightness-[0.98]"
                    style={{
                      minHeight: 200,
                      borderRadius: 'var(--ds-r-lg)',
                      border: '2px dashed var(--a-border-strong)',
                      background: 'var(--a-surface-2)',
                      color: 'var(--a-text-muted)',
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center"
                      style={{ width: 44, height: 44, borderRadius: 999, background: tint(0.1), color: 'var(--primary-ink, var(--primary))' }}
                    >
                      <ImagePlus className="w-5 h-5" />
                    </span>
                    <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      Add screenshots
                    </span>
                    <span style={{ fontSize: 'var(--a-fs-xs)' }}>Select many at once</span>
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------------- preview */}
      <Card className="mt-5" padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="Live preview"
            subtitle="How the section looks on the home page. On phones it becomes a swipe row, two screenshots across."
            icon={Eye}
            actions={
              !draft.isEnabled ? (
                <Badge status="inactive">
                  <EyeOff className="w-3 h-3" /> Hidden on the site
                </Badge>
              ) : undefined
            }
          />
        </div>
        <div
          className="py-6 overflow-hidden"
          style={{
            background: 'var(--ds-bg)',
            borderTop: '1px solid var(--a-border)',
            borderBottomLeftRadius: 'var(--a-radius)',
            borderBottomRightRadius: 'var(--a-radius)',
            opacity: draft.isEnabled ? 1 : 0.55,
          }}
        >
          {count > 0 ? (
            <ReviewImagesSection config={previewConfig} />
          ) : (
            <p className="text-center py-8" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
              Add screenshots to see the preview.
            </p>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------- unsaved bar */}
      {dirty && (
        <div
          className="sticky bottom-3 mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 ds-slide-up"
          style={{
            zIndex: 'var(--ds-z-sticky)' as any,
            borderRadius: 'var(--ds-r-lg)',
            background: 'var(--a-surface)',
            border: '1px solid var(--a-border)',
            boxShadow: 'var(--ds-shadow-lg)',
          }}
        >
          <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
            You have unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <Button icon={RotateCcw} onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" icon={Save} onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      <MediaLibraryModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        onSelect={(url) => addUrls([url])}
        onSelectMany={addUrls}
        title="Add customer review screenshots"
      />

      <ConfirmDialog
        open={confirmClear}
        title="Remove all screenshots?"
        message="Every screenshot will be removed from the section. The files stay in the media library. Nothing changes on the site until you save."
        confirmLabel="Remove all"
        onConfirm={() => {
          setImages(() => []);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};
