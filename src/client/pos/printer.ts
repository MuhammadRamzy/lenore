import { business } from "../../business";
import { upiLink, type Invoice, type PaymentDetails } from "../../erp";
import markUrl from "./lenore-mark-print.png";
import { billQr } from "./qr";

/** Direct ESC/POS printing to a USB/serial receipt printer (Chrome/Edge Web Serial). */
type SerialPortLike = {
  open: (o: { baudRate: number }) => Promise<void>;
  writable: WritableStream<Uint8Array>;
};
let port: SerialPortLike | null = null;
export const serialSupported = () =>
  typeof navigator !== "undefined" && "serial" in navigator;

export async function connectPrinter() {
  const serial = (
    navigator as unknown as {
      serial: { requestPort: () => Promise<SerialPortLike> };
    }
  ).serial;
  port = await serial.requestPort();
  await port.open({ baudRate: 9600 });
  return true;
}
export const printerConnected = () => !!port;

const WIDTH = 42;
const pad = (left: string, right: string) => {
  const space = Math.max(1, WIDTH - left.length - right.length);
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
  openDrawer: boolean,
  payment?: PaymentDetails,
) {
  if (!port) throw new Error("Connect the receipt printer first.");
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
  const drawer = openDrawer
    ? new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa])
    : new Uint8Array();
  const writer = port.writable.getWriter();
  try {
    await writer.write(
      drawer.length ? new Uint8Array([...drawer, ...bytes]) : bytes,
    );
  } finally {
    writer.releaseLock();
  }
}
