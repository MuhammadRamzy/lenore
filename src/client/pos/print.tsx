import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { business, addressLine } from "../../business";
import {
  gstStates,
  invoiceDue,
  methodLabel,
  type Invoice,
  type PaymentDetails,
} from "../../erp";
import { money } from "../../shared";
import { billQr, UpiQr } from "./qr";
import markUrl from "./lenore-mark-print.png";
import "./documents.css";
import type { ShiftSummary } from "./store";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
function words(n: number): string {
  if (n < 20) return ones[n];
  if (n < 100)
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  if (n < 1000)
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
  for (const [size, name] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ] as const)
    if (n >= size)
      return `${words(Math.floor(n / size))} ${name}${n % size ? ` ${words(n % size)}` : ""}`;
  return "";
}
/** Indian-system amount in words for tax invoices. */
export function amountInWords(paise: number) {
  const rupees = Math.floor(paise / 100),
    p = paise % 100;
  return `Rupees ${rupees ? words(rupees) : "Zero"}${p ? ` and ${words(p)} Paise` : ""} Only`;
}
const stateName = (code: string) =>
  gstStates.find(([c]) => c === code)?.[1] ?? code;

/**
 * The document to print, mounted directly under <body> so printing can drop
 * the whole app with display:none (no blank pages from hidden layout).
 */
export function PrintArea({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="print-area" aria-hidden="true">
      {children}
    </div>,
    document.body,
  );
}

/** Logo mark; small enough that Vite inlines it, so offline printing never waits on a network. */
function Mark({ height }: { height: number }) {
  return (
    <img
      className="doc-mark"
      src={markUrl}
      alt=""
      height={height}
      width={Math.round((height * 92) / 128)}
    />
  );
}
const paymentLabel = (method: string) =>
  methodLabel[method as keyof typeof methodLabel] ?? method;
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
/** Savings against MRP across the bill (discounts and special prices). */
const savings = (invoice: Invoice) =>
  invoice.lines.reduce(
    (n, l) => n + (l.mrp === null ? 0 : Math.max(0, l.mrp * l.qty - l.total)),
    0,
  );
/** GST by rate, as shown in the tax summary. */
function taxByRate(invoice: Invoice) {
  const rates = new Map<
    number,
    { taxable: number; cgst: number; sgst: number; igst: number }
  >();
  for (const l of invoice.lines) {
    const r = rates.get(l.gstRateBp) ?? {
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    r.taxable += l.taxable;
    r.cgst += l.cgst;
    r.sgst += l.sgst;
    r.igst += l.igst;
    rates.set(l.gstRateBp, r);
  }
  return [...rates].sort(([a], [b]) => a - b);
}

/** 80 mm thermal receipt. */
export function Receipt({
  invoice,
  footer,
  pending,
  payment,
}: {
  invoice: Invoice;
  footer: string;
  pending?: boolean;
  payment?: PaymentDetails;
}) {
  const qr = billQr(invoice, payment);
  const due = invoiceDue(invoice);
  const saved = savings(invoice);
  const qty = invoice.lines.reduce((n, l) => n + l.qty, 0);
  const igst = invoice.igst > 0;
  return (
    <div className="receipt">
      <header className="receipt-head">
        <Mark height={44} />
        <div className="receipt-brand">LENORE</div>
        <div className="receipt-tagline">{business.tagline}</div>
        <div className="receipt-seller">
          <strong>{business.legalName}</strong>
          <div>{addressLine}</div>
          <div>Ph {business.phoneDisplay}</div>
          <div>GSTIN {business.gstin}</div>
        </div>
      </header>
      <div className="receipt-title">
        {invoice.status === "cancelled" ? "CANCELLED INVOICE" : "TAX INVOICE"}
      </div>
      <dl className="receipt-meta">
        <div>
          <dt>Bill no</dt>
          <dd>{invoice.number}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{when(invoice.createdAt)}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{invoice.customer.name}</dd>
        </div>
        {invoice.customer.phone && (
          <div>
            <dt>Phone</dt>
            <dd>{invoice.customer.phone}</dd>
          </div>
        )}
        {invoice.customer.gstin && (
          <div>
            <dt>GSTIN</dt>
            <dd>{invoice.customer.gstin}</dd>
          </div>
        )}
        <div>
          <dt>Cashier</dt>
          <dd>{invoice.cashier}</dd>
        </div>
      </dl>
      <div className="receipt-items">
        <div className="receipt-cols">
          <span>Item</span>
          <span>Amount</span>
        </div>
        {invoice.lines.map((l) => (
          <div key={l.lineNo} className="receipt-item">
            <div className="receipt-item-name">{l.name}</div>
            <div className="row">
              <span>
                {l.qty} {l.unit} × {money(l.rate)}
              </span>
              {l.discount > 0 ? (
                <span>{money(l.total + l.discount)}</span>
              ) : (
                <strong>{money(l.total)}</strong>
              )}
            </div>
            {l.discount > 0 && (
              <>
                <div className="row">
                  <span>Discount</span>
                  <span>−{money(l.discount)}</span>
                </div>
                <div className="row strong">
                  <span>Item total</span>
                  <span>{money(l.total)}</span>
                </div>
              </>
            )}
            <div className="muted">
              {l.code} · HSN {l.hsn || "—"} · GST {pct(l.gstRateBp)}
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-sums">
        <div className="row muted">
          <span>
            {invoice.lines.length}{" "}
            {invoice.lines.length === 1 ? "item" : "items"} · qty {qty}
          </span>
        </div>
        <div className="row">
          <span>Taxable value</span>
          <span>{money(invoice.taxable)}</span>
        </div>
        {igst ? (
          <div className="row">
            <span>IGST</span>
            <span>{money(invoice.igst)}</span>
          </div>
        ) : (
          <>
            <div className="row">
              <span>CGST</span>
              <span>{money(invoice.cgst)}</span>
            </div>
            <div className="row">
              <span>SGST</span>
              <span>{money(invoice.sgst)}</span>
            </div>
          </>
        )}
        {invoice.roundOff !== 0 && (
          <div className="row">
            <span>Round off</span>
            <span>{money(invoice.roundOff)}</span>
          </div>
        )}
      </div>
      <div className="receipt-total">
        <span>TOTAL</span>
        <span>{money(invoice.total)}</span>
      </div>
      <div className="receipt-pays">
        {invoice.payments
          .filter((p) => p.kind === "sale")
          .map((p) => (
            <div className="row" key={p.id}>
              <span>Paid · {paymentLabel(p.method)}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
        {invoice.credited > 0 && (
          <div className="row">
            <span>Returns credited</span>
            <span>−{money(invoice.credited)}</span>
          </div>
        )}
        {due > 0 && (
          <div className="row strong">
            <span>Balance due</span>
            <span>{money(due)}</span>
          </div>
        )}
      </div>
      {saved > 0 && (
        <div className="receipt-saved">You saved {money(saved)} on MRP</div>
      )}
      {qr && (
        <div className="receipt-qr">
          <UpiQr
            payment={payment}
            amount={qr.amount}
            note={invoice.number}
            size={150}
          />
        </div>
      )}
      <footer className="receipt-foot">
        <div>{footer}</div>
        <div className="muted">Prices are inclusive of GST.</div>
        {pending && (
          <div className="muted">Recorded offline · synced when online</div>
        )}
        <div className="receipt-thanks">Thank you · Visit again</div>
        <div className="muted">{business.origin.replace("https://", "")}</div>
      </footer>
    </div>
  );
}

/** A4 GST tax invoice. */
export function TaxInvoice({
  invoice,
  payment,
}: {
  invoice: Invoice;
  payment?: PaymentDetails;
}) {
  const igst = invoice.igst > 0;
  const qr = billQr(invoice, payment);
  const bank = payment?.bankOnInvoice && payment.bankAccount ? payment : null;
  const due = invoiceDue(invoice);
  const paid = invoice.paid - invoice.refunded;
  const rates = taxByRate(invoice);
  const saved = savings(invoice);
  return (
    <div
      className={`a4-invoice${invoice.status === "cancelled" ? " cancelled" : ""}`}
    >
      <header className="inv-head">
        <div className="inv-brand">
          <Mark height={56} />
          <div>
            <div className="inv-wordmark">LENORE</div>
            <div className="inv-tagline">{business.tagline}</div>
          </div>
        </div>
        <div className="inv-title">
          <h1>Tax Invoice</h1>
          <div>Original for recipient</div>
        </div>
      </header>
      <section className="inv-parties">
        <div>
          <h2>Sold by</h2>
          <strong>{business.legalName}</strong>
          <div>{addressLine}</div>
          <div>
            {business.phoneDisplay} · {business.email}
          </div>
          <div>GSTIN {business.gstin}</div>
          <div>State: Kerala (32)</div>
        </div>
        <div>
          <h2>Bill to</h2>
          <strong>{invoice.customer.name}</strong>
          {invoice.customer.address && <div>{invoice.customer.address}</div>}
          {invoice.customer.phone && <div>{invoice.customer.phone}</div>}
          {invoice.customer.gstin && <div>GSTIN {invoice.customer.gstin}</div>}
          <div>
            State: {stateName(invoice.customer.stateCode)} (
            {invoice.customer.stateCode})
          </div>
        </div>
        <dl>
          <div>
            <dt>Invoice no</dt>
            <dd>{invoice.number}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{invoice.date.split("-").reverse().join("-")}</dd>
          </div>
          <div>
            <dt>Place of supply</dt>
            <dd>
              {stateName(invoice.placeOfSupply)} ({invoice.placeOfSupply})
            </dd>
          </div>
          <div>
            <dt>Reverse charge</dt>
            <dd>No</dd>
          </div>
          <div>
            <dt>Prepared by</dt>
            <dd>{invoice.cashier}</dd>
          </div>
        </dl>
      </section>
      <table className="inv-items">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Item</th>
            <th>HSN</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Disc.</th>
            <th className="num">Taxable</th>
            <th className="num">GST</th>
            {igst ? (
              <th className="num">IGST</th>
            ) : (
              <>
                <th className="num">CGST</th>
                <th className="num">SGST</th>
              </>
            )}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l) => (
            <tr key={l.lineNo}>
              <td className="num">{l.lineNo}</td>
              <td>
                <strong>{l.name}</strong>
                <small>
                  {l.code}
                  {l.mrp !== null &&
                    l.mrp !== l.rate &&
                    ` · MRP ${money(l.mrp)}`}
                </small>
              </td>
              <td>{l.hsn || "—"}</td>
              <td className="num">
                {l.qty} {l.unit}
              </td>
              <td className="num">{money(l.rate)}</td>
              <td className="num">{l.discount ? money(l.discount) : "—"}</td>
              <td className="num">{money(l.taxable)}</td>
              <td className="num">{pct(l.gstRateBp)}</td>
              {igst ? (
                <td className="num">{money(l.igst)}</td>
              ) : (
                <>
                  <td className="num">{money(l.cgst)}</td>
                  <td className="num">{money(l.sgst)}</td>
                </>
              )}
              <td className="num">
                <strong>{money(l.total)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="inv-summary">
        <div className="inv-summary-left">
          <table className="inv-tax">
            <thead>
              <tr>
                <th>GST rate</th>
                <th className="num">Taxable</th>
                {igst ? (
                  <th className="num">IGST</th>
                ) : (
                  <>
                    <th className="num">CGST</th>
                    <th className="num">SGST</th>
                  </>
                )}
                <th className="num">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {rates.map(([bp, r]) => (
                <tr key={bp}>
                  <td>{pct(bp)}</td>
                  <td className="num">{money(r.taxable)}</td>
                  {igst ? (
                    <td className="num">{money(r.igst)}</td>
                  ) : (
                    <>
                      <td className="num">{money(r.cgst)}</td>
                      <td className="num">{money(r.sgst)}</td>
                    </>
                  )}
                  <td className="num">{money(r.cgst + r.sgst + r.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="inv-words">
            <span>Amount in words</span>
            {amountInWords(invoice.total)}
          </p>
          {saved > 0 && (
            <p className="inv-saved">You saved {money(saved)} on MRP.</p>
          )}
        </div>
        <div className="inv-totals">
          <div>
            <span>Taxable value</span>
            <span>{money(invoice.taxable)}</span>
          </div>
          {igst ? (
            <div>
              <span>IGST</span>
              <span>{money(invoice.igst)}</span>
            </div>
          ) : (
            <>
              <div>
                <span>CGST</span>
                <span>{money(invoice.cgst)}</span>
              </div>
              <div>
                <span>SGST</span>
                <span>{money(invoice.sgst)}</span>
              </div>
            </>
          )}
          <div>
            <span>Round off</span>
            <span>{money(invoice.roundOff)}</span>
          </div>
          <div className="inv-grand">
            <span>Invoice total</span>
            <span>{money(invoice.total)}</span>
          </div>
          {paid > 0 && (
            <div>
              <span>Received</span>
              <span>{money(paid)}</span>
            </div>
          )}
          {invoice.credited > 0 && (
            <div>
              <span>Returns credited</span>
              <span>−{money(invoice.credited)}</span>
            </div>
          )}
          <div className={due > 0 ? "inv-due" : ""}>
            <span>Balance due</span>
            <span>{money(due)}</span>
          </div>
        </div>
      </section>
      {(bank || qr) && (
        <section className="inv-pay">
          {bank && (
            <div>
              <h2>Bank details</h2>
              <dl>
                <div>
                  <dt>Account name</dt>
                  <dd>{bank.bankAccountName || business.legalName}</dd>
                </div>
                <div>
                  <dt>Bank</dt>
                  <dd>
                    {bank.bankName}
                    {bank.bankBranch && `, ${bank.bankBranch}`}
                  </dd>
                </div>
                <div>
                  <dt>Account no</dt>
                  <dd>{bank.bankAccount}</dd>
                </div>
                <div>
                  <dt>IFSC</dt>
                  <dd>{bank.bankIfsc}</dd>
                </div>
                {bank.upiId && (
                  <div>
                    <dt>UPI</dt>
                    <dd>{bank.upiId}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {qr && (
            <UpiQr
              payment={payment}
              amount={qr.amount}
              note={invoice.number}
              size={112}
            />
          )}
        </section>
      )}
      <footer className="inv-foot">
        <div className="inv-terms">
          <h2>Terms</h2>
          <ol>
            <li>Prices are inclusive of GST.</li>
            <li>Goods once sold are exchanged only with this invoice.</li>
          </ol>
        </div>
        <div className="inv-sign">
          <div>For {business.legalName}</div>
          <div className="inv-sign-space" />
          <div>Authorised signatory</div>
        </div>
      </footer>
      <p className="inv-note">
        Computer-generated invoice · {business.origin.replace("https://", "")} ·{" "}
        {business.phoneDisplay}
      </p>
    </div>
  );
}

export function ZReport({ shift }: { shift: ShiftSummary }) {
  const variance =
    shift.countedCash === null ? null : shift.countedCash - shift.expectedCash;
  return (
    <div className="receipt">
      <div className="center">
        <strong className="big">LENORE</strong>
        <strong>
          {shift.closedAt ? "SHIFT CLOSE (Z)" : "SHIFT SUMMARY (X)"}
        </strong>
      </div>
      <div>
        Opened {when(shift.openedAt)} · {shift.openedBy}
      </div>
      {shift.closedAt && <div>Closed {when(shift.closedAt)}</div>}
      <div className="rule" />
      <div className="row">
        <span>Bills</span>
        <span>
          {shift.invoices.n} · {money(shift.invoices.total)}
        </span>
      </div>
      {shift.byMethod.map((m) => (
        <div className="row" key={m.method + m.kind}>
          <span>
            {methodLabel[m.method as keyof typeof methodLabel] ?? m.method}{" "}
            {m.kind}
          </span>
          <span>
            {m.kind === "refund" ? "−" : ""}
            {money(m.amount)}
          </span>
        </div>
      ))}
      <div className="rule" />
      <div className="row">
        <span>Opening float</span>
        <span>{money(shift.openingFloat)}</span>
      </div>
      {shift.cashMovements.map((m) => (
        <div className="row" key={m.id}>
          <span>
            Cash {m.kind} · {m.reason}
          </span>
          <span>
            {m.kind === "out" ? "−" : ""}
            {money(m.amount)}
          </span>
        </div>
      ))}
      {shift.expensesPaid > 0 && (
        <div className="row">
          <span>Expenses from drawer</span>
          <span>−{money(shift.expensesPaid)}</span>
        </div>
      )}
      <div className="row total">
        <span>Expected cash</span>
        <span>{money(shift.expectedCash)}</span>
      </div>
      {shift.countedCash !== null && (
        <>
          <div className="row">
            <span>Counted</span>
            <span>{money(shift.countedCash)}</span>
          </div>
          <div className="row">
            <span>Difference</span>
            <span>{money(variance)}</span>
          </div>
        </>
      )}
    </div>
  );
}
