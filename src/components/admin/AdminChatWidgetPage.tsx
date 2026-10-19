import React, { useState } from 'react';
import { MessageCircle, Save, Plus, Trash2, ArrowUp, ArrowDown, Monitor, Smartphone, MessagesSquare } from 'lucide-react';
import { PageHeader, Card, Button, IconButton, Field, Toggle, Select, useToasts, ACCENTS, tint } from './ui.tsx';
import {
  ChatWidget,
  CHANNEL_META,
  ChatChannel,
  ChatChannelType,
  ChatPosition,
  chatChannelsOf,
  LAUNCHER_ICONS,
} from '../store/ChatWidget.tsx';

const POSITIONS: Array<{ id: ChatPosition; label: string }> = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'middle-left', label: 'Middle left' },
  { id: 'middle-right', label: 'Middle right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
];

const PAGES = [
  { id: 'checkout', label: 'Checkout' },
  { id: 'cart', label: 'Cart' },
  { id: 'product', label: 'Product pages' },
  { id: 'shop', label: 'Shop' },
  { id: 'home', label: 'Home' },
  { id: 'account', label: 'My Account' },
];

const newId = () => Math.random().toString(36).slice(2, 9);

/**
 * Marketing & Tools → Chat Widget. The floating contact button on the website:
 * which apps, where on the screen, how it looks, and when it shows.
 */
export const AdminChatWidgetPage: React.FC<{ settings: any; onSaveSettings: (s: any) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const toasts = useToasts();
  const stored = settings?.chat_config || {};
  const [cfg, setCfg] = useState<any>(() => ({
    enabled: stored.enabled !== false,
    position: stored.position || 'bottom-right',
    offsetX: stored.offsetX ?? 20,
    offsetY: stored.offsetY ?? 20,
    style: stored.style || 'popup',
    launcherColor: stored.launcherColor || '',
    launcherIcon: stored.launcherIcon || 'chat',
    launcherLabel: stored.launcherLabel || '',
    pulse: stored.pulse !== false,
    title: stored.title || 'Need help?',
    greeting: stored.greeting || stored.supportText || 'Ask us about any medicine — we usually reply within minutes.',
    onlineText: stored.onlineText || '',
    agentPhoto: stored.agentPhoto || '',
    showOnMobile: stored.showOnMobile !== false,
    showOnDesktop: stored.showOnDesktop !== false,
    hideOnPages: Array.isArray(stored.hideOnPages) ? stored.hideOnPages : [],
    businessHours: { enabled: false, open: '09:00', close: '22:00', offlineText: '', ...(stored.businessHours || {}) },
    greetingBubble: { enabled: false, text: 'Hi! Need help finding a medicine? 👋', delaySec: 6, ...(stored.greetingBubble || {}) },
    whatsappMessage: stored.whatsappMessage || 'Hello! I have a question{product}.',
    // v3.14 — live chat on the website (answered in Dashboard → Live Chat)
    liveChat: {
      enabled: false,
      label: '',
      title: '',
      intro: '',
      askPhone: true,
      agentName: '',
      welcome: 'Hi! How can we help you today?',
      offlineReply: 'Thanks for your message! We are away right now and will reply as soon as we are back.',
      quickReplies: ['Thank you! Please wait a moment, I am checking.', 'Yes, this product is in stock.', 'Delivery takes 1–3 days.', 'You can order with Buy Now — payment on delivery.'],
      ...(stored.liveChat || {}),
    },
    // Older settings (one WhatsApp / Messenger / phone) become the first channels
    channels: Array.isArray(stored.channels)
      ? stored.channels
      : chatChannelsOf(stored).map((channel) => ({ ...channel, enabled: true })),
  }));
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [addType, setAddType] = useState<ChatChannelType>('whatsapp');

  const setChannel = (index: number, patch: Partial<ChatChannel>) => {
    const channels = [...cfg.channels];
    channels[index] = { ...channels[index], ...patch };
    setCfg({ ...cfg, channels });
  };
  const move = (index: number, delta: number) => {
    const channels = [...cfg.channels];
    const target = index + delta;
    if (target < 0 || target >= channels.length) return;
    [channels[index], channels[target]] = [channels[target], channels[index]];
    setCfg({ ...cfg, channels });
  };

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = {
        ...cfg,
        channels: cfg.channels.filter((channel: ChatChannel) => String(channel.value || '').trim()),
        liveChat: {
          ...cfg.liveChat,
          quickReplies: (cfg.liveChat.quickReplies || []).map((line: string) => String(line || '').trim()).filter(Boolean).slice(0, 12),
        },
      };
      await onSaveSettings({ ...settings, chat_config: cleaned });
      toasts.push('Chat widget saved.');
    } catch {
      /* shell shows the error */
    } finally {
      setSaving(false);
    }
  };

  const active =
    cfg.channels.filter((channel: ChatChannel) => channel.enabled !== false && String(channel.value || '').trim()).length + (cfg.liveChat.enabled ? 1 : 0);
  const setLive = (patch: any) => setCfg({ ...cfg, liveChat: { ...cfg.liveChat, ...patch } });

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Chat Widget"
        subtitle="The floating contact button on your website — WhatsApp, Messenger, call, Instagram, TikTok and more."
        icon={MessageCircle}
        accent={ACCENTS.success}
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving}>
            Save
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <Toggle
                checked={cfg.enabled}
                onChange={(value) => setCfg({ ...cfg, enabled: value })}
                label={`Chat widget ${cfg.enabled ? 'ON' : 'OFF'}`}
                description={`${active} contact option${active === 1 ? '' : 's'} showing.`}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Toggle checked={cfg.showOnDesktop} onChange={(value) => setCfg({ ...cfg, showOnDesktop: value })} label="Show on computers" />
                <Toggle checked={cfg.showOnMobile} onChange={(value) => setCfg({ ...cfg, showOnMobile: value })} label="Show on phones" />
              </div>
              <Field label="Hide on these pages">
                <div className="flex flex-wrap gap-1.5">
                  {PAGES.map((page) => {
                    const hiddenHere = cfg.hideOnPages.includes(page.id);
                    return (
                      <button
                        key={page.id}
                        type="button"
                        aria-pressed={hiddenHere}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            hideOnPages: hiddenHere ? cfg.hideOnPages.filter((id: string) => id !== page.id) : [...cfg.hideOnPages, page.id],
                          })
                        }
                        className="px-2.5 h-8 cursor-pointer"
                        style={{
                          borderRadius: 'var(--ds-r-full)',
                          border: `1px solid ${hiddenHere ? 'var(--ds-danger)' : 'var(--a-border)'}`,
                          background: hiddenHere ? 'var(--ds-danger-soft)' : 'var(--a-surface)',
                          color: hiddenHere ? 'var(--ds-danger-text)' : 'var(--a-text)',
                          fontSize: 'var(--a-fs-sm)',
                        }}
                      >
                        {page.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </Card>

          {/* ------------------------------------------------------ live chat */}
          <Card>
            <div className="flex items-start gap-3 mb-3">
              <span className="w-9 h-9 shrink-0 inline-flex items-center justify-center text-white" style={{ borderRadius: 'var(--ds-r-full)', background: 'var(--primary)' }}>
                <MessagesSquare className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                  Live chat
                </h3>
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  Customers chat with you right on the website — no app needed. You answer in <b>Dashboard → Live Chat</b>; a sound and a red count tell you
                  when someone writes.
                </p>
              </div>
            </div>
            <Toggle
              checked={cfg.liveChat.enabled}
              onChange={(value) => setLive({ enabled: value })}
              label={`Live chat ${cfg.liveChat.enabled ? 'ON' : 'OFF'}`}
              description={
                cfg.liveChat.enabled
                  ? cfg.channels.filter((c: ChatChannel) => c.enabled !== false && String(c.value || '').trim()).length === 0
                    ? 'It is the only option: the floating button opens the chat box straight away.'
                    : 'Shown first in the list of contact options.'
                  : 'Turn on to show a chat box on the website.'
              }
            />
            {cfg.liveChat.enabled && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Name in the list" hint="Empty = “Live chat”">
                    <input className="a-field" value={cfg.liveChat.label} placeholder="Live chat" onChange={(e) => setLive({ label: e.target.value })} />
                  </Field>
                  <Field label="Chat box title" hint="Empty = “Live chat”">
                    <input className="a-field" value={cfg.liveChat.title} placeholder="Chat with us" onChange={(e) => setLive({ title: e.target.value })} />
                  </Field>
                  <Field label="Name customers see on your replies" hint="Empty = the name of whoever replies">
                    <input className="a-field" value={cfg.liveChat.agentName} placeholder="Support team" onChange={(e) => setLive({ agentName: e.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <Toggle checked={cfg.liveChat.askPhone !== false} onChange={(value) => setLive({ askPhone: value })} label="Ask for the mobile number" description="So you can call back if needed." />
                  </div>
                </div>
                <Field label="Text above the start form" hint="Empty = a short default line">
                  <input className="a-field" value={cfg.liveChat.intro} placeholder="Hi! Write your name and question — we will answer you right here." onChange={(e) => setLive({ intro: e.target.value })} />
                </Field>
                <Field label="Welcome message" hint="Sent automatically as the first message of every chat. Empty = none.">
                  <textarea className="a-field" rows={2} value={cfg.liveChat.welcome} onChange={(e) => setLive({ welcome: e.target.value })} />
                </Field>
                <Field label="Automatic answer when nobody is online" hint="Sent when no one has the dashboard open. Empty = none.">
                  <textarea className="a-field" rows={2} value={cfg.liveChat.offlineReply} onChange={(e) => setLive({ offlineReply: e.target.value })} />
                </Field>
                <Field label="Quick replies" hint="One per line (up to 12). One click puts it in your reply box in Live Chat.">
                  <textarea
                    className="a-field"
                    rows={4}
                    value={(cfg.liveChat.quickReplies || []).join('\n')}
                    onChange={(e) => setLive({ quickReplies: e.target.value.split('\n') })}
                  />
                </Field>
              </div>
            )}
          </Card>

          {/* ------------------------------------------------------ channels */}
          <Card>
            <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Contact options
            </h3>
            {(() => {
              const shown = chatChannelsOf(cfg).length + (cfg.liveChat.enabled ? 1 : 0);
              if (shown === 0) return null;
              return (
                <p
                  className="mb-3 px-3 py-2"
                  style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)', borderRadius: 'var(--ds-r-md)', background: tint(0.08) }}
                >
                  {shown === 1 && cfg.liveChat.enabled
                    ? 'Only live chat is shown: the floating button opens the chat box directly.'
                    : shown === 1
                    ? 'One option is shown: the floating button takes its icon and colour and opens it directly — no list.'
                    : `${shown} options are shown: tapping the floating button opens them to choose from.`}
                </p>
              );
            })()}
            <div className="space-y-2">
              {cfg.channels.length === 0 && (
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Add at least one way to reach you.</p>
              )}
              {cfg.channels.map((channel: ChatChannel, index: number) => {
                const meta = CHANNEL_META[channel.type] || CHANNEL_META.custom;
                const Icon = meta.icon;
                return (
                  <div
                    key={channel.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_150px_minmax(0,1fr)_auto] items-center gap-2 p-2"
                    style={{
                      borderRadius: 'var(--ds-r-md)',
                      border: '1px solid var(--a-border)',
                      opacity: channel.enabled === false ? 0.55 : 1,
                    }}
                  >
                    <span className="w-9 h-9 inline-flex items-center justify-center text-white" style={{ borderRadius: 'var(--ds-r-full)', background: meta.color }}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <input
                      className="a-field"
                      value={channel.label || ''}
                      placeholder={meta.label}
                      aria-label="Button text"
                      onChange={(e) => setChannel(index, { label: e.target.value })}
                    />
                    <input
                      className="a-field ds-num col-span-2 sm:col-span-1"
                      value={channel.value}
                      placeholder={meta.hint}
                      aria-label={`${meta.label} address`}
                      onChange={(e) => setChannel(index, { value: e.target.value })}
                    />
                    <div className="flex items-center gap-1 col-span-2 sm:col-span-1 justify-end">
                      <label className="inline-flex items-center gap-1 cursor-pointer" style={{ fontSize: 'var(--a-fs-xs)' }}>
                        <input
                          type="checkbox"
                          checked={channel.enabled !== false}
                          onChange={(e) => setChannel(index, { enabled: e.target.checked })}
                        />
                        Show
                      </label>
                      <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
                      <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === cfg.channels.length - 1} onClick={() => move(index, 1)} />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        tone="danger"
                        label="Remove"
                        onClick={() => setCfg({ ...cfg, channels: cfg.channels.filter((_: any, i: number) => i !== index) })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <Select
                value={addType}
                onChange={(value) => setAddType(value as ChatChannelType)}
                options={(Object.keys(CHANNEL_META) as ChatChannelType[]).map((type) => ({ value: type, label: CHANNEL_META[type].label }))}
                className="sm:w-56"
              />
              <Button
                icon={Plus}
                onClick={() =>
                  setCfg({ ...cfg, channels: [...cfg.channels, { id: newId(), type: addType, label: '', value: '', enabled: true }] })
                }
              >
                Add
              </Button>
            </div>
            <Field label="WhatsApp / SMS / Telegram message" hint="{product} becomes the product the visitor is looking at." className="mt-3">
              <input className="a-field" value={cfg.whatsappMessage} onChange={(e) => setCfg({ ...cfg, whatsappMessage: e.target.value })} />
            </Field>
          </Card>

          {/* ------------------------------------------------------ position & look */}
          <Card>
            <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Position & look
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-4">
              <div
                role="radiogroup"
                aria-label="Position on the screen"
                className="relative grid grid-cols-2 grid-rows-3 gap-1 p-2 h-44"
                style={{ borderRadius: 'var(--ds-r-md)', border: '2px solid var(--a-border)', background: 'var(--a-surface-2)' }}
              >
                {POSITIONS.map((position) => {
                  const selected = cfg.position === position.id;
                  const [v, h] = position.id.split('-');
                  return (
                    <button
                      key={position.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={position.label}
                      title={position.label}
                      onClick={() => setCfg({ ...cfg, position: position.id })}
                      className={`flex ${h === 'right' ? 'justify-end' : 'justify-start'} ${v === 'top' ? 'items-start' : v === 'bottom' ? 'items-end' : 'items-center'} cursor-pointer`}
                      style={{ borderRadius: 'var(--ds-r-sm)', background: selected ? tint(0.1) : 'transparent' }}
                    >
                      <span
                        className="w-5 h-5"
                        style={{
                          borderRadius: 'var(--ds-r-full)',
                          background: selected ? 'var(--primary)' : 'var(--a-border)',
                          boxShadow: selected ? 'var(--ds-ring)' : 'none',
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3">
                <Field label={`Distance from the side: ${cfg.offsetX}px`}>
                  <input type="range" min={0} max={80} value={cfg.offsetX} onChange={(e) => setCfg({ ...cfg, offsetX: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--primary)' }} />
                </Field>
                <Field label={`Distance from the top/bottom: ${cfg.offsetY}px`}>
                  <input type="range" min={0} max={160} value={cfg.offsetY} onChange={(e) => setCfg({ ...cfg, offsetY: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--primary)' }} />
                </Field>
                <Field label="Style">
                  <Select
                    value={cfg.style}
                    onChange={(value) => setCfg({ ...cfg, style: value })}
                    options={[
                      { value: 'popup', label: 'Popup card with greeting' },
                      { value: 'stack', label: 'Row of app icons' },
                    ]}
                  />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Button colour" hint="Empty = your brand colour · used with 2+ options">
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Button colour picker"
                    value={/^#[0-9a-f]{6}$/i.test(cfg.launcherColor) ? cfg.launcherColor : '#0f8a5f'}
                    onChange={(e) => setCfg({ ...cfg, launcherColor: e.target.value })}
                    style={{ width: 38, height: 38, padding: 2, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}
                  />
                  <input className="a-field ds-num" value={cfg.launcherColor} placeholder="Brand" onChange={(e) => setCfg({ ...cfg, launcherColor: e.target.value.trim() })} />
                </div>
              </Field>
              <Field label="Button icon" hint="Used when 2 or more options are shown">
                <div className="flex gap-1.5">
                  {Object.entries(LAUNCHER_ICONS).map(([id, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={cfg.launcherIcon === id}
                      aria-label={id}
                      onClick={() => setCfg({ ...cfg, launcherIcon: id })}
                      className="w-10 h-10 inline-flex items-center justify-center cursor-pointer"
                      style={{
                        borderRadius: 'var(--ds-r-md)',
                        border: `1px solid ${cfg.launcherIcon === id ? 'var(--primary)' : 'var(--a-border)'}`,
                        background: cfg.launcherIcon === id ? tint(0.1) : 'var(--a-surface)',
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Text beside the button" hint="Optional, computers only">
                <input className="a-field" value={cfg.launcherLabel} placeholder="Chat with us" onChange={(e) => setCfg({ ...cfg, launcherLabel: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <Toggle checked={cfg.pulse} onChange={(value) => setCfg({ ...cfg, pulse: value })} label="Gentle pulse to draw attention" />
            </div>
          </Card>

          {/* ------------------------------------------------------ popup content */}
          <Card>
            <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Popup & greeting
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Title">
                <input className="a-field" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
              </Field>
              <Field label="Photo / logo link" hint="Optional round picture in the header">
                <input className="a-field" value={cfg.agentPhoto} onChange={(e) => setCfg({ ...cfg, agentPhoto: e.target.value })} />
              </Field>
            </div>
            <Field label="Greeting" className="mt-3">
              <textarea className="a-field" rows={2} value={cfg.greeting} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} />
            </Field>
            <div className="mt-3 p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
              <Toggle
                checked={cfg.businessHours.enabled}
                onChange={(value) => setCfg({ ...cfg, businessHours: { ...cfg.businessHours, enabled: value } })}
                label="Business hours"
                description="Shows a green 'online' dot during these hours, grey outside them."
              />
              {cfg.businessHours.enabled && (
                <div className="grid grid-cols-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] gap-3">
                  <Field label="Opens">
                    <input type="time" className="a-field ds-num" value={cfg.businessHours.open} onChange={(e) => setCfg({ ...cfg, businessHours: { ...cfg.businessHours, open: e.target.value } })} />
                  </Field>
                  <Field label="Closes">
                    <input type="time" className="a-field ds-num" value={cfg.businessHours.close} onChange={(e) => setCfg({ ...cfg, businessHours: { ...cfg.businessHours, close: e.target.value } })} />
                  </Field>
                  <Field label="Offline text" className="col-span-2 sm:col-span-1">
                    <input
                      className="a-field"
                      value={cfg.businessHours.offlineText}
                      placeholder="Offline now — leave us a message"
                      onChange={(e) => setCfg({ ...cfg, businessHours: { ...cfg.businessHours, offlineText: e.target.value } })}
                    />
                  </Field>
                </div>
              )}
            </div>
            <div className="mt-3 p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
              <Toggle
                checked={cfg.greetingBubble.enabled}
                onChange={(value) => setCfg({ ...cfg, greetingBubble: { ...cfg.greetingBubble, enabled: value } })}
                label="Greeting bubble"
                description="A small message pops up next to the button once per visit."
              />
              {cfg.greetingBubble.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
                  <Field label="Bubble text">
                    <input className="a-field" value={cfg.greetingBubble.text} onChange={(e) => setCfg({ ...cfg, greetingBubble: { ...cfg.greetingBubble, text: e.target.value } })} />
                  </Field>
                  <Field label="After (seconds)">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="a-field ds-num"
                      value={cfg.greetingBubble.delaySec}
                      onChange={(e) => setCfg({ ...cfg, greetingBubble: { ...cfg.greetingBubble, delaySec: Number(e.target.value) } })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------ preview */}
        <div className="xl:sticky xl:top-20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              Live preview
            </span>
            <div className="inline-flex p-1 gap-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}>
              {(
                [
                  ['desktop', Monitor],
                  ['mobile', Smartphone],
                ] as const
              ).map(([id, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`${id} preview`}
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                  className="w-8 h-7 inline-flex items-center justify-center cursor-pointer"
                  style={{ borderRadius: 'var(--ds-r-sm)', background: device === id ? 'var(--a-surface)' : 'transparent' }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div
            className="relative mx-auto overflow-hidden"
            style={{
              width: device === 'mobile' ? 360 : '100%',
              maxWidth: '100%',
              height: 600,
              borderRadius: device === 'mobile' ? 28 : 'var(--ds-r-lg)',
              border: device === 'mobile' ? '8px solid #111827' : '1px solid var(--a-border)',
              background: 'linear-gradient(180deg, var(--a-surface-2), var(--a-surface))',
              boxShadow: 'var(--ds-shadow-md)',
            }}
          >
            <div className="p-4 space-y-3" aria-hidden>
              <div className="ds-skeleton h-8 w-1/3" style={{ animation: 'none' }} />
              <div className="ds-skeleton h-32 w-full" style={{ animation: 'none' }} />
              <div className="grid grid-cols-2 gap-3">
                <div className="ds-skeleton h-28" style={{ animation: 'none' }} />
                <div className="ds-skeleton h-28" style={{ animation: 'none' }} />
              </div>
            </div>
            <ChatWidget key={`${device}-${cfg.style}-${cfg.position}`} preview previewConfig={cfg} previewMobile={device === 'mobile'} />
            {!cfg.enabled && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,.6)' }}>
                <span className="font-bold" style={{ color: 'var(--a-text-muted)' }}>
                  Widget is OFF
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
