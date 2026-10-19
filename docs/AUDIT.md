# Lenore platform technical audit

Date: 2026-10-19 · Scope: Cloudflare Worker API, D1 schema (migrations 0001–0009), server-rendered website, sales catalogue PWA, staff workspace PWA and billing counter (POS) PWA · Commit range: Stage B through audit remediation.

## 1. Executive Summary

This audit reviewed the Lenore platform's Worker API, D1 schema, server-rendered website, sales catalogue, staff workspace and billing counter across nine dimensions. Each finding was identified from source review, SQLite query plans, automated tests or browser measurement, and each fix was verified with the same method. Twenty-six findings were recorded: twenty-two were remediated in this pass, and four are documented as accepted trade-offs, deferred work or owner actions. The most significant fixes were a full table scan on every product image request, now served by two partial indexes; credit-note numbers that could skip a value when a return failed, now claimed inside the same atomic database batch; client requests with no timeout; and a phone layout in which wide tables enlarged the browser viewport from 390 to 645 pixels. After remediation, 64 API tests in the workerd runtime, 6 browser tests and axe WCAG 2.1 AA checks on 32 workspace and counter views pass, and the production configuration completes a Cloudflare dry-run deployment. No load test was run, because no production resources exist yet.

## 2. Technical Audit and Remediation Findings

Severity: **High** = incorrect records, compliance risk or a blocked user; **Medium** = degraded speed, resilience or access; **Low** = limited impact.

| Category | Issue | Severity | Recommended Fix | Implementation Status |
| --- | --- | --- | --- | --- |
| Integration | Client requests had no timeout; a stalled connection left screens waiting with no end. | High | Abort after 20 s; keep network failures distinct from API errors so the POS still queues bills offline. | Fixed (`src/client/api.ts`) |
| Integration | Non-JSON responses (gateway or HTML errors) surfaced as JSON parse errors. | Medium | Read the body as text, parse defensively, use status-based messages. | Fixed |
| Integration | Website route failures returned a JSON body to browsers. | Low | Return an HTML error page for non-`/api` routes. | Fixed (`src/server/index.ts`) |
| Efficiency | About and Contact pages read every published product but display none. | Low | Skip the product query for pages without product content. | Fixed; local demo data: `/about` 44 ms vs `/` 54–79 ms |
| Efficiency | Quotation creation read pricing settings twice. | Low | Read once and pass to the pricing function. | Fixed |
| Efficiency | The shift list ran each shift summary concurrently, exceeding D1's documented limit of six concurrent connections per invocation. | Medium | Run summaries sequentially. | Fixed (`src/server/erp.ts`) |
| Speed | Public pages were re-rendered on every request; `s-maxage` was set, but nothing stored responses at the edge. | Medium | Cache API middleware for public routes (pages 60 s, sitemap 600 s, robots 3600 s). | Fixed; active only when `SITE_ORIGIN` is set (production) |
| Reliability | Credit-note numbers were allocated before the database batch, so a failed return left a gap in the GST document series. | High | Claim the number inside the same atomic batch; retry on a unique-number conflict. | Fixed; test asserts consecutive numbers after a rejected return |
| Reliability | Online invoices required exact equality with the server's India date, rejecting sales from counters with a clock skew around midnight. | Medium | Accept ±1 day for online invoices; offline invoices unchanged. | Fixed |
| Reliability | Expired sessions and rate-limit rows were deleted only during sign-in, so the tables grew without bound. | Medium | Daily cron cleanup plus expiry indexes. | Fixed; cron `15 3 * * *` (production), tested |
| Reliability | Price-list saves allowed 5,000 items (5,002 statements in one batch); imports allowed 500 rows (up to 1,000 statements). | Medium | Cap price lists at 900 items and imports at 400 rows. | Fixed |
| Availability | No endpoint for uptime monitoring. | Medium | `GET /api/health` with a D1 round trip; 503 when the database is unavailable. | Fixed; local response 12 ms |
| Availability | Production resources (D1 ID, R2 bucket, secrets) are not provisioned; nothing is deployed. | High | Follow `docs/DEPLOYMENT.md` with owner Cloudflare access. | Open (owner action) |
| Accessibility | Workspace sidebar group labels had a 1.64:1 contrast ratio (axe `color-contrast`). | Medium | Darken to `#46586b` on `#e9edf2`. | Fixed; axe passes |
| Accessibility | Horizontally scrolling tables were not keyboard-focusable (axe `scrollable-region-focusable`, reports, customers and team views). | Medium | `tabIndex=0`, `role="region"` and an accessible name on each scroll container. | Fixed; axe passes |
| Accessibility | On phones, wide tables enlarged the layout viewport to 645 px on a 390 px screen, zooming the workspace out. | High | CSS containment on table containers; bottom tab bar columns `minmax(0,1fr)`. | Fixed; measured document width 390 px |
| Functionality | The POS "reserved numbers" count rendered once and went stale. | Low | Hold the count in state and update it after each allocation. | Fixed |
| Functionality | Loading a quotation into a bill could produce a discount larger than the line after an MRP reduction. | Low | Derive the rate first and clamp the discount to 0…line total. | Fixed |
| Consistency | Views of edge-cached website product pages are not counted, because cache hits skip the Worker handler. | Low | Accept; catalogue-app product views are still counted. | Accepted trade-off |
| Consistency | Table `quotes` stores website enquiries while `quotations` stores sales quotes. | Low | Rename in a future migration with data copy. | Deferred (documented) |
| Database | Every product image request checked access with a full scan of `products` (`SCAN products`). | High | Partial indexes on `image_key` and `poster_key`. | Fixed; plan: `MULTI-INDEX OR` |
| Database | The catalogue change check (`COUNT`, `MAX(updated_at)` for published products) had no covering index. | Medium | Index `(published, updated_at)`. | Fixed; plan: covering index |
| Database | Invoice and expense lookups by shift were unindexed. | Medium | Indexes on `invoices(shift_id)` and `expenses(shift_id)`. | Fixed |
| Database | Session and rate-limit cleanup by expiry had no index. | Low | Indexes on `sessions(expires_at)` and `rate_limits(expires_at)`. | Fixed |
| Database | The unused-invoice-number report expanded every number block ever issued. | Low | Restrict to the current financial year. | Fixed |
| Database | Customer substring search scans the `customers` table. | Low | Accept at current size (results limited to 25); add a search index if customers exceed several thousand. | Accepted |

## 3. Database Performance Analysis and Optimization

1. **Method.** All nine migrations were applied to an in-memory SQLite database, and `EXPLAIN QUERY PLAN` was run on 25 frequent queries: sign-in, catalogue list and change check, media access, product by slug or barcode, quotation lookups, invoice, payment and credit-note lookups, stock ledger, expenses, finance ranges, number blocks and shift lookups. After remediation, the only query that still scans a table is the customer substring search (accepted, limited to 25 rows).
2. **Media access.** Before: `SCAN products` on every image request. After: partial indexes `products_image_key` and `products_poster_key`, resolved as a `MULTI-INDEX OR` search.
3. **Catalogue refresh.** Clients revalidate with an ETag built from `COUNT(*)` and `MAX(updated_at)` of published products, now answered from the covering index `products_published_updated`. Measured locally: an unchanged catalogue returns `304` with a 0-byte body in 15 ms; the full response is 1,717 bytes for the six demo products.
4. **Billing lookups.** Added `invoices_shift` and `expenses_shift` for shift summaries and counter bill lists. Existing indexes on invoice date, customer, number, payments by invoice and credit notes by invoice were confirmed by query plan.
5. **Housekeeping.** Added `sessions_expiry` and `rate_limits_expiry`; a daily scheduled handler deletes expired sessions, catalogue sessions and rate-limit windows in one batch.
6. **Write integrity.** Each invoice, credit note, purchase, supplier return, receipt and expense is written as one D1 batch; per Cloudflare's D1 documentation, a failing statement aborts and rolls back the whole sequence. Stock changes pass through `stock_movements`, whose trigger rejects any movement whose expected product revision or stock no longer matches (`STOCK_CONFLICT`). Writers re-read and retry up to four times.
7. **Gap-free document numbers.** Invoice numbers are reserved to counters in blocks (`number_blocks`), and unused numbers are reported per financial year. Credit-note numbers are now advanced inside the same batch as the credit note, with retry on a unique-number conflict.
8. **Batch sizes.** Price lists are capped at 900 items and imports at 400 rows, keeping each atomic batch below the 1,000-queries-per-invocation figure in D1's limits table.
9. **Connection concurrency.** Request handlers issue at most six concurrent D1 operations; the shift list, which exceeded this, now runs sequentially.
10. **Immutability.** Triggers block deletion of invoices, invoice lines, payments, credit notes, expenses, quotation versions, finance documents, settlements and audit rows; corrections use credit notes, reversals or new versions.

## 4. Stability and Resilience Assessment

The platform's write paths are designed so that retries and concurrent users do not create duplicate or inconsistent records. Invoices, quotations, stock movements, stock counts, receipts and expenses carry client-generated identifiers; a repeated request with the same identifier and payload returns the original result, while a different payload under the same identifier is rejected. The API test suite verifies this for invoices and quotations. Concurrent stock adjustments are serialised by a database trigger that compares product revisions; a test running two simultaneous adjustments confirms that one succeeds and the other receives a conflict, with stock never falling below zero.

The billing counter continues through short outages. Invoice numbers are reserved in advance; when a request fails at the network level, the bill keeps its legal number, is printed and is queued on the device. Queued bills are resent every 20 seconds and when connectivity returns. A sale synced after stock has run out is still recorded and flagged for stock review rather than rejected.

Failures are reported with specific messages: finance trigger errors and constraint violations map to conflict responses, validation errors to field messages, and unexpected errors are logged with the request path. A health endpoint exposes database reachability for external monitoring, and a daily job bounds the growth of session and rate-limit tables.

The following remain unverified. No load test has been run, so throughput under 40 concurrent salespeople and simultaneous billing is not measured. D1's single-database write throughput has not been benchmarked against Lenore's volumes. Edge caching and scheduled cleanup run only in production configuration and have not executed against Cloudflare. A load and failover rehearsal on staging resources is required before go-live.
