import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MessagesSquare,
  Send,
  Phone,
  ArrowLeft,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Volume2,
  VolumeX,
  Settings2,
  Globe2,
  Clock,
  History,
} from 'lucide-react';
import { PageHeader, Button, IconButton, SearchInput, FilterPills, EmptyState, ErrorState, ConfirmDialog, useToasts, useDebounced, ACCENTS, tint } from './ui.tsx';
import { BRAND_ICONS } from '../store/BrandIcons.tsx';

interface Conversation {
  id: number;
  name: string;
  phone: string;
  status: 'open' | 'closed';
  pageUrl: string;
  pageTitle: string;
  unread: number;
  lastMessage: string;
  lastSender: string;
  lastMessageAt?: string;
  createdAt?: string;
  ip?: string;
  userAgent?: string;
  previousChats?: number;
  seenByCustomer?: boolean;
}

interface Message {
  id: number;
  sender: 'customer' | 'agent' | 'system' | string;
  author?: string;
  body: string;
  createdAt?: string;
  pending?: boolean;
}

const SOUND_KEY = 'live-chat-sound';
const LINK_ICON = 'w-9 h-9 shrink-0 hidden sm:inline-flex items-center justify-center transition-colors hover:brightness-95';
const LINK_ICON_STYLE: React.CSSProperties = {
  borderRadius: 'var(--ds-r-md)',
  border: '1px solid var(--a-border-strong)',
  background: 'var(--a-surface)',
  color: 'var(--a-text-soft)',
};

const timeAgo = (value?: string) => {
  if (!value) return '';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const clock = (value?: string) => (value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const dayLabel = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
const waNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('880') ? digits : digits.startsWith('0') ? `88${digits}` : digits;
};
const initials = (name: string) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
/** A steady colour per customer for the round initials */
const avatarHue = (seed: string) => {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 55% 45%)`;
};
const deviceOf = (ua = '') =>
  /iphone|ipad/i.test(ua) ? 'iPhone / iPad' : /android/i.test(ua) ? 'Android phone' : /windows/i.test(ua) ? 'Windows computer' : /mac os/i.test(ua) ? 'Mac' : ua ? 'Computer' : '';

/** A short "new message" sound for the dashboard */
export function playChatSound() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 990].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.14;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    window.setTimeout(() => ctx.close?.(), 900);
  } catch {
    /* the browser blocks sound until the page has been clicked once */
  }
}

export const soundOn = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const Linkified: React.FC<{ text: string; light?: boolean }> = ({ text, light }) => (
  <>
    {text.split(URL_RE).map((part, index) =>
      index % 2 === 1 ? (
        <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all" style={{ color: light ? '#fff' : 'var(--primary)' }}>
          {part}
        </a>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      )
    )}
  </>
);

/**
 * v3.14 — Dashboard → Live Chat. Chats from the website's chat box: the list
 * on the left (unread first), the chat on the right. New messages arrive by
 * themselves every few seconds, with a sound (can be muted). On phones the
 * list and the chat are two screens.
 */
export const AdminLiveChatPage: React.FC<{
  settings: any;
  onOpenSettings?: () => void;
  onChanged?: () => void;
}> = ({ settings, onOpenSettings, onChanged }) => {
  const toasts = useToasts();
  const liveCfg = settings?.chat_config?.liveChat || {};
  const enabled = liveCfg.enabled === true && settings?.chat_config?.enabled !== false;
  const quickReplies: string[] = (Array.isArray(liveCfg.quickReplies) ? liveCfg.quickReplies : [])
    .map((item: unknown) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  const [filter, setFilter] = useState<'open' | 'unread' | 'closed' | 'all'>('open');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [list, setList] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState({ open: 0, unread: 0, closed: 0, all: 0 });
  const [typingIds, setTypingIds] = useState<number[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [thread, setThread] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const lastId = useRef(0);
  const latestSeen = useRef(-1);
  const typingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  /* --------------------------------------------------------------- list */
  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: filter });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/live-chat/conversations?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error();
      const rows: Conversation[] = data.conversations || [];
      // A new customer message anywhere: sound (not for the first load)
      const newest = rows.reduce((max, row) => (row.lastSender === 'customer' && row.unread > 0 ? Math.max(max, new Date(row.lastMessageAt || 0).getTime()) : max), 0);
      if (latestSeen.current >= 0 && newest > latestSeen.current && soundRef.current) playChatSound();
      latestSeen.current = Math.max(latestSeen.current, newest);
      setList(rows);
      setCounts(data.counts || { open: 0, unread: 0, closed: 0, all: 0 });
      setTypingIds(Array.isArray(data.typing) ? data.typing : []);
      setListState('ready');
    } catch {
      setListState((state) => (state === 'ready' ? state : 'error'));
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    setListState('loading');
    loadList();
  }, [loadList]);

  useEffect(() => {
    const timer = window.setInterval(() => document.visibilityState === 'visible' && loadList(), 5000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  /* ------------------------------------------------------------- thread */
  const loadThread = useCallback(
    async (id: number, fresh = false) => {
      try {
        const params = new URLSearchParams({ after: String(fresh ? 0 : lastId.current) });
        if (typingRef.current) params.set('typing', '1');
        const res = await fetch(`/api/admin/live-chat/conversations/${id}?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          if (res.status === 404) {
            setSelectedId(null);
            setThread(null);
          }
          return;
        }
        setThread(data.conversation);
        setCustomerTyping(Boolean(data.customerTyping));
        const incoming: Message[] = data.messages || [];
        if (fresh) {
          setMessages(incoming);
          lastId.current = incoming.length ? incoming[incoming.length - 1].id : 0;
        } else if (incoming.length) {
          setMessages((current) => {
            const known = new Set(current.filter((m) => !m.pending).map((m) => m.id));
            return [...current.filter((m) => !m.pending), ...incoming.filter((m) => !known.has(m.id))];
          });
          lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
        }
        // Opening a chat marks it read: refresh the badge
        if (fresh) onChanged?.();
      } catch {
        /* next poll */
      }
    },
    [onChanged]
  );

  useEffect(() => {
    if (!selectedId) return;
    lastId.current = 0;
    setMessages([]);
    setThread(list.find((row) => row.id === selectedId) || null);
    setDraft('');
    loadThread(selectedId, true);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && loadThread(selectedId), 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadThread]);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, customerTyping, selectedId]);

  const send = async (text?: string) => {
    const body = (text ?? draft).trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    typingRef.current = false;
    const temp: Message = { id: lastId.current + 0.5, sender: 'agent', body, pending: true, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, temp]);
    if (text === undefined) setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const res = await fetch(`/api/admin/live-chat/conversations/${selectedId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, after: lastId.current }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not send the reply.');
      const incoming: Message[] = data.messages || [];
      setMessages((current) => {
        const kept = current.filter((m) => !m.pending);
        const known = new Set(kept.map((m) => m.id));
        return [...kept, ...incoming.filter((m) => !known.has(m.id))];
      });
      if (incoming.length) lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
      setThread((current) => (current ? { ...current, status: 'open', seenByCustomer: false } : current));
      loadList();
    } catch (error: any) {
      setMessages((current) => current.filter((m) => m !== temp));
      if (text === undefined) setDraft(body);
      toasts.push(error.message || 'Could not send the reply.', 'error');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const setStatus = async (status: 'open' | 'closed') => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/live-chat/conversations/${selectedId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toasts.push(status === 'closed' ? 'Chat closed.' : 'Chat reopened.');
      setThread((current) => (current ? { ...current, status } : current));
      loadThread(selectedId);
      loadList();
    } catch {
      toasts.push('Could not change the chat.', 'error');
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/live-chat/conversations/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('Chat deleted.');
      setConfirmDelete(false);
      setSelectedId(null);
      setThread(null);
      loadList();
      onChanged?.();
    } catch {
      toasts.push('Could not delete the chat.', 'error');
    }
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (next) playChatSound();
  };

  const pills = useMemo(
    () => [
      { id: 'open', label: 'Open', count: counts.open },
      { id: 'unread', label: 'Unread', count: counts.unread, color: 'var(--ds-danger)' },
      { id: 'closed', label: 'Closed', count: counts.closed },
      { id: 'all', label: 'All', count: counts.all },
    ],
    [counts]
  );

  /* --------------------------------------------------------------- view */
  const listPane = (
    <div className={`flex flex-col min-h-0 ${selectedId ? 'hidden lg:flex' : 'flex'}`} style={{ borderInlineEnd: '1px solid var(--a-border)' }}>
      <div className="p-3 space-y-2.5" style={{ borderBottom: '1px solid var(--a-border)' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone or message" />
        <FilterPills pills={pills} active={filter} onChange={(id) => setFilter(id as any)} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {listState === 'loading' && list.length === 0 ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="ds-skeleton h-16" />
            ))}
          </div>
        ) : listState === 'error' && list.length === 0 ? (
          <ErrorState message="Could not load the chats." onRetry={loadList} />
        ) : list.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'No chats match your search' : filter === 'open' ? 'No open chats' : 'No chats here'}
            description={enabled ? 'New chats from the website appear here by themselves.' : 'Turn on live chat in Chat Widget so customers can write to you from the website.'}
            icon={MessagesSquare}
          />
        ) : (
          <ul>
            {list.map((row) => {
              const active = row.id === selectedId;
              const typing = typingIds.includes(row.id);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="w-full text-start flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors"
                    style={{
                      background: active ? tint(0.09) : row.unread > 0 ? tint(0.035) : 'transparent',
                      borderBottom: '1px solid var(--a-border)',
                      borderInlineStart: `3px solid ${active ? 'var(--primary)' : 'transparent'}`,
                    }}
                  >
                    <span
                      className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-white font-bold"
                      style={{ borderRadius: 'var(--ds-r-full)', background: avatarHue(row.name + row.phone), fontSize: 'var(--a-fs-sm)' }}
                    >
                      {initials(row.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate" style={{ fontWeight: row.unread > 0 ? 800 : 650, fontSize: 'var(--a-fs-base)' }}>
                          {row.name}
                        </span>
                        {row.status === 'closed' && (
                          <span className="shrink-0 px-1.5 rounded" style={{ fontSize: 10, fontWeight: 700, background: 'var(--a-surface-3)', color: 'var(--a-text-muted)' }}>
                            CLOSED
                          </span>
                        )}
                        <span className="ms-auto shrink-0 ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: row.unread > 0 ? 'var(--primary)' : 'var(--a-text-muted)', fontWeight: row.unread > 0 ? 700 : 500 }}>
                          {timeAgo(row.lastMessageAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 mt-0.5">
                        <span
                          className="truncate flex-1"
                          style={{ fontSize: 'var(--a-fs-sm)', color: typing ? 'var(--ds-success-text)' : row.unread > 0 ? 'var(--a-text)' : 'var(--a-text-muted)', fontWeight: row.unread > 0 ? 600 : 400 }}
                        >
                          {typing ? 'typing…' : `${row.lastSender === 'agent' ? 'You: ' : ''}${row.lastMessage}`}
                        </span>
                        {row.unread > 0 && (
                          <span
                            className="shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center text-white ds-num"
                            style={{ borderRadius: 'var(--ds-r-full)', background: 'var(--ds-danger)', fontSize: 11, fontWeight: 800 }}
                          >
                            {row.unread}
                          </span>
                        )}
                      </span>
                      {row.phone && (
                        <span className="block mt-0.5 ds-num truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                          {row.phone}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const WhatsAppIcon = BRAND_ICONS.whatsapp;
  const threadPane = (
    <div className={`flex flex-col min-h-0 min-w-0 ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
      {!selectedId || !thread ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState title="Choose a chat" description="Pick a chat on the left to read it and reply." icon={MessagesSquare} />
        </div>
      ) : (
        <>
          {/* header */}
          <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid var(--a-border)' }}>
            <button type="button" className="lg:hidden w-9 h-9 inline-flex items-center justify-center cursor-pointer" aria-label="Back to chats" onClick={() => setSelectedId(null)}>
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span
              className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-white font-bold"
              style={{ borderRadius: 'var(--ds-r-full)', background: avatarHue(thread.name + thread.phone), fontSize: 'var(--a-fs-sm)' }}
            >
              {initials(thread.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                {thread.name}
              </div>
              <div className="truncate ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: customerTyping ? 'var(--ds-success-text)' : 'var(--a-text-muted)' }}>
                {customerTyping ? 'typing…' : [thread.phone, thread.status === 'closed' ? 'Closed' : 'Open'].filter(Boolean).join(' · ')}
              </div>
            </div>
            {thread.phone && (
              <>
                <a href={`tel:${thread.phone}`} aria-label="Call" title="Call" className={LINK_ICON} style={LINK_ICON_STYLE}>
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href={`https://wa.me/${waNumber(thread.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  title="WhatsApp"
                  className={LINK_ICON}
                  style={{ ...LINK_ICON_STYLE, color: '#1DA851' }}
                >
                  <WhatsAppIcon className="w-4 h-4" />
                </a>
              </>
            )}
            {thread.status === 'open' ? (
              <Button size="sm" icon={CheckCircle2} onClick={() => setStatus('closed')}>
                <span className="hidden sm:inline">Close chat</span>
              </Button>
            ) : (
              <Button size="sm" icon={RotateCcw} onClick={() => setStatus('open')}>
                <span className="hidden sm:inline">Reopen</span>
              </Button>
            )}
            <IconButton icon={Trash2} tone="danger" label="Delete chat" onClick={() => setConfirmDelete(true)} />
          </div>

          {/* who / where */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)', background: 'var(--a-surface-2)', borderBottom: '1px solid var(--a-border)' }}>
            {thread.phone && (
              <span className="sm:hidden inline-flex items-center gap-3 font-semibold">
                <a href={`tel:${thread.phone}`} className="inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
                <a href={`https://wa.me/${waNumber(thread.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: '#1DA851' }}>
                  <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp
                </a>
              </span>
            )}
            {thread.pageUrl && (
              <a href={thread.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-w-0 max-w-full hover:underline" style={{ color: 'var(--primary)' }}>
                <Globe2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">On: {thread.pageTitle || thread.pageUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
            {thread.createdAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Started {dayLabel(thread.createdAt)} {clock(thread.createdAt)}
              </span>
            )}
            {Number(thread.previousChats) > 0 && (
              <span className="inline-flex items-center gap-1">
                <History className="w-3.5 h-3.5" /> {thread.previousChats} earlier chat{thread.previousChats === 1 ? '' : 's'} with this number
              </span>
            )}
            {deviceOf(thread.userAgent) && <span>{deviceOf(thread.userAgent)}</span>}
          </div>

          {/* messages */}
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-1.5" style={{ background: 'var(--a-surface-2)' }}>
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt);
              const day = showDay && message.createdAt && (
                <div className="flex justify-center py-2">
                  <span className="px-3 py-0.5" style={{ fontSize: 'var(--a-fs-xs)', borderRadius: 'var(--ds-r-full)', background: 'var(--a-surface-3)', color: 'var(--a-text-muted)' }}>
                    {dayLabel(message.createdAt)}
                  </span>
                </div>
              );
              if (message.sender === 'system') {
                return (
                  <React.Fragment key={message.id}>
                    {day}
                    <p className="text-center py-1" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {message.body}
                    </p>
                  </React.Fragment>
                );
              }
              const mine = message.sender === 'agent';
              const next = messages[index + 1];
              const lastOfGroup = !next || next.sender !== message.sender;
              const isLastAgent = mine && !messages.slice(index + 1).some((m) => m.sender === 'agent');
              return (
                <React.Fragment key={message.id}>
                  {day}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className="px-3 py-2 whitespace-pre-wrap break-words"
                        dir="auto"
                        style={{
                          fontSize: 'var(--a-fs-base)',
                          lineHeight: 1.45,
                          borderRadius: 16,
                          borderEndEndRadius: mine && lastOfGroup ? 4 : 16,
                          borderEndStartRadius: !mine && lastOfGroup ? 4 : 16,
                          background: mine ? 'var(--primary)' : 'var(--a-surface)',
                          color: mine ? 'var(--primary-foreground, #fff)' : 'var(--a-text)',
                          border: mine ? 'none' : '1px solid var(--a-border)',
                          opacity: message.pending ? 0.65 : 1,
                        }}
                      >
                        <Linkified text={message.body} light={mine} />
                      </div>
                      {lastOfGroup && (
                        <span className="px-1 mt-0.5 ds-num" style={{ fontSize: 11, color: 'var(--a-text-muted)' }}>
                          {message.pending ? 'Sending…' : `${mine && message.author ? `${message.author} · ` : ''}${clock(message.createdAt)}`}
                          {isLastAgent && !message.pending && thread.seenByCustomer ? ' · Seen' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {customerTyping && (
              <div className="flex">
                <span className="inline-flex gap-1 px-3 py-3" style={{ borderRadius: 16, background: 'var(--a-surface)', border: '1px solid var(--a-border)' }}>
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="w-1.5 h-1.5 animate-bounce" style={{ borderRadius: 999, background: 'var(--a-text-muted)', animationDelay: `${dot * 140}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* quick replies + composer */}
          <div className="px-3 pt-2 pb-3" style={{ borderTop: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
            {quickReplies.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto ds-scroll-hide pb-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => {
                      setDraft(reply);
                      inputRef.current?.focus();
                    }}
                    className="shrink-0 px-3 h-8 cursor-pointer whitespace-nowrap max-w-72 truncate"
                    title={reply}
                    style={{ borderRadius: 'var(--ds-r-full)', border: '1px solid var(--a-border)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)' }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={2000}
                placeholder={thread.status === 'closed' ? 'Write to reopen this chat…' : 'Write a reply… (Enter to send, Shift+Enter for a new line)'}
                aria-label="Reply"
                onChange={(event) => {
                  setDraft(event.target.value);
                  typingRef.current = Boolean(event.target.value.trim());
                  const el = event.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(140, el.scrollHeight)}px`;
                }}
                onBlur={() => (typingRef.current = false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) {
                    event.preventDefault();
                    send();
                  }
                }}
                className="a-field flex-1"
                style={{ minHeight: 44, resize: 'none', paddingTop: 11, paddingBottom: 11, borderRadius: 22 }}
              />
              <Button type="submit" variant="primary" icon={Send} loading={sending} disabled={!draft.trim()} className="h-11 shrink-0">
                <span className="hidden sm:inline">Send</span>
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Live Chat"
        subtitle="Chats from your website's chat box. Reply here — the customer sees it at once."
        icon={MessagesSquare}
        accent={ACCENTS.success}
        actions={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 h-9 px-3 font-semibold"
              style={{
                borderRadius: 'var(--ds-r-full)',
                fontSize: 'var(--a-fs-sm)',
                background: enabled ? 'var(--ds-success-soft)' : 'var(--a-surface-3)',
                color: enabled ? 'var(--ds-success-text)' : 'var(--a-text-muted)',
              }}
            >
              <span className="w-2 h-2" style={{ borderRadius: 999, background: enabled ? 'var(--ds-success)' : 'var(--a-text-muted)' }} />
              {enabled ? 'On the website' : 'Off'}
            </span>
            <IconButton icon={sound ? Volume2 : VolumeX} label={sound ? 'Sound on — click to mute' : 'Sound off — click to turn on'} onClick={toggleSound} />
            {onOpenSettings && (
              <Button icon={Settings2} onClick={onOpenSettings}>
                <span className="hidden sm:inline">Settings</span>
              </Button>
            )}
          </div>
        }
      />

      {!enabled && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--ds-warning-soft)', color: 'var(--ds-warning-text)', fontSize: 'var(--a-fs-sm)' }}>
          <span className="flex-1 min-w-60">
            Live chat is off, so the website does not show the chat box. Turn it on in <b>Marketing & Tools → Chat Widget → Live chat</b>.
          </span>
          {onOpenSettings && (
            <Button size="sm" variant="primary" onClick={onOpenSettings}>
              Turn on live chat
            </Button>
          )}
        </div>
      )}

      <div
        className="grid lg:grid-cols-[340px_minmax(0,1fr)] overflow-hidden"
        style={{
          height: 'calc(100dvh - 210px)',
          minHeight: 480,
          borderRadius: 'var(--ds-r-lg)',
          border: '1px solid var(--a-border)',
          background: 'var(--a-surface)',
          boxShadow: 'var(--ds-shadow-xs)',
        }}
      >
        {listPane}
        {threadPane}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this chat?"
        message="The chat and all its messages are deleted for good. The customer's open chat box will start fresh."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};
