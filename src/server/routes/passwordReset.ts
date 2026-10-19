/**
 * Password reset — customers, staff and the owner (codes by SMS / email, reset links)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerPasswordResetRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import crypto from 'crypto';
import { db } from '../../db/index.ts';
import { siteSettings, users, customers, passwordResets } from '../../db/schema.ts';
import { eq, or, sql, and } from 'drizzle-orm';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';


export type ResetAccountType = 'customer' | 'staff' | 'owner';

export interface ResetAccount {
  type: ResetAccountType;
  id: number | null;
  name: string;
  phone: string;
  email: string;
}

export interface RegisterPasswordResetRoutesDeps {
  app: typeof Server.app;
  bdMobile: typeof Server.bdMobile;
  clearLoginFailures: typeof Server.clearLoginFailures;
  clientIp: typeof Server.clientIp;
  DEFAULT_ADMIN_AUTH: typeof Server.DEFAULT_ADMIN_AUTH;
  emailBrand: typeof Server.emailBrand;
  emailLayout: typeof Server.emailLayout;
  emailReady: typeof Server.emailReady;
  escapeHtml: typeof Server.escapeHtml;
  fillTemplate: typeof Server.fillTemplate;
  loginThrottle: typeof Server.loginThrottle;
  makePasswordRecord: typeof Server.makePasswordRecord;
  noteLoginFailure: typeof Server.noteLoginFailure;
  notifyAdmin: typeof Server.notifyAdmin;
  passwordChangedCache: typeof Server.passwordChangedCache;
  privateResponse: typeof Server.privateResponse;
  publicOrigin: typeof Server.publicOrigin;
  readEmailConfig: typeof Server.readEmailConfig;
  readSmsConfig: typeof Server.readSmsConfig;
  safeEqual: typeof Server.safeEqual;
  sendEmail: typeof Server.sendEmail;
  sendSms: typeof Server.sendSms;
  SESSION_SECRET: typeof Server.SESSION_SECRET;
  sha256: typeof Server.sha256;
  smsEventConfig: typeof Server.smsEventConfig;
  smsGatewayReady: typeof Server.smsGatewayReady;
  sqlRows: typeof Server.sqlRows;
}

export function registerPasswordResetRoutes(deps: RegisterPasswordResetRoutesDeps) {
// ===========================================================================
// PASSWORD RESET — customers, staff and the owner
// ---------------------------------------------------------------------------
// 1. "Forgot password" takes the mobile number or email the person signs in
//    with. A 6-digit code goes out by SMS (the shop's SMS gateway) or email
//    (SMTP); the email also carries a one-click link.
// 2. The code is checked (5 tries), which unlocks a 15-minute reset token.
// 3. The new password is saved, every other outstanding request for that
//    account is voided, and sessions signed in before the reset stop working.
// Codes and tokens are stored only as hashes. The answer never says whether an
// account exists. Every request is logged for the dashboard.
// ===========================================================================

const RESET_SMS_MINUTES = 10;
const RESET_EMAIL_MINUTES = 30;
const RESET_TOKEN_MINUTES = 15;
const RESET_LINK_MINUTES = 60;
const RESET_MAX_ATTEMPTS = 5;
const RESET_COOLDOWN_SECONDS = 60;
const RESET_MAX_PER_ID_HOUR = 5;
const RESET_MAX_PER_IP_HOUR = 15;

const resetCodeHash = (identifier: string, code: string) =>
  crypto.createHmac('sha256', deps.SESSION_SECRET).update(`reset:${identifier}:${code}`).digest('hex');

function normalizeResetId(raw: any): { kind: 'email' | 'phone'; value: string } {
  const text = String(raw || '').trim();
  if (text.includes('@')) {
    const email = text.toLowerCase();
    return { kind: 'email', value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '' };
  }
  return { kind: 'phone', value: deps.bdMobile(text) };
}

const maskPhone = (phone: string) => (phone.length >= 11 ? `${phone.slice(0, 3)}•••••${phone.slice(-3)}` : '•••');
const maskEmail = (email: string) => {
  const [user, domain] = String(email).split('@');
  if (!domain) return '•••';
  return `${user.slice(0, Math.min(2, user.length))}${'•'.repeat(Math.max(3, Math.min(6, user.length - 2)))}@${domain}`;
};

async function readAdminAuth(): Promise<any> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'admin_auth')).limit(1);
    if (rows.length > 0) return JSON.parse(rows[0].value) || { ...deps.DEFAULT_ADMIN_AUTH };
  } catch {
    /* fall through */
  }
  return { ...deps.DEFAULT_ADMIN_AUTH };
}

/** The account a sign-in name belongs to — same order as the sign-in itself */
async function findResetAccount(id: { kind: 'email' | 'phone'; value: string }): Promise<(ResetAccount & { blocked?: boolean }) | null> {
  if (!id.value) return null;
  if (id.kind === 'email') {
    const auth = await readAdminAuth();
    if (String(auth.email || '').toLowerCase().trim() === id.value) {
      return { type: 'owner', id: null, name: 'Admin', phone: deps.bdMobile(auth.recoveryPhone), email: String(auth.email) };
    }
    const staff = (await db.select().from(users).where(eq(users.email, id.value)).limit(1))[0];
    if (staff && staff.passwordHash) {
      return {
        type: 'staff',
        id: staff.id,
        name: staff.name,
        phone: deps.bdMobile(staff.phone),
        email: staff.email,
        blocked: staff.status !== 'active',
      };
    }
    const customer = (await db.select().from(customers).where(eq(customers.email, id.value)).limit(1))[0];
    if (customer) {
      return {
        type: 'customer',
        id: customer.id,
        name: customer.name,
        phone: deps.bdMobile(customer.phone),
        email: customer.email || '',
        blocked: customer.status === 'blocked',
      };
    }
    return null;
  }
  // A mobile number signs in to a customer account only (staff use email)
  const phone = id.value;
  const customer = (
    await db
      .select()
      .from(customers)
      .where(or(eq(customers.phone, phone), eq(customers.phone, `+88${phone}`), eq(customers.phone, `88${phone}`)))
      .limit(1)
  )[0];
  if (!customer) return null;
  return {
    type: 'customer',
    id: customer.id,
    name: customer.name,
    phone,
    email: customer.email || '',
    blocked: customer.status === 'blocked',
  };
}

async function resetChannels() {
  const sms = await deps.readSmsConfig();
  const email = await deps.readEmailConfig();
  return {
    sms,
    email,
    smsReady: deps.smsGatewayReady(sms) && deps.smsEventConfig(sms, 'password_reset').enabled,
    emailReady: deps.emailReady(email) && email.passwordReset !== false,
  };
}

/** Saves the new password and signs the account out everywhere else */
async function setAccountPassword(account: { type: ResetAccountType; id: number | null }, password: string) {
  const stamp = Date.now();
  const hash = deps.makePasswordRecord(password);
  if (account.type === 'owner') {
    const auth = await readAdminAuth();
    const value = JSON.stringify({
      ...auth,
      passwordHash: hash,
      mustChangePassword: false,
      passwordChangedAt: stamp,
      updatedAt: new Date(stamp).toISOString(),
    });
    await db.insert(siteSettings).values({ key: 'admin_auth', value }).onDuplicateKeyUpdate({ set: { value } });
    deps.passwordChangedCache.set('admin_root', { at: Date.now(), value: stamp });
    return;
  }
  const id = Number(account.id);
  if (account.type === 'staff') {
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, id));
    await db.execute(sql`UPDATE users SET password_changed_at = ${stamp} WHERE id = ${id}`).catch(() => undefined);
    deps.passwordChangedCache.set(`staff_${id}`, { at: Date.now(), value: stamp });
    return;
  }
  await db.update(customers).set({ passwordHash: hash }).where(eq(customers.id, id));
  await db.execute(sql`UPDATE customers SET password_changed_at = ${stamp} WHERE id = ${id}`).catch(() => undefined);
  deps.passwordChangedCache.set(`customer_${id}`, { at: Date.now(), value: stamp });
}

async function logResetRequest(row: {
  account?: ResetAccount | null;
  identifier: string;
  channel: string;
  destination?: string;
  codeHash?: string | null;
  tokenHash?: string | null;
  status: string;
  error?: string | null;
  ip?: string;
  userAgent?: string;
  minutes: number;
}): Promise<number | null> {
  try {
    const result: any = await db.execute(sql`INSERT INTO password_reset_requests
      (account_type, account_id, account_name, identifier, channel, destination, code_hash, token_hash, status, error,
       ip_address, user_agent, expires_at)
      VALUES (${row.account?.type || 'none'}, ${row.account?.id ?? null}, ${row.account?.name?.slice(0, 191) || null},
              ${row.identifier.slice(0, 191)}, ${row.channel}, ${row.destination?.slice(0, 191) || null},
              ${row.codeHash || null}, ${row.tokenHash || null}, ${row.status}, ${row.error?.slice(0, 255) || null},
              ${row.ip || null}, ${String(row.userAgent || '').slice(0, 255) || null},
              NOW() + INTERVAL ${sql.raw(String(Math.max(1, Math.round(row.minutes))))} MINUTE)`);
    return Number(result?.[0]?.insertId) || null;
  } catch (error: any) {
    console.error('[password-reset] could not log:', error?.message || error);
    return null;
  }
}

/** What the sign-in page needs to word the reset screen */
deps.app.get('/api/auth/reset-options', async (_req, res) => {
  const channels = await resetChannels();
  const brand = await deps.emailBrand();
  res.json({ sms: channels.smsReady, email: channels.emailReady, storePhone: brand.phone });
});

deps.app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const raw = String(req.body?.identifier ?? req.body?.email ?? req.body?.phone ?? '').trim();
    const id = normalizeResetId(raw);
    if (!id.value) {
      return res.status(400).json({ error: 'Enter the 11-digit mobile number or the email you sign in with.' });
    }
    const ip = deps.clientIp(req) || '';

    // Limits: one code a minute per account, five an hour, fifteen an hour per device
    const recent = deps.sqlRows(
      await db.execute(sql`SELECT COUNT(*) AS n, MIN(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS since
        FROM password_reset_requests WHERE identifier = ${id.value} AND created_at > NOW() - INTERVAL 1 HOUR`)
    )[0] || {};
    const since = recent.since === null || recent.since === undefined ? null : Number(recent.since);
    if (since !== null && since < RESET_COOLDOWN_SECONDS) {
      const wait = RESET_COOLDOWN_SECONDS - since;
      return res.status(429).json({ error: `Please wait ${wait} seconds before asking for another code.`, retryAfter: wait });
    }
    if (Number(recent.n || 0) >= RESET_MAX_PER_ID_HOUR) {
      return res.status(429).json({ error: 'Too many reset requests for this account. Please try again in an hour.' });
    }
    if (ip) {
      const perIp = deps.sqlRows(
        await db.execute(sql`SELECT COUNT(*) AS n FROM password_reset_requests
          WHERE ip_address = ${ip} AND created_at > NOW() - INTERVAL 1 HOUR`)
      )[0];
      if (Number(perIp?.n || 0) >= RESET_MAX_PER_IP_HOUR) {
        return res.status(429).json({ error: 'Too many reset requests from this device. Please try again later.' });
      }
    }

    const channels = await resetChannels();
    const brand = await deps.emailBrand();
    const found = await findResetAccount(id);
    const account = found && !found.blocked ? found : null;
    const userAgent = String(req.headers['user-agent'] || '');

    // Which way the code travels: the sign-in name itself when possible,
    // otherwise the other contact saved on the account.
    let channel: 'sms' | 'email' | 'none' = 'none';
    let target = '';
    if (id.kind === 'phone') {
      if (channels.smsReady) {
        channel = 'sms';
        target = id.value;
      } else if (channels.emailReady) {
        channel = 'email';
        target = account?.email || '';
      }
    } else if (channels.emailReady) {
      channel = 'email';
      target = id.value;
    } else if (channels.smsReady) {
      channel = 'sms';
      target = account?.phone || '';
    }

    if (channel === 'none') {
      await logResetRequest({ account, identifier: id.value, channel: 'none', status: account ? 'no_channel' : 'no_account', ip, userAgent, minutes: 1 });
      if (account) {
        await deps.notifyAdmin(
          'password_reset',
          'Password reset needs you',
          `${account.name} (${id.value}) asked to reset their password, but SMS and email are not set up. Set a new password for them from Customers, or turn on SMS / email.`,
          account.type === 'customer' ? 'customers' : account.type === 'staff' ? 'staff' : 'cfg-email'
        );
      }
      return res.status(503).json({
        code: 'NO_CHANNEL',
        error: brand.phone
          ? `Password reset by SMS or email is not available right now. Please call ${brand.phone} and we will reset it for you.`
          : 'Password reset by SMS or email is not available right now. Please contact the shop and we will reset it for you.',
        storePhone: brand.phone,
      });
    }

    const minutes = channel === 'sms' ? RESET_SMS_MINUTES : RESET_EMAIL_MINUTES;
    // Same-channel destinations are the sign-in name itself, so showing them
    // masked reveals nothing. A cross-channel destination stays generic.
    const sameChannel = (channel === 'sms' && id.kind === 'phone') || (channel === 'email' && id.kind === 'email');
    const destinationLabel = sameChannel
      ? channel === 'sms'
        ? maskPhone(id.value)
        : maskEmail(id.value)
      : channel === 'sms'
      ? 'the mobile number on your account'
      : 'the email address on your account';
    const answer = {
      success: true,
      step: 'code',
      channel,
      destination: destinationLabel,
      expiresInMinutes: minutes,
      resendIn: RESET_COOLDOWN_SECONDS,
    };

    if (!account || !target) {
      // Nobody to send to — answer exactly as if the code went out
      // A code nobody knows, so "wrong code" answers look the same as for a real account
      await logResetRequest({
        account: found && found.blocked ? found : null,
        identifier: id.value,
        channel,
        codeHash: resetCodeHash(id.value, crypto.randomBytes(16).toString('hex')),
        status: found?.blocked ? 'blocked' : account ? 'no_contact' : 'no_account',
        ip,
        userAgent,
        minutes,
      });
      return res.json(answer);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const token = channel === 'email' ? crypto.randomBytes(32).toString('hex') : '';
    const requestId = await logResetRequest({
      account,
      identifier: id.value,
      channel,
      destination: channel === 'sms' ? maskPhone(target) : maskEmail(target),
      codeHash: resetCodeHash(id.value, code),
      tokenHash: token ? deps.sha256(token) : null,
      status: 'sending',
      ip,
      userAgent,
      minutes,
    });
    if (!requestId) return res.status(500).json({ error: 'Could not start the reset. Please try again.' });

    let delivered: { ok: boolean; error?: string };
    if (channel === 'sms') {
      const template = deps.smsEventConfig(channels.sms, 'password_reset').template;
      const text = deps.fillTemplate(template, { code, minutes, store: brand.store, name: account.name });
      const result = await deps.sendSms(target, text.includes(code) ? text : `${code} - ${text}`, {
        event: 'password_reset',
        logText: text.replace(code, '••••••'),
      });
      delivered = { ok: result.ok, error: result.error };
    } else {
      const origin = deps.publicOrigin(req, channels.sms);
      const link = `${origin}/reset-password?token=${token}`;
      delivered = await deps.sendEmail({
        to: target,
        subject: `${code} is your ${brand.store} password reset code`,
        text: `Hello ${account.name},\n\nYour password reset code is ${code}. It expires in ${minutes} minutes.\n\nOr open this link to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email — your password stays the same.\n\n${brand.store}`,
        html: deps.emailLayout(
          brand,
          origin,
          `<p style="margin:0 0 6px">Hello ${deps.escapeHtml(account.name)},</p>
<p style="margin:0 0 18px">Use this code to reset your password. It expires in ${minutes} minutes.</p>
<div style="font-size:32px;font-weight:700;letter-spacing:10px;padding:14px 18px;background:#f3f4f6;border-radius:10px;text-align:center;margin:0 0 18px">${code}</div>
<p style="margin:0 0 18px;text-align:center"><a href="${deps.escapeHtml(link)}" style="display:inline-block;background:${deps.escapeHtml(brand.color)};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Choose a new password</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">If you did not ask for this, ignore this email. Your password stays the same.</p>`
        ),
      });
    }

    await db.execute(sql`UPDATE password_reset_requests SET status = ${delivered.ok ? 'sent' : 'failed'},
      error = ${delivered.ok ? null : String(delivered.error || '').slice(0, 255)} WHERE id = ${requestId}`);

    if (!delivered.ok) {
      await deps.notifyAdmin(
        'password_reset',
        'Password reset could not be sent',
        `The ${channel === 'sms' ? 'SMS' : 'email'} to ${account.name} failed: ${delivered.error || 'unknown error'}`,
        channel === 'sms' ? 'sms' : 'cfg-email'
      );
      return res.status(502).json({
        error: `We couldn't send the code right now. Please try again in a minute${brand.phone ? `, or call ${brand.phone}` : ''}.`,
      });
    }
    res.json(answer);
  } catch (error: any) {
    console.error('forgot password:', error);
    res.status(500).json({ error: 'Could not complete the request. Please try again.' });
  }
});

/** Code from the SMS/email → a short-lived token that allows one password change */
deps.app.post('/api/auth/verify-reset-code', async (req, res) => {
  try {
    const id = normalizeResetId(req.body?.identifier);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!id.value) return res.status(400).json({ error: 'Start again from "Forgot password".' });
    if (code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit code.' });

    const row = deps.sqlRows(
      await db.execute(sql`SELECT id, code_hash AS codeHash, attempts, status, (expires_at > NOW()) AS live
        FROM password_reset_requests
        WHERE identifier = ${id.value} AND code_hash IS NOT NULL
          AND status IN ('sent', 'locked', 'no_account', 'no_contact', 'blocked')
        ORDER BY id DESC LIMIT 1`)
    )[0];

    if (!row || !Number(row.live)) {
      return res.status(400).json({ error: 'This code has expired. Ask for a new code.', expired: true });
    }
    if (row.status === 'locked' || Number(row.attempts) >= RESET_MAX_ATTEMPTS) {
      return res.status(400).json({ error: 'Too many wrong codes. Ask for a new code.', expired: true });
    }

    if (!deps.safeEqual(resetCodeHash(id.value, code), String(row.codeHash))) {
      const attempts = Number(row.attempts) + 1;
      await db.execute(sql`UPDATE password_reset_requests SET attempts = ${attempts},
        status = CASE WHEN status = 'sent' AND ${attempts} >= ${RESET_MAX_ATTEMPTS} THEN 'locked' ELSE status END
        WHERE id = ${row.id}`);
      const left = RESET_MAX_ATTEMPTS - attempts;
      return res.status(400).json({
        error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new code.',
        expired: left <= 0,
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.execute(sql`UPDATE password_reset_requests SET status = 'verified', token_hash = ${deps.sha256(token)},
      verified_at = NOW(), expires_at = NOW() + INTERVAL ${sql.raw(String(RESET_TOKEN_MINUTES))} MINUTE WHERE id = ${row.id}`);
    res.json({ success: true, resetToken: token, expiresInMinutes: RESET_TOKEN_MINUTES });
  } catch (error: any) {
    console.error('verify reset code:', error);
    res.status(500).json({ error: 'Could not check the code. Please try again.' });
  }
});

/** Is this emailed/texted link still usable? Lets the page say so before typing */
deps.app.get('/api/auth/reset-token', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.json({ valid: false });
  try {
    const row = deps.sqlRows(
      await db.execute(sql`SELECT id FROM password_reset_requests WHERE token_hash = ${deps.sha256(token)}
        AND status IN ('sent', 'verified') AND expires_at > NOW() LIMIT 1`)
    )[0];
    if (row) return res.json({ valid: true });
    const legacy = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, deps.sha256(token))).limit(1);
    const old = legacy[0];
    res.json({ valid: Boolean(old && !old.usedAt && new Date(old.expiresAt).getTime() > Date.now()) });
  } catch {
    res.json({ valid: true }); // let the real submit decide
  }
});

deps.app.post('/api/auth/reset-password', deps.loginThrottle, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) return res.status(400).json({ error: 'Reset token is missing.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });
    const tokenHash = deps.sha256(token);

    const row = deps.sqlRows(
      await db.execute(sql`SELECT id, account_type AS accountType, account_id AS accountId, identifier, channel
        FROM password_reset_requests
        WHERE token_hash = ${tokenHash} AND status IN ('sent', 'verified') AND expires_at > NOW()
          AND account_type IN ('customer', 'staff', 'owner')
        LIMIT 1`)
    )[0];

    if (row) {
      const account = { type: row.accountType as ResetAccountType, id: row.accountId === null ? null : Number(row.accountId) };
      await setAccountPassword(account, password);
      await db.execute(sql`UPDATE password_reset_requests SET status = 'used', used_at = NOW() WHERE id = ${row.id}`);
      // Every other open code or link for this account is now void
      await db.execute(sql`UPDATE password_reset_requests SET status = 'expired'
        WHERE id != ${row.id} AND account_type = ${account.type}
          AND ((${account.id} IS NULL AND account_id IS NULL) OR account_id = ${account.id})
          AND status IN ('sending', 'sent', 'verified', 'locked')`);
      if (account.type === 'customer' && account.id) {
        await db.delete(passwordResets).where(eq(passwordResets.customerId, account.id)).catch(() => undefined);
      }

      // A heads-up by email (free) when the account has one and mail is set up
      void (async () => {
        try {
          const found = await findResetAccount(normalizeResetId(row.identifier));
          const mailCfg = await deps.readEmailConfig();
          if (!found?.email || !deps.emailReady(mailCfg)) return;
          const brand = await deps.emailBrand();
          await deps.sendEmail({
            to: found.email,
            subject: `Your ${brand.store} password was changed`,
            text: `Hello ${found.name},\n\nThe password for your ${brand.store} account was just changed. If this was not you, contact us right away${brand.phone ? ` on ${brand.phone}` : ''}.`,
            html: deps.emailLayout(
              brand,
              deps.publicOrigin(req),
              `<p style="margin:0 0 8px">Hello ${deps.escapeHtml(found.name)},</p><p style="margin:0 0 8px">The password for your ${deps.escapeHtml(brand.store)} account was just changed, and every device that was signed in has been signed out.</p><p style="margin:0;color:#6b7280;font-size:13px">If this was not you, contact us right away${brand.phone ? ` on ${deps.escapeHtml(brand.phone)}` : ''}.</p>`
            ),
          });
        } catch {
          /* a courtesy mail never affects the reset */
        }
      })();

      deps.clearLoginFailures(req);
      return res.json({ success: true, message: 'Password changed. You can now sign in.', identifier: row.identifier });
    }

    // Links issued by earlier versions (customers only) keep working until they expire
    const legacy = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
    const record = legacy[0];
    if (!record || record.usedAt || new Date(record.expiresAt).getTime() < Date.now()) {
      deps.noteLoginFailure(req);
      return res.status(400).json({ error: 'This link has expired or has already been used.' });
    }
    await setAccountPassword({ type: 'customer', id: record.customerId }, password);
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, record.id));
    await db
      .delete(passwordResets)
      .where(and(eq(passwordResets.customerId, record.customerId), sql`${passwordResets.id} != ${record.id}`));
    res.json({ success: true, message: 'Password changed. You can now sign in.' });
  } catch (error: any) {
    console.error('reset password:', error);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

/** Dashboard: the reset log (no codes or tokens, ever) */
deps.app.get('/api/admin/password-resets', async (_req, res) => {
  try {
    const rows = deps.sqlRows(
      await db.execute(sql`SELECT id, account_type AS accountType, account_id AS accountId, account_name AS accountName,
          identifier, channel, destination, status, error, attempts, ip_address AS ipAddress,
          created_at AS createdAt, used_at AS usedAt, (expires_at > NOW()) AS live
        FROM password_reset_requests ORDER BY id DESC LIMIT 200`)
    );
    const channels = await resetChannels();
    deps.privateResponse(res);
    res.json({
      requests: rows.map((row: any) => ({ ...row, live: Boolean(Number(row.live)), createdAt: utcIso(row.createdAt), usedAt: utcIso(row.usedAt) })),
      channels: { sms: channels.smsReady, email: channels.emailReady, smsOn: Boolean(channels.sms.enabled) },
    });
  } catch (error: any) {
    console.error('reset log:', error);
    res.status(500).json({ error: 'Could not load the reset log.' });
  }
});

/**
 * Dashboard → Customers → Reset password.
 *   { action: 'set', password }            set it now (the customer is signed out everywhere)
 *   { action: 'send', channel: 'sms'|'email' } text/email them a one-time reset link
 */
deps.app.post('/api/admin/customers/:id/password', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    const action = String(req.body?.action || '');
    const account: ResetAccount = {
      type: 'customer',
      id: customer.id,
      name: customer.name,
      phone: deps.bdMobile(customer.phone),
      email: customer.email || '',
    };

    if (action === 'set') {
      const password = String(req.body?.password || '');
      if (password.length < 8) return res.status(400).json({ error: 'The password must be at least 8 characters.' });
      await setAccountPassword(account, password);
      await logResetRequest({
        account,
        identifier: account.phone || account.email || String(customer.id),
        channel: 'admin',
        status: 'admin_set',
        ip: deps.clientIp(req) || '',
        userAgent: String(req.headers['user-agent'] || ''),
        minutes: 1,
      });
      return res.json({ success: true, message: `New password saved for ${customer.name}.` });
    }

    if (action === 'send') {
      const channel = req.body?.channel === 'email' ? 'email' : 'sms';
      const channels = await resetChannels();
      const brand = await deps.emailBrand();
      if (channel === 'sms' && (!deps.smsGatewayReady(channels.sms) || !account.phone)) {
        return res.status(400).json({ error: account.phone ? 'Turn on SMS first (Marketing & Tools → SMS).' : 'This customer has no valid mobile number.' });
      }
      if (channel === 'email' && (!deps.emailReady(channels.email) || !account.email)) {
        return res.status(400).json({ error: account.email ? 'Set up email first (System Configuration → Email & Password).' : 'This customer has no email address.' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const origin = deps.publicOrigin(req, channels.sms);
      const link = `${origin}/reset-password?token=${token}`;
      const requestId = await logResetRequest({
        account,
        identifier: channel === 'sms' ? account.phone : account.email.toLowerCase(),
        channel,
        destination: channel === 'sms' ? maskPhone(account.phone) : maskEmail(account.email),
        tokenHash: deps.sha256(token),
        status: 'sending',
        ip: deps.clientIp(req) || '',
        userAgent: 'dashboard',
        minutes: RESET_LINK_MINUTES,
      });
      let result: { ok: boolean; error?: string };
      if (channel === 'sms') {
        const text = `Reset your ${brand.store} password: ${link} (valid ${RESET_LINK_MINUTES} min)`;
        const sent = await deps.sendSms(account.phone, text, { event: 'password_reset', force: true, logText: text.replace(token, '••••') });
        result = { ok: sent.ok, error: sent.error };
      } else {
        result = await deps.sendEmail({
          to: account.email,
          subject: `Reset your ${brand.store} password`,
          text: `Hello ${account.name},\n\nOpen this link to choose a new password (valid ${RESET_LINK_MINUTES} minutes):\n${link}\n\n${brand.store}`,
          html: deps.emailLayout(
            brand,
            origin,
            `<p style="margin:0 0 8px">Hello ${deps.escapeHtml(account.name)},</p><p style="margin:0 0 18px">We have sent you this link so you can choose a new password. It works once and expires in ${RESET_LINK_MINUTES} minutes.</p><p style="margin:0;text-align:center"><a href="${deps.escapeHtml(link)}" style="display:inline-block;background:${deps.escapeHtml(brand.color)};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Choose a new password</a></p>`
          ),
        });
      }
      if (requestId) {
        await db.execute(sql`UPDATE password_reset_requests SET status = ${result.ok ? 'sent' : 'failed'},
          error = ${result.ok ? null : String(result.error || '').slice(0, 255)} WHERE id = ${requestId}`);
      }
      if (!result.ok) return res.status(400).json({ error: result.error || 'Could not send the link.' });
      return res.json({
        success: true,
        message: channel === 'sms' ? `Reset link sent by SMS to ${maskPhone(account.phone)}.` : `Reset link emailed to ${maskEmail(account.email)}.`,
      });
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (error: any) {
    console.error('admin customer password:', error);
    res.status(500).json({ error: 'Could not update the password.' });
  }
});

  return {  };
}
