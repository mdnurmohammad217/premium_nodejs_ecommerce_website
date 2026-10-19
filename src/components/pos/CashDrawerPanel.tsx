import React, { useCallback, useEffect, useState } from 'react';
import { Vault, Printer, Cable, Usb, Power, PlugZap, CheckCircle2, AlertTriangle, History, Info, ChevronDown } from 'lucide-react';
import { Button, Modal, Toggle, Select, Field, tint } from '../admin/ui.tsx';
import {
  DrawerMode,
  DrawerSettings,
  connectDrawer,
  drawerDeviceReady,
  drawerSupport,
  noSaleSlipHtml,
  openDrawer,
  printSlip,
} from '../../lib/cashDrawer.ts';

const fs = (size: string): React.CSSProperties => ({ fontSize: `var(--ds-fs-${size})` });

const REASONS = ['Give change', 'Cash in', 'Cash out', 'Count cash', 'Other'];

const MODES: Array<{ id: DrawerMode; title: string; text: string; icon: React.ComponentType<{ className?: string }>; badge?: string }> = [
  {
    id: 'printer',
    title: 'Through the receipt printer',
    text: 'Drawer cable goes into the printer. The drawer opens whenever the receipt prints.',
    icon: Printer,
    badge: 'Recommended',
  },
  {
    id: 'serial',
    title: 'COM port (serial / USB-serial)',
    text: 'Opens instantly without printing. Chrome or Edge on a computer.',
    icon: Cable,
  },
  {
    id: 'usb',
    title: 'USB printer, direct',
    text: 'For printers set up with the WinUSB driver. Advanced.',
    icon: Usb,
  },
  { id: 'off', title: 'No cash drawer', text: 'This computer has no drawer.', icon: Power },
];

const KIND_LABEL: Record<string, string> = { sale: 'Sale', manual: 'No sale', test: 'Test' };

interface Props {
  open: boolean;
  onClose: () => void;
  settings: DrawerSettings;
  onChange: (next: DrawerSettings) => void;
  storeName: string;
  cashier: string;
  paper: 'mm58' | 'mm80';
  currency: string;
  /** opens straight on the setup part (first use) */
  startInSetup?: boolean;
}

/**
 * The POS cash drawer: open it without a sale (with a reason, logged), and
 * set up how this computer reaches the drawer.
 */
export const CashDrawerPanel: React.FC<Props> = ({ open, onClose, settings, onChange, storeName, cashier, paper, currency, startInSetup }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'open' | 'test' | 'connect'>('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<{ events: any[]; today: Record<string, number> }>({ events: [], today: {} });
  const support = drawerSupport();

  const loadLog = useCallback(() => {
    fetch('/api/pos/drawer-events?limit=12')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setLog({ events: data.events || [], today: data.today || {} }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setReason('');
    setNote('');
    setSetupOpen(Boolean(startInSetup) || settings.mode === 'off');
    loadLog();
  }, [open, startInSetup, loadLog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    drawerDeviceReady(settings).then(setReady);
  }, [open, settings]);

  const log$ = (kind: 'manual' | 'test', ok: boolean, why: string) =>
    fetch('/api/pos/drawer-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, ok, reason: why, device: settings.mode }),
    })
      .then(loadLog)
      .catch(() => undefined);

  const run = async (kind: 'manual' | 'test') => {
    const why = kind === 'test' ? 'Test' : [reason, note.trim()].filter(Boolean).join(' — ');
    if (kind === 'manual' && settings.askReason && !why) {
      setMessage({ ok: false, text: 'Choose why the drawer is being opened.' });
      return;
    }
    setBusy(kind === 'test' ? 'test' : 'open');
    const result = await openDrawer(settings, {
      interactive: true,
      print: () => printSlip(noSaleSlipHtml({ storeName, cashier, reason: kind === 'test' ? 'Drawer test' : why }), paper),
    });
    setBusy('');
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) setReady(true);
    void log$(kind, result.ok, why);
    if (result.ok && kind === 'manual') window.setTimeout(onClose, 900);
  };

  const connect = async () => {
    setBusy('connect');
    const result = await connectDrawer(settings);
    setBusy('');
    setReady(result.ok);
    setMessage({ ok: result.ok, text: result.message });
  };

  const patch = (changes: Partial<DrawerSettings>) => {
    setMessage(null);
    onChange({ ...settings, ...changes });
  };

  const modeInfo = MODES.find((mode) => mode.id === settings.mode) || MODES[3];
  const unsupported = (settings.mode === 'serial' && !support.serial) || (settings.mode === 'usb' && !support.usb);

  return (
    <Modal open={open} onClose={onClose} title="Cash drawer" subtitle="Open the drawer without a sale, or set it up on this computer" width="max-w-xl">
      <div className="space-y-5">
        {/* Current state */}
        <div
          className="flex items-center gap-3 p-3"
          style={{
            borderRadius: 'var(--ds-r-lg)',
            background: settings.mode === 'off' ? 'var(--ds-surface-3)' : tint(0.08),
            border: `1px solid ${settings.mode === 'off' ? 'var(--ds-border)' : tint(0.2)}`,
          }}
        >
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: settings.mode === 'off' ? 'var(--ds-surface)' : 'var(--primary)', color: settings.mode === 'off' ? 'var(--ds-text-muted)' : '#fff' }}
          >
            <Vault className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold" style={fs('md')}>
              {settings.mode === 'off' ? 'Not set up on this computer' : modeInfo.title}
            </div>
            <div style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>
              {settings.mode === 'off'
                ? 'Choose how the drawer is connected below.'
                : `${settings.autoOpen ? `Opens by itself after ${settings.openForAll ? 'every sale' : 'cash sales'}` : 'Opens only from this button'}${
                    settings.mode === 'serial' || settings.mode === 'usb' ? (ready ? ' · device connected' : ' · not connected yet') : ''
                  }`}
            </div>
          </div>
          <div className="text-right shrink-0 ds-num" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
            Today
            <div className="font-bold" style={{ ...fs('md'), color: 'var(--ds-text)' }}>
              {(log.today.sale || 0) + (log.today.manual || 0)}
            </div>
            opens
          </div>
        </div>

        {/* Open without a sale */}
        {settings.mode !== 'off' && (
          <section className="space-y-3">
            <div className="font-semibold" style={fs('md')}>
              Open without a sale
            </div>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setReason(item === reason ? '' : item)}
                  aria-pressed={reason === item}
                  className="px-3 font-semibold cursor-pointer"
                  style={{
                    height: 34,
                    borderRadius: 999,
                    ...fs('sm'),
                    background: reason === item ? 'var(--primary)' : 'var(--ds-surface-2)',
                    color: reason === item ? '#fff' : 'var(--ds-text-soft)',
                    border: `1px solid ${reason === item ? 'var(--primary)' : 'var(--ds-border)'}`,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <input className="ds-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" maxLength={120} />
            <Button variant="primary" size="lg" block icon={Vault} loading={busy === 'open'} disabled={unsupported} onClick={() => run('manual')}>
              Open drawer
            </Button>
          </section>
        )}

        {message && (
          <div
            role="status"
            className="flex items-start gap-2 p-3"
            style={{
              borderRadius: 'var(--ds-r-md)',
              ...fs('sm'),
              background: message.ok ? 'var(--ds-success-soft)' : 'var(--ds-danger-soft)',
              color: message.ok ? 'var(--ds-success-text)' : 'var(--ds-danger-text)',
            }}
          >
            {message.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Setup */}
        <section style={{ borderTop: '1px solid var(--ds-border)', paddingTop: 'var(--ds-s-4)' }}>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 font-semibold cursor-pointer"
            style={fs('md')}
            onClick={() => setSetupOpen(!setupOpen)}
            aria-expanded={setupOpen}
          >
            <span>Setup on this computer</span>
            <ChevronDown className="w-4 h-4" style={{ transform: setupOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
          </button>

          {setupOpen && (
            <div className="space-y-4 mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODES.map(({ id, title, text, icon: Icon, badge }) => {
                  const active = settings.mode === id;
                  const disabled = (id === 'serial' && !support.serial) || (id === 'usb' && !support.usb);
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => patch({ mode: id })}
                      className="text-left p-3 flex items-start gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        borderRadius: 'var(--ds-r-md)',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--ds-border)'}`,
                        background: active ? tint(0.07) : 'var(--ds-surface)',
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 font-semibold" style={fs('sm')}>
                          {title}
                          {badge && (
                            <span className="px-1.5 rounded-full" style={{ ...fs('2xs'), background: 'var(--ds-success-soft)', color: 'var(--ds-success-text)' }}>
                              {badge}
                            </span>
                          )}
                        </span>
                        <span className="block" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
                          {disabled ? 'Not available in this browser — use Chrome or Edge on a computer.' : text}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {(settings.mode === 'serial' || settings.mode === 'usb') && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <Field label="Drawer pin">
                    <Select
                      value={String(settings.pin)}
                      onChange={(value) => patch({ pin: value === '5' ? 5 : 2 })}
                      options={[
                        { value: '2', label: 'Pin 2 (most drawers)' },
                        { value: '5', label: 'Pin 5' },
                      ]}
                    />
                  </Field>
                  {settings.mode === 'serial' ? (
                    <Field label="Speed (baud)">
                      <Select
                        value={String(settings.baudRate)}
                        onChange={(value) => patch({ baudRate: Number(value) })}
                        options={['9600', '19200', '38400', '57600', '115200'].map((value) => ({ value, label: value }))}
                      />
                    </Field>
                  ) : (
                    <div />
                  )}
                  <Button icon={PlugZap} loading={busy === 'connect'} onClick={connect}>
                    {ready ? 'Reconnect' : 'Connect'}
                  </Button>
                </div>
              )}

              {settings.mode !== 'off' && (
                <div className="space-y-3">
                  <Toggle
                    checked={settings.autoOpen}
                    onChange={(value) => patch({ autoOpen: value })}
                    label="Open automatically after a sale"
                    description={
                      settings.mode === 'printer'
                        ? 'After the sale the receipt prints by itself, and the printer opens the drawer.'
                        : 'The drawer opens the moment the sale is saved.'
                    }
                  />
                  {settings.autoOpen && (
                    <Toggle
                      checked={settings.openForAll}
                      onChange={(value) => patch({ openForAll: value })}
                      label="Also for bKash, Nagad and card sales"
                      description="Off: only cash sales open the drawer."
                    />
                  )}
                  <Toggle
                    checked={settings.autoPrint}
                    onChange={(value) => patch({ autoPrint: value })}
                    label="Print the receipt automatically after every sale"
                  />
                  <Toggle
                    checked={settings.askReason}
                    onChange={(value) => patch({ askReason: value })}
                    label="Ask for a reason when opening without a sale"
                    description="Every opening is recorded with the cashier's name."
                  />
                  <Button icon={Vault} loading={busy === 'test'} disabled={unsupported} onClick={() => run('test')}>
                    Test — open the drawer now
                  </Button>
                </div>
              )}

              <div className="p-3 space-y-1.5" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-info-soft)', color: 'var(--ds-info-text)', ...fs('xs') }}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <Info className="w-3.5 h-3.5" /> How to set up
                </div>
                {settings.mode === 'serial' ? (
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Plug the drawer cable (RJ11) into the printer's DK / Cash Drawer socket.</li>
                    <li>The printer must appear as a COM port (serial printers, or USB printers with a "virtual COM" driver).</li>
                    <li>Click Connect, pick the port, then Test. Nothing prints — the drawer just opens.</li>
                    <li>Wrong port or nothing happens? Try Pin 5, or a different speed (the printer's self-test page lists it).</li>
                  </ol>
                ) : settings.mode === 'usb' ? (
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Only for printers that are NOT installed with the Windows printer driver (they need the WinUSB driver, e.g. via Zadig).</li>
                    <li>Click Connect and pick the printer, then Test.</li>
                    <li>If Windows prints to this printer normally, use "Through the receipt printer" instead.</li>
                  </ol>
                ) : (
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Plug the drawer cable (RJ11) into the printer's DK / Cash Drawer socket.</li>
                    <li>
                      Windows: Control Panel → Devices and Printers → right-click the receipt printer → Printing Preferences (or
                      Printer Properties → Device Settings) → set <b>Cash Drawer</b> to <b>Open before printing</b> (Xprinter, Rongta,
                      Epson and most others have it).
                    </li>
                    <li>Choose this option, then Test: a small “NO SALE” slip prints and the drawer opens.</li>
                    <li>
                      For no print pop-up, start Chrome with <code>--kiosk-printing</code> (add it to the Chrome shortcut) and set the
                      receipt printer as the default printer.
                    </li>
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Recent */}
        {log.events.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold" style={fs('sm')}>
              <History className="w-4 h-4" /> Recent openings
            </div>
            <div className="divide-y" style={{ border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-r-md)' }}>
              {log.events.slice(0, 8).map((event: any) => (
                <div key={event.id} className="flex items-center justify-between gap-3 px-3 py-2" style={{ ...fs('xs'), borderColor: 'var(--ds-border)' }}>
                  <div className="min-w-0">
                    <span className="font-semibold">{KIND_LABEL[event.kind] || event.kind}</span>
                    {event.orderNumber ? ` · ${event.orderNumber}` : ''}
                    {event.reason ? ` · ${event.reason}` : ''}
                    {Number(event.ok) === 0 && <span style={{ color: 'var(--ds-danger-text)' }}> · failed</span>}
                    <div style={{ color: 'var(--ds-text-muted)' }}>{event.cashier || '—'}</div>
                  </div>
                  <div className="text-right shrink-0 ds-num" style={{ color: 'var(--ds-text-muted)' }}>
                    {event.amount != null && event.kind === 'sale' ? (
                      <div style={{ color: 'var(--ds-text)' }}>
                        {currency}
                        {Number(event.amount).toLocaleString('en-US')}
                      </div>
                    ) : null}
                    {new Date(event.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};
