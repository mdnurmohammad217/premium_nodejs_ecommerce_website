import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bold,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  ExternalLink,
  FileText,
  Globe,
  Heading2,
  Heading3,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  Newspaper,
  PenLine,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search as SearchIcon,
  Send,
  Settings2,
  Trash2,
  Video,
} from 'lucide-react';
import {
  ACCENTS,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FilterPills,
  IconButton,
  LoadingRows,
  Modal,
  PageHeader,
  SearchInput,
  SectionLoader,
  StatCard,
  TableWrap,
  Toggle,
  Toolbar,
  mix,
  tint,
  useToasts,
  type ToastKind,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { MediaLibraryModal } from './MediaLibraryModal.tsx';
import { BlogConfig, SiteSettings } from '../../types/index.ts';
import { BlogContent, formatBlogDate, parseBlogDate, plainExcerpt, readingStats } from '../../lib/blogFormat.tsx';
import { videoEmbed } from '../../lib/landingTemplates.ts';

/* ========================================================================== */
/* Types and helpers                                                           */
/* ========================================================================== */

type Toast = (text: string, kind?: ToastKind) => void;
type PostStatus = 'draft' | 'published';

/** GET /api/admin/blog row */
interface PostRow {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  author: string;
  category: string;
  publishedAt: string | null;
  views: number;
  readMinutes: number;
  status: PostStatus;
  updatedAt?: string | null;
}

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  category: string;
  tags: string;
  status: PostStatus;
  metaTitle: string;
  metaDescription: string;
  /** datetime-local value ("YYYY-MM-DDTHH:mm"), '' = when published */
  publishedAt: string;
}

const AUTHOR_KEY = 'admin:blog:last-author';
const SETTINGS_OPEN_KEY = 'admin:blog:settings-open';
const META_TITLE_SOFT = 60;
const META_DESC_SOFT = 160;
const EXCERPT_MAX = 600;

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-browser convenience only */
  }
};

/** Same rules as the server, so the URL shown is the URL you get */
export function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 150);
}

const pad = (value: number) => String(value).padStart(2, '0');

const toLocalInput = (value?: string | null): string => {
  const date = parseBlogDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalInput = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const normaliseTags = (value: string) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[,،]/)
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean)
    )
  )
    .join(', ')
    .slice(0, 255);

const emptyForm = (): PostForm => ({
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImage: '',
  author: readStorage(AUTHOR_KEY),
  category: '',
  tags: '',
  status: 'draft',
  metaTitle: '',
  metaDescription: '',
  publishedAt: '',
});

const rowToForm = (row: any): PostForm => ({
  title: row?.title || '',
  slug: row?.slug || '',
  excerpt: row?.excerpt || '',
  content: row?.content || '',
  coverImage: row?.coverImage || '',
  author: row?.author || '',
  category: row?.category || '',
  tags: row?.tags || '',
  status: row?.status === 'published' ? 'published' : 'draft',
  metaTitle: row?.metaTitle || '',
  metaDescription: row?.metaDescription || '',
  publishedAt: toLocalInput(row?.publishedAt),
});

const isFuture = (value?: string | null) => {
  const date = parseBlogDate(value);
  return Boolean(date && date.getTime() > Date.now());
};

type RowState = 'published' | 'scheduled' | 'draft';
const rowState = (row: Pick<PostRow, 'status' | 'publishedAt'>): RowState =>
  row.status !== 'published' ? 'draft' : isFuture(row.publishedAt) ? 'scheduled' : 'published';

const SCHEDULED_TONE = { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)' };

const StateBadge: React.FC<{ state: RowState }> = ({ state }) =>
  state === 'scheduled' ? (
    <Badge tone={SCHEDULED_TONE} dot>
      Scheduled
    </Badge>
  ) : (
    <Badge status={state} dot />
  );

const postUrl = (slug: string) => `/blog/${encodeURIComponent(slug)}`;

const openOnSite = (slug: string) => window.open(postUrl(slug), '_blank', 'noopener,noreferrer');

/** 16:9 cover thumbnail for the list */
const CoverThumb: React.FC<{ src?: string; title: string; width?: number }> = ({ src, title, width = 72 }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width,
        height: Math.round((width * 9) / 16),
        borderRadius: 'var(--ds-r-sm)',
        background: tint(0.08),
        border: '1px solid var(--a-border)',
        color: 'var(--primary-ink, var(--primary))',
      }}
    >
      {src && !broken ? (
        <img src={src} alt={title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Newspaper className="w-4 h-4 opacity-70" />
      )}
    </span>
  );
};

/** Label with a live character count on the right */
const CountedLabel: React.FC<{ label: string; value: string; soft: number; hint?: string }> = ({ label, value, soft, hint }) => {
  const length = value.trim().length;
  const over = length > soft;
  return (
    <div className="flex items-end justify-between gap-2">
      <label className="a-label">
        {label}
        {hint && <span style={{ color: 'var(--a-text-faint)', fontWeight: 400 }}> · {hint}</span>}
      </label>
      <span
        className="ds-num mb-1.5 shrink-0"
        style={{ fontSize: 'var(--a-fs-xs)', fontWeight: 600, color: over ? 'var(--ds-warning-text)' : 'var(--a-text-muted)' }}
      >
        {length}/{soft}
      </span>
    </div>
  );
};

const Alert: React.FC<{ tone?: 'danger' | 'info' | 'warning'; children: React.ReactNode }> = ({ tone = 'danger', children }) => {
  const tones = {
    danger: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', border: 'var(--ds-danger)', Icon: AlertCircle },
    info: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', border: 'var(--ds-info)', Icon: Info },
    warning: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', border: 'var(--ds-warning)', Icon: AlertCircle },
  }[tone];
  const ToneIcon = tones.Icon;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className="flex items-start gap-2.5"
      style={{
        padding: 'var(--ds-s-3) var(--ds-s-4)',
        borderRadius: 'var(--ds-r-md)',
        background: tones.bg,
        color: tones.fg,
        border: `1px solid ${mix(tones.border, 0.25)}`,
        fontSize: 'var(--a-fs-md)',
      }}
    >
      <ToneIcon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/* ========================================================================== */
/* Settings card                                                               */
/* ========================================================================== */

const normaliseConfig = (config?: BlogConfig) => ({
  isEnabled: config?.isEnabled !== false,
  showOnHome: config?.showOnHome !== false,
  homeTitle: config?.homeTitle ?? 'From Our Blog',
  homeSubtitle: config?.homeSubtitle ?? 'Tips, guides and news from our team',
  homeCount: Math.min(8, Math.max(3, Math.round(Number(config?.homeCount) || 5))),
  pageTitle: config?.pageTitle ?? 'Blog',
  pageSubtitle: config?.pageSubtitle ?? 'Tips, guides and news from our team',
});

const BlogSettingsCard: React.FC<{
  settings: SiteSettings;
  onSaveSettings: (s: SiteSettings) => Promise<void> | void;
  toast: Toast;
}> = ({ settings, onSaveSettings, toast }) => {
  const savedKey = JSON.stringify(settings.blog_config || null);
  const [draft, setDraft] = useState(() => normaliseConfig(settings.blog_config));
  const [baseline, setBaseline] = useState(() => JSON.stringify(normaliseConfig(settings.blog_config)));
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(() => readStorage(SETTINGS_OPEN_KEY) !== '0');

  useEffect(() => {
    const next = normaliseConfig(settings.blog_config);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [savedKey]);

  const dirty = JSON.stringify(draft) !== baseline;
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const toggleOpen = () => {
    setOpen((value) => {
      writeStorage(SETTINGS_OPEN_KEY, value ? '0' : '1');
      return !value;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const next: BlogConfig = {
        ...draft,
        homeTitle: draft.homeTitle.trim(),
        homeSubtitle: draft.homeSubtitle.trim(),
        pageTitle: draft.pageTitle.trim(),
        pageSubtitle: draft.pageSubtitle.trim(),
      };
      await onSaveSettings({ ...settings, blog_config: next });
      setBaseline(JSON.stringify(normaliseConfig(next)));
      toast('Blog settings saved.');
    } catch (error: any) {
      toast(error?.message || 'Could not save the blog settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const summary = !draft.isEnabled
    ? 'The blog is switched off'
    : draft.showOnHome
      ? `On · home page shows the latest ${draft.homeCount} posts`
      : 'On · not shown on the home page';

  return (
    <Card className="mb-4">
      <CardHeader
        title="Blog settings"
        subtitle={summary}
        icon={Settings2}
        actions={
          <>
            {dirty && (
              <Button variant="primary" size="sm" icon={Save} onClick={save} loading={saving}>
                Save
              </Button>
            )}
            <IconButton icon={open ? ChevronUp : ChevronDown} label={open ? 'Hide settings' : 'Show settings'} size="sm" onClick={toggleOpen} />
          </>
        }
      />

      {open && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4" style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
              <Toggle
                checked={draft.isEnabled}
                onChange={(value) => set('isEnabled', value)}
                label="Blog is on"
                description="Off hides the blog everywhere — the home section and the /blog pages."
              />
            </div>
            <div className="p-4" style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
              <Toggle
                checked={draft.showOnHome}
                disabled={!draft.isEnabled}
                onChange={(value) => set('showOnHome', value)}
                label="Show on the home page"
                description="The latest posts, at the very bottom of the home page above the footer."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3" style={{ opacity: draft.isEnabled && draft.showOnHome ? 1 : 0.6 }}>
              <p className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Home page section
              </p>
              <Field label="Title">
                <input className="a-field" value={draft.homeTitle} maxLength={120} onChange={(e) => set('homeTitle', e.target.value)} placeholder="From Our Blog" />
              </Field>
              <Field label="Subtitle" hint="Optional">
                <input
                  className="a-field"
                  value={draft.homeSubtitle}
                  maxLength={200}
                  onChange={(e) => set('homeSubtitle', e.target.value)}
                  placeholder="Tips, guides and news from our team"
                />
              </Field>
              <Field label="Posts on the home page">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Posts on the home page">
                  {[3, 4, 5, 6, 7, 8].map((n) => {
                    const active = draft.homeCount === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('homeCount', n)}
                        className="ds-num font-bold cursor-pointer transition-colors"
                        style={{
                          width: 'var(--ds-h-md)',
                          height: 'var(--ds-h-md)',
                          borderRadius: 'var(--ds-r-md)',
                          fontSize: 'var(--a-fs-md)',
                          background: active ? 'var(--primary)' : 'var(--a-surface)',
                          color: active ? 'var(--primary-foreground)' : 'var(--a-text-soft)',
                          border: `1px solid ${active ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  5 looks best on a computer: one large post and four beside it.
                </p>
              </Field>
            </div>

            <div className="space-y-3" style={{ opacity: draft.isEnabled ? 1 : 0.6 }}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  Blog page (/blog)
                </p>
                <a
                  href="/blog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold hover:underline"
                  style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))' }}
                >
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <Field label="Page title">
                <input className="a-field" value={draft.pageTitle} maxLength={120} onChange={(e) => set('pageTitle', e.target.value)} placeholder="Blog" />
              </Field>
              <Field label="Page subtitle" hint="Optional — shown under the title">
                <textarea
                  className="a-field"
                  rows={3}
                  value={draft.pageSubtitle}
                  maxLength={300}
                  onChange={(e) => set('pageSubtitle', e.target.value)}
                  placeholder="Tips, guides and news from our team"
                  style={{ resize: 'vertical' }}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <Button onClick={() => setDraft(normaliseConfig(settings.blog_config))} disabled={saving}>
                Discard
              </Button>
            )}
            <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!dirty && !saving}>
              Save settings
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

/* ========================================================================== */
/* Editor                                                                      */
/* ========================================================================== */

type EditResult = { value: string; start: number; end: number };
type Range = { start: number; end: number };

const LINE_MARK = /^(#{1,6}\s+|[-*•]\s+|[0-9০-৯]{1,4}[.)]\s+|>\s?)/;

/** Wrap the selection (or a placeholder) in markers, e.g. **bold** */
const wrapEdit = (before: string, after: string, placeholder: string) => (value: string, start: number, end: number): EditResult => {
  const selected = value.slice(start, end);
  // Already wrapped: take the markers off instead
  if (selected && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    return {
      value: value.slice(0, start - before.length) + selected + value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  const text = selected || placeholder;
  return {
    value: value.slice(0, start) + before + text + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + text.length,
  };
};

/** Put a line marker (## , - , 1. , > ) on every selected line — or take it off */
const lineEdit = (kind: 'h2' | 'h3' | 'ul' | 'ol' | 'quote') => (value: string, start: number, end: number): EditResult => {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  let lineEnd = value.indexOf('\n', effectiveEnd);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const prefix = (index: number) => (kind === 'h2' ? '## ' : kind === 'h3' ? '### ' : kind === 'ul' ? '- ' : kind === 'ol' ? `${index + 1}. ` : '> ');
  const has = (line: string) =>
    kind === 'h2'
      ? /^##\s/.test(line)
      : kind === 'h3'
        ? /^###\s/.test(line)
        : kind === 'ul'
          ? /^[-*•]\s/.test(line)
          : kind === 'ol'
            ? /^[0-9০-৯]{1,4}[.)]\s/.test(line)
            : /^>/.test(line);

  if (!block.trim()) {
    const placeholder = kind === 'h2' || kind === 'h3' ? 'Heading' : kind === 'quote' ? 'Quote' : 'List item';
    const insert = prefix(0) + placeholder;
    return {
      value: value.slice(0, lineStart) + insert + value.slice(lineEnd),
      start: lineStart + prefix(0).length,
      end: lineStart + insert.length,
    };
  }

  const lines = block.split('\n');
  const filled = lines.filter((line) => line.trim());
  const remove = filled.every((line) => has(line.trim()));
  let counter = 0;
  const next = lines
    .map((line) => {
      if (!line.trim()) return line;
      const bare = line.trim().replace(LINE_MARK, '');
      if (remove) return bare;
      const out = prefix(counter) + bare;
      counter += 1;
      return out;
    })
    .join('\n');
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length };
};

/** Insert a block (image, video) on a line of its own */
const blockEdit = (text: string) => (value: string, start: number, end: number): EditResult => {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = lead + text + trail;
  const caret = before.length + insert.length;
  return { value: before + insert + after, start: caret, end: caret };
};

const normaliseLinkUrl = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith('/') && !/^\/[\\/]/.test(value)) return value;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[0-9][0-9\s-]{6,}$/.test(value)) return `tel:${value.replace(/[\s-]/g, '')}`;
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value)) return `https://${value}`;
  return null;
};

const isVideoUrl = (raw: string) => {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/uploads/')) return false;
  const video = videoEmbed(value);
  if (!video) return false;
  if (video.kind === 'file') return /\.(mp4|webm|ogg)(\?|#|$)/i.test(value);
  if (video.kind === 'facebook') return /(\/videos?\/|\/watch|\/reels?\/|fb\.watch\/|\/share\/[vr]\/)/i.test(value);
  return true;
};

const HELP_ROWS: Array<[string, string]> = [
  ['## Heading', 'Section heading'],
  ['### Small heading', 'Sub-heading'],
  ['**bold**  *italic*', 'Bold and italic text'],
  ['- item', 'Bullet list (one per line)'],
  ['1. item', 'Numbered list'],
  ['> text', 'Quote'],
  ['[text](https://…)', 'Link'],
  ['![caption](image url)', 'Image on its own line'],
  ['YouTube / Facebook / .mp4 link', 'Alone on a line → video player'],
  ['Empty line', 'New paragraph'],
];

const PostEditor: React.FC<{
  id: number | null;
  categories: string[];
  blogEnabled: boolean;
  toast: Toast;
  onClose: () => void;
  onSaved: () => void;
}> = ({ id, categories, blogEnabled, toast, onClose, onSaved }) => {
  const [postId, setPostId] = useState<number | null>(id);
  const [form, setForm] = useState<PostForm>(emptyForm);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(emptyForm()));
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<null | 'save' | 'publish'>(null);
  const [error, setError] = useState('');
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [live, setLive] = useState<{ slug: string; status: PostStatus; publishedAt: string | null } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ text: string; url: string; error: string } | null>(null);
  const [videoDialog, setVideoDialog] = useState<{ url: string; error: string } | null>(null);
  const [imagePicker, setImagePicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range>({ start: 0, end: 0 });

  const dirty = JSON.stringify(form) !== snapshot;

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
    if (!id) window.setTimeout(() => titleRef.current?.focus(), 50);
  }, [id]);

  const loadPost = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/blog/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.error) throw new Error(data?.error || 'Could not load the post.');
      const next = rowToForm(data);
      setForm(next);
      setSnapshot(JSON.stringify(next));
      setLive({ slug: data.slug, status: data.status === 'published' ? 'published' : 'draft', publishedAt: data.publishedAt || null });
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the post.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  // Closing the tab with unsaved work asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const setTitle = (value: string) =>
    setForm((current) => ({ ...current, title: value, slug: slugTouched ? current.slug : slugify(value) }));

  /* ------------------------------------------------------------ toolbar */
  const currentRange = (): Range => {
    const el = textareaRef.current;
    if (!el) return { start: form.content.length, end: form.content.length };
    return { start: el.selectionStart, end: el.selectionEnd };
  };

  const applyEdit = (edit: (value: string, start: number, end: number) => EditResult, range: Range = currentRange()) => {
    const result = edit(form.content, range.start, range.end);
    setForm((current) => ({ ...current, content: result.value }));
    setTab('write');
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  };

  const openLink = () => {
    const range = currentRange();
    savedRange.current = range;
    const selected = form.content.slice(range.start, range.end);
    const looksLikeUrl = normaliseLinkUrl(selected) && !/\s/.test(selected.trim());
    setLinkDialog({ text: looksLikeUrl ? '' : selected, url: looksLikeUrl ? selected.trim() : '', error: '' });
  };

  const insertLink = () => {
    if (!linkDialog) return;
    const url = normaliseLinkUrl(linkDialog.url);
    if (!url) {
      setLinkDialog({ ...linkDialog, error: 'Enter a web address (https://…), a page on this site (/shop), an email or a phone number.' });
      return;
    }
    const text = linkDialog.text.trim() || linkDialog.url.trim();
    applyEdit((value, start, end) => {
      const insert = `[${text.replace(/[[\]]/g, '')}](${url})`;
      return { value: value.slice(0, start) + insert + value.slice(end), start: start + insert.length, end: start + insert.length };
    }, savedRange.current);
    setLinkDialog(null);
  };

  const openVideo = () => {
    savedRange.current = currentRange();
    setVideoDialog({ url: '', error: '' });
  };

  const insertVideo = () => {
    if (!videoDialog) return;
    const url = videoDialog.url.trim();
    if (!isVideoUrl(url)) {
      setVideoDialog({ ...videoDialog, error: 'Paste a YouTube or Facebook video link, or a link to an .mp4 file.' });
      return;
    }
    applyEdit(blockEdit(url), savedRange.current);
    setVideoDialog(null);
  };

  const openImages = () => {
    savedRange.current = currentRange();
    setImagePicker(true);
  };

  const insertImages = (urls: string[]) => {
    const clean = urls.filter(Boolean);
    if (clean.length === 0) return;
    applyEdit(blockEdit(clean.map((url) => `![](${url})`).join('\n\n')), savedRange.current);
  };

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      applyEdit(wrapEdit('**', '**', 'bold text'));
    } else if (key === 'i') {
      event.preventDefault();
      applyEdit(wrapEdit('*', '*', 'italic text'));
    } else if (key === 'k') {
      event.preventDefault();
      openLink();
    }
  };

  /* --------------------------------------------------------------- save */
  const save = async (publish: boolean) => {
    const title = form.title.trim();
    if (!title) {
      setError('Add a title before saving.');
      toast('Add a title before saving.', 'error');
      titleRef.current?.focus();
      return;
    }
    const status: PostStatus = publish ? 'published' : form.status;
    const slug = slugify(form.slug);
    const body = {
      title,
      ...(slug ? { slug } : {}),
      excerpt: form.excerpt.trim() || plainExcerpt(form.content, 200),
      content: form.content,
      coverImage: form.coverImage.trim(),
      author: form.author.trim(),
      category: form.category.trim(),
      tags: normaliseTags(form.tags),
      status,
      metaTitle: form.metaTitle.trim(),
      metaDescription: form.metaDescription.trim(),
      ...(form.publishedAt ? { publishedAt: fromLocalInput(form.publishedAt) } : {}),
    };

    setSaving(publish ? 'publish' : 'save');
    setError('');
    try {
      const res = await fetch(postId ? `/api/admin/blog/${postId}` : '/api/admin/blog', {
        method: postId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.error || data.success === false) {
        throw new Error(data?.error || (res.status === 413 ? 'The post is too large to save.' : `Could not save the post (error ${res.status}).`));
      }
      const saved = data.post;
      const next = saved ? rowToForm(saved) : { ...form, status };
      const wasLive = live?.status === 'published';
      setForm(next);
      setSnapshot(JSON.stringify(next));
      setSlugTouched(true);
      if (saved?.id) setPostId(saved.id);
      setLive({ slug: saved?.slug || next.slug, status: next.status, publishedAt: saved?.publishedAt || null });
      if (body.author) writeStorage(AUTHOR_KEY, body.author);
      if (saved?.slug && slug && saved.slug !== slug) toast(`That web address was taken, so the post uses /blog/${saved.slug}.`, 'info');
      toast(
        next.status === 'published'
          ? isFuture(saved?.publishedAt)
            ? `Post scheduled for ${formatBlogDate(saved?.publishedAt)}.`
            : wasLive
              ? 'Post updated.'
              : 'Post published.'
          : postId
            ? 'Draft saved.'
            : 'Draft created.'
      );
      onSaved();
    } catch (err: any) {
      const message = err?.message || 'Could not save the post.';
      setError(message);
      toast(message, 'error');
    } finally {
      setSaving(null);
    }
  };

  // Ctrl/Cmd + S saves
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) saveRef.current(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const back = () => {
    if (dirty) setConfirmLeave(true);
    else onClose();
  };

  /* ------------------------------------------------------------ derived */
  const stats = useMemo(() => readingStats(form.content), [form.content]);
  const scheduled = form.status === 'published' && isFuture(fromLocalInput(form.publishedAt));
  const isLive = live?.status === 'published' && !isFuture(live.publishedAt);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shownSlug = slugify(form.slug) || slugify(form.title) || 'your-post-address';
  const tagList = normaliseTags(form.tags).split(', ').filter(Boolean);
  const seoTitle = form.metaTitle.trim() || form.title.trim() || 'Post title';
  const seoDescription =
    form.metaDescription.trim() || form.excerpt.trim() || plainExcerpt(form.content, 160) || 'A short description of the post appears here.';

  const primaryLabel =
    form.status === 'draft' ? 'Save & publish' : scheduled ? 'Schedule' : live?.status === 'published' ? 'Update' : 'Publish';
  const primaryAction = () => save(form.status === 'draft');

  const toolbar: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; run: () => void } | 'sep'> = [
    { icon: Heading2, label: 'Heading', run: () => applyEdit(lineEdit('h2')) },
    { icon: Heading3, label: 'Small heading', run: () => applyEdit(lineEdit('h3')) },
    'sep',
    { icon: Bold, label: 'Bold (Ctrl+B)', run: () => applyEdit(wrapEdit('**', '**', 'bold text')) },
    { icon: Italic, label: 'Italic (Ctrl+I)', run: () => applyEdit(wrapEdit('*', '*', 'italic text')) },
    'sep',
    { icon: List, label: 'Bullet list', run: () => applyEdit(lineEdit('ul')) },
    { icon: ListOrdered, label: 'Numbered list', run: () => applyEdit(lineEdit('ol')) },
    { icon: Quote, label: 'Quote', run: () => applyEdit(lineEdit('quote')) },
    'sep',
    { icon: Link2, label: 'Link (Ctrl+K)', run: openLink },
    { icon: ImageIcon, label: 'Image', run: openImages },
    { icon: Video, label: 'Video link', run: openVideo },
  ];

  /* -------------------------------------------------------------- render */
  if (loading) {
    return (
      <div ref={topRef}>
        <Button icon={ArrowLeft} variant="ghost" onClick={onClose} className="mb-4">
          All posts
        </Button>
        <Card>
          <SectionLoader lines={8} />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div ref={topRef}>
        <Button icon={ArrowLeft} variant="ghost" onClick={onClose} className="mb-4">
          All posts
        </Button>
        <Card>
          <ErrorState title="Could not open the post" message={loadError} onRetry={loadPost} />
        </Card>
      </div>
    );
  }

  const boxStyle: React.CSSProperties = { borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' };

  return (
    <div ref={topRef} className="pb-6">
      {/* ---------------------------------------------------- action bar */}
      <div
        className="sticky top-0 -mx-1 px-1 pb-3 mb-3"
        style={{ zIndex: 'var(--ds-z-sticky)' as any, background: 'var(--a-bg)' }}
      >
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3"
          style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface)', border: '1px solid var(--a-border)', boxShadow: 'var(--ds-shadow-sm)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <IconButton icon={ArrowLeft} label="Back to all posts" onClick={back} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold truncate" style={{ fontSize: 'var(--ds-fs-lg)' }}>
                  {postId ? 'Edit post' : 'New post'}
                </h1>
                {live ? <StateBadge state={rowState({ status: live.status, publishedAt: live.publishedAt })} /> : <Badge status="draft">Not saved</Badge>}
              </div>
              <p style={{ fontSize: 'var(--a-fs-sm)', color: dirty ? 'var(--ds-warning-text)' : 'var(--a-text-muted)' }}>
                {dirty ? 'Unsaved changes' : postId ? 'All changes saved' : 'Start writing — nothing is public until you publish'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {isLive && live && (
              <Button size="sm" icon={ExternalLink} onClick={() => openOnSite(live.slug)}>
                View
              </Button>
            )}
            {form.status === 'draft' && (
              <Button icon={Save} onClick={() => save(false)} loading={saving === 'save'} disabled={Boolean(saving)}>
                Save draft
              </Button>
            )}
            <Button
              variant="primary"
              icon={form.status === 'draft' ? Send : scheduled ? CalendarClock : Check}
              onClick={primaryAction}
              loading={saving === 'publish' || (saving === 'save' && form.status === 'published')}
              disabled={Boolean(saving)}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-4 empty:hidden">
        {error && <Alert>{error}</Alert>}
        {!blogEnabled && (
          <Alert tone="warning">
            The blog is switched off in Blog settings, so published posts are not visible on the site yet.
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ------------------------------------------------ main column */}
        <div className="space-y-5 min-w-0">
          <Card>
            <div className="space-y-4">
              <Field label="Title" required>
                <input
                  ref={titleRef}
                  className="a-field"
                  value={form.title}
                  maxLength={255}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 5 ways to store dry fruits so they stay fresh"
                  style={{ fontSize: 'var(--ds-fs-xl)', fontWeight: 700, minHeight: 50 }}
                />
              </Field>

              <div>
                <label className="a-label">Web address</label>
                <div className="flex items-stretch overflow-hidden" style={{ borderRadius: 'var(--a-radius-sm)', border: '1px solid var(--a-border-strong)' }}>
                  <span
                    className="hidden sm:inline-flex items-center px-3 shrink-0 truncate max-w-[45%]"
                    style={{ background: 'var(--a-surface-3)', color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-sm)' }}
                  >
                    {origin.replace(/^https?:\/\//, '')}/blog/
                  </span>
                  <input
                    className="flex-1 min-w-0 px-3 outline-none bg-transparent"
                    style={{ fontSize: 'var(--a-fs-md)', minHeight: 'var(--ds-h-md)', color: 'var(--a-text)' }}
                    value={form.slug}
                    maxLength={150}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set('slug', e.target.value.replace(/\s+/g, '-'));
                    }}
                    onBlur={() => set('slug', slugify(form.slug))}
                    placeholder={slugify(form.title) || 'post-address'}
                    aria-label="Post web address"
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <span className="truncate min-w-0">
                    {origin}/blog/{shownSlug}
                  </span>
                  {form.title && slugify(form.title) !== slugify(form.slug) && (
                    <button
                      type="button"
                      className="font-semibold cursor-pointer hover:underline shrink-0"
                      style={{ color: 'var(--primary-ink, var(--primary))' }}
                      onClick={() => {
                        set('slug', slugify(form.title));
                        setSlugTouched(!!postId);
                      }}
                    >
                      Use the title
                    </button>
                  )}
                </div>
                {live?.status === 'published' && live.slug && slugify(form.slug) && slugify(form.slug) !== live.slug && (
                  <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-warning-text)' }}>
                    Changing the address of a published post breaks links already shared.
                  </p>
                )}
              </div>

              <div>
                <CountedLabel label="Excerpt" value={form.excerpt} soft={200} hint="shown on blog cards" />
                <textarea
                  className="a-field"
                  rows={3}
                  maxLength={EXCERPT_MAX}
                  value={form.excerpt}
                  onChange={(e) => set('excerpt', e.target.value)}
                  placeholder="One or two sentences that make people want to read on. Left empty, the start of the post is used."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </Card>

          <Card padded={false}>
            {/* Write / preview + toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
              <div className="inline-flex p-1 gap-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }} role="tablist">
                {(['write', 'preview'] as const).map((key) => {
                  const active = tab === key;
                  const TabIcon = key === 'write' ? PenLine : Eye;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(key)}
                      className="inline-flex items-center gap-1.5 px-3 font-semibold cursor-pointer transition-colors"
                      style={{
                        height: 30,
                        borderRadius: 'var(--ds-r-sm)',
                        fontSize: 'var(--a-fs-md)',
                        background: active ? 'var(--a-surface)' : 'transparent',
                        color: active ? 'var(--a-text)' : 'var(--a-text-muted)',
                        boxShadow: active ? 'var(--ds-shadow-xs)' : undefined,
                      }}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      {key === 'write' ? 'Write' : 'Preview'}
                    </button>
                  );
                })}
              </div>
              <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                {stats.words.toLocaleString('en-US')} words · {stats.minutes} min read
              </span>
            </div>

            {tab === 'write' ? (
              <div className="p-3">
                <div
                  className="flex items-center gap-0.5 overflow-x-auto ds-scroll-hide p-1 mb-2"
                  style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface-2)' }}
                  role="toolbar"
                  aria-label="Formatting"
                >
                  {toolbar.map((item, index) =>
                    item === 'sep' ? (
                      <span key={`sep-${index}`} className="mx-1 shrink-0" style={{ width: 1, height: 20, background: 'var(--a-border-strong)' }} />
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={item.run}
                        className="inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:bg-[var(--a-surface-3)]"
                        style={{ width: 34, height: 32, borderRadius: 'var(--ds-r-sm)', color: 'var(--a-text-soft)' }}
                      >
                        <item.icon className="w-4 h-4" />
                      </button>
                    )
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setShowHelp((value) => !value)}
                    className="inline-flex items-center gap-1 px-2 shrink-0 font-semibold cursor-pointer"
                    style={{ height: 32, borderRadius: 'var(--ds-r-sm)', fontSize: 'var(--a-fs-sm)', color: showHelp ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-muted)' }}
                    aria-expanded={showHelp}
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Help</span>
                  </button>
                </div>

                {showHelp && (
                  <div className="mb-2 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5" style={boxStyle}>
                    {HELP_ROWS.map(([code, meaning]) => (
                      <div key={code} className="flex items-baseline justify-between gap-3" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        <code className="font-semibold" style={{ color: 'var(--a-text)' }}>
                          {code}
                        </code>
                        <span className="text-right" style={{ color: 'var(--a-text-muted)' }}>
                          {meaning}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  className="a-field"
                  value={form.content}
                  onChange={(e) => set('content', e.target.value)}
                  onKeyDown={onEditorKeyDown}
                  placeholder={'Write your post here…\n\nLeave an empty line between paragraphs. Use the buttons above for headings, lists, links, images and videos.'}
                  aria-label="Post content"
                  spellCheck
                  style={{ minHeight: 460, resize: 'vertical', fontSize: 15, lineHeight: 1.75, padding: '14px 16px' }}
                />
              </div>
            ) : (
              <div className="p-3">
                <div className="p-5 sm:p-8" style={{ ...boxStyle, background: 'var(--ds-surface)' }}>
                  {form.coverImage && (
                    <img
                      src={form.coverImage}
                      alt=""
                      className="w-full aspect-video object-cover mb-6"
                      style={{ borderRadius: 'var(--ds-r-xl)' }}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <h1 className="font-extrabold mb-6" style={{ fontSize: 'var(--ds-fs-3xl)', lineHeight: 1.25 }}>
                    {form.title || 'Untitled post'}
                  </h1>
                  {form.content.trim() ? (
                    <BlogContent text={form.content} />
                  ) : (
                    <p style={{ color: 'var(--a-text-muted)' }}>Nothing written yet.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------ side column */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Publish" icon={Send} />
            <div className="space-y-4">
              <div>
                <label className="a-label">Status</label>
                <div className="grid grid-cols-2 gap-1 p-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }} role="radiogroup" aria-label="Status">
                  {(['draft', 'published'] as const).map((value) => {
                    const active = form.status === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('status', value)}
                        className="font-semibold cursor-pointer transition-colors"
                        style={{
                          height: 32,
                          borderRadius: 'var(--ds-r-sm)',
                          fontSize: 'var(--a-fs-md)',
                          background: active ? 'var(--a-surface)' : 'transparent',
                          color: active ? (value === 'published' ? 'var(--ds-success-text)' : 'var(--ds-warning-text)') : 'var(--a-text-muted)',
                          boxShadow: active ? 'var(--ds-shadow-xs)' : undefined,
                        }}
                      >
                        {value === 'draft' ? 'Draft' : 'Published'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field
                label="Publish date"
                hint={
                  scheduled
                    ? `Scheduled — goes live on ${formatBlogDate(fromLocalInput(form.publishedAt))}.`
                    : 'Optional. Empty = the moment you publish. A future date schedules the post.'
                }
              >
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    className="a-field ds-num flex-1 min-w-0"
                    value={form.publishedAt}
                    onChange={(e) => set('publishedAt', e.target.value)}
                  />
                  {form.publishedAt && <IconButton icon={Trash2} tone="plain" size="sm" label="Clear date" onClick={() => set('publishedAt', '')} />}
                </div>
              </Field>

              {isLive && live && (
                <a
                  href={postUrl(live.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 font-semibold hover:underline"
                  style={{ ...boxStyle, fontSize: 'var(--a-fs-md)', color: 'var(--primary-ink, var(--primary))' }}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="truncate">View on site</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-auto shrink-0" />
                </a>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Cover image" icon={ImageIcon} />
            <MediaPicker value={form.coverImage} onChange={(url) => set('coverImage', url)} modalTitle="Choose a cover image" />
            {form.coverImage && (
              <div className="mt-3 overflow-hidden" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', aspectRatio: '16 / 9', background: 'var(--a-surface-2)' }}>
                <img src={form.coverImage} alt="Cover preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
            <p className="mt-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Wide 16:9 images look best, e.g. 1200 × 675.
            </p>
          </Card>

          <Card>
            <CardHeader title="Organise" icon={FileText} />
            <div className="space-y-4">
              <Field label="Category" hint="Pick one you used before or type a new one">
                <input
                  className="a-field"
                  list="blog-category-options"
                  value={form.category}
                  maxLength={100}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="e.g. Health tips"
                />
                <datalist id="blog-category-options">
                  {categories.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Tags" hint="Separate with commas">
                <input
                  className="a-field"
                  value={form.tags}
                  maxLength={255}
                  onChange={(e) => set('tags', e.target.value)}
                  onBlur={() => set('tags', normaliseTags(form.tags))}
                  placeholder="dates, almonds, healthy snacks"
                />
              </Field>
              {tagList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 -mt-2">
                  {tagList.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 font-semibold"
                      style={{ borderRadius: 999, fontSize: 'var(--a-fs-xs)', background: tint(0.1), color: 'var(--primary-ink, var(--primary))' }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <Field label="Author">
                <input className="a-field" value={form.author} maxLength={191} onChange={(e) => set('author', e.target.value)} placeholder="Your name or the shop name" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Search engines (SEO)" subtitle="Optional — the title and excerpt are used when empty" icon={SearchIcon} />
            <div className="space-y-4">
              <div>
                <CountedLabel label="SEO title" value={form.metaTitle} soft={META_TITLE_SOFT} />
                <input
                  className="a-field"
                  value={form.metaTitle}
                  maxLength={255}
                  onChange={(e) => set('metaTitle', e.target.value)}
                  placeholder={form.title || 'Title shown in Google'}
                />
              </div>
              <div>
                <CountedLabel label="SEO description" value={form.metaDescription} soft={META_DESC_SOFT} />
                <textarea
                  className="a-field"
                  rows={3}
                  maxLength={500}
                  value={form.metaDescription}
                  onChange={(e) => set('metaDescription', e.target.value)}
                  placeholder="One or two sentences shown under the title in search results"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="p-3" style={boxStyle} aria-label="Search result preview">
                <p style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }} className="truncate">
                  {origin.replace(/^https?:\/\//, '')} › blog › {shownSlug}
                </p>
                <p className="truncate font-semibold" style={{ fontSize: 16, color: '#1a0dab', lineHeight: 1.4 }}>
                  {seoTitle.length > 65 ? `${seoTitle.slice(0, 63)}…` : seoTitle}
                </p>
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)', lineHeight: 1.5 }}>
                  {seoDescription.length > 165 ? `${seoDescription.slice(0, 160)}…` : seoDescription}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------- dialogs */}
      <Modal
        open={Boolean(linkDialog)}
        onClose={() => setLinkDialog(null)}
        title="Insert link"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setLinkDialog(null)}>Cancel</Button>
            <Button variant="primary" icon={Link2} onClick={insertLink}>
              Insert link
            </Button>
          </>
        }
      >
        {linkDialog && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              insertLink();
            }}
          >
            <Field label="Text to show">
              <input className="a-field" value={linkDialog.text} onChange={(e) => setLinkDialog({ ...linkDialog, text: e.target.value })} placeholder="e.g. our dates collection" />
            </Field>
            <Field label="Link to" error={linkDialog.error} hint="https://…, a page on this site like /shop, an email or a phone number">
              <input
                className="a-field"
                autoFocus
                value={linkDialog.url}
                onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value, error: '' })}
                placeholder="https://"
              />
            </Field>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(videoDialog)}
        onClose={() => setVideoDialog(null)}
        title="Insert video"
        subtitle="The video plays right inside the post"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setVideoDialog(null)}>Cancel</Button>
            <Button variant="primary" icon={Video} onClick={insertVideo}>
              Insert video
            </Button>
          </>
        }
      >
        {videoDialog && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              insertVideo();
            }}
          >
            <Field label="Video link" error={videoDialog.error} hint="YouTube, Facebook video / reel, or a direct .mp4 link">
              <input
                className="a-field"
                autoFocus
                value={videoDialog.url}
                onChange={(e) => setVideoDialog({ url: e.target.value, error: '' })}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </Field>
            {videoDialog.url && isVideoUrl(videoDialog.url) && (
              <p className="mt-2 flex items-center gap-1.5 font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}>
                <Check className="w-4 h-4" /> Video link recognised
              </p>
            )}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>

      <MediaLibraryModal
        isOpen={imagePicker}
        onClose={() => setImagePicker(false)}
        multiple
        onSelect={(url) => insertImages([url])}
        onSelectMany={insertImages}
        title="Insert images into the post"
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="You have changes that are not saved yet. If you leave now they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmLeave(false);
          onClose();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
};

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

/**
 * Dashboard → Blog: the blog's on/off and home-page settings, every post with
 * its status and views, and a full-page editor for writing them.
 */
export const AdminBlogPage: React.FC<{
  settings: SiteSettings;
  onSaveSettings: (s: SiteSettings) => Promise<void> | void;
}> = ({ settings, onSaveSettings }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: number | null } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState<PostRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/blog');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || 'Could not load the posts.');
      setRows(data);
    } catch (err: any) {
      if (!quiet) setError(err?.message || 'Could not load the posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () =>
      Array.from(new Set<string>(rows.map((row) => String(row.category || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [rows]
  );

  const stats = useMemo(() => {
    const states = rows.map(rowState);
    return {
      total: rows.length,
      published: states.filter((state) => state === 'published').length,
      scheduled: states.filter((state) => state === 'scheduled').length,
      drafts: states.filter((state) => state === 'draft').length,
      views: rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const state = rowState(row);
      if (filter !== 'all' && state !== filter) return false;
      if (!term) return true;
      return [row.title, row.category, row.author, row.slug].some((field) => String(field || '').toLowerCase().includes(term));
    });
  }, [rows, search, filter]);

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/blog/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error || 'Could not delete the post.');
      setRows((list) => list.filter((row) => row.id !== confirmDelete.id));
      toasts.push('Post deleted.');
      setConfirmDelete(null);
    } catch (err: any) {
      toasts.push(err?.message || 'Could not delete the post.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <>
        {toasts.node}
        <PostEditor
          key={editing.id ?? 'new'}
          id={editing.id}
          categories={categories}
          blogEnabled={settings.blog_config?.isEnabled !== false}
          toast={toasts.push}
          onClose={() => {
            setEditing(null);
            load(true);
          }}
          onSaved={() => load(true)}
        />
      </>
    );
  }

  const dateCell = (row: PostRow) => {
    const state = rowState(row);
    if (state === 'draft') {
      const edited = formatBlogDate(row.updatedAt);
      return edited ? `Edited ${edited}` : '—';
    }
    return formatBlogDate(row.publishedAt) || '—';
  };

  const viewButton = (row: PostRow) => {
    const live = rowState(row) === 'published';
    return (
      <IconButton
        icon={ExternalLink}
        size="sm"
        label={live ? 'View on site' : 'Publish the post to view it on the site'}
        disabled={!live}
        onClick={() => openOnSite(row.slug)}
      />
    );
  };

  const newPost = () => setEditing({ id: null });

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Blog"
        subtitle="Write articles for your customers — the latest ones appear on the home page"
        icon={Newspaper}
        accent={ACCENTS.teal}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => load()} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={newPost}>
              New post
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard label="Posts" value={stats.total} icon={FileText} color={ACCENTS.teal} loading={loading} />
        <StatCard
          label="Published"
          value={stats.published}
          icon={Globe}
          color="var(--ds-success)"
          loading={loading}
        />
        <StatCard label="Drafts" value={stats.drafts} icon={PenLine} color="var(--ds-warning)" loading={loading} />
        <StatCard label="Total views" value={stats.views.toLocaleString('en-US')} icon={Eye} color={ACCENTS.indigo} loading={loading} />
      </div>

      <BlogSettingsCard settings={settings} onSaveSettings={onSaveSettings} toast={toasts.push} />

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by title, category or author" className="flex-1 min-w-0" />
          <FilterPills
            pills={[
              { id: 'all', label: 'All', count: stats.total },
              { id: 'published', label: 'Published', count: stats.published, color: 'var(--ds-success)' },
              ...(stats.scheduled ? [{ id: 'scheduled', label: 'Scheduled', count: stats.scheduled, color: 'var(--ds-info)' }] : []),
              { id: 'draft', label: 'Drafts', count: stats.drafts, color: 'var(--ds-warning)' },
            ]}
            active={filter}
            onChange={setFilter}
          />
        </Toolbar>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => load()} />
        </Card>
      ) : !loading && filtered.length === 0 ? (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={PenLine}
              title="No posts yet"
              description="Share tips, guides and news with your customers. Your latest posts show at the bottom of the home page."
              action={
                <Button variant="primary" icon={Plus} onClick={newPost}>
                  Write your first post
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={SearchIcon}
              title="No posts match"
              description="Try a different search or filter."
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {/* Tablets and computers: a table */}
          <div className="hidden md:block">
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Views</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <LoadingRows rows={5} cols={6} />
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id}>
                        <td style={{ maxWidth: 420 }}>
                          <button type="button" onClick={() => setEditing({ id: row.id })} className="flex items-center gap-3 text-left cursor-pointer min-w-0 group">
                            <CoverThumb src={row.coverImage} title={row.title} />
                            <span className="min-w-0">
                              <span className="block font-semibold truncate group-hover:underline" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text)' }}>
                                {row.title}
                              </span>
                              <span className="block truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                                /blog/{row.slug}
                                {row.author ? ` · ${row.author}` : ''}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td>
                          {row.category ? (
                            <span className="whitespace-nowrap" style={{ fontSize: 'var(--a-fs-md)' }}>
                              {row.category}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <StateBadge state={rowState(row)} />
                        </td>
                        <td className="whitespace-nowrap ds-num" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)' }}>
                          {dateCell(row)}
                        </td>
                        <td className="ds-num font-semibold" style={{ textAlign: 'right' }}>
                          {(Number(row.views) || 0).toLocaleString('en-US')}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton icon={Pencil} size="sm" tone="primary" label="Edit post" onClick={() => setEditing({ id: row.id })} />
                            {viewButton(row)}
                            <IconButton icon={Trash2} size="sm" tone="danger" label="Delete post" onClick={() => setConfirmDelete(row)} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
          </div>

          {/* Phones: cards */}
          <div className="md:hidden space-y-3">
            {loading && rows.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <SectionLoader lines={3} />
                  </Card>
                ))
              : filtered.map((row) => (
                  <Card key={row.id} padded={false} className="overflow-hidden">
                    <button type="button" onClick={() => setEditing({ id: row.id })} className="flex gap-3 p-3 w-full text-left cursor-pointer">
                      <CoverThumb src={row.coverImage} title={row.title} width={96} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold ds-clamp-2" style={{ fontSize: 'var(--a-fs-md)', lineHeight: 1.4 }}>
                          {row.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          <StateBadge state={rowState(row)} />
                          {row.category && <span className="truncate">{row.category}</span>}
                        </span>
                      </span>
                    </button>
                    <div
                      className="flex items-center justify-between gap-2 px-3 py-2 border-t"
                      style={{ borderColor: 'var(--a-border)', background: 'var(--a-surface-2)' }}
                    >
                      <span className="ds-num truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {dateCell(row)} · {(Number(row.views) || 0).toLocaleString('en-US')} views
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <IconButton icon={Pencil} size="sm" tone="primary" label="Edit post" onClick={() => setEditing({ id: row.id })} />
                        {viewButton(row)}
                        <IconButton icon={Trash2} size="sm" tone="danger" label="Delete post" onClick={() => setConfirmDelete(row)} />
                      </div>
                    </div>
                  </Card>
                ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this post?"
        message={`"${confirmDelete?.title || ''}" will be removed from the site for good. This cannot be undone.`}
        confirmLabel="Delete post"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
