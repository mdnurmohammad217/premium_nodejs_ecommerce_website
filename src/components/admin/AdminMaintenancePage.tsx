import React, { useEffect, useRef, useState } from 'react';
import { Construction, Save, Eye, Power, Monitor, Smartphone } from 'lucide-react';
import { PageHeader, Card, Button, Field, Toggle, ConfirmDialog, useToasts, ACCENTS } from './ui.tsx';

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : '');

const DEFAULTS = {
  enabled: false,
  badge: 'Maintenance in progress',
  title: 'We are upgrading our website',
  message: 'Our website is getting better for you. We will be back very soon — thank you for your patience.',
  progress: 40,
  autoProgress: false,
  startAt: '',
  endAt: '',
  showProgress: true,
  progressLabel: 'Work completed',
  showCountdown: true,
  steps: [] as string[],
  contactText: 'Need medicine urgently? We are still taking orders by phone.',
  phone: '',
  whatsapp: '',
  facebook: '',
};

/**
 * System Configuration → Maintenance Mode. While ON, website visitors see a
 * branded "back soon" page (your logo, progress, countdown, contact buttons);
 * the dashboard, POS and your own preview keep working.
 */
export const AdminMaintenancePage: React.FC<{
  settings: any;
  onSaveSettings: (s: any) => Promise<void> | void;
  /** Shown inside System Configuration: no page title, actions in a slim bar */
  embedded?: boolean;
}> = ({ settings, onSaveSettings, embedded }) => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<any>({ ...DEFAULTS, ...(settings?.maintenance_config || {}) });
  const [stepsText, setStepsText] = useState<string>((settings?.maintenance_config?.steps || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const timer = useRef<number | undefined>(undefined);

  const current = { ...cfg, steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean) };

  // Live preview, rendered by the server exactly as visitors will see it
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch('/api/admin/maintenance/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ...current, enabled: true } }),
      })
        .then((res) => res.text())
        .then(setPreviewHtml)
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(current)]);

  const persist = async (next: any, message: string) => {
    setSaving(true);
    try {
      await onSaveSettings({ ...settings, maintenance_config: next });
      setCfg(next);
      toasts.push(message);
    } catch {
      /* the shell already showed the error */
    } finally {
      setSaving(false);
    }
  };

  const previewSite = async () => {
    await fetch('/api/admin/maintenance/preview', { method: 'POST' }).catch(() => undefined);
    window.open('/', '_blank', 'noopener');
  };

  const on = Boolean(cfg.enabled);

  return (
    <div className="space-y-4">
      {toasts.node}
      {embedded ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
            Close the website for visitors while you work on it. You and your staff keep using the dashboard.
          </p>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button icon={Eye} onClick={previewSite}>
              Open real site (only you)
            </Button>
            <Button variant="primary" icon={Save} loading={saving} onClick={() => persist(current, 'Maintenance page saved.')}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <PageHeader
          title="Maintenance Mode"
          subtitle="Close the website for visitors while you work on it. You and your staff keep using the dashboard."
          icon={Construction}
          accent={ACCENTS.amber}
          actions={
            <>
              <Button icon={Eye} onClick={previewSite}>
                Open real site (only you)
              </Button>
              <Button variant="primary" icon={Save} loading={saving} onClick={() => persist(current, 'Maintenance page saved.')}>
                Save
              </Button>
            </>
          }
        />
      )}

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 inline-flex items-center justify-center"
              style={{
                borderRadius: 'var(--ds-r-full)',
                background: on ? 'var(--ds-warning-soft)' : 'var(--ds-success-soft)',
                color: on ? 'var(--ds-warning-text)' : 'var(--ds-success-text)',
              }}
            >
              <Power className="w-5 h-5" />
            </span>
            <div>
              <div className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                {on ? 'Website is CLOSED for maintenance' : 'Website is LIVE'}
              </div>
              <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                {on
                  ? 'Visitors see the maintenance page. Orders from the website are paused.'
                  : 'Turn maintenance on before a big update, then off when you are done.'}
              </div>
            </div>
          </div>
          <Button
            variant={on ? 'success' : 'danger'}
            icon={Power}
            loading={saving}
            onClick={() => (on ? persist({ ...current, enabled: false }, 'Website is live again.') : setConfirmOn(true))}
          >
            {on ? 'Turn OFF — go live' : 'Turn ON maintenance'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 items-start">
        <Card>
          <div className="space-y-4">
            <Field label="Small label">
              <input className="a-field" value={cfg.badge} onChange={(e) => setCfg({ ...cfg, badge: e.target.value })} />
            </Field>
            <Field label="Heading">
              <input className="a-field" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
            </Field>
            <Field label="Message">
              <textarea className="a-field" rows={3} value={cfg.message} onChange={(e) => setCfg({ ...cfg, message: e.target.value })} />
            </Field>

            <div className="p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
              <Toggle checked={cfg.showProgress !== false} onChange={(value) => setCfg({ ...cfg, showProgress: value })} label="Show progress bar" />
              {cfg.showProgress !== false && (
                <>
                  <Toggle
                    checked={Boolean(cfg.autoProgress)}
                    onChange={(value) => setCfg({ ...cfg, autoProgress: value })}
                    label="Move the progress by itself"
                    description="Fills from the start time to the finish time. Off: you set the % yourself."
                  />
                  {!cfg.autoProgress && (
                    <Field label={`Work completed: ${cfg.progress}%`}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={cfg.progress}
                        onChange={(e) => setCfg({ ...cfg, progress: Number(e.target.value) })}
                        className="w-full"
                        style={{ accentColor: 'var(--primary)' }}
                      />
                    </Field>
                  )}
                  <Field label="Progress label">
                    <input className="a-field" value={cfg.progressLabel} onChange={(e) => setCfg({ ...cfg, progressLabel: e.target.value })} />
                  </Field>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Started">
                <input
                  type="datetime-local"
                  className="a-field ds-num"
                  value={toLocalInput(cfg.startAt)}
                  onChange={(e) => setCfg({ ...cfg, startAt: fromLocalInput(e.target.value) })}
                />
              </Field>
              <Field label="Back online at">
                <input
                  type="datetime-local"
                  className="a-field ds-num"
                  value={toLocalInput(cfg.endAt)}
                  onChange={(e) => setCfg({ ...cfg, endAt: fromLocalInput(e.target.value) })}
                />
              </Field>
            </div>
            <Toggle
              checked={cfg.showCountdown !== false}
              onChange={(value) => setCfg({ ...cfg, showCountdown: value })}
              label="Show a countdown"
              description="Counts down to 'Back online at'. The page reloads itself when the site opens."
            />

            <Field label="Checklist (one step per line)" hint="Steps tick themselves off as the progress grows.">
              <textarea
                className="a-field"
                rows={4}
                value={stepsText}
                placeholder={'Backing up data\nNew design\nTesting\nGoing live'}
                onChange={(e) => setStepsText(e.target.value)}
              />
            </Field>

            <Field label="Text above the contact buttons">
              <input className="a-field" value={cfg.contactText} onChange={(e) => setCfg({ ...cfg, contactText: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Phone" hint="Default: store phone">
                <input className="a-field ds-num" value={cfg.phone} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp" hint="Default: chat widget">
                <input className="a-field ds-num" value={cfg.whatsapp} onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.value })} />
              </Field>
              <Field label="Facebook page">
                <input className="a-field" value={cfg.facebook} onChange={(e) => setCfg({ ...cfg, facebook: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        <div className="xl:sticky xl:top-20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              Preview
            </span>
            <div className="inline-flex p-1 gap-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}>
              {(
                [
                  ['desktop', Monitor],
                  ['mobile', Smartphone],
                ] as const
              ).map(([id, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`${id} preview`}
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                  className="w-8 h-7 inline-flex items-center justify-center cursor-pointer"
                  style={{ borderRadius: 'var(--ds-r-sm)', background: device === id ? 'var(--a-surface)' : 'transparent' }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div
            className="mx-auto overflow-hidden"
            style={{
              width: device === 'mobile' ? 390 : '100%',
              maxWidth: '100%',
              height: 640,
              borderRadius: 'var(--ds-r-lg)',
              border: '1px solid var(--a-border)',
              boxShadow: 'var(--ds-shadow-md)',
              background: '#fff',
            }}
          >
            <iframe title="Maintenance page preview" srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-scripts" />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOn}
        title="Close the website for maintenance?"
        message="Visitors will see the maintenance page and website orders are paused until you turn it off. The dashboard and POS keep working."
        confirmLabel="Turn ON"
        tone="danger"
        busy={saving}
        onConfirm={async () => {
          await persist({ ...current, enabled: true, startAt: current.startAt || new Date().toISOString() }, 'Maintenance mode is ON.');
          setConfirmOn(false);
        }}
        onCancel={() => setConfirmOn(false)}
      />
    </div>
  );
};
