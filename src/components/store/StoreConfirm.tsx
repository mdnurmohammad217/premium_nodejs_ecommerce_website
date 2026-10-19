import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { keepTabInside } from '../../lib/focusTrap.ts';

/**
 * v3.11 — the shop's own "are you sure?" card (it replaces the browser's plain
 * confirm box). Same look as the dashboard's dialog, but tiny, so the shop's
 * pages don't load the dashboard's UI kit. Cancel has the focus; Escape or a
 * tap outside cancels.
 */
export const StoreConfirm: React.FC<{
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Remove', cancelLabel = 'Cancel', onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelHandler = useRef(onCancel);
  cancelHandler.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelHandler.current();
      keepTabInside(event, cardRef.current);
    };
    const opener = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => cancelRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 ds-fade-in" style={{ background: 'rgba(15, 20, 30, 0.5)', backdropFilter: 'blur(3px)' }} onClick={onCancel} />
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="store-confirm-title"
        className="confirm-dialog relative w-full max-w-[380px] text-center bg-(--ds-surface) rounded-[20px] px-6 pt-7 pb-5"
        style={{ boxShadow: '0 24px 60px -16px rgba(19, 25, 34, 0.35), 0 0 0 1px var(--ds-border)' }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full inline-flex items-center justify-center text-(--ds-text-muted) hover:bg-(--ds-surface-2) cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <span
          className="confirm-dialog-icon mx-auto flex items-center justify-center w-16 h-16 rounded-full"
          style={{
            background: 'var(--ds-danger-soft)',
            color: 'var(--ds-danger)',
            boxShadow: '0 0 0 8px color-mix(in srgb, var(--ds-danger) 12%, transparent)',
          }}
        >
          <Trash2 className="w-7 h-7" />
        </span>
        <h3 id="store-confirm-title" className="mt-5 text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text) leading-snug">
          {title}
        </h3>
        {message && <div className="mt-2 text-(length:--ds-fs-base) text-(--ds-text-muted) leading-(--ds-lh-bn)">{message}</div>}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button ref={cancelRef} type="button" onClick={onCancel} className="ds-btn ds-btn-secondary h-11">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="ds-btn h-11 text-white font-(--ds-fw-semibold) active:scale-[0.98]"
            style={{ background: 'var(--ds-danger)', boxShadow: '0 8px 18px -8px var(--ds-danger)' }}
          >
            <Trash2 className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
