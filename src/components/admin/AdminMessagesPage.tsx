import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, Phone, MessageCircle, Mail, Archive, Trash2, CheckCircle2, MapPin, Clock, LayoutTemplate } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  SearchInput,
  Toolbar,
  FilterPills,
  EmptyState,
  ErrorState,
  ConfirmDialog,
  Badge,
  useToasts,
  useDebounced,
  ACCENTS,
  SegmentedTabs,
} from './ui.tsx';
import { AdminContactPageEditor } from './AdminContactPageEditor.tsx';

interface ContactMessage {
  id: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  message?: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  adminNote?: string;
  pageUrl?: string;
  createdAt?: string;
}

const STATUS_TONE = {
  new: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', label: 'New' },
  read: { bg: 'var(--a-surface-3)', fg: 'var(--a-text-soft)', label: 'Read' },
  replied: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Replied' },
  archived: { bg: 'var(--a-surface-3)', fg: 'var(--a-text-muted)', label: 'Archived' },
};

const timeAgo = (value?: string) => {
  if (!value) return '';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const waNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('880') ? digits : digits.startsWith('0') ? `88${digits}` : digits;
};

/**
 * Customers → Messages: everything sent through the website's contact form,
 * plus a second tab to edit the Contact page itself.
 */
export const AdminMessagesPage: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const toasts = useToasts();
  const [tab, setTab] = useState<'inbox' | 'page'>('inbox');
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<ContactMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status });
      if (debounced.trim()) params.set('search', debounced.trim());
      const res = await fetch(`/api/admin/contact-messages?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load messages.');
      setRows(data.messages || []);
      setCounts(data.counts || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  // New messages appear without pressing Refresh (every 45 s while this tab is open)
  useEffect(() => {
    if (tab !== 'inbox') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadQuietly();
    }, 45_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status, debounced]);

  const loadQuietly = async () => {
    try {
      const params = new URLSearchParams({ status });
      if (debounced.trim()) params.set('search', debounced.trim());
      const res = await fetch(`/api/admin/contact-messages?${params}`);
      const data = await res.json();
      if (!res.ok) return;
      setRows((current) => {
        const before = new Set(current.map((row) => row.id));
        const fresh = (data.messages || []).filter((row: ContactMessage) => !before.has(row.id)).length;
        if (fresh > 0 && current.length > 0) {
          toasts.push(`${fresh} new message${fresh === 1 ? '' : 's'}.`, 'info');
          onChanged?.();
        }
        return data.messages || [];
      });
      setCounts(data.counts || {});
    } catch {
      /* next tick */
    }
  };

  const update = async (row: ContactMessage, patch: Partial<Pick<ContactMessage, 'status' | 'adminNote'>>, message?: string) => {
    const res = await fetch(`/api/admin/contact-messages/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toasts.push('Could not update the message.', 'error');
      return;
    }
    setRows((list) => list.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
    if (message) toasts.push(message);
    onChanged?.();
  };

  const toggleOpen = (row: ContactMessage) => {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    if (next && row.status === 'new') void update(row, { status: 'read' });
  };

  const remove = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/admin/contact-messages/${deleting.id}`, { method: 'DELETE' });
    if (res.ok) {
      toasts.push('Message deleted.');
      setDeleting(null);
      load();
      onChanged?.();
    } else toasts.push('Could not delete.', 'error');
  };

  const pills = [
    { id: 'all', label: 'All', count: counts.all || 0 },
    { id: 'new', label: 'New', count: counts.new || 0, color: ACCENTS.info },
    { id: 'read', label: 'Read', count: counts.read || 0 },
    { id: 'replied', label: 'Replied', count: counts.replied || 0, color: ACCENTS.success },
    { id: 'archived', label: 'Archived', count: counts.archived || 0 },
  ];

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Messages"
        subtitle="Everything customers send from the website's Contact page."
        icon={Inbox}
        accent={ACCENTS.info}
        actions={
          tab === 'inbox' ? (
            <Button icon={RefreshCw} onClick={load} disabled={loading}>
              Refresh
            </Button>
          ) : undefined
        }
      />
      <SegmentedTabs
        tabs={[
          { id: 'inbox', label: 'Inbox', icon: Inbox, badge: counts.new || 0 },
          { id: 'page', label: 'Contact page', icon: LayoutTemplate },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'inbox' | 'page')}
      />

      {tab === 'page' ? (
        <AdminContactPageEditor />
      ) : (
      <>
      <Card>
        <Toolbar>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <FilterPills pills={pills} active={status} onChange={setStatus} />
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, email, message" className="lg:w-72" />
          </div>
        </Toolbar>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : !loading && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={status === 'all' && !debounced ? 'No messages yet' : 'No messages match'}
            description={
              status === 'all' && !debounced
                ? 'When someone sends the form on your Contact page, it lands here straight away.'
                : 'Try another filter or clear the search.'
            }
            action={
              status === 'all' && !debounced ? (
                <a href="/contact" target="_blank" rel="noopener noreferrer">
                  <Button size="sm">Open the Contact page</Button>
                </a>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const open = openId === row.id;
            const tone = STATUS_TONE[row.status] || STATUS_TONE.read;
            return (
              <Card key={row.id}>
                <button
                  type="button"
                  onClick={() => toggleOpen(row)}
                  aria-expanded={open}
                  className="w-full flex items-start gap-3 text-left cursor-pointer"
                >
                  <span
                    className="w-10 h-10 shrink-0 inline-flex items-center justify-center font-bold"
                    style={{
                      borderRadius: 'var(--ds-r-full)',
                      background: row.status === 'new' ? 'var(--ds-info-soft)' : 'var(--a-surface-3)',
                      color: row.status === 'new' ? 'var(--ds-info-text)' : 'var(--a-text-soft)',
                    }}
                  >
                    {row.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={row.status === 'new' ? 'font-bold' : 'font-semibold'} style={{ fontSize: 'var(--a-fs-md)' }}>
                        {row.name}
                      </span>
                      <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {row.phone}
                      </span>
                      <Badge tone={tone}>{tone.label}</Badge>
                    </span>
                    <span
                      className={open ? 'block mt-1 whitespace-pre-line' : 'block mt-1 truncate'}
                      style={{ fontSize: 'var(--a-fs-md)', color: row.message ? 'var(--a-text)' : 'var(--a-text-muted)' }}
                    >
                      {row.message || 'No message — they left their details for a call back.'}
                    </span>
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    <Clock className="w-3.5 h-3.5" />
                    {timeAgo(row.createdAt)}
                  </span>
                </button>

                {open && (
                  <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid var(--a-border-soft)' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {row.email && (
                        <span className="inline-flex items-center gap-2 break-all">
                          <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--a-text-muted)' }} />
                          {row.email}
                        </span>
                      )}
                      {row.address && (
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--a-text-muted)' }} />
                          {row.address}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`tel:${row.phone}`}>
                        <Button icon={Phone} variant="primary" size="sm">
                          Call
                        </Button>
                      </a>
                      <a
                        href={`https://wa.me/${waNumber(row.phone)}?text=${encodeURIComponent(`Hello ${row.name}, thank you for contacting us.`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button icon={MessageCircle} variant="success" size="sm">
                          WhatsApp
                        </Button>
                      </a>
                      {row.email && (
                        <a href={`mailto:${row.email}?subject=${encodeURIComponent('Re: your message')}`}>
                          <Button icon={Mail} size="sm">
                            Email
                          </Button>
                        </a>
                      )}
                      {row.status !== 'replied' && (
                        <Button icon={CheckCircle2} size="sm" onClick={() => update(row, { status: 'replied' }, 'Marked as replied.')}>
                          Mark Replied
                        </Button>
                      )}
                      {row.status !== 'archived' && (
                        <Button icon={Archive} size="sm" variant="ghost" onClick={() => update(row, { status: 'archived' }, 'Archived.')}>
                          Archive
                        </Button>
                      )}
                      <IconButton icon={Trash2} tone="danger" label="Delete" onClick={() => setDeleting(row)} />
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="a-field"
                        placeholder="Private note (e.g. Called back, sent price list)"
                        value={notes[row.id] ?? row.adminNote ?? ''}
                        onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        onClick={() => update(row, { adminNote: notes[row.id] ?? row.adminNote ?? '' }, 'Note saved.')}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this message?"
        message={`The message from ${deleting?.name || 'this customer'} will be deleted permanently.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};
