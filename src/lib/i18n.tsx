import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * v3.13 — website languages.
 *
 * The storefront speaks English by default; a visitor can switch to Bangla,
 * Hindi, Arabic or French (Dashboard → Website → Languages decides which ones
 * are offered and which one a new visitor sees). Only the shop's own words
 * are translated — buttons, headings, labels, messages. Product names,
 * descriptions and anything the owner typed stay exactly as they were written,
 * unless the owner left an English default in place (that default is
 * translated like any other built-in text).
 *
 * How it works: every built-in text is written in English inside `t()`. The
 * English sentence is the key; each language file (src/lib/translations/*.ts)
 * maps it to its own wording. A sentence that has no translation shows in
 * English, so nothing is ever blank. Language files are fetched only when a
 * visitor picks that language, so an English visitor downloads none of them.
 *
 * Arabic is written right-to-left: the whole page turns (dir="rtl").
 * The dashboard and the POS always stay in English, left-to-right.
 */

export type LangCode = 'en' | 'bn' | 'hi' | 'ar' | 'fr';

export interface LanguageInfo {
  code: LangCode;
  /** Name in English (dashboard) */
  name: string;
  /** Name in its own language (what visitors see) */
  native: string;
  /** Two-letter mark drawn in the language's own script */
  mark: string;
  dir: 'ltr' | 'rtl';
  /** BCP-47 tag for <html lang> */
  tag: string;
}

export const LANGUAGES: Record<LangCode, LanguageInfo> = {
  en: { code: 'en', name: 'English', native: 'English', mark: 'En', dir: 'ltr', tag: 'en' },
  bn: { code: 'bn', name: 'Bangla', native: 'বাংলা', mark: 'বা', dir: 'ltr', tag: 'bn' },
  hi: { code: 'hi', name: 'Hindi', native: 'हिन्दी', mark: 'हि', dir: 'ltr', tag: 'hi' },
  ar: { code: 'ar', name: 'Arabic', native: 'العربية', mark: 'ع', dir: 'rtl', tag: 'ar' },
  fr: { code: 'fr', name: 'French', native: 'Français', mark: 'Fr', dir: 'ltr', tag: 'fr' },
};

export const LANGUAGE_ORDER: LangCode[] = ['en', 'bn', 'hi', 'ar', 'fr'];

export const isLangCode = (value: unknown): value is LangCode =>
  typeof value === 'string' && (LANGUAGE_ORDER as string[]).includes(value);

/** Dashboard → Website → Languages (setting key `language_config`) */
export interface LanguageConfig {
  /** Show the language switcher at all (off = the site stays in the default language) */
  enabled?: boolean;
  /** Languages offered to visitors, in this order */
  languages?: LangCode[];
  /** What a new visitor sees */
  defaultLanguage?: LangCode;
  /** Where the switcher appears */
  showInHeader?: boolean;
  showInDrawer?: boolean;
  showInFooter?: boolean;
}

export interface ResolvedLanguageConfig {
  enabled: boolean;
  languages: LangCode[];
  defaultLanguage: LangCode;
  showInHeader: boolean;
  showInDrawer: boolean;
  showInFooter: boolean;
}

export function languageConfigOf(settings: any): ResolvedLanguageConfig {
  const raw: LanguageConfig = (settings && settings.language_config) || {};
  const list = Array.isArray(raw.languages) ? raw.languages.filter(isLangCode) : [...LANGUAGE_ORDER];
  const unique = Array.from(new Set(list));
  const defaultLanguage = isLangCode(raw.defaultLanguage) ? raw.defaultLanguage : 'en';
  // The default language is always offered
  const languages = unique.includes(defaultLanguage) ? unique : [defaultLanguage, ...unique];
  return {
    enabled: raw.enabled !== false && languages.length > 1,
    languages,
    defaultLanguage,
    showInHeader: raw.showInHeader !== false,
    showInDrawer: raw.showInDrawer !== false,
    showInFooter: raw.showInFooter !== false,
  };
}

/* ------------------------------------------------------------ dictionaries */

type Dictionary = Record<string, string>;
const loaded: Partial<Record<LangCode, Dictionary>> = { en: {} };
const loaders = import.meta.glob<{ default: Dictionary }>('./translations/*.ts');

async function loadDictionary(lang: LangCode): Promise<Dictionary> {
  if (loaded[lang]) return loaded[lang]!;
  const loader = loaders[`./translations/${lang}.ts`];
  if (!loader) return (loaded[lang] = {});
  try {
    const mod = await loader();
    loaded[lang] = mod.default || {};
  } catch {
    loaded[lang] = {};
  }
  return loaded[lang]!;
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : text;

/** The language the storefront is showing right now (also for code outside React) */
let currentLang: LangCode = 'en';

/**
 * Translate one built-in English text. `vars` fill {placeholders}:
 * translate('Only {n} left', { n: 3 }).
 */
export function translate(text: string, vars?: Record<string, string | number>, lang: LangCode = currentLang): string {
  if (!text) return text;
  const dictionary = loaded[lang];
  const own = dictionary ? dictionary[text] ?? dictionary[text.trim()] : undefined;
  return fill(own || text, vars);
}

export type TFunction = (text: string, vars?: Record<string, string | number>) => string;

/* ---------------------------------------------------------- page translator */

/**
 * Most storefront components write their texts directly (they predate
 * languages). Instead of touching each of them, the page translator looks
 * at the text on screen and swaps every text that EXACTLY matches a known
 * English sentence ("Proceed to Checkout", "Order summary" …) for its
 * translation — the same way the dictionary is used by t(). Anything that
 * is not an exact match (product names, prices, what the owner typed) is
 * never touched. Elements marked translate="no" are skipped. When React
 * later writes new text into a node, the new text is translated again; going
 * back to English restores every original text.
 */
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG']);

interface TextMemo {
  original: string;
  shown: string;
}
const textMemo = new WeakMap<Text, TextMemo>();
const attrMemo = new WeakMap<Element, Record<string, TextMemo>>();
let pageDictionary: Dictionary | null = null;

const lookup = (raw: string): string | null => {
  if (!pageDictionary) return null;
  const key = raw.replace(/\s+/g, ' ').trim();
  if (!key || key.length > 300 || !/[A-Za-z]/.test(key)) return null;
  const hit = pageDictionary[key];
  if (!hit) return null;
  // Keep the spaces around the text exactly as they were
  const lead = raw.match(/^\s*/)?.[0] || '';
  const trail = raw.match(/\s*$/)?.[0] || '';
  return lead + hit + trail;
};

const skipped = (el: Element | null): boolean => {
  for (let node = el; node; node = node.parentElement) {
    if (SKIP_TAGS.has(node.tagName.toUpperCase())) return true;
    if (node.getAttribute('translate') === 'no' || node.hasAttribute('data-no-translate') || (node as HTMLElement).isContentEditable) return true;
    if (node.id === 'root') return false;
  }
  return false;
};

function translateText(node: Text) {
  const value = node.nodeValue || '';
  let memo = textMemo.get(node);
  if (memo && value === memo.shown) {
    // Ours — re-apply only when the language changed
    const next = pageDictionary ? lookup(memo.original) || memo.original : memo.original;
    if (next !== value) {
      memo.shown = next;
      node.nodeValue = next;
    }
    return;
  }
  // New text (first time, or React wrote a new value)
  if (skipped(node.parentElement)) return;
  const next = pageDictionary ? lookup(value) : null;
  memo = { original: value, shown: next || value };
  textMemo.set(node, memo);
  if (next && next !== value) node.nodeValue = next;
}

function translateAttrs(el: Element) {
  if (skipped(el)) return;
  let memos = attrMemo.get(el);
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    if (!memos) {
      memos = {};
      attrMemo.set(el, memos);
    }
    const memo = memos[name];
    const original = memo && value === memo.shown ? memo.original : value;
    const next = (pageDictionary && lookup(original)) || original;
    memos[name] = { original, shown: next };
    if (next !== value) el.setAttribute(name, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
    else translateAttrs(node as Element);
  }
}

let observer: MutationObserver | null = null;
let observing = false;

/** Turn the page translator on (dictionary) or off (null = English again) */
function runPageTranslator(dictionary: Dictionary | null) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;
  pageDictionary = dictionary && Object.keys(dictionary).length ? dictionary : null;
  if (!observer) {
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target as Text);
        else if (record.type === 'attributes') translateAttrs(record.target as Element);
        else record.addedNodes.forEach((node) => translateTree(node));
      }
    });
  }
  // Translate (or restore) everything on screen now
  translateTree(root);
  if (pageDictionary && !observing) {
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    observing = true;
  } else if (!pageDictionary && observing) {
    observer.disconnect();
    observing = false;
  }
}

/* --------------------------------------------------------------- storage */

const STORAGE_KEY = 'store-lang';

const readStored = (): LangCode | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('lang');
    if (isLangCode(fromUrl)) return fromUrl;
    const value = localStorage.getItem(STORAGE_KEY);
    return isLangCode(value) ? value : null;
  } catch {
    return null;
  }
};

const store = (lang: LangCode) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode — the choice lasts for this page only */
  }
};

/* --------------------------------------------------------------- context */

interface LanguageState {
  lang: LangCode;
  info: LanguageInfo;
  dir: 'ltr' | 'rtl';
  t: TFunction;
  setLang: (lang: LangCode) => void;
  config: ResolvedLanguageConfig;
  /** App hands over the shop's settings and whether a storefront page is open */
  configure: (settings: any, storefront: boolean) => void;
}

const defaultConfig = languageConfigOf({});

const LanguageContext = createContext<LanguageState>({
  lang: 'en',
  info: LANGUAGES.en,
  dir: 'ltr',
  t: (text, vars) => fill(text, vars),
  setLang: () => undefined,
  config: defaultConfig,
  configure: () => undefined,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ResolvedLanguageConfig>(defaultConfig);
  const [storefront, setStorefront] = useState(true);
  const [wanted, setWanted] = useState<LangCode | null>(() => (typeof window === 'undefined' ? null : readStored()));
  // Bumps when a dictionary arrives, so every text re-renders in the new language
  const [version, setVersion] = useState(0);

  // The language actually shown: the visitor's choice when it is offered,
  // otherwise the shop's default. The dashboard and POS are always English.
  const lang: LangCode = !storefront
    ? 'en'
    : config.enabled && wanted && config.languages.includes(wanted)
    ? wanted
    : config.defaultLanguage;
  const ready = Boolean(loaded[lang]);
  const shown: LangCode = ready ? lang : 'en';
  currentLang = shown;

  useEffect(() => {
    if (loaded[lang]) return;
    let cancelled = false;
    loadDictionary(lang).then(() => {
      if (!cancelled) setVersion((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // The page translator follows the language shown (off in English)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => runPageTranslator(shown === 'en' ? null : loaded[shown] || null));
    return () => window.cancelAnimationFrame(frame);
  }, [shown, version]);

  // <html lang dir>: Arabic turns the whole page right-to-left
  useEffect(() => {
    const info = LANGUAGES[shown];
    const root = document.documentElement;
    root.setAttribute('lang', info.tag);
    root.setAttribute('dir', info.dir);
    root.dataset.lang = info.code;
  }, [shown]);

  const setLang = useCallback((next: LangCode) => {
    if (!isLangCode(next)) return;
    store(next);
    setWanted(next);
    // Remove a ?lang= from the address so the choice made here wins after a reload
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const configure = useCallback((settings: any, isStorefront: boolean) => {
    const next = languageConfigOf(settings);
    setConfig((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    setStorefront(isStorefront);
  }, []);

  const value = useMemo<LanguageState>(() => {
    const t: TFunction = (text, vars) => translate(text, vars, shown);
    return { lang: shown, info: LANGUAGES[shown], dir: LANGUAGES[shown].dir, t, setLang, config, configure };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, version, config, setLang, configure]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
/** The translate function for the language being shown */
export const useT = (): TFunction => useContext(LanguageContext).t;
