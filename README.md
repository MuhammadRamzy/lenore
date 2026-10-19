# Lenore

A new sales catalogue, inventory and catalogue-management workspace, and landing page for Lenore. Built independently with React/Vite, a Cloudflare Worker, D1 and R2. The existing live billing system is unchanged; ERP integration is deferred.

## Run locally

Requires Node 24 and npm.

```sh
npm ci
npm run setup:local
npm run dev
```

Open [the website](http://127.0.0.1:8787), [catalogue](http://127.0.0.1:8787/catalogue) or [staff workspace](http://127.0.0.1:8787/manage). The generated local password is in `local-access.txt`; the setup never uses a shared default password. Both that file and `.dev.vars` are ignored, with owner-only filesystem permissions.

Local setup applies migrations and adds six clearly labelled illustrative products. Re-running it preserves existing records and edits. No command in setup targets a remote database. Demo values do not describe Lenore's actual products, prices or stock. Product photos and specification posters can be uploaded through the editor.

The buyer interface follows the user-selected architectural luxury direction: warm stone, charcoal and precise display typography. The hero is AI-generated architectural inspiration. Four demo product records use labelled AI-generated illustrations only when `DEMO_MODE` is enabled and no uploaded photo/poster exists. These images are not real Lenore merchandise; production records retain explicit missing-photo states. Exact generation prompts are saved in `docs/*-prompt.txt`. The staff interface remains independently scoped for operational work.

For browser hot reload, keep the Worker running and use `npm run dev:ui` in another terminal; Vite proxies `/api` to the local Worker. After changing client code, run `npm run build:client` to update the integrated port-8787 preview.

## Working features

- New responsive landing page using the supplied logo and labelled illustrative bathroom photography.
- Searchable/category-filtered catalogue with suggested MRP, stock status and quantity, item details, last-updated information, product photographs and specification posters.
- Persistent quotation basket and customer draft, typed quantities, item amounts, total quantity/MRP, real PDF download, printing, copy text and WhatsApp sharing to a chosen recipient, Lenore or the customer. PDF supports English and Malayalam text.
- Product creation/editing, draft/published controls, independent photo/poster uploads, stock receive/issue/count, audit history, enquiry review/status and configurable WhatsApp contact.
- Industrial staff tables with stock/category filters and export of the current view as a spreadsheet-safe CSV.
- Provisioned owner sign-in, expiring revocable sessions, origin checks, login/enquiry throttling, upload size/type validation and restricted draft media.
- D1 inventory movements enforce optimistic concurrency and idempotency inside the database. Enquiries never reserve or reduce stock.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

API tests run in Cloudflare's `workerd` runtime with isolated test D1/R2 resources. Browser tests use the local preview and illustrative records; they must not be pointed at a live system. Configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing browser binary, or install Playwright's supported Chromium separately.

`npm run build` bundles the site and runs `wrangler deploy --dry-run`. No hosting resources are created and nothing is deployed. `wrangler.jsonc` contains a placeholder database ID and local resource names; production resources/configuration still need deliberate setup.

## Current boundaries

One owner account is implemented. Multi-user permissions, catalogue access policy, bulk imports, production domains, backups/monitoring and live ERP integration remain follow-up work. Local stock is independent of ERP and is labelled as disconnected. Existing offline POS functionality is outside this platform; future integration must define offline replay and stock reconciliation before activating sync.

The public catalogue exposes published stock quantities, matching the requested Wetta information. Before live publication, confirm dealer/public access policy and provision catalogue authentication if required. Product/quote lists currently cap at 2,000/200 records and activity at 100; pagination is a production-readiness task. Thirty-second visible-page refresh is implemented; immediate reads after reload are uncached.

See [current status](docs/STATUS.md), [catalogue parity](docs/CATALOGUE_PARITY.md), [architecture decision](docs/decisions/0001-independent-platform.md) and [handoff](docs/HANDOFF.md). The earlier [migration plan](docs/IMPLEMENTATION_PLAN.md) remains historical context; its ERP phases are deferred by the latest user instructions.
