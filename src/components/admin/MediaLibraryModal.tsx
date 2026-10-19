import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  UploadCloud,
  Link2,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  Search,
  X,
  FolderOpen,
} from 'lucide-react';
import { Button, EmptyState, IconButton, Modal, tint } from './ui.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { hasModule } from '../../lib/permissions.ts';

/**
 * The media library.
 *
 * Three ways in — the library itself, an upload area that takes a whole batch
 * of files at once (drag them in or pick them), and a plain URL — and one way
 * out: `onSelect` with the chosen image, or `onSelectMany` when the caller
 * wants a gallery filled in one go.
 *
 * Each file in a batch reports its own progress and its own error, so one
 * oversized image no longer silently cancels the other nine.
 */

interface MediaItem {
  id: string;
  title: string;
  url: string;
  type?: string;
  size?: string;
  createdAt?: string;
  /** listed in the library but the file exists nowhere any more */
  missing?: boolean;
}

/** One entry in the upload tray, tracked from picked to done */
interface PendingUpload {
  key: string;
  name: string;
  preview: string;
  sizeLabel: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  /** When given, the picker lets several images be ticked and returns them all */
  onSelectMany?: (urls: string[]) => void;
  title?: string;
  multiple?: boolean;
}

const MAX_FILES = 25;
const MAX_BYTES = 8 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Phone photos are often 3–8 MB and 4000px wide — slow to upload on mobile
 * data and far bigger than any page shows. Big photos are scaled to at most
 * 2000px and re-encoded (WebP where the browser can, JPEG otherwise) before
 * upload; the smaller of the two versions is kept. Logos, SVGs, GIFs and
 * small files are sent exactly as picked.
 */
const RESIZE_ABOVE_BYTES = 900 * 1024;
const MAX_EDGE = 2000;

async function prepareImage(file: File): Promise<Blob & { name?: string }> {
  const type = (file.type || '').toLowerCase();
  if (!/^image\/(jpe?g|png|webp)$/.test(type) || file.size <= RESIZE_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const encode = (mime: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), mime, quality));
    let blob = await encode('image/webp', 0.86);
    // Safari cannot write WebP; a PNG with transparency must stay PNG
    if (!blob || blob.type !== 'image/webp') blob = type === 'image/png' ? await encode('image/png', 1) : await encode('image/jpeg', 0.86);
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  onSelectMany,
  title = 'Select Image',
  multiple = false,
}) => {
  const { user } = useAuth();
  // Removing a file is for whoever manages content; everyone else only picks and uploads
  const canDelete = hasModule(user, 'website', 'products', 'landing');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<'library' | 'upload' | 'url'>('library');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [urlValue, setUrlValue] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  const [queue, setQueue] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The session token is attached by the global fetch interceptor
  // (src/lib/api.ts). Building the header here once read the wrong storage key,
  // sent an empty token, got a 401 — and that 401 signed the admin out.

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/media');
      if (!res.ok) throw new Error('Could not load.');
      const data = await res.json();
      setMediaList(Array.isArray(data) ? data : []);
    } catch {
      setLoadError('Could not load the media library.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadLibrary();
    setPicked([]);
    setSearch('');
    setQueue([]);
    setActiveTab('library');
  }, [isOpen, loadLibrary]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mediaList;
    return mediaList.filter((item) => (item.title || '').toLowerCase().includes(term));
  }, [mediaList, search]);

  /* ---------------------------------------------------------------- upload */

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) return;

    const room = MAX_FILES - queue.length;
    const accepted = list.slice(0, Math.max(0, room));

    // One key per file, generated once and used for BOTH the tray entry and the
    // stored File. Building the key twice (it used the clock) let the two drift
    // apart by a millisecond, so the upload found no files and sent nothing.
    const entries: PendingUpload[] = accepted.map((file) => {
      keySeed.current += 1;
      const key = `${keySeed.current}-${file.name}-${file.size}`;
      fileStore.current.set(key, file);
      const tooLarge = file.size > MAX_BYTES;
      return {
        key,
        name: file.name,
        preview: URL.createObjectURL(file),
        sizeLabel: humanSize(file.size),
        status: tooLarge ? 'error' : 'queued',
        error: tooLarge ? `Too large (${humanSize(file.size)})` : undefined,
      };
    });

    setQueue((current) => [...current, ...entries]);
  };

  // Files are held outside React state so re-renders don't copy the blobs
  const fileStore = useRef<Map<string, File>>(new Map());
  const keySeed = useRef(0);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  };

  const removeFromQueue = (key: string) => {
    setQueue((current) => current.filter((item) => item.key !== key));
    fileStore.current.delete(key);
  };

  const uploadQueue = async () => {
    const ready = queue.filter((item) => item.status === 'queued');
    if (ready.length === 0) return;

    setUploading(true);
    const setItem = (key: string, patch: Partial<PendingUpload>) =>
      setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setQueue((current) =>
      current.map((item) => (item.status === 'queued' ? { ...item, status: 'uploading' } : item))
    );

    // One file per request: a batch of phone photos in one request could pass
    // the host's upload size limit and fail as a whole.
    const uploaded: MediaItem[] = [];
    for (const item of ready) {
      const file = fileStore.current.get(item.key);
      if (!file) {
        setItem(item.key, { status: 'error', error: 'File no longer available — pick it again.' });
        continue;
      }
      try {
        const prepared = await prepareImage(file);
        const res = await fetch('/api/media/upload-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: [{ dataUrl: await readAsDataUrl(prepared), fileName: item.name }] }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 413) throw new Error('Too large for the server. Try a smaller image.');
        if (!res.ok) throw new Error(data?.error || 'Upload failed.');
        const failure = (data.failed || [])[0];
        if (failure) throw new Error(String(failure.error || 'Upload failed.'));
        const saved: MediaItem | undefined = (data.uploaded || [])[0];
        if (!saved) throw new Error('Upload failed.');
        uploaded.push(saved);
        setItem(item.key, { status: 'done' });
      } catch (error: any) {
        setItem(item.key, { status: 'error', error: error?.message || 'Upload failed. Check the connection and try again.' });
      }
    }

    setUploading(false);
    if (uploaded.length === 0) return;
    setMediaList((current) => [...uploaded, ...current.filter((entry) => !uploaded.some((u) => u.url === entry.url))]);
    if (multiple && onSelectMany) {
      // Straight into the gallery — that is what the batch was for
      setPicked((current) => [...current, ...uploaded.map((item) => item.url)]);
      setActiveTab('library');
    } else if (uploaded.length === 1 && ready.length === 1) {
      onSelect(uploaded[0].url);
      onClose();
    } else {
      setActiveTab('library');
    }
  };

  const addByUrl = async () => {
    const value = urlValue.trim();
    if (!value) return;
    setUrlBusy(true);
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, title: value.split('/').pop() || 'Image' }),
      });
      if (res.ok) {
        const item = await res.json();
        setMediaList((current) => [item, ...current]);
        onSelect(item.url);
        onClose();
      }
    } finally {
      setUrlBusy(false);
      setUrlValue('');
    }
  };

  const deleteItem = async (id: string) => {
    setMediaList((current) => current.filter((item) => item.id !== id));
    await fetch(`/api/media/${id}`, {
      method: 'DELETE' }).catch(() => {
      /* the row is already gone from the view; a reload will resync */
    });
  };

  const choose = (url: string) => {
    if (multiple && onSelectMany) {
      setPicked((current) =>
        current.includes(url) ? current.filter((item) => item !== url) : [...current, url]
      );
      return;
    }
    onSelect(url);
    onClose();
  };

  const confirmMany = () => {
    if (picked.length === 0) return;
    onSelectMany?.(picked);
    onClose();
  };

  const queuedCount = queue.filter((item) => item.status === 'queued').length;

  const tabs: Array<{ id: 'library' | 'upload' | 'url'; label: string; icon: any }> = [
    { id: 'library', label: 'Library', icon: FolderOpen },
    { id: 'upload', label: 'Upload', icon: UploadCloud },
    { id: 'url', label: 'Link', icon: Link2 },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      subtitle={
        multiple
          ? 'Select or upload multiple images at once.'
          : 'Pick from the library, upload a new image or add a link.'
      }
      width="max-w-4xl"
      footer={
        multiple ? (
          <>
            <span className="mr-auto" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
              {picked.length} selected
            </span>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={Check} onClick={confirmMany} disabled={picked.length === 0}>
              Add
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 mb-4"
        style={{ background: 'var(--a-surface-3)', borderRadius: 'var(--ds-r-md)' }}
      >
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-all"
              style={{
                height: 34,
                borderRadius: 'var(--ds-r-sm)',
                fontSize: 'var(--a-fs-md)',
                background: isActive ? 'var(--ds-surface)' : 'transparent',
                color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
                boxShadow: isActive ? 'var(--ds-shadow-xs)' : 'none',
              }}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--a-text-muted)' }}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by image name"
              className="a-field pl-9"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <span
                  key={index}
                  className="ds-skeleton block"
                  style={{ aspectRatio: '1', borderRadius: 'var(--ds-r-md)' }}
                />
              ))}
            </div>
          ) : loadError ? (
            <EmptyState title={loadError} icon={AlertCircle} action={<Button onClick={loadLibrary}>Try Again</Button>} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'No results found' : 'Library is empty'}
              description={
                search
                  ? 'Try searching with a different name.'
                  : 'Add your first images from the Upload tab.'
              }
              icon={ImageIcon}
              action={
                !search ? (
                  <Button variant="primary" icon={UploadCloud} onClick={() => setActiveTab('upload')}>
                    Upload Images
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[46vh] overflow-y-auto pr-1">
              {filtered.map((item) => {
                const isPicked = picked.includes(item.url);
                return (
                  <div
                    key={item.id}
                    onClick={() => choose(item.url)}
                    className="relative group cursor-pointer overflow-hidden transition-all"
                    style={{
                      aspectRatio: '1',
                      borderRadius: 'var(--ds-r-md)',
                      border: `2px solid ${isPicked ? 'var(--primary)' : 'var(--a-border)'}`,
                      background: 'var(--a-surface-2)',
                      boxShadow: isPicked ? 'var(--ds-ring)' : 'none',
                    }}
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(event) => {
                        const img = event.currentTarget;
                        img.onerror = null;
                        img.style.display = 'none';
                      }}
                    />

                    {item.missing && (
                      <span
                        className="absolute inset-x-0 bottom-0 px-2 py-1 text-center font-semibold"
                        style={{ fontSize: 'var(--a-fs-xs)', background: 'var(--ds-danger)', color: '#fff' }}
                        title="This file was lost before v3.7 (it is not on the server any more). Upload it again."
                      >
                        File missing — upload again
                      </span>
                    )}
                    {isPicked && (
                      <span
                        className="absolute top-2 left-2 inline-flex items-center justify-center"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          background: 'var(--primary)',
                          color: '#fff',
                        }}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}

                    <button
                      hidden={!canDelete}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItem(item.id);
                      }}
                      aria-label="Delete image"
                      className="absolute top-2 right-2 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 'var(--ds-r-xs)',
                        background: 'rgba(19,25,34,0.66)',
                        color: '#fff',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <span
                      className="absolute inset-x-0 bottom-0 px-2 py-1.5 truncate"
                      style={{
                        fontSize: 'var(--a-fs-2xs)',
                        color: '#fff',
                        background: 'linear-gradient(to top, rgba(19,25,34,0.8), transparent)',
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- UPLOAD */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (event.dataTransfer.files) addFiles(event.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center justify-center text-center px-6 py-10 cursor-pointer transition-all"
            style={{
              borderRadius: 'var(--ds-r-lg)',
              border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--a-border-strong)'}`,
              background: dragOver ? tint(0.05) : 'var(--a-surface-2)',
            }}
          >
            <span
              className="inline-flex items-center justify-center mb-3"
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--ds-r-xl)',
                background: tint(0.12),
                color: 'var(--primary-ink, var(--primary))',
              }}
            >
              <UploadCloud className="w-7 h-7" />
            </span>
            <p className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Drag images here
            </p>
            <p className="mt-1" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
              or click to select multiple images: up to {MAX_FILES} files, 8 MB each
            </p>
            <p className="mt-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-faint)' }}>
              JPG · PNG · WEBP · GIF · AVIF · SVG
            </p>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePick}
              className="hidden"
            />
          </div>

          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  {queue.length} {queue.length === 1 ? 'file' : 'files'}
                </span>
                <button
                  onClick={() => {
                    setQueue([]);
                    fileStore.current.clear();
                  }}
                  className="cursor-pointer font-semibold"
                  style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-2 max-h-[34vh] overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 p-2"
                    style={{
                      borderRadius: 'var(--ds-r-md)',
                      border: '1px solid var(--a-border)',
                      background:
                        item.status === 'error' ? 'var(--ds-danger-soft)' : 'var(--ds-surface)',
                    }}
                  >
                    <img
                      src={item.preview}
                      alt={item.name}
                      className="object-cover shrink-0"
                      style={{ width: 42, height: 42, borderRadius: 'var(--ds-r-sm)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--a-fs-sm)',
                          color:
                            item.status === 'error' ? 'var(--ds-danger-text)' : 'var(--a-text-muted)',
                        }}
                      >
                        {item.error || item.sizeLabel}
                      </div>
                    </div>

                    {item.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--primary-ink, var(--primary))' }} />}
                    {item.status === 'done' && (
                      <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--ds-success)' }} strokeWidth={3} />
                    )}
                    {item.status === 'error' && (
                      <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--ds-danger)' }} />
                    )}
                    {(item.status === 'queued' || item.status === 'error') && (
                      <IconButton
                        icon={X}
                        tone="plain"
                        size="sm"
                        label="Remove"
                        onClick={() => removeFromQueue(item.key)}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Button
                variant="primary"
                icon={UploadCloud}
                block
                loading={uploading}
                disabled={queuedCount === 0}
                onClick={uploadQueue}
              >
                {queuedCount > 0 ? `Upload ${queuedCount} ${queuedCount === 1 ? 'Image' : 'Images'}` : 'Upload Complete'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------- URL */}
      {activeTab === 'url' && (
        <div className="space-y-3">
          <div>
            <label className="a-label">Image Link</label>
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addByUrl()}
              placeholder="https://..."
              className="a-field"
            />
            <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              A linked image stays on another server; if it is removed there, it disappears here too.
              Uploading your own image is safer.
            </p>
          </div>

          {urlValue.trim() && (
            <img
              src={urlValue}
              alt="Preview"
              className="w-full object-contain"
              style={{
                maxHeight: 200,
                borderRadius: 'var(--ds-r-md)',
                border: '1px solid var(--a-border)',
                background: 'var(--a-surface-2)',
              }}
            />
          )}

          <Button variant="primary" block icon={Link2} loading={urlBusy} onClick={addByUrl}>
            Use This Link
          </Button>
        </div>
      )}
    </Modal>
  );
};
