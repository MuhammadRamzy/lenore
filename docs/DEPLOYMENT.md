# Deploying to Cloudflare

Production config is `env.production` in `wrangler.jsonc` (custom domains www.lenoretrading.com and lenoretrading.com, which redirects to www).

1. `npx wrangler d1 create lenore-production` → put the ID in `env.production.d1_databases`.
2. `npx wrangler r2 bucket create lenore-production-media`.
3. Secrets (never in code): `npx wrangler secret put ADMIN_USERNAME --env production` and `ADMIN_PASSWORD_HASH` (format `pbkdf2$<salt>$<hash>`, 100k iterations SHA-256, same as `scripts/setup-local.mjs`).
4. `npm run build:client && npx wrangler d1 migrations apply lenore-production --remote --env production && npx wrangler deploy --env production`.
5. Submit `https://www.lenoretrading.com/sitemap.xml` in Google Search Console; set up Google Business Profile.

Requires the Workers Paid plan (PBKDF2 sign-in exceeds the free CPU limit). Local tip: after `npm run build:client`, restart `npm run dev`.
