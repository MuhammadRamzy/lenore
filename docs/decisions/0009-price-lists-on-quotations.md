# 0009 · Price lists apply to quotations

Date: 2026-10-22 · Status: accepted

**Context.** Price lists (per-customer prices or a percentage off MRP) were applied only at the billing counter. Quotations named the customer as free text, so a dealer's quotation started from MRP, and a bill made from it was not linked to the dealer.

**Decision.** An owner or admin quotation may link a saved customer (`quotations.customer_id`, migration 0013). Lines left untouched take that customer's price-list price, on the phone and on the server (same rule as the counter's `priceFloors`). Salespeople, anonymous and shared-link quotations cannot search or link customers (owner's choice). The counter loads a linked quotation with its customer and keeps the quoted prices.

**Consequences.** Dealer quotations with list prices are prepared by owners/admins. The sales catalogue still shows MRP only.
