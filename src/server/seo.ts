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
  jsonLd?: object[];
  manifest?: boolean;
};
function headTags(c: AppContext, h: Head) {
  const base = origin(c);
  const url = `${base}${h.path}`;
  const image = h.image ?? `${base}/images/og-lenore.jpg`;
  const tags = [
    `<title>${escapeHtml(h.title)}</title>`,
    `<meta name="description" content="${escapeHtml(h.description)}" />`,
    `<meta name="robots" content="${h.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="Lenore" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:type" content="${h.type ?? "website"}" />`,
    `<meta property="og:title" content="${escapeHtml(h.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(h.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="geo.region" content="IN-KL" />`,
    `<meta name="geo.placename" content="Kuttiady, Kozhikode" />`,
  ];
  if (h.manifest)
    tags.push(
      `<link rel="manifest" href="/manifest.webmanifest" />`,
      `<meta name="apple-mobile-web-app-capable" content="yes" />`,
      `<meta name="mobile-web-app-capable" content="yes" />`,
      `<meta name="apple-mobile-web-app-title" content="Lenore" />`,
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
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
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
  products: CatalogueProduct[];
  categories: CategorySummary[];
};
/** Website data. Product details are exposed only when the catalogue is public. */
async function siteData(c: AppContext): Promise<SiteData> {
  const [mode, settings, rows] = await Promise.all([
    accessMode(c.env.DB),
    readSettings(c.env.DB),
    c.env.DB.prepare(
      "SELECT * FROM products WHERE published=1 ORDER BY category,name LIMIT 5000",
    ).all<ProductRow>(),
  ]);
  const demo = c.env.DEMO_MODE === "true";
  const all = rows.results.map((r) => catalogueProduct(r, "public"));
  const groups = new Map<string, CatalogueProduct[]>();
  for (const p of all)
    groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  const categories = [...groups].map(([name, items]): CategorySummary => {
    const pick =
      items.find((p) => mode === "public" && p.imageUrl) ??
      items.find((p) => demo && p.code.startsWith("DEMO-")) ??
      null;
    return {
      name,
      slug: categorySlug(name),
      count: items.length,
      cover: pick
        ? {
            code: pick.code,
            imageUrl: mode === "public" ? pick.imageUrl : null,
            posterUrl: null,
          }
        : null,
    };
  });
  return {
    mode,
    whatsapp: settings.whatsapp,
    demo,
    products: mode === "public" ? all : [],
    categories,
  };
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
    areaServed: [business.address.district, business.address.region],
    contactPoint: {
      "@type": "ContactPoint",
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
    description: p.description || `${p.name} from Lenore, Kuttiady.`,
    ...(p.imageUrl ? { image: `${base}${p.imageUrl}` } : {}),
    url: `${base}/products/${p.slug}`,
    ...(p.pricePaise !== null
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: (p.pricePaise / 100).toFixed(2),
            availability:
              p.availability === "Available"
                ? "https://schema.org/InStock"
                : p.availability === "Low stock"
                  ? "https://schema.org/LimitedAvailability"
                  : "https://schema.org/OutOfStock",
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
const common = (d: SiteData) => ({
  whatsapp: d.whatsapp,
  demo: d.demo,
  catalogueMode: d.mode,
});

routes.get("/", async (c) => {
  const d = await siteData(c);
  const featured = [...d.products]
    .sort((a, b) => +!!b.imageUrl - +!!a.imageUrl)
    .slice(0, 8);
  const base = origin(c);
  return renderSite(
    c,
    { ...common(d), kind: "home", categories: d.categories, featured },
    {
      title: "Lenore — Bath Fittings & Sanitary Ware in Kuttiady, Kozhikode",
      description:
        "Lenore Trading LLP, Kuttiady: bath fittings and sanitary ware for homes and projects in Kozhikode, Kerala. Explore collections, visit the showroom or request a quotation on WhatsApp.",
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
      title: `${category.name} in Kuttiady, Kozhikode | Lenore`,
      description: `${category.name} from Lenore Trading LLP, Kuttiady. ${category.count} products. Visit the showroom or request prices and a quotation on WhatsApp.`,
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
      title: `${product.name} (${product.code}) | Lenore Kuttiady`,
      description:
        `${product.name}, ${product.category.toLowerCase()} from Lenore, Kuttiady. ${product.description}`.slice(
          0,
          158,
        ),
      path: `/products/${product.slug}`,
      type: "product",
      image: product.imageUrl ? `${base}${product.imageUrl}` : undefined,
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
  const d = await siteData(c);
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
routes.get("/contact", async (c) => {
  const d = await siteData(c);
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
const shell = (title: string) => async (c: AppContext) =>
  htmlResponse(
    c,
    {
      title,
      description: "Lenore team workspace.",
      path: new URL(c.req.url).pathname,
      noindex: true,
      manifest: true,
    },
    null,
  );
routes.get("/catalogue", shell("Lenore Catalogue"));
routes.get("/catalogue/*", shell("Lenore Catalogue"));
routes.get("/manage", shell("Lenore Workspace"));
routes.get("/manage/*", shell("Lenore Workspace"));

routes.get("/robots.txt", (c) =>
  c.text(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /manage",
      "Disallow: /catalogue",
      "Disallow: /q/",
      "",
      `Sitemap: ${origin(c)}/sitemap.xml`,
      "",
    ].join("\n"),
  ),
);
routes.get("/sitemap.xml", async (c) => {
  const d = await siteData(c);
  const base = origin(c);
  const latest = d.products.reduce(
    (m, p) => (p.updatedAt > m ? p.updatedAt : m),
    "",
  );
  const entry = (path: string, lastmod?: string) =>
    `<url><loc>${escapeHtml(base + path)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`;
  const urls = [
    entry("/", latest || undefined),
    entry("/collections", latest || undefined),
    entry("/about"),
    entry("/contact"),
    ...d.categories.map((x) => entry(`/collections/${x.slug}`)),
    ...d.products.map((p) => entry(`/products/${p.slug}`, p.updatedAt)),
  ];
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`,
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
