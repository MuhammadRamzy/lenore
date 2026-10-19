import { money, percent, type Quotation } from "../shared";
import { business, addressLine } from "../business";

export const formatDate = (iso: string) =>
  new Date(
    iso.length === 10 ? `${iso}T00:00:00+05:30` : iso,
  ).toLocaleDateString(
    "en-IN",
    // Fixed zone keeps server-rendered and hydrated output identical.
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    },
  );

/** Printable quotation body shared by the customer link page and the sales app. */
export function QuoteDocument({ quote }: { quote: Quotation }) {
  const discounted = quote.items.some((l) => l.discountBp > 0);
  return (
    <article className="quote-doc" aria-label={`Quotation ${quote.number}`}>
      <header className="quote-doc-head">
        <div className="quote-doc-brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <strong>LENORE</strong>
            <span>{business.legalName}</span>
          </div>
        </div>
        <dl className="quote-doc-meta">
          <div>
            <dt>Quotation</dt>
            <dd>{quote.number}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(quote.createdAt)}</dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{formatDate(quote.validUntil)}</dd>
          </div>
          {quote.version > 1 && (
            <div>
              <dt>Revision</dt>
              <dd>{quote.version}</dd>
            </div>
          )}
        </dl>
      </header>
      <section className="quote-doc-parties">
        <div>
          <h2>Prepared for</h2>
          <p>
            <strong>{quote.customerName}</strong>
            {quote.customerPlace && <span>{quote.customerPlace}</span>}
            {quote.customerPhone && <span>{quote.customerPhone}</span>}
          </p>
        </div>
        <div>
          <h2>Prepared by</h2>
          <p>
            <strong>{quote.createdByName}</strong>
            {quote.createdByPhone && <span>+{quote.createdByPhone}</span>}
            <span>{business.phoneDisplay}</span>
          </p>
        </div>
      </section>
      <table className="quote-doc-lines">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              MRP
            </th>
            {discounted && (
              <th scope="col" className="num">
                Discount
              </th>
            )}
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((l) => (
            <tr key={l.productId}>
              <td>
                <strong>{l.name}</strong>
                <small>{l.code}</small>
              </td>
              <td className="num" data-label="Qty">
                {l.quantity} {l.unit}
              </td>
              <td className="num" data-label="MRP">
                {money(l.mrpPaise)}
              </td>
              {discounted && (
                <td className="num" data-label="Discount">
                  {l.discountBp ? percent(l.discountBp) : "—"}
                </td>
              )}
              <td className="num" data-label="Amount">
                {l.amountPaise === null
                  ? "To be confirmed"
                  : money(l.amountPaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="quote-doc-totals">
        {quote.discountPaise !== null && quote.discountPaise > 0 && (
          <>
            <div>
              <dt>MRP total</dt>
              <dd>{money(quote.mrpTotalPaise)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>− {money(quote.discountPaise)}</dd>
            </div>
          </>
        )}
        <div className="grand">
          <dt>Total</dt>
          <dd>
            {quote.totalPaise === null
              ? "To be confirmed"
              : money(quote.totalPaise)}
          </dd>
        </div>
      </dl>
      {quote.notes && (
        <section className="quote-doc-notes">
          <h2>Notes</h2>
          <p>{quote.notes}</p>
        </section>
      )}
      <footer className="quote-doc-foot">
        {quote.terms && <p>{quote.terms}</p>}
        <p>
          {business.legalName} · {addressLine} · GSTIN {business.gstin} ·{" "}
          {business.phoneDisplay} · {business.email}
        </p>
      </footer>
    </article>
  );
}
