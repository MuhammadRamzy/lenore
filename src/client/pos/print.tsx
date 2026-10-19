import { business, addressLine } from "../../business";
import { gstStates, methodLabel, type Invoice } from "../../erp";
import { money } from "../../shared";
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

/** 80 mm thermal receipt. */
export function Receipt({
  invoice,
  footer,
  pending,
}: {
  invoice: Invoice;
  footer: string;
  pending?: boolean;
}) {
  const due =
    invoice.total - invoice.credited - invoice.paid + invoice.refunded;
  return (
    <div className="receipt">
      <div className="center">
        <strong className="big">LENORE</strong>
        <div>{business.legalName}</div>
        <div>{addressLine}</div>
        <div>Ph {business.phoneDisplay}</div>
        <div>GSTIN {business.gstin}</div>
        <div className="rule" />
        <strong>TAX INVOICE</strong>
      </div>
      <div className="row">
        <span>{invoice.number}</span>
        <span>{when(invoice.createdAt)}</span>
      </div>
      <div>Customer: {invoice.customer.name}</div>
      {invoice.customer.gstin && <div>GSTIN: {invoice.customer.gstin}</div>}
      <div className="rule" />
      {invoice.lines.map((l) => (
        <div key={l.lineNo} className="item">
          <div>{l.name}</div>
          <div className="row">
            <span>
              {l.qty} × {money(l.rate)}
              {l.discount > 0 && ` − ${money(l.discount)}`}
            </span>
            <span>{money(l.total)}</span>
          </div>
          <div className="muted">
            {l.code} · HSN {l.hsn || "—"} · GST {l.gstRateBp / 100}%
          </div>
        </div>
      ))}
      <div className="rule" />
      <div className="row">
        <span>Taxable value</span>
        <span>{money(invoice.taxable)}</span>
      </div>
      {invoice.igst ? (
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
      <div className="row total">
        <span>TOTAL</span>
        <span>{money(invoice.total)}</span>
      </div>
      {invoice.payments
        .filter((p) => p.kind === "sale")
        .map((p) => (
          <div className="row" key={p.id}>
            <span>
              Paid ·{" "}
              {methodLabel[p.method as keyof typeof methodLabel] ?? p.method}
            </span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
      {due > 0 && (
        <div className="row">
          <span>Balance due</span>
          <span>{money(due)}</span>
        </div>
      )}
      <div className="rule" />
      <div className="center">
        <div>{footer}</div>
        <div>Prices are inclusive of GST.</div>
        {pending && <div>Recorded offline · synced when online</div>}
      </div>
    </div>
  );
}

/** A4 GST tax invoice. */
export function TaxInvoice({ invoice }: { invoice: Invoice }) {
  const igst = invoice.igst > 0;
  return (
    <div className="a4-invoice">
      <header>
        <div>
          <strong className="big">LENORE</strong>
          <div>{business.legalName}</div>
          <div>{addressLine}</div>
          <div>
            {business.phoneDisplay} · {business.email}
          </div>
          <div>GSTIN {business.gstin} · State: Kerala (32)</div>
        </div>
        <div className="right">
          <strong>TAX INVOICE</strong>
          <div>No. {invoice.number}</div>
          <div>Date {invoice.date.split("-").reverse().join("-")}</div>
          <div>
            Place of supply: {stateName(invoice.placeOfSupply)} (
            {invoice.placeOfSupply})
          </div>
        </div>
      </header>
      <section className="party">
        <strong>Bill to</strong>
        <div>{invoice.customer.name}</div>
        {invoice.customer.address && <div>{invoice.customer.address}</div>}
        {invoice.customer.phone && <div>{invoice.customer.phone}</div>}
        {invoice.customer.gstin && <div>GSTIN {invoice.customer.gstin}</div>}
      </section>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>HSN</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Disc.</th>
            <th className="num">Taxable</th>
            <th className="num">GST %</th>
            {igst ? (
              <th className="num">IGST</th>
            ) : (
              <>
                <th className="num">CGST</th>
                <th className="num">SGST</th>
              </>
            )}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l) => (
            <tr key={l.lineNo}>
              <td>{l.lineNo}</td>
              <td>
                {l.name}
                <small>{l.code}</small>
              </td>
              <td>{l.hsn}</td>
              <td className="num">
                {l.qty} {l.unit}
              </td>
              <td className="num">{money(l.rate)}</td>
              <td className="num">{l.discount ? money(l.discount) : "—"}</td>
              <td className="num">{money(l.taxable)}</td>
              <td className="num">{l.gstRateBp / 100}</td>
              {igst ? (
                <td className="num">{money(l.igst)}</td>
              ) : (
                <>
                  <td className="num">{money(l.cgst)}</td>
                  <td className="num">{money(l.sgst)}</td>
                </>
              )}
              <td className="num">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totals">
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
        <div className="grand">
          <span>Invoice total</span>
          <span>{money(invoice.total)}</span>
        </div>
      </div>
      <p className="words">{amountInWords(invoice.total)}</p>
      <footer>
        <p>
          Prices are inclusive of GST. Goods once sold are exchanged only with
          this invoice.
        </p>
        <p className="sign">
          For {business.legalName}
          <br />
          <br />
          Authorised signatory
        </p>
      </footer>
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
