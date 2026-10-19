import qrcode from "qrcode-generator";
import {
  invoiceDue,
  upiLink,
  type Invoice,
  type PaymentDetails,
} from "../../erp";
import { money } from "../../shared";

/** Crisp, printable SVG QR code with the standard four-module quiet zone. */
export function QrCode({
  text,
  size = 168,
  label,
}: {
  text: string;
  size?: number;
  label: string;
}) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${n + 8} ${n + 8}`}
      shapeRendering="crispEdges"
    >
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** UPI scan-to-pay code for an amount (or any amount when null). */
export function UpiQr({
  payment,
  amount,
  note,
  size,
}: {
  payment: PaymentDetails | undefined;
  amount: number | null;
  note?: string;
  size?: number;
}) {
  const link = payment ? upiLink(payment, amount, note) : null;
  if (!payment || !link) return null;
  return (
    <div className={`upi-qr${size && size >= 200 ? " large" : ""}`}>
      <QrCode
        text={link}
        size={size}
        label={`UPI QR code to pay ${amount ? money(amount) : ""} to ${payment.upiId}`}
      />
      <div className="upi-qr-text">
        <strong>
          {amount ? `Scan to pay ${money(amount)}` : "Scan to pay"}
        </strong>
        <span>Any UPI app · {payment.upiId}</span>
      </div>
    </div>
  );
}

/** Whether, and for how much, a printed bill carries the UPI code. */
export function billQr(invoice: Invoice, payment: PaymentDetails | undefined) {
  if (!payment?.upiId || payment.qrOnBills === "off") return null;
  const due = invoiceDue(invoice);
  if (payment.qrOnBills === "due" && due <= 0) return null;
  return { amount: due > 0 ? due : null };
}
