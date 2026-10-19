import React, { useCallback, useEffect, useState } from 'react';
import { Images, RefreshCw, FolderOpen, Database, ShieldCheck, AlertTriangle, HardDrive } from 'lucide-react';
import { Card, CardHeader, Button, mix } from './ui.tsx';

interface MediaStatus {
  uploadsDir: string;
  insideApp: boolean;
  configured: boolean;
  enabled: boolean;
  databaseFiles: number;
  databaseBytes: number;
  diskFiles: number;
  diskBytes: number;
  restoredSinceStart: number;
  tableMissing: boolean;
  backfill: { running: boolean; done: boolean; copied: number; failed: number };
}

const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    : bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes > 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${bytes} B`;

/**
 * Where uploaded images live, and whether each one also has a copy in the
 * database (System Configuration → Database & Cache).
 */
export const MediaStorageCard: React.FC = () => {
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/media/status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not read the image storage status.');
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const safe = Boolean(status?.enabled && !status?.tableMissing);
  const accent = safe ? 'var(--ds-success)' : 'var(--ds-amber)';
  const pending = status ? Math.max(0, status.diskFiles - status.databaseFiles) : 0;

  const tile = (label: string, value: React.ReactNode, Icon: React.ComponentType<{ className?: string }>, color: string) => (
    <div className="p-3 min-w-0" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
      <span className="inline-flex items-center justify-center mb-2" style={{ width: 30, height: 30, borderRadius: 8, background: mix(color, 0.12), color }}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="ds-num font-bold truncate" style={{ fontSize: 'var(--a-fs-xl)' }}>
        {value}
      </p>
      <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{label}</p>
    </div>
  );

  return (
    <Card accent={accent}>
      <CardHeader
        title="Uploaded images"
        subtitle="Logos, banners, product and category photos. Every upload is kept in the images folder and a copy is kept in the database."
        icon={Images}
        accent={accent}
        actions={<Button size="sm" icon={RefreshCw} onClick={load} aria-label="Refresh" />}
      />

      {error && <p className="font-semibold mb-3" style={{ color: 'var(--ds-danger-text)' }}>{error}</p>}

      {status && (
        <>
          <div
            className="flex items-start gap-3 p-3 mb-4"
            style={{ borderRadius: 'var(--ds-r-md)', background: mix(accent, 0.08), color: safe ? 'var(--ds-success-text)' : 'var(--ds-warning-text)' }}
          >
            {safe ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div className="min-w-0" style={{ fontSize: 'var(--a-fs-md)' }}>
              <p className="font-bold">
                {safe
                  ? 'Images are protected — they survive updates and redeploys'
                  : status.enabled
                  ? 'Database copy not ready yet'
                  : 'Database copy is switched off (MEDIA_DB_BACKUP=off)'}
              </p>
              <p style={{ color: 'var(--a-text-soft)', fontSize: 'var(--a-fs-sm)' }}>
                {safe
                  ? 'If the images folder is ever emptied or replaced, each image is written back from the database the first time it is opened.'
                  : status.enabled
                  ? 'The table is created automatically on start. Restart the app once; if this stays, check System Configuration → Database for errors.'
                  : 'Images live only in the folder below. Keep that folder when you update the app.'}
                {status.backfill?.running ? ' Copying older images into the database now…' : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tile('Images in the folder', status.diskFiles.toLocaleString('en-US'), HardDrive, 'var(--ds-indigo)')}
            {tile('Copies in the database', status.databaseFiles.toLocaleString('en-US'), Database, 'var(--ds-success)')}
            {tile('Database copy size', formatBytes(status.databaseBytes), Database, 'var(--ds-violet)')}
            {tile('Restored since start', status.restoredSinceStart.toLocaleString('en-US'), RefreshCw, 'var(--ds-amber)')}
          </div>

          <div
            className="mt-4 p-3 flex items-start gap-2 min-w-0"
            style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}
          >
            <FolderOpen className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p>
                Images folder:{' '}
                <code className="ds-num break-all" style={{ color: 'var(--a-text)' }}>
                  {status.uploadsDir}
                </code>
              </p>
              {status.insideApp && (
                <p className="mt-1" style={{ color: 'var(--ds-warning-text)' }}>
                  This folder is inside the app folder, so an update may replace it. The database copy covers that; to keep
                  the files themselves too, set <code>UPLOADS_DIR</code> in the .env file to a folder outside the app.
                </p>
              )}
              {pending > 0 && status.enabled && !status.backfill?.running && (
                <p className="mt-1">{pending} older image(s) are copied into the database in the background after each start.</p>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
