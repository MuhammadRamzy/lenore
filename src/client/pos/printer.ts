import { business } from "../../business";
import { upiLink, type Invoice, type PaymentDetails } from "../../erp";
import markUrl from "./lenore-mark-print.png";
import { billQr } from "./qr";

/** Direct ESC/POS printing to a USB/serial receipt printer (Chrome/Edge Web Serial). */
type SerialPortLike = {
  open: (o: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
};
let port: SerialPortLike | null = null;
const serial = () => (navigator as unknown as { serial: SerialLike }).serial;
export const serialSupported = () =>
  typeof navigator !== "undefined" && "serial" in navigator;

export type BillFormat = "receipt" | "a4" | "direct";
export type PrinterPrefs = {
  baudRate: number;
  paperMm: 58 | 80;
  /** What "print" means after a sale: 80 mm or A4 via the print dialog, or direct USB. */
  billFormat: BillFormat;
  autoPrint: boolean;
};
const DEFAULTS: PrinterPrefs = {
  baudRate: 9600,
  paperMm: 80,
  billFormat: "receipt",
  autoPrint: false,
};
const PREFS = "lenore-printer";
export function printerPrefs(): PrinterPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
export function savePrinterPrefs(p: PrinterPrefs) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    // Defaults still work when storage is unavailable.
  }
}

/** Asks the cashier to pick the printer (once); the browser remembers the approval. */
export async function connectPrinter() {
  await disconnectPrinter();
  const next = await serial().requestPort();
  await next.open({ baudRate: printerPrefs().baudRate });
  port = next;
  return true;
}
/** Reopens a printer approved earlier, without a prompt. False if none. */
export async function restorePrinter() {
  if (port || !serialSupported()) return !!port;
  const [known] = await serial().getPorts();
  if (!known) return false;
  try {
    await known.open({ baudRate: printerPrefs().baudRate });
  } catch {
    // Already open in another tab, or unplugged.
    return false;
  }
  port = known;
  return true;
}
export async function disconnectPrinter() {
  const old = port;
  port = null;
  await old?.close().catch(() => undefined);
}
export const printerConnected = () => !!port;

async function send(bytes: Uint8Array) {
  if (!port?.writable) throw new Error("Connect the receipt printer first.");
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } catch {
    port = null;
    throw new Error(
      "The printer stopped responding. Check the cable and reconnect.",
    );
  } finally {
    writer.releaseLock();
  }
}
const DRAWER = [0x1b, 0x70, 0x00, 0x19, 0xfa];
export const openDrawer = () => send(new Uint8Array(DRAWER));

/** Short page to check alignment, width, logo, QR and the cutter. */
export async function testPrint() {
  const w = width();
  const text = [
    "\x1ba\x01\x1b!\x30LENORE\x1b!\x00",
    "PRINTER TEST",
    new Date().toLocaleString("en-IN"),
    "\x1ba\x00",
    "-".repeat(w),
    pad("Left", "Right"),
    "1234567890".repeat(Math.ceil(w / 10)).slice(0, w),
    `Paper ${printerPrefs().paperMm} mm - ${w} characters`,
    `Baud ${printerPrefs().baudRate}`,
    "-".repeat(w),
    "\x1ba\x01If the line above fits exactly, the width is right.",
    "",
  ].join("\n");
  await send(
    new Uint8Array([
      0x1b,
      0x40,
      ...(await logoBytes()),
      ...ascii(text + "\n"),
      ...qrBytes("LENORE PRINTER TEST"),
      ...ascii("\n\n\n\x1dV\x41\x03"),
    ]),
  );
}

/** Characters per line in font A: 42 fits most 80 mm printers, 32 fits 58 mm. */
const width = () => (printerPrefs().paperMm === 58 ? 32 : 42);
const pad = (left: string, right: string) => {
  const space = Math.max(1, width() - left.length - right.length);
  return `${left}${" ".repeat(space)}${right}`;
};
const rupees = (p: number) => (p / 100).toFixed(2);

/** ESC/POS native QR (GS ( k, model 2, error level M), printed by the printer itself. */
function qrBytes(data: string) {
  const d = new TextEncoder().encode(data);
  const len = d.length + 3;
  return new Uint8Array([
    ...[0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00],
    ...[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06],
    ...[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31],
    ...[0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30],
    ...d,
    ...[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
  ]);
}
/** Logo as an ESC/POS raster (GS v 0), centred; empty if the image cannot load. */
async function logoBytes(height = 96) {
  try {
    const img = new Image();
    img.src = markUrl;
    await img.decode();
    const w = Math.ceil((img.width * height) / img.height / 8) * 8;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, height);
    const { data } = ctx.getImageData(0, 0, w, height);
    const row = w / 8;
    const bits = new Uint8Array(row * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < w; x++)
        if (data[(y * w + x) * 4 + 3] > 127)
          bits[y * row + (x >> 3)] |= 0x80 >> (x & 7);
    return new Uint8Array([
      ...[0x1b, 0x61, 0x01],
      ...[
        0x1d,
        0x76,
        0x30,
        0x00,
        row & 0xff,
        row >> 8,
        height & 0xff,
        height >> 8,
      ],
      ...bits,
      0x0a,
    ]);
  } catch {
    return new Uint8Array();
  }
}
const ascii = (text: string) =>
  new TextEncoder().encode(
    // ESC/POS text is ASCII; drop characters the printer cannot render (₹ etc.).
    [...text].filter((ch) => ch.charCodeAt(0) < 128).join(""),
  );

/** Builds and sends a plain-text receipt; optionally opens the cash drawer. */
export async function printEscPos(
  invoice: Invoice,
  footer: string,
  withDrawer: boolean,
  payment?: PaymentDetails,
) {
  const WIDTH = width();
  const lines = [
    "\x1ba\x01\x1b!\x30LENORE\x1b!\x00",
    business.tagline.toUpperCase(),
    "",
    business.legalName,
    `GSTIN ${business.gstin}`,
    `Ph ${business.phoneDisplay}`,
    "TAX INVOICE",
    "\x1ba\x00",
    pad(invoice.number, invoice.date),
    `Customer: ${invoice.customer.name}`.slice(0, WIDTH),
    "-".repeat(WIDTH),
    ...invoice.lines.flatMap((l) => [
      l.name.slice(0, WIDTH),
      pad(
        `${l.qty} x ${rupees(l.rate)}${l.discount ? ` -${rupees(l.discount)}` : ""}`,
        rupees(l.total),
      ),
    ]),
    "-".repeat(WIDTH),
    pad("Taxable", rupees(invoice.taxable)),
    ...(invoice.igst
      ? [pad("IGST", rupees(invoice.igst))]
      : [pad("CGST", rupees(invoice.cgst)), pad("SGST", rupees(invoice.sgst))]),
    pad("Round off", rupees(invoice.roundOff)),
    `\x1b!\x10${pad("TOTAL", rupees(invoice.total))}\x1b!\x00`,
    "-".repeat(WIDTH),
    "\x1ba\x01",
  ];
  const qr = billQr(invoice, payment);
  const link =
    qr && payment ? upiLink(payment, qr.amount, invoice.number) : null;
  const tail = [
    "",
    ...(link && payment
      ? [
          qr?.amount ? `Scan to pay Rs ${rupees(qr.amount)}` : "Scan to pay",
          `UPI: ${payment.upiId}`,
          "-".repeat(WIDTH),
        ]
      : []),
    footer.slice(0, WIDTH * 2),
    "\n\n\n",
    "\x1dV\x41\x03",
  ];
  const head = new Uint8Array([
    0x1b,
    0x40,
    ...(await logoBytes()),
    ...ascii(lines.join("\n") + "\n"),
  ]);
  const code = link ? qrBytes(link) : new Uint8Array();
  const rest = ascii(tail.join("\n"));
  const bytes = new Uint8Array([...head, ...code, ...rest]);
  await send(withDrawer ? new Uint8Array([...DRAWER, ...bytes]) : bytes);
}
