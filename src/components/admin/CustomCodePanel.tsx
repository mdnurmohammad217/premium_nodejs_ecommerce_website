import React, { useEffect, useState } from 'react';
import { Code2, Paintbrush, FileCode2, PanelTop, PanelBottom, Braces, Save, Check, Info, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, SectionLoader, ErrorState, mix } from './ui.tsx';

interface CustomCode {
  cssEnabled: boolean;
  css: string;
  jsEnabled: boolean;
  js: string;
  headEnabled: boolean;
  head: string;
  bodyEnabled: boolean;
  body: string;
  footerEnabled: boolean;
  footer: string;
}

const EMPTY: CustomCode = {
  cssEnabled: false,
  css: '',
  jsEnabled: false,
  js: '',
  headEnabled: false,
  head: '',
  bodyEnabled: false,
  body: '',
  footerEnabled: false,
  footer: '',
};

type BlockKey = 'css' | 'js' | 'head' | 'body' | 'footer';

const BLOCKS: Array<{
  key: BlockKey;
  title: string;
  where: string;
  placeholder: string;
  icon: typeof Code2;
  accent: string;
}> = [
  {
    key: 'head',
    title: 'Head Snippet',
    where: 'Inserted inside <head> — Google Search Console / Facebook domain verification, analytics, fonts.',
    placeholder: '<script>...</script>\n<meta name="google-site-verification" content="..." />',
    icon: PanelTop,
    accent: 'var(--ds-indigo)',
  },
  {
    key: 'body',
    title: 'Body Snippet',
    where: 'Inserted right after <body> — e.g. the Google Tag Manager <noscript> part.',
    placeholder: '<noscript>...</noscript>',
    icon: FileCode2,
    accent: 'var(--ds-teal)',
  },
  {
    key: 'footer',
    title: 'Footer Snippet',
    where: 'Inserted just before </body> — chat widgets (Tawk.to, Messenger) and other scripts that load last.',
    placeholder: '<script src="https://..."></script>',
    icon: PanelBottom,
    accent: 'var(--ds-violet)',
  },
  {
    key: 'css',
    title: 'Custom CSS',
    where: 'Your own styles for the whole website. Write plain CSS — no <style> tag needed.',
    placeholder: '.product-card { border-radius: 16px; }\nheader { box-shadow: none; }',
    icon: Paintbrush,
    accent: 'var(--ds-rose)',
  },
  {
    key: 'js',
    title: 'Custom JavaScript',
    where: 'Runs on every website page after it loads. Write plain JavaScript — no <script> tag needed.',
    placeholder: "document.addEventListener('DOMContentLoaded', function () {\n  console.log('Hello from my shop');\n});",
    icon: Braces,
    accent: 'var(--ds-amber)',
  },
];

/**
 * System Configuration → Custom Code: CSS, JavaScript and HTML snippets for
 * the website, each with its own on/off switch. The server writes them into
 * every website page (so crawlers and verification tools see them); the
 * dashboard and the POS never load them.
 */
export const CustomCodePanel: React.FC = () => {
  const [code, setCode] = useState<CustomCode>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetch('/api/admin/custom-code')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setCode({ ...EMPTY, ...(data || {}) }))
      .catch(() => setError('Could not load the custom code.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const patch = (changes: Partial<CustomCode>) => {
    setSaved(false);
    setCode((current) => ({ ...current, ...changes }));
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/custom-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(code),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Card>
        <SectionLoader lines={6} />
      </Card>
    );
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <Card accent="var(--ds-indigo)">
        <CardHeader
          title="Custom Code"
          subtitle="Add your own CSS, JavaScript and HTML snippets to the website — each block can be switched on or off."
          icon={Code2}
          accent="var(--ds-indigo)"
          actions={
            <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
              {saved ? 'Saved' : 'Save Code'}
            </Button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ fontSize: 'var(--a-fs-base)' }}>
          <div className="p-3 flex items-start gap-2" style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-info)', 0.08) }}>
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--ds-info)' }} />
            <span>
              The code is written into the page by the server, so verification tags and pixels are seen by Google and Facebook. It runs on
              the website and landing pages only — never in the dashboard or the POS, so a mistake can never lock you out.
            </span>
          </div>
          <div className="p-3 flex items-start gap-2" style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-warning)', 0.1) }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--ds-warning-text)' }} />
            <span>
              <strong>PHP:</strong> this website runs on Node.js, so PHP code cannot run here. Anything a PHP snippet would do on a page can be
              written in the JavaScript block instead. Only add code from sources you trust.
            </span>
          </div>
        </div>
      </Card>

      {BLOCKS.map(({ key, title, where, placeholder, icon, accent }) => {
        const enabledKey = `${key}Enabled` as keyof CustomCode;
        const value = String(code[key] || '');
        const lines = value ? value.split('\n').length : 0;
        return (
          <Card key={key} accent={accent}>
            <CardHeader
              title={title}
              subtitle={where}
              icon={icon}
              accent={accent}
              actions={<Toggle checked={Boolean(code[enabledKey])} onChange={(next) => patch({ [enabledKey]: next } as any)} label={`${title} on`} />}
            />
            <textarea
              value={value}
              onChange={(event) => patch({ [key]: event.target.value } as any)}
              spellCheck={false}
              placeholder={placeholder}
              rows={8}
              className="a-field w-full"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.55,
                minHeight: 170,
                resize: 'vertical',
                opacity: code[enabledKey] ? 1 : 0.7,
              }}
            />
            <div className="mt-1.5 flex justify-between" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              <span>{code[enabledKey] ? 'On — added to every website page' : 'Off — saved but not added to the website'}</span>
              <span className="ds-num">
                {lines} line{lines === 1 ? '' : 's'}
              </span>
            </div>
          </Card>
        );
      })}

      {saveError && <p className="ds-error-text">{saveError}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save Code'}
        </Button>
      </div>
    </div>
  );
};
