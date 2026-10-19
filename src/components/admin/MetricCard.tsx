import React from 'react';
import { mix } from './ui.tsx';

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/**
 * A summary tile: the figure large, what it is, and the period it covers,
 * with a soft icon tile and a coloured rule along the bottom. Used by the
 * dashboard and the Expenses pages.
 */
export const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon: IconType;
  color?: string;
  /** icon on the right of the figure (dashboard) or left of it (expenses) */
  iconSide?: 'left' | 'right';
  loading?: boolean;
  onClick?: () => void;
}> = ({ label, value, note, icon: Icon, color = 'var(--primary)', iconSide = 'right', loading, onClick }) => {
  const iconTile = (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: 48, height: 48, borderRadius: 'var(--ds-r-md)', background: mix(color, 0.13), color }}
    >
      <Icon className="w-5 h-5" />
    </span>
  );
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => (event.key === 'Enter' || event.key === ' ') && onClick() : undefined}
      className={`a-card p-5 min-w-0 ${onClick ? 'ds-card-hover cursor-pointer' : ''}`}
      style={{ borderBottom: `3px solid ${mix(color, 0.55)}` }}
    >
      {loading ? (
        <div className="space-y-2.5">
          <span className="ds-skeleton block h-3 w-1/2" />
          <span className="ds-skeleton block h-7 w-2/3" />
          <span className="ds-skeleton block h-3 w-1/3" />
        </div>
      ) : iconSide === 'right' ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
              {label}
            </div>
            <div className="ds-num font-bold leading-tight mt-1.5 break-words" style={{ fontSize: 'var(--ds-fs-2xl)' }}>
              {value}
            </div>
            {note && (
              <div className="mt-1.5 truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                {note}
              </div>
            )}
          </div>
          {iconTile}
        </div>
      ) : (
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {iconTile}
            <div className="ds-num font-bold leading-tight min-w-0 break-words" style={{ fontSize: 'var(--ds-fs-xl)' }}>
              {value}
            </div>
          </div>
          <div className="mt-3 font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
            {label}
          </div>
          {note && (
            <div className="mt-0.5 truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              {note}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
