/**
 * Business report: data shapes and the plain-language analysis drawn from them.
 * Pure functions, shared by the PDF builder and the tests. Amounts are paise.
 */

export type ReportMetrics = {
  bills: number;
  gross: number;
  taxable: number;
  tax: number;
  roundOff: number;
  customers: number;
  walkIn: number;
  b2bBills: number;
  b2bValue: number;
  offline: number;
  units: number;
  discount: number;
  mrpValue: number;
  mrpBilled: number;
  cost: number;
  costedTaxable: number;
  netTaxableLines: number;
  returns: number;
  returnsValue: number;
  returnsTaxable: number;
  returnsTax: number;
  netSales: number;
  netTaxable: number;
  netTax: number;
  received: number;
  refunded: number;
  purchases: number;
  purchasesValue: number;
  inputTaxPurchases: number;
  expenses: number;
  expensesValue: number;
  inputTaxExpenses: number;
  quotations: number;
  quotationsValue: number;
  quotationsWon: number;
  quotationsWonValue: number;
  shiftsClosed: number;
  cashVariance: number;
  shiftsMismatched: number;
};

export type BusinessReport = {
  from: string;
  to: string;
  previous: { from: string; to: string; days: number };
  generatedAt: string;
  generatedBy: string;
  prefix: string;
  current: ReportMetrics;
  prior: ReportMetrics;
  daily: { date: string; bills: number; gross: number }[];
  weekday: { dow: number; bills: number; gross: number }[];
  hourly: { hour: number; bills: number; gross: number }[];
  categories: {
    category: string;
    units: number;
    revenue: number;
    products: number;
  }[];
  products: {
    code: string;
    name: string;
    category: string;
    units: number;
    revenue: number;
    taxable: number;
    cost: number | null;
    returned: number;
  }[];
  customers: { name: string; gstin: string; bills: number; net: number }[];
  methods: { method: string; kind: string; n: number; amount: number }[];
  returnReasons: { reason: string; n: number; total: number }[];
  gstRates: {
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }[];
  hsn: {
    hsn: string;
    rate: number;
    units: number;
    taxable: number;
    tax: number;
  }[];
  b2b: {
    number: string;
    date: string;
    customer: string;
    gstin: string;
    taxable: number;
    tax: number;
    total: number;
    credited: number;
  }[];
  receivables: {
    number: string;
    date: string;
    customer: string;
    due: number;
    age: number;
  }[];
  payables: { supplier: string; bills: number; due: number }[];
  stock: {
    skus: number;
    units: number;
    out: number;
    low: number;
    atCost: number;
    uncosted: number;
    atMrp: number;
  };
  deadStock: {
    code: string;
    name: string;
    category: string;
    stock: number;
    mrpValue: number;
    lastSold: string | null;
  }[];
  expenses: { category: string; n: number; amount: number; gst: number }[];
  suppliers: { supplier: string; bills: number; total: number }[];
  views: { code: string; name: string; views: number }[];
  salespeople: { name: string; quotes: number; value: number; won: number }[];
  shortfallBills: number;
  numberGaps: number;
  hygiene: {
    noGst: number;
    noHsn: number;
    noCost: number;
    noPhoto: number;
    products: number;
  };
};

const rupees = (p: number) =>
  `₹${(Math.round(p) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Change against the previous period; null when there is nothing to compare. */
export function change(now: number, before: number) {
  if (!before) return null;
  return (now - before) / Math.abs(before);
}
export const pct = (ratio: number, digits = 0) =>
  `${(ratio * 100).toFixed(digits)}%`;
const trend = (ratio: number | null) =>
  ratio === null
    ? ""
    : Math.abs(ratio) < 0.005
      ? "flat on the previous period"
      : `${ratio > 0 ? "up" : "down"} ${pct(Math.abs(ratio))} on the previous period`;

/** Profit view: only as good as the share of sales with a known cost. */
export function margin(m: ReportMetrics) {
  const coverage = m.netTaxableLines ? m.costedTaxable / m.netTaxableLines : 0;
  const gross = m.costedTaxable - m.cost;
  return {
    coverage,
    grossProfit: gross,
    grossMargin: m.costedTaxable ? gross / m.costedTaxable : null,
  };
}

/** Days since the bill, grouped the way a CA ages debtors. */
export function ageing(rows: BusinessReport["receivables"]) {
  const buckets = [
    { label: "0–30 days", min: 0, max: 30, amount: 0, bills: 0 },
    { label: "31–60 days", min: 31, max: 60, amount: 0, bills: 0 },
    { label: "61–90 days", min: 61, max: 90, amount: 0, bills: 0 },
    { label: "Over 90 days", min: 91, max: Infinity, amount: 0, bills: 0 },
  ];
  for (const r of rows) {
    const b = buckets.find((x) => r.age >= x.min && r.age <= x.max)!;
    b.amount += r.due;
    b.bills++;
  }
  return buckets;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const weekdayName = (d: number) => DAYS[d] ?? "";
export const hourLabel = (h: number) =>
  `${h % 12 || 12}${h < 12 ? " am" : " pm"}`;

/** The executive summary: short, plain sentences built only from the data. */
export function summary(r: BusinessReport): string[] {
  const m = r.current,
    p = r.prior;
  const out: string[] = [];
  if (!m.bills) {
    out.push(
      "No sales were billed in this period, so most sections of this report are empty.",
    );
    return out;
  }
  out.push(
    `Net sales were ${rupees(m.netSales)} from ${m.bills} bills${m.returns ? ` after ${rupees(m.returnsValue)} of returns` : ""}, ${trend(change(m.netSales, p.netSales)) || "with no earlier period to compare"}.`,
  );
  out.push(
    `The average bill was ${rupees(m.gross / m.bills)} and ${m.units} items were sold${p.bills ? ` (average bill ${trend(change(m.gross / m.bills, p.gross / p.bills))})` : ""}.`,
  );
  const top = r.categories[0];
  if (top && m.netSales > 0)
    out.push(
      `${top.category} was the biggest range, bringing in ${rupees(top.revenue)} (${pct(top.revenue / m.netSales)} of net sales).`,
    );
  const best = r.products[0];
  if (best)
    out.push(
      `The best-selling product was ${best.name} (${best.code}): ${best.units} sold for ${rupees(best.revenue)}.`,
    );
  const g = margin(m);
  if (g.coverage >= 0.8 && g.grossMargin !== null)
    out.push(
      `Gross margin was ${pct(g.grossMargin, 1)} on sales before GST, earning ${rupees(g.grossProfit)} before expenses.`,
    );
  else
    out.push(
      `Profit cannot be stated reliably yet: purchase costs are known for only ${pct(g.coverage)} of sales.`,
    );
  out.push(
    `GST collected on sales was ${rupees(m.netTax)}; GST paid on purchases and expenses was ${rupees(m.inputTaxPurchases + m.inputTaxExpenses)}.`,
  );
  const due = r.receivables.reduce((n, x) => n + x.due, 0);
  if (due > 0)
    out.push(
      `Customers owed ${rupees(due)} on ${r.receivables.length} bills at the end of the period.`,
    );
  return out;
}

/** Things worth acting on, most important first. Each says why. */
export function actions(r: BusinessReport) {
  const m = r.current;
  const list: { level: "high" | "medium" | "low"; text: string }[] = [];
  const add = (level: "high" | "medium" | "low", text: string) =>
    list.push({ level, text });
  if (r.numberGaps)
    add(
      "high",
      `${r.numberGaps} reserved invoice numbers this financial year were never used. Record them as cancelled in GSTR-1 (document summary) so the series has no unexplained gaps.`,
    );
  const old = ageing(r.receivables).filter((b) => b.min > 60);
  const oldAmount = old.reduce((n, b) => n + b.amount, 0);
  if (oldAmount > 0)
    add(
      "high",
      `${rupees(oldAmount)} has been owed for more than 60 days. Follow up these customers this week; older dues are harder to collect.`,
    );
  if (r.hygiene.noGst)
    add(
      "high",
      `${r.hygiene.noGst} products have no GST rate and cannot be billed. Set them under Products → GST & HSN.`,
    );
  if (r.shortfallBills)
    add(
      "medium",
      `${r.shortfallBills} bills sold more than the recorded stock. Count those products so stock figures stay true.`,
    );
  if (m.shiftsMismatched)
    add(
      m.cashVariance < 0 ? "high" : "medium",
      `${m.shiftsMismatched} cash drawer counts did not match, a net ${m.cashVariance < 0 ? "shortage" : "excess"} of ${rupees(Math.abs(m.cashVariance))}. Review the shift notes.`,
    );
  const g = margin(m);
  if (g.coverage < 0.8)
    add(
      "medium",
      `Purchase costs are missing for ${r.hygiene.noCost} products, so profit is incomplete. Record purchases (or set cost prices) to see true margins.`,
    );
  const deadValue = r.deadStock.reduce((n, d) => n + d.mrpValue, 0);
  if (r.deadStock.length)
    add(
      deadValue > m.netSales ? "high" : "medium",
      `${r.deadStock.length} products (${rupees(deadValue)} at MRP) have not sold in 90 days. Consider a display change, a bundle offer or a return to the supplier.`,
    );
  if (r.stock.out)
    add(
      "medium",
      `${r.stock.out} products are out of stock. Reorder the ones customers ask for.`,
    );
  if (m.gross && m.discount / m.gross > 0.05)
    add(
      "low",
      `Discounts were ${pct(m.discount / m.gross, 1)} of sales (${rupees(m.discount)}). Check they follow the pricing policy.`,
    );
  if (m.gross && m.returnsValue / m.gross > 0.05)
    add(
      "medium",
      `Returns were ${pct(m.returnsValue / m.gross, 1)} of sales. The return reasons table shows where they come from.`,
    );
  if (m.quotations && m.quotationsWon / m.quotations < 0.2)
    add(
      "low",
      `Only ${m.quotationsWon} of ${m.quotations} quotations were marked won. Follow up open quotations, and mark won ones so this figure stays accurate.`,
    );
  if (r.hygiene.noPhoto)
    add(
      "low",
      `${r.hygiene.noPhoto} products have no photo; they sell less online and in the catalogue.`,
    );
  const order = { high: 0, medium: 1, low: 2 };
  return list.sort((a, b) => order[a.level] - order[b.level]);
}

/** Words a non-accountant may meet in the report. */
export const glossary: [string, string][] = [
  [
    "Gross sales",
    "Everything billed, including GST, before any returns are taken off.",
  ],
  [
    "Net sales",
    "Gross sales minus returns (credit notes) issued in the period. This is what the shop actually sold.",
  ],
  ["Taxable value", "The price before GST. GST is charged on this amount."],
  [
    "Output GST",
    "GST collected from customers on sales. It belongs to the government and is paid with the GST return.",
  ],
  [
    "Input GST (ITC)",
    "GST paid on purchases and business expenses. It can usually be set off against output GST if the supplier has filed it.",
  ],
  [
    "CGST / SGST / IGST",
    "Sales within Kerala carry CGST and SGST in equal halves; sales to other states carry IGST.",
  ],
  ["HSN", "The government product code used to group sales in the GST return."],
  [
    "B2B / B2C",
    "B2B bills are to customers with a GSTIN (businesses); B2C bills are to everyone else.",
  ],
  [
    "Credit note",
    "The document issued when goods are returned. It reduces sales and GST.",
  ],
  [
    "Gross margin",
    "Sales before GST minus what the goods cost, as a share of sales. It is profit before rent, salaries and other expenses.",
  ],
  [
    "Receivables",
    "Money customers still owe on bills. Ageing shows how long it has been owed.",
  ],
  [
    "Dead stock",
    "Products in stock that have not sold for 90 days. Money is tied up in them.",
  ],
  ["Average bill", "Gross sales divided by the number of bills."],
];
