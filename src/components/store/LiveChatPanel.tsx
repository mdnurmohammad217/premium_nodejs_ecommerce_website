import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Headphones, Loader2, LogOut, MessagesSquare, Send, X } from 'lucide-react';
import { useT } from '../../lib/i18n.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

/* ======================================================================
 * v3.14 — Live chat on the website (Dashboard → Marketing & Tools →
 * Chat Widget → Live chat; answered in Dashboard → Live Chat).
 * ====================================================================== */

export interface LiveChatConfig {
  enabled?: boolean;
  /** Row text in the contact list, e.g. "Live chat" */
  label?: string;
  /** Header of the chat box */
  title?: string;
  /** Shown above the form before a chat starts */
  intro?: string;
  askPhone?: boolean;
  agentName?: string;
  welcome?: string;
  offlineReply?: string;
}

export interface LiveChatMessage {
  id: number;
  sender: 'customer' | 'agent' | 'system' | string;
  author?: string;
  body: string;
  createdAt?: string;
  /** shown before the server confirmed it */
  pending?: boolean;
}

const STORE_KEY = 'live-chat-v1';
interface Saved {
  token?: string;
  name?: string;
  phone?: string;
}
const readSaved = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const writeSaved = (value: Saved) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    /* private mode: the chat lasts for this page only */
  }
};

/** A short soft "ding" for a new reply (no sound file to download) */
function ding() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.4);
    };
    tone(880, 0);
    tone(1320, 0.12);
    window.setTimeout(() => ctx.close?.(), 900);
  } catch {
    /* sound not allowed yet */
  }
}

/**
 * Chat state + polling. Polls every 3 s while the chat box is open, every
 * 20 s while it is closed (for the red unread count on the button), and
 * pauses while the tab is in the background.
 */
export function useLiveChat(enabled: boolean, panelOpen: boolean) {
  const [token, setToken] = useState<string>(() => (enabled ? readSaved().token || '' : ''));
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [status, setStatus] = useState<'open' | 'closed' | ''>('');
  const [unread, setUnread] = useState(0);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [error, setError] = useState('');
  const lastId = useRef(0);
  const typingRef = useRef(false);
  const openRef = useRef(panelOpen);
  openRef.current = panelOpen;

  const merge = useCallback((incoming: LiveChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const known = new Set(current.filter((m) => !m.pending).map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      if (!fresh.length) return current;
      const kept = current.filter((m) => !m.pending);
      return [...kept, ...fresh].sort((a, b) => a.id - b.id);
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  const forget = useCallback(() => {
    const saved = readSaved();
    writeSaved({ name: saved.name, phone: saved.phone });
    setToken('');
    setMessages([]);
    setStatus('');
    setUnread(0);
    lastId.current = 0;
  }, []);

  const poll = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ token, after: String(lastId.current) });
    if (openRef.current) params.set('open', '1');
    if (typingRef.current) params.set('typing', '1');
    try {
      const res = await fetch(`/api/live-chat/poll?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (res.status === 404 && data?.code === 'NO_CHAT') return forget();
      if (!res.ok || !data) return;
      const before = lastId.current;
      merge(data.messages || []);
      const fromAgent = (data.messages || []).some((m: LiveChatMessage) => m.sender === 'agent' && m.id > before);
      if (fromAgent && before > 0 && (!openRef.current || document.visibilityState !== 'visible')) ding();
      setStatus(data.conversation?.status || '');
      setUnread(openRef.current ? 0 : Number(data.unread) || 0);
      setAgentOnline(Boolean(data.agentOnline));
      setAgentTyping(Boolean(data.agentTyping));
    } catch {
      /* offline for a moment: the next poll tries again */
    }
  }, [token, merge, forget]);

  // The polling loop
  useEffect(() => {
    if (!enabled || !token) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') await poll();
      if (stopped) return;
      timer = window.setTimeout(tick, openRef.current ? 3000 : 20000);
    };
    tick();
    const wake = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [enabled, token, poll]);

  // Opening the box reads new messages at once
  useEffect(() => {
    if (panelOpen && token) {
      setUnread(0);
      poll();
    }
  }, [panelOpen, token, poll]);

  const page = () => ({ pageUrl: window.location.href.slice(0, 500), pageTitle: document.title.slice(0, 255) });

  const start = useCallback(
    async (form: { name: string; phone: string; message: string }): Promise<Record<string, string> | null> => {
      setError('');
      try {
        const res = await fetch('/api/live-chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, ...page() }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.token) {
          setError(data?.error || 'Could not start the chat. Please try again.');
          return data?.errors || {};
        }
        writeSaved({ token: data.token, name: form.name, phone: form.phone });
        lastId.current = 0;
        setMessages([]);
        merge(data.messages || []);
        setStatus('open');
        setToken(data.token);
        return null;
      } catch {
        setError('Could not start the chat. Please try again.');
        return {};
      }
    },
    [merge]
  );

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!text || !token) return false;
      setError('');
      const temp: LiveChatMessage = { id: lastId.current + 0.5, sender: 'customer', body: text, pending: true, createdAt: new Date().toISOString() };
      setMessages((current) => [...current, temp]);
      try {
        const res = await fetch('/api/live-chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, body: text, after: lastId.current, ...page() }),
        });
        const data = await res.json().catch(() => null);
        if (res.status === 404 && data?.code === 'NO_CHAT') {
          forget();
          setError('This chat has ended. Please start a new one.');
          return false;
        }
        if (!res.ok) {
          setMessages((current) => current.filter((m) => m !== temp));
          setError(data?.error || 'Could not send your message. Please try again.');
          return false;
        }
        merge(data.messages || []);
        setStatus('open');
        return true;
      } catch {
        setMessages((current) => current.filter((m) => m !== temp));
        setError('Could not send your message. Please check your internet and try again.');
        return false;
      }
    },
    [token, merge, forget]
  );

  const end = useCallback(async () => {
    if (token) {
      fetch('/api/live-chat/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {});
    }
    forget();
  }, [token, forget]);

  const setTyping = useCallback((on: boolean) => {
    typingRef.current = on;
  }, []);

  return { token, messages, status, unread, agentOnline, agentTyping, error, setError, start, send, end, setTyping };
}

export type LiveChatState = ReturnType<typeof useLiveChat>;

/* --------------------------------------------------------------- helpers */

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
/** Message text with web links made clickable (React escapes the rest) */
const Linkified: React.FC<{ text: string; light?: boolean }> = ({ text, light }) => {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow" className={`underline underline-offset-2 break-all ${light ? 'text-white' : 'text-(--primary)'}`}>
            {part}
          </a>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

const timeOf = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(String(iso).includes('T') || String(iso).endsWith('Z') ? iso : `${String(iso).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const SAMPLE: LiveChatMessage[] = [
  { id: 1, sender: 'agent', author: 'Support', body: 'Hi! How can we help you today?' },
  { id: 2, sender: 'customer', body: 'Is this product available in a bigger size?' },
  { id: 3, sender: 'agent', author: 'Support', body: 'Yes, we have it — I am sending you the link now.' },
];

/* ================================================================= panel */

interface LiveChatPanelProps {
  cfg: LiveChatConfig;
  chat: LiveChatState | null;
  /** Header colour */
  accent: string;
  agentPhoto?: string;
  /** Business hours say open now */
  open: boolean;
  offlineText?: string;
  onClose: () => void;
  /** Back to the list of contact options (when there are others) */
  onBack?: () => void;
  /** Phones: the chat fills the screen */
  fullscreen?: boolean;
  /** Dashboard preview: a sample chat, nothing is sent */
  preview?: boolean;
  transformOrigin?: string;
}

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  cfg,
  chat,
  accent,
  agentPhoto,
  open,
  offlineText,
  onClose,
  onBack,
  fullscreen,
  preview,
  transformOrigin,
}) => {
  const t = useT();
  const { user } = useAuth() as any;
  const saved = useMemo(readSaved, []);
  const [form, setForm] = useState({
    name: saved.name || (user?.role === 'customer' ? user?.name : '') || '',
    phone: saved.phone || (user?.role === 'customer' ? user?.phone : '') || '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const messages = preview ? SAMPLE : chat?.messages || [];
  const started = preview || Boolean(chat?.token);
  const online = preview ? true : Boolean(chat?.agentOnline) || (!chat?.token && open);
  const title = cfg.title || t('Live chat');

  // Keep the newest message in view
  useLayoutEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, chat?.agentTyping, started]);

  useEffect(() => {
    if (preview) return;
    const id = window.setTimeout(() => (started ? inputRef.current : firstFieldRef.current)?.focus({ preventScroll: true } as any), 60);
    return () => window.clearTimeout(id);
  }, [started, preview]);

  // Esc closes the box
  useEffect(() => {
    if (preview) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, preview]);

  // Phones: no page scrolling behind the full-screen chat
  useEffect(() => {
    if (!fullscreen || preview) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [fullscreen, preview]);

  const submitStart = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview || !chat || busy) return;
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name.';
    if (cfg.askPhone !== false && form.phone.replace(/\D/g, '').length < 7) next.phone = 'Please enter a valid phone number.';
    if (!form.message.trim()) next.message = 'Please write your message.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const result = await chat.start({ name: form.name.trim(), phone: form.phone.trim(), message: form.message.trim() });
    setBusy(false);
    if (result) setErrors(result);
  };

  const submitMessage = async () => {
    if (preview || !chat) return;
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    chat.setTyping(false);
    const ok = await chat.send(text);
    if (!ok) setDraft(text);
    inputRef.current?.focus();
  };

  const field =
    'w-full h-11 px-(--ds-s-3) rounded-(--ds-r-md) border bg-(--ds-surface) text-(length:--ds-fs-base) text-(--ds-text) placeholder:text-(--ds-text-muted) focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_35%,transparent)] focus:border-(--primary)';
  const fieldBorder = (key: string) => (errors[key] ? 'border-(--ds-danger)' : 'border-(--ds-border)');

  const box = fullscreen
    ? 'fixed inset-0 z-[999] flex flex-col bg-(--ds-surface) ds-fade-in'
    : 'w-[min(370px,calc(100vw-24px))] h-[min(600px,calc(100vh-120px))] flex flex-col rounded-(--ds-r-xl) bg-(--ds-surface) shadow-(--ds-shadow-xl) overflow-hidden ds-scale-in border border-(--ds-border-soft)';

  return (
    <div role="dialog" aria-label={title} className={box} style={fullscreen ? undefined : { transformOrigin }}>
      {/* ------------------------------------------------------- header */}
      <div className="shrink-0 px-(--ds-s-3) py-(--ds-s-3) text-white" style={{ background: accent, paddingTop: fullscreen ? 'max(12px, env(safe-area-inset-top))' : undefined }}>
        <div className="flex items-center gap-(--ds-s-2)">
          {onBack && (
            <button type="button" onClick={onBack} aria-label={t('Back')} className="w-9 h-9 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center hover:bg-white/15 cursor-pointer">
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
          )}
          <span className="relative shrink-0">
            {agentPhoto ? (
              <img src={agentPhoto} alt="" className="w-10 h-10 rounded-(--ds-r-full) object-cover ring-2 ring-white/60" />
            ) : (
              <span className="w-10 h-10 rounded-(--ds-r-full) bg-white/20 inline-flex items-center justify-center">
                <Headphones className="w-5 h-5" />
              </span>
            )}
            <span className="absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 rounded-(--ds-r-full) ring-2" style={{ background: online ? '#22c55e' : '#94a3b8', ['--tw-ring-color' as any]: accent }} />
          </span>
          <div className="min-w-0 flex-1 ps-1">
            <div className="font-(--ds-fw-bold) text-(length:--ds-fs-md) truncate">{title}</div>
            <div className="text-(length:--ds-fs-xs) opacity-90 truncate">
              {chat?.agentTyping ? t('Typing…') : online ? t('Online — we reply in a few minutes') : offlineText || t('Offline now — leave a message, we will reply soon')}
            </div>
          </div>
          {started && !preview && (
            <button
              type="button"
              onClick={() => setConfirmEnd((value) => !value)}
              aria-label={t('End chat')}
              title={t('End chat')}
              className="w-9 h-9 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center hover:bg-white/15 cursor-pointer"
            >
              <LogOut className="w-[18px] h-[18px] rtl:rotate-180" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t('Close')} className="w-9 h-9 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center hover:bg-white/15 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {confirmEnd && (
          <div className="mt-(--ds-s-2) flex items-center justify-between gap-(--ds-s-2) rounded-(--ds-r-md) bg-white/15 px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)">
            <span>{t('End this chat?')}</span>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => setConfirmEnd(false)} className="h-8 px-3 rounded-(--ds-r-full) bg-white/15 hover:bg-white/25 cursor-pointer font-(--ds-fw-semibold)">
                {t('No')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmEnd(false);
                  chat?.end();
                  setForm((value) => ({ ...value, message: '' }));
                }}
                className="h-8 px-3 rounded-(--ds-r-full) bg-white text-(--ds-gray-900) cursor-pointer font-(--ds-fw-semibold)"
              >
                {t('Yes, end')}
              </button>
            </span>
          </div>
        )}
      </div>

      {/* --------------------------------------------- start form / thread */}
      {!started ? (
        <form onSubmit={submitStart} className="flex-1 min-h-0 overflow-y-auto p-(--ds-s-4) space-y-(--ds-s-3) bg-(--ds-surface-2)" noValidate>
          <div className="flex gap-(--ds-s-2) items-start">
            <span className="w-8 h-8 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white" style={{ background: accent }}>
              <MessagesSquare className="w-4 h-4" />
            </span>
            <p className="rounded-(--ds-r-lg) rounded-ss-sm bg-(--ds-surface) border border-(--ds-border-soft) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-text) leading-relaxed">
              {cfg.intro ? t(cfg.intro) : t('Hi! Write your name and question — we will answer you right here.')}
            </p>
          </div>
          {/* bots fill every field, people never see this one */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <label className="block">
            <span className="block mb-1 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text)">{t('Your name')}</span>
            <input
              ref={firstFieldRef}
              className={`${field} ${fieldBorder('name')}`}
              value={form.name}
              autoComplete="name"
              maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="block mt-1 text-(length:--ds-fs-xs) text-(--ds-danger-text)">{t(errors.name)}</span>}
          </label>
          {cfg.askPhone !== false && (
            <label className="block">
              <span className="block mb-1 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text)">{t('Mobile number')}</span>
              <input
                className={`${field} ${fieldBorder('phone')} ds-num`}
                value={form.phone}
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                dir="ltr"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone && <span className="block mt-1 text-(length:--ds-fs-xs) text-(--ds-danger-text)">{t(errors.phone)}</span>}
            </label>
          )}
          <label className="block">
            <span className="block mb-1 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text)">{t('Message')}</span>
            <textarea
              className={`${field} ${fieldBorder('message')} h-auto py-(--ds-s-2) min-h-24 resize-none`}
              rows={3}
              maxLength={2000}
              value={form.message}
              placeholder={t('How can we help?')}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              aria-invalid={Boolean(errors.message)}
            />
            {errors.message && <span className="block mt-1 text-(length:--ds-fs-xs) text-(--ds-danger-text)">{t(errors.message)}</span>}
          </label>
          {chat?.error && <p className="text-(length:--ds-fs-sm) text-(--ds-danger-text)">{t(chat.error)}</p>}
          <button
            type="submit"
            disabled={busy || preview}
            className="w-full h-12 rounded-(--ds-r-full) inline-flex items-center justify-center gap-(--ds-s-2) text-white font-(--ds-fw-semibold) text-(length:--ds-fs-md) shadow-(--ds-shadow-sm) disabled:opacity-70 cursor-pointer"
            style={{ background: accent }}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-[18px] h-[18px] rtl:-scale-x-100" />}
            {t('Start chat')}
          </button>
        </form>
      ) : (
        <>
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-(--ds-s-3) py-(--ds-s-4) space-y-1.5 bg-(--ds-surface-2)" aria-live="polite">
            {messages.map((message, index) => {
              if (message.sender === 'system') {
                return (
                  <p key={message.id} className="py-(--ds-s-2) text-center text-(length:--ds-fs-xs) text-(--ds-text-muted)">
                    <span className="inline-block px-(--ds-s-3) py-1 rounded-(--ds-r-full) bg-(--ds-surface-3)">{t(message.body)}</span>
                  </p>
                );
              }
              const mine = message.sender === 'customer';
              const prev = messages[index - 1];
              const firstOfGroup = !prev || prev.sender !== message.sender;
              const next = messages[index + 1];
              const lastOfGroup = !next || next.sender !== message.sender;
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${firstOfGroup ? 'pt-(--ds-s-2)' : ''}`}>
                  <div className={`max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!mine && firstOfGroup && message.author && (
                      <span className="px-1 mb-0.5 text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">{message.author}</span>
                    )}
                    <div
                      className={`px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-base) leading-snug whitespace-pre-wrap break-words shadow-(--ds-shadow-xs) ${
                        mine
                          ? `text-white rounded-(--ds-r-lg) ${lastOfGroup ? 'rounded-ee-sm' : ''}`
                          : `bg-(--ds-surface) text-(--ds-text) border border-(--ds-border-soft) rounded-(--ds-r-lg) ${lastOfGroup ? 'rounded-es-sm' : ''}`
                      } ${message.pending ? 'opacity-70' : ''}`}
                      style={mine ? { background: accent } : undefined}
                      dir="auto"
                    >
                      <Linkified text={message.body} light={mine} />
                    </div>
                    {lastOfGroup && (
                      <span className="px-1 mt-0.5 text-[11px] text-(--ds-text-muted) ds-num">
                        {message.pending ? t('Sending…') : timeOf(message.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {chat?.agentTyping && (
              <div className="flex pt-(--ds-s-2)">
                <span className="inline-flex gap-1 px-(--ds-s-3) py-(--ds-s-3) rounded-(--ds-r-lg) rounded-es-sm bg-(--ds-surface) border border-(--ds-border-soft)" aria-label={t('Typing…')}>
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="w-1.5 h-1.5 rounded-(--ds-r-full) bg-(--ds-text-muted) animate-bounce" style={{ animationDelay: `${dot * 140}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>

          {chat?.error && <p className="shrink-0 px-(--ds-s-4) pt-(--ds-s-2) text-(length:--ds-fs-xs) text-(--ds-danger-text) bg-(--ds-surface)">{t(chat.error)}</p>}
          <form
            className="shrink-0 flex items-end gap-(--ds-s-2) p-(--ds-s-2) border-t border-(--ds-border-soft) bg-(--ds-surface)"
            style={fullscreen ? { paddingBottom: 'max(8px, env(safe-area-inset-bottom))' } : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={2000}
              disabled={preview}
              placeholder={t('Write a message…')}
              aria-label={t('Write a message…')}
              onChange={(event) => {
                setDraft(event.target.value);
                chat?.setTyping(Boolean(event.target.value.trim()));
                const el = event.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(120, el.scrollHeight)}px`;
              }}
              onBlur={() => chat?.setTyping(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) {
                  event.preventDefault();
                  submitMessage();
                }
              }}
              className="flex-1 min-h-11 max-h-30 px-(--ds-s-3) py-[11px] rounded-[22px] border border-(--ds-border) bg-(--ds-surface-2) text-(length:--ds-fs-base) text-(--ds-text) placeholder:text-(--ds-text-muted) resize-none focus:outline-none focus:border-(--primary) focus:bg-(--ds-surface)"
            />
            <button
              type="submit"
              disabled={!draft.trim() || preview}
              aria-label={t('Send')}
              className="w-11 h-11 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-white disabled:opacity-40 cursor-pointer transition-opacity"
              style={{ background: accent }}
            >
              <Send className="w-[18px] h-[18px] rtl:-scale-x-100" />
            </button>
          </form>
        </>
      )}
    </div>
  );
};
