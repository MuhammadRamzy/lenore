# Deploying to Cloudflare

Production config is `env.production` in `wrangler.jsonc`. Requires the Workers Paid plan (PBKDF2 sign-in exceeds the free CPU limit).

## Stage 1 — hosting on workers.dev (domain not yet on Cloudflare)

1. `npx wrangler login` with the Lenore Cloudflare account; check with `npx wrangler whoami`.
2. `npx wrangler d1 create lenore-production` → put the ID in `env.production.d1_databases`.
3. `npx wrangler r2 bucket create lenore-production-media`.
4. Owner sign-in secrets (never in code). Hash with `node scripts/hash-password.mjs` (reads the password from stdin), then
   `npx wrangler secret put ADMIN_USERNAME --env production` and `npx wrangler secret put ADMIN_PASSWORD_HASH --env production`.
5. `npm run build:client && npx wrangler d1 migrations apply lenore-production --remote --env production && npx wrangler deploy --env production`.
6. Products (no photos): `node scripts/export-products.mjs` writes `dist/products-import.sql` from the local database (stock = imported opening stock, local test bills excluded), then
   `npx wrangler d1 execute lenore-production --remote --env production --file dist/products-import.sql`. Run once, on an empty products table.
7. Website visibility is copied from local (currently every product is hidden from the public website). Turn products on in Workspace → Website once photos are uploaded.

## Stage 2 — when lenoretrading.com is active in Cloudflare

1. In Hostinger, set the domain's nameservers to the two shown in Cloudflare → the domain's Overview; wait until Cloudflare says "Active".
2. In `wrangler.jsonc` `env.production`: set `workers_dev` to `false` and uncomment `routes` (www.lenoretrading.com and lenoretrading.com, which redirects to www).
3. `npx wrangler deploy --env production`.
4. Submit `https://www.lenoretrading.com/sitemap.xml` in Google Search Console; set up Google Business Profile.

Local tip: after `npm run build:client`, restart `npm run dev`.
