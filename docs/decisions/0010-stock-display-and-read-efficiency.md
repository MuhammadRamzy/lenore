# 0010 · Live counter stock and cheaper catalogue polling

Date: 2026-10-22 · Status: accepted

**Context.** A stock audit found the ledger correct (every change is a guarded `stock_movements` row; sales, returns, purchases, supplier returns, counts and simultaneous bills reconcile), but the billing counter only loaded stock when it opened, so it showed stale figures after sales and purchases. D1 insights showed the catalogue's 30-second change check reading every product row (about 35 million rows a day with 40 phones).

**Decision.**

- The counter refreshes stock from `GET /api/pos/stock` after each bill, after returns and every 20 s, minus bills still queued offline; offline bills deduct locally.
- Migration 0014: triggers bump `counters.catalogue` on any product, website category or website setting change. The catalogue ETag is that number, so a poll reads one row.
- Website photos (`/api/media/:key` for products shown on the website) are cached at Cloudflare's edge (`Cache-Control: public`, immutable keys). Restricted images stay private.

**Consequences.** One extra row write per product change. A photo of a product hidden later stays reachable by its unguessable key for up to 7 days. Edge caching only applies on the custom domain, not workers.dev.
