# 0001 — Build the catalogue platform independently first

Date: 2026-10-19. Status: accepted scope from user steering; implementation choices below are reversible defaults.

The user deferred Lenore Billing migration and confirmed live billing data and offline sales requirements. Build the new catalogue, management workspace and landing page now. Do not import or modify billing. No Wetta/Waterlife code or discarded-site material is used.

Use React/Vite and a same-origin Hono Worker with D1 and R2. This avoids requiring a Next.js adapter to start a separate application. Wrangler configuration is local, with a placeholder D1 ID and no production deployment command. Production configuration must be created deliberately later.

Until integration, stock is local to this workspace, visibly disconnected from ERP. Stock adjustments are integer quantities, revision-checked and idempotent; a database trigger applies each movement and audit record atomically. Quotes are enquiries and never post stock. Future ERP integration must define offline replay, conflict resolution and the stock authority switch before enabling automatic stock writes.

This release uses a single provisioned owner account, not a multi-user role system. Role management, ERP sync, offline POS and production migration remain separate work. The user subsequently confirmed Wetta catalogue field parity: the optional INR catalogue price is explicitly suggested MRP, separate from ERP selling rates. Published stock quantities and a second specification-poster image are exposed alongside the product details.
