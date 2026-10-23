import { Hono } from "hono";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { business } from "../business";
import {
  categorySlug,
  type AccessMode,
  type CatalogueProduct,
} from "../shared";
import { Site } from "../client/site/site";
import type { CategorySummary, SitePage } from "../client/site/types";
import type { AppContext, AppEnv } from "./access";
import { catalogueProduct, type ProductRow } from "./products";
import { readSettings } from "./quotations";
import {
  ON_WEBSITE,
  categoryLayout,
  publicView,
  readWebsite,
  type WebsiteSettings,
} from "./website";

const FALLBACK_TEMPLATE = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><title>Lenore</title></head><body><div id="root"></div></body></html>`;
let cachedTemplate: string | null = null;

/** Built index.html (with hashed asset links); a bare fallback keeps tests and previews working. */
async function template(c: AppContext) {
  if (cachedTemplate) return cachedTemplate;
  try {
    const response = await c.env.ASSETS.fetch(new URL("/", c.req.url));
    if (response.ok) {
      const html = await response.text();
      if (html.includes('<div id="root"></div>')) {
        // Production deploys start new isolates; local rebuilds must not serve stale asset links.
        if (c.env.SITE_ORIGIN) cachedTemplate = html;
        return html;
      }
    }
  } catch {
    // Assets are unavailable in unit tests.
  }
  return FALLBACK_TEMPLATE;
}

export const origin = (c: AppContext) =>
  (c.env.SITE_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, "");
const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => entities[ch]);
const jsonScript = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028\u2029]/g, "");

type Head = {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  type?: "website" | "product";
  image?: string;
  imageAlt?: string;
  jsonLd?: object[];
  /** Installable app shell: its own manifest, icon and colour. */
  app?: { manifest: string; icon: string; theme: string; title: string };
};
function headTags(c: AppContext, h: Head) {
  const base = origin(c);
  const url = `${base}${h.path}`;
  const image = h.image ?? `${base}/images/og-lenore.jpg`;
  const tags = [
    `<title>${escapeHtml(h.title)}</title>`,
    `<meta name="description" content="${escapeHtml(clip(h.description))}" />`,
    `<meta name="robots" content="${h.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="Lenore" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:type" content="${h.type ?? "website"}" />`,
    `<meta property="og:title" content="${escapeHtml(h.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(clip(h.description))}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(h.imageAlt ?? "Lenore bath fittings: taps, showers and accessories")}" />`,
    // The default card's size lets WhatsApp and Facebook lay it out before downloading it.
    ...(h.image
      ? []
      : [
          `<meta property="og:image:type" content="image/jpeg" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
        ]),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(h.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(clip(h.description))}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="geo.region" content="IN-KL" />`,
    `<meta name="geo.placename" content="Kuttiady, Kozhikode" />`,
  ];
  if (h.app)
    tags.push(
      `<link rel="manifest" href="${h.app.manifest}" />`,
      `<link rel="apple-touch-icon" href="${h.app.icon}" />`,
      `<meta name="theme-color" content="${h.app.theme}" />`,
      `<meta name="apple-mobile-web-app-capable" content="yes" />`,
      `<meta name="mobile-web-app-capable" content="yes" />`,
      `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
      `<meta name="apple-mobile-web-app-title" content="${h.app.title}" />`,
    );
  for (const item of h.jsonLd ?? [])
    tags.push(
      `<script type="application/ld+json">${jsonScript(item)}</script>`,
    );
  return tags.join("\n    ");
}
async function htmlResponse(
  c: AppContext,
  head: Head,
  body: { html: string; data?: unknown } | null,
  status = 200,
  cache = false,
) {
  let html = (await template(c)).replace(/<title>[\s\S]*?<\/title>/, "");
  html = html.replace(/<meta name="description"[^>]*>/, "");
  // Installed apps bring their own icon and colour; never two of each.
  if (head.app)
    html = html
      .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, "")
      .replace(/<meta name="theme-color"[^>]*>\s*/, "");
  html = html.replace("</head>", `    ${headTags(c, head)}\n  </head>`);
  if (body)
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${body.html}</div><script type="application/json" id="page-data">${jsonScript(body.data)}</script>`,
    );
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cache
        ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
        : "no-store",
      ...securityHeaders,
      ...(head.noindex ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    },
  });
}
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-src https://www.google.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};

async function accessMode(db: D1Database): Promise<AccessMode> {
  const row = await db
    .prepare("SELECT mode FROM catalogue_access WHERE id=1")
    .first<{ mode: AccessMode }>();
  return row?.mode ?? "accounts";
}
type SiteData = {
  mode: AccessMode;
  whatsapp: string;
  demo: boolean;
  site: WebsiteSettings;
  products: CatalogueProduct[];
  /** Products admins chose for the home page. */
  featuredIds: Set<string>;
  categories: CategorySummary[];
};
/** Website data, limited to what admins choose to show under Website. */
async function siteData(c: AppContext, withProducts = true): Promise<SiteData> {
  const db = c.env.DB;
  const [mode, settings, site, layout, rows] = await Promise.all([
    accessMode(db),
    readSettings(db),
    readWebsite(db),
    categoryLayout(db),
    // Pages without product content (about, contact) skip the product read.
    withProducts
      ? db
          .prepare(
            `SELECT * FROM products WHERE ${ON_WEBSITE} ORDER BY category,name LIMIT 5000`,
          )
          .all<ProductRow>()
      : Promise.resolve({ results: [] as ProductRow[] }),
  ]);
  const demo = c.env.DEMO_MODE === "true";
  const all = rows.results.map((r) =>
    publicView(catalogueProduct(r, "public"), site),
  );
  const featuredIds = new Set(
    rows.results.filter((r) => r.featured).map((r) => r.id),
  );
  const groups = new Map<string, CatalogueProduct[]>();
  for (const p of all)
    groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  const order = (name: string) =>
    layout.get(name.toLowerCase())?.sort_order ?? 1000;
  const categories = [...groups]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([name, items]): CategorySummary => {
      const pick =
        items.find((p) => site.showProducts && p.imageUrl) ??
        items.find((p) => demo && p.code.startsWith("DEMO-")) ??
        null;
      return {
        name,
        slug: categorySlug(name),
        count: items.length,
        intro: layout.get(name.toLowerCase())?.intro ?? "",
        coverUrl: layout.get(name.toLowerCase())?.cover_key
          ? `/api/media/${layout.get(name.toLowerCase())!.cover_key}`
          : null,
        cover: pick
          ? {
              code: pick.code,
              imageUrl: site.showProducts ? pick.imageUrl : null,
              posterUrl: null,
            }
          : null,
      };
    });
  const rank = new Map(categories.map((x, i) => [x.name, i]));
  const products = site.showProducts
    ? all.sort((a, b) => rank.get(a.category)! - rank.get(b.category)!)
    : [];
  return {
    mode,
    whatsapp: settings.whatsapp,
    demo,
    site,
    products,
    featuredIds,
    categories,
  };
}

/** "2 in 1 angle cock cubix grey PTMT" → "2 in 1 Angle Cock Cubix Grey PTMT" for titles. */
export const titleCase = (text: string) =>
  text.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) =>
    ["in", "of", "and", "with", "for", "x"].includes(a + b)
      ? a + b
      : a.toUpperCase() + b,
  );
/** Search results show about 155 characters; cut at a word, never mid-word. */
const clip = (text: string, max = 155) =>
  text.length <= max
    ? text
    : `${text.slice(0, text.lastIndexOf(" ", max - 1))}…`;
/** One honest sentence a search result can show, from the product's own facts. */
export function productSummary(
  p: Pick<
    CatalogueProduct,
    "name" | "code" | "category" | "description" | "pricePaise" | "availability"
  >,
) {
  const price =
    p.pricePaise !== null
      ? ` MRP ₹${(p.pricePaise / 100).toLocaleString("en-IN")}.`
      : "";
  // Stock is null when the website hides it; then say nothing about it.
  const stock =
    p.availability === "Available"
      ? " In stock"
      : p.availability === "Low stock"
        ? " Limited stock"
        : p.availability
          ? " Available to order"
          : " Available";
  const extra = p.description
    ? ` ${p.description.replace(/\s+/g, " ").trim()}.`
    : "";
  return `${titleCase(p.name)} (${p.code}), ${p.category.toLowerCase()}.${price}${stock} at Lenore bath fittings, Kuttiady, Kozhikode.${extra}`.replace(
    /\.\./g,
    ".",
  );
}

function businessLd(base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${base}/#business`,
    name: business.brand,
    legalName: business.legalName,
    slogan: business.tagline,
    description: business.summary,
    url: `${base}/`,
    logo: `${base}/icons/icon-512.png`,
    image: `${base}/images/og-lenore.jpg`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: business.geo.lat,
      longitude: business.geo.lng,
    },
    hasMap: `https://www.google.com/maps?q=${business.geo.lat},${business.geo.lng}`,
    telephone: business.phone,
    email: business.email,
    taxID: business.gstin,
    address: {
      "@type": "PostalAddress",
      streetAddress: business.address.street,
      addressLocality: business.address.locality,
      addressRegion: business.address.region,
      addressCountry: business.address.country,
    },
    areaServed: [
      ...business.serves.map((name) => ({ "@type": "City", name })),
      {
        "@type": "AdministrativeArea",
        name: `${business.address.district} district`,
      },
      { "@type": "State", name: business.address.region },
    ],
    priceRange: "₹₹",
    currenciesAccepted: "INR",
    paymentAccepted: "Cash, UPI, Card, Bank transfer",
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: business.hours.days.map((d) => `https://schema.org/${d}`),
      opens: business.hours.opens,
      closes: business.hours.closes,
    },
    contactPoint: {
      "@type": "ContactPoint",
      hoursAvailable: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: business.hours.days.map((d) => `https://schema.org/${d}`),
        opens: business.hours.opens,
        closes: business.hours.closes,
      },
      telephone: business.phone,
      email: business.email,
      contactType: "sales",
      areaServed: "IN",
      availableLanguage: ["en", "ml"],
    },
  };
}
const breadcrumbLd = (base: string, trail: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [["Home", "/"], ...trail].map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: `${base}${path}`,
  })),
});
function productLd(base: string, p: CatalogueProduct) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.code,
    ...(p.barcode ? { gtin: p.barcode } : {}),
    category: p.category,
    description: productSummary(p),
    ...(p.imageUrl || p.posterUrl
      ? {
          image: [p.imageUrl, p.posterUrl]
            .filter(Boolean)
            .map((u) => `${base}${u}`),
        }
      : {}),
    url: `${base}/products/${p.slug}`,
    ...(p.pricePaise !== null
      ? {
          offers: {
            "@type": "Offer",
            itemCondition: "https://schema.org/NewCondition",
            priceCurrency: "INR",
            price: (p.pricePaise / 100).toFixed(2),
            ...(p.availability && {
              availability:
                p.availability === "Available"
                  ? "https://schema.org/InStock"
                  : p.availability === "Low stock"
                    ? "https://schema.org/LimitedAvailability"
                    : "https://schema.org/OutOfStock",
            }),
            url: `${base}/products/${p.slug}`,
            seller: { "@id": `${base}/#business` },
          },
        }
      : {}),
  };
}

async function renderSite(
  c: AppContext,
  page: SitePage,
  head: Head,
  status = 200,
  cache = true,
) {
  const html = renderToString(createElement(Site, { page }));
  return htmlResponse(
    c,
    { ...head, jsonLd: [businessLd(origin(c)), ...(head.jsonLd ?? [])] },
    { html, data: page },
    status,
    cache && !!c.env.SITE_ORIGIN,
  );
}

const routes = new Hono<AppEnv>();
/**
 * Public pages are identical for every visitor, so production serves them
 * from Cloudflare's edge cache for up to 60 s instead of re-rendering.
 */
routes.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    !c.env.SITE_ORIGIN ||
    c.req.method !== "GET" ||
    !/^\/($|collections|products\/|about$|contact$|privacy$|terms$|sitemap\.xml$|robots\.txt$)/.test(
      path,
    )
  )
    return next();
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(c.req.url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  await next();
  if (
    c.res.status === 200 &&
    /s-maxage/.test(c.res.headers.get("Cache-Control") ?? "")
  )
    c.executionCtx.waitUntil(cache.put(key, c.res.clone()));
});
const common = (d: SiteData) => ({
  whatsapp: d.whatsapp,
  demo: d.demo,
  catalogueMode: d.mode,
  showPrices: d.site.showProducts && d.site.showPrices,
  showStock: d.site.showProducts && d.site.showStock,
  nav: d.categories.map(({ name, slug, count }) => ({ name, slug, count })),
});

routes.get("/", async (c) => {
  const d = await siteData(c);
  // Admin-picked products first; otherwise those with photos.
  const picked = d.products.filter((p) => d.featuredIds.has(p.id));
  const featured = picked.length
    ? picked
    : [...d.products].sort((a, b) => +!!b.imageUrl - +!!a.imageUrl).slice(0, 8);
  // Hero wall: a fresh random draw from every photographed product, so the whole range shows over visits.
  const photographed = d.products.filter((p) => p.imageUrl);
  for (let i = photographed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [photographed[i], photographed[j]] = [photographed[j], photographed[i]];
  }
  // 24 thumbnails (~1 MB) keep the page light; they load lazily below the first row.
  const hero = photographed.slice(0, 24);
  const base = origin(c);
  return renderSite(
    c,
    {
      ...common(d),
      kind: "home",
      categories: d.categories,
      featured,
      hero,
    },
    {
      title: "Lenore — Bath Fittings & Sanitary Ware in Kuttiady, Kozhikode",
      description:
        "Lenore, Refined Bathroom Living: a bath fittings and sanitary ware showroom in Vatayam, Kuttiady, Kozhikode. Taps, showers, health faucets, sinks and accessories, chosen for quality, finish and value.",
      path: "/",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Lenore",
          url: `${base}/`,
          publisher: { "@id": `${base}/#business` },
        },
      ],
    },
  );
});
routes.get("/collections", async (c) => {
  const d = await siteData(c);
  return renderSite(
    c,
    { ...common(d), kind: "collections", categories: d.categories },
    {
      title: "Collections — Bath Fittings & Sanitary Ware | Lenore",
      description: `Browse ${d.categories.map((x) => x.name.toLowerCase()).join(", ") || "bath fittings and sanitary ware"} from Lenore, Kuttiady, Kozhikode.`,
      path: "/collections",
      jsonLd: [breadcrumbLd(origin(c), [["Collections", "/collections"]])],
    },
  );
});
routes.get("/collections/:slug", async (c) => {
  const d = await siteData(c);
  const category = d.categories.find((x) => x.slug === c.req.param("slug"));
  if (!category) return notFound(c, d);
  const products = d.products.filter((p) => p.category === category.name);
  const base = origin(c);
  return renderSite(
    c,
    {
      ...common(d),
      kind: "collection",
      category,
      categories: d.categories,
      products,
    },
    {
      title: `${titleCase(category.name)} in Kuttiady, Kozhikode | Lenore Bath Fittings`,
      description:
        `Buy ${category.name.toLowerCase()} in Kuttiady: ${category.count} models at Lenore bath fittings showroom, serving Vadakara, Nadapuram, Perambra and Kozhikode. See prices, then get a quotation on WhatsApp.`.slice(
          0,
          160,
        ),
      path: `/collections/${category.slug}`,
      jsonLd: [
        breadcrumbLd(base, [
          ["Collections", "/collections"],
          [category.name, `/collections/${category.slug}`],
        ]),
        ...(products.length
          ? [
              {
                "@context": "https://schema.org",
                "@type": "ItemList",
                itemListElement: products.map((p, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: `${base}/products/${p.slug}`,
                  name: p.name,
                })),
              },
            ]
          : []),
      ],
    },
  );
});
routes.get("/products/:slug", async (c) => {
  const d = await siteData(c);
  const product = d.products.find((p) => p.slug === c.req.param("slug"));
  if (!product) return notFound(c, d);
  const base = origin(c);
  const related = d.products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `INSERT INTO product_views(day,product_id,views) VALUES(date('now'),?,1)
      ON CONFLICT(day,product_id) DO UPDATE SET views=views+1`,
    )
      .bind(product.id)
      .run()
      .catch(() => undefined),
  );
  return renderSite(
    c,
    { ...common(d), kind: "product", product, related },
    {
      title: `${titleCase(product.name)} (${product.code})${product.pricePaise !== null ? ` – ₹${Math.round(product.pricePaise / 100).toLocaleString("en-IN")}` : ""} | Lenore Kuttiady`,
      description: clip(productSummary(product)),
      path: `/products/${product.slug}`,
      type: "product",
      image: product.imageUrl ? `${base}${product.imageUrl}` : undefined,
      imageAlt: `${product.name} (${product.code})`,
      jsonLd: [
        breadcrumbLd(base, [
          ["Collections", "/collections"],
          [product.category, `/collections/${categorySlug(product.category)}`],
          [product.name, `/products/${product.slug}`],
        ]),
        productLd(base, product),
      ],
    },
  );
});
routes.get("/about", async (c) => {
  const d = await siteData(c, false);
  return renderSite(
    c,
    { ...common(d), kind: "about" },
    {
      title: "About Lenore Trading LLP — Kuttiady, Kozhikode",
      description:
        "Lenore Trading LLP supplies bath fittings and sanitary ware from its showroom in Vatayam, Kuttiady, Kozhikode, Kerala. GSTIN 32AANFL0054E1ZR.",
      path: "/about",
      jsonLd: [breadcrumbLd(origin(c), [["About", "/about"]])],
    },
  );
});
const legal = {
  privacy: {
    title: "Privacy policy | Lenore",
    description:
      "How Lenore Trading LLP collects, uses and protects the details you share through this website, enquiries and quotation requests.",
  },
  terms: {
    title: "Terms of use | Lenore",
    description:
      "Terms for using the Lenore website: prices, quotation and order requests, warranty, and how product images were created.",
  },
};
for (const doc of ["privacy", "terms"] as const)
  routes.get(`/${doc}`, async (c) => {
    const d = await siteData(c, false);
    return renderSite(
      c,
      { ...common(d), kind: "legal", doc },
      {
        ...legal[doc],
        path: `/${doc}`,
        jsonLd: [
          breadcrumbLd(origin(c), [
            [doc === "privacy" ? "Privacy policy" : "Terms of use", `/${doc}`],
          ]),
        ],
      },
    );
  });
routes.get("/contact", async (c) => {
  const d = await siteData(c, false);
  return renderSite(
    c,
    { ...common(d), kind: "contact" },
    {
      title: "Visit the Lenore Showroom — Vatayam, Kuttiady",
      description: `Visit Lenore at ${business.address.street}, Kuttiady, Kozhikode. Call ${business.phoneDisplay}, WhatsApp or email ${business.email}.`,
      path: "/contact",
      jsonLd: [breadcrumbLd(origin(c), [["Visit us", "/contact"]])],
    },
  );
});
routes.get("/q/:token", async (c) => {
  const token = c.req.param("token");
  const d = await siteData(c);
  const row = /^[0-9a-f]{36}$/.test(token)
    ? await c.env.DB.prepare("SELECT id FROM quotations WHERE share_token=?")
        .bind(token)
        .first<{ id: string }>()
    : null;
  if (!row) return notFound(c, d);
  const api = await c.env.DB.prepare("SELECT * FROM quotations WHERE id=?")
    .bind(row.id)
    .first<Record<string, unknown>>();
  const quote = {
    id: api!.id,
    number: api!.number,
    shareToken: token,
    status: api!.status,
    channel: api!.channel,
    createdBy: null,
    createdByName: api!.created_by_name,
    createdByPhone: api!.created_by_phone,
    customerName: api!.customer_name,
    customerPhone: api!.customer_phone,
    customerPlace: api!.customer_place,
    notes: api!.notes,
    validUntil: api!.valid_until,
    terms: api!.terms,
    items: JSON.parse(String(api!.items_json)),
    itemCount: api!.item_count,
    mrpTotalPaise: api!.mrp_total_paise,
    discountPaise: api!.discount_paise,
    totalPaise: api!.total_paise,
    version: api!.version,
    revision: api!.revision,
    createdAt: api!.created_at,
    updatedAt: api!.updated_at,
  } as Extract<SitePage, { kind: "quote" }>["quote"];
  return renderSite(
    c,
    { ...common(d), kind: "quote", quote },
    {
      title: `Quotation ${quote.number} for ${quote.customerName} | Lenore`,
      description: `Quotation ${quote.number} from ${business.legalName}, prepared by ${quote.createdByName}.`,
      path: `/q/${token}`,
      noindex: true,
    },
    200,
    false,
  );
});

/** Installable app shells: sales catalogue and staff workspace (client-rendered, noindex). */
const apps = {
  catalogue: {
    manifest: "/manifest.webmanifest",
    icon: "/icons/apple-touch-icon.png",
    theme: "#ffffff",
    title: "Lenore",
  },
  admin: {
    manifest: "/manage.webmanifest",
    icon: "/icons/admin-192.png",
    theme: "#202a34",
    title: "Lenore Admin",
  },
  pos: {
    manifest: "/pos.webmanifest",
    icon: "/icons/pos-192.png",
    theme: "#ffffff",
    title: "Billing",
  },
};
const shell =
  (title: string, app: (typeof apps)[keyof typeof apps]) =>
  async (c: AppContext) =>
    htmlResponse(
      c,
      {
        title,
        description: "Lenore team workspace.",
        path: new URL(c.req.url).pathname,
        noindex: true,
        app,
      },
      null,
    );
routes.get("/catalogue", shell("Lenore Catalogue", apps.catalogue));
routes.get("/catalogue/*", shell("Lenore Catalogue", apps.catalogue));
routes.get("/pos", shell("Lenore Billing", apps.pos));
routes.get("/pos/*", shell("Lenore Billing", apps.pos));
routes.get("/manage", shell("Lenore Admin", apps.admin));
routes.get("/manage/*", shell("Lenore Admin", apps.admin));

routes.get("/robots.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return c.text(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /manage",
      "Disallow: /catalogue",
      "Disallow: /pos",
      "Disallow: /q/",
      "",
      `Sitemap: ${origin(c)}/sitemap.xml`,
      "",
    ].join("\n"),
  );
});
routes.get("/sitemap.xml", async (c) => {
  const d = await siteData(c);
  const base = origin(c);
  const latest = d.products.reduce(
    (m, p) => (p.updatedAt > m ? p.updatedAt : m),
    "",
  );
  const entry = (path: string, lastmod?: string, images: string[] = []) =>
    `<url><loc>${escapeHtml(base + path)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}${images.map((i) => `<image:image><image:loc>${escapeHtml(base + i)}</image:loc></image:image>`).join("")}</url>`;
  const urls = [
    entry("/", latest || undefined),
    entry("/collections", latest || undefined),
    entry("/about"),
    entry("/privacy"),
    entry("/terms"),
    entry("/contact"),
    // Each collection changes when one of its products does.
    ...d.categories.map((x) =>
      entry(
        `/collections/${x.slug}`,
        d.products
          .filter((p) => p.category === x.name)
          .reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), "") ||
          undefined,
      ),
    ),
    // Product photos and posters, so they can surface in Google Images.
    ...d.products.map((p) =>
      entry(
        `/products/${p.slug}`,
        p.updatedAt,
        [p.imageUrl, p.posterUrl].filter((u): u is string => !!u),
      ),
    ),
  ];
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=0, s-maxage=600");
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("")}</urlset>\n`,
  );
});

export async function notFound(c: AppContext, d?: SiteData) {
  const data = d ?? (await siteData(c));
  return renderSite(
    c,
    { ...common(data), kind: "notfound" },
    {
      title: "Page not found | Lenore",
      description: "This page could not be found.",
      path: new URL(c.req.url).pathname,
      noindex: true,
    },
    404,
    false,
  );
}
export default routes;
