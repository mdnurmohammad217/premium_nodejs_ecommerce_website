import React from 'react';
import { ShieldOff } from 'lucide-react';

interface BlockedScreenProps {
  /** Message from `/api/access-check` */
  message?: string | null;
  /** Reason the owner recorded against the block, when there is one */
  reason?: string | null;
  storeName?: string;
}

/**
 * Shown in place of the whole storefront when the visitor's address is on the
 * block list. Deliberately calm and without navigation: every other public
 * request would be refused anyway, so there is nothing to link to.
 */
export const BlockedScreen: React.FC<BlockedScreenProps> = ({ message, reason, storeName }) => (
  <main className="min-h-screen bg-(--ds-bg) flex items-center justify-center px-(--ds-s-4) py-(--ds-s-12)">
    <div className="ds-card ds-fade-in w-full max-w-md text-center p-(--ds-card-pad-lg)">
      <span className="mx-auto w-14 h-14 rounded-(--ds-r-full) bg-(--ds-surface-3) text-(--ds-text-muted) inline-flex items-center justify-center">
        <ShieldOff className="w-6 h-6" />
      </span>

      <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
        Access Temporarily Restricted
      </h1>

      <p className="mt-(--ds-s-3) text-(length:--ds-fs-md) leading-(--ds-lh-bn) text-(--ds-text-soft)">
        {message || "This site isn't available from your network right now."}
      </p>

      {reason && (
        <div className="mt-(--ds-s-5) rounded-(--ds-r-md) bg-(--ds-surface-2) border border-(--ds-border-soft) px-(--ds-s-4) py-(--ds-s-3) text-left">
          <p className="text-(length:--ds-fs-xs) font-(--ds-fw-semibold) uppercase tracking-wide text-(--ds-text-muted)">Reason</p>
          <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text)">{reason}</p>
        </div>
      )}

      <p className="mt-(--ds-s-6) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
        If you think this is a mistake, please contact{storeName ? ` ${storeName}` : ' us'}.
      </p>
    </div>
  </main>
);
