import { z } from "zod";

export const productInput = z
  .object({
    code: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    unit: z.string().trim().min(1).max(20),
    description: z.string().trim().max(4000),
    // Suggested MRP in paise; separate from future ERP selling rates.
    pricePaise: z.number().int().min(0).max(10000000000).nullable(),
    lowStock: z.number().int().min(0).max(1000000000),
    published: z.boolean(),
    hsn: z
      .string()
      .trim()
      .regex(/^(?:\d{4}|\d{6}|\d{8})?$/, "HSN is 4, 6 or 8 digits")
      .default(""),
    // GST rate in basis points (1800 = 18%); rates are entered, never assumed.
    gstRateBp: z.number().int().min(0).max(10000).nullable().default(null),
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z-]{0,64}$/, "Barcode uses letters, digits and dashes")
      .default(""),
    reorderQty: z.number().int().min(0).max(1000000000).default(0),
    bin: z.string().trim().max(40).default(""),
    costPaise: z
      .number()
      .int()
      .min(0)
      .max(10000000000)
      .nullable()
      .default(null),
  })
  .strict();

export const movementKinds = [
  "receipt",
  "issue",
  "return_in",
  "return_out",
  "damage",
  "count",
  "adjustment",
] as const;
export type MovementKind = (typeof movementKinds)[number] | "sale" | "purchase";
export const movementLabel: Record<MovementKind, string> = {
  receipt: "Received",
  issue: "Issued",
  return_in: "Customer return",
  return_out: "Returned to supplier",
  damage: "Damaged / written off",
  count: "Count correction",
  adjustment: "Adjustment",
  sale: "Sale",
  purchase: "Purchase",
};

export const stockInput = z
  .object({
    operationId: z.uuid(),
    revision: z.number().int().positive(),
    delta: z
      .number()
      .int()
      .min(-1000000000)
      .max(1000000000)
      .refine((n) => n !== 0),
    reason: z.string().trim().min(3).max(500),
    kind: z.enum(movementKinds).default("adjustment"),
  })
  .strict()
  .refine(
    (d) =>
      !(
        (["receipt", "return_in"].includes(d.kind) && d.delta < 0) ||
        (["issue", "return_out", "damage"].includes(d.kind) && d.delta > 0)
      ),
    "The quantity direction does not match the movement type",
  );
export const countInput = z
  .object({
    operationId: z.uuid(),
    reason: z.string().trim().min(3).max(500),
    lines: z
      .array(
        z
          .object({
            productId: z.uuid(),
            revision: z.number().int().positive(),
            counted: z.number().int().min(0).max(1000000000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const quoteInput = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{7,25}$/, "Enter a valid phone number")
      .refine(
        (value) => /^\d{7,15}$/.test(value.replace(/\D/g, "")),
        "Enter a phone number with 7 to 15 digits",
      ),
    notes: z.string().trim().max(2000),
    items: z
      .array(
        z
          .object({
            productId: z.uuid(),
            quantity: z.number().int().min(1).max(99999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type ProductInput = z.infer<typeof productInput>;
export type Product = ProductInput & {
  id: string;
  slug: string;
  stock: number;
  revision: number;
  updatedAt: string;
  imageUrl: string | null;
  posterUrl: string | null;
};
export type CatalogueProduct = Pick<
  Product,
  | "id"
  | "slug"
  | "code"
  | "name"
  | "category"
  | "unit"
  | "description"
  | "pricePaise"
  | "imageUrl"
  | "posterUrl"
  | "updatedAt"
  | "barcode"
  | "bin"
> & {
  /** Exact quantity for authorised users; null for public visitors. */
  stock: number | null;
  /** Null when the website hides stock from public visitors. */
  availability: "Available" | "Low stock" | "Currently unavailable" | null;
};

export type AccessMode = "public" | "password" | "accounts";
export type PricingMode = "mrp" | "capped" | "free";
export type Role = "owner" | "admin" | "sales";
/** What the current visitor may do in the catalogue. */
export type CatalogueLevel = "staff" | "shared" | "public";
export type SessionInfo = {
  authenticated: boolean;
  role: Role | null;
  name: string;
  phone: string;
  userId: string | null;
  maxDiscountBp: number | null;
  posAccess: boolean;
};
export const teamInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().regex(/^\d{7,15}$/, "Enter 7 to 15 digits")),
    role: z.enum(["admin", "sales"]),
    maxDiscountBp: z.number().int().min(0).max(10000).nullable(),
    posAccess: z.boolean().default(false),
    password: z.string().min(8, "Use at least 8 characters").max(128),
  })
  .strict();
export const teamUpdateInput = teamInput
  .omit({ password: true, phone: true })
  .extend({
    revision: z.number().int().positive(),
    active: z.boolean(),
    password: z.string().min(8).max(128).or(z.literal("")),
  })
  .strict();
export type TeamMember = {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "sales";
  active: boolean;
  maxDiscountBp: number | null;
  posAccess: boolean;
  revision: number;
  createdAt: string;
  lastActiveAt: string | null;
  quoteCount: number;
};
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, "Enter a valid date");
const quotePhone = z
  .string()
  .trim()
  .max(25)
  .refine(
    (v) => v === "" || /^\d{7,15}$/.test(v.replace(/\D/g, "")),
    "Enter a phone number with 7 to 15 digits",
  );
export const quotationInput = z
  .object({
    id: z.uuid(),
    customerName: z.string().trim().min(1, "Enter the customer name").max(120),
    customerPhone: quotePhone,
    customerPlace: z.string().trim().max(120),
    notes: z.string().trim().max(2000),
    validUntil: isoDay,
    preparedBy: z.string().trim().max(120).default(""),
    /** A saved customer (staff only); their price list sets untouched lines. */
    customerId: z.uuid().nullable().default(null),
    items: z
      .array(
        z
          .object({
            productId: z.uuid(),
            quantity: z.number().int().min(1).max(99999),
            discountBp: z.number().int().min(0).max(10000).default(0),
            unitPricePaise: z
              .number()
              .int()
              .min(0)
              .max(10000000000)
              .nullable()
              .default(null),
          })
          .strict(),
      )
      .min(1, "Add at least one product")
      .max(150),
  })
  .strict();
export type QuotationInput = z.input<typeof quotationInput>;
export const quotationStatuses = ["draft", "sent", "won", "lost"] as const;
export type QuotationStatus = (typeof quotationStatuses)[number];
export type QuotationLine = {
  productId: string;
  code: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  mrpPaise: number | null;
  discountBp: number;
  unitPricePaise: number | null;
  quantity: number;
  amountPaise: number | null;
};
export type Quotation = {
  id: string;
  number: string;
  shareToken: string;
  status: QuotationStatus;
  channel: "staff" | "shared" | "public";
  createdBy: string | null;
  createdByName: string;
  createdByPhone: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerPlace: string;
  notes: string;
  validUntil: string;
  items: QuotationLine[];
  itemCount: number;
  mrpTotalPaise: number | null;
  discountPaise: number | null;
  totalPaise: number | null;
  terms: string;
  version: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
/** Saved customers for the quotation form, with their price list when one is set. */
export type QuoteCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  priceList: {
    name: string;
    discountBp: number;
    prices: Record<string, number>;
  } | null;
};
/** Unit price after a basis-point discount, rounded half up to the paisa. */
export const discounted = (mrp: number, bp: number) =>
  Math.floor((mrp * (10000 - bp) + 5000) / 10000);
/** A customer's price-list price: its own price for the product, else the list discount off MRP. */
export const listPriceOf = (
  list: NonNullable<QuoteCustomer["priceList"]>,
  productId: string,
  mrp: number | null,
) =>
  list.prices[productId] ??
  (mrp === null ? null : discounted(mrp, list.discountBp));
export const percent = (bp: number) =>
  `${(bp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
export type QuoteItem = {
  productId: string;
  name: string;
  code: string;
  quantity: number;
  pricePaise: number | null;
};
export type Quote = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  items: QuoteItem[];
  status: "new" | "contacted" | "closed";
  createdAt: string;
};
export type Activity = {
  id: number;
  productId: string;
  actor: string;
  action: string;
  detail: string;
  reason?: string | null;
  createdAt: string;
};

export function slugify(...parts: string[]) {
  return (
    parts
      .join(" ")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "product"
  );
}

export const categorySlug = (name: string) => slugify(name);

export const money = (paise: number | null) =>
  paise === null
    ? "Price on request"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(paise / 100);
export const availability = (
  stock: number,
  low: number,
): NonNullable<CatalogueProduct["availability"]> =>
  stock === 0
    ? "Currently unavailable"
    : stock <= low
      ? "Low stock"
      : "Available";
