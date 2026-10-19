import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog, Plus, Edit2, Trash2, ShieldCheck, KeyRound, Users, Mail, Phone } from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Button,
  IconButton,
  Badge,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  Drawer,
  ConfirmDialog,
  Field,
  Select,
  Toggle,
  Checkbox,
  SearchInput,
  FilterPills,
  Toolbar,
  useToasts,
  tint,
  mix,
} from './ui.tsx';
import { MODULE_INFO, MODULE_GROUPS, type PermissionModule } from '../../lib/permissions.ts';

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(MODULE_INFO).map(([key, info]) => [key, info.label])
);

const emptyStaff = () => ({
  id: null as number | null,
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'staff',
  jobRole: '',
  status: 'active',
  permissions: [] as string[],
});

const initialsOf = (name: string) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || '?';

/**
 * Staff & Access — create the accounts that sign in to the POS and dashboard,
 * and pick exactly which modules each one may open. Changes take effect on the
 * staff member's very next request, even if they are already signed in.
 */
export const AdminStaffPage: React.FC = () => {
  const toasts = useToasts();
  const [rows, setRows] = useState<any[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyStaff());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [userRes, moduleRes] = await Promise.all([
        fetch('/api/admin/users').then((res) => res.json()),
        fetch('/api/admin/permission-modules').then((res) => res.json()),
      ]);
      if (!Array.isArray(userRes)) throw new Error(userRes?.error || '');
      setRows(userRes);
      setModules(Array.isArray(moduleRes) ? moduleRes : []);
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((row) => row.status === 'active').length,
      inactive: rows.filter((row) => row.status !== 'active').length,
      admin: rows.filter((row) => row.role === 'admin').length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'active' && row.status !== 'active') return false;
      if (filter === 'inactive' && row.status === 'active') return false;
      if (filter === 'admin' && row.role !== 'admin') return false;
      if (!term) return true;
      return `${row.name} ${row.email} ${row.phone || ''} ${row.jobRole || ''}`.toLowerCase().includes(term);
    });
  }, [rows, search, filter]);

  const openNew = () => {
    setDraft(emptyStaff());
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return toasts.push('Enter a name.', 'error');
    if (!draft.email.trim()) return toasts.push('Enter an email.', 'error');
    if (!draft.id && draft.password.length < 6) {
      return toasts.push('Password must be at least 6 characters.', 'error');
    }
    if (draft.id && draft.password && draft.password.length < 6) {
      return toasts.push('Password must be at least 6 characters.', 'error');
    }

    setSaving(true);
    try {
      const payload: any = { ...draft };
      if (draft.id && !draft.password) delete payload.password;
      const res = await fetch(draft.id ? `/api/admin/users/${draft.id}` : '/api/admin/users', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push(draft.id ? 'User updated.' : 'New user created.');
      setDrawerOpen(false);
      load();
    } catch (error: any) {
      toasts.push(error.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('User deleted.');
      setConfirmDelete(null);
      load();
    } catch {
      toasts.push('Could not delete.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (key: string) =>
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key],
    }));

  const allModules = modules.length > 0 && modules.every((key) => draft.permissions.includes(key));
  const someModules = !allModules && modules.some((key) => draft.permissions.includes(key));

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Staff & Access"
        subtitle="Accounts that can sign in, and the modules each one may open."
        icon={UserCog}
        actions={
          <Button variant="primary" icon={Plus} onClick={openNew}>
            Add Staff
          </Button>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        <StatCard label="Accounts" value={counts.all} icon={Users} loading={loading} />
        <StatCard
          label="Active"
          value={counts.active}
          icon={ShieldCheck}
          color="var(--ds-success)"
          loading={loading}
          onClick={() => setFilter('active')}
        />
        <div className="col-span-2 xl:col-span-1">
          <StatCard
            label="Administrators"
            value={counts.admin}
            icon={KeyRound}
            color="var(--ds-indigo)"
            loading={loading}
            onClick={() => setFilter('admin')}
          />
        </div>
      </div>

      <Toolbar className="mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or phone" className="lg:w-72" />
        <div className="min-w-0">
          <FilterPills
            active={filter}
            onChange={setFilter}
            pills={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'active', label: 'Active', count: counts.active, color: 'var(--ds-success)' },
              { id: 'inactive', label: 'Inactive', count: counts.inactive, color: 'var(--ds-text-muted)' },
              { id: 'admin', label: 'Admin', count: counts.admin, color: 'var(--ds-indigo)' },
            ]}
          />
        </div>
      </Toolbar>

      <TableWrap>
        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Job role</th>
                <th>Access</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRows rows={4} cols={6} />
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    {rows.length === 0 ? (
                      <EmptyState
                        title="No staff accounts yet"
                        description="Create accounts for your cashiers and managers."
                        icon={UserCog}
                        action={
                          <Button variant="primary" icon={Plus} onClick={openNew}>
                            Add Staff
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState title="No results found" description="Try a different name or filter." icon={Users} />
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const permissionCount = (row.permissions || []).length;
                  const isAdmin = row.role === 'admin';
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="flex items-center gap-2.5" style={{ minWidth: 160 }}>
                          <span
                            className="flex items-center justify-center shrink-0 font-bold"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 'var(--ds-r-full)',
                              background: isAdmin ? mix('var(--ds-indigo)', 0.12) : tint(0.12),
                              color: isAdmin ? 'var(--ds-indigo)' : 'var(--primary)',
                              fontSize: 'var(--a-fs-sm)',
                            }}
                          >
                            {initialsOf(row.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{row.name}</div>
                            {row.phone && (
                              <div className="ds-num truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                                {row.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--a-text-soft)' }}>{row.email}</td>
                      <td className="whitespace-nowrap">{row.jobRole || '—'}</td>
                      <td className="whitespace-nowrap">
                        {isAdmin ? (
                          <Badge tone={{ bg: 'var(--ds-indigo-soft)', fg: 'var(--ds-indigo)' }}>Full access</Badge>
                        ) : (
                          <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>
                            <span className="ds-num">{permissionCount}</span> module{permissionCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge status={row.status} dot />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <IconButton
                            icon={Edit2}
                            tone="primary"
                            size="sm"
                            label="Edit staff"
                            onClick={() => {
                              setDraft({
                                ...emptyStaff(),
                                ...row,
                                password: '',
                                permissions: row.permissions || [],
                              });
                              setDrawerOpen(true);
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            tone="danger"
                            size="sm"
                            label="Delete staff"
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
      </TableWrap>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit staff account' : 'New staff account'}
        subtitle="Permissions apply on the next request, even for an open session"
        width="max-w-2xl"
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft.id ? 'Save changes' : 'Create account'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Card>
            <CardHeader title="Account Details" icon={UserCog} />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full name" required>
                  <input
                    className="a-field"
                    value={draft.name}
                    autoComplete="off"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field label="Email (login)" required>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--a-text-muted)' }}
                    />
                    <input
                      type="email"
                      className="a-field pl-9"
                      value={draft.email}
                      autoComplete="off"
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Phone">
                  <div className="relative">
                    <Phone
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--a-text-muted)' }}
                    />
                    <input
                      className="a-field pl-9"
                      inputMode="tel"
                      value={draft.phone || ''}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    />
                  </div>
                </Field>
                <Field label="Job role" hint="Shown in the dashboard and on receipts">
                  <input
                    className="a-field"
                    value={draft.jobRole || ''}
                    onChange={(e) => setDraft({ ...draft, jobRole: e.target.value })}
                    placeholder="e.g. Cashier"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={draft.id ? 'New password' : 'Password'}
                  required={!draft.id}
                  hint={draft.id ? 'Leave blank to keep the current password' : 'At least 6 characters'}
                >
                  <input
                    type="password"
                    className="a-field"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  />
                </Field>
                <Field label="Account type">
                  <Select
                    value={draft.role}
                    onChange={(value) => setDraft({ ...draft, role: value })}
                    options={[
                      { value: 'staff', label: 'Staff (limited)' },
                      { value: 'admin', label: 'Administrator (full access)' },
                    ]}
                  />
                </Field>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
                <Toggle
                  checked={draft.status === 'active'}
                  onChange={(value) => setDraft({ ...draft, status: value ? 'active' : 'inactive' })}
                  label="Account is active"
                  description="Deactivating signs the account out on its next request"
                />
              </div>
            </div>
          </Card>

          {draft.role === 'admin' ? (
            <div
              className="flex items-start gap-2.5"
              style={{
                padding: 'var(--ds-s-3) var(--ds-s-4)',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--ds-indigo-soft)',
                color: 'var(--ds-indigo)',
                fontSize: 'var(--a-fs-md)',
              }}
            >
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
              Administrators can open every module, so no separate permissions are needed.
            </div>
          ) : (
            <Card>
              <CardHeader
                title="Module access"
                subtitle={`${draft.permissions.filter((key) => modules.includes(key)).length} / ${modules.length} selected`}
                icon={ShieldCheck}
                accent="var(--ds-success)"
                actions={
                  modules.length > 0 ? (
                    <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      <Checkbox
                        checked={allModules}
                        indeterminate={someModules}
                        label="Select all"
                        onChange={() =>
                          setDraft((current) => ({ ...current, permissions: allModules ? [] : [...modules] }))
                        }
                      />
                      <span className="font-semibold hidden sm:inline">All</span>
                    </label>
                  ) : undefined
                }
              />
              {modules.length === 0 ? (
                <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>No modules found.</p>
              ) : (
                <div className="space-y-4">
                  <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    This account opens only what is ticked — in the dashboard menu and on the server. Nothing ticked = no access at all.
                  </p>
                  {[...MODULE_GROUPS, 'Other'].map((group) => {
                    const keys = modules.filter((key) => ((MODULE_INFO as any)[key]?.group || 'Other') === group);
                    if (keys.length === 0) return null;
                    const groupAll = keys.every((key) => draft.permissions.includes(key));
                    return (
                      <div key={group}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold uppercase" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)', letterSpacing: 'var(--ds-tracking-wide)' }}>
                            {group}
                          </span>
                          <button
                            type="button"
                            className="font-semibold cursor-pointer"
                            style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--primary-ink, var(--primary))' }}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                permissions: groupAll
                                  ? current.permissions.filter((key) => !keys.includes(key))
                                  : Array.from(new Set([...current.permissions, ...keys])),
                              }))
                            }
                          >
                            {groupAll ? 'Clear' : 'Select all'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {keys.map((key) => {
                            const on = draft.permissions.includes(key);
                            const info = (MODULE_INFO as any)[key as PermissionModule];
                            return (
                              <div
                                key={key}
                                role="button"
                                tabIndex={0}
                                onClick={() => togglePermission(key)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    togglePermission(key);
                                  }
                                }}
                                className="flex items-start gap-2.5 cursor-pointer transition-colors"
                                style={{
                                  padding: 'var(--ds-s-2) var(--ds-s-3)',
                                  borderRadius: 'var(--ds-r-md)',
                                  background: on ? tint(0.08) : 'var(--a-surface-2)',
                                  border: `1px solid ${on ? tint(0.28) : 'var(--a-border)'}`,
                                }}
                              >
                                <span className="mt-0.5">
                                  <Checkbox checked={on} label={MODULE_LABELS[key] || key} onChange={() => togglePermission(key)} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                                    {MODULE_LABELS[key] || key}
                                  </span>
                                  {info?.description && (
                                    <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)', lineHeight: 1.4 }}>
                                      {info.description}
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
          {/* Lets Enter in any field submit the drawer */}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this account?"
        message={`${confirmDelete?.name} will no longer be able to sign in.`}
        confirmLabel="Delete account"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
