# Lenore working rules

- Read `docs/STATUS.md`, `docs/HANDOFF.md`, `PRODUCT.md` and `DESIGN.md` before changing this project.
- This is the independent Lenore catalogue platform. ERP migration and integration are deferred; the billing system has live data and requires offline sales. Do not modify it or live infrastructure as part of local platform work.
- Wetta is the field/feature reference, not the UI template. Preserve product code, title, category, suggested MRP, stock, detail text, photo, specification poster and quotation details. Use `docs/CATALOGUE_PARITY.md` to track coverage.
- The discarded Lenore website supplies no design, copy or assets. Sample products are illustrative, never live business data.
- `.dev.vars`, `local-access.txt`, production data and credentials must remain untracked. Use only `--local` database commands for local testing.
- Run typecheck, lint, API tests and applicable browser tests before handoff. `npm run build` checks the client and performs a Worker dry run; it does not deploy.
- Keep `docs/HANDOFF.md` and `docs/STATUS.md` current. Record durable architecture choices in `docs/decisions/`.
