import React, { useEffect, useState } from 'react';
import { Save, Phone, MapPin, Map as MapIcon, FileText, ExternalLink, MessageCircle, ListChecks } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, useToasts } from './ui.tsx';

interface ContactPageConfig {
  heading: string;
  intro: string;
  formEnabled: boolean;
  formTitle: string;
  emailRequired: boolean;
  addressRequired: boolean;
  messagePlaceholder: string;
  successMessage: string;
  hotline: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  mapUrl: string;
  showMap: boolean;
}

/**
 * Customers → Messages → Contact page. Everything shown on the website's
 * Contact page, in one form. Empty contact fields fall back to the numbers
 * already saved in Website settings and the Chat Widget (shown as grey
 * placeholders), so nothing has to be typed twice.
 */
export const AdminContactPageEditor: React.FC = () => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<ContactPageConfig | null>(null);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/contact-page')
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Could not load the contact page settings.');
        setCfg(data.page);
        setFallback(data.fallback || {});
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Card>
        <p style={{ color: 'var(--ds-danger-text)' }}>{error}</p>
      </Card>
    );
  }
  if (!cfg) {
    return (
      <Card>
        <div className="py-10 text-center" style={{ color: 'var(--a-text-muted)' }}>
          Loading...
        </div>
      </Card>
    );
  }

  const set = (patch: Partial<ContactPageConfig>) => setCfg((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/contact-page', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      toasts.push('Contact page saved. It is live on the website now.');
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const fallbackHint = (key: string) =>
    fallback[key] ? `Empty uses “${fallback[key]}” from your other settings.` : 'Leave empty to hide this card.';

  return (
    <div className="space-y-4">
      {toasts.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
          What visitors see on your Contact page. Messages they send arrive in the Inbox tab.
        </p>
        <div className="flex gap-2 shrink-0">
          <a href="/contact" target="_blank" rel="noopener noreferrer">
            <Button icon={ExternalLink}>View page</Button>
          </a>
          <Button variant="primary" icon={Save} loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader title="Page text" icon={FileText} accent="var(--ds-indigo)" />
          <div className="space-y-4">
            <Field label="Heading">
              <input className="a-field" value={cfg.heading} onChange={(e) => set({ heading: e.target.value })} placeholder="We are here to help" />
            </Field>
            <Field label="Short introduction">
              <textarea
                className="a-field"
                rows={3}
                value={cfg.intro}
                onChange={(e) => set({ intro: e.target.value })}
                placeholder="Ask about any medicine, an order or a delivery. Send us a message and we will call you back."
              />
            </Field>
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Longer text (like the Bangla “যোগাযোগ করুন” section) comes from Website → Pages → Contact and shows under the contact cards.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact details" subtitle="Each filled line becomes a card beside the form." icon={Phone} accent="var(--primary)" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Hotline" hint={fallbackHint('hotline')}>
              <input className="a-field ds-num" value={cfg.hotline} onChange={(e) => set({ hotline: e.target.value })} placeholder={fallback.hotline || '01XXXXXXXXX'} />
            </Field>
            <Field label="WhatsApp" hint={fallbackHint('whatsapp')}>
              <input className="a-field ds-num" value={cfg.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder={fallback.whatsapp || '01XXXXXXXXX'} />
            </Field>
            <Field label="Email" hint={fallbackHint('email')}>
              <input className="a-field" value={cfg.email} onChange={(e) => set({ email: e.target.value })} placeholder={fallback.email || 'info@yourshop.com'} />
            </Field>
            <Field label="Opening hours" hint={fallbackHint('hours')}>
              <input className="a-field" value={cfg.hours} onChange={(e) => set({ hours: e.target.value })} placeholder={fallback.hours || 'Sat–Thu, 9am – 10pm'} />
            </Field>
            <Field label="Address" hint={fallbackHint('address')} className="sm:col-span-2">
              <textarea className="a-field" rows={2} value={cfg.address} onChange={(e) => set({ address: e.target.value })} placeholder={fallback.address || 'Shop address'} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Message form" icon={ListChecks} accent="var(--ds-teal)" />
          <div className="space-y-4">
            <Toggle
              checked={cfg.formEnabled}
              onChange={(value) => set({ formEnabled: value })}
              label="Show the message form"
              description="Off: the page only shows your contact details."
            />
            {cfg.formEnabled && (
              <>
                <Field label="Form title">
                  <input className="a-field" value={cfg.formTitle} onChange={(e) => set({ formTitle: e.target.value })} placeholder="Send us a message" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Toggle checked={cfg.emailRequired} onChange={(value) => set({ emailRequired: value })} label="Email is required" description="Off: email becomes optional." />
                  <Toggle checked={cfg.addressRequired} onChange={(value) => set({ addressRequired: value })} label="Address is required" description="Off: address becomes optional." />
                </div>
                <Field label="Hint inside the message box">
                  <input
                    className="a-field"
                    value={cfg.messagePlaceholder}
                    onChange={(e) => set({ messagePlaceholder: e.target.value })}
                    placeholder="Which medicine do you need, or how can we help?"
                  />
                </Field>
                <Field label="Thank-you text after sending">
                  <input
                    className="a-field"
                    value={cfg.successMessage}
                    onChange={(e) => set({ successMessage: e.target.value })}
                    placeholder="We received your message."
                  />
                </Field>
                <p className="inline-flex items-start gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <MessageCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  New messages show a badge on Customers → Messages and in the bell. For a text or email alert too, turn on “New contact message” in SMS, or “Email me new contact messages” in System Configuration → Email.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Map" icon={MapIcon} accent="var(--ds-rose)" />
          <div className="space-y-4">
            <Toggle checked={cfg.showMap} onChange={(value) => set({ showMap: value })} label="Show a map on the page" />
            {cfg.showMap && (
              <Field
                label="Google Maps embed link"
                hint="In Google Maps: Share → Embed a map → Copy HTML, and paste it here (the whole code is fine)."
              >
                <textarea
                  className="a-field"
                  rows={3}
                  value={cfg.mapUrl}
                  onChange={(e) => set({ mapUrl: e.target.value })}
                  placeholder='<iframe src="https://www.google.com/maps/embed?pb=..." ...></iframe>'
                />
              </Field>
            )}
            {cfg.showMap && /src=|^https:\/\//i.test(cfg.mapUrl.trim()) && (
              <div className="overflow-hidden" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}>
                <iframe
                  title="Map preview"
                  src={(cfg.mapUrl.match(/src=["']([^"']+)["']/i)?.[1] || cfg.mapUrl).trim()}
                  className="w-full block"
                  style={{ height: 200, border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
            {cfg.showMap && !cfg.mapUrl.trim() && (fallback.address || cfg.address) && (
              <p className="inline-flex items-start gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                Without a link, the address card opens Google Maps when tapped.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={saving} onClick={save}>
          Save contact page
        </Button>
      </div>
    </div>
  );
};
