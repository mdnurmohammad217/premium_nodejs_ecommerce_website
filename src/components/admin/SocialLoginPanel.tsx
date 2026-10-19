import React, { useEffect, useState } from 'react';
import { KeyRound, Save, Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Badge, mix } from './ui.tsx';

/**
 * v3.12 — System Configuration → Social Login.
 * "Continue with Google" and "Continue with Facebook" on the customer sign-in
 * and sign-up pages. A master switch plus one switch per provider, and the
 * keys from Google Cloud Console / Meta for Developers. Secrets stay on the
 * server: the page only shows whether one is saved.
 */
interface LoadedConfig {
  enabled: boolean;
  google: { enabled: boolean; clientId: string; hasSecret: boolean };
  facebook: { enabled: boolean; appId: string; hasSecret: boolean };
  callbacks: { google: string; facebook: string };
  live: { google: boolean; facebook: boolean };
}

const CopyBox: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="a-label">{label}</div>
      <div className="flex gap-2">
        <input className="a-field flex-1" readOnly value={value} onFocus={(event) => event.currentTarget.select()} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--a-fs-sm)' }} />
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
};

export const SocialLoginPanel: React.FC = () => {
  const [loaded, setLoaded] = useState<LoadedConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [google, setGoogle] = useState({ enabled: true, clientId: '', clientSecret: '', clearSecret: false });
  const [facebook, setFacebook] = useState({ enabled: true, appId: '', appSecret: '', clearSecret: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const apply = (data: LoadedConfig) => {
    setLoaded(data);
    setEnabled(Boolean(data.enabled));
    setGoogle({ enabled: data.google.enabled, clientId: data.google.clientId, clientSecret: '', clearSecret: false });
    setFacebook({ enabled: data.facebook.enabled, appId: data.facebook.appId, appSecret: '', clearSecret: false });
  };

  useEffect(() => {
    fetch('/api/admin/social-login', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Could not load the settings.');
        apply(data);
      })
      .catch((err) => setLoadError(err?.message || 'Could not load the settings.'));
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/social-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, google, facebook }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save.');
      const fresh = await fetch('/api/admin/social-login', { cache: 'no-store' }).then((r) => r.json());
      apply(fresh);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <Card><p className="ds-error-text">{loadError}</p></Card>;
  if (!loaded) return <Card><p style={{ color: 'var(--a-text-muted)' }}>Loading…</p></Card>;

  const status = (live: boolean) => <Badge status={live ? 'active' : 'inactive'} dot>{live ? 'Live' : 'Off'}</Badge>;
  const secretHint = (has: boolean) => (has ? 'A secret is saved. Leave empty to keep it.' : 'Not saved yet.');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Social Login"
          subtitle="Let customers sign in or create an account with one tap — “Continue with Google” and “Continue with Facebook” on the sign-in and sign-up pages."
          icon={KeyRound}
          accent="var(--ds-indigo)"
          actions={
            <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          }
        />
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Social login on the website"
          description="The main switch. When off, no Google or Facebook button is shown anywhere."
        />
        <div
          className="mt-4 p-3 flex items-start gap-2"
          style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-indigo)', 0.06), fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ds-indigo)' }} />
          <span>
            Only customer accounts can use it (never the dashboard). A customer whose e-mail already has an account here is signed in to that
            account; anyone else gets a new customer account. The phone number is added from their first order.
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Google" subtitle="Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)." actions={status(loaded.live.google)} />
        <Toggle checked={google.enabled} onChange={(value) => setGoogle((g) => ({ ...g, enabled: value }))} label="Show “Continue with Google”" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Client ID" hint="Ends with .apps.googleusercontent.com">
            <input
              className="a-field"
              value={google.clientId}
              placeholder="1234567890-abc….apps.googleusercontent.com"
              onChange={(event) => setGoogle((g) => ({ ...g, clientId: event.target.value.trim() }))}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <Field label="Client secret" hint={secretHint(loaded.google.hasSecret)}>
            <input
              className="a-field"
              type="password"
              autoComplete="new-password"
              value={google.clientSecret}
              placeholder={loaded.google.hasSecret ? '••••••••••••' : 'GOCSPX-…'}
              onChange={(event) => setGoogle((g) => ({ ...g, clientSecret: event.target.value.trim(), clearSecret: false }))}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </div>
        <div className="mt-4">
          <CopyBox label="Authorized redirect URI (paste this in Google)" value={loaded.callbacks.google} />
        </div>
        <p className="mt-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          In Google: create an OAuth client of type “Web application”, add the address above under “Authorized redirect URIs”, and publish the
          OAuth consent screen (status “In production”).{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--primary-ink, var(--primary))' }}>
            Open Google Cloud <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </p>
      </Card>

      <Card>
        <CardHeader title="Facebook" subtitle="Meta for Developers → My Apps → your app → Facebook Login → Settings." actions={status(loaded.live.facebook)} />
        <Toggle checked={facebook.enabled} onChange={(value) => setFacebook((f) => ({ ...f, enabled: value }))} label="Show “Continue with Facebook”" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="App ID" hint="Digits only">
            <input
              className="a-field"
              value={facebook.appId}
              inputMode="numeric"
              placeholder="123456789012345"
              onChange={(event) => setFacebook((f) => ({ ...f, appId: event.target.value.trim() }))}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <Field label="App secret" hint={secretHint(loaded.facebook.hasSecret)}>
            <input
              className="a-field"
              type="password"
              autoComplete="new-password"
              value={facebook.appSecret}
              placeholder={loaded.facebook.hasSecret ? '••••••••••••' : 'App secret'}
              onChange={(event) => setFacebook((f) => ({ ...f, appSecret: event.target.value.trim(), clearSecret: false }))}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </div>
        <div className="mt-4">
          <CopyBox label="Valid OAuth Redirect URI (paste this in Facebook Login → Settings)" value={loaded.callbacks.facebook} />
        </div>
        <p className="mt-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          In Meta: add the “Facebook Login” product, paste the address above, ask for the <span className="ds-num">email</span> and{' '}
          <span className="ds-num">public_profile</span> permissions, and switch the app to Live mode.{' '}
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--primary-ink, var(--primary))' }}>
            Open Meta for Developers <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </p>
      </Card>

      {error && <p className="ds-error-text">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save Social Login'}
        </Button>
      </div>
    </div>
  );
};
