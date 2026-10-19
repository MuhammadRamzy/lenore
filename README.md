# Lenore

One platform for Lenore Trading LLP (bath fittings and sanitary ware, Kuttiady, Kerala): the public website, the sales catalogue and quotations, the billing counter (POS) and the back-office ERP. Built on Cloudflare Workers, D1 and R2 with React.

| Surface | Path | For |
| --- | --- | --- |
| Website | `/` | Customers: brand, collections, products (when public), visit and enquire. Server-rendered for search engines. |
| Sales catalogue | `/catalogue` | Salespeople: phone app to search/scan products, build quotations and share them on WhatsApp. Installable PWA. |
| Customer quotation | `/q/<link>` | Customers: view, download or print a quotation shared with them. |
| Billing counter | `/pos` | Cashiers: GST invoices, payments, receipts, returns, cash shifts. Works through short outages. Installable PWA. |
| Staff workspace | `/manage` | Admins: products, stock, quotations, invoices, customers, purchases, expenses, reports, team, finance. Installable PWA. |

## Run it locally

Requires Node.js 22 or newer.

```sh
./run.sh          # install, set up the local database with sample products, start on http://127.0.0.1:8787
./run.sh test     # typecheck, lint, API tests
./run.sh e2e      # browser tests
./run.sh reset    # wipe the local database and sign-in, start fresh
```

The owner sign-in is generated on first run and stored in the ignored `local-access.txt` (username `owner`). Add salespeople and cashiers in the workspace under **Team**. Sample products are illustrative only.

## Documentation

- [Requirements](docs/REQUIREMENTS.md) and [plan](docs/PLAN.md)
- [Status](docs/STATUS.md) and [handoff](docs/HANDOFF.md)
- [Deployment to Cloudflare](docs/DEPLOYMENT.md)
- [Technical audit](docs/AUDIT.md)
- [Page guide with screenshots (PDF)](docs/Lenore-pages.pdf)
- [Decisions](docs/decisions/) and [design](DESIGN.md)

Nothing is deployed. `npm run build` performs a Cloudflare dry run only. The existing Firebase billing app is untouched; its data migrates later once credentials are supplied through secrets.
