import { Hono } from "hono";
import { z } from "zod";
import {
  addTax,
  balanceOf,
  creditNoteInput,
  creditNoteNumber,
  customerInput,
  expenseInput,
  financialYear,
  invoiceInput,
  invoiceNumber,
  priceBill,
  purchaseInput,
  purchaseReturnInput,
  settlementInput,
  splitInclusive,
  supplierInput,
  type Customer,
  type Expense,
  type Invoice,
  type InvoiceInput,
  type InvoiceLine,
  type Supply,
  type Supplier,
} from "../erp";
import { discounted } from "../shared";
import { sha256 } from "./auth";
import { isAdmin, type AppContext, type AppEnv, type Viewer } from "./access";
import { actorName, type ProductRow } from "./products";
import { indiaToday, readSettings } from "./quotations";

/* ───────── Settings and helpers ───────── */
type ErpSettings = {
  invoicePrefix: string;
  stateCode: string;
  receiptFooter: string;
  blockSize: number;
  revision: number;
};
async function erpSettings(db: D1Database): Promise<ErpSettings> {
  const r = await db.prepare("SELECT * FROM erp_settings WHERE id=1").first<{
    invoice_prefix: string;
    state_code: string;
    receipt_footer: string;
    block_size: number;
    revision: number;
  }>();
  return {
    invoicePrefix: r?.invoice_prefix ?? "LT",
    stateCode: r?.state_code ?? "32",
    receiptFooter: r?.receipt_footer ?? "",
    blockSize: r?.block_size ?? 25,
    revision: r?.revision ?? 1,
  };
}
const fail = (message: string, status = 409) =>
  ({ fail: { message, status } }) as const;
type Failure = ReturnType<typeof fail>;
const isFailure = (v: unknown): v is Failure =>
  !!v && typeof v === "object" && "fail" in v;
const fyStartYear = (date: string) =>
  Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
const posActor = (v: Viewer | null) =>
  v ? (v.userId ? v.name : "Owner") : "system";

/* ───────── Finance subledger postings ───────── */
type FinanceKind =
  "sale" | "purchase" | "expense" | "sale_credit" | "purchase_credit";
type FinanceDoc = {
  id: string;
  kind: FinanceKind;
  date: string;
  dueDate: string;
  number: string;
  party: string;
  gstin: string;
  category: string;
  netMinor: number;
  roundingMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  costMinor: number | null;
  supply: Supply;
  parentId: string | null;
  notes: string;
};
/** Writes the accounting record for an ERP document in the same batch as the document itself. */
function financeDocument(db: D1Database, d: FinanceDoc) {
  const data = {
    id: d.id,
    kind: d.kind,
    date: d.date,
    dueDate: d.dueDate,
    number: d.number,
    party: d.party,
    gstin: d.gstin,
    category: d.category,
    netMinor: d.netMinor,
    freightMinor: 0,
    roundingMinor: d.roundingMinor,
    cgstMinor: d.cgstMinor,
    sgstMinor: d.sgstMinor,
    igstMinor: d.igstMinor,
    costMinor: d.costMinor,
    itcStatus: "pending",
    reviewNote: "",
    supply: d.supply === "inter" ? "domestic_inter" : "domestic_intra",
    parentId: d.parentId,
    source: "pos",
    notes: d.notes,
    export: null,
  };
  const key = `${d.kind}|${d.gstin || d.party.trim().toLowerCase()}|${fyStartYear(d.date)}|${d.number.toUpperCase()}`;
  return db
    .prepare(
      "INSERT INTO finance_documents(id,data,fingerprint,reference_key) VALUES(?,?,'erp',?)",
    )
    .bind(d.id, JSON.stringify(data), key);
}
function financeSettlement(
  db: D1Database,
  s: {
    id: string;
    documentId: string;
    date: string;
    amount: number;
    refund: boolean;
    method: string;
    reference: string;
  },
) {
  const data = {
    id: s.id,
    documentId: s.documentId,
    date: s.date,
    amountMinor: s.amount,
    bankMinor: s.amount,
    refund: s.refund,
    method: s.method,
    reference: s.reference || "ERP",
    notes: "",
  };
  return db
    .prepare(
      "INSERT INTO finance_settlements(id,document_id,data,fingerprint) VALUES(?,?,?,'erp')",
    )
    .bind(s.id, s.documentId, JSON.stringify(data));
}

/* ───────── Stock posting with optimistic retries ───────── */
type StockRow = {
  id: string;
  code: string;
  name: string;
  stock: number;
  revision: number;
  cost_paise: number | null;
};
async function readStock(db: D1Database, ids: string[]) {
  const rows = await db
    .prepare(
      `SELECT id,code,name,stock,revision,cost_paise FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(...ids)
    .all<StockRow>();
  return new Map(rows.results.map((r) => [r.id, r]));
}
function movement(
  db: D1Database,
  p: StockRow,
  delta: number,
  kind: string,
  reason: string,
  actor: string,
  id = crypto.randomUUID(),
) {
  return db
    .prepare(
      `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,kind)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      kind,
      p.id,
      delta,
      p.stock,
      p.stock + delta,
      p.revision,
      reason,
      actor,
      kind,
    );
}
/** Builds statements from fresh stock and runs them atomically; retries when stock changes underneath. */
async function withStock<T>(
  db: D1Database,
  ids: string[],
  build: (
    stock: Map<string, StockRow>,
  ) => { statements: D1PreparedStatement[]; result: T } | Failure,
): Promise<T | Failure> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const built = build(await readStock(db, ids));
    if (isFailure(built)) return built;
    try {
      await db.batch(built.statements);
      return built.result;
    } catch (error) {
      if (!String(error).includes("STOCK_CONFLICT") || attempt === 3)
        throw error;
    }
  }
  return fail("Stock is changing too quickly. Please try again.");
}

/* ───────── Invoices ───────── */
type InvoiceRow = {
  id: string;
  number: string;
  date: string;
  status: Invoice["status"];
  customer_id: string | null;
  customer_json: string;
  supply: Supply;
  place_of_supply: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total: number;
  paid: number;
  credited: number;
  refunded: number;
  cashier: string;
  quotation_id: string | null;
  shortfall: number;
  notes: string;
  created_at: string;
  request_hash: string;
  fy: string;
};
type LineRow = {
  line_no: number;
  product_id: string;
  code: string;
  name: string;
  hsn: string;
  unit: string;
  qty: number;
  mrp: number | null;
  rate: number;
  discount: number;
  gst_rate_bp: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  cost_paise: number | null;
  returned_qty: number;
  returned_total: number;
  returned_taxable: number;
  returned_cgst: number;
  returned_sgst: number;
  returned_igst: number;
  unposted_qty: number;
};
const invoiceSummary = (r: InvoiceRow) => ({
  id: r.id,
  number: r.number,
  date: r.date,
  status: r.status,
  customerId: r.customer_id,
  customer: JSON.parse(r.customer_json) as Invoice["customer"],
  supply: r.supply,
  placeOfSupply: r.place_of_supply,
  taxable: r.taxable,
  cgst: r.cgst,
  sgst: r.sgst,
  igst: r.igst,
  roundOff: r.round_off,
  total: r.total,
  paid: r.paid,
  credited: r.credited,
  refunded: r.refunded,
  cashier: r.cashier,
  quotationId: r.quotation_id,
  shortfall: !!r.shortfall,
  notes: r.notes,
  createdAt: r.created_at,
});
async function loadInvoice(
  db: D1Database,
  id: string,
): Promise<Invoice | null> {
  const row = await db
    .prepare("SELECT * FROM invoices WHERE id=?")
    .bind(id)
    .first<InvoiceRow>();
  if (!row) return null;
  const [lines, payments, notes] = await db.batch([
    db
      .prepare(
        "SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY line_no",
      )
      .bind(id),
    db
      .prepare(
        "SELECT id,method,amount,kind,reference,date FROM payments WHERE invoice_id=? ORDER BY created_at",
      )
      .bind(id),
    db
      .prepare(
        "SELECT id,number,total,date,reason FROM credit_notes WHERE invoice_id=? ORDER BY created_at",
      )
      .bind(id),
  ]);
  return {
    ...invoiceSummary(row),
    lines: (lines.results as LineRow[]).map((l): InvoiceLine => ({
      lineNo: l.line_no,
      productId: l.product_id,
      code: l.code,
      name: l.name,
      hsn: l.hsn,
      unit: l.unit,
      qty: l.qty,
      mrp: l.mrp,
      rate: l.rate,
      discount: l.discount,
      gstRateBp: l.gst_rate_bp,
      taxable: l.taxable,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
      total: l.total,
      returnedQty: l.returned_qty,
      unpostedQty: l.unposted_qty,
    })),
    payments: payments.results as Invoice["payments"],
    creditNotes: notes.results as Invoice["creditNotes"],
  };
}

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  state_code: string;
  address: string;
  kind: Customer["kind"];
  price_list_id: string | null;
  credit_limit_paise: number;
  notes: string;
  revision: number;
  created_at: string;
  balance: number | null;
};
const CUSTOMER_SELECT = `SELECT c.*, (SELECT COALESCE(SUM(total-credited-paid+refunded),0) FROM invoices i WHERE i.customer_id=c.id) AS balance FROM customers c`;
const customer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  gstin: r.gstin,
  stateCode: r.state_code,
  address: r.address,
  kind: r.kind,
  priceListId: r.price_list_id,
  creditLimitPaise: r.credit_limit_paise,
  notes: r.notes,
  revision: r.revision,
  balancePaise: r.balance ?? 0,
  createdAt: r.created_at,
});

/** Lowest unit price a non-admin may charge, from MRP or the customer's price list. */
async function priceFloors(
  db: D1Database,
  customerRow: CustomerRow | null,
  ids: string[],
) {
  const listPrices = new Map<string, number>();
  let listDiscount = 0;
  if (customerRow?.price_list_id) {
    const [list, items] = await db.batch([
      db
        .prepare("SELECT discount_bp FROM price_lists WHERE id=?")
        .bind(customerRow.price_list_id),
      db
        .prepare(
          `SELECT product_id,price_paise FROM price_list_items WHERE price_list_id=? AND product_id IN (${ids.map(() => "?").join(",")})`,
        )
        .bind(customerRow.price_list_id, ...ids),
    ]);
    listDiscount =
      (list.results[0] as { discount_bp: number } | undefined)?.discount_bp ??
      0;
    for (const r of items.results as {
      product_id: string;
      price_paise: number;
    }[])
      listPrices.set(r.product_id, r.price_paise);
  }
  return (p: ProductRow) =>
    listPrices.get(p.id) ??
    (p.price_paise === null ? null : discounted(p.price_paise, listDiscount));
}

async function createInvoice(c: AppContext, d: InvoiceInput) {
  const db = c.env.DB;
  const viewer = c.get("viewer");
  const hash = await sha256(JSON.stringify(d));
  const existing = await db
    .prepare("SELECT request_hash FROM invoices WHERE id=?")
    .bind(d.id)
    .first<{ request_hash: string }>();
  if (existing)
    return existing.request_hash === hash
      ? { invoice: (await loadInvoice(db, d.id))!, replay: true }
      : fail("This invoice ID was already used for a different bill.");
  if (financialYear(d.date) !== d.fy)
    return fail("The invoice date does not match its financial year.", 400);
  if (!d.offline && d.date !== indiaToday())
    return fail("Online invoices are dated today.", 400);
  const settings = await erpSettings(db);
  const block = await db
    .prepare(
      "SELECT 1 FROM number_blocks WHERE device_id=? AND fy=? AND ? BETWEEN first_seq AND last_seq",
    )
    .bind(d.deviceId, d.fy, d.seq)
    .first();
  if (!block)
    return fail(
      "This invoice number was not reserved for this counter. Refresh the counter.",
    );
  const ids = d.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length)
    return fail("A product appears twice. Combine the quantities.", 400);
  const products = await db
    .prepare(
      `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(...ids)
    .all<ProductRow>();
  const byId = new Map(products.results.map((p) => [p.id, p]));
  const cust = d.customerId
    ? await db
        .prepare(`${CUSTOMER_SELECT} WHERE c.id=?`)
        .bind(d.customerId)
        .first<CustomerRow>()
    : null;
  if (d.customerId && !cust)
    return fail("The selected customer no longer exists.", 404);
  const supply: Supply =
    cust && cust.state_code !== settings.stateCode ? "inter" : "intra";
  const admin = isAdmin(viewer);
  const policy = await readSettings(db);
  const cap = admin
    ? 10000
    : policy.pricingMode === "free"
      ? 10000
      : policy.pricingMode === "capped"
        ? (viewer?.maxDiscountBp ?? policy.discountCapBp)
        : 0;
  const floorOf = await priceFloors(db, cust, ids);
  for (const l of d.lines) {
    const p = byId.get(l.productId);
    if (!p) return fail("A product on this bill no longer exists.", 404);
    if (p.gst_rate_bp === null)
      return fail(`Set the GST rate for ${p.code} before billing it.`);
    if (l.discount > l.rate * l.qty)
      return fail(`${p.code}: the discount is larger than the line.`, 400);
    if (p.price_paise !== null && l.rate > p.price_paise)
      return fail(`${p.code}: the price cannot exceed the MRP.`, 400);
    if (p.price_paise === null && l.rate === 0)
      return fail(`${p.code}: enter a price for this item.`, 400);
    const base = floorOf(p);
    if (
      !d.offline &&
      base !== null &&
      l.rate * l.qty - l.discount <
        Math.floor((base * l.qty * (10000 - cap)) / 10000)
    )
      return fail(`${p.code}: the price is below your discount limit.`, 403);
  }
  const bill = priceBill(
    d.lines.map((l) => ({
      ...l,
      gstRateBp: byId.get(l.productId)!.gst_rate_bp!,
    })),
    supply,
  );
  if (bill.total <= 0)
    return fail("The bill total must be more than zero.", 400);
  const paid = d.payments.reduce((n, p) => n + p.amount, 0);
  if (paid > bill.total)
    return fail(
      "Payments exceed the bill total. Enter the amount kept, not the cash tendered.",
      400,
    );
  if (paid < bill.total && !cust)
    return fail("Select a customer to leave a balance on credit.", 400);
  if (
    !d.offline &&
    !admin &&
    cust &&
    cust.credit_limit_paise > 0 &&
    (cust.balance ?? 0) + bill.total - paid > cust.credit_limit_paise
  )
    return fail(`This sale takes ${cust.name} over their credit limit.`, 403);
  if (d.shiftId) {
    const shift = await db
      .prepare("SELECT status FROM shifts WHERE id=?")
      .bind(d.shiftId)
      .first<{ status: string }>();
    if (!shift) return fail("The cash shift was not found.", 404);
  }
  const number = invoiceNumber(settings.invoicePrefix, d.fy, d.seq);
  const party = cust?.name || d.walkIn.name || "Walk-in customer";
  const customerSnapshot = {
    name: party,
    phone: cust?.phone || d.walkIn.phone,
    gstin: cust?.gstin ?? "",
    address: cust?.address ?? "",
    stateCode: cust?.state_code ?? settings.stateCode,
  };
  const actor = posActor(viewer);
  const result = await withStock(db, ids, (stock) => {
    let shortfall = false;
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO invoices(id,number,fy,seq,request_hash,date,customer_id,customer_json,supply,place_of_supply,taxable,cgst,sgst,igst,round_off,total,paid,shift_id,device_id,cashier,quotation_id,offline,notes,shortfall)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          d.id,
          number,
          d.fy,
          d.seq,
          hash,
          d.date,
          d.customerId,
          JSON.stringify(customerSnapshot),
          supply,
          customerSnapshot.stateCode,
          bill.taxable,
          bill.cgst,
          bill.sgst,
          bill.igst,
          bill.roundOff,
          bill.total,
          paid,
          d.shiftId,
          d.deviceId,
          actor,
          d.quotationId,
          +d.offline,
          d.notes,
          0,
        ),
    ];
    let cost: number | null = 0;
    bill.lines.forEach((l, i) => {
      const p = byId.get(l.productId)!;
      const s = stock.get(l.productId)!;
      const posted = Math.min(l.qty, s.stock);
      if (posted < l.qty) shortfall = true;
      cost =
        cost === null || p.cost_paise === null
          ? null
          : cost + p.cost_paise * l.qty;
      statements.push(
        db
          .prepare(
            `INSERT INTO invoice_lines(invoice_id,line_no,product_id,code,name,hsn,unit,qty,mrp,rate,discount,gst_rate_bp,taxable,cgst,sgst,igst,total,cost_paise,unposted_qty)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            d.id,
            i + 1,
            p.id,
            p.code,
            p.name,
            p.hsn,
            p.unit,
            l.qty,
            p.price_paise,
            l.rate,
            l.discount,
            l.gstRateBp,
            l.taxable,
            l.cgst,
            l.sgst,
            l.igst,
            l.total,
            p.cost_paise,
            l.qty - posted,
          ),
      );
      if (posted > 0)
        statements.push(
          movement(db, s, -posted, "sale", `Invoice ${number}`, actor),
        );
    });
    if (shortfall)
      statements.push(
        db.prepare("UPDATE invoices SET shortfall=1 WHERE id=?").bind(d.id),
      );
    statements.push(
      financeDocument(db, {
        id: d.id,
        kind: "sale",
        date: d.date,
        dueDate: d.date,
        number,
        party,
        gstin: customerSnapshot.gstin,
        category: "Counter sales",
        netMinor: bill.taxable,
        roundingMinor: bill.roundOff,
        cgstMinor: bill.cgst,
        sgstMinor: bill.sgst,
        igstMinor: bill.igst,
        costMinor: cost,
        supply,
        parentId: null,
        notes: d.offline ? "Recorded offline at the counter" : "",
      }),
    );
    for (const p of d.payments)
      statements.push(
        db
          .prepare(
            "INSERT INTO payments(id,invoice_id,kind,method,amount,date,reference,shift_id,actor) VALUES(?,?,'sale',?,?,?,?,?,?)",
          )
          .bind(
            p.id,
            d.id,
            p.method,
            p.amount,
            d.date,
            p.reference,
            d.shiftId,
            actor,
          ),
        financeSettlement(db, {
          id: p.id,
          documentId: d.id,
          date: d.date,
          amount: p.amount,
          refund: false,
          method: p.method,
          reference: p.reference || number,
        }),
      );
    if (d.quotationId)
      statements.push(
        db
          .prepare(
            "UPDATE quotations SET status='won',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status<>'won'",
          )
          .bind(d.quotationId),
      );
    return { statements, result: true };
  }).catch(async (error) => {
    if (
      String(error).includes("invoices.number") ||
      String(error).includes("invoices.fy")
    )
      return fail(
        `Invoice number ${number} is already used. Refresh the counter.`,
      );
    if (String(error).includes("UNIQUE constraint failed: invoices.id")) {
      const again = await db
        .prepare("SELECT request_hash FROM invoices WHERE id=?")
        .bind(d.id)
        .first<{ request_hash: string }>();
      if (again?.request_hash === hash) return true;
    }
    throw error;
  });
  if (isFailure(result)) return result;
  return { invoice: (await loadInvoice(db, d.id))!, replay: false };
}

/* ───────── Credit notes (returns and cancellations) ───────── */
async function createCreditNote(
  c: AppContext,
  invoiceId: string,
  d: z.infer<typeof creditNoteInput>,
) {
  const db = c.env.DB;
  const viewer = c.get("viewer");
  const done = await db
    .prepare("SELECT id FROM credit_notes WHERE id=?")
    .bind(d.id)
    .first();
  if (done)
    return { invoice: (await loadInvoice(db, invoiceId))!, replay: true };
  const invoice = await loadInvoice(db, invoiceId);
  if (!invoice) return fail("Invoice not found.", 404);
  const lineNos = d.lines.map((l) => l.lineNo);
  if (new Set(lineNos).size !== lineNos.length)
    return fail("A line appears twice.", 400);
  const lineRows = (
    await db
      .prepare("SELECT * FROM invoice_lines WHERE invoice_id=?")
      .bind(invoiceId)
      .all<LineRow>()
  ).results;
  const byNo = new Map(lineRows.map((l) => [l.line_no, l]));
  const credit: (LineRow & {
    creditQty: number;
    cTotal: number;
    cTaxable: number;
    cCgst: number;
    cSgst: number;
    cIgst: number;
    restockQty: number;
  })[] = [];
  for (const r of d.lines) {
    const l = byNo.get(r.lineNo);
    if (!l) return fail(`Line ${r.lineNo} is not on this invoice.`, 400);
    if (r.qty > l.qty - l.returned_qty)
      return fail(
        `${l.code}: only ${l.qty - l.returned_qty} can be returned.`,
        400,
      );
    const final = r.qty === l.qty - l.returned_qty;
    // The last return of a line takes the exact remainder, so credits never exceed the original.
    const split = final
      ? {
          total: l.total - l.returned_total,
          taxable: l.taxable - l.returned_taxable,
          cgst: l.cgst - l.returned_cgst,
          sgst: l.sgst - l.returned_sgst,
          igst: l.igst - l.returned_igst,
        }
      : splitInclusive(
          Math.floor((l.total * r.qty) / l.qty),
          l.gst_rate_bp,
          invoice.supply,
        );
    const postedRemaining = l.qty - l.unposted_qty - l.returned_qty;
    credit.push({
      ...l,
      creditQty: r.qty,
      cTotal: split.total,
      cTaxable: split.taxable,
      cCgst: split.cgst,
      cSgst: split.sgst,
      cIgst: split.igst,
      restockQty: d.restock ? Math.min(r.qty, Math.max(0, postedRemaining)) : 0,
    });
  }
  const linesTotal = credit.reduce((n, l) => n + l.cTotal, 0);
  const remaining = invoice.total - invoice.credited;
  const finishes =
    credit.length > 0 &&
    lineRows.every((l) => {
      const c2 = credit.find((x) => x.line_no === l.line_no);
      return l.qty - l.returned_qty - (c2?.creditQty ?? 0) === 0;
    });
  const total = finishes ? remaining : Math.min(linesTotal, remaining);
  if (total <= 0) return fail("Nothing remains to credit on this invoice.");
  const sum = (k: "cTaxable" | "cCgst" | "cSgst" | "cIgst") =>
    credit.reduce((n, l) => n + l[k], 0);
  const refundDue = Math.max(
    0,
    invoice.paid -
      invoice.refunded -
      (invoice.total - invoice.credited - total),
  );
  const settings = await erpSettings(db);
  const date = indiaToday();
  const fy = financialYear(date);
  const counter = await db
    .prepare(
      "INSERT INTO counters(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=value+1 RETURNING value",
    )
    .bind(`CN-${fy}`)
    .first<{ value: number }>();
  const number = creditNoteNumber(settings.invoicePrefix, fy, counter!.value);
  const actor = posActor(viewer);
  const cost = credit.every((l) => l.cost_paise !== null)
    ? credit.reduce((n, l) => n + l.cost_paise! * l.creditQty, 0)
    : null;
  const parentCost = lineRows.every((l) => l.cost_paise !== null);
  const restockIds = credit
    .filter((l) => l.restockQty > 0)
    .map((l) => l.product_id);
  const result = await withStock(
    db,
    restockIds.length ? restockIds : [credit[0].product_id],
    (stock) => {
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO credit_notes(id,number,invoice_id,date,reason,restock,lines_json,taxable,cgst,sgst,igst,total,actor)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            d.id,
            number,
            invoiceId,
            date,
            d.reason,
            +d.restock,
            JSON.stringify(
              credit.map((l) => ({
                lineNo: l.line_no,
                code: l.code,
                name: l.name,
                qty: l.creditQty,
                total: l.cTotal,
                restocked: l.restockQty,
              })),
            ),
            sum("cTaxable"),
            sum("cCgst"),
            sum("cSgst"),
            sum("cIgst"),
            total,
            actor,
          ),
        db
          .prepare(
            `UPDATE invoices SET credited=credited+?,refunded=refunded+?,status=CASE WHEN credited+?>=total THEN 'cancelled' ELSE status END WHERE id=?`,
          )
          .bind(total, refundDue, total, invoiceId),
        financeDocument(db, {
          id: d.id,
          kind: "sale_credit",
          date,
          dueDate: date,
          number,
          party: invoice.customer.name,
          gstin: invoice.customer.gstin,
          category: "Counter sales",
          netMinor: sum("cTaxable"),
          roundingMinor: total - linesTotal,
          cgstMinor: sum("cCgst"),
          sgstMinor: sum("cSgst"),
          igstMinor: sum("cIgst"),
          costMinor: parentCost ? cost : null,
          supply: invoice.supply,
          parentId: invoiceId,
          notes: d.reason,
        }),
      ];
      for (const l of credit) {
        statements.push(
          db
            .prepare(
              `UPDATE invoice_lines SET returned_qty=returned_qty+?,returned_total=returned_total+?,returned_taxable=returned_taxable+?,
            returned_cgst=returned_cgst+?,returned_sgst=returned_sgst+?,returned_igst=returned_igst+? WHERE invoice_id=? AND line_no=?`,
            )
            .bind(
              l.creditQty,
              l.cTotal,
              l.cTaxable,
              l.cCgst,
              l.cSgst,
              l.cIgst,
              invoiceId,
              l.line_no,
            ),
        );
        if (l.restockQty > 0)
          statements.push(
            movement(
              db,
              stock.get(l.product_id)!,
              l.restockQty,
              "return_in",
              `Credit note ${number}`,
              actor,
            ),
          );
      }
      if (refundDue > 0) {
        const id = crypto.randomUUID();
        statements.push(
          db
            .prepare(
              "INSERT INTO payments(id,invoice_id,kind,method,amount,date,reference,shift_id,actor) VALUES(?,?,'refund',?,?,?,?,?,?)",
            )
            .bind(
              id,
              invoiceId,
              d.refundMethod,
              refundDue,
              date,
              d.refundReference || number,
              d.shiftId,
              actor,
            ),
          financeSettlement(db, {
            id,
            documentId: invoiceId,
            date,
            amount: refundDue,
            refund: true,
            method: d.refundMethod,
            reference: number,
          }),
        );
      }
      return { statements, result: true };
    },
  );
  if (isFailure(result)) return result;
  return {
    invoice: (await loadInvoice(db, invoiceId))!,
    replay: false,
    refunded: refundDue,
    number,
  };
}

/* ───────── Shifts ───────── */
async function shiftSummary(db: D1Database, id: string) {
  const shift = await db
    .prepare("SELECT * FROM shifts WHERE id=?")
    .bind(id)
    .first<{
      id: string;
      device_id: string;
      status: string;
      opened_by: string;
      opened_at: string;
      opening_float: number;
      closed_by: string | null;
      closed_at: string | null;
      expected_cash: number | null;
      counted_cash: number | null;
      notes: string;
    }>();
  if (!shift) return null;
  const [methods, cash, invoices, returns, expenses] = await db.batch([
    db
      .prepare(
        "SELECT method,kind,SUM(amount) AS amount,COUNT(*) AS n FROM payments WHERE shift_id=? GROUP BY method,kind",
      )
      .bind(id),
    db
      .prepare(
        "SELECT id,kind,amount,reason,actor,created_at AS createdAt FROM cash_movements WHERE shift_id=? ORDER BY created_at",
      )
      .bind(id),
    db
      .prepare(
        "SELECT COUNT(*) AS n,COALESCE(SUM(total),0) AS total FROM invoices WHERE shift_id=?",
      )
      .bind(id),
    db
      .prepare(
        "SELECT COUNT(*) AS n,COALESCE(SUM(c.total),0) AS total FROM credit_notes c JOIN payments p ON p.invoice_id=c.invoice_id AND p.kind='refund' AND p.reference=c.number WHERE p.shift_id=?",
      )
      .bind(id),
    db
      .prepare(
        "SELECT COALESCE(SUM(paid),0) AS total FROM expenses WHERE shift_id=? AND status='recorded'",
      )
      .bind(id),
  ]);
  const rows = methods.results as {
    method: string;
    kind: string;
    amount: number;
    n: number;
  }[];
  const cashRows = cash.results as { kind: string; amount: number }[];
  const cashIn = rows
    .filter((r) => r.method === "cash" && r.kind !== "refund")
    .reduce((n, r) => n + r.amount, 0);
  const cashOut = rows
    .filter((r) => r.method === "cash" && r.kind === "refund")
    .reduce((n, r) => n + r.amount, 0);
  const moved = cashRows.reduce(
    (n, r) => n + (r.kind === "in" ? r.amount : -r.amount),
    0,
  );
  const expensePaid = (expenses.results[0] as { total: number }).total;
  return {
    id: shift.id,
    deviceId: shift.device_id,
    status: shift.status,
    openedBy: shift.opened_by,
    openedAt: shift.opened_at,
    openingFloat: shift.opening_float,
    closedBy: shift.closed_by,
    closedAt: shift.closed_at,
    countedCash: shift.counted_cash,
    notes: shift.notes,
    byMethod: rows,
    cashMovements: cash.results,
    invoices: invoices.results[0] as { n: number; total: number },
    returns: returns.results[0] as { n: number; total: number },
    expensesPaid: expensePaid,
    expectedCash:
      shift.expected_cash ??
      shift.opening_float + cashIn - cashOut + moved - expensePaid,
  };
}

/* ───────── Routes ───────── */
const routes = new Hono<AppEnv>();
routes.use("/pos/*", async (c, next) => {
  const v = c.get("viewer");
  if (!v) return c.json({ error: "Sign in to use the billing counter." }, 401);
  if (!v.posAccess)
    return c.json({ error: "This account does not have billing access." }, 403);
  await next();
});
const result = (c: AppContext, r: unknown, okStatus: 200 | 201 = 200) =>
  isFailure(r)
    ? c.json({ error: r.fail.message }, r.fail.status as 400)
    : c.json(r as object, okStatus);

routes.get("/pos/bootstrap", async (c) => {
  const device = z.string().min(8).max(64).parse(c.req.query("device"));
  const db = c.env.DB;
  const [settings, policy, products, lists, items, shift] = await Promise.all([
    erpSettings(db),
    readSettings(db),
    db
      .prepare(
        "SELECT id,code,name,category,unit,hsn,gst_rate_bp,barcode,price_paise,stock,image_key,bin FROM products ORDER BY name LIMIT 5000",
      )
      .all(),
    db
      .prepare(
        "SELECT id,name,discount_bp AS discountBp FROM price_lists ORDER BY name",
      )
      .all(),
    db
      .prepare(
        "SELECT price_list_id AS priceListId,product_id AS productId,price_paise AS pricePaise FROM price_list_items",
      )
      .all(),
    db
      .prepare("SELECT id FROM shifts WHERE device_id=? AND status='open'")
      .bind(device)
      .first<{ id: string }>(),
  ]);
  const v = c.get("viewer")!;
  return c.json({
    settings,
    policy: {
      admin: isAdmin(v),
      mode: policy.pricingMode,
      capBp: isAdmin(v)
        ? 10000
        : policy.pricingMode === "free"
          ? 10000
          : policy.pricingMode === "capped"
            ? (v.maxDiscountBp ?? policy.discountCapBp)
            : 0,
    },
    cashier: posActor(v),
    today: indiaToday(),
    products: (products.results as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      hsn: p.hsn,
      gstRateBp: p.gst_rate_bp,
      barcode: p.barcode ?? "",
      pricePaise: p.price_paise,
      stock: p.stock,
      bin: p.bin,
      imageUrl: p.image_key ? `/api/media/${p.image_key}` : null,
    })),
    priceLists: lists.results,
    priceListItems: items.results,
    shift: shift ? await shiftSummary(db, shift.id) : null,
  });
});
routes.post("/pos/numbers", async (c) => {
  const { deviceId, date } = z
    .object({
      deviceId: z.string().min(8).max(64),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse(await c.req.json());
  const fy = financialYear(date ?? indiaToday());
  const settings = await erpSettings(c.env.DB);
  const row = await c.env.DB.prepare(
    "INSERT INTO counters(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=value+? RETURNING value",
  )
    .bind(`INV-${fy}`, settings.blockSize, settings.blockSize)
    .first<{ value: number }>();
  const last = row!.value,
    first = last - settings.blockSize + 1;
  await c.env.DB.prepare(
    "INSERT INTO number_blocks(device_id,fy,first_seq,last_seq,issued_to) VALUES(?,?,?,?,?)",
  )
    .bind(deviceId, fy, first, last, posActor(c.get("viewer")))
    .run();
  return c.json({ fy, first, last, prefix: settings.invoicePrefix });
});
routes.get("/pos/customers", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await c.env.DB.prepare(
    `${CUSTOMER_SELECT} WHERE c.name LIKE ? OR c.phone LIKE ? OR c.gstin LIKE ? ORDER BY c.name LIMIT 25`,
  )
    .bind(like, like, like)
    .all<CustomerRow>();
  return c.json(rows.results.map(customer));
});
async function saveCustomer(c: AppContext, id: string, revision?: number) {
  const d = customerInput.parse(await c.req.json());
  if (d.gstin && !d.gstin.startsWith(d.stateCode))
    return c.json(
      { error: "The GSTIN must start with the customer's state code." },
      400,
    );
  if (revision === undefined) {
    await c.env.DB.prepare(
      "INSERT INTO customers(id,name,phone,gstin,state_code,address,kind,price_list_id,credit_limit_paise,notes) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        d.name,
        d.phone,
        d.gstin,
        d.stateCode,
        d.address,
        d.kind,
        d.priceListId,
        d.creditLimitPaise,
        d.notes,
      )
      .run();
  } else {
    const row = await c.env.DB.prepare(
      `UPDATE customers SET name=?,phone=?,gstin=?,state_code=?,address=?,kind=?,price_list_id=?,credit_limit_paise=?,notes=?,revision=revision+1
      WHERE id=? AND revision=? RETURNING id`,
    )
      .bind(
        d.name,
        d.phone,
        d.gstin,
        d.stateCode,
        d.address,
        d.kind,
        d.priceListId,
        d.creditLimitPaise,
        d.notes,
        id,
        revision,
      )
      .first();
    if (!row)
      return c.json(
        { error: "This customer changed. Refresh and try again." },
        409,
      );
  }
  const saved = await c.env.DB.prepare(`${CUSTOMER_SELECT} WHERE c.id=?`)
    .bind(id)
    .first<CustomerRow>();
  return c.json(customer(saved!), revision === undefined ? 201 : 200);
}
routes.post("/pos/customers", (c) => saveCustomer(c, crypto.randomUUID()));
routes.post("/pos/invoices", async (c) => {
  const r = await createInvoice(c, invoiceInput.parse(await c.req.json()));
  return isFailure(r) ? result(c, r) : c.json(r, r.replay ? 200 : 201);
});
routes.get("/pos/invoices", async (c) => {
  const q = z
    .object({ shift: z.uuid().optional(), q: z.string().max(60).optional() })
    .parse(c.req.query());
  const like = `%${(q.q ?? "").replace(/[%_]/g, "")}%`;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM invoices WHERE (? IS NULL OR shift_id=?) AND (number LIKE ? OR customer_json LIKE ?) ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(q.shift ?? null, q.shift ?? null, like, like)
    .all<InvoiceRow>();
  return c.json(rows.results.map(invoiceSummary));
});
routes.get("/pos/invoices/:id", async (c) => {
  const invoice = await loadInvoice(c.env.DB, c.req.param("id"));
  return invoice
    ? c.json(invoice)
    : c.json({ error: "Invoice not found." }, 404);
});
routes.post("/pos/invoices/:id/credit-notes", async (c) =>
  result(
    c,
    await createCreditNote(
      c,
      c.req.param("id"),
      creditNoteInput.parse(await c.req.json()),
    ),
    201,
  ),
);
routes.get("/pos/quotation", async (c) => {
  const number = z
    .string()
    .trim()
    .min(3)
    .max(30)
    .parse(c.req.query("number"))
    .toUpperCase();
  const row = await c.env.DB.prepare(
    "SELECT id,number,customer_name,customer_phone,items_json,status FROM quotations WHERE number=?",
  )
    .bind(number)
    .first<{
      id: string;
      number: string;
      customer_name: string;
      customer_phone: string;
      items_json: string;
      status: string;
    }>();
  if (!row) return c.json({ error: `Quotation ${number} was not found.` }, 404);
  return c.json({
    id: row.id,
    number: row.number,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: JSON.parse(row.items_json),
  });
});

routes.post("/pos/shifts", async (c) => {
  const d = z
    .object({
      id: z.uuid(),
      deviceId: z.string().min(8).max(64),
      openingFloat: z.number().int().min(0).max(100_000_000),
    })
    .strict()
    .parse(await c.req.json());
  try {
    await c.env.DB.prepare(
      "INSERT INTO shifts(id,device_id,opened_by,opening_float) VALUES(?,?,?,?)",
    )
      .bind(d.id, d.deviceId, posActor(c.get("viewer")), d.openingFloat)
      .run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      const open = await c.env.DB.prepare(
        "SELECT id FROM shifts WHERE device_id=? AND status='open'",
      )
        .bind(d.deviceId)
        .first<{ id: string }>();
      if (open) return c.json(await shiftSummary(c.env.DB, open.id));
    }
    throw error;
  }
  return c.json(await shiftSummary(c.env.DB, d.id), 201);
});
routes.get("/pos/shifts/:id", async (c) => {
  const s = await shiftSummary(c.env.DB, c.req.param("id"));
  return s ? c.json(s) : c.json({ error: "Shift not found." }, 404);
});
routes.post("/pos/shifts/:id/cash", async (c) => {
  const d = z
    .object({
      id: z.uuid(),
      kind: z.enum(["in", "out"]),
      amount: z.number().int().positive().max(100_000_000),
      reason: z.string().trim().min(3).max(300),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "INSERT INTO cash_movements(id,shift_id,kind,amount,reason,actor) SELECT ?,id,?,?,?,? FROM shifts WHERE id=? AND status='open' ON CONFLICT(id) DO NOTHING RETURNING id",
  )
    .bind(
      d.id,
      d.kind,
      d.amount,
      d.reason,
      posActor(c.get("viewer")),
      c.req.param("id"),
    )
    .first();
  if (!row) {
    const exists = await c.env.DB.prepare(
      "SELECT 1 FROM cash_movements WHERE id=?",
    )
      .bind(d.id)
      .first();
    if (!exists) return c.json({ error: "This shift is closed." }, 409);
  }
  return c.json(await shiftSummary(c.env.DB, c.req.param("id")));
});
routes.post("/pos/shifts/:id/close", async (c) => {
  const d = z
    .object({
      countedCash: z.number().int().min(0).max(100_000_000),
      notes: z.string().trim().max(500),
    })
    .strict()
    .parse(await c.req.json());
  const s = await shiftSummary(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "Shift not found." }, 404);
  if (s.status === "closed") return c.json(s);
  await c.env.DB.prepare(
    "UPDATE shifts SET status='closed',closed_by=?,closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),expected_cash=?,counted_cash=?,notes=? WHERE id=? AND status='open'",
  )
    .bind(
      posActor(c.get("viewer")),
      s.expectedCash,
      d.countedCash,
      d.notes,
      s.id,
    )
    .run();
  return c.json(await shiftSummary(c.env.DB, s.id));
});

/* ───────── Admin: customers ───────── */
routes.get("/admin/erp/customers", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await c.env.DB.prepare(
    `${CUSTOMER_SELECT} WHERE c.name LIKE ? OR c.phone LIKE ? OR c.gstin LIKE ? ORDER BY c.name LIMIT 1000`,
  )
    .bind(like, like, like)
    .all<CustomerRow>();
  return c.json(rows.results.map(customer));
});
routes.post("/admin/erp/customers", (c) =>
  saveCustomer(c, crypto.randomUUID()),
);
routes.put("/admin/erp/customers/:id", async (c) => {
  const revision = z.coerce
    .number()
    .int()
    .positive()
    .parse(c.req.query("revision"));
  return saveCustomer(c, c.req.param("id"), revision);
});
routes.get("/admin/erp/customers/:id/ledger", async (c) => {
  const id = c.req.param("id");
  const [inv, pay, notes] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT id,number,date,total,paid,credited,refunded,status FROM invoices WHERE customer_id=? ORDER BY date,created_at",
    ).bind(id),
    c.env.DB.prepare(
      "SELECT p.id,p.date,p.kind,p.method,p.amount,p.reference,i.number FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.customer_id=? ORDER BY p.date,p.created_at",
    ).bind(id),
    c.env.DB.prepare(
      "SELECT c.id,c.number,c.date,c.total,i.number AS invoice FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id WHERE i.customer_id=? ORDER BY c.date",
    ).bind(id),
  ]);
  return c.json({
    invoices: inv.results,
    payments: pay.results,
    creditNotes: notes.results,
  });
});
/** Customer payment, allocated to the oldest open invoices first. */
routes.post("/admin/erp/customers/:id/receipts", async (c) => {
  const d = settlementInput.parse(await c.req.json());
  const db = c.env.DB;
  if (
    await db
      .prepare("SELECT 1 FROM payments WHERE id=? OR id LIKE ?")
      .bind(d.id, `${d.id}:%`)
      .first()
  )
    return c.json({ saved: true, replay: true });
  const open = (
    await db
      .prepare(
        "SELECT id,number,date,total,paid,credited,refunded FROM invoices WHERE customer_id=? AND total-credited-paid+refunded>0 ORDER BY date,created_at",
      )
      .bind(c.req.param("id"))
      .all<{
        id: string;
        number: string;
        date: string;
        total: number;
        paid: number;
        credited: number;
        refunded: number;
      }>()
  ).results;
  const due = open.reduce((n, i) => n + balanceOf(i), 0);
  if (d.amount > due)
    return c.json(
      {
        error: `The customer owes ${(due / 100).toFixed(2)}. Record no more than that.`,
      },
      400,
    );
  let left = d.amount;
  const statements: D1PreparedStatement[] = [];
  const actor = posActor(c.get("viewer"));
  for (const i of open) {
    if (!left) break;
    const amount = Math.min(left, balanceOf(i));
    left -= amount;
    const id = `${d.id}:${i.id.slice(0, 8)}`;
    const date = d.date < i.date ? i.date : d.date;
    statements.push(
      db
        .prepare(
          "INSERT INTO payments(id,invoice_id,kind,method,amount,date,reference,shift_id,actor) VALUES(?,?,'receipt',?,?,?,?,?,?)",
        )
        .bind(id, i.id, d.method, amount, date, d.reference, d.shiftId, actor),
      db
        .prepare("UPDATE invoices SET paid=paid+? WHERE id=?")
        .bind(amount, i.id),
      financeSettlement(db, {
        id,
        documentId: i.id,
        date,
        amount,
        refund: false,
        method: d.method,
        reference: d.reference || i.number,
      }),
    );
  }
  await db.batch(statements);
  return c.json({ saved: true, allocated: statements.length / 3 }, 201);
});
routes.post("/pos/invoices/:id/payments", async (c) => {
  const d = settlementInput.parse(await c.req.json());
  const db = c.env.DB;
  if (await db.prepare("SELECT 1 FROM payments WHERE id=?").bind(d.id).first())
    return c.json({ saved: true, replay: true });
  const i = await db
    .prepare(
      "SELECT id,number,date,total,paid,credited,refunded FROM invoices WHERE id=?",
    )
    .bind(c.req.param("id"))
    .first<{
      id: string;
      number: string;
      date: string;
      total: number;
      paid: number;
      credited: number;
      refunded: number;
    }>();
  if (!i) return c.json({ error: "Invoice not found." }, 404);
  if (d.amount > balanceOf(i))
    return c.json({ error: "The payment is more than the balance due." }, 400);
  const actor = posActor(c.get("viewer"));
  await db.batch([
    db
      .prepare(
        "INSERT INTO payments(id,invoice_id,kind,method,amount,date,reference,shift_id,actor) VALUES(?,?,'receipt',?,?,?,?,?,?)",
      )
      .bind(
        d.id,
        i.id,
        d.method,
        d.amount,
        d.date < i.date ? i.date : d.date,
        d.reference,
        d.shiftId,
        actor,
      ),
    db
      .prepare("UPDATE invoices SET paid=paid+? WHERE id=?")
      .bind(d.amount, i.id),
    financeSettlement(db, {
      id: d.id,
      documentId: i.id,
      date: d.date < i.date ? i.date : d.date,
      amount: d.amount,
      refund: false,
      method: d.method,
      reference: d.reference || i.number,
    }),
  ]);
  return c.json(await loadInvoice(db, i.id), 201);
});

/* ───────── Admin: invoices ───────── */
routes.get("/admin/erp/invoices", async (c) => {
  const q = z
    .object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      q: z.string().max(80).optional(),
      due: z.enum(["1"]).optional(),
    })
    .parse(c.req.query());
  const like = `%${(q.q ?? "").replace(/[%_]/g, "")}%`;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM invoices WHERE date BETWEEN ? AND ? AND (number LIKE ? OR customer_json LIKE ?)
    ${q.due ? "AND total-credited-paid+refunded>0" : ""} ORDER BY date DESC,created_at DESC LIMIT 2000`,
  )
    .bind(q.from ?? "0000-01-01", q.to ?? "9999-12-31", like, like)
    .all<InvoiceRow>();
  return c.json(rows.results.map(invoiceSummary));
});

/* ───────── Admin: suppliers and purchases ───────── */
type SupplierRow = {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  state_code: string;
  address: string;
  notes: string;
  revision: number;
  payable: number | null;
};
const SUPPLIER_SELECT = `SELECT s.*, (SELECT COALESCE(SUM(total-paid-returned),0) FROM purchases p WHERE p.supplier_id=s.id) AS payable FROM suppliers s`;
const supplier = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  gstin: r.gstin,
  stateCode: r.state_code,
  address: r.address,
  notes: r.notes,
  revision: r.revision,
  payablePaise: r.payable ?? 0,
});
routes.get("/admin/erp/suppliers", async (c) => {
  const rows = await c.env.DB.prepare(
    `${SUPPLIER_SELECT} ORDER BY s.name LIMIT 1000`,
  ).all<SupplierRow>();
  return c.json(rows.results.map(supplier));
});
routes.post("/admin/erp/suppliers", async (c) => {
  const d = supplierInput.parse(await c.req.json());
  if (d.gstin && !d.gstin.startsWith(d.stateCode))
    return c.json(
      { error: "The GSTIN must start with the supplier's state code." },
      400,
    );
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO suppliers(id,name,phone,gstin,state_code,address,notes) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, d.name, d.phone, d.gstin, d.stateCode, d.address, d.notes)
    .run();
  return c.json(
    supplier(
      (await c.env.DB.prepare(`${SUPPLIER_SELECT} WHERE s.id=?`)
        .bind(id)
        .first<SupplierRow>())!,
    ),
    201,
  );
});
routes.put("/admin/erp/suppliers/:id", async (c) => {
  const d = supplierInput
    .extend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE suppliers SET name=?,phone=?,gstin=?,state_code=?,address=?,notes=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id",
  )
    .bind(
      d.name,
      d.phone,
      d.gstin,
      d.stateCode,
      d.address,
      d.notes,
      c.req.param("id"),
      d.revision,
    )
    .first();
  if (!row)
    return c.json(
      { error: "This supplier changed. Refresh and try again." },
      409,
    );
  return c.json(
    supplier(
      (await c.env.DB.prepare(`${SUPPLIER_SELECT} WHERE s.id=?`)
        .bind(c.req.param("id"))
        .first<SupplierRow>())!,
    ),
  );
});
type PurchaseLine = {
  productId: string;
  code: string;
  name: string;
  qty: number;
  costPaise: number;
  gstRateBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  returnedQty: number;
};
routes.get("/admin/erp/purchases", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.*,s.name AS supplier FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.date DESC,p.created_at DESC LIMIT 1000`,
  ).all<Record<string, unknown>>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      supplierId: r.supplier_id,
      supplier: r.supplier,
      billNumber: r.bill_number,
      date: r.date,
      supply: r.supply,
      lines: JSON.parse(String(r.lines_json)) as PurchaseLine[],
      taxable: r.taxable,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      roundOff: r.round_off,
      total: r.total,
      paid: r.paid,
      returned: r.returned,
      notes: r.notes,
      createdAt: r.created_at,
    })),
  );
});
routes.post("/admin/erp/purchases", async (c) => {
  const d = purchaseInput.parse(await c.req.json());
  const db = c.env.DB;
  if (await db.prepare("SELECT 1 FROM purchases WHERE id=?").bind(d.id).first())
    return c.json({ saved: true, replay: true });
  const sup = await db
    .prepare("SELECT * FROM suppliers WHERE id=?")
    .bind(d.supplierId)
    .first<SupplierRow>();
  if (!sup) return c.json({ error: "Supplier not found." }, 404);
  const dup = await db
    .prepare("SELECT 1 FROM purchases WHERE supplier_id=? AND bill_number=?")
    .bind(d.supplierId, d.billNumber)
    .first();
  if (dup)
    return c.json(
      { error: `Bill ${d.billNumber} from ${sup.name} is already recorded.` },
      409,
    );
  const ids = d.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length)
    return c.json(
      { error: "A product appears twice. Combine the quantities." },
      400,
    );
  const settings = await erpSettings(db);
  const supply: Supply =
    sup.state_code !== settings.stateCode ? "inter" : "intra";
  const actor = actorName(c.get("viewer"));
  const r = await withStock(db, ids, (stock) => {
    for (const id of ids)
      if (!stock.get(id))
        return fail("A product on this bill no longer exists.", 404);
    const lines: PurchaseLine[] = d.lines.map((l) => {
      const p = stock.get(l.productId)!;
      return {
        productId: p.id,
        code: p.code,
        name: p.name,
        qty: l.qty,
        costPaise: l.costPaise,
        gstRateBp: l.gstRateBp,
        ...addTax(l.costPaise * l.qty, l.gstRateBp, supply),
        returnedQty: 0,
      };
    });
    const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") =>
      lines.reduce((n, l) => n + l[k], 0);
    const gross = sum("total");
    const total = Math.round(gross / 100) * 100;
    if (d.payment && d.payment.amount > total)
      return fail("The payment is more than the bill total.", 400);
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO purchases(id,supplier_id,bill_number,date,supply,lines_json,taxable,cgst,sgst,igst,round_off,total,paid,notes,actor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          d.id,
          d.supplierId,
          d.billNumber,
          d.date,
          supply,
          JSON.stringify(lines),
          sum("taxable"),
          sum("cgst"),
          sum("sgst"),
          sum("igst"),
          total - gross,
          total,
          d.payment?.amount ?? 0,
          d.notes,
          actor,
        ),
      financeDocument(db, {
        id: d.id,
        kind: "purchase",
        date: d.date,
        dueDate: d.date,
        number: d.billNumber,
        party: sup.name,
        gstin: sup.gstin,
        category: "Inventory purchases",
        netMinor: sum("taxable"),
        roundingMinor: total - gross,
        cgstMinor: sum("cgst"),
        sgstMinor: sum("sgst"),
        igstMinor: sum("igst"),
        costMinor: null,
        supply,
        parentId: null,
        notes: d.notes,
      }),
    ];
    for (const l of lines) {
      const p = stock.get(l.productId)!;
      // Moving average cost (excluding GST) keeps stock valuation current.
      const average =
        p.cost_paise === null || p.stock === 0
          ? l.costPaise
          : Math.round(
              (p.stock * p.cost_paise + l.qty * l.costPaise) /
                (p.stock + l.qty),
            );
      statements.push(
        movement(
          db,
          p,
          l.qty,
          "purchase",
          `Purchase ${d.billNumber} · ${sup.name}`,
          actor,
        ),
        db
          .prepare("UPDATE products SET cost_paise=? WHERE id=?")
          .bind(average, p.id),
      );
    }
    if (d.payment) {
      const id = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            "INSERT INTO supplier_payments(id,purchase_id,method,amount,date,reference,actor) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            d.id,
            d.payment.method,
            d.payment.amount,
            d.date,
            d.payment.reference,
            actor,
          ),
        financeSettlement(db, {
          id,
          documentId: d.id,
          date: d.date,
          amount: d.payment.amount,
          refund: false,
          method: d.payment.method,
          reference: d.payment.reference || d.billNumber,
        }),
      );
    }
    return { statements, result: { saved: true } };
  });
  return result(c, r, 201);
});
routes.post("/admin/erp/purchases/:id/payments", async (c) => {
  const d = settlementInput.parse(await c.req.json());
  const db = c.env.DB;
  if (
    await db
      .prepare("SELECT 1 FROM supplier_payments WHERE id=?")
      .bind(d.id)
      .first()
  )
    return c.json({ saved: true, replay: true });
  const p = await db
    .prepare(
      "SELECT id,bill_number,date,total,paid,returned FROM purchases WHERE id=?",
    )
    .bind(c.req.param("id"))
    .first<{
      id: string;
      bill_number: string;
      date: string;
      total: number;
      paid: number;
      returned: number;
    }>();
  if (!p) return c.json({ error: "Purchase not found." }, 404);
  if (d.amount > p.total - p.paid - p.returned)
    return c.json({ error: "The payment is more than the amount owed." }, 400);
  if (d.date < p.date)
    return c.json(
      { error: "The payment cannot be dated before the bill." },
      400,
    );
  await db.batch([
    db
      .prepare(
        "INSERT INTO supplier_payments(id,purchase_id,method,amount,date,reference,actor) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        d.id,
        p.id,
        d.method,
        d.amount,
        d.date,
        d.reference,
        actorName(c.get("viewer")),
      ),
    db
      .prepare("UPDATE purchases SET paid=paid+? WHERE id=?")
      .bind(d.amount, p.id),
    financeSettlement(db, {
      id: d.id,
      documentId: p.id,
      date: d.date,
      amount: d.amount,
      refund: false,
      method: d.method,
      reference: d.reference || p.bill_number,
    }),
  ]);
  return c.json({ saved: true }, 201);
});
/** Supplier return (debit note): stock goes back; any overpayment is refunded. */
routes.post("/admin/erp/purchases/:id/returns", async (c) => {
  const d = purchaseReturnInput.parse(await c.req.json());
  const db = c.env.DB;
  if (
    await db
      .prepare("SELECT 1 FROM purchase_returns WHERE id=?")
      .bind(d.id)
      .first()
  )
    return c.json({ saved: true, replay: true });
  const p = await db
    .prepare(
      "SELECT p.*,s.name AS supplier,s.gstin FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?",
    )
    .bind(c.req.param("id"))
    .first<
      Record<string, unknown> & {
        id: string;
        bill_number: string;
        date: string;
        supply: Supply;
        lines_json: string;
        total: number;
        paid: number;
        returned: number;
        supplier: string;
        gstin: string;
      }
    >();
  if (!p) return c.json({ error: "Purchase not found." }, 404);
  if (d.date < p.date)
    return c.json({ error: "A return cannot be dated before the bill." }, 400);
  const lines = JSON.parse(p.lines_json) as PurchaseLine[];
  // Credits must match the original accounting party exactly, even if the supplier was renamed.
  const parent = JSON.parse(
    (await db
      .prepare("SELECT data FROM finance_documents WHERE id=?")
      .bind(p.id)
      .first<{ data: string }>())!.data,
  ) as { party: string; gstin: string };
  const picked: {
    line: PurchaseLine;
    qty: number;
    split: ReturnType<typeof addTax>;
  }[] = [];
  for (const r of d.lines) {
    const line = lines.find((l) => l.productId === r.productId);
    if (!line)
      return c.json({ error: "A returned product is not on this bill." }, 400);
    if (r.qty > line.qty - line.returnedQty)
      return c.json(
        {
          error: `${line.code}: only ${line.qty - line.returnedQty} can be returned.`,
        },
        400,
      );
    picked.push({
      line,
      qty: r.qty,
      split: addTax(line.costPaise * r.qty, line.gstRateBp, p.supply),
    });
  }
  const total = Math.min(
    picked.reduce((n, x) => n + x.split.total, 0),
    p.total - p.returned,
  );
  if (total <= 0)
    return c.json({ error: "Nothing remains to return on this bill." }, 409);
  const refund = Math.max(0, p.paid - (p.total - p.returned - total));
  if (refund > 0 && !d.refundMethod)
    return c.json(
      { error: "Choose how the supplier refunds the overpayment." },
      400,
    );
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst") =>
    picked.reduce((n, x) => n + x.split[k], 0);
  const actor = actorName(c.get("viewer"));
  for (const x of picked) x.line.returnedQty += x.qty;
  const r = await withStock(
    db,
    picked.map((x) => x.line.productId),
    (stock) => {
      for (const x of picked)
        if ((stock.get(x.line.productId)?.stock ?? 0) < x.qty)
          return fail(
            `${x.line.code}: only ${stock.get(x.line.productId)?.stock ?? 0} in stock to return.`,
          );
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            "INSERT INTO purchase_returns(id,purchase_id,date,reason,lines_json,taxable,cgst,sgst,igst,total,refund_method,refund_amount,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            d.id,
            p.id,
            d.date,
            d.reason,
            JSON.stringify(
              picked.map((x) => ({
                productId: x.line.productId,
                code: x.line.code,
                qty: x.qty,
                total: x.split.total,
              })),
            ),
            sum("taxable"),
            sum("cgst"),
            sum("sgst"),
            sum("igst"),
            total,
            d.refundMethod,
            refund,
            actor,
          ),
        db
          .prepare(
            "UPDATE purchases SET returned=returned+?,paid=paid-?,lines_json=? WHERE id=?",
          )
          .bind(total, refund, JSON.stringify(lines), p.id),
        financeDocument(db, {
          id: d.id,
          kind: "purchase_credit",
          date: d.date,
          dueDate: d.date,
          number: `${p.bill_number}-R${Date.now().toString(36).toUpperCase()}`,
          party: parent.party,
          gstin: parent.gstin,
          category: "Inventory purchases",
          netMinor: sum("taxable"),
          roundingMinor: total - picked.reduce((n, x) => n + x.split.total, 0),
          cgstMinor: sum("cgst"),
          sgstMinor: sum("sgst"),
          igstMinor: sum("igst"),
          costMinor: null,
          supply: p.supply,
          parentId: p.id,
          notes: d.reason,
        }),
      ];
      for (const x of picked)
        statements.push(
          movement(
            db,
            stock.get(x.line.productId)!,
            -x.qty,
            "return_out",
            `Return to ${p.supplier} · ${p.bill_number}`,
            actor,
          ),
        );
      if (refund > 0) {
        const id = crypto.randomUUID();
        statements.push(
          financeSettlement(db, {
            id,
            documentId: p.id,
            date: d.date,
            amount: refund,
            refund: true,
            method: d.refundMethod!,
            reference: d.refundReference || p.bill_number,
          }),
        );
      }
      return { statements, result: { saved: true, refund } };
    },
  );
  return result(c, r, 201);
});

/* ───────── Admin: expenses ───────── */
type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  payee: string;
  description: string;
  bill_number: string;
  gstin: string;
  amount: number;
  gst: number;
  method: Expense["method"];
  reference: string;
  shift_id: string | null;
  attachment_key: string | null;
  status: Expense["status"];
  reversal_reason: string;
  paid: number;
  actor: string;
  created_at: string;
};
const expense = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  category: r.category,
  payee: r.payee,
  description: r.description,
  billNumber: r.bill_number,
  gstin: r.gstin,
  amount: r.amount,
  gst: r.gst,
  method: r.method,
  reference: r.reference,
  shiftId: r.shift_id,
  hasAttachment: !!r.attachment_key,
  status: r.status,
  reversalReason: r.reversal_reason,
  paid: r.paid,
  actor: r.actor,
  createdAt: r.created_at,
});
routes.get("/admin/erp/expenses", async (c) => {
  const q = z
    .object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse(c.req.query());
  const rows = await c.env.DB.prepare(
    "SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC,created_at DESC LIMIT 2000",
  )
    .bind(q.from ?? "0000-01-01", q.to ?? "9999-12-31")
    .all<ExpenseRow>();
  return c.json(rows.results.map(expense));
});
async function recordExpense(c: AppContext) {
  const d = expenseInput.parse(await c.req.json());
  const db = c.env.DB;
  const existing = await db
    .prepare("SELECT * FROM expenses WHERE id=?")
    .bind(d.id)
    .first<ExpenseRow>();
  if (existing) return c.json(expense(existing));
  if (d.date > indiaToday())
    return c.json({ error: "Expenses cannot be dated in the future." }, 400);
  if (d.shiftId) {
    const shift = await db
      .prepare("SELECT status FROM shifts WHERE id=?")
      .bind(d.shiftId)
      .first<{ status: string }>();
    if (shift?.status !== "open")
      return c.json(
        {
          error:
            "The counter shift is not open. Pay this from another account.",
        },
        409,
      );
  }
  const settings = await erpSettings(db);
  const supply: Supply =
    d.gstin && !d.gstin.startsWith(settings.stateCode) ? "inter" : "intra";
  const half = Math.floor(d.gst / 2);
  const paid = d.method === "unpaid" ? 0 : d.amount;
  const actor = actorName(c.get("viewer"));
  const number = d.billNumber || `EXP-${d.id.slice(0, 8).toUpperCase()}`;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO expenses(id,date,category,payee,description,bill_number,gstin,amount,gst,method,reference,shift_id,paid,actor)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        d.id,
        d.date,
        d.category,
        d.payee,
        d.description,
        d.billNumber,
        d.gstin,
        d.amount,
        d.gst,
        d.method,
        d.reference,
        d.shiftId,
        paid,
        actor,
      ),
    financeDocument(db, {
      id: d.id,
      kind: "expense",
      date: d.date,
      dueDate: d.date,
      number,
      party: d.payee || d.category,
      gstin: d.gstin,
      category: d.category,
      netMinor: d.amount - d.gst,
      roundingMinor: 0,
      cgstMinor: supply === "intra" ? half : 0,
      sgstMinor: supply === "intra" ? d.gst - half : 0,
      igstMinor: supply === "inter" ? d.gst : 0,
      costMinor: null,
      supply,
      parentId: null,
      notes: d.description,
    }),
  ];
  if (paid)
    statements.push(
      financeSettlement(db, {
        id: `${d.id}:pay`,
        documentId: d.id,
        date: d.date,
        amount: paid,
        refund: false,
        method: d.method,
        reference: d.reference || number,
      }),
    );
  await db.batch(statements);
  return c.json(
    expense(
      (await db
        .prepare("SELECT * FROM expenses WHERE id=?")
        .bind(d.id)
        .first<ExpenseRow>())!,
    ),
    201,
  );
}
routes.post("/admin/erp/expenses", recordExpense);
/** Counter staff may pay small expenses from the drawer. */
routes.post("/pos/expenses", recordExpense);
routes.post("/admin/erp/expenses/:id/pay", async (c) => {
  const d = settlementInput.parse(await c.req.json());
  const db = c.env.DB;
  const e = await db
    .prepare("SELECT * FROM expenses WHERE id=?")
    .bind(c.req.param("id"))
    .first<ExpenseRow>();
  if (!e) return c.json({ error: "Expense not found." }, 404);
  if (e.status !== "recorded")
    return c.json({ error: "This expense was reversed." }, 409);
  if (d.amount > e.amount - e.paid)
    return c.json({ error: "The payment is more than the amount owed." }, 400);
  await db.batch([
    db
      .prepare(
        "UPDATE expenses SET paid=paid+?,method=CASE WHEN method='unpaid' THEN ? ELSE method END WHERE id=?",
      )
      .bind(d.amount, d.method, e.id),
    financeSettlement(db, {
      id: d.id,
      documentId: e.id,
      date: d.date < e.date ? e.date : d.date,
      amount: d.amount,
      refund: false,
      method: d.method,
      reference: d.reference || e.bill_number || "Expense",
    }),
  ]);
  return c.json(
    expense(
      (await db
        .prepare("SELECT * FROM expenses WHERE id=?")
        .bind(e.id)
        .first<ExpenseRow>())!,
    ),
  );
});
/** Mistaken entries are reversed, never deleted: a supplier credit plus a refund keep the audit trail. */
routes.post("/admin/erp/expenses/:id/reverse", async (c) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(3).max(500) })
    .strict()
    .parse(await c.req.json());
  const db = c.env.DB;
  const e = await db
    .prepare("SELECT * FROM expenses WHERE id=?")
    .bind(c.req.param("id"))
    .first<ExpenseRow>();
  if (!e) return c.json({ error: "Expense not found." }, 404);
  if (e.status === "reversed") return c.json(expense(e));
  const doc = await db
    .prepare("SELECT data FROM finance_documents WHERE id=?")
    .bind(e.id)
    .first<{ data: string }>();
  const fin = JSON.parse(doc!.data) as {
    party: string;
    gstin: string;
    supply: string;
    netMinor: number;
    cgstMinor: number;
    sgstMinor: number;
    igstMinor: number;
    category: string;
  };
  const date = indiaToday();
  const creditId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE expenses SET status='reversed',reversal_reason=? WHERE id=?",
      )
      .bind(reason, e.id),
    financeDocument(db, {
      id: creditId,
      kind: "purchase_credit",
      date: date < e.date ? e.date : date,
      dueDate: date < e.date ? e.date : date,
      number: `REV-${e.id.slice(0, 8).toUpperCase()}`,
      party: fin.party,
      gstin: fin.gstin,
      category: fin.category,
      netMinor: fin.netMinor,
      roundingMinor: 0,
      cgstMinor: fin.cgstMinor,
      sgstMinor: fin.sgstMinor,
      igstMinor: fin.igstMinor,
      costMinor: null,
      supply: fin.supply === "domestic_inter" ? "inter" : "intra",
      parentId: e.id,
      notes: reason,
    }),
  ];
  if (e.paid > 0)
    statements.push(
      financeSettlement(db, {
        id: `${e.id}:reverse`,
        documentId: e.id,
        date: date < e.date ? e.date : date,
        amount: e.paid,
        refund: true,
        method: e.method === "unpaid" ? "cash" : e.method,
        reference: "Reversal",
      }),
    );
  await db.batch(statements);
  return c.json(
    expense(
      (await db
        .prepare("SELECT * FROM expenses WHERE id=?")
        .bind(e.id)
        .first<ExpenseRow>())!,
    ),
  );
});
routes.post("/admin/erp/expenses/:id/attachment", async (c) => {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024)
    return c.json({ error: "Choose a file under 5 MB." }, 413);
  const head = new TextDecoder().decode(bytes.slice(0, 12));
  const type =
    bytes[0] === 0xff && bytes[1] === 0xd8
      ? "image/jpeg"
      : head.startsWith("\x89PNG")
        ? "image/png"
        : head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"
          ? "image/webp"
          : head.startsWith("%PDF")
            ? "application/pdf"
            : null;
  if (!type)
    return c.json({ error: "Attach a photo (JPEG, PNG, WebP) or a PDF." }, 400);
  const key = `private/${crypto.randomUUID()}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  const row = await c.env.DB.prepare(
    "UPDATE expenses SET attachment_key=? WHERE id=? RETURNING id",
  )
    .bind(key, c.req.param("id"))
    .first();
  if (!row) {
    await c.env.MEDIA.delete(key);
    return c.json({ error: "Expense not found." }, 404);
  }
  return c.json({ saved: true });
});
routes.get("/admin/erp/expenses/:id/attachment", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT attachment_key FROM expenses WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ attachment_key: string | null }>();
  const object = row?.attachment_key
    ? await c.env.MEDIA.get(row.attachment_key)
    : null;
  if (!object) return c.json({ error: "No attachment." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
});

/* ───────── Admin: price lists, settings, shifts ───────── */
routes.get("/admin/erp/price-lists", async (c) => {
  const [lists, items] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT id,name,discount_bp AS discountBp,revision FROM price_lists ORDER BY name",
    ),
    c.env.DB.prepare(
      "SELECT i.price_list_id AS priceListId,i.product_id AS productId,i.price_paise AS pricePaise,p.code,p.name FROM price_list_items i JOIN products p ON p.id=i.product_id",
    ),
  ]);
  return c.json({ lists: lists.results, items: items.results });
});
routes.put("/admin/erp/price-lists/:id", async (c) => {
  const d = z
    .object({
      name: z.string().trim().min(2).max(80),
      discountBp: z.number().int().min(0).max(10000),
      items: z
        .array(
          z
            .object({
              productId: z.uuid(),
              pricePaise: z.number().int().min(0),
            })
            .strict(),
        )
        .max(5000),
    })
    .strict()
    .parse(await c.req.json());
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO price_lists(id,name,discount_bp) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,discount_bp=excluded.discount_bp,revision=revision+1",
    ).bind(id, d.name, d.discountBp),
    c.env.DB.prepare("DELETE FROM price_list_items WHERE price_list_id=?").bind(
      id,
    ),
    ...d.items.map((i) =>
      c.env.DB.prepare(
        "INSERT INTO price_list_items(price_list_id,product_id,price_paise) VALUES(?,?,?)",
      ).bind(id, i.productId, i.pricePaise),
    ),
  ]);
  return c.json({ saved: true });
});
routes.get("/admin/erp/settings", async (c) =>
  c.json(await erpSettings(c.env.DB)),
);
routes.put("/admin/erp/settings", async (c) => {
  const d = z
    .object({
      invoicePrefix: z
        .string()
        .trim()
        .regex(/^[A-Z0-9]{1,4}$/, "Use 1 to 4 capital letters or digits"),
      stateCode: z.string().regex(/^\d{2}$/),
      receiptFooter: z.string().trim().max(300),
      blockSize: z.number().int().min(5).max(200),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE erp_settings SET invoice_prefix=?,state_code=?,receipt_footer=?,block_size=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING id",
  )
    .bind(
      d.invoicePrefix,
      d.stateCode,
      d.receiptFooter,
      d.blockSize,
      d.revision,
    )
    .first();
  return row
    ? c.json(await erpSettings(c.env.DB))
    : c.json({ error: "Settings changed. Refresh and try again." }, 409);
});
routes.get("/admin/erp/shifts", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id FROM shifts ORDER BY opened_at DESC LIMIT 60",
  ).all<{ id: string }>();
  return c.json(
    await Promise.all(rows.results.map((r) => shiftSummary(c.env.DB, r.id))),
  );
});

/* ───────── Admin: reports ───────── */
routes.get("/admin/erp/reports", async (c) => {
  const q = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse({
      from: c.req.query("from") ?? indiaToday().slice(0, 8) + "01",
      to: c.req.query("to") ?? indiaToday(),
    });
  const db = c.env.DB;
  const [
    daily,
    methods,
    hsn,
    b2b,
    b2c,
    products,
    cashiers,
    notes,
    purchases,
    expenses,
    dead,
    gaps,
    shortfalls,
  ] = await db.batch([
    db
      .prepare(
        "SELECT date,COUNT(*) AS invoices,SUM(total) AS total,SUM(taxable) AS taxable,SUM(cgst+sgst+igst) AS tax,SUM(credited) AS credited FROM invoices WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date",
      )
      .bind(q.from, q.to),
    db
      .prepare(
        "SELECT method,kind,SUM(amount) AS amount,COUNT(*) AS n FROM payments WHERE date BETWEEN ? AND ? GROUP BY method,kind ORDER BY method",
      )
      .bind(q.from, q.to),
    db
      .prepare(
        `SELECT l.hsn,l.gst_rate_bp AS rate,l.unit,SUM(l.qty-l.returned_qty) AS qty,SUM(l.taxable-l.returned_taxable) AS taxable,
      SUM(l.cgst-l.returned_cgst) AS cgst,SUM(l.sgst-l.returned_sgst) AS sgst,SUM(l.igst-l.returned_igst) AS igst,SUM(l.total-l.returned_total) AS total
      FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.date BETWEEN ? AND ? GROUP BY l.hsn,l.gst_rate_bp,l.unit ORDER BY l.hsn`,
      )
      .bind(q.from, q.to),
    db
      .prepare(
        `SELECT number,date,json_extract(customer_json,'$.name') AS customer,json_extract(customer_json,'$.gstin') AS gstin,place_of_supply AS pos,
      taxable,cgst,sgst,igst,total,credited FROM invoices WHERE date BETWEEN ? AND ? AND json_extract(customer_json,'$.gstin')<>'' ORDER BY date`,
      )
      .bind(q.from, q.to),
    db
      .prepare(
        `SELECT i.supply,l.gst_rate_bp AS rate,SUM(l.taxable-l.returned_taxable) AS taxable,SUM(l.cgst-l.returned_cgst) AS cgst,
      SUM(l.sgst-l.returned_sgst) AS sgst,SUM(l.igst-l.returned_igst) AS igst FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
      WHERE i.date BETWEEN ? AND ? AND json_extract(i.customer_json,'$.gstin')='' GROUP BY i.supply,l.gst_rate_bp`,
      )
      .bind(q.from, q.to),
    db
      .prepare(
        `SELECT l.product_id AS productId,l.code,l.name,SUM(l.qty-l.returned_qty) AS qty,SUM(l.total-l.returned_total) AS revenue,
      SUM(CASE WHEN l.cost_paise IS NULL THEN NULL ELSE (l.qty-l.returned_qty)*l.cost_paise END) AS cost
      FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.date BETWEEN ? AND ? GROUP BY l.product_id ORDER BY revenue DESC LIMIT 50`,
      )
      .bind(q.from, q.to),
    db
      .prepare(
        "SELECT cashier,COUNT(*) AS invoices,SUM(total-credited) AS net FROM invoices WHERE date BETWEEN ? AND ? GROUP BY cashier ORDER BY net DESC",
      )
      .bind(q.from, q.to),
    db
      .prepare(
        "SELECT c.number,c.date,c.total,c.reason,i.number AS invoice FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id WHERE c.date BETWEEN ? AND ? ORDER BY c.date",
      )
      .bind(q.from, q.to),
    db
      .prepare(
        "SELECT COUNT(*) AS n,COALESCE(SUM(total),0) AS total,COALESCE(SUM(cgst+sgst+igst),0) AS tax,COALESCE(SUM(total-paid-returned),0) AS payable FROM purchases WHERE date BETWEEN ? AND ?",
      )
      .bind(q.from, q.to),
    db
      .prepare(
        "SELECT category,COUNT(*) AS n,SUM(amount) AS amount,SUM(gst) AS gst FROM expenses WHERE status='recorded' AND date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC",
      )
      .bind(q.from, q.to),
    db.prepare(
      `SELECT p.id,p.code,p.name,p.stock,p.cost_paise AS cost,(SELECT MAX(i.date) FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.product_id=p.id) AS lastSold
      FROM products p WHERE p.stock>0 AND NOT EXISTS(SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.product_id=p.id AND i.date>=date('now','-90 day'))
      ORDER BY p.stock*COALESCE(p.cost_paise,0) DESC LIMIT 50`,
    ),
    // Reserved numbers never used: explain or void them before filing.
    db.prepare(
      `WITH RECURSIVE n(fy,seq,last) AS (SELECT fy,first_seq,last_seq FROM number_blocks UNION ALL SELECT fy,seq+1,last FROM n WHERE seq<last)
      SELECT n.fy,n.seq FROM n WHERE NOT EXISTS(SELECT 1 FROM invoices i WHERE i.fy=n.fy AND i.seq=n.seq)
      AND n.seq < (SELECT COALESCE(MAX(seq),0) FROM invoices i WHERE i.fy=n.fy) ORDER BY n.fy,n.seq LIMIT 200`,
    ),
    db.prepare(
      "SELECT number,date FROM invoices WHERE shortfall=1 ORDER BY date DESC LIMIT 100",
    ),
  ]);
  return c.json({
    ...q,
    daily: daily.results,
    methods: methods.results,
    hsn: hsn.results,
    b2b: b2b.results,
    b2c: b2c.results,
    products: products.results,
    cashiers: cashiers.results,
    creditNotes: notes.results,
    purchases: purchases.results[0],
    expenses: expenses.results,
    deadStock: dead.results,
    numberGaps: gaps.results,
    shortfalls: shortfalls.results,
  });
});
export default routes;
