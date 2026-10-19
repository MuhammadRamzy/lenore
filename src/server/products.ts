import { Hono } from "hono";
import { z } from "zod";
import {
  productInput,
  stockInput,
  countInput,
  availability,
  slugify,
  type CatalogueLevel,
  type CatalogueProduct,
  type Product,
} from "../shared";
import { sha256 } from "./auth";
import { ON_WEBSITE, publicView, readWebsite } from "./website";
import {
  catalogueLevel,
  isAdmin,
  type AppContext,
  type AppEnv,
  type Viewer,
} from "./access";

export type ProductRow = {
  id: string;
  slug: string | null;
  code: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  price_paise: number | null;
  low_stock: number;
  published: number;
  stock: number;
  revision: number;
  updated_at: string;
  image_key: string | null;
  poster_key: string | null;
  hsn: string;
  gst_rate_bp: number | null;
  barcode: string | null;
  reorder_qty: number;
  bin: string;
  cost_paise: number | null;
  on_website: number;
  featured: number;
};
export const product = (r: ProductRow): Product => ({
  id: r.id,
  slug: r.slug ?? slugify(r.code),
  code: r.code,
  name: r.name,
  category: r.category,
  unit: r.unit,
  description: r.description,
  pricePaise: r.price_paise,
  lowStock: r.low_stock,
  published: !!r.published,
  stock: r.stock,
  revision: r.revision,
  updatedAt: r.updated_at,
  imageUrl: r.image_key ? `/api/media/${r.image_key}` : null,
  posterUrl: r.poster_key ? `/api/media/${r.poster_key}` : null,
  hsn: r.hsn,
  gstRateBp: r.gst_rate_bp,
  barcode: r.barcode ?? "",
  reorderQty: r.reorder_qty,
  bin: r.bin,
  costPaise: r.cost_paise,
});
/** Public visitors get stock status only; authorised users get the quantity. */
export const catalogueProduct = (
  r: ProductRow,
  level: CatalogueLevel,
): CatalogueProduct => ({
  id: r.id,
  slug: r.slug ?? slugify(r.code),
  code: r.code,
  name: r.name,
  category: r.category,
  unit: r.unit,
  description: r.description,
  pricePaise: r.price_paise,
  imageUrl: r.image_key ? `/api/media/${r.image_key}` : null,
  posterUrl: r.poster_key ? `/api/media/${r.poster_key}` : null,
  updatedAt: r.updated_at,
  barcode: r.barcode ?? "",
  bin: level === "public" ? "" : r.bin,
  stock: level === "public" ? null : r.stock,
  availability: availability(r.stock, r.low_stock),
});
export const actorName = (v: Viewer | null) =>
  v ? (v.userId ? `${v.name} (${v.phone})` : "owner") : "system";

/** Writes a product with a readable slug; adds an ID suffix on a rare collision. */
async function withSlug<T>(
  id: string,
  name: string,
  code: string,
  write: (slug: string) => Promise<T>,
) {
  try {
    return await write(slugify(name, code));
  } catch (error) {
    if (!String(error).includes("products.slug")) throw error;
    return write(slugify(name, code, id.slice(0, 6)));
  }
}

const routes = new Hono<AppEnv>();
const locked = (c: AppContext) =>
  c.json(
    {
      error: "Sign in or enter the catalogue password to view this collection.",
    },
    401,
  );

routes.get("/catalogue", async (c) => {
  const level = await catalogueLevel(c);
  if (!level) return locked(c);
  // Public visitors see what the website shows; the sales team sees every published product.
  const site = level === "public" ? await readWebsite(c.env.DB) : null;
  const where = site ? ON_WEBSITE : "published=1";
  // Cheap version check lets 40 phones refresh every 30 s with mostly 304s.
  const version = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),'') AS t FROM products WHERE ${where}`,
  ).first<{ n: number; t: string }>();
  const etag = `W/"${level}-${version!.n}-${version!.t}${site ? `-${site.updatedAt}` : ""}"`;
  c.header("Cache-Control", "private, no-cache");
  c.header("ETag", etag);
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  if (site && !site.showProducts) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM products WHERE ${where} ORDER BY category,name LIMIT 5000`,
  ).all<ProductRow>();
  return c.json(
    rows.results.map((r) => {
      const p = catalogueProduct(r, level);
      return site ? publicView(p, site) : p;
    }),
  );
});
routes.get("/catalogue/:slug", async (c) => {
  const level = await catalogueLevel(c);
  if (!level) return locked(c);
  const site = level === "public" ? await readWebsite(c.env.DB) : null;
  const row =
    site && !site.showProducts
      ? null
      : await c.env.DB.prepare(
          `SELECT * FROM products WHERE ${site ? ON_WEBSITE : "published=1"} AND slug=?`,
        )
          .bind(c.req.param("slug"))
          .first<ProductRow>();
  if (!row) return c.json({ error: "This product is not available." }, 404);
  c.executionCtx.waitUntil(recordView(c.env.DB, row.id));
  const p = catalogueProduct(row, level);
  return c.json(site ? publicView(p, site) : p);
});
routes.post("/catalogue/:id/view", async (c) => {
  if (!(await catalogueLevel(c))) return locked(c);
  const id = z.uuid().parse(c.req.param("id"));
  c.executionCtx.waitUntil(recordView(c.env.DB, id));
  return c.json({ saved: true });
});
/** Aggregate daily views only; nothing identifies the visitor. */
function recordView(db: D1Database, productId: string) {
  return db
    .prepare(
      `INSERT INTO product_views(day,product_id,views)
      SELECT date('now'),id,1 FROM products WHERE id=? AND published=1
      ON CONFLICT(day,product_id) DO UPDATE SET views=views+1`,
    )
    .bind(productId)
    .run()
    .then(() => undefined)
    .catch(() => undefined);
}

routes.get("/admin/products", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM products ORDER BY name LIMIT 5000",
  ).all<ProductRow>();
  return c.json(rows.results.map(product));
});
const productValues = (d: z.infer<typeof productInput>) => [
  d.code,
  d.name,
  d.category,
  d.unit,
  d.description,
  d.pricePaise,
  d.lowStock,
  +d.published,
  d.hsn,
  d.gstRateBp,
  d.barcode || null,
  d.reorderQty,
  d.bin,
  d.costPaise,
];
const PRODUCT_COLUMNS =
  "code,name,category,unit,description,price_paise,low_stock,published,hsn,gst_rate_bp,barcode,reorder_qty,bin,cost_paise";
routes.post("/admin/products", async (c) => {
  const data = productInput.parse(await c.req.json());
  const id = crypto.randomUUID();
  const row = await withSlug(id, data.name, data.code, (slug) =>
    c.env.DB.prepare(
      `INSERT INTO products(id,slug,${PRODUCT_COLUMNS},last_actor)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    )
      .bind(id, slug, ...productValues(data), actorName(c.get("viewer")))
      .first<ProductRow>(),
  );
  return c.json(product(row!), 201);
});
routes.put("/admin/products/:id", async (c) => {
  const data = productInput
    .extend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  const set = PRODUCT_COLUMNS.split(",")
    .map((col) => `${col}=?`)
    .join(",");
  const row = await withSlug(c.req.param("id"), data.name, data.code, (slug) =>
    c.env.DB.prepare(
      `UPDATE products SET slug=?,${set},revision=revision+1,last_actor=?,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=? RETURNING *`,
    )
      .bind(
        slug,
        ...productValues(data),
        actorName(c.get("viewer")),
        c.req.param("id"),
        data.revision,
      )
      .first<ProductRow>(),
  );
  if (!row)
    return c.json(
      { error: "This product changed. Refresh and try again." },
      409,
    );
  return c.json(product(row));
});

/** Bulk create/update by product code. Validates every row before writing. */
routes.post("/admin/products/import", async (c) => {
  const { rows, dryRun } = z
    .object({
      rows: z
        .array(
          productInput.extend({
            openingStock: z.number().int().min(0).max(1000000000).default(0),
          }),
        )
        .min(1)
        // Each row can need two statements; 400 rows keeps one atomic batch under 1,000.
        .max(400, "Import up to 400 rows at a time"),
      dryRun: z.boolean(),
    })
    .strict()
    .parse(await c.req.json());
  const codes = rows.map((r) => r.code.toLowerCase());
  if (new Set(codes).size !== codes.length)
    return c.json({ error: "The file repeats a product code." }, 400);
  const existing = await c.env.DB.prepare(
    "SELECT * FROM products",
  ).all<ProductRow>();
  const byCode = new Map(
    existing.results.map((p) => [p.code.toLowerCase(), p]),
  );
  const slugs = new Set(existing.results.map((p) => p.slug));
  const actor = actorName(c.get("viewer"));
  const statements: D1PreparedStatement[] = [];
  let created = 0,
    updated = 0,
    unchanged = 0;
  for (const r of rows) {
    const current = byCode.get(r.code.toLowerCase());
    if (current) {
      const same = productValues(r).every(
        (v, i) =>
          (v ?? null) ===
          (current[PRODUCT_COLUMNS.split(",")[i] as keyof ProductRow] ?? null),
      );
      if (same) {
        unchanged++;
        continue;
      }
      updated++;
      const set = PRODUCT_COLUMNS.split(",")
        .map((col) => `${col}=?`)
        .join(",");
      statements.push(
        c.env.DB.prepare(
          `UPDATE products SET ${set},revision=revision+1,last_actor=?,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        ).bind(...productValues(r), actor, current.id),
      );
    } else {
      created++;
      const id = crypto.randomUUID();
      let slug = slugify(r.name, r.code);
      if (slugs.has(slug)) slug = slugify(r.name, r.code, id.slice(0, 6));
      slugs.add(slug);
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO products(id,slug,${PRODUCT_COLUMNS},last_actor)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(id, slug, ...productValues(r), actor),
      );
      if (r.openingStock > 0)
        statements.push(
          c.env.DB.prepare(
            `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,kind)
            VALUES(?,?,?,?,0,?,1,'Opening stock (import)',?,'receipt')`,
          ).bind(
            crypto.randomUUID(),
            "import",
            id,
            r.openingStock,
            r.openingStock,
            actor,
          ),
        );
    }
  }
  if (!dryRun && statements.length) await c.env.DB.batch(statements);
  return c.json({ created, updated, unchanged, saved: !dryRun });
});

async function recordMovement(
  c: AppContext,
  id: string,
  data: z.infer<typeof stockInput>,
) {
  const fingerprint = await sha256(JSON.stringify({ ...data, productId: id }));
  const existing = await c.env.DB.prepare(
    "SELECT fingerprint FROM stock_movements WHERE id=?",
  )
    .bind(data.operationId)
    .first<{ fingerprint: string }>();
  if (existing)
    return existing.fingerprint === fingerprint
      ? c.json({ saved: true, replay: true })
      : c.json(
          {
            error:
              "This operation ID was already used for a different adjustment.",
          },
          409,
        );
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<ProductRow>();
  if (!current) return c.json({ error: "Product not found." }, 404);
  if (current.revision !== data.revision)
    return c.json(
      { error: "Stock changed. Refresh before adjusting it." },
      409,
    );
  if (current.stock + data.delta < 0 || current.stock + data.delta > 1000000000)
    return c.json(
      { error: "The resulting stock must be between 0 and 1,000,000,000." },
      400,
    );
  try {
    await c.env.DB.prepare(
      `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,kind)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        data.operationId,
        fingerprint,
        id,
        data.delta,
        current.stock,
        current.stock + data.delta,
        data.revision,
        data.reason,
        actorName(c.get("viewer")),
        data.kind,
      )
      .run();
  } catch (error) {
    const replay = await c.env.DB.prepare(
      "SELECT fingerprint FROM stock_movements WHERE id=?",
    )
      .bind(data.operationId)
      .first<{ fingerprint: string }>();
    if (replay?.fingerprint === fingerprint)
      return c.json({ saved: true, replay: true });
    if (String(error).includes("STOCK_CONFLICT") || replay)
      return c.json(
        { error: "Stock changed. Refresh before adjusting it." },
        409,
      );
    throw error;
  }
  return c.json({ saved: true, replay: false });
}
routes.post("/admin/products/:id/stock", async (c) =>
  recordMovement(c, c.req.param("id"), stockInput.parse(await c.req.json())),
);
routes.get("/admin/products/:id/movements", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id,kind,delta,previous_stock AS previousStock,new_stock AS newStock,reason,actor,created_at AS createdAt
    FROM stock_movements WHERE product_id=? ORDER BY created_at DESC,rowid DESC LIMIT 500`,
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(rows.results);
});
/** Posts a whole stock count at once; any product changed since counting aborts everything. */
routes.post("/admin/stock-count", async (c) => {
  const data = countInput.parse(await c.req.json());
  if (new Set(data.lines.map((l) => l.productId)).size !== data.lines.length)
    return c.json({ error: "A product appears twice in this count." }, 400);
  const fingerprint = await sha256(JSON.stringify(data));
  const marker = `${data.operationId}:count`;
  const replay = await c.env.DB.prepare(
    "SELECT fingerprint FROM stock_movements WHERE id>? AND id<? LIMIT 1",
  )
    .bind(`${marker}:`, `${marker};`)
    .first<{ fingerprint: string }>();
  if (replay)
    return replay.fingerprint === fingerprint
      ? c.json({ saved: true, replay: true, corrected: 0 })
      : c.json(
          { error: "This count was already posted with other values." },
          409,
        );
  const ids = data.lines.map((l) => l.productId);
  const current = await c.env.DB.prepare(
    `SELECT id,code,stock,revision FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<{ id: string; code: string; stock: number; revision: number }>();
  const byId = new Map(current.results.map((p) => [p.id, p]));
  const changed = data.lines.filter(
    (l) => byId.get(l.productId)?.revision !== l.revision,
  );
  if (changed.length)
    return c.json(
      {
        error: `Stock changed while counting: ${changed
          .map((l) => byId.get(l.productId)?.code ?? "removed product")
          .join(", ")}. Recount these and post again.`,
      },
      409,
    );
  const actor = actorName(c.get("viewer"));
  const statements = data.lines
    .map((l) => ({ l, p: byId.get(l.productId)! }))
    .filter(({ l, p }) => l.counted !== p.stock)
    .map(({ l, p }) =>
      c.env.DB.prepare(
        `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,kind)
        VALUES(?,?,?,?,?,?,?,?,?,'count')`,
      ).bind(
        `${marker}:${p.id}`,
        fingerprint,
        p.id,
        l.counted - p.stock,
        p.stock,
        l.counted,
        l.revision,
        data.reason,
        actor,
      ),
    );
  if (statements.length) {
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      if (String(error).includes("STOCK_CONFLICT"))
        return c.json(
          {
            error:
              "Stock changed while posting. Refresh and post the count again.",
          },
          409,
        );
      throw error;
    }
  }
  return c.json({ saved: true, replay: false, corrected: statements.length });
});

function imageType(bytes: Uint8Array) {
  const text = (a: number, b: number) =>
    new TextDecoder().decode(bytes.slice(a, b));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
}
async function storeMedia(
  c: AppContext,
  current: ProductRow,
  slot: "photo" | "poster",
  bytes: Uint8Array,
) {
  if (bytes.length > 5 * 1024 * 1024)
    return c.json({ error: "Choose an image under 5 MB." }, 413);
  const type = imageType(bytes);
  if (!type) return c.json({ error: "Choose a JPEG, PNG or WebP image." }, 400);
  const column = slot === "poster" ? "poster_key" : "image_key";
  const key = crypto.randomUUID();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    const result = await c.env.DB.prepare(
      `UPDATE products SET ${column}=?,revision=revision+1,last_actor=?,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=? RETURNING *`,
    )
      .bind(key, actorName(c.get("viewer")), current.id, current.revision)
      .first<ProductRow>();
    if (!result) {
      await c.env.MEDIA.delete(key);
      return c.json(
        { error: "This product changed. Refresh before uploading." },
        409,
      );
    }
    if (current[column])
      await c.env.MEDIA.delete(current[column]!).catch(() =>
        console.error("Old media cleanup deferred"),
      );
    return c.json(product(result));
  } catch (error) {
    await c.env.MEDIA.delete(key);
    throw error;
  }
}
const slotOf = (c: AppContext) =>
  z.enum(["photo", "poster"]).parse(c.req.query("slot") ?? "photo");
routes.post("/admin/products/:id/image", async (c) => {
  const slot = slotOf(c);
  const revision = z.coerce
    .number()
    .int()
    .positive()
    .parse(c.req.header("If-Match"));
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(c.req.param("id"))
    .first<ProductRow>();
  if (!current || current.revision !== revision)
    return c.json(
      { error: "This product changed. Refresh before uploading." },
      409,
    );
  return storeMedia(c, current, slot, bytes);
});
/** Bulk photo upload: the file name (without extension) is the product code. */
routes.post("/admin/media/by-code", async (c) => {
  const slot = slotOf(c);
  const code = z.string().trim().min(1).max(60).parse(c.req.query("code"));
  const current = await c.env.DB.prepare(
    "SELECT * FROM products WHERE code=? COLLATE NOCASE",
  )
    .bind(code)
    .first<ProductRow>();
  if (!current) return c.json({ error: `No product has code ${code}.` }, 404);
  return storeMedia(
    c,
    current,
    slot,
    new Uint8Array(await c.req.arrayBuffer()),
  );
});
routes.get("/media/:key", async (c) => {
  const key = c.req.param("key");
  const p = await c.env.DB.prepare(
    `SELECT published, (${ON_WEBSITE}) AND (SELECT show_products FROM website_settings WHERE id=1)=1 AS on_site
    FROM products WHERE image_key=? OR poster_key=?`,
  )
    .bind(key, key)
    .first<{ published: number; on_site: number }>();
  const level = p?.published ? await catalogueLevel(c) : null;
  // Website photos are public; anything else needs catalogue or workspace access.
  const allowed =
    p &&
    (p.on_site ||
      (level && level !== "public") ||
      (!p.published && isAdmin(c.get("viewer"))));
  if (!allowed) return c.json({ error: "Image not found." }, 404);
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.json({ error: "Image not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      // Keys are immutable: a replaced image gets a new key.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
export default routes;
