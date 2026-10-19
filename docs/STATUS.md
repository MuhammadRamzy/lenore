# Lenore status

Updated 2026-10-19.

**Stage A — website, sales catalogue, quotations, inventory, admin: implemented and verified locally.**

**Stage B — ERP and POS: implemented and verified locally.** Counter billing with GST invoices (CGST/SGST or IGST, HSN), reserved invoice-number blocks for short outages, split payments, 80 mm / A4 / direct ESC-POS printing, returns and credit notes, cash shifts with X/Z reports, customers with credit limits, ledgers and receipts, price lists, purchases with moving-average cost and supplier returns, expenses with bill attachments and reversals, GST/HSN/B2B/B2C reports, dead stock and number-gap checks. Sales, returns, purchases, payments and expenses post automatically to the finance subledger.

**Audit — complete.** See `docs/AUDIT.md`: 26 findings, 22 fixed, 4 accepted/deferred/owner action.

Verification: typecheck, lint, 64 API tests (workerd), 6 browser tests, axe WCAG 2.1 AA on 32 workspace/counter views and the public surfaces, production dry-run build.

Not done: production Cloudflare resources and secrets (owner access needed), real product data/photos, Firebase billing migration (awaiting credentials via secrets), load test on staging. Nothing has been deployed.
