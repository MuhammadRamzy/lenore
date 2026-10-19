import { Overlay } from "./overlay";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  X,
  Share2,
  Menu,
} from "lucide-react";
import { type CatalogueProduct, money } from "../shared";
import { api, errorMessage } from "./api";
import { Brand, type SiteConfig } from "./brand";
import { QuoteActions } from "./quote-actions";
import type { CustomerDraft } from "./quotation";

type BasketLine = { productId: string; quantity: number };
const demoPhotos: Record<string, string> = {
  "DEMO-BM01": "basin-mixer",
  "DEMO-SH02": "overhead-shower",
  "DEMO-TP03": "bib-tap",
  "DEMO-AC04": "towel-rail",
};
function DemoProductVisual({ product }: { product: CatalogueProduct }) {
  return (
    <div className="demo-product-visual">
      <img
        src={`/images/demo-${demoPhotos[product.code]}.webp`}
        alt={`${product.name} · AI-generated sample, not an actual Lenore product`}
        loading="lazy"
      />
      <span>Illustrative sample · AI-generated</span>
    </div>
  );
}
function readBasket(): BasketLine[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("lenore-basket-v1") ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (v): v is BasketLine =>
              !!v &&
              typeof v.productId === "string" &&
              Number.isInteger(v.quantity) &&
              v.quantity > 0 &&
              v.quantity <= 99999,
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function readCustomer(): CustomerDraft {
  try {
    const p = JSON.parse(localStorage.getItem("lenore-customer-v1") ?? "{}");
    return {
      name: typeof p.name === "string" ? p.name.slice(0, 120) : "",
      phone: typeof p.phone === "string" ? p.phone.slice(0, 25) : "",
      notes: typeof p.notes === "string" ? p.notes.slice(0, 2000) : "",
    };
  } catch {
    return { name: "", phone: "", notes: "" };
  }
}
export function PublicSite({ config }: { config: SiteConfig }) {
  const catalogue = location.pathname.startsWith("/catalogue");
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(
    new URLSearchParams(location.search).get("category") ?? "All products",
  );
  const [basket, setBasket] = useState(readBasket);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customer, setCustomer] = useState(readCustomer);
  const [lastDraft, setLastDraft] = useState<{
    basket: BasketLine[];
    customer: CustomerDraft;
  } | null>(null);
  const [posterView, setPosterView] = useState(false);
  const [shareError, setShareError] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem("lenore-customer-v1", JSON.stringify(customer));
    } catch {
      /* Draft remains usable without local storage. */
    }
  }, [customer]);
  const [selected, setSelected] = useState<CatalogueProduct | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [sending, setSending] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function refresh() {
    try {
      setProducts(await api<CatalogueProduct[]>("/catalogue"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    api<CatalogueProduct[]>("/catalogue")
      .then(setProducts)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
    const handler = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", handler);
    const timer = window.setInterval(handler, 30000);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("lenore-basket-v1", JSON.stringify(basket));
    } catch {
      /* Basket remains usable when storage is unavailable. */
    }
  }, [basket]);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const filtered = products.filter(
    (p) =>
      (category === "All products" || p.category === category) &&
      `${p.name} ${p.code} ${p.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const lines = basket.map((line) => ({
    ...line,
    product: products.find((p) => p.id === line.productId),
  }));
  const missing = lines.some((l) => !l.product);
  const quantity = basket.reduce((sum, l) => sum + l.quantity, 0);
  function change(id: string, quantity: number) {
    setSubmitted("");
    setQuoteError("");
    setRequestId(crypto.randomUUID());
    setBasket((previous) =>
      quantity <= 0
        ? previous.filter((l) => l.productId !== id)
        : previous.some((l) => l.productId === id)
          ? previous.map((l) =>
              l.productId === id
                ? { ...l, quantity: Math.min(99999, quantity) }
                : l,
            )
          : [
              ...previous,
              { productId: id, quantity: Math.min(99999, quantity) },
            ],
    );
  }
  function add(p: CatalogueProduct) {
    change(p.id, (basket.find((l) => l.productId === p.id)?.quantity ?? 0) + 1);
  }
  const quotation = {
    reference: `Q-${requestId.slice(0, 8).toUpperCase()}`,
    customer,
    items: lines
      .filter((l) => !!l.product)
      .map((l) => ({
        productId: l.productId,
        name: l.product!.name,
        code: l.product!.code,
        pricePaise: l.product!.pricePaise,
        quantity: l.quantity,
      })),
  };
  const selectedMedia = posterView
    ? selected?.posterUrl
    : selected?.imageUrl || selected?.posterUrl;
  function selectProduct(p: CatalogueProduct) {
    setPosterView(!p.imageUrl && !!p.posterUrl);
    setShareError("");
    setSelected(p);
  }
  async function shareProduct(p: CatalogueProduct) {
    const text = `Lenore · ${p.code} · ${p.name}\n${p.category}\nSuggested MRP: ${money(p.pricePaise)}\n${p.availability} · ${p.stock} ${p.unit}\n${p.description}`;
    if (!navigator.share) {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    try {
      const files: File[] = [];
      for (const url of [p.imageUrl, p.posterUrl].filter(
        (v): v is string => !!v,
      )) {
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          files.push(
            new File(
              [blob],
              `${p.code}-${files.length + 1}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`,
              { type: blob.type },
            ),
          );
        }
      }
      const data: ShareData = { title: p.name, text };
      if (files.length && navigator.canShare?.({ files })) data.files = files;
      await navigator.share(data);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setShareError(errorMessage(e));
    }
  }
  return (
    <div className="public-site">
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation" className={menuOpen ? "is-open" : ""}>
          <a href="/catalogue" className={catalogue ? "active" : ""}>
            Collection
          </a>
          <a href="/#collection">Categories</a>
          <a href="/#approach">How to enquire</a>
        </nav>
        <button
          className="mobile-nav-button icon-button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu size={20} />
        </button>
        <button className="basket-button" onClick={() => setOpen(true)}>
          <ShoppingBag size={19} />
          <span>Enquiry</span>
          <b>{quantity}</b>
        </button>
      </header>
      <main>
        {!catalogue ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <h1>
                  Bath fittings.
                  <br />
                  <span>Beautifully simple.</span>
                </h1>
                <p>
                  Mixers, showers and finishing touches.
                  <br />
                  Find the details that work for your space.
                </p>
                <div className="hero-actions">
                  <a className="button dark" href="/catalogue">
                    Explore the collection <ArrowRight size={16} />
                  </a>
                  <a className="text-link" href="#collection">
                    Browse categories{" "}
                    <ChevronLeft className="next-chevron" size={16} />
                  </a>
                </div>
              </div>
              <figure className="hero-image">
                {config.demo ? (
                  <img
                    src="/images/mixer-cutout.png"
                    alt="Illustrative chrome single-lever basin mixer"
                    fetchPriority="high"
                  />
                ) : products.find((p) => p.imageUrl) ? (
                  <img
                    src={products.find((p) => p.imageUrl)!.imageUrl!}
                    alt={products.find((p) => p.imageUrl)!.name}
                    fetchPriority="high"
                  />
                ) : null}
                {config.demo && (
                  <figcaption>
                    Illustrative product study · AI-generated
                  </figcaption>
                )}
              </figure>
            </section>
            <section className="range-section" id="collection">
              <div className="section-heading">
                <h2>Find your fit.</h2>
                <a className="text-link" href="/catalogue">
                  View all products <ArrowUpRight size={17} />
                </a>
              </div>
              <nav
                className="range-links"
                aria-label="Browse product categories"
              >
                {[
                  "Basin mixers",
                  "Showers",
                  "Taps",
                  "Accessories",
                  "Sanitary ware",
                ].map((name) => (
                  <a
                    key={name}
                    href={`/catalogue?category=${encodeURIComponent(name)}`}
                  >
                    <span>{name}</span>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
              </nav>
              <div className="landing-products">
                {products.slice(0, 4).map((p) => (
                  <article key={p.id}>
                    <button
                      className="landing-product-visual"
                      aria-label={`Discover ${p.name}`}
                      onClick={() => selectProduct(p)}
                    >
                      {p.imageUrl || p.posterUrl ? (
                        <img
                          src={p.imageUrl || p.posterUrl!}
                          alt={p.name}
                          loading="lazy"
                        />
                      ) : config.demo && demoPhotos[p.code] ? (
                        <DemoProductVisual product={p} />
                      ) : (
                        <div className="photo-pending">
                          <span>Product photography pending</span>
                        </div>
                      )}
                    </button>
                    <div className="landing-product-description">
                      <span>{p.category}</span>
                      <button onClick={() => selectProduct(p)}>{p.name}</button>
                      <p>{p.code}</p>
                      <strong>{money(p.pricePaise)}</strong>
                    </div>
                  </article>
                ))}
              </div>
              {loading && <p className="loading">Loading the range…</p>}
              {error && (
                <p role="alert" className="error">
                  The collection could not load.{" "}
                  <button onClick={() => void refresh()}>Try again</button>
                </p>
              )}
              {!loading && !error && !products.length && (
                <p className="loading">The collection is being prepared.</p>
              )}
            </section>
            <section className="approach" id="approach">
              <div>
                <h2>Choose. Shortlist. Enquire.</h2>
                <p>
                  Pick your products, add the quantities, and keep everything in
                  one enquiry. Download your selection or share it with our
                  team.
                </p>
                <a className="button dark" href="/catalogue">
                  Start your selection <ArrowRight size={16} />
                </a>
              </div>
              <div
                className="enquiry-preview"
                aria-label="How an enquiry works"
              >
                <div>
                  <ShoppingBag size={22} />
                  <strong>Your project list</strong>
                </div>
                <p>Products and quantities, together.</p>
                <div>
                  <span>Product details</span>
                  <Check size={17} />
                </div>
                <div>
                  <span>Availability &amp; suggested MRP</span>
                  <Check size={17} />
                </div>
                <div>
                  <span>PDF &amp; WhatsApp sharing</span>
                  <Check size={17} />
                </div>
                <a className="text-link" href="/catalogue">
                  Make it yours <ArrowRight size={16} />
                </a>
              </div>
            </section>
          </>
        ) : (
          <section className="catalogue-page">
            <div className="catalogue-heading">
              <a className="back-link" href="/">
                <ChevronLeft size={16} /> Back to Lenore
              </a>
              <div>
                <h1>
                  The <em>collection.</em>
                </h1>
                <p>Find the right details. Keep your choices together.</p>
              </div>
              <span>
                {loading
                  ? "Loading collection…"
                  : `${products.length} products`}
              </span>
            </div>
            <div className="catalogue-tools">
              <div className="category-tabs" aria-label="Product categories">
                {["All products", ...categories].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "selected" : ""}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Search collection"
                  placeholder="Search by name or code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="catalogue-results">
              {error ? (
                <div role="alert" className="empty">
                  <h2>We couldn’t load the collection.</h2>
                  <p>{error}</p>
                  <button className="button" onClick={() => void refresh()}>
                    Try again
                  </button>
                </div>
              ) : loading ? (
                <div className="loading">Opening the collection…</div>
              ) : filtered.length === 0 ? (
                <div className="empty">
                  <h2>
                    {products.length
                      ? "No products match your search."
                      : "The collection is being prepared."}
                  </h2>
                  <p>
                    {products.length
                      ? "Try another name or choose a different category."
                      : "Please check back for published products."}
                  </p>
                  {products.length > 0 && (
                    <button
                      className="button"
                      onClick={() => {
                        setCategory("All products");
                        setSearch("");
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="product-grid">
                  {filtered.map((p) => (
                    <article className="product-card" key={p.id}>
                      <button
                        className="product-picture"
                        onClick={() => selectProduct(p)}
                        aria-label={`View ${p.name}`}
                      >
                        {p.imageUrl || p.posterUrl ? (
                          <img
                            src={p.imageUrl || p.posterUrl!}
                            alt={p.name}
                            loading="lazy"
                          />
                        ) : config.demo && demoPhotos[p.code] ? (
                          <DemoProductVisual product={p} />
                        ) : (
                          <div className="photo-pending">
                            <img src="/images/lenore-mark.png" alt="" />
                            <span>Photography coming soon</span>
                            <small>{p.code}</small>
                          </div>
                        )}
                        <ArrowUpRight size={20} />
                      </button>
                      <div className="product-meta">
                        <span>{p.category}</span>
                        <span
                          className={`availability ${p.availability === "Available" ? "available" : p.availability === "Low stock" ? "low" : "out"}`}
                        >
                          {p.availability}
                        </span>
                      </div>
                      <button
                        className="product-title"
                        onClick={() => selectProduct(p)}
                      >
                        {p.name}
                      </button>
                      <div className="product-bottom">
                        <div>
                          <small>{p.code}</small>
                          <strong>MRP · {money(p.pricePaise)}</strong>
                        </div>
                        <button
                          className="icon-button add-button"
                          aria-label={`Add ${p.name} to enquiry`}
                          onClick={() => add(p)}
                        >
                          {basket.some((l) => l.productId === p.id) ? (
                            <Check size={20} />
                          ) : (
                            <Plus size={20} />
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="catalogue-note">
              Availability is indicative. Final pricing and stock are confirmed
              by the team when your enquiry is reviewed.
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <Brand compact />
        <div>
          Bath fittings & sanitary ware.
          <br />
          <span>Thoughtfully brought together.</span>
        </div>
        <a href="/catalogue">
          Explore the collection <ArrowUpRight size={17} />
        </a>
        <div className="footer-bottom">
          <small>© {new Date().getFullYear()} Lenore</small>
          <a href="/manage">
            Staff workspace <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
      {selected && (
        <Overlay onClose={() => setSelected(null)}>
          <div className="panel-shade" onClick={() => setSelected(null)}>
            <section
              className="detail-panel"
              role="dialog"
              aria-modal="true"
              aria-label={selected.name}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                autoFocus
                className="icon-button close"
                aria-label="Close product"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
              <div className="detail-visual">
                {selectedMedia ? (
                  <a
                    href={selectedMedia}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open full-size image"
                  >
                    <img
                      src={selectedMedia}
                      alt={`${selected.name}${posterView ? " specifications" : ""}`}
                    />
                  </a>
                ) : config.demo && demoPhotos[selected.code] ? (
                  <DemoProductVisual product={selected} />
                ) : (
                  <div className="photo-pending">
                    <img src="/images/lenore-mark.png" alt="" />
                    <span>Photography coming soon</span>
                  </div>
                )}
              </div>
              {(selected.imageUrl || selected.posterUrl) && (
                <div className="media-tabs">
                  <button
                    disabled={!selected.imageUrl}
                    aria-pressed={!posterView}
                    onClick={() => setPosterView(false)}
                  >
                    Product photo
                  </button>
                  <button
                    disabled={!selected.posterUrl}
                    aria-pressed={posterView}
                    onClick={() => setPosterView(true)}
                  >
                    Specifications
                  </button>
                </div>
              )}
              <h2>{selected.name}</h2>
              <p>
                {selected.description ||
                  "Contact the team for product specifications."}
              </p>
              <dl>
                <div>
                  <dt>Product code</dt>
                  <dd>{selected.code}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{selected.category}</dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>{selected.availability}</dd>
                </div>
                <div>
                  <dt>Stock on hand</dt>
                  <dd>
                    {selected.stock} {selected.unit}
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>
                    {new Date(selected.updatedAt).toLocaleString("en-IN")}
                  </dd>
                </div>
                <div>
                  <dt>Suggested MRP</dt>
                  <dd>{money(selected.pricePaise)}</dd>
                </div>
              </dl>
              <button
                className="button wide"
                onClick={() => void shareProduct(selected)}
              >
                <Share2 size={16} /> Share product and images
              </button>
              {shareError && (
                <p className="error" role="alert">
                  {shareError}
                </p>
              )}
              <button
                className="button dark wide"
                onClick={() => {
                  add(selected);
                  setSelected(null);
                  setOpen(true);
                }}
              >
                Add to enquiry <Plus size={18} />
              </button>
            </section>
          </div>
        </Overlay>
      )}
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div className="panel-shade" onClick={() => setOpen(false)}>
            <section
              className="basket-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="enquiry-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-heading">
                <h2 id="enquiry-title">
                  Your enquiry
                  <span>
                    {basket.length}{" "}
                    {basket.length === 1 ? "product" : "products"}
                  </span>
                </h2>
                <button
                  autoFocus
                  className="icon-button"
                  aria-label="Close enquiry"
                  onClick={() => setOpen(false)}
                >
                  <X />
                </button>
              </div>
              <p className="muted">
                A shortlist for your next space. Sending an enquiry does not
                place an order or reserve stock.
              </p>
              {!basket.length ? (
                <div className="empty">
                  {lastDraft && (
                    <button
                      className="button"
                      onClick={() => {
                        setBasket(lastDraft.basket);
                        setCustomer(lastDraft.customer);
                        setLastDraft(null);
                      }}
                    >
                      Restore last enquiry
                    </button>
                  )}
                  <ShoppingBag size={36} />
                  <h3>Room for your favourites.</h3>
                  <p>Add products from the collection to get started.</p>
                  <a className="button dark" href="/catalogue">
                    Browse the collection <ArrowRight size={18} />
                  </a>
                </div>
              ) : (
                <>
                  <div className="basket-lines">
                    {lines.map((line) => (
                      <article key={line.productId}>
                        <div>
                          <strong>
                            {line.product?.name ??
                              "Product no longer available"}
                          </strong>
                          <small>{line.product?.code}</small>
                          <span>
                            {line.product
                              ? `MRP: ${money(line.product.pricePaise)} · Amount: ${line.product.pricePaise === null ? "To be confirmed" : money(line.product.pricePaise * line.quantity)}`
                              : "Remove this item before submitting."}
                          </span>
                        </div>
                        <div className="stepper">
                          <button
                            aria-label={`Reduce ${line.product?.name ?? "item"} quantity`}
                            onClick={() =>
                              change(line.productId, line.quantity - 1)
                            }
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            aria-label={`Quantity for ${line.product?.name ?? "item"}`}
                            type="number"
                            min="1"
                            max="99999"
                            value={line.quantity}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isInteger(n) && n > 0)
                                change(line.productId, n);
                            }}
                          />
                          <button
                            aria-label={`Increase ${line.product?.name ?? "item"} quantity`}
                            onClick={() =>
                              change(line.productId, line.quantity + 1)
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${line.product?.name ?? "item"}`}
                          onClick={() => change(line.productId, 0)}
                        >
                          <X size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!missing && (
                    <QuoteActions
                      quotation={quotation}
                      whatsapp={config.whatsapp}
                    />
                  )}
                  <button
                    className="text-link"
                    onClick={() => {
                      setLastDraft({ basket, customer });
                      setBasket([]);
                      setCustomer({ name: "", phone: "", notes: "" });
                      setSubmitted("");
                    }}
                  >
                    Clear enquiry
                  </button>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (sending || missing) return;
                      const form = new FormData(e.currentTarget);
                      setSending(true);
                      setQuoteError("");
                      try {
                        const result = await api<{ id: string }>(
                          "/quotes",
                          {
                            id: requestId,
                            name: form.get("name"),
                            phone: form.get("phone"),
                            notes: form.get("notes"),
                            items: basket,
                          },
                          "POST",
                        );
                        setSubmitted(result.id);
                      } catch (error) {
                        setQuoteError(errorMessage(error));
                      } finally {
                        setSending(false);
                      }
                    }}
                    onChange={() => {
                      setRequestId(crypto.randomUUID());
                      setSubmitted("");
                    }}
                    className="enquiry-form"
                  >
                    <h3>Ask the team for a quotation</h3>
                    <label>
                      Your name
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="name"
                        value={customer.name}
                        onChange={(e) =>
                          setCustomer((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Phone number
                      <input
                        name="phone"
                        type="tel"
                        required
                        minLength={7}
                        maxLength={25}
                        autoComplete="tel"
                        value={customer.phone}
                        onChange={(e) =>
                          setCustomer((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Project notes <span>(optional)</span>
                      <textarea
                        name="notes"
                        maxLength={2000}
                        rows={3}
                        value={customer.notes}
                        onChange={(e) =>
                          setCustomer((p) => ({ ...p, notes: e.target.value }))
                        }
                      />
                    </label>
                    {quoteError && (
                      <p className="error" role="alert">
                        {quoteError}
                      </p>
                    )}
                    {submitted ? (
                      <div role="status" className="success">
                        Enquiry received · {submitted.slice(0, 8).toUpperCase()}
                        <p>The team can now review your shortlist.</p>
                      </div>
                    ) : (
                      <button
                        disabled={sending || missing}
                        className="button dark wide"
                      >
                        {sending ? "Sending enquiry…" : "Send enquiry"}
                        <ArrowUpRight size={18} />
                      </button>
                    )}
                  </form>
                </>
              )}
            </section>
          </div>
        </Overlay>
      )}
    </div>
  );
}
