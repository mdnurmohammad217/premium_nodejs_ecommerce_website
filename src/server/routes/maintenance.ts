/**
 * Maintenance mode
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerMaintenanceRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import crypto from 'crypto';
import express from 'express';
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import { inArray } from 'drizzle-orm';
import type * as Server from '../../../server.ts';


export interface RegisterMaintenanceRoutesDeps {
  app: typeof Server.app;
  readCookie: typeof Server.readCookie;
  safeEqual: typeof Server.safeEqual;
  SESSION_SECRET: typeof Server.SESSION_SECRET;
}

export function registerMaintenanceRoutes(deps: RegisterMaintenanceRoutesDeps) {
// ==========================================
// MAINTENANCE MODE
// ==========================================
/**
 * While `maintenance_config.enabled` is on, every website page answers with a
 * branded "we'll be back soon" page (HTTP 503 + Retry-After, so Google keeps
 * the site's ranking). The dashboard, login, POS and the API keep working.
 * A signed-in admin gets a preview cookie from the dashboard and still sees
 * the real site.
 */
const MAINTENANCE_OPEN_PATHS = ['/admin', '/dashboard', '/login', '/reset-password', '/pos', '/api/', '/assets/', '/uploads/', '/@', '/src/', '/node_modules/'];
const MAINTENANCE_COOKIE = 'mnt_preview';

function maintenanceCookieValue(expiresAt: number): string {
  const mac = crypto.createHmac('sha256', deps.SESSION_SECRET).update(`maintenance-preview:${expiresAt}`).digest('hex').slice(0, 32);
  return `${expiresAt}.${mac}`;
}

function hasMaintenancePreview(req: express.Request): boolean {
  const raw = deps.readCookie(req, MAINTENANCE_COOKIE);
  const [expires, mac] = raw.split('.');
  const expiresAt = Number(expires);
  if (!expiresAt || expiresAt < Date.now() || !mac) return false;
  return deps.safeEqual(maintenanceCookieValue(expiresAt), raw);
}

let maintenanceCache: { at: number; data: any } = { at: 0, data: null };

/** Settings needed by the gate, re-read at most every 5 seconds */
async function maintenanceState(): Promise<any> {
  if (Date.now() - maintenanceCache.at < 5000 && maintenanceCache.data) return maintenanceCache.data;
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, ['maintenance_config', 'general', 'logo_config', 'theme', 'footer_config', 'chat_config']));
  const map: Record<string, any> = {};
  rows.forEach((row) => {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = {};
    }
  });
  maintenanceCache = { at: Date.now(), data: map };
  return map;
}

/** Progress shown on the page: automatic from start→end time, or the owner's number */
function maintenanceProgress(cfg: any): number {
  if (cfg.autoProgress && cfg.startAt && cfg.endAt) {
    const start = new Date(cfg.startAt).getTime();
    const end = new Date(cfg.endAt).getTime();
    if (end > start) return Math.max(1, Math.min(99, Math.round(((Date.now() - start) / (end - start)) * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(Number(cfg.progress) || 0)));
}

const htmlEscape = (value: any) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function renderMaintenancePage(map: any): string {
  const cfg = map.maintenance_config || {};
  const general = map.general || {};
  const logo = map.logo_config || {};
  const footer = map.footer_config || {};
  const chat = map.chat_config || {};
  const primary = /^#[0-9a-f]{3,8}$/i.test(map.theme?.primaryColor || '') ? map.theme.primaryColor : '#0f8a5f';
  const store = general.storeName || 'Our store';
  const progress = maintenanceProgress(cfg);
  const title = cfg.title || 'We are upgrading our website';
  const message =
    cfg.message || 'Our website is getting better for you. We will be back very soon — thank you for your patience.';
  const endAt = cfg.showCountdown !== false && cfg.endAt ? new Date(cfg.endAt).getTime() : 0;
  const phone = cfg.phone || general.phone || '';
  const chatWhatsapp = Array.isArray(chat.channels)
    ? chat.channels.find((c: any) => c?.type === 'whatsapp' && c.enabled !== false && c.value)?.value
    : '';
  const whatsappRaw = String(cfg.whatsapp || chatWhatsapp || chat.whatsappNumber || footer.whatsappNumber || general.whatsapp || '').replace(/\D/g, '');
  const whatsapp = whatsappRaw ? (whatsappRaw.startsWith('880') ? whatsappRaw : whatsappRaw.startsWith('0') ? `88${whatsappRaw}` : whatsappRaw) : '';
  const facebook = cfg.facebook || footer.facebookUrl || footer.socialLinks?.facebook || '';
  const email = general.email || '';
  const logoUrl = logo.desktopLogoUrl || '';
  const favicon = logo.faviconUrl || '';
  const steps: string[] = Array.isArray(cfg.steps) ? cfg.steps.filter(Boolean).slice(0, 6) : [];

  const contact = [
    phone && `<a class="btn" href="tel:${htmlEscape(phone)}"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Call ${htmlEscape(phone)}</a>`,
    whatsapp && `<a class="btn wa" href="https://wa.me/${htmlEscape(whatsapp)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M20.5 3.5A11.8 11.8 0 0 0 1.7 17.7L0 24l6.4-1.7A11.8 11.8 0 0 0 20.5 3.5ZM12 21.6a9.7 9.7 0 0 1-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4A9.8 9.8 0 1 1 12 21.6Zm5.4-7.3c-.3-.2-1.8-.9-2-1s-.5-.2-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.4Z"/></svg>WhatsApp</a>`,
    facebook && `<a class="btn fb" href="${htmlEscape(facebook)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"/></svg>Facebook</a>`,
    email && `<a class="btn" href="mailto:${htmlEscape(email)}"><svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v.5l8 5 8-5V6H4Zm16 2.8-7.5 4.7a1 1 0 0 1-1 0L4 8.8V18h16V8.8Z"/></svg>Email</a>`,
  ]
    .filter(Boolean)
    .join('');

  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${htmlEscape(title)} · ${htmlEscape(store)}</title>
${favicon ? `<link rel="icon" href="${htmlEscape(favicon)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Public+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--p:${primary};--ink:#0f172a;--soft:#475569;--line:#e2e8f0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%}
body{font-family:"Public Sans","Hind Siliguri",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);
  background:radial-gradient(1200px 600px at 10% -10%,color-mix(in srgb,var(--p) 18%,transparent),transparent 60%),
  radial-gradient(900px 500px at 110% 110%,color-mix(in srgb,var(--p) 14%,transparent),transparent 60%),#f8fafc;
  display:flex;align-items:center;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom))}
.card{width:100%;max-width:640px;background:rgba(255,255,255,.86);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.9);
  border-radius:28px;box-shadow:0 30px 80px -30px rgba(15,23,42,.35),0 1px 0 rgba(15,23,42,.04);padding:40px 34px;text-align:center;
  animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(14px)}}
.logo{height:64px;max-width:240px;object-fit:contain;margin:0 auto 6px;display:block}
.name{font-weight:800;font-size:22px;margin-bottom:6px}
.art{width:132px;height:132px;margin:14px auto 10px;position:relative}
.art svg{width:100%;height:100%}
.gear{transform-origin:center;transform-box:fill-box}
.g1{animation:spin 6s linear infinite}.g2{animation:spin 4s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;
  background:color-mix(in srgb,var(--p) 12%,#fff);color:var(--p);margin-bottom:14px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--p);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35;transform:scale(.8)}}
h1{font-size:clamp(24px,5.4vw,34px);line-height:1.2;font-weight:800;letter-spacing:-.02em;margin-bottom:12px}
p.msg{color:var(--soft);font-size:16px;line-height:1.7;max-width:500px;margin:0 auto}
.progress{margin:28px auto 6px;max-width:460px;text-align:left}
.row{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:600;color:var(--soft);margin-bottom:8px}
.row b{font-size:26px;color:var(--ink);font-weight:800}
.track{height:14px;border-radius:999px;background:#e8edf3;overflow:hidden;position:relative}
.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--p),color-mix(in srgb,var(--p) 65%,#22d3ee));
  width:0;transition:width 1.4s cubic-bezier(.2,.8,.2,1);position:relative;overflow:hidden}
.fill:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);
  transform:translateX(-100%);animation:shine 2.2s ease-in-out infinite}
@keyframes shine{to{transform:translateX(100%)}}
.steps{list-style:none;margin:18px auto 0;max-width:460px;text-align:left;display:grid;gap:8px}
.steps li{display:flex;gap:10px;align-items:center;font-size:14px;color:var(--soft)}
.steps li:before{content:"";flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--line)}
.steps li.done{color:var(--ink)}
.steps li.done:before{border-color:var(--p);background:var(--p) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E") center/12px no-repeat}
.count{display:flex;justify-content:center;gap:10px;margin-top:22px}
.count div{min-width:70px;padding:12px 8px;border-radius:16px;background:#fff;border:1px solid var(--line)}
.count b{display:block;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.count span{font-size:12px;color:var(--soft);text-transform:uppercase;letter-spacing:.08em}
.contact{margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}
.contact p{font-size:14px;color:var(--soft);margin-bottom:12px}
.btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:14px;font-weight:700;font-size:14px;
  text-decoration:none;color:#fff;background:var(--p);transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 20px -10px var(--p)}
.btn svg{width:18px;height:18px;fill:currentColor}
.btn.wa{background:#25d366}.btn.fb{background:#1877f2}
.foot{margin-top:22px;font-size:12px;color:#94a3b8}
@media (max-width:520px){.card{padding:30px 20px;border-radius:22px}.count div{min-width:60px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<main class="card">
  ${logoUrl ? `<img class="logo" src="${htmlEscape(logoUrl)}" alt="${htmlEscape(store)}">` : `<div class="name">${htmlEscape(store)}</div>`}
  <div class="art" aria-hidden="true">
    <svg viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="color-mix(in srgb, ${primary} 10%, white)"/>
      <!-- Teeth are a thick dashed ring around each wheel; the pair turns together -->
      <g class="gear g1">
        <circle cx="50" cy="56" r="20" fill="none" stroke="${primary}" stroke-width="9" stroke-dasharray="6.3 6.3"/>
        <circle cx="50" cy="56" r="19" fill="${primary}"/>
        <circle cx="50" cy="56" r="7" fill="white"/>
      </g>
      <g class="gear g2">
        <circle cx="82" cy="80" r="11" fill="none" stroke="color-mix(in srgb, ${primary} 55%, #22d3ee)" stroke-width="7" stroke-dasharray="4.3 4.3"/>
        <circle cx="82" cy="80" r="10.5" fill="color-mix(in srgb, ${primary} 55%, #22d3ee)"/>
        <circle cx="82" cy="80" r="4" fill="white"/>
      </g>
    </svg>
  </div>
  <div class="badge"><span class="dot"></span>${htmlEscape(cfg.badge || 'Maintenance in progress')}</div>
  <h1>${htmlEscape(title)}</h1>
  <p class="msg">${htmlEscape(message).replace(/\n/g, '<br>')}</p>

  ${cfg.showProgress === false ? '' : `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
    <div class="row"><span>${htmlEscape(cfg.progressLabel || 'Work completed')}</span><b id="pct">${progress}%</b></div>
    <div class="track"><div class="fill" id="fill"></div></div>
  </div>`}
  ${steps.length ? `<ul class="steps">${steps.map((step, index) => `<li class="${index < Math.round((progress / 100) * steps.length) ? 'done' : ''}">${htmlEscape(step)}</li>`).join('')}</ul>` : ''}
  ${endAt ? `<div class="count" id="count" aria-live="polite"><div><b id="d">0</b><span>Days</span></div><div><b id="h">0</b><span>Hours</span></div><div><b id="m">0</b><span>Min</span></div><div><b id="s">0</b><span>Sec</span></div></div>` : ''}

  ${contact ? `<div class="contact"><p>${htmlEscape(cfg.contactText || 'Need medicine urgently? We are still taking orders by phone.')}</p><div class="btns">${contact}</div></div>` : ''}
  <div class="foot">© ${new Date().getFullYear()} ${htmlEscape(store)}</div>
</main>
<script>
(function(){
  var fill=document.getElementById('fill');
  if(fill) requestAnimationFrame(function(){ setTimeout(function(){ fill.style.width='${progress}%'; }, 120); });
  var end=${endAt || 0};
  if(end){
    var ids=['d','h','m','s'];
    var tick=function(){
      var left=Math.max(0,end-Date.now());
      var parts=[Math.floor(left/864e5),Math.floor(left/36e5)%24,Math.floor(left/6e4)%60,Math.floor(left/1e3)%60];
      ids.forEach(function(id,i){var el=document.getElementById(id); if(el) el.textContent=String(parts[i]).padStart(2,'0');});
      if(left<=0){ clearInterval(timer); setTimeout(function(){ location.reload(); }, 5000); }
    };
    var timer=setInterval(tick,1000); tick();
  }
  // Come back by itself once the shop is open again
  setInterval(function(){
    fetch('/api/maintenance/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
      if(!d.enabled) location.reload();
      else if(fill && typeof d.progress==='number'){ fill.style.width=d.progress+'%'; var p=document.getElementById('pct'); if(p) p.textContent=d.progress+'%'; }
    }).catch(function(){});
  }, 60000);
})();
</script>
</body>
</html>`;
}

/** The gate: registered first in startServer() */
async function maintenanceGate(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const path = req.path || '/';
    if (MAINTENANCE_OPEN_PATHS.some((prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix))) return next();
    if (/\.[a-z0-9]{2,5}$/i.test(path)) return next(); // files: images, fonts, scripts, favicon
    const map = await maintenanceState();
    const cfg = map.maintenance_config || {};
    if (!cfg.enabled) return next();
    if (hasMaintenancePreview(req)) return next();
    res.status(503);
    res.setHeader('Retry-After', cfg.endAt ? Math.max(60, Math.round((new Date(cfg.endAt).getTime() - Date.now()) / 1000)) : 3600);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderMaintenancePage(map));
  } catch {
    next();
  }
}

/** Polled by the maintenance page (reloads when the shop opens) and by the storefront app */
deps.app.get('/api/maintenance/status', async (req, res) => {
  try {
    maintenanceCache.at = 0;
    const map = await maintenanceState();
    const cfg = map.maintenance_config || {};
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enabled: Boolean(cfg.enabled), progress: maintenanceProgress(cfg), preview: hasMaintenancePreview(req) });
  } catch {
    res.json({ enabled: false });
  }
});

/** The dashboard asks for this so the owner can look at the real site during maintenance */
deps.app.post('/api/admin/maintenance/preview', (req, res) => {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  res.cookie(MAINTENANCE_COOKIE, maintenanceCookieValue(expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ success: true, expiresAt });
});

deps.app.post('/api/admin/maintenance/preview/clear', (_req, res) => {
  res.clearCookie(MAINTENANCE_COOKIE, { path: '/' });
  res.json({ success: true });
});

/** Dashboard preview of the maintenance page with unsaved settings */
deps.app.post('/api/admin/maintenance/render', async (req, res) => {
  try {
    maintenanceCache.at = 0;
    const map = await maintenanceState();
    res.type('html').send(renderMaintenancePage({ ...map, maintenance_config: req.body?.config || {} }));
  } catch {
    res.status(500).send('Preview unavailable');
  }
});

/** Settings save clears the cache so switching maintenance on/off is instant */
function invalidateMaintenanceCache() {
  maintenanceCache = { at: 0, data: null };
}

  return { hasMaintenancePreview, htmlEscape, invalidateMaintenanceCache, maintenanceGate, maintenanceState };
}
