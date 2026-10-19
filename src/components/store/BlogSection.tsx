import React, { useEffect, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { ArrowRight, BookOpen, CalendarDays, Clock } from 'lucide-react';
import { BlogConfig } from '../../types/index.ts';
import { cachedGet } from '../../lib/dataCache.ts';
import { BlogPostCard, blogLang, formatBlogDate } from '../../lib/blogFormat.tsx';
import { StoreLink } from './Header.tsx';
import { RailArrows, useRail } from './ProductRail.tsx';

type NavigateFn = (view: string, params?: any) => void;

/* -------------------------------------------------------------------------- */
/* Shared card                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * - default:  cover on top, text below (grids)
 * - rail:     the same, sized for two-across on a phone
 * - featured: the big first post — side by side on a tablet, tall on desktop
 * - wide:     side by side at every size from tablets up (a lone post)
 * - list:     side by side on desktop only (the column next to a featured post)
 */
export type BlogCardVariant = 'default' | 'rail' | 'featured' | 'wide' | 'list';

const VARIANTS: Record<
  BlogCardVariant,
  { root: string; media: string; body: string; title: string; excerpt: string; meta: string; chip: string }
> = {
  default: {
    root: 'flex flex-col',
    media: 'aspect-video',
    body: 'p-(--ds-s-4) sm:p-(--ds-s-5) gap-(--ds-s-2)',
    title: 'text-(length:--ds-fs-lg) ds-clamp-2',
    excerpt: 'text-(length:--ds-fs-sm) ds-clamp-2',
    meta: 'text-(length:--ds-fs-xs)',
    chip: 'top-(--ds-s-3) left-(--ds-s-3) h-6 leading-6 px-2.5 text-(length:--ds-fs-xs)',
  },
  rail: {
    root: 'flex flex-col',
    media: 'aspect-video',
    body: 'p-(--ds-s-3) gap-(--ds-s-1)',
    title: 'text-(length:--ds-fs-base) ds-clamp-2',
    excerpt: 'text-(length:--ds-fs-xs) ds-clamp-2',
    meta: 'text-(length:--ds-fs-2xs)',
    chip: 'top-(--ds-s-2) left-(--ds-s-2) h-5 leading-5 px-2 text-(length:--ds-fs-2xs)',
  },
  featured: {
    root: 'flex flex-col sm:flex-row lg:flex-col',
    media: 'aspect-video sm:aspect-auto sm:w-1/2 sm:min-h-[260px] lg:w-full lg:flex-1 lg:min-h-[240px]',
    body: 'p-(--ds-s-5) sm:p-(--ds-s-6) sm:w-1/2 lg:w-full gap-(--ds-s-3) sm:justify-center lg:justify-start',
    title: 'text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) ds-clamp-3',
    excerpt: 'text-(length:--ds-fs-md) ds-clamp-3',
    meta: 'text-(length:--ds-fs-sm)',
    chip: 'top-(--ds-s-4) left-(--ds-s-4) h-7 leading-7 px-3 text-(length:--ds-fs-sm)',
  },
  wide: {
    root: 'flex flex-col sm:flex-row',
    media: 'aspect-video sm:aspect-auto sm:w-1/2 lg:w-3/5 sm:min-h-[280px]',
    body: 'p-(--ds-s-5) sm:p-(--ds-s-8) sm:w-1/2 lg:w-2/5 gap-(--ds-s-3) sm:justify-center',
    title: 'text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) ds-clamp-3',
    excerpt: 'text-(length:--ds-fs-md) line-clamp-4',
    meta: 'text-(length:--ds-fs-sm)',
    chip: 'top-(--ds-s-4) left-(--ds-s-4) h-7 leading-7 px-3 text-(length:--ds-fs-sm)',
  },
  list: {
    root: 'flex flex-col lg:flex-row',
    media: 'aspect-video lg:aspect-auto lg:w-[42%] lg:shrink-0 lg:min-h-[150px]',
    body: 'p-(--ds-s-4) sm:p-(--ds-s-5) gap-(--ds-s-2) lg:justify-center',
    title: 'text-(length:--ds-fs-lg) ds-clamp-2',
    excerpt: 'text-(length:--ds-fs-sm) ds-clamp-2',
    meta: 'text-(length:--ds-fs-xs)',
    chip: 'top-(--ds-s-3) left-(--ds-s-3) h-6 leading-6 px-2.5 text-(length:--ds-fs-xs)',
  },
};

/** The branded stand-in when a post has no cover (or it fails to load) */
const CoverFallback: React.FC<{ title: string }> = ({ title }) => (
  <span
    aria-hidden
    className="absolute inset-0 flex flex-col items-center justify-center gap-(--ds-s-2) bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_16%,var(--ds-surface)),color-mix(in_srgb,var(--primary)_5%,var(--ds-surface)))] text-(--primary)"
  >
    <BookOpen className="w-8 h-8 opacity-70" />
    <span className="max-w-[80%] truncate text-(length:--ds-fs-xs) font-(--ds-fw-semibold) opacity-60">{title}</span>
  </span>
);

export const BlogCover: React.FC<{ src?: string; title: string; className?: string; eager?: boolean }> = ({
  src,
  title,
  className = '',
  eager,
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    // A caller that positions the cover itself (absolute inset-0) must not get
    // "relative" as well — both classes on one element left it with no height.
    <span className={`block overflow-hidden bg-(--ds-surface-2) ${/\b(absolute|fixed|sticky)\b/.test(className) ? '' : 'relative'} ${className}`}>
      {src && !broken ? (
        <img
          {...responsiveImg(src, '(min-width: 1024px) 400px, (min-width: 640px) 50vw, 90vw', 480)}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-(--ds-ease) group-hover:scale-[1.05]"
        />
      ) : (
        <CoverFallback title={title} />
      )}
    </span>
  );
};

export const BlogCard: React.FC<{
  post: BlogPostCard;
  onNavigate: NavigateFn;
  variant?: BlogCardVariant;
  className?: string;
}> = ({ post, onNavigate, variant = 'default', className = '' }) => {
  const v = VARIANTS[variant];
  const date = formatBlogDate(post.publishedAt);
  const showAuthor = (variant === 'featured' || variant === 'wide') && post.author;
  const big = variant === 'featured' || variant === 'wide';

  return (
    <StoreLink
      to={{ view: 'blog-post', params: { slug: post.slug } }}
      onNavigate={onNavigate}
      aria-label={post.title}
      className={`group ${v.root} h-full min-w-0 overflow-hidden rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) shadow-(--ds-shadow-xs) transition-[box-shadow,transform,border-color] duration-(--ds-dur) ease-(--ds-ease) hover:-translate-y-0.5 hover:shadow-(--ds-shadow-lg) hover:border-(--ds-border-strong) focus-visible:shadow-(--ds-ring) ${className}`}
    >
      <span className={`relative block shrink-0 ${v.media}`}>
        <BlogCover src={post.coverImage} title={post.title} className="absolute inset-0" />
        {post.category && (
          <span
            lang={blogLang(post.category)}
            className={`absolute inline-block max-w-[calc(100%-2rem)] truncate rounded-(--ds-r-full) bg-(--ds-surface)/95 text-(--primary) font-(--ds-fw-semibold) shadow-(--ds-shadow-sm) backdrop-blur-sm ${v.chip}`}
          >
            {post.category}
          </span>
        )}
      </span>

      <span className={`flex flex-col flex-1 min-w-0 ${v.body}`}>
        {(date || post.readMinutes > 0) && (
          <span className={`flex flex-wrap items-center gap-x-(--ds-s-3) gap-y-0.5 text-(--ds-text-muted) ${v.meta}`}>
            {date && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                {date}
              </span>
            )}
            {post.readMinutes > 0 && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                {post.readMinutes} min read
              </span>
            )}
          </span>
        )}

        <span
          lang={blogLang(post.title)}
          role="heading"
          aria-level={3}
          className={`font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug) transition-colors group-hover:text-(--primary) ${v.title}`}
        >
          {post.title}
        </span>

        {post.excerpt && (
          <span lang={blogLang(post.excerpt)} className={`text-(--ds-text-soft) leading-(--ds-lh-normal) ${v.excerpt}`}>
            {post.excerpt}
          </span>
        )}

        {big && (
          <span className="mt-auto pt-(--ds-s-2) flex items-center justify-between gap-(--ds-s-3)">
            {showAuthor ? (
              <span className="inline-flex items-center gap-(--ds-s-2) min-w-0 text-(length:--ds-fs-sm) text-(--ds-text-soft)">
                <span className="w-7 h-7 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary) text-(length:--ds-fs-xs) font-(--ds-fw-bold)">
                  {post.author.trim().charAt(0).toUpperCase()}
                </span>
                <span className="truncate font-(--ds-fw-medium)">{post.author}</span>
              </span>
            ) : (
              <span />
            )}
            <span className="inline-flex items-center gap-1 shrink-0 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary)">
              Read article
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </span>
        )}
      </span>
    </StoreLink>
  );
};

export const BlogCardSkeleton: React.FC<{ variant?: BlogCardVariant; className?: string }> = ({
  variant = 'default',
  className = '',
}) => {
  const v = VARIANTS[variant];
  return (
    <div
      aria-hidden
      className={`${v.root} h-full overflow-hidden rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) ${className}`}
    >
      <div className={`ds-skeleton rounded-none shrink-0 ${v.media}`} />
      <div className={`flex flex-col flex-1 ${v.body}`}>
        <div className="ds-skeleton h-3 w-1/2" />
        <div className="ds-skeleton h-4 w-11/12" />
        <div className="ds-skeleton h-4 w-2/3" />
        <div className="ds-skeleton h-3 w-full mt-1" />
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Home section                                                                */
/* -------------------------------------------------------------------------- */

const RAIL_TRACK_CLASS =
  'sm:hidden ds-scroll-hide -mx-(--ds-s-4) px-(--ds-s-4) scroll-px-(--ds-s-4) flex gap-(--ds-s-4) overflow-x-auto snap-x snap-mandatory scroll-smooth pb-(--ds-s-2)';
/** Exactly two cards across a phone, never a half card */
const RAIL_ITEM_CLASS = 'shrink-0 snap-start basis-[calc((100%-var(--ds-s-4))/2)] min-w-0';

/** How the tablet/desktop grid is laid out for the number of posts there are */
function desktopLayout(count: number) {
  if (count === 1) return { grid: 'grid-cols-1', featured: '', featuredVariant: 'wide' as const, rest: 'default' as const };
  if (count === 2) return { grid: 'grid-cols-2', featured: '', featuredVariant: 'default' as const, rest: 'default' as const };
  if (count <= 4) {
    return {
      grid: 'grid-cols-2',
      featured: `col-span-2 lg:col-span-1 ${count === 3 ? 'lg:row-span-2' : 'lg:row-span-3'}`,
      featuredVariant: 'featured' as const,
      rest: 'list' as const,
    };
  }
  return {
    grid: 'grid-cols-2 lg:grid-cols-4',
    featured: 'col-span-2 lg:row-span-2',
    featuredVariant: 'featured' as const,
    rest: 'default' as const,
  };
}

/**
 * The latest posts at the very bottom of the home page, just above the footer.
 * Switched on/off and titled from Dashboard → Blog.
 */
export const BlogSection: React.FC<{ config?: BlogConfig; onNavigate: NavigateFn }> = ({ config, onNavigate }) => {
  const enabled = config?.isEnabled !== false && config?.showOnHome !== false;
  const count = Math.min(12, Math.max(1, Math.round(Number(config?.homeCount) || 5)));
  const [posts, setPosts] = useState<BlogPostCard[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const apply = (data: any) => {
      if (!cancelled) setPosts(Array.isArray(data?.posts) ? data.posts.slice(0, count) : []);
    };
    cachedGet(`/api/blog?limit=${count}`, { onFresh: apply })
      .then(apply)
      .catch(() => apply(null));
    return () => {
      cancelled = true;
    };
  }, [enabled, count]);

  const rail = useRail(posts?.length ?? 0);

  if (!enabled) return null;
  if (posts !== null && posts.length === 0) return null;

  const title = (config?.homeTitle || '').trim() || 'From Our Blog';
  const subtitle = (config?.homeSubtitle || '').trim();
  const layout = desktopLayout(posts ? posts.length : Math.min(count, 5));
  const skeletonCount = Math.min(count, 5);

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-labelledby="home-blog-title">
      <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-4) sm:mb-(--ds-s-5)">
        <div className="min-w-0">
          <h2
            id="home-blog-title"
            lang={blogLang(title)}
            className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)"
          >
            {title}
          </h2>
          {subtitle && (
            <p lang={blogLang(subtitle)} className="mt-(--ds-s-1) text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-md) text-(--ds-text-muted) ds-clamp-2">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-(--ds-s-2) shrink-0">
          <RailArrows edges={rail.edges} step={rail.step} label="posts" />
          <StoreLink
            to={{ view: 'blog', params: {} }}
            onNavigate={onNavigate}
            className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
          >
            <span className="sm:hidden">View all</span>
            <span className="hidden sm:inline">View all posts</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </StoreLink>
        </div>
      </div>

      {/* Phones: a swipeable row, two cards across */}
      <div ref={rail.ref} className={RAIL_TRACK_CLASS}>
        {posts === null
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={RAIL_ITEM_CLASS}>
                <BlogCardSkeleton variant="rail" />
              </div>
            ))
          : posts.map((post) => (
              <div key={post.id} className={RAIL_ITEM_CLASS}>
                <BlogCard post={post} onNavigate={onNavigate} variant="rail" />
              </div>
            ))}
      </div>

      {/* Tablets and up: the newest post large, the rest beside / below it */}
      <div className={`hidden sm:grid ${layout.grid} gap-(--ds-s-4) lg:gap-(--ds-s-5)`}>
        {posts === null
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <BlogCardSkeleton
                key={i}
                variant={i === 0 ? layout.featuredVariant : layout.rest}
                className={i === 0 ? layout.featured : ''}
              />
            ))
          : posts.map((post, i) => (
              <BlogCard
                key={post.id}
                post={post}
                onNavigate={onNavigate}
                variant={i === 0 ? layout.featuredVariant : layout.rest}
                className={i === 0 ? layout.featured : ''}
              />
            ))}
      </div>
    </section>
  );
};
