import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  LayoutGrid,
  ListChecks,
  LogOut,
  UserRound,
  Download,
  ExternalLink,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { money, type CatalogueProduct, type Quotation } from "../../shared";
import { api, ApiError, errorMessage } from "../api";
import { Mark } from "../site/site";
import { Browse, ProductSheet } from "./browse";
import {
  QuoteBuilder,
  QuoteDetail,
  QuoteList,
  linesFrom,
  loadQuoteCustomer,
  pricingFor,
} from "./quote";
import {
  cachedSession,
  clearDeviceData,
  loadSession,
  newDraft,
  rememberSession,
  useCatalogue,
  useDraft,
  useLocalQuotes,
  type AccessInfo,
  type AppConfig,
} from "./store";
import type { SessionInfo } from "../../shared";
import { relativeTime } from "./ui";

type Route =
  | { tab: "browse"; slug?: string }
  | { tab: "quote" }
  | { tab: "quotes"; open?: string }
  | { tab: "account" };
function parse(path: string): Route {
  const [, , section, rest] = path.split("/");
  if (section === "quote") return { tab: "quote" };
  if (section === "quotes") return { tab: "quotes", open: rest };
  if (section === "account") return { tab: "account" };
  if (section === "p" && rest)
    return { tab: "browse", slug: decodeURIComponent(rest) };
  return { tab: "browse" };
}
const pathOf = (r: Route) =>
  r.tab === "browse"
    ? r.slug
      ? `/catalogue/p/${encodeURIComponent(r.slug)}`
      : "/catalogue"
    : r.tab === "quotes" && r.open
      ? `/catalogue/quotes/${r.open}`
      : `/catalogue/${r.tab}`;

type InstallPrompt = Event & { prompt: () => Promise<void> };

export function SalesApp() {
  const [state, setState] = useState<{
    session: SessionInfo;
    access: AccessInfo;
    config: AppConfig;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const reload = useCallback(
    () =>
      loadSession()
        .then((s) => {
          setState(s);
          setLoadError("");
          rememberSession(s);
        })
        .catch((e) => {
          // Offline start: reopen the last session with the saved catalogue.
          const cached = cachedSession();
          if (cached && !(e instanceof ApiError)) setState(cached);
          else setLoadError(errorMessage(e));
        }),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  if (!state)
    return (
      <div className="app-splash">
        <Mark className="mark-lg" />
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={reload}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted">Opening catalogue…</p>
        )}
      </div>
    );
  if (!state.access.level)
    return <SignIn mode={state.access.mode} onDone={reload} />;
  return <SalesWorkspace {...state} reload={reload} />;
}

function SalesWorkspace({
  session,
  access,
  config,
  reload,
}: {
  session: SessionInfo;
  access: AccessInfo;
  config: AppConfig;
  reload: () => Promise<void>;
}) {
  const level = access.level!;
  const staff = level === "staff";
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  const { products, syncedAt, error, loading, refresh } = useCatalogue(true);
  const { draft, setDraft, setQuantity, quantityOf } = useDraft(
    config.quoteValidityDays,
  );
  const { quotes: localQuotes, remember } = useLocalQuotes();
  // Revisions keep the saved customer, so new lines get their price list too.
  const withCustomer = (id: string | null) => {
    if (id)
      void loadQuoteCustomer(id)
        .then((customer) => setDraft((d) => ({ ...d, customer })))
        .catch(() => undefined);
  };
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const [openQuote, setOpenQuote] = useState<Quotation | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const pricing = pricingFor(level, session, config);

  useEffect(() => {
    const onPop = () => setRoute(parse(location.pathname));
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("popstate", onPop);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = useCallback((next: Route, replace = false) => {
    const path = pathOf(next);
    if (path !== location.pathname)
      history[replace ? "replaceState" : "pushState"](null, "", path);
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  const notify = useCallback(
    (message: string, undo?: () => void) => setToast({ message, undo }),
    [],
  );

  // Open a quotation from the URL (deep link or back navigation).
  useEffect(() => {
    if (route.tab !== "quotes" || !route.open) return;
    if (
      openQuote &&
      (openQuote.id === route.open ||
        `t-${openQuote.shareToken}` === route.open)
    )
      return;
    const request =
      staff && !route.open.startsWith("t-")
        ? api<Quotation>(`/quotations/${route.open}`)
        : api<Quotation>(`/q/${route.open.replace(/^t-/, "")}`);
    request.then(setOpenQuote).catch((e) => {
      notify(errorMessage(e));
      go({ tab: "quotes" }, true);
    });
  }, [route, staff, openQuote, notify, go]);

  const selected = useMemo(
    () =>
      route.tab === "browse" && route.slug
        ? (products.find((p) => p.slug === route.slug) ?? null)
        : null,
    [route, products],
  );
  const openProduct = (p: CatalogueProduct) => {
    history.pushState(
      { sheet: true },
      "",
      pathOf({ tab: "browse", slug: p.slug }),
    );
    setRoute({ tab: "browse", slug: p.slug });
    void fetch(`/api/catalogue/${p.id}/view`, {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
  };
  const lineCount = draft.lines.length;
  const canEdit = (q: Quotation) =>
    staff &&
    (session.role === "owner" ||
      session.role === "admin" ||
      q.createdBy === (session.userId ?? "owner"));

  const tabs = [
    { id: "browse", label: "Catalogue", icon: LayoutGrid },
    { id: "quote", label: "Quote", icon: FileText, badge: lineCount },
    { id: "quotes", label: "Quotations", icon: ListChecks },
    { id: "account", label: "Account", icon: UserRound },
  ] as const;

  return (
    <div className={`app ${route.tab === "browse" ? "with-aside" : ""}`}>
      <header className="app-bar">
        <a
          className="app-brand"
          href="/catalogue"
          onClick={(e) => (e.preventDefault(), go({ tab: "browse" }))}
        >
          <Mark />
          <span>
            LENORE <small>Catalogue</small>
          </span>
        </a>
        <nav className="app-tabs-top" aria-label="Catalogue sections">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={pathOf({ tab: t.id })}
              aria-current={route.tab === t.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go({ tab: t.id });
              }}
            >
              <t.icon size={18} aria-hidden="true" />
              {t.label}
              {"badge" in t && t.badge > 0 && (
                <span className="badge">{t.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <span className="app-user">
          {staff
            ? session.name
            : level === "shared"
              ? "Shared access"
              : "Guest"}
        </span>
      </header>
      {!online && (
        <p className="banner warn offline" role="status">
          <WifiOff size={16} aria-hidden="true" /> Offline · showing the
          catalogue saved {relativeTime(syncedAt)}. Quotations save when you are
          back online.
        </p>
      )}

      <main className="app-main" id="main">
        {route.tab === "browse" && (
          <Browse
            products={products}
            demo={config.demo}
            level={level}
            syncedAt={syncedAt}
            loading={loading}
            error={error}
            refresh={refresh}
            quantityOf={quantityOf}
            setQuantity={setQuantity}
            onOpen={openProduct}
            notify={notify}
          />
        )}
        {route.tab === "quote" && (
          <QuoteBuilder
            draft={draft}
            setDraft={setDraft}
            setQuantity={setQuantity}
            products={products}
            demo={config.demo}
            pricing={pricing}
            config={config}
            level={level}
            admin={session.role === "owner" || session.role === "admin"}
            onBrowse={() => go({ tab: "browse" })}
            onSaved={(q) => {
              if (!staff) remember(q);
              setOpenQuote(q);
              go({ tab: "quotes", open: staff ? q.id : `t-${q.shareToken}` });
              notify(`${q.number} saved`);
            }}
          />
        )}
        {route.tab === "quotes" && !route.open && (
          <QuoteList
            staff={staff}
            local={localQuotes}
            onOpen={(q) =>
              go({ tab: "quotes", open: staff ? q.id : `t-${q.shareToken}` })
            }
          />
        )}
        {route.tab === "quotes" &&
          route.open &&
          openQuote &&
          (openQuote.id === route.open ||
            `t-${openQuote.shareToken}` === route.open) && (
            <QuoteDetail
              quote={openQuote}
              staff={staff}
              canEdit={canEdit(openQuote)}
              notify={notify}
              onBack={() => go({ tab: "quotes" })}
              onChange={setOpenQuote}
              onRevise={() => {
                setDraft(() => ({
                  id: crypto.randomUUID(),
                  customerName: openQuote.customerName,
                  customerPhone: openQuote.customerPhone,
                  customerPlace: openQuote.customerPlace,
                  notes: openQuote.notes,
                  validUntil: openQuote.validUntil,
                  lines: linesFrom(openQuote),
                  customer: null,
                  editing: {
                    id: openQuote.id,
                    number: openQuote.number,
                    revision: openQuote.revision,
                  },
                }));
                withCustomer(openQuote.customerId);
                go({ tab: "quote" });
              }}
              onDuplicate={() => {
                setDraft(() => ({
                  ...newDraft(config.quoteValidityDays),
                  lines: staff
                    ? linesFrom(openQuote)
                    : openQuote.items.map((l) => ({
                        productId: l.productId,
                        quantity: l.quantity,
                        discountBp: 0,
                        unitPricePaise: null,
                      })),
                }));
                notify("Copied into a new quotation");
                go({ tab: "quote" });
              }}
            />
          )}
        {route.tab === "account" && (
          <Account
            session={session}
            access={access}
            syncedAt={syncedAt}
            productCount={products.length}
            refresh={refresh}
            reload={reload}
          />
        )}
      </main>

      {route.tab === "browse" && (
        <aside className="quote-aside" aria-label="Current quotation">
          <h2>Current quote</h2>
          {lineCount ? (
            <>
              <ul>
                {draft.lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  return (
                    <li key={l.productId}>
                      <span>
                        {p?.name ?? "Unavailable product"}
                        <small className="muted">{p?.code}</small>
                      </span>
                      <span>×{l.quantity}</span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="btn btn-primary wide"
                onClick={() => go({ tab: "quote" })}
              >
                Review quote · {lineCount}{" "}
                {lineCount === 1 ? "product" : "products"}
              </button>
            </>
          ) : (
            <p className="muted">Add products to start a quotation.</p>
          )}
        </aside>
      )}

      <nav className="tab-bar" aria-label="Catalogue sections">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={pathOf({ tab: t.id })}
            aria-current={route.tab === t.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go({ tab: t.id });
            }}
          >
            <span className="tab-icon">
              <t.icon size={22} aria-hidden="true" />
              {"badge" in t && t.badge > 0 && (
                <span className="badge">{t.badge}</span>
              )}
            </span>
            {t.label}
          </a>
        ))}
      </nav>

      {route.tab === "browse" && lineCount > 0 && (
        <button
          type="button"
          className="quote-fab"
          onClick={() => go({ tab: "quote" })}
        >
          <FileText size={18} aria-hidden="true" /> Quote · {lineCount}
          <span>
            {money(
              draft.lines.reduce((n, l) => {
                const p = products.find((x) => x.id === l.productId);
                return p?.pricePaise == null
                  ? n
                  : n + p.pricePaise * l.quantity;
              }, 0),
            )}
          </span>
        </button>
      )}

      {selected && (
        <ProductSheet
          key={selected.id}
          product={selected}
          demo={config.demo}
          quantity={quantityOf(selected.id)}
          setQuantity={(n) => setQuantity(selected.id, n)}
          onClose={() =>
            (history.state as { sheet?: boolean } | null)?.sheet
              ? history.back()
              : go({ tab: "browse" }, true)
          }
          notify={notify}
          publicSite={access.mode === "public"}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SignIn({
  mode,
  onDone,
}: {
  mode: AccessInfo["mode"];
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"team" | "shared">(
    mode === "password" ? "shared" : "team",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="signin">
      <div className="signin-card">
        <Mark className="mark-lg" />
        <h1>Lenore catalogue</h1>
        <p className="muted">For Lenore’s approved sales team.</p>
        {mode === "password" && (
          <div
            className="segmented wide"
            role="group"
            aria-label="Sign-in method"
          >
            <button
              type="button"
              aria-pressed={tab === "shared"}
              onClick={() => setTab("shared")}
            >
              Team password
            </button>
            <button
              type="button"
              aria-pressed={tab === "team"}
              onClick={() => setTab("team")}
            >
              My account
            </button>
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              if (tab === "shared")
                await api(
                  "/catalogue-access",
                  { password: form.get("password") },
                  "POST",
                );
              else
                await api(
                  "/session",
                  {
                    username: form.get("phone"),
                    password: form.get("password"),
                  },
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
          {tab === "team" && (
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="username"
                required
                maxLength={20}
              />
            </label>
          )}
          <label>
            {tab === "team" ? "Password" : "Catalogue password"}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-lg wide" disabled={busy}>
            {busy ? "Signing in…" : "Open catalogue"}
          </button>
        </form>
        <a className="text-link" href="/">
          Visit lenoretrading.com
        </a>
      </div>
    </main>
  );
}

function Account({
  session,
  access,
  syncedAt,
  productCount,
  refresh,
  reload,
}: {
  session: SessionInfo;
  access: AccessInfo;
  syncedAt: string;
  productCount: number;
  refresh: () => void;
  reload: () => Promise<void>;
}) {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const admin = session.role === "owner" || session.role === "admin";
  return (
    <section className="screen" aria-labelledby="account-title">
      <header className="screen-head">
        <h1 id="account-title">Account</h1>
      </header>
      <div className="card">
        {session.role ? (
          <dl className="facts">
            <div>
              <dt>Signed in as</dt>
              <dd>{session.name}</dd>
            </div>
            {session.phone && (
              <div>
                <dt>Phone</dt>
                <dd>+{session.phone}</dd>
              </div>
            )}
            <div>
              <dt>Role</dt>
              <dd>
                {session.role === "sales"
                  ? "Salesperson"
                  : session.role === "admin"
                    ? "Admin"
                    : "Owner"}
              </dd>
            </div>
          </dl>
        ) : (
          <p>
            {access.level === "shared"
              ? "You are using the shared team password on this device."
              : "You are browsing the public catalogue."}
          </p>
        )}
        <div className="stack-actions">
          {admin && (
            <a className="btn btn-ghost" href="/manage">
              <ExternalLink size={18} aria-hidden="true" /> Open staff workspace
            </a>
          )}
          {install && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                install
                  .prompt()
                  .catch(() => undefined)
                  .finally(() => setInstall(null))
              }
            >
              <Download size={18} aria-hidden="true" /> Install the app
            </button>
          )}
          {!session.role && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowLogin(!showLogin)}
            >
              <UserRound size={18} aria-hidden="true" /> Salesperson sign in
            </button>
          )}
          {(session.role || access.level === "shared") && (
            <button
              type="button"
              className="btn btn-ghost danger"
              onClick={async () => {
                if (session.role)
                  await api("/session", undefined, "DELETE").catch(
                    () => undefined,
                  );
                else
                  await api("/catalogue-access", undefined, "DELETE").catch(
                    () => undefined,
                  );
                clearDeviceData();
                await reload();
              }}
            >
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          )}
        </div>
      </div>
      {showLogin && <SignIn mode="accounts" onDone={reload} />}
      <div className="card">
        <h2>Catalogue data</h2>
        <p className="muted">
          {productCount} products · updated {relativeTime(syncedAt)}. The
          catalogue refreshes automatically every 30 seconds while open.
        </p>
        <button type="button" className="btn btn-ghost" onClick={refresh}>
          <RefreshCw size={18} aria-hidden="true" /> Refresh now
        </button>
      </div>
      <p className="fine-print center">
        Tip: add this app to your home screen for full-screen use. USB and
        Bluetooth barcode scanners work in the search box.
      </p>
    </section>
  );
}
