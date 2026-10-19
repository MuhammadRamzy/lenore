import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, "Enter a valid calendar date");
const minor = z.number().int().min(0).max(100_000_000_000);
const text = (max: number) => z.string().trim().max(max);
export const financeKinds = [
  "sale",
  "purchase",
  "expense",
  "sale_credit",
  "purchase_credit",
] as const;
export const kindLabel: Record<FinanceKind, string> = {
  sale: "Sale",
  purchase: "Purchase",
  expense: "Expense",
  sale_credit: "Sales credit",
  purchase_credit: "Supplier credit",
};
export const documentInput = z
  .object({
    id: z.uuid(),
    kind: z.enum(financeKinds),
    date: isoDate,
    dueDate: isoDate,
    number: text(100).min(1),
    party: text(160).min(1),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(?:\d{2}[A-Z0-9]{13})?$/),
    category: text(80).min(1),
    netMinor: minor,
    freightMinor: minor,
    roundingMinor: z.number().int().min(-100).max(100),
    cgstMinor: minor,
    sgstMinor: minor,
    igstMinor: minor,
    costMinor: minor.nullable(),
    itcStatus: z.enum(["pending", "eligible", "ineligible"]),
    reviewNote: text(500),
    supply: z.enum([
      "non_gst",
      "domestic_intra",
      "domestic_inter",
      "export_lut",
      "export_igst",
    ]),
    parentId: z.uuid().nullable(),
    source: z.enum(["manual", "csv", "billing_export", "pos"]),
    notes: text(2000),
    export: z
      .object({
        country: z.string().regex(/^[A-Z]{2}$/),
        currency: z.enum(["INR", "USD", "AED", "QAR", "SAR", "EUR", "GBP"]),
        foreignGrossMinor: minor,
        rateEvidence: text(300),
        lut: text(100),
        shippingBill: text(100),
        shippingDate: isoDate.nullable(),
        port: text(30),
        realisationDue: isoDate,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((d, c) => {
    const issue = (message: string) => c.addIssue({ code: "custom", message });
    if (d.dueDate < d.date) issue("Due date cannot precede the document date.");
    if (
      d.netMinor +
        d.freightMinor +
        d.roundingMinor +
        d.cgstMinor +
        d.sgstMinor +
        d.igstMinor <=
      0
    )
      issue("Document total must be greater than zero.");
    const credit = d.kind.endsWith("_credit");
    if (credit !== !!d.parentId)
      issue(
        "A credit note must link to its source document; other records cannot have a parent.",
      );
    if (d.itcStatus !== "pending" && d.reviewNote.length < 3)
      issue("Record the reason/evidence for input-tax review.");
    if (
      (d.kind === "sale" || d.kind === "sale_credit") &&
      d.itcStatus !== "pending"
    )
      issue("Sales do not claim input tax credit.");
    if (
      d.supply === "domestic_intra" &&
      (d.igstMinor || d.cgstMinor !== d.sgstMinor)
    )
      issue("Intra-state records require equal CGST/SGST and no IGST.");
    if (
      ["domestic_inter", "export_igst"].includes(d.supply) &&
      (d.cgstMinor || d.sgstMinor)
    )
      issue("Inter-state/export IGST records cannot contain CGST or SGST.");
    if (
      ["non_gst", "export_lut"].includes(d.supply) &&
      (d.cgstMinor || d.sgstMinor || d.igstMinor)
    )
      issue("This treatment requires zero tax recorded.");
    if (d.supply.startsWith("export")) {
      if (
        !["sale", "sale_credit"].includes(d.kind) ||
        !d.export ||
        d.export.country === "IN"
      )
        issue(
          "Export treatment requires an overseas sales document and destination.",
        );
      if (d.export && d.export.realisationDue < d.date)
        issue("Realisation due date cannot precede the invoice.");
    } else if (d.export) issue("Export metadata belongs only to export sales.");
    if (!["sale", "sale_credit"].includes(d.kind) && d.costMinor !== null)
      issue("COGS belongs to sales, not purchases/expenses.");
  });
export type FinanceKind = (typeof financeKinds)[number];
export type FinanceInput = z.infer<typeof documentInput>;
export type FinanceDocument = FinanceInput & {
  parentKind?: FinanceKind | null;
  grossMinor: number;
  settledMinor: number;
  creditsMinor: number;
  outstandingMinor: number;
  status: "posted" | "void";
  voidReason: string;
  createdAt: string;
};
export const settlementInput = z
  .object({
    id: z.uuid(),
    documentId: z.uuid(),
    date: isoDate,
    amountMinor: minor.refine((v) => v > 0),
    bankMinor: minor.refine((v) => v > 0),
    refund: z.boolean(),
    method: z.enum(["cash", "bank", "upi", "card", "other"]),
    reference: text(160).min(1),
    notes: text(500),
  })
  .strict();
export type SettlementInput = z.infer<typeof settlementInput>;
export type FinanceSettlement = SettlementInput & {
  createdAt: string;
  documentNumber: string;
  party: string;
  kind: FinanceKind;
};
export const obligationInput = z
  .object({
    id: z.uuid(),
    title: text(160).min(2),
    type: z.enum(["GST", "Income tax", "TDS", "Export", "Other"]),
    period: text(60).min(1),
    dueDate: isoDate,
    amountMinor: minor.nullable(),
    status: z.enum(["open", "filed", "paid", "complete"]),
    reference: text(160),
    notes: text(1000),
  })
  .strict()
  .refine(
    (d) => d.status === "open" || d.reference.length > 0,
    "Completed tasks need a filing/payment reference.",
  );
export type TaxObligation = z.infer<typeof obligationInput> & {
  revision: number;
};
export const profileInput = z
  .object({
    name: text(160).min(1),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(?:\d{2}[A-Z0-9]{13})?$/),
    stateCode: z.string().regex(/^(?:\d{2})?$/),
    iec: text(20),
    lut: text(100),
    registration: z.enum([
      "unconfirmed",
      "regular",
      "composition",
      "unregistered",
    ]),
  })
  .strict();
export type FinanceProfile = z.infer<typeof profileInput> & {
  closedThrough: string;
  revision: number;
};
export const financeMoney = (v: number | null) =>
  v === null
    ? "Awaiting cost"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(v / 100);
export function amountFromText(s: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(s.trim()))
    throw new Error("Use a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = s.trim().split(".");
  const n = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (n > 100_000_000_000n)
    throw new Error("Amount exceeds the per-record limit.");
  return Number(n);
}
export function exactSum(values: number[]): number {
  const v = values.reduce((s, n) => s + BigInt(n), 0n);
  if (
    v > BigInt(Number.MAX_SAFE_INTEGER) ||
    v < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error(
      "Report exceeds the exact monetary range. Narrow the date range.",
    );
  return Number(v);
}
export function financeSummary(
  documents: FinanceDocument[],
  payments: FinanceSettlement[],
) {
  const docs = documents.filter((d) => d.status === "posted");
  const sales = docs.filter((d) => ["sale", "sale_credit"].includes(d.kind));
  const sign = (d: FinanceDocument) => (d.kind.endsWith("_credit") ? -1 : 1);
  const revenue = exactSum(
    sales.map((d) => sign(d) * (d.netMinor + d.freightMinor + d.roundingMinor)),
  );
  const missingCosts = sales.filter((d) => d.costMinor === null).length;
  const cogs = missingCosts
    ? null
    : exactSum(sales.map((d) => sign(d) * d.costMinor!));
  const expense = exactSum(
    docs
      .filter(
        (d) =>
          d.kind === "expense" ||
          (d.kind === "purchase_credit" && d.parentKind === "expense"),
      )
      .map(
        (d) =>
          sign(d) *
          (d.netMinor +
            d.freightMinor +
            d.roundingMinor +
            (d.itcStatus === "eligible"
              ? 0
              : d.cgstMinor + d.sgstMinor + d.igstMinor)),
      ),
  );
  const grossProfit = cogs === null ? null : exactSum([revenue, -cogs]);
  const operatingResult =
    grossProfit === null ? null : exactSum([grossProfit, -expense]);
  const output = { cgstMinor: 0, sgstMinor: 0, igstMinor: 0 };
  const eligible = { ...output },
    pending = { ...output },
    ineligible = { ...output };
  for (const key of Object.keys(output) as (keyof typeof output)[]) {
    output[key] = exactSum(sales.map((d) => sign(d) * d[key]));
    for (const [status, bucket] of [
      ["eligible", eligible],
      ["pending", pending],
      ["ineligible", ineligible],
    ] as const)
      bucket[key] = exactSum(
        docs
          .filter(
            (d) =>
              !["sale", "sale_credit"].includes(d.kind) &&
              d.itcStatus === status,
          )
          .map((d) => sign(d) * d[key]),
      );
  }
  const cashIn = exactSum(
    payments
      .filter((p) => (p.kind === "sale") !== p.refund)
      .map((p) => p.bankMinor),
  );
  const cashOut = exactSum(
    payments
      .filter((p) => (p.kind === "sale") === p.refund)
      .map((p) => p.bankMinor),
  );
  const settlementVariance = exactSum(
    payments.map(
      (p) =>
        (p.kind === "sale" ? 1 : -1) *
        (p.refund ? -1 : 1) *
        (p.bankMinor - p.amountMinor),
    ),
  );
  return {
    revenue,
    cogs,
    missingCosts,
    expense,
    grossProfit,
    operatingResult,
    cashIn,
    cashOut,
    netCash: exactSum([cashIn, -cashOut]),
    settlementVariance,
    output,
    eligible,
    pending,
    ineligible,
    exportRevenue: exactSum(
      sales.filter((d) => d.export).map((d) => sign(d) * d.netMinor),
    ),
    documentCount: docs.length,
  };
}
export type FinanceSummary = ReturnType<typeof financeSummary>;

const csvCell = (s: unknown) => {
  const v = String(s ?? "");
  return `"${(/^-?\d+(?:\.\d+)?$/.test(v) ? v : v.replace(/^[\s\r\n]*[=+@-]/, "'$&")).replaceAll('"', '""')}"`;
};
export const financeCsvHeaders = [
  "kind",
  "date",
  "dueDate",
  "number",
  "party",
  "gstin",
  "category",
  "net",
  "freight",
  "rounding",
  "cgst",
  "sgst",
  "igst",
  "cost",
  "itcStatus",
  "reviewNote",
  "supply",
  "parentId",
  "notes",
  "country",
  "currency",
  "foreignGross",
  "rateEvidence",
  "lut",
  "shippingBill",
  "shippingDate",
  "port",
  "realisationDue",
];
export function financeCsv(docs: FinanceDocument[]) {
  return (
    "\uFEFF" +
    [
      financeCsvHeaders,
      ...docs.map((d) => [
        d.kind,
        d.date,
        d.dueDate,
        d.number,
        d.party,
        d.gstin,
        d.category,
        (d.netMinor / 100).toFixed(2),
        (d.freightMinor / 100).toFixed(2),
        (d.roundingMinor / 100).toFixed(2),
        (d.cgstMinor / 100).toFixed(2),
        (d.sgstMinor / 100).toFixed(2),
        (d.igstMinor / 100).toFixed(2),
        d.costMinor === null ? "" : (d.costMinor / 100).toFixed(2),
        d.itcStatus,
        d.reviewNote,
        d.supply,
        d.parentId,
        d.notes,
        d.export?.country,
        d.export?.currency,
        d.export ? (d.export.foreignGrossMinor / 100).toFixed(2) : "",
        d.export?.rateEvidence,
        d.export?.lut,
        d.export?.shippingBill,
        d.export?.shippingDate,
        d.export?.port,
        d.export?.realisationDue,
      ]),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n")
  );
}
/** RFC4180-style parser; one source document per row, strict header and row widths. */
export function parseFinanceCsv(csv: string): FinanceInput[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell !== "")
        throw new Error("Unexpected quote in CSV.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted value.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (rows.shift()?.join("|") !== financeCsvHeaders.join("|"))
    throw new Error("CSV columns do not match the finance template.");
  if (!rows.length || rows.length > 200)
    throw new Error("Import between 1 and 200 source documents at a time.");
  return rows.map((cells, index) => {
    if (cells.length !== financeCsvHeaders.length)
      throw new Error(`Row ${index + 2}: incorrect column count.`);
    const r = Object.fromEntries(
      financeCsvHeaders.map((k, i) => [k, cells[i]]),
    );
    try {
      return documentInput.parse({
        id: crypto.randomUUID(),
        kind: r.kind,
        date: r.date,
        dueDate: r.dueDate,
        number: r.number,
        party: r.party,
        gstin: r.gstin,
        category: r.category,
        netMinor: amountFromText(r.net),
        freightMinor: amountFromText(r.freight),
        roundingMinor:
          (r.rounding.startsWith("-") ? -1 : 1) *
          amountFromText(r.rounding.replace(/^[-+]/, "")),
        cgstMinor: amountFromText(r.cgst),
        sgstMinor: amountFromText(r.sgst),
        igstMinor: amountFromText(r.igst),
        costMinor: r.cost === "" ? null : amountFromText(r.cost),
        itcStatus: r.itcStatus,
        reviewNote: r.reviewNote,
        supply: r.supply,
        parentId: r.parentId || null,
        source: "csv",
        notes: r.notes,
        export: r.country
          ? {
              country: r.country,
              currency: r.currency,
              foreignGrossMinor: amountFromText(r.foreignGross),
              rateEvidence: r.rateEvidence,
              lut: r.lut,
              shippingBill: r.shippingBill,
              shippingDate: r.shippingDate || null,
              port: r.port,
              realisationDue: r.realisationDue,
            }
          : null,
      });
    } catch (e) {
      throw new Error(
        `Row ${index + 2}: ${e instanceof Error ? e.message : "Invalid record"}`,
      );
    }
  });
}
