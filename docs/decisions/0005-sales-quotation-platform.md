# 0005 — Sales quotation platform, not an online store

Date: 2026-10-19 · Status: user-directed

Lenore does not sell online. Customers find Lenore through the website and buy through the showroom and sales team. The platform provides:

1. **Public website** — brand, ranges, about, visit/contact; server-rendered for search engines and built on the owner's real business details (Lenore Trading LLP, Vatayam, Kuttiady, near Mother Clinic; +91 75111 63131; lenorebathfittings@gmail.com; GSTIN 32AANFL0054E1ZR; www.lenoretrading.com).
2. **Sales catalogue** — an installable, phone-first app for about 40 salespeople using it all day: instant search, product sheets, quotation builder, saved/numbered quotes and WhatsApp-first sharing.
3. **Staff workspace** — products, stock, team, catalogue access, quotation oversight, analytics, enquiries and finance.

Online checkout, carts, customer accounts and orders are explicitly out of scope.

## Decisions

- **Catalogue access mode is chosen by the admin:** `public`, `password` (one shared password, existing) or `accounts` (individual salesperson logins). Salesperson accounts can sign in under any mode; deactivating one revokes their sessions immediately.
- **Visibility:** public visitors see suggested MRP and stock status (Available / Low stock / Unavailable), never exact quantities. Shared-password users, salespeople and admins see exact stock.
- **Pricing policy is chosen by the admin:** `mrp` (no discounts), `capped` (per-line discount up to a percentage cap, with optional per-salesperson caps) or `free` (salespeople may set any line price). Admins are never capped. Public and shared-password quotes are MRP only.
- **Quotations are first-class server records** with numbers (`LQ-YYYY-NNNN`), statuses (draft, sent, won, lost), immutable version snapshots and an unguessable customer link (`/q/<token>`, noindex).
- **Sharing:** primary action is WhatsApp to any contact (`wa.me/?text=` with summary + link). Also: the customer's WhatsApp number, PDF through the native share sheet, the customer link, copy and print.
- **Website enquiries** keep using the existing `quotes` table and Enquiries view.
- **Load:** rate limits are keyed by IP *and* account so a shared showroom connection cannot lock out the team; the catalogue uses ETags so periodic refreshes return 304; product media is privately cacheable because keys are immutable.
- **Billing** stays separate and untouched. Bringing billing into this platform is a later stage that needs an offline-capable design; a won quotation is the natural hand-off point.
