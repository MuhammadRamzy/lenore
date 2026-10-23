import type { AccessMode, CatalogueProduct, Quotation } from "../../shared";

export type CategorySummary = {
  name: string;
  slug: string;
  count: number;
  /** Optional admin-written introduction for the collection page. */
  intro: string;
  /** Designed cover set by admins (Workspace -> Website); preferred over `cover`. */
  coverUrl: string | null;
  /** Representative product, used for imagery. */
  cover: Pick<CatalogueProduct, "code" | "imageUrl" | "posterUrl"> | null;
};
export type SiteCommon = {
  whatsapp: string;
  demo: boolean;
  catalogueMode: AccessMode;
  /** Website switches set by admins (always false when products are hidden). */
  showPrices: boolean;
  showStock: boolean;
  /** Every collection, for the menus. */
  nav: Pick<CategorySummary, "name" | "slug" | "count">[];
};
export type SitePage = SiteCommon &
  (
    | {
        kind: "home";
        categories: CategorySummary[];
        featured: CatalogueProduct[];
        /** A random draw of photographed products for the hero wall. */
        hero: CatalogueProduct[];
      }
    | { kind: "collections"; categories: CategorySummary[] }
    | {
        kind: "collection";
        category: CategorySummary;
        categories: CategorySummary[];
        products: CatalogueProduct[];
      }
    | {
        kind: "product";
        product: CatalogueProduct;
        related: CatalogueProduct[];
      }
    | { kind: "about" }
    | { kind: "legal"; doc: "privacy" | "terms" }
    | { kind: "contact" }
    | { kind: "quote"; quote: Quotation }
    | { kind: "notfound" }
  );
