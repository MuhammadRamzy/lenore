import "./styles.css";
import { Overlay } from "./overlay";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
  Landmark,
  BarChart3,
  FileText,
  Users,
  ShieldCheck,
  ScanLine,
  Upload,
  Printer,
  Images,
  Receipt,
  UserRound,
  Wallet,
  FileSpreadsheet,
  Truck,
  Banknote,
  SlidersVertical,
  Menu,
  Calculator,
  Globe,
  Percent,
  ScanBarcode,
} from "lucide-react";
import {
  type Product,
  type ProductInput,
  type Quote,
  type Activity,
  type SessionInfo,
  availability,
  money,
} from "../shared";
import { api, ApiError, errorMessage } from "./api";
import {
  MAX_SOURCE_BYTES,
  PHOTO_SIDE,
  POSTER_SIDE,
  toWebp,
  uploadThumb,
} from "./webp";
import { thumb } from "./links";
import { Scanner, scanFeedback } from "./scanner";
import { Brand } from "./brand";
import { downloadInventoryCsv } from "./export";
import { FinanceWorkspace } from "./finance";
import {
  AccessPanel,
  BulkPhotos,
  ImportProducts,
  InsightsPanel,
  LabelSheet,
  TaxTool,
  QuotationsPanel,
  StockCount,
  StockLedger,
  TeamPanel,
  WebsitePanel,
} from "./admin/panels";
import "./admin/admin.css";
import {
  BillingPanel,
  BillingSettingsPanel,
  CustomersPanel,
  ExpensesPanel,
  PurchasesPanel,
  RegisterPanel,
  ReportsPanel,
} from "./admin/erp";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Sales" },
  { id: "insights", label: "Insights", icon: BarChart3, group: "Sales" },
  { id: "quotations", label: "Quotations", icon: FileText, group: "Sales" },
  { id: "enquiries", label: "Enquiries", icon: ClipboardList, group: "Sales" },
  { id: "website", label: "Website", icon: Globe, group: "Sales" },
  { id: "billing", label: "Invoices", icon: Receipt, group: "Billing" },
  { id: "customers", label: "Customers", icon: UserRound, group: "Billing" },
  { id: "register", label: "Cash register", icon: Wallet, group: "Billing" },
  {
    id: "reports",
    label: "Reports & GST",
    icon: FileSpreadsheet,
    group: "Billing",
  },
  { id: "products", label: "Products", icon: Package, group: "Stock" },
  { id: "inventory", label: "Inventory", icon: Boxes, group: "Stock" },
  { id: "catalogue", label: "Catalogue", icon: Layers3, group: "Stock" },
  { id: "purchases", label: "Purchases", icon: Truck, group: "Stock" },
  { id: "expenses", label: "Expenses", icon: Banknote, group: "Money" },
  { id: "finance", label: "Finance", icon: Landmark, group: "Money" },
  { id: "team", label: "Team", icon: Users, group: "Admin" },
  {
    id: "access",
    label: "Access & pricing",
    icon: ShieldCheck,
    group: "Admin",
  },
  {
    id: "billing-settings",
    label: "Billing settings",
    icon: SlidersVertical,
    group: "Admin",
  },
  { id: "activity", label: "Activity", icon: RefreshCw, group: "Admin" },
];
const groups = ["Sales", "Billing", "Stock", "Money", "Admin"];
/** Phone tab bar: the daily essentials; everything else is one tap away in Menu. */
const mobileTabs = ["overview", "billing", "inventory", "expenses"];
const fetchWorkspace = () =>
  Promise.all([
    api<Product[]>("/admin/products"),
    api<Quote[]>("/admin/quotes"),
    api<Activity[]>("/admin/activity"),
  ]);
const emptyProduct: ProductInput = {
  code: "",
  name: "",
  category: "",
  unit: "pcs",
  description: "",
  pricePaise: null,
  lowStock: 5,
  published: false,
  hsn: "",
  gstRateBp: null,
  barcode: "",
  reorderQty: 0,
  bin: "",
  costPaise: null,
};
const date = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
function productFields(p: Product): ProductInput {
  return {
    code: p.code,
    name: p.name,
    category: p.category,
    unit: p.unit,
    description: p.description,
    pricePaise: p.pricePaise,
    lowStock: p.lowStock,
    published: p.published,
    hsn: p.hsn,
    gstRateBp: p.gstRateBp,
    barcode: p.barcode,
    reorderQty: p.reorderQty,
    bin: p.bin,
    costPaise: p.costPaise,
  };
}

export function Management() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [salesOnly, setSalesOnly] = useState(false);
  const [tool, setTool] = useState<
    "count" | "import" | "photos" | "labels" | "tax" | null
  >(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState(() => {
    const hash = location.hash.slice(1);
    return navigation.some((n) => n.id === hash) ? hash : "overview";
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<SessionInfo | null>(null);
  const loadSession = () =>
    api<SessionInfo>("/session").then((r) => {
      setWho(r);
      setSalesOnly(r.role === "sales");
      setSignedIn(r.authenticated);
    });
  useEffect(() => {
    const out = () => setSignedIn(false);
    window.addEventListener("lenore:signed-out", out);
    return () => window.removeEventListener("lenore:signed-out", out);
  }, []);
  useEffect(() => {
    loadSession().catch((e) => {
      setError(errorMessage(e));
      setSignedIn(false);
    });
  }, []);
  async function refresh() {
    setLoading(true);
    try {
      const [p, q, a] = await fetchWorkspace();
      setProducts(p);
      setQuotes(q);
      setActivity(a);
      setWorkspaceReady(true);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSignedIn(false);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetchWorkspace()
      .then(([p, q, a]) => {
        if (active) {
          setProducts(p);
          setQuotes(q);
          setActivity(a);
          setWorkspaceReady(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && e.status === 401) setSignedIn(false);
          setError(errorMessage(e));
        }
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  async function signOut() {
    try {
      await api("/session", undefined, "DELETE");
      setProducts([]);
      setQuotes([]);
      setActivity([]);
      setWorkspaceReady(false);
      setSignedIn(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const [camera, setCamera] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Scan or exact code: jump to the product's stock (Inventory) or details. */
  function openScanned(raw: string) {
    const code = raw.trim().toLowerCase();
    const hit = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code) ||
        p.code.toLowerCase() === code,
    );
    if (!hit) {
      setError(`No product has the barcode or code ${raw.trim()}.`);
      return false;
    }
    setError("");
    setSearch("");
    if (view === "inventory") setAdjusting(hit);
    else setEditing(hit);
    return true;
  }
  // USB scanners type anywhere: on product pages, catch the keys in search.
  useEffect(() => {
    if (!["products", "inventory", "catalogue"].includes(view)) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        e.key.length !== 1 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        t.closest("input, textarea, select, dialog, [contenteditable]")
      )
        return;
      searchRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [view]);
  function navigate(id: string) {
    setView(id);
    setSearch("");
    setFilter("all");
    setCategoryFilter("all");
    setNotice("");
    window.history.pushState(null, "", `#${id}`);
    // A new view starts at its top, not wherever the last one was scrolled.
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const handler = () => {
      const id = location.hash.slice(1);
      if (navigation.some((n) => n.id === id)) {
        setView(id);
        setSearch("");
        setFilter("all");
        setCategoryFilter("all");
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  async function publish(p: Product) {
    if (busy) return;
    setBusy(true);
    try {
      await api(
        `/admin/products/${p.id}`,
        { ...productFields(p), published: !p.published, revision: p.revision },
        "PUT",
      );
      setNotice(
        p.published
          ? "Product moved to draft."
          : "Product published to the catalogue.",
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const counts = useMemo(
    () => ({
      published: products.filter((p) => p.published).length,
      low: products.filter((p) => p.stock > 0 && p.stock <= p.lowStock).length,
      out: products.filter((p) => p.stock === 0).length,
      missing: products.filter((p) => !p.imageUrl).length,
    }),
    [products],
  );
  const visible = products.filter(
    (p) =>
      `${p.name} ${p.code} ${p.category}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (categoryFilter === "all" || p.category === categoryFilter) &&
      (filter === "all" ||
        (filter === "low" && p.stock > 0 && p.stock <= p.lowStock) ||
        (filter === "out" && p.stock === 0) ||
        (filter === "attention" && p.stock <= p.lowStock) ||
        (filter === "published" && p.published) ||
        (filter === "draft" && !p.published) ||
        (filter === "missing" && !p.imageUrl)),
  );
  if (signedIn === null)
    return (
      <main className="login-page">
        <p>Opening your workspace…</p>
      </main>
    );
  if (!signedIn && salesOnly && who)
    // Signed in, but as sales staff: point them at the apps they can use.
    return (
      <main className="login-page">
        <div className="login-brand">
          <Brand />
        </div>
        <section className="login-box">
          <h1>Hello{who.name ? `, ${who.name}` : ""}</h1>
          <p>
            The management workspace is for admins. Your account opens the sales
            catalogue{who.posAccess ? " and the billing counter" : ""}.
          </p>
          <div className="login-actions">
            <a className="button dark wide" href="/catalogue">
              Open sales catalogue <ArrowUpRight size={18} />
            </a>
            {who.posAccess && (
              <a className="button wide" href="/pos">
                <Calculator size={18} /> Open billing counter
              </a>
            )}
          </div>
          <button
            className="text-link"
            onClick={async () => {
              await api("/session", undefined, "DELETE").catch(() => undefined);
              setWho(null);
              setSalesOnly(false);
            }}
          >
            Sign out and use another account
          </button>
        </section>
        <p className="login-foot">Lenore management · Secure staff access</p>
      </main>
    );
  if (!signedIn)
    return (
      <main className="login-page">
        <div className="login-brand">
          <Brand />
        </div>
        <section className="login-box">
          <h1>Lenore staff access</h1>
          <p>
            Sign in to manage Lenore’s products, inventory and sales catalogue.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              const username = form.get("username");
              const password = form.get("password");
              e.currentTarget.reset();
              try {
                const r = await api<{ authenticated: boolean; role: string }>(
                  "/session",
                  { username, password },
                  "POST",
                );
                setSalesOnly(r.role === "sales");
                setSignedIn(r.authenticated);
                if (r.role === "sales") await loadSession();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Username or phone
              <input
                name="username"
                required
                maxLength={80}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label>
              Workspace password
              <input
                name="password"
                type="password"
                required
                maxLength={256}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button dark wide">
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <a href="/">Return to the website</a>
        </section>
        <p className="login-foot">Lenore management · Secure staff access</p>
      </main>
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand compact />
        <div className="workspace-label">Management workspace</div>
        <nav aria-label="Workspace navigation" className="grouped-nav">
          <a className="pos-launch" href="/pos">
            <Calculator size={18} /> <span>Open billing counter</span>
          </a>
          {groups.map((g) => (
            <div key={g} className="nav-group">
              <span className="nav-group-label">{g}</span>
              {navigation
                .filter((n) => n.group === g)
                .map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={view === id ? "selected" : ""}
                    aria-label={label}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {id === "enquiries" &&
                      quotes.some((q) => q.status === "new") && (
                        <b>{quotes.filter((q) => q.status === "new").length}</b>
                      )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/catalogue" target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> View sales catalogue
          </a>
          <div className="integration-status">
            <span className="connection-dot" />
            <div>
              ERP integration<small>Not connected · set up later</small>
            </div>
          </div>
          <button onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-top">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </span>
          <div>
            <a href="/" target="_blank" rel="noreferrer">
              View website <ArrowUpRight size={15} />
            </a>
            <button
              className="mobile-sign-out"
              onClick={() => void signOut()}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
            <span className="avatar" title="Workspace owner">
              L
            </span>
          </div>
        </header>
        <main className="workspace-content">
          <div className="workspace-heading">
            <div>
              <h1>
                {view === "overview"
                  ? "Overview"
                  : navigation.find((n) => n.id === view)?.label}
              </h1>
              <p>
                {
                  {
                    overview: "Product, stock and enquiry status.",
                    insights:
                      "Quotations, team activity, popular products and stock value.",
                    quotations:
                      "Every quotation from the sales team, with filters and export.",
                    team: "Salespeople and admins, their access and discount limits.",
                    access:
                      "Who can open the catalogue and how quotations may be priced.",
                    billing:
                      "Tax invoices from the counter, with returns and payments.",
                    customers:
                      "Customer accounts, credit, ledgers and payments received.",
                    register: "Counter shifts, cash counts and differences.",
                    reports:
                      "Sales, GST (HSN, B2B, B2C), margins, expenses and stock alerts.",
                    purchases:
                      "Supplier bills, payments and returns. Purchases add stock.",
                    expenses: "Day-to-day spending with bills attached.",
                    "billing-settings":
                      "Invoice numbering, receipts and price lists.",
                    products:
                      "Keep product information accurate, complete and easy to find.",
                    inventory:
                      "Track what’s on hand. Make every adjustment traceable.",
                    catalogue:
                      "Decide what buyers see. Prepare, review and publish.",
                    enquiries: "Turn a shortlist into a conversation.",
                    website:
                      "Choose which collections, products, prices and stock the public website shows.",
                    finance:
                      "Revenue, costs, GST, export records and collections · INR reporting.",
                    activity:
                      "A record of product, publication and stock changes.",
                    settings:
                      "Manage contact details and prepare for future integration.",
                  }[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <RefreshCw size={18} className={loading ? "spin" : ""} />
              </button>
              {["overview", "products", "catalogue"].includes(view) && (
                <button
                  className="button dark"
                  onClick={() => setEditing("new")}
                >
                  <Plus size={17} /> Add product
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error banner">
              {error}
              <button onClick={() => void refresh()}>Refresh data</button>
            </div>
          )}
          {notice && (
            <div role="status" className="success banner">
              <CheckCircle2 size={17} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "finance" ? (
            <FinanceWorkspace />
          ) : view === "insights" ? (
            <InsightsPanel />
          ) : view === "quotations" ? (
            <QuotationsPanel />
          ) : view === "team" ? (
            <TeamPanel notify={setNotice} />
          ) : view === "website" ? (
            <WebsitePanel notify={setNotice} />
          ) : view === "access" ? (
            <AccessPanel notify={setNotice} />
          ) : view === "billing" ? (
            <BillingPanel />
          ) : view === "customers" ? (
            <CustomersPanel />
          ) : view === "register" ? (
            <RegisterPanel />
          ) : view === "reports" ? (
            <ReportsPanel />
          ) : view === "expenses" ? (
            <ExpensesPanel />
          ) : view === "purchases" ? (
            <PurchasesPanel
              products={products}
              onStockChanged={() => void refresh()}
            />
          ) : view === "billing-settings" ? (
            <BillingSettingsPanel products={products} notify={setNotice} />
          ) : !workspaceReady ? (
            <section className="work-section empty" role="status">
              <h2>
                {error
                  ? "Workspace data is unavailable."
                  : "Opening your workspace…"}
              </h2>
              <p>
                {error
                  ? "Refresh data to try again. Product and stock counts are not available yet."
                  : "Loading products, stock and enquiries."}
              </p>
            </section>
          ) : view === "overview" ? (
            <>
              <div className="overview-summary">
                <div>
                  <span>Products</span>
                  <strong>{products.length}</strong>
                  <button onClick={() => navigate("products")}>
                    Manage range <ArrowUpRight size={15} />
                  </button>
                </div>
                <div>
                  <span>Published</span>
                  <strong>
                    {counts.published}
                    <small>/ {products.length}</small>
                  </strong>
                  <button onClick={() => navigate("catalogue")}>
                    Open catalogue <ArrowUpRight size={15} />
                  </button>
                </div>
                <div
                  className={counts.low + counts.out ? "needs-attention" : ""}
                >
                  <span>Stock needs attention</span>
                  <strong>
                    {counts.low + counts.out}
                    <span className="status-dot" />
                  </strong>
                  <button
                    onClick={() => {
                      navigate("inventory");
                      setFilter("attention");
                    }}
                  >
                    {counts.out} out of stock · {counts.low} low{" "}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div>
                  <span>New enquiries</span>
                  <strong>
                    {quotes.filter((q) => q.status === "new").length}
                  </strong>
                  <button onClick={() => navigate("enquiries")}>
                    Review enquiries <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>
              <div className="overview-grid">
                <section className="work-section">
                  <div className="work-section-title">
                    <h2>Needs a closer look</h2>
                    <button
                      className="text-link"
                      onClick={() => navigate("inventory")}
                    >
                      View inventory <ArrowRightIcon />
                    </button>
                  </div>
                  {products.filter((p) => p.stock <= p.lowStock).length ? (
                    <div className="attention-list">
                      {products
                        .filter((p) => p.stock <= p.lowStock)
                        .slice(0, 6)
                        .map((p) => (
                          <button key={p.id} onClick={() => setAdjusting(p)}>
                            <div className="mini-photo">
                              {p.imageUrl ? (
                                <img
                                  src={thumb(p.imageUrl)}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <Package size={21} />
                              )}
                            </div>
                            <div>
                              <strong>{p.name}</strong>
                              <span>
                                {p.code} · {p.category}
                              </span>
                            </div>
                            <span
                              className={`badge ${p.stock === 0 ? "out" : "low"}`}
                            >
                              {p.stock === 0
                                ? "Out of stock"
                                : `${p.stock} ${p.unit} left`}
                            </span>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="empty small">
                      <CheckCircle2 size={28} />
                      <h3>
                        {products.length
                          ? "Stock is in good shape."
                          : "No products yet."}
                      </h3>
                      <p>
                        {products.length
                          ? "No products are below their stock threshold."
                          : "Add your first product to start tracking stock."}
                      </p>
                    </div>
                  )}
                </section>
                <section className="catalogue-health">
                  <div className="work-section-title">
                    <h2>Catalogue readiness</h2>
                    <Layers3 size={22} />
                  </div>
                  <p>Review drafts and missing photos before publishing.</p>
                  <button
                    onClick={() => {
                      navigate("catalogue");
                      setFilter("draft");
                    }}
                  >
                    <span>Products still in draft</span>
                    <strong>{products.length - counts.published}</strong>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => {
                      navigate("catalogue");
                      setFilter("missing");
                    }}
                  >
                    <span>Products awaiting a photo</span>
                    <strong>{counts.missing}</strong>
                    <ChevronRight size={16} />
                  </button>
                  <a
                    href="/catalogue"
                    className="button"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview sales catalogue <Eye size={17} />
                  </a>
                </section>
              </div>
              <section className="work-section recent-section">
                <div className="work-section-title">
                  <h2>Recent activity</h2>
                  <button
                    className="text-link"
                    onClick={() => navigate("activity")}
                  >
                    View all activity <ArrowRightIcon />
                  </button>
                </div>
                <ActivityList rows={activity.slice(0, 5)} />
              </section>
            </>
          ) : ["products", "inventory", "catalogue"].includes(view) ? (
            <>
              <div className="table-tools">
                <div className="filter-tabs">
                  {(view === "inventory"
                    ? [
                        ["all", "All stock"],
                        ["attention", "Needs attention"],
                        ["low", "Low stock"],
                        ["out", "Out of stock"],
                      ]
                    : view === "catalogue"
                      ? [
                          ["all", "All products"],
                          ["published", "Published"],
                          ["draft", "Drafts"],
                          ["missing", "Missing photos"],
                        ]
                      : [
                          ["all", "All products"],
                          ["published", "Published"],
                          ["draft", "Drafts"],
                        ]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? "selected" : ""}
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    ref={searchRef}
                    placeholder="Search or scan a barcode"
                    aria-label="Search products"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // A scanner types the code and presses Enter.
                      if (e.key === "Enter" && search.trim()) {
                        e.preventDefault();
                        scanFeedback(openScanned(search));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="search-scan"
                    aria-label="Scan with camera"
                    title="Scan with camera"
                    onClick={() => setCamera(true)}
                  >
                    <ScanBarcode size={17} />
                  </button>
                </label>
              </div>
              <div className="table-secondary-tools">
                <label>
                  Category
                  <select
                    aria-label="Filter category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {[...new Set(products.map((p) => p.category))]
                      .sort()
                      .map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="tool-buttons">
                  {view === "inventory" && (
                    <button className="button" onClick={() => setTool("count")}>
                      <ScanLine size={16} /> Stock count
                    </button>
                  )}
                  {view === "products" && (
                    <>
                      <button
                        className="button"
                        onClick={() => setTool("import")}
                      >
                        <Upload size={16} /> Import CSV
                      </button>
                      <button
                        className="button"
                        onClick={() => setTool("photos")}
                      >
                        <Images size={16} /> Photos by code
                      </button>
                    </>
                  )}
                  <button
                    className="button"
                    disabled={!visible.length}
                    onClick={() => setTool("labels")}
                  >
                    <Printer size={16} /> Labels
                  </button>
                  {view === "products" && (
                    <button
                      className="button"
                      disabled={!visible.length}
                      onClick={() => setTool("tax")}
                    >
                      <Percent size={16} /> GST &amp; HSN
                    </button>
                  )}
                  <button
                    className="button"
                    disabled={!visible.length}
                    onClick={() => downloadInventoryCsv(visible)}
                  >
                    <Download size={16} /> Export view (CSV)
                  </button>
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
                      <th>Product</th>
                      <th>Category</th>
                      <th>
                        {view === "inventory" ? "On hand" : "Suggested MRP"}
                      </th>
                      <th>
                        {view === "inventory" ? "Availability" : "Catalogue"}
                      </th>
                      <th className="right">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="table-product"
                            onClick={() => setEditing(p)}
                          >
                            <span className="mini-photo">
                              {p.imageUrl ? (
                                <img
                                  src={thumb(p.imageUrl)}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <Package size={22} />
                              )}
                            </span>
                            <span>
                              <strong>{p.name}</strong>
                              <small>{p.code}</small>
                            </span>
                          </button>
                        </td>
                        <td>{p.category}</td>
                        <td className="number">
                          {view === "inventory" ? (
                            <>
                              <strong>{p.stock}</strong>{" "}
                              <span className="muted">{p.unit}</span>
                            </>
                          ) : (
                            money(p.pricePaise)
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${view === "inventory" ? (p.stock === 0 ? "out" : p.stock <= p.lowStock ? "low" : "live") : p.published ? "live" : "draft"}`}
                          >
                            {view === "inventory"
                              ? availability(p.stock, p.lowStock)
                              : p.published
                                ? "Published"
                                : "Draft"}
                          </span>
                        </td>
                        <td className="right">
                          {view === "inventory" ? (
                            <button
                              className="row-action"
                              onClick={() => setAdjusting(p)}
                            >
                              <SlidersHorizontal size={15} /> Adjust stock
                            </button>
                          ) : view === "catalogue" ? (
                            <button
                              className="row-action"
                              disabled={busy}
                              onClick={() => void publish(p)}
                            >
                              {p.published ? "Unpublish" : "Publish"}
                              <ArrowUpRight size={15} />
                            </button>
                          ) : (
                            <button
                              className="row-action"
                              onClick={() => setEditing(p)}
                            >
                              Edit product <ChevronRight size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && (
                  <div className="empty">
                    <Package size={30} />
                    <h3>
                      {products.length
                        ? "No products match."
                        : "No products yet."}
                    </h3>
                    <p>
                      {products.length
                        ? "Try another search or filter."
                        : "Add a product, then prepare it for your sales catalogue."}
                    </p>
                    {!products.length && (
                      <button
                        className="button dark"
                        onClick={() => setEditing("new")}
                      >
                        Add your first product <Plus size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="table-foot">
                <span>
                  {visible.length} of {products.length} products
                </span>
                <span>
                  {view === "inventory"
                    ? "Stock is managed here until ERP integration is connected."
                    : "Only published products appear in the sales catalogue."}
                </span>
              </div>
            </>
          ) : view === "enquiries" ? (
            <section className="work-section">
              <div className="table-tools">
                <h2>Quotation enquiries</h2>
                <span className="muted">{quotes.length} received</span>
              </div>
              {quotes.length ? (
                <div className="enquiry-list">
                  {quotes.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        setQuoteError("");
                        setQuote(q);
                      }}
                    >
                      <span className="enquiry-avatar">
                        {q.name.charAt(0).toUpperCase()}
                      </span>
                      <span>
                        <strong>{q.name}</strong>
                        <small>
                          {q.items.length} products · {q.phone}
                        </small>
                      </span>
                      <span
                        className={`badge ${q.status === "new" ? "low" : "draft"}`}
                      >
                        {q.status}
                      </span>
                      <time>{date(q.createdAt)}</time>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <ClipboardList size={34} />
                  <h3>No enquiries yet.</h3>
                  <p>
                    Enquiries submitted through the sales catalogue will appear
                    in this workspace.
                  </p>
                  <a className="button" href="/catalogue">
                    Open the catalogue <ArrowUpRight size={16} />
                  </a>
                </div>
              )}
            </section>
          ) : (
            <section className="work-section">
              <ActivityList rows={activity} />
            </section>
          )}
          <footer className="workspace-footer">
            <span>Lenore · Management workspace</span>
            <span>
              <CircleHelp size={14} /> Stock and catalogue changes are saved
              here.
            </span>
          </footer>
        </main>
      </div>
      <nav className="admin-tabbar" aria-label="Workspace sections">
        {mobileTabs.map((id) => {
          const item = navigation.find((n) => n.id === id)!;
          return (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Menu size={22} />
          <span>Menu</span>
        </button>
      </nav>
      {menuOpen && (
        <Overlay onClose={() => setMenuOpen(false)}>
          <div className="admin-menu" onClick={() => setMenuOpen(false)}>
            <section
              aria-label="All sections"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="admin-menu-head">
                <strong>Lenore Admin</strong>
                <button
                  className="icon-button"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <X />
                </button>
              </div>
              <a className="pos-launch" href="/pos">
                <Calculator size={18} /> Open billing counter
              </a>
              {groups.map((g) => (
                <div key={g} className="admin-menu-group">
                  <span className="nav-group-label">{g}</span>
                  <div>
                    {navigation
                      .filter((n) => n.group === g)
                      .map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          aria-current={view === id ? "page" : undefined}
                          onClick={() => {
                            navigate(id);
                            setMenuOpen(false);
                          }}
                        >
                          <Icon size={20} />
                          {label}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              <div className="admin-menu-foot">
                <a href="/catalogue">Sales catalogue</a>
                <a href="/">Website</a>
                <button onClick={() => void signOut()}>Sign out</button>
              </div>
            </section>
          </div>
        </Overlay>
      )}
      {tool === "count" && (
        <StockCount
          products={products}
          onClose={() => setTool(null)}
          onSaved={async (m) => {
            setTool(null);
            setNotice(m);
            await refresh();
          }}
        />
      )}
      {tool === "import" && (
        <ImportProducts
          onClose={() => setTool(null)}
          onSaved={async (m) => {
            setTool(null);
            setNotice(m);
            await refresh();
          }}
        />
      )}
      {tool === "photos" && (
        <BulkPhotos
          onClose={() => {
            setTool(null);
            void refresh();
          }}
          onSaved={setNotice}
        />
      )}
      {camera && (
        <Scanner
          title={
            view === "inventory" ? "Scan to adjust stock" : "Scan a product"
          }
          onDetect={(code) => {
            const ok = openScanned(code);
            if (ok) setCamera(false);
            return ok;
          }}
          onClose={() => setCamera(false)}
        />
      )}
      {tool === "tax" && (
        <TaxTool
          products={visible}
          onClose={() => setTool(null)}
          onSaved={async (m) => {
            setTool(null);
            setNotice(m);
            await refresh();
          }}
        />
      )}
      {tool === "labels" && (
        <LabelSheet products={visible} onClose={() => setTool(null)} />
      )}
      {editing && (
        <ProductEditor
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice("Product saved.");
            await refresh();
          }}
        />
      )}
      {adjusting && (
        <StockEditor
          key={adjusting.id}
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={async () => {
            setAdjusting(null);
            setNotice("Stock adjustment recorded.");
            await refresh();
          }}
        />
      )}
      {quote && (
        <Overlay onClose={() => setQuote(null)}>
          <div className="panel-shade" onClick={() => setQuote(null)}>
            <section
              className="editor-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Quotation enquiry"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-heading">
                <h2>Quotation enquiry</h2>
                <button
                  autoFocus
                  className="icon-button"
                  aria-label="Close enquiry"
                  onClick={() => setQuote(null)}
                >
                  <X />
                </button>
              </div>
              <p className="muted">
                {quote.id.slice(0, 8).toUpperCase()} · {date(quote.createdAt)}
              </p>
              <h3>{quote.name}</h3>
              <a
                className="text-link"
                href={`tel:${quote.phone.replace(/[^+\d]/g, "")}`}
              >
                {quote.phone}
              </a>
              <div className="quote-detail-lines">
                {quote.items.map((i) => (
                  <div key={i.productId}>
                    <span>
                      <strong>{i.name}</strong>
                      <small>
                        {i.code} · {money(i.pricePaise)}
                      </small>
                    </span>
                    <strong>× {i.quantity}</strong>
                  </div>
                ))}
              </div>
              {quote.notes && <p className="quote-notes">{quote.notes}</p>}
              {quoteError && (
                <p className="error" role="alert">
                  {quoteError}
                </p>
              )}
              <label>
                Follow-up status
                <select
                  value={quote.status}
                  disabled={busy}
                  onChange={async (e) => {
                    setBusy(true);
                    setQuoteError("");
                    try {
                      const status = e.target.value as Quote["status"];
                      await api(
                        `/admin/quotes/${quote.id}`,
                        { status },
                        "PATCH",
                      );
                      setQuote({ ...quote, status });
                      await refresh();
                    } catch (e) {
                      setQuoteError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <p className="muted">
                ERP conversion will be available after integration. This enquiry
                does not reserve stock.
              </p>
            </section>
          </div>
        </Overlay>
      )}
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={15} />;
}
function ActivityList({ rows }: { rows: Activity[] }) {
  return rows.length ? (
    <div className="activity-list">
      {rows.map((a) => (
        <article key={a.id}>
          <span className="activity-mark">
            <Check size={15} />
          </span>
          <div>
            <strong>{a.action}</strong>
            <span>
              {a.detail}
              {a.reason ? ` · ${a.reason}` : ""}
            </span>
          </div>
          <time>{date(a.createdAt)}</time>
        </article>
      ))}
    </div>
  ) : (
    <div className="empty small">
      <h3>No activity yet.</h3>
      <p>Product and inventory changes will appear here.</p>
    </div>
  );
}

function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<ProductInput>(
    product ? productFields(product) : emptyProduct,
  );
  const [image, setImage] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedProduct, setSavedProduct] = useState(product);
  function field<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-editor-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2 id="product-editor-title">
              {product ? "Edit product" : "New product"}
            </h2>
            <button
              className="icon-button"
              aria-label="Close editor"
              disabled={busy}
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <p className="muted">
            {product
              ? "Product details and catalogue presentation."
              : "Start with the essentials. You can add stock after saving."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const current = savedProduct;
                const saved = await api<Product>(
                  current ? `/admin/products/${current.id}` : "/admin/products",
                  current ? { ...form, revision: current.revision } : form,
                  current ? "PUT" : "POST",
                );
                setSavedProduct(saved);
                let latest = saved;
                for (const [file, slot] of [
                  [image, "photo"],
                  [poster, "poster"],
                ] as const) {
                  if (!file) continue;
                  const response = await fetch(
                    `/api/admin/products/${saved.id}/image?slot=${slot}`,
                    {
                      method: "POST",
                      headers: { "If-Match": String(latest.revision) },
                      body: await toWebp(
                        file,
                        slot === "poster" ? POSTER_SIDE : PHOTO_SIDE,
                      ),
                    },
                  );
                  const result = (await response.json()) as Product & {
                    error?: string;
                  };
                  if (!response.ok)
                    throw new Error(
                      `Product details saved, but ${slot} upload failed: ${result.error}`,
                    );
                  latest = result;
                  setSavedProduct(result);
                  await uploadThumb(
                    file,
                    slot === "poster" ? result.posterUrl : result.imageUrl,
                  );
                  if (slot === "photo") setImage(null);
                  else setPoster(null);
                }
                await onSaved();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Product name
              <input
                autoFocus
                required
                maxLength={160}
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
                placeholder="e.g. Single lever basin mixer"
              />
            </label>
            <div className="form-row">
              <label>
                Product code
                <input
                  required
                  maxLength={60}
                  value={form.code}
                  onChange={(e) => field("code", e.target.value)}
                  placeholder="Your SKU or item code"
                />
              </label>
              <label>
                Category
                <input
                  required
                  maxLength={80}
                  list="categories"
                  value={form.category}
                  onChange={(e) => field("category", e.target.value)}
                  placeholder="Choose or create"
                />
                <datalist id="categories">
                  {[
                    "Basin mixers",
                    "Showers",
                    "Taps",
                    "Accessories",
                    "Sanitary ware",
                  ].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="form-row">
              <label>
                Suggested MRP in INR <span>(optional)</span>
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  step="0.01"
                  value={form.pricePaise === null ? "" : form.pricePaise / 100}
                  onChange={(e) =>
                    field(
                      "pricePaise",
                      e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 100),
                    )
                  }
                  placeholder="Leave blank for price on request"
                />
              </label>
              <label>
                Unit
                <input
                  required
                  maxLength={20}
                  value={form.unit}
                  onChange={(e) => field("unit", e.target.value)}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={4}
                maxLength={4000}
                value={form.description}
                onChange={(e) => field("description", e.target.value)}
                placeholder="Materials, finish, dimensions and useful product details"
              />
            </label>
            <label>
              Low stock threshold
              <input
                type="number"
                min="0"
                max="1000000000"
                step="1"
                value={form.lowStock}
                onChange={(e) => field("lowStock", Number(e.target.value))}
              />
            </label>
            <fieldset className="field-group">
              <legend>Inventory and billing</legend>
              <div className="form-row">
                <label>
                  Barcode
                  <input
                    maxLength={64}
                    value={form.barcode}
                    onChange={(e) => field("barcode", e.target.value.trim())}
                    placeholder="Scan or type"
                  />
                </label>
                <label>
                  Shelf / bin
                  <input
                    maxLength={40}
                    value={form.bin}
                    onChange={(e) => field("bin", e.target.value)}
                    placeholder="e.g. A-03"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  HSN code
                  <input
                    inputMode="numeric"
                    maxLength={8}
                    value={form.hsn}
                    onChange={(e) =>
                      field("hsn", e.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
                <label>
                  GST rate %
                  <input
                    inputMode="decimal"
                    value={form.gstRateBp === null ? "" : form.gstRateBp / 100}
                    onChange={(e) =>
                      field(
                        "gstRateBp",
                        e.target.value === ""
                          ? null
                          : Math.round(Number(e.target.value) * 100),
                      )
                    }
                    placeholder="As per invoice"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Reorder quantity
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.reorderQty}
                    onChange={(e) =>
                      field("reorderQty", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Unit cost in INR <span>(admin only)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPaise === null ? "" : form.costPaise / 100}
                    onChange={(e) =>
                      field(
                        "costPaise",
                        e.target.value === ""
                          ? null
                          : Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                </label>
              </div>
            </fieldset>
            <label className="upload-field">
              <ImagePlus size={24} />
              <strong>{image ? image.name : "Add a product photograph"}</strong>
              <span>JPEG, PNG or WebP · saved as WebP</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.size > MAX_SOURCE_BYTES) {
                    setError("Choose an image under 25 MB.");
                    e.target.value = "";
                    return;
                  }
                  setImage(f ?? null);
                  setError("");
                }}
              />
            </label>
            <label className="upload-field">
              <ImagePlus size={24} />
              <strong>
                {poster ? poster.name : "Add a specification poster"}
              </strong>
              <span>Second product image · saved as WebP</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size > MAX_SOURCE_BYTES) {
                    setError("Choose a poster under 25 MB.");
                    e.target.value = "";
                    return;
                  }
                  setPoster(file ?? null);
                  setError("");
                }}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => field("published", e.target.checked)}
              />
              <span>
                <strong>Publish to the sales catalogue</strong>
                <small>
                  Leave unchecked to prepare this product as a draft.
                </small>
              </span>
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                disabled={busy}
                className="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button disabled={busy} className="button dark">
                {busy ? "Saving…" : "Save product"}
                <Check size={17} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </Overlay>
  );
}
function StockEditor({
  product: p,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState("receive");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const kinds: Record<string, [string, number]> = {
    receive: ["receipt", 1],
    return_in: ["return_in", 1],
    issue: ["issue", -1],
    damage: ["damage", -1],
    return_out: ["return_out", -1],
  };
  const n = Number(quantity),
    delta = mode === "count" ? n - p.stock : n * kinds[mode][1];
  const valid =
    quantity !== "" &&
    Number.isInteger(n) &&
    n >= (mode === "count" ? 0 : 1) &&
    p.stock + delta >= 0 &&
    p.stock + delta <= 1000000000 &&
    delta !== 0;
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Adjust stock"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2>Adjust stock</h2>
            <button
              className="icon-button"
              aria-label="Close stock adjustment"
              disabled={busy}
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <div className="stock-product">
            <Package size={26} />
            <div>
              <strong>{p.name}</strong>
              <small>{p.code}</small>
            </div>
          </div>
          <form
            onChange={() => setOperationId(crypto.randomUUID())}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid || busy) return;
              setBusy(true);
              setError("");
              try {
                await api(
                  `/admin/products/${p.id}/stock`,
                  {
                    operationId,
                    revision: p.revision,
                    delta,
                    reason,
                    kind: mode === "count" ? "count" : kinds[mode][0],
                  },
                  "POST",
                );
                await onSaved();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Adjustment type
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="receive">Receive stock</option>
                <option value="return_in">Customer return</option>
                <option value="issue">Issue stock</option>
                <option value="damage">Damaged / write-off</option>
                <option value="return_out">Return to supplier</option>
                <option value="count">Set counted quantity</option>
              </select>
            </label>
            <label>
              {mode === "count" ? "Counted quantity" : "Quantity"}
              <input
                autoFocus
                required
                type="number"
                min={mode === "count" ? 0 : 1}
                max="1000000000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </label>
            <div className="stock-preview">
              <div>
                <span>Current stock</span>
                <strong>
                  {p.stock}
                  <small>{p.unit}</small>
                </strong>
              </div>
              <ArrowDownLeft size={22} />
              <div>
                <span>After adjustment</span>
                <strong>
                  {valid ? p.stock + delta : "—"}
                  <small>{p.unit}</small>
                </strong>
              </div>
            </div>
            {quantity && !valid && (
              <p className="error">
                Enter a whole quantity that changes stock and leaves a balance
                of at least zero.
              </p>
            )}
            <label>
              Reason
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Opening stock count, goods received, damaged item"
              />
            </label>
            <p className="muted">
              Every movement is recorded with its type, reason and your name.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                disabled={!valid || reason.trim().length < 3 || busy}
                className="button dark"
              >
                {busy ? "Recording…" : "Record adjustment"}
                <Check size={17} />
              </button>
            </div>
          </form>
          <StockLedger product={p} />
        </section>
      </div>
    </Overlay>
  );
}
