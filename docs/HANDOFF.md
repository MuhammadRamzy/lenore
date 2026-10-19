# Handoff

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
