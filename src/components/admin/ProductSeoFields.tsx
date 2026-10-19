import React, { useState } from 'react';
import { X, Search as SearchIcon, Share2 } from 'lucide-react';
import { Field } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';

const plain = (html: string) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tagsOf = (value: string) =>
  String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

/** Characters used, coloured once past the length Google shows */
const Counter: React.FC<{ value: string; ideal: number; max: number }> = ({ value, ideal, max }) => {
  const n = value.length;
  const color = n === 0 ? 'var(--a-text-faint)' : n <= ideal ? 'var(--ds-success-text)' : n <= max ? 'var(--ds-warning-text)' : 'var(--ds-danger-text)';
  return (
    <span className="ds-num" style={{ fontSize: 'var(--a-fs-xs)', color }}>
      {n} / {ideal}
    </span>
  );
};

/**
 * v3.15 — product form → SEO tab: the page address, the title and
 * description Google shows, the picture a shared link shows (Facebook,
 * WhatsApp, Messenger) and the product's tags (shown on the product page and
 * found by the shop's search). Empty fields fall back to the product's own
 * name, short description and main picture.
 */
export const ProductSeoFields: React.FC<{ draft: any; setDraft: (next: any) => void }> = ({ draft, setDraft }) => {
  const [tagInput, setTagInput] = useState('');
  const tags = tagsOf(draft.tags);
  const set = (patch: Record<string, any>) => setDraft({ ...draft, ...patch });
  const addTags = (text: string) => {
    const next = [...tags];
    text
      .split(',')
      .map((tag) => tag.trim().slice(0, 40))
      .filter(Boolean)
      .forEach((tag) => {
        if (!next.some((item) => item.toLowerCase() === tag.toLowerCase()) && next.length < 20) next.push(tag);
      });
    set({ tags: next.join(', ') });
    setTagInput('');
  };

  const origin = typeof window !== 'undefined' ? window.location.host : 'yourshop.com';
  const slug = draft.slug || 'auto-generated';
  const shownTitle = draft.seoTitle?.trim() || draft.name || 'Product name';
  const shownDescription =
    draft.seoDescription?.trim() || plain(draft.shortDescription) || plain(draft.description) || 'The product description appears here.';
  const shownImage = draft.seoImage || draft.image || '';

  return (
    <div className="space-y-4">
      <Field label="URL Slug" hint="Leave blank to make it from the product name. Changing it later breaks links already shared.">
        <input className="a-field" value={draft.slug || ''} onChange={(event) => set({ slug: event.target.value })} />
      </Field>

      <Field
        label={
          <span className="flex items-center justify-between gap-2 w-full">
            <span>SEO title</span>
            <Counter value={draft.seoTitle || ''} ideal={60} max={70} />
          </span>
        }
        hint="The blue headline on Google and the browser tab. Empty = the product name and your shop name."
      >
        <input className="a-field" value={draft.seoTitle || ''} maxLength={191} placeholder={draft.name || ''} onChange={(event) => set({ seoTitle: event.target.value })} />
      </Field>

      <Field
        label={
          <span className="flex items-center justify-between gap-2 w-full">
            <span>Meta description</span>
            <Counter value={draft.seoDescription || ''} ideal={160} max={200} />
          </span>
        }
        hint="The two lines under the headline on Google. Empty = the short description."
      >
        <textarea
          className="a-field"
          rows={3}
          maxLength={500}
          value={draft.seoDescription || ''}
          placeholder={plain(draft.shortDescription).slice(0, 160)}
          onChange={(event) => set({ seoDescription: event.target.value })}
        />
      </Field>

      <MediaPicker
        label="Share picture (Facebook, WhatsApp, Messenger) — best 1200 × 630 px. Empty = the main product picture."
        value={draft.seoImage || ''}
        onChange={(url) => set({ seoImage: url })}
      />

      <Field label="Tags" hint="Type a tag and press Enter or comma (up to 20). Shown on the product page and found by the shop's search.">
        <div
          className="flex flex-wrap items-center gap-1.5 p-1.5"
          style={{ minHeight: 44, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border-strong)', background: 'var(--a-surface)' }}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 h-7 ps-2.5 pe-1"
              style={{ borderRadius: 'var(--ds-r-full)', background: 'var(--a-surface-3)', fontSize: 'var(--a-fs-sm)' }}
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => set({ tags: tags.filter((item) => item !== tag).join(', ') })}
                className="w-5 h-5 inline-flex items-center justify-center cursor-pointer"
                style={{ borderRadius: 999 }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          <input
            className="flex-1 min-w-32 h-8 px-1.5 bg-transparent outline-none"
            style={{ fontSize: 'var(--a-fs-sm)' }}
            value={tagInput}
            placeholder={tags.length ? '' : 'e.g. hair oil, hair fall, onion oil'}
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(',')) addTags(value);
              else setTagInput(value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (tagInput.trim()) addTags(tagInput);
              } else if (event.key === 'Backspace' && !tagInput && tags.length) {
                set({ tags: tags.slice(0, -1).join(', ') });
              }
            }}
            onBlur={() => tagInput.trim() && addTags(tagInput)}
          />
        </div>
      </Field>

      {/* previews */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
          <p className="inline-flex items-center gap-1.5 mb-2 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
            <SearchIcon className="w-3.5 h-3.5" /> Google preview
          </p>
          <p className="truncate" style={{ fontSize: 12, color: '#202124' }}>
            {origin} › product › {slug}
          </p>
          <p className="truncate" style={{ fontSize: 18, lineHeight: 1.3, color: '#1a0dab' }}>
            {shownTitle}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#4d5156', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {shownDescription}
          </p>
        </div>
        <div className="overflow-hidden" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
          <p className="inline-flex items-center gap-1.5 px-3 pt-3 pb-2 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
            <Share2 className="w-3.5 h-3.5" /> Shared link preview
          </p>
          <div className="aspect-[1200/630] w-full" style={{ background: 'var(--a-surface-3)' }}>
            {shownImage && <img src={shownImage} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="px-3 py-2" style={{ background: 'var(--a-surface-2)' }}>
            <p className="uppercase truncate" style={{ fontSize: 11, color: 'var(--a-text-muted)' }}>
              {origin}
            </p>
            <p className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-sm)' }}>
              {shownTitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
