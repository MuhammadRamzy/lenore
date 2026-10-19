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
  })
  .strict();

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
  stock: number;
  revision: number;
  updatedAt: string;
  imageUrl: string | null;
  posterUrl: string | null;
};
export type CatalogueProduct = Omit<
  Product,
  "revision" | "lowStock" | "published"
> & { availability: "Available" | "Low stock" | "Currently unavailable" };
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
): CatalogueProduct["availability"] =>
  stock === 0
    ? "Currently unavailable"
    : stock <= low
      ? "Low stock"
      : "Available";
