import React, { useEffect, useMemo, useState } from 'react';
import { Type, Save, RotateCcw, Monitor, LayoutDashboard, Heading, ChevronDown } from 'lucide-react';
import { Card, CardHeader, Field, Button } from './ui.tsx';
import {
  FONT_CHOICES,
  FONT_CATEGORY_LABELS,
  DEFAULT_FONT_CONFIG,
  fontConfigOf,
  fontStack,
  googleFontUrls,
  isSafeFamily,
  applyFontConfig,
  type FontCategory,
  type FontConfig,
} from '../../lib/fonts.ts';

const OTHER = '__other__';
const CATEGORIES = Object.keys(FONT_CATEGORY_LABELS) as FontCategory[];
const known = (family: string) => FONT_CHOICES.some((item) => item.family === family);

/** Loads a family for the preview only (the page itself changes after Save) */
function usePreviewFont(family: string) {
  useEffect(() => {
    if (!family || !isSafeFamily(family)) return;
    googleFontUrls(family).forEach((href) => {
      if (document.head.querySelector(`link[data-font-preview][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.fontPreview = '';
      document.head.appendChild(link);
    });
  }, [family]);
}

const FontSelect: React.FC<{
  label: string;
  hint: string;
  icon: React.ComponentType<any>;
  value: string;
  onChange: (next: string) => void;
  /** First options, e.g. "Built-in" and "Same as the website" */
  firstOptions: Array<{ value: string; label: string }>;
}> = ({ label, hint, icon: Icon, value, onChange, firstOptions }) => {
  const isFirst = firstOptions.some((option) => option.value === value);
  const [otherMode, setOtherMode] = useState(!isFirst && !known(value));
  const [otherName, setOtherName] = useState(!isFirst && !known(value) ? value : '');
  useEffect(() => {
    if (!isFirst && !known(value)) {
      setOtherMode(true);
      setOtherName(value);
    }
  }, [value, isFirst]);
  const selected = otherMode ? OTHER : value;
  const otherInvalid = otherMode && otherName.trim() !== '' && !isSafeFamily(otherName);

  return (
    <Field
      label={
        <span className="inline-flex items-center gap-1.5">
          <Icon className="w-4 h-4" /> {label}
        </span>
      }
      hint={hint}
    >
      <div className="relative">
        <select
          className="a-field appearance-none pr-8 cursor-pointer"
          value={selected}
          onChange={(event) => {
            const next = event.target.value;
            if (next === OTHER) {
              setOtherMode(true);
              if (isSafeFamily(otherName)) onChange(otherName.trim());
              return;
            }
            setOtherMode(false);
            onChange(next);
          }}
        >
          {firstOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {CATEGORIES.map((category) => (
            <optgroup key={category} label={FONT_CATEGORY_LABELS[category]}>
              {FONT_CHOICES.filter((item) => item.category === category).map((item) => (
                <option key={item.family} value={item.family}>
                  {item.family}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER}>Another Google font…</option>
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--a-text-faint)' }} />
      </div>
      {otherMode && (
        <div className="mt-2">
          <input
            className="a-field"
            value={otherName}
            placeholder="Exact name from fonts.google.com, e.g. Josefin Sans"
            onChange={(event) => {
              const next = event.target.value;
              setOtherName(next);
              if (isSafeFamily(next)) onChange(next.trim());
            }}
          />
          {otherInvalid && (
            <p className="ds-error-text">Use the name exactly as Google Fonts shows it: letters, numbers and spaces only.</p>
          )}
        </div>
      )}
    </Field>
  );
};

const Preview: React.FC<{ title: string; body: string; heading: string }> = ({ title, body, heading }) => (
  <div className="p-4 min-w-0" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
    <p className="mb-2 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)', fontFamily: 'var(--a-font)' }}>
      {title}
    </p>
    <p style={{ fontFamily: heading, fontSize: 22, fontWeight: 700, lineHeight: 1.25, color: 'var(--a-text)' }}>Premium Onion Hair Oil 200ml</p>
    <p className="mt-1" style={{ fontFamily: heading, fontSize: 18, fontWeight: 600, color: 'var(--a-text)' }}>
      প্রিমিয়াম অনিয়ন হেয়ার অয়েল
    </p>
    <p className="mt-2" style={{ fontFamily: body, fontSize: 14, lineHeight: 1.6, color: 'var(--a-text-muted)' }}>
      Reduces hair fall and helps new growth. চুল পড়া কমায় এবং নতুন চুল গজাতে সাহায্য করে। ৳ 1,250 · 0123456789
    </p>
  </div>
);

/**
 * v3.15 — System Configuration → Fonts: the typeface of the website (body
 * and headings separately) and of the dashboard + POS.
 */
export const FontsPanel: React.FC<{ settings: any; onSave: (fonts: FontConfig) => Promise<void> | void; saving?: boolean }> = ({
  settings,
  onSave,
  saving,
}) => {
  const saved = useMemo(() => fontConfigOf(settings), [settings]);
  const [draft, setDraft] = useState<FontConfig>(saved);
  useEffect(() => setDraft(saved), [saved]);
  usePreviewFont(draft.website);
  usePreviewFont(draft.heading);
  usePreviewFont(draft.dashboard === 'website' ? '' : draft.dashboard);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const websiteBody = fontStack(draft.website);
  const websiteHeading = draft.heading ? fontStack(draft.heading) : websiteBody;
  const dashboardFamily = draft.dashboard === 'website' ? draft.website : draft.dashboard;
  const dashboardStack = fontStack(dashboardFamily);

  const save = async () => {
    await onSave(draft);
    // The dashboard switches straight away; the website on its next page load
    applyFontConfig(draft, 'dashboard');
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={Type}
          title="Fonts"
          subtitle="Pick the typeface of your website and of the dashboard. Fonts come from Google Fonts; Bangla, Hindi and Arabic text always stays readable."
          actions={
            <Button size="sm" icon={RotateCcw} onClick={() => setDraft(DEFAULT_FONT_CONFIG)}>
              Built-in fonts
            </Button>
          }
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <FontSelect
            label="Website text"
            icon={Monitor}
            hint="Menus, descriptions, prices, buttons."
            value={draft.website}
            onChange={(website) => setDraft({ ...draft, website })}
            firstOptions={[{ value: '', label: 'Built-in (Public Sans)' }]}
          />
          <FontSelect
            label="Website headings"
            icon={Heading}
            hint="Section titles and product names. A serif here looks premium."
            value={draft.heading}
            onChange={(heading) => setDraft({ ...draft, heading })}
            firstOptions={[{ value: '', label: 'Same as website text' }]}
          />
          <FontSelect
            label="Dashboard & POS"
            icon={LayoutDashboard}
            hint="Only you and your staff see this."
            value={draft.dashboard}
            onChange={(dashboard) => setDraft({ ...draft, dashboard })}
            firstOptions={[
              { value: '', label: 'Built-in (Public Sans)' },
              { value: 'website', label: 'Same as website text' },
            ]}
          />
        </div>

        <div className="grid gap-3 mt-5 lg:grid-cols-2">
          <Preview title="Website" body={websiteBody} heading={websiteHeading} />
          <Preview title="Dashboard & POS" body={dashboardStack} heading={dashboardStack} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 mt-5">
          {changed && (
            <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Unsaved changes</span>
          )}
          <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!changed}>
            Save fonts
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Good to know" />
        <ul className="list-disc ps-5 space-y-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          <li>The built-in font is stored on your own server and is the fastest. A Google font adds one small download (cached by the browser after the first visit).</li>
          <li>Text is shown at once in a similar system font and switches when the chosen font arrives, so pages never wait for it.</li>
          <li>A font without Bangla letters (most English fonts) still shows Bangla text in Noto Sans Bengali. To use one font for both, pick one from the Bangla group, e.g. Hind Siliguri or Anek Bangla.</li>
          <li>The new font shows on the website the next time a page is opened.</li>
        </ul>
      </Card>
    </div>
  );
};
