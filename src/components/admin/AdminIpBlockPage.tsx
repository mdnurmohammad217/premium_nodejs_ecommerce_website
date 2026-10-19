import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Plus, Trash2, Globe, Network, MonitorSmartphone, AlertTriangle, Copy, Check } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  IconButton,
  SearchInput,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pagination,
  ConfirmDialog,
  StatCard,
  Field,
  Badge,
  useToasts,
  mix,
} from './ui.tsx';

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;
/** Same rule as the server: one to three leading octets, then `*` */
const WILDCARD = /^(\d{1,3}\.){1,3}\*$/;

const octetsInRange = (value: string) =>
  value
    .split('.')
    .filter((part) => part !== '*')
    .every((part) => Number(part) <= 255);

const isWildcard = (value: string) => WILDCARD.test(value.trim());

/** Mirrors the server's matcher, so the page can tell whether an entry covers the viewer */
const entryMatches = (entry: string, ip: string) => {
  const value = entry.trim();
  if (!value || !ip) return false;
  return value.endsWith('*') ? ip.startsWith(value.slice(0, -1)) : value === ip;
};

function validate(raw: string): string {
  const value = raw.trim();
  if (!value) return 'Enter an IP address.';
  if (WILDCARD.test(value)) {
    return octetsInRange(value) ? '' : 'Each part must be between 0 and 255.';
  }
  if (IPV4.test(value)) {
    return octetsInRange(value) ? '' : 'Each part must be between 0 and 255.';
  }
  if (value.includes(':') && IPV6.test(value)) return '';
  if (value.includes('*')) return 'To block a range, end with *, e.g. 103.120.5.*';
  return 'Enter a valid IP address (e.g. 103.120.5.10 or 103.120.5.*).';
}

/**
 * IP Block — the addresses stopped from using the storefront. Blocking a
 * customer adds their last device IP here automatically; single addresses and
 * whole ranges (`103.120.5.*`) can also be typed in by hand. The server applies
 * a change to every storefront request immediately.
 */
export const AdminIpBlockPage: React.FC = () => {
  const toasts = useToasts();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ip, setIp] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmSelf, setConfirmSelf] = useState(false);
  const [myIp, setMyIp] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/blocked-ips');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '');
      setRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load the block list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/access-check')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMyIp(typeof data?.ip === 'string' ? data.ip : ''))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.ip} ${row.note || ''} ${row.createdBy || ''}`.toLowerCase().includes(term));
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const rangeCount = rows.filter((row) => isWildcard(String(row.ip || ''))).length;

  const inputError = validate(ip);
  const showError = touched && ip.trim() !== '' ? inputError : '';
  const blocksSelf = Boolean(myIp) && !inputError && entryMatches(ip, myIp);

  const submit = async () => {
    const value = ip.trim();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: value, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push(isWildcard(value) ? 'Range blocked.' : 'IP blocked.');
      setIp('');
      setNote('');
      setTouched(false);
      setConfirmSelf(false);
      load();
    } catch (error: any) {
      toasts.push(error.message || 'Could not block the IP.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    setTouched(true);
    if (inputError) return toasts.push(inputError, 'error');
    if (blocksSelf) return setConfirmSelf(true);
    submit();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/blocked-ips/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('IP unblocked.');
      setConfirmDelete(null);
      load();
    } catch {
      toasts.push('Could not unblock.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const myIpBlocked = Boolean(myIp) && rows.some((row) => entryMatches(String(row.ip || ''), myIp));

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="IP Block"
        subtitle="Stop abusive devices from placing orders on your storefront."
        icon={ShieldAlert}
        accent="var(--ds-danger)"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Blocked" value={rows.length} icon={ShieldAlert} color="var(--ds-danger)" loading={loading} />
        <StatCard label="Range Blocks" value={rangeCount} icon={Network} color="var(--ds-amber)" loading={loading} />
        <div className="col-span-2 lg:col-span-1 a-card p-4 flex items-center gap-3.5">
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 46,
              height: 46,
              borderRadius: 'var(--ds-r-full)',
              background: myIpBlocked ? 'var(--ds-warning-soft)' : mix('var(--ds-info)', 0.12),
              color: myIpBlocked ? 'var(--ds-warning-text)' : 'var(--ds-info)',
            }}
          >
            <MonitorSmartphone className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>Your IP</div>
            {myIp ? (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="font-bold truncate ds-num"
                  style={{ fontSize: 'var(--ds-fs-lg)', fontFamily: 'var(--font-mono)' }}
                >
                  {myIp}
                </span>
                <IconButton
                  icon={copied ? Check : Copy}
                  tone="plain"
                  size="sm"
                  label="Copy IP"
                  onClick={() => {
                    navigator.clipboard?.writeText(myIp);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                />
              </div>
            ) : (
              <span className="ds-skeleton block h-4 w-2/3 mt-1" />
            )}
            {myIpBlocked && (
              <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--ds-warning-text)' }} className="font-semibold">
                An entry in the list is also blocking your IP
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Add IP"
          subtitle="A single IP or a whole range. Takes effect across the site as soon as you save."
          icon={Plus}
          accent="var(--ds-danger)"
        />
        <form
          className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-start"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field
            label="IP / Range"
            required
            error={showError || undefined}
            hint="e.g. 103.120.5.10, or 103.120.5.* for a whole range (IPv6 also works)"
          >
            <input
              className={`a-field ${showError ? 'a-field-error' : ''}`}
              value={ip}
              onChange={(e) => setIp(e.target.value.replace(/\s+/g, ''))}
              onBlur={() => setTouched(true)}
              placeholder="103.120.5.* or 103.120.5.10"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(showError)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <Field label="Note">
            <input
              className="a-field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why you are blocking it (optional)"
            />
          </Field>
          <div>
            {/* An empty label keeps the button level with the inputs beside it */}
            <span className="a-label invisible hidden sm:block" aria-hidden="true">
              &nbsp;
            </span>
            <Button type="submit" variant="danger" icon={ShieldAlert} loading={saving} block>
              Block
            </Button>
          </div>
        </form>

        {blocksSelf && (
          <div
            role="alert"
            className="flex items-start gap-2.5 mt-3"
            style={{
              padding: 'var(--ds-s-3) var(--ds-s-4)',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--ds-warning-soft)',
              color: 'var(--ds-warning-text)',
              border: `1px solid ${mix('var(--ds-warning)', 0.3)}`,
              fontSize: 'var(--a-fs-md)',
            }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This entry will block your own IP (<span className="ds-num" style={{ fontFamily: 'var(--font-mono)' }}>{myIp}</span>
              ). The dashboard keeps working while you are logged in, but the storefront will no longer be usable from this device.
            </span>
          </div>
        )}
      </Card>

      <TableWrap>
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b"
          style={{ padding: 'var(--ds-s-3) var(--ds-td-x)', borderColor: 'var(--a-border)' }}
        >
          <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
            Blocked IPs
          </h3>
          <SearchInput value={search} onChange={setSearch} placeholder="Search IP / note" className="sm:w-64" />
        </div>

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>IP</th>
                <th>Note</th>
                <th>Added by</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRows rows={4} cols={5} />
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      title={search ? 'No results found' : 'No Available Data'}
                      description={
                        search ? 'Try searching for a different IP or note.' : 'Nothing is blocked right now — that is a good thing.'
                      }
                      icon={Globe}
                    />
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const value = String(row.ip || '');
                  const coversMe = entryMatches(value, myIp);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold ds-num" style={{ fontFamily: 'var(--font-mono)' }}>
                            {value}
                          </span>
                          {isWildcard(value) && (
                            <Badge tone={{ bg: 'var(--ds-amber-soft)', fg: 'var(--ds-warning-text)' }}>Range</Badge>
                          )}
                          {coversMe && (
                            <Badge tone={{ bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)' }}>Your IP</Badge>
                          )}
                        </div>
                      </td>
                      <td style={{ color: 'var(--a-text-muted)', minWidth: 140 }}>{row.note || '—'}</td>
                      <td className="whitespace-nowrap">{row.createdBy || '—'}</td>
                      <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                        {row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : '—'}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <IconButton
                            icon={Trash2}
                            tone="danger"
                            size="sm"
                            label="Unblock IP"
                            onClick={() => setConfirmDelete(row)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {!loadError && filtered.length > pageSize && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </TableWrap>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Unblock this IP?"
        message={`${confirmDelete?.ip} will be able to place orders again.`}
        confirmLabel="Unblock"
        tone="primary"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmSelf}
        title="Block your own IP?"
        message={`${ip.trim()} will block your current IP (${myIp}). You will not be able to open the storefront from this device, but you can still log in to the dashboard to unblock it.`}
        confirmLabel="Block Anyway"
        busy={saving}
        onConfirm={submit}
        onCancel={() => setConfirmSelf(false)}
      />
    </div>
  );
};
