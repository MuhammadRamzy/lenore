import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Bindings } from "../src/server";
import type { Product, CatalogueProduct } from "../src/shared";
import { sha256 } from "../src/server/auth";
import { quotationText, quotationTotal } from "../src/client/quotation";
import { inventoryCsv } from "../src/client/export";
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
      "sessions",
      "rate_limits",
    ].map((t) => bindings.DB.prepare(`DELETE FROM ${t}`)),
  );
  token = crypto.randomUUID();
  await bindings.DB.prepare("INSERT INTO sessions VALUES(?,?)")
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
      (await request("/session", { password: "wrong" }, "POST", false)).status,
    ).toBe(401);
    const response = await request(
      "/session",
      { password: "test-password-only" },
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
  it("throttles repeated failed logins", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await request("/session", { password: "wrong" }, "POST", false))
          .status,
      ).toBe(401);
    expect(
      (await request("/session", { password: "wrong" }, "POST", false)).status,
    ).toBe(429);
  });
  it("resets failed-attempt history after successful sign-in without disabling failure throttling", async () => {
    for (let i = 0; i < 9; i++)
      expect(
        (await request("/session", { password: "wrong" }, "POST", false))
          .status,
      ).toBe(401);
    expect(
      (
        await request(
          "/session",
          { password: "test-password-only" },
          "POST",
          false,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/session", { password: "wrong" }, "POST", false)).status,
    ).toBe(401);
    expect(
      await bindings.DB.prepare("SELECT attempts FROM rate_limits").first(
        "attempts",
      ),
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
        "INSERT INTO stock_movements VALUES(?,?,?,1,0,1,1,'stale','owner','2026-10-19')",
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

describe("enquiries", () => {
  it("snapshots current products, remains idempotent and never reserves stock", async () => {
    const p = await create({ published: true });
    await adjust(p, 10);
    const data = {
      id: crypto.randomUUID(),
      name: "Test buyer",
      phone: "+91 99999 99999",
      notes: "Fixture",
      items: [{ productId: p.id, quantity: 3 }],
    };
    expect((await request("/quotes", data, "POST", false)).status).toBe(201);
    expect((await request("/quotes", data, "POST", false)).status).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS n FROM quotes").first("n"),
    ).toBe(1);
    expect(
      await bindings.DB.prepare("SELECT stock FROM products WHERE id=?")
        .bind(p.id)
        .first("stock"),
    ).toBe(10);
    const stored = await bindings.DB.prepare(
      "SELECT items_json FROM quotes",
    ).first<string>("items_json");
    expect(JSON.parse(stored!)[0]).toMatchObject({
      name: body.name,
      pricePaise: 150000,
      quantity: 3,
    });
  });
  it("rejects drafts and changed idempotency payloads", async () => {
    const p = await create();
    const data = {
      id: crypto.randomUUID(),
      name: "Test buyer",
      phone: "9999999999",
      notes: "",
      items: [{ productId: p.id, quantity: 1 }],
    };
    expect((await request("/quotes", data, "POST", false)).status).toBe(409);
    await request(
      `/admin/products/${p.id}`,
      { ...body, published: true, revision: p.revision },
      "PUT",
    );
    expect((await request("/quotes", data, "POST", false)).status).toBe(201);
    expect(
      (await request("/quotes", { ...data, notes: "Changed" }, "POST", false))
        .status,
    ).toBe(409);
  });
  it("keeps customer details private and validates follow-up status", async () => {
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

describe("quotation amounts and content", () => {
  const item = {
    productId: "11111111-1111-4111-8111-111111111111",
    code: "L-01",
    name: "Basin mixer",
    pricePaise: 125050,
    quantity: 3,
  };
  it("calculates amounts in integer paise and includes all customer details", () => {
    expect(quotationTotal([item])).toBe(375150);
    const text = quotationText({
      reference: "Q-TEST",
      customer: { name: "Buyer", phone: "919999999999", notes: "Fixture" },
      items: [item],
    });
    for (const value of [
      "Q-TEST",
      "Buyer",
      "919999999999",
      "Fixture",
      "L-01",
      "Basin mixer",
      "Suggested MRP",
      "3,751.50",
    ])
      expect(text).toContain(value);
  });
  it("does not fabricate a total for unknown MRPs or overflow a safe integer", () => {
    expect(quotationTotal([{ ...item, pricePaise: null }])).toBeNull();
    expect(() =>
      quotationTotal(
        Array.from({ length: 100 }, () => ({
          ...item,
          pricePaise: 10000000000,
          quantity: 99999,
        })),
      ),
    ).toThrow("too large");
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
