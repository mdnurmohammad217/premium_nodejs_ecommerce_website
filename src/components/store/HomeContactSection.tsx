import React, { useState } from 'react';
import { CheckCircle2, Mail, MessageCircle, Phone, Send, User } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { tracking } from '../../lib/tracking.ts';

/**
 * v3.12 — "Need help?" block near the bottom of the home page: tap to call,
 * WhatsApp, e-mail, and a short message form (name, phone, message) that
 * lands in Dashboard → Messages like the Contact page form.
 * On/off and texts: Dashboard → Website → Home Sections.
 */
export const homeContactConfigOf = (settings?: SiteSettings) => {
  const raw = (((settings as any)?.home_sections_config || {}).contactSection || {}) as {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
  };
  return {
    enabled: raw.enabled !== false,
    title: String(raw.title || '').trim() || 'Need help with an order?',
    subtitle: String(raw.subtitle || '').trim() || 'Call or WhatsApp us, or leave a message — we reply quickly.',
  };
};

const telOf = (raw: string) => {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
  return digits;
};

export const HomeContactSection: React.FC<{ settings?: SiteSettings }> = ({ settings }) => {
  const cfg = homeContactConfigOf(settings);
  const general: any = settings?.general || {};
  const phone = String(general.phone || '').trim();
  const whatsapp = String(general.whatsapp || '').trim();
  const email = String(general.email || '').trim();
  const formEnabled = (settings as any)?.contact_page?.formEnabled !== false;

  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverError, setServerError] = useState('');

  if (!cfg.enabled || (!phone && !whatsapp && !email && !formEnabled)) return null;

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name.';
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(form.phone.replace(/[\s-]+/g, ''))) next.phone = 'Enter a valid 11-digit mobile number.';
    if (form.message.trim().length < 2) next.message = 'Please write your message.';
    setErrors(next);
    const first = (['name', 'phone', 'message'] as const).find((key) => next[key]);
    if (first) {
      document.getElementById(`hc-${first}`)?.focus();
      return;
    }
    setStatus('sending');
    setServerError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, quick: true, company: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        throw new Error(data.error || 'Could not send your message. Please try again.');
      }
      setStatus('sent');
      tracking.contact('home_contact_form');
    } catch (error: any) {
      setStatus('error');
      setServerError(error?.message || 'Could not send your message.');
    }
  };

  const wa = whatsapp ? telOf(whatsapp).replace(/^\+/, '') : '';
  const action = (href: string, icon: React.ReactNode, label: string, value: string, tone: string, external = false) => (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => tracking.contact(label.toLowerCase())}
      className="group flex items-center gap-(--ds-s-3) min-h-14 p-(--ds-s-3) rounded-(--ds-r-lg) bg-(--ds-surface) border border-(--ds-border) hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] hover:shadow-(--ds-shadow-sm) transition-[border-color,box-shadow]"
    >
      <span className="w-11 h-11 shrink-0 rounded-(--ds-r-md) inline-flex items-center justify-center text-white" style={{ background: tone }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">{label}</span>
        <span className="block text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) truncate group-hover:text-(--primary)">{value}</span>
      </span>
    </a>
  );

  const field = (key: 'name' | 'phone', label: string, icon: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`hc-${key}`} className="ds-label">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 text-(--ds-text-muted) pointer-events-none">{icon}</span>
        <input
          id={`hc-${key}`}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          aria-invalid={Boolean(errors[key]) || undefined}
          aria-describedby={errors[key] ? `hc-${key}-error` : undefined}
          className="ds-input h-(--ds-h-lg) pl-10"
          {...props}
        />
      </div>
      {errors[key] && (
        <p id={`hc-${key}-error`} className="ds-error-text">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-labelledby="home-contact-title">
      <div className="relative overflow-hidden rounded-[24px] border border-(--ds-border) bg-[color-mix(in_srgb,var(--primary)_5%,var(--ds-surface))] p-(--ds-s-5) sm:p-(--ds-s-8)">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--primary) 16%, transparent), transparent)' }}
        />
        <div className={`relative grid gap-(--ds-s-6) ${formEnabled ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-(--ds-s-10)' : ''}`}>
          <div className="min-w-0">
            <h2 id="home-contact-title" className="text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text) leading-tight">
              {cfg.title}
            </h2>
            <p className="mt-(--ds-s-2) text-(length:--ds-fs-md) text-(--ds-text-soft) leading-(--ds-lh-normal)">{cfg.subtitle}</p>
            <div className={`mt-(--ds-s-5) grid gap-(--ds-s-3) ${formEnabled ? '' : 'sm:grid-cols-3'}`}>
              {phone && action(`tel:${telOf(phone)}`, <Phone className="w-5 h-5" />, 'Call us', phone, 'var(--primary)')}
              {wa && action(`https://wa.me/${wa}`, <MessageCircle className="w-5 h-5" />, 'WhatsApp', whatsapp, '#128c4b', true)}
              {email && action(`mailto:${email}`, <Mail className="w-5 h-5" />, 'Email', email, '#3b5bdb')}
            </div>
          </div>

          {formEnabled && (
            <div className="min-w-0 rounded-(--ds-r-xl) bg-(--ds-surface) border border-(--ds-border) shadow-(--ds-shadow-sm) p-(--ds-s-5) sm:p-(--ds-s-6)">
              {status === 'sent' ? (
                <div className="h-full min-h-56 flex flex-col items-center justify-center text-center gap-(--ds-s-3)" role="status">
                  <CheckCircle2 className="w-12 h-12 text-(--ds-success)" />
                  <p className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Message sent — thank you!</p>
                  <p className="text-(length:--ds-fs-base) text-(--ds-text-soft)">We will call or message you back soon.</p>
                  <button
                    type="button"
                    className="ds-btn ds-btn-secondary"
                    onClick={() => {
                      setForm({ name: '', phone: '', message: '' });
                      setStatus('idle');
                    }}
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate className="space-y-(--ds-s-4)" aria-label="Send us a message">
                  <div className="grid sm:grid-cols-2 gap-(--ds-s-4)">
                    {field('name', 'Your name', <User className="w-4 h-4" />, { autoComplete: 'name', placeholder: 'Full name' })}
                    {field('phone', 'Mobile number', <Phone className="w-4 h-4" />, {
                      autoComplete: 'tel',
                      inputMode: 'tel',
                      placeholder: '01XXXXXXXXX',
                      maxLength: 14,
                    })}
                  </div>
                  <div>
                    <label htmlFor="hc-message" className="ds-label">
                      Message
                    </label>
                    <textarea
                      id="hc-message"
                      value={form.message}
                      onChange={(event) => set('message', event.target.value)}
                      rows={3}
                      maxLength={3000}
                      placeholder="How can we help?"
                      aria-invalid={Boolean(errors.message) || undefined}
                      aria-describedby={errors.message ? 'hc-message-error' : undefined}
                      className="ds-textarea min-h-24 resize-y"
                    />
                    {errors.message && (
                      <p id="hc-message-error" className="ds-error-text">
                        {errors.message}
                      </p>
                    )}
                  </div>
                  {/* People never see this; bots fill it in */}
                  <input
                    type="text"
                    name="company"
                    value={honeypot}
                    onChange={(event) => setHoneypot(event.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[9999px] w-px h-px opacity-0"
                  />
                  {status === 'error' && serverError && (
                    <p className="ds-error-text" role="alert">
                      {serverError}
                    </p>
                  )}
                  <button type="submit" className="ds-btn ds-btn-primary w-full h-(--ds-h-lg)" disabled={status === 'sending'}>
                    {status === 'sending' ? <span className="ds-spinner w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {status === 'sending' ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
