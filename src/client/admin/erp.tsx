import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Paperclip,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { api, errorMessage } from "../api";
import { Overlay } from "../overlay";
import { Sheet } from "../sales/ui";
import { CollectForm, ReturnForm } from "../pos/app";
import { PrintArea, TaxInvoice, ZReport } from "../pos/print";
import { UpiQr } from "../pos/qr";
import type { ShiftSummary } from "../pos/store";
import {
  balanceOf,
  expenseCategories,
  gstStates,
  methodLabel,
  paymentMethods,
  type Customer,
  type Expense,
  type Invoice,
  type PaymentDetails,
  type PaymentMethod,
  type Supplier,
} from "../../erp";
import { money, type Product } from "../../shared";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthStart = () => today().slice(0, 8) + "01";
const toPaise = (v: FormDataEntryValue | string | null) =>
  Math.round(Number(String(v ?? "0").replace(/[₹,\s]/g, "") || 0) * 100);
const csvCell = (v: unknown) => {
  const t = String(v ?? "");
  return `"${(/^[\s]*[=+@-]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const rs = (p: number | null | undefined) => ((p ?? 0) / 100).toFixed(2);
function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((d) => live && (setData(d), setError("")))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}
function DateRange({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <>
      <label>
        From
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
    </>
  );
}
function PanelDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="panel-shade" onClick={onClose}>
        <section
          className={`editor-panel ${wide ? "wide-panel" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2>{title}</h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          {children}
        </section>
      </div>
    </Overlay>
  );
}

/* ───────── Invoices ───────── */
type InvoiceSummary = Omit<Invoice, "lines" | "payments" | "creditNotes">;
export function BillingPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [q, setQ] = useState("");
  const [due, setDue] = useState(false);
  const path = `/admin/erp/invoices?from=${from}&to=${to}&q=${encodeURIComponent(q)}${due ? "&due=1" : ""}`;
  const { data, error, reload } = useLoad<InvoiceSummary[]>(path);
  const [open, setOpen] = useState<Invoice | null>(null);
  const rows = data ?? [];
  const totals = rows.reduce(
    (t, i) => ({
      total: t.total + i.total - i.credited,
      due: t.due + Math.max(0, balanceOf(i)),
    }),
    { total: 0, due: 0 },
  );
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <label className="search">
          <input
            placeholder="Invoice number or customer"
            aria-label="Search invoices"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={due}
            onChange={(e) => setDue(e.target.checked)}
          />{" "}
          Only with balance due
        </label>
        <div className="tool-buttons">
          <a className="button dark" href="/pos">
            Open billing counter
          </a>
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(`Lenore-invoices-${from}-${to}.csv`, [
                [
                  "Number",
                  "Date",
                  "Customer",
                  "GSTIN",
                  "Taxable",
                  "CGST",
                  "SGST",
                  "IGST",
                  "Round off",
                  "Total",
                  "Credited",
                  "Paid",
                  "Balance",
                  "Status",
                  "Cashier",
                ],
                ...rows.map((i) => [
                  i.number,
                  i.date,
                  i.customer.name,
                  i.customer.gstin,
                  rs(i.taxable),
                  rs(i.cgst),
                  rs(i.sgst),
                  rs(i.igst),
                  rs(i.roundOff),
                  rs(i.total),
                  rs(i.credited),
                  rs(i.paid - i.refunded),
                  rs(balanceOf(i)),
                  i.status,
                  i.cashier,
                ]),
              ])
            }
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>
      {error && <p className="error banner">{error}</p>}
      <div className="overview-summary compact-summary">
        <div>
          <span>Invoices</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Net sales</span>
          <strong>{money(totals.total)}</strong>
        </div>
        <div className={totals.due ? "needs-attention" : ""}>
          <span>Balance due</span>
          <strong>{money(totals.due)}</strong>
        </div>
      </div>
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col">Customer</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col" className="num">
                Balance
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.number}</strong>
                  <small className="muted block">
                    {i.date} · {i.cashier}
                  </small>
                </td>
                <td>
                  {i.customer.name}
                  {i.customer.gstin && (
                    <small className="muted block">
                      GSTIN {i.customer.gstin}
                    </small>
                  )}
                </td>
                <td className="num">
                  {money(i.total)}
                  {i.credited > 0 && (
                    <small className="muted block">
                      −{money(i.credited)} credited
                    </small>
                  )}
                </td>
                <td className="num">
                  {balanceOf(i) > 0 ? money(balanceOf(i)) : "—"}
                </td>
                <td>
                  <span
                    className={`badge ${i.status === "cancelled" ? "out" : balanceOf(i) > 0 ? "low" : "live"}`}
                  >
                    {i.status === "cancelled"
                      ? "Returned"
                      : balanceOf(i) > 0
                        ? "Due"
                        : "Paid"}
                  </span>
                  {i.shortfall && (
                    <span className="badge low">Stock check</span>
                  )}
                </td>
                <td>
                  <button
                    className="row-action"
                    onClick={() =>
                      api<Invoice>(`/pos/invoices/${i.id}`).then(setOpen)
                    }
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {data && !rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No invoices in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <InvoiceSheet
          invoice={open}
          onClose={() => {
            setOpen(null);
            reload();
          }}
          onChange={setOpen}
        />
      )}
    </div>
  );
}
function InvoiceSheet({
  invoice,
  onClose,
  onChange,
}: {
  invoice: Invoice;
  onClose: () => void;
  onChange: (i: Invoice) => void;
}) {
  const [mode, setMode] = useState<"view" | "return" | "collect">("view");
  const payment = useLoad<{ payment: PaymentDetails }>("/admin/erp/settings")
    .data?.payment;
  return (
    <Sheet title={`Invoice ${invoice.number}`} onClose={onClose} wide>
      {mode === "view" && (
        <div className="sheet-section">
          <div className="tool-buttons">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.print()}
            >
              <Printer size={16} aria-hidden="true" /> Print A4
            </button>
            {invoice.status !== "cancelled" && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMode("return")}
              >
                Return / credit note
              </button>
            )}
            {balanceOf(invoice) > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMode("collect")}
              >
                Record payment
              </button>
            )}
          </div>
          <div
            className="invoice-preview"
            tabIndex={0}
            role="region"
            aria-label="Invoice preview"
          >
            <TaxInvoice invoice={invoice} payment={payment} />
          </div>
          <h3>Payments</h3>
          <ul className="summary-lines">
            {invoice.payments.map((p) => (
              <li key={p.id}>
                <span>
                  {p.date} · {p.kind} ·{" "}
                  {methodLabel[p.method as PaymentMethod] ?? p.method}
                  {p.reference && ` · ${p.reference}`}
                </span>
                <span>
                  {p.kind === "refund" ? "−" : ""}
                  {money(p.amount)}
                </span>
              </li>
            ))}
            {!invoice.payments.length && (
              <li className="muted">No payments yet.</li>
            )}
          </ul>
          {invoice.creditNotes.length > 0 && (
            <>
              <h3>Credit notes</h3>
              <ul className="summary-lines">
                {invoice.creditNotes.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.number} · {c.date} · {c.reason}
                    </span>
                    <span>{money(c.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <PrintArea>
            <TaxInvoice invoice={invoice} payment={payment} />
          </PrintArea>
        </div>
      )}
      {mode === "return" && (
        <ReturnForm
          invoice={invoice}
          shiftId={null}
          onDone={(i) => {
            onChange(i);
            setMode("view");
          }}
          onCancel={() => setMode("view")}
        />
      )}
      {mode === "collect" && (
        <CollectForm
          invoice={invoice}
          shiftId={null}
          payment={payment}
          onDone={(i) => {
            onChange(i);
            setMode("view");
          }}
          onCancel={() => setMode("view")}
        />
      )}
    </Sheet>
  );
}

/* ───────── Customers ───────── */
type PriceLists = {
  lists: { id: string; name: string; discountBp: number; revision: number }[];
  items: {
    priceListId: string;
    productId: string;
    pricePaise: number;
    code: string;
    name: string;
  }[];
};
export function CustomersPanel() {
  const [q, setQ] = useState("");
  const { data, error, reload } = useLoad<Customer[]>(
    `/admin/erp/customers?q=${encodeURIComponent(q)}`,
  );
  const lists = useLoad<PriceLists>("/admin/erp/price-lists").data;
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [ledger, setLedger] = useState<Customer | null>(null);
  const rows = data ?? [];
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <label className="search">
          <input
            placeholder="Name, phone or GSTIN"
            aria-label="Search customers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="tool-buttons">
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("Lenore-customers.csv", [
                [
                  "Name",
                  "Phone",
                  "GSTIN",
                  "State",
                  "Type",
                  "Credit limit",
                  "Balance",
                ],
                ...rows.map((c) => [
                  c.name,
                  c.phone,
                  c.gstin,
                  c.stateCode,
                  c.kind,
                  rs(c.creditLimitPaise),
                  rs(c.balancePaise),
                ]),
              ])
            }
          >
            <Download size={16} /> Export
          </button>
          <button className="button dark" onClick={() => setEditing("new")}>
            <Plus size={16} /> Add customer
          </button>
        </div>
      </div>
      {error && <p className="error banner">{error}</p>}
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Type</th>
              <th scope="col">Price list</th>
              <th scope="col" className="num">
                Balance
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <small className="muted block">
                    {[c.phone, c.gstin].filter(Boolean).join(" · ")}
                  </small>
                </td>
                <td>{c.kind}</td>
                <td>
                  {lists?.lists.find((l) => l.id === c.priceListId)?.name ??
                    "MRP"}
                </td>
                <td className="num">
                  {c.balancePaise > 0 ? (
                    <strong>{money(c.balancePaise)}</strong>
                  ) : (
                    "—"
                  )}
                  {c.creditLimitPaise > 0 && (
                    <small className="muted block">
                      limit {money(c.creditLimitPaise)}
                    </small>
                  )}
                </td>
                <td className="row-buttons">
                  <button className="row-action" onClick={() => setLedger(c)}>
                    Ledger
                  </button>
                  <button className="row-action" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {data && !rows.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No customers yet. Customers added at the counter appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <CustomerEditor
          customer={editing === "new" ? null : editing}
          lists={lists?.lists ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {ledger && (
        <CustomerLedger
          customer={ledger}
          onClose={() => {
            setLedger(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
function CustomerEditor({
  customer,
  lists,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  lists: PriceLists["lists"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <PanelDialog
      title={customer ? "Edit customer" : "Add customer"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = {
            name: f.get("name"),
            phone: f.get("phone"),
            gstin: String(f.get("gstin") ?? "").toUpperCase(),
            stateCode: f.get("state"),
            address: f.get("address"),
            kind: f.get("kind"),
            priceListId: f.get("priceList") || null,
            creditLimitPaise: toPaise(f.get("limit")),
            notes: f.get("notes"),
          };
          try {
            if (customer)
              await api(
                `/admin/erp/customers/${customer.id}?revision=${customer.revision}`,
                body,
                "PUT",
              );
            else await api("/admin/erp/customers", body, "POST");
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <label>
          Name
          <input name="name" required defaultValue={customer?.name} />
        </label>
        <div className="form-row">
          <label>
            Phone
            <input name="phone" type="tel" defaultValue={customer?.phone} />
          </label>
          <label>
            GSTIN
            <input name="gstin" maxLength={15} defaultValue={customer?.gstin} />
          </label>
        </div>
        <div className="form-row">
          <label>
            State (place of supply)
            <select name="state" defaultValue={customer?.stateCode ?? "32"}>
              {gstStates.map(([c, n]) => (
                <option key={c} value={c}>
                  {n} ({c})
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="kind" defaultValue={customer?.kind ?? "retail"}>
              <option value="retail">Retail</option>
              <option value="dealer">Dealer</option>
              <option value="contractor">Contractor</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Price list
            <select name="priceList" defaultValue={customer?.priceListId ?? ""}>
              <option value="">MRP</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Credit limit (₹, 0 = no limit)
            <input
              name="limit"
              inputMode="decimal"
              defaultValue={customer ? rs(customer.creditLimitPaise) : "0"}
            />
          </label>
        </div>
        <label>
          Address
          <textarea name="address" rows={2} defaultValue={customer?.address} />
        </label>
        <label>
          Notes
          <input name="notes" defaultValue={customer?.notes} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark">Save customer</button>
        </div>
      </form>
    </PanelDialog>
  );
}
type Ledger = {
  invoices: {
    id: string;
    number: string;
    date: string;
    total: number;
    paid: number;
    credited: number;
    refunded: number;
    status: string;
  }[];
  payments: {
    id: string;
    date: string;
    kind: string;
    method: string;
    amount: number;
    reference: string;
    number: string;
  }[];
  creditNotes: {
    id: string;
    number: string;
    date: string;
    total: number;
    invoice: string;
  }[];
};
function CustomerLedger({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const { data, reload } = useLoad<Ledger>(
    `/admin/erp/customers/${customer.id}/ledger`,
  );
  const [error, setError] = useState("");
  const [receiptId, setReceiptId] = useState(() => crypto.randomUUID());
  const entries = useMemo(() => {
    if (!data) return [];
    const rows = [
      ...data.invoices.map((i) => ({
        date: i.date,
        text: `Invoice ${i.number}`,
        debit: i.total,
        credit: 0,
      })),
      ...data.creditNotes.map((c) => ({
        date: c.date,
        text: `Credit note ${c.number} (${c.invoice})`,
        debit: 0,
        credit: c.total,
      })),
      ...data.payments.map((p) => ({
        date: p.date,
        text: `${p.kind === "refund" ? "Refund" : "Payment"} · ${methodLabel[p.method as PaymentMethod] ?? p.method} · ${p.number}`,
        debit: p.kind === "refund" ? p.amount : 0,
        credit: p.kind === "refund" ? 0 : p.amount,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return rows.map((r) => ({
      ...r,
      balance: (running += r.debit - r.credit),
    }));
  }, [data]);
  const balance = entries.at(-1)?.balance ?? 0;
  return (
    <PanelDialog title={`${customer.name} · ledger`} onClose={onClose} wide>
      <div
        className="data-table-wrap count-table"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table compact">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Entry</th>
              <th scope="col" className="num">
                Debit
              </th>
              <th scope="col" className="num">
                Credit
              </th>
              <th scope="col" className="num">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{e.date}</td>
                <td>{e.text}</td>
                <td className="num">{e.debit ? money(e.debit) : ""}</td>
                <td className="num">{e.credit ? money(e.credit) : ""}</td>
                <td className="num">{money(e.balance)}</td>
              </tr>
            ))}
            {!entries.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="tool-buttons">
        <button
          className="button"
          onClick={() =>
            downloadCsv(`Lenore-ledger-${customer.name}.csv`, [
              ["Date", "Entry", "Debit", "Credit", "Balance"],
              ...entries.map((e) => [
                e.date,
                e.text,
                rs(e.debit),
                rs(e.credit),
                rs(e.balance),
              ]),
            ])
          }
        >
          <Download size={16} /> Export statement
        </button>
      </div>
      {balance > 0 && (
        <form
          className="receipt-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError("");
            try {
              await api(
                `/admin/erp/customers/${customer.id}/receipts`,
                {
                  id: receiptId,
                  date: String(f.get("date")),
                  method: f.get("method"),
                  amount: toPaise(f.get("amount")),
                  reference: f.get("reference"),
                  shiftId: null,
                },
                "POST",
              );
              setReceiptId(crypto.randomUUID());
              reload();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <h3>Record payment received · owes {money(balance)}</h3>
          <div className="form-row">
            <label>
              Amount (₹)
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={rs(balance)}
                required
              />
            </label>
            <label>
              Date
              <input
                name="date"
                type="date"
                defaultValue={today()}
                max={today()}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Method
              <select name="method">
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel[m]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reference
              <input name="reference" />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="button dark">
            Record payment (oldest invoices first)
          </button>
        </form>
      )}
    </PanelDialog>
  );
}

/* ───────── Suppliers and purchases ───────── */
type PurchaseRow = {
  id: string;
  supplierId: string;
  supplier: string;
  billNumber: string;
  date: string;
  total: number;
  paid: number;
  returned: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  lines: {
    productId: string;
    code: string;
    name: string;
    qty: number;
    costPaise: number;
    returnedQty: number;
  }[];
};
export function PurchasesPanel({
  products,
  onStockChanged,
}: {
  products: Product[];
  onStockChanged: () => void;
}) {
  const suppliers = useLoad<Supplier[]>("/admin/erp/suppliers");
  const purchases = useLoad<PurchaseRow[]>("/admin/erp/purchases");
  const [mode, setMode] = useState<
    null | "purchase" | "supplier" | { pay: PurchaseRow } | { ret: PurchaseRow }
  >(null);
  const reload = () => {
    suppliers.reload();
    purchases.reload();
    onStockChanged();
  };
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <p className="muted">
          Recording a purchase adds stock, updates average cost and creates the
          payable and input-tax record.
        </p>
        <div className="tool-buttons">
          <button className="button" onClick={() => setMode("supplier")}>
            <Plus size={16} /> Supplier
          </button>
          <button className="button dark" onClick={() => setMode("purchase")}>
            <Plus size={16} /> Record purchase bill
          </button>
        </div>
      </div>
      <div className="admin-grid">
        <section className="work-section">
          <div className="work-section-title">
            <h2>Suppliers</h2>
          </div>
          <table className="data-table compact">
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col" className="num">
                  Payable
                </th>
              </tr>
            </thead>
            <tbody>
              {(suppliers.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <small className="muted block">
                      {[s.phone, s.gstin].filter(Boolean).join(" · ")}
                    </small>
                  </td>
                  <td className="num">
                    {s.payablePaise ? money(s.payablePaise) : "—"}
                  </td>
                </tr>
              ))}
              {suppliers.data && !suppliers.data.length && (
                <tr>
                  <td colSpan={2} className="muted">
                    Add your first supplier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Bill</th>
              <th scope="col">Supplier</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col" className="num">
                Owed
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(purchases.data ?? []).map((p) => {
              const owed = p.total - p.paid - p.returned;
              return (
                <tr key={p.id}>
                  <td>
                    <strong>{p.billNumber}</strong>
                    <small className="muted block">
                      {p.date} · {p.lines.length} items
                    </small>
                  </td>
                  <td>{p.supplier}</td>
                  <td className="num">
                    {money(p.total)}
                    {p.returned > 0 && (
                      <small className="muted block">
                        −{money(p.returned)} returned
                      </small>
                    )}
                  </td>
                  <td className="num">{owed > 0 ? money(owed) : "—"}</td>
                  <td className="row-buttons">
                    {owed > 0 && (
                      <button
                        className="row-action"
                        onClick={() => setMode({ pay: p })}
                      >
                        Pay
                      </button>
                    )}
                    <button
                      className="row-action"
                      onClick={() => setMode({ ret: p })}
                    >
                      Return
                    </button>
                  </td>
                </tr>
              );
            })}
            {purchases.data && !purchases.data.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No purchase bills recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {mode === "supplier" && (
        <SupplierEditor
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            reload();
          }}
        />
      )}
      {mode === "purchase" && (
        <PurchaseEditor
          suppliers={suppliers.data ?? []}
          products={products}
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            reload();
          }}
        />
      )}
      {mode && typeof mode === "object" && "pay" in mode && (
        <PanelDialog
          title={`Pay ${mode.pay.supplier} · ${mode.pay.billNumber}`}
          onClose={() => setMode(null)}
        >
          <SettleForm
            max={mode.pay.total - mode.pay.paid - mode.pay.returned}
            minDate={mode.pay.date}
            path={`/admin/erp/purchases/${mode.pay.id}/payments`}
            onSaved={() => {
              setMode(null);
              reload();
            }}
          />
        </PanelDialog>
      )}
      {mode && typeof mode === "object" && "ret" in mode && (
        <PurchaseReturn
          purchase={mode.ret}
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
function SettleForm({
  max,
  minDate,
  path,
  onSaved,
}: {
  max: number;
  minDate: string;
  path: string;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api(
            path,
            {
              id,
              date: String(f.get("date")),
              method: f.get("method"),
              amount: toPaise(f.get("amount")),
              reference: f.get("reference"),
              shiftId: null,
            },
            "POST",
          );
          onSaved();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <div className="form-row">
        <label>
          Amount (₹)
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={rs(max)}
            required
          />
        </label>
        <label>
          Date
          <input
            name="date"
            type="date"
            defaultValue={today()}
            min={minDate}
            max={today()}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Method
          <select name="method">
            {paymentMethods.map((m) => (
              <option key={m} value={m}>
                {methodLabel[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reference
          <input name="reference" />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="button dark">Record payment</button>
      </div>
    </form>
  );
}
function SupplierEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <PanelDialog title="Add supplier" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/admin/erp/suppliers",
              {
                name: f.get("name"),
                phone: f.get("phone"),
                gstin: String(f.get("gstin") ?? "").toUpperCase(),
                stateCode: f.get("state"),
                address: f.get("address"),
                notes: "",
              },
              "POST",
            );
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <label>
          Name
          <input name="name" required />
        </label>
        <div className="form-row">
          <label>
            Phone
            <input name="phone" type="tel" />
          </label>
          <label>
            GSTIN
            <input name="gstin" maxLength={15} />
          </label>
        </div>
        <label>
          State
          <select name="state" defaultValue="32">
            {gstStates.map(([c, n]) => (
              <option key={c} value={c}>
                {n} ({c})
              </option>
            ))}
          </select>
        </label>
        <label>
          Address
          <textarea name="address" rows={2} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark">Save supplier</button>
        </div>
      </form>
    </PanelDialog>
  );
}
type PLine = { productId: string; qty: string; cost: string; gst: string };
function PurchaseEditor({
  suppliers,
  products,
  onClose,
  onSaved,
}: {
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<PLine[]>([]);
  const [find, setFind] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const byId = new Map(products.map((p) => [p.id, p]));
  const matches = find
    ? products
        .filter((p) =>
          `${p.code} ${p.name} ${p.barcode}`
            .toLowerCase()
            .includes(find.toLowerCase()),
        )
        .slice(0, 8)
    : [];
  const total = lines.reduce(
    (n, l) =>
      n + toPaise(l.cost) * Number(l.qty || 0) * (1 + Number(l.gst || 0) / 100),
    0,
  );
  return (
    <PanelDialog title="Record purchase bill" onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const paid = toPaise(f.get("paid"));
            await api(
              "/admin/erp/purchases",
              {
                id,
                supplierId: f.get("supplier"),
                billNumber: f.get("bill"),
                date: f.get("date"),
                notes: f.get("notes"),
                lines: lines.map((l) => ({
                  productId: l.productId,
                  qty: Number(l.qty),
                  costPaise: toPaise(l.cost),
                  gstRateBp: Math.round(Number(l.gst) * 100),
                })),
                payment:
                  paid > 0
                    ? {
                        method: f.get("method"),
                        amount: paid,
                        reference: f.get("reference"),
                      }
                    : null,
              },
              "POST",
            );
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-row">
          <label>
            Supplier
            <select name="supplier" required>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Supplier bill number
            <input name="bill" required />
          </label>
        </div>
        <label>
          Bill date
          <input
            name="date"
            type="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </label>
        <label className="search">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Scan or search a product to add"
            aria-label="Find product"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const p = matches[0];
                if (p && !lines.some((l) => l.productId === p.id))
                  setLines([
                    ...lines,
                    {
                      productId: p.id,
                      qty: "1",
                      cost: p.costPaise ? rs(p.costPaise) : "",
                      gst:
                        p.gstRateBp === null ? "18" : String(p.gstRateBp / 100),
                    },
                  ]);
                setFind("");
              }
            }}
          />
        </label>
        {matches.length > 0 && (
          <ul className="pick-list">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!lines.some((l) => l.productId === p.id))
                      setLines([
                        ...lines,
                        {
                          productId: p.id,
                          qty: "1",
                          cost: p.costPaise ? rs(p.costPaise) : "",
                          gst:
                            p.gstRateBp === null
                              ? "18"
                              : String(p.gstRateBp / 100),
                        },
                      ]);
                    setFind("");
                  }}
                >
                  {p.code} · {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <table className="data-table compact">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit cost excl. GST (₹)</th>
              <th scope="col">GST %</th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const set = (patch: Partial<PLine>) =>
                setLines(
                  lines.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <tr key={l.productId}>
                  <td>
                    {byId.get(l.productId)?.name}
                    <small className="muted block">
                      {byId.get(l.productId)?.code}
                    </small>
                  </td>
                  <td>
                    <input
                      className="count-input"
                      inputMode="numeric"
                      aria-label="Quantity"
                      value={l.qty}
                      onChange={(e) =>
                        set({ qty: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="count-input"
                      inputMode="decimal"
                      aria-label="Unit cost"
                      value={l.cost}
                      onChange={(e) => set({ cost: e.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      className="count-input"
                      inputMode="decimal"
                      aria-label="GST rate"
                      value={l.gst}
                      onChange={(e) => set({ gst: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove line"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">Estimated bill total {money(Math.round(total))}</p>
        <div className="form-row">
          <label>
            Paid now (₹)
            <input name="paid" inputMode="decimal" defaultValue="0" />
          </label>
          <label>
            Method
            <select name="method">
              {paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {methodLabel[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Payment reference
          <input name="reference" />
        </label>
        <label>
          Notes
          <input name="notes" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark" disabled={busy || !lines.length}>
            {busy ? "Saving…" : "Save purchase"}
          </button>
        </div>
      </form>
    </PanelDialog>
  );
}
function PurchaseReturn({
  purchase,
  onClose,
  onSaved,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  return (
    <PanelDialog title={`Return to ${purchase.supplier}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              `/admin/erp/purchases/${purchase.id}/returns`,
              {
                id,
                date: f.get("date"),
                reason: f.get("reason"),
                refundMethod: f.get("method") || null,
                refundReference: "",
                lines: Object.entries(qty)
                  .filter(([, q]) => q > 0)
                  .map(([productId, q]) => ({ productId, qty: q })),
              },
              "POST",
            );
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <ul className="summary-lines">
          {purchase.lines.map((l) => (
            <li key={l.productId}>
              <span>
                {l.code}
                <small className="muted block">
                  Bought {l.qty} · returned {l.returnedQty}
                </small>
              </span>
              <input
                className="count-input"
                inputMode="numeric"
                aria-label={`Return quantity for ${l.code}`}
                value={qty[l.productId] ?? ""}
                onChange={(e) =>
                  setQty({
                    ...qty,
                    [l.productId]: Math.min(
                      l.qty - l.returnedQty,
                      Number(e.target.value.replace(/\D/g, "")) || 0,
                    ),
                  })
                }
              />
            </li>
          ))}
        </ul>
        <label>
          Date
          <input
            name="date"
            type="date"
            defaultValue={today()}
            min={purchase.date}
            max={today()}
          />
        </label>
        <label>
          Reason
          <input name="reason" required minLength={3} />
        </label>
        <label>
          Supplier refund method (if already paid)
          <select name="method">
            <option value="">Not applicable</option>
            {paymentMethods.map((m) => (
              <option key={m} value={m}>
                {methodLabel[m]}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark">Record return</button>
        </div>
      </form>
    </PanelDialog>
  );
}

/* ───────── Expenses ───────── */
export function ExpensesPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data, error, reload } = useLoad<Expense[]>(
    `/admin/erp/expenses?from=${from}&to=${to}`,
  );
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<{
    e: Expense;
    kind: "pay" | "reverse";
  } | null>(null);
  const rows = data ?? [];
  const live = rows.filter((e) => e.status === "recorded");
  const byCategory = Object.entries(
    live.reduce<Record<string, number>>(
      (m, e) => ({ ...m, [e.category]: (m[e.category] ?? 0) + e.amount }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <div className="tool-buttons">
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(`Lenore-expenses-${from}-${to}.csv`, [
                [
                  "Date",
                  "Category",
                  "Payee",
                  "Bill",
                  "GSTIN",
                  "Amount",
                  "GST",
                  "Method",
                  "Paid",
                  "Status",
                  "Note",
                  "By",
                ],
                ...rows.map((e) => [
                  e.date,
                  e.category,
                  e.payee,
                  e.billNumber,
                  e.gstin,
                  rs(e.amount),
                  rs(e.gst),
                  e.method,
                  rs(e.paid),
                  e.status,
                  e.description,
                  e.actor,
                ]),
              ])
            }
          >
            <Download size={16} /> Export
          </button>
          <button className="button dark" onClick={() => setAdding(true)}>
            <Plus size={16} /> Record expense
          </button>
        </div>
      </div>
      {error && <p className="error banner">{error}</p>}
      <div className="overview-summary compact-summary">
        <div>
          <span>Expenses</span>
          <strong>{money(live.reduce((n, e) => n + e.amount, 0))}</strong>
        </div>
        <div>
          <span>Unpaid</span>
          <strong>
            {money(live.reduce((n, e) => n + e.amount - e.paid, 0))}
          </strong>
        </div>
        <div>
          <span>Top category</span>
          <strong className="small-strong">
            {byCategory[0]
              ? `${byCategory[0][0]} · ${money(byCategory[0][1])}`
              : "—"}
          </strong>
        </div>
      </div>
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Expense</th>
              <th scope="col" className="num">
                Amount
              </th>
              <th scope="col">Paid</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className={e.status === "reversed" ? "inactive" : ""}
              >
                <td>{e.date}</td>
                <td>
                  <strong>{e.category}</strong>
                  <small className="muted block">
                    {[
                      e.payee,
                      e.description,
                      e.billNumber && `Bill ${e.billNumber}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {e.status === "reversed" && (
                    <small className="muted block">
                      Reversed: {e.reversalReason}
                    </small>
                  )}
                </td>
                <td className="num">
                  {money(e.amount)}
                  {e.gst > 0 && (
                    <small className="muted block">
                      incl. GST {money(e.gst)}
                    </small>
                  )}
                </td>
                <td>
                  {e.paid >= e.amount ? (
                    (methodLabel[e.method as PaymentMethod] ?? e.method)
                  ) : (
                    <span className="badge low">
                      Unpaid {money(e.amount - e.paid)}
                    </span>
                  )}
                </td>
                <td className="row-buttons">
                  {e.hasAttachment && (
                    <a
                      className="row-action"
                      href={`/api/admin/erp/expenses/${e.id}/attachment`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Eye size={14} /> Bill
                    </a>
                  )}
                  {e.status === "recorded" && e.paid < e.amount && (
                    <button
                      className="row-action"
                      onClick={() => setActing({ e, kind: "pay" })}
                    >
                      Pay
                    </button>
                  )}
                  {e.status === "recorded" && (
                    <button
                      className="row-action"
                      onClick={() => setActing({ e, kind: "reverse" })}
                    >
                      Reverse
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data && !rows.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No expenses in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {adding && (
        <ExpenseEditor
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {acting?.kind === "pay" && (
        <PanelDialog
          title={`Pay ${acting.e.category}`}
          onClose={() => setActing(null)}
        >
          <SettleForm
            max={acting.e.amount - acting.e.paid}
            minDate={acting.e.date}
            path={`/admin/erp/expenses/${acting.e.id}/pay`}
            onSaved={() => {
              setActing(null);
              reload();
            }}
          />
        </PanelDialog>
      )}
      {acting?.kind === "reverse" && (
        <PanelDialog title="Reverse expense" onClose={() => setActing(null)}>
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              await api(
                `/admin/erp/expenses/${acting.e.id}/reverse`,
                { reason: new FormData(ev.currentTarget).get("reason") },
                "POST",
              ).catch(() => undefined);
              setActing(null);
              reload();
            }}
          >
            <p className="muted">
              The entry stays in the audit trail; a reversal cancels its cost
              and payment.
            </p>
            <label>
              Reason
              <input
                name="reason"
                required
                minLength={3}
                placeholder="e.g. Entered twice"
              />
            </label>
            <div className="form-actions">
              <button className="button dark">Reverse</button>
            </div>
          </form>
        </PanelDialog>
      )}
    </div>
  );
}
function ExpenseEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(expenseCategories[0]);
  const [id] = useState(() => crypto.randomUUID());
  return (
    <PanelDialog title="Record expense" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api(
              "/admin/erp/expenses",
              {
                id,
                date: f.get("date"),
                category:
                  category === "Other"
                    ? String(f.get("custom") || "Other")
                    : category,
                payee: f.get("payee"),
                description: f.get("description"),
                billNumber: f.get("bill"),
                gstin: String(f.get("gstin") ?? "").toUpperCase(),
                amount: toPaise(f.get("amount")),
                gst: toPaise(f.get("gst")),
                method: f.get("method"),
                reference: f.get("reference"),
                shiftId: null,
              },
              "POST",
            );
            if (file) {
              const r = await fetch(
                `/api/admin/erp/expenses/${id}/attachment`,
                { method: "POST", body: file },
              );
              if (!r.ok)
                throw new Error(
                  ((await r.json()) as { error?: string }).error ??
                    "Saved, but the bill photo did not upload.",
                );
            }
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-row">
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {expenseCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {category === "Other" ? (
            <label>
              Describe category
              <input name="custom" />
            </label>
          ) : (
            <label>
              Date
              <input
                name="date"
                type="date"
                defaultValue={today()}
                max={today()}
                required
              />
            </label>
          )}
        </div>
        {category === "Other" && (
          <label>
            Date
            <input
              name="date"
              type="date"
              defaultValue={today()}
              max={today()}
              required
            />
          </label>
        )}
        <div className="form-row">
          <label>
            Total amount incl. GST (₹)
            <input name="amount" inputMode="decimal" required />
          </label>
          <label>
            GST included (₹)
            <input name="gst" inputMode="decimal" defaultValue="0" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Paid to
            <input name="payee" />
          </label>
          <label>
            Supplier GSTIN (for input tax)
            <input name="gstin" maxLength={15} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Payment
            <select name="method" defaultValue="cash">
              {paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {methodLabel[m]}
                </option>
              ))}
              <option value="unpaid">Not paid yet</option>
            </select>
          </label>
          <label>
            Bill / voucher number
            <input name="bill" />
          </label>
        </div>
        <label>
          Reference (UTR, cheque)
          <input name="reference" />
        </label>
        <label>
          Note
          <input name="description" />
        </label>
        <label className="upload-field">
          <Paperclip size={20} />
          <strong>
            {file ? file.name : "Attach bill photo or PDF (optional)"}
          </strong>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark" disabled={busy}>
            {busy ? "Saving…" : "Save expense"}
          </button>
        </div>
      </form>
    </PanelDialog>
  );
}

/* ───────── Register ───────── */
export function RegisterPanel() {
  const { data, error } = useLoad<ShiftSummary[]>("/admin/erp/shifts");
  const [open, setOpen] = useState<ShiftSummary | null>(null);
  return (
    <div className="admin-stack">
      {error && <p className="error banner">{error}</p>}
      <div
        className="data-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Bills</th>
              <th scope="col" className="num">
                Expected cash
              </th>
              <th scope="col" className="num">
                Counted
              </th>
              <th scope="col" className="num">
                Difference
              </th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => {
              const diff =
                s.countedCash === null ? null : s.countedCash - s.expectedCash;
              return (
                <tr key={s.id}>
                  <td>
                    <strong>
                      {new Date(s.openedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </strong>
                    <small className="muted block">
                      {s.openedBy} · {s.status}
                    </small>
                  </td>
                  <td>
                    {s.invoices.n} · {money(s.invoices.total)}
                  </td>
                  <td className="num">{money(s.expectedCash)}</td>
                  <td className="num">
                    {s.countedCash === null ? "Open" : money(s.countedCash)}
                  </td>
                  <td className="num">
                    {diff === null ? (
                      "—"
                    ) : (
                      <span className={diff === 0 ? "" : "delta down"}>
                        {money(diff)}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="row-action" onClick={() => setOpen(s)}>
                      Report
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && !data.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No counter shifts yet. Open the billing counter to start one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <PanelDialog title="Shift report" onClose={() => setOpen(null)}>
          <div className="z-preview">
            <ZReport shift={open} />
          </div>
        </PanelDialog>
      )}
    </div>
  );
}

/* ───────── Reports ───────── */
type Report = {
  daily: {
    date: string;
    invoices: number;
    total: number;
    taxable: number;
    tax: number;
    credited: number;
  }[];
  methods: { method: string; kind: string; amount: number; n: number }[];
  hsn: {
    hsn: string;
    rate: number;
    unit: string;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  b2b: {
    number: string;
    date: string;
    customer: string;
    gstin: string;
    pos: string;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    credited: number;
  }[];
  b2c: {
    supply: string;
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }[];
  products: {
    productId: string;
    code: string;
    name: string;
    qty: number;
    revenue: number;
    cost: number | null;
  }[];
  cashiers: { cashier: string; invoices: number; net: number }[];
  creditNotes: {
    number: string;
    date: string;
    total: number;
    reason: string;
    invoice: string;
  }[];
  purchases: { n: number; total: number; tax: number; payable: number };
  expenses: { category: string; n: number; amount: number; gst: number }[];
  deadStock: {
    id: string;
    code: string;
    name: string;
    stock: number;
    cost: number | null;
    lastSold: string | null;
  }[];
  numberGaps: { fy: string; seq: number }[];
  shortfalls: { number: string; date: string }[];
};
export function ReportsPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data: r, error } = useLoad<Report>(
    `/admin/erp/reports?from=${from}&to=${to}`,
  );
  const sales = r ? r.daily.reduce((n, d) => n + d.total - d.credited, 0) : 0;
  const tax = r ? r.hsn.reduce((n, h) => n + h.cgst + h.sgst + h.igst, 0) : 0;
  const expenseTotal = r ? r.expenses.reduce((n, e) => n + e.amount, 0) : 0;
  const margin = r
    ? r.products.reduce(
        (n, p) => (p.cost === null ? n : n + (p.revenue - p.cost)),
        0,
      )
    : 0;
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      {error && <p className="error banner">{error}</p>}
      {!r ? (
        <p className="muted">Loading reports…</p>
      ) : (
        <>
          <div className="overview-summary">
            <div>
              <span>Net sales</span>
              <strong>{money(sales)}</strong>
            </div>
            <div>
              <span>Output GST</span>
              <strong>{money(tax)}</strong>
            </div>
            <div>
              <span>Purchases</span>
              <strong>{money(r.purchases.total)}</strong>
              <small className="muted">
                payable {money(r.purchases.payable)}
              </small>
            </div>
            <div>
              <span>Expenses</span>
              <strong>{money(expenseTotal)}</strong>
            </div>
          </div>
          {(r.numberGaps.length > 0 || r.shortfalls.length > 0) && (
            <section className="work-section attention-box">
              <div className="work-section-title">
                <h2>Needs attention</h2>
              </div>
              {r.numberGaps.length > 0 && (
                <p>
                  Unused reserved invoice numbers (explain or report as
                  cancelled before filing):{" "}
                  {r.numberGaps.map((g) => `${g.fy}/${g.seq}`).join(", ")}
                </p>
              )}
              {r.shortfalls.length > 0 && (
                <p>
                  Bills sold beyond recorded stock — count these items:{" "}
                  {r.shortfalls.map((s) => s.number).join(", ")}
                </p>
              )}
            </section>
          )}
          <div className="admin-grid">
            <ReportTable
              title="Sales by day"
              csv="sales-by-day"
              head={["Date", "Bills", "Taxable", "GST", "Total", "Credited"]}
              rows={r.daily.map((d) => [
                d.date,
                d.invoices,
                money(d.taxable),
                money(d.tax),
                money(d.total),
                money(d.credited),
              ])}
              raw={r.daily.map((d) => [
                d.date,
                d.invoices,
                rs(d.taxable),
                rs(d.tax),
                rs(d.total),
                rs(d.credited),
              ])}
            />
            <ReportTable
              title="Payments by method"
              csv="payments"
              head={["Method", "Type", "Count", "Amount"]}
              rows={r.methods.map((m) => [
                methodLabel[m.method as PaymentMethod] ?? m.method,
                m.kind,
                m.n,
                money(m.amount),
              ])}
              raw={r.methods.map((m) => [m.method, m.kind, m.n, rs(m.amount)])}
            />
            <ReportTable
              title="HSN summary (GSTR-1)"
              csv="hsn-summary"
              head={["HSN", "GST %", "Qty", "Taxable", "CGST", "SGST", "IGST"]}
              rows={r.hsn.map((h) => [
                h.hsn || "—",
                h.rate / 100,
                `${h.qty} ${h.unit}`,
                money(h.taxable),
                money(h.cgst),
                money(h.sgst),
                money(h.igst),
              ])}
              raw={r.hsn.map((h) => [
                h.hsn,
                h.rate / 100,
                h.qty,
                rs(h.taxable),
                rs(h.cgst),
                rs(h.sgst),
                rs(h.igst),
              ])}
            />
            <ReportTable
              title="B2B invoices (GSTR-1)"
              csv="b2b"
              head={[
                "Invoice",
                "Date",
                "Customer",
                "GSTIN",
                "Taxable",
                "Tax",
                "Total",
              ]}
              rows={r.b2b.map((b) => [
                b.number,
                b.date,
                b.customer,
                b.gstin,
                money(b.taxable),
                money(b.cgst + b.sgst + b.igst),
                money(b.total),
              ])}
              raw={r.b2b.map((b) => [
                b.number,
                b.date,
                b.customer,
                b.gstin,
                b.pos,
                rs(b.taxable),
                rs(b.cgst),
                rs(b.sgst),
                rs(b.igst),
                rs(b.total),
                rs(b.credited),
              ])}
            />
            <ReportTable
              title="B2C sales by rate (GSTR-1)"
              csv="b2c"
              head={["Supply", "GST %", "Taxable", "CGST", "SGST", "IGST"]}
              rows={r.b2c.map((b) => [
                b.supply === "inter" ? "Inter-state" : "Intra-state",
                b.rate / 100,
                money(b.taxable),
                money(b.cgst),
                money(b.sgst),
                money(b.igst),
              ])}
              raw={r.b2c.map((b) => [
                b.supply,
                b.rate / 100,
                rs(b.taxable),
                rs(b.cgst),
                rs(b.sgst),
                rs(b.igst),
              ])}
            />
            <ReportTable
              title={`Top products · margin ${money(margin)}`}
              csv="products"
              head={["Product", "Qty", "Revenue", "Gross margin"]}
              rows={r.products.map((p) => [
                `${p.code} · ${p.name}`,
                p.qty,
                money(p.revenue),
                p.cost === null ? "No cost" : money(p.revenue - p.cost),
              ])}
              raw={r.products.map((p) => [
                p.code,
                p.name,
                p.qty,
                rs(p.revenue),
                p.cost === null ? "" : rs(p.revenue - p.cost),
              ])}
            />
            <ReportTable
              title="By cashier"
              csv="cashiers"
              head={["Cashier", "Bills", "Net"]}
              rows={r.cashiers.map((c) => [
                c.cashier,
                c.invoices,
                money(c.net),
              ])}
              raw={r.cashiers.map((c) => [c.cashier, c.invoices, rs(c.net)])}
            />
            <ReportTable
              title="Credit notes"
              csv="credit-notes"
              head={["Number", "Date", "Invoice", "Total", "Reason"]}
              rows={r.creditNotes.map((c) => [
                c.number,
                c.date,
                c.invoice,
                money(c.total),
                c.reason,
              ])}
              raw={r.creditNotes.map((c) => [
                c.number,
                c.date,
                c.invoice,
                rs(c.total),
                c.reason,
              ])}
            />
            <ReportTable
              title="Expenses by category"
              csv="expenses"
              head={["Category", "Count", "Amount", "GST"]}
              rows={r.expenses.map((e) => [
                e.category,
                e.n,
                money(e.amount),
                money(e.gst),
              ])}
              raw={r.expenses.map((e) => [
                e.category,
                e.n,
                rs(e.amount),
                rs(e.gst),
              ])}
            />
            <ReportTable
              title="Dead stock (no sale in 90 days)"
              csv="dead-stock"
              head={["Product", "Stock", "Value at cost", "Last sold"]}
              rows={r.deadStock.map((d) => [
                `${d.code} · ${d.name}`,
                d.stock,
                d.cost === null ? "—" : money(d.cost * d.stock),
                d.lastSold ?? "Never",
              ])}
              raw={r.deadStock.map((d) => [
                d.code,
                d.name,
                d.stock,
                d.cost === null ? "" : rs(d.cost * d.stock),
                d.lastSold ?? "",
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
function ReportTable({
  title,
  head,
  rows,
  raw,
  csv,
}: {
  title: string;
  head: string[];
  rows: (string | number)[][];
  raw: unknown[][];
  csv: string;
}) {
  return (
    <section className="work-section">
      <div className="work-section-title report-head">
        <h2>{title}</h2>
        <button
          className="row-action"
          disabled={!raw.length}
          onClick={() => downloadCsv(`Lenore-${csv}.csv`, [head, ...raw])}
        >
          <Download size={14} /> CSV
        </button>
      </div>
      <div
        className="report-scroll"
        tabIndex={0}
        role="region"
        aria-label={title}
      >
        <table className="data-table compact">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={
                      typeof c === "number" || /^[−-]?₹/.test(String(c))
                        ? "num"
                        : ""
                    }
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={head.length} className="muted">
                  Nothing in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────── Billing settings and price lists ───────── */
export function BillingSettingsPanel({
  products,
  notify,
}: {
  products: Product[];
  notify: (m: string) => void;
}) {
  const settings = useLoad<{
    invoicePrefix: string;
    stateCode: string;
    receiptFooter: string;
    blockSize: number;
    revision: number;
    payment: PaymentDetails;
  }>("/admin/erp/settings");
  const lists = useLoad<PriceLists>("/admin/erp/price-lists");
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    discountBp: number;
  } | null>(null);
  const [error, setError] = useState("");
  const s = settings.data;
  return (
    <div className="settings-grid">
      <section className="work-section settings-section">
        <h2>Invoices and receipts</h2>
        {s && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api(
                  "/admin/erp/settings",
                  {
                    invoicePrefix: String(f.get("prefix")).toUpperCase(),
                    stateCode: f.get("state"),
                    receiptFooter: f.get("footer"),
                    blockSize: Number(f.get("block")),
                    payment: {
                      upiId: String(f.get("upiId")).trim(),
                      upiName: f.get("upiName"),
                      bankAccountName: f.get("bankAccountName"),
                      bankName: f.get("bankName"),
                      bankAccount: String(f.get("bankAccount")).replace(
                        /\s/g,
                        "",
                      ),
                      bankIfsc: String(f.get("bankIfsc")).toUpperCase(),
                      bankBranch: f.get("bankBranch"),
                      qrOnBills: f.get("qrOnBills"),
                      bankOnInvoice: f.get("bankOnInvoice") === "on",
                    },
                    revision: s.revision,
                  },
                  "PUT",
                );
                settings.reload();
                notify("Billing settings saved.");
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            <div className="form-row">
              <label>
                Invoice prefix
                <input
                  name="prefix"
                  defaultValue={s.invoicePrefix}
                  maxLength={4}
                  required
                />
              </label>
              <label>
                Business state
                <select name="state" defaultValue={s.stateCode}>
                  {gstStates.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n} ({c})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              Invoices are numbered {s.invoicePrefix}/26-27/0001, restarting
              each financial year. Change the prefix only at the start of a
              year.
            </p>
            <label>
              Numbers reserved per counter block
              <input
                name="block"
                type="number"
                min={5}
                max={200}
                defaultValue={s.blockSize}
              />
            </label>
            <label>
              Receipt footer
              <textarea
                name="footer"
                rows={3}
                maxLength={300}
                defaultValue={s.receiptFooter}
              />
            </label>
            <h3>UPI and bank details</h3>
            <p className="muted">
              The counter shows a UPI QR code for the exact bill amount, which
              customers scan with any UPI app. Bank details print on A4 tax
              invoices for transfers.
            </p>
            <div className="form-row">
              <label>
                UPI ID
                <input
                  name="upiId"
                  defaultValue={s.payment.upiId}
                  placeholder="lenore@okhdfcbank"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={320}
                />
              </label>
              <label>
                Name shown in UPI apps
                <input
                  name="upiName"
                  defaultValue={s.payment.upiName}
                  placeholder="Lenore Trading LLP"
                  maxLength={60}
                />
              </label>
            </div>
            <label>
              Print the UPI QR on bills
              <select name="qrOnBills" defaultValue={s.payment.qrOnBills}>
                <option value="due">
                  Only when an amount is due (for that amount)
                </option>
                <option value="always">
                  Always (amount due, or open amount when paid)
                </option>
                <option value="off">Never</option>
              </select>
            </label>
            <div className="form-row">
              <label>
                Account name
                <input
                  name="bankAccountName"
                  defaultValue={s.payment.bankAccountName}
                  placeholder="Lenore Trading LLP"
                  maxLength={80}
                />
              </label>
              <label>
                Bank
                <input
                  name="bankName"
                  defaultValue={s.payment.bankName}
                  maxLength={80}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Account number
                <input
                  name="bankAccount"
                  inputMode="numeric"
                  defaultValue={s.payment.bankAccount}
                  maxLength={24}
                />
              </label>
              <label>
                IFSC
                <input
                  name="bankIfsc"
                  defaultValue={s.payment.bankIfsc}
                  autoCapitalize="characters"
                  maxLength={11}
                />
              </label>
            </div>
            <label>
              Branch
              <input
                name="bankBranch"
                defaultValue={s.payment.bankBranch}
                maxLength={80}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="bankOnInvoice"
                defaultChecked={s.payment.bankOnInvoice}
              />
              <span>Print bank details on A4 tax invoices</span>
            </label>
            {s.payment.upiId && (
              <div className="pay-preview">
                <UpiQr
                  payment={s.payment}
                  amount={100}
                  note="Test"
                  size={120}
                />
                <small className="muted">
                  Test code for ₹1.00. Scan it with a phone to check the details
                  before using it at the counter.
                </small>
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button className="button dark">Save</button>
            </div>
          </form>
        )}
      </section>
      <section className="work-section settings-section">
        <h2>Price lists</h2>
        <p className="muted">
          Dealer and contractor pricing. Customers on a list are billed at its
          prices; other items get its discount from MRP.
        </p>
        <ul className="plain-list">
          {(lists.data?.lists ?? []).map((l) => (
            <li key={l.id}>
              <span>
                {l.name} · {l.discountBp / 100}% off MRP ·{" "}
                {lists.data!.items.filter((i) => i.priceListId === l.id).length}{" "}
                special prices
              </span>
              <button className="row-action" onClick={() => setEditing(l)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
        <button
          className="button"
          onClick={() =>
            setEditing({ id: crypto.randomUUID(), name: "", discountBp: 0 })
          }
        >
          <Plus size={16} /> New price list
        </button>
      </section>
      {editing && (
        <PriceListEditor
          list={editing}
          items={(lists.data?.items ?? []).filter(
            (i) => i.priceListId === editing.id,
          )}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            lists.reload();
            notify("Price list saved.");
          }}
        />
      )}
    </div>
  );
}
function PriceListEditor({
  list,
  items,
  products,
  onClose,
  onSaved,
}: {
  list: { id: string; name: string; discountBp: number };
  items: PriceLists["items"];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.productId, rs(i.pricePaise)])),
  );
  const [find, setFind] = useState("");
  const [error, setError] = useState("");
  const shown = products
    .filter(
      (p) =>
        prices[p.id] !== undefined ||
        (find &&
          `${p.code} ${p.name}`.toLowerCase().includes(find.toLowerCase())),
    )
    .slice(0, 60);
  return (
    <PanelDialog
      title={list.name ? `Price list · ${list.name}` : "New price list"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              `/admin/erp/price-lists/${list.id}`,
              {
                name: f.get("name"),
                discountBp: Math.round(Number(f.get("discount") || 0) * 100),
                items: Object.entries(prices)
                  .filter(([, v]) => v !== "")
                  .map(([productId, v]) => ({
                    productId,
                    pricePaise: toPaise(v),
                  })),
              },
              "PUT",
            );
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <div className="form-row">
          <label>
            Name
            <input
              name="name"
              required
              defaultValue={list.name}
              placeholder="e.g. Dealer"
            />
          </label>
          <label>
            Default discount from MRP (%)
            <input
              name="discount"
              inputMode="decimal"
              defaultValue={list.discountBp / 100}
            />
          </label>
        </div>
        <label className="search">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a product to set a special price"
            aria-label="Find product"
          />
        </label>
        <table className="data-table compact">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="num">
                MRP
              </th>
              <th scope="col">Special price (₹)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.code} · {p.name}
                </td>
                <td className="num">{money(p.pricePaise)}</td>
                <td>
                  <input
                    className="count-input"
                    inputMode="decimal"
                    aria-label={`Special price for ${p.code}`}
                    value={prices[p.id] ?? ""}
                    onChange={(e) =>
                      setPrices({ ...prices, [p.id]: e.target.value })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="button dark">Save price list</button>
        </div>
      </form>
    </PanelDialog>
  );
}
