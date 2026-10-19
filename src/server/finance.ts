import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "./index";
import { sha256 } from "./auth";
import {
  documentInput,
  settlementInput,
  obligationInput,
  profileInput,
  isoDate,
  financeSummary,
  financeCsv,
  type FinanceInput,
  type FinanceDocument,
  type FinanceProfile,
  type FinanceSettlement,
} from "../finance";

const finance = new Hono<{ Bindings: Bindings }>();
type DocumentRow = {
  id: string;
  data: string;
  status: "posted" | "void";
  void_reason: string;
  created_at: string;
  gross_minor: number;
  settled_minor: number;
  credits_minor: number;
  fingerprint: string;
  parent_kind?: FinanceInput["kind"] | null;
};
const mapDocument = (r: DocumentRow): FinanceDocument => ({
  ...JSON.parse(r.data),
  parentKind: r.parent_kind ?? null,
  status: r.status,
  voidReason: r.void_reason,
  createdAt: r.created_at,
  grossMinor: r.gross_minor,
  settledMinor: r.settled_minor,
  creditsMinor: r.credits_minor,
  outstandingMinor: r.gross_minor - r.settled_minor - r.credits_minor,
});
async function profile(db: D1Database): Promise<FinanceProfile> {
  const r = await db
    .prepare("SELECT * FROM finance_profile WHERE id=1")
    .first<{ data: string; closed_through: string; revision: number }>();
  return {
    ...JSON.parse(r!.data),
    closedThrough: r!.closed_through,
    revision: r!.revision,
  };
}
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const reportRange = z
  .object({ from: isoDate, to: isoDate })
  .refine((d) => d.from <= d.to, "Date range is reversed.");
function range(from?: string, to?: string) {
  return reportRange.parse({
    from: from ?? today().slice(0, 7) + "-01",
    to: to ?? today(),
  });
}
async function documents(db: D1Database, from: string, to: string) {
  const r = await db
    .prepare(
      "SELECT * FROM finance_balances WHERE document_date BETWEEN ? AND ? ORDER BY document_date DESC,created_at DESC",
    )
    .bind(from, to)
    .all<DocumentRow>();
  return r.results.map(mapDocument);
}
async function payments(db: D1Database, from: string, to: string) {
  const r = await db
    .prepare(
      "SELECT s.data,s.created_at,d.kind,json_extract(d.data,'$.number') AS number,json_extract(d.data,'$.party') AS party FROM finance_settlements s JOIN finance_documents d ON d.id=s.document_id WHERE s.settlement_date BETWEEN ? AND ? ORDER BY s.settlement_date DESC,s.created_at DESC",
    )
    .bind(from, to)
    .all<{
      data: string;
      created_at: string;
      kind: FinanceInput["kind"];
      number: string;
      party: string;
    }>();
  return r.results.map((r) => ({
    ...JSON.parse(r.data),
    createdAt: r.created_at,
    kind: r.kind,
    documentNumber: r.number,
    party: r.party,
  })) as FinanceSettlement[];
}
async function validateSetup(db: D1Database, docs: FinanceInput[]) {
  const p = await profile(db);
  if (
    docs.some(
      (d) =>
        (d.cgstMinor + d.sgstMinor + d.igstMinor > 0 ||
          d.supply.startsWith("export")) &&
        p.registration !== "regular",
    )
  )
    throw new Error(
      "finance: Confirm regular GST registration in Finance setup before recording GST/export documents.",
    );
  if (docs.some((d) => d.itcStatus === "eligible" && !d.gstin))
    throw new Error(
      "finance: Eligible input tax requires a supplier GSTIN and review evidence.",
    );
}
function identity(d: FinanceInput) {
  const year =
    Number(d.date.slice(0, 4)) - (Number(d.date.slice(5, 7)) < 4 ? 1 : 0);
  return `${d.kind}|${d.gstin || d.party.trim().toLowerCase()}|${year}|${d.number.toUpperCase()}`;
}
async function fingerprint(d: FinanceInput) {
  const rest = Object.fromEntries(
    Object.entries(d).filter(([key]) => key !== "id" && key !== "source"),
  );
  return sha256(JSON.stringify(rest));
}
async function prepareImport(db: D1Database, docs: FinanceInput[]) {
  await validateSetup(db, docs);
  const statements: D1PreparedStatement[] = [];
  let skipped = 0;
  const keys = new Set<string>(),
    ids = new Set<string>();
  for (const d of docs) {
    const key = identity(d),
      hash = await fingerprint(d);
    if (keys.has(key) || ids.has(d.id))
      throw new Error(
        "finance: This batch repeats a source reference or request ID.",
      );
    keys.add(key);
    ids.add(d.id);
    const existing = await db
      .prepare(
        "SELECT id,fingerprint FROM finance_documents WHERE id=? OR reference_key=?",
      )
      .bind(d.id, key)
      .all<{ id: string; fingerprint: string }>();
    if (existing.results.length) {
      if (
        existing.results.length === 1 &&
        existing.results[0].fingerprint === hash
      ) {
        skipped++;
        continue;
      }
      throw new Error(
        `finance: Source ${d.number} already exists with different values. Review it instead of overwriting.`,
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO finance_documents(id,data,fingerprint,reference_key) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM finance_documents WHERE id=? AND fingerprint=?)",
        )
        .bind(d.id, JSON.stringify(d), hash, key, d.id, hash),
    );
  }
  return { statements, skipped };
}
finance.get("/profile", async (c) => c.json(await profile(c.env.DB)));
finance.put("/profile", async (c) => {
  const { revision, ...data } = profileInput
    .extend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  if (
    data.registration === "regular" &&
    (!data.gstin || !data.stateCode || !data.gstin.startsWith(data.stateCode))
  )
    return c.json(
      { error: "Regular GST setup requires a GSTIN and matching state code." },
      400,
    );
  const row = await c.env.DB.prepare(
    "UPDATE finance_profile SET data=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING id",
  )
    .bind(JSON.stringify(data), revision)
    .first();
  return row
    ? c.json(await profile(c.env.DB))
    : c.json({ error: "Finance setup changed. Refresh before saving." }, 409);
});
finance.get("/workspace", async (c) => {
  const { from, to } = range(c.req.query("from"), c.req.query("to"));
  const [p, docs, settlements, obligations, audit] = await Promise.all([
    profile(c.env.DB),
    documents(c.env.DB, from, to),
    payments(c.env.DB, from, to),
    c.env.DB.prepare(
      "SELECT data,revision FROM finance_obligations ORDER BY json_extract(data,'$.dueDate')",
    ).all<{ data: string; revision: number }>(),
    c.env.DB.prepare(
      "SELECT * FROM finance_audit ORDER BY id DESC LIMIT 100",
    ).all(),
  ]);
  // Ageing is as-of the range end; future settlements/credits never reduce it.
  const balances = await c.env.DB.prepare(
    `SELECT d.*,
    COALESCE((SELECT SUM(s.amount_minor*CASE WHEN s.refund=1 THEN -1 ELSE 1 END) FROM finance_settlements s WHERE s.document_id=d.id AND s.settlement_date<=?),0) AS settled_minor,
    COALESCE((SELECT SUM(x.gross_minor) FROM finance_documents x WHERE x.parent_id=d.id AND x.status='posted' AND x.document_date<=?),0) AS credits_minor
    FROM finance_documents d WHERE d.status='posted' AND d.parent_id IS NULL AND d.document_date<=? ORDER BY json_extract(d.data,'$.dueDate')`,
  )
    .bind(to, to, to)
    .all<DocumentRow>();
  return c.json({
    profile: p,
    summary: financeSummary(docs, settlements),
    documents: docs,
    settlements,
    balances: balances.results
      .map(mapDocument)
      .filter((d) => d.outstandingMinor !== 0),
    obligations: obligations.results.map((r) => ({
      ...JSON.parse(r.data),
      revision: r.revision,
    })),
    audit: audit.results,
    from,
    to,
  });
});
finance.get("/documents.csv", async (c) => {
  const { from, to } = range(c.req.query("from"), c.req.query("to"));
  const docs = await documents(c.env.DB, from, to);
  const kind = c.req.query("kind"),
    q = (c.req.query("q") ?? "").toLowerCase();
  const selected = docs.filter(
    (d) =>
      d.status === "posted" &&
      (!kind || kind === "all" || d.kind === kind) &&
      `${d.number} ${d.party} ${d.category}`.toLowerCase().includes(q),
  );
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="Lenore-finance-${from}-${to}.csv"`,
  );
  return c.body(financeCsv(selected));
});
finance.post("/documents", async (c) => {
  const d = documentInput.parse(await c.req.json());
  const { statements, skipped } = await prepareImport(c.env.DB, [d]);
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ saved: true, duplicate: !!skipped }, skipped ? 200 : 201);
});
finance.post("/import", async (c) => {
  const { documents: docs } = z
    .object({ documents: z.array(documentInput).min(1).max(200) })
    .strict()
    .parse(await c.req.json());
  const { statements, skipped } = await prepareImport(c.env.DB, docs);
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ imported: statements.length, skipped });
});
finance.post("/documents/:id/void", async (c) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(3).max(500) })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE finance_documents SET status='void',void_reason=? WHERE id=? AND status='posted' RETURNING id",
  )
    .bind(reason, c.req.param("id"))
    .first();
  return row
    ? c.json({ saved: true })
    : c.json({ error: "Active source document not found." }, 404);
});
finance.post("/documents/:id/cost", async (c) => {
  const { costMinor, reason } = z
    .object({
      costMinor: z.number().int().min(0).max(100_000_000_000),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE finance_documents SET data=json_set(data,'$.costMinor',?),change_reason=? WHERE id=? AND status='posted' AND cost_minor IS NULL AND kind IN ('sale','sale_credit') RETURNING id",
  )
    .bind(costMinor, reason, c.req.param("id"))
    .first();
  return row
    ? c.json({ saved: true })
    : c.json(
        { error: "Source cost is already recorded or the sale was not found." },
        409,
      );
});
finance.post("/documents/:id/review", async (c) => {
  const { status, reason } = z
    .object({
      status: z.enum(["eligible", "ineligible", "pending"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(await c.req.json());
  const source = await c.env.DB.prepare(
    "SELECT data FROM finance_documents WHERE id=? AND status='posted'",
  )
    .bind(c.req.param("id"))
    .first<{ data: string }>();
  if (!source) return c.json({ error: "Source bill not found." }, 404);
  const d = JSON.parse(source.data) as FinanceInput;
  await validateSetup(c.env.DB, [
    { ...d, itcStatus: status, reviewNote: reason },
  ]);
  const row = await c.env.DB.prepare(
    "UPDATE finance_documents SET data=json_set(data,'$.itcStatus',?,'$.reviewNote',?),change_reason=? WHERE id=? AND kind IN ('purchase','expense','purchase_credit') AND status='posted' RETURNING id",
  )
    .bind(status, reason, reason, c.req.param("id"))
    .first();
  return row
    ? c.json({ saved: true })
    : c.json({ error: "Only input documents can be reviewed." }, 400);
});
finance.post("/documents/:id/export-evidence", async (c) => {
  const patch = z
    .object({
      lut: z.string().trim().max(100),
      shippingBill: z.string().trim().max(100),
      shippingDate: isoDate.nullable(),
      port: z.string().trim().max(30),
      rateEvidence: z.string().trim().max(300),
      realisationDue: isoDate,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "SELECT data FROM finance_documents WHERE id=? AND status='posted'",
  )
    .bind(c.req.param("id"))
    .first<{ data: string }>();
  if (!row) return c.json({ error: "Active export source not found." }, 404);
  const d = JSON.parse(row.data) as FinanceInput;
  if (!d.export)
    return c.json({ error: "This source is not an export document." }, 400);
  const { reason, ...fields } = patch;
  const updated = documentInput.parse({
    ...d,
    export: { ...d.export, ...fields },
  });
  const result = await c.env.DB.prepare(
    "UPDATE finance_documents SET data=?,change_reason=? WHERE id=? AND data=? AND status='posted' RETURNING id",
  )
    .bind(JSON.stringify(updated), reason, d.id, row.data)
    .first();
  return result
    ? c.json({ saved: true })
    : c.json({ error: "Export evidence changed. Refresh before saving." }, 409);
});
finance.post("/settlements", async (c) => {
  const d = settlementInput.parse(await c.req.json()),
    hash = await sha256(JSON.stringify(d));
  const old = await c.env.DB.prepare(
    "SELECT fingerprint FROM finance_settlements WHERE id=?",
  )
    .bind(d.id)
    .first<{ fingerprint: string }>();
  if (old)
    return old.fingerprint === hash
      ? c.json({ saved: true, duplicate: true })
      : c.json(
          { error: "Payment request ID already has different values." },
          409,
        );
  await c.env.DB.prepare(
    "INSERT INTO finance_settlements(id,document_id,data,fingerprint) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM finance_settlements WHERE id=? AND fingerprint=?)",
  )
    .bind(d.id, d.documentId, JSON.stringify(d), hash, d.id, hash)
    .run();
  return c.json({ saved: true }, 201);
});
finance.post("/obligations", async (c) => {
  const d = obligationInput.parse(await c.req.json());
  const old = await c.env.DB.prepare(
    "SELECT data FROM finance_obligations WHERE id=?",
  )
    .bind(d.id)
    .first<{ data: string }>();
  if (old)
    return old.data === JSON.stringify(d)
      ? c.json({ saved: true })
      : c.json({ error: "Task request ID already exists." }, 409);
  await c.env.DB.prepare("INSERT INTO finance_obligations(id,data) VALUES(?,?)")
    .bind(d.id, JSON.stringify(d))
    .run();
  return c.json({ saved: true }, 201);
});
finance.put("/obligations/:id", async (c) => {
  const { revision, ...d } = obligationInput
    .safeExtend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  if (d.id !== c.req.param("id"))
    return c.json({ error: "Task IDs do not match." }, 400);
  const row = await c.env.DB.prepare(
    "UPDATE finance_obligations SET data=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id",
  )
    .bind(JSON.stringify(d), d.id, revision)
    .first();
  return row
    ? c.json({ saved: true })
    : c.json({ error: "Task changed. Refresh it before saving." }, 409);
});
finance.post("/close", async (c) => {
  const d = z
    .object({
      through: isoDate,
      revision: z.number().int().positive(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(await c.req.json());
  if (d.through > today())
    return c.json({ error: "Future periods cannot be closed." }, 400);
  // This check is repeated in the UPDATE, so a concurrent source insert cannot bypass it.
  const row = await c.env.DB.prepare(
    `UPDATE finance_profile SET closed_through=?,revision=revision+1 WHERE id=1 AND revision=? AND closed_through<? AND NOT EXISTS(SELECT 1 FROM finance_documents WHERE status='posted' AND document_date<=? AND ((kind IN ('sale','sale_credit') AND cost_minor IS NULL) OR (kind IN ('purchase','expense','purchase_credit') AND cgst_minor+sgst_minor+igst_minor>0 AND json_extract(data,'$.itcStatus')='pending'))) RETURNING id`,
  )
    .bind(d.through, d.revision, d.through, d.through)
    .first();
  if (!row)
    return c.json(
      {
        error:
          "Resolve missing costs/input-tax reviews, or refresh the period setup before closing.",
      },
      409,
    );
  await c.env.DB.prepare(
    "INSERT INTO finance_audit(entity_id,action,detail) VALUES('profile','period_close_reason',?)",
  )
    .bind(`${d.through}: ${d.reason}`)
    .run();
  return c.json(await profile(c.env.DB));
});
export default finance;
