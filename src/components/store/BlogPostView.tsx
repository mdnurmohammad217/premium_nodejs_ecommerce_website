import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Eye,
  FileQuestion,
  Link2,
  RefreshCw,
  Share2,
  Tag,
} from 'lucide-react';
import { cachedGet } from '../../lib/dataCache.ts';
import {
  BlogContent,
  BlogPostCard,
  BlogPostFull,
  blogLang,
  formatBlogDate,
  plainExcerpt,
  useDocumentTitle,
  useMetaDescription,
} from '../../lib/blogFormat.tsx';
import { StoreLink } from './Header.tsx';
import { BRAND_COLORS, FacebookIcon, WhatsappIcon } from './BrandIcons.tsx';
import { BlogCard, BlogCover } from './BlogSection.tsx';
import { RailArrows, useRail } from './ProductRail.tsx';

type NavigateFn = (view: string, params?: any) => void;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; post: BlogPostFull; more: BlogPostCard[] }
  | { status: 'missing' }
  | { status: 'error' };

/** Posts already counted in this tab (sessionStorage may be unavailable) */
const COUNTED = new Set<number>();

function countViewOnce(id: number) {
  if (!id || COUNTED.has(id)) return;
  COUNTED.add(id);
  const key = `blog:viewed:${id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage blocked — the in-memory set still stops repeats in this tab */
  }
  fetch(`/api/blog/${id}/view`, { method: 'POST', keepalive: true }).catch(() => undefined);
}

const compactNumber = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
      : String(value);

/** A thin bar along the top of the screen showing how far through the article the reader is */
const ReadingProgress: React.FC<{ target: React.RefObject<HTMLElement | null> }> = ({ target }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = target.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const done = Math.min(1, Math.max(0, -rect.top / Math.max(1, total)));
      setProgress(done);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [target]);
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[3px] pointer-events-none"
      style={{ zIndex: 'calc(var(--ds-z-header) + 1)' as any }}
    >
      <div
        className="h-full bg-(--primary) origin-left transition-transform duration-100 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
};

/** Facebook, WhatsApp, copy link — and the phone's own share sheet where there is one */
const ShareButtons: React.FC<{ url: string; title: string; compact?: boolean }> = ({ url, title, compact }) => {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand('copy');
      } catch {
        /* nothing more we can do */
      }
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const size = compact ? 'w-9 h-9' : 'h-(--ds-h-md) px-(--ds-s-4)';
  const base = `inline-flex items-center justify-center gap-(--ds-s-2) ${size} rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) transition-[transform,filter,background-color] duration-(--ds-dur) active:scale-95 cursor-pointer`;

  return (
    <div className="flex flex-wrap items-center gap-(--ds-s-2)">
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        title="Share on Facebook"
        className={`${base} text-white hover:brightness-110`}
        style={{ background: BRAND_COLORS.facebook }}
      >
        <FacebookIcon className="w-4 h-4" />
        {!compact && <span>Facebook</span>}
      </a>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        title="Share on WhatsApp"
        className={`${base} text-white hover:brightness-110`}
        style={{ background: BRAND_COLORS.whatsapp }}
      >
        <WhatsappIcon className="w-4 h-4" />
        {!compact && <span>WhatsApp</span>}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        title={copied ? 'Link copied' : 'Copy link'}
        className={`${base} border border-(--ds-border) bg-(--ds-surface) text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--ds-text)`}
      >
        {copied ? <Check className="w-4 h-4 text-(--ds-success)" /> : <Link2 className="w-4 h-4" />}
        {!compact && <span aria-live="polite">{copied ? 'Copied!' : 'Copy link'}</span>}
      </button>
      {canShare && !compact && (
        <button
          type="button"
          onClick={() => navigator.share({ title, url }).catch(() => undefined)}
          className={`${base} sm:hidden border border-(--ds-border) bg-(--ds-surface) text-(--ds-text-soft) hover:bg-(--ds-surface-3)`}
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      )}
    </div>
  );
};

const PostSkeleton: React.FC = () => (
  <div className="max-w-3xl mx-auto px-(--ds-s-4) pt-(--ds-s-6) sm:pt-(--ds-s-10)" aria-busy="true" aria-label="Loading article">
    <div className="ds-skeleton h-3 w-48" />
    <div className="ds-skeleton h-6 w-24 mt-(--ds-s-8) rounded-(--ds-r-full)" />
    <div className="ds-skeleton h-8 w-full mt-(--ds-s-4)" />
    <div className="ds-skeleton h-8 w-3/4 mt-(--ds-s-2)" />
    <div className="flex items-center gap-(--ds-s-3) mt-(--ds-s-6)">
      <div className="ds-skeleton w-10 h-10 rounded-(--ds-r-full)" />
      <div className="flex-1 space-y-(--ds-s-2)">
        <div className="ds-skeleton h-3 w-32" />
        <div className="ds-skeleton h-3 w-48" />
      </div>
    </div>
    <div className="ds-skeleton aspect-video w-full mt-(--ds-s-8) rounded-(--ds-r-2xl)" />
    <div className="mt-(--ds-s-8) space-y-(--ds-s-3)">
      {[100, 96, 100, 88, 94, 70].map((width, i) => (
        <div key={i} className="ds-skeleton h-4" style={{ width: `${width}%` }} />
      ))}
    </div>
  </div>
);

/**
 * /blog/:slug — one article at a comfortable reading width, with sharing and
 * three more posts to read next.
 */
export const BlogPostView: React.FC<{ slug: string; onNavigate: NavigateFn }> = ({ slug, onNavigate }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const apply = (data: any) => {
      if (cancelled) return;
      if (data?.post) {
        setState({ status: 'ready', post: data.post, more: Array.isArray(data.more) ? data.more : [] });
      } else {
        setState({ status: 'missing' });
      }
    };
    if (!slug) {
      setState({ status: 'missing' });
      return;
    }
    cachedGet(`/api/blog/${encodeURIComponent(slug)}`, { onFresh: apply })
      .then(apply)
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '';
        setState({ status: /\b(404|410)\b/.test(message) ? 'missing' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  const post = state.status === 'ready' ? state.post : null;

  useEffect(() => {
    if (post) countViewOnce(post.id);
  }, [post?.id]);

  useDocumentTitle(
    post ? post.metaTitle || post.title : state.status === 'missing' ? 'Article not found' : null,
    Boolean(post?.metaTitle)
  );
  useMetaDescription(post ? post.metaDescription || post.excerpt || plainExcerpt(post.content, 160) : null);

  const more = state.status === 'ready' ? state.more : [];
  const rail = useRail(more.length);

  /* ------------------------------------------------------------ states */
  if (state.status === 'loading') return <PostSkeleton />;

  if (state.status === 'missing' || state.status === 'error') {
    const missing = state.status === 'missing';
    return (
      <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-12) sm:py-(--ds-s-16)">
        <div className="ds-card ds-fade-in flex flex-col items-center text-center px-(--ds-s-6) py-(--ds-s-12)">
          <span className="w-16 h-16 rounded-(--ds-r-2xl) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
            <FileQuestion className="w-7 h-7" />
          </span>
          <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
            {missing ? 'Article not found' : 'Could not load this article'}
          </h1>
          <p className="mt-(--ds-s-2) max-w-md text-(length:--ds-fs-md) text-(--ds-text-muted) leading-(--ds-lh-normal)">
            {missing
              ? 'This article may have been moved or is no longer available. Have a look at our other articles instead.'
              : 'Please check your connection and try again.'}
          </p>
          <div className="mt-(--ds-s-6) flex flex-wrap items-center justify-center gap-(--ds-s-2)">
            {!missing && (
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ds-btn ds-btn-secondary">
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            )}
            <StoreLink to={{ view: 'blog', params: {} }} onNavigate={onNavigate} className="ds-btn ds-btn-primary">
              See all articles
              <ArrowRight className="w-4 h-4" />
            </StoreLink>
          </div>
        </div>
      </div>
    );
  }

  const { post: article } = state;
  const date = formatBlogDate(article.publishedAt);
  const shareUrl = `${window.location.origin}/blog/${encodeURIComponent(article.slug)}`;
  const titleLang = blogLang(article.title);

  return (
    <div className="pb-(--ds-s-12) sm:pb-(--ds-s-16)">
      <ReadingProgress target={articleRef} />

      <article ref={articleRef} className="ds-fade-in">
        {/* ------------------------------------------------------ header */}
        <header className="max-w-3xl mx-auto px-(--ds-s-4) pt-(--ds-s-5) sm:pt-(--ds-s-10)">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-(length:--ds-fs-sm) text-(--ds-text-muted)">
            <StoreLink to={{ view: 'home', params: {} }} onNavigate={onNavigate} className="shrink-0 hover:text-(--primary) transition-colors">
              Home
            </StoreLink>
            <ChevronRight className="rtl:rotate-180 w-3.5 h-3.5 shrink-0 text-(--ds-text-faint)" />
            <StoreLink to={{ view: 'blog', params: {} }} onNavigate={onNavigate} className="shrink-0 hover:text-(--primary) transition-colors">
              Blog
            </StoreLink>
            <ChevronRight className="rtl:rotate-180 w-3.5 h-3.5 shrink-0 text-(--ds-text-faint)" />
            <span lang={titleLang} className="truncate text-(--ds-text-soft) font-(--ds-fw-medium)" aria-current="page">
              {article.title}
            </span>
          </nav>

          {article.category && (
            <StoreLink
              to={{ view: 'blog', params: { category: article.category } }}
              onNavigate={onNavigate}
              lang={blogLang(article.category)}
              className="mt-(--ds-s-6) sm:mt-(--ds-s-8) inline-flex items-center h-7 px-3 rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) hover:bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] transition-colors"
            >
              {article.category}
            </StoreLink>
          )}

          <h1
            lang={titleLang}
            className={`${article.category ? 'mt-(--ds-s-3)' : 'mt-(--ds-s-6) sm:mt-(--ds-s-8)'} text-(length:--ds-fs-3xl) sm:text-(length:--ds-fs-4xl) font-(--ds-fw-black) text-(--ds-text) leading-(--ds-lh-tight) break-words`}
          >
            {article.title}
          </h1>

          {article.excerpt && (
            <p
              lang={blogLang(article.excerpt)}
              className="mt-(--ds-s-4) text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-xl) text-(--ds-text-soft) leading-(--ds-lh-normal)"
            >
              {article.excerpt}
            </p>
          )}

          <div className="mt-(--ds-s-6) flex flex-wrap items-center justify-between gap-(--ds-s-4) pb-(--ds-s-6) border-b border-(--ds-border-soft)">
            <div className="flex items-center gap-(--ds-s-3) min-w-0">
              {article.author && (
                <span className="w-10 h-10 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary) text-(length:--ds-fs-md) font-(--ds-fw-bold)">
                  {article.author.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                {article.author && (
                  <p lang={blogLang(article.author)} className="truncate text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text)">
                    {article.author}
                  </p>
                )}
                <p className="flex flex-wrap items-center gap-x-(--ds-s-3) gap-y-0.5 text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                  {date && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <time dateTime={String(article.publishedAt || '')}>{date}</time>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Clock className="w-3.5 h-3.5" />
                    {article.readMinutes || 1} min read
                  </span>
                  {article.views > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap ds-num">
                      <Eye className="w-3.5 h-3.5" />
                      {compactNumber(article.views)} views
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="hidden sm:block">
              <ShareButtons url={shareUrl} title={article.title} compact />
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------- cover */}
        {article.coverImage && (
          <div className="max-w-5xl mx-auto px-(--ds-s-4) mt-(--ds-s-6) sm:mt-(--ds-s-8)">
            <BlogCover
              src={article.coverImage}
              title={article.title}
              eager
              className="aspect-video w-full rounded-(--ds-r-xl) sm:rounded-(--ds-r-2xl) shadow-(--ds-shadow-md)"
            />
          </div>
        )}

        {/* ------------------------------------------------------- body */}
        <div className="max-w-[720px] mx-auto px-(--ds-s-4) mt-(--ds-s-8) sm:mt-(--ds-s-10)">
          <BlogContent text={article.content} onNavigate={onNavigate} className="sm:text-[17px]" />

          {article.tags.length > 0 && (
            <div className="mt-(--ds-s-10) flex flex-wrap items-center gap-(--ds-s-2)">
              <Tag className="w-4 h-4 text-(--ds-text-faint)" aria-hidden />
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  lang={blogLang(tag)}
                  className="inline-flex items-center h-7 px-3 rounded-(--ds-r-full) bg-(--ds-surface-3) text-(--ds-text-soft) text-(length:--ds-fs-sm) font-(--ds-fw-medium)"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-(--ds-s-8) rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) p-(--ds-s-5) sm:p-(--ds-s-6) flex flex-col sm:flex-row sm:items-center sm:justify-between gap-(--ds-s-4)">
            <div>
              <p className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">Found this helpful?</p>
              <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">Share it with friends and family.</p>
            </div>
            <ShareButtons url={shareUrl} title={article.title} />
          </div>

          <StoreLink
            to={{ view: 'blog', params: {} }}
            onNavigate={onNavigate}
            className="group mt-(--ds-s-8) inline-flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--primary)"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back to all articles
          </StoreLink>
        </div>
      </article>

      {/* --------------------------------------------------------- more */}
      {more.length > 0 && (
        <section
          aria-labelledby="blog-more-title"
          className="mt-(--ds-s-12) sm:mt-(--ds-s-16) border-t border-(--ds-border-soft) bg-(--ds-surface-2) pt-(--ds-s-10) pb-(--ds-s-4)"
        >
          <div className="max-w-7xl mx-auto px-(--ds-s-4)">
            <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-5)">
              <h2 id="blog-more-title" className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
                More posts
              </h2>
              <div className="flex items-center gap-(--ds-s-2) shrink-0">
                <RailArrows edges={rail.edges} step={rail.step} label="posts" />
                <StoreLink
                  to={{ view: 'blog', params: {} }}
                  onNavigate={onNavigate}
                  className="group inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
                >
                  View all
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </StoreLink>
              </div>
            </div>
            {/* Phones: two across and swipe; larger screens: a grid */}
            <div
              ref={rail.ref}
              className="ds-scroll-hide -mx-(--ds-s-4) px-(--ds-s-4) scroll-px-(--ds-s-4) flex gap-(--ds-s-4) overflow-x-auto snap-x snap-mandatory scroll-smooth pb-(--ds-s-2) sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-(--ds-s-5) sm:overflow-visible"
            >
              {more.map((item, i) => (
                <div
                  key={item.id}
                  className={`shrink-0 snap-start basis-[calc((100%-var(--ds-s-4))/2)] min-w-0 sm:basis-auto ${i === 2 ? 'sm:hidden lg:block' : ''}`}
                >
                  <div className="h-full sm:hidden">
                    <BlogCard post={item} onNavigate={onNavigate} variant="rail" />
                  </div>
                  <div className="h-full hidden sm:block">
                    <BlogCard post={item} onNavigate={onNavigate} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
