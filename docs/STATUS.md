# Lenore status

Updated 2026-10-19.

**Stage A (website, sales catalogue, quotations, inventory, admin) — implemented and verified locally.**
- Server-rendered public website at www.lenoretrading.com with real business details, JSON-LD, sitemap, robots, canonical URLs.
- Installable phone-first sales catalogue (PWA, offline start), quotation builder with admin pricing policy, numbered versioned quotations, WhatsApp-first sharing, PDF, customer link.
- Catalogue access modes (public / shared password / team accounts), team accounts with discount caps.
- Inventory: typed movements, ledger, stock count, CSV import, photos by code, barcode labels, cost/valuation.
- Admin insights, quotations, team, access/pricing.
- Checks: typecheck, lint, 56 API tests, 6 browser tests (incl. accessibility and PWA offline) pass.

**Stage B (ERP/POS) — in progress.** Scope in `docs/PLAN.md` and `docs/REQUIREMENTS.md`.

Not done: production Cloudflare resources (D1 ID, R2 bucket, secrets), real product data/photos, Firebase billing migration (awaiting credentials via secrets). Nothing has been deployed.
