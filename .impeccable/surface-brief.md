# Lenore platform surface brief

Scope: `/`, `/catalogue`, buyer detail/enquiry/PDF, staff sign-in and `/manage`. Landing mode Persuade; catalogue, enquiry and management mode Operate. The user rejected the first interface and selected “Architectural luxury: strong photography, warm stone, precise typography.” ADR `docs/decisions/0003-architectural-redesign.md` is authoritative. The direct implementation direction seed `964182f4` was overridden by that explicit choice; earlier seed `cde72ea8` and the old public surface review are historical. No approved comp or separate quality-bar board exists.

## THESIS

Let an architectural, photographic buyer experience open into a precise sales catalogue. Give staff a distinct industrial workspace for products, publication, stock and enquiries. Preserve product facts, the supplied logo and the complete customer enquiry workflow.

## OWN-WORLD

Buyer web: warm limestone, charcoal composition planes, restrained bronze, Marcellus regular display type and Manrope working text. Strong photographic fields and square controls replace the rejected botanical ivory/Cormorant treatment. Staff: dark slate sidebar, cool white ruled records, Manrope task hierarchy and compact controls. Customer PDF: supplied mark, white A4 paper, warm charcoal and bronze identification with fine warm rules; embedded Noto Sans/Malayalam provides bilingual coverage rather than duplicating web display typography.

## STORY

Introduce bath fittings and sanitary ware through an architectural scene, then move into photographic category browsing. Buyers explore photo/specification poster, product code, category, description, suggested MRP, stock quantity and freshness; they keep a shortlist and prepare/share a quotation enquiry. Staff manage publication, stock and follow-up, with filters and filtered CSV export. An enquiry does not reserve inventory.

## FIRST VIEWPORT

Landing: a full-bleed architectural bathroom photograph, dark left copy panel, concise two-line Marcellus headline and pale collection action. The image has a visible AI-inspiration disclosure. A charcoal strip closes the opening; subsequent category browsing pairs photography with ruled category links. On mobile the photograph leads, and the dark copy panel overlaps its lower region with a full-width action. This is a surface composition, not a rule for every future page.

Catalogue: generous collection heading, a dedicated left search/category rail and three image-led product columns. At 1100px products become two columns; at 700px filters become full-width search and horizontally scrolling categories, retaining two product columns. A pending-image state remains available. Known demonstration records without uploaded media can show labelled generated samples. Their mobile disclosure wraps clear of the image arrow at 9px. Detail contains the whole product, including portrait sample imagery.

Staff: a plain “Overview” task heading, counts, stock exceptions, catalogue readiness and recent activity. Dark navigation frames cool white operational records. Mobile converts navigation to a horizontal arrangement, stacks working regions and retains a two-column summary. This brief does not claim a design or implementation for finance modules.

## SIGNATURE INTERACTION

A private product becomes a published catalogue record; a buyer's saved shortlist becomes a staff enquiry without changing stock. A stock adjustment previews its resulting balance. Photo and specification poster are independent media, with uploaded media taking precedence over demonstration images. Staff search/category/stock filters also determine CSV export.

## MOTION

One restrained brightness/scale reveal introduces the landing photograph; product images have a small hover scale. Reduced motion removes animation and transitions. Native modal task panels contain focus, support Escape and return focus to the trigger. State transitions support orientation without competing with the product imagery.

## EVIDENCE AND LIMITS

Source: `src/client/architecture.css`, `styles.css`, `main.tsx`, `public.tsx`, `management.tsx`, `quote-actions.tsx`, `quotation.ts` and `overlay.tsx`. `DESIGN.md` records actual tokens; `.impeccable/design.json` extends them with preview components, motion, depth and responsive metadata.

The ten desktop/mobile landing, catalogue, detail, enquiry and staff overview captures in `.impeccable/review/` ground the rendered review. `docs/reviews/2026-10-19-architectural-redesign.md` records an independent screenshot/source review and its final `ship` disposition for the two material fixes: complete detail-image fitting and mobile disclosure/icon separation. The verdict remains limited to that review's evidence; it does not certify finance modules, deployment readiness or every management screen.

The build thread reported typecheck, lint, client/Worker dry run, 25 API checks and seven browser checks including axe, plus 7/7 asset provenance checks. Those are build evidence, not independent tests performed by the documenter. The previous 78 detector advisories referenced stale design color/type metadata; the refreshed documents are not a claim that a fresh detector pass ran.

The generated hero and four product sample assets are illustrative. Product sample use requires demonstration mode, a known demo SKU and no uploaded product media. Real catalogue data, owner-approved product photographs and the separate offline-aware ERP/POS integration remain future work. No live billing, production data or infrastructure changes belong to this local redesign.
