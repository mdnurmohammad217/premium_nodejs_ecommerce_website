/**
 * Contact form → Dashboard → Messages
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerContactRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import { eq, sql, inArray } from 'drizzle-orm';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';


export interface RegisterContactRoutesDeps {
  app: typeof Server.app;
  clientIp: typeof Server.clientIp;
  emailBrand: typeof Server.emailBrand;
  emailLayout: typeof Server.emailLayout;
  emailReady: typeof Server.emailReady;
  ensureTable: typeof Server.ensureTable;
  escapeHtml: typeof Server.escapeHtml;
  notifyAdmin: typeof Server.notifyAdmin;
  notifySmsEvent: typeof Server.notifySmsEvent;
  privateResponse: typeof Server.privateResponse;
  readEmailConfig: typeof Server.readEmailConfig;
  sendEmail: typeof Server.sendEmail;
}

export function registerContactRoutes(deps: RegisterContactRoutesDeps) {
// ==========================================
// CONTACT FORM → Dashboard → Messages
// ==========================================
/** Raw SQL result rows for mysql2 (drizzle returns [rows, fields]) */
const sqlRows = (result: any): any[] =>
  Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : result?.rows || [];

/** Dashboard → Messages → Contact page. Blank fields fall back to Website settings. */
const CONTACT_PAGE_DEFAULTS = {
  heading: 'We are here to help',
  intro: 'Ask about any medicine, an order or a delivery. Send us a message and we will call you back.',
  formEnabled: true,
  formTitle: 'Send us a message',
  emailRequired: true,
  addressRequired: true,
  messagePlaceholder: 'Which medicine do you need, or how can we help?',
  successMessage: 'We received your message.',
  hotline: '',
  whatsapp: '',
  email: '',
  address: '',
  hours: '',
  mapUrl: '',
  showMap: true,
};

async function readContactPage(): Promise<typeof CONTACT_PAGE_DEFAULTS> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'contact_page')).limit(1);
    return { ...CONTACT_PAGE_DEFAULTS, ...(rows.length > 0 ? JSON.parse(rows[0].value) || {} : {}) };
  } catch {
    return { ...CONTACT_PAGE_DEFAULTS };
  }
}

const isMissingTable = (error: any) =>
  [error?.code, error?.cause?.code].includes('ER_NO_SUCH_TABLE') || /doesn't exist|no such table/i.test(String(error?.cause?.message || error?.message || ''));

deps.app.post('/api/contact', async (req, res) => {
  try {
    const body = req.body || {};
    // Bots fill every field, including this one people never see
    if (String(body.company || '').trim()) return res.json({ success: true });
    const page = await readContactPage();
    if (page.formEnabled === false) return res.status(403).json({ error: 'The contact form is closed. Please call us instead.' });

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').replace(/[\s-]+/g, '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const address = String(body.address || '').trim();
    const message = String(body.message || '').trim();
    const errors: Record<string, string> = {};
    if (name.length < 2) errors.name = 'Please enter your full name.';
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(phone)) errors.phone = 'Enter a valid 11-digit mobile number.';
    // v3.12 — the short form on the home page asks only name, phone and message
    const quick = body.quick === true;
    if (((page.emailRequired !== false && !quick) || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (page.addressRequired !== false && !quick && address.length < 3) errors.address = 'Please enter your address.';
    if (quick && message.length < 2) errors.message = 'Please write your message.';
    if (message.length > 3000) errors.message = 'Please keep the message under 3000 characters.';
    if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Please check the highlighted fields.', errors });

    // At most 5 messages an hour from one device
    const ip = deps.clientIp(req);
    if (ip) {
      const recent = sqlRows(
        await db
          .execute(
            sql`SELECT COUNT(*) AS n FROM contact_messages WHERE ip_address = ${ip} AND created_at > (NOW() - INTERVAL 1 HOUR)`
          )
          .catch((error: any) => {
            if (isMissingTable(error)) return [[{ n: 0 }]];
            throw error;
          })
      );
      if (Number(recent?.[0]?.n || 0) >= 5) {
        return res.status(429).json({ error: 'You have sent several messages already. We will get back to you soon.' });
      }
    }

    const insert = () =>
      db.execute(sql`INSERT INTO contact_messages (name, phone, email, address, message, ip_address, user_agent, page_url)
        VALUES (${name.slice(0, 191)}, ${phone.slice(0, 32)}, ${email.slice(0, 191) || null}, ${address.slice(0, 2000) || null},
                ${message || null}, ${ip || null}, ${String(req.headers['user-agent'] || '').slice(0, 500)},
                ${String(req.headers.referer || '').slice(0, 500)})`);
    try {
      await insert();
    } catch (error: any) {
      // A database that missed the automatic upgrade: create the inbox and retry once
      if (!isMissingTable(error) || !(await deps.ensureTable('contact_messages'))) throw error;
      await insert();
    }
    await deps.notifyAdmin('contact_message', `New message from ${name}`, `${phone}${message ? ` — ${message.slice(0, 80)}` : ''}`, 'messages');
    void deps.notifySmsEvent('contact_admin', { name, phone, message });
    void notifyContactByEmail({ name, phone, email, address, message });
    res.json({ success: true });
  } catch (error: any) {
    console.error('contact form:', error);
    res.status(500).json({ error: 'Could not send your message. Please call us instead.' });
  }
});

deps.app.get('/api/admin/contact-messages', async (req, res) => {
  try {
    const status = String(req.query.status || 'all');
    const search = String(req.query.search || '').trim();
    const where: any[] = [sql`1 = 1`];
    if (['new', 'read', 'replied', 'archived'].includes(status)) where.push(sql`status = ${status}`);
    if (search) {
      const term = `%${search}%`;
      where.push(sql`(name LIKE ${term} OR phone LIKE ${term} OR email LIKE ${term} OR message LIKE ${term})`);
    }
    const rows = sqlRows(
      await db.execute(
        sql`SELECT id, name, phone, email, address, message, status, admin_note AS adminNote, ip_address AS ipAddress,
                   page_url AS pageUrl, created_at AS createdAt, updated_at AS updatedAt
            FROM contact_messages WHERE ${sql.join(where, sql` AND `)} ORDER BY id DESC LIMIT 500`
      )
    );
    const counts = sqlRows(await db.execute(sql`SELECT status, COUNT(*) AS n FROM contact_messages GROUP BY status`));
    const summary: Record<string, number> = { all: 0, new: 0, read: 0, replied: 0, archived: 0 };
    counts.forEach((row: any) => {
      summary[row.status] = Number(row.n);
      summary.all += Number(row.n);
    });
    deps.privateResponse(res);
    res.json({ messages: rows.map((row: any) => ({ ...row, createdAt: utcIso(row.createdAt), updatedAt: utcIso(row.updatedAt) })), counts: summary });
  } catch (error: any) {
    // The inbox table is missing (the database skipped an upgrade): create it
    if (isMissingTable(error) && (await deps.ensureTable('contact_messages'))) {
      return res.json({ messages: [], counts: { all: 0, new: 0, read: 0, replied: 0, archived: 0 } });
    }
    console.error('contact list:', error);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

deps.app.patch('/api/admin/contact-messages/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const note = req.body?.adminNote;
    if (status && !['new', 'read', 'replied', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Unknown status.' });
    }
    if (status) await db.execute(sql`UPDATE contact_messages SET status = ${status}, updated_at = NOW() WHERE id = ${id}`);
    if (note !== undefined) {
      await db.execute(sql`UPDATE contact_messages SET admin_note = ${String(note).slice(0, 2000) || null}, updated_at = NOW() WHERE id = ${id}`);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not update the message.' });
  }
});

deps.app.delete('/api/admin/contact-messages/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM contact_messages WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete the message.' });
  }
});

/** Emails the shop a copy of each contact message (Email settings → "Email me new messages") */
async function notifyContactByEmail(data: { name: string; phone: string; email: string; address: string; message: string }) {
  try {
    const cfg = await deps.readEmailConfig();
    if (!deps.emailReady(cfg) || !cfg.notifyContact) return;
    const brand = await deps.emailBrand();
    let recipients = String(cfg.notifyTo || '').split(/[\s,;]+/).filter((item) => /@/.test(item));
    if (recipients.length === 0) {
      const general = (await db.select().from(siteSettings).where(eq(siteSettings.key, 'general')).limit(1))[0];
      const shopEmail = general ? JSON.parse(general.value)?.email : '';
      if (shopEmail) recipients = [shopEmail];
    }
    if (recipients.length === 0) return;
    const rows = [
      ['Name', data.name],
      ['Mobile', data.phone],
      ['Email', data.email],
      ['Address', data.address],
    ]
      .filter(([, value]) => value)
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${label}</td><td style="padding:6px 0;font-weight:600">${deps.escapeHtml(value)}</td></tr>`
      )
      .join('');
    await deps.sendEmail({
      to: recipients.join(', '),
      subject: `New website message from ${data.name}`,
      replyTo: data.email || undefined,
      text: `New message from ${data.name} (${data.phone})\n${data.email ? `Email: ${data.email}\n` : ''}${data.address ? `Address: ${data.address}\n` : ''}\n${data.message || '(No message — they asked for a call back.)'}`,
      html: deps.emailLayout(
        brand,
        '',
        `<h2 style="margin:0 0 12px;font-size:18px">New message from the Contact page</h2><table role="presentation" style="font-size:14px;margin:0 0 14px">${rows}</table><div style="padding:12px 14px;background:#f3f4f6;border-radius:10px;white-space:pre-line">${deps.escapeHtml(data.message || 'No message — they asked for a call back.')}</div><p style="margin:14px 0 0;font-size:13px;color:#6b7280">Open Dashboard → Customers → Messages to reply and keep notes.</p>`
      ),
    });
  } catch (error: any) {
    console.error('[email] contact copy failed:', error?.message || error);
  }
}

deps.app.get('/api/admin/contact-page', async (_req, res) => {
  try {
    const page = await readContactPage();
    const rows = await db.select().from(siteSettings).where(inArray(siteSettings.key, ['general', 'chat_config']));
    const map: Record<string, any> = {};
    rows.forEach((row) => {
      try {
        map[row.key] = JSON.parse(row.value);
      } catch {
        /* ignore */
      }
    });
    const general = map.general || {};
    const chat = map.chat_config || {};
    const whatsapp =
      (Array.isArray(chat.channels) ? chat.channels.find((c: any) => c?.type === 'whatsapp' && c.value)?.value : '') ||
      chat.whatsappNumber ||
      general.whatsapp ||
      '';
    deps.privateResponse(res);
    res.json({
      page,
      fallback: {
        hotline: general.phone || '',
        whatsapp,
        email: general.email || '',
        address: general.address || '',
        hours: chat.businessHours?.enabled ? `${chat.businessHours.open} – ${chat.businessHours.close}` : '',
      },
    });
  } catch (error: any) {
    console.error('contact page read:', error);
    res.status(500).json({ error: 'Could not load the contact page settings.' });
  }
});

deps.app.put('/api/admin/contact-page', async (req, res) => {
  try {
    const body = req.body || {};
    const text = (value: any, max = 500) => String(value ?? '').trim().slice(0, max);
    let mapUrl = text(body.mapUrl, 2000);
    // Accept a whole <iframe …> pasted from Google Maps and keep just its address
    const src = mapUrl.match(/src=["']([^"']+)["']/i);
    if (src) mapUrl = src[1];
    if (mapUrl && !/^https:\/\//i.test(mapUrl)) {
      return res.status(400).json({ error: 'The map link must start with https://' });
    }
    const value = JSON.stringify({
      heading: text(body.heading, 160),
      intro: text(body.intro, 600),
      formEnabled: body.formEnabled !== false,
      formTitle: text(body.formTitle, 120),
      emailRequired: body.emailRequired !== false,
      addressRequired: body.addressRequired !== false,
      messagePlaceholder: text(body.messagePlaceholder, 200),
      successMessage: text(body.successMessage, 400),
      hotline: text(body.hotline, 64),
      whatsapp: text(body.whatsapp, 64),
      email: text(body.email, 191),
      address: text(body.address, 400),
      hours: text(body.hours, 160),
      mapUrl,
      showMap: body.showMap !== false,
    });
    await db.insert(siteSettings).values({ key: 'contact_page', value }).onDuplicateKeyUpdate({ set: { value } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('contact page save:', error);
    res.status(500).json({ error: 'Could not save the contact page.' });
  }
});

  return { sqlRows };
}
