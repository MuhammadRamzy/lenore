import type { AccessMode, CatalogueProduct, Quotation } from "../../shared";

export type CategorySummary = {
  name: string;
  slug: string;
  count: number;
  /** Representative product, used for imagery. */
  cover: Pick<CatalogueProduct, "code" | "imageUrl" | "posterUrl"> | null;
};
export type SiteCommon = {
  whatsapp: string;
  demo: boolean;
  catalogueMode: AccessMode;
};
export type SitePage = SiteCommon &
  (
    | {
        kind: "home";
        categories: CategorySummary[];
        featured: CatalogueProduct[];
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
    | { kind: "contact" }
    | { kind: "quote"; quote: Quotation }
    | { kind: "notfound" }
  );
