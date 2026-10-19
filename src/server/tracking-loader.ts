/**
 * v3.12 — Google Tag Manager, Google Analytics 4 and the Meta Pixel are
 * written into the page by the server (they used to be added later by the
 * website's script).
 *
 *  - Tag checkers, Google Search Console, Meta's Pixel Helper and SEO audits
 *    read the page source, so they now see the tags.
 *  - Speed: these scripts are big (about 150–300 KB together). With
 *    "Load tracking after the first tap or scroll" on (the default), only a
 *    tiny queue is set up while the page opens; the real scripts arrive the
 *    moment the visitor scrolls, taps, moves the mouse or presses a key, or
 *    5 seconds after the page has loaded — whichever comes first. Nothing is
 *    lost: every event (PageView, ViewContent, AddToCart…) waits in the queue
 *    and is sent as soon as the scripts are in.
 *  - src/lib/tracking.ts sees the ids already set and does not load the
 *    scripts a second time.
 */

const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/i;
const GA4_ID = /^G-[A-Z0-9]{4,16}$/i;
const PIXEL_ID = /^\d{10,20}$/;

export function trackingHeadTags(marketing: any): string {
  if (!marketing || typeof marketing !== 'object') return '';
  const gtm = String(marketing.gtmId || '').trim();
  const ga4 = String(marketing.ga4Id || '').trim();
  const pixel = String(marketing.metaPixelId || '').trim();
  const useGtm = GTM_ID.test(gtm);
  // With GTM, GA4 belongs inside the container (loading both counts twice)
  const useGa4 = !useGtm && GA4_ID.test(ga4);
  // v3.15 — "Pixel runs in my GTM container": the website must not load it too
  const pixelInGtm = marketing.pixelSource === 'gtm';
  const usePixel = PIXEL_ID.test(pixel) && marketing.enableMetaPixel !== false && !pixelInGtm;
  // A Meta pixel is in use somewhere (here, in GTM, or server-side only)
  const metaInUse = PIXEL_ID.test(pixel) && (marketing.enableMetaPixel !== false || Boolean(marketing.metaConversionsToken || marketing.capiEnabled));
  if (!useGtm && !useGa4 && !usePixel && !metaInUse) return '';
  const delay = marketing.delayTracking !== false;

  const lines: string[] = [];
  lines.push('window.dataLayer=window.dataLayer||[];');
  if (metaInUse) {
    /*
     * v3.15 — Meta's browser ids, set the moment the page opens:
     *  _fbc  from ?fbclid= in the ad link. The pixel only writes it when its
     *        script has loaded; with delayed loading (or a quick tap to another
     *        page, which removes fbclid from the address) the click id was lost
     *        and the sale was not credited to the ad.
     *  _fbp  the browser id. Made here if the pixel has not made one yet, so the
     *        Conversions API events (and the pixel, which reuses the cookie) carry
     *        the same id even when an ad blocker stops the pixel.
     * Format and 90-day life as Meta documents for these cookies.
     */
    lines.push(
      "try{var C=function(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):''};" +
        "var W=function(n,v){document.cookie=n+'='+v+';max-age=7776000;path=/;SameSite=Lax'+(location.protocol==='https:'?';Secure':'')};" +
        "var q=new URLSearchParams(location.search).get('fbclid');" +
        "if(q){var o=C('_fbc');if(!o||o.split('.').slice(3).join('.')!==q)W('_fbc','fb.1.'+Date.now()+'.'+q);}" +
        "if(!C('_fbp'))W('_fbp','fb.1.'+Date.now()+'.'+Math.floor(1e9+Math.random()*9e9));}catch(e){}"
    );
  }
  lines.push('var T=window._pharmaTracking=window._pharmaTracking||{};');
  lines.push(`T.pixelEnabled=${usePixel ? 'true' : 'false'};`);
  const loads: string[] = [];
  if (useGtm) {
    lines.push(`T.gtmId=${JSON.stringify(gtm)};`);
    lines.push("window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});");
    loads.push(`s('https://www.googletagmanager.com/gtm.js?id=${gtm}','gtm-script');`);
  }
  if (useGa4) {
    lines.push(`T.ga4Id=${JSON.stringify(ga4)};T.ga4Direct=true;`);
    lines.push('window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};');
    lines.push(`gtag('js',new Date());gtag('config',${JSON.stringify(ga4)},{send_page_view:false});`);
    loads.push(`s('https://www.googletagmanager.com/gtag/js?id=${ga4}','ga4-script');`);
  }
  if (usePixel) {
    lines.push(`T.pixelId=${JSON.stringify(pixel)};`);
    // The standard Meta stub, without its script tag: events queue until fbevents.js arrives
    lines.push(
      "!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);"
    );
    lines.push(`fbq('init',${JSON.stringify(pixel)});`);
    loads.push("s('https://connect.facebook.net/en_US/fbevents.js','meta-pixel-script');");
  }

  const loader = `function s(u,id){if(document.getElementById(id))return;var e=document.createElement('script');e.async=true;e.src=u;e.id=id;document.head.appendChild(e);}`;
  const run = `function go(){if(window.__trackingLoaded)return;window.__trackingLoaded=1;${loads.join('')}}`;
  const trigger = delay
    ? "var ev=['scroll','pointerdown','touchstart','keydown','mousemove','wheel'];function once(){ev.forEach(function(n){window.removeEventListener(n,once,{passive:true})});go();}ev.forEach(function(n){window.addEventListener(n,once,{passive:true})});if(document.readyState==='complete'){setTimeout(go,5000);}else{window.addEventListener('load',function(){setTimeout(go,5000);});}"
    : 'go();';

  return `<script id="tracking-loader">(function(){${lines.join('')}${loader}${run}${trigger}})();</script>`;
}

/** The no-JavaScript fallbacks of GTM and the pixel (they go right after <body>) */
export function trackingBodyTags(marketing: any): string {
  if (!marketing || typeof marketing !== 'object') return '';
  const gtm = String(marketing.gtmId || '').trim();
  const pixel = String(marketing.metaPixelId || '').trim();
  const parts: string[] = [];
  if (GTM_ID.test(gtm)) {
    parts.push(
      `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>`
    );
  }
  if (PIXEL_ID.test(pixel) && marketing.enableMetaPixel !== false && marketing.pixelSource !== 'gtm') {
    parts.push(
      `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${pixel}&amp;ev=PageView&amp;noscript=1" /></noscript>`
    );
  }
  return parts.join('');
}
