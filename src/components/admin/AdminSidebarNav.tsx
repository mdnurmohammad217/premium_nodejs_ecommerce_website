import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { tint } from './ui.tsx';

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/**
 * v3.10 — which menu entries the signed-in account may open. The layout
 * provides it; an entry the account cannot open is simply not drawn, a group
 * keeps only its allowed rows, and a heading with nothing under it disappears.
 */
export const SidebarAccessContext = React.createContext<(id: string) => boolean>(() => true);

/**
 * Sidebar building blocks.
 *
 * One label size and weight across the whole nav so it reads as a single list;
 * the active row is a soft tint plus a left marker rather than a saturated
 * block, which keeps a long menu calm while still being obvious at a glance.
 *
 * Every part takes `collapsed`. In that state the sidebar is a 76px icon rail:
 * labels disappear, a tooltip carries the name, and a group opens as a floating
 * flyout instead of pushing the list down.
 */

export const SidebarSection: React.FC<{ title: string; collapsed?: boolean; tabs?: string[] }> = ({
  title,
  collapsed,
  tabs,
}) => {
  const can = React.useContext(SidebarAccessContext);
  if (tabs && !tabs.some((id) => can(id))) return null;
  if (collapsed) {
    // A hairline stands in for the heading so the grouping survives collapse
    return (
      <div className="px-3 py-3">
        <span className="block" style={{ height: 1, background: 'var(--a-border)' }} />
      </div>
    );
  }
  return (
    <div
      className="px-3 pt-5 pb-1.5 font-bold uppercase"
      style={{
        fontSize: 'var(--a-fs-2xs)',
        letterSpacing: '0.09em',
        color: 'var(--a-text-faint)',
      }}
    >
      {title}
    </div>
  );
};

interface SidebarItemProps {
  id: string;
  label: string;
  icon: IconType;
  activeTab: string;
  onSelect: (id: any) => void;
  badge?: number;
  alert?: boolean;
  collapsed?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  label,
  icon: Icon,
  activeTab,
  onSelect,
  badge,
  alert,
  collapsed,
}) => {
  const isActive = activeTab === id;
  const can = React.useContext(SidebarAccessContext);
  if (!can(id)) return null;

  return (
    <button
      onClick={() => onSelect(id)}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={`relative w-full rounded-[var(--ds-r-md)] font-semibold flex items-center transition-all cursor-pointer text-left ${
        collapsed ? 'justify-center' : 'justify-between'
      }`}
      style={{
        height: 40,
        padding: collapsed ? 0 : '0 10px',
        fontSize: 'var(--a-fs-md)',
        background: isActive ? tint(0.11) : 'transparent',
        color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
      }}
      onMouseEnter={(event) => {
        if (!isActive) event.currentTarget.style.background = 'var(--a-surface-3)';
      }}
      onMouseLeave={(event) => {
        if (!isActive) event.currentTarget.style.background = 'transparent';
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: 3, height: 18, background: 'var(--primary)' }}
        />
      )}

      <span className={`flex items-center min-w-0 ${collapsed ? '' : 'gap-2.5'}`}>
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </span>

      {collapsed ? (
        (badge !== undefined && badge > 0) || alert ? (
          <span
            className="absolute top-1 right-1 rounded-full"
            style={{
              width: 7,
              height: 7,
              background: alert ? 'var(--ds-warning)' : 'var(--primary)',
            }}
          />
        ) : null
      ) : (
        <span className="flex items-center gap-1.5 shrink-0">
          {badge !== undefined && badge > 0 && (
            <span
              className="px-1.5 rounded-full font-bold ds-num"
              style={{
                fontSize: 'var(--a-fs-2xs)',
                background: tint(0.15),
                color: 'var(--primary-ink, var(--primary))',
              }}
            >
              {badge}
            </span>
          )}
          {alert && (
            <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--ds-warning)' }} />
          )}
        </span>
      )}
    </button>
  );
};

interface SidebarGroupProps {
  label: string;
  icon: IconType;
  activeTab: string;
  items: Array<{ id: string; label: string; badge?: number }>;
  onSelect: (id: any) => void;
  badge?: number;
  collapsed?: boolean;
}

export const SidebarGroup: React.FC<SidebarGroupProps> = ({
  label,
  icon: Icon,
  activeTab,
  items: allItems,
  onSelect,
  badge,
  collapsed,
}) => {
  const can = React.useContext(SidebarAccessContext);
  const items = allItems.filter((item) => can(item.id));
  const containsActive = items.some((item) => item.id === activeTab);
  const [open, setOpen] = useState(containsActive);
  const [flyout, setFlyout] = useState(false);

  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  if (items.length === 0) return null;

  const childRow = (item: { id: string; label: string; badge?: number }) => {
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onSelect(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className="w-full rounded-[var(--ds-r-sm)] font-medium flex items-center gap-2 text-left transition-all cursor-pointer"
        style={{
          height: 34,
          padding: '0 10px',
          fontSize: 'var(--a-fs-md)',
          background: isActive ? tint(0.12) : 'transparent',
          color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-muted)',
          fontWeight: isActive ? 600 : 500,
        }}
        onMouseEnter={(event) => {
          if (!isActive) event.currentTarget.style.background = 'var(--a-surface-3)';
        }}
        onMouseLeave={(event) => {
          if (!isActive) event.currentTarget.style.background = 'transparent';
        }}
      >
        <span
          className="rounded-full shrink-0"
          style={{
            width: 5,
            height: 5,
            background: isActive ? 'var(--primary)' : 'var(--ds-gray-300)',
          }}
        />
        <span className="truncate flex-1">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className="px-1.5 rounded-full font-bold ds-num shrink-0"
            style={{ fontSize: 'var(--a-fs-2xs)', background: tint(0.15), color: 'var(--primary-ink, var(--primary))' }}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  /* Collapsed: an icon that opens the children beside the rail on hover */
  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setFlyout(true)}
        onMouseLeave={() => setFlyout(false)}
      >
        <button
          title={label}
          onClick={() => setFlyout((value) => !value)}
          className="relative w-full rounded-[var(--ds-r-md)] flex items-center justify-center cursor-pointer transition-all"
          style={{
            height: 40,
            background: containsActive ? tint(0.11) : 'transparent',
            color: containsActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
          }}
        >
          <Icon className="w-[18px] h-[18px]" />
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute top-1 right-1 rounded-full"
              style={{ width: 7, height: 7, background: 'var(--primary)' }}
            />
          )}
        </button>

        {flyout && (
          <div
            className="absolute left-full top-0 ml-1.5 p-1.5 ds-fade-in"
            style={{
              minWidth: 190,
              background: 'var(--a-surface)',
              border: '1px solid var(--a-border)',
              borderRadius: 'var(--ds-r-lg)',
              boxShadow: 'var(--ds-shadow-lg)',
              zIndex: 'var(--ds-z-dropdown)' as any,
            }}
          >
            <div
              className="px-2.5 pt-1 pb-2 font-bold uppercase"
              style={{ fontSize: 'var(--a-fs-2xs)', letterSpacing: '0.08em', color: 'var(--a-text-faint)' }}
            >
              {label}
            </div>
            <div className="space-y-0.5">{items.map(childRow)}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="relative w-full rounded-[var(--ds-r-md)] font-semibold flex items-center justify-between transition-all cursor-pointer text-left"
        style={{
          height: 40,
          padding: '0 10px',
          fontSize: 'var(--a-fs-md)',
          background: containsActive && !open ? tint(0.08) : 'transparent',
          color: containsActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
        }}
        onMouseEnter={(event) => {
          if (!containsActive) event.currentTarget.style.background = 'var(--a-surface-3)';
        }}
        onMouseLeave={(event) => {
          if (!containsActive) event.currentTarget.style.background = 'transparent';
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Icon className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate">{label}</span>
        </span>

        <span className="flex items-center gap-1.5">
          {badge !== undefined && badge > 0 && (
            <span
              className="px-1.5 rounded-full font-bold ds-num"
              style={{ fontSize: 'var(--a-fs-2xs)', background: tint(0.15), color: 'var(--primary-ink, var(--primary))' }}
            >
              {badge}
            </span>
          )}
          <ChevronDown
            className="w-4 h-4"
            style={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--ds-dur) var(--ds-ease)',
            }}
          />
        </span>
      </button>

      {open && (
        <div
          className="mt-0.5 space-y-0.5 ml-[19px] pl-3"
          style={{ borderLeft: '1px solid var(--a-border)' }}
        >
          {items.map(childRow)}
        </div>
      )}
    </div>
  );
};
