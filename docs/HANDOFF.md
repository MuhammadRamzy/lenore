# Handoff

## Claude · 2026-10-22 · Business report, landing and scroll fixes

- **Business report (PDF):** Reports & GST → Business report. Month / quarter / financial year / custom; 11 sections (glance, sales, what sold, money, profit, GST, stock, quotations, checks, actions, notes + glossary + sign-off). Saved to an append-only archive (migration 0012, ADR 0008). Verified on real local data: 15 pages, ~110 KB, under 2 s.
- **Fixes:** landing page (warranty band misaligned by its own margins; 8 categories now 4×2; tighter spacing); scrolling (a global `overscroll-behavior` rule trapped the wheel over sideways-scrolling rows; now scoped to real scroll panels, checked with wheel events on every page).
- **Checks:** Prettier, typecheck, lint, 76 API tests (role matrix includes report routes), 6 browser tests, build dry run.
- **Next:** security audit with Cloudflare's security-audit skill (in progress); owner to confirm GST/HSN and add purchase costs so profit becomes reliable.

## Claude · 2026-10-22 · Real catalogue, POS/devices, audit, SEO

- **Data (local only):** imported 308 Wetta products + 352 photos/posters read once from the live Wetta D1/R2 (read-only). GST 18% and HSN by category set with the owner's approval (8481 taps/valves, 7324 steel, 3924 plastic, 7013 glass): confirm with the accountant. Demo products deleted; `setup:local` now seeds samples only into an empty DB. Local login `owner` / `admin` (see ignored `creds.md`).
- **Images:** uploads converted to WebP in the browser; 600 px thumbnails (`<key>.600`, `?w=600`) for grids. ADR 0007.
- **POS:** product photos, redesigned tiles/bill lines, mobile sticky Pay bar, rebuilt return form, customer sheet order, Devices sheet (80 mm / A4 / direct USB, auto-print, test pages, drawer, scanner test), camera scanning, keyboard shortcuts (F1 list), re-sign-in overlay that keeps the bill.
- **Workspace:** label generator (thermal 50×25/38×25/75×50 and A4 sheets, per-product qty, MRP+offer, fields), bulk GST & HSN tool, scan-to-find on products/inventory, camera stock count, readable Reports (2 columns, presets, number-gap ranges), salesperson landing screen, Settings page removed (WhatsApp lives in Access & pricing).
- **Hardening:** role access matrix test (every admin/POS route × 5 roles), randomized bill-arithmetic test, crash boundary + load-failure screen, global 401 → sign-in, scroll containment, distinct Admin/Billing PWA icons, catalogue manifest scope `/catalogue`.
- **Website/SEO:** removed preview labels and the 01/02/03 block, top-8 categories, warranty section (10y CP body · 2y spindle & head · 1y accessories), About logo showcase, richer titles/descriptions, served towns in LocalBusiness data, image sitemap.
- **Checks:** typecheck, lint, Prettier, 73 API tests, 6 browser tests, build dry run, full crawl of every page × role × desktop/mobile (no crashes/overflow).
- **Next:** owner to confirm GST/HSN, opening hours, map coordinates and Google Business Profile link (for SEO); run the thumbnail backfill after the production import; test direct ESC/POS on the shop printer; nothing committed or deployed.

## Claude · 2026-10-19 · Website controls and UPI QR

- Migration 0010: `products.on_website`/`featured`, `website_categories`, `website_settings` (initialised from the previous rule: products, prices and stock shown only if the catalogue was public). Website visibility is now independent of catalogue access; anonymous catalogue readers get the website's view. Admin view: Workspace → Website (`src/server/website.ts`, `WebsitePanel`).
- Migration 0011: UPI ID and bank details in `erp_settings`, with `qr_on_bills` (off/due/always) and `bank_on_invoice`. UPI links follow the `upi://pay` format with a literal `@` in the payee address; QR rendered with `qrcode-generator` (SVG) and natively via ESC/POS `GS ( k` for direct printing. Owner must enter the real UPI ID and test with a ₹1 scan (preview shown in Billing settings).
- Bills redesigned (`src/client/pos/print.tsx`, `documents.css`): logo (`lenore-mark-print.png`, inlined by Vite so offline printing works), GST summary by rate, savings on MRP, and a cancelled stamp. Documents print through a `PrintArea` portal under `<body>`, so the app is removed with display:none (this fixed the extra blank pages). Named `@page` rules handle the receipt and A4 page sizes. The ESC/POS logo uses `GS v 0`; check it on the shop's printer.
- Fixed a duplicate offline banner in the sales app; browser tests no longer depend on demo stock counts.

## Claude · 2026-10-19 · Stage B (ERP/POS) and audit complete

- `/pos` billing counter, ERP workspace views (invoices, customers, purchases, expenses, register, reports, billing settings), separate PWAs for catalogue, admin and billing. Mobile workspace uses a bottom tab bar and full menu; verified no horizontal overflow at 390 px.
- Audit report `docs/AUDIT.md`; migration 0009 adds indexes. Daily cron cleanup in `env.production`.
- `./run.sh` runs everything locally. Demo items carry illustrative HSN/GST values for billing tests only.
- Next: provision Cloudflare resources (docs/DEPLOYMENT.md), load real products, run a staging load test, then plan the Firebase migration.

## Claude · 2026-10-19 · Stage A complete, Stage B (ERP/POS) next

- User redirected scope: no online purchasing. Built website (SSR/SEO), password/accounts-protected sales catalogue PWA, quotations with WhatsApp sharing, team accounts, inventory upgrades, admin insights. ADR 0005, `docs/PLAN.md`, `docs/REQUIREMENTS.md`, `docs/DEPLOYMENT.md`.
- Fixed migration 0005 syntax and owner username login. Local owner login: username `owner` (see `local-access.txt`).
- User asked to minimise test effort and continue to ERP/POS (one shop, one counter, short-outage tolerance, Firebase migration later).

## Codex · 2026-10-19 · Latest steering: architectural revision also rejected

- User says theme/UI/UX/style still has an “AI slop vibe.” This overrides earlier scoped `ship` reviews. Do not represent current visuals as accepted. Asked async for two or three reference brands/sites; awaiting answer. Pause further speculative visual builds while continuing authorized finance backend work. Preserve luxury buyer / industrial admin requirements and catalogue feature parity.

## Codex · 2026-10-19 · Architectural redesign complete; finance in progress

- User rejected first UI, then selected architectural luxury (strong photography, warm stone, precise type). Implemented `architecture.css`, restructured public pages, Marcellus display font, dark staff nav, source-isolated labelled AI hero + four demo-only product images. Actual uploads take precedence. Seven rasters have provenance; exact prompts in `docs/*-prompt.txt`. Public PDF uses warm charcoal/bronze and existing bilingual Noto. Reviewer F1/F2 both resolved; final scoped `ship` in `docs/reviews/2026-10-19-architectural-redesign.md`. DESIGN.md, sidecar and brief refreshed by documenter. Narrow intentional Marcellus ignore in skill config. 25 API +7 browser/axe tests and build/lint passed; final h3/9px cosmetic corrections will be covered by finance regression run. Preview restarted, retained session now **47940**.
- User added working finance modules and research/planning. Confirmed **India-based, exports only to Qatar, Dubai/UAE and other destinations**; no overseas registered entities identified. User said everything should be ready; live billing migration remains deferred, no endpoint/credentials supplied. Research from IFRS/CBIC/GSTN/DGFT/RBI recorded in `docs/FINANCE_PLAN.md`; do not hardcode tax rates, input-credit eligibility, income tax or statutory dates.
- Finance work underway: new `src/finance.ts` contains strict schemas, exact money parsing, report definitions and CSV import/export; `migrations/0004_finance.sql` contains independent source documents/settlements/obligations/profile/audit, credits/overpayment/period guards. **Not applied or validated yet.** Next: finance API, admin UI, source import workflow, rigorous workerd/browser tests, fix issues, apply local migration and complete docs. Do not claim finance is done. No billing, live data or infrastructure changed.

## Codex · 2026-10-19 · Independent platform implemented

- User deferred billing migration/integration. Billing is live and offline sales are required; do not touch it. New platform uses React/Vite + Hono Worker + local D1/R2. No Wetta UI/source or discarded Lenore site content was copied; logo comes from supplied billing repository and PDF fonts are licensed Noto assets.
- Implemented landing page, catalogue, owner authentication, product CRUD/publication, independent photo/spec poster uploads, revision-checked/idempotent stock adjustment with precise audit reasons, enquiries/follow-up, contact settings and filtered CSV export. Wetta catalogue information mapped in `docs/CATALOGUE_PARITY.md`; suggested MRP, stock quantity/timestamp, customer draft, actual English/Malayalam PDF, copy/native/WhatsApp sharing implemented.
- Latest design instruction is explicit: luxury across public/customer surfaces; industrial and productivity-focused admin. Public uses ivory/bronze/serif; admin has scoped neutral-slate tokens, sans-serif task headings, compact tables, stock/category filters and CSV export. ADRs 0001/0002 capture scope and design split.
- `npm run setup:local` creates ignored owner-only `.dev.vars`/`local-access.txt` and six illustrative products. Preview at http://127.0.0.1:8787 (retained session). Production DB ID is a placeholder; `npm run build` only performs a dry run.
- Final validation: **25 API tests and 7 browser tests pass**, plus typecheck, lint, formatting and client/Worker dry run. Tests cover concurrency, duplicate retries, draft/media privacy, paired images, MRP calculation, CSV formula escaping/filtered contents, PDF/Malayalam, injected failure/retry recovery and desktop/mobile axe checks. All three local migrations applied. Fixture products/enquiries are cleaned after the browser suite. A repeated run hit local login throttling; successful logins now reset failed-attempt counters, with a regression test. Local credentials rotated, preview restarted to reload them and sessions reset.
- Both scoped UI reviews concluded `ship`; original state/semantics fixes were implemented and browser-tested, including successful retry clearing the in-dialog error. Design documentation is complete: `DESIGN.md` and `.impeccable/` describe the separate public/admin systems and actual English/Malayalam PDF adaptation. Remaining release work: real product content, access policy, multiple staff roles, pagination, production resources/backups/monitoring, then a separate offline-aware ERP integration. Current retained preview session: 41612; the older session was stopped during the local credential refresh.

## Codex · 2026-10-19 · Cloudflare implementation plan

- Latest scope: preserve Lenore Billing as ERP/POS but move hosting and persistence to Cloudflare; add integrated inventory/catalogue management, sales catalogue and a fresh landing page. Do not use the discarded website's content/design/assets.
- Inspected GitHub repository via connector (tree `f10603e08a51dfdd57242d83cf97536823f234a5`): Next 16/React 19, Firestore, server actions, shared auth, PDFs and PWA. No production access or source changes. Local git network access failed DNS; connector worked.
- Created `docs/IMPLEMENTATION_PLAN.md`: proposed Workers + D1 + R2, one authoritative inventory service, migration/parity gates, catalogue workflow, cutover/rollback, tests and unresolved business rules. Adapter and D1 suitability require a runtime/workload spike; no final architecture approval implied.
- Next: phase 0 baseline and business rules, then Cloudflare compatibility spike. Billing live status, volumes, stock posting, price/access and offline needs remain open. No app tests run for this documentation-only task.

## Codex · 2026-10-19 · Lenore requirements clarified

- Confirmed: same product range as Wetta/Waterlife; no Tally stock feed; user wants richer management features.
- Logo reference: https://lenore-billing.vercel.app/logo.png. Web fetch failed; local curl could not resolve host. Logo has not been inspected or downloaded.
- Reference already offers receive/issue/set quantity and change history. Proposed improvements should cover structured purchases, sales/dispatch, returns and their stock movements rather than repeat existing controls.
- Open: whether the billing application at the logo domain is an existing operational system to integrate with; which management workflows are priorities. Features remain proposals, not approved requirements. No application changes or tests.

## Codex · 2026-10-19 · Initial discovery

- User wants a better version of their Wetta/Waterlife inventory project for Lenore. Scope and Lenore business details remain unconfirmed.
- Lenore workspace has no application files yet. Reference: `/home/mhdramzy/Projects/inventory-sync-portal`; inspected README, PRODUCT, latest handoff and schema. Reference has extensive uncommitted work; no changes made there.
- Existing capabilities include branded catalogues, shared inventory admin, CSV/Excel Tally imports, product media, stock thresholds, PDF/WhatsApp quotations and inventory history.
- Next: establish Lenore's products, whether stock comes from Tally, and the main improvements wanted before choosing implementation scope. No application changes or tests yet.
