import React, { useMemo } from 'react';

/**
 * Product descriptions can be plain text (typed in the dashboard) or HTML
 * (imported from another shop). Plain text keeps its line breaks; HTML is
 * cleaned first — only formatting tags survive (no scripts, styles, event
 * handlers or javascript: links) — so an imported description can never run
 * code on the shop.
 */
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'MARK', 'SPAN', 'DIV', 'UL', 'OL', 'LI',
  'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'SUB', 'SUP',
]);
const ATTRS: Record<string, string[]> = { A: ['href', 'title'], IMG: ['src', 'alt', 'width', 'height'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };

function clean(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED.has(child.tagName)) {
        // Unknown wrappers keep their text; dangerous ones go entirely
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'META', 'LINK'].includes(child.tagName)) {
          child.remove();
        } else {
          walk(child);
          child.replaceWith(...Array.from(child.childNodes));
        }
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const allowed = ATTRS[child.tagName] || [];
        const value = attr.value.trim();
        if (!allowed.includes(attr.name.toLowerCase()) || /^\s*javascript:/i.test(value) || /^\s*data:(?!image\/)/i.test(value)) {
          child.removeAttribute(attr.name);
        }
      }
      if (child.tagName === 'A') {
        child.setAttribute('rel', 'noopener noreferrer nofollow');
        child.setAttribute('target', '_blank');
      }
      if (child.tagName === 'IMG') child.setAttribute('loading', 'lazy');
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(text || '');
  const html = useMemo(() => (isHtml ? clean(text) : ''), [isHtml, text]);
  if (!isHtml) return <p className={`whitespace-pre-line break-words ${className}`}>{text}</p>;
  return <div className={`rich-text break-words ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
};
