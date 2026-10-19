/**
 * Email (SMTP) — password reset mail and admin alerts
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerEmailRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import { eq, inArray } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import express from 'express';
import type * as Server from '../../../server.ts';

type SessionPayload = Server.SessionPayload;


export interface RegisterEmailRoutesDeps {
  app: typeof Server.app;
  escapeHtml: typeof Server.escapeHtml;
  privateResponse: typeof Server.privateResponse;
}

export function registerEmailRoutes(deps: RegisterEmailRoutesDeps) {
// ==========================================
// EMAIL (SMTP) — password reset mail and admin alerts
// ==========================================
/**
 * `email_config` (server-only, like the SMS keys):
 *   host, port, security (ssl | starttls | none), user, pass, fromName, fromEmail
 *   passwordReset   send reset codes/links by email
 *   notifyContact   email the shop when the Contact form is used (to notifyTo)
 * Works with Gmail (App Password), Hostinger, cPanel mail, Zoho, Brevo …
 */
async function readEmailConfig(): Promise<any> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'email_config'));
    return rows.length > 0 ? JSON.parse(rows[0].value) || {} : {};
  } catch {
    return {};
  }
}

const emailReady = (cfg: any) =>
  Boolean(cfg?.enabled && String(cfg.host || '').trim() && /@/.test(String(cfg.fromEmail || cfg.user || '')));

async function sendEmail(
  message: { to: string; subject: string; html: string; text: string; replyTo?: string },
  override?: any
): Promise<{ ok: boolean; error?: string }> {
  const cfg = override || (await readEmailConfig());
  if (!emailReady(cfg)) return { ok: false, error: 'Email (SMTP) is not set up.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(message.to || ''))) return { ok: false, error: 'The recipient email is not valid.' };
  try {
    const port = Number(cfg.port) || (cfg.security === 'ssl' ? 465 : 587);
    const transport = nodemailer.createTransport({
      host: String(cfg.host).trim(),
      port,
      secure: cfg.security === 'ssl' || (cfg.security === undefined && port === 465),
      requireTLS: cfg.security === 'starttls',
      ignoreTLS: cfg.security === 'none',
      auth: cfg.user ? { user: String(cfg.user).trim(), pass: String(cfg.pass || '') } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    } as any);
    const fromEmail = String(cfg.fromEmail || cfg.user).trim();
    const fromName = String(cfg.fromName || '').replace(/["<>]/g, '').trim();
    await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo || undefined,
    });
    return { ok: true };
  } catch (error: any) {
    const text = String(error?.response || error?.message || error || 'Could not send the email.');
    console.error('[email] send failed:', text);
    if (/invalid login|username and password not accepted|535/i.test(text)) {
      return { ok: false, error: 'The mail server refused the username or password. For Gmail, use an App Password.' };
    }
    if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout/i.test(text)) {
      return { ok: false, error: 'Could not connect to the mail server. Check the host, port and security setting.' };
    }
    return { ok: false, error: text.slice(0, 300) };
  }
}

/** Store name, logo and colour for branded emails */
async function emailBrand() {
  try {
    const rows = await db
      .select()
      .from(siteSettings)
      .where(inArray(siteSettings.key, ['general', 'logo_config', 'theme']));
    const map: Record<string, any> = {};
    rows.forEach((row) => {
      try {
        map[row.key] = JSON.parse(row.value);
      } catch {
        /* ignore */
      }
    });
    const general = map.general || {};
    const logo = map.logo_config || {};
    return {
      store: logo.pharmacyName || general.storeName || 'Our shop',
      phone: general.phone || '',
      logoUrl: logo.desktopLogoUrl || logo.mobileLogoUrl || '',
      color: /^#[0-9a-f]{3,8}$/i.test(String(map.theme?.primaryColor || '')) ? map.theme.primaryColor : '#059669',
    };
  } catch {
    return { store: 'Our shop', phone: '', logoUrl: '', color: '#059669' };
  }
}

/** One simple, table-based layout that renders in Gmail, Outlook and phones */
function emailLayout(brand: { store: string; logoUrl: string; color: string; phone: string }, origin: string, bodyHtml: string) {
  const logo = brand.logoUrl
    ? `<img src="${deps.escapeHtml(/^https?:/i.test(brand.logoUrl) ? brand.logoUrl : `${origin}${brand.logoUrl}`)}" alt="${deps.escapeHtml(brand.store)}" style="max-height:44px;max-width:200px">`
    : `<strong style="font-size:20px;color:#111827">${deps.escapeHtml(brand.store)}</strong>`;
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="height:5px;background:${deps.escapeHtml(brand.color)}"></td></tr>
<tr><td style="padding:24px 28px 8px">${logo}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;font-size:12px;color:#6b7280">${deps.escapeHtml(brand.store)}${brand.phone ? ` · ${deps.escapeHtml(brand.phone)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The address customers reach the shop on, for links inside SMS and email */
function publicOrigin(req?: express.Request, smsCfg?: any): string {
  const fromEnv = String(process.env.APP_URL || process.env.PUBLIC_URL || '').trim();
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv.replace(/\/+$/, '');
  const fromSms = String(smsCfg?.publicBaseUrl || '').trim();
  if (/^https?:\/\//i.test(fromSms)) return fromSms.replace(/\/+$/, '');
  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (host) return `${proto}://${host}`;
  }
  return '';
}

deps.app.get('/api/admin/email/config', async (_req, res) => {
  const cfg = await readEmailConfig();
  deps.privateResponse(res);
  res.json({ ...cfg, pass: '', hasPassword: Boolean(cfg.pass) });
});

const cleanEmailConfig = (body: any, stored: any) => ({
  enabled: Boolean(body.enabled),
  host: String(body.host || '').trim(),
  port: Number(body.port) || 0,
  security: ['ssl', 'starttls', 'none'].includes(body.security) ? body.security : 'ssl',
  user: String(body.user || '').trim(),
  // An empty password field means "keep the saved one"
  pass: String(body.pass || '') || String(stored.pass || ''),
  fromName: String(body.fromName || '').trim().slice(0, 100),
  fromEmail: String(body.fromEmail || '').trim().slice(0, 191),
  passwordReset: body.passwordReset !== false,
  notifyContact: Boolean(body.notifyContact),
  notifyTo: String(body.notifyTo || '').trim().slice(0, 500),
});

/** A staff member who points the mail at another server has to type the password again */
const emailHostProblem = (session: SessionPayload | undefined, body: any, stored: any) =>
  session?.role !== 'admin' &&
  !String(body?.pass || '') &&
  String(stored?.pass || '') &&
  (String(body?.host || '').trim().toLowerCase() !== String(stored?.host || '').trim().toLowerCase() || Number(body?.port) !== Number(stored?.port))
    ? 'Enter the mail password again when you change the mail server.'
    : '';

deps.app.put('/api/admin/email/config', async (req: any, res) => {
  try {
    const stored = await readEmailConfig();
    const hostProblem = emailHostProblem(req.session, req.body || {}, stored);
    if (hostProblem) return res.status(400).json({ error: hostProblem });
    const value = JSON.stringify(cleanEmailConfig(req.body || {}, stored));
    await db.insert(siteSettings).values({ key: 'email_config', value }).onDuplicateKeyUpdate({ set: { value } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('email config:', error);
    res.status(500).json({ error: 'Could not save the email settings.' });
  }
});

/** Sends a test mail with the settings on screen (saved password used if left empty) */
deps.app.post('/api/admin/email/test', async (req: any, res) => {
  const stored = await readEmailConfig();
  const hostProblem = req.body?.config ? emailHostProblem(req.session, req.body.config, stored) : '';
  if (hostProblem) return res.status(400).json({ error: hostProblem });
  const cfg = { ...cleanEmailConfig(req.body?.config || stored, stored), enabled: true };
  const to = String(req.body?.to || '').trim();
  const brand = await emailBrand();
  const result = await sendEmail(
    {
      to,
      subject: `Test email from ${brand.store}`,
      text: `This is a test email from ${brand.store}. Your email settings work.`,
      html: emailLayout(
        brand,
        publicOrigin(req),
        `<h2 style="margin:0 0 8px;font-size:20px">Your email settings work</h2><p style="margin:0">This test was sent from the dashboard of ${deps.escapeHtml(brand.store)}. Password reset emails and alerts will be delivered from this address.</p>`
      ),
    },
    cfg
  );
  res.status(result.ok ? 200 : 400).json(result.ok ? { success: true, message: `Test email sent to ${to}.` } : { error: result.error });
});

  return { emailBrand, emailLayout, emailReady, publicOrigin, readEmailConfig, sendEmail };
}
