import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  MapPin,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Share2,
  SlidersHorizontal,
  MessageCircle,
  X,
} from "lucide-react";
import {
  money,
  type CatalogueLevel,
  type CatalogueProduct,
} from "../../shared";
import { ProductImage, StatusBadge } from "../site/site";
import { whatsappLink } from "../links";
import { Sheet, Stepper, relativeTime } from "./ui";

type Sort = "name" | "code" | "price-asc" | "price-desc";
const PAGE = 48;

export function Browse({
  products,
  demo,
  level,
  syncedAt,
  loading,
  error,
  refresh,
  quantityOf,
  setQuantity,
  onOpen,
  notify,
}: {
  products: CatalogueProduct[];
  demo: boolean;
  level: CatalogueLevel;
  syncedAt: string;
  loading: boolean;
  error: string;
  refresh: () => void;
  quantityOf: (id: string) => number;
  setQuantity: (id: string, quantity: number) => void;
  onOpen: (p: CatalogueProduct) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  // The visible page size resets whenever the search or filters change.
  const filterKey = `${query}|${category}|${inStock}|${sort}`;
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE });
  const limit = paging.key === filterKey ? paging.limit : PAGE;
  const sentinel = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () =>
      new Map(
        products.map((p) => [
          p.id,
          `${p.code} ${p.name} ${p.category} ${p.description} ${p.barcode}`.toLowerCase(),
        ]),
      ),
    [products],
  );
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!inStock || p.availability !== "Currently unavailable") &&
        terms.every((t) => index.get(p.id)!.includes(t)),
    );
    const price = (p: CatalogueProduct) =>
      p.pricePaise ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) =>
      sort === "code"
        ? a.code.localeCompare(b.code)
        : sort === "price-asc"
          ? price(a) - price(b)
          : sort === "price-desc"
            ? (b.pricePaise ?? -1) - (a.pricePaise ?? -1)
            : a.name.localeCompare(b.name),
    );
  }, [products, query, category, inStock, sort, index]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          setPaging((p) => ({
            key: filterKey,
            limit: (p.key === filterKey ? p.limit : PAGE) + PAGE,
          }));
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [results.length, filterKey]);

  /** Scanner or Enter: an exact code/barcode match is added straight to the quote. */
  function addExact(raw: string) {
    const value = raw.trim().toLowerCase();
    const match = products.find(
      (p) =>
        p.code.toLowerCase() === value ||
        (p.barcode && p.barcode.toLowerCase() === value),
    );
    if (!match) return false;
    const before = quantityOf(match.id);
    setQuantity(match.id, before + 1);
    notify(`${match.code} added · ${before + 1} in quote`, () =>
      setQuantity(match.id, before),
    );
    setQuery("");
    return true;
  }
  const activeFilters = +!!category + +inStock + +(sort !== "name");

  return (
    <section className="browse" aria-labelledby="browse-title">
      <div className="browse-bar">
        <h1 id="browse-title" className="visually-hidden">
          Catalogue
        </h1>
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (!addExact(query) && results.length === 1) onOpen(results[0]);
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code or barcode"
            aria-label="Search products"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <button
          type="button"
          className="icon-btn boxed"
          aria-label="Scan a barcode"
          onClick={() => setScanning(true)}
        >
          <ScanLine size={20} />
        </button>
        <button
          type="button"
          className="icon-btn boxed"
          aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ""}`}
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={20} />
          {activeFilters > 0 && (
            <span className="dot-count">{activeFilters}</span>
          )}
        </button>
      </div>
      <nav className="chip-row" aria-label="Categories">
        <button
          type="button"
          className="chip"
          aria-pressed={!category}
          onClick={() => setCategory("")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            type="button"
            key={c}
            className="chip"
            aria-pressed={category === c}
            onClick={() => setCategory(category === c ? "" : c)}
          >
            {c}
          </button>
        ))}
      </nav>
      <div className="browse-meta">
        <span aria-live="polite">
          {results.length} {results.length === 1 ? "product" : "products"}
        </span>
        <button
          type="button"
          className="text-btn"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={14}
            className={loading ? "spin" : ""}
            aria-hidden="true"
          />
          {loading ? "Updating…" : `Updated ${relativeTime(syncedAt)}`}
        </button>
      </div>
      {error && (
        <p className="banner warn" role="status">
          {error}
        </p>
      )}
      {!products.length && !loading && !error && (
        <p className="empty-state">No products are published yet.</p>
      )}
      {products.length > 0 && !results.length && (
        <div className="empty-state">
          <p>No products match “{query}”.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setCategory("");
              setInStock(false);
            }}
          >
            Clear search and filters
          </button>
        </div>
      )}
      <ul className="tile-grid">
        {results.slice(0, limit).map((p) => {
          const qty = quantityOf(p.id);
          return (
            <li key={p.id} className="tile">
              <button
                type="button"
                className="tile-open"
                onClick={() => onOpen(p)}
                aria-label={`${p.name}, ${p.code}, ${money(p.pricePaise)}`}
              >
                <ProductImage
                  product={p}
                  demo={demo}
                  sizes="(max-width: 700px) 50vw, 220px"
                />
                <span className="tile-code">{p.code}</span>
                <span className="tile-name">{p.name}</span>
                <span className="tile-price">{money(p.pricePaise)}</span>
                <StatusBadge product={p} />
              </button>
              {qty > 0 ? (
                <Stepper
                  compact
                  value={qty}
                  label={`Quantity of ${p.code}`}
                  onChange={(n) => setQuantity(p.id, n)}
                />
              ) : (
                <button
                  type="button"
                  className="tile-add"
                  aria-label={`Add ${p.code} to quote`}
                  onClick={() => {
                    setQuantity(p.id, 1);
                    notify(`${p.code} added to quote`, () =>
                      setQuantity(p.id, 0),
                    );
                  }}
                >
                  <Plus size={18} />
                  Add
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {limit < results.length && <div ref={sentinel} className="sentinel" />}

      {filtersOpen && (
        <Sheet title="Filter and sort" onClose={() => setFiltersOpen(false)}>
          <div className="sheet-section">
            <label className="switch-row">
              <span>Only show products in stock</span>
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
              />
            </label>
            <fieldset className="radio-list">
              <legend>Sort by</legend>
              {(
                [
                  ["name", "Name"],
                  ["code", "Product code"],
                  ["price-asc", "Price, low to high"],
                  ["price-desc", "Price, high to low"],
                ] as [Sort, string][]
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === value}
                    onChange={() => setSort(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setInStock(false);
                setSort("name");
                setCategory("");
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFiltersOpen(false)}
            >
              Show {results.length} products
            </button>
          </div>
        </Sheet>
      )}
      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onDetect={(code) => {
            setScanning(false);
            if (!addExact(code)) {
              setQuery(code);
              notify(`No product with code ${code}`);
            }
          }}
        />
      )}
      {level === "public" && (
        <p className="fine-print">
          Showing suggested MRP and stock status. Sign in as a salesperson to
          see exact stock.
        </p>
      )}
    </section>
  );
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => Detector;
  }
}

/** Camera scanning via the BarcodeDetector API; USB/Bluetooth scanners type into search instead. */
function Scanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Point the camera at a barcode.");
  const [manual, setManual] = useState("");
  const supported = typeof window !== "undefined" && !!window.BarcodeDetector;
  const detected = useRef(onDetect);
  useEffect(() => {
    detected.current = onDetect;
  });
  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector!({
      formats: [
        "ean_13",
        "ean_8",
        "code_128",
        "code_39",
        "upc_a",
        "upc_e",
        "qr_code",
        "itf",
      ],
    });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = s;
        await video.current!.play();
        const loop = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video.current!);
            if (codes[0]?.rawValue) return detected.current(codes[0].rawValue);
          } catch {
            /* Frame not ready yet. */
          }
          frame = window.setTimeout(loop, 200);
        };
        void loop();
      })
      .catch(() =>
        setMessage("Camera access was blocked. Type the code instead."),
      );
    return () => {
      stopped = true;
      clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported]);
  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {supported ? (
        <div className="scanner">
          <video ref={video} muted playsInline aria-label="Camera preview" />
          <span className="scanner-frame" aria-hidden="true" />
          <p role="status">{message}</p>
        </div>
      ) : (
        <p className="muted sheet-section">
          This browser cannot scan with the camera. Use a USB or Bluetooth
          scanner in the search box, or type the code below.
        </p>
      )}
      <form
        className="sheet-section inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onDetect(manual.trim());
        }}
      >
        <label>
          Product code or barcode
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button className="btn btn-primary">Add</button>
      </form>
    </Sheet>
  );
}

export function ProductSheet({
  product,
  demo,
  quantity,
  setQuantity,
  onClose,
  notify,
  publicSite,
}: {
  product: CatalogueProduct;
  demo: boolean;
  quantity: number;
  setQuantity: (n: number) => void;
  onClose: () => void;
  notify: (message: string) => void;
  publicSite: boolean;
}) {
  const [view, setView] = useState<"photo" | "poster">(
    product.imageUrl || !product.posterUrl ? "photo" : "poster",
  );
  const [qty, setQty] = useState(quantity || 1);
  const link = publicSite ? `${location.origin}/products/${product.slug}` : "";
  const text = [
    `*${product.name}*`,
    `Code: ${product.code} · ${product.category}`,
    `MRP: ${money(product.pricePaise)}`,
    product.description,
    link,
    "— Lenore, Kuttiady",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <Sheet title={product.name} onClose={onClose} wide>
      <div className="product-sheet">
        <div className="product-sheet-media">
          {view === "poster" && product.posterUrl ? (
            <div className="product-image">
              <img
                src={product.posterUrl}
                alt={`${product.name} specification sheet`}
              />
            </div>
          ) : (
            <ProductImage
              product={product}
              demo={demo}
              eager
              sizes="(max-width: 700px) 100vw, 480px"
            />
          )}
          {product.posterUrl && (product.imageUrl || demo) && (
            <div className="segmented" role="group" aria-label="Image">
              <button
                type="button"
                aria-pressed={view === "photo"}
                onClick={() => setView("photo")}
              >
                Photo
              </button>
              <button
                type="button"
                aria-pressed={view === "poster"}
                onClick={() => setView("poster")}
              >
                Specifications
              </button>
            </div>
          )}
        </div>
        <div className="product-sheet-info">
          <p className="eyebrow">
            {product.category} · {product.code}
          </p>
          <p className="price">
            {money(product.pricePaise)}
            {product.pricePaise !== null && <small>MRP</small>}
          </p>
          <StatusBadge product={product} />
          {product.bin && (
            <p className="muted bin">
              <MapPin size={14} aria-hidden="true" /> Shelf {product.bin}
            </p>
          )}
          {product.description && (
            <p className="description">{product.description}</p>
          )}
          <p className="fine-print">
            Updated {relativeTime(product.updatedAt)}
          </p>
          <div className="product-sheet-share">
            <a
              className="btn btn-ghost btn-sm"
              href={whatsappLink(text)}
              target="_blank"
              rel="noopener"
            >
              <MessageCircle size={16} aria-hidden="true" /> WhatsApp
            </a>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  navigator
                    .share({ title: product.name, text })
                    .catch(() => undefined)
                }
              >
                <Share2 size={16} aria-hidden="true" /> Share
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="sheet-actions sticky">
        <Stepper
          value={qty}
          onChange={(n) => setQty(Math.max(1, n))}
          label="Quantity"
        />
        <button
          type="button"
          className="btn btn-primary grow"
          onClick={() => {
            setQuantity(qty);
            notify(
              quantity
                ? `${product.code} updated`
                : `${product.code} added to quote`,
            );
            onClose();
          }}
        >
          {quantity ? (
            <>
              <Check size={18} aria-hidden="true" /> Update quote
            </>
          ) : (
            <>
              <Plus size={18} aria-hidden="true" /> Add to quote
            </>
          )}
        </button>
      </div>
    </Sheet>
  );
}
