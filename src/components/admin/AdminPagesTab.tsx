import React, { useState } from 'react';
import { FileText, Plus, Edit2, Trash2, Save, Eye, ExternalLink } from 'lucide-react';
import {
  Card,
  CardHeader,
  Button,
  Field,
  Toggle,
  IconButton,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  useToasts,
} from './ui.tsx';
import { CmsPage, SiteSettings } from '../../types/index.ts';

interface AdminPagesTabProps {
  settings: SiteSettings;
  onSaveSettings: (newSettings: SiteSettings) => Promise<void>;
  onPreviewPage?: (slug: string) => void;
}

/** Pages most stores need — offered as blank starting points, never pre-written */
const STARTERS: Array<{ title: string; slug: string }> = [
  { title: 'About Us', slug: 'about' },
  { title: 'Contact', slug: 'contact' },
  { title: 'FAQ', slug: 'faq' },
  { title: 'Delivery & Shipping Policy', slug: 'delivery' },
  { title: 'Return & Refund Policy', slug: 'refund' },
  { title: 'Terms & Conditions', slug: 'terms' },
  { title: 'Privacy Policy', slug: 'privacy' },
];

const toSlug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-');

/** The same small markdown subset the storefront page view understands */
const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => {
  if (!content.trim()) {
    return (
      <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-faint)' }}>
        Start writing to see how the page will look.
      </p>
    );
  }
  return (
    <div>
      {content.split('\n').map((line, index) => {
        if (line.startsWith('## '))
          return (
            <h2 key={index} className="font-bold mt-3 mb-2" style={{ fontSize: 'var(--ds-fs-lg)' }}>
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith('### '))
          return (
            <h3 key={index} className="font-bold mt-2 mb-1" style={{ fontSize: 'var(--ds-fs-md)' }}>
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={index} className="ml-4 list-disc" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)' }}>
              {line.slice(2)}
            </li>
          );
        if (!line.trim()) return <div key={index} style={{ height: 'var(--ds-s-2)' }} />;
        return (
          <p key={index} className="mb-1" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)', lineHeight: 'var(--ds-lh-bn)' }}>
            {line}
          </p>
        );
      })}
    </div>
  );
};

export const AdminPagesTab: React.FC<AdminPagesTabProps> = ({ settings, onSaveSettings, onPreviewPage }) => {
  const toasts = useToasts();
  const [pages, setPages] = useState<CmsPage[]>(settings.pages || []);

  const [selectedPage, setSelectedPage] = useState<CmsPage | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPublished, setFormPublished] = useState(true);

  const handleStartAdd = (starter?: { title: string; slug: string }) => {
    setSelectedPage(null);
    setFormTitle(starter?.title || '');
    setFormSlug(starter?.slug || '');
    setFormContent('');
    setFormPublished(true);
    setIsEditing(true);
  };

  const handleStartEdit = (page: CmsPage) => {
    setSelectedPage(page);
    setFormTitle(page.title);
    setFormSlug(page.slug);
    setFormContent(page.content || '');
    setFormPublished(page.isPublished !== false);
    setIsEditing(true);
  };

  const persistPages = async (pagesToSave: CmsPage[]) => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, pages: pagesToSave });
      toasts.push('Page saved.');
    } catch (err) {
      console.error(err);
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formTitle.trim() || !formSlug.trim()) {
      toasts.push('Enter both a title and a slug.', 'warning');
      return;
    }

    let updated: CmsPage[];
    if (selectedPage) {
      updated = pages.map((p) =>
        p.id === selectedPage.id
          ? { ...p, title: formTitle.trim(), slug: toSlug(formSlug), content: formContent, isPublished: formPublished }
          : p
      );
    } else {
      const newPage: CmsPage = {
        id: `page_${Date.now()}`,
        title: formTitle.trim(),
        slug: toSlug(formSlug),
        content: formContent,
        isPublished: formPublished,
      };
      updated = [...pages, newPage];
    }

    setPages(updated);
    setIsEditing(false);
    await persistPages(updated);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const updated = pages.filter((p) => p.id !== deleteId);
    setDeleteId(null);
    setPages(updated);
    await persistPages(updated);
  };

  const existingSlugs = new Set(pages.map((p) => p.slug));
  const missingStarters = STARTERS.filter((s) => !existingSlugs.has(s.slug));

  const starterChips = (
    <div className="flex flex-wrap gap-2 justify-center">
      {missingStarters.map((starter) => (
        <Button key={starter.slug} size="sm" variant="soft" icon={Plus} onClick={() => handleStartAdd(starter)}>
          {starter.title}
        </Button>
      ))}
    </div>
  );

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Pages & Policies"
        subtitle="Create and edit About Us, Contact, FAQ and policy pages."
        icon={FileText}
        accent="var(--ds-violet)"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => handleStartAdd()}>
            <span className="hidden sm:inline">New Page</span>
          </Button>
        }
      />

      {pages.length === 0 ? (
        <div style={{ borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--a-border-strong)' }}>
          <EmptyState
            icon={FileText}
            title="No pages yet"
            description="Start with any of the pages below. A blank editor opens and you write the content."
            action={starterChips}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pages.map((page) => {
              const published = page.isPublished !== false;
              const excerpt = (page.content || '').replace(/[#*-]/g, '').trim();
              return (
                <div
                  key={page.id}
                  className="flex flex-col ds-card-hover"
                  style={{
                    padding: 'var(--ds-s-4)',
                    borderRadius: 'var(--ds-r-md)',
                    border: '1px solid var(--a-border)',
                    background: 'var(--a-surface)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge status={published ? 'published' : 'draft'} dot>
                      {published ? 'Published' : 'Draft'}
                    </Badge>
                    <span
                      className="truncate"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', fontFamily: 'var(--font-mono)' }}
                    >
                      /page/{page.slug}
                    </span>
                  </div>
                  <h4 className="font-bold ds-clamp-1" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {page.title}
                  </h4>
                  <p
                    className="ds-clamp-2 mt-1 flex-1"
                    style={{
                      fontSize: 'var(--a-fs-sm)',
                      color: excerpt ? 'var(--a-text-muted)' : 'var(--ds-warning-text)',
                    }}
                  >
                    {excerpt || 'No content yet'}
                  </p>
                  <div
                    className="flex items-center gap-1.5 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--a-border)' }}
                  >
                    <Button size="sm" variant="ghost" icon={Edit2} onClick={() => handleStartEdit(page)}>
                      Edit
                    </Button>
                    <span className="flex-1" />
                    {onPreviewPage && (
                      <IconButton
                        icon={ExternalLink}
                        size="sm"
                        tone="plain"
                        label="Preview"
                        onClick={() => onPreviewPage(page.slug)}
                      />
                    )}
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label="Delete"
                      onClick={() => setDeleteId(page.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {missingStarters.length > 0 && (
            <div className="mt-4">
              <span className="a-label">Add More Pages</span>
              <div className="flex flex-wrap gap-2">
                {missingStarters.map((starter) => (
                  <Button key={starter.slug} size="sm" variant="soft" icon={Plus} onClick={() => handleStartAdd(starter)}>
                    {starter.title}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={isEditing}
        onClose={() => setIsEditing(false)}
        title={selectedPage ? 'Edit Page' : 'Create New Page'}
        width="max-w-5xl"
        footer={
          <>
            <Button onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button variant="primary" icon={Save} type="submit" form="cms-page-form" loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <form id="cms-page-form" onSubmit={handleSavePage} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Page Title" required>
              <input
                className="a-field"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. About Us"
              />
            </Field>
            <Field label="Page Slug (URL)" required hint={formSlug ? `/page/${toSlug(formSlug)}` : undefined}>
              <input
                className="a-field"
                style={{ fontFamily: 'var(--font-mono)' }}
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="about, faq, terms..."
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="a-label">Content</label>
              <textarea
                rows={14}
                className="a-field"
                style={{ fontFamily: 'var(--font-mono)', lineHeight: 'var(--ds-lh-normal)' }}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={'## Heading\n\nWrite here...\n\n- A bullet point'}
              />
              <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                Use <code>##</code> for headings, <code>###</code> for subheadings and{' '}
                <code>-</code> for bullet points.
              </p>
            </div>
            <div className="min-w-0">
              <span className="a-label flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Preview
              </span>
              <div
                className="overflow-y-auto"
                style={{
                  maxHeight: 340,
                  minHeight: 200,
                  padding: 'var(--ds-s-4)',
                  borderRadius: 'var(--ds-r-md)',
                  border: '1px solid var(--a-border)',
                  background: 'var(--a-surface-2)',
                }}
              >
                {formTitle && (
                  <h1 className="font-bold mb-2" style={{ fontSize: 'var(--ds-fs-xl)' }}>
                    {formTitle}
                  </h1>
                )}
                <MarkdownPreview content={formContent} />
              </div>
            </div>
          </div>

          <Toggle
            checked={formPublished}
            onChange={setFormPublished}
            label="Publish on Website"
            description="When off, the page stays a draft and visitors cannot see it."
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete page?"
        message="Are you sure you want to delete this page? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
        busy={saving}
      />
    </Card>
  );
};
