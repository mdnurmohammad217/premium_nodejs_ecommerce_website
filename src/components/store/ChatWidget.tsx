import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Phone, Mail, MessageSquare, Link2, Headphones, MessagesSquare, ChevronRight } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { BRAND_ICONS } from './BrandIcons.tsx';
import { LiveChatPanel, useLiveChat, type LiveChatConfig } from './LiveChatPanel.tsx';
import { useT } from '../../lib/i18n.tsx';

export type ChatChannelType =
  | 'whatsapp'
  | 'messenger'
  | 'call'
  | 'sms'
  | 'email'
  | 'telegram'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'youtube'
  | 'viber'
  | 'custom';

export interface ChatChannel {
  id: string;
  type: ChatChannelType;
  label?: string;
  value: string;
  enabled?: boolean;
}

export type ChatPosition = 'bottom-right' | 'bottom-left' | 'middle-right' | 'middle-left' | 'top-right' | 'top-left';

const TelegramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1.1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z" />
  </svg>
);
const ViberIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11.4 1.2c-2 0-6 .2-8 2.1C1.8 4.9 1.3 7.2 1.2 10.1c0 2.9-.1 8.3 5.1 9.8v2.3s0 .9.6 1.1c.7.2 1.1-.5 1.8-1.2l1.3-1.5c3.6.3 6.3-.4 6.6-.5.7-.2 4.8-.8 5.4-6.2.7-5.6-.3-9.1-2.2-10.7-.6-.5-2.8-1.9-7.3-2h-1.1zm-3.3 4.3c.4 0 .7.3 1 .6.4.5.8 1 1.1 1.5.3.6 0 1.2-.3 1.5l-.5.4c-.3.2-.3.6-.3.6s.7 2.6 3.3 3.3c0 0 .4 0 .6-.3l.4-.5c.3-.4.9-.7 1.4-.3.5.3 1 .7 1.4 1.1.4.4.7.9.2 1.5-.5.7-1.1 1.2-1.8 1-.9-.2-2.8-1.3-4.1-2.2C7.3 11.8 6 9.4 5.5 7.5c-.2-.7.3-1.3.9-1.8.2-.2.5-.3.8-.3z" />
  </svg>
);

/** Look of each channel: icon, brand colour, default label, what to type */
export const CHANNEL_META: Record<ChatChannelType, { label: string; color: string; icon: React.ComponentType<any>; hint: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: BRAND_ICONS.whatsapp, hint: 'Phone number, e.g. 01XXXXXXXXX' },
  messenger: { label: 'Messenger', color: 'linear-gradient(135deg,#0099FF,#A033FF 60%,#FF5280)', icon: BRAND_ICONS.messenger, hint: 'Page username or m.me link' },
  call: { label: 'Call us', color: '#0F8A5F', icon: Phone, hint: 'Phone number' },
  sms: { label: 'SMS', color: '#0EA5E9', icon: MessageSquare, hint: 'Phone number' },
  email: { label: 'Email', color: '#6366F1', icon: Mail, hint: 'Email address' },
  telegram: { label: 'Telegram', color: '#229ED9', icon: TelegramIcon, hint: 'Username, e.g. yourshop' },
  instagram: { label: 'Instagram', color: 'linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF)', icon: BRAND_ICONS.instagram, hint: 'Username (opens a direct message)' },
  tiktok: { label: 'TikTok', color: '#111111', icon: BRAND_ICONS.tiktok, hint: 'Username, e.g. @yourshop' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: BRAND_ICONS.facebook, hint: 'Page link' },
  youtube: { label: 'YouTube', color: '#FF0000', icon: BRAND_ICONS.youtube, hint: 'Channel link' },
  viber: { label: 'Viber', color: '#7360F2', icon: ViberIcon, hint: 'Phone number' },
  custom: { label: 'Link', color: '#475569', icon: Link2, hint: 'Any web link' },
};

const bdIntl = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
  return digits;
};
const handle = (raw: string) =>
  raw
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

/** The link a channel opens; `message` pre-fills WhatsApp / SMS / Telegram */
export function channelHref(channel: ChatChannel, message = ''): string {
  const value = String(channel.value || '').trim();
  if (!value) return '';
  const text = message ? encodeURIComponent(message) : '';
  switch (channel.type) {
    case 'whatsapp':
      return `https://wa.me/${bdIntl(value)}${text ? `?text=${text}` : ''}`;
    case 'messenger':
      return /^https?:\/\//i.test(value) ? value : `https://m.me/${handle(value)}`;
    case 'call':
      return `tel:${value.replace(/[^\d+]/g, '')}`;
    case 'sms':
      return `sms:${value.replace(/[^\d+]/g, '')}${text ? `?body=${text}` : ''}`;
    case 'email':
      return `mailto:${value}`;
    case 'telegram':
      return `https://t.me/${handle(value)}${text ? `?text=${text}` : ''}`;
    case 'instagram':
      return /^https?:\/\//i.test(value) ? value : `https://ig.me/m/${handle(value)}`;
    case 'tiktok':
      return /^https?:\/\//i.test(value) ? value : `https://www.tiktok.com/@${handle(value)}`;
    case 'viber':
      return `viber://chat?number=%2B${bdIntl(value)}`;
    default:
      return /^(https?:|mailto:|tel:)/i.test(value) ? value : `https://${value}`;
  }
}

/** Channels from the new list, or from the older single-number settings */
export function chatChannelsOf(cfg: any): ChatChannel[] {
  if (Array.isArray(cfg?.channels)) {
    return cfg.channels.filter((c: ChatChannel) => c && c.enabled !== false && String(c.value || '').trim());
  }
  const legacy: ChatChannel[] = [];
  if (cfg?.whatsappNumber) legacy.push({ id: 'wa', type: 'whatsapp', value: cfg.whatsappNumber });
  if (cfg?.messengerUrl) legacy.push({ id: 'ms', type: 'messenger', value: cfg.messengerUrl });
  if (cfg?.phone) legacy.push({ id: 'call', type: 'call', value: cfg.phone });
  return legacy;
}

export const LAUNCHER_ICONS: Record<string, React.ComponentType<any>> = {
  chat: MessageCircle,
  whatsapp: BRAND_ICONS.whatsapp,
  headset: Headphones,
  phone: Phone,
};

/** Open now? (business hours, visitor's clock) */
function isOpenNow(hours: any): boolean {
  if (!hours?.enabled) return true;
  const [oh, om] = String(hours.open || '09:00').split(':').map(Number);
  const [ch, cm] = String(hours.close || '22:00').split(':').map(Number);
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = oh * 60 + (om || 0);
  const close = ch * 60 + (cm || 0);
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

interface ChatWidgetProps {
  settings?: SiteSettings;
  /** Sit above the mobile bottom bar instead of the screen edge */
  raised?: boolean;
  currentView?: string;
  /** Name + link of the product being viewed, for a pre-filled message */
  currentProduct?: { name: string; url: string } | null;
  /** Dashboard preview: placed inside a frame, not on the page */
  preview?: boolean;
  previewConfig?: any;
  previewMobile?: boolean;
}

/**
 * Floating contact button (Dashboard → Marketing & Tools → Chat Widget):
 * WhatsApp, Messenger, call, Telegram, Instagram, TikTok… in any corner or
 * edge, as a popup card or a fan of icons, with business hours, a one-time
 * greeting bubble and a message pre-filled with the product being viewed.
 */
export const ChatWidget: React.FC<ChatWidgetProps> = ({
  settings,
  raised,
  currentView,
  currentProduct,
  preview,
  previewConfig,
  previewMobile,
}) => {
  const cfg: any = previewConfig || (settings as any)?.chat_config || {};
  const [open, setOpen] = useState(Boolean(preview));
  const [bubble, setBubble] = useState(false);
  const [screenMobile, setScreenMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const isMobile = preview ? Boolean(previewMobile) : screenMobile;

  useEffect(() => {
    if (preview) return;
    const onResize = () => setScreenMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [preview]);

  const t = useT();
  const channels = useMemo(() => chatChannelsOf(cfg), [cfg]);
  // v3.14 — live chat: a chat box on the website itself (answered in Dashboard → Live Chat)
  const live: LiveChatConfig = cfg.liveChat || {};
  const liveOn = live.enabled === true;
  const onlyLive = liveOn && channels.length === 0;
  const [view, setView] = useState<'list' | 'chat'>('list');
  const hidden =
    !preview &&
    (cfg.enabled === false ||
      (channels.length === 0 && !liveOn) ||
      (isMobile && cfg.showOnMobile === false) ||
      (!isMobile && cfg.showOnDesktop === false) ||
      (Array.isArray(cfg.hideOnPages) && Boolean(currentView) && cfg.hideOnPages.includes(currentView)));

  // Greeting bubble: once per visit, after a short delay
  useEffect(() => {
    if (hidden || preview || !cfg.greetingBubble?.enabled || !cfg.greetingBubble?.text) return;
    try {
      if (sessionStorage.getItem('chat-bubble-shown')) return;
    } catch {
      /* private mode */
    }
    const timer = window.setTimeout(() => {
      setBubble(true);
      try {
        sessionStorage.setItem('chat-bubble-shown', '1');
      } catch {
        /* ignore */
      }
    }, Math.max(1, Number(cfg.greetingBubble.delaySec) || 6) * 1000);
    return () => window.clearTimeout(timer);
  }, [hidden, preview, cfg.greetingBubble?.enabled, cfg.greetingBubble?.text, cfg.greetingBubble?.delaySec]);

  const chatShown = open && (onlyLive || view === 'chat');
  const chat = useLiveChat(liveOn && !preview && !hidden, chatShown);

  if (hidden || (channels.length === 0 && !liveOn)) return null;

  const position: ChatPosition = cfg.position || 'bottom-right';
  const [vertical, horizontal] = position.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'right'];
  const offsetX = Math.max(0, Number(cfg.offsetX ?? 20));
  const offsetY = Math.max(0, Number(cfg.offsetY ?? 20));
  const accent = cfg.launcherColor || 'var(--primary)';
  const style: 'popup' | 'stack' = cfg.style === 'stack' ? 'stack' : 'popup';
  const online = isOpenNow(cfg.businessHours);
  const LauncherIcon = LAUNCHER_ICONS[cfg.launcherIcon || 'chat'] || MessageCircle;
  const message = String(cfg.whatsappMessage || 'Hello! I have a question{product}.').replace(
    '{product}',
    currentProduct ? ` about ${currentProduct.name} (${currentProduct.url})` : ''
  );

  // Placement; lifted above the phone's bottom bar when it is showing
  const place: React.CSSProperties = { position: preview ? 'absolute' : 'fixed' };
  place[horizontal] = offsetX;
  if (vertical === 'bottom') {
    place.bottom = `calc(${offsetY}px + env(safe-area-inset-bottom) + ${raised && isMobile && !preview ? 64 : 0}px)`;
  } else if (vertical === 'top') {
    place.top = preview ? offsetY : `calc(${offsetY}px + var(--store-header-h, 72px))`;
  } else {
    place.top = '50%';
    place.transform = 'translateY(-50%)';
  }

  const alignItems = horizontal === 'right' ? 'items-end' : 'items-start';
  const sideways = vertical === 'middle';
  const launcherFirst = vertical === 'top';

  const channelLink = (channel: ChatChannel, compact: boolean) => {
    const meta = CHANNEL_META[channel.type] || CHANNEL_META.custom;
    const Icon = meta.icon;
    const href = channelHref(channel, message);
    const label = channel.label || meta.label;
    const external = /^https?:/i.test(href);
    const detail =
      ['whatsapp', 'call', 'sms', 'viber', 'email'].includes(channel.type) ? channel.value : 'Tap to open';
    return (
      <a
        key={channel.id}
        href={preview ? undefined : href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        aria-label={label}
        title={label}
        className={
          compact
            ? 'group/ch relative w-12 h-12 rounded-(--ds-r-full) inline-flex items-center justify-center text-white shadow-(--ds-shadow-md) hover:scale-110 transition-transform'
            : 'flex items-center gap-(--ds-s-3) px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-md) hover:bg-(--ds-surface-3) transition-colors'
        }
        style={compact ? { background: meta.color } : undefined}
      >
        {compact ? (
          <>
            <Icon className="w-6 h-6" />
            <span
              className={`pointer-events-none absolute ${horizontal === 'right' ? 'right-full mr-2' : 'left-full ml-2'} whitespace-nowrap px-2 py-1 rounded-(--ds-r-sm) bg-(--ds-gray-900) text-white text-(length:--ds-fs-xs) font-(--ds-fw-semibold) opacity-0 group-hover/ch:opacity-100 transition-opacity`}
            >
              {label}
            </span>
          </>
        ) : (
          <>
            <span className="w-10 h-10 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white" style={{ background: meta.color }}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) truncate">{label}</span>
              <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate ds-num">{detail}</span>
            </span>
          </>
        )}
      </a>
    );
  };

  /*
   * v3.12.2 — one contact option: the floating button IS that option (its own
   * icon and brand colour) and opens it straight away. Two or more: the
   * button opens the list / row of icons to choose from, as before.
   */
  const single = channels.length === 1 && !liveOn ? channels[0] : null;
  const singleMeta = single ? CHANNEL_META[single.type] || CHANNEL_META.custom : null;
  const singleHref = single ? channelHref(single, message) : '';
  const singleExternal = /^https?:/i.test(singleHref);
  const singleLabel = single ? single.label || singleMeta!.label : '';
  const openSingle = () => {
    if (preview || !singleHref) return;
    if (singleExternal) window.open(singleHref, '_blank', 'noopener,noreferrer');
    else window.location.href = singleHref;
  };

  const singleLauncher = single && singleMeta && (
    <div className={`flex items-center gap-(--ds-s-2) ${horizontal === 'right' ? 'flex-row-reverse' : ''}`}>
      <a
        href={preview ? undefined : singleHref}
        target={singleExternal ? '_blank' : undefined}
        rel={singleExternal ? 'noopener noreferrer' : undefined}
        onClick={() => setBubble(false)}
        aria-label={singleLabel}
        title={singleLabel}
        className={`relative w-14 h-14 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white shadow-(--ds-shadow-lg) hover:scale-105 active:scale-95 transition-transform cursor-pointer ${
          cfg.pulse !== false ? 'chat-pulse' : ''
        }`}
        style={{ background: singleMeta.color }}
      >
        <singleMeta.icon className="w-7 h-7" />
        {cfg.businessHours?.enabled && (
          <span
            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-(--ds-r-full) ring-2 ring-white"
            style={{ background: online ? '#22c55e' : '#94a3b8' }}
          />
        )}
      </a>
      {cfg.launcherLabel && !isMobile && (
        <a
          href={preview ? undefined : singleHref}
          target={singleExternal ? '_blank' : undefined}
          rel={singleExternal ? 'noopener noreferrer' : undefined}
          onClick={() => setBubble(false)}
          className="inline-flex items-center h-10 px-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-text) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) shadow-(--ds-shadow-md) cursor-pointer whitespace-nowrap"
        >
          {cfg.launcherLabel}
        </a>
      )}
    </div>
  );

  const launcher = singleLauncher || (
    <div className={`flex items-center gap-(--ds-s-2) ${horizontal === 'right' ? 'flex-row-reverse' : ''}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setView('list');
          setBubble(false);
        }}
        aria-label={open ? t('Close') : onlyLive ? t('Live chat') : t('Contact us')}
        aria-expanded={open}
        className={`relative w-14 h-14 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white shadow-(--ds-shadow-lg) hover:scale-105 active:scale-95 transition-transform cursor-pointer ${
          cfg.pulse !== false && !open ? 'chat-pulse' : ''
        }`}
        style={{ background: accent }}
      >
        <span className={`absolute inset-0 inline-flex items-center justify-center transition-all duration-300 ${open ? 'rotate-90 opacity-0' : 'opacity-100'}`}>
          {onlyLive && !cfg.launcherIcon ? <MessagesSquare className="w-7 h-7" /> : <LauncherIcon className="w-7 h-7" />}
        </span>
        {liveOn && !open && chat.unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-(--ds-r-full) bg-(--ds-danger) text-white text-[11px] font-(--ds-fw-bold) inline-flex items-center justify-center ring-2 ring-white ds-num" aria-label={t('{n} new messages', { n: chat.unread })}>
            {chat.unread > 9 ? '9+' : chat.unread}
          </span>
        )}
        <span className={`absolute inset-0 inline-flex items-center justify-center transition-all duration-300 ${open ? 'opacity-100' : '-rotate-90 opacity-0'}`}>
          <X className="w-6 h-6" />
        </span>
        {cfg.businessHours?.enabled && (
          <span
            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-(--ds-r-full) ring-2 ring-white"
            style={{ background: online ? '#22c55e' : '#94a3b8' }}
          />
        )}
      </button>
      {cfg.launcherLabel && !open && !isMobile && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center h-10 px-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-text) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) shadow-(--ds-shadow-md) cursor-pointer whitespace-nowrap"
        >
          {cfg.launcherLabel}
        </button>
      )}
    </div>
  );

  const bubbleNode = bubble && !open && (
    <div
      role="status"
      className="relative max-w-60 px-(--ds-s-4) py-(--ds-s-3) rounded-(--ds-r-lg) bg-(--ds-surface) text-(--ds-text) text-(length:--ds-fs-sm) shadow-(--ds-shadow-lg) ds-fade-in"
    >
      <button
        type="button"
        aria-label="Hide message"
        onClick={() => setBubble(false)}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-(--ds-r-full) bg-(--ds-surface) shadow-(--ds-shadow-sm) inline-flex items-center justify-center text-(--ds-text-muted) cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="text-left cursor-pointer"
        onClick={() => {
          setBubble(false);
          if (single) openSingle();
          else {
            setOpen(true);
            if (onlyLive) setView('chat');
          }
        }}
      >
        {cfg.greetingBubble.text}
      </button>
    </div>
  );

  const closeChat = () => {
    setOpen(false);
    setView('list');
  };
  const liveLabel = live.label || t('Live chat');
  const liveRow = (compact: boolean) =>
    compact ? (
      <button
        key="live-chat"
        type="button"
        onClick={() => setView('chat')}
        aria-label={liveLabel}
        title={liveLabel}
        className="group/ch relative w-12 h-12 rounded-(--ds-r-full) inline-flex items-center justify-center text-white shadow-(--ds-shadow-md) hover:scale-110 transition-transform cursor-pointer"
        style={{ background: accent }}
      >
        <MessagesSquare className="w-6 h-6" />
        {chat.unread > 0 && <span className="absolute -top-1 -end-1 w-3.5 h-3.5 rounded-(--ds-r-full) bg-(--ds-danger) ring-2 ring-white" />}
      </button>
    ) : (
      <button
        key="live-chat"
        type="button"
        onClick={() => setView('chat')}
        className="w-full flex items-center gap-(--ds-s-3) px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-md) hover:bg-(--ds-surface-3) transition-colors text-start cursor-pointer"
      >
        <span className="relative w-10 h-10 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white" style={{ background: accent }}>
          <MessagesSquare className="w-5 h-5" />
          <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-(--ds-r-full) ring-2 ring-white" style={{ background: online ? '#22c55e' : '#94a3b8' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) truncate">{liveLabel}</span>
          <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate">{chat.token ? t('Continue your chat') : t('Chat with us right here')}</span>
        </span>
        {chat.unread > 0 ? (
          <span className="min-w-5 h-5 px-1 rounded-(--ds-r-full) bg-(--ds-danger) text-white text-[11px] font-(--ds-fw-bold) inline-flex items-center justify-center ds-num">{chat.unread}</span>
        ) : (
          <ChevronRight className="w-4 h-4 text-(--ds-text-muted) rtl:rotate-180" aria-hidden />
        )}
      </button>
    );

  const chatPanel = chatShown && (
    <LiveChatPanel
      cfg={live}
      chat={preview ? null : chat}
      accent={accent}
      agentPhoto={cfg.agentPhoto}
      open={online}
      offlineText={cfg.businessHours?.enabled ? cfg.businessHours?.offlineText : ''}
      onClose={closeChat}
      onBack={onlyLive ? undefined : () => setView('list')}
      fullscreen={isMobile && !preview}
      preview={preview}
      transformOrigin={`${launcherFirst ? 'top' : 'bottom'} ${horizontal}`}
    />
  );

  const panel =
    open &&
    !single &&
    (chatShown ? (
      isMobile && !preview && typeof document !== 'undefined' ? createPortal(chatPanel, document.body) : chatPanel
    ) : style === 'stack' ? (
      <div className={`flex ${sideways ? 'flex-col' : 'flex-col'} ${alignItems} gap-(--ds-s-2) ds-fade-in`}>
        {liveOn && liveRow(true)}
        {channels.map((channel) => channelLink(channel, true))}
      </div>
    ) : (
      <div
        role="dialog"
        aria-label={cfg.title || 'Contact us'}
        className="w-[min(320px,calc(100vw-32px))] rounded-(--ds-r-xl) bg-(--ds-surface) shadow-(--ds-shadow-xl) overflow-hidden ds-scale-in"
        style={{ transformOrigin: `${launcherFirst ? 'top' : 'bottom'} ${horizontal}` }}
      >
        <div className="px-(--ds-s-4) py-(--ds-s-4) text-white" style={{ background: accent }}>
          <div className="flex items-center gap-(--ds-s-3)">
            {cfg.agentPhoto ? (
              <img src={cfg.agentPhoto} alt="" className="w-11 h-11 rounded-(--ds-r-full) object-cover ring-2 ring-white/60" />
            ) : (
              <span className="w-11 h-11 rounded-(--ds-r-full) bg-white/20 inline-flex items-center justify-center">
                <Headphones className="w-5 h-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="font-(--ds-fw-bold) text-(length:--ds-fs-md) truncate">{cfg.title || 'Need help?'}</div>
              <div className="flex items-center gap-1.5 text-(length:--ds-fs-xs) opacity-90">
                <span className="w-2 h-2 rounded-(--ds-r-full)" style={{ background: online ? '#86efac' : '#cbd5e1' }} />
                {online ? cfg.onlineText || 'Online — we reply fast' : cfg.businessHours?.offlineText || 'Offline now — leave us a message'}
              </div>
            </div>
          </div>
          {(cfg.greeting || cfg.supportText) && (
            <p className="mt-(--ds-s-3) text-(length:--ds-fs-sm) opacity-95 leading-relaxed">{cfg.greeting || cfg.supportText}</p>
          )}
        </div>
        <div className="p-(--ds-s-2) max-h-[50vh] overflow-y-auto">
          {liveOn && liveRow(false)}
          {channels.map((channel) => channelLink(channel, false))}
        </div>
      </div>
    ));

  return (
    <div
      data-chat-widget={preview ? undefined : vertical === 'bottom' ? horizontal : undefined}
      className={`z-(--ds-z-sticky) flex ${
        sideways ? (horizontal === 'right' ? 'flex-row-reverse items-center' : 'flex-row items-center') : `flex-col ${alignItems}`
      } gap-(--ds-s-3) print:hidden`}
      style={place}
    >
      {launcherFirst && !sideways ? (
        <>
          {launcher}
          {bubbleNode}
          {panel}
        </>
      ) : sideways ? (
        <>
          {launcher}
          {bubbleNode}
          {panel}
        </>
      ) : (
        <>
          {panel}
          {bubbleNode}
          {launcher}
        </>
      )}
    </div>
  );
};
