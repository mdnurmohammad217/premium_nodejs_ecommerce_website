import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { CmsPage, SiteSettings } from '../../types/index.ts';

interface DynamicPageViewProps {
  slug: string;
  onBackToHome: () => void;
  settings?: SiteSettings;
}

/* ---------------------------------------------------------------------------
   Markdown subset
   The page editor (Dashboard → Pages) documents ## / ### headings and "- "
   bullets; this also understands # headings, numbered lists, > quotes, ---
   rules, **bold** and [links](url), so pasted content degrades gracefully.
   --------------------------------------------------------------------------- */

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** **bold** and [label](href) inside one line of text */
const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-(--ds-fw-bold) text-(--ds-text)">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1] || token;
      const href = linkMatch?.[2] || '';
      if (SAFE_HREF.test(href)) {
        const external = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={`${keyPrefix}-a${index}`}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="text-(--primary) font-(--ds-fw-medium) underline underline-offset-2 break-words"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    }
    last = match.index + token.length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'hr' };

const parseBlocks = (source: string): Block[] => {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    const prev = blocks[blocks.length - 1];

    if (!trimmed) {
      blocks.push({ type: 'p', text: '' });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[heading[1].length - 1], text: heading[2] });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      if (prev && prev.type === 'ul') prev.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
      continue;
    }
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      if (prev && prev.type === 'ol') prev.items.push(numbered[1]);
      else blocks.push({ type: 'ol', items: [numbered[1]] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      if (prev && prev.type === 'quote') prev.text += `\n${quote[1]}`;
      else blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }
    // Consecutive text lines form one paragraph, keeping the author's line breaks
    if (prev && prev.type === 'p' && prev.text) prev.text += `\n${trimmed}`;
    else blocks.push({ type: 'p', text: trimmed });
  }
  return blocks.filter((block) => !(block.type === 'p' && !block.text));
};

const withBreaks = (text: string, key: string) =>
  text.split('\n').map((part, i, all) => (
    <React.Fragment key={`${key}-${i}`}>
      {renderInline(part, `${key}-${i}`)}
      {i < all.length - 1 && <br />}
    </React.Fragment>
  ));

/**
 * Page text is written by the owner in English or Bengali. The language is
 * detected from the text itself so screen readers use the right voice and
 * Bengali gets its looser line height only when there is Bengali to read.
 */
const BENGALI_TEXT = /[\u0980-\u09F2\u09F4-\u09FF]/;
export const contentLang = (text?: string | null) => (text && BENGALI_TEXT.test(text) ? 'bn' : 'en');

/** Readable long-form article: comfortable measure, generous leading, clear rhythm */
export const MarkdownArticle: React.FC<{ content: string }> = ({ content }) => {
  const blocks = parseBlocks(content);
  const lang = contentLang(content);
  return (
    <div
      lang={lang}
      className={`text-(length:--ds-fs-lg) text-(--ds-text-soft) ${lang === 'bn' ? 'leading-(--ds-lh-bn)' : 'leading-(--ds-lh-normal)'} break-words [&>*+*]:mt-(--ds-s-4)`}
    >
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case 'h1':
            return (
              <h2 key={key} className="text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug) pt-(--ds-s-4)">
                {renderInline(block.text, key)}
              </h2>
            );
          case 'h2':
            return (
              <h2
                key={key}
                className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug) pt-(--ds-s-4) first:pt-0"
              >
                {renderInline(block.text, key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} className="text-(length:--ds-fs-lg) font-(--ds-fw-semibold) text-(--ds-text) leading-(--ds-lh-snug) pt-(--ds-s-2)">
                {renderInline(block.text, key)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={key} className="list-disc pl-(--ds-s-6) space-y-(--ds-s-2) marker:text-(--ds-text-faint)">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="pl-(--ds-s-1)">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="list-decimal pl-(--ds-s-6) space-y-(--ds-s-2) marker:text-(--ds-text-muted) marker:font-(--ds-fw-semibold)">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="pl-(--ds-s-1)">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-4 border-(--primary) bg-(--ds-surface-2) rounded-r-(--ds-r-md) px-(--ds-s-4) py-(--ds-s-3) text-(--ds-text)"
              >
                {withBreaks(block.text, key)}
              </blockquote>
            );
          case 'hr':
            return <hr key={key} className="ds-divider my-(--ds-s-6)" />;
          default:
            return <p key={key}>{withBreaks(block.text, key)}</p>;
        }
      })}
    </div>
  );
};

/** One CMS page laid out as an article, or a neutral empty state when it has no content */
export const CmsPageArticle: React.FC<{
  page?: CmsPage | null;
  onBack: () => void;
  backLabel?: string;
}> = ({ page, onBack, backLabel = 'Back to Home' }) => {
  const hasContent = Boolean(page?.content && page.content.trim());
  const updated = page?.updatedAt ? new Date(page.updatedAt) : null;
  const updatedLabel =
    updated && !Number.isNaN(updated.getTime())
      ? updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

  return (
    <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-8) sm:py-(--ds-s-12)">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{backLabel}</span>
      </button>

      {hasContent && page ? (
        <article className="mt-(--ds-s-4) ds-card ds-fade-in px-(--ds-card-pad) py-(--ds-s-8) sm:px-(--ds-s-12) sm:py-(--ds-s-10)">
          <header className="pb-(--ds-s-6) mb-(--ds-s-6) border-b border-(--ds-border-soft)">
            <h1
              lang={contentLang(page.title)}
              className="text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text) leading-(--ds-lh-snug)"
            >
              {page.title}
            </h1>
            {updatedLabel && (
              <p className="mt-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                Last updated: {updatedLabel}
              </p>
            )}
          </header>
          <MarkdownArticle content={page.content} />
        </article>
      ) : (
        <div className="mt-(--ds-s-4) ds-card ds-fade-in flex flex-col items-center justify-center text-center px-(--ds-s-6) py-(--ds-s-16)">
          <span className="w-14 h-14 rounded-(--ds-r-xl) inline-flex items-center justify-center bg-(--ds-surface-3) text-(--ds-text-faint)">
            <FileText className="w-6 h-6" />
          </span>
          <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
            This page hasn't been created yet.
          </h1>
          {page?.title && (
            <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">{page.title}</p>
          )}
          <button onClick={onBack} className="ds-btn ds-btn-secondary mt-(--ds-s-5)">
            {backLabel}
          </button>
        </div>
      )}
    </div>
  );
};

/** Finds a CMS page by slug (or id); pages are managed in Dashboard → Pages */
export const findCmsPage = (settings: SiteSettings | undefined, ...slugs: string[]): CmsPage | null => {
  const pages: CmsPage[] = settings?.pages || [];
  for (const slug of slugs) {
    const found = pages.find((p) => p.slug === slug || p.id === slug);
    if (found) return found;
  }
  return null;
};

export const DynamicPageView: React.FC<DynamicPageViewProps> = ({ slug, onBackToHome, settings }) => (
  <CmsPageArticle page={findCmsPage(settings, slug)} onBack={onBackToHome} />
);
