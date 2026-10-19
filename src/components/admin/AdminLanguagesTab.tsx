import React, { useEffect, useMemo, useState } from 'react';
import { Languages, Save, Check, ArrowUp, ArrowDown, Globe } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, IconButton, mix } from './ui.tsx';
import { LANGUAGES, LANGUAGE_ORDER, languageConfigOf, type LangCode, type ResolvedLanguageConfig } from '../../lib/i18n.tsx';
import { SiteSettings } from '../../types/index.ts';

/**
 * v3.13 — Dashboard → Website → Languages.
 * Which languages visitors may choose, which one a new visitor sees, and
 * where the language button sits. Product names and the texts you type stay
 * as written; the shop's own buttons, labels and messages are translated.
 */
export const AdminLanguagesTab: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const stored = useMemo(
    () => languageConfigOf(settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify((settings as any)?.language_config)]
  );
  const savedEnabled = (settings as any)?.language_config?.enabled !== false;
  const [cfg, setCfg] = useState<ResolvedLanguageConfig>({ ...stored, enabled: savedEnabled });
  // All five languages in the owner's order; ticked ones are offered
  const [order, setOrder] = useState<LangCode[]>(() => [...stored.languages, ...LANGUAGE_ORDER.filter((code) => !stored.languages.includes(code))]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCfg({ ...stored, enabled: savedEnabled });
    setOrder([...stored.languages, ...LANGUAGE_ORDER.filter((code) => !stored.languages.includes(code))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const touch = () => {
    setSaved(false);
    setError('');
  };
  const offered = order.filter((code) => cfg.languages.includes(code));
  const toggle = (code: LangCode, on: boolean) => {
    touch();
    if (!on && code === cfg.defaultLanguage) return;
    setCfg({ ...cfg, languages: on ? [...cfg.languages, code] : cfg.languages.filter((item) => item !== code) });
  };
  const move = (index: number, delta: number) => {
    touch();
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({
        ...settings,
        language_config: {
          enabled: cfg.enabled,
          languages: offered,
          defaultLanguage: cfg.defaultLanguage,
          showInHeader: cfg.showInHeader,
          showInDrawer: cfg.showInDrawer,
          showInFooter: cfg.showInFooter,
        },
      } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Languages}
        title="Website languages"
        subtitle="Visitors can switch the website between these languages. Buttons, headings, labels and messages change; product names, descriptions and your own texts stay as you wrote them. The dashboard and POS stay in English."
        actions={
          <div className="flex items-center gap-3">
            {error && (
              <span role="alert" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
                {error}
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}>
                <Check className="w-4 h-4" /> Saved
              </span>
            )}
            <Button variant="primary" icon={Save} loading={saving} onClick={save}>
              Save Languages
            </Button>
          </div>
        }
      />

      <Toggle
        checked={cfg.enabled}
        onChange={(value) => {
          touch();
          setCfg({ ...cfg, enabled: value });
        }}
        label="Show the language switcher"
        description="Off = the whole website stays in the default language below."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] mt-5">
        <div>
          <div className="font-bold mb-2" style={{ fontSize: 'var(--a-fs-md)' }}>
            Languages offered
          </div>
          <div className="space-y-2">
            {order.map((code, index) => {
              const info = LANGUAGES[code];
              const on = cfg.languages.includes(code);
              const isDefault = cfg.defaultLanguage === code;
              return (
                <div
                  key={code}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{ borderRadius: 'var(--ds-r-md)', border: `1px solid ${on ? mix('var(--primary)', 0.45) : 'var(--a-border)'}`, background: on ? mix('var(--primary)', 0.04) : 'var(--a-surface)' }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={isDefault}
                    onChange={(e) => toggle(code, e.target.checked)}
                    aria-label={`Offer ${info.name}`}
                    className="w-4 h-4"
                  />
                  <span
                    className="w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center font-bold"
                    style={{ background: mix('var(--primary)', 0.12), color: 'var(--primary-ink, var(--primary))', fontSize: 14 }}
                  >
                    {info.mark}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {info.native}
                    </span>
                    <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {info.name}
                      {info.dir === 'rtl' ? ' · written right to left' : ''}
                    </span>
                  </span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    <input
                      type="radio"
                      name="default-language"
                      checked={isDefault}
                      onChange={() => {
                        touch();
                        setCfg({ ...cfg, defaultLanguage: code, languages: cfg.languages.includes(code) ? cfg.languages : [...cfg.languages, code] });
                      }}
                    />
                    Default
                  </label>
                  <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
                  <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === order.length - 1} onClick={() => move(index, 1)} />
                </div>
              );
            })}
          </div>
          <p className="mt-2" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
            The default language is what a new visitor sees. A visitor's own choice is remembered on their device.
          </p>
        </div>

        <div className="space-y-4">
          <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
            Where the button appears
          </div>
          <Toggle checked={cfg.showInHeader} onChange={(value) => { touch(); setCfg({ ...cfg, showInHeader: value }); }} label="Header" description="Tablets and computers, beside the cart" />
          <Toggle checked={cfg.showInDrawer} onChange={(value) => { touch(); setCfg({ ...cfg, showInDrawer: value }); }} label="Phone side menu" description="At the top of the menu (☰) — where phone visitors look" />
          <Toggle checked={cfg.showInFooter} onChange={(value) => { touch(); setCfg({ ...cfg, showInFooter: value }); }} label="Footer" description="Bottom of every page, on every device" />
          <Field label="Share a page in one language" hint="Add ?lang=bn (or hi, ar, fr, en) to any website link, e.g. for a Bangla Facebook ad.">
            <div className="a-field ds-num inline-flex items-center gap-2" style={{ background: 'var(--a-surface-2)' }}>
              <Globe className="w-4 h-4" style={{ color: 'var(--a-text-muted)' }} />
              <span className="truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/?lang=bn</span>
            </div>
          </Field>
        </div>
      </div>
    </Card>
  );
};
