import React, { useState } from 'react';
import { User, Phone, Mail, MapPin, MessageSquare, Send, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { findCmsPage, MarkdownArticle } from './DynamicPageView.tsx';
import { BRAND_ICONS } from './BrandIcons.tsx';
import { tracking } from '../../lib/tracking.ts';

interface ContactViewProps {
  settings?: SiteSettings;
}

type FieldKey = 'name' | 'phone' | 'email' | 'address' | 'message';

const waLink = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  const intl = digits.startsWith('880') ? digits : digits.startsWith('0') ? `88${digits}` : digits;
  return `https://wa.me/${intl}`;
};

/**
 * The Contact page: a form (name, phone, email, address, optional message)
 * that lands in Dashboard → Customers → Messages, beside the shop's own
 * contact details and the text written for this page in Dashboard → Pages.
 */
export const ContactView: React.FC<ContactViewProps> = ({ settings }) => {
  const general = settings?.general || ({} as any);
  const chat: any = (settings as any)?.chat_config || {};
  const page = findCmsPage(settings, 'contact');
  // Dashboard → Customers → Messages → Contact page (blank fields fall back below)
  const cp: any = (settings as any)?.contact_page || {};
  const formEnabled = cp.formEnabled !== false;
  const emailRequired = cp.emailRequired !== false;
  const addressRequired = cp.addressRequired !== false;
  const mapSrc = cp.showMap !== false ? String(cp.mapUrl || '').trim() : '';
  const [form, setForm] = useState<Record<FieldKey, string>>({ name: '', phone: '', email: '', address: '', message: '' });
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverError, setServerError] = useState('');

  const phone = cp.hotline || general.phone || '';
  const whatsapp =
    cp.whatsapp ||
    (Array.isArray(chat.channels)
      ? chat.channels.find((c: any) => c?.type === 'whatsapp' && c.enabled !== false && c.value)?.value
      : '') ||
    chat.whatsappNumber ||
    general.whatsapp ||
    '';
  const email = cp.email || general.email || '';
  const address = cp.address || general.address || '';
  const hours = cp.hours || (chat.businessHours?.enabled ? `${chat.businessHours.open} – ${chat.businessHours.close}` : '');

  const set = (key: FieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<FieldKey, string>> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your full name.';
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(form.phone.replace(/[\s-]+/g, ''))) next.phone = 'Enter a valid 11-digit mobile number.';
    if ((emailRequired || form.email.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = 'Enter a valid email address.';
    if (addressRequired && form.address.trim().length < 3) next.address = 'Please enter your address.';
    setErrors(next);
    return next;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = validate();
    const first = (['name', 'phone', 'email', 'address'] as FieldKey[]).find((key) => problems[key]);
    if (first) {
      document.getElementById(`ct-${first}`)?.focus();
      return;
    }
    setStatus('sending');
    setServerError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        throw new Error(
          data.error ||
            (phone ? `Could not send your message. Please call us on ${phone}.` : 'Could not send your message. Please try again.')
        );
      }
      setStatus('sent');
      tracking.contact('contact_form');
    } catch (err: any) {
      setStatus('error');
      setServerError(err.message);
    }
  };

  const input = (key: FieldKey, label: string, icon: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => (
    <div>
      <label htmlFor={`ct-${key}`} className="ds-label">
        {label} {optional ? <span className="text-(--ds-text-faint) font-normal">(optional)</span> : <span className="text-(--ds-danger)">*</span>}
      </label>
      <div className="relative">
        <span className="absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 text-(--ds-text-faint) pointer-events-none">{icon}</span>
        <input
          id={`ct-${key}`}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          aria-invalid={Boolean(errors[key]) || undefined}
          aria-describedby={errors[key] ? `ct-${key}-error` : undefined}
          className="ds-input h-(--ds-h-lg) pl-10"
          {...props}
        />
      </div>
      {errors[key] && (
        <p id={`ct-${key}-error`} className="ds-error-text">
          {errors[key]}
        </p>
      )}
    </div>
  );

  const infoCard = (icon: React.ReactNode, title: string, body: React.ReactNode, tone: string) => (
    <div className="flex items-start gap-(--ds-s-3) p-(--ds-s-4) rounded-(--ds-r-lg) bg-(--ds-surface) border border-(--ds-border)">
      <span className="w-11 h-11 shrink-0 rounded-(--ds-r-md) inline-flex items-center justify-center text-white" style={{ background: tone }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted)">{title}</p>
        <div className="text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text) break-words">{body}</div>
      </div>
    </div>
  );

  return (
    <div className="bg-(--ds-bg)">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(800px 300px at 15% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%)' }}
        />
        <div className="relative max-w-6xl mx-auto px-(--ds-s-4) pt-(--ds-s-10) pb-(--ds-s-6) sm:pt-(--ds-s-12)">
          <p className="text-(length:--ds-fs-sm) font-(--ds-fw-bold) tracking-wide uppercase text-(--primary)">Contact us</p>
          <h1 className="mt-(--ds-s-2) text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text)">
            {cp.heading || (page?.title && page.title.toLowerCase() !== 'contact' ? page.title : 'We are here to help')}
          </h1>
          <p className="mt-(--ds-s-2) max-w-2xl text-(length:--ds-fs-md) text-(--ds-text-soft)">
            {cp.intro || 'Ask about any medicine, an order or a delivery. Send us a message and we will call you back.'}
          </p>
        </div>
      </section>

      <div
        className={`max-w-6xl mx-auto px-(--ds-s-4) pb-(--ds-s-12) grid grid-cols-1 gap-(--ds-s-6) items-start ${
          formEnabled ? 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : 'lg:grid-cols-2'
        }`}
      >
        {/* Form */}
        {formEnabled && (
        <div className="ds-card p-(--ds-s-5) sm:p-(--ds-s-8)">
          {status === 'sent' ? (
            <div className="text-center py-(--ds-s-8) ds-fade-in" role="status">
              <span className="inline-flex w-16 h-16 rounded-(--ds-r-full) items-center justify-center bg-(--ds-success-soft) text-(--ds-success-text)">
                <CheckCircle2 className="w-8 h-8" />
              </span>
              <h2 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">Thank you, {form.name.split(' ')[0]}!</h2>
              <p className="mt-(--ds-s-2) text-(length:--ds-fs-md) text-(--ds-text-soft)">
                {cp.successMessage || 'We received your message.'} We will call you on{' '}
                <span className="ds-num font-(--ds-fw-semibold)">{form.phone}</span> soon.
              </p>
              <div className="mt-(--ds-s-6) flex flex-wrap justify-center gap-(--ds-s-2)">
                {whatsapp && (
                  <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-soft">
                    <BRAND_ICONS.whatsapp className="w-4 h-4" />
                    <span>Chat on WhatsApp</span>
                  </a>
                )}
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary"
                  onClick={() => {
                    setForm({ name: '', phone: '', email: '', address: '', message: '' });
                    setStatus('idle');
                  }}
                >
                  Send another message
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-(--ds-s-4)">
              <h2 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">{cp.formTitle || 'Send us a message'}</h2>
              {/* Hidden from people; bots fill it in */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
                className="absolute -left-[9999px] w-px h-px opacity-0"
                aria-hidden="true"
              />
              {input('name', 'Full name', <User className="w-4 h-4" />, { autoComplete: 'name', placeholder: 'Your name' })}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
                {input('phone', 'Phone number', <Phone className="w-4 h-4" />, {
                  autoComplete: 'tel',
                  inputMode: 'tel',
                  placeholder: '01XXXXXXXXX',
                })}
                {input('email', 'Email', <Mail className="w-4 h-4" />, { type: 'email', autoComplete: 'email', placeholder: 'you@example.com' }, !emailRequired)}
              </div>
              {input('address', 'Address', <MapPin className="w-4 h-4" />, { autoComplete: 'street-address', placeholder: 'Area, district' }, !addressRequired)}
              <div>
                <label htmlFor="ct-message" className="ds-label">
                  Message <span className="text-(--ds-text-faint) font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 absolute left-(--ds-s-3) top-(--ds-s-3) text-(--ds-text-faint) pointer-events-none" />
                  <textarea
                    id="ct-message"
                    rows={5}
                    maxLength={3000}
                    value={form.message}
                    onChange={(event) => set('message', event.target.value)}
                    placeholder={cp.messagePlaceholder || 'Which medicine do you need, or how can we help?'}
                    className="ds-textarea pl-10 resize-y"
                  />
                </div>
                <p className="mt-1 text-right text-(length:--ds-fs-xs) text-(--ds-text-faint) ds-num">{form.message.length}/3000</p>
              </div>

              {status === 'error' && serverError && (
                <p role="alert" className="flex items-start gap-(--ds-s-2) p-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) text-(length:--ds-fs-sm)">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {serverError}
                </p>
              )}

              <button type="submit" disabled={status === 'sending'} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block">
                {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{status === 'sending' ? 'Sending…' : 'Send Message'}</span>
              </button>
              <p className="text-center text-(length:--ds-fs-xs) text-(--ds-text-muted)">We only use your details to reply to you.</p>
            </form>
          )}
        </div>
        )}

        {/* Details */}
        <aside className="space-y-(--ds-s-3)">
          {phone && infoCard(<Phone className="w-5 h-5" />, 'Hotline', <a href={`tel:${phone}`} className="ds-num hover:text-(--primary)">{phone}</a>, 'var(--primary)')}
          {whatsapp &&
            infoCard(
              <BRAND_ICONS.whatsapp className="w-5 h-5" />,
              'WhatsApp',
              <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="ds-num hover:text-(--primary)">
                {whatsapp}
              </a>,
              '#25D366'
            )}
          {email && infoCard(<Mail className="w-5 h-5" />, 'Email', <a href={`mailto:${email}`} className="hover:text-(--primary)">{email}</a>, 'var(--ds-indigo)')}
          {address &&
            infoCard(
              <MapPin className="w-5 h-5" />,
              'Visit us',
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-(--primary)"
              >
                {address}
              </a>,
              'var(--ds-rose)'
            )}
          {hours && infoCard(<Clock className="w-5 h-5" />, 'Opening hours', <span className="ds-num">{hours}</span>, 'var(--ds-amber)')}
          {mapSrc && /^https:\/\//i.test(mapSrc) && (
            <div className="ds-card overflow-hidden p-0">
              <iframe
                title="Map"
                src={mapSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full block"
                style={{ height: 260, border: 0 }}
                allowFullScreen
              />
            </div>
          )}
          {page?.content && (
            <div className="ds-card p-(--ds-s-5)">
              <MarkdownArticle content={page.content} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
