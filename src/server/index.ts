import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  productInput,
  stockInput,
  quoteInput,
  availability,
  type Product,
  type QuoteItem,
} from "../shared";
import { sha256, verifyPassword, consumeLimit } from "./auth";
import finance from "./finance";
import catalogueAccess, {catalogueAuthorized} from "./catalogue-access";

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_USERNAME?: string;
  DEMO_MODE?: string;
};
type Row = {
  id: string;
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
};
const product = (r: Row): Product => ({
  id: r.id,
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
});
const app = new Hono<{ Bindings: Bindings }>();

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

export async function authenticated(c: { req: { raw: Request }; env: Bindings }) {
  const cookies = c.req.raw.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)lenore_session=([^;]+)/.exec(cookies)?.[1];
  if (!token) return false;
  return !!(await c.env.DB.prepare(
    "SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await sha256(token), Date.now())
    .first());
}
app.use("/api/admin/*", async (c, next) => {
  if (!(await authenticated(c)))
    return c.json({ error: "Please sign in to manage Lenore." }, 401);
  await next();
});

app.get("/api/config", async (c) => {
  const settings = await c.env.DB.prepare(
    "SELECT whatsapp FROM settings WHERE id=1",
  ).first<{ whatsapp: string }>();
  return c.json({
    demo: c.env.DEMO_MODE === "true",
    whatsapp: settings?.whatsapp ?? "",
    integration: "disconnected",
  });
});
app.get("/api/session", async (c) =>
  c.json({ authenticated: await authenticated(c) }),
);
app.post("/api/session", async (c) => {
  if (
    !(await consumeLimit(
      c.env.DB,
      "login",
      c.req.header("CF-Connecting-IP") ?? "local",
      10,
    ))
  )
    return c.json(
      { error: "Too many attempts. Try again in 10 minutes." },
      429,
    );
  const data = z
    .object({ username: z.string().min(1).max(80),password: z.string().min(1).max(256) })
    .parse(await c.req.json());
  if (data.username !== c.env.ADMIN_USERNAME || !(await verifyPassword(data.password, c.env.ADMIN_PASSWORD_HASH)))
    return c.json({ error: "Login not recognised. Please try again." }, 401);
  await c.env.DB.prepare("DELETE FROM rate_limits WHERE key=?")
    .bind(`login:${await sha256(c.req.header("CF-Connecting-IP") ?? "local")}`)
    .run();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now),
    c.env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
    c.env.DB.prepare(
      "INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)",
    ).bind(await sha256(token), now + 8 * 3600000),
  ]);
  setCookie(c, "lenore_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 8 * 3600,
  });
  return c.json({ authenticated: true });
});
app.delete("/api/session", async (c) => {
  const token = getCookie(c, "lenore_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
  deleteCookie(c, "lenore_session", { path: "/" });
  return c.json({ authenticated: false });
});

app.get("/api/catalogue", async (c) => {
  if(!await catalogueAuthorized(c))return c.json({error:"Enter the catalogue password to view this collection."},401);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM products WHERE published=1 ORDER BY category,name LIMIT 2000",
  ).all<Row>();
  return c.json(
    rows.results.map((r) => {
      const p = product(r);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        description: p.description,
        pricePaise: p.pricePaise,
        imageUrl: p.imageUrl,
        posterUrl: p.posterUrl,
        stock: p.stock,
        updatedAt: p.updatedAt,
        availability: availability(p.stock, p.lowStock),
      };
    }),
  );
});
app.get("/api/admin/products", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM products ORDER BY name LIMIT 2000",
  ).all<Row>();
  return c.json(rows.results.map(product));
});
app.post("/api/admin/products", async (c) => {
  const data = productInput.parse(await c.req.json());
  const id = crypto.randomUUID();
  const row = await c.env.DB.prepare(
    `INSERT INTO products(id,code,name,category,unit,description,price_paise,low_stock,published,last_actor)
    VALUES(?,?,?,?,?,?,?,?,?,'owner') RETURNING *`,
  )
    .bind(
      id,
      data.code,
      data.name,
      data.category,
      data.unit,
      data.description,
      data.pricePaise,
      data.lowStock,
      +data.published,
    )
    .first<Row>();
  return c.json(product(row!), 201);
});
app.put("/api/admin/products/:id", async (c) => {
  const data = productInput
    .extend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    `UPDATE products SET code=?,name=?,category=?,unit=?,description=?,price_paise=?,low_stock=?,published=?,
    revision=revision+1,last_actor='owner',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=? RETURNING *`,
  )
    .bind(
      data.code,
      data.name,
      data.category,
      data.unit,
      data.description,
      data.pricePaise,
      data.lowStock,
      +data.published,
      c.req.param("id"),
      data.revision,
    )
    .first<Row>();
  if (!row)
    return c.json(
      { error: "This product changed. Refresh and try again." },
      409,
    );
  return c.json(product(row));
});
app.post("/api/admin/products/:id/stock", async (c) => {
  const data = stockInput.parse(await c.req.json());
  const id = c.req.param("id");
  const fingerprint = await sha256(JSON.stringify({ ...data, productId: id }));
  const existing = await c.env.DB.prepare(
    "SELECT fingerprint FROM stock_movements WHERE id=?",
  )
    .bind(data.operationId)
    .first<{ fingerprint: string }>();
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      return c.json(
        {
          error:
            "This operation ID was already used for a different adjustment.",
        },
        409,
      );
    return c.json({ saved: true, replay: true });
  }
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<Row>();
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
      `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor)
      VALUES(?,?,?,?,?,?,?,?,'owner')`,
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
});

app.post("/api/admin/products/:id/image", async (c) => {
  const slot = z
    .enum(["photo", "poster"])
    .parse(c.req.query("slot") ?? "photo");
  const column = slot === "poster" ? "poster_key" : "image_key";
  const revision = z.coerce
    .number()
    .int()
    .positive()
    .parse(c.req.header("If-Match"));
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024)
    return c.json({ error: "Choose an image under 5 MB." }, 413);
  const type =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes[0] === 0x89 &&
          new TextDecoder().decode(bytes.slice(1, 4)) === "PNG"
        ? "image/png"
        : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!type) return c.json({ error: "Choose a JPEG, PNG or WebP image." }, 400);
  const id = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<Row>();
  if (!current || current.revision !== revision)
    return c.json(
      { error: "This product changed. Refresh before uploading." },
      409,
    );
  const key = crypto.randomUUID();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    const result = await c.env.DB.prepare(
      `UPDATE products SET ${column}=?, revision=revision+1,last_actor='owner',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=? RETURNING *`,
    )
      .bind(key, id, revision)
      .first<Row>();
    if (!result) {
      await c.env.MEDIA.delete(key);
      return c.json(
        { error: "This product changed. Refresh before uploading." },
        409,
      );
    }
    if (current[column]) {
      try {
        await c.env.MEDIA.delete(current[column]);
      } catch {
        console.error("Old media cleanup deferred");
      }
    }
    return c.json(product(result));
  } catch (error) {
    await c.env.MEDIA.delete(key);
    throw error;
  }
});
app.get("/api/media/:key", async (c) => {
  const p = await c.env.DB.prepare(
    "SELECT published FROM products WHERE image_key=? OR poster_key=?",
  )
    .bind(c.req.param("key"), c.req.param("key"))
    .first<{ published: number }>();
  if (!p || (!p.published ? !(await authenticated(c)) : !(await catalogueAuthorized(c))))
    return c.json({ error: "Image not found." }, 404);
  const object = await c.env.MEDIA.get(c.req.param("key"));
  if (!object) return c.json({ error: "Image not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.get("/api/admin/activity", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.product_id AS productId,a.actor,a.action,a.detail,a.created_at AS createdAt,a.reason
    FROM activity a ORDER BY a.id DESC LIMIT 100`,
  ).all();
  return c.json(rows.results);
});
app.post("/api/quotes", async (c) => {
  if(!await catalogueAuthorized(c))return c.json({error:"Unlock the catalogue before sending an enquiry."},401);
  const data = quoteInput.parse(await c.req.json());
  const fingerprint = await sha256(JSON.stringify(data));
  const previous = await c.env.DB.prepare(
    "SELECT request_hash FROM quotes WHERE id=?",
  )
    .bind(data.id)
    .first<{ request_hash: string }>();
  if (previous)
    return previous.request_hash === fingerprint
      ? c.json({ id: data.id })
      : c.json({ error: "This enquiry ID is already in use." }, 409);
  if (
    !(await consumeLimit(
      c.env.DB,
      "quotes",
      c.req.header("CF-Connecting-IP") ?? "local",
      20,
    ))
  )
    return c.json(
      { error: "Too many enquiries. Please try again in 10 minutes." },
      429,
    );
  if (new Set(data.items.map((i) => i.productId)).size !== data.items.length)
    return c.json(
      { error: "Combine repeated products before submitting." },
      400,
    );
  const placeholders = data.items.map(() => "?").join(",");
  const records = await c.env.DB.prepare(
    `SELECT * FROM products WHERE published=1 AND id IN (${placeholders})`,
  )
    .bind(...data.items.map((i) => i.productId))
    .all<Row>();
  const byId = new Map(records.results.map((p) => [p.id, p]));
  const items: QuoteItem[] = [];
  for (const item of data.items) {
    const p = byId.get(item.productId);
    if (!p)
      return c.json(
        {
          error:
            "A selected product is no longer published. Refresh your enquiry.",
        },
        409,
      );
    items.push({
      productId: p.id,
      name: p.name,
      code: p.code,
      quantity: item.quantity,
      pricePaise: p.price_paise,
    });
  }
  await c.env.DB.prepare(
    "INSERT INTO quotes(id,request_hash,name,phone,notes,items_json) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(
      data.id,
      fingerprint,
      data.name,
      data.phone,
      data.notes,
      JSON.stringify(items),
    )
    .run();
  const saved = await c.env.DB.prepare(
    "SELECT request_hash FROM quotes WHERE id=?",
  )
    .bind(data.id)
    .first<{ request_hash: string }>();
  if (saved?.request_hash !== fingerprint)
    return c.json({ error: "This enquiry ID is already in use." }, 409);
  return c.json({ id: data.id }, 201);
});
app.get("/api/admin/quotes", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM quotes ORDER BY created_at DESC LIMIT 200",
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
app.put("/api/admin/settings", async (c) => {
  const data = z
    .object({
      whatsapp: z
        .string()
        .regex(
          /^(?:\d{7,15})?$/,
          "Use country code and digits only, or leave blank.",
        ),
    })
    .strict()
    .parse(await c.req.json());
  await c.env.DB.prepare("UPDATE settings SET whatsapp=? WHERE id=1")
    .bind(data.whatsapp)
    .run();
  return c.json({ saved: true });
});
app.route("/api/admin/finance", finance);
app.route("/api", catalogueAccess);
app.notFound((c) => c.json({ error: "Route not found." }, 404));
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
  console.error("API request failed", {
    path: c.req.path,
    error: String(error).replace(/\n/g, " ").slice(0, 300),
  });
  return c.json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
});
export default app;
