import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link2,
  MessageCircle,
  Pencil,
  Search,
  Share2,
  Trash2,
  CopyPlus,
  ChevronRight,
} from "lucide-react";
import {
  discounted,
  listPriceOf,
  money,
  percent,
  type CatalogueLevel,
  type CatalogueProduct,
  type Quotation,
  type QuotationStatus,
  type QuoteCustomer,
  type SessionInfo,
} from "../../shared";
import { api, errorMessage } from "../api";
import { whatsappLink, withCountry } from "../links";
import { quotationText } from "../quotation";
import { ProductImage } from "../site/site";
import { formatDate } from "../quote-view";
import { Stepper } from "./ui";
import {
  newDraft,
  type AppConfig,
  type Draft,
  type DraftLine,
  type LocalQuote,
} from "./store";

type Pricing = { discount: boolean; price: boolean; maxBp: number };
export function pricingFor(
  level: CatalogueLevel,
  session: SessionInfo,
  config: AppConfig,
): Pricing {
  const admin = session.role === "owner" || session.role === "admin";
  if (level !== "staff") return { discount: false, price: false, maxBp: 0 };
  if (admin) return { discount: true, price: true, maxBp: 10000 };
  if (config.pricingMode === "capped")
    return {
      discount: true,
      price: false,
      maxBp: session.maxDiscountBp ?? config.discountCapBp,
    };
  if (config.pricingMode === "free")
    return { discount: true, price: true, maxBp: 10000 };
  return { discount: false, price: false, maxBp: 0 };
}
/** Mirrors the server: untouched lines take the customer's price-list price. */
const unitOf = (
  l: DraftLine,
  p?: CatalogueProduct,
  list?: QuoteCustomer["priceList"],
) =>
  l.unitPricePaise ??
  (p?.pricePaise == null
    ? null
    : l.discountBp || !list
      ? discounted(p.pricePaise, l.discountBp)
      : listPriceOf(list, p.id, p.pricePaise));
export const loadQuoteCustomer = (id: string) =>
  api<QuoteCustomer>(`/quotation-customers/${encodeURIComponent(id)}`);
const rupees = (paise: number | null) =>
  paise === null ? "" : String(paise / 100);

export function QuoteBuilder({
  draft,
  setDraft,
  setQuantity,
  products,
  demo,
  pricing,
  config,
  level,
  admin,
  onSaved,
  onBrowse,
}: {
  draft: Draft;
  setDraft: (u: (d: Draft) => Draft) => void;
  setQuantity: (id: string, q: number) => void;
  products: CatalogueProduct[];
  demo: boolean;
  pricing: Pricing;
  config: AppConfig;
  level: CatalogueLevel;
  /** Only owners and admins link saved customers (and their price lists). */
  admin: boolean;
  onSaved: (q: Quotation) => void;
  onBrowse: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allBp, setAllBp] = useState("");
  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const lines = draft.lines.map((l) => ({
    line: l,
    product: byId.get(l.productId),
  }));
  const missing = lines.filter((l) => !l.product).length;
  const list = draft.customer?.priceList;
  const amounts = lines.map(({ line, product }) => {
    const unit = unitOf(line, product, list);
    return unit === null ? null : unit * line.quantity;
  });
  const total = amounts.some((a) => a === null)
    ? null
    : amounts.reduce((n, a) => n! + a!, 0);
  const mrp = lines.some(({ product }) => product?.pricePaise == null)
    ? null
    : lines.reduce(
        (n, { line, product }) => n + product!.pricePaise! * line.quantity,
        0,
      );
  const update = (productId: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.productId === productId ? { ...l, ...patch } : l,
      ),
    }));
  const field = (
    key:
      | "customerName"
      | "customerPhone"
      | "customerPlace"
      | "notes"
      | "validUntil",
  ) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  if (!draft.lines.length && !draft.editing)
    return (
      <section className="screen empty-quote">
        <FileText size={40} aria-hidden="true" />
        <h1>Start a quotation</h1>
        <p className="muted">
          Search or scan products in the catalogue and tap Add. Your draft is
          saved on this device as you work.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onBrowse}
        >
          <Search size={18} aria-hidden="true" /> Browse catalogue
        </button>
      </section>
    );

  async function save() {
    setError("");
    if (!draft.customerName.trim()) return setError("Enter the customer name.");
    if (missing)
      return setError("Remove products that are no longer available.");
    setSaving(true);
    try {
      const body = {
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        customerPlace: draft.customerPlace,
        customerId: draft.customer?.id ?? null,
        notes: draft.notes,
        validUntil: draft.validUntil,
        items: draft.lines,
      };
      const saved = draft.editing
        ? await api<Quotation>(
            `/quotations/${draft.editing.id}`,
            { ...body, revision: draft.editing.revision },
            "PUT",
          )
        : await api<Quotation>(
            "/quotations",
            { ...body, id: draft.id },
            "POST",
          );
      setDraft(() => newDraft(config.quoteValidityDays));
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen quote-builder" aria-labelledby="quote-title">
      <header className="screen-head">
        <h1 id="quote-title">
          {draft.editing ? `Revise ${draft.editing.number}` : "New quotation"}
        </h1>
        <button
          type="button"
          className="text-btn danger"
          onClick={() => {
            if (
              confirm(
                draft.editing
                  ? "Discard changes to this quotation?"
                  : "Clear this quotation?",
              )
            )
              setDraft(() => newDraft(config.quoteValidityDays));
          }}
        >
          {draft.editing ? "Cancel revision" : "Clear"}
        </button>
      </header>

      <fieldset className="card form-card">
        <legend>Customer</legend>
        {admin && (
          <SavedCustomer
            customer={draft.customer ?? null}
            onPick={(customer) =>
              setDraft((d) => ({
                ...d,
                customer,
                customerName: customer?.name ?? d.customerName,
                customerPhone: customer?.phone ?? d.customerPhone,
                customerPlace:
                  (customer && d.customerPlace) || customer?.address || "",
              }))
            }
          />
        )}
        <label>
          Name
          <input
            {...field("customerName")}
            maxLength={120}
            autoComplete="off"
            required
          />
        </label>
        <div className="field-row">
          <label>
            Phone
            <input
              {...field("customerPhone")}
              type="tel"
              inputMode="tel"
              maxLength={25}
              autoComplete="off"
            />
          </label>
          <label>
            Place / site
            <input
              {...field("customerPlace")}
              maxLength={120}
              autoComplete="off"
            />
          </label>
        </div>
      </fieldset>

      <div className="card lines-card">
        <div className="card-head">
          <h2>
            Products <span className="muted">· {draft.lines.length}</span>
          </h2>
          <button type="button" className="text-btn" onClick={onBrowse}>
            + Add more
          </button>
        </div>
        {pricing.discount && draft.lines.length > 1 && (
          <form
            className="apply-all"
            onSubmit={(e) => {
              e.preventDefault();
              const bp = Math.round(Number(allBp) * 100);
              if (!Number.isFinite(bp) || bp < 0 || bp > pricing.maxBp) return;
              setDraft((d) => ({
                ...d,
                lines: d.lines.map((l) => ({
                  ...l,
                  discountBp: bp,
                  unitPricePaise: null,
                })),
              }));
            }}
          >
            <label>
              Discount on all lines (%)
              <input
                inputMode="decimal"
                value={allBp}
                onChange={(e) => setAllBp(e.target.value)}
                placeholder={`Up to ${pricing.maxBp / 100}`}
              />
            </label>
            <button className="btn btn-ghost btn-sm">Apply</button>
          </form>
        )}
        <ul className="quote-lines">
          {lines.map(({ line, product }) => {
            const unit = unitOf(line, product, list);
            return (
              <li key={line.productId} className={product ? "" : "unavailable"}>
                {product ? (
                  <>
                    <div className="line-thumb">
                      <ProductImage
                        product={product}
                        demo={demo}
                        sizes="64px"
                      />
                    </div>
                    <div className="line-main">
                      <strong>{product.name}</strong>
                      <span className="muted">
                        {product.code} · MRP {money(product.pricePaise)}
                      </span>
                      <div className="line-controls">
                        <Stepper
                          compact
                          value={line.quantity}
                          label={`Quantity of ${product.code}`}
                          onChange={(n) =>
                            setQuantity(line.productId, Math.max(1, n))
                          }
                        />
                        {pricing.discount && product.pricePaise !== null && (
                          <label className="mini-field">
                            <span>Disc %</span>
                            <input
                              inputMode="decimal"
                              aria-label={`Discount percent for ${product.code}`}
                              value={
                                line.unitPricePaise === null
                                  ? String(line.discountBp / 100)
                                  : ""
                              }
                              placeholder={
                                line.unitPricePaise === null ? "0" : "—"
                              }
                              onChange={(e) => {
                                const bp = Math.round(
                                  Number(e.target.value || 0) * 100,
                                );
                                if (Number.isFinite(bp))
                                  update(line.productId, {
                                    discountBp: Math.max(
                                      0,
                                      Math.min(pricing.maxBp, bp),
                                    ),
                                    unitPricePaise: null,
                                  });
                              }}
                            />
                          </label>
                        )}
                        {pricing.price && (
                          <label className="mini-field">
                            <span>Price ₹</span>
                            <input
                              inputMode="decimal"
                              aria-label={`Unit price for ${product.code}`}
                              value={
                                line.unitPricePaise === null
                                  ? ""
                                  : rupees(line.unitPricePaise)
                              }
                              placeholder={unit === null ? "Set" : rupees(unit)}
                              onChange={(e) => {
                                const value = e.target.value.trim();
                                const paise = Math.round(Number(value) * 100);
                                update(line.productId, {
                                  discountBp: 0,
                                  unitPricePaise:
                                    value === "" || !Number.isFinite(paise)
                                      ? null
                                      : Math.min(
                                          paise,
                                          product.pricePaise ?? paise,
                                        ),
                                });
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="line-amount">
                      <strong>
                        {unit === null
                          ? "On request"
                          : money(unit * line.quantity)}
                      </strong>
                      {line.discountBp > 0 ? (
                        <span className="accent">
                          −{percent(line.discountBp)}
                        </span>
                      ) : (
                        list &&
                        line.unitPricePaise === null &&
                        unit !== product.pricePaise && (
                          <span className="accent">{list.name}</span>
                        )
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${product.code}`}
                        onClick={() => setQuantity(line.productId, 0)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="line-main">
                    <strong>Product no longer available</strong>
                    <button
                      type="button"
                      className="text-btn danger"
                      onClick={() => setQuantity(line.productId, 0)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <details className="card form-card">
        <summary>Validity and notes</summary>
        <label>
          Valid until
          <input type="date" {...field("validUntil")} />
        </label>
        <label>
          Notes for the customer
          <textarea rows={3} maxLength={2000} {...field("notes")} />
        </label>
        {config.quoteTerms && (
          <p className="fine-print">Terms: {config.quoteTerms}</p>
        )}
      </details>
      {level !== "staff" && (
        <p className="fine-print">
          Quotations from this device use MRP. Sign in for team pricing.
        </p>
      )}

      <div className="checkout-bar">
        <div>
          {mrp !== null && total !== null && mrp !== total && (
            <span className="muted strike">{money(mrp)}</span>
          )}
          <strong>{total === null ? "Total on request" : money(total)}</strong>
          <span className="muted">
            {draft.lines.reduce((n, l) => n + l.quantity, 0)} units
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={saving}
          onClick={save}
        >
          {saving
            ? "Saving…"
            : draft.editing
              ? "Save revision"
              : "Save & share"}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const statusLabel: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
};

/** Links the quotation to a saved customer so their price list applies. */
function SavedCustomer({
  customer,
  onPick,
}: {
  customer: QuoteCustomer | null;
  onPick: (c: QuoteCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<
    { id: string; name: string; phone: string; list: string | null }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      api<typeof found>(`/quotation-customers?q=${encodeURIComponent(q)}`)
        .then(setFound)
        .catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  if (customer)
    return (
      <p className="saved-customer">
        Saved customer: <strong>{customer.name}</strong>
        {customer.priceList
          ? ` · price list ${customer.priceList.name}`
          : " · MRP"}{" "}
        <button type="button" className="text-btn" onClick={() => onPick(null)}>
          Unlink
        </button>
      </p>
    );
  return (
    <div className="saved-customer">
      <label>
        Saved customer (optional)
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setError("");
            setQuery(e.target.value);
          }}
          placeholder="Search by name or phone"
          autoComplete="off"
        />
      </label>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {query.trim().length >= 2 && found.length > 0 && (
        <ul className="customer-results">
          {found.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  loadQuoteCustomer(c.id)
                    .then((full) => {
                      setQuery("");
                      setFound([]);
                      onPick(full);
                    })
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                {c.name}
                {c.phone && ` · ${c.phone}`}
                {c.list && ` · ${c.list}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuoteDetail({
  quote,
  staff,
  canEdit,
  onBack,
  onChange,
  onRevise,
  onDuplicate,
  notify,
}: {
  quote: Quotation;
  staff: boolean;
  canEdit: boolean;
  onBack: () => void;
  onChange: (q: Quotation) => void;
  onRevise: () => void;
  onDuplicate: () => void;
  notify: (m: string) => void;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const link = `${location.origin}/q/${quote.shareToken}`;
  const text = quotationText(quote, link);
  async function markSent() {
    if (!canEdit || quote.status !== "draft") return;
    try {
      onChange(
        await api<Quotation>(
          `/quotations/${quote.id}`,
          { status: "sent", revision: quote.revision },
          "PATCH",
        ),
      );
    } catch {
      /* Status can be set manually. */
    }
  }
  async function setStatus(status: QuotationStatus) {
    try {
      onChange(
        await api<Quotation>(
          `/quotations/${quote.id}`,
          { status, revision: quote.revision },
          "PATCH",
        ),
      );
      notify(`Marked ${statusLabel[status].toLowerCase()}`);
    } catch (e) {
      notify(errorMessage(e));
    }
  }
  async function sharePdf() {
    setPdfBusy(true);
    try {
      const { quotationPdf } = await import("../quotation");
      const file = await quotationPdf(quote);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Quotation ${quote.number}`,
        });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      void markSent();
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") notify(errorMessage(e));
    } finally {
      setPdfBusy(false);
    }
  }
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`);
      void markSent();
    } catch {
      notify("Copy is not available in this browser.");
    }
  };
  return (
    <section className="screen quote-detail" aria-labelledby="detail-title">
      <header className="screen-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back to quotations"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 id="detail-title">{quote.number}</h1>
          <p className="muted">
            {quote.customerName}
            {quote.customerPlace && ` · ${quote.customerPlace}`}
          </p>
        </div>
        <span className={`pill pill-${quote.status}`}>
          {statusLabel[quote.status]}
        </span>
      </header>

      <div className="share-panel card">
        <h2>Share</h2>
        <a
          className="btn btn-whatsapp btn-lg wide"
          href={whatsappLink(text)}
          target="_blank"
          rel="noopener"
          onClick={() => void markSent()}
        >
          <MessageCircle size={20} aria-hidden="true" /> Send on WhatsApp
        </a>
        <p className="fine-print center">
          Choose any chat in WhatsApp. The message includes the quotation link.
        </p>
        <div className="share-grid">
          {quote.customerPhone && (
            <a
              className="share-tile"
              href={whatsappLink(text, withCountry(quote.customerPhone))}
              target="_blank"
              rel="noopener"
              onClick={() => void markSent()}
            >
              <MessageCircle size={20} aria-hidden="true" />
              Customer’s WhatsApp
            </a>
          )}
          <button
            type="button"
            className="share-tile"
            disabled={pdfBusy}
            onClick={sharePdf}
          >
            {typeof navigator !== "undefined" && "canShare" in navigator ? (
              <Share2 size={20} aria-hidden="true" />
            ) : (
              <Download size={20} aria-hidden="true" />
            )}
            {pdfBusy ? "Preparing…" : "Share PDF"}
          </button>
          <button
            type="button"
            className="share-tile"
            onClick={() => copy(link, "Link")}
          >
            <Link2 size={20} aria-hidden="true" /> Copy link
          </button>
          <button
            type="button"
            className="share-tile"
            onClick={() => copy(text, "Quotation text")}
          >
            <Copy size={20} aria-hidden="true" /> Copy text
          </button>
          <a
            className="share-tile"
            href={`/q/${quote.shareToken}`}
            target="_blank"
            rel="noopener"
          >
            <ExternalLink size={20} aria-hidden="true" /> Open / print
          </a>
        </div>
      </div>

      {staff && canEdit && (
        <div className="card">
          <h2>Status</h2>
          <div
            className="segmented wide"
            role="group"
            aria-label="Quotation status"
          >
            {(Object.keys(statusLabel) as QuotationStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={quote.status === s}
                onClick={() => quote.status !== s && setStatus(s)}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Summary</h2>
        <ul className="summary-lines">
          {quote.items.map((l) => (
            <li key={l.productId}>
              <span>
                <strong>{l.name}</strong>
                <small className="muted">
                  {l.code} · {l.quantity} {l.unit}
                  {l.discountBp > 0 && ` · −${percent(l.discountBp)}`}
                </small>
              </span>
              <span>
                {l.amountPaise === null ? "On request" : money(l.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
        <div className="summary-total">
          <span>Total</span>
          <strong>
            {quote.totalPaise === null
              ? "To be confirmed"
              : money(quote.totalPaise)}
          </strong>
        </div>
        <p className="fine-print">
          Valid until {formatDate(quote.validUntil)} · Revision {quote.version}{" "}
          · Prepared by {quote.createdByName}
        </p>
      </div>

      <div className="detail-actions">
        {staff && canEdit && (
          <button type="button" className="btn btn-ghost" onClick={onRevise}>
            <Pencil size={18} aria-hidden="true" /> Revise
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDuplicate}>
          <CopyPlus size={18} aria-hidden="true" /> Duplicate
        </button>
      </div>
    </section>
  );
}

export function QuoteList({
  staff,
  local,
  onOpen,
}: {
  staff: boolean;
  local: LocalQuote[];
  onOpen: (q: { id: string; shareToken: string }) => void;
}) {
  const [quotes, setQuotes] = useState<Quotation[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<QuotationStatus | "">("");
  useEffect(() => {
    if (!staff) return;
    api<Quotation[]>("/quotations")
      .then(setQuotes)
      .catch((e) => setError(errorMessage(e)));
  }, [staff]);
  const rows = (
    staff
      ? (quotes ?? []).map((q) => ({ ...q }))
      : local.map((q) => ({
          ...q,
          status: "sent" as QuotationStatus,
          customerPlace: "",
        }))
  ).filter(
    (q) =>
      (!status || q.status === status) &&
      `${q.number} ${q.customerName} ${q.customerPlace}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="screen" aria-labelledby="quotes-title">
      <header className="screen-head">
        <h1 id="quotes-title">My quotations</h1>
      </header>
      <form
        className="search"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search number or customer"
          aria-label="Search quotations"
        />
      </form>
      {staff && (
        <nav className="chip-row" aria-label="Filter by status">
          <button
            type="button"
            className="chip"
            aria-pressed={!status}
            onClick={() => setStatus("")}
          >
            All
          </button>
          {(Object.keys(statusLabel) as QuotationStatus[]).map((s) => (
            <button
              type="button"
              key={s}
              className="chip"
              aria-pressed={status === s}
              onClick={() => setStatus(status === s ? "" : s)}
            >
              {statusLabel[s]}
            </button>
          ))}
        </nav>
      )}
      {error && <p className="banner error">{error}</p>}
      {staff && quotes === null && !error && <p className="muted">Loading…</p>}
      {!rows.length && (staff ? quotes !== null : true) && (
        <p className="empty-state">
          {query || status
            ? "No quotations match."
            : "Quotations you save appear here."}
        </p>
      )}
      <ul className="quote-list">
        {rows.map((q) => (
          <li key={q.id}>
            <button type="button" onClick={() => onOpen(q)}>
              <span className="quote-list-main">
                <strong>{q.customerName}</strong>
                <span className="muted">
                  {q.number} · {formatDate(q.createdAt)} · {q.itemCount}{" "}
                  {q.itemCount === 1 ? "product" : "products"}
                </span>
              </span>
              <span className="quote-list-side">
                <strong>
                  {q.totalPaise === null ? "—" : money(q.totalPaise)}
                </strong>
                {staff && (
                  <span className={`pill pill-${q.status}`}>
                    {statusLabel[q.status]}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Converts a saved quotation back into editable draft lines. */
export function linesFrom(q: Quotation): DraftLine[] {
  return q.items.map((l) => {
    const custom =
      l.unitPricePaise !== null &&
      (l.mrpPaise === null ||
        discounted(l.mrpPaise, l.discountBp) !== l.unitPricePaise);
    return {
      productId: l.productId,
      quantity: l.quantity,
      discountBp: custom ? 0 : l.discountBp,
      unitPricePaise: custom ? l.unitPricePaise : null,
    };
  });
}
