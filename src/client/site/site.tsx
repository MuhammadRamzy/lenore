import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Link2,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Printer,
  X,
  Mail,
  Check,
} from "lucide-react";
import { business, addressLine } from "../../business";
import { categorySlug, money, type CatalogueProduct } from "../../shared";
import {
  businessWhatsapp,
  mapsLink,
  productImage,
  telLink,
  whatsappLink,
  withCountry,
} from "../links";
import { QuoteDocument } from "../quote-view";
import type { CategorySummary, SitePage } from "./types";

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
  const [open, setOpen] = useState(false);
  const links = [
    ["/collections", "Collections"],
    ["/about", "About"],
    ["/contact", "Visit us"],
  ];
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Wordmark />
        <nav
          id="site-nav"
          className={open ? "open" : ""}
          aria-label="Main navigation"
        >
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={
                (page.kind === "collections" || page.kind === "collection"
                  ? "/collections"
                  : `/${page.kind}`) === href
                  ? "page"
                  : undefined
              }
            >
              {label}
            </a>
          ))}
          <a href="/catalogue" className="nav-catalogue">
            Sales catalogue
          </a>
        </nav>
        <div className="site-header-actions">
          <a
            className="btn btn-primary btn-sm hide-mobile"
            href={whatsappLink(
              "Hello Lenore, I would like to know more about your bath fittings.",
              businessWhatsapp(page.whatsapp),
            )}
            target="_blank"
            rel="noopener"
          >
            <MessageCircle size={16} aria-hidden="true" /> WhatsApp
          </a>
          <button
            type="button"
            className="icon-btn show-mobile"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
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
        <span>GSTIN {business.gstin}</span>
      </div>
    </footer>
  );
}

/** Thumb-reach contact bar on phones. */
function ActionBar({ page }: { page: SitePage }) {
  return (
    <nav className="action-bar" aria-label="Quick contact">
      <a href={telLink(business.phone)}>
        <Phone size={20} aria-hidden="true" />
        Call
      </a>
      <a
        className="primary"
        href={whatsappLink(
          "Hello Lenore, I would like to know more about your bath fittings.",
          businessWhatsapp(page.whatsapp),
        )}
        target="_blank"
        rel="noopener"
      >
        <MessageCircle size={20} aria-hidden="true" />
        WhatsApp
      </a>
      <a href={mapsLink} target="_blank" rel="noopener">
        <MapPin size={20} aria-hidden="true" />
        Directions
      </a>
    </nav>
  );
}

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
    <a className="product-card" href={`/products/${product.slug}`}>
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

function Home({ page }: { page: Extract<SitePage, { kind: "home" }> }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {business.legalName} · {business.address.locality}
          </p>
          <h1>
            Refined bathroom living, <span>chosen with care.</span>
          </h1>
          <p className="lead">
            Bath fittings and sanitary ware for homes and projects across
            Kozhikode. Explore the range, then let our team prepare a clear,
            itemised quotation.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href="/collections">
              Explore collections <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              className="btn btn-ghost btn-lg"
              href={whatsappLink(
                "Hello Lenore, I would like a quotation.",
                businessWhatsapp(page.whatsapp),
              )}
              target="_blank"
              rel="noopener"
            >
              <MessageCircle size={18} aria-hidden="true" /> Request a quote
            </a>
          </div>
          <ul className="hero-facts">
            <li>
              <MapPin size={16} aria-hidden="true" /> Showroom in Kuttiady
            </li>
            <li>
              <Phone size={16} aria-hidden="true" /> {business.phoneDisplay}
            </li>
          </ul>
        </div>
        <figure className="hero-visual">
          <img
            src="/images/mixer-cutout-960.webp"
            srcSet="/images/mixer-cutout-640.webp 640w, /images/mixer-cutout-960.webp 960w"
            sizes="(max-width: 900px) 80vw, 45vw"
            alt="Chrome single lever basin mixer, illustrative product study"
            width={960}
            height={960}
            fetchPriority="high"
          />
          <figcaption>Illustrative product study</figcaption>
        </figure>
      </section>

      {page.categories.length > 0 && (
        <section className="section" aria-labelledby="ranges-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">The range</p>
              <h2 id="ranges-title">Shop by category</h2>
            </div>
            <a href="/collections" className="text-link">
              All collections <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <CategoryGrid categories={page.categories} demo={page.demo} />
        </section>
      )}

      {page.featured.length > 0 && (
        <section className="section" aria-labelledby="featured-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">In the showroom</p>
              <h2 id="featured-title">Featured products</h2>
            </div>
          </div>
          <div className="product-grid">
            {page.featured.map((p) => (
              <ProductCard key={p.id} product={p} demo={page.demo} />
            ))}
          </div>
        </section>
      )}

      <section className="section promise" aria-labelledby="promise-title">
        <h2 id="promise-title" className="visually-hidden">
          Why buy from Lenore
        </h2>
        <div className="promise-grid">
          <div>
            <span className="promise-index">01</span>
            <h3>See it in person</h3>
            <p>
              Visit our Kuttiady showroom near Mother Clinic to see finishes and
              compare products side by side.
            </p>
          </div>
          <div>
            <span className="promise-index">02</span>
            <h3>Clear, written quotations</h3>
            <p>
              Every quotation lists product codes, quantities, MRP and totals,
              shared on WhatsApp or as a PDF.
            </p>
          </div>
          <div>
            <span className="promise-index">03</span>
            <h3>A registered local business</h3>
            <p>
              {business.legalName}, GSTIN {business.gstin}. Proper invoices for
              homes, builders and projects.
            </p>
          </div>
        </div>
      </section>

      <VisitSection page={page} />
    </>
  );
}

function VisitSection({ page }: { page: SitePage }) {
  return (
    <section className="section visit" aria-labelledby="visit-title">
      <div className="visit-card">
        <p className="eyebrow">Visit the showroom</p>
        <h2 id="visit-title">Come and see the range</h2>
        <address>
          <strong>{business.legalName}</strong>
          <span>{addressLine}</span>
        </address>
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
        <CategoryGrid categories={page.categories} demo={page.demo} />
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
            <div className="product-detail-actions">
              <a
                className="btn btn-primary btn-lg"
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
        <p className="eyebrow">About Lenore</p>
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
      <VisitSection page={page} />
    </>
  );
}

function Contact({ page }: { page: SitePage }) {
  return (
    <>
      <section className="section page-top">
        <Breadcrumbs trail={[["Visit us", "/contact"]]} />
        <p className="eyebrow">Contact</p>
        <h1>Visit, call or message us</h1>
        <p className="lead">
          {addressLine}. Call {business.phoneDisplay} or email{" "}
          <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>
      </section>
      <VisitSection page={page} />
    </>
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
    case "quote":
      body = <QuotePage page={page} />;
      break;
    default:
      body = <NotFound />;
  }
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {page.demo && (
        <p className="demo-ribbon">
          Preview · Sample products and images are illustrative
        </p>
      )}
      <Header page={page} />
      <main id="main">{body}</main>
      <Footer />
      {page.kind !== "quote" && <ActionBar page={page} />}
    </div>
  );
}
