import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { consumeLimit } from "./auth";
import finance from "./finance";
import access, {
  catalogueLevel,
  clientIp,
  isAdmin,
  loadViewer,
  type AppEnv,
  type Bindings,
} from "./access";
import products from "./products";
import quotations, { readSettings } from "./quotations";
import team from "./team";
import insights from "./insights";
import seo, { notFound } from "./seo";
import erp from "./erp";

export type { Bindings };

const app = new Hono<AppEnv>();

// lenoretrading.com → www.lenoretrading.com, so search engines see one origin.
app.use("*", async (c, next) => {
  if (c.env.SITE_ORIGIN) {
    const canonical = new URL(c.env.SITE_ORIGIN);
    const url = new URL(c.req.url);
    if (
      url.hostname !== canonical.hostname &&
      `www.${url.hostname}` === canonical.hostname
    )
      return c.redirect(`${canonical.origin}${url.pathname}${url.search}`, 301);
  }
  await next();
});

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("Origin") !== new URL(c.req.url).origin
  )
    return c.json(
      { error: "This request must come from the Lenore application." },
      403,
    );
  c.set("viewer", await loadViewer(c));
  await next();
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "File is too large. Maximum size is 5 MB." }, 413),
  }),
);
app.use("/api/admin/*", async (c, next) => {
  const viewer = c.get("viewer");
  if (!viewer)
    return c.json({ error: "Please sign in to manage Lenore." }, 401);
  if (!isAdmin(viewer))
    return c.json(
      { error: "This account does not have workspace access." },
      403,
    );
  await next();
});

app.get("/api/config", async (c) => {
  const s = await readSettings(c.env.DB);
  return c.json({
    demo: c.env.DEMO_MODE === "true",
    whatsapp: s.whatsapp,
    integration: "disconnected",
    pricingMode: s.pricingMode,
    discountCapBp: s.discountCapBp,
    quoteValidityDays: s.quoteValidityDays,
    quoteTerms: s.quoteTerms,
  });
});
app.put("/api/admin/settings", async (c) => {
  const d = z
    .object({
      whatsapp: z
        .string()
        .regex(
          /^(?:\d{7,15})?$/,
          "Use country code and digits only, or leave blank.",
        ),
      pricingMode: z.enum(["mrp", "capped", "free"]).optional(),
      discountCapBp: z.number().int().min(0).max(10000).optional(),
      quoteValidityDays: z.number().int().min(1).max(365).optional(),
      quoteTerms: z.string().trim().max(2000).optional(),
    })
    .strict()
    .parse(await c.req.json());
  await c.env.DB.prepare(
    `UPDATE settings SET whatsapp=?,pricing_mode=COALESCE(?,pricing_mode),discount_cap_bp=COALESCE(?,discount_cap_bp),
    quote_validity_days=COALESCE(?,quote_validity_days),quote_terms=COALESCE(?,quote_terms) WHERE id=1`,
  )
    .bind(
      d.whatsapp,
      d.pricingMode ?? null,
      d.discountCapBp ?? null,
      d.quoteValidityDays ?? null,
      d.quoteTerms ?? null,
    )
    .run();
  return c.json({ saved: true });
});

/** Website enquiry form. Independent of catalogue access. */
app.post("/api/enquiries", async (c) => {
  const d = z
    .object({
      id: z.uuid(),
      name: z.string().trim().min(2, "Enter your name").max(120),
      phone: z
        .string()
        .trim()
        .max(25)
        .refine(
          (v) => /^\d{7,15}$/.test(v.replace(/\D/g, "")),
          "Enter a phone number with 7 to 15 digits",
        ),
      message: z.string().trim().max(2000),
      interest: z.string().trim().max(120),
    })
    .strict()
    .parse(await c.req.json());
  const exists = await c.env.DB.prepare("SELECT 1 FROM quotes WHERE id=?")
    .bind(d.id)
    .first();
  if (exists) return c.json({ id: d.id });
  if (!(await consumeLimit(c.env.DB, "enquiry", clientIp(c), 20)))
    return c.json(
      { error: "Too many enquiries. Please try again in 10 minutes." },
      429,
    );
  const notes = [d.interest && `Interested in: ${d.interest}`, d.message]
    .filter(Boolean)
    .join("\n");
  await c.env.DB.prepare(
    "INSERT INTO quotes(id,request_hash,name,phone,notes,items_json) VALUES(?,?,?,?,?,'[]') ON CONFLICT(id) DO NOTHING",
  )
    .bind(d.id, "enquiry", d.name, d.phone, notes)
    .run();
  return c.json({ id: d.id }, 201);
});
app.get("/api/admin/quotes", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM quotes ORDER BY created_at DESC LIMIT 500",
  ).all<{
    id: string;
    name: string;
    phone: string;
    notes: string;
    items_json: string;
    status: string;
    created_at: string;
  }>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      notes: r.notes,
      items: JSON.parse(r.items_json),
      status: r.status,
      createdAt: r.created_at,
    })),
  );
});
app.patch("/api/admin/quotes/:id", async (c) => {
  const data = z
    .object({ status: z.enum(["new", "contacted", "closed"]) })
    .strict()
    .parse(await c.req.json());
  const result = await c.env.DB.prepare(
    "UPDATE quotes SET status=? WHERE id=? RETURNING id",
  )
    .bind(data.status, c.req.param("id"))
    .first();
  return result
    ? c.json({ saved: true })
    : c.json({ error: "Enquiry not found." }, 404);
});

app.route("/api", access);
app.route("/api", products);
app.route("/api", quotations);
app.route("/api/admin/team", team);
app.route("/api/admin", insights);
app.route("/api", erp);
app.route("/api/admin/finance", finance);
app.all("/api/*", (c) => c.json({ error: "Route not found." }, 404));
app.route("/", seo);
app.notFound((c) => notFound(c));

app.onError((error, c) => {
  const financeError = /finance: ([^\n]+?)(?: SQLITE_|$)/.exec(String(error));
  if (financeError) return c.json({ error: financeError[1] }, 409);
  if (String(error).includes("UNIQUE constraint failed: finance_"))
    return c.json(
      {
        error:
          "A matching financial request/reference was recorded concurrently. Refresh before retrying.",
      },
      409,
    );
  if (error instanceof z.ZodError)
    return c.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return c.json({ error: "The request is not valid JSON." }, 400);
  if (String(error).includes("UNIQUE constraint failed: products.code"))
    return c.json({ error: "That product code already exists." }, 409);
  if (String(error).includes("UNIQUE constraint failed: products.barcode"))
    return c.json({ error: "Another product already uses that barcode." }, 409);
  console.error("Request failed", {
    path: c.req.path,
    error: String(error).replace(/\n/g, " ").slice(0, 300),
  });
  return c.json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
});
export { catalogueLevel };
export default app;
