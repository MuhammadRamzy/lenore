# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Cloudflare is the confirmed deployment target. Implementation choice for the independent platform: React with Vite, a same-origin Worker API, D1 and R2. Billing integration is deferred by the user; no billing source is imported or migrated.

## Users

Lenore staff manage inventory and the sales catalogue. Buyers and salespeople explore bath fittings and sanitary ware and prepare quotation enquiries. The user confirmed Wetta's catalogue information as the field reference, including suggested MRP and stock quantities. Exact public-versus-dealer access policy remains open.

## Product Purpose

Build a distinct, better successor to the Wetta/Waterlife catalogue workflow: a new landing page, sales catalogue and useful management workspace, prepared to integrate with the existing ERP/POS later.

## Capabilities and Constraints

Products, media, catalogue publishing, stock management and quotation enquiries belong to the new platform. The existing Lenore Billing app remains untouched for now. No Tally dependency. Start without live business data. Local sample data must be explicitly labelled illustrative. Do not imply inventory synchronisation is connected until it is implemented.

## Brand Commitments

Lenore name and the supplied billing logo. The discarded current website supplies no copy, design or assets. Wetta/Waterlife supplies the catalogue information and workflow reference; do not clone its interface. The user explicitly requires luxury branding across the buyer-facing website, catalogue and quotations, and an industrial, productivity-focused admin workspace. These surfaces should have distinct visual systems. After rejecting the first interface, the user selected architectural luxury: strong photography, warm stone and precise typography. The user wants careful verification.

## Evidence on Hand

Logo from the owner-supplied Lenore Billing repository (`public/logo.png`, upstream commit f10603e08a51dfdd57242d83cf97536823f234a5). No approved product photos, real catalogue data, contact details or commercial claims supplied. Use clearly labelled illustrative imagery only.

## Product Principles

- Publishing and inventory changes should be explicit and traceable.
- Catalogue use should work comfortably on a sales phone.
- Explain empty, failed and disconnected states honestly.
- Keep billing integration isolated until its business rules are confirmed.
