import type { PaymentDetails } from "../../erp";
import { api, ApiError } from "../api";
import { financialYear, type InvoiceInput, type Invoice } from "../../erp";

export type PosProduct = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  hsn: string;
  gstRateBp: number | null;
  barcode: string;
  pricePaise: number | null;
  stock: number;
  bin: string;
  imageUrl: string | null;
  /** Missing in bootstraps cached before posters were sent. */
  posterUrl?: string | null;
};
export type ShiftSummary = {
  id: string;
  status: string;
  openedBy: string;
  openedAt: string;
  openingFloat: number;
  closedAt: string | null;
  countedCash: number | null;
  expectedCash: number;
  byMethod: { method: string; kind: string; amount: number; n: number }[];
  cashMovements: {
    id: string;
    kind: string;
    amount: number;
    reason: string;
    actor: string;
    createdAt: string;
  }[];
  invoices: { n: number; total: number };
  returns: { n: number; total: number };
  expensesPaid: number;
};
export type Bootstrap = {
  settings: {
    invoicePrefix: string;
    stateCode: string;
    receiptFooter: string;
    blockSize: number;
    /** Missing in bootstraps cached before payment details existed. */
    payment?: PaymentDetails;
  };
  policy: { admin: boolean; mode: string; capBp: number };
  cashier: string;
  today: string;
  /** Shows the labelled sample photos for demo SKUs; absent in older caches. */
  demo?: boolean;
  products: PosProduct[];
  priceLists: { id: string; name: string; discountBp: number }[];
  priceListItems: {
    priceListId: string;
    productId: string;
    pricePaise: number;
  }[];
  shift: ShiftSummary | null;
};

const read = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or unavailable. */
  }
};

/** Stable identity for this counter; number blocks are reserved against it. */
export function deviceId() {
  let id = read<string>("lenore-pos-device", "");
  if (!id) {
    id = `counter-${crypto.randomUUID()}`;
    write("lenore-pos-device", id);
  }
  return id;
}

type Numbers = { fy: string; prefix: string; ranges: [number, number][] };
/** Reserved invoice numbers held on this device, so bills keep their legal numbers offline. */
export async function nextNumber(
  date: string,
): Promise<{ fy: string; seq: number; prefix: string }> {
  const fy = financialYear(date);
  let n = read<Numbers | null>("lenore-pos-numbers", null);
  if (!n || n.fy !== fy) n = { fy, prefix: "LT", ranges: [] };
  const remaining = n.ranges.reduce((s, [a, b]) => s + b - a + 1, 0);
  if (remaining < 5) {
    try {
      const block = await api<{
        fy: string;
        first: number;
        last: number;
        prefix: string;
      }>("/pos/numbers", { deviceId: deviceId(), date }, "POST");
      n.ranges.push([block.first, block.last]);
      n.prefix = block.prefix;
    } catch (e) {
      if (!remaining)
        throw e instanceof ApiError
          ? e
          : new Error(
              "Connect once to reserve invoice numbers for offline billing.",
            );
    }
  }
  const [first, last] = n.ranges[0];
  const seq = first;
  if (first === last) n.ranges.shift();
  else n.ranges[0] = [first + 1, last];
  write("lenore-pos-numbers", n);
  return { fy, seq, prefix: n.prefix };
}
export const reservedCount = () =>
  read<Numbers | null>("lenore-pos-numbers", null)?.ranges.reduce(
    (s, [a, b]) => s + b - a + 1,
    0,
  ) ?? 0;

export type Queued = { payload: InvoiceInput; number: string; error?: string };
export const readQueue = () => read<Queued[]>("lenore-pos-queue", []);
export const writeQueue = (q: Queued[]) => write("lenore-pos-queue", q);

/** Sends queued offline bills; business errors stay queued for an admin to resolve. */
export async function syncQueue(): Promise<{ sent: number; failed: number }> {
  const queue = readQueue();
  let sent = 0,
    failed = 0;
  const left: Queued[] = [];
  for (const item of queue) {
    try {
      await api<{ invoice: Invoice }>("/pos/invoices", item.payload, "POST");
      sent++;
    } catch (e) {
      if (e instanceof ApiError) {
        failed++;
        left.push({ ...item, error: e.message });
      } else left.push(item);
    }
  }
  writeQueue(left);
  return { sent, failed };
}
export const cachedBootstrap = () =>
  read<Bootstrap | null>("lenore-pos-bootstrap", null);
export const cacheBootstrap = (b: Bootstrap) =>
  write("lenore-pos-bootstrap", b);
