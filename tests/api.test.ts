import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Bindings } from "../src/server";
import type { Product, CatalogueProduct } from "../src/shared";
import { sha256 } from "../src/server/auth";
import { cleanup } from "../src/server/index";
import { quotationText } from "../src/client/quotation";
import type { Quotation, QuoteCustomer, TeamMember } from "../src/shared";
import { inventoryCsv } from "../src/client/export";
import { upiLink } from "../src/erp";
import {
  amountFromText,
  financeCsv,
  parseFinanceCsv,
  documentInput,
  type FinanceInput,
  type FinanceDocument,
} from "../src/finance";

const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: D1Migration[];
};
const base = "https://lenore.test";
const body = {
  code: "L-001",
  name: "Basin mixer",
  category: "Basin mixers",
  unit: "pcs",
  description: "Verified fixture",
  pricePaise: 150000,
  lowStock: 5,
  published: false,
};
let token = "";
function request(
  path: string,
  data?: unknown,
  method = "GET",
  auth = true,
  origin = base,
) {
  return SELF.fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(auth ? { Cookie: `lenore_session=${token}` } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function create(overrides: Partial<typeof body> = {}) {
  const result = await request(
    "/admin/products",
    { ...body, ...overrides },
    "POST",
  );
  expect(result.status).toBe(201);
  return result.json() as Promise<Product>;
}
async function adjust(
  p: Product,
  delta: number,
  operationId = crypto.randomUUID(),
) {
  return request(
    `/admin/products/${p.id}/stock`,
    {
      operationId,
      revision: p.revision,
      delta,
      reason: "Verified stock count",
    },
    "POST",
  );
}
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await bindings.DB.batch(
    [
      "stock_movements",
      "activity",
      "products",
      "quotes",
      "product_views",
      "sessions",
      "staff_users",
      "rate_limits",
      "catalogue_sessions",
      "website_categories",
    ].map((t) =>
      bindings.DB.prepare(
        // Invoiced products are permanent records; leave them in place.
        t === "products"
          ? "DELETE FROM products WHERE id NOT IN (SELECT product_id FROM invoice_lines)"
          : `DELETE FROM ${t}`,
      ),
    ),
  );
  await bindings.DB.prepare(
    "UPDATE catalogue_access SET mode='public',enabled=0,password_hash=NULL WHERE id=1",
  ).run();
  await bindings.DB.prepare(
    "UPDATE settings SET pricing_mode='mrp',discount_cap_bp=1000,whatsapp='' WHERE id=1",
  ).run();
  await bindings.DB.prepare(
    "UPDATE website_settings SET show_products=1,show_prices=1,show_stock=1 WHERE id=1",
  ).run();
  token = crypto.randomUUID();
  await bindings.DB.prepare(
    "INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)",
  )
    .bind(await sha256(token), Date.now() + 60000)
    .run();
});

describe("identity and request boundaries", () => {
  it("denies anonymous access to all management collections", async () => {
    for (const path of ["/admin/products", "/admin/quotes", "/admin/activity"])
      expect((await request(path, undefined, "GET", false)).status).toBe(401);
  });
  it("rejects cross-origin writes before touching records", async () => {
    expect(
      (
        await request(
          "/admin/products",
          body,
          "POST",
          true,
          "https://other.test",
        )
      ).status,
    ).toBe(403);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS n FROM products").first(
        "n",
      ),
    ).toBe(0);
  });
  it("rejects expired sessions", async () => {
    await bindings.DB.prepare("UPDATE sessions SET expires_at=0").run();
    expect((await request("/admin/products")).status).toBe(401);
  });
  it("logs in with configured credentials and revokes the session on logout", async () => {
    expect(
      (
        await request(
          "/session",
          { username: "owner", password: "wrong" },
          "POST",
          false,
        )
      ).status,
    ).toBe(401);
    const response = await request(
      "/session",
      { username: "owner", password: "test-password-only" },
      "POST",
      false,
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    token = /lenore_session=([^;]+)/.exec(cookie)![1];
    expect((await request("/admin/products")).status).toBe(200);
    expect((await request("/session", undefined, "DELETE")).status).toBe(200);
    expect((await request("/admin/products")).status).toBe(401);
  });
  it("rejects the right password with an unknown username", async () => {
    expect(
      (
        await request(
          "/session",
          { username: "someone-else", password: "test-password-only" },
          "POST",
          false,
        )
      ).status,
    ).toBe(401);
  });
  it("throttles repeated failed logins", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await request(
            "/session",
            { username: "owner", password: "wrong" },
            "POST",
            false,
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await request(
          "/session",
          { username: "owner", password: "wrong" },
          "POST",
          false,
        )
      ).status,
    ).toBe(429);
  });
  it("resets failed-attempt history after successful sign-in without disabling failure throttling", async () => {
    for (let i = 0; i < 9; i++)
      expect(
        (
          await request(
            "/session",
            { username: "owner", password: "wrong" },
            "POST",
            false,
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await request(
          "/session",
          { username: "owner", password: "test-password-only" },
          "POST",
          false,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/session",
          { username: "owner", password: "wrong" },
          "POST",
          false,
        )
      ).status,
    ).toBe(401);
    expect(
      await bindings.DB.prepare(
        "SELECT attempts FROM rate_limits WHERE key LIKE 'login:%'",
      ).first("attempts"),
    ).toBe(1);
  });
});

describe("products and catalogue publishing", () => {
  it("keeps drafts private and includes stock while omitting revision and actor data", async () => {
    await create();
    const published = await create({ code: "L-002", published: true });
    const rows = (await (
      await request("/catalogue", undefined, "GET", false)
    ).json()) as CatalogueProduct[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(published.id);
    expect(rows[0].availability).toBe("Currently unavailable");
    // Public visitors see status only, never the exact quantity.
    expect(rows[0].stock).toBeNull();
    for (const key of ["revision", "lowStock", "last_actor", "published"])
      expect(rows[0]).not.toHaveProperty(key);
  });
  it("preserves stock when editing presentation and rejects stale edits", async () => {
    const p = await create();
    expect((await adjust(p, 10)).status).toBe(200);
    expect(
      (
        await request(
          `/admin/products/${p.id}`,
          { ...body, name: "Stale", revision: 1 },
          "PUT",
        )
      ).status,
    ).toBe(409);
    const update = await request(
      `/admin/products/${p.id}`,
      { ...body, name: "New title", revision: 2 },
      "PUT",
    );
    expect(update.status).toBe(200);
    const saved = (await update.json()) as Product;
    expect(saved.stock).toBe(10);
    expect(saved.revision).toBe(3);
  });
  it("enforces case-insensitive unique codes and rejects unexpected fields", async () => {
    await create();
    expect(
      (await request("/admin/products", { ...body, code: "l-001" }, "POST"))
        .status,
    ).toBe(409);
    expect(
      (
        await request(
          "/admin/products",
          { ...body, code: "NEW", stock: 999 },
          "POST",
        )
      ).status,
    ).toBe(400);
  });
  it("immediately removes unpublished products from fresh catalogue reads", async () => {
    const p = await create({ published: true });
    expect(
      (
        await request(
          `/admin/products/${p.id}`,
          { ...body, revision: p.revision },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(await (await request("/catalogue")).json()).toEqual([]);
  });
});

describe("atomic inventory", () => {
  it("keeps adjustment reasons distinct even when movements share a timestamp", async () => {
    const p = await create();
    const sql =
      "INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,created_at) VALUES(?,?,?,?,?,?,?,?,'owner','2026-10-19T00:00:00.000Z')";
    await bindings.DB.prepare(sql)
      .bind(crypto.randomUUID(), "first", p.id, 5, 0, 5, 1, "First receipt")
      .run();
    await bindings.DB.prepare(sql)
      .bind(crypto.randomUUID(), "second", p.id, 3, 5, 8, 2, "Second receipt")
      .run();
    const events = await bindings.DB.prepare(
      "SELECT reason FROM activity WHERE action='Stock changed' ORDER BY id",
    ).all<{ reason: string }>();
    expect(events.results.map((e) => e.reason)).toEqual([
      "First receipt",
      "Second receipt",
    ]);
  });
  it("records stock and activity together", async () => {
    const p = await create();
    expect((await adjust(p, 10)).status).toBe(200);
    const updated = await bindings.DB.prepare(
      "SELECT stock,revision FROM products WHERE id=?",
    )
      .bind(p.id)
      .first();
    expect(updated).toEqual({ stock: 10, revision: 2 });
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM stock_movements",
      ).first("n"),
    ).toBe(1);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM activity WHERE action='Stock changed'",
      ).first("n"),
    ).toBe(1);
  });
  it("replays the same operation without adding stock twice", async () => {
    const p = await create();
    const id = crypto.randomUUID();
    expect((await adjust(p, 10, id)).status).toBe(200);
    const replay = await adjust(p, 10, id);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ saved: true, replay: true });
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(10);
    expect((await adjust(p, 15, id)).status).toBe(409);
  });
  it("allows only one simultaneous adjustment from the same revision", async () => {
    const p = await create();
    await adjust(p, 10);
    const current = { ...p, revision: 2, stock: 10 };
    const results = await Promise.all([
      adjust(current, -7),
      adjust(current, -6),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBeGreaterThanOrEqual(0);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM stock_movements",
      ).first("n"),
    ).toBe(2);
  });
  it("rejects underflow and fractional quantities without partial writes", async () => {
    const p = await create();
    expect((await adjust(p, -1)).status).toBe(400);
    expect((await adjust(p, 0.5)).status).toBe(400);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM stock_movements",
      ).first("n"),
    ).toBe(0);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(0);
  });
  it("enforces the revision guard inside the database, even if a caller races", async () => {
    const p = await create();
    await adjust(p, 10);
    await expect(
      bindings.DB.prepare(
        "INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,created_at) VALUES(?,?,?,1,0,1,1,'stale','owner','2026-10-19')",
      )
        .bind(crypto.randomUUID(), "hash", p.id)
        .run(),
    ).rejects.toThrow("STOCK_CONFLICT");
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(10);
  });
});

describe("catalogue refresh", () => {
  it("answers unchanged polls with 304 and notices stock, product and website changes", async () => {
    const p = await create({ published: true });
    const poll = async (etag?: string) => {
      const r = await SELF.fetch(`${base}/api/catalogue`, {
        headers: {
          Origin: base,
          Cookie: `lenore_session=${token}`,
          ...(etag ? { "If-None-Match": etag } : {}),
        },
      });
      return { status: r.status, etag: r.headers.get("ETag")! };
    };
    let { etag } = await poll();
    expect((await poll(etag)).status).toBe(304);
    const changes = [
      () => adjust(p, 3),
      () =>
        bindings.DB.prepare("UPDATE products SET name='Renamed' WHERE id=?")
          .bind(p.id)
          .run(),
      () =>
        bindings.DB.prepare(
          "INSERT INTO website_categories(name,hidden) VALUES('Basin mixers',1)",
        ).run(),
      () =>
        bindings.DB.prepare(
          "UPDATE website_settings SET show_stock=0 WHERE id=1",
        ).run(),
    ];
    for (const change of changes) {
      await change();
      const next = await poll(etag);
      expect(next.status).toBe(200);
      etag = next.etag;
      expect((await poll(etag)).status).toBe(304);
    }
  });
});

describe("website enquiries", () => {
  const enquiry = () => ({
    id: crypto.randomUUID(),
    name: "Test buyer",
    phone: "+91 99999 99999",
    message: "Need fittings for two bathrooms",
    interest: "Showers",
  });
  it("accepts enquiries even when the catalogue is private, idempotently", async () => {
    await bindings.DB.prepare(
      "UPDATE catalogue_access SET mode='accounts' WHERE id=1",
    ).run();
    const data = enquiry();
    expect((await request("/enquiries", data, "POST", false)).status).toBe(201);
    expect((await request("/enquiries", data, "POST", false)).status).toBe(200);
    const rows = (await (await request("/admin/quotes")).json()) as {
      notes: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toContain("Interested in: Showers");
  });
  it("validates phone numbers and keeps enquiries private", async () => {
    expect(
      (
        await request(
          "/enquiries",
          { ...enquiry(), phone: "12" },
          "POST",
          false,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/admin/quotes", undefined, "GET", false)).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/admin/quotes/${crypto.randomUUID()}`,
          { status: "invalid" },
          "PATCH",
        )
      ).status,
    ).toBe(400);
  });
  it("records website cart requests with catalogue names and MRP, website products only", async () => {
    const shown = await create({
      code: "CART-1",
      published: true,
      pricePaise: 125000,
    });
    const hidden = await create({ code: "CART-2", published: true });
    await bindings.DB.prepare("UPDATE products SET on_website=0 WHERE id=?")
      .bind(hidden.id)
      .run();
    const r = await request(
      "/enquiries",
      {
        ...enquiry(),
        interest: "",
        kind: "order",
        items: [
          { productId: shown.id, quantity: 3 },
          { productId: hidden.id, quantity: 1 },
        ],
      },
      "POST",
      false,
    );
    expect(r.status).toBe(201);
    const [saved] = (await (await request("/admin/quotes")).json()) as {
      notes: string;
      items: { code: string; quantity: number; pricePaise: number }[];
    }[];
    expect(saved.notes).toContain("Order request from the website cart");
    expect(saved.items).toEqual([
      expect.objectContaining({
        code: "CART-1",
        quantity: 3,
        pricePaise: 125000,
      }),
    ]);
    // Only hidden products: nothing to record.
    expect(
      (
        await request(
          "/enquiries",
          {
            ...enquiry(),
            kind: "quote",
            items: [{ productId: hidden.id, quantity: 1 }],
          },
          "POST",
          false,
        )
      ).status,
    ).toBe(409);
  });
});

describe("media", () => {
  it("preserves photo and poster independently across sequential revision-checked uploads", async () => {
    const p = await create({ published: true });
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    async function upload(slot: string, revision: number) {
      return SELF.fetch(
        `${base}/api/admin/products/${p.id}/image?slot=${slot}`,
        {
          method: "POST",
          headers: {
            Origin: base,
            Cookie: `lenore_session=${token}`,
            "If-Match": String(revision),
          },
          body: png,
        },
      );
    }
    const photo = (await (await upload("photo", 1)).json()) as Product;
    const posterResponse = await upload("poster", 2);
    expect(posterResponse.status).toBe(200);
    const poster = (await posterResponse.json()) as Product;
    expect(poster.imageUrl).toBe(photo.imageUrl);
    expect(poster.posterUrl).not.toBeNull();
    expect(poster.posterUrl).not.toBe(photo.imageUrl);
    expect((await SELF.fetch(base + poster.posterUrl)).status).toBe(200);
    const catalogue = (await (
      await request("/catalogue")
    ).json()) as CatalogueProduct[];
    expect(catalogue[0]).toMatchObject({
      posterUrl: poster.posterUrl,
      stock: 0,
    });
    expect((await upload("poster", 1)).status).toBe(409);
  });
  it("rejects SVG uploads and requires a product revision", async () => {
    const p = await create();
    const response = await SELF.fetch(
      `${base}/api/admin/products/${p.id}/image`,
      {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: `lenore_session=${token}`,
          "If-Match": "1",
        },
        body: '<svg onload="alert(1)"/>',
      },
    );
    expect(response.status).toBe(400);
    expect(
      (await request("/media/not-found", undefined, "GET", false)).status,
    ).toBe(404);
  });
  it("stores approved media and hides a draft product image from anonymous readers", async () => {
    const p = await create();
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const response = await SELF.fetch(
      `${base}/api/admin/products/${p.id}/image`,
      {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: `lenore_session=${token}`,
          "If-Match": "1",
        },
        body: png,
      },
    );
    expect(response.status).toBe(200);
    const saved = (await response.json()) as Product;
    expect((await SELF.fetch(base + saved.imageUrl)).status).toBe(404);
    expect(
      (
        await SELF.fetch(base + saved.imageUrl, {
          headers: { Cookie: `lenore_session=${token}` },
        })
      ).status,
    ).toBe(200);
  });
});

describe("quotation text", () => {
  const quote: Quotation = {
    id: crypto.randomUUID(),
    number: "LQ-2026-0007",
    shareToken: "a".repeat(36),
    status: "draft",
    channel: "staff",
    createdBy: null,
    createdByName: "Asha",
    createdByPhone: "919876543210",
    customerId: null,
    customerName: "Buyer",
    customerPhone: "9999999999",
    customerPlace: "Kuttiady",
    notes: "Fixture note",
    validUntil: "2026-11-03",
    terms: "",
    items: [
      {
        productId: crypto.randomUUID(),
        code: "L-01",
        name: "Basin mixer",
        unit: "pcs",
        imageUrl: null,
        mrpPaise: 125050,
        discountBp: 1000,
        unitPricePaise: 112545,
        quantity: 3,
        amountPaise: 337635,
      },
    ],
    itemCount: 1,
    mrpTotalPaise: 375150,
    discountPaise: 37515,
    totalPaise: 337635,
    version: 1,
    revision: 1,
    createdAt: "2026-10-19T06:00:00.000Z",
    updatedAt: "2026-10-19T06:00:00.000Z",
  };
  it("includes number, customer, lines, discount, total, link and salesperson", () => {
    const text = quotationText(quote, "https://www.lenoretrading.com/q/x");
    for (const value of [
      "LQ-2026-0007",
      "Buyer, Kuttiady",
      "L-01",
      "10% off",
      "3,751.50",
      "3,376.35",
      "https://www.lenoretrading.com/q/x",
      "Asha",
      "Lenore Trading LLP",
    ])
      expect(text).toContain(value);
  });
  it("never fabricates a total for unknown prices", () => {
    const text = quotationText({ ...quote, totalPaise: null });
    expect(text).toContain("Total: To be confirmed");
  });
});

describe("inventory export", () => {
  it("exports selected records with MRP and stock, escaping spreadsheet formulas and quotes", () => {
    const csv = inventoryCsv([
      {
        ...body,
        id: crypto.randomUUID(),
        name: '=HYPERLINK("unsafe")',
        stock: 4,
        revision: 1,
        updatedAt: "2026-10-19",
        imageUrl: null,
        posterUrl: null,
        slug: "basin-mixer-l-001",
        hsn: "",
        gstRateBp: null,
        barcode: "",
        reorderQty: 0,
        bin: "",
        costPaise: null,
      },
    ]);
    expect(csv).toContain("Suggested MRP (INR)");
    expect(csv).toContain(`"'=HYPERLINK(""unsafe"")"`);
    expect(csv).toContain('"1500.00","4","pcs","Low stock"');
  });
});

function financeFixture(overrides: Partial<FinanceInput> = {}): FinanceInput {
  return {
    id: crypto.randomUUID(),
    kind: "sale",
    date: "2026-03-01",
    dueDate: "2026-03-15",
    number: `TEST-${crypto.randomUUID()}`,
    party: "Finance fixture",
    gstin: "",
    category: "Trading",
    netMinor: 10000,
    freightMinor: 0,
    roundingMinor: 0,
    cgstMinor: 0,
    sgstMinor: 0,
    igstMinor: 0,
    costMinor: 6000,
    itcStatus: "pending",
    reviewNote: "",
    supply: "non_gst",
    parentId: null,
    source: "manual",
    notes: "Isolated workerd fixture",
    export: null,
    ...overrides,
  };
}
async function recordFinance(d: FinanceInput) {
  return request("/admin/finance/documents", d, "POST");
}
async function financeWorkspace(date: string) {
  const r = await request(`/admin/finance/workspace?from=${date}&to=${date}`);
  expect(r.status).toBe(200);
  return r.json() as Promise<{
    documents: FinanceDocument[];
    summary: {
      revenue: number;
      cogs: number | null;
      grossProfit: number | null;
      expense: number;
      operatingResult: number | null;
      cashIn: number;
      cashOut: number;
      output: { cgstMinor: number; igstMinor: number };
      eligible: { cgstMinor: number };
    };
    balances: FinanceDocument[];
  }>;
}
async function configureGst() {
  const p = (await (await request("/admin/finance/profile")).json()) as {
    revision: number;
  };
  return request(
    "/admin/finance/profile",
    {
      name: "Test Lenore",
      gstin: "32ABCDE1234F1Z5",
      stateCode: "32",
      iec: "",
      lut: "",
      registration: "regular",
      revision: p.revision,
    },
    "PUT",
  );
}
function payment(documentId: string, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    documentId,
    date: "2026-03-07",
    amountMinor: 10000,
    bankMinor: 10000,
    refund: false,
    method: "bank",
    reference: crypto.randomUUID(),
    notes: "Verified source receipt",
    ...overrides,
  };
}

describe("finance subledger", () => {
  it("keeps finance private and validates exact amounts/calendar dates", async () => {
    expect(
      (await request("/admin/finance/workspace", undefined, "GET", false))
        .status,
    ).toBe(401);
    expect(amountFromText("0.29")).toBe(29);
    expect(amountFromText("123456.78")).toBe(12345678);
    expect(() => amountFromText("1.001")).toThrow();
    expect(() => amountFromText("1e3")).toThrow();
    expect(
      documentInput.safeParse(financeFixture({ date: "2026-02-30" })).success,
    ).toBe(false);
    const tax = financeFixture({
      supply: "domestic_intra",
      cgstMinor: 900,
      sgstMinor: 900,
    });
    expect((await recordFinance(tax)).status).toBe(409);
  });
  it("never reports missing cost as zero profit and completes cost once", async () => {
    const d = financeFixture({ date: "2026-03-02", costMinor: null });
    expect((await recordFinance(d)).status).toBe(201);
    let w = await financeWorkspace(d.date);
    expect(w.summary.revenue).toBe(10000);
    expect(w.summary.grossProfit).toBeNull();
    expect(
      (
        await request(
          `/admin/finance/documents/${d.id}/cost`,
          { costMinor: 6500, reason: "Supplier cost evidence" },
          "POST",
        )
      ).status,
    ).toBe(200);
    w = await financeWorkspace(d.date);
    expect(w.summary.cogs).toBe(6500);
    expect(w.summary.grossProfit).toBe(3500);
    expect(
      (
        await request(
          `/admin/finance/documents/${d.id}/cost`,
          { costMinor: 1, reason: "Cannot rewrite" },
          "POST",
        )
      ).status,
    ).toBe(409);
  });
  it("separates inventory purchases, operating expenses and cash", async () => {
    const date = "2026-03-03";
    expect(
      (
        await recordFinance(
          financeFixture({
            kind: "purchase",
            date,
            netMinor: 90000,
            costMinor: null,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await recordFinance(
          financeFixture({
            kind: "expense",
            date,
            netMinor: 2500,
            costMinor: null,
            category: "Rent",
          }),
        )
      ).status,
    ).toBe(201);
    const w = await financeWorkspace(date);
    expect(w.summary.revenue).toBe(0);
    expect(w.summary.expense).toBe(2500);
    expect(w.summary.operatingResult).toBe(-2500);
    expect(w.summary.cashOut).toBe(0);
  });
  it("excludes output GST from revenue and requires reviewed input tax", async () => {
    expect((await configureGst()).status).toBe(200);
    const date = "2026-03-04";
    const sale = financeFixture({
      date,
      supply: "domestic_intra",
      cgstMinor: 900,
      sgstMinor: 900,
    });
    expect((await recordFinance(sale)).status).toBe(201);
    const buy = financeFixture({
      kind: "purchase",
      date,
      costMinor: null,
      gstin: "32FGHIJ5678K1Z5",
      supply: "domestic_intra",
      cgstMinor: 900,
      sgstMinor: 900,
    });
    expect((await recordFinance(buy)).status).toBe(201);
    let w = await financeWorkspace(date);
    expect(w.summary.revenue).toBe(10000);
    expect(w.summary.output.cgstMinor).toBe(900);
    expect(w.summary.eligible.cgstMinor).toBe(0);
    expect(
      (
        await request(
          `/admin/finance/documents/${buy.id}/review`,
          { status: "eligible", reason: "Source bill and GSTR-2B reconciled" },
          "POST",
        )
      ).status,
    ).toBe(200);
    w = await financeWorkspace(date);
    expect(w.summary.eligible.cgstMinor).toBe(900);
    expect(
      (
        await recordFinance(
          financeFixture({
            kind: "purchase",
            costMinor: null,
            supply: "domestic_inter",
            igstMinor: 100,
            itcStatus: "eligible",
            reviewNote: "Missing supplier identity",
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("caps credit components and supports refunds without double counting", async () => {
    const d = financeFixture({ date: "2026-03-05" });
    expect((await recordFinance(d)).status).toBe(201);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          payment(d.id, { date: d.date }),
          "POST",
        )
      ).status,
    ).toBe(201);
    const credit = financeFixture({
      kind: "sale_credit",
      date: d.date,
      parentId: d.id,
      netMinor: 2000,
      costMinor: 1200,
    });
    expect((await recordFinance(credit)).status).toBe(201);
    expect(
      (
        await recordFinance(
          financeFixture({
            kind: "sale_credit",
            parentId: d.id,
            netMinor: 9000,
          }),
        )
      ).status,
    ).toBe(409);
    let w = await financeWorkspace(d.date);
    expect(w.summary.revenue).toBe(8000);
    expect(w.summary.grossProfit).toBe(3200);
    expect(w.balances.find((b) => b.id === d.id)?.outstandingMinor).toBe(-2000);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          payment(d.id, {
            date: d.date,
            refund: true,
            amountMinor: 2000,
            bankMinor: 2000,
          }),
          "POST",
        )
      ).status,
    ).toBe(201);
    w = await financeWorkspace(d.date);
    expect(w.balances.find((b) => b.id === d.id)).toBeUndefined();
    expect(w.summary.cashIn).toBe(10000);
    expect(w.summary.cashOut).toBe(2000);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          payment(d.id, {
            date: d.date,
            refund: true,
            amountMinor: 1,
            bankMinor: 1,
          }),
          "POST",
        )
      ).status,
    ).toBe(409);
  });
  it("rejects concurrent overpayments and makes payment retries idempotent", async () => {
    const d = financeFixture({ date: "2026-03-06" });
    expect((await recordFinance(d)).status).toBe(201);
    const [a, b] = await Promise.all([
      request(
        "/admin/finance/settlements",
        payment(d.id, { amountMinor: 7000, bankMinor: 7000 }),
        "POST",
      ),
      request(
        "/admin/finance/settlements",
        payment(d.id, { amountMinor: 7000, bankMinor: 7000 }),
        "POST",
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const remaining = payment(d.id, { amountMinor: 3000, bankMinor: 3100 });
    const results = await Promise.all([
      request("/admin/finance/settlements", remaining, "POST"),
      request("/admin/finance/settlements", remaining, "POST"),
    ]);
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          { ...remaining, bankMinor: 1 },
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/admin/finance/documents/${d.id}/void`,
          { reason: "Paid source cannot disappear" },
          "POST",
        )
      ).status,
    ).toBe(409);
  });
  it("imports atomically, detects altered duplicates and leaves inventory alone", async () => {
    const a = financeFixture({ date: "2026-03-08" });
    const bad = financeFixture({
      kind: "sale_credit",
      parentId: crypto.randomUUID(),
    });
    expect(
      (await request("/admin/finance/import", { documents: [a, bad] }, "POST"))
        .status,
    ).toBe(409);
    expect((await financeWorkspace(a.date)).documents).toHaveLength(0);
    expect(
      (await request("/admin/finance/import", { documents: [a] }, "POST"))
        .status,
    ).toBe(200);
    const retry = await request(
      "/admin/finance/import",
      { documents: [{ ...a, id: crypto.randomUUID(), source: "csv" }] },
      "POST",
    );
    expect(await retry.json()).toEqual({ imported: 0, skipped: 1 });
    expect(
      (await recordFinance({ ...a, id: crypto.randomUUID(), netMinor: 1 }))
        .status,
    ).toBe(409);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM stock_movements",
      ).first("n"),
    ).toBe(0);
  });
  it("round-trips a finance CSV and neutralises formula text", async () => {
    const d = financeFixture({
      date: "2026-03-09",
      number: 'Plain,"ref"',
      roundingMinor: -1,
    });
    expect((await recordFinance(d)).status).toBe(201);
    const docs = (await financeWorkspace(d.date)).documents;
    const csv = financeCsv(docs);
    const parsed = parseFinanceCsv(csv);
    expect(parsed[0].roundingMinor).toBe(-1);
    expect(parsed[0].number).toBe(d.number);
    expect(parsed[0].netMinor).toBe(d.netMinor);
    expect(
      financeCsv([{ ...docs[0], party: '=HYPERLINK("unsafe")' }]),
    ).toContain("'=HYPERLINK");
    expect(() => parseFinanceCsv("kind,net\nsale,1")).toThrow(/columns/);
  });
  it("retains export evidence without inferring foreign tax or cash", async () => {
    const d = financeFixture({
      date: "2026-03-10",
      supply: "export_lut",
      export: {
        country: "QA",
        currency: "QAR",
        foreignGrossMinor: 450,
        rateEvidence: "Source invoice INR translation",
        lut: "LUT-REFERENCE",
        shippingBill: "SB-1",
        shippingDate: "2026-03-10",
        port: "INTEST",
        realisationDue: "2026-05-01",
      },
    });
    expect((await recordFinance(d)).status).toBe(201);
    const w = await financeWorkspace(d.date);
    expect(w.summary.revenue).toBe(10000);
    expect(w.summary.output.igstMinor).toBe(0);
    expect(w.summary.cashIn).toBe(0);
    expect(w.documents[0].export?.country).toBe("QA");
    expect(
      (await recordFinance({ ...d, id: crypto.randomUUID(), igstMinor: 100 }))
        .status,
    ).toBe(400);
  });
  it("uses as-of balances and preserves append-only financial history", async () => {
    const d = financeFixture({ date: "2026-03-11" });
    expect((await recordFinance(d)).status).toBe(201);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          payment(d.id, { date: "2026-03-12" }),
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(
      (await financeWorkspace(d.date)).balances.find((b) => b.id === d.id)
        ?.outstandingMinor,
    ).toBe(10000);
    await expect(
      bindings.DB.prepare("DELETE FROM finance_settlements WHERE document_id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow(/cannot be deleted/);
    await expect(
      bindings.DB.prepare("DELETE FROM finance_documents WHERE id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow(/cannot be deleted/);
  });
  it("tracks tax tasks with revision checks and records explicit references", async () => {
    const task = {
      id: crypto.randomUUID(),
      title: "GST review",
      type: "GST",
      period: "2026-03",
      dueDate: "2026-04-20",
      amountMinor: null,
      status: "open",
      reference: "",
      notes: "Entered due date from adviser",
    };
    expect(
      (await request("/admin/finance/obligations", task, "POST")).status,
    ).toBe(201);
    expect(
      (
        await request(
          `/admin/finance/obligations/${task.id}`,
          { ...task, status: "filed", revision: 1 },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/admin/finance/obligations/${task.id}`,
          { ...task, status: "filed", reference: "ARN-TEST", revision: 1 },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/admin/finance/obligations/${task.id}`,
          { ...task, revision: 1 },
          "PUT",
        )
      ).status,
    ).toBe(409);
  });
  it("closes only complete periods and blocks backdated changes", async () => {
    const d = financeFixture({
      date: "2024-03-01",
      dueDate: "2024-03-15",
      costMinor: null,
    });
    expect((await recordFinance(d)).status).toBe(201);
    let p = (await (await request("/admin/finance/profile")).json()) as {
      revision: number;
    };
    expect(
      (
        await request(
          "/admin/finance/close",
          {
            through: "2024-03-31",
            revision: p.revision,
            reason: "Accountant approval",
          },
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/admin/finance/documents/${d.id}/cost`,
          { costMinor: 5000, reason: "Supplier cost" },
          "POST",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/finance/close",
          {
            through: "2024-03-31",
            revision: p.revision,
            reason: "Accountant approval",
          },
          "POST",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await recordFinance(
          financeFixture({ date: "2024-03-02", dueDate: "2024-03-15" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/admin/finance/documents/${d.id}/void`,
          { reason: "Backdated void" },
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/admin/finance/settlements",
          payment(d.id, { date: "2024-03-02" }),
          "POST",
        )
      ).status,
    ).toBe(409);
    p = (await (await request("/admin/finance/profile")).json()) as {
      revision: number;
    };
    expect(
      (
        await request(
          "/admin/finance/close",
          {
            through: "2024-02-01",
            revision: p.revision,
            reason: "Cannot reopen",
          },
          "POST",
        )
      ).status,
    ).toBe(409);
  });
});

describe("website controls", () => {
  it("hides products, collections, prices and stock from the public only", async () => {
    const shown = await create({
      code: "W-1",
      name: "Shown mixer",
      published: true,
    });
    const hidden = await create({
      code: "W-2",
      name: "Hidden mixer",
      published: true,
    });
    const other = await create({
      code: "W-3",
      name: "Rain shower",
      category: "Showers",
      published: true,
    });
    const page = (path: string) =>
      SELF.fetch(`${base}${path}`).then((r) => r.text());
    expect(
      (
        await request(
          "/admin/website/products",
          { ids: [hidden.id], onWebsite: false },
          "PUT",
        )
      ).status,
    ).toBe(200);
    const site = (await (await request("/admin/website")).json()) as {
      settings: { revision: number };
    };
    expect(
      (
        await request(
          "/admin/website/categories",
          {
            categories: [
              { name: "Showers", hidden: true, sortOrder: 1, intro: "" },
            ],
          },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/website/settings",
          {
            showProducts: true,
            showPrices: false,
            showStock: false,
            revision: site.settings.revision,
          },
          "PUT",
        )
      ).status,
    ).toBe(200);
    const collection = await page("/collections/basin-mixers");
    expect(collection).toContain("Shown mixer");
    expect(collection).not.toContain("Hidden mixer");
    expect(collection).not.toContain("1,500");
    expect((await SELF.fetch(`${base}/collections/showers`)).status).toBe(404);
    expect((await SELF.fetch(`${base}/products/${hidden.slug}`)).status).toBe(
      404,
    );
    // Anonymous catalogue readers get the website's view; staff still see everything.
    const publicList = (await (
      await request("/catalogue", undefined, "GET", false)
    ).json()) as CatalogueProduct[];
    expect(publicList.map((p) => p.code)).toEqual(["W-1"]);
    expect(publicList[0]).toMatchObject({
      pricePaise: null,
      availability: null,
    });
    const staffList = (await (
      await request("/catalogue")
    ).json()) as CatalogueProduct[];
    expect(staffList.map((p) => p.code).sort()).toEqual(["W-1", "W-2", "W-3"]);
    expect(shown.id).not.toBe(other.id);
  });
  it("limits featured products to 12", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 13; i++)
      ids.push(
        (
          await create({
            code: `F-${i}`,
            name: `Featured ${i}`,
            published: true,
          })
        ).id,
      );
    expect(
      (
        await request(
          "/admin/website/products",
          { ids: ids.slice(0, 12), featured: true },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/website/products",
          { ids: [ids[12]], featured: true },
          "PUT",
        )
      ).status,
    ).toBe(400);
    const home = await SELF.fetch(`${base}/`).then((r) => r.text());
    expect(home).toContain("Featured 11");
  });
});

describe("catalogue access", () => {
  const visitor = (path: string, init: RequestInit = {}, cookie = "") =>
    SELF.fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
  async function settings() {
    return (await (await request("/admin/catalogue-access")).json()) as {
      mode: string;
      hasPassword: boolean;
      revision: number;
    };
  }
  it("is open by default and requires a password before protection", async () => {
    expect(await (await visitor("/catalogue-access")).json()).toMatchObject({
      mode: "public",
      authorized: true,
      level: "public",
    });
    const s = await settings();
    expect(
      (
        await request(
          "/admin/catalogue-access",
          { mode: "password", revision: s.revision },
          "PUT",
        )
      ).status,
    ).toBe(400);
  });
  it("protects the catalogue, admits the right password and revokes sessions", async () => {
    await create({ published: true });
    const s = await settings();
    const enabled = await request(
      "/admin/catalogue-access",
      { mode: "password", password: "dealer-pass-1", revision: s.revision },
      "PUT",
    );
    expect(enabled.status).toBe(200);
    expect((await visitor("/catalogue")).status).toBe(401);
    expect((await request("/catalogue")).status).toBe(200);
    expect(
      (
        await visitor("/catalogue-access", {
          method: "POST",
          body: JSON.stringify({ password: "wrong" }),
        })
      ).status,
    ).toBe(401);
    const unlocked = await visitor("/catalogue-access", {
      method: "POST",
      body: JSON.stringify({ password: "dealer-pass-1" }),
    });
    expect(unlocked.status).toBe(200);
    const cookie = /lenore_catalogue=[^;]+/.exec(
      unlocked.headers.get("set-cookie")!,
    )![0];
    expect((await visitor("/catalogue", {}, cookie)).status).toBe(200);
    const current = await settings();
    expect(
      (
        await request(
          "/admin/catalogue-access/revoke",
          { revision: current.revision },
          "POST",
        )
      ).status,
    ).toBe(200);
    expect((await visitor("/catalogue", {}, cookie)).status).toBe(401);
  });
  it("rejects stale settings revisions", async () => {
    const s = await settings();
    await request(
      "/admin/catalogue-access",
      { mode: "public", password: "first-pass", revision: s.revision },
      "PUT",
    );
    expect(
      (
        await request(
          "/admin/catalogue-access",
          { mode: "public", revision: s.revision },
          "PUT",
        )
      ).status,
    ).toBe(409);
  });
});

async function member(
  overrides: Partial<{
    name: string;
    phone: string;
    role: "admin" | "sales";
    maxDiscountBp: number | null;
  }> = {},
) {
  const phone =
    overrides.phone ??
    `98${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, "0")}`;
  const created = await request(
    "/admin/team",
    {
      name: "Asha Sales",
      role: "sales",
      maxDiscountBp: null,
      password: "sales-pass-1",
      ...overrides,
      phone,
    },
    "POST",
  );
  expect(created.status).toBe(201);
  const login = await request(
    "/session",
    { username: phone, password: "sales-pass-1" },
    "POST",
    false,
  );
  expect(login.status).toBe(200);
  const cookie = /lenore_session=[^;]+/.exec(
    login.headers.get("set-cookie")!,
  )![0];
  return { ...((await created.json()) as TeamMember), cookie };
}
const as =
  (cookie: string) =>
  (path: string, data?: unknown, method = "GET") =>
    SELF.fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
const later = (days = 10) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
function quoteBody(
  items: {
    productId: string;
    quantity: number;
    discountBp?: number;
    unitPricePaise?: number | null;
  }[],
) {
  return {
    id: crypto.randomUUID(),
    customerName: "Rahim",
    customerPhone: "9847000000",
    customerPlace: "Kuttiady",
    notes: "",
    validUntil: later(),
    items,
  };
}

describe("team accounts and roles", () => {
  it("lets salespeople into the catalogue with stock status only, not the workspace", async () => {
    const p = await create({ published: true, bin: "A-3" } as Partial<
      typeof body
    >);
    await adjust(p, 7);
    const sales = await member();
    const call = as(sales.cookie);
    expect((await call("/admin/products")).status).toBe(403);
    const session = (await (await call("/session")).json()) as {
      role: string;
      authenticated: boolean;
    };
    expect(session).toMatchObject({ role: "sales", authenticated: false });
    const rows = (await (
      await call("/catalogue")
    ).json()) as CatalogueProduct[];
    expect(rows[0]).toMatchObject({
      stock: null,
      bin: "",
      availability: "Available",
    });
    const one = (await (
      await call(`/catalogue/${rows[0].slug}`)
    ).json()) as CatalogueProduct;
    expect(one.stock).toBeNull();
    // Company staff (owner, admins, cashiers) still see the exact count.
    const own = (await (
      await request("/catalogue")
    ).json()) as CatalogueProduct[];
    expect(own[0]).toMatchObject({ stock: 7, bin: "A-3" });
    await bindings.DB.prepare("UPDATE staff_users SET pos_access=1 WHERE id=?")
      .bind(sales.id)
      .run();
    const cashier = (await (
      await call("/catalogue")
    ).json()) as CatalogueProduct[];
    expect(cashier[0].stock).toBe(7);
  });
  it("admits salespeople in accounts-only mode and locks everyone else out", async () => {
    await create({ published: true });
    await bindings.DB.prepare(
      "UPDATE catalogue_access SET mode='accounts' WHERE id=1",
    ).run();
    expect((await request("/catalogue", undefined, "GET", false)).status).toBe(
      401,
    );
    const sales = await member();
    expect((await as(sales.cookie)("/catalogue")).status).toBe(200);
  });
  it("ends sessions immediately when a member is deactivated", async () => {
    const sales = await member();
    const update = await request(
      `/admin/team/${sales.id}`,
      {
        name: sales.name,
        role: "sales",
        active: false,
        maxDiscountBp: null,
        password: "",
        revision: sales.revision,
      },
      "PUT",
    );
    expect(update.status).toBe(200);
    const session = (await (await as(sales.cookie)("/session")).json()) as {
      role: string | null;
    };
    expect(session.role).toBeNull();
    expect(
      (
        await request(
          "/session",
          { username: sales.phone, password: "sales-pass-1" },
          "POST",
          false,
        )
      ).status,
    ).toBe(401);
  });
  it("rejects duplicate phone numbers and stale edits", async () => {
    const sales = await member({ phone: "9800000001" });
    expect(
      (
        await request(
          "/admin/team",
          {
            name: "Copy",
            phone: "98000 00001",
            role: "sales",
            maxDiscountBp: null,
            password: "another-pass",
          },
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/admin/team/${sales.id}`,
          {
            name: "x y",
            role: "sales",
            active: true,
            maxDiscountBp: null,
            password: "",
            revision: 99,
          },
          "PUT",
        )
      ).status,
    ).toBe(409);
  });
  it("throttles failed logins per account, so one person cannot lock out a shared showroom connection", async () => {
    const other = await member({ phone: "9800000002" });
    for (let i = 0; i < 10; i++)
      await request(
        "/session",
        { username: "9800000003", password: "wrong" },
        "POST",
        false,
      );
    expect(
      (
        await request(
          "/session",
          { username: "9800000003", password: "wrong" },
          "POST",
          false,
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await request(
          "/session",
          { username: other.phone, password: "sales-pass-1" },
          "POST",
          false,
        )
      ).status,
    ).toBe(200);
  });
});

describe("quotations", () => {
  it("numbers quotations, prices them at MRP by default and is retry-safe", async () => {
    const p = await create({ published: true, pricePaise: 125050 });
    const sales = await member();
    const body = quoteBody([{ productId: p.id, quantity: 3 }]);
    const first = await as(sales.cookie)("/quotations", body, "POST");
    expect(first.status).toBe(201);
    const q = (await first.json()) as Quotation;
    expect(q.number).toMatch(/^LQ-\d{4}-\d{4}$/);
    expect(q.totalPaise).toBe(375150);
    expect(q.createdByName).toBe("Asha Sales");
    expect(q.terms).toContain("does not reserve stock");
    const replay = await as(sales.cookie)("/quotations", body, "POST");
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as Quotation).number).toBe(q.number);
    const next = (await (
      await as(sales.cookie)(
        "/quotations",
        quoteBody([{ productId: p.id, quantity: 1 }]),
        "POST",
      )
    ).json()) as Quotation;
    expect(Number(next.number.slice(-4))).toBe(Number(q.number.slice(-4)) + 1);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(0);
  });
  it("enforces the admin pricing policy and never exceeds MRP", async () => {
    const p = await create({ published: true, pricePaise: 100000 });
    const sales = await member({ maxDiscountBp: null });
    const call = as(sales.cookie);
    expect(
      (
        await call(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, discountBp: 500 }]),
          "POST",
        )
      ).status,
    ).toBe(409);
    await bindings.DB.prepare(
      "UPDATE settings SET pricing_mode='capped',discount_cap_bp=1000",
    ).run();
    const ok = await call(
      "/quotations",
      quoteBody([{ productId: p.id, quantity: 2, discountBp: 750 }]),
      "POST",
    );
    expect(ok.status).toBe(201);
    const q = (await ok.json()) as Quotation;
    expect(q.items[0].unitPricePaise).toBe(92500);
    expect(q.discountPaise).toBe(15000);
    expect(
      (
        await call(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, discountBp: 1500 }]),
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, unitPricePaise: 90000 }]),
          "POST",
        )
      ).status,
    ).toBe(409);
    const capped = await member({ maxDiscountBp: 2000 });
    expect(
      (
        await as(capped.cookie)(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, discountBp: 1500 }]),
          "POST",
        )
      ).status,
    ).toBe(201);
    await bindings.DB.prepare("UPDATE settings SET pricing_mode='free'").run();
    expect(
      (
        await call(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, unitPricePaise: 85000 }]),
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, unitPricePaise: 100001 }]),
          "POST",
        )
      ).status,
    ).toBe(409);
  });
  it("keeps public quotations at MRP and refuses them when the catalogue is private", async () => {
    const p = await create({ published: true, pricePaise: 50000 });
    expect(
      (
        await request(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1, discountBp: 100 }]),
          "POST",
          false,
        )
      ).status,
    ).toBe(409);
    const ok = await request(
      "/quotations",
      quoteBody([{ productId: p.id, quantity: 2 }]),
      "POST",
      false,
    );
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as Quotation).channel).toBe("public");
    await bindings.DB.prepare(
      "UPDATE catalogue_access SET mode='accounts' WHERE id=1",
    ).run();
    expect(
      (
        await request(
          "/quotations",
          quoteBody([{ productId: p.id, quantity: 1 }]),
          "POST",
          false,
        )
      ).status,
    ).toBe(401);
  });
  it("revises with immutable versions, guards authorship and serves the customer link", async () => {
    const p = await create({ published: true, pricePaise: 20000 });
    const author = await member();
    const other = await member();
    const q = (await (
      await as(author.cookie)(
        "/quotations",
        quoteBody([{ productId: p.id, quantity: 1 }]),
        "POST",
      )
    ).json()) as Quotation;
    const revision = {
      ...quoteBody([{ productId: p.id, quantity: 4 }]),
      revision: q.revision,
    };
    expect(
      (await as(other.cookie)(`/quotations/${q.id}`, revision, "PUT")).status,
    ).toBe(403);
    const revised = await as(author.cookie)(
      `/quotations/${q.id}`,
      revision,
      "PUT",
    );
    expect(revised.status).toBe(200);
    expect(((await revised.json()) as Quotation).totalPaise).toBe(80000);
    expect(
      (await as(author.cookie)(`/quotations/${q.id}`, revision, "PUT")).status,
    ).toBe(409);
    const detail = (await (
      await as(author.cookie)(`/quotations/${q.id}`)
    ).json()) as Quotation & { versions: unknown[] };
    expect(detail.version).toBe(2);
    expect(detail.versions).toHaveLength(2);
    await expect(
      bindings.DB.prepare("DELETE FROM quotation_versions WHERE quotation_id=?")
        .bind(q.id)
        .run(),
    ).rejects.toThrow("cannot be deleted");
    const status = await as(author.cookie)(
      `/quotations/${q.id}`,
      { status: "won", revision: detail.revision },
      "PATCH",
    );
    expect(status.status).toBe(200);
    const link = await request(`/q/${q.shareToken}`, undefined, "GET", false);
    expect(link.status).toBe(200);
    const shared = (await link.json()) as Quotation;
    expect(shared.items[0].quantity).toBe(4);
    expect(shared.createdBy).toBeNull();
    expect(
      (await request(`/q/${"0".repeat(36)}`, undefined, "GET", false)).status,
    ).toBe(404);
    const mine = (await (
      await as(other.cookie)("/quotations")
    ).json()) as Quotation[];
    expect(mine.find((x) => x.id === q.id)).toBeUndefined();
    const all = (await (
      await request(`/admin/quotations?by=${author.id}`)
    ).json()) as Quotation[];
    expect(all.map((x) => x.id)).toContain(q.id);
  });
  it("reports quotation insights for admins only", async () => {
    const p = await create({ published: true, pricePaise: 10000 });
    const sales = await member();
    await as(sales.cookie)(
      "/quotations",
      quoteBody([{ productId: p.id, quantity: 5 }]),
      "POST",
    );
    expect((await as(sales.cookie)("/admin/analytics")).status).toBe(403);
    const r = await request("/admin/analytics?days=7");
    expect(r.status).toBe(200);
    const data = (await r.json()) as {
      byPerson: { id: string; quotes: number }[];
      topQuoted: { productId: string; quantity: number }[];
    };
    expect(data.byPerson.find((x) => x.id === sales.id)?.quotes).toBe(1);
    expect(data.topQuoted.find((x) => x.productId === p.id)?.quantity).toBe(5);
  });
});

describe("inventory management", () => {
  it("records typed movements, rejects the wrong direction and keeps a ledger", async () => {
    const p = await create();
    const move = (delta: number, kind: string, revision: number) =>
      request(
        `/admin/products/${p.id}/stock`,
        {
          operationId: crypto.randomUUID(),
          revision,
          delta,
          reason: "Typed movement",
          kind,
        },
        "POST",
      );
    expect((await move(-2, "receipt", 1)).status).toBe(400);
    expect((await move(10, "receipt", 1)).status).toBe(200);
    expect((await move(-1, "damage", 2)).status).toBe(200);
    const ledger = (await (
      await request(`/admin/products/${p.id}/movements`)
    ).json()) as {
      kind: string;
      newStock: number;
    }[];
    expect(ledger.map((m) => m.kind)).toEqual(["damage", "receipt"]);
    expect(ledger[0].newStock).toBe(9);
  });
  it("posts a stock count atomically, rejects stale counts and replays safely", async () => {
    const a = await create({ code: "C-1" });
    const b = await create({ code: "C-2" });
    await adjust(a, 5);
    const count = {
      operationId: crypto.randomUUID(),
      reason: "Monthly count",
      lines: [
        { productId: a.id, revision: 2, counted: 3 },
        { productId: b.id, revision: 1, counted: 4 },
      ],
    };
    const r = await request("/admin/stock-count", count, "POST");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { corrected: number }).corrected).toBe(2);
    expect(
      (
        (await (await request("/admin/stock-count", count, "POST")).json()) as {
          replay: boolean;
        }
      ).replay,
    ).toBe(true);
    const stale = { ...count, operationId: crypto.randomUUID() };
    expect((await request("/admin/stock-count", stale, "POST")).status).toBe(
      409,
    );
    const stocks = await bindings.DB.prepare(
      "SELECT code,stock FROM products ORDER BY code",
    ).all();
    expect(stocks.results).toEqual([
      { code: "C-1", stock: 3 },
      { code: "C-2", stock: 4 },
    ]);
  });
  it("imports products by code with a dry run, opening stock and unique barcodes", async () => {
    await create({ code: "IMP-1" });
    const rows = [
      { ...body, code: "IMP-1", name: "Renamed", barcode: "8900000000011" },
      { ...body, code: "IMP-2", name: "New product", openingStock: 6 },
    ];
    const dry = (await (
      await request("/admin/products/import", { rows, dryRun: true }, "POST")
    ).json()) as Record<string, number>;
    expect(dry).toMatchObject({ created: 1, updated: 1, unchanged: 0 });
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS n FROM products").first(
        "n",
      ),
    ).toBe(1);
    expect(
      (await request("/admin/products/import", { rows, dryRun: false }, "POST"))
        .status,
    ).toBe(200);
    expect(
      await bindings.DB.prepare(
        "SELECT stock FROM products WHERE code='IMP-2'",
      ).first("stock"),
    ).toBe(6);
    const again = (await (
      await request("/admin/products/import", { rows, dryRun: true }, "POST")
    ).json()) as Record<string, number>;
    expect(again.unchanged).toBe(2);
    expect(
      (
        await request(
          "/admin/products",
          { ...body, code: "IMP-3", barcode: "8900000000011" },
          "POST",
        )
      ).status,
    ).toBe(409);
  });
});

describe("search engine rendering", () => {
  const page = (path: string) => SELF.fetch(`${base}${path}`);
  it("serves the privacy policy and terms, listed in the sitemap", async () => {
    const privacy = await page("/privacy");
    expect(privacy.status).toBe(200);
    const p = await privacy.text();
    expect(p).toContain("<h1>Privacy policy</h1>");
    expect(p).toContain("Digital Personal Data Protection Act, 2023");
    const terms = await (await page("/terms")).text();
    expect(terms).toContain("<h1>Terms of use</h1>");
    expect(terms).toContain("created or enhanced with AI tools");
    const map = await (await page("/sitemap.xml")).text();
    expect(map).toContain("/privacy</loc>");
    expect(map).toContain("/terms</loc>");
  });
  it("renders the home page with metadata, structured business data and content", async () => {
    await create({
      published: true,
      category: "Showers",
      code: "S-1",
      name: "Rain shower",
    });
    const r = await page("/");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(
      "<title>Lenore — Bath Fittings &amp; Sanitary Ware in Kuttiady, Kozhikode</title>",
    );
    expect(html).toContain('<link rel="canonical" href="https://lenore.test/"');
    expect(html).toContain('"taxID":"32AANFL0054E1ZR"');
    expect(html).toContain('"addressLocality":"Kuttiady"');
    expect(html).toContain("Your bathroom, <span>considered.</span>");
    expect(html).toContain('id="page-data"');
    expect(r.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
  it("lists public products in the sitemap and hides them when the website hides products", async () => {
    const p = await create({
      published: true,
      name: "Rain shower",
      code: "S-1",
    });
    let xml = await (await page("/sitemap.xml")).text();
    expect(xml).toContain(`/products/${p.slug}`);
    expect(xml).toContain("/collections/basin-mixers");
    const product = await page(`/products/${p.slug}`);
    expect(product.status).toBe(200);
    const html = await product.text();
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('"price":"1500.00"');
    await bindings.DB.prepare(
      "UPDATE website_settings SET show_products=0 WHERE id=1",
    ).run();
    xml = await (await page("/sitemap.xml")).text();
    expect(xml).not.toContain("/products/");
    expect((await page(`/products/${p.slug}`)).status).toBe(404);
  });
  it("keeps private surfaces out of search and returns real 404s", async () => {
    const robots = await (await page("/robots.txt")).text();
    expect(robots).toContain("Disallow: /manage");
    expect(robots).toContain("Sitemap: https://lenore.test/sitemap.xml");
    const shell = await page("/catalogue/quote");
    expect(shell.status).toBe(200);
    expect(shell.headers.get("x-robots-tag")).toContain("noindex");
    expect(await shell.text()).toContain('rel="manifest"');
    const missing = await page("/no-such-page");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("noindex");
  });
});

describe("ERP and POS", () => {
  const device = "test-counter-01";
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  async function stocked(
    overrides: Partial<typeof body> & { gstRateBp?: number } = {},
    qty = 10,
  ) {
    const p = await create({
      published: true,
      pricePaise: 118000,
      ...overrides,
      gstRateBp: overrides.gstRateBp ?? 1800,
    } as Partial<typeof body>);
    await adjust(p, qty);
    return p;
  }
  async function block() {
    const r = await request("/pos/numbers", { deviceId: device }, "POST");
    expect(r.status).toBe(200);
    return (await r.json()) as { fy: string; first: number; last: number };
  }
  const bill = (
    b: { fy: string; first: number },
    seqOffset: number,
    lines: {
      productId: string;
      qty: number;
      rate: number;
      discount?: number;
    }[],
    extra: Record<string, unknown> = {},
  ) => ({
    id: crypto.randomUUID(),
    deviceId: device,
    seq: b.first + seqOffset,
    fy: b.fy,
    date: today,
    shiftId: null,
    customerId: null,
    walkIn: { name: "", phone: "" },
    quotationId: null,
    lines: lines.map((l) => ({ discount: 0, ...l })),
    payments: [],
    notes: "",
    offline: false,
    ...extra,
  });
  it("bills with GST split, reserved numbers, stock posting and finance records; retries are safe", async () => {
    const p = await stocked();
    const b = await block();
    const payload = bill(b, 0, [{ productId: p.id, qty: 2, rate: 118000 }], {
      payments: [
        {
          id: crypto.randomUUID(),
          method: "cash",
          amount: 236000,
          reference: "",
        },
      ],
    });
    const r = await request("/pos/invoices", payload, "POST");
    expect(r.status).toBe(201);
    const { invoice } = (await r.json()) as {
      invoice: {
        number: string;
        taxable: number;
        cgst: number;
        sgst: number;
        total: number;
        paid: number;
      };
    };
    expect(invoice.number).toBe(
      `LT/${b.fy}/${String(b.first).padStart(4, "0")}`,
    );
    expect(invoice).toMatchObject({
      taxable: 200000,
      cgst: 18000,
      sgst: 18000,
      total: 236000,
      paid: 236000,
    });
    expect((await request("/pos/invoices", payload, "POST")).status).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(8);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM finance_documents WHERE id=?",
      )
        .bind(payload.id)
        .first("n"),
    ).toBe(1);
    // Unreserved number, credit without a customer, price above MRP.
    expect(
      (
        await request(
          "/pos/invoices",
          {
            ...bill(b, 0, [{ productId: p.id, qty: 1, rate: 118000 }]),
            seq: b.last + 500,
          },
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/pos/invoices",
          bill(b, 1, [{ productId: p.id, qty: 1, rate: 118000 }]),
          "POST",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/pos/invoices",
          bill(b, 1, [{ productId: p.id, qty: 1, rate: 120000 }], {
            payments: [
              {
                id: crypto.randomUUID(),
                method: "upi",
                amount: 120000,
                reference: "",
              },
            ],
          }),
          "POST",
        )
      ).status,
    ).toBe(400);
  });
  it("records offline sales beyond stock with a shortfall flag instead of losing them", async () => {
    const p = await stocked({ code: "OFF-1" }, 1);
    const b = await block();
    const r = await request(
      "/pos/invoices",
      bill(b, 0, [{ productId: p.id, qty: 3, rate: 118000 }], {
        offline: true,
        payments: [
          {
            id: crypto.randomUUID(),
            method: "cash",
            amount: 354000,
            reference: "",
          },
        ],
      }),
      "POST",
    );
    expect(r.status).toBe(201);
    const { invoice } = (await r.json()) as {
      invoice: { shortfall: boolean; lines: { unpostedQty: number }[] };
    };
    expect(invoice.shortfall).toBe(true);
    expect(invoice.lines[0].unpostedQty).toBe(2);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(0);
  });
  it("returns partially then fully, restocking and refunding without exceeding the invoice", async () => {
    const p = await stocked({ code: "RET-1" });
    const b = await block();
    const sale = bill(b, 0, [{ productId: p.id, qty: 3, rate: 33333 }], {
      payments: [
        {
          id: crypto.randomUUID(),
          method: "cash",
          amount: 100000,
          reference: "",
        },
      ],
    });
    const { invoice } = (await (
      await request("/pos/invoices", sale, "POST")
    ).json()) as { invoice: { id: string; total: number } };
    const note = (qty: number) => ({
      id: crypto.randomUUID(),
      reason: "Customer return",
      restock: true,
      lines: [{ lineNo: 1, qty }],
      refundMethod: "cash",
      refundReference: "",
      shiftId: null,
    });
    const first = await request(
      `/pos/invoices/${invoice.id}/credit-notes`,
      note(1),
      "POST",
    );
    expect(first.status).toBe(201);
    expect((await first.json()) as { refunded: number }).toMatchObject({
      refunded: 33333,
    });
    expect(
      (
        await request(
          `/pos/invoices/${invoice.id}/credit-notes`,
          note(5),
          "POST",
        )
      ).status,
    ).toBe(400);
    const last = (await (
      await request(`/pos/invoices/${invoice.id}/credit-notes`, note(2), "POST")
    ).json()) as {
      invoice: { status: string; credited: number; refunded: number };
    };
    expect(last.invoice).toMatchObject({
      status: "cancelled",
      credited: invoice.total,
      refunded: 100000,
    });
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(10);
  });
  it("posts purchases with moving average cost, supplier returns and expense reversals", async () => {
    const p = await stocked({ code: "PUR-1" }, 0);
    await bindings.DB.prepare("UPDATE products SET cost_paise=NULL WHERE id=?")
      .bind(p.id)
      .run();
    const sup = (await (
      await request(
        "/admin/erp/suppliers",
        {
          name: "Fittings Co",
          phone: "",
          gstin: "",
          stateCode: "32",
          address: "",
          notes: "",
        },
        "POST",
      )
    ).json()) as { id: string };
    const purchase = (id: string, bill: string, qty: number, cost: number) => ({
      id,
      supplierId: sup.id,
      billNumber: bill,
      date: today,
      lines: [{ productId: p.id, qty, costPaise: cost, gstRateBp: 1800 }],
      notes: "",
      payment: null,
    });
    const firstId = crypto.randomUUID();
    expect(
      (
        await request(
          "/admin/erp/purchases",
          purchase(firstId, "B-1", 10, 50000),
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          "/admin/erp/purchases",
          purchase(crypto.randomUUID(), "B-1", 1, 1),
          "POST",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/admin/erp/purchases",
          purchase(crypto.randomUUID(), "B-2", 10, 70000),
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(
      await bindings.DB.prepare("SELECT cost_paise FROM products WHERE id=?")
        .bind(p.id)
        .first("cost_paise"),
    ).toBe(60000);
    const ret = await request(
      `/admin/erp/purchases/${firstId}/returns`,
      {
        id: crypto.randomUUID(),
        date: today,
        reason: "Damaged in transit",
        lines: [{ productId: p.id, qty: 2 }],
        refundMethod: null,
        refundReference: "",
      },
      "POST",
    );
    expect(ret.status).toBe(201);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(18);
    const exp = {
      id: crypto.randomUUID(),
      date: today,
      category: "Transport and freight",
      payee: "Lorry",
      description: "",
      billNumber: "",
      gstin: "",
      amount: 150000,
      gst: 0,
      method: "cash",
      reference: "",
      shiftId: null,
    };
    expect((await request("/admin/erp/expenses", exp, "POST")).status).toBe(
      201,
    );
    const reversed = (await (
      await request(
        `/admin/erp/expenses/${exp.id}/reverse`,
        { reason: "Entered twice" },
        "POST",
      )
    ).json()) as { status: string };
    expect(reversed.status).toBe("reversed");
  });
  it("balances a cash shift from opening float, sales, cash out and drawer expenses", async () => {
    const p = await stocked({ code: "SHF-1" });
    const shiftId = crypto.randomUUID();
    expect(
      (
        await request(
          "/pos/shifts",
          { id: shiftId, deviceId: device, openingFloat: 200000 },
          "POST",
        )
      ).status,
    ).toBe(201);
    const b = await block();
    await request(
      "/pos/invoices",
      bill(b, 0, [{ productId: p.id, qty: 1, rate: 118000 }], {
        shiftId,
        payments: [
          {
            id: crypto.randomUUID(),
            method: "cash",
            amount: 118000,
            reference: "",
          },
        ],
      }),
      "POST",
    );
    await request(
      `/pos/shifts/${shiftId}/cash`,
      {
        id: crypto.randomUUID(),
        kind: "out",
        amount: 50000,
        reason: "Bank deposit",
      },
      "POST",
    );
    await request(
      "/pos/expenses",
      {
        id: crypto.randomUUID(),
        date: today,
        category: "Staff welfare and food",
        payee: "Tea",
        description: "",
        billNumber: "",
        gstin: "",
        amount: 8000,
        gst: 0,
        method: "cash",
        reference: "",
        shiftId,
      },
      "POST",
    );
    const closed = (await (
      await request(
        `/pos/shifts/${shiftId}/close`,
        { countedCash: 260000, notes: "" },
        "POST",
      )
    ).json()) as { expectedCash: number; status: string };
    expect(closed).toMatchObject({
      status: "closed",
      expectedCash: 200000 + 118000 - 50000 - 8000,
    });
  });
  it("applies a customer's price list to admin quotations and bills", async () => {
    const special = await stocked({ code: "PL-1", pricePaise: 100000 });
    const other = await stocked({ code: "PL-2", pricePaise: 50000 });
    const listId = crypto.randomUUID();
    const customerId = crypto.randomUUID();
    await bindings.DB.batch([
      bindings.DB.prepare(
        "INSERT INTO price_lists(id,name,discount_bp) VALUES(?,?,1000)",
      ).bind(listId, `Dealer ${listId.slice(0, 6)}`),
      bindings.DB.prepare(
        "INSERT INTO price_list_items(price_list_id,product_id,price_paise) VALUES(?,?,80000)",
      ).bind(listId, special.id),
      bindings.DB.prepare(
        "INSERT INTO customers(id,name,phone,price_list_id) VALUES(?,'Dealer Co','9847011111',?)",
      ).bind(customerId, listId),
    ]);
    const body = {
      ...quoteBody([
        { productId: special.id, quantity: 2 },
        { productId: other.id, quantity: 1 },
      ]),
      customerId,
    };
    // Salespeople cannot search or link saved customers.
    const sales = await member();
    const call = as(sales.cookie);
    expect((await call(`/quotation-customers/${customerId}`)).status).toBe(403);
    expect((await call("/quotation-customers?q=Dealer")).status).toBe(403);
    expect((await call("/quotations", body, "POST")).status).toBe(409);
    // Admins get the dealer's list prices on untouched lines.
    const picked = (await (
      await request(`/quotation-customers/${customerId}`)
    ).json()) as QuoteCustomer;
    expect(picked.priceList).toMatchObject({
      discountBp: 1000,
      prices: { [special.id]: 80000 },
    });
    const created = await request("/quotations", body, "POST");
    expect(created.status).toBe(201);
    const q = (await created.json()) as Quotation;
    expect(q.customerId).toBe(customerId);
    expect(q.items.map((i) => i.unitPricePaise)).toEqual([80000, 45000]);
    expect(q.items.map((i) => i.discountBp)).toEqual([2000, 1000]);
    expect(q.totalPaise).toBe(205000);
    expect(
      (
        await request(
          "/quotations",
          {
            ...quoteBody([{ productId: other.id, quantity: 1 }]),
            customerId: crypto.randomUUID(),
          },
          "POST",
        )
      ).status,
    ).toBe(409);
    // The counter loads the quotation with its customer.
    const loaded = (await (
      await request(`/pos/quotation?number=${q.number}`)
    ).json()) as { customer: { id: string; priceListId: string } | null };
    expect(loaded.customer).toMatchObject({
      id: customerId,
      priceListId: listId,
    });
    // A non-admin cashier may bill at the list price but not below it.
    await bindings.DB.prepare("UPDATE staff_users SET pos_access=1 WHERE id=?")
      .bind(sales.id)
      .run();
    const b = await block();
    const at = (seq: number, rate: number) =>
      as(sales.cookie)(
        "/pos/invoices",
        bill(
          b,
          seq,
          [
            {
              productId: special.id,
              qty: 1,
              rate: 100000,
              discount: 100000 - rate,
            },
          ],
          {
            customerId,
            quotationId: q.id,
            payments: [
              {
                id: crypto.randomUUID(),
                method: "cash",
                amount: rate,
                reference: "",
              },
            ],
          },
        ),
        "POST",
      );
    expect((await at(0, 79000)).status).toBe(403);
    expect((await at(1, 80000)).status).toBe(201);
  });
  it("keeps stock equal to its ledger through purchases, sales, returns, counts and simultaneous bills", async () => {
    const p = await stocked({ code: "LIFE-1", pricePaise: 10000 }, 0);
    const stockNow = async () =>
      (await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock")) as number;
    const sup = (await (
      await request(
        "/admin/erp/suppliers",
        {
          name: "Ledger Co",
          phone: "",
          gstin: "",
          stateCode: "32",
          address: "",
          notes: "",
        },
        "POST",
      )
    ).json()) as { id: string };
    const purchaseId = crypto.randomUUID();
    expect(
      (
        await request(
          "/admin/erp/purchases",
          {
            id: purchaseId,
            supplierId: sup.id,
            billNumber: "LIFE-B1",
            date: today,
            lines: [
              { productId: p.id, qty: 20, costPaise: 5000, gstRateBp: 1800 },
            ],
            notes: "",
            payment: null,
          },
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(await stockNow()).toBe(20);
    const b = await block();
    const sale = (seq: number, qty: number) =>
      bill(b, seq, [{ productId: p.id, qty, rate: 10000 }], {
        payments: [
          {
            id: crypto.randomUUID(),
            method: "cash",
            amount: qty * 10000,
            reference: "",
          },
        ],
      });
    const first = (await (
      await request("/pos/invoices", sale(0, 3), "POST")
    ).json()) as { invoice: { id: string } };
    expect(await stockNow()).toBe(17);
    // Customer returns 2: one back on the shelf, one damaged.
    for (const restock of [true, false])
      expect(
        (
          await request(
            `/pos/invoices/${first.invoice.id}/credit-notes`,
            {
              id: crypto.randomUUID(),
              reason: "Customer return",
              restock,
              lines: [{ lineNo: 1, qty: 1 }],
              refundMethod: "cash",
              refundReference: "",
              shiftId: null,
            },
            "POST",
          )
        ).status,
      ).toBe(201);
    expect(await stockNow()).toBe(18);
    // Two goes back to the supplier.
    expect(
      (
        await request(
          `/admin/erp/purchases/${purchaseId}/returns`,
          {
            id: crypto.randomUUID(),
            date: today,
            reason: "Wrong finish",
            lines: [{ productId: p.id, qty: 2 }],
            refundMethod: null,
            refundReference: "",
          },
          "POST",
        )
      ).status,
    ).toBe(201);
    expect(await stockNow()).toBe(16);
    // Five counters bill 4 each at the same moment: 16 posted, never negative.
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((seq) =>
        request("/pos/invoices", sale(seq, 4), "POST"),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await stockNow()).toBe(0);
    const unposted = await bindings.DB.prepare(
      "SELECT SUM(l.unposted_qty) AS n FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.product_id=? AND i.shortfall=1",
    )
      .bind(p.id)
      .first("n");
    expect(unposted).toBe(4);
    // A shelf count corrects it; the ledger still adds up exactly.
    const { revision } = (await bindings.DB.prepare(
      "SELECT revision FROM products WHERE id=?",
    )
      .bind(p.id)
      .first()) as { revision: number };
    expect(
      (
        await request(
          "/admin/stock-count",
          {
            operationId: crypto.randomUUID(),
            reason: "Shelf count",
            lines: [{ productId: p.id, revision, counted: 3 }],
          },
          "POST",
        )
      ).status,
    ).toBe(200);
    expect(await stockNow()).toBe(3);
    const ledger = (
      await bindings.DB.prepare(
        "SELECT delta,previous_stock,new_stock FROM stock_movements WHERE product_id=? ORDER BY rowid",
      )
        .bind(p.id)
        .all<{ delta: number; previous_stock: number; new_stock: number }>()
    ).results;
    expect(ledger.reduce((n, m) => n + m.delta, 0)).toBe(3);
    // Each movement starts where the previous one ended: no gaps or lost updates.
    ledger.forEach((m, i) =>
      expect(m.previous_stock).toBe(i ? ledger[i - 1].new_stock : 0),
    );
    // The counter's refresh sees the same figure.
    const live = (await (await request("/pos/stock")).json()) as {
      id: string;
      stock: number;
    }[];
    expect(live.find((r) => r.id === p.id)?.stock).toBe(3);
  });
});

describe("UPI and bank details", () => {
  it("builds a scannable UPI link for an exact amount", () => {
    expect(
      upiLink(
        { upiId: "lenore@okhdfcbank", upiName: "Lenore Trading LLP" },
        485000,
        "LT/26-27/0007",
      ),
    ).toBe(
      "upi://pay?pa=lenore@okhdfcbank&pn=Lenore%20Trading%20LLP&am=4850.00&cu=INR&tn=LT%2F26-27%2F0007",
    );
    expect(upiLink({ upiId: "", upiName: "" }, 100)).toBeNull();
  });
  it("saves payment details, validates them and sends them to the counter", async () => {
    const s = (await (await request("/admin/erp/settings")).json()) as {
      revision: number;
      invoicePrefix: string;
      stateCode: string;
      receiptFooter: string;
      blockSize: number;
    };
    const payment = {
      upiId: "lenore@okhdfcbank",
      upiName: "Lenore Trading LLP",
      bankAccountName: "Lenore Trading LLP",
      bankName: "Sample Bank",
      bankAccount: "123456789012",
      bankIfsc: "sbin0001234",
      bankBranch: "Kuttiady",
      qrOnBills: "due",
      bankOnInvoice: true,
    };
    const base = {
      invoicePrefix: s.invoicePrefix,
      stateCode: s.stateCode,
      receiptFooter: s.receiptFooter,
      blockSize: s.blockSize,
      revision: s.revision,
    };
    expect(
      (
        await request(
          "/admin/erp/settings",
          { ...base, payment: { ...payment, upiId: "not a upi id" } },
          "PUT",
        )
      ).status,
    ).toBe(400);
    const saved = await request(
      "/admin/erp/settings",
      { ...base, payment },
      "PUT",
    );
    expect(saved.status).toBe(200);
    expect(
      ((await saved.json()) as { payment: { bankIfsc: string } }).payment
        .bankIfsc,
    ).toBe("SBIN0001234");
    const boot = (await (
      await request(`/pos/bootstrap?device=${crypto.randomUUID()}`)
    ).json()) as {
      settings: { payment: { upiId: string } };
    };
    expect(boot.settings.payment.upiId).toBe("lenore@okhdfcbank");
  });
});

describe("audit hardening", () => {
  it("reports health with a database round trip", async () => {
    const r = await SELF.fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, db: "ok" });
  });
  it("removes expired sessions and rate-limit rows on the scheduled cleanup", async () => {
    await bindings.DB.batch([
      bindings.DB.prepare(
        "INSERT INTO sessions(token_hash,expires_at) VALUES('expired',1)",
      ),
      bindings.DB.prepare(
        "INSERT INTO rate_limits(key,attempts,expires_at) VALUES('old',3,1)",
      ),
    ]);
    await cleanup(bindings);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM sessions WHERE token_hash='expired'",
      ).first("n"),
    ).toBe(0);
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS n FROM rate_limits WHERE key='old'",
      ).first("n"),
    ).toBe(0);
    // The live test session survives.
    expect((await request("/admin/products")).status).toBe(200);
  });
  it("numbers credit notes consecutively without gaps", async () => {
    const p = await create({
      code: "CN-SEQ",
      published: true,
      pricePaise: 10000,
    } as Partial<typeof body>);
    await bindings.DB.prepare("UPDATE products SET gst_rate_bp=1800 WHERE id=?")
      .bind(p.id)
      .run();
    await adjust({ ...p, revision: 1 }, 10);
    const b = (await (
      await request("/pos/numbers", { deviceId: "seq-counter-1" }, "POST")
    ).json()) as { fy: string; first: number };
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const sale = {
      id: crypto.randomUUID(),
      deviceId: "seq-counter-1",
      seq: b.first,
      fy: b.fy,
      date: today,
      shiftId: null,
      customerId: null,
      walkIn: { name: "", phone: "" },
      quotationId: null,
      lines: [{ productId: p.id, qty: 3, rate: 10000, discount: 0 }],
      payments: [
        {
          id: crypto.randomUUID(),
          method: "cash",
          amount: 30000,
          reference: "",
        },
      ],
      notes: "",
      offline: false,
    };
    const { invoice } = (await (
      await request("/pos/invoices", sale, "POST")
    ).json()) as { invoice: { id: string } };
    const note = () => ({
      id: crypto.randomUUID(),
      reason: "Return",
      restock: true,
      lines: [{ lineNo: 1, qty: 1 }],
      refundMethod: "cash",
      refundReference: "",
      shiftId: null,
    });
    // A rejected return (too many units) must not consume a number.
    expect(
      (
        await request(
          `/pos/invoices/${invoice.id}/credit-notes`,
          { ...note(), lines: [{ lineNo: 1, qty: 9 }] },
          "POST",
        )
      ).status,
    ).toBe(400);
    const a = (await (
      await request(`/pos/invoices/${invoice.id}/credit-notes`, note(), "POST")
    ).json()) as { number: string };
    const c = (await (
      await request(`/pos/invoices/${invoice.id}/credit-notes`, note(), "POST")
    ).json()) as { number: string };
    expect(Number(c.number.slice(-4)) - Number(a.number.slice(-4))).toBe(1);
  });
});

describe("role access matrix", () => {
  // Every role against every guarded surface. Bodies are deliberately empty:
  // the role guard must answer before validation does, so an allowed role
  // gets 400 (bad input) or 2xx/404, and a refused one 401/403.
  const X = "00000000-0000-4000-8000-000000000000";
  const admin: [string, string][] = [
    ["GET", "/admin/products"],
    ["GET", `/admin/products/${X}/movements`],
    ["POST", "/admin/products"],
    ["PUT", `/admin/products/${X}`],
    ["POST", `/admin/products/${X}/stock`],
    ["POST", "/admin/products/import"],
    ["POST", "/admin/stock-count"],
    ["POST", "/admin/media/by-code?code=X"],
    ["GET", "/admin/quotes"],
    ["GET", "/admin/quotations"],
    ["GET", "/admin/activity"],
    ["GET", "/admin/analytics"],
    ["PUT", "/admin/settings"],
    ["GET", "/admin/catalogue-access"],
    ["PUT", "/admin/catalogue-access"],
    ["POST", "/admin/catalogue-access/revoke"],
    ["GET", "/admin/team"],
    ["POST", "/admin/team"],
    ["PUT", `/admin/team/${X}`],
    ["POST", `/admin/team/${X}/sign-out`],
    ["GET", "/admin/website"],
    ["PUT", "/admin/website/settings"],
    ["GET", "/admin/erp/invoices"],
    ["GET", "/admin/erp/customers"],
    ["POST", "/admin/erp/customers"],
    ["GET", `/admin/erp/customers/${X}/ledger`],
    ["GET", "/admin/erp/expenses"],
    ["POST", "/admin/erp/expenses"],
    ["GET", "/admin/erp/purchases"],
    ["POST", "/admin/erp/purchases"],
    ["GET", "/admin/erp/suppliers"],
    ["GET", "/admin/erp/reports"],
    ["GET", "/admin/erp/settings"],
    ["PUT", "/admin/erp/settings"],
    ["GET", "/admin/erp/shifts"],
    ["GET", "/admin/erp/price-lists"],
    ["GET", "/admin/finance/summary"],
    ["GET", "/admin/reports/business?from=2026-10-01&to=2026-10-31"],
    ["POST", "/admin/reports/archive"],
    ["GET", "/admin/reports/archive"],
    ["PUT", `/admin/reports/archive/${X}/pdf`],
    ["GET", `/admin/reports/archive/${X}/pdf`],
  ];
  const pos: [string, string][] = [
    ["GET", "/pos/bootstrap?device=device-0001"],
    ["POST", "/pos/numbers"],
    ["GET", "/pos/customers"],
    ["GET", "/pos/stock"],
    ["POST", "/pos/customers"],
    ["GET", "/pos/invoices"],
    ["POST", "/pos/invoices"],
    ["GET", `/pos/invoices/${X}`],
    ["POST", `/pos/invoices/${X}/credit-notes`],
    ["POST", `/pos/invoices/${X}/payments`],
    ["POST", "/pos/shifts"],
    ["GET", `/pos/shifts/${X}`],
    ["POST", `/pos/shifts/${X}/cash`],
    ["POST", `/pos/shifts/${X}/close`],
    ["POST", "/pos/expenses"],
  ];
  async function sessionFor(role: "owner" | "admin" | "sales" | "cashier") {
    const t = crypto.randomUUID();
    let userId: string | null = null;
    if (role !== "owner") {
      userId = crypto.randomUUID();
      await bindings.DB.prepare(
        "INSERT INTO staff_users(id,name,phone,password_hash,role,pos_access) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          userId,
          role,
          `9${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0"),
          "pbkdf2$x$y",
          role === "admin" ? "admin" : "sales",
          role === "cashier" ? 1 : 0,
        )
        .run();
    }
    await bindings.DB.prepare(
      "INSERT INTO sessions(token_hash,expires_at,user_id,role) VALUES(?,?,?,?)",
    )
      .bind(
        await sha256(t),
        Date.now() + 60000,
        userId,
        role === "cashier" ? "sales" : role,
      )
      .run();
    return t;
  }
  async function hit(t: string | null, method: string, path: string) {
    const r = await SELF.fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: base,
        ...(t ? { Cookie: `lenore_session=${t}` } : {}),
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      body: method === "GET" ? undefined : "{}",
    });
    await r.body?.cancel();
    return r.status;
  }
  const refused = (s: number) => s === 401 || s === 403;

  it("admin routes: owner and admin only", async () => {
    const tokens = {
      anon: null,
      sales: await sessionFor("sales"),
      cashier: await sessionFor("cashier"),
      admin: await sessionFor("admin"),
      owner: await sessionFor("owner"),
    };
    for (const [method, path] of admin) {
      expect(await hit(tokens.anon, method, path), `${method} ${path}`).toBe(
        401,
      );
      for (const r of ["sales", "cashier"] as const)
        expect(await hit(tokens[r], method, path), `${r} ${path}`).toBe(403);
      for (const r of ["admin", "owner"] as const) {
        const s = await hit(tokens[r], method, path);
        expect(refused(s), `${r} ${method} ${path} → ${s}`).toBe(false);
        expect(s, `${r} ${method} ${path}`).toBeLessThan(500);
      }
    }
  });
  it("billing routes: cashier, admin and owner; never plain sales", async () => {
    const tokens = {
      sales: await sessionFor("sales"),
      cashier: await sessionFor("cashier"),
      admin: await sessionFor("admin"),
      owner: await sessionFor("owner"),
    };
    for (const [method, path] of pos) {
      expect(await hit(null, method, path), `anon ${path}`).toBe(401);
      expect(await hit(tokens.sales, method, path), `sales ${path}`).toBe(403);
      for (const r of ["cashier", "admin", "owner"] as const) {
        const s = await hit(tokens[r], method, path);
        expect(refused(s), `${r} ${method} ${path} → ${s}`).toBe(false);
        expect(s, `${r} ${method} ${path}`).toBeLessThan(500);
      }
    }
  });
  it("expired sessions and deactivated staff are anonymous", async () => {
    const t = await sessionFor("admin");
    await bindings.DB.prepare("UPDATE staff_users SET active=0").run();
    expect(await hit(t, "GET", "/admin/products")).toBe(401);
    const e = crypto.randomUUID();
    await bindings.DB.prepare(
      "INSERT INTO sessions(token_hash,expires_at,role) VALUES(?,?,'owner')",
    )
      .bind(await sha256(e), Date.now() - 1)
      .run();
    expect(await hit(e, "GET", "/admin/products")).toBe(401);
  });
});

describe("invoice number gaps", () => {
  it("collapse into ranges per financial year", async () => {
    const { numberRanges } = await import("../src/erp");
    expect(
      numberRanges([
        { fy: "26-27", seq: 4 },
        { fy: "26-27", seq: 2 },
        { fy: "26-27", seq: 3 },
        { fy: "26-27", seq: 9 },
        { fy: "25-26", seq: 7 },
      ]),
    ).toEqual(["25-26/7", "26-27/2–4", "26-27/9"]);
  });
});

describe("bill arithmetic", () => {
  it("always balances across thousands of random baskets", async () => {
    const { priceBill } = await import("../src/erp");
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const supply = rand(2) ? "intra" : "inter";
      const lines = Array.from({ length: 1 + rand(8) }, (_, k) => {
        const rate = 100 + rand(5_000_000);
        const qty = 1 + rand(40);
        return {
          productId: String(k),
          qty,
          rate,
          discount: rand(3) ? 0 : rand(rate * qty),
          gstRateBp: [0, 500, 1200, 1800, 2800][rand(5)],
        };
      });
      const b = priceBill(lines, supply);
      const gross = lines.reduce((n, l) => n + l.rate * l.qty - l.discount, 0);
      // Inclusive pricing: tax never changes what the customer pays.
      expect(b.total - b.roundOff).toBe(gross);
      expect(b.taxable + b.cgst + b.sgst + b.igst + b.roundOff).toBe(b.total);
      expect(b.total % 100).toBe(0);
      expect(Math.abs(b.roundOff)).toBeLessThanOrEqual(50);
      if (supply === "inter") expect(b.cgst + b.sgst).toBe(0);
      else {
        expect(b.igst).toBe(0);
        for (const l of b.lines)
          expect(Math.abs(l.cgst - l.sgst)).toBeLessThanOrEqual(1);
      }
      for (const l of b.lines) {
        expect(l.taxable).toBeGreaterThanOrEqual(0);
        expect(l.taxable + l.cgst + l.sgst + l.igst).toBe(l.total);
      }
    }
  });
});

describe("business report", () => {
  it("compares whole months, quarters and years with the same span before", async () => {
    const { previousPeriod } = await import("../src/server/report");
    expect(previousPeriod("2026-10-01", "2026-10-31")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(previousPeriod("2026-03-01", "2026-03-31")).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(previousPeriod("2026-07-01", "2026-09-30")).toMatchObject({
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(previousPeriod("2026-04-01", "2027-03-31")).toMatchObject({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    // Any other range: the same number of days immediately before.
    expect(previousPeriod("2026-10-10", "2026-10-19")).toMatchObject({
      from: "2026-09-30",
      to: "2026-10-09",
      days: 10,
    });
  });
  it("ages receivables into the usual buckets", async () => {
    const { ageing } = await import("../src/report");
    const rows = [0, 30, 31, 61, 90, 91, 400].map((age, i) => ({
      number: String(i),
      date: "",
      customer: "",
      due: 100,
      age,
    }));
    expect(ageing(rows).map((b) => [b.bills, b.amount])).toEqual([
      [2, 200],
      [1, 100],
      [2, 200],
      [2, 200],
    ]);
  });
  it("returns report data and keeps saved reports as unchangeable records", async () => {
    const data = await request(
      "/admin/reports/business?from=2026-10-01&to=2026-10-31",
    );
    expect(data.status).toBe(200);
    const r = (await data.json()) as {
      current: { bills: number };
      previous: { from: string };
      stock: { skus: number };
    };
    expect(r.previous.from).toBe("2026-09-01");
    expect(typeof r.current.bills).toBe("number");
    const reserve = async () =>
      (await (
        await request(
          "/admin/reports/archive",
          { kind: "month", from: "2026-10-01", to: "2026-10-31" },
          "POST",
        )
      ).json()) as { id: string; reference: string };
    const first = await reserve();
    const second = await reserve();
    expect(first.reference).toMatch(/-RPT-2026-10$/);
    expect(second.reference).toBe(`${first.reference}-v2`);
    const put = (id: string, body: string) =>
      SELF.fetch(`${base}/api/admin/reports/archive/${id}/pdf`, {
        method: "PUT",
        headers: { Origin: base, Cookie: `lenore_session=${token}` },
        body,
      });
    expect((await put(first.id, "not a pdf")).status).toBe(400);
    expect((await put(first.id, "%PDF-1.7 test")).status).toBe(200);
    expect((await put(first.id, "%PDF-1.7 changed")).status).toBe(409);
    const list = (await (await request("/admin/reports/archive")).json()) as {
      id: string;
    }[];
    expect(list.map((x) => x.id)).toContain(first.id);
    expect(list.map((x) => x.id)).not.toContain(second.id);
    const pdf = await request(`/admin/reports/archive/${first.id}/pdf`);
    expect(await pdf.text()).toBe("%PDF-1.7 test");
  });
});
