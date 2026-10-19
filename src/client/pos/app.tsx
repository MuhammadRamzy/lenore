import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  CloudOff,
  FileText,
  LogOut,
  Minus,
  Plus,
  Printer,
  Receipt as ReceiptIcon,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { api, ApiError, errorMessage } from "../api";
import {
  balanceOf,
  expenseCategories,
  gstStates,
  invoiceNumber,
  methodLabel,
  paymentMethods,
  priceBill,
  type Customer,
  type Invoice,
  type InvoiceInput,
  type PaymentMethod,
  type PaymentDetails,
} from "../../erp";
import { money, type SessionInfo } from "../../shared";
import "./pos.css";
import { Mark } from "../site/site";
import { whatsappLink, withCountry } from "../links";
import { Sheet } from "../sales/ui";
import { Receipt, TaxInvoice, ZReport } from "./print";
import { UpiQr } from "./qr";
import {
  connectPrinter,
  printEscPos,
  printerConnected,
  serialSupported,
} from "./printer";
import {
  cacheBootstrap,
  cachedBootstrap,
  deviceId,
  nextNumber,
  readQueue,
  reservedCount,
  syncQueue,
  writeQueue,
  type Bootstrap,
  type PosProduct,
  type ShiftSummary,
} from "./store";

type Line = {
  productId: string;
  qty: number;
  rate: number;
  discount: number;
  /** True once the cashier types a price, so customer price lists stop overriding it. */
  manual: boolean;
};
type Payment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
};
const rupeesToPaise = (v: string) =>
  Math.round(Number(v.replace(/[₹,\s]/g, "")) * 100);
const paiseInput = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, "");

export function PosApp() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const s = await api<SessionInfo>("/session");
      setSession(s);
      if (!s.posAccess) return;
      const b = await api<Bootstrap>(`/pos/bootstrap?device=${deviceId()}`);
      cacheBootstrap(b);
      setBoot(b);
      setError("");
    } catch (e) {
      const cached = cachedBootstrap();
      if (cached && !(e instanceof ApiError)) {
        setSession(
          (s) =>
            s ??
            ({
              authenticated: true,
              role: "sales",
              name: cached.cashier,
              phone: "",
              userId: null,
              maxDiscountBp: null,
              posAccess: true,
            } as SessionInfo),
        );
        setBoot(cached);
      } else setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  if (error && !session)
    return (
      <div className="app-splash">
        <Mark className="mark-lg" />
        <p role="alert">{error}</p>
        <button className="btn btn-primary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!session)
    return (
      <div className="app-splash">
        <Mark className="mark-lg" />
        <p className="muted">Opening counter…</p>
      </div>
    );
  if (!session.role || !session.posAccess)
    return <PosSignIn denied={!!session.role} onDone={load} />;
  if (!boot)
    return (
      <div className="app-splash">
        <Mark className="mark-lg" />
        <p className="muted">{error || "Loading products…"}</p>
      </div>
    );
  if (!boot.shift || boot.shift.status !== "open")
    return <OpenShift boot={boot} onOpened={load} />;
  return <Counter boot={boot} reload={load} />;
}

function PosSignIn({
  denied,
  onDone,
}: {
  denied: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState(
    denied
      ? "This account does not have billing access. Ask an admin to enable it under Team."
      : "",
  );
  const [busy, setBusy] = useState(false);
  return (
    <main className="signin">
      <div className="signin-card">
        <Mark className="mark-lg" />
        <h1>Lenore billing</h1>
        <p className="muted">Counter sign-in</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api(
                "/session",
                { username: f.get("username"), password: f.get("password") },
                "POST",
              );
              onDone();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Phone or username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-lg wide" disabled={busy}>
            {busy ? "Signing in…" : "Open counter"}
          </button>
        </form>
      </div>
    </main>
  );
}

function OpenShift({
  boot,
  onOpened,
}: {
  boot: Bootstrap;
  onOpened: () => void;
}) {
  const [float, setFloat] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="signin">
      <div className="signin-card">
        <Wallet size={36} className="accent" aria-hidden="true" />
        <h1>Open the counter</h1>
        <p className="muted">
          Count the cash in the drawer to start {boot.cashier}’s shift.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(
                "/pos/shifts",
                {
                  id: crypto.randomUUID(),
                  deviceId: deviceId(),
                  openingFloat: rupeesToPaise(float || "0"),
                },
                "POST",
              );
              onOpened();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <label>
            Opening cash (₹)
            <input
              inputMode="decimal"
              value={float}
              onChange={(e) => setFloat(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-lg wide">Open shift</button>
        </form>
      </div>
    </main>
  );
}

function Counter({
  boot,
  reload,
}: {
  boot: Bootstrap;
  reload: () => Promise<void>;
}) {
  const products = boot.products;
  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState({ name: "", phone: "" });
  const [quotation, setQuotation] = useState<{
    id: string;
    number: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [sheet, setSheet] = useState<
    null | "pay" | "customer" | "cash" | "close" | "bills" | "expense" | "quote"
  >(null);
  const [done, setDone] = useState<{
    invoice: Invoice;
    pending: boolean;
  } | null>(null);
  const [shift, setShift] = useState<ShiftSummary>(boot.shift!);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queued, setQueued] = useState(() => readQueue().length);
  const [reserved, setReserved] = useState(() => reservedCount());
  const [printMode, setPrintMode] = useState<"receipt" | "a4" | "z">("receipt");
  const search = useRef<HTMLInputElement>(null);
  const policy = boot.policy;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const sync = useCallback(async () => {
    if (!readQueue().length) return;
    const r = await syncQueue();
    setQueued(readQueue().length);
    if (r.sent)
      setToast(`${r.sent} offline ${r.sent === 1 ? "bill" : "bills"} synced`);
  }, []);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(() => void sync(), 20000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [sync]);

  const listPrice = useCallback(
    (p: PosProduct, c: Customer | null) => {
      if (c?.priceListId) {
        const item = boot.priceListItems.find(
          (i) => i.priceListId === c.priceListId && i.productId === p.id,
        );
        if (item) return item.pricePaise;
        const list = boot.priceLists.find((l) => l.id === c.priceListId);
        if (list && p.pricePaise !== null)
          return Math.floor(
            (p.pricePaise * (10000 - list.discountBp) + 5000) / 10000,
          );
      }
      return p.pricePaise ?? 0;
    },
    [boot.priceListItems, boot.priceLists],
  );
  function add(p: PosProduct, qty = 1) {
    if (p.gstRateBp === null)
      return setToast(
        `${p.code} has no GST rate. Set it in the workspace before billing.`,
      );
    setLines((ls) =>
      ls.some((l) => l.productId === p.id)
        ? ls.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + qty } : l))
        : [
            ...ls,
            {
              productId: p.id,
              qty,
              rate: listPrice(p, customer),
              discount: 0,
              manual: p.pricePaise === null,
            },
          ],
    );
  }
  function chooseCustomer(c: Customer | null) {
    setCustomer(c);
    setLines((ls) =>
      ls.map((l) =>
        l.manual ? l : { ...l, rate: listPrice(byId.get(l.productId)!, c) },
      ),
    );
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = products.filter(
    (p) =>
      (!category || p.category === category) &&
      terms.every((t) =>
        `${p.code} ${p.name} ${p.barcode} ${p.category}`
          .toLowerCase()
          .includes(t),
      ),
  );
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const supply =
    customer && customer.stateCode !== boot.settings.stateCode
      ? "inter"
      : "intra";
  const bill = priceBill(
    lines.map((l) => ({
      ...l,
      gstRateBp: byId.get(l.productId)?.gstRateBp ?? 0,
    })),
    supply,
  );
  /** Smallest line total this cashier may charge. */
  const floor = (l: Line) => {
    const p = byId.get(l.productId)!;
    const base = listPrice(p, customer);
    return policy.admin
      ? 0
      : Math.floor((base * l.qty * (10000 - policy.capBp)) / 10000);
  };
  const problems = lines.flatMap((l) => {
    const p = byId.get(l.productId)!;
    const out: string[] = [];
    if (p.pricePaise !== null && l.rate > p.pricePaise)
      out.push(`${p.code}: above MRP`);
    if (l.rate <= 0) out.push(`${p.code}: enter a price`);
    if (l.rate * l.qty - l.discount < floor(l))
      out.push(`${p.code}: below your discount limit`);
    return out;
  });
  function reset() {
    setLines([]);
    setCustomer(null);
    setWalkIn({ name: "", phone: "" });
    setQuotation(null);
    setNotes("");
    search.current?.focus();
  }

  async function complete(payments: Payment[]) {
    const date = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const number = await nextNumber(date);
    setReserved(reservedCount());
    const payload: InvoiceInput = {
      id: crypto.randomUUID(),
      deviceId: deviceId(),
      seq: number.seq,
      fy: number.fy,
      date,
      shiftId: shift.id,
      customerId: customer?.id ?? null,
      walkIn,
      quotationId: quotation?.id ?? null,
      lines: lines.map(({ productId, qty, rate, discount }) => ({
        productId,
        qty,
        rate,
        discount,
      })),
      payments,
      notes,
      offline: false,
    };
    const printed = invoiceNumber(number.prefix, number.fy, number.seq);
    try {
      const r = await api<{ invoice: Invoice }>(
        "/pos/invoices",
        payload,
        "POST",
      );
      setDone({ invoice: r.invoice, pending: false });
      api<ShiftSummary>(`/pos/shifts/${shift.id}`)
        .then(setShift)
        .catch(() => undefined);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Network failure: keep the legally numbered bill and sync it later.
      const offline = { ...payload, offline: true };
      writeQueue([...readQueue(), { payload: offline, number: printed }]);
      setQueued(readQueue().length);
      setDone({ invoice: localInvoice(offline, printed), pending: true });
    }
    reset();
  }
  function localInvoice(p: InvoiceInput, number: string): Invoice {
    return {
      id: p.id,
      number,
      date: p.date,
      status: "issued",
      customerId: p.customerId,
      customer: {
        name: customer?.name || p.walkIn.name || "Walk-in customer",
        phone: customer?.phone || p.walkIn.phone,
        gstin: customer?.gstin ?? "",
        address: customer?.address ?? "",
        stateCode: customer?.stateCode ?? boot.settings.stateCode,
      },
      supply,
      placeOfSupply: customer?.stateCode ?? boot.settings.stateCode,
      taxable: bill.taxable,
      cgst: bill.cgst,
      sgst: bill.sgst,
      igst: bill.igst,
      roundOff: bill.roundOff,
      total: bill.total,
      paid: p.payments.reduce((n, x) => n + x.amount, 0),
      credited: 0,
      refunded: 0,
      cashier: boot.cashier,
      quotationId: p.quotationId,
      shortfall: false,
      notes: p.notes,
      createdAt: new Date().toISOString(),
      lines: bill.lines.map((l, i) => {
        const prod = byId.get(l.productId)!;
        return {
          lineNo: i + 1,
          productId: l.productId,
          code: prod.code,
          name: prod.name,
          hsn: prod.hsn,
          unit: prod.unit,
          qty: l.qty,
          mrp: prod.pricePaise,
          rate: l.rate,
          discount: l.discount,
          gstRateBp: l.gstRateBp,
          taxable: l.taxable,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          total: l.total,
          returnedQty: 0,
          unpostedQty: 0,
        };
      }),
      payments: p.payments.map((x) => ({ ...x, kind: "sale", date: p.date })),
      creditNotes: [],
    };
  }
  const print = (mode: "receipt" | "a4" | "z") => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="pos">
      <header className="pos-bar">
        <a className="app-brand" href="/pos">
          <Mark />
          <span>
            LENORE <small>Billing</small>
          </span>
        </a>
        <span className={`pos-status ${online ? "" : "offline"}`}>
          {online ? (
            `Shift · ${shift.openedBy}`
          ) : (
            <>
              <CloudOff size={14} aria-hidden="true" /> Offline · bills will
              sync
            </>
          )}
          {queued > 0 && ` · ${queued} to sync`}
        </span>
        <nav className="pos-actions" aria-label="Counter actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSheet("bills")}
          >
            <ReceiptIcon size={16} aria-hidden="true" /> Bills
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSheet("cash")}
          >
            <ArrowLeftRight size={16} aria-hidden="true" /> Cash in/out
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSheet("expense")}
          >
            <Banknote size={16} aria-hidden="true" /> Expense
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSheet("close")}
          >
            <LogOut size={16} aria-hidden="true" /> Close shift
          </button>
        </nav>
      </header>
      <div className="pos-body">
        <section className="pos-catalog" aria-label="Products">
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const v = query.trim().toLowerCase();
              if (/^lq-\d{4}-\d+$/i.test(v)) return setSheet("quote");
              const exact = products.find(
                (p) =>
                  p.barcode.toLowerCase() === v || p.code.toLowerCase() === v,
              );
              if (exact) {
                add(exact);
                setQuery("");
              } else if (results.length === 1) {
                add(results[0]);
                setQuery("");
              }
            }}
          >
            <Search size={18} aria-hidden="true" />
            <input
              ref={search}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan barcode, code, name or LQ- quote number"
              aria-label="Scan or search products"
              autoComplete="off"
            />
          </form>
          <nav className="chip-row" aria-label="Categories">
            <button
              className="chip"
              aria-pressed={!category}
              onClick={() => setCategory("")}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className="chip"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
              >
                {c}
              </button>
            ))}
          </nav>
          <ul className="pos-grid">
            {results.slice(0, 120).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => add(p)}
                  className={p.gstRateBp === null ? "warn" : ""}
                >
                  <span className="pos-code">
                    {p.code}
                    {p.bin && ` · ${p.bin}`}
                  </span>
                  <strong>{p.name}</strong>
                  <span className="pos-price">
                    {p.pricePaise === null
                      ? "Price on request"
                      : money(p.pricePaise)}
                  </span>
                  <span className={`pos-stock ${p.stock <= 0 ? "out" : ""}`}>
                    {p.stock} {p.unit}
                  </span>
                  {p.gstRateBp === null && (
                    <span className="pos-flag">No GST rate</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="pos-bill" aria-label="Current bill">
          <button className="pos-customer" onClick={() => setSheet("customer")}>
            <UserRound size={18} aria-hidden="true" />
            <span>
              <strong>
                {customer?.name ?? (walkIn.name || "Walk-in customer")}
              </strong>
              <small>
                {customer
                  ? `${customer.gstin ? `GSTIN ${customer.gstin} · ` : ""}Balance ${money(customer.balancePaise)}${supply === "inter" ? " · IGST" : ""}`
                  : "Tap to choose or add a customer"}
              </small>
            </span>
          </button>
          {quotation && (
            <p className="banner warn">
              From quotation {quotation.number}{" "}
              <button className="text-btn" onClick={() => setQuotation(null)}>
                Unlink
              </button>
            </p>
          )}
          <ul className="pos-lines">
            {lines.map((l) => {
              const p = byId.get(l.productId)!;
              const priced = bill.lines.find(
                (x) => x.productId === l.productId,
              )!;
              const update = (patch: Partial<Line>) =>
                setLines((ls) =>
                  ls.map((x) =>
                    x.productId === l.productId ? { ...x, ...patch } : x,
                  ),
                );
              return (
                <li key={l.productId}>
                  <div className="pos-line-head">
                    <strong>{p.name}</strong>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${p.code}`}
                      onClick={() =>
                        setLines((ls) =>
                          ls.filter((x) => x.productId !== l.productId),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <span className="muted">
                    {p.code} · GST {(p.gstRateBp ?? 0) / 100}% · stock {p.stock}
                  </span>
                  <div className="pos-line-controls">
                    <div
                      className="stepper compact"
                      role="group"
                      aria-label={`Quantity of ${p.code}`}
                    >
                      <button
                        aria-label="Decrease"
                        onClick={() =>
                          l.qty > 1
                            ? update({ qty: l.qty - 1 })
                            : setLines((ls) =>
                                ls.filter((x) => x.productId !== l.productId),
                              )
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        aria-label={`Quantity of ${p.code}`}
                        inputMode="numeric"
                        value={l.qty}
                        onChange={(e) =>
                          update({
                            qty: Math.max(
                              1,
                              Number(e.target.value.replace(/\D/g, "")) || 1,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label="Increase"
                        onClick={() => update({ qty: l.qty + 1 })}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <label className="mini-field">
                      <span>Rate</span>
                      <input
                        inputMode="decimal"
                        aria-label={`Rate for ${p.code}`}
                        defaultValue={paiseInput(l.rate)}
                        key={`${l.productId}-${l.rate}`}
                        onBlur={(e) =>
                          update({
                            rate: rupeesToPaise(e.target.value || "0"),
                            manual: true,
                          })
                        }
                      />
                    </label>
                    <label className="mini-field">
                      <span>Disc ₹</span>
                      <input
                        inputMode="decimal"
                        aria-label={`Discount for ${p.code}`}
                        defaultValue={l.discount ? paiseInput(l.discount) : ""}
                        key={`${l.productId}-d-${l.discount}`}
                        onBlur={(e) =>
                          update({
                            discount: Math.max(
                              0,
                              rupeesToPaise(e.target.value || "0"),
                            ),
                          })
                        }
                      />
                    </label>
                    <strong className="pos-line-total">
                      {money(priced?.total ?? 0)}
                    </strong>
                  </div>
                </li>
              );
            })}
            {!lines.length && (
              <li className="empty-state">
                Scan or tap products to start a bill.
              </li>
            )}
          </ul>
          <div className="pos-totals">
            <div>
              <span>Taxable</span>
              <span>{money(bill.taxable)}</span>
            </div>
            {supply === "inter" ? (
              <div>
                <span>IGST</span>
                <span>{money(bill.igst)}</span>
              </div>
            ) : (
              <>
                <div>
                  <span>CGST</span>
                  <span>{money(bill.cgst)}</span>
                </div>
                <div>
                  <span>SGST</span>
                  <span>{money(bill.sgst)}</span>
                </div>
              </>
            )}
            {bill.roundOff !== 0 && (
              <div>
                <span>Round off</span>
                <span>{money(bill.roundOff)}</span>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <span>{money(bill.total)}</span>
            </div>
          </div>
          {problems.length > 0 && (
            <p className="banner error">{problems.join(" · ")}</p>
          )}
          <div className="pos-pay-row">
            <button
              className="btn btn-ghost"
              onClick={reset}
              disabled={!lines.length}
            >
              Clear
            </button>
            <button
              className="btn btn-primary btn-lg grow"
              disabled={!lines.length || !!problems.length || bill.total <= 0}
              onClick={() => setSheet("pay")}
            >
              Pay {money(bill.total)}
            </button>
          </div>
        </section>
      </div>

      {sheet === "pay" && (
        <PaySheet
          total={bill.total}
          customer={customer}
          payment={boot.settings.payment}
          onClose={() => setSheet(null)}
          onComplete={async (payments) => {
            await complete(payments);
            setSheet(null);
          }}
        />
      )}
      {sheet === "customer" && (
        <CustomerSheet
          stateCode={boot.settings.stateCode}
          walkIn={walkIn}
          setWalkIn={setWalkIn}
          notes={notes}
          setNotes={setNotes}
          onPick={(c) => {
            chooseCustomer(c);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "quote" && (
        <QuoteLoader
          number={query.trim()}
          onClose={() => {
            setSheet(null);
            setQuery("");
          }}
          onLoad={(q) => {
            setQuotation({ id: q.id, number: q.number });
            setWalkIn({ name: q.customerName, phone: q.customerPhone });
            const missing: string[] = [];
            const next: Line[] = [];
            for (const i of q.items) {
              const p = byId.get(i.productId);
              const rate = Math.min(
                i.mrpPaise ?? i.unitPricePaise ?? 0,
                p?.pricePaise ?? Infinity,
              );
              if (!p || p.gstRateBp === null) {
                missing.push(i.code);
                continue;
              }
              next.push({
                productId: p.id,
                qty: i.quantity,
                rate,
                // The quoted net price, never more than the line itself if MRP has since changed.
                discount: Math.max(
                  0,
                  Math.min(
                    rate * i.quantity,
                    rate * i.quantity - (i.unitPricePaise ?? rate) * i.quantity,
                  ),
                ),
                manual: true,
              });
            }
            setLines(next);
            setSheet(null);
            setQuery("");
            setToast(
              missing.length
                ? `Loaded. Not billable: ${missing.join(", ")}`
                : `Quotation ${q.number} loaded`,
            );
          }}
        />
      )}
      {sheet === "cash" && (
        <CashSheet
          shift={shift}
          onClose={() => setSheet(null)}
          onSaved={(s) => {
            setShift(s);
            setSheet(null);
            setToast("Cash movement recorded");
          }}
        />
      )}
      {sheet === "expense" && (
        <ExpenseSheet
          shiftId={shift.id}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            setToast("Expense recorded");
            api<ShiftSummary>(`/pos/shifts/${shift.id}`)
              .then(setShift)
              .catch(() => undefined);
          }}
        />
      )}
      {sheet === "close" && (
        <CloseSheet
          shift={shift}
          queued={queued}
          onClose={() => setSheet(null)}
          onClosed={(s) => {
            setShift(s);
            setPrintMode("z");
            setTimeout(() => {
              window.print();
              void reload();
            }, 50);
          }}
          onPrintX={() => print("z")}
        />
      )}
      {sheet === "bills" && (
        <BillsSheet
          shiftId={shift.id}
          onClose={() => setSheet(null)}
          onOpen={(i) => {
            setDone({ invoice: i, pending: false });
            setSheet(null);
          }}
        />
      )}
      {done && (
        <DoneSheet
          done={done}
          footer={boot.settings.receiptFooter}
          payment={boot.settings.payment}
          onClose={() => {
            setDone(null);
            search.current?.focus();
          }}
          onPrint={print}
          onChange={(invoice) => setDone({ invoice, pending: false })}
          shiftId={shift.id}
          notify={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className="print-area" aria-hidden="true">
        {printMode === "z" ? (
          <ZReport shift={shift} />
        ) : done ? (
          printMode === "a4" ? (
            <TaxInvoice
              invoice={done.invoice}
              payment={boot.settings.payment}
            />
          ) : (
            <Receipt
              invoice={done.invoice}
              footer={boot.settings.receiptFooter}
              pending={done.pending}
              payment={boot.settings.payment}
            />
          )
        ) : null}
      </div>
      <p className="pos-foot fine-print">
        {reserved} invoice numbers reserved on this counter
      </p>
    </div>
  );
}

function PaySheet({
  total,
  customer,
  payment,
  onClose,
  onComplete,
}: {
  total: number;
  customer: Customer | null;
  payment?: PaymentDetails;
  onClose: () => void;
  onComplete: (p: Payment[]) => Promise<void>;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  const remaining = total - paid;
  const [amount, setAmount] = useState(paiseInput(total));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tendered = rupeesToPaise(amount || "0");
  const change =
    method === "cash" && tendered > remaining ? tendered - remaining : 0;
  function addPayment() {
    const value = Math.min(tendered, remaining);
    if (value <= 0) return;
    setPayments((ps) => [
      ...ps,
      { id: crypto.randomUUID(), method, amount: value, reference },
    ]);
    setAmount(paiseInput(Math.max(0, remaining - value)));
    setReference("");
    return value;
  }
  async function finish(list: Payment[]) {
    setBusy(true);
    setError("");
    try {
      await onComplete(list);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={`Payment · ${money(total)}`} onClose={onClose}>
      <div className="sheet-section">
        <div
          className="segmented wide"
          role="group"
          aria-label="Payment method"
        >
          {paymentMethods.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
            >
              {methodLabel[m]}
            </button>
          ))}
        </div>
        <label>
          {method === "cash" ? "Cash received (₹)" : "Amount (₹)"}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        {method === "cash" && (
          <div className="chip-row">
            {[
              remaining,
              ...[10000, 50000, 100000, 200000].map(
                (n) => Math.ceil(remaining / n) * n,
              ),
            ]
              .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
              .slice(0, 5)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  className="chip"
                  onClick={() => setAmount(paiseInput(v))}
                >
                  {money(v)}
                </button>
              ))}
          </div>
        )}
        {method === "upi" &&
          (payment?.upiId ? (
            tendered > 0 && (
              <UpiQr
                payment={payment}
                amount={Math.min(tendered, remaining)}
                note="Lenore bill"
                size={200}
              />
            )
          ) : (
            <p className="muted">
              Add the shop&apos;s UPI ID under Workspace → Billing settings to
              show a scan-to-pay QR code here.
            </p>
          ))}
        {method !== "cash" && (
          <label>
            Reference (UTR / card slip)
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        )}
        {change > 0 && (
          <p className="pos-change">
            Give change: <strong>{money(change)}</strong>
          </p>
        )}
        {payments.length > 0 && (
          <ul className="summary-lines">
            {payments.map((p) => (
              <li key={p.id}>
                <span>
                  {methodLabel[p.method]}
                  {p.reference && ` · ${p.reference}`}
                </span>
                <span>
                  {money(p.amount)}{" "}
                  <button
                    className="icon-btn"
                    aria-label="Remove payment"
                    onClick={() =>
                      setPayments((ps) => ps.filter((x) => x.id !== p.id))
                    }
                  >
                    <X size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Paid {money(paid)} · Remaining {money(remaining)}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-actions">
        {remaining > 0 && tendered < remaining && (
          <button
            className="btn btn-ghost"
            disabled={busy || tendered <= 0}
            onClick={addPayment}
          >
            Add part payment
          </button>
        )}
        {customer
          ? remaining > 0 && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => finish(payments)}
              >
                Balance on credit
              </button>
            )
          : null}
        <button
          className="btn btn-primary grow"
          disabled={busy || (tendered < remaining && remaining > 0)}
          onClick={() => {
            const list =
              remaining > 0
                ? [
                    ...payments,
                    {
                      id: crypto.randomUUID(),
                      method,
                      amount: remaining,
                      reference,
                    },
                  ]
                : payments;
            void finish(list);
          }}
        >
          {busy ? "Saving…" : "Complete sale"}
        </button>
      </div>
    </Sheet>
  );
}

function CustomerSheet({
  stateCode,
  walkIn,
  setWalkIn,
  notes,
  setNotes,
  onPick,
  onClose,
}: {
  stateCode: string;
  walkIn: { name: string; phone: string };
  setWalkIn: (w: { name: string; phone: string }) => void;
  notes: string;
  setNotes: (n: string) => void;
  onPick: (c: Customer | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      api<Customer[]>(`/pos/customers?q=${encodeURIComponent(q)}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Sheet title="Customer" onClose={onClose} wide>
      <div className="sheet-section">
        <div className="field-row">
          <label>
            Walk-in name (optional)
            <input
              value={walkIn.name}
              onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })}
            />
          </label>
          <label>
            Walk-in phone
            <input
              type="tel"
              value={walkIn.phone}
              onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
            />
          </label>
        </div>
        <label>
          Bill note
          <input
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button className="btn btn-ghost" onClick={() => onPick(null)}>
          Use walk-in customer
        </button>
        <label className="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved customers by name, phone or GSTIN"
            aria-label="Search customers"
          />
        </label>
        <ul className="quote-list">
          {rows.map((c) => (
            <li key={c.id}>
              <button onClick={() => onPick(c)}>
                <span className="quote-list-main">
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {[c.phone, c.gstin, c.kind].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="quote-list-side">
                  {c.balancePaise > 0 && (
                    <span className="pill pill-lost">
                      Owes {money(c.balancePaise)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!adding ? (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" /> New customer
          </button>
        ) : (
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const c = await api<Customer>(
                  "/pos/customers",
                  {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    gstin: String(f.get("gstin") ?? "").toUpperCase(),
                    stateCode: f.get("state"),
                    address: f.get("address"),
                    kind: f.get("kind"),
                    priceListId: null,
                    creditLimitPaise: 0,
                    notes: "",
                  },
                  "POST",
                );
                onPick(c);
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            <div className="field-row">
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" />
              </label>
            </div>
            <div className="field-row">
              <label>
                GSTIN (B2B)
                <input name="gstin" maxLength={15} />
              </label>
              <label>
                State
                <select name="state" defaultValue={stateCode}>
                  {gstStates.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Address
              <input name="address" />
            </label>
            <label>
              Type
              <select name="kind">
                <option value="retail">Retail</option>
                <option value="dealer">Dealer</option>
                <option value="contractor">Contractor</option>
              </select>
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary">Save and use</button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

type QuoteItems = {
  id: string;
  number: string;
  status: string;
  customerName: string;
  customerPhone: string;
  items: {
    productId: string;
    code: string;
    quantity: number;
    mrpPaise: number | null;
    unitPricePaise: number | null;
  }[];
};
function QuoteLoader({
  number,
  onLoad,
  onClose,
}: {
  number: string;
  onLoad: (q: QuoteItems) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [q, setQ] = useState<QuoteItems | null>(null);
  useEffect(() => {
    api<QuoteItems>(`/pos/quotation?number=${encodeURIComponent(number)}`)
      .then(setQ)
      .catch((e) => setError(errorMessage(e)));
  }, [number]);
  return (
    <Sheet title={`Quotation ${number.toUpperCase()}`} onClose={onClose}>
      <div className="sheet-section">
        {error && <p className="error">{error}</p>}
        {q && (
          <>
            <p>
              {q.customerName} · {q.items.length} products · status {q.status}
            </p>
            <button className="btn btn-primary" onClick={() => onLoad(q)}>
              <FileText size={16} aria-hidden="true" /> Load into bill
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CashSheet({
  shift,
  onClose,
  onSaved,
}: {
  shift: ShiftSummary;
  onClose: () => void;
  onSaved: (s: ShiftSummary) => void;
}) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [error, setError] = useState("");
  return (
    <Sheet title="Cash in / out" onClose={onClose}>
      <form
        className="sheet-section"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            onSaved(
              await api<ShiftSummary>(
                `/pos/shifts/${shift.id}/cash`,
                {
                  id: crypto.randomUUID(),
                  kind,
                  amount: rupeesToPaise(String(f.get("amount"))),
                  reason: f.get("reason"),
                },
                "POST",
              ),
            );
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <div className="segmented wide" role="group" aria-label="Direction">
          <button
            type="button"
            aria-pressed={kind === "in"}
            onClick={() => setKind("in")}
          >
            Cash in
          </button>
          <button
            type="button"
            aria-pressed={kind === "out"}
            onClick={() => setKind("out")}
          >
            Cash out
          </button>
        </div>
        <label>
          Amount (₹)
          <input name="amount" inputMode="decimal" required autoFocus />
        </label>
        <label>
          Reason
          <input
            name="reason"
            required
            minLength={3}
            placeholder="e.g. Bank deposit, change from bank"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">Record</button>
        <p className="muted">
          Expected cash in drawer: {money(shift.expectedCash)}
        </p>
      </form>
    </Sheet>
  );
}

function ExpenseSheet({
  shiftId,
  onClose,
  onSaved,
}: {
  shiftId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <Sheet title="Pay an expense from the drawer" onClose={onClose}>
      <form
        className="sheet-section"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/pos/expenses",
              {
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
                }),
                category: f.get("category"),
                payee: f.get("payee"),
                description: f.get("description"),
                billNumber: "",
                gstin: "",
                amount: rupeesToPaise(String(f.get("amount"))),
                gst: 0,
                method: "cash",
                reference: "",
                shiftId,
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
          Category
          <select name="category">
            {expenseCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Amount (₹)
          <input name="amount" inputMode="decimal" required />
        </label>
        <label>
          Paid to
          <input name="payee" />
        </label>
        <label>
          Note
          <input name="description" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">Record expense</button>
      </form>
    </Sheet>
  );
}

function CloseSheet({
  shift,
  queued,
  onClose,
  onClosed,
  onPrintX,
}: {
  shift: ShiftSummary;
  queued: number;
  onClose: () => void;
  onClosed: (s: ShiftSummary) => void;
  onPrintX: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const difference =
    counted === "" ? null : rupeesToPaise(counted) - shift.expectedCash;
  return (
    <Sheet title="Close shift" onClose={onClose}>
      <div className="sheet-section">
        {queued > 0 && (
          <p className="banner warn">
            {queued} offline bills are still waiting to sync. Reconnect before
            closing.
          </p>
        )}
        <p>
          Bills {shift.invoices.n} · {money(shift.invoices.total)}
        </p>
        <p>
          Expected cash in drawer: <strong>{money(shift.expectedCash)}</strong>
        </p>
        <label>
          Counted cash (₹)
          <input
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            autoFocus
          />
        </label>
        {difference !== null && (
          <p className={difference === 0 ? "success" : "error"}>
            Difference {money(difference)}
          </p>
        )}
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain any difference"
          />
        </label>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onPrintX}>
          <Printer size={16} aria-hidden="true" /> Print X report
        </button>
        <button
          className="btn btn-primary grow"
          disabled={counted === "" || queued > 0}
          onClick={async () => {
            try {
              onClosed(
                await api<ShiftSummary>(
                  `/pos/shifts/${shift.id}/close`,
                  { countedCash: rupeesToPaise(counted), notes },
                  "POST",
                ),
              );
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Close and print Z report
        </button>
      </div>
    </Sheet>
  );
}

function BillsSheet({
  shiftId,
  onClose,
  onOpen,
}: {
  shiftId: string;
  onClose: () => void;
  onOpen: (i: Invoice) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<
    Omit<Invoice, "lines" | "payments" | "creditNotes">[]
  >([]);
  const [all, setAll] = useState(false);
  const queue = readQueue();
  useEffect(() => {
    const t = setTimeout(() => {
      api<typeof rows>(
        `/pos/invoices?q=${encodeURIComponent(q)}${all ? "" : `&shift=${shiftId}`}`,
      )
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, all, shiftId]);
  return (
    <Sheet title="Bills" onClose={onClose} wide>
      <div className="sheet-section">
        {queue.length > 0 && (
          <div className="banner warn">
            Waiting to sync:{" "}
            {queue
              .map((x) => `${x.number}${x.error ? ` (${x.error})` : ""}`)
              .join(", ")}
          </div>
        )}
        <div className="field-row">
          <label className="search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Invoice number or customer"
              aria-label="Search bills"
            />
          </label>
          <label className="switch-row">
            <span>All shifts</span>
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />
          </label>
        </div>
        <ul className="quote-list">
          {rows.map((i) => (
            <li key={i.id}>
              <button
                onClick={() =>
                  api<Invoice>(`/pos/invoices/${i.id}`).then(onOpen)
                }
              >
                <span className="quote-list-main">
                  <strong>{i.number}</strong>
                  <span className="muted">
                    {i.customer.name} · {i.date}
                  </span>
                </span>
                <span className="quote-list-side">
                  <strong>{money(i.total)}</strong>
                  {i.status === "cancelled" ? (
                    <span className="pill pill-lost">Returned</span>
                  ) : balanceOf(i) > 0 ? (
                    <span className="pill">Due {money(balanceOf(i))}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function DoneSheet({
  done,
  footer,
  payment,
  onClose,
  onPrint,
  onChange,
  shiftId,
  notify,
}: {
  done: { invoice: Invoice; pending: boolean };
  footer: string;
  payment?: PaymentDetails;
  onClose: () => void;
  onPrint: (m: "receipt" | "a4") => void;
  onChange: (i: Invoice) => void;
  shiftId: string;
  notify: (m: string) => void;
}) {
  const i = done.invoice;
  const [mode, setMode] = useState<"main" | "return" | "collect">("main");
  const due = balanceOf(i);
  const text = [
    `*LENORE · Invoice ${i.number}*`,
    `${i.customer.name} · ${i.date}`,
    ...i.lines.map((l) => `${l.name} × ${l.qty} = ${money(l.total)}`),
    `*Total ${money(i.total)}*${due > 0 ? ` · Balance ${money(due)}` : ""}`,
    ...(due > 0 && payment?.upiId ? [`Pay by UPI: ${payment.upiId}`] : []),
    "Thank you for shopping at Lenore, Kuttiady.",
  ].join("\n");
  return (
    <Sheet
      title={`${i.number}${done.pending ? " · saved offline" : ""}`}
      onClose={onClose}
      wide
    >
      {mode === "main" && (
        <>
          <div className="sheet-section">
            <p className="pos-done-total">{money(i.total)}</p>
            <p className="muted center">
              {i.customer.name}
              {due > 0 && ` · Balance due ${money(due)}`}
              {i.credited > 0 && ` · Credited ${money(i.credited)}`}
            </p>
            {due > 0 && payment?.upiId && (
              <UpiQr
                payment={payment}
                amount={due}
                note={i.number}
                size={200}
              />
            )}
            {i.shortfall && (
              <p className="banner warn">
                Some items exceeded recorded stock. An admin should review
                stock.
              </p>
            )}
            <div className="share-grid">
              <button className="share-tile" onClick={() => onPrint("receipt")}>
                <Printer size={20} aria-hidden="true" /> Receipt (80 mm)
              </button>
              <button className="share-tile" onClick={() => onPrint("a4")}>
                <FileText size={20} aria-hidden="true" /> A4 tax invoice
              </button>
              {serialSupported() && (
                <button
                  className="share-tile"
                  onClick={async () => {
                    try {
                      if (!printerConnected()) await connectPrinter();
                      await printEscPos(
                        i,
                        footer,
                        i.payments.some((p) => p.method === "cash"),
                        payment,
                      );
                    } catch (e) {
                      notify(errorMessage(e));
                    }
                  }}
                >
                  <Printer size={20} aria-hidden="true" /> Direct print + drawer
                </button>
              )}
              <a
                className="share-tile"
                href={whatsappLink(
                  text,
                  i.customer.phone ? withCountry(i.customer.phone) : "",
                )}
                target="_blank"
                rel="noopener"
              >
                <Wallet size={20} aria-hidden="true" /> WhatsApp bill
              </a>
              {!done.pending && i.status !== "cancelled" && (
                <button
                  className="share-tile"
                  onClick={() => setMode("return")}
                >
                  <Undo2 size={20} aria-hidden="true" /> Return items
                </button>
              )}
              {!done.pending && due > 0 && (
                <button
                  className="share-tile"
                  onClick={() => setMode("collect")}
                >
                  <Banknote size={20} aria-hidden="true" /> Collect payment
                </button>
              )}
            </div>
          </div>
          <div className="sheet-actions">
            <button className="btn btn-primary grow" onClick={onClose}>
              <RefreshCw size={16} aria-hidden="true" /> New bill
            </button>
          </div>
        </>
      )}
      {mode === "return" && (
        <ReturnForm
          invoice={i}
          shiftId={shiftId}
          onDone={(inv, refunded) => {
            onChange(inv);
            setMode("main");
            notify(
              refunded ? `Refund ${money(refunded)}` : "Credit note issued",
            );
          }}
          onCancel={() => setMode("main")}
        />
      )}
      {mode === "collect" && (
        <CollectForm
          invoice={i}
          shiftId={shiftId}
          payment={payment}
          onDone={(inv) => {
            onChange(inv);
            setMode("main");
            notify("Payment recorded");
          }}
          onCancel={() => setMode("main")}
        />
      )}
    </Sheet>
  );
}

export function ReturnForm({
  invoice,
  shiftId,
  onDone,
  onCancel,
}: {
  invoice: Invoice;
  shiftId: string | null;
  onDone: (i: Invoice, refunded: number) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([lineNo, q]) => ({ lineNo: Number(lineNo), qty: q }));
  return (
    <div className="sheet-section">
      <ul className="summary-lines">
        {invoice.lines.map((l) => (
          <li key={l.lineNo}>
            <span>
              <strong>{l.name}</strong>
              <small className="muted">
                Sold {l.qty} · returned {l.returnedQty}
              </small>
            </span>
            <input
              className="count-input"
              inputMode="numeric"
              aria-label={`Return quantity for ${l.code}`}
              value={qty[l.lineNo] ?? ""}
              onChange={(e) =>
                setQty({
                  ...qty,
                  [l.lineNo]: Math.min(
                    l.qty - l.returnedQty,
                    Number(e.target.value.replace(/\D/g, "")) || 0,
                  ),
                })
              }
            />
          </li>
        ))}
      </ul>
      <label className="switch-row">
        <span>Return goods to stock (uncheck if damaged)</span>
        <input
          type="checkbox"
          checked={restock}
          onChange={(e) => setRestock(e.target.checked)}
        />
      </label>
      <label>
        Refund method (if money is due back)
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {paymentMethods.map((m) => (
            <option key={m} value={m}>
              {methodLabel[m]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Wrong size, customer changed mind"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Back
        </button>
        <button
          className="btn btn-primary grow"
          disabled={!lines.length || reason.trim().length < 3}
          onClick={async () => {
            try {
              const r = await api<{ invoice: Invoice; refunded: number }>(
                `/pos/invoices/${invoice.id}/credit-notes`,
                {
                  id,
                  reason,
                  restock,
                  lines,
                  refundMethod: method,
                  refundReference: "",
                  shiftId,
                },
                "POST",
              );
              onDone(r.invoice, r.refunded);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Issue credit note
        </button>
      </div>
    </div>
  );
}

export function CollectForm({
  invoice,
  shiftId,
  payment,
  onDone,
  onCancel,
}: {
  invoice: Invoice;
  shiftId: string | null;
  payment?: PaymentDetails;
  onDone: (i: Invoice) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(paiseInput(balanceOf(invoice)));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState("");
  return (
    <div className="sheet-section">
      <div className="segmented wide" role="group" aria-label="Method">
        {paymentMethods.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={method === m}
            onClick={() => setMethod(m)}
          >
            {methodLabel[m]}
          </button>
        ))}
      </div>
      <label>
        Amount (₹)
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {method === "upi" && rupeesToPaise(amount || "0") > 0 && (
        <UpiQr
          payment={payment}
          amount={rupeesToPaise(amount)}
          note={invoice.number}
        />
      )}
      {error && <p className="error">{error}</p>}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Back
        </button>
        <button
          className="btn btn-primary grow"
          onClick={async () => {
            try {
              onDone(
                await api<Invoice>(
                  `/pos/invoices/${invoice.id}/payments`,
                  {
                    id: crypto.randomUUID(),
                    date: new Date().toLocaleDateString("en-CA", {
                      timeZone: "Asia/Kolkata",
                    }),
                    method,
                    amount: rupeesToPaise(amount),
                    reference: "",
                    shiftId,
                  },
                  "POST",
                ),
              );
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Record payment
        </button>
      </div>
    </div>
  );
}
