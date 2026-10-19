import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { BlogConfig } from '../../types/index.ts';
import { cachedGet } from '../../lib/dataCache.ts';
import { BlogPostCard, blogLang, useDocumentTitle } from '../../lib/blogFormat.tsx';
import { StoreLink } from './Header.tsx';
import { BlogCard, BlogCardSkeleton } from './BlogSection.tsx';

type NavigateFn = (view: string, params?: any) => void;

const PAGE_SIZE = 12;

interface ListState {
  posts: BlogPostCard[];
  total: number;
  page: number;
}

/**
 * /blog — every published post, newest first, filterable by category, twelve
 * at a time with "Load more".
 */
export const BlogListView: React.FC<{
  config?: BlogConfig;
  initialCategory?: string;
  onNavigate: NavigateFn;
}> = ({ config, initialCategory, onNavigate }) => {
  const enabled = config?.isEnabled !== false;
  const [category, setCategory] = useState(initialCategory || '');
  const [list, setList] = useState<ListState | null>(null);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const requestId = useRef(0);

  const title = (config?.pageTitle || '').trim() || 'Blog';
  const subtitle = (config?.pageSubtitle || '').trim();
  useDocumentTitle(enabled ? (category ? `${category} · ${title}` : title) : null);

  // Back / forward between categories changes the prop while this page stays mounted
  useEffect(() => {
    setCategory(initialCategory || '');
  }, [initialCategory]);

  const urlFor = (page: number, cat: string) =>
    `/api/blog?limit=${PAGE_SIZE}&page=${page}${cat ? `&category=${encodeURIComponent(cat)}` : ''}`;

  // First page (and again whenever the category changes)
  useEffect(() => {
    if (!enabled) return;
    const id = ++requestId.current;
    setList(null);
    setError(false);
    setMoreError(false);
    const firstPage = (data: any): ListState => ({
      posts: Array.isArray(data?.posts) ? data.posts : [],
      total: Number(data?.total) || 0,
      page: 1,
    });
    const meta = (data: any) => {
      if (Array.isArray(data?.categories)) setCategories(data.categories);
      if (!category) setAllTotal(Number(data?.total) || 0);
    };
    const apply = (data: any) => {
      if (id !== requestId.current) return;
      setList(firstPage(data));
      meta(data);
    };
    // A background refresh must not throw away pages already loaded with "Load more"
    const applyFresh = (data: any) => {
      if (id !== requestId.current) return;
      setList((current) => (current && current.page > 1 ? current : firstPage(data)));
      meta(data);
    };
    cachedGet(urlFor(1, category), { onFresh: applyFresh })
      .then(apply)
      .catch(() => {
        if (id === requestId.current) setError(true);
      });
  }, [enabled, category, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!list || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data: any = await cachedGet(urlFor(list.page + 1, category));
      if (id !== requestId.current) return;
      const incoming: BlogPostCard[] = Array.isArray(data?.posts) ? data.posts : [];
      setList((current) => {
        if (!current) return current;
        const seen = new Set(current.posts.map((post) => post.id));
        return {
          posts: [...current.posts, ...incoming.filter((post) => !seen.has(post.id))],
          total: Number(data?.total) || current.total,
          page: current.page + 1,
        };
      });
    } catch {
      if (id === requestId.current) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [list, loadingMore, category]);

  const chooseCategory = (next: string) => {
    if (next === category) return;
    setCategory(next);
    onNavigate('blog', next ? { category: next } : {});
  };

  /* ----------------------------------------------------------- switched off */
  if (!enabled) {
    return (
      <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-12) sm:py-(--ds-s-16)">
        <div className="ds-card ds-fade-in flex flex-col items-center text-center px-(--ds-s-6) py-(--ds-s-12)">
          <span className="w-16 h-16 rounded-(--ds-r-2xl) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
            <BookOpen className="w-7 h-7" />
          </span>
          <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
            Blog is not available
          </h1>
          <p className="mt-(--ds-s-2) max-w-md text-(length:--ds-fs-md) text-(--ds-text-muted) leading-(--ds-lh-normal)">
            Our blog is taking a short break. Please check back soon — in the meantime, our shop is open.
          </p>
          <div className="mt-(--ds-s-6) flex flex-wrap items-center justify-center gap-(--ds-s-2)">
            <StoreLink to={{ view: 'home', params: {} }} onNavigate={onNavigate} className="ds-btn ds-btn-secondary">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </StoreLink>
            <StoreLink to={{ view: 'shop', params: {} }} onNavigate={onNavigate} className="ds-btn ds-btn-primary">
              Browse products
            </StoreLink>
          </div>
        </div>
      </div>
    );
  }

  const posts = list?.posts || [];
  const hasMore = Boolean(list && posts.length < list.total);

  const chipClass = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-(--ds-s-2) h-(--ds-h-sm) sm:h-(--ds-h-md) px-(--ds-s-4) rounded-(--ds-r-full) border text-(length:--ds-fs-sm) font-(--ds-fw-semibold) whitespace-nowrap transition-colors cursor-pointer ${
      active
        ? 'bg-(--primary) border-(--primary) text-(--primary-foreground) shadow-(--ds-shadow-sm)'
        : 'bg-(--ds-surface) border-(--ds-border) text-(--ds-text-soft) hover:border-(--primary) hover:text-(--primary)'
    }`;
  const countClass = (active: boolean) =>
    `ds-num rounded-(--ds-r-full) px-1.5 text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ${
      active ? 'bg-white/25' : 'bg-(--ds-surface-3) text-(--ds-text-muted)'
    }`;

  return (
    <div className="pb-(--ds-s-12) sm:pb-(--ds-s-16)">
      {/* ------------------------------------------------------------ hero */}
      <header className="relative overflow-hidden border-b border-(--ds-border-soft) bg-[linear-gradient(160deg,color-mix(in_srgb,var(--primary)_10%,var(--ds-surface))_0%,var(--ds-surface)_70%)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 w-64 h-64 rounded-full bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] blur-3xl"
        />
        <div className="relative max-w-7xl mx-auto px-(--ds-s-4) pt-(--ds-s-6) pb-(--ds-s-8) sm:pt-(--ds-s-8) sm:pb-(--ds-s-12)">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-(length:--ds-fs-sm) text-(--ds-text-muted)">
            <StoreLink to={{ view: 'home', params: {} }} onNavigate={onNavigate} className="hover:text-(--primary) transition-colors">
              Home
            </StoreLink>
            <ChevronRight className="rtl:rotate-180 w-3.5 h-3.5 shrink-0 text-(--ds-text-faint)" />
            <span className="text-(--ds-text-soft) font-(--ds-fw-medium)" aria-current="page">
              {title}
            </span>
          </nav>
          <div className="mt-(--ds-s-4) sm:mt-(--ds-s-6) max-w-2xl">
            <span className="inline-flex items-center gap-(--ds-s-2) h-7 px-3 rounded-(--ds-r-full) bg-(--ds-surface) border border-(--ds-border) text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--primary) shadow-(--ds-shadow-xs)">
              <Newspaper className="w-3.5 h-3.5" />
              {list ? `${list.total} ${list.total === 1 ? 'article' : 'articles'}` : 'Articles'}
            </span>
            <h1
              lang={blogLang(title)}
              className="mt-(--ds-s-3) text-(length:--ds-fs-3xl) sm:text-(length:--ds-fs-4xl) font-(--ds-fw-black) text-(--ds-text) leading-(--ds-lh-tight)"
            >
              {title}
            </h1>
            {subtitle && (
              <p
                lang={blogLang(subtitle)}
                className="mt-(--ds-s-3) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) text-(--ds-text-soft) leading-(--ds-lh-normal)"
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-(--ds-s-4)">
        {/* ------------------------------------------------------ categories */}
        {categories.length > 0 && (
          <div
            role="tablist"
            aria-label="Blog categories"
            className="ds-scroll-hide -mx-(--ds-s-4) px-(--ds-s-4) flex gap-(--ds-s-2) overflow-x-auto py-(--ds-s-5) sm:flex-wrap sm:overflow-visible"
          >
            <button type="button" role="tab" aria-selected={!category} onClick={() => chooseCategory('')} className={chipClass(!category)}>
              All
              {allTotal ? <span className={countClass(!category)}>{allTotal}</span> : null}
            </button>
            {categories.map((item) => {
              const active = item.name === category;
              return (
                <button
                  key={item.name}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  lang={blogLang(item.name)}
                  onClick={() => chooseCategory(item.name)}
                  className={chipClass(active)}
                >
                  {item.name}
                  <span className={countClass(active)}>{item.count}</span>
                </button>
              );
            })}
            {/* A category from a shared link that has no posts any more */}
            {category && !categories.some((item) => item.name === category) && (
              <button type="button" role="tab" aria-selected className={chipClass(true)}>
                {category}
              </button>
            )}
          </div>
        )}

        <div className={categories.length > 0 ? '' : 'pt-(--ds-s-6) sm:pt-(--ds-s-8)'}>
          {error ? (
            <div className="ds-card flex flex-col items-center text-center px-(--ds-s-6) py-(--ds-s-12)">
              <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Could not load the articles</h2>
              <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">Please check your connection and try again.</p>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ds-btn ds-btn-secondary mt-(--ds-s-5)">
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            </div>
          ) : list === null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-(--ds-s-4) lg:gap-(--ds-s-6)" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={i >= 3 ? 'hidden sm:block' : ''}>
                  <BlogCardSkeleton />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="ds-card ds-fade-in flex flex-col items-center text-center px-(--ds-s-6) py-(--ds-s-12) sm:py-(--ds-s-16)">
              <span className="w-16 h-16 rounded-(--ds-r-2xl) inline-flex items-center justify-center bg-(--ds-surface-3) text-(--ds-text-faint)">
                <Newspaper className="w-7 h-7" />
              </span>
              <h2 className="mt-(--ds-s-4) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
                {category ? 'No articles in this category yet' : 'No articles yet'}
              </h2>
              <p className="mt-(--ds-s-1) max-w-sm text-(length:--ds-fs-base) text-(--ds-text-muted)">
                {category ? 'Try another category, or see every article.' : 'New articles are on their way. Please check back soon.'}
              </p>
              {category ? (
                <button type="button" onClick={() => chooseCategory('')} className="ds-btn ds-btn-secondary mt-(--ds-s-5)">
                  Show all articles
                </button>
              ) : (
                <StoreLink to={{ view: 'home', params: {} }} onNavigate={onNavigate} className="ds-btn ds-btn-secondary mt-(--ds-s-5)">
                  <ArrowLeft className="w-4 h-4" />
                  Back to home
                </StoreLink>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-(--ds-s-4) lg:gap-(--ds-s-6)">
                {posts.map((post) => (
                  <BlogCard key={post.id} post={post} onNavigate={onNavigate} className="ds-fade-in" />
                ))}
              </div>

              <div className="mt-(--ds-s-8) sm:mt-(--ds-s-10) flex flex-col items-center gap-(--ds-s-2)">
                {hasMore ? (
                  <>
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="ds-btn ds-btn-secondary ds-btn-lg min-w-[200px] rounded-(--ds-r-full)"
                    >
                      {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {loadingMore ? 'Loading…' : 'Load more articles'}
                    </button>
                    {moreError && (
                      <p role="alert" className="text-(length:--ds-fs-sm) text-(--ds-danger-text)">
                        Could not load more. Please try again.
                      </p>
                    )}
                  </>
                ) : null}
                <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) ds-num">
                  Showing {posts.length} of {list?.total ?? posts.length}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
