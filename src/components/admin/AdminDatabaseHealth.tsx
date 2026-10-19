import React, { useEffect, useState } from 'react';
import { Database, Wrench, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, Button, Badge, useToasts, mix } from './ui.tsx';

interface Health {
  ok: boolean;
  tables: Array<{ name: string; ok: boolean }>;
  schema: { ranAt: string; ok: boolean; created: string[]; added: string[]; errors: Array<{ step: string; error: string }> };
  database: string;
  node: string;
  app: string;
}

/** Friendly names for the tables the owner might recognise */
const TABLE_LABEL: Record<string, string> = {
  orders: 'Orders',
  products: 'Products',
  customers: 'Customers',
  site_settings: 'Settings',
  users: 'Staff accounts',
  admin_notifications: 'Notifications',
  order_counters: 'Order numbers',
  sms_logs: 'SMS log',
  fraud_checks: 'Fraud checks',
  order_returns: 'Returns',
  contact_messages: 'Contact messages',
  password_reset_requests: 'Password resets',
  license_state: 'License',
  license_events: 'License activity',
  size_guides: 'Size guides',
  blog_posts: 'Blog posts',
  landing_pages: 'Landing pages',
  payment_transactions: 'Online payments',
  media_files: 'Image backup copies',
  pos_drawer_events: 'Cash drawer log',
  live_chat_conversations: 'Live chats',
  live_chat_messages: 'Live chat messages',
};

/**
 * System Configuration → Database. Shows whether every table the app needs is
 * in the database, what the last automatic upgrade did, and offers a one-click
 * "Repair" that runs the same safe, add-only upgrade again.
 */
export const AdminDatabaseHealth: React.FC = () => {
  const toasts = useToasts();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (repair = false) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(repair ? '/api/admin/system/repair' : '/api/admin/system/health', { method: repair ? 'POST' : 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not check the database.');
      setHealth(data);
      if (repair) toasts.push(data.ok ? 'Database is complete.' : 'Repair ran. Some steps still need attention — see below.', data.ok ? 'success' : 'warning');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = health?.tables.filter((table) => !table.ok) || [];

  return (
    <Card>
      {toasts.node}
      <CardHeader
        title="Database"
        subtitle="New features add their tables automatically when the app starts. Nothing is ever deleted."
        icon={Database}
        accent="var(--ds-teal)"
        actions={
          <>
            <Button size="sm" icon={RefreshCw} onClick={() => load(false)} disabled={busy}>
              Check
            </Button>
            <Button size="sm" variant="primary" icon={Wrench} loading={busy} onClick={() => load(true)}>
              Repair
            </Button>
          </>
        }
      />

      {error && (
        <p className="p-3 mb-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-danger-soft)', color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-md)' }}>
          {error}
        </p>
      )}

      {health && (
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-3"
            style={{
              borderRadius: 'var(--ds-r-md)',
              background: health.ok ? mix('var(--ds-success)', 0.08) : 'var(--ds-warning-soft)',
              color: health.ok ? 'var(--ds-success-text)' : 'var(--ds-warning-text)',
            }}
          >
            {health.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div style={{ fontSize: 'var(--a-fs-md)' }}>
              <div className="font-bold">
                {health.ok ? 'Everything is in place' : missing.length > 0 ? `${missing.length} table(s) missing` : 'The last upgrade reported a problem'}
              </div>
              <div style={{ opacity: 0.9 }}>
                {health.ok
                  ? 'All features have the tables they need.'
                  : 'Press Repair. If it still fails, your database user may lack the CREATE/ALTER permission — run database/upgrade-v3.11.sql in phpMyAdmin once.'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {health.tables.map((table) => (
              <Badge
                key={table.name}
                tone={table.ok ? { bg: 'var(--a-surface-3)', fg: 'var(--a-text-soft)' } : { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' }}
              >
                {table.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {TABLE_LABEL[table.name] || table.name}
              </Badge>
            ))}
          </div>

          {health.schema.errors.length > 0 && (
            <ul className="space-y-1" style={{ fontSize: 'var(--a-fs-sm)' }}>
              {health.schema.errors.map((item, index) => (
                <li key={index} className="p-2" style={{ borderRadius: 'var(--ds-r-sm)', background: 'var(--ds-danger-soft)', color: 'var(--ds-danger-text)' }}>
                  <strong>{item.step}:</strong> {item.error}
                </li>
              ))}
            </ul>
          )}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ fontSize: 'var(--a-fs-sm)' }}>
            {[
              ['App version', health.app],
              ['Database', health.database || '—'],
              ['Node.js', health.node],
              ['Last upgrade', health.schema.ranAt ? new Date(health.schema.ranAt).toLocaleString('en-GB') : '—'],
            ].map(([label, value]) => (
              <div key={label} className="p-2.5" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
                <dt style={{ color: 'var(--a-text-muted)' }}>{label}</dt>
                <dd className="font-semibold ds-num break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
};
