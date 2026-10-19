/**
 * Printing and PDF download for invoices.
 *
 * Why an iframe: printing the live page and hiding everything else with
 * `visibility: hidden` still leaves the hidden page taking up its full height,
 * so the printer produced the invoice plus blank pages (1 invoice = 3 pages).
 * Here only the invoice markup goes into a separate, empty document, so the
 * printout is exactly the invoice — or, for bulk printing, exactly one invoice
 * per page.
 */

export type PaperSize = 'a4' | 'mm80' | 'mm58';

const PAGE: Record<PaperSize, { page: string; margin: string; widthMm: number }> = {
  a4: { page: 'A4 portrait', margin: '10mm', widthMm: 210 },
  mm80: { page: '80mm auto', margin: '2mm', widthMm: 80 },
  mm58: { page: '58mm auto', margin: '2mm', widthMm: 58 },
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** The page's own stylesheets, so the invoice looks the same inside the frame */
const collectStyles = () =>
  Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('\n');

const waitForAssets = async (doc: Document) => {
  const images = Array.from(doc.images).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
  );
  const fonts = (doc as any).fonts?.ready?.catch?.(() => undefined) ?? Promise.resolve();
  await Promise.race([Promise.all([...images, fonts]), new Promise((resolve) => setTimeout(resolve, 4000))]);
};

/**
 * Prints the given invoice elements, one per page, in an isolated frame.
 * Resolves once the print dialog has been opened.
 */
export async function printInvoices(nodes: HTMLElement[], size: PaperSize, title = 'Invoice'): Promise<void> {
  if (nodes.length === 0) return;
  const paper = PAGE[size];
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  const sheets = nodes.map((node) => `<section class="print-sheet">${node.outerHTML}</section>`).join('');
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<base href="${window.location.origin}/">
${collectStyles()}
<style>
  @page { size: ${paper.page}; margin: ${paper.margin}; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body * { visibility: visible !important; }
  .print-sheet { break-after: page; page-break-after: always; }
  .print-sheet:last-child { break-after: auto; page-break-after: auto; }
  .print-sheet .invoice-print-root {
    position: static !important; width: 100% !important; max-width: none !important;
    height: auto !important; max-height: none !important; overflow: visible !important;
    margin: 0 !important; box-shadow: none !important; ${size === 'a4' ? 'padding: 0 !important;' : ''}
  }
  /* A long invoice continues on the next page without cutting a line in half */
  .print-sheet tr, .print-sheet img { break-inside: avoid; page-break-inside: avoid; }
  .print-sheet thead { display: table-header-group; }
  .no-print { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${sheets}</body></html>`);
  doc.close();

  await new Promise<void>((resolve) => {
    if (doc.readyState === 'complete') resolve();
    else {
      iframe.onload = () => resolve();
      setTimeout(resolve, 2500);
    }
  });
  await waitForAssets(doc);

  const cleanup = () => setTimeout(() => iframe.remove(), 300);
  win.addEventListener('afterprint', cleanup, { once: true });
  // Some mobile browsers never fire afterprint
  setTimeout(() => iframe.isConnected && iframe.remove(), 120000);
  win.focus();
  win.print();
}

/**
 * Saves invoice elements as one PDF (a page per invoice; a long A4 invoice
 * continues onto further pages). The browser draws the invoice first, so
 * Bangla names and addresses come out exactly as on screen.
 */
export async function downloadInvoicePdf(nodes: HTMLElement[], size: PaperSize, filename: string): Promise<void> {
  if (nodes.length === 0) return;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const paper = PAGE[size];
  const marginMm = size === 'a4' ? 10 : 2;
  const contentWidth = paper.widthMm - marginMm * 2;
  let pdf: InstanceType<typeof jsPDF> | null = null;

  // Each invoice is drawn from a copy placed off-screen at its natural size,
  // so what is on the PDF never depends on how much of it is visible in the
  // viewer (a long invoice used to be cut at the bottom of the window).
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:absolute;left:-20000px;top:0;pointer-events:none;background:#fff';
  document.body.appendChild(stage);

  try {
  for (const node of nodes) {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.style.height = 'auto';
    copy.style.maxHeight = 'none';
    copy.style.overflow = 'visible';
    copy.style.boxShadow = 'none';
    copy.style.width = `${node.offsetWidth || Math.round(paper.widthMm * 3.78)}px`;
    stage.replaceChildren(copy);
    await waitForAssets(document);
    const fullHeight = Math.ceil(copy.scrollHeight);
    const canvas = await html2canvas(copy, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      height: fullHeight,
      windowHeight: Math.max(fullHeight, window.innerHeight),
      scrollX: 0,
      scrollY: 0,
    });
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    if (size === 'a4') {
      const pageHeight = 297;
      const usable = pageHeight - marginMm * 2;
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      else pdf.addPage('a4', 'portrait');
      // Slice a long invoice across as many pages as it needs
      const pxPerMm = canvas.width / contentWidth;
      const sliceHeightPx = Math.floor(usable * pxPerMm);
      for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeightPx, page += 1) {
        if (page > 0) pdf.addPage('a4', 'portrait');
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.min(sliceHeightPx, canvas.height - offset);
        slice.getContext('2d')!.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', marginMm, marginMm, contentWidth, slice.height / pxPerMm);
      }
    } else {
      // Thermal: one tall page per receipt, exactly as long as the receipt
      const format: [number, number] = [paper.widthMm, imgHeight + marginMm * 2];
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format, orientation: 'portrait', compress: true });
      else pdf.addPage(format, 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', marginMm, marginMm, contentWidth, imgHeight);
    }
  }
  } finally {
    stage.remove();
  }
  pdf?.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/**
 * Prints any dashboard section (e.g. a report) on A4 from an isolated frame,
 * with the page's own styles. Charts are scaled to the page width.
 */
export async function printElement(node: HTMLElement, title = 'Report'): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<base href="${window.location.origin}/">
${collectStyles()}
<style>
  @page { size: A4 portrait; margin: 12mm; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body { font-family: var(--font-sans, sans-serif); color: #111827; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  svg { max-width: 100% !important; height: auto; }
  .recharts-responsive-container, .recharts-wrapper { width: 100% !important; height: auto !important; }
  .a-card { box-shadow: none !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body class="admin-shell">${node.outerHTML}</body></html>`);
  doc.close();
  await new Promise<void>((resolve) => {
    if (doc.readyState === 'complete') resolve();
    else {
      iframe.onload = () => resolve();
      setTimeout(resolve, 2500);
    }
  });
  await waitForAssets(doc);
  win.addEventListener('afterprint', () => setTimeout(() => iframe.remove(), 300), { once: true });
  setTimeout(() => iframe.isConnected && iframe.remove(), 120000);
  win.focus();
  win.print();
}
