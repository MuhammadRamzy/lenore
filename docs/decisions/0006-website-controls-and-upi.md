# 0006 · Website visibility controls and UPI payment codes

Date: 2026-10-19 · Status: accepted

## Context

The owner wants to choose what the public website shows, since not every product, collection, price or stock level should always be public. Until now the website showed every published product, with prices and stock only when the sales catalogue was public. The owner also wants the counter to generate UPI QR codes from shop details set by admins, and to print them on bills.

## Decision

- Website visibility is a separate layer from catalogue publication. `published` still controls whether a product exists for the sales team. `on_website`, hidden collections and the site-wide switches (products, prices, stock) control only anonymous visitors: website pages, the sitemap, structured data, the anonymous catalogue API and public image access.
- When migration 0010 runs, the switches take their values from the catalogue's access mode at that moment, so the website looks the same as it did before.
- Featured products are an explicit admin choice, capped at 12. If none are chosen, the home page keeps its previous fallback of products with photos.
- UPI codes use the standard `upi://pay` deep link with the amount and bill number, generated on the device. The counter keeps working offline, and no payment provider is involved. Payment confirmation stays manual (the cashier checks the payment and records the UTR), because a static UPI ID gives no callback.
- A QR prints on bills only by admin choice: never, only when an amount is due (for that amount), or always.

## Consequences

- Switching the catalogue to private no longer hides website products by itself. Admins use Workspace → Website for that, and the Access screen says so.
- Automatic payment confirmation would need a payment gateway or bank API. That is out of scope.
