# Lenore status

Updated 2026-10-23.

**Stage A — website, sales catalogue, quotations, inventory, admin: implemented and verified locally.**

**Stage B — ERP and POS: implemented and verified locally.** Counter billing with GST invoices (CGST/SGST or IGST, HSN), reserved invoice-number blocks for short outages, split payments, 80 mm / A4 / direct ESC-POS printing, returns and credit notes, cash shifts with X/Z reports, customers with credit limits, ledgers and receipts, price lists, purchases with moving-average cost and supplier returns, expenses with bill attachments and reversals, GST/HSN/B2B/B2C reports, dead stock and number-gap checks. Sales, returns, purchases, payments and expenses post automatically to the finance subledger.

**Website controls — implemented and verified locally.** Workspace → Website: show/hide products and collections, collection order and introductions, featured home-page products, and switches for product listings, prices and stock status. Hidden items are also withheld from anonymous catalogue readers and image requests; the sales team still sees every published product.

**UPI QR and bank details — implemented and verified locally.** Workspace → Billing settings holds the UPI ID and bank details. The counter shows a UPI QR for the exact amount in the payment step, on completed bills with a balance and when collecting payments; the QR can print on 80 mm receipts (browser and direct ESC/POS) and A4 invoices, with bank details on A4. Generated codes were decoded in tests to confirm payee, amount and bill number.

**Bill design — redone with the Lenore logo.** The 80 mm receipt has the logo, a clear bill and customer block, per-item discounts, a bold total bar, payments, balance due, savings on MRP and the UPI QR. The A4 tax invoice has a logo header, seller/buyer/invoice panels, the item table, a GST summary by rate, totals with received and balance, bank details and QR, terms and a signature block. Both use the same styles on screen and on paper. Printing no longer adds blank pages, and the A4 fits on one page. Direct ESC/POS printing sends the logo as a raster image; this has not been tried on the shop's printer yet.

**Audit — complete.** See `docs/AUDIT.md`: 26 findings, 22 fixed, 4 accepted/deferred/owner action.

Verification: typecheck, lint, 73 API tests (workerd), 6 browser tests on an isolated database, axe WCAG 2.1 AA on 32 workspace/counter views and the public surfaces, production dry-run build.

**Real catalogue (local) — 2026-10-22.** 308 Wetta products with photos/posters, GST 18% and HSN set (owner to confirm with the accountant). WebP uploads with 600 px thumbnails, POS devices (A4/80 mm/USB printing, scanners, camera), keyboard shortcuts, role access matrix tests, SEO and warranty content. See HANDOFF and ADR 0007.

**Production (Stage 1) — 2026-10-22.** Deployed to https://lenore-platform.lenore-platform.workers.dev with 308 products (no photos). Custom domain waits on Hostinger nameservers (docs/DEPLOYMENT.md Stage 2).

Price lists now apply to quotations for saved customers (ADR 0009). Public website rebuilt around the brand: Stone hero with product spotlight, website cart with WhatsApp requests, new navigation, Visit us with map, privacy policy and terms (ADR 0011). 296 photos and 63 posters live (media sync 2026-10-23, all 359 verified); 12 products have no source media.

Not done: photos and thumbnail backfill, custom domain, Firebase billing migration (awaiting credentials via secrets), load test on staging. Nothing has been deployed.

**Lenore image export — complete (Codex,2026-10-23).**359/359 product outputs saved in `~/Downloads/Lenore-Product-Visuals`:296square photos and63posters, including7photos derived from poster-only products. All masters decode, have appropriate aspect ratios and match Downloads hashes. Root4image corrections and SH103C/D/E poster geometry corrections complete;63poster OCR/text audit and visual adjudications found no unresolved issue. Historical generation quota cleared.12catalogue records have neither original photo nor poster; no imagery invented for them. Source-price discrepancies remain documented.

**Claude media upload handoff:**`UPLOAD-READINESS.json` is ready=true; `CLAUDE-UPLOAD-PROMPT.md`,359-entry hash inventory and36-entry changed-since-yesterday list are in Downloads. Reconcile every product media slot and replace stale existing uploads using fresh immutable URLs and thumbnails; preserve all business fields and visibility. This export made no application/database/deployment changes. Owner received the prompt.

**Instagram export:**359product images copied into30categoryfolders, all copy hashes verified. All30captions include `https://lenoretrading.com`.30additional category covers now saved; a few earlier covers are receiving creative layout refreshes before final report. Covers are excluded from app product uploads.
