# Lenore platform requirements

Updated 2026-10-19. Source: owner instructions in this project's working sessions. Stage **A** = website, sales catalogue, quotations, inventory and admin (current build). Stage **B** = ERP and POS billing. Stage **C** = later/optional. Status is tracked in `docs/STATUS.md`; decisions in `docs/decisions/`.

## 1. Business context

| ID | Requirement | Stage |
| --- | --- | --- |
| BUS-1 | Business: **Lenore Trading LLP**, brand "Lenore — Refined Bathroom Living", bath fittings and sanitary ware. | A |
| BUS-2 | Contact: +91 75111 63131, lenorebathfittings@gmail.com, www.lenoretrading.com. | A |
| BUS-3 | Address: Vatayam, Kuttiady, near Mother Clinic (Kozhikode, Kerala). PIN, hours and map link pending from owner. | A |
| BUS-4 | GSTIN 32AANFL0054E1ZR (Kerala). Exports to Qatar, UAE and other destinations (finance module). | A |
| BUS-5 | Customers do **not** buy online. Sales happen through the shop and the sales team. | A |
| BUS-6 | One shop, one billing counter. About 40 salespeople use the catalogue continuously every day. | A/B |
| BUS-7 | The existing billing app (Next.js + Firebase) has live data; it is not modified. Its data migrates later when credentials are supplied via environment secrets. | B |
| BUS-8 | Wetta/Waterlife is a field/workflow reference only; the discarded old Lenore website supplies nothing. | A |

## 2. Users and roles

| ID | Requirement | Stage |
| --- | --- | --- |
| ROLE-1 | **Owner**: environment-provisioned, full access, cannot be locked out by other users. | A |
| ROLE-2 | **Admin**: full workspace access, manages team, products, stock, settings. | A |
| ROLE-3 | **Salesperson**: catalogue, quotations (own), exact stock; no workspace access. | A |
| ROLE-4 | **Manager** and **Cashier** roles for ERP/POS with per-function permissions. | B |
| ROLE-5 | Team members sign in with phone number + password; owner with username + password. | A |
| ROLE-6 | Admin can create, edit, deactivate, reset password, set discount cap and sign out all devices of any team member; deactivation takes effect on the next request. | A |
| ROLE-7 | Every quotation, stock movement and sensitive change records the acting user. | A |

## 3. Public website

| ID | Requirement | Stage |
| --- | --- | --- |
| WEB-1 | Pages: home, collection page per category, about, visit/contact, legal footer. | A |
| WEB-2 | Hero with clear calls to action: browse the collection, WhatsApp/call, visit the showroom. | A |
| WEB-3 | Trust signals: legal name, GSTIN, full address, phone, email, real (or explicitly illustrative) imagery. No invented reviews, awards, brands or claims. | A |
| WEB-4 | Enquiry form (name, phone, message, interest) stored for staff follow-up; rate-limited. | A |
| WEB-5 | Tap-to-call, WhatsApp and email links everywhere they help; map link once supplied. | A |
| WEB-6 | Minimalist aesthetic: whitespace, neutral palette, one bronze accent from the signboard logo, sans-serif typography (Manrope), subtle hover/press transitions. | A |
| WEB-8 | Admins control what the website shows, separately from the sales catalogue: hide individual products or whole collections, order collections and add an introduction, pick up to 12 featured products for the home page, and switch product listings, prices and stock status on or off. Hidden items stay available to the sales team. | A |
| WEB-7 | Responsive from 320 px; accessible (WCAG 2.2 AA intent): semantic landmarks, keyboard use, visible focus, contrast, reduced motion, alt text. | A |

## 4. SEO and performance

| ID | Requirement | Stage |
| --- | --- | --- |
| SEO-1 | Server-rendered HTML for public routes: unique title, meta description, canonical URL (production origin), Open Graph and Twitter cards. | A |
| SEO-2 | JSON-LD: Organization, LocalBusiness (HomeAndConstructionBusiness) with address/phone/email/vatID, WebSite, BreadcrumbList; Product + Offer for public catalogue products. | A |
| SEO-3 | Dynamic `sitemap.xml` (home, pages, collections, public products) and `robots.txt` referencing it; private routes (`/manage`, `/q/*`, locked catalogue) are noindex/disallowed. | A |
| SEO-4 | Readable URLs: `/collections/<category>`, `/catalogue/<product-slug>`. | A |
| SEO-5 | Local relevance: Kuttiady / Kozhikode / Kerala context in copy and structured data. Google Business Profile setup recommended to the owner. | A |
| SEO-6 | Performance: hashed static assets cached immutably, compressed images with dimensions, self-hosted fonts, code-split heavy features (PDF), no layout shift from late content. | A |
| SEO-7 | Malayalam version of public pages. | C |

## 5. Catalogue access and visibility

| ID | Requirement | Stage |
| --- | --- | --- |
| ACC-1 | Admin chooses mode: **public**, **shared password**, or **salesperson accounts only**. | A |
| ACC-2 | Public visitors see suggested MRP and stock **status** only; never exact quantities. | A |
| ACC-3 | Shared-password users, salespeople and admins see exact stock. | A |
| ACC-4 | Shared password sessions can be revoked at once; changing the password revokes them. | A |
| ACC-5 | Draft products and their media are visible only to admins. | A |
| ACC-6 | Rate limits keyed by IP and account so one shared showroom connection cannot lock out the team. | A |

## 6. Sales catalogue app (salespeople)

| ID | Requirement | Stage |
| --- | --- | --- |
| CAT-1 | Installable PWA that looks and feels like a phone app: bottom tabs (Catalogue, Quote, My quotes, Account), bottom sheets, safe-area aware, 44 px+ touch targets, app icon and splash. | A |
| CAT-2 | Opens instantly from a cached snapshot, refreshes in the background, uses ETag/304 so refreshes are cheap; shows last-updated time and offline state honestly. | A |
| CAT-3 | Instant search by code, name, description or barcode; category chips; in-stock filter; sort. | A |
| CAT-4 | Camera barcode scan on supported phones (BarcodeDetector), USB/Bluetooth scanner input on desktops. | A |
| CAT-5 | Product sheet: photo, specification poster, code, category, MRP, stock/status, unit, description, last updated; share product to WhatsApp. | A |
| CAT-6 | Add to quote from list or sheet with quantity steppers and typed quantities. | A |
| CAT-7 | Desktop layout also efficient (grid + side quote panel) for showroom counters. | A |

## 7. Quotations

| ID | Requirement | Stage |
| --- | --- | --- |
| QUO-1 | Customer name, phone, place/site, notes; validity date (default from settings); terms from settings. | A |
| QUO-2 | Pricing policy chosen by admin: **MRP only**, **discount up to a cap** (workspace default + per-salesperson override), or **any price**. Prices never exceed MRP. Admins are not capped. Public/shared quotes are MRP only. | A |
| QUO-3 | Per-line discount with an "apply to all lines" helper; line amounts, MRP total, discount and net total in exact integer paise; unknown prices shown as "to be confirmed". | A |
| QUO-4 | Saved server-side with number `LQ-YYYY-NNNN`; statuses draft, sent, won, lost; immutable version history on every revision; duplicate; search and filter own quotes. | A |
| QUO-5 | Idempotent saves (retry-safe) and optimistic concurrency on revisions. | A |
| QUO-6 | Sharing: **WhatsApp to any contact (primary)**, WhatsApp to the customer's number, PDF via native share sheet (falls back to download), private customer link `/q/<token>`, copy text, print. | A |
| QUO-7 | Branded PDF: logo, Lenore Trading LLP, address, GSTIN, phone, email, quote number/date/validity, salesperson, customer, lines, totals, terms; English and Malayalam text. | A |
| QUO-8 | Customer link page: branded, mobile-friendly, noindex, shows the current version with download/print and contact actions. | A |
| QUO-9 | A won quotation can be converted into a POS bill. | B |

## 8. Inventory management

| ID | Requirement | Stage |
| --- | --- | --- |
| INV-1 | Single stock authority shared by catalogue, quotations, POS and ERP. Integer quantities, never negative. | A |
| INV-2 | Every change is a typed, audited movement: receipt, issue, return in, return out, damage/write-off, count correction (and sale, purchase, transfer in Stage B), with reason, actor and before/after quantity. | A |
| INV-3 | Revision-checked, idempotent movements enforced inside the database. | A |
| INV-4 | Per-product stock ledger (movement history) view and export. | A |
| INV-5 | Low-stock threshold and reorder quantity per product; attention list (low, out, missing photo, missing price). | A |
| INV-6 | Stock count session: count many products quickly (scanner/search), review differences, post all corrections in one step. | A |
| INV-7 | Bin/shelf location per product. | A |
| INV-8 | Cost price (admin-only) and stock valuation at cost and MRP. | A |
| INV-9 | Bulk product import/update from CSV (code as key) with validation preview; bulk photo upload matched by product code. | A |
| INV-10 | Barcode label printing (code, name, MRP, barcode) on label printers or A4 sheets. | A |
| INV-11 | Purchases / goods received notes from suppliers post stock in; supplier records. | B |
| INV-12 | POS sales and returns post stock automatically. | B |
| INV-13 | Multiple locations and transfers (not needed now: one shop). | C |

## 9. Hardware

| ID | Requirement | Stage |
| --- | --- | --- |
| HW-1 | Barcode scanners: USB and Bluetooth keyboard-mode scanners work in every search/scan field; scan-and-add without extra taps. | A |
| HW-2 | Phone camera scanning where the browser supports it; manual entry fallback otherwise. | A |
| HW-3 | Printers: A4 via the browser print dialog with print-specific layouts (quotation, labels). | A |
| HW-4 | 80 mm thermal receipt printing; direct ESC/POS printing via WebUSB/Web Serial on Chrome where available, browser print fallback; cash drawer kick through the receipt printer. | B |
| HW-5 | Label printers for barcode labels. | A (print layout) / B (direct) |
| HW-6 | Customer-facing display, weighing scales: not required. | — |

## 10. ERP and POS (Stage B)

| ID | Requirement | Stage |
| --- | --- | --- |
| POS-1 | Fast counter billing: scanner/code/name search, load a won quotation, quantity/price edits within policy. | B |
| POS-2 | Split payments: cash, UPI, card, customer credit; change calculation. | B |
| POS-3 | GST tax invoice: CGST/SGST (intra-Kerala) or IGST, HSN summary, B2B buyer GSTIN, consecutive series per financial year, cancellation with reason, credit notes for returns. E-invoice/e-way bill only if thresholds apply. | B |
| POS-4 | Survive short internet outages: queue bills locally with idempotent IDs and reserved numbers; sync on reconnect. | B |
| POS-5 | Cash register: opening float, cash in/out, day close (Z report). | B |
| POS-6 | Customers: records, credit ledger, collections, dealer/contractor price lists. | B |
| POS-7 | Receipts/invoices printed (80 mm or A4) and shared on WhatsApp. | B |
| POS-8 | UPI scan-to-pay: admins set the shop's UPI ID and bank details; the counter shows a UPI QR for the exact amount when UPI is chosen or a balance is due; the QR can print on receipts and A4 invoices (never, only when an amount is due, or always), and bank details can print on A4 invoices. | B |
| ERP-1 | Purchases, supplier bills, payables and input tax. | B |
| ERP-2 | Invoices, returns and purchases post automatically into the finance subledger. | B |
| ERP-3 | Reports: sales by day/cashier/salesperson/product, GSTR-1/3B data, stock valuation, dead stock. | B |
| ERP-4 | Migration from the Firebase billing app: inventory existing features, export/transform/import rehearsal, reconcile, parallel run, cutover with rollback. | B |

## 11. Staff workspace

| ID | Requirement | Stage |
| --- | --- | --- |
| ADM-1 | Dashboard: quotes and value (period), won, by salesperson, top quoted products, stock attention, catalogue views, team active today. | A |
| ADM-2 | Products: create/edit/publish, photo and poster, HSN, GST rate, barcode, bin, cost, reorder. | A |
| ADM-3 | Quotations: all quotes with filters (salesperson, status, date, search), open/print/PDF, CSV export. | A |
| ADM-4 | Team management (ROLE-6). | A |
| ADM-5 | Catalogue access mode and pricing policy settings; quote validity/terms; WhatsApp number. | A |
| ADM-6 | Website enquiries with follow-up status. | A |
| ADM-7 | Finance subledger (existing). | A |
| ADM-8 | Industrial, dense, efficient layout; works on tablets and phones. | A |

## 12. Non-functional

| ID | Requirement | Stage |
| --- | --- | --- |
| NFR-1 | Cloudflare Workers + D1 + R2; production environment configuration; custom domain www.lenoretrading.com. | A |
| NFR-2 | Secrets only in Worker secrets / GitHub secrets; never in client code or the repository. | A |
| NFR-3 | Passwords PBKDF2-hashed; session tokens stored as hashes; HttpOnly, Secure, SameSite cookies; origin checks on writes; strict CSP and security headers. | A |
| NFR-4 | Scale: 40 concurrent salespeople with 30-second refreshes; catalogue up to several thousand products; p95 API under 300 ms at the edge. | A |
| NFR-5 | Reliability: database-enforced invariants (stock, finance, history immutability), idempotent writes, honest error states and retries. | A |
| NFR-6 | Backups: D1 point-in-time recovery plus scheduled exports; restore drill before go-live. | A |
| NFR-7 | CI: typecheck, lint, API tests on every push; manual, approved deploy workflow. | A |
| NFR-8 | Tests: workerd API tests, browser tests at phone and desktop sizes, accessibility checks, visual screenshot review. | A |
| NFR-9 | Documentation kept current: requirements, plan, status, handoff, design, deployment, decisions. | A |
