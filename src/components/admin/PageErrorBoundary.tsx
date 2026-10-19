import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * v3.9 — dashboard pages load on first use. Right after the app is updated an
 * open dashboard may ask for a page file that no longer exists; instead of a
 * blank screen this shows a short message and a Reload button. Any other error
 * inside one page is caught here too, so the menu keeps working.
 */
type Props = { resetKey?: string; children: React.ReactNode };
type State = { error: Error | null };

export class PageErrorBoundary extends (React.Component as any) {
  declare props: Props;
  declare setState: (next: State) => void;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.error('[dashboard] page failed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(String(this.state.error?.message || ''));
    return (
      <div className="ds-card p-6 text-center" role="alert" style={{ maxWidth: 520, margin: '40px auto' }}>
        <AlertTriangle className="w-8 h-8 mx-auto" style={{ color: 'var(--ds-warning, #d97706)' }} />
        <h2 className="mt-3 font-bold" style={{ fontSize: 'var(--a-fs-lg, 18px)' }}>
          {stale ? 'A new version of the dashboard was installed' : 'This page could not be shown'}
        </h2>
        <p className="mt-1.5" style={{ fontSize: 'var(--a-fs-md, 14px)', color: 'var(--a-text-muted, #64748b)' }}>
          {stale ? 'Reload once to open the latest version.' : 'Reload the page. If it happens again, open another page from the menu.'}
        </p>
        <button type="button" className="ds-btn ds-btn-primary mt-4" onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4" /> Reload
        </button>
      </div>
    );
  }
}
