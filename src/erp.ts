import { z } from "zod";

/** Indian financial year label for a date: 2026-10-19 → "26-27". */
export function financialYear(isoDate: string) {
  const year = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
export const invoiceNumber = (prefix: string, fy: string, seq: number) =>
  `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
export const creditNoteNumber = (prefix: string, fy: string, seq: number) =>
  `${prefix}/CN/${fy}/${String(seq).padStart(4, "0")}`;

export type Supply = "intra" | "inter";
export type TaxSplit = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};
/** Splits a GST-inclusive amount (MRP pricing) into taxable value and tax heads, in paise. */
export function splitInclusive(
  total: number,
  gstRateBp: number,
  supply: Supply,
): TaxSplit {
  const taxable = Math.round((total * 10000) / (10000 + gstRateBp));
  const tax = total - taxable;
  if (supply === "inter")
    return { taxable, cgst: 0, sgst: 0, igst: tax, total };
  const cgst = Math.floor(tax / 2);
  return { taxable, cgst, sgst: tax - cgst, igst: 0, total };
}
/** Adds GST to an exclusive (purchase cost) amount. */
export function addTax(
  taxable: number,
  gstRateBp: number,
  supply: Supply,
): TaxSplit {
  const tax = Math.round((taxable * gstRateBp) / 10000);
  if (supply === "inter")
    return { taxable, cgst: 0, sgst: 0, igst: tax, total: taxable + tax };
  const cgst = Math.floor(tax / 2);
  return { taxable, cgst, sgst: tax - cgst, igst: 0, total: taxable + tax };
}
export type BillLine = {
  productId: string;
  qty: number;
  /** Unit price, GST-inclusive, in paise. */
  rate: number;
  discount: number;
  gstRateBp: number;
};
export type PricedLine = BillLine & TaxSplit;
/** Line and invoice totals; the grand total is rounded to the rupee. */
export function priceBill(lines: BillLine[], supply: Supply) {
  const priced: PricedLine[] = lines.map((l) => ({
    ...l,
    ...splitInclusive(l.rate * l.qty - l.discount, l.gstRateBp, supply),
  }));
  const sum = (k: keyof TaxSplit) => priced.reduce((n, l) => n + l[k], 0);
  const gross = sum("total");
  const rounded = Math.round(gross / 100) * 100;
  return {
    lines: priced,
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    roundOff: rounded - gross,
    total: rounded,
  };
}

export const paymentMethods = ["cash", "upi", "card", "bank"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const methodLabel: Record<PaymentMethod | "credit", string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank transfer",
  credit: "On credit",
};
const paise = z.number().int().min(0).max(10_000_000_000);

/** Shop payment details printed on bills and used for UPI QR codes. */
export const paymentDetailsInput = z
  .object({
    upiId: z
      .string()
      .trim()
      .regex(
        /^$|^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/,
        "Enter a UPI ID like lenore@okhdfcbank",
      ),
    upiName: z.string().trim().max(60),
    bankAccountName: z.string().trim().max(80),
    bankName: z.string().trim().max(80),
    bankAccount: z
      .string()
      .trim()
      .regex(/^$|^\d{6,18}$/, "Account number should be 6 to 18 digits"),
    bankIfsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^$|^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC should look like HDFC0001234"),
    bankBranch: z.string().trim().max(80),
    qrOnBills: z.enum(["off", "due", "always"]),
    bankOnInvoice: z.boolean(),
  })
  .strict();
export type PaymentDetails = z.infer<typeof paymentDetailsInput>;

/**
 * UPI deep link (NPCI "upi://pay") that any UPI app can scan. With an amount
 * the payer's app opens with it filled in; the bill number goes in the note.
 */
export function upiLink(
  d: Pick<PaymentDetails, "upiId" | "upiName">,
  amountPaise: number | null,
  note = "",
) {
  if (!d.upiId) return null;
  const params = [
    // Keep "@" literal: some UPI apps reject an encoded payee address.
    `pa=${encodeURIComponent(d.upiId).replace("%40", "@")}`,
    `pn=${encodeURIComponent(d.upiName || "Lenore Trading LLP")}`,
    ...(amountPaise && amountPaise > 0
      ? [`am=${(amountPaise / 100).toFixed(2)}`]
      : []),
    "cu=INR",
    ...(note ? [`tn=${encodeURIComponent(note.slice(0, 50))}`] : []),
  ];
  return `upi://pay?${params.join("&")}`;
}
/** Amount still to be paid on an invoice. */
export const invoiceDue = (i: {
  total: number;
  credited: number;
  paid: number;
  refunded: number;
}) => Math.max(0, i.total - i.credited - i.paid + i.refunded);
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^(?:\d{2}[A-Z0-9]{13})?$/,
    "GSTIN is 15 characters starting with the state code",
  );
const stateCode = z.string().regex(/^\d{2}$/, "Use the 2-digit GST state code");
export const customerInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(25),
    gstin,
    stateCode,
    address: z.string().trim().max(500),
    kind: z.enum(["retail", "dealer", "contractor"]),
    priceListId: z.uuid().nullable(),
    creditLimitPaise: paise,
    notes: z.string().trim().max(1000),
  })
  .strict();
export const supplierInput = customerInput
  .pick({
    name: true,
    phone: true,
    gstin: true,
    stateCode: true,
    address: true,
    notes: true,
  })
  .strict();
export const invoiceInput = z
  .object({
    id: z.uuid(),
    deviceId: z.string().min(8).max(64),
    seq: z.number().int().positive(),
    fy: z.string().regex(/^\d{2}-\d{2}$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftId: z.uuid().nullable(),
    customerId: z.uuid().nullable(),
    walkIn: z
      .object({
        name: z.string().trim().max(160),
        phone: z.string().trim().max(25),
      })
      .strict(),
    quotationId: z.uuid().nullable(),
    lines: z
      .array(
        z
          .object({
            productId: z.uuid(),
            qty: z.number().int().min(1).max(99999),
            rate: paise,
            discount: paise,
          })
          .strict(),
      )
      .min(1)
      .max(200),
    payments: z
      .array(
        z
          .object({
            id: z.uuid(),
            method: z.enum(paymentMethods),
            amount: paise.refine((v) => v > 0),
            reference: z.string().trim().max(120),
          })
          .strict(),
      )
      .max(6),
    notes: z.string().trim().max(500),
    offline: z.boolean(),
  })
  .strict();
export type InvoiceInput = z.infer<typeof invoiceInput>;
export const creditNoteInput = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().min(3).max(500),
    restock: z.boolean(),
    lines: z
      .array(
        z
          .object({
            lineNo: z.number().int().positive(),
            qty: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    refundMethod: z.enum(paymentMethods),
    refundReference: z.string().trim().max(120),
    shiftId: z.uuid().nullable(),
  })
  .strict();
export const purchaseInput = z
  .object({
    id: z.uuid(),
    supplierId: z.uuid(),
    billNumber: z.string().trim().min(1).max(60),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z
      .array(
        z
          .object({
            productId: z.uuid(),
            qty: z.number().int().min(1).max(1000000),
            costPaise: paise,
            gstRateBp: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(300),
    notes: z.string().trim().max(500),
    payment: z
      .object({
        method: z.enum(paymentMethods),
        amount: paise.refine((v) => v > 0),
        reference: z.string().trim().max(120),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const settlementInput = z
  .object({
    id: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(paymentMethods),
    amount: paise.refine((v) => v > 0),
    reference: z.string().trim().max(120),
    shiftId: z.uuid().nullable(),
  })
  .strict();

export type Customer = z.infer<typeof customerInput> & {
  id: string;
  revision: number;
  balancePaise: number;
  createdAt: string;
};
export type Supplier = z.infer<typeof supplierInput> & {
  id: string;
  revision: number;
  payablePaise: number;
};
export type InvoiceLine = {
  lineNo: number;
  productId: string;
  code: string;
  name: string;
  hsn: string;
  unit: string;
  qty: number;
  mrp: number | null;
  rate: number;
  discount: number;
  gstRateBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  returnedQty: number;
  unpostedQty: number;
};
export type Invoice = {
  id: string;
  number: string;
  date: string;
  status: "issued" | "cancelled";
  customerId: string | null;
  customer: {
    name: string;
    phone: string;
    gstin: string;
    address: string;
    stateCode: string;
  };
  supply: Supply;
  placeOfSupply: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  paid: number;
  credited: number;
  refunded: number;
  cashier: string;
  quotationId: string | null;
  shortfall: boolean;
  notes: string;
  createdAt: string;
  lines: InvoiceLine[];
  payments: {
    id: string;
    method: string;
    amount: number;
    kind: string;
    reference: string;
    date: string;
  }[];
  creditNotes: {
    id: string;
    number: string;
    total: number;
    date: string;
    reason: string;
  }[];
};
export const balanceOf = (
  i: Pick<Invoice, "total" | "paid" | "credited" | "refunded">,
) => i.total - i.credited - i.paid + i.refunded;

/** GST state codes used for place of supply. */
export const gstStates: [string, string][] = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other Territory"],
];

export const expenseCategories = [
  "Rent",
  "Salaries and wages",
  "Electricity and water",
  "Transport and freight",
  "Loading and unloading",
  "Repairs and maintenance",
  "Marketing",
  "Telephone and internet",
  "Office and stationery",
  "Staff welfare and food",
  "Professional fees",
  "Bank charges",
  "Fuel",
  "Other",
] as const;
export const expenseInput = z
  .object({
    id: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.string().trim().min(2).max(80),
    payee: z.string().trim().max(160),
    description: z.string().trim().max(500),
    billNumber: z.string().trim().max(60),
    gstin,
    amount: paise.refine((v) => v > 0, "Enter the amount"),
    gst: paise,
    method: z.enum([...paymentMethods, "unpaid"]),
    reference: z.string().trim().max(120),
    /** Paid from the counter cash drawer during this shift. */
    shiftId: z.uuid().nullable(),
  })
  .strict()
  .refine((d) => d.gst < d.amount, "GST must be less than the total amount")
  .refine(
    (d) => d.method === "cash" || !d.shiftId,
    "Only cash can come from the drawer",
  );
export type Expense = {
  id: string;
  date: string;
  category: string;
  payee: string;
  description: string;
  billNumber: string;
  gstin: string;
  amount: number;
  gst: number;
  method: PaymentMethod | "unpaid";
  reference: string;
  shiftId: string | null;
  hasAttachment: boolean;
  status: "recorded" | "reversed";
  reversalReason: string;
  paid: number;
  actor: string;
  createdAt: string;
};
export const purchaseReturnInput = z
  .object({
    id: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(3).max(500),
    lines: z
      .array(
        z
          .object({ productId: z.uuid(), qty: z.number().int().positive() })
          .strict(),
      )
      .min(1),
    refundMethod: z.enum(paymentMethods).nullable(),
    refundReference: z.string().trim().max(120),
  })
  .strict();
