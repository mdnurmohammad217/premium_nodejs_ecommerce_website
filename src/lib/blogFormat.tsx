import React, { useEffect, useMemo } from 'react';
import { videoEmbed } from './landingTemplates.ts';
import { StoreLink } from '../components/store/Header.tsx';

/**
 * Blog text → React, safely.
 *
 * Posts are written in a plain textarea with a small, documented subset of
 * Markdown. Nothing here ever reaches the page as raw HTML: every block and
 * every inline mark becomes a React element, and every link / image / video
 * address is checked against an allow-list before it is used.
 *
 * Supported:
 *   blank line            → new paragraph (a single newline is a line break)
 *   ## Heading / ### Sub  → headings (# is treated as ##)
 *   - item / * item       → bullet list
 *   1. item               → numbered list (Bengali digits too)
 *   > quote               → quote
 *   ---                   → divider
 *   **bold**  *italic*  `code`  [text](url)  and bare https:// links
 *   ![caption](url)       → an image on its own line (caption optional)
 *   a YouTube / Facebook / .mp4 link alone on a line → embedded player
 */

/* -------------------------------------------------------------------------- */
/* Shared blog types and helpers                                               */
/* -------------------------------------------------------------------------- */

/** One post as the public list endpoints return it */
export interface BlogPostCard {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  author: string;
  category: string;
  publishedAt: string;
  views: number;
  readMinutes: number;
}

/** GET /api/blog/:slug → post */
export interface BlogPostFull extends BlogPostCard {
  content: string;
  tags: string[];
  metaTitle: string;
  metaDescription: string;
}

export type BlogNavigate = (view: string, params?: any) => void;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses API dates, including "YYYY-MM-DD HH:MM:SS" which Safari rejects as-is */
export function parseBlogDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Sep 2026" — written out by hand so every browser shows the same thing */
export function formatBlogDate(value?: string | Date | null): string {
  const date = parseBlogDate(value);
  if (!date) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const BENGALI = /[ঀ-৿]/;
/** 'bn' when the text has Bengali in it, so it gets Bengali-friendly spacing */
export const blogLang = (text?: string | null): 'bn' | 'en' => (text && BENGALI.test(text) ? 'bn' : 'en');

/** Links may only go to http(s), mailto:, tel:, an in-page #anchor or a /relative path */
export function safeHref(url: string): string | null {
  const value = String(url || '').trim();
  if (!value) return null;
  if (/^https?:\/\/[^\s/]/i.test(value)) return value;
  if (/^(mailto|tel):[^\s]+$/i.test(value)) return value;
  if (value.startsWith('#')) return value;
  // "/x" is relative; "//host" and "/\host" are other sites in disguise
  if (value.startsWith('/') && !/^\/[\\/]/.test(value)) return value;
  return null;
}

/** Images may only come from http(s) or this site */
export function safeImageSrc(url: string): string | null {
  const value = String(url || '').trim();
  if (/^https?:\/\/[^\s/]/i.test(value)) return value;
  if (value.startsWith('/') && !/^\/[\\/]/.test(value)) return value;
  return null;
}

/**
 * Tab title while a blog page is open; the previous title comes back on leave.
 * `standalone` uses the title as-is, otherwise the store name is kept after it.
 */
export function useDocumentTitle(title: string | null | undefined, standalone = false) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = standalone || !previous || previous === title ? title : `${title} | ${previous}`;
    return () => {
      document.title = previous;
    };
  }, [title, standalone]);
}

/** Sets <meta name="description"> while a page is open and puts the old one back after */
export function useMetaDescription(description: string | null | undefined) {
  useEffect(() => {
    const value = (description || '').trim();
    if (!value) return;
    let tag = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const created = !tag;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      document.head.appendChild(tag);
    }
    const previous = tag.getAttribute('content');
    tag.setAttribute('content', value.slice(0, 300));
    return () => {
      if (!tag) return;
      if (created) tag.remove();
      else if (previous !== null) tag.setAttribute('content', previous);
    };
  }, [description]);
}

/* -------------------------------------------------------------------------- */
/* Block parser                                                                */
/* -------------------------------------------------------------------------- */

type VideoInfo = NonNullable<ReturnType<typeof videoEmbed>>;

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; start: number; bengali: boolean; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'img'; src: string; alt: string }
  | { kind: 'video'; video: VideoInfo; url: string }
  | { kind: 'hr' };

const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)$/;
const BARE_URL = /^(https?:\/\/|\/)\S+$/i;
const IMAGE_EXT = /\.(avif|gif|jpe?g|png|svg|webp)(\?[^#]*)?(#.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg)(\?|#|$)/i;
const HR_LINE = /^(-{3,}|\*{3,}|_{3,})$/;
const BULLET_LINE = /^[-*•]\s+(.+)$/;
const NUMBER_LINE = /^([0-9০-৯]{1,4})[.)]\s+(.+)$/;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const toNumber = (digits: string) =>
  Number(digits.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))) || 1;

/** A URL alone on its line: an image, an embeddable video, or nothing special */
function standaloneMedia(url: string): Block | null {
  if (IMAGE_EXT.test(url)) {
    const src = safeImageSrc(url);
    return src ? { kind: 'img', src, alt: '' } : null;
  }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) return null;
  const video = videoEmbed(url);
  if (!video) return null;
  if (video.kind === 'file' && (!VIDEO_EXT.test(url) || !safeImageSrc(video.src))) return null;
  // A Facebook page or profile link stays a link; only video addresses embed
  if (video.kind === 'facebook' && !/(\/videos?\/|\/watch|\/reels?\/|fb\.watch\/|\/share\/[vr]\/)/i.test(url)) return null;
  return { kind: 'video', video, url };
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!trimmed) {
      open = null;
      continue;
    }

    const image = IMAGE_LINE.exec(trimmed);
    if (image) {
      open = null;
      const src = safeImageSrc(image[2]);
      if (src) blocks.push({ kind: 'img', src, alt: image[1].trim() });
      continue;
    }

    if (BARE_URL.test(trimmed)) {
      const media = standaloneMedia(trimmed);
      if (media) {
        open = null;
        blocks.push(media);
        continue;
      }
    }

    if (HR_LINE.test(trimmed)) {
      open = null;
      blocks.push({ kind: 'hr' });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      open = null;
      blocks.push({ kind: heading[1].length >= 3 ? 'h3' : 'h2', text: heading[2].replace(/\s+#+$/, '') });
      continue;
    }

    const bullet = BULLET_LINE.exec(trimmed);
    if (bullet) {
      if (open && open.kind === 'ul') {
        open.items.push(bullet[1]);
      } else {
        const list: Block = { kind: 'ul', items: [bullet[1]] };
        blocks.push(list);
        open = list;
      }
      continue;
    }

    const numbered = NUMBER_LINE.exec(trimmed);
    if (numbered) {
      if (open && open.kind === 'ol') {
        open.items.push(numbered[2]);
      } else {
        const list: Block = {
          kind: 'ol',
          start: toNumber(numbered[1]),
          bengali: /[০-৯]/.test(numbered[1]),
          items: [numbered[2]],
        };
        blocks.push(list);
        open = list;
      }
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      if (open && open.kind === 'quote') {
        open.lines.push(quote[1]);
      } else {
        const block: Block = { kind: 'quote', lines: [quote[1]] };
        blocks.push(block);
        open = block;
      }
      continue;
    }

    // An indented line under a list item continues that item
    if (open && (open.kind === 'ul' || open.kind === 'ol') && /^\s{2,}/.test(raw)) {
      open.items[open.items.length - 1] += `\n${trimmed}`;
      continue;
    }

    if (open && open.kind === 'p') {
      open.lines.push(trimmed);
    } else {
      const paragraph: Block = { kind: 'p', lines: [trimmed] };
      blocks.push(paragraph);
      open = paragraph;
    }
  }

  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Inline marks                                                                */
/* -------------------------------------------------------------------------- */

// [text](url) | **bold** | *italic* | `code` | bare https:// link
const INLINE_SOURCE =
  /\[([^\]\n]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)|\*\*([^\n]+?)\*\*(?!\*)|\*([^\s*](?:[^*\n]*[^\s*])?)\*|`([^`\n]+)`|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,:;!?'"])/
    .source;

interface InlineOptions {
  links: boolean;
  onNavigate?: BlogNavigate;
}

const LINK_CLASS =
  'text-(--primary) font-(--ds-fw-medium) underline decoration-[color-mix(in_srgb,var(--primary)_40%,transparent)] underline-offset-[3px] hover:decoration-(--primary) break-words';

const sameOrigin = (href: string) => {
  try {
    return typeof window !== 'undefined' && new URL(href).origin === window.location.origin;
  } catch {
    return false;
  }
};

function renderLink(label: React.ReactNode, href: string, key: string, onNavigate?: BlogNavigate): React.ReactNode {
  if (/^https?:\/\//i.test(href) && !sameOrigin(href)) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {label}
      </a>
    );
  }
  if (onNavigate && (href.startsWith('/') || sameOrigin(href))) {
    let path = href;
    if (!href.startsWith('/')) {
      const url = new URL(href);
      path = url.pathname + url.search;
    }
    return (
      <StoreLink key={key} to={path} onNavigate={onNavigate} className={LINK_CLASS}>
        {label}
      </StoreLink>
    );
  }
  return (
    <a key={key} href={href} className={LINK_CLASS}>
      {label}
    </a>
  );
}

function renderInline(text: string, keyPrefix: string, options: InlineOptions): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // A fresh RegExp per call: the renderer recurses, and a shared /g regex
  // would have its lastIndex moved underneath it.
  const pattern = new RegExp(INLINE_SOURCE, 'g');
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index}`;
    const [token, linkLabel, linkUrl, bold, italic, code, bareUrl] = match;

    if (linkLabel !== undefined) {
      const label = renderInline(linkLabel, key, { ...options, links: false });
      const href = options.links ? safeHref(linkUrl) : null;
      nodes.push(href ? renderLink(label, href, key, options.onNavigate) : <React.Fragment key={key}>{label}</React.Fragment>);
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={key} className="font-(--ds-fw-bold) text-(--ds-text)">
          {renderInline(bold, key, options)}
        </strong>
      );
    } else if (italic !== undefined) {
      nodes.push(
        <em key={key} className="italic">
          {renderInline(italic, key, options)}
        </em>
      );
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={key}
          className="px-1.5 py-0.5 rounded-(--ds-r-xs) bg-(--ds-surface-3) text-(--ds-text) text-[0.9em] break-words"
        >
          {code}
        </code>
      );
    } else if (bareUrl !== undefined) {
      const href = options.links ? safeHref(bareUrl) : null;
      nodes.push(href ? renderLink(bareUrl, href, key, options.onNavigate) : bareUrl);
    } else {
      nodes.push(token);
    }

    last = match.index + token.length;
    index += 1;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Lines of one block, joined with <br/> */
function withBreaks(lines: string[], key: string, options: InlineOptions): React.ReactNode[] {
  return lines.map((line, i) => (
    <React.Fragment key={`${key}-l${i}`}>
      {renderInline(line, `${key}-l${i}`, options)}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

/* -------------------------------------------------------------------------- */
/* Media blocks                                                                */
/* -------------------------------------------------------------------------- */

const BlogImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [broken, setBroken] = React.useState(false);
  if (broken) return null;
  return (
    <figure className="mt-(--ds-s-8) mb-(--ds-s-2) first:mt-0">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="block w-full h-auto rounded-(--ds-r-xl) border border-(--ds-border-soft) bg-(--ds-surface-2)"
      />
      {alt && (
        <figcaption
          lang={blogLang(alt)}
          className="mt-(--ds-s-2) text-center text-(length:--ds-fs-sm) leading-(--ds-lh-snug) text-(--ds-text-muted)"
        >
          {alt}
        </figcaption>
      )}
    </figure>
  );
};

const BlogVideo: React.FC<{ video: VideoInfo; url: string }> = ({ video, url }) => {
  const frame = video.vertical
    ? 'aspect-[9/16] w-full max-w-[360px] mx-auto'
    : 'aspect-video w-full';
  return (
    <div className="mt-(--ds-s-8) mb-(--ds-s-2) first:mt-0">
      <div className={`relative overflow-hidden rounded-(--ds-r-xl) bg-(--ds-gray-900) shadow-(--ds-shadow-md) ${frame}`}>
        {video.kind === 'file' ? (
          <video
            src={video.src}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-contain bg-(--ds-gray-900)"
          />
        ) : (
          <iframe
            src={video.src}
            title={video.kind === 'youtube' ? 'YouTube video' : 'Facebook video'}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
          />
        )}
      </div>
      {video.kind !== 'file' && (
        <p className="sr-only">
          Video: <a href={url}>{url}</a>
        </p>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Public renderer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A blog post body. Pass `onNavigate` on the storefront so /relative links
 * open without a full page load; the dashboard preview leaves it out.
 */
export function BlogContent({
  text,
  onNavigate,
  className = '',
}: {
  text: string;
  onNavigate?: BlogNavigate;
  className?: string;
}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const lang = blogLang(text);
  const options: InlineOptions = { links: true, onNavigate };

  return (
    <div
      lang={lang}
      // Inline so the global [lang="bn"] rule cannot tighten it back to 1.75
      style={{ lineHeight: 1.8 }}
      className={`text-(length:--ds-fs-lg) text-(--ds-gray-700) break-words ${className}`}
    >
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.kind) {
          case 'h2':
            return (
              <h2
                key={key}
                className="mt-(--ds-s-10) first:mt-0 text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug)"
              >
                {renderInline(block.text, key, options)}
              </h2>
            );
          case 'h3':
            return (
              <h3
                key={key}
                className="mt-(--ds-s-8) first:mt-0 text-(length:--ds-fs-xl) font-(--ds-fw-semibold) text-(--ds-text) leading-(--ds-lh-snug)"
              >
                {renderInline(block.text, key, options)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={key} className="mt-(--ds-s-5) first:mt-0 list-disc pl-(--ds-s-6) space-y-(--ds-s-2) marker:text-(--primary)">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="pl-(--ds-s-1)">
                    {withBreaks(item.split('\n'), `${key}-${j}`, options)}
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol
                key={key}
                start={block.start}
                style={block.bengali ? { listStyleType: 'bengali' } : undefined}
                className="mt-(--ds-s-5) first:mt-0 list-decimal pl-(--ds-s-6) space-y-(--ds-s-2) marker:text-(--primary) marker:font-(--ds-fw-semibold)"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="pl-(--ds-s-1)">
                    {withBreaks(item.split('\n'), `${key}-${j}`, options)}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="mt-(--ds-s-6) first:mt-0 border-l-4 border-(--primary) bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] rounded-r-(--ds-r-lg) px-(--ds-s-5) py-(--ds-s-4) text-(--ds-text) font-(--ds-fw-medium)"
              >
                {withBreaks(block.lines, key, options)}
              </blockquote>
            );
          case 'img':
            return <BlogImage key={key} src={block.src} alt={block.alt} />;
          case 'video':
            return <BlogVideo key={key} video={block.video} url={block.url} />;
          case 'hr':
            return <hr key={key} className="mt-(--ds-s-10) mb-(--ds-s-5) first:mt-0 h-px border-0 bg-(--ds-border)" />;
          default:
            return (
              <p key={key} className="mt-(--ds-s-5) first:mt-0">
                {withBreaks(block.lines, key, options)}
              </p>
            );
        }
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plain text for previews                                                     */
/* -------------------------------------------------------------------------- */

/** The post as plain text — no marks, images or embeds — cut to `max` characters */
export function plainExcerpt(text: string, max = 160): string {
  const plain = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || IMAGE_LINE.test(line) || HR_LINE.test(line)) return false;
      if (BARE_URL.test(line) && standaloneMedia(line)) return false;
      return true;
    })
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*•]\s+/, '')
        .replace(/^[0-9০-৯]{1,4}[.)]\s+/, '')
        .replace(/^>\s?/, '')
    )
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?।-]+$/, '')}…`;
}

/** Words in a post, and minutes to read it at the same pace the server uses */
export function readingStats(text: string): { words: number; minutes: number } {
  const words = plainExcerpt(text, Number.MAX_SAFE_INTEGER).split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 180)) };
}
