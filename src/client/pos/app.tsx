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
  ScanBarcode,
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
import {
  productImage,
  thumb as thumbUrl,
  whatsappLink,
  withCountry,
} from "../links";
import { Sheet } from "../sales/ui";
import { Scanner } from "../scanner";
import {
  PrintArea,
  Receipt,
  TaxInvoice,
  TestPage,
  ZReport,
  type PrintMode,
} from "./print";
import { UpiQr } from "./qr";
import {
  connectPrinter,
  disconnectPrinter,
  openDrawer,
  printerPrefs,
  restorePrinter,
  savePrinterPrefs,
  testPrint,
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
  /** Discount as a percentage in basis points (1000 = 10%); when set it decides `discount`. */
  pct?: number;
  /** True once the cashier types a price, so customer price lists stop overriding it. */
  manual: boolean;
};
/** A percentage discount follows the line: change qty or rate and the rupees follow. */
const effective = (l: Line): Line =>
  l.pct === undefined
    ? l
    : {
        ...l,
        discount: Math.min(
          l.rate * l.qty,
          Math.round((l.rate * l.qty * l.pct) / 10000),
        ),
      };
/** "10%" or "10 %" → 1000 basis points; plain numbers are rupees. */
const parsePercent = (v: string) => {
  const m = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%\s*$/.exec(v);
  return m ? Math.min(10000, Math.round(Number(m[1]) * 100)) : null;
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
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const out = () => setExpired(true);
    window.addEventListener("lenore:signed-out", out);
    return () => window.removeEventListener("lenore:signed-out", out);
  }, []);
  const load = useCallback(async () => {
    try {
      const s = await api<SessionInfo>("/session");
      setExpired(false);
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
  return (
    <>
      <Counter boot={boot} reload={load} />
      {expired && (
        // Signed out mid-shift: sign in on top, the bill underneath stays.
        <div className="pos-reauth">
          <PosSignIn denied={false} onDone={load} />
        </div>
      )}
    </>
  );
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
  // Live stock: the server's figures minus bills still waiting to sync.
  const [liveStock, setLiveStock] = useState<Record<string, number> | null>(
    null,
  );
  const products = useMemo(
    () =>
      liveStock
        ? boot.products.map((p) =>
            p.id in liveStock ? { ...p, stock: liveStock[p.id] } : p,
          )
        : boot.products,
    [boot.products, liveStock],
  );
  const deduct = useCallback(
    (lines: { productId: string; qty: number }[]) =>
      setLiveStock((s) => {
        const next = {
          ...(s ??
            Object.fromEntries(boot.products.map((p) => [p.id, p.stock]))),
        };
        for (const l of lines)
          next[l.productId] = Math.max(0, (next[l.productId] ?? 0) - l.qty);
        return next;
      }),
    [boot.products],
  );
  const refreshStock = useCallback(async () => {
    try {
      const rows = await api<{ id: string; stock: number }[]>("/pos/stock");
      const next = Object.fromEntries(rows.map((r) => [r.id, r.stock]));
      for (const q of readQueue())
        for (const l of q.payload.lines)
          if (l.productId in next)
            next[l.productId] = Math.max(0, next[l.productId] - l.qty);
      setLiveStock(next);
    } catch {
      // Offline: keep the figures we have.
    }
  }, []);
  const thumb = (p: PosProduct, size: number) => {
    const img = productImage(
      { ...p, posterUrl: p.posterUrl ?? null },
      !!boot.demo,
    );
    return img ? (
      <img
        className="pos-thumb"
        src={thumbUrl(img.src)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        // Offline or no access: fall back to the empty tile.
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    ) : (
      <span className="pos-thumb" aria-hidden="true" />
    );
  };
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
    | null
    | "pay"
    | "customer"
    | "cash"
    | "close"
    | "bills"
    | "expense"
    | "quote"
    | "devices"
    | "keys"
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
  const [printMode, setPrintMode] = useState<PrintMode>("receipt");
  const search = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLElement>(null);
  /** Phones show one pane at a time: the product grid or the bill. */
  const [pane, setPane] = useState<"products" | "bill">("products");
  const narrow = () => window.matchMedia("(max-width: 900px)").matches;
  const [camera, setCamera] = useState(false);
  const [lastScan, setLastScan] = useState("");
  const policy = boot.policy;
  const [printer, setPrinter] = useState(printerConnected);
  useEffect(() => {
    restorePrinter()
      .then(setPrinter)
      .catch(() => undefined);
  }, []);
  // A USB scanner types like a keyboard: whatever has focus, send its
  // keystrokes to the search box so a scan always lands there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        sheet ||
        camera ||
        e.key.length !== 1 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        t.closest("input, textarea, select, [contenteditable]")
      )
        return;
      search.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheet, camera]);

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
    const timer = setInterval(
      () => void sync().then(() => refreshStock()),
      20000,
    );
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [sync, refreshStock]);

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
    // On a phone the bill is on the other tab, so confirm each item added.
    if (narrow()) {
      const had = lines.find((l) => l.productId === p.id)?.qty ?? 0;
      setToast(`Added ${p.name}${had ? ` (now ${had + qty})` : ""}`);
    }
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
  const priced = lines.map(effective);
  const bill = priceBill(
    priced.map((l) => ({
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
  const problems = priced.flatMap((l) => {
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

  const canPay = lines.length > 0 && !problems.length && bill.total > 0;
  // Counter shortcuts. Function keys work even while typing in the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      const k = e.key;
      const typing = (e.target as HTMLElement).closest(
        "input, textarea, select",
      );
      const go = (s: typeof sheet) => {
        e.preventDefault();
        setSheet(s);
      };
      if (camera) return;
      if (k === "F1") return go("keys");
      if (sheet) return;
      const last = lines[lines.length - 1];
      if (k === "F2" || (k === "/" && !typing)) {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      } else if (k === "F3") go("customer");
      else if (k === "F4") {
        e.preventDefault();
        if (canPay) setSheet("pay");
      } else if (k === "F6") go("bills");
      else if (k === "F7") go("cash");
      else if (k === "F8") go("expense");
      else if (k === "F9") go("devices");
      else if (e.altKey && last && (k === "ArrowUp" || k === "ArrowDown")) {
        e.preventDefault();
        const qty = last.qty + (k === "ArrowUp" ? 1 : -1);
        setLines((ls) =>
          qty < 1
            ? ls.slice(0, -1)
            : ls.map((l) => (l === last ? { ...l, qty } : l)),
        );
      } else if (e.altKey && last && k === "Delete") {
        e.preventDefault();
        setLines((ls) => ls.slice(0, -1));
      } else if (e.ctrlKey && k === "Delete" && lines.length) {
        e.preventDefault();
        reset();
        setToast("Bill cleared");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      lines: priced.map(({ productId, qty, rate, discount }) => ({
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
      void autoPrint(r.invoice);
      void refreshStock();
      api<ShiftSummary>(`/pos/shifts/${shift.id}`)
        .then(setShift)
        .catch(() => undefined);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Network failure: keep the legally numbered bill and sync it later.
      const offline = { ...payload, offline: true };
      writeQueue([...readQueue(), { payload: offline, number: printed }]);
      setQueued(readQueue().length);
      deduct(offline.lines);
      const local = localInvoice(offline, printed);
      setDone({ invoice: local, pending: true });
      void autoPrint(local);
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
  const print = (mode: PrintMode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 150);
  };
  /** Prints a finished bill in the counter's chosen format, if auto-print is on. */
  async function autoPrint(invoice: Invoice) {
    const prefs = printerPrefs();
    if (!prefs.autoPrint) return;
    if (prefs.billFormat !== "direct") return print(prefs.billFormat);
    try {
      if (!printerConnected() && !(await restorePrinter()))
        throw new Error("Receipt printer not connected. Open Devices.");
      await printEscPos(
        invoice,
        boot.settings.receiptFooter,
        invoice.payments.some((p) => p.method === "cash"),
        boot.settings.payment,
      );
    } catch (e) {
      setToast(errorMessage(e));
    }
  }

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
            onClick={() => setSheet("devices")}
            title={printer ? "Receipt printer connected" : "No receipt printer"}
          >
            <Printer size={16} aria-hidden="true" /> Devices
            <span
              className={`pos-dot${printer ? " on" : ""}`}
              aria-label={
                printer ? "printer connected" : "printer not connected"
              }
            />
          </button>
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
      <div className="pos-tabs" role="tablist" aria-label="Billing view">
        <button
          role="tab"
          aria-selected={pane === "products"}
          onClick={() => setPane("products")}
        >
          Products
        </button>
        <button
          role="tab"
          aria-selected={pane === "bill"}
          onClick={() => setPane("bill")}
        >
          Bill
          {lines.length > 0 && (
            <span className="pos-tab-count">
              {lines.reduce((n, l) => n + l.qty, 0)} · {money(bill.total)}
            </span>
          )}
        </button>
      </div>
      <div className={`pos-body show-${pane}`}>
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
              } else if (v && !results.length) {
                setToast(`No product with barcode or code ${query.trim()}`);
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
            <button
              type="button"
              className="pos-cam"
              aria-label="Scan with camera"
              title="Scan with camera"
              onClick={() => setCamera(true)}
            >
              <ScanBarcode size={20} aria-hidden="true" />
            </button>
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
                  title={p.name}
                  className={`pos-tile${p.stock <= 0 ? " out" : ""}`}
                >
                  <span className="pos-media">
                    {thumb(p, 200)}
                    {p.stock <= 0 && (
                      <span className="pos-badge">Out of stock</span>
                    )}
                  </span>
                  <span className="pos-name">{p.name}</span>
                  <span className="pos-meta">
                    {p.code}
                    {p.bin && ` · ${p.bin}`}
                    {p.gstRateBp === null ? (
                      <em className="pos-flag">No GST</em>
                    ) : (
                      ` · GST ${p.gstRateBp / 100}%`
                    )}
                  </span>
                  <span className="pos-foot">
                    <b className="pos-price">
                      {p.pricePaise === null
                        ? "On request"
                        : money(p.pricePaise)}
                    </b>
                    <span className={`pos-stock${p.stock <= 0 ? " out" : ""}`}>
                      {p.stock} {p.unit}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="pos-bill" aria-label="Current bill" ref={billRef}>
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
                    {thumb(p, 40)}
                    <span className="pos-line-title">
                      <strong>{p.name}</strong>
                      <span className="muted">
                        {p.code} · GST {(p.gstRateBp ?? 0) / 100}% ·{" "}
                        <span className={p.stock < l.qty ? "short" : ""}>
                          stock {p.stock}
                        </span>
                      </span>
                    </span>
                    <strong className="pos-line-total">
                      {money(priced?.total ?? 0)}
                    </strong>
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
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) =>
                          e.key === "Enter" && e.currentTarget.blur()
                        }
                        onBlur={(e) =>
                          update({
                            rate: rupeesToPaise(e.target.value || "0"),
                            manual: true,
                          })
                        }
                      />
                    </label>
                    <div className="mini-field disc-field">
                      <button
                        type="button"
                        className="disc-unit"
                        aria-label={
                          l.pct === undefined
                            ? `Switch ${p.code} discount to percent`
                            : `Switch ${p.code} discount to rupees`
                        }
                        onClick={() =>
                          l.pct === undefined
                            ? update({
                                pct:
                                  l.rate * l.qty
                                    ? Math.round(
                                        (l.discount * 10000) / (l.rate * l.qty),
                                      )
                                    : 0,
                              })
                            : update({
                                pct: undefined,
                                discount: effective(l).discount,
                              })
                        }
                      >
                        {l.pct === undefined ? "Disc ₹" : "Disc %"}
                      </button>
                      <input
                        inputMode="decimal"
                        aria-label={`Discount for ${p.code}`}
                        placeholder={l.pct === undefined ? "₹ or %" : "%"}
                        defaultValue={
                          l.pct !== undefined
                            ? l.pct
                              ? String(l.pct / 100)
                              : ""
                            : l.discount
                              ? paiseInput(l.discount)
                              : ""
                        }
                        key={`${l.productId}-d-${l.discount}-${l.pct}`}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) =>
                          e.key === "Enter" && e.currentTarget.blur()
                        }
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const typedPct = parsePercent(v);
                          if (typedPct !== null || l.pct !== undefined)
                            update({
                              pct:
                                typedPct ??
                                Math.min(
                                  10000,
                                  Math.max(0, Math.round(Number(v || 0) * 100)),
                                ),
                            });
                          else
                            update({
                              discount: Math.max(0, rupeesToPaise(v || "0")),
                            });
                        }}
                      />
                      {l.pct !== undefined && l.pct > 0 && (
                        <small className="disc-amount">
                          −{money(effective(l).discount)}
                        </small>
                      )}
                    </div>
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
          {lines.length > 0 && (
            <label className="mini-field bill-disc">
              <span>Discount on all items %</span>
              <input
                inputMode="decimal"
                placeholder="0"
                aria-label="Discount percentage on all items"
                key={`all-${lines.length}`}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                onBlur={(e) => {
                  const v = e.target.value.trim().replace("%", "");
                  if (!v) return;
                  const pct = Math.min(
                    10000,
                    Math.max(0, Math.round(Number(v) * 100) || 0),
                  );
                  setLines((ls) => ls.map((x) => ({ ...x, pct })));
                }}
              />
            </label>
          )}
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
      {lines.length > 0 && (
        // Phones: total and Pay stay in reach on both tabs.
        <div className="pos-mobile-bar">
          <button
            className="pos-mobile-sum"
            onClick={() => {
              setPane(pane === "bill" ? "products" : "bill");
              window.scrollTo({ top: 0 });
            }}
          >
            <small>
              {pane === "bill"
                ? "+ Add more items"
                : `${lines.reduce((n, l) => n + l.qty, 0)} items · view bill`}
            </small>
            <b>{money(bill.total)}</b>
          </button>
          <button
            className="btn btn-primary"
            disabled={!!problems.length || bill.total <= 0}
            onClick={() => setSheet("pay")}
          >
            Pay
          </button>
        </div>
      )}

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
            // A quotation for a saved customer bills to that customer; prices stay as quoted.
            setCustomer(q.customer);
            setWalkIn(
              q.customer
                ? { name: "", phone: "" }
                : { name: q.customerName, phone: q.customerPhone },
            );
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
      {camera && (
        <Scanner
          continuous
          title="Scan items"
          status={lastScan || undefined}
          onDetect={(raw) => {
            const code = raw.trim().toLowerCase();
            const p = products.find(
              (x) =>
                (x.barcode && x.barcode.toLowerCase() === code) ||
                x.code.toLowerCase() === code,
            );
            if (!p) {
              setLastScan(`${raw}: no product has this barcode or code`);
              return false;
            }
            add(p);
            setLastScan(`Added ${p.code} ${p.name}`);
            return true;
          }}
          onClose={() => {
            setCamera(false);
            setLastScan("");
          }}
        />
      )}
      {sheet === "keys" && (
        <Sheet title="Keyboard shortcuts" onClose={() => setSheet(null)}>
          <dl className="keys">
            {SHORTCUTS.map(([key, what]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </Sheet>
      )}
      {sheet === "devices" && (
        <DevicesSheet
          products={products}
          onTestPrint={print}
          onChange={setPrinter}
          onClose={() => {
            setSheet(null);
            search.current?.focus({ preventScroll: true });
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
          onChange={(invoice) => {
            setDone({ invoice, pending: false });
            // Returns can put items back on the shelf.
            void refreshStock();
          }}
          shiftId={shift.id}
          notify={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <PrintArea>
        {printMode === "test-receipt" || printMode === "test-a4" ? (
          <TestPage a4={printMode === "test-a4"} />
        ) : printMode === "z" ? (
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
      </PrintArea>
      <p className="pos-statusbar fine-print">
        <span>{reserved} invoice numbers reserved on this counter</span>
        <button className="pos-keys-hint" onClick={() => setSheet("keys")}>
          <kbd>F1</kbd> shortcuts · <kbd>F2</kbd> search · <kbd>F4</kbd> pay
        </button>
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
  const completeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        completeRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
          ref={completeRef}
          aria-keyshortcuts="Control+Enter"
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
        <label className="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved customers by name, phone or GSTIN"
            aria-label="Search customers"
            autoFocus
          />
        </label>
        {q.trim() && !rows.length && (
          <p className="muted">No saved customer matches “{q.trim()}”.</p>
        )}
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
      <div className="sheet-section sheet-divided">
        <h3 className="sheet-sub">Walk-in details and bill note</h3>
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
  customer: Customer | null;
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

const SHORTCUTS = [
  ["F1", "Show these shortcuts"],
  ["F2 or /", "Search or scan"],
  ["F3", "Choose customer"],
  ["F4", "Pay"],
  ["Ctrl + Enter", "Complete sale (in payment)"],
  ["F6", "Bills"],
  ["F7", "Cash in / out"],
  ["F8", "Expense"],
  ["F9", "Printers & scanner"],
  ["Alt + ↑ / ↓", "Change quantity of the last item"],
  ["Alt + Delete", "Remove the last item"],
  ["Ctrl + Delete", "Clear the bill"],
  ["P", "Print the finished bill"],
  ["N", "New bill (after a sale)"],
  ["Esc", "Close a window"],
] as const;

function DevicesSheet({
  products,
  onTestPrint,
  onChange,
  onClose,
}: {
  products: PosProduct[];
  onTestPrint: (mode: PrintMode) => void;
  onChange: (connected: boolean) => void;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState(printerPrefs);
  const [connected, setConnected] = useState(printerConnected);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<{ code: string; ms: number } | null>(null);
  const started = useRef(0);
  const run = async (label: string, task: () => Promise<unknown>) => {
    setBusy(true);
    setStatus("");
    try {
      await task();
      setStatus(label);
    } catch (e) {
      // Closing the browser's port picker is not an error worth showing.
      if (!(e instanceof DOMException && e.name === "NotFoundError"))
        setStatus(errorMessage(e));
    } finally {
      const now = printerConnected();
      setConnected(now);
      onChange(now);
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrinterPrefs(next);
  };
  const match = scan
    ? products.find(
        (p) =>
          p.barcode.toLowerCase() === scan.code.toLowerCase() ||
          p.code.toLowerCase() === scan.code.toLowerCase(),
      )
    : undefined;
  return (
    <Sheet title="Printers & scanner" onClose={onClose}>
      <section className="sheet-section">
        <h3 className="devices-head">
          <FileText size={18} aria-hidden="true" /> Bill printing
        </h3>
        <div
          className="segmented wide"
          role="group"
          aria-label="Default bill format"
        >
          {(
            [
              ["receipt", "80 mm receipt"],
              ["a4", "A4 tax invoice"],
              ["direct", "Direct USB"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={prefs.billFormat === id}
              onClick={() => update({ billFormat: id })}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="ret-check">
          <input
            type="checkbox"
            checked={prefs.autoPrint}
            onChange={(e) => update({ autoPrint: e.target.checked })}
          />
          <span>
            <strong>Print automatically after every sale</strong>
            <small>
              Otherwise choose a format on the finished bill each time.
            </small>
          </span>
        </label>
        <div className="devices-row">
          <button
            className="btn btn-ghost"
            onClick={() => onTestPrint("test-receipt")}
          >
            Test 80 mm page
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => onTestPrint("test-a4")}
          >
            Test A4 page
          </button>
        </div>
        <p className="muted">
          80 mm and A4 bills print through the normal print dialog, so any
          printer installed on this computer works: thermal, laser or inkjet.
          Pick the printer and paper size once in the dialog; Chrome remembers
          it. To skip the dialog on the counter PC, start Chrome with{" "}
          <code>--kiosk-printing</code> and it prints straight to the default
          printer.
        </p>
      </section>
      <section className="sheet-section sheet-divided">
        <h3 className="devices-head">
          <Printer size={18} aria-hidden="true" /> Direct USB receipt printer
          <span className={`pos-dot${connected ? " on" : ""}`} />
          <small>{connected ? "Connected" : "Not connected"}</small>
        </h3>
        {serialSupported() ? (
          <>
            <div className="devices-row">
              <label>
                Paper
                <select
                  value={prefs.paperMm}
                  onChange={(e) =>
                    update({ paperMm: Number(e.target.value) as 58 | 80 })
                  }
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </label>
              <label>
                Speed (baud)
                <select
                  value={prefs.baudRate}
                  onChange={(e) => update({ baudRate: Number(e.target.value) })}
                >
                  {[9600, 19200, 38400, 57600, 115200].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="devices-row">
              {connected ? (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => run("Disconnected", disconnectPrinter)}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => run("Printer connected", connectPrinter)}
                >
                  Connect printer
                </button>
              )}
              <button
                className="btn btn-ghost"
                disabled={busy || !connected}
                onClick={() => run("Test page sent", testPrint)}
              >
                Test print
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy || !connected}
                onClick={() => run("Drawer opened", openDrawer)}
              >
                Open drawer
              </button>
            </div>
            {status && (
              <p className="muted" role="status">
                {status}
              </p>
            )}
            <p className="muted">
              Plug the printer in by USB, press Connect and pick it from the
              list. Chrome remembers it, so it reconnects by itself next time.
              Changed speed or paper? Disconnect and connect again. Garbled text
              means the speed is wrong. The usual setting is 9600 or 115200.
            </p>
          </>
        ) : (
          <p className="muted">
            Direct printing needs Chrome or Edge on a computer. You can still
            print every bill through the normal print dialog to any installed
            printer.
          </p>
        )}
      </section>
      <section className="sheet-section">
        <h3 className="devices-head">
          <ScanBarcode size={18} aria-hidden="true" /> Barcode scanner
        </h3>
        <label>
          Scan any product here to test
          <input
            autoFocus
            autoComplete="off"
            placeholder="Click here, then scan"
            onKeyDown={(e) => {
              if (!started.current) started.current = performance.now();
              if (e.key !== "Enter") return;
              e.preventDefault();
              const code = e.currentTarget.value.trim();
              setScan({
                code,
                ms: Math.round(performance.now() - started.current),
              });
              started.current = 0;
              e.currentTarget.value = "";
            }}
          />
        </label>
        {scan && (
          <p className={`banner ${match ? "ok" : "warn"}`} role="status">
            Read <b>{scan.code || "(empty)"}</b> in {scan.ms} ms ·{" "}
            {match
              ? `${match.code} ${match.name}`
              : "no product has this barcode or code"}
          </p>
        )}
        <p className="muted">
          The scanner must send Enter after each code (most do by default). A
          scan that takes over 300 ms usually means it is typing slowly, or
          someone typed by hand. Scans work anywhere on the billing screen.
        </p>
      </section>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const queue = readQueue();
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api<typeof rows>(
        `/pos/invoices?q=${encodeURIComponent(q)}${all ? "" : `&shift=${shiftId}`}`,
      )
        .then((r) => {
          setRows(r);
          setError("");
        })
        .catch((e) => {
          setRows([]);
          setError(errorMessage(e));
        })
        .finally(() => setLoading(false));
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
          <div className="segmented" role="group" aria-label="Which bills">
            <button
              type="button"
              aria-pressed={!all}
              onClick={() => setAll(false)}
            >
              This shift
            </button>
            <button
              type="button"
              aria-pressed={all}
              onClick={() => setAll(true)}
            >
              All bills
            </button>
          </div>
        </div>
        {error && <p className="banner error">{error}</p>}
        {!loading && !error && !rows.length && (
          <p className="muted empty-note">
            {q.trim()
              ? `No bill matches “${q.trim()}”.`
              : all
                ? "No bills yet."
                : "No bills in this shift yet."}
          </p>
        )}
        <ul className="quote-list">
          {rows.map((i) => (
            <li key={i.id}>
              <button
                onClick={() =>
                  api<Invoice>(`/pos/invoices/${i.id}`)
                    .then(onOpen)
                    .catch((e) => setError(errorMessage(e)))
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
  const direct = async () => {
    try {
      if (!printerConnected() && !(await restorePrinter()))
        await connectPrinter();
      await printEscPos(
        i,
        footer,
        i.payments.some((p) => p.method === "cash"),
        payment,
      );
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  useEffect(() => {
    if (mode !== "main") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        onClose();
      } else if (k === "p") {
        e.preventDefault();
        const format = printerPrefs().billFormat;
        if (format === "direct") void direct();
        else onPrint(format);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
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
                <button className="share-tile" onClick={() => void direct()}>
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
              <RefreshCw size={16} aria-hidden="true" /> New bill{" "}
              <kbd className="kbd-hint">N</kbd>
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
  const [busy, setBusy] = useState(false);
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([lineNo, q]) => ({ lineNo: Number(lineNo), qty: q }));
  const left = (l: Invoice["lines"][number]) => l.qty - l.returnedQty;
  const set = (l: Invoice["lines"][number], n: number) =>
    setQty({ ...qty, [l.lineNo]: Math.max(0, Math.min(left(l), n)) });
  // Estimate only: the server computes the exact credit, including rounding.
  const credit = invoice.lines.reduce(
    (sum, l) => sum + Math.round(((qty[l.lineNo] ?? 0) * l.total) / l.qty),
    0,
  );
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const returnable = invoice.lines.filter((l) => left(l) > 0);
  return (
    <div className="sheet-section ret">
      <div className="ret-head">
        <span>Choose what is coming back</span>
        {returnable.length > 0 && (
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              setQty(
                Object.fromEntries(returnable.map((l) => [l.lineNo, left(l)])),
              )
            }
          >
            Return everything
          </button>
        )}
      </div>
      <ul className="ret-lines">
        {invoice.lines.map((l) => {
          const n = qty[l.lineNo] ?? 0;
          return (
            <li key={l.lineNo} className={n > 0 ? "picked" : ""}>
              <span className="ret-item">
                <strong>{l.name}</strong>
                <small>
                  {l.code} · {money(Math.round(l.total / l.qty))} each · sold{" "}
                  {l.qty}
                  {l.returnedQty > 0 && `, ${l.returnedQty} already returned`}
                </small>
              </span>
              {left(l) > 0 ? (
                <div
                  className="stepper compact"
                  role="group"
                  aria-label={`Return quantity for ${l.code}`}
                >
                  <button
                    type="button"
                    aria-label="Fewer"
                    disabled={n === 0}
                    onClick={() => set(l, n - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label={`Return quantity for ${l.code}`}
                    value={n}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      set(l, Number(e.target.value.replace(/\D/g, "")) || 0)
                    }
                  />
                  <button
                    type="button"
                    aria-label="More"
                    disabled={n >= left(l)}
                    onClick={() => set(l, n + 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <span className="ret-done">Fully returned</span>
              )}
            </li>
          );
        })}
      </ul>
      <label className="ret-check">
        <input
          type="checkbox"
          checked={restock}
          onChange={(e) => setRestock(e.target.checked)}
        />
        <span>
          <strong>Put items back in stock</strong>
          <small>Untick for damaged goods, so stock stays correct.</small>
        </span>
      </label>
      <fieldset className="ret-field">
        <legend>Reason</legend>
        <div className="chip-row wrap">
          {["Wrong item", "Wrong size", "Damaged", "Customer changed mind"].map(
            (r) => (
              <button
                key={r}
                type="button"
                className="chip"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ),
          )}
        </div>
        <input
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or type a reason"
        />
      </fieldset>
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
      {lines.length > 0 && (
        <p className="ret-total">
          <span>
            Returning {units} {units === 1 ? "item" : "items"}
          </span>
          <b>about {money(credit)}</b>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Back
        </button>
        <button
          className="btn btn-primary grow"
          disabled={busy || !lines.length || reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError("");
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
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Issuing…"
            : !lines.length
              ? "Choose items to return"
              : reason.trim().length < 3
                ? "Add a reason"
                : `Issue credit note`}
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
