# Lenore platform plan

Updated 2026-10-19. One platform for all Lenore operations. Decisions are recorded in `docs/decisions/0005-sales-quotation-platform.md`.

## Users

| User | Needs | Surface |
| --- | --- | --- |
| Visitors / customers | Trust (real address, GSTIN, phone), quality presentation, quick call/WhatsApp/visit | Public website |
| Approved salespeople (~40, all day) | Speed on a phone: instant search, quote in seconds, WhatsApp sharing, revise later | Sales catalogue (installable, app-like) |
| Owner / admins | Control and visibility: products, stock, access, team, quotes, analytics, finance | Staff workspace |
| Cashier (Stage B) | Fast counter billing that survives short outages | POS |

Customers do not purchase online. No cart, checkout or customer accounts.

## Stage A — website, sales catalogue, quotations (now)

**Public website (SEO and trust).** Home, collection pages per category, about, visit/contact with enquiry form. Server-rendered head and content per route: title, description, canonical, Open Graph, JSON-LD (Organization, LocalBusiness/HomeAndConstructionBusiness with address, phone, email, GSTIN; BreadcrumbList; Product when the catalogue is public), dynamic `sitemap.xml` and `robots.txt`, noindex on private surfaces. Fast assets, long-lived immutable caching for hashed files. Real business details from the owner's signboard; no invented claims.

**Catalogue access.** Admin picks `public`, `password` (shared) or `accounts` (individual salesperson logins). Public sees MRP and stock status; authorised users see exact stock.

**Sales catalogue app.** Installable PWA, bottom tabs (Catalogue · Quote · My quotes · Account), instant start from a cached snapshot with background refresh (ETag/304), search by code/name/barcode, category and stock filters, product sheet with photo/poster/details and product sharing, quantity steppers.

**Quotations.** Customer name/phone/place, per-line discount or price according to the admin pricing policy (`mrp`, `capped` with per-salesperson caps, `free`; never above MRP), validity, notes, terms, salesperson on the quote. Saved, numbered `LQ-YYYY-NNNN`, statuses draft/sent/won/lost, immutable version history, duplicate, search. Sharing: WhatsApp to any contact (primary), customer's WhatsApp, PDF via share sheet, customer link `/q/<token>`, copy, print. Branded PDF with Lenore Trading LLP, address, GSTIN and contacts.

**Staff workspace.** Dashboard (quotes, value, won, by salesperson, top quoted products, stock attention, catalogue views), products (plus HSN, GST rate, barcode), inventory, quotations, team (create, deactivate, reset password, sign out devices, discount caps), catalogue access and pricing policy, website enquiries, settings, finance.

**Platform.** Cloudflare Workers + D1 + R2, production environment config, CI checks and a manual deploy workflow using a GitHub secret, security headers, hashed sessions, rate limits keyed by IP and account (shared showroom connections), no secrets in client code. API tests, mobile/desktop browser tests, accessibility checks and screenshot review.

## Stage B — ERP and POS (next)

Scope confirmed: **one shop, one counter**, **survive short outages** (not long offline operation), **Firebase billing data migrated later** once credentials are supplied through environment secrets.

| Area | Content |
| --- | --- |
| POS counter | Barcode/code/name search, load a won quotation, split payments (cash, UPI, card, credit), 80 mm receipt and A4 invoice, WhatsApp the bill |
| GST invoices | CGST/SGST (Kerala) or IGST, HSN summary, B2B GSTIN, consecutive series per financial year, cancellation with reason, credit notes; e-invoice/e-way bill only if thresholds apply |
| Outage tolerance | Queue bills locally with idempotent IDs and a reserved number block; sync on reconnect; stock reconciliation |
| Cash register | Opening float, cash in/out, day close (Z report) |
| Customers | Customer records, credit ledger and collections, dealer/contractor price lists |
| Inventory | Purchases/GRN, supplier bills, stock counts, reorder alerts |
| Finance | Invoices, returns and purchases post automatically into the finance subledger |
| Reports | Sales by day/cashier/salesperson/product, GSTR-1/3B data, stock valuation |
| Migration | Read the current Lenore Billing (Next.js/Firestore) feature set, export → transform → import rehearsal, reconcile, parallel run, cutover with rollback; the live app is untouched until approved |

Before Stage B starts: read the existing billing repository for feature parity, confirm invoice numbering, tax setup (regular registration, e-invoice applicability), printer model/paper size and price lists.

## Owner inputs still needed

High-resolution logo, showroom and product photos, opening hours, map link, PIN code, brands carried, the real product list, Cloudflare account/domain access, and later the Firebase credentials (via secrets, never in chat or code).
