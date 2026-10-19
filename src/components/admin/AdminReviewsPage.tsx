import React, { useCallback, useEffect, useState } from 'react';
import { Star, MessageSquareText, Check, EyeOff, Trash2, Reply, Clock, ExternalLink, Settings2 } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  Badge,
  FilterPills,
  SearchInput,
  EmptyState,
  ErrorState,
  Pagination,
  Modal,
  ConfirmDialog,
  Thumb,
  useToasts,
  useDebounced,
  mix,
} from './ui.tsx';

interface ReviewRow {
  id: number;
  productId: number;
  userName: string;
  userPhone?: string | null;
  rating: number;
  comment: string;
  status: 'approved' | 'pending' | 'hidden';
  reply?: string | null;
  createdAt: string;
  productName?: string | null;
  productSlug?: string | null;
  productImage?: string | null;
}

const STATUS_LOOK: Record<string, { bg: string; fg: string; label: string }> = {
  approved: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Published' },
  pending: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Waiting' },
  hidden: { bg: 'var(--a-surface-3)', fg: 'var(--a-text-muted)', label: 'Hidden' },
};

const StarRow: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className="w-3.5 h-3.5" style={n <= value ? { fill: 'var(--ds-amber)', color: 'var(--ds-amber)' } : { color: 'var(--a-border-strong, #cbd5e1)' }} />
    ))}
  </span>
);

/**
 * Product reviews — publish, hide, answer or delete what shoppers wrote.
 * Whether new reviews need approval is set on the Product Page settings.
 */
export const AdminReviewsPage: React.FC<{ onOpenTab?: (tab: string) => void }> = ({ onOpenTab }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replying, setReplying] = useState<ReviewRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [deleting, setDeleting] = useState<ReviewRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ status, page: String(page), limit: String(pageSize) });
      if (debounced.trim()) query.set('search', debounced.trim());
      const res = await fetch(`/api/admin/reviews?${query.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load reviews.');
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total) || 0);
      setCounts(data.counts || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, debounced]);

  const update = async (row: ReviewRow, body: Record<string, any>, message: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update the review.');
      toasts.push(message);
      await load();
      return true;
    } catch (err: any) {
      toasts.push(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete the review.');
      toasts.push('Review deleted.');
      setDeleting(null);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const all = (counts.approved || 0) + (counts.pending || 0) + (counts.hidden || 0);

  return (
    <div>
      {toasts.node}
      <PageHeader
        title="Product Reviews"
        subtitle="Publish, hide or answer what customers wrote. Answers show under the review on the product page."
        icon={MessageSquareText}
        accent="var(--ds-amber)"
        actions={
          onOpenTab && (
            <Button icon={Settings2} onClick={() => onOpenTab('product-page')}>
              Review settings
            </Button>
          )
        }
      />

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <FilterPills
            active={status}
            onChange={setStatus}
            pills={[
              { id: 'all', label: 'All', count: all },
              { id: 'pending', label: 'Waiting', count: counts.pending || 0, color: 'var(--ds-amber)' },
              { id: 'approved', label: 'Published', count: counts.approved || 0, color: 'var(--ds-success)' },
              { id: 'hidden', label: 'Hidden', count: counts.hidden || 0, color: 'var(--ds-gray-500, #64748b)' },
            ]}
          />
        </div>
        <div className="md:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, text or product…" />
        </div>
      </div>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading && rows.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="a-card ds-skeleton" style={{ height: 118 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title={status === 'pending' ? 'Nothing is waiting for approval' : 'No reviews yet'}
            description="Reviews customers write on product pages appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3" style={{ opacity: loading ? 0.6 : 1 }}>
          {rows.map((row) => {
            const look = STATUS_LOOK[row.status] || STATUS_LOOK.hidden;
            return (
              <div key={row.id} className="a-card p-4" style={{ borderLeft: `4px solid ${look.fg}` }}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex items-start gap-3 lg:w-64 shrink-0 min-w-0">
                    <Thumb src={row.productImage} alt={row.productName || ''} size={48} />
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {row.productName || 'Deleted product'}
                      </p>
                      {row.productSlug && (
                        <a
                          href={`/product/${encodeURIComponent(row.productSlug)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))' }}
                        >
                          View product <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {row.userName}
                      </span>
                      <StarRow value={row.rating} />
                      <Badge tone={{ bg: look.bg, fg: look.fg }}>{look.label}</Badge>
                      <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(row.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {row.userPhone && (
                        <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {row.userPhone}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line break-words" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)' }}>
                      {row.comment}
                    </p>
                    {row.reply && (
                      <div className="mt-2.5 p-2.5" style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--primary)', 0.06), borderLeft: '3px solid var(--primary)' }}>
                        <p className="font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--primary-ink, var(--primary))' }}>
                          Your reply
                        </p>
                        <p className="whitespace-pre-line" style={{ fontSize: 'var(--a-fs-base)' }}>
                          {row.reply}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
                    {row.status !== 'approved' && (
                      <Button size="sm" variant="success" icon={Check} disabled={busy} onClick={() => update(row, { status: 'approved' }, 'Review published.')}>
                        Publish
                      </Button>
                    )}
                    {row.status !== 'hidden' && (
                      <Button size="sm" icon={EyeOff} disabled={busy} onClick={() => update(row, { status: 'hidden' }, 'Review hidden.')}>
                        Hide
                      </Button>
                    )}
                    <Button
                      size="sm"
                      icon={Reply}
                      disabled={busy}
                      onClick={() => {
                        setReplying(row);
                        setReplyText(row.reply || '');
                      }}
                    >
                      {row.reply ? 'Edit reply' : 'Reply'}
                    </Button>
                    <IconButton icon={Trash2} tone="danger" size="sm" label="Delete review" onClick={() => setDeleting(row)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > pageSize && (
        <div className="mt-4">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      <Modal
        open={Boolean(replying)}
        onClose={() => setReplying(null)}
        title="Reply to review"
        subtitle={replying ? `${replying.userName} · ${replying.productName || ''}` : ''}
        footer={
          <>
            {replying?.reply && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (replying && (await update(replying, { reply: '' }, 'Reply removed.'))) setReplying(null);
                }}
              >
                Remove reply
              </Button>
            )}
            <Button onClick={() => setReplying(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!replyText.trim()}
              onClick={async () => {
                if (replying && (await update(replying, { reply: replyText.trim(), ...(replying.status === 'pending' ? { status: 'approved' } : {}) }, 'Reply saved.')))
                  setReplying(null);
              }}
            >
              Save reply
            </Button>
          </>
        }
      >
        {replying && (
          <div className="space-y-3">
            <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-md)' }}>
              <StarRow value={replying.rating} />
              <p className="mt-1 whitespace-pre-line">{replying.comment}</p>
            </div>
            <textarea
              className="a-field"
              rows={5}
              maxLength={2000}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Thank you for your feedback! …"
              autoFocus
            />
            {replying.status === 'pending' && (
              <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Saving a reply also publishes this review.</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this review?"
        message="It is removed for good and the product’s star rating is recalculated."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
};
