import React, { useState } from 'react';
import { Image as ImageIcon, UploadCloud, X, Plus, GripVertical } from 'lucide-react';
import { MediaLibraryModal } from './MediaLibraryModal.tsx';
import { IconButton } from './ui.tsx';

/**
 * Image picker used by every form that holds an image: product, category,
 * brand, banner, logo, favicon.
 *
 * Two shapes:
 *   <MediaPicker value={url} onChange={setUrl} />                  one image
 *   <MediaPicker gallery values={urls} onChangeMany={setUrls} />   many images
 *
 * The gallery form is what the product form uses for its extra images, so a
 * whole batch can be uploaded in one pass and then reordered by dragging.
 */

interface BaseProps {
  label?: string;
  placeholder?: string;
  modalTitle?: string;
  className?: string;
  /** hides the raw URL box when the operator only needs the thumbnail */
  hideUrlInput?: boolean;
}

interface SingleProps extends BaseProps {
  gallery?: false;
  value?: string | null;
  onChange: (url: string) => void;
}

interface GalleryProps extends BaseProps {
  gallery: true;
  values: string[];
  onChangeMany: (urls: string[]) => void;
  /** optional cap, e.g. 8 gallery images per product */
  max?: number;
}

type MediaPickerProps = SingleProps | GalleryProps;

export const MediaPicker: React.FC<MediaPickerProps> = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const { label, modalTitle, className = '' } = props;

  /* ------------------------------------------------------------- gallery */
  if (props.gallery) {
    const { values, onChangeMany, max } = props;
    const atLimit = typeof max === 'number' && values.length >= max;

    const removeAt = (index: number) => onChangeMany(values.filter((_, i) => i !== index));

    const moveTo = (from: number, to: number) => {
      if (from === to) return;
      const next = [...values];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChangeMany(next);
    };

    return (
      <div className={className}>
        {label && <label className="a-label">{label}</label>}

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {values.map((url, index) => (
            <div
              key={`${url}-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) moveTo(dragIndex, index);
                setDragIndex(null);
              }}
              className="relative group overflow-hidden"
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--ds-r-md)',
                border: '1px solid var(--a-border)',
                background: 'var(--a-surface-2)',
                opacity: dragIndex === index ? 0.5 : 1,
                cursor: 'grab',
              }}
            >
              <img
                src={url}
                alt={`Image ${index + 1}`}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(event) => {
                  const img = event.currentTarget;
                  img.onerror = null;
                  img.style.display = 'none';
                }}
              />

              {index === 0 && (
                <span
                  className="absolute top-1.5 left-1.5 px-1.5 py-0.5 font-bold"
                  style={{
                    fontSize: 'var(--a-fs-2xs)',
                    borderRadius: 'var(--ds-r-xs)',
                    background: 'var(--primary)',
                    color: '#fff',
                  }}
                >
                  Main
                </span>
              )}

              <span
                className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' }}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>

              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label="Remove image"
                className="absolute top-1.5 right-1.5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--ds-r-xs)',
                  background: 'rgba(19,25,34,0.7)',
                  color: '#fff',
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {!atLimit && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:brightness-[0.98]"
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--ds-r-md)',
                border: '2px dashed var(--a-border-strong)',
                background: 'var(--a-surface-2)',
                color: 'var(--a-text-muted)',
              }}
            >
              <Plus className="w-5 h-5" />
              <span style={{ fontSize: 'var(--a-fs-2xs)', fontWeight: 600 }}>Add Image</span>
            </button>
          )}
        </div>

        <p className="mt-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          The first image is used as the main image. Drag images to reorder.
          {typeof max === 'number' && ` Up to ${max} images.`}
        </p>

        <MediaLibraryModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          multiple
          onSelect={(url) => onChangeMany([...values, url])}
          onSelectMany={(urls) => {
            const merged = [...values, ...urls.filter((url) => !values.includes(url))];
            onChangeMany(typeof max === 'number' ? merged.slice(0, max) : merged);
          }}
          title={modalTitle || 'Add Images to Gallery'}
        />
      </div>
    );
  }

  /* -------------------------------------------------------------- single */
  const { value, onChange, placeholder = 'Choose an image from the library...', hideUrlInput } = props;

  return (
    <div className={className}>
      {label && <label className="a-label">{label}</label>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative group flex items-center justify-center overflow-hidden shrink-0 cursor-pointer transition-all"
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--ds-r-md)',
            border: `1px solid ${value ? 'var(--a-border)' : 'var(--a-border-strong)'}`,
            background: 'var(--a-surface-2)',
          }}
        >
          {value ? (
            <>
              <img
                src={value}
                alt="Selected"
                className="w-full h-full object-cover"
                onError={(event) => {
                  const img = event.currentTarget;
                  img.onerror = null;
                  img.style.display = 'none';
                }}
              />
              <span
                className="absolute inset-0 flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  fontSize: 'var(--a-fs-2xs)',
                  background: 'rgba(19,25,34,0.55)',
                  color: '#fff',
                }}
              >
                Change
              </span>
            </>
          ) : (
            <ImageIcon className="w-6 h-6" style={{ color: 'var(--a-text-faint)' }} />
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            {!hideUrlInput && (
              <input
                type="text"
                value={value || ''}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="a-field flex-1 truncate"
                style={{ fontSize: 'var(--a-fs-sm)' }}
              />
            )}

            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="ds-btn ds-btn-secondary ds-btn-sm shrink-0"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{value ? 'Change' : 'Upload / Choose'}</span>
            </button>

            {value && (
              <IconButton
                icon={X}
                tone="plain"
                size="sm"
                label="Remove image"
                onClick={() => onChange('')}
              />
            )}
          </div>

          {!hideUrlInput && (
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Paste a direct link, or upload and choose from the library.
            </p>
          )}
        </div>
      </div>

      <MediaLibraryModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(url) => onChange(url)}
        title={modalTitle || (label ? `Select ${label}` : 'Select Image')}
      />
    </div>
  );
};
