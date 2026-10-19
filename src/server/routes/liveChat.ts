/**
 * v3.14 — Live chat: the chat box on the website ↔ Dashboard → Live Chat.
 *
 * Visitors start a chat with their name (and phone, if the shop asks for it)
 * and keep a secret token in their browser; both sides poll for new messages
 * every few seconds. Polling works on every host (shared Node hosting
 * included) without WebSockets, and each poll is one small indexed query.
 *
 * Public (website)
 *   POST /api/live-chat/start      name, phone, first message → token
 *   GET  /api/live-chat/poll       new messages since an id, agent online / typing
 *   POST /api/live-chat/send       one more message
 *   POST /api/live-chat/end        the visitor ends the chat
 * Dashboard (customers or orders permission)
 *   GET    /api/admin/live-chat/summary            unread count for the sidebar badge
 *   GET    /api/admin/live-chat/conversations      the inbox
 *   GET    /api/admin/live-chat/conversations/:id  one chat (marks it read)
 *   POST   /api/admin/live-chat/conversations/:id/reply
 *   POST   /api/admin/live-chat/conversations/:id/status   open / closed
 *   DELETE /api/admin/live-chat/conversations/:id
 */
import crypto from 'crypto';
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import { eq, sql } from 'drizzle-orm';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';

export interface RegisterLiveChatRoutesDeps {
  app: typeof Server.app;
  clientIp: typeof Server.clientIp;
  ensureTable: typeof Server.ensureTable;
  notifyAdmin: typeof Server.notifyAdmin;
  privateResponse: typeof Server.privateResponse;
  peekSession: typeof Server.peekSession;
}

/** Live chat settings (Dashboard → Marketing & Tools → Chat Widget → Live chat) */
export interface LiveChatSettings {
  enabled: boolean;
  askPhone: boolean;
  agentName: string;
  welcome: string;
  offlineReply: string;
}

const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : result?.rows || []);

const isMissingTable = (error: any) =>
  [error?.code, error?.cause?.code].includes('ER_NO_SUCH_TABLE') || /doesn't exist|no such table/i.test(String(error?.cause?.message || error?.message || ''));

/** Text a person typed: no control characters, trimmed, limited */
const cleanText = (value: unknown, max: number) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);

const preview = (text: string) => text.replace(/\s+/g, ' ').slice(0, 250);

export function registerLiveChatRoutes(deps: RegisterLiveChatRoutesDeps) {
  /* ----------------------------------------------------------- settings */
  let settingsCache: { at: number; value: LiveChatSettings } | null = null;
  async function readSettings(): Promise<LiveChatSettings> {
    if (settingsCache && Date.now() - settingsCache.at < 15_000) return settingsCache.value;
    let raw: any = {};
    try {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'chat_config')).limit(1);
      raw = rows.length ? JSON.parse(rows[0].value || '{}')?.liveChat || {} : {};
    } catch {
      raw = {};
    }
    const value: LiveChatSettings = {
      enabled: raw.enabled === true,
      askPhone: raw.askPhone !== false,
      agentName: cleanText(raw.agentName, 60),
      welcome: cleanText(raw.welcome, 500),
      offlineReply: cleanText(raw.offlineReply, 500),
    };
    settingsCache = { at: Date.now(), value };
    return value;
  }

  /* ------------------------------------------------------------ helpers */
  /** Runs a query; a database that missed the upgrade gets the two tables, then one retry */
  async function run(query: any): Promise<any[]> {
    try {
      return rowsOf(await db.execute(query));
    } catch (error: any) {
      if (!isMissingTable(error)) throw error;
      const ok = (await deps.ensureTable('live_chat_conversations')) && (await deps.ensureTable('live_chat_messages'));
      if (!ok) throw error;
      return rowsOf(await db.execute(query));
    }
  }
  const insertId = (rows: any): number => Number((rows as any)?.insertId ?? (rows as any)?.[0]?.insertId ?? 0);
  async function insert(query: any): Promise<number> {
    try {
      const result: any = await db.execute(query);
      return insertId(Array.isArray(result) ? result[0] : result);
    } catch (error: any) {
      if (!isMissingTable(error)) throw error;
      const ok = (await deps.ensureTable('live_chat_conversations')) && (await deps.ensureTable('live_chat_messages'));
      if (!ok) throw error;
      const result: any = await db.execute(query);
      return insertId(Array.isArray(result) ? result[0] : result);
    }
  }

  /** Someone has the dashboard open (it polls the summary): the website shows "online" */
  let agentSeenAt = 0;
  const agentOnline = () => Date.now() - agentSeenAt < 3 * 60_000;
  /** "typing…" on either side, kept for a few seconds (memory only) */
  const typing = new Map<string, number>();
  const setTyping = (key: string, on: boolean) => {
    if (on) typing.set(key, Date.now());
    else typing.delete(key);
    if (typing.size > 2000) typing.clear();
  };
  const isTyping = (key: string) => Date.now() - (typing.get(key) || 0) < 6000;

  /** Message flood guard: at most 20 messages a minute per chat */
  const sendLog = new Map<number, number[]>();
  const tooFast = (conversationId: number) => {
    const now = Date.now();
    const recent = (sendLog.get(conversationId) || []).filter((at) => now - at < 60_000);
    recent.push(now);
    sendLog.set(conversationId, recent);
    if (sendLog.size > 5000) sendLog.clear();
    return recent.length > 20;
  };

  const messageRow = (row: any) => ({
    id: Number(row.id),
    sender: String(row.sender),
    author: row.author || '',
    body: String(row.body || ''),
    createdAt: utcIso(row.created_at || row.createdAt),
  });

  async function conversationByToken(token: unknown) {
    const clean = String(token || '').trim();
    if (!/^[a-f0-9]{32,64}$/.test(clean)) return null;
    const rows = await run(sql`SELECT * FROM live_chat_conversations WHERE token = ${clean} LIMIT 1`);
    return rows[0] || null;
  }

  async function messagesAfter(conversationId: number, after: number, limit = 200) {
    const rows = await run(
      sql`SELECT id, sender, author, body, created_at FROM live_chat_messages
          WHERE conversation_id = ${conversationId} AND id > ${after} ORDER BY id ASC LIMIT ${limit}`
    );
    return rows.map(messageRow);
  }

  /** `automatic` = the welcome / away answer: shown in the chat, but it does not count as unread or as the last message */
  async function addMessage(conversationId: number, sender: 'customer' | 'agent' | 'system', author: string, body: string, automatic = false) {
    const id = await insert(
      sql`INSERT INTO live_chat_messages (conversation_id, sender, author, body) VALUES (${conversationId}, ${sender}, ${author.slice(0, 100) || null}, ${body})`
    );
    if (automatic) return id;
    if (sender === 'customer') {
      await run(sql`UPDATE live_chat_conversations SET unread_admin = unread_admin + 1, last_message = ${preview(body)}, last_sender = 'customer',
                    last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`);
    } else if (sender === 'agent') {
      await run(sql`UPDATE live_chat_conversations SET unread_customer = unread_customer + 1, last_message = ${preview(body)}, last_sender = 'agent',
                    last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`);
    }
    return id;
  }

  const conversationOut = (row: any) => ({
    id: Number(row.id),
    name: row.customer_name,
    phone: row.customer_phone || '',
    customerId: row.customer_id ? Number(row.customer_id) : null,
    status: row.status,
    pageUrl: row.page_url || '',
    pageTitle: row.page_title || '',
    unread: Number(row.unread_admin) || 0,
    lastMessage: row.last_message || '',
    lastSender: row.last_sender || '',
    lastMessageAt: utcIso(row.last_message_at),
    createdAt: utcIso(row.created_at),
    ip: row.ip_address || '',
    userAgent: row.user_agent || '',
  });

  /* =================================================== website (public) */

  deps.app.post('/api/live-chat/start', async (req: any, res) => {
    deps.privateResponse(res);
    try {
      const cfg = await readSettings();
      if (!cfg.enabled) return res.status(403).json({ error: 'Live chat is not available right now.' });
      const body = req.body || {};
      if (String(body.company || '').trim()) return res.status(400).json({ error: 'Could not start the chat.' }); // bots
      const name = cleanText(body.name, 80);
      const phone = String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
      const message = cleanText(body.message, 2000);
      const errors: Record<string, string> = {};
      if (name.length < 2) errors.name = 'Please enter your name.';
      if (cfg.askPhone || phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a valid phone number.';
      }
      if (!message) errors.message = 'Please write your message.';
      if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', errors });

      // At most 5 new chats an hour from one device
      const ip = deps.clientIp(req);
      if (ip) {
        const recent = await run(sql`SELECT COUNT(*) AS n FROM live_chat_conversations WHERE ip_address = ${ip} AND created_at > (NOW() - INTERVAL 1 HOUR)`);
        if (Number(recent?.[0]?.n || 0) >= 5) return res.status(429).json({ error: 'You have started several chats already. Please continue in your open chat.' });
      }

      const session = deps.peekSession(req);
      const customerId = session?.role === 'customer' ? Number(String(session.sub || '').replace('customer_', '')) || null : null;
      const token = crypto.randomBytes(24).toString('hex');
      const pageUrl = cleanText(body.pageUrl, 500);
      const pageTitle = cleanText(body.pageTitle, 255);
      const id = await insert(
        sql`INSERT INTO live_chat_conversations (token, customer_name, customer_phone, customer_id, status, page_url, page_title, ip_address, user_agent)
            VALUES (${token}, ${name}, ${phone || null}, ${customerId}, 'open', ${pageUrl || null}, ${pageTitle || null}, ${ip || null},
                    ${String(req.headers['user-agent'] || '').slice(0, 500)})`
      );
      if (!id) throw new Error('no conversation id');
      if (cfg.welcome) await addMessage(id, 'agent', cfg.agentName || 'Support', cfg.welcome, true);
      await addMessage(id, 'customer', name, message);
      // Shop closed (nobody has the dashboard open): an automatic answer, if set
      if (!agentOnline() && cfg.offlineReply) await addMessage(id, 'agent', cfg.agentName || 'Support', cfg.offlineReply, true);
      void deps.notifyAdmin('live_chat', `Live chat: ${name}`, `${phone ? `${phone} — ` : ''}${preview(message).slice(0, 100)}`, 'live-chat');
      res.json({ success: true, token, conversation: { id, status: 'open', name }, messages: await messagesAfter(id, 0) });
    } catch (error: any) {
      console.error('live chat start:', error?.message || error);
      res.status(500).json({ error: 'Could not start the chat. Please try again.' });
    }
  });

  deps.app.get('/api/live-chat/poll', async (req: any, res) => {
    deps.privateResponse(res);
    try {
      const conversation = await conversationByToken(req.query.token);
      if (!conversation) return res.status(404).json({ error: 'Chat not found.', code: 'NO_CHAT' });
      const id = Number(conversation.id);
      setTyping(`c:${id}`, req.query.typing === '1');
      const after = Math.max(0, Math.floor(Number(req.query.after) || 0));
      const messages = await messagesAfter(id, after);
      let unread = Number(conversation.unread_customer) || 0;
      if (req.query.open === '1' && unread > 0) {
        await run(sql`UPDATE live_chat_conversations SET unread_customer = 0 WHERE id = ${id}`);
        unread = 0;
      }
      res.json({
        conversation: { id, status: conversation.status, name: conversation.customer_name },
        messages,
        unread,
        agentOnline: agentOnline(),
        agentTyping: isTyping(`a:${id}`),
      });
    } catch (error: any) {
      console.error('live chat poll:', error?.message || error);
      res.status(500).json({ error: 'Could not load the chat.' });
    }
  });

  deps.app.post('/api/live-chat/send', async (req: any, res) => {
    deps.privateResponse(res);
    try {
      const cfg = await readSettings();
      const conversation = await conversationByToken(req.body?.token);
      if (!conversation) return res.status(404).json({ error: 'Chat not found.', code: 'NO_CHAT' });
      if (!cfg.enabled) return res.status(403).json({ error: 'Live chat is not available right now.' });
      const id = Number(conversation.id);
      const body = cleanText(req.body?.body, 2000);
      if (!body) return res.status(400).json({ error: 'Please write your message.' });
      if (tooFast(id)) return res.status(429).json({ error: 'You are sending messages very fast. Please wait a moment.' });

      const wasClosed = conversation.status !== 'open';
      const idleMinutes = (Date.now() - new Date(utcIso(conversation.last_message_at || conversation.created_at) || Date.now()).getTime()) / 60_000;
      if (wasClosed) await run(sql`UPDATE live_chat_conversations SET status = 'open' WHERE id = ${id}`);
      const pageUrl = cleanText(req.body?.pageUrl, 500);
      const pageTitle = cleanText(req.body?.pageTitle, 255);
      if (pageUrl) await run(sql`UPDATE live_chat_conversations SET page_url = ${pageUrl}, page_title = ${pageTitle || null} WHERE id = ${id}`);
      const messageId = await addMessage(id, 'customer', conversation.customer_name, body);
      setTyping(`c:${id}`, false);
      // A note in the dashboard bell only when the chat wakes up, not for every line
      if (wasClosed || idleMinutes > 30) {
        void deps.notifyAdmin('live_chat', `Live chat: ${conversation.customer_name}`, preview(body).slice(0, 100), 'live-chat');
      }
      const after = Math.max(0, Math.floor(Number(req.body?.after) || 0));
      res.json({ success: true, id: messageId, messages: await messagesAfter(id, after), status: 'open' });
    } catch (error: any) {
      console.error('live chat send:', error?.message || error);
      res.status(500).json({ error: 'Could not send your message. Please try again.' });
    }
  });

  deps.app.post('/api/live-chat/end', async (req: any, res) => {
    deps.privateResponse(res);
    try {
      const conversation = await conversationByToken(req.body?.token);
      if (!conversation) return res.json({ success: true });
      if (conversation.status === 'open') {
        await addMessage(Number(conversation.id), 'system', '', 'The customer ended the chat.');
        await run(sql`UPDATE live_chat_conversations SET status = 'closed', updated_at = NOW() WHERE id = ${Number(conversation.id)}`);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('live chat end:', error?.message || error);
      res.status(500).json({ error: 'Could not end the chat.' });
    }
  });

  /* ====================================================== dashboard */

  deps.app.get('/api/admin/live-chat/summary', async (_req: any, res) => {
    deps.privateResponse(res);
    agentSeenAt = Date.now();
    try {
      const rows = await run(
        sql`SELECT COUNT(*) AS conversations, COALESCE(SUM(unread_admin), 0) AS messages, COALESCE(MAX(id), 0) AS latest
            FROM live_chat_conversations WHERE unread_admin > 0`
      );
      const open = await run(sql`SELECT COUNT(*) AS n FROM live_chat_conversations WHERE status = 'open'`);
      const latestMessage = await run(sql`SELECT COALESCE(MAX(id), 0) AS id FROM live_chat_messages WHERE sender = 'customer'`);
      const cfg = await readSettings();
      res.json({
        enabled: cfg.enabled,
        unreadConversations: Number(rows?.[0]?.conversations || 0),
        unreadMessages: Number(rows?.[0]?.messages || 0),
        open: Number(open?.[0]?.n || 0),
        latestCustomerMessageId: Number(latestMessage?.[0]?.id || 0),
      });
    } catch (error: any) {
      console.error('live chat summary:', error?.message || error);
      res.json({ enabled: false, unreadConversations: 0, unreadMessages: 0, open: 0, latestCustomerMessageId: 0 });
    }
  });

  deps.app.get('/api/admin/live-chat/conversations', async (req: any, res) => {
    deps.privateResponse(res);
    agentSeenAt = Date.now();
    try {
      const status = String(req.query.status || 'open');
      const search = cleanText(req.query.search, 100);
      const where: any[] = [sql`1 = 1`];
      if (status === 'open' || status === 'closed') where.push(sql`status = ${status}`);
      if (status === 'unread') where.push(sql`unread_admin > 0`);
      if (search) {
        const term = `%${search}%`;
        where.push(sql`(customer_name LIKE ${term} OR customer_phone LIKE ${term} OR last_message LIKE ${term}
                        OR id IN (SELECT conversation_id FROM live_chat_messages WHERE body LIKE ${term}))`);
      }
      const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 100));
      const rows = await run(
        sql`SELECT * FROM live_chat_conversations WHERE ${sql.join(where, sql` AND `)}
            ORDER BY (unread_admin > 0) DESC, last_message_at DESC, id DESC LIMIT ${limit}`
      );
      const counts = await run(
        sql`SELECT SUM(status = 'open') AS open, SUM(status = 'closed') AS closed, SUM(unread_admin > 0) AS unread, COUNT(*) AS total FROM live_chat_conversations`
      );
      res.json({
        conversations: rows.map(conversationOut),
        counts: {
          open: Number(counts?.[0]?.open || 0),
          closed: Number(counts?.[0]?.closed || 0),
          unread: Number(counts?.[0]?.unread || 0),
          all: Number(counts?.[0]?.total || 0),
        },
        typing: rows.filter((row) => isTyping(`c:${row.id}`)).map((row) => Number(row.id)),
      });
    } catch (error: any) {
      console.error('live chat list:', error?.message || error);
      res.status(500).json({ error: 'Could not load the chats.' });
    }
  });

  const conversationById = async (raw: unknown) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return null;
    const rows = await run(sql`SELECT * FROM live_chat_conversations WHERE id = ${id} LIMIT 1`);
    return rows[0] || null;
  };

  deps.app.get('/api/admin/live-chat/conversations/:id', async (req: any, res) => {
    deps.privateResponse(res);
    agentSeenAt = Date.now();
    try {
      const conversation = await conversationById(req.params.id);
      if (!conversation) return res.status(404).json({ error: 'Chat not found.' });
      const id = Number(conversation.id);
      setTyping(`a:${id}`, req.query.typing === '1');
      const after = Math.max(0, Math.floor(Number(req.query.after) || 0));
      const messages = await messagesAfter(id, after, after ? 200 : 500);
      if (Number(conversation.unread_admin) > 0) {
        await run(sql`UPDATE live_chat_conversations SET unread_admin = 0 WHERE id = ${id}`);
        conversation.unread_admin = 0;
      }
      // Earlier chats from the same phone number (returning customers)
      let previousChats = 0;
      if (conversation.customer_phone) {
        const rows = await run(sql`SELECT COUNT(*) AS n FROM live_chat_conversations WHERE customer_phone = ${conversation.customer_phone} AND id <> ${id}`);
        previousChats = Number(rows?.[0]?.n || 0);
      }
      res.json({
        conversation: { ...conversationOut(conversation), previousChats, seenByCustomer: Number(conversation.unread_customer) === 0 },
        messages,
        customerTyping: isTyping(`c:${id}`),
      });
    } catch (error: any) {
      console.error('live chat thread:', error?.message || error);
      res.status(500).json({ error: 'Could not load the chat.' });
    }
  });

  deps.app.post('/api/admin/live-chat/conversations/:id/reply', async (req: any, res) => {
    deps.privateResponse(res);
    agentSeenAt = Date.now();
    try {
      const conversation = await conversationById(req.params.id);
      if (!conversation) return res.status(404).json({ error: 'Chat not found.' });
      const id = Number(conversation.id);
      const body = cleanText(req.body?.body, 2000);
      if (!body) return res.status(400).json({ error: 'Write a reply first.' });
      const cfg = await readSettings();
      const author = cfg.agentName || cleanText(req.session?.name, 60) || 'Support';
      if (conversation.status !== 'open') await run(sql`UPDATE live_chat_conversations SET status = 'open' WHERE id = ${id}`);
      const messageId = await addMessage(id, 'agent', author, body);
      setTyping(`a:${id}`, false);
      const after = Math.max(0, Math.floor(Number(req.body?.after) || 0));
      res.json({ success: true, id: messageId, messages: await messagesAfter(id, after) });
    } catch (error: any) {
      console.error('live chat reply:', error?.message || error);
      res.status(500).json({ error: 'Could not send the reply.' });
    }
  });

  deps.app.post('/api/admin/live-chat/conversations/:id/status', async (req: any, res) => {
    deps.privateResponse(res);
    try {
      const conversation = await conversationById(req.params.id);
      if (!conversation) return res.status(404).json({ error: 'Chat not found.' });
      const status = req.body?.status === 'closed' ? 'closed' : 'open';
      const id = Number(conversation.id);
      if (status !== conversation.status) {
        await run(sql`UPDATE live_chat_conversations SET status = ${status}, updated_at = NOW() WHERE id = ${id}`);
        if (status === 'closed') await addMessage(id, 'system', '', 'This chat was closed. Write again any time.');
      }
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('live chat status:', error?.message || error);
      res.status(500).json({ error: 'Could not change the chat.' });
    }
  });

  deps.app.delete('/api/admin/live-chat/conversations/:id', async (req: any, res) => {
    try {
      const conversation = await conversationById(req.params.id);
      if (!conversation) return res.json({ success: true });
      const id = Number(conversation.id);
      await run(sql`DELETE FROM live_chat_messages WHERE conversation_id = ${id}`);
      await run(sql`DELETE FROM live_chat_conversations WHERE id = ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('live chat delete:', error?.message || error);
      res.status(500).json({ error: 'Could not delete the chat.' });
    }
  });

  /** Settings were saved: read them again on the next request */
  return { forgetLiveChatSettings: () => (settingsCache = null) };
}
