import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, RefreshCw, Trash2, Server, MemoryStick, Zap, Info } from 'lucide-react';
import { Card, CardHeader, Button, mix } from './ui.tsx';

interface CacheStatus {
  mode: 'redis' | 'memory';
  redisConfigured: boolean;
  redisConnected: boolean;
  redisError: string;
  generation: number;
  hitRate: number;
  hits: number;
  misses: number;
  coalesced: number;
  stores: number;
  invalidations: number;
  memoryEntries: number;
  memoryBytes: number;
}

const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes > 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

/**
 * Response cache health (System Configuration → Database). Shows whether Redis
 * is in use and how much of the shop's traffic the cache is absorbing.
 */
export const CacheStatusCard: React.FC = () => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/cache/status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not read the cache status.');
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const flush = async () => {
    setBusy(true);
    setNote('');
    try {
      const res = await fetch('/api/admin/cache/flush', { method: 'POST' });
      if (!res.ok) throw new Error();
      setNote('Cache cleared — every visitor gets fresh pages now.');
      load();
    } catch {
      setNote('Could not clear the cache.');
    } finally {
      setBusy(false);
    }
  };

  const redis = status?.mode === 'redis';
  const accent = redis ? 'var(--ds-success)' : 'var(--ds-teal)';

  const tile = (label: string, value: React.ReactNode, Icon: React.ComponentType<{ className?: string }>, color: string) => (
    <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
      <span className="inline-flex items-center justify-center mb-2" style={{ width: 30, height: 30, borderRadius: 8, background: mix(color, 0.12), color }}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="ds-num font-bold" style={{ fontSize: 'var(--a-fs-xl)' }}>
        {value}
      </p>
      <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{label}</p>
    </div>
  );

  return (
    <Card accent={accent}>
      <CardHeader
        title="Speed cache"
        subtitle="Busy pages (products, categories, settings, blog, landing pages) are answered from the cache. Any change you save clears it at once."
        icon={Gauge}
        accent={accent}
        actions={<Button size="sm" icon={RefreshCw} onClick={load} aria-label="Refresh" />}
      />

      {error && <p className="font-semibold mb-3" style={{ color: 'var(--ds-danger-text)' }}>{error}</p>}

      {status && (
        <>
          <div
            className="flex items-center gap-3 p-3 mb-4"
            style={{ borderRadius: 'var(--ds-r-md)', background: mix(accent, 0.08), color: redis ? 'var(--ds-success-text)' : 'var(--ds-teal)' }}
          >
            <Server className="w-5 h-5 shrink-0" />
            <div className="min-w-0" style={{ fontSize: 'var(--a-fs-md)' }}>
              <p className="font-bold">{redis ? 'Redis is connected' : 'Memory cache'}</p>
              <p style={{ color: 'var(--a-text-soft)', fontSize: 'var(--a-fs-sm)' }}>
                {redis
                  ? 'Shared by every app instance and kept across restarts.'
                  : status.redisConfigured
                  ? `REDIS_URL is set but Redis is not reachable${status.redisError ? ` (${status.redisError})` : ''}. The memory cache is used meanwhile — the shop keeps working.`
                  : 'Fast and safe for one server. For very high traffic or several servers, set REDIS_URL in the .env file.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tile('Answered from cache', `${status.hitRate}%`, Zap, 'var(--ds-success)')}
            {tile('Cache hits', status.hits.toLocaleString('en-US'), Gauge, 'var(--ds-indigo)')}
            {tile('Shared requests', status.coalesced.toLocaleString('en-US'), RefreshCw, 'var(--ds-amber)')}
            {tile(`Memory (${status.memoryEntries} items)`, formatBytes(status.memoryBytes), MemoryStick, 'var(--ds-violet)')}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="inline-flex items-start gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" /> Clearing is never needed after normal edits; use it if something looks out of date.
        </p>
        <Button icon={Trash2} onClick={flush} loading={busy}>
          Clear cache now
        </Button>
      </div>
      {note && (
        <p role="status" className="mt-2 font-semibold" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--ds-success-text)' }}>
          {note}
        </p>
      )}
    </Card>
  );
};
