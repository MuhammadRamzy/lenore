import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccessMode,
  CatalogueLevel,
  CatalogueProduct,
  PricingMode,
  Quotation,
  SessionInfo,
} from "../../shared";
import { api } from "../api";

export type AppConfig = {
  demo: boolean;
  whatsapp: string;
  pricingMode: PricingMode;
  discountCapBp: number;
  quoteValidityDays: number;
  quoteTerms: string;
};
export type AccessInfo = {
  mode: AccessMode;
  authorized: boolean;
  level: CatalogueLevel | null;
};
export type DraftLine = {
  productId: string;
  quantity: number;
  discountBp: number;
  unitPricePaise: number | null;
};
export type Draft = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerPlace: string;
  notes: string;
  validUntil: string;
  lines: DraftLine[];
  /** Set when revising a saved quotation. */
  editing: { id: string; number: string; revision: number } | null;
};
export type LocalQuote = Pick<
  Quotation,
  | "id"
  | "number"
  | "shareToken"
  | "customerName"
  | "totalPaise"
  | "createdAt"
  | "itemCount"
>;

const read = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The app keeps working without storage. */
  }
};
export const indiaDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
export const newDraft = (validityDays: number): Draft => ({
  id: crypto.randomUUID(),
  customerName: "",
  customerPhone: "",
  customerPlace: "",
  notes: "",
  validUntil: indiaDate(validityDays),
  lines: [],
  editing: null,
});

/** Catalogue snapshot: instant start from storage, cheap ETag refreshes every 30 s. */
export function useCatalogue(enabled: boolean) {
  const [products, setProducts] = useState<CatalogueProduct[]>(() =>
    read("lenore-catalogue-v2", [] as CatalogueProduct[]),
  );
  const [syncedAt, setSyncedAt] = useState<string>(() =>
    read("lenore-catalogue-synced", ""),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      // "no-cache" revalidates with If-None-Match; unchanged catalogues return 304.
      const response = await fetch("/api/catalogue", {
        cache: "no-cache",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "The catalogue could not be refreshed.");
      }
      const data = (await response.json()) as CatalogueProduct[];
      const now = new Date().toISOString();
      setProducts(data);
      setSyncedAt(now);
      setError("");
      write("lenore-catalogue-v2", data);
      write("lenore-catalogue-synced", now);
    } catch (e) {
      setError(
        navigator.onLine
          ? e instanceof Error
            ? e.message
            : "Refresh failed."
          : "Offline. Showing the last saved catalogue.",
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void refresh(), 0);
    const tick = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [enabled, refresh]);
  return { products, syncedAt, error, loading, refresh };
}

export function useDraft(validityDays: number) {
  const [draft, setDraftState] = useState<Draft>(() =>
    read("lenore-draft-v2", newDraft(validityDays)),
  );
  const setDraft = useCallback((update: (d: Draft) => Draft) => {
    setDraftState((current) => {
      const next = update(current);
      write("lenore-draft-v2", next);
      return next;
    });
  }, []);
  const setQuantity = useCallback(
    (productId: string, quantity: number) =>
      setDraft((d) => {
        const q = Math.max(0, Math.min(99999, Math.floor(quantity) || 0));
        const exists = d.lines.some((l) => l.productId === productId);
        const lines =
          q === 0
            ? d.lines.filter((l) => l.productId !== productId)
            : exists
              ? d.lines.map((l) =>
                  l.productId === productId ? { ...l, quantity: q } : l,
                )
              : [
                  ...d.lines,
                  {
                    productId,
                    quantity: q,
                    discountBp: 0,
                    unitPricePaise: null,
                  },
                ];
        return { ...d, lines };
      }),
    [setDraft],
  );
  const quantityOf = (productId: string) =>
    draft.lines.find((l) => l.productId === productId)?.quantity ?? 0;
  return { draft, setDraft, setQuantity, quantityOf };
}

export function useLocalQuotes() {
  const [quotes, setQuotes] = useState<LocalQuote[]>(() =>
    read("lenore-my-quotes", [] as LocalQuote[]),
  );
  const remember = useCallback((q: Quotation) => {
    setQuotes((list) => {
      const next = [
        {
          id: q.id,
          number: q.number,
          shareToken: q.shareToken,
          customerName: q.customerName,
          totalPaise: q.totalPaise,
          createdAt: q.createdAt,
          itemCount: q.itemCount,
        },
        ...list.filter((x) => x.id !== q.id),
      ].slice(0, 200);
      write("lenore-my-quotes", next);
      return next;
    });
  }, []);
  return { quotes, remember };
}

export async function loadSession() {
  const [session, access, config] = await Promise.all([
    api<SessionInfo>("/session"),
    api<AccessInfo>("/catalogue-access"),
    api<AppConfig>("/config"),
  ]);
  return { session, access, config };
}

type SessionState = Awaited<ReturnType<typeof loadSession>>;
export const rememberSession = (s: SessionState) =>
  write("lenore-session-v1", s);
export const cachedSession = () =>
  read<SessionState | null>("lenore-session-v1", null);
/** Sign-out on a shared phone removes cached stock and quotation data. */
export function clearDeviceData() {
  for (const key of [
    "lenore-session-v1",
    "lenore-catalogue-v2",
    "lenore-catalogue-synced",
    "lenore-my-quotes",
  ])
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage unavailable. */
    }
}
