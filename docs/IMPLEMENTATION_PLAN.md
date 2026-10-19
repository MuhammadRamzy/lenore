# Lenore implementation plan

Date: 2026-10-19. Status: proposed implementation plan; no migration or deployment performed.

Scope update during implementation: the user deferred billing migration/integration and requested the independent platform first. Billing is live and requires offline sales. See `STATUS.md` and decision `0001-independent-platform.md` for the active scope. This document retains the earlier full migration proposal for later use.

## Outcome and scope

Keep Lenore Billing as the ERP/POS product and preserve its useful workflows. Move its hosting and persistence to Cloudflare, add catalogue management and a sales catalogue, and build a fresh public website. All applications use one authoritative inventory. No Tally dependency. Do not reuse the current Lenore website's design, content or assets. The supplied billing logo is the brand reference; obtain product content and business details independently from the owner.

The latest request supersedes keeping billing hosted on Vercel: the application remains, while its infrastructure moves. Keep production operating on its current stack until the replacement passes acceptance.

## Evidence and limits

Inspected [Lenore-Billing](https://github.com/MuhammadRamzy/Lenore-Billing), with repository tree at `f10603e08a51dfdd57242d83cf97536823f234a5`, and selected source files. This is planning discovery, not a full code audit. Production data, traffic, account configuration and hardware have not been inspected. Git clone was unavailable due to local DNS restrictions; source was read through the GitHub connector.

- [package.json](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/package.json): Next.js 16 / React 19, Firebase Admin, React PDF, QR/ZIP utilities and Vitest.
- [Persistence](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/lib/db.ts): Firestore collections, five-minute process-local caches and shared password storage. Read failures can return defaults or empty lists; auth lookup has a default-password fallback. These need explicit failure handling during migration.
- [Schemas](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/lib/types.ts): products, customers, invoices/quotations, purchases, expenses, trips and stock logs. Preserve all these domains. Product stock is integer-valued but invoice quantities allow fractions; resolve unit precision before migration. Billing rate is not explicitly MRP.
- [Mutations](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/app/actions.ts): stock, documents and counters are saved separately; audit failures are swallowed. Concurrent saves and partial failures need transactional handling. Some adjustments clamp at zero. Invoice creation deducts stock based on document type, including drafts; agree the desired posting rule and retain historical effects during migration.
- [Invoice PDF](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/app/api/invoices/%5Bid%5D/pdf/route.tsx): server rendering and a filesystem logo path require Workers compatibility testing.
- [Service worker](https://github.com/MuhammadRamzy/Lenore-Billing/blob/f10603e08a51dfdd57242d83cf97536823f234a5/public/sw.js): caches dynamic pages. Redesign authenticated/offline caching and logout cleanup before release.

The Wetta/Waterlife project is a workflow reference for quotations, media and catalogue operations. It has extensive uncommitted changes; do not copy its working tree, production data, credentials or branding. Reuse selected ideas or reviewed modules only after isolating Lenore configuration and dependencies.

## Proposed architecture

Three user-facing areas, with a private shared business service:

| Area                      | Proposed address, subject to DNS access | Responsibility                                                                      |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Public site and catalogue | `lenoretrading.com`, `/catalogue`       | Fresh website, discoverable product content, enquiry and quotation flow             |
| Management workspace      | `manage.lenoretrading.com`              | Media, catalogue publishing, staff, visibility and inventory overview               |
| Existing ERP/POS          | `billing.lenoretrading.com`             | Products, operational stock, purchases, billing, customers, expenses and trips      |
| Business service          | Private Worker service binding          | Permissions, canonical records, stock posting, catalogue reads and quote conversion |

Browser requests go to their application's server; servers call the private business service. Public applications receive only an explicit published-product projection. Bind the canonical database to the business service, rather than grant every frontend unrestricted access. Keep app cookies host-scoped; shared staff identity can use short-lived, audience-bound login handoffs instead of a broadly scoped cookie.

Suggested workspace, established after the compatibility spike: `apps/billing`, `apps/web`, `apps/manage`, `workers/core`, `workers/jobs`, `packages/contracts`, `packages/domain`, `packages/db`. Import the billing repository with recorded origin/commit history; keep its original repository available for rollback. Repository consolidation is an implementation proposal, not a prerequisite to discovery.

| Cloudflare service          | Planned use                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| Workers and static assets   | Applications and private API                                                |
| D1                          | Authoritative ERP, inventory, publishing, quotation and identity records    |
| R2                          | Product media; separate private documents/backups with authenticated access |
| Queues and scheduled Worker | Retryable exports, PDFs, media work and reconciliation                      |
| DNS, TLS and caching        | Domains and public content delivery                                         |
| Worker logs and metrics     | Errors, latency, job backlog and usage                                      |

D1 is the proposed default, contingent on measured data size and concurrent POS tests. Its database size and single-database throughput limits must be checked against Lenore's workload. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Preserve the current React/Next.js application initially. Cloudflare currently recommends vinext, but documents it as beta; compare it with the supported OpenNext route against the exact locked dependencies. Select and pin the path only after login, Server Actions, proxy routes, revalidation, printing and PDFs pass in Workers. Do not assume the reference project's adapter works unchanged with this app. [Cloudflare Next.js guidance](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

Budget for production capacity using current Workers, D1, R2 and Queues pricing after measuring volume; no free-tier or fixed monthly-cost promise. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Data ownership and inventory integration

| Data                                                                       | Owner                         | Catalogue behaviour                                                               |
| -------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Stable product ID, SKU, unit, billing name, tax and operational rate       | ERP business service          | Read permitted fields; merchandising title can differ                             |
| Quantity, purchases, sales, stock corrections                              | ERP business service          | Display derived availability; route permitted corrections through ERP commands    |
| Public title, description, category, specifications, images and publishing | Catalogue management          | Editable without changing historical invoice descriptions                         |
| MRP, public price and trade pricing policy                                 | Explicit shared pricing rules | Separate fields; do not assume `defaultRate` is MRP or expose wholesale discounts |
| Catalogue quote requests                                                   | Sales workspace               | Staff review; convert once into ERP quotation, then invoice through ERP workflow  |
| Customer records, accounts and private documents                           | ERP                           | Never included in public catalogue payloads                                       |

Use existing UUID product IDs as joins, preserving SKU aliases when codes change. Archiving a product removes it from new catalogue selections while preserving invoice references. Catalogue records extend products; they do not duplicate stock.

Inventory behaviour:

1. A posted purchase adds stock. A posted sale subtracts stock. A quotation has no stock effect. Proposed new rule: drafts do not post stock; confirm this before changing existing behaviour. Import existing balances without reposting historical documents.
2. Record document, line items, sequence allocation, stock movements, audit event and background-job outbox atomically. An idempotency key makes retries return the original outcome. SQL constraints or transactional assertions must turn an insufficient-stock/version check into a full rollback, rather than silently update zero rows.
3. Aggregate repeated product lines before checking stock. Enforce nonnegative available stock unless an explicit authorised backorder policy is agreed. Quantity precision follows the confirmed unit model. Monetary calculations use defined decimal/integer precision and documented rounding; compare legacy totals before changing calculation behaviour.
4. Editing, cancelling or returning a posted transaction uses linked corrective movements. Preserve historical document and customer snapshots; prevent destructive removal of referenced records.
5. Catalogue reads current authorised availability from the shared service. Target committed stock visible in a fresh catalogue fetch within five seconds under normal connectivity; validate this target in staging. Initial implementation uses a freshness timestamp and refresh on focus/short polling while visible. Avoid indefinite stock caches; recheck quantities and prices at quote conversion/posting.
6. Quote submission records customer intent, not a stock reservation or confirmed order. Add reservations only if the business requests them, with atomic allocation, expiry and cancellation.
7. Queue messages carry job IDs and record revisions. Consumers tolerate duplicates and out-of-order work; retry with dead-letter handling. A scheduled outbox sweep recovers the gap between database commit and queue delivery. Queue failure must not undo a completed sale.

This replaces stock synchronisation between independent databases with shared authoritative reads. Events support background work and refresh notifications. [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

## Management and customer experience

First release:

- Product organisation: categories, collections, specifications, merchandising titles, draft/published/archived states and safe bulk edits with preview.
- Media library: multiple product photos, spec sheets, ordering, alt text, upload validation, missing-image filters and orphan cleanup. Files go to R2 with generated keys; public and private access are separate. [R2](https://developers.cloudflare.com/r2/)
- Inventory view: current stock, low/out-of-stock filters, item movement history, last refresh time, replenishment export and links to permitted ERP actions.
- Sales catalogue: fast mobile search/filtering, product details, configurable availability/price visibility, quantity entry, persistent quotation basket, PDF and WhatsApp sharing.
- Sales management: saved quote requests, assignment, follow-up status, notes, expiry, revision history and linked ERP conversion. Opening WhatsApp must not mark delivery or acceptance as confirmed.
- Roles proposed: owner, billing operator, inventory operator, catalogue editor and salesperson. Enforce permissions on the server and record actor/reason for sensitive changes.
- New landing page: product ranges, catalogue access and contact/enquiry flow. Publish only owner-confirmed business details and claims. Fresh design and copy; no material from the discarded website.

Optional later scope: dealer-specific access/pricing, reservations, multi-warehouse stock, offline transaction posting, CRM automation and online checkout. None is implied by this first release. Keep existing ERP quotation/billing functionality; do not build a second purchase or accounting module.

## Delivery phases and acceptance gates

| Phase                          | Implementation work                                                                                                                                                                                                                 | Required exit evidence                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Baseline and decisions     | Pin repository commit; inventory routes, data collections, imports/exports, printing and workflows. Measure data/traffic/devices. Confirm posting, pricing, catalogue access and offline rules. Record current test/build failures. | Feature checklist, data map, sample invoices/PDFs, workload estimate and agreed rules                                              |
| 1 — Cloudflare proof           | Test exact Next.js adapter versions, service bindings, D1 transaction prototype, QR/print, PDF/sticker/trip exports and R2 logo loading in workerd. Replace filesystem asset paths.                                                 | Staging compatibility report, concurrency spike and runtime/cost measurements; adapter ADR                                         |
| 2 — Core and migration tooling | SQL schema/repositories, permissions/sessions, idempotent stock commands, sequences, outbox and audit. Build export/transform/import/reconcile tools.                                                                               | Local and staging transactional tests pass; restartable migration and restore drill succeed                                        |
| 3 — ERP parity                 | Connect existing billing UI/actions to core service; migrate all existing domains, reports, imports/exports and document rendering. Remove Firebase from target production runtime.                                                 | Staff acceptance of billing, purchases, customers, expenses/trips, stock, PDFs, printing and QR; no unexplained parity differences |
| 4 — Catalogue management       | Product extensions, media, publication, pricing visibility, inventory overview, roles and lead/quote management.                                                                                                                    | Permission matrix passes; ERP-originated changes appear correctly; catalogue editing preserves historical ERP data                 |
| 5 — Sales catalogue and site   | Fresh responsive website, catalogue, quote basket, PDF/WhatsApp, enquiry capture and ERP quote conversion.                                                                                                                          | Desktop/mobile accessibility and functional checks; only published permitted fields exposed; one quote converts once               |
| 6 — Rehearsal and cutover      | Full staging import/reconciliation, operator training, backup/restore, final write freeze, final export/import, routing and smoke tests.                                                                                            | Signed reconciliation and operator acceptance; one active writer; rollback procedure exercised                                     |
| 7 — Stabilisation              | Monitor and reconcile, resolve defects, document support and retention, then retire old hosting and credentials.                                                                                                                    | Agreed observation period complete; backups tested and old system safely archived                                                  |

Dependencies: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Site content preparation can happen alongside backend work after the content source and product model are agreed. Estimate delivery dates after phases 0–1; current evidence is insufficient for a reliable calendar commitment.

## Migration and cutover procedure

1. Take a read-only inventory of all Firestore collections and referenced media; do not assume inspected types cover all live data. Export documents with IDs, timestamps, nested fields, references, settings, counters and checksums into restricted storage. Capture the current hosting version/configuration without putting secrets in the repository.
2. Transform into versioned SQL records. Preserve IDs, document numbers, statuses, snapshots and historical totals. Retain original source values for traceability. Report duplicate SKUs/numbers, dangling references, fractional quantities, negative stock, missing fields and inconsistent totals; resolve or explicitly document exceptions rather than silently correcting them.
3. Import staging in restartable, checksummed batches. Reconcile counts by collection/table, every product balance, per-period invoice/purchase/expense totals, customer links, trip data, document snapshots and sequence high-water marks. Never recalculate old tax/rounding amounts during import.
4. Treat exported product stock as the opening cutover balance. Retain legacy stock logs as history; do not replay them over that balance. Reconstruct earlier balances only if historical evidence supports it.
5. Run staff workflows against staging and a restored backup. Confirm all known write paths can be paused, including scripts and old Server Actions; DNS changes alone do not stop writes through the old URL.
6. At cutover, stop all old writes and drain in-flight operations. Take a final consistent export, import and reconcile. Pre-warm required assets, provision staff accounts and verify next document numbers. Route apps/domains only after acceptance; enable new writes at one controlled point.
7. Before new writes, rollback can reopen the unchanged old system. After new writes, do not simply route back to stale Firestore: freeze the new system, export/reconcile post-cutover transactions and either apply a verified reverse migration or repair forward. Write and rehearse this procedure before go-live.
8. Keep Vercel/Firebase read-only for an agreed retention period; remove credentials and old endpoints only after stability and restore checks. The old Vercel hostname is controlled by Vercel; do not assume it can become a Cloudflare custom domain.

Use D1 recovery plus scheduled encrypted/restricted exports with retention and a restore drill. Restore production writes only after identifying transactions after the recovery point. Private financial documents and backups must never share public catalogue access. [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/)

## Verification and operations

- Core: invoice/purchase posting, drafts, returns/cancellation, duplicate item lines, fractional unit policy, edits, retries, insufficient stock, rollback on failure and sequence uniqueness under concurrent sales.
- Migration: empty/partial/interrupted imports, repeated import, checksums, foreign keys, balances, totals, all document types and restore from backup.
- Identity: no fallback credentials, adaptive salted password hashing or selected managed identity, revocable sessions, role checks on every mutation, CSRF/origin protection, login throttling and private-file authorisation.
- Runtime: test production bundles in Workers, not only Next dev; invoice/trip/sticker PDFs, large exports, QR scanning, printer layouts, fonts, logo, response limits and peak concurrency.
- Catalogue: publication/price/access rules, media handling, freshness, quote expiry/repricing, repeated submission/conversion and contact-data privacy.
- Browsers/PWA: desktop and actual sales phones, slow connectivity, install/update, logout cache purge, no caching authenticated responses, and clear offline state. Initial offline mode can preserve local drafts but cannot claim a sale committed offline.
- Operations: alert on failed postings, latency, job backlog, stale catalogue reads, reconciliation differences and spend. Log operation IDs without customer/payment details. Set explicit recovery and stock-freshness targets after measuring business needs.

CI gates: applicable existing unit tests, new invariant/integration tests against local D1, lint, typecheck, production build and focused browser tests. Record pre-existing failures separately. No production migration until phase exit evidence is available.

## Questions to resolve during phase 0

Planning can proceed with one business and online posting as assumptions. Before implementation decisions depend on them, confirm:

1. Is billing live with real data? Product/document counts, simultaneous operators and location count?
2. Which stock event is correct for Lenore: invoice posting or dispatch? What should happen to existing stock-affecting drafts?
3. Is the catalogue public or dealer-only, and should it show exact stock, availability only, MRP or trade prices?
4. Must POS transactions work without internet? Which printers/scanners and paper sizes are used?
5. Who controls Cloudflare/DNS, and what maintenance window and recovery tolerances fit operations?

No changes to live DNS, billing or Firestore are part of this planning task.
