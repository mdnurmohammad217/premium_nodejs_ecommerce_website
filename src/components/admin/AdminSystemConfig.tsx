import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { canOpenTab } from '../../lib/permissions.ts';
import {
  Database,
  KeyRound,
  Truck,
  CreditCard,
  Lock,
  Target,
  Tag as TagIcon,
  Plus,
  Trash2,
  Pencil,
  Check,
  Copy,
  Save,
  Eye,
  EyeOff,
  Palette,
  MapPin,
  Wallet,
  Banknote,
  Webhook,
  Settings2,
  AlertCircle,
  RefreshCw,
  Construction,
  Mail,
  FileText,
} from 'lucide-react';
import {
  SiteSettings,
  PaymentMethodConfig,
  ShippingZoneConfig,
  CourierConfig,
} from '../../types/index.ts';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  IconButton,
  TabStrip,
  Toggle,
  Field,
  Select,
  Badge,
  EmptyState,
  TableWrap,
  Money,
  mix,
} from './ui.tsx';
import { AdminMaintenancePage } from './AdminMaintenancePage.tsx';
import { AdminEmailSettings } from './AdminEmailSettings.tsx';
import { AdminDatabaseHealth } from './AdminDatabaseHealth.tsx';
import { GeoShippingCard } from './GeoShippingCard.tsx';
import { OrderNumberingCard } from './OrderNumberingCard.tsx';
import { CustomCodePanel } from './CustomCodePanel.tsx';
import { Hash, Code2, Type } from 'lucide-react';
import { FreeShippingCard } from './FreeShippingCard.tsx';
import { PaymentGatewaysCard } from './PaymentGatewaysCard.tsx';
import { CacheStatusCard } from './CacheStatusCard.tsx';
import { MediaStorageCard } from './MediaStorageCard.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { InvoiceSettingsPanel } from './InvoiceSettingsPanel.tsx';
import { SocialLoginPanel } from './SocialLoginPanel.tsx';
import { FontsPanel } from './FontsPanel.tsx';

export type ConfigSection =
  | 'shipping'
  | 'payments'
  | 'integrations'
  | 'pixel'
  | 'tags'
  | 'social'
  | 'theme'
  | 'fonts'
  | 'maintenance'
  | 'email'
  | 'invoice'
  | 'orders'
  | 'code'
  | 'demo';

interface AdminSystemConfigProps {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
  initialSection?: ConfigSection;
  /** The Theme & Styling editor, rendered as one more section of this page */
  themePanel?: React.ReactNode;
  /** Open another dashboard page (e.g. SMS settings from the Email section) */
  onOpenTab?: (tab: string) => void;
  /** Keeps the address bar in step when a section is picked here */
  onSectionChange?: (section: ConfigSection) => void;
}

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const ALL_SECTIONS: Array<{ id: ConfigSection; label: string; hint: string; icon: IconType; accent: string }> = [
  { id: 'shipping', label: 'Shipping', hint: 'Areas, charges, free delivery', icon: Truck, accent: 'var(--ds-teal)' },
  { id: 'payments', label: 'Payments', hint: 'COD, bKash, Nagad, SSLCommerz', icon: CreditCard, accent: 'var(--ds-violet)' },
  { id: 'integrations', label: 'Integrations', hint: 'Courier API and webhooks', icon: Lock, accent: 'var(--ds-indigo)' },
  { id: 'pixel', label: 'Pixel', hint: 'Meta Pixel and Conversions API', icon: Target, accent: 'var(--ds-info)' },
  { id: 'tags', label: 'Tags', hint: 'Google Tag Manager and GA4', icon: TagIcon, accent: 'var(--ds-amber)' },
  { id: 'social', label: 'Social Login', hint: 'Continue with Google / Facebook', icon: KeyRound, accent: 'var(--ds-indigo)' },
  { id: 'theme', label: 'Theme & Colors', hint: 'Shop colours', icon: Palette, accent: 'var(--ds-rose)' },
  { id: 'fonts', label: 'Fonts', hint: 'Website and dashboard typeface', icon: Type, accent: 'var(--ds-violet)' },
  { id: 'maintenance', label: 'Maintenance Mode', hint: 'Close the website while you work', icon: Construction, accent: 'var(--ds-amber)' },
  { id: 'orders', label: 'Orders', hint: 'Order numbers (ORD-01, ORD-02 …)', icon: Hash, accent: 'var(--ds-indigo)' },
  { id: 'invoice', label: 'Invoice & Receipt', hint: 'Logo, license no., notes, paper', icon: FileText, accent: 'var(--ds-indigo)' },
  { id: 'code', label: 'Custom Code', hint: 'CSS, JavaScript, head & body snippets', icon: Code2, accent: 'var(--ds-violet)' },
  { id: 'email', label: 'Email & Password Reset', hint: 'SMTP mail and reset codes', icon: Mail, accent: 'var(--ds-indigo)' },
  { id: 'demo', label: 'Database & Cache', hint: 'Health check, repair, speed cache', icon: Database, accent: 'var(--ds-teal)' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `item-${Date.now().toString().slice(-5)}`;

const muted: React.CSSProperties = { fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' };

/**
 * System Configuration — shipping locations, payment gateways, courier API
 * credentials, Meta Pixel and tag manager IDs.
 *
 * Courier credentials are secrets: the server keeps them out of the public
 * /api/settings response and only returns them to an authenticated admin.
 */
export const AdminSystemConfig: React.FC<AdminSystemConfigProps> = ({
  settings,
  onSaveSettings,
  initialSection = 'shipping',
  themePanel,
  onOpenTab,
  onSectionChange,
}) => {
  const { user } = useAuth();
  // Sections an account may not open (Custom Code is for administrators) are not listed
  const SECTIONS = useMemo(() => ALL_SECTIONS.filter((item) => canOpenTab(user, `cfg-${item.id}`)), [user]);
  const [section, setSectionState] = useState<ConfigSection>(initialSection);
  const setSection = (next: ConfigSection) => {
    setSectionState(next);
    onSectionChange?.(next);
  };
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState('');

  const [zones, setZones] = useState<ShippingZoneConfig[]>(
    (settings.shipping?.zones as ShippingZoneConfig[]) || []
  );
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(settings.payment?.methods || []);
  const [courier, setCourier] = useState<CourierConfig>(settings.courier_config || {});
  const [marketing, setMarketing] = useState<any>(settings.marketing || {});

  // The sidebar links straight to a section, and the page is not remounted
  // between those links, so the prop has to be followed after the first render.
  useEffect(() => {
    setSectionState(initialSection);
  }, [initialSection]);

  // Keep local state in sync when the parent reloads settings
  useEffect(() => {
    setZones((settings.shipping?.zones as ShippingZoneConfig[]) || []);
    setMethods(settings.payment?.methods || []);
    setCourier(settings.courier_config || {});
    setMarketing(settings.marketing || {});
  }, [settings]);

  const save = async (patch: Partial<SiteSettings>) => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, ...patch });
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(0), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const current = SECTIONS.find((item) => item.id === section) || SECTIONS[0];

  return (
    <div>
      <PageHeader
        title="System Configuration"
        subtitle="Shipping, payments, tracking, theme, maintenance mode, email and the database."
        icon={Settings2}
      />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 mb-4"
          style={{
            padding: 'var(--ds-s-3) var(--ds-s-4)',
            borderRadius: 'var(--ds-r-md)',
            background: 'var(--ds-danger-soft)',
            color: 'var(--ds-danger-text)',
            border: `1px solid ${mix('var(--ds-danger)', 0.22)}`,
            fontSize: 'var(--a-fs-md)',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Phones and tablets: one scrollable pill row */}
      <div className="lg:hidden mb-4">
        <TabStrip
          tabs={SECTIONS.map(({ id, label, icon }) => ({ id, label, icon }))}
          active={section}
          onChange={(id) => setSection(id as ConfigSection)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5 items-start">
        {/* Desktop: a vertical section list that stays in view while the form scrolls */}
        <nav
          className="a-card hidden lg:block sticky"
          style={{ top: 'calc(var(--a-header-h) + var(--ds-s-4))', padding: 'var(--ds-s-2)' }}
          aria-label="System configuration sections"
        >
          {SECTIONS.map(({ id, label, hint, icon: Icon, accent }) => {
            const isActive = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                data-active={isActive}
                className="a-nav-item"
                style={{ alignItems: 'flex-start', padding: 'var(--ds-s-2) var(--ds-s-3)' }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--ds-r-sm)',
                    background: mix(accent, isActive ? 0.16 : 0.1),
                    color: accent,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block">{label}</span>
                  <span className="block truncate" style={{ ...muted, fontWeight: 'var(--ds-fw-medium)' as any }}>
                    {hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 ds-fade-in" key={section}>
          {section === 'theme' &&
            (themePanel ? (
              <div className="space-y-5">{themePanel}</div>
            ) : (
              <Card>
                <EmptyState title="Theme editor not available" icon={current.icon} />
              </Card>
            ))}

          {section === 'demo' && (
            <div className="space-y-5">
              <AdminDatabaseHealth />
              <CacheStatusCard />
              <MediaStorageCard />
            </div>
          )}

          {section === 'maintenance' && <AdminMaintenancePage settings={settings} onSaveSettings={onSaveSettings} embedded />}

          {section === 'invoice' && (
            <InvoiceSettingsPanel settings={settings} onSave={(next) => save({ invoice_config: next })} />
          )}

          {section === 'email' && <AdminEmailSettings onOpenTab={onOpenTab} />}

          {section === 'orders' && <OrderNumberingCard />}

          {section === 'fonts' && <FontsPanel settings={settings} saving={saving} onSave={(fonts) => save({ font_config: fonts } as any)} />}
          {section === 'code' && <CustomCodePanel />}
          {section === 'social' && <SocialLoginPanel />}

          {section === 'shipping' && (
            <div className="space-y-5">
              <ShippingPanel
                zones={zones}
                setZones={setZones}
                onSave={(next) => save({ shipping: { ...(settings.shipping || {}), zones: next as any } })}
                saving={saving}
                savedAt={savedAt}
              />
              <FreeShippingCard
                config={settings.free_shipping_config}
                zones={zones}
                currency={settings.general?.currency || '৳'}
                onSave={async (next) => {
                  await onSaveSettings({ ...settings, free_shipping_config: next });
                }}
              />
              <GeoShippingCard
                config={(settings as any).checkout_geo_config}
                zones={zones}
                currency={settings.general?.currency || '৳'}
                onSave={async (next) => {
                  await onSaveSettings({ ...settings, checkout_geo_config: next } as any);
                }}
              />
            </div>
          )}

          {section === 'payments' && <div className="mb-5"><PaymentGatewaysCard /></div>}
          {section === 'payments' && (
            <PaymentsPanel
              methods={methods}
              setMethods={setMethods}
              onSave={(next) => save({ payment: { methods: next } })}
              saving={saving}
              savedAt={savedAt}
            />
          )}

          {section === 'integrations' && (
            <IntegrationsPanel
              courier={courier}
              setCourier={setCourier}
              onSave={(next) => save({ courier_config: next })}
              saving={saving}
              savedAt={savedAt}
            />
          )}

          {section === 'pixel' && (
            <PixelPanel
              marketing={marketing}
              setMarketing={setMarketing}
              onSave={(next) => save({ marketing: next })}
              saving={saving}
              savedAt={savedAt}
            />
          )}

          {section === 'tags' && (
            <TagsPanel
              marketing={marketing}
              setMarketing={setMarketing}
              onSave={(next) => save({ marketing: next })}
              saving={saving}
              savedAt={savedAt}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const SaveBar: React.FC<{ onClick: () => void; saving: boolean; savedAt: number; label?: string }> = ({
  onClick,
  saving,
  savedAt,
  label = 'Save Changes',
}) => (
  <div className="flex justify-end pt-4">
    <Button variant="primary" icon={savedAt ? Check : Save} onClick={onClick} loading={saving}>
      {savedAt ? 'Saved' : label}
    </Button>
  </div>
);

/** A text input that can mask its value — used for every credential on this page */
const TextInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  mono?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}> = ({ value, onChange, placeholder, secret, mono, type = 'text', inputMode }) => {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <input
        type={secret && !reveal ? 'password' : type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={secret ? 'new-password' : 'off'}
        onChange={(e) => onChange(e.target.value)}
        className={`a-field ${secret ? 'pr-10' : ''}`}
        style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}
      />
      {secret && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? 'Hide value' : 'Show value'}
          className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
          style={{
            right: 'var(--ds-s-1)',
            width: 'var(--ds-h-sm)',
            height: 'var(--ds-h-sm)',
            color: 'var(--a-text-muted)',
          }}
        >
          {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};

const CopyField: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          className="a-field flex-1 min-w-0"
          style={{ fontFamily: 'var(--font-mono)', background: 'var(--a-surface-2)', color: 'var(--a-text-soft)' }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          icon={copied ? Check : Copy}
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
    </Field>
  );
};

/** A bordered block inside a panel card — one gateway, one courier */
const SubBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={className}
    style={{
      border: '1px solid var(--a-border)',
      borderRadius: 'var(--ds-r-md)',
      padding: 'var(--ds-card-pad-sm)',
      background: 'var(--a-surface)',
    }}
  >
    {children}
  </div>
);

/* ---------------------------- Shipping ---------------------------- */

const ShippingPanel: React.FC<{
  zones: ShippingZoneConfig[];
  setZones: React.Dispatch<React.SetStateAction<ShippingZoneConfig[]>>;
  onSave: (zones: ShippingZoneConfig[]) => void;
  saving: boolean;
  savedAt: number;
}> = ({ zones, setZones, onSave, saving, savedAt }) => {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [eta, setEta] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const add = () => {
    if (!name.trim()) return;
    let id = slugify(name);
    // Two zones with the same slug would edit and delete each other
    if (zones.some((zone) => zone.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    const next = [...zones, { id, name: name.trim(), charge: Number(cost) || 0, eta: eta.trim(), enabled: true }];
    setZones(next);
    onSave(next);
    setName('');
    setCost('');
    setEta('');
  };

  const patch = (id: string, changes: Partial<ShippingZoneConfig>) =>
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...changes } : z)));

  const remove = (id: string) => {
    const next = zones.filter((z) => z.id !== id);
    setZones(next);
    onSave(next);
  };

  const activeCount = zones.filter((zone) => zone.enabled !== false).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Shipping Settings"
          subtitle="Manage shipping locations and delivery charges. The checkout page and the order API both read this list."
          icon={Truck}
          accent="var(--ds-teal)"
        />
        <form
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field label="Location Name" className="sm:col-span-5">
            <TextInput value={name} onChange={setName} placeholder="e.g. Inside Dhaka" />
          </Field>
          <Field label="Cost (Tk)" className="sm:col-span-3">
            <TextInput value={cost} onChange={setCost} placeholder="0" type="number" inputMode="decimal" />
          </Field>
          <Field label="ETA" className="sm:col-span-2">
            <TextInput value={eta} onChange={setEta} placeholder="1-2 days" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" icon={Plus} block disabled={!name.trim()}>
              Add
            </Button>
          </div>
        </form>
      </Card>

      <TableWrap>
        <div
          className="flex items-center justify-between gap-3 border-b"
          style={{ padding: 'var(--ds-s-3) var(--ds-td-x)', borderColor: 'var(--a-border)' }}
        >
          <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
            Delivery Areas
          </span>
          <span style={muted} className="ds-num">
            {activeCount} / {zones.length} active
          </span>
        </div>
        {zones.length === 0 ? (
          <EmptyState
            title="No shipping locations added yet."
            description="Add your first delivery area using the form above."
            icon={MapPin}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Cost</th>
                <th>ETA</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => {
                const isEditing = editingId === zone.id;
                return (
                  <tr key={zone.id}>
                    <td className="font-semibold" style={{ minWidth: 150 }}>
                      {isEditing ? (
                        <input
                          value={zone.name}
                          onChange={(e) => patch(zone.id, { name: e.target.value })}
                          className="a-field"
                        />
                      ) : (
                        zone.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={zone.charge}
                          onChange={(e) => patch(zone.id, { charge: Number(e.target.value) })}
                          className="a-field ds-num"
                          style={{ width: 110 }}
                        />
                      ) : (
                        <Money value={zone.charge} />
                      )}
                    </td>
                    <td style={{ color: 'var(--a-text-soft)' }}>
                      {isEditing ? (
                        <input
                          value={zone.eta || ''}
                          onChange={(e) => patch(zone.id, { eta: e.target.value })}
                          className="a-field"
                          style={{ width: 130 }}
                        />
                      ) : (
                        zone.eta || '—'
                      )}
                    </td>
                    <td>
                      <Toggle
                        checked={zone.enabled !== false}
                        label={zone.enabled !== false ? 'Active' : 'Inactive'}
                        onChange={(value) => patch(zone.id, { enabled: value })}
                      />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {isEditing ? (
                          <IconButton
                            icon={Check}
                            tone="success"
                            size="sm"
                            label="Done"
                            onClick={() => {
                              setEditingId(null);
                              onSave(zones);
                            }}
                          />
                        ) : (
                          <IconButton icon={Pencil} size="sm" label="Edit" onClick={() => setEditingId(zone.id)} />
                        )}
                        <IconButton
                          icon={Trash2}
                          tone="danger"
                          size="sm"
                          label="Delete"
                          onClick={() => remove(zone.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableWrap>

      <SaveBar onClick={() => onSave(zones)} saving={saving} savedAt={savedAt} />
    </div>
  );
};

/* ---------------------------- Payments ---------------------------- */

const ACCOUNT_TYPES = ['Personal', 'Merchant', 'Agent', 'Bank'].map((value) => ({ value, label: value }));

const PaymentsPanel: React.FC<{
  methods: PaymentMethodConfig[];
  setMethods: React.Dispatch<React.SetStateAction<PaymentMethodConfig[]>>;
  onSave: (methods: PaymentMethodConfig[]) => void;
  saving: boolean;
  savedAt: number;
}> = ({ methods, setMethods, onSave, saving, savedAt }) => {
  const cod = methods.find((m) => m.id === 'cod');
  const manual = methods.filter((m) => m.id !== 'cod');

  const patch = (id: string, changes: Partial<PaymentMethodConfig>) =>
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));

  const toggleCod = (enabled: boolean) => {
    if (cod) {
      patch('cod', { enabled });
    } else {
      setMethods((prev) => [
        ...prev,
        {
          id: 'cod',
          name: 'Cash on Delivery',
          description: 'Pay upon receipt',
          requiresTxId: false,
          enabled,
        },
      ]);
    }
  };

  const addGateway = () =>
    setMethods((prev) => [
      ...prev,
      {
        id: `gw-${Date.now().toString().slice(-6)}`,
        name: '',
        description: '',
        accountNumber: '',
        accountType: 'Personal',
        requiresTxId: true,
        enabled: true,
      },
    ]);

  const removeGateway = (id: string) => setMethods((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Payments Settings"
          subtitle="Cash on delivery plus any manual gateway — bKash, Nagad, Rocket, Upay, bank transfer or a custom option."
          icon={CreditCard}
          accent="var(--ds-violet)"
        />
        <SubBlock className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--ds-success-soft)',
                color: 'var(--ds-success-text)',
              }}
            >
              <Banknote className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Cash on Delivery
              </p>
              <p style={muted}>Pay upon receipt</p>
            </div>
          </div>
          <Toggle checked={cod?.enabled ?? false} onChange={toggleCod} label="Cash on Delivery" />
        </SubBlock>
        {cod?.enabled && (
          <SubBlock className="mt-3">
            <Field label="Cash on Delivery logo" hint="Optional — shown next to Cash on Delivery at checkout.">
              <MediaPicker
                value={cod.logoUrl || ''}
                onChange={(url) => patch('cod', { logoUrl: url })}
                modalTitle="Cash on Delivery — Logo"
                hideUrlInput
              />
            </Field>
          </SubBlock>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Manual payment (send money)"
          subtitle="Personal/agent numbers or a bank account where the customer sends money and types the Transaction ID. For automatic payments use the gateways above."
          icon={Wallet}
          accent="var(--ds-violet)"
          actions={
            <Button variant="soft" size="sm" icon={Plus} onClick={addGateway}>
              <span className="hidden sm:inline">Add Gateway</span>
            </Button>
          }
        />

        {manual.length === 0 ? (
          <EmptyState
            title="No manual gateway added yet."
            icon={Wallet}
            action={
              <Button variant="primary" icon={Plus} onClick={addGateway}>
                Add Gateway
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {manual.map((m) => (
              <SubBlock key={m.id} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {m.name || 'New Gateway'}
                    </span>
                    <Badge status={m.enabled ? 'active' : 'inactive'} dot />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle
                      checked={m.enabled}
                      onChange={(value) => patch(m.id, { enabled: value })}
                      label="Enabled"
                    />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      size="sm"
                      label="Remove"
                      onClick={() => removeGateway(m.id)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Gateway Name">
                    <TextInput value={m.name} onChange={(v) => patch(m.id, { name: v })} placeholder="e.g. bKash" />
                  </Field>
                  <Field label="Account Type">
                    <Select
                      value={m.accountType || 'Personal'}
                      onChange={(value) => patch(m.id, { accountType: value })}
                      options={ACCOUNT_TYPES}
                    />
                  </Field>
                  <Field label="Account Number">
                    <TextInput
                      value={m.accountNumber || ''}
                      onChange={(v) => patch(m.id, { accountNumber: v })}
                      placeholder="01XXXXXXXXX"
                      inputMode="tel"
                    />
                  </Field>
                  <Field label="Logo" hint="Shown next to this option at checkout. Upload a new one or pick from the library.">
                    <MediaPicker
                      value={m.logoUrl || ''}
                      onChange={(url) => patch(m.id, { logoUrl: url })}
                      modalTitle={`${m.name || 'Gateway'} — Logo`}
                      hideUrlInput
                    />
                  </Field>
                </div>

                <Field label="Instructions">
                  <TextInput
                    value={m.instructions || ''}
                    onChange={(v) => patch(m.id, { instructions: v })}
                    placeholder="Bank A/C, branch, or any note shown at checkout"
                  />
                </Field>

                <Toggle
                  checked={m.requiresTxId}
                  onChange={(value) => patch(m.id, { requiresTxId: value })}
                  label="Require Transaction ID at checkout"
                />
              </SubBlock>
            ))}
          </div>
        )}
      </Card>

      <SaveBar onClick={() => onSave(methods)} saving={saving} savedAt={savedAt} />
    </div>
  );
};

/* -------------------------- Integrations -------------------------- */

/**
 * "Test Connection": checks the credentials on screen against the courier's
 * real API (even before saving). For Pathao it also lists the pickup stores so
 * the Store ID can be picked instead of typed.
 */
const CourierTest: React.FC<{
  courier: 'steadfast' | 'pathao' | 'redx' | 'carrybee';
  config: Record<string, any> | undefined;
  onStores?: (stores: Array<{ id: string; name: string }>) => void;
}> = ({ courier, config, onStores }) => {
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      const res = await fetch('/api/admin/courier/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier, config: config || {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Connection failed.');
      if (Array.isArray(data.stores)) onStores?.(data.stores);
      setState({ busy: false, ok: true, message: data.message });
    } catch (error: any) {
      setState({ busy: false, ok: false, message: error.message });
    }
  };
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <Button icon={RefreshCw} onClick={run} loading={state.busy}>
        Test Connection
      </Button>
      {state.message && (
        <span
          role="status"
          className="font-medium"
          style={{
            fontSize: 'var(--a-fs-sm)',
            color: state.ok ? 'var(--ds-success-text)' : 'var(--ds-danger-text)',
          }}
        >
          {state.message}
        </span>
      )}
    </div>
  );
};


const IntegrationsPanel: React.FC<{
  courier: CourierConfig;
  setCourier: React.Dispatch<React.SetStateAction<CourierConfig>>;
  onSave: (courier: CourierConfig) => void;
  saving: boolean;
  savedAt: number;
}> = ({ courier, setCourier, onSave, saving, savedAt }) => {
  const baseUrl = courier.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const patchPathao = (changes: Partial<NonNullable<CourierConfig['pathao']>>) =>
    setCourier((c) => ({ ...c, pathao: { ...(c.pathao || {}), ...changes } }));

  const patchSteadfast = (changes: Partial<NonNullable<CourierConfig['steadfast']>>) =>
    setCourier((c) => ({ ...c, steadfast: { ...(c.steadfast || {}), ...changes } }));

  const [pathaoStores, setPathaoStores] = useState<Array<{ id: string; name: string }>>([]);
  const pathaoReady = Boolean(
    courier.pathao?.clientId && courier.pathao?.clientSecret && courier.pathao?.username && courier.pathao?.password && courier.pathao?.storeId
  );
  const steadfastReady = Boolean(courier.steadfast?.apiKey && courier.steadfast?.secretKey);

  // v3.11 — RedX and Carrybee
  const patchRedx = (changes: Partial<NonNullable<CourierConfig['redx']>>) =>
    setCourier((c) => ({ ...c, redx: { ...(c.redx || {}), ...changes } }));
  const patchCarrybee = (changes: Partial<NonNullable<CourierConfig['carrybee']>>) =>
    setCourier((c) => ({ ...c, carrybee: { ...(c.carrybee || {}), ...changes } }));
  const [redxStores, setRedxStores] = useState<Array<{ id: string; name: string }>>([]);
  const [carrybeeStores, setCarrybeeStores] = useState<Array<{ id: string; name: string }>>([]);
  const redxReady = Boolean(courier.redx?.token);
  const carrybeeReady = Boolean(courier.carrybee?.clientId && courier.carrybee?.clientSecret && courier.carrybee?.clientContext && courier.carrybee?.storeId);

  const readyBadge = (ready: boolean) => (
    <Badge status={ready ? 'active' : 'inactive'} dot>
      {ready ? 'Configured' : 'Not Configured'}
    </Badge>
  );

  const webhookTitle = (
    <p className="flex items-center gap-2 font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
      <Webhook className="w-4 h-4" style={{ color: 'var(--a-text-muted)' }} />
      Webhook (status updates)
    </p>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Integrations Settings"
          subtitle="Courier API credentials for dispatch, plus webhook callback URLs for delivery status updates."
          icon={Lock}
          accent="var(--ds-indigo)"
        />
        <CopyField
          label="Public Base URL"
          value={baseUrl}
          hint="Used to build the webhook URLs below. It must be your live HTTPS domain."
        />
      </Card>

      <Card>
        <CardHeader title="Pathao Courier" icon={Truck} accent="var(--ds-rose)" actions={readyBadge(pathaoReady)} />
        <div className="space-y-4">
          <Toggle
            checked={Boolean(courier.pathao?.sandbox)}
            onChange={(v) => patchPathao({ sandbox: v })}
            label="Sandbox (test mode)"
            description="On: uses Pathao's test server, no real parcels. Turn off for live bookings."
          />
          <Field label="Base URL" hint="Leave empty to use Pathao's official address.">
            <TextInput
              value={courier.pathao?.baseUrl || ''}
              onChange={(v) => patchPathao({ baseUrl: v })}
              placeholder={courier.pathao?.sandbox ? 'https://courier-api-sandbox.pathao.com' : 'https://api-hermes.pathao.com'}
              mono
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Client ID">
              <TextInput value={courier.pathao?.clientId || ''} onChange={(v) => patchPathao({ clientId: v })} mono />
            </Field>
            <Field label="Client Secret">
              <TextInput
                value={courier.pathao?.clientSecret || ''}
                onChange={(v) => patchPathao({ clientSecret: v })}
                secret
                mono
              />
            </Field>
            <Field label="Username">
              <TextInput value={courier.pathao?.username || ''} onChange={(v) => patchPathao({ username: v })} />
            </Field>
            <Field label="Password">
              <TextInput
                value={courier.pathao?.password || ''}
                onChange={(v) => patchPathao({ password: v })}
                secret
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Store ID" hint="Your pickup store. Test the connection to pick it from a list.">
              {pathaoStores.length > 0 ? (
                <Select
                  value={String(courier.pathao?.storeId || '')}
                  onChange={(v) => patchPathao({ storeId: v })}
                  options={[
                    { value: '', label: 'Choose a store' },
                    ...pathaoStores.map((store) => ({ value: store.id, label: `${store.name} (${store.id})` })),
                  ]}
                />
              ) : (
                <TextInput value={courier.pathao?.storeId || ''} onChange={(v) => patchPathao({ storeId: v })} mono />
              )}
            </Field>
            <Field label="Default Parcel Weight (kg)" hint="0.5 to 10. Can be changed per order.">
              <TextInput
                value={courier.pathao?.defaultWeight || ''}
                onChange={(v) => patchPathao({ defaultWeight: v })}
                placeholder="0.5"
                mono
              />
            </Field>
          </div>
          <CourierTest courier="pathao" config={courier.pathao} onStores={setPathaoStores} />

          <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
            {webhookTitle}
            <CopyField
              label="Callback URL"
              value={`${baseUrl}/api/webhooks/pathao`}
              hint="Register this in the Pathao merchant panel → Developers → Webhook. Every update is double-checked against Pathao's API before an order changes."
            />
            <Field label="Webhook Secret" hint="Leave empty unless Pathao shows you a different integration secret.">
              <TextInput
                value={courier.pathao?.webhookSecret || ''}
                onChange={(v) => patchPathao({ webhookSecret: v })}
                secret
                mono
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Steadfast" icon={Truck} accent="var(--ds-teal)" actions={readyBadge(steadfastReady)} />
        <div className="space-y-4">
          <Field label="Base URL" hint="Leave empty to use Steadfast's official address.">
            <TextInput
              value={courier.steadfast?.baseUrl || ''}
              onChange={(v) => patchSteadfast({ baseUrl: v })}
              placeholder="https://portal.packzy.com/api/v1"
              mono
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="API Key">
              <TextInput value={courier.steadfast?.apiKey || ''} onChange={(v) => patchSteadfast({ apiKey: v })} mono />
            </Field>
            <Field label="Secret Key">
              <TextInput
                value={courier.steadfast?.secretKey || ''}
                onChange={(v) => patchSteadfast({ secretKey: v })}
                secret
                mono
              />
            </Field>
          </div>
          <CourierTest courier="steadfast" config={courier.steadfast} />

          <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
            {webhookTitle}
            <CopyField
              label="Callback URL"
              value={`${baseUrl}/api/webhooks/steadfast`}
              hint="Paste into Steadfast panel → API → Webhook, with the same token as below. Without a token, every update is re-checked against Steadfast's API."
            />
            <Field label="Webhook Secret (Bearer token)">
              <TextInput
                value={courier.steadfast?.webhookSecret || ''}
                onChange={(v) => patchSteadfast({ webhookSecret: v })}
                secret
                mono
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* v3.11 — RedX */}
      <Card>
        <CardHeader title="RedX" subtitle="Book parcels with RedX straight from the Orders page." icon={Truck} accent="#e2202c" actions={readyBadge(redxReady)} />
        <div className="space-y-4">
          <Toggle
            checked={Boolean(courier.redx?.sandbox)}
            onChange={(v) => patchRedx({ sandbox: v })}
            label="Sandbox (test mode)"
            description="On: uses RedX's test server (sandbox.redx.com.bd), no real parcels. Turn off for live bookings."
          />
          <Field label="API Access Token" hint="RedX merchant panel → Developer API → generate token. Paste it without the word “Bearer”.">
            <TextInput value={courier.redx?.token || ''} onChange={(v) => patchRedx({ token: v.trim() })} secret mono />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Pickup Store" hint="Optional — RedX uses your default store when empty. Test the connection to choose.">
              {redxStores.length > 0 ? (
                <Select
                  value={String(courier.redx?.storeId || '')}
                  onChange={(v) => patchRedx({ storeId: v })}
                  options={[{ value: '', label: 'Default store' }, ...redxStores.map((store) => ({ value: store.id, label: `${store.name} (${store.id})` }))]}
                />
              ) : (
                <TextInput value={courier.redx?.storeId || ''} onChange={(v) => patchRedx({ storeId: v })} placeholder="e.g. 12345" mono />
              )}
            </Field>
            <Field label="Default Parcel Weight (kg)" hint="Can be changed per order.">
              <TextInput value={courier.redx?.defaultWeight || ''} onChange={(v) => patchRedx({ defaultWeight: v })} placeholder="0.5" mono />
            </Field>
          </div>
          <Field label="Base URL" hint="Leave empty to use RedX's official address.">
            <TextInput
              value={courier.redx?.baseUrl || ''}
              onChange={(v) => patchRedx({ baseUrl: v })}
              placeholder={courier.redx?.sandbox ? 'https://sandbox.redx.com.bd/v1.0.0-beta' : 'https://openapi.redx.com.bd/v1.0.0-beta'}
              mono
            />
          </Field>
          <CourierTest courier="redx" config={courier.redx} onStores={setRedxStores} />

          <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
            {webhookTitle}
            <Field label="Webhook Secret" hint="Any long random text. It becomes part of the callback URL below.">
              <TextInput value={courier.redx?.webhookSecret || ''} onChange={(v) => patchRedx({ webhookSecret: v.trim() })} secret mono />
            </Field>
            <CopyField
              label="Callback URL"
              value={`${baseUrl}/api/webhooks/redx${courier.redx?.webhookSecret ? `?token=${encodeURIComponent(courier.redx.webhookSecret)}` : ''}`}
              hint="Give this to RedX (merchant panel → Developer API → Webhook). Every update is double-checked against RedX's API before an order changes."
            />
          </div>
        </div>
      </Card>

      {/* v3.11 — Carrybee */}
      <Card>
        <CardHeader title="Carrybee" subtitle="Book parcels with Carrybee straight from the Orders page." icon={Truck} accent="#f5a623" actions={readyBadge(carrybeeReady)} />
        <div className="space-y-4">
          <Toggle
            checked={Boolean(courier.carrybee?.sandbox)}
            onChange={(v) => patchCarrybee({ sandbox: v })}
            label="Sandbox (test mode)"
            description="On: uses Carrybee's test server (stage-sandbox.carrybee.com). Turn off for live bookings."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Client ID">
              <TextInput value={courier.carrybee?.clientId || ''} onChange={(v) => patchCarrybee({ clientId: v.trim() })} mono />
            </Field>
            <Field label="Client Secret">
              <TextInput value={courier.carrybee?.clientSecret || ''} onChange={(v) => patchCarrybee({ clientSecret: v.trim() })} secret mono />
            </Field>
            <Field label="Client Context">
              <TextInput value={courier.carrybee?.clientContext || ''} onChange={(v) => patchCarrybee({ clientContext: v.trim() })} mono />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Store" hint="Your pickup store. Test the connection to pick it from a list.">
              {carrybeeStores.length > 0 ? (
                <Select
                  value={String(courier.carrybee?.storeId || '')}
                  onChange={(v) => patchCarrybee({ storeId: v })}
                  options={[{ value: '', label: 'Choose a store' }, ...carrybeeStores.map((store) => ({ value: store.id, label: `${store.name} (${store.id})` }))]}
                />
              ) : (
                <TextInput value={courier.carrybee?.storeId || ''} onChange={(v) => patchCarrybee({ storeId: v })} mono />
              )}
            </Field>
            <Field label="Default Parcel Weight (kg)" hint="Can be changed per order.">
              <TextInput value={courier.carrybee?.defaultWeight || ''} onChange={(v) => patchCarrybee({ defaultWeight: v })} placeholder="0.5" mono />
            </Field>
            <Field label="Delivery Type">
              <Select
                value={String(courier.carrybee?.deliveryType || '1')}
                onChange={(v) => patchCarrybee({ deliveryType: v })}
                options={[
                  { value: '1', label: 'Normal delivery' },
                  { value: '2', label: 'Express delivery' },
                ]}
              />
            </Field>
            <Field label="Product Type">
              <Select
                value={String(courier.carrybee?.productType || '1')}
                onChange={(v) => patchCarrybee({ productType: v })}
                options={[
                  { value: '1', label: 'Parcel' },
                  { value: '2', label: 'Book' },
                  { value: '3', label: 'Document' },
                ]}
              />
            </Field>
          </div>
          <Field label="Base URL" hint="Leave empty to use Carrybee's official address.">
            <TextInput
              value={courier.carrybee?.baseUrl || ''}
              onChange={(v) => patchCarrybee({ baseUrl: v })}
              placeholder={courier.carrybee?.sandbox ? 'https://stage-sandbox.carrybee.com' : 'https://developers.carrybee.com'}
              mono
            />
          </Field>
          <CourierTest courier="carrybee" config={courier.carrybee} onStores={setCarrybeeStores} />

          <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
            {webhookTitle}
            <CopyField
              label="Callback URL"
              value={`${baseUrl}/api/webhooks/carrybee`}
              hint="Register this in the Carrybee merchant panel → Webhook, with the same secret as below."
            />
            <Field label="Webhook Secret" hint="Carrybee sends it in the X-Carrybee-Webhook-Signature header. Without it, every update is re-checked against Carrybee's API.">
              <TextInput value={courier.carrybee?.webhookSecret || ''} onChange={(v) => patchCarrybee({ webhookSecret: v.trim() })} secret mono />
            </Field>
          </div>
        </div>
      </Card>

      <SaveBar
        onClick={() => onSave({ ...courier, publicBaseUrl: baseUrl })}
        saving={saving}
        savedAt={savedAt}
        label="Save Settings"
      />
    </div>
  );
};

/* ------------------------------ Pixel ------------------------------ */

const PixelPanel: React.FC<{
  marketing: any;
  setMarketing: React.Dispatch<React.SetStateAction<any>>;
  onSave: (marketing: any) => void;
  saving: boolean;
  savedAt: number;
}> = ({ marketing, setMarketing, onSave, saving, savedAt }) => {
  const pixelId = String(marketing?.metaPixelId || '');
  const enabled = Boolean(pixelId) && marketing?.enableMetaPixel !== false;
  const idLooksWrong = pixelId !== '' && !/^\d{10,20}$/.test(pixelId.trim());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pixel Settings"
          subtitle="Meta Pixel and Conversions API. Events are sent from both the browser and the server."
          icon={Target}
          accent="var(--ds-info)"
          actions={
            <Badge status={enabled ? 'active' : 'inactive'} dot>
              {enabled ? 'Configured' : 'Not Configured'}
            </Badge>
          }
        />

        <div className="space-y-4">
          <SubBlock>
            <Toggle
              checked={marketing?.enableMetaPixel !== false && Boolean(pixelId)}
              disabled={!pixelId}
              onChange={(value) => setMarketing((m: any) => ({ ...m, enableMetaPixel: value }))}
              label="Enable Meta Pixel"
              description={pixelId ? 'When off, no pixel events are sent from the storefront.' : 'Enter a Pixel ID first.'}
            />
          </SubBlock>

          <Field
            label="Facebook Pixel ID"
            hint="Enter your Meta Pixel ID to enable tracking."
            error={idLooksWrong ? 'A Pixel ID contains digits only (10–20 digits).' : undefined}
          >
            <TextInput
              value={pixelId}
              onChange={(v) =>
                setMarketing((m: any) => ({
                  ...m,
                  metaPixelId: v.trim(),
                  // A freshly entered id switches the pixel on; clearing it switches it off.
                  enableMetaPixel: v.trim() ? (m?.metaPixelId ? m.enableMetaPixel !== false : true) : false,
                }))
              }
              placeholder="Pixel ID"
              inputMode="numeric"
              mono
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Conversions API Access Token"
              hint="Required for server-side event tracking. Meta Events Manager → Settings → Conversions API."
            >
              <TextInput
                value={marketing?.metaConversionsToken || ''}
                onChange={(v) => setMarketing((m: any) => ({ ...m, metaConversionsToken: v.trim() }))}
                secret
                mono
              />
            </Field>
            <Field label="Test Event Code (optional)" hint="Remove after testing.">
              <TextInput
                value={marketing?.metaTestEventCode || ''}
                onChange={(v) => setMarketing((m: any) => ({ ...m, metaTestEventCode: v.trim() }))}
                placeholder="TEST..."
                mono
              />
            </Field>
          </div>
          {String(marketing?.metaTestEventCode || '').trim() && (
            <p
              role="alert"
              className="px-3 py-2"
              style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-warning-soft)', color: 'var(--ds-warning-text)', fontSize: 'var(--a-fs-sm)' }}
            >
              <strong>Test Event Code is on.</strong> Server events now go to Meta's Test Events screen. Clear this box and save as soon as you
              have finished testing, so every sale is counted normally.
            </p>
          )}

          {/* v3.15 — where the pixel runs: one place only, or every event counts twice */}
          <div>
            <p className="font-semibold mb-1.5" style={{ fontSize: 'var(--a-fs-sm)' }}>
              Where does your Meta Pixel run?
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  ['site', 'From this website (recommended)', 'The website loads the pixel and sends every event. Do NOT add a Meta Pixel tag in GTM as well.'],
                  ['gtm', 'From my Google Tag Manager', 'Your pixel tag is inside GTM. The website does not load the pixel itself (so nothing is counted twice); it still sends every event to GTM and the Conversions API.'],
                ] as const
              ).map(([value, label, note]) => {
                const on = (marketing?.pixelSource === 'gtm' ? 'gtm' : 'site') === value;
                return (
                  <label
                    key={value}
                    className="flex items-start gap-2.5 p-3 cursor-pointer"
                    style={{ borderRadius: 'var(--ds-r-md)', border: `2px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`, background: on ? 'var(--a-surface-2)' : 'var(--a-surface)' }}
                  >
                    <input
                      type="radio"
                      name="pixel-source"
                      className="mt-1"
                      checked={on}
                      onChange={() => setMarketing((m: any) => ({ ...m, pixelSource: value }))}
                    />
                    <span>
                      <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        {label}
                      </span>
                      <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                        {note}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {marketing?.pixelSource === 'gtm' && (
              <div className="mt-2 px-3 py-2 space-y-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-info-soft)', color: 'var(--ds-info-text)', fontSize: 'var(--a-fs-sm)' }}>
                <p>
                  <strong>In GTM:</strong> create a Data Layer Variable named <span className="ds-num">event_id</span> and put it in your Meta
                  tags' <em>Event ID</em> field. Fire the tags on Custom Event triggers: <span className="ds-num">page_view</span> → PageView,{' '}
                  <span className="ds-num">view_item</span> → ViewContent, <span className="ds-num">add_to_cart</span> → AddToCart,{' '}
                  <span className="ds-num">begin_checkout</span> → InitiateCheckout, <span className="ds-num">purchase</span> → Purchase.
                </p>
                <p>
                  The Purchase event id is the order number, the same id the server sends — so Meta keeps one sale, not two.
                </p>
              </div>
            )}
          </div>
          <div className="px-3 py-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-soft)', lineHeight: 1.6 }}>
            <strong>How sales are counted once:</strong> every event has an id. The browser pixel and the server (Conversions API) send the same
            event with the same id, and Meta keeps one. A Purchase uses the order number as its id and is sent once per order — a refresh of
            the thank-you page, or orders you create yourself in the dashboard, never count as new sales. Product ids match your Meta
            catalog feed (option SKU, else product SKU, else product id).
          </div>
        </div>
      </Card>

      <SaveBar onClick={() => onSave(marketing)} saving={saving} savedAt={savedAt} label="Save Pixel Settings" />
    </div>
  );
};

/* ------------------------------ Tags ------------------------------ */

const TagsPanel: React.FC<{
  marketing: any;
  setMarketing: React.Dispatch<React.SetStateAction<any>>;
  onSave: (marketing: any) => void;
  saving: boolean;
  savedAt: number;
}> = ({ marketing, setMarketing, onSave, saving, savedAt }) => (
  <div className="space-y-4">
    <Card>
      <CardHeader
        title="Tags Settings"
        subtitle="Google Tag Manager and Google Analytics 4 identifiers."
        icon={TagIcon}
        accent="var(--ds-amber)"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Google Tag Manager ID">
          <TextInput
            value={marketing?.gtmId || ''}
            onChange={(v) => setMarketing((m: any) => ({ ...m, gtmId: v.trim(), enableGtm: Boolean(v.trim()) }))}
            placeholder="GTM-XXXXXXX"
            mono
          />
        </Field>
        <Field label="Google Analytics 4 ID">
          <TextInput
            value={marketing?.ga4Id || ''}
            onChange={(v) => setMarketing((m: any) => ({ ...m, ga4Id: v.trim(), enableGa4: Boolean(v.trim()) }))}
            placeholder="G-XXXXXXXXXX"
            mono
          />
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        <Toggle
          checked={marketing?.delayTracking !== false}
          onChange={(v) => setMarketing((m: any) => ({ ...m, delayTracking: v }))}
          label="Load tracking after the first tap or scroll (faster website)"
          description="GTM, GA4 and the Meta Pixel are in the page source either way. With this on, their scripts download as soon as the visitor scrolls, taps or moves the mouse (or 5 seconds after the page loads), so the page opens faster and the PageSpeed score stays high. No event is lost — they wait in a queue. Turn off to load them immediately."
        />
        <Toggle
          checked={marketing?.dataLayerCustomerData !== false}
          onChange={(v) => setMarketing((m: any) => ({ ...m, dataLayerCustomerData: v }))}
          label="Send customer details with purchases"
          description="Adds the buyer's name, phone, email and address to the purchase event, for GTM tags, GA4 enhanced conversions and Meta advanced matching."
        />
        {marketing?.dataLayerCustomerData !== false && (
          <pre
            className="ds-num overflow-x-auto p-3"
            style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-xs)', lineHeight: 1.6 }}
          >{`event: 'purchase'
customer:          { name, first_name, last_name, phone, phone_e164,
                     email, address, city, country, customer_id,
                     customer_type, payment_method }
user_data:         { email, phone_number, address: { first_name,
                     last_name, street, city, country } }   ← GA4 / Google Ads
user_data_hashed:  { sha256_email_address, sha256_phone_number,
                     sha256_first_name, sha256_last_name } ← server-side GTM
ecommerce:         { transaction_id, value, currency, shipping, items[] }`}</pre>
        )}
      </div>
      <div
        className="mt-4 p-3 space-y-1.5"
        style={{
          borderRadius: 'var(--ds-r-md)',
          background: 'var(--ds-info-soft)',
          color: 'var(--ds-info-text)',
          fontSize: 'var(--a-fs-sm)',
          lineHeight: 'var(--ds-lh-normal)',
        }}
      >
        <p>
          <strong>Using GTM?</strong> Add your GA4 tag inside the GTM container. When a GTM ID is set, the GA4 ID
          above is not loaded separately — loading both would count every visit and sale twice.
        </p>
        <p>
          The store pushes GA4 ecommerce events to the dataLayer: <span className="ds-num">page_view, view_item,
          view_item_list, add_to_cart, remove_from_cart, begin_checkout, add_payment_info, purchase, search</span>. In
          GTM, fire your tags on a Custom Event trigger with those names and read <span className="ds-num">ecommerce</span>{' '}
          from the Data Layer.
        </p>
      </div>
    </Card>

    <SaveBar onClick={() => onSave(marketing)} saving={saving} savedAt={savedAt} label="Save Tag Settings" />
  </div>
);
