/**
 * Cash drawer for the POS.
 *
 * A cash drawer has no brain of its own: it opens when it receives a short
 * electric pulse. Almost every drawer sold in Bangladesh plugs (RJ11 cable)
 * into the back of the thermal receipt printer, and the printer sends that
 * pulse when it receives the standard "kick" command ESC p (1B 70 …). So
 * "opening the drawer" means one of:
 *
 *   printer — the printer's Windows driver opens the drawer every time it
 *             prints (driver setting "Cash drawer: open before/after print").
 *             The POS prints the receipt automatically after a cash sale and
 *             prints a small "NO SALE" slip for a manual open.
 *   serial  — the printer (or a USB drawer trigger) shows up as a COM port.
 *             The POS sends the kick command straight to it (Chrome / Edge,
 *             Web Serial). Instant, no print dialog.
 *   usb     — a USB receipt printer driven directly (Chrome / Edge, WebUSB).
 *             Needs the WinUSB driver on Windows; for advanced setups.
 *
 * Settings are per computer (localStorage): the counter PC has the drawer,
 * the owner's laptop does not.
 */

export type DrawerMode = 'off' | 'printer' | 'serial' | 'usb';

export interface DrawerSettings {
  mode: DrawerMode;
  /** open by itself after a cash sale */
  autoOpen: boolean;
  /** also open after bKash / Nagad / card sales */
  openForAll: boolean;
  /** print the receipt by itself after every sale */
  autoPrint: boolean;
  /** drawer socket pin on the printer: 2 (almost all) or 5 */
  pin: 2 | 5;
  baudRate: number;
  /** ask the cashier why when the drawer is opened without a sale */
  askReason: boolean;
}

export const DEFAULT_DRAWER: DrawerSettings = {
  mode: 'off',
  autoOpen: true,
  openForAll: false,
  autoPrint: false,
  pin: 2,
  baudRate: 9600,
  askReason: true,
};

const KEY = 'pos:cash-drawer';

export function readDrawerSettings(): DrawerSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    const merged = { ...DEFAULT_DRAWER, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    if (!['off', 'printer', 'serial', 'usb'].includes(merged.mode)) merged.mode = 'off';
    merged.pin = Number(merged.pin) === 5 ? 5 : 2;
    merged.baudRate = Number(merged.baudRate) || 9600;
    return merged;
  } catch {
    return { ...DEFAULT_DRAWER };
  }
}

export function saveDrawerSettings(settings: DrawerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode — settings last until the tab closes */
  }
}

export const drawerSupport = () => ({
  serial: typeof navigator !== 'undefined' && 'serial' in navigator,
  usb: typeof navigator !== 'undefined' && 'usb' in navigator,
  secure: typeof window !== 'undefined' && window.isSecureContext,
});

/** ESC p m t1 t2 — pulse the drawer pin for 50 ms, then wait 500 ms */
export const kickCommand = (pin: 2 | 5) => new Uint8Array([0x1b, 0x70, pin === 5 ? 0x01 : 0x00, 0x19, 0xfa]);

export class DrawerError extends Error {}

/* ---------------------------------------------------------------- serial */

let serialPort: any = null;

async function serialPortFor(interactive: boolean): Promise<any> {
  const serial = (navigator as any).serial;
  if (!serial) throw new DrawerError('This browser cannot use COM ports. Use Google Chrome or Microsoft Edge on the counter computer.');
  if (serialPort) return serialPort;
  const known = await serial.getPorts();
  let port = known[0];
  if (!port && interactive) port = await serial.requestPort();
  if (!port) throw new DrawerError('No drawer connected on this computer yet. Open Cash drawer → Connect.');
  serialPort = port;
  return port;
}

async function kickSerial(settings: DrawerSettings, interactive: boolean) {
  const port = await serialPortFor(interactive);
  if (!port.writable) {
    try {
      await port.open({ baudRate: settings.baudRate });
    } catch (error: any) {
      // Already open in this tab is fine; anything else is a real problem
      if (!port.writable) {
        serialPort = null;
        throw new DrawerError(
          /in use|busy|access/i.test(String(error?.message))
            ? 'The COM port is in use by another program (maybe the printer driver). Close it or use "Through the receipt printer".'
            : `Could not open the COM port: ${error?.message || 'unknown error'}`
        );
      }
    }
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(kickCommand(settings.pin));
  } finally {
    writer.releaseLock();
  }
}

/* ------------------------------------------------------------------- usb */

let usbDevice: any = null;
let usbEndpoint = 0;

async function usbDeviceFor(interactive: boolean): Promise<any> {
  const usb = (navigator as any).usb;
  if (!usb) throw new DrawerError('This browser cannot talk to USB printers. Use Google Chrome or Microsoft Edge.');
  let device = usbDevice || (await usb.getDevices())[0];
  if (!device && interactive) device = await usb.requestDevice({ filters: [] });
  if (!device) throw new DrawerError('No USB printer connected on this computer yet. Open Cash drawer → Connect.');
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  if (!usbEndpoint) {
    for (const iface of device.configuration.interfaces) {
      for (const alternate of iface.alternates) {
        const out = alternate.endpoints.find((endpoint: any) => endpoint.direction === 'out' && endpoint.type === 'bulk');
        if (!out) continue;
        try {
          await device.claimInterface(iface.interfaceNumber);
        } catch {
          throw new DrawerError(
            'Windows is using this printer through its own driver, so the browser cannot reach it. Choose "Through the receipt printer" instead (recommended).'
          );
        }
        usbEndpoint = out.endpointNumber;
        break;
      }
      if (usbEndpoint) break;
    }
  }
  if (!usbEndpoint) throw new DrawerError('This USB device is not a receipt printer.');
  usbDevice = device;
  return device;
}

async function kickUsb(settings: DrawerSettings, interactive: boolean) {
  const device = await usbDeviceFor(interactive);
  await device.transferOut(usbEndpoint, kickCommand(settings.pin));
}

/* --------------------------------------------------------------- printing */

/**
 * Prints a small slip through the normal print dialog (or silently when
 * Chrome runs with --kiosk-printing). With the drawer set to open on print in
 * the printer driver, this is what opens it.
 */
export function printSlip(html: string, paper: 'mm58' | 'mm80' = 'mm80') {
  const width = paper === 'mm58' ? '58mm' : '80mm';
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width} auto;margin:0}body{margin:0;padding:3mm;width:${width};box-sizing:border-box;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#000;text-align:center}hr{border:0;border-top:1px dashed #000;margin:6px 0}</style></head><body>${html}</body></html>`
  );
  doc.close();
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1500);
    }
  }, 120);
}

const escapeHtml = (value: string) =>
  String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

export function noSaleSlipHtml(input: { storeName?: string; cashier?: string; reason?: string }) {
  return [
    input.storeName ? `<div style="font-weight:700;font-size:14px">${escapeHtml(input.storeName)}</div>` : '',
    '<hr>',
    '<div style="font-weight:700;font-size:15px">NO SALE — DRAWER OPEN</div>',
    `<div>${escapeHtml(new Date().toLocaleString('en-GB'))}</div>`,
    input.cashier ? `<div>Cashier: ${escapeHtml(input.cashier)}</div>` : '',
    input.reason ? `<div>Reason: ${escapeHtml(input.reason)}</div>` : '',
    '<hr>',
  ].join('');
}

/* ------------------------------------------------------------------ public */

/**
 * Opens the drawer with the method chosen for this computer.
 * `interactive` may show the browser's device picker (only from a click).
 * In printer mode the caller's `print` does the work (receipt or slip).
 */
export async function openDrawer(
  settings: DrawerSettings,
  options: { interactive?: boolean; print?: () => void } = {}
): Promise<{ ok: boolean; message: string }> {
  try {
    if (settings.mode === 'off') return { ok: false, message: 'The cash drawer is switched off on this computer.' };
    if (settings.mode === 'printer') {
      if (!options.print) return { ok: false, message: 'Nothing to print.' };
      options.print();
      return { ok: true, message: 'Sent to the receipt printer — the drawer opens as it prints.' };
    }
    if (settings.mode === 'serial') await kickSerial(settings, Boolean(options.interactive));
    if (settings.mode === 'usb') await kickUsb(settings, Boolean(options.interactive));
    return { ok: true, message: 'Drawer opened.' };
  } catch (error: any) {
    if (error?.name === 'NotFoundError') return { ok: false, message: 'No device was chosen.' };
    return { ok: false, message: error instanceof DrawerError ? error.message : `Could not open the drawer: ${error?.message || error}` };
  }
}

/** Asks the browser for the device once (from a click); later opens need no prompt */
export async function connectDrawer(settings: DrawerSettings): Promise<{ ok: boolean; message: string }> {
  try {
    if (settings.mode === 'serial') {
      serialPort = null;
      const port = await serialPortFor(true);
      const info = port.getInfo?.() || {};
      return { ok: true, message: `COM port connected${info.usbVendorId ? ` (USB ${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)})` : ''}.` };
    }
    if (settings.mode === 'usb') {
      usbDevice = null;
      usbEndpoint = 0;
      const device = await usbDeviceFor(true);
      return { ok: true, message: `Connected to ${device.productName || 'the USB printer'}.` };
    }
    return { ok: true, message: 'Nothing to connect for this option.' };
  } catch (error: any) {
    if (error?.name === 'NotFoundError') return { ok: false, message: 'No device was chosen.' };
    return { ok: false, message: error instanceof DrawerError ? error.message : String(error?.message || error) };
  }
}

/** Whether a device was already allowed on this computer (no prompt needed) */
export async function drawerDeviceReady(settings: DrawerSettings): Promise<boolean> {
  try {
    if (settings.mode === 'serial') return Boolean(serialPort) || ((await (navigator as any).serial?.getPorts()) || []).length > 0;
    if (settings.mode === 'usb') return Boolean(usbDevice) || ((await (navigator as any).usb?.getDevices()) || []).length > 0;
    return settings.mode === 'printer';
  } catch {
    return false;
  }
}

/** Should this sale open the drawer by itself? */
export const shouldAutoOpen = (settings: DrawerSettings, paymentMethod: string) =>
  settings.mode !== 'off' && settings.autoOpen && (settings.openForAll || String(paymentMethod).toLowerCase() === 'cash');
