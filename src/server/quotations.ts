import { Hono } from "hono";
import { z } from "zod";
import {
  quotationInput,
  quotationStatuses,
  discounted,
  type CatalogueLevel,
  type PricingMode,
  type Quotation,
  type QuotationLine,
} from "../shared";
import { sha256, consumeLimit } from "./auth";
import {
  catalogueLevel,
  clientIp,
  isAdmin,
  type AppContext,
  type AppEnv,
  type Viewer,
} from "./access";
import type { ProductRow } from "./products";

export type Settings = {
  whatsapp: string;
  pricingMode: PricingMode;
  discountCapBp: number;
  quoteValidityDays: number;
  quoteTerms: string;
};
export async function readSettings(db: D1Database): Promise<Settings> {
  const r = await db
    .prepare(
      "SELECT whatsapp,pricing_mode,discount_cap_bp,quote_validity_days,quote_terms FROM settings WHERE id=1",
    )
    .first<{
      whatsapp: string;
      pricing_mode: PricingMode;
      discount_cap_bp: number;
      quote_validity_days: number;
      quote_terms: string;
    }>();
  return {
    whatsapp: r?.whatsapp ?? "",
    pricingMode: r?.pricing_mode ?? "mrp",
    discountCapBp: r?.discount_cap_bp ?? 0,
    quoteValidityDays: r?.quote_validity_days ?? 15,
    quoteTerms: r?.quote_terms ?? "",
  };
}
export const indiaToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type QuotationRow = {
  id: string;
  number: string;
  share_token: string;
  request_hash: string;
  status: Quotation["status"];
  channel: Quotation["channel"];
  created_by: string | null;
  created_by_name: string;
  created_by_phone: string;
  customer_name: string;
  customer_phone: string;
  customer_place: string;
  notes: string;
  valid_until: string;
  terms: string;
  items_json: string;
  item_count: number;
  mrp_total_paise: number | null;
  discount_paise: number | null;
  total_paise: number | null;
  version: number;
  revision: number;
  created_at: string;
  updated_at: string;
};
const quotation = (r: QuotationRow): Quotation => ({
  id: r.id,
  number: r.number,
  shareToken: r.share_token,
  status: r.status,
  channel: r.channel,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  createdByPhone: r.created_by_phone,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  customerPlace: r.customer_place,
  notes: r.notes,
  validUntil: r.valid_until,
  terms: r.terms,
  items: JSON.parse(r.items_json),
  itemCount: r.item_count,
  mrpTotalPaise: r.mrp_total_paise,
  discountPaise: r.discount_paise,
  totalPaise: r.total_paise,
  version: r.version,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

type Priced = {
  lines: QuotationLine[];
  mrpTotal: number | null;
  total: number | null;
  discount: number | null;
};
/** Applies the admin pricing policy. Prices never exceed MRP. */
async function price(
  c: AppContext,
  data: z.infer<typeof quotationInput>,
  level: CatalogueLevel,
): Promise<Priced | string> {
  const viewer = c.get("viewer");
  const admin = isAdmin(viewer);
  const ids = data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length)
    return "A product appears twice. Combine the quantities into one line.";
  const rows = await c.env.DB.prepare(
    `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})${admin ? "" : " AND published=1"}`,
  )
    .bind(...ids)
    .all<ProductRow>();
  const byId = new Map(rows.results.map((p) => [p.id, p]));
  const settings = await readSettings(c.env.DB);
  const mode: PricingMode | "admin" = admin
    ? "admin"
    : level === "staff"
      ? settings.pricingMode
      : "mrp";
  const cap = viewer?.maxDiscountBp ?? settings.discountCapBp;
  const lines: QuotationLine[] = [];
  for (const item of data.items) {
    const p = byId.get(item.productId);
    if (!p)
      return "A selected product is no longer available. Refresh the catalogue.";
    if (item.discountBp && item.unitPricePaise !== null)
      return `${p.code}: use either a discount or a price, not both.`;
    if (mode === "mrp" && (item.discountBp || item.unitPricePaise !== null))
      return "Discounts are not enabled for this quotation.";
    if (mode === "capped" && item.unitPricePaise !== null)
      return "Use a discount percentage; custom prices are not enabled.";
    if (mode === "capped" && item.discountBp > cap)
      return `${p.code}: the discount exceeds your limit of ${cap / 100}%.`;
    if (
      item.unitPricePaise !== null &&
      p.price_paise !== null &&
      item.unitPricePaise > p.price_paise
    )
      return `${p.code}: the price cannot exceed the MRP.`;
    const unit =
      item.unitPricePaise ??
      (p.price_paise === null
        ? null
        : discounted(p.price_paise, item.discountBp));
    const discountBp =
      item.unitPricePaise !== null && p.price_paise
        ? Math.round(
            ((p.price_paise - item.unitPricePaise) * 10000) / p.price_paise,
          )
        : item.discountBp;
    lines.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      imageUrl: p.image_key ? `/api/media/${p.image_key}` : null,
      mrpPaise: p.price_paise,
      discountBp: p.price_paise === null ? 0 : discountBp,
      unitPricePaise: unit,
      quantity: item.quantity,
      amountPaise: unit === null ? null : unit * item.quantity,
    });
  }
  const sum = (values: (number | null)[]) => {
    if (values.some((v) => v === null)) return null;
    const total = values.reduce((n, v) => n + BigInt(v!), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError();
    return Number(total);
  };
  try {
    const mrpTotal = sum(
      lines.map((l) => (l.mrpPaise === null ? null : l.mrpPaise * l.quantity)),
    );
    const total = sum(lines.map((l) => l.amountPaise));
    return {
      lines,
      mrpTotal,
      total,
      discount: mrpTotal !== null && total !== null ? mrpTotal - total : null,
    };
  } catch {
    return "This quotation is too large. Split it into smaller quotations.";
  }
}
const snapshot = (q: Quotation) =>
  JSON.stringify({ ...q, shareToken: undefined });
const canEdit = (v: Viewer | null, r: { created_by: string | null }) =>
  !!v && (isAdmin(v) || r.created_by === (v.userId ?? "owner"));

const routes = new Hono<AppEnv>();

routes.post("/quotations", async (c) => {
  const level = await catalogueLevel(c);
  if (!level) return c.json({ error: "Sign in to prepare quotations." }, 401);
  const viewer = c.get("viewer");
  const data = quotationInput.parse(await c.req.json());
  const creator = viewer ? (viewer.userId ?? "owner") : null;
  const hash = await sha256(JSON.stringify({ data, creator }));
  const previous = await c.env.DB.prepare("SELECT * FROM quotations WHERE id=?")
    .bind(data.id)
    .first<QuotationRow>();
  if (previous)
    return previous.request_hash === hash
      ? c.json(quotation(previous))
      : c.json({ error: "This quotation ID is already in use." }, 409);
  const limited = viewer
    ? await consumeLimit(c.env.DB, "quote-user", creator!, 600)
    : await consumeLimit(c.env.DB, "quote-ip", clientIp(c), 30);
  if (!limited)
    return c.json(
      { error: "Too many quotations. Try again in a few minutes." },
      429,
    );
  if (data.validUntil < indiaToday())
    return c.json({ error: "The validity date cannot be in the past." }, 400);
  const priced = await price(c, data, level);
  if (typeof priced === "string") return c.json({ error: priced }, 409);
  const settings = await readSettings(c.env.DB);
  const year = indiaToday().slice(0, 4);
  const counter = await c.env.DB.prepare(
    `INSERT INTO counters(name,value) VALUES(?,1)
    ON CONFLICT(name) DO UPDATE SET value=value+1 RETURNING value`,
  )
    .bind(`LQ-${year}`)
    .first<{ value: number }>();
  const number = `LQ-${year}-${String(counter!.value).padStart(4, "0")}`;
  const token = [...crypto.getRandomValues(new Uint8Array(18))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const now = new Date().toISOString();
  const q: Quotation = {
    id: data.id,
    number,
    shareToken: token,
    status: "draft",
    channel: level === "staff" ? "staff" : level,
    createdBy: creator,
    createdByName: viewer?.name ?? (data.preparedBy || "Lenore catalogue"),
    createdByPhone: viewer?.phone ?? "",
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerPlace: data.customerPlace,
    notes: data.notes,
    validUntil: data.validUntil,
    terms: settings.quoteTerms,
    items: priced.lines,
    itemCount: priced.lines.length,
    mrpTotalPaise: priced.mrpTotal,
    discountPaise: priced.discount,
    totalPaise: priced.total,
    version: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO quotations(id,number,share_token,request_hash,status,channel,created_by,created_by_name,created_by_phone,
      customer_name,customer_phone,customer_place,notes,valid_until,terms,items_json,item_count,mrp_total_paise,discount_paise,total_paise,created_at,updated_at)
      VALUES(?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      q.id,
      q.number,
      q.shareToken,
      hash,
      q.channel,
      q.createdBy,
      q.createdByName,
      q.createdByPhone,
      q.customerName,
      q.customerPhone,
      q.customerPlace,
      q.notes,
      q.validUntil,
      q.terms,
      JSON.stringify(q.items),
      q.itemCount,
      q.mrpTotalPaise,
      q.discountPaise,
      q.totalPaise,
      now,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO quotation_versions(quotation_id,version,data,actor) VALUES(?,1,?,?)",
    ).bind(q.id, snapshot(q), q.createdByName),
  ]);
  return c.json(q, 201);
});

routes.put("/quotations/:id", async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) return c.json({ error: "Sign in to revise quotations." }, 401);
  const data = quotationInput
    .extend({ revision: z.number().int().positive() })
    .parse({ ...(await c.req.json()), id: c.req.param("id") });
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id=?")
    .bind(data.id)
    .first<QuotationRow>();
  if (!row) return c.json({ error: "Quotation not found." }, 404);
  if (!canEdit(viewer, row))
    return c.json(
      { error: "Only the author or an admin can revise this quotation." },
      403,
    );
  const priced = await price(c, data, "staff");
  if (typeof priced === "string") return c.json({ error: priced }, 409);
  const now = new Date().toISOString();
  const q: Quotation = {
    ...quotation(row),
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerPlace: data.customerPlace,
    notes: data.notes,
    validUntil: data.validUntil,
    items: priced.lines,
    itemCount: priced.lines.length,
    mrpTotalPaise: priced.mrpTotal,
    discountPaise: priced.discount,
    totalPaise: priced.total,
    version: row.version + 1,
    revision: data.revision + 1,
    updatedAt: now,
  };
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE quotations SET customer_name=?,customer_phone=?,customer_place=?,notes=?,valid_until=?,items_json=?,item_count=?,
      mrp_total_paise=?,discount_paise=?,total_paise=?,version=version+1,revision=revision+1,updated_at=?
      WHERE id=? AND revision=? RETURNING id`,
    ).bind(
      q.customerName,
      q.customerPhone,
      q.customerPlace,
      q.notes,
      q.validUntil,
      JSON.stringify(q.items),
      q.itemCount,
      q.mrpTotalPaise,
      q.discountPaise,
      q.totalPaise,
      now,
      q.id,
      data.revision,
    ),
    // Written only when this request's guarded update applied (matched by its timestamp).
    c.env.DB.prepare(
      `INSERT INTO quotation_versions(quotation_id,version,data,actor)
      SELECT id,version,?,? FROM quotations WHERE id=? AND revision=? AND updated_at=?`,
    ).bind(snapshot(q), viewer.name, q.id, data.revision + 1, now),
  ]).catch((error) => {
    if (String(error).includes("quotation_versions")) return [{ results: [] }];
    throw error;
  });
  if (!updated.results.length)
    return c.json(
      { error: "This quotation changed. Refresh and try again." },
      409,
    );
  return c.json(q);
});

routes.patch("/quotations/:id", async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) return c.json({ error: "Sign in to update quotations." }, 401);
  const d = z
    .object({
      status: z.enum(quotationStatuses),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id=?")
    .bind(c.req.param("id"))
    .first<QuotationRow>();
  if (!row) return c.json({ error: "Quotation not found." }, 404);
  if (!canEdit(viewer, row))
    return c.json(
      { error: "Only the author or an admin can update this quotation." },
      403,
    );
  const updated = await c.env.DB.prepare(
    `UPDATE quotations SET status=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND revision=? RETURNING *`,
  )
    .bind(d.status, row.id, d.revision)
    .first<QuotationRow>();
  return updated
    ? c.json(quotation(updated))
    : c.json({ error: "This quotation changed. Refresh and try again." }, 409);
});

routes.get("/quotations", async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) return c.json({ error: "Sign in to see your quotations." }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM quotations WHERE created_by=? ORDER BY updated_at DESC LIMIT 300",
  )
    .bind(viewer.userId ?? "owner")
    .all<QuotationRow>();
  return c.json(rows.results.map(quotation));
});
routes.get("/quotations/:id", async (c) => {
  const viewer = c.get("viewer");
  const row = await c.env.DB.prepare("SELECT * FROM quotations WHERE id=?")
    .bind(c.req.param("id"))
    .first<QuotationRow>();
  if (!row || !canEdit(viewer, row))
    return c.json({ error: "Quotation not found." }, 404);
  const versions = await c.env.DB.prepare(
    "SELECT version,actor,created_at AS createdAt FROM quotation_versions WHERE quotation_id=? ORDER BY version DESC",
  )
    .bind(row.id)
    .all();
  return c.json({ ...quotation(row), versions: versions.results });
});
/** Customer link: the unguessable token is the only credential. */
routes.get("/q/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[0-9a-f]{36}$/.test(token))
    return c.json({ error: "Quotation not found." }, 404);
  const row = await c.env.DB.prepare(
    "SELECT * FROM quotations WHERE share_token=?",
  )
    .bind(token)
    .first<QuotationRow>();
  if (!row) return c.json({ error: "Quotation not found." }, 404);
  const q = quotation(row);
  return c.json({ ...q, createdBy: null, channel: undefined });
});

routes.get("/admin/quotations", async (c) => {
  const q = z
    .object({
      status: z.enum(quotationStatuses).optional(),
      by: z.string().max(60).optional(),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      q: z.string().max(100).optional(),
    })
    .parse(c.req.query());
  const where: string[] = [];
  const values: (string | number)[] = [];
  const filter = (clause: string, value: string) => {
    where.push(clause);
    values.push(value);
  };
  if (q.status) filter("status=?", q.status);
  if (q.by) filter("created_by=?", q.by);
  if (q.from) filter("created_at>=?", `${q.from}T00:00:00`);
  if (q.to) filter("created_at<=?", `${q.to}T23:59:59.999Z`);
  if (q.q) {
    where.push(
      "(number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR created_by_name LIKE ?)",
    );
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    values.push(like, like, like, like);
  }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM quotations ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 1000`,
  )
    .bind(...values)
    .all<QuotationRow>();
  return c.json(rows.results.map(quotation));
});
export default routes;
