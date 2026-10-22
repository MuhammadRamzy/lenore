import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./access";
import { actorName } from "./products";
import { financialYear } from "../erp";
import type { BusinessReport, ReportMetrics } from "../report";

const routes = new Hono<AppEnv>();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = (v: unknown) => Number(v ?? 0);

/**
 * The period to compare with: whole calendar months (a month, quarter or
 * financial year) compare with the same number of months before; any other
 * range with the same number of days immediately before.
 */
export function previousPeriod(from: string, to: string) {
  const ms = 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((b - a) / ms) + 1;
  const end = new Date(b + ms);
  if (from.endsWith("-01") && end.getUTCDate() === 1) {
    const months =
      (end.getUTCFullYear() - Number(from.slice(0, 4))) * 12 +
      end.getUTCMonth() -
      (Number(from.slice(5, 7)) - 1);
    const start = new Date(a);
    start.setUTCMonth(start.getUTCMonth() - months);
    return { from: iso(start.getTime()), to: iso(a - ms), days };
  }
  return { from: iso(a - days * ms), to: iso(a - ms), days };
}

/** Headline figures for one period; run for the report period and the one before. */
async function metrics(
  db: D1Database,
  from: string,
  to: string,
): Promise<ReportMetrics> {
  const [inv, lines, cn, pay, pur, exp, quotes, shifts] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS gross, COALESCE(SUM(taxable),0) AS taxable,
        COALESCE(SUM(cgst+sgst+igst),0) AS tax, COALESCE(SUM(round_off),0) AS roundOff,
        COUNT(DISTINCT customer_id) AS customers, SUM(customer_id IS NULL) AS walkIn,
        SUM(json_extract(customer_json,'$.gstin')<>'') AS b2bBills,
        COALESCE(SUM(CASE WHEN json_extract(customer_json,'$.gstin')<>'' THEN total END),0) AS b2bValue,
        SUM(offline) AS offline FROM invoices WHERE date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COALESCE(SUM(l.qty),0) AS units, COALESCE(SUM(l.discount),0) AS discount,
        COALESCE(SUM(CASE WHEN l.mrp IS NOT NULL THEN l.mrp*l.qty END),0) AS mrpValue,
        COALESCE(SUM(CASE WHEN l.mrp IS NOT NULL THEN l.total END),0) AS mrpBilled,
        COALESCE(SUM(CASE WHEN l.cost_paise IS NOT NULL THEN (l.qty-l.returned_qty)*l.cost_paise END),0) AS cost,
        COALESCE(SUM(CASE WHEN l.cost_paise IS NOT NULL THEN l.taxable-l.returned_taxable END),0) AS costedTaxable,
        COALESCE(SUM(l.taxable-l.returned_taxable),0) AS netTaxableLines
        FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(taxable),0) AS taxable,
        COALESCE(SUM(cgst+sgst+igst),0) AS tax FROM credit_notes WHERE date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN kind<>'refund' THEN amount END),0) AS received,
        COALESCE(SUM(CASE WHEN kind='refund' THEN amount END),0) AS refunded FROM payments WHERE date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(cgst+sgst+igst),0) AS tax
        FROM purchases WHERE date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS total, COALESCE(SUM(gst),0) AS tax
        FROM expenses WHERE status='recorded' AND date BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS value, SUM(status='won') AS won,
        COALESCE(SUM(CASE WHEN status='won' THEN total_paise END),0) AS wonValue
        FROM quotations WHERE substr(created_at,1,10) BETWEEN ? AND ?`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(counted_cash-expected_cash),0) AS variance,
        SUM(counted_cash<>expected_cash) AS mismatched FROM shifts
        WHERE status='closed' AND substr(closed_at,1,10) BETWEEN ? AND ?`,
      )
      .bind(from, to),
  ]);
  const i = inv.results[0] as Record<string, number>;
  const l = lines.results[0] as Record<string, number>;
  const c = cn.results[0] as Record<string, number>;
  const p = pay.results[0] as Record<string, number>;
  const pu = pur.results[0] as Record<string, number>;
  const e = exp.results[0] as Record<string, number>;
  const q = quotes.results[0] as Record<string, number>;
  const s = shifts.results[0] as Record<string, number>;
  return {
    bills: n(i.bills),
    gross: n(i.gross),
    taxable: n(i.taxable),
    tax: n(i.tax),
    roundOff: n(i.roundOff),
    customers: n(i.customers),
    walkIn: n(i.walkIn),
    b2bBills: n(i.b2bBills),
    b2bValue: n(i.b2bValue),
    offline: n(i.offline),
    units: n(l.units),
    discount: n(l.discount),
    mrpValue: n(l.mrpValue),
    mrpBilled: n(l.mrpBilled),
    cost: n(l.cost),
    costedTaxable: n(l.costedTaxable),
    netTaxableLines: n(l.netTaxableLines),
    returns: n(c.n),
    returnsValue: n(c.total),
    returnsTaxable: n(c.taxable),
    returnsTax: n(c.tax),
    netSales: n(i.gross) - n(c.total),
    netTaxable: n(i.taxable) - n(c.taxable),
    netTax: n(i.tax) - n(c.tax),
    received: n(p.received),
    refunded: n(p.refunded),
    purchases: n(pu.n),
    purchasesValue: n(pu.total),
    inputTaxPurchases: n(pu.tax),
    expenses: n(e.n),
    expensesValue: n(e.total),
    inputTaxExpenses: n(e.tax),
    quotations: n(q.n),
    quotationsValue: n(q.value),
    quotationsWon: n(q.won),
    quotationsWonValue: n(q.wonValue),
    shiftsClosed: n(s.n),
    cashVariance: n(s.variance),
    shiftsMismatched: n(s.mismatched),
  };
}

routes.get("/admin/reports/business", async (c) => {
  const q = z
    .object({ from: day, to: day })
    .refine((v) => v.from <= v.to, "The start date must be before the end.")
    .parse({ from: c.req.query("from"), to: c.req.query("to") });
  const db = c.env.DB;
  const prev = previousPeriod(q.from, q.to);
  const [current, prior] = await Promise.all([
    metrics(db, q.from, q.to),
    metrics(db, prev.from, prev.to),
  ]);
  const range = [q.from, q.to];
  const [
    daily,
    weekday,
    hourly,
    categories,
    products,
    customers,
    methods,
    reasons,
    gstRates,
    hsn,
    b2b,
    receivables,
    payables,
    stock,
    dead,
    expenses,
    suppliers,
    views,
    salespeople,
    shortfalls,
    gaps,
    hygiene,
    settings,
  ] = await db.batch([
    db
      .prepare(
        `SELECT date, COUNT(*) AS bills, SUM(total) AS gross FROM invoices WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
      )
      .bind(...range),
    // 0 = Sunday, as SQLite counts.
    db
      .prepare(
        `SELECT CAST(strftime('%w',date) AS INTEGER) AS dow, COUNT(*) AS bills, SUM(total) AS gross
        FROM invoices WHERE date BETWEEN ? AND ? GROUP BY dow`,
      )
      .bind(...range),
    // Bills are stamped in UTC; India is 5 h 30 min ahead.
    db
      .prepare(
        `SELECT CAST(strftime('%H',datetime(created_at,'+330 minutes')) AS INTEGER) AS hour, COUNT(*) AS bills, SUM(total) AS gross
        FROM invoices WHERE date BETWEEN ? AND ? GROUP BY hour ORDER BY hour`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT COALESCE(p.category,'Other') AS category, SUM(l.qty-l.returned_qty) AS units,
        SUM(l.total-l.returned_total) AS revenue, COUNT(DISTINCT l.product_id) AS products
        FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id LEFT JOIN products p ON p.id=l.product_id
        WHERE i.date BETWEEN ? AND ? GROUP BY 1 ORDER BY revenue DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT l.code, l.name, COALESCE(p.category,'') AS category, SUM(l.qty-l.returned_qty) AS units,
        SUM(l.total-l.returned_total) AS revenue, SUM(l.taxable-l.returned_taxable) AS taxable,
        SUM(CASE WHEN l.cost_paise IS NULL THEN NULL ELSE (l.qty-l.returned_qty)*l.cost_paise END) AS cost,
        SUM(l.returned_qty) AS returned
        FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id LEFT JOIN products p ON p.id=l.product_id
        WHERE i.date BETWEEN ? AND ? GROUP BY l.product_id ORDER BY revenue DESC LIMIT 25`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT json_extract(customer_json,'$.name') AS name, json_extract(customer_json,'$.gstin') AS gstin,
        COUNT(*) AS bills, SUM(total-credited) AS net FROM invoices
        WHERE date BETWEEN ? AND ? AND customer_id IS NOT NULL GROUP BY customer_id ORDER BY net DESC LIMIT 10`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT method, kind, COUNT(*) AS n, SUM(amount) AS amount FROM payments WHERE date BETWEEN ? AND ? GROUP BY method, kind ORDER BY amount DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT reason, COUNT(*) AS n, SUM(total) AS total FROM credit_notes WHERE date BETWEEN ? AND ? GROUP BY reason ORDER BY total DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT l.gst_rate_bp AS rate, SUM(l.taxable-l.returned_taxable) AS taxable,
        SUM(l.cgst-l.returned_cgst) AS cgst, SUM(l.sgst-l.returned_sgst) AS sgst, SUM(l.igst-l.returned_igst) AS igst
        FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.date BETWEEN ? AND ? GROUP BY l.gst_rate_bp ORDER BY l.gst_rate_bp`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT l.hsn, l.gst_rate_bp AS rate, SUM(l.qty-l.returned_qty) AS units, SUM(l.taxable-l.returned_taxable) AS taxable,
        SUM(l.cgst-l.returned_cgst+l.sgst-l.returned_sgst+l.igst-l.returned_igst) AS tax
        FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.date BETWEEN ? AND ? GROUP BY l.hsn, l.gst_rate_bp ORDER BY taxable DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT number, date, json_extract(customer_json,'$.name') AS customer, json_extract(customer_json,'$.gstin') AS gstin,
        taxable, cgst+sgst+igst AS tax, total, credited FROM invoices
        WHERE date BETWEEN ? AND ? AND json_extract(customer_json,'$.gstin')<>'' ORDER BY date, number`,
      )
      .bind(...range),
    // Money customers still owe on bills up to the report end, by age.
    db
      .prepare(
        `SELECT number, date, json_extract(customer_json,'$.name') AS customer,
        total-credited-paid+refunded AS due, CAST(julianday(?)-julianday(date) AS INTEGER) AS age
        FROM invoices WHERE date<=? AND total-credited-paid+refunded>0 ORDER BY due DESC`,
      )
      .bind(q.to, q.to),
    db
      .prepare(
        `SELECT s.name AS supplier, COUNT(*) AS bills, SUM(p.total-p.paid-p.returned) AS due
        FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.date<=? AND p.total-p.paid-p.returned>0
        GROUP BY s.id ORDER BY due DESC`,
      )
      .bind(q.to),
    db.prepare(
      `SELECT COUNT(*) AS skus, COALESCE(SUM(stock),0) AS units, SUM(stock<=0) AS out, SUM(stock>0 AND stock<=low_stock) AS low,
      COALESCE(SUM(CASE WHEN cost_paise IS NOT NULL THEN stock*cost_paise END),0) AS atCost,
      SUM(cost_paise IS NULL AND stock>0) AS uncosted,
      COALESCE(SUM(CASE WHEN price_paise IS NOT NULL THEN stock*price_paise END),0) AS atMrp
      FROM products`,
    ),
    db
      .prepare(
        `SELECT p.code, p.name, p.category, p.stock, p.stock*COALESCE(p.price_paise,0) AS mrpValue,
        (SELECT MAX(i.date) FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.product_id=p.id) AS lastSold
        FROM products p WHERE p.stock>0 AND NOT EXISTS(SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
        WHERE l.product_id=p.id AND i.date>date(?,'-90 day')) ORDER BY mrpValue DESC`,
      )
      .bind(q.to),
    db
      .prepare(
        `SELECT category, COUNT(*) AS n, SUM(amount) AS amount, SUM(gst) AS gst FROM expenses
        WHERE status='recorded' AND date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT s.name AS supplier, COUNT(*) AS bills, SUM(p.total) AS total FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
        WHERE p.date BETWEEN ? AND ? GROUP BY s.id ORDER BY total DESC LIMIT 10`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT p.code, p.name, SUM(v.views) AS views FROM product_views v JOIN products p ON p.id=v.product_id
        WHERE v.day BETWEEN ? AND ? GROUP BY v.product_id ORDER BY views DESC LIMIT 10`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT created_by_name AS name, COUNT(*) AS quotes, COALESCE(SUM(total_paise),0) AS value, SUM(status='won') AS won
        FROM quotations WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY created_by_name ORDER BY value DESC`,
      )
      .bind(...range),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM invoices WHERE shortfall=1 AND date BETWEEN ? AND ?`,
      )
      .bind(...range),
    db
      .prepare(
        `WITH RECURSIVE n(fy,seq,last) AS (SELECT fy,first_seq,last_seq FROM number_blocks WHERE fy=? UNION ALL SELECT fy,seq+1,last FROM n WHERE seq<last)
        SELECT COUNT(*) AS n FROM n WHERE NOT EXISTS(SELECT 1 FROM invoices i WHERE i.fy=n.fy AND i.seq=n.seq)
        AND n.seq < (SELECT COALESCE(MAX(seq),0) FROM invoices i WHERE i.fy=n.fy)`,
      )
      .bind(financialYear(q.to)),
    db.prepare(
      `SELECT SUM(gst_rate_bp IS NULL) AS noGst, SUM(hsn='') AS noHsn, SUM(cost_paise IS NULL) AS noCost,
      SUM(image_key IS NULL) AS noPhoto, COUNT(*) AS products FROM products`,
    ),
    db.prepare("SELECT invoice_prefix AS prefix FROM erp_settings WHERE id=1"),
  ]);
  const rows = <T>(r: D1Result) => r.results as T[];
  const report: BusinessReport = {
    from: q.from,
    to: q.to,
    previous: prev,
    generatedAt: new Date().toISOString(),
    generatedBy: actorName(c.get("viewer")),
    prefix:
      (settings.results[0] as { prefix?: string } | undefined)?.prefix ?? "LT",
    current,
    prior,
    daily: rows(daily),
    weekday: rows(weekday),
    hourly: rows(hourly),
    categories: rows(categories),
    products: rows(products),
    customers: rows(customers),
    methods: rows(methods),
    returnReasons: rows(reasons),
    gstRates: rows(gstRates),
    hsn: rows(hsn),
    b2b: rows(b2b),
    receivables: rows(receivables),
    payables: rows(payables),
    stock: stock.results[0] as BusinessReport["stock"],
    deadStock: rows(dead),
    expenses: rows(expenses),
    suppliers: rows(suppliers),
    views: rows(views),
    salespeople: rows(salespeople),
    shortfallBills: n((shortfalls.results[0] as { n: number }).n),
    numberGaps: n((gaps.results[0] as { n: number }).n),
    hygiene: hygiene.results[0] as BusinessReport["hygiene"],
  };
  return c.json(report);
});

/* ───────── Archive: every generated report is kept as a record ───────── */
const archiveInput = z
  .object({
    kind: z.enum(["month", "quarter", "year", "custom"]),
    from: day,
    to: day,
  })
  .strict();
const periodCode = (kind: string, from: string, to: string) =>
  kind === "month"
    ? from.slice(0, 7)
    : kind === "year"
      ? `FY${from.slice(2, 4)}-${to.slice(2, 4)}`
      : kind === "quarter"
        ? `${from.slice(0, 7)}-Q`
        : `${from}-${to}`;

routes.post("/admin/reports/archive", async (c) => {
  const d = archiveInput.parse(await c.req.json());
  const prefix =
    (
      await c.env.DB.prepare(
        "SELECT invoice_prefix AS p FROM erp_settings WHERE id=1",
      ).first<{ p: string }>()
    )?.p ?? "LT";
  const base = `${prefix}-RPT-${periodCode(d.kind, d.from, d.to)}`;
  const version =
    ((
      await c.env.DB.prepare(
        "SELECT MAX(version) AS v FROM report_archive WHERE period_from=? AND period_to=? AND kind=?",
      )
        .bind(d.from, d.to, d.kind)
        .first<{ v: number | null }>()
    )?.v ?? 0) + 1;
  const id = crypto.randomUUID();
  const reference = version === 1 ? base : `${base}-v${version}`;
  await c.env.DB.prepare(
    "INSERT INTO report_archive(id,reference,kind,period_from,period_to,version,generated_by) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      reference,
      d.kind,
      d.from,
      d.to,
      version,
      actorName(c.get("viewer")),
    )
    .run();
  return c.json({ id, reference, version }, 201);
});
routes.put("/admin/reports/archive/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT pdf_key FROM report_archive WHERE id=?",
  )
    .bind(id)
    .first<{ pdf_key: string | null }>();
  if (!row) return c.json({ error: "Report not found." }, 404);
  // Saved reports are records: never replaced.
  if (row.pdf_key)
    return c.json({ error: "This report is already saved." }, 409);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return c.json({ error: "Not a PDF." }, 400);
  const key = `reports/${id}.pdf`;
  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  await c.env.DB.prepare(
    "UPDATE report_archive SET pdf_key=?,bytes=?,saved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND pdf_key IS NULL",
  )
    .bind(key, bytes.length, id)
    .run();
  return c.json({ saved: true });
});
routes.get("/admin/reports/archive", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT id, reference, kind, period_from AS "from", period_to AS "to", version, bytes,
    generated_by AS generatedBy, saved_at AS savedAt FROM report_archive WHERE pdf_key IS NOT NULL
    ORDER BY period_from DESC, version DESC LIMIT 500`,
  ).all();
  return c.json(r.results);
});
routes.get("/admin/reports/archive/:id/pdf", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT reference, pdf_key FROM report_archive WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ reference: string; pdf_key: string | null }>();
  const object = row?.pdf_key ? await c.env.MEDIA.get(row.pdf_key) : null;
  if (!row || !object) return c.json({ error: "Report not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.reference}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default routes;
