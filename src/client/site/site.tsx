import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Link2,
  MapPin,
  Menu,
  Clock,
  MessageCircle,
  ChevronDown,
  Phone,
  Printer,
  X,
  Mail,
  Check,
  ShieldCheck,
} from "lucide-react";
import { business, addressLine } from "../../business";
import { categorySlug, money, type CatalogueProduct } from "../../shared";
import {
  businessWhatsapp,
  mapEmbed,
  mapsLink,
  productImage,
  telLink,
  thumb,
  whatsappLink,
  withCountry,
} from "../links";
import { QuoteDocument } from "../quote-view";
import type { CategorySummary, SitePage } from "./types";
import { OpenCart } from "./cart";
import {
  ActionBar,
  AddToCart,
  CartButton,
  CartPanel,
  CartToast,
} from "./cart-panel";

export function Mark({ className = "" }: { className?: string }) {
  return <span className={`mark ${className}`} aria-hidden="true" />;
}
export function Wordmark() {
  return (
    <a className="wordmark" href="/" aria-label="Lenore home">
      <Mark />
      <span>
        LENORE
        <small>{business.tagline}</small>
      </span>
    </a>
  );
}

function Header({ page }: { page: SitePage }) {
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(false);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!panel) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !header.current?.contains(e.target as Node)
      )
        setPanel(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [panel]);
  useEffect(() => {
    const d = dialog.current;
    if (menu && d && !d.open) d.showModal();
    if (!menu && d?.open) d.close();
  }, [menu]);
  const section =
    page.kind === "collections" ||
    page.kind === "collection" ||
    page.kind === "product"
      ? "collections"
      : page.kind;
  const current = (s: string) => (section === s ? "page" : undefined);
  const biggest = [...page.nav].sort((a, b) => b.count - a.count);
  const whatsapp = whatsappLink(
    "Hello Lenore, I would like to know more about your bath fittings.",
    businessWhatsapp(page.whatsapp),
  );
  return (
    <header ref={header} className="site-header">
      <div className="site-header-inner">
        <Wordmark />
        <nav className="site-nav" aria-label="Main navigation">
          {page.nav.length > 0 ? (
            <button
              type="button"
              className="nav-link"
              aria-expanded={panel}
              aria-controls="collections-panel"
              aria-current={current("collections")}
              onClick={() => setPanel(!panel)}
            >
              Collections <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : (
            <a
              className="nav-link"
              href="/collections"
              aria-current={current("collections")}
            >
              Collections
            </a>
          )}
          <a className="nav-link" href="/about" aria-current={current("about")}>
            About
          </a>
          <a
            className="nav-link"
            href="/contact"
            aria-current={current("contact")}
          >
            Visit us
          </a>
        </nav>
        <div className="site-header-actions">
          <CartButton />
          <a
            className="btn btn-sm header-whatsapp hide-mobile"
            href={whatsapp}
            target="_blank"
            rel="noopener"
          >
            <MessageCircle size={16} aria-hidden="true" /> WhatsApp
          </a>
          <button
            type="button"
            className="icon-btn show-mobile"
            aria-label="Open menu"
            aria-expanded={menu}
            aria-controls="mobile-menu"
            onClick={() => setMenu(true)}
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {panel && (
        <div id="collections-panel" className="collections-panel">
          <div className="collections-panel-inner">
            <ul>
              {biggest.map((c) => (
                <li key={c.slug}>
                  <a href={`/collections/${c.slug}`}>
                    {c.name}
                    <small>{c.count}</small>
                  </a>
                </li>
              ))}
            </ul>
            <a className="text-link" href="/collections">
              All collections <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}

      <dialog
        ref={dialog}
        id="mobile-menu"
        className="mobile-menu"
        aria-label="Menu"
        onClose={() => setMenu(false)}
      >
        <div className="mobile-menu-head">
          <Wordmark />
          <button
            type="button"
            className="icon-btn"
            aria-label="Close menu"
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <nav className="mobile-menu-links" aria-label="Menu">
          <details>
            <summary aria-current={current("collections")}>
              Collections <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <ul>
              {biggest.map((c) => (
                <li key={c.slug}>
                  <a href={`/collections/${c.slug}`}>
                    {c.name}
                    <small>{c.count}</small>
                  </a>
                </li>
              ))}
              <li>
                <a href="/collections" className="all">
                  All collections <ArrowRight size={16} aria-hidden="true" />
                </a>
              </li>
            </ul>
          </details>
          <a href="/about" aria-current={current("about")}>
            About
          </a>
          <a href="/contact" aria-current={current("contact")}>
            Visit us
          </a>
        </nav>
        <div className="mobile-menu-contact">
          <a
            className="btn btn-primary btn-lg"
            href={whatsapp}
            target="_blank"
            rel="noopener"
          >
            <MessageCircle size={18} aria-hidden="true" /> WhatsApp
          </a>
          <a className="btn btn-ghost btn-lg" href={telLink(business.phone)}>
            <Phone size={18} aria-hidden="true" /> Call
          </a>
          <a
            className="btn btn-ghost btn-lg"
            href={mapsLink}
            target="_blank"
            rel="noopener"
          >
            <MapPin size={18} aria-hidden="true" /> Directions
          </a>
          <p>{addressLine}</p>
        </div>
      </dialog>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <Wordmark />
          <p>
            Bath fittings and sanitary ware, chosen with care and quoted
            clearly. Visit our showroom in Kuttiady.
          </p>
        </div>
        <div>
          <h2>Visit</h2>
          <address>
            {business.legalName}
            <br />
            {business.address.street}
            <br />
            {business.address.locality}, {business.address.district}
            <br />
            {business.address.region}, India
          </address>
          <p className="footer-hours">
            {business.hours.display}
            <br />
            {business.hours.closed}
          </p>
          <a href={mapsLink} target="_blank" rel="noopener">
            Get directions
          </a>
        </div>
        <div>
          <h2>Contact</h2>
          <ul>
            <li>
              <a href={telLink(business.phone)}>{business.phoneDisplay}</a>
            </li>
            <li>
              <a href={`mailto:${business.email}`}>{business.email}</a>
            </li>
            <li>
              <a href="/contact">Send an enquiry</a>
            </li>
          </ul>
        </div>
        <div>
          <h2>Explore</h2>
          <ul>
            <li>
              <a href="/collections">Collections</a>
            </li>
            <li>
              <a href="/about">About Lenore</a>
            </li>
            <li>
              <a href="/catalogue">Sales catalogue</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="site-footer-legal">
        <span>
          © {new Date().getFullYear()} {business.legalName}
        </span>
        <nav className="footer-legal-links" aria-label="Legal">
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms of use</a>
        </nav>
        <span>GSTIN {business.gstin}</span>
      </div>
    </footer>
  );
}

/** Thumb-reach contact bar on phones. */
export function ProductImage({
  product,
  demo,
  sizes = "(max-width: 700px) 50vw, 25vw",
  eager = false,
}: {
  product: Pick<CatalogueProduct, "code" | "name" | "imageUrl" | "posterUrl">;
  demo: boolean;
  sizes?: string;
  eager?: boolean;
}) {
  const image = productImage(product, demo);
  if (!image)
    return (
      <div className="product-image empty">
        <Mark />
        <span>Photo coming soon</span>
      </div>
    );
  return (
    <div className="product-image">
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.srcSet ? sizes : undefined}
        alt={
          image.illustrative
            ? `${product.name}, illustrative AI-generated sample`
            : product.name
        }
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        width={800}
        height={800}
      />
      {image.illustrative && <span className="sample-tag">Sample image</span>}
    </div>
  );
}
export function StatusBadge({ product }: { product: CatalogueProduct }) {
  if (!product.availability) return null;
  const tone =
    product.availability === "Available"
      ? "ok"
      : product.availability === "Low stock"
        ? "low"
        : "out";
  return (
    <span className={`status status-${tone}`}>
      {product.availability === "Currently unavailable"
        ? "Out of stock"
        : product.availability === "Low stock"
          ? "Limited stock"
          : "In stock"}
      {product.stock !== null && ` · ${product.stock} ${product.unit}`}
    </span>
  );
}

function ProductCard({
  product,
  demo,
}: {
  product: CatalogueProduct;
  demo: boolean;
}) {
  return (
    <article className="product-card">
      <a className="product-card-link" href={`/products/${product.slug}`}>
        <ProductImage product={product} demo={demo} />
        <div className="product-card-body">
          <span className="eyebrow">{product.category}</span>
          <h3>{product.name}</h3>
          <span className="code">{product.code}</span>
          <div className="product-card-foot">
            <strong>{money(product.pricePaise)}</strong>
            <StatusBadge product={product} />
          </div>
        </div>
      </a>
      <AddToCart product={product} />
    </article>
  );
}

function CategoryGrid({
  categories,
  demo,
}: {
  categories: CategorySummary[];
  demo: boolean;
}) {
  return (
    <ul className="category-grid">
      {categories.map((c) => (
        <li key={c.slug}>
          <a href={`/collections/${c.slug}`} className="category-tile">
            {c.cover ? (
              <ProductImage
                product={{ ...c.cover, name: c.name }}
                demo={demo}
                sizes="(max-width: 700px) 50vw, 20vw"
              />
            ) : (
              <div className="product-image empty">
                <Mark />
              </div>
            )}
            <span className="category-name">
              {c.name}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
            <span className="category-count">
              {c.count} {c.count === 1 ? "product" : "products"}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function CatalogueNote({ page }: { page: SitePage }) {
  return (
    <div className="catalogue-note">
      <div>
        <h3>Prices and availability on request</h3>
        <p>
          Our team will share current prices, stock and a written quotation on
          WhatsApp, or show you the range at the showroom.
        </p>
      </div>
      <a
        className="btn btn-primary"
        href={whatsappLink(
          "Hello Lenore, please share prices and availability.",
          businessWhatsapp(page.whatsapp),
        )}
        target="_blank"
        rel="noopener"
      >
        <MessageCircle size={18} aria-hidden="true" /> Ask on WhatsApp
      </a>
    </div>
  );
}

/** One product at a time on warm stone, as the brand's photography asks; it moves on every few seconds. */
function Spotlight({ products }: { products: CatalogueProduct[] }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  // Only the current and next photos are fetched; earlier ones stay for the cross-fade.
  const [loaded, setLoaded] = useState(1);
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const t = setInterval(() => {
      setAt((n) => (n + 1) % products.length);
      setLoaded((n) => Math.min(products.length, n + 1));
    }, 5000);
    return () => clearInterval(t);
  }, [paused, products.length]);
  const p = products[at];
  return (
    <figure
      className="spotlight"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <a className="spotlight-stage" href={`/products/${p.slug}`}>
        {products.slice(0, Math.max(loaded + 1, at + 1)).map((x, n) => (
          <img
            key={x.id}
            className={n === at ? "on" : undefined}
            src={x.imageUrl!}
            srcSet={`${thumb(x.imageUrl!)} 600w, ${x.imageUrl} 1600w`}
            sizes="(max-width: 900px) 90vw, 520px"
            alt={n === at ? x.name : ""}
            width={800}
            height={800}
            fetchPriority={n === 0 ? "high" : "low"}
            decoding="async"
          />
        ))}
      </a>
      <figcaption>
        <a href={`/products/${p.slug}`}>
          <small>{p.category}</small>
          <span>{p.name}</span>
        </a>
        <span className="spotlight-dots">
          {products.map((x, n) => (
            <button
              key={x.id}
              type="button"
              aria-label={`Show ${x.name}`}
              aria-pressed={n === at}
              onClick={() => {
                setAt(n);
                setLoaded((l) => Math.max(l, n + 1));
              }}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

/** The rest of the draw, drifting past in one calm row; listed twice for a seamless loop. */
function Filmstrip({ products }: { products: CatalogueProduct[] }) {
  return (
    <div className="filmstrip" role="region" aria-label="More from the range">
      <ul>
        {[...products, ...products].map((p, i) => {
          const copy = i >= products.length;
          return (
            <li key={`${p.id}-${i}`} aria-hidden={copy || undefined}>
              <a href={`/products/${p.slug}`} tabIndex={copy ? -1 : undefined}>
                <img
                  src={thumb(p.imageUrl!)}
                  alt={copy ? "" : p.name}
                  width={160}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <span>{p.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Home({ page }: { page: Extract<SitePage, { kind: "home" }> }) {
  return (
    <>
      <section className="hero-stone" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-tagline">{business.tagline}</p>
            <h1 id="hero-title">
              Your bathroom, <span>considered.</span>
            </h1>
            <p className="lead">
              Taps, showers, sinks and accessories, chosen for quality, finish
              and value. See them side by side in our showroom.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href="/collections">
                Explore the collection{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="btn btn-ghost btn-lg" href="/contact">
                <MapPin size={18} aria-hidden="true" /> Visit the showroom
              </a>
            </div>
            {page.categories.length > 0 && (
              <p className="hero-count">
                <b>{page.categories.reduce((n, c) => n + c.count, 0)}</b>{" "}
                fittings in <b>{page.categories.length}</b> collections
              </p>
            )}
          </div>
          {page.hero.length > 0 && (
            <Spotlight products={page.hero.slice(0, 8)} />
          )}
        </div>
        {page.hero.length > 8 && <Filmstrip products={page.hero.slice(8)} />}
      </section>

      {page.categories.length > 0 && (
        <section className="section" aria-labelledby="ranges-title">
          <div className="section-head">
            <h2 id="ranges-title">Shop by category</h2>
            <a href="/collections" className="text-link">
              All collections <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          {/* The biggest ranges first; the full list is one tap away. */}
          <div className="home-categories">
            <CategoryGrid
              categories={[...page.categories]
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)}
              demo={page.demo}
            />
          </div>
          {page.categories.length > 8 && (
            <p className="section-more">
              <a className="btn btn-ghost" href="/collections">
                View all {page.categories.length} collections{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </p>
          )}
        </section>
      )}

      {page.featured.length > 0 && (
        <section className="section" aria-labelledby="featured-title">
          <div className="section-head">
            <h2 id="featured-title">Featured products</h2>
          </div>
          <div className="product-grid">
            {page.featured.map((p) => (
              <ProductCard key={p.id} product={p} demo={page.demo} />
            ))}
          </div>
        </section>
      )}

      <Warranty />
      <VisitSection page={page} />
    </>
  );
}

/** Warranty terms, shared by the home, about and product pages. */
function Warranty({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <p className="warranty-line">
        <ShieldCheck size={16} aria-hidden="true" /> Warranty:{" "}
        {business.warranty
          .map(
            (w) =>
              `${w.years} ${w.years === 1 ? "year" : "years"} ${w.part.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`,
          )
          .join(" · ")}
      </p>
    );
  // Bars share one 0–10 year scale, so the cover reads at a glance.
  const longest = Math.max(...business.warranty.map((w) => w.years));
  return (
    <section className="section" aria-labelledby="warranty-title">
      <div className="warranty">
        <div className="warranty-copy">
          <ShieldCheck size={28} aria-hidden="true" />
          <h2 id="warranty-title">Fittings built to last, and backed for it</h2>
          <p>
            Every CP fitting carries a {longest}-year warranty on its body, with
            separate cover for the spindle, head and accessories.
          </p>
        </div>
        <div className="warranty-chart">
          <dl>
            {business.warranty.map((w) => (
              <div
                key={w.part}
                className={`warranty-row${w.highlight ? " top" : ""}`}
              >
                <dt>{w.part}</dt>
                <dd>
                  <b>{w.years}</b> {w.years === 1 ? "year" : "years"}
                </dd>
                {/* SVG width, not an inline style: the CSP blocks style attributes. */}
                <svg
                  className="warranty-bar"
                  viewBox="0 0 100 1"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect width="100" height="1" className="track" />
                  <rect width={(w.years / longest) * 100} height="1" />
                </svg>
              </div>
            ))}
          </dl>
          <ol className="warranty-axis" aria-hidden="true">
            {Array.from({ length: longest + 1 }, (_, y) => (
              <li key={y}>{y % 2 === 0 ? y : ""}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function VisitSection({ page }: { page: SitePage }) {
  return (
    <section className="section visit" aria-labelledby="visit-title">
      <div className="visit-card">
        <h2 id="visit-title">Come and see the range</h2>
        <address>
          <strong>{business.legalName}</strong>
          <span>{addressLine}</span>
          <span>
            {business.hours.display}. {business.hours.closed}.
          </span>
        </address>
        <p className="visit-serves">
          Serving {business.serves.slice(0, -1).join(", ")} and across{" "}
          {business.address.district} district. GST invoices for homes, builders
          and contractors.
        </p>
        <div className="visit-actions">
          <a
            className="btn btn-primary"
            href={mapsLink}
            target="_blank"
            rel="noopener"
          >
            <MapPin size={18} aria-hidden="true" /> Get directions
          </a>
          <a className="btn btn-ghost" href={telLink(business.phone)}>
            <Phone size={18} aria-hidden="true" /> {business.phoneDisplay}
          </a>
          <a className="btn btn-ghost" href={`mailto:${business.email}`}>
            <Mail size={18} aria-hidden="true" /> Email us
          </a>
        </div>
      </div>
      <EnquiryForm page={page} />
    </section>
  );
}

function EnquiryForm({ page }: { page: SitePage }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const interests =
    page.kind === "home" || page.kind === "collections"
      ? page.categories.map((c) => c.name)
      : [];
  return (
    <form
      className="enquiry-form"
      aria-labelledby="enquiry-title"
      onSubmit={async (e) => {
        e.preventDefault();
        if (state === "sending") return;
        const form = e.currentTarget;
        const data = new FormData(form);
        setState("sending");
        setError("");
        try {
          const response = await fetch("/api/enquiries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              name: String(data.get("name") ?? ""),
              phone: String(data.get("phone") ?? ""),
              interest: String(data.get("interest") ?? ""),
              message: String(data.get("message") ?? ""),
            }),
          });
          const result = (await response.json()) as { error?: string };
          if (!response.ok)
            throw new Error(result.error ?? "Please try again.");
          form.reset();
          setState("sent");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Please try again.");
          setState("idle");
        }
      }}
    >
      <h2 id="enquiry-title">Send an enquiry</h2>
      <p className="muted">We usually reply on WhatsApp or by phone.</p>
      {state === "sent" ? (
        <p className="success" role="status">
          <Check size={18} aria-hidden="true" /> Thank you. Our team will
          contact you soon.
        </p>
      ) : (
        <>
          <label>
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label>
            Phone
            <input
              name="phone"
              required
              type="tel"
              inputMode="tel"
              maxLength={25}
              autoComplete="tel"
            />
          </label>
          {interests.length > 0 ? (
            <label>
              Interested in
              <select name="interest" defaultValue="">
                <option value="">Not sure yet</option>
                {interests.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="interest" value="" />
          )}
          <label>
            Message
            <textarea name="message" rows={3} maxLength={2000} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Send enquiry"}
          </button>
        </>
      )}
    </form>
  );
}

function Collections({
  page,
}: {
  page: Extract<SitePage, { kind: "collections" }>;
}) {
  return (
    <section className="section page-top">
      <Breadcrumbs trail={[["Collections", "/collections"]]} />
      <h1>Collections</h1>
      <p className="lead">
        Bath fittings and sanitary ware available through Lenore, Kuttiady.
      </p>
      {page.categories.length ? (
        <div className="collections-index">
          <CategoryGrid categories={page.categories} demo={page.demo} />
        </div>
      ) : (
        <p className="muted">
          Our collection is being updated. Please check back soon.
        </p>
      )}
      {!page.showPrices && <CatalogueNote page={page} />}
    </section>
  );
}

function Collection({
  page,
}: {
  page: Extract<SitePage, { kind: "collection" }>;
}) {
  return (
    <section className="section page-top">
      <Breadcrumbs
        trail={[
          ["Collections", "/collections"],
          [page.category.name, `/collections/${page.category.slug}`],
        ]}
      />
      <h1>{page.category.name}</h1>
      <p className="lead">
        {page.category.intro ||
          `${page.category.name} from Lenore, Kuttiady, Kozhikode.`}{" "}
        {page.category.count}{" "}
        {page.category.count === 1 ? "product" : "products"} in this range.
      </p>
      <nav className="chip-row" aria-label="Other collections">
        {page.categories.map((c) => (
          <a
            key={c.slug}
            href={`/collections/${c.slug}`}
            className="chip"
            aria-current={c.slug === page.category.slug ? "page" : undefined}
          >
            {c.name}
          </a>
        ))}
      </nav>
      {page.products.length > 0 && (
        <div className="product-grid">
          {page.products.map((p) => (
            <ProductCard key={p.id} product={p} demo={page.demo} />
          ))}
        </div>
      )}
      {(!page.products.length || !page.showPrices) && (
        <CatalogueNote page={page} />
      )}
    </section>
  );
}

function ProductPage({
  page,
}: {
  page: Extract<SitePage, { kind: "product" }>;
}) {
  const p = page.product;
  const message = `Hello Lenore, I am interested in ${p.name} (${p.code}). Please share details.`;
  return (
    <>
      <section className="section page-top product-detail">
        <Breadcrumbs
          trail={[
            ["Collections", "/collections"],
            [p.category, `/collections/${categorySlug(p.category)}`],
            [p.name, `/products/${p.slug}`],
          ]}
        />
        <div className="product-detail-grid">
          <div className="product-detail-media">
            <ProductImage
              product={p}
              demo={page.demo}
              eager
              sizes="(max-width: 900px) 100vw, 50vw"
            />
            {p.posterUrl && p.imageUrl && (
              <img
                className="poster"
                src={p.posterUrl}
                alt={`${p.name} specification sheet`}
                loading="lazy"
              />
            )}
          </div>
          <div className="product-detail-info">
            <p className="eyebrow">{p.category}</p>
            <h1>{p.name}</h1>
            <p className="code">Code {p.code}</p>
            <p className="price">
              {money(p.pricePaise)}
              {p.pricePaise !== null && <small>MRP, inclusive of taxes</small>}
            </p>
            <StatusBadge product={p} />
            {p.description && <p className="description">{p.description}</p>}
            <Warranty compact />
            <div className="product-detail-actions">
              <AddToCart product={p} large />
              <a
                className="btn btn-ghost btn-lg"
                href={whatsappLink(message, businessWhatsapp(page.whatsapp))}
                target="_blank"
                rel="noopener"
              >
                <MessageCircle size={18} aria-hidden="true" /> Enquire on
                WhatsApp
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={telLink(business.phone)}
              >
                <Phone size={18} aria-hidden="true" /> Call the showroom
              </a>
            </div>
          </div>
        </div>
      </section>
      {page.related.length > 0 && (
        <section className="section" aria-labelledby="related-title">
          <div className="section-head">
            <h2 id="related-title">More in {p.category}</h2>
          </div>
          <div className="product-grid">
            {page.related.map((r) => (
              <ProductCard key={r.id} product={r} demo={page.demo} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function About({ page }: { page: SitePage }) {
  return (
    <>
      <section className="section page-top prose">
        <Breadcrumbs trail={[["About", "/about"]]} />
        <h1>Refined bathroom living, close to home.</h1>
        <p className="lead">
          {business.legalName} supplies bath fittings and sanitary ware from its
          showroom in Vatayam, Kuttiady, in Kerala&apos;s Kozhikode district.
        </p>
        <p>
          We help homeowners, builders and contractors choose fittings that suit
          the space and the budget. Our sales team prepares itemised quotations
          with product codes and MRP, and shares them on WhatsApp so you can
          review them at your own pace.
        </p>
        <p>
          Visit the showroom near Mother Clinic to see the range in person, or
          send us a message and we will help you plan your bathroom.
        </p>
        <dl className="facts">
          <div>
            <dt>Registered name</dt>
            <dd>{business.legalName}</dd>
          </div>
          <div>
            <dt>GSTIN</dt>
            <dd>{business.gstin}</dd>
          </div>
          <div>
            <dt>Showroom</dt>
            <dd>{addressLine}</dd>
          </div>
        </dl>
      </section>
      <Warranty />
      <VisitSection page={page} />
    </>
  );
}

function Contact({ page }: { page: SitePage }) {
  const whatsapp = whatsappLink(
    "Hello Lenore, I would like to visit the showroom.",
    businessWhatsapp(page.whatsapp),
  );
  return (
    <>
      <section className="section page-top contact-page">
        <Breadcrumbs trail={[["Visit us", "/contact"]]} />
        <div className="contact-grid">
          <div className="contact-info">
            <h1>Visit the showroom</h1>
            <p className="lead">
              See the finishes side by side before you decide. We are in
              Vatayam, Kuttiady, near Mother Clinic.
            </p>
            <dl className="contact-list">
              <div>
                <dt>
                  <MapPin size={18} aria-hidden="true" /> Address
                </dt>
                <dd>
                  {business.legalName}
                  <br />
                  {business.address.street}
                  <br />
                  {business.address.locality}, {business.address.district},{" "}
                  {business.address.region}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock size={18} aria-hidden="true" /> Hours
                </dt>
                <dd>
                  {business.hours.display}
                  <br />
                  <span className="muted">{business.hours.closed}</span>
                </dd>
              </div>
              <div>
                <dt>
                  <Phone size={18} aria-hidden="true" /> Phone
                </dt>
                <dd>
                  <a href={telLink(business.phone)}>{business.phoneDisplay}</a>
                </dd>
              </div>
              <div>
                <dt>
                  <MessageCircle size={18} aria-hidden="true" /> WhatsApp
                </dt>
                <dd>
                  <a href={whatsapp} target="_blank" rel="noopener">
                    Message us on WhatsApp
                  </a>
                </dd>
              </div>
              <div>
                <dt>
                  <Mail size={18} aria-hidden="true" /> Email
                </dt>
                <dd>
                  <a href={`mailto:${business.email}`}>{business.email}</a>
                </dd>
              </div>
            </dl>
            <div className="contact-actions">
              <a
                className="btn btn-primary btn-lg"
                href={mapsLink}
                target="_blank"
                rel="noopener"
              >
                <MapPin size={18} aria-hidden="true" /> Get directions
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={telLink(business.phone)}
              >
                <Phone size={18} aria-hidden="true" /> Call
              </a>
            </div>
            <p className="contact-serves">
              Serving {business.serves.slice(0, -1).join(", ")} and across{" "}
              {business.address.district} district.
            </p>
          </div>
          <figure className="contact-map">
            <iframe
              src={mapEmbed}
              title="Map showing the Lenore showroom in Vatayam, Kuttiady"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <figcaption>
              <a href={mapsLink} target="_blank" rel="noopener">
                Open in Google Maps{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
        </div>
      </section>
      <section className="section contact-enquiry">
        <div>
          <h2>Planning a bathroom?</h2>
          <p className="lead">
            Send us your list or a few photos of the space, and we will help you
            choose.
          </p>
        </div>
        <EnquiryForm page={page} />
      </section>
    </>
  );
}

const LEGAL_UPDATED = "22 October 2026";

/** Privacy policy and terms; plain words, matching what the site actually does. */
function Legal({ page }: { page: Extract<SitePage, { kind: "legal" }> }) {
  const contact = (
    <p>
      {business.legalName}, {addressLine}. Email{" "}
      <a href={`mailto:${business.email}`}>{business.email}</a> or call{" "}
      <a href={telLink(business.phone)}>{business.phoneDisplay}</a>.
    </p>
  );
  if (page.doc === "privacy")
    return (
      <section className="section page-top prose legal">
        <Breadcrumbs trail={[["Privacy policy", "/privacy"]]} />
        <h1>Privacy policy</h1>
        <p className="lead">
          What we collect when you use this website or contact us, why, and the
          choices you have. Last updated {LEGAL_UPDATED}.
        </p>
        <h2>Who we are</h2>
        {contact}
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Enquiries and cart requests:</strong> your name, phone
            number, and anything you add (place, note, message), with the
            products and quantities you chose.
          </li>
          <li>
            <strong>Quotations and bills:</strong> the details needed to prepare
            them, such as name, phone, address and GSTIN for businesses.
          </li>
          <li>
            <strong>Product views:</strong> a daily count of how often each
            product page is opened. It does not identify you.
          </li>
          <li>
            <strong>Technical data:</strong> your IP address is used briefly to
            stop misuse of the enquiry form, and our host keeps standard server
            logs for security.
          </li>
        </ul>
        <p>
          We do not use advertising or tracking cookies. Visitors browsing the
          website get no cookies; staff and catalogue sign-ins use a sign-in
          cookie. Your cart and the name and phone you last entered are kept
          only in your own browser, so you do not have to type them again; you
          can clear them by clearing your browser&apos;s site data.
        </p>
        <h2>How we use it</h2>
        <p>
          To reply to you, prepare quotations, confirm and deliver orders, issue
          GST invoices and provide warranty service. We do not sell or rent your
          details, and we do not use them for marketing without your consent.
        </p>
        <h2>Who else handles it</h2>
        <ul>
          <li>
            <strong>Cloudflare</strong> hosts this website and its data.
          </li>
          <li>
            <strong>WhatsApp (Meta)</strong> carries the messages you choose to
            send us there.
          </li>
          <li>
            <strong>Google Maps</strong> shows the map on our Visit us page;
            Google receives your request when that map loads.
          </li>
        </ul>
        <h2>How long we keep it</h2>
        <p>
          Enquiries are kept while we follow them up and for a reasonable time
          afterwards. Invoices and accounting records are kept for as long as
          tax law requires.
        </p>
        <h2>Your rights</h2>
        <p>
          Under India&apos;s Digital Personal Data Protection Act, 2023, you can
          ask to see, correct or delete the personal data we hold about you,
          withdraw consent, and raise a grievance. Contact us using the details
          above and we will respond promptly. Records we must keep by law, such
          as invoices, cannot be deleted before that period ends.
        </p>
        <h2>Changes</h2>
        <p>
          We will update this page if our practices change, with a new date at
          the top.
        </p>
      </section>
    );
  return (
    <section className="section page-top prose legal">
      <Breadcrumbs trail={[["Terms of use", "/terms"]]} />
      <h1>Terms of use</h1>
      <p className="lead">
        The terms for using this website and asking us for quotations or orders.
        Last updated {LEGAL_UPDATED}.
      </p>
      <h2 id="images">Product images</h2>
      <p>
        Product photographs and specification posters on this website were
        created or enhanced with AI tools, starting from photographs of the
        actual products we sell. They are faithful representations, but finish,
        colour, proportions and fine details can differ slightly from the
        product you receive. Please see the product in our showroom, or ask us
        on WhatsApp, if an exact detail matters to you.
      </p>
      <h2>Prices and product details</h2>
      <p>
        Prices are the maximum retail price (MRP), inclusive of taxes, and can
        change without notice. We take care to keep codes, prices, stock status
        and descriptions correct, but mistakes can happen; the price on your
        quotation or bill is the one that applies.
      </p>
      <h2>Quotation and order requests</h2>
      <p>
        Sending a cart, enquiry or order request does not create an order or
        reserve stock. An order is confirmed only when our team confirms it with
        you and issues a bill. We do not take payments on this website.
        Quotations are valid until the date shown on them.
      </p>
      <h2>Warranty, returns and exchanges</h2>
      <p>
        Warranty cover is{" "}
        {business.warranty
          .map(
            (w) =>
              `${w.years} ${w.years === 1 ? "year" : "years"} on ${w.part.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`,
          )
          .join(", ")}
        , against manufacturing defects. Returns and exchanges follow the terms
        printed on your bill; please keep the original bill.
      </p>
      <h2>Using this website</h2>
      <p>
        The Lenore name, logo, text and images on this website belong to{" "}
        {business.legalName} and may not be reused without permission. Please do
        not misuse the website or its forms.
      </p>
      <h2>Liability and law</h2>
      <p>
        This website is provided as it is. To the extent the law allows, we are
        not liable for indirect losses arising from its use. These terms are
        governed by the laws of India, and the courts of Kozhikode, Kerala have
        jurisdiction.
      </p>
      <h2>Contact</h2>
      {contact}
    </section>
  );
}

function QuotePage({ page }: { page: Extract<SitePage, { kind: "quote" }> }) {
  const q = page.quote;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const contact = q.createdByPhone
    ? withCountry(q.createdByPhone)
    : businessWhatsapp(page.whatsapp);
  return (
    <section className="section page-top quote-page">
      <div className="quote-page-actions no-print">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const { quotationPdf } = await import("../quotation");
              const file = await quotationPdf(q);
              const url = URL.createObjectURL(file);
              const a = document.createElement("a");
              a.href = url;
              a.download = file.name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Download failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={18} aria-hidden="true" />
          {busy ? "Preparing…" : "Download PDF"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => window.print()}
        >
          <Printer size={18} aria-hidden="true" /> Print
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              setMessage("Link copied.");
            } catch {
              setMessage("Copy the address bar to share this quotation.");
            }
          }}
        >
          <Link2 size={18} aria-hidden="true" /> Copy link
        </button>
        <a
          className="btn btn-ghost"
          href={whatsappLink(`Hello, about quotation ${q.number}:`, contact)}
          target="_blank"
          rel="noopener"
        >
          <MessageCircle size={18} aria-hidden="true" /> Reply on WhatsApp
        </a>
      </div>
      {message && (
        <p className="muted no-print" role="status">
          {message}
        </p>
      )}
      <QuoteDocument quote={q} />
    </section>
  );
}

function NotFound() {
  return (
    <section className="section page-top prose">
      <h1>Page not found</h1>
      <p className="lead">
        This page may have moved. Explore the collection or contact the
        showroom.
      </p>
      <div className="hero-actions">
        <a className="btn btn-primary" href="/collections">
          Explore collections <ArrowUpRight size={18} aria-hidden="true" />
        </a>
        <a className="btn btn-ghost" href="/">
          Home
        </a>
      </div>
    </section>
  );
}

function Breadcrumbs({ trail }: { trail: [string, string][] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <a href="/">Home</a>
        </li>
        {trail.map(([label, href], i) => (
          <li key={href}>
            {i === trail.length - 1 ? (
              <span aria-current="page">{label}</span>
            ) : (
              <a href={href}>{label}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Site({ page }: { page: SitePage }) {
  const [cartOpen, setCartOpen] = useState(false);
  const openCart = useCallback(() => setCartOpen(true), []);
  let body: ReactNode;
  switch (page.kind) {
    case "home":
      body = <Home page={page} />;
      break;
    case "collections":
      body = <Collections page={page} />;
      break;
    case "collection":
      body = <Collection page={page} />;
      break;
    case "product":
      body = <ProductPage page={page} />;
      break;
    case "about":
      body = <About page={page} />;
      break;
    case "contact":
      body = <Contact page={page} />;
      break;
    case "legal":
      body = <Legal page={page} />;
      break;
    case "quote":
      body = <QuotePage page={page} />;
      break;
    default:
      body = <NotFound />;
  }
  return (
    <OpenCart.Provider value={openCart}>
      <div className="site">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header page={page} />
        <main id="main">{body}</main>
        <Footer />
        {page.kind !== "quote" && (
          <ActionBar
            whatsappHref={whatsappLink(
              "Hello Lenore, I would like to know more about your bath fittings.",
              businessWhatsapp(page.whatsapp),
            )}
          />
        )}
        <CartToast />
        <CartPanel
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          whatsapp={page.whatsapp}
        />
      </div>
    </OpenCart.Provider>
  );
}
