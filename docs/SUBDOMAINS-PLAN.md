# Plan: staff apps on their own subdomains, hidden from the public

Status: proposal, waiting on the owner's choice of names. Nothing is deployed.

## Goal

The public only ever sees the website. The staff apps move off `/manage`, `/pos` and `/catalogue` onto their own addresses, and nobody can reach them without first proving they are staff.

| App | Today | Proposed (names are the owner's choice) |
|---|---|---|
| Website, product pages, customer quotation links `/q/…` | www.lenoretrading.com | unchanged |
| Admin workspace | /manage | **office.lenoretrading.com** |
| Billing counter (POS) | /pos | **billing.lenoretrading.com** |
| Sales catalogue | /catalogue | **sales.lenoretrading.com** |

Avoid obvious names like `admin.` or `pos.`: they are the first names bots try. The name alone is not the protection, though; the next layer is.

## Two layers of protection

1. **Cloudflare Access (Zero Trust), in front of the staff subdomains.** Before the app even loads, Cloudflare asks for a one-time code sent to the person's email (or a Google sign-in) and only lets in emails on an allow list. Strangers, bots and scanners see a Cloudflare sign-in page, never the app or its API. This is free for up to 50 users.
   - Policy: allow the listed staff emails on `office.` and `billing.`. Allow the sales team on `sales.`, or keep `sales.` on the app's own catalogue password if it is shared with dealers.
   - Session length: 30 days on billing and sales, so the counter and phones are not asked every day. The POS keeps billing offline as it does today, because the app shell and its data are cached on the device.
2. **The app's own login, unchanged.** Staff still sign in with their phone and password, so roles, discount limits and billing access keep working.

## What changes in the app (code)

- **Routing by host.** The Worker reads the hostname. On `office.` it serves the admin app at `/`, on `billing.` the POS at `/`, and on `sales.` the catalogue at `/`. On `www.`, the old `/manage`, `/pos` and `/catalogue` paths return 404, after a short transition period of redirects.
- **Each app calls its own host's `/api`.** Requests stay same-origin, so the existing Origin (CSRF) check and SameSite=Strict cookies keep working unchanged.
- **Separate logins per app.** Cookies are host-only, so signing in to billing does not sign you in to the office app. They will also get the `__Host-` prefix, as the security audit recommended.
- **Cross-app links** such as "Open billing counter" in the admin app point to the full subdomain address, read from configuration.
- **Installed apps.** Each subdomain gets its own manifest (`start_url` and `scope` `/`) and its own service worker, so the three installed apps are fully separate. Anyone who installed the current apps installs them once more from the new address.
- **Search engines.** Staff subdomains send `X-Robots-Tag: noindex` and a `robots.txt` that disallows everything. The sitemap only lists the website.
- **Configuration.** `wrangler.jsonc` gets the three custom domains in `env.production.routes`, plus an `APP_HOSTS` variable mapping each host to an app, so local development keeps using paths.

## What the owner does (about 15 minutes, in the Cloudflare dashboard)

1. Confirm the three names.
2. Zero Trust → Settings: create the free team and choose the login method (email code; Google is optional).
3. Zero Trust → Access → Applications: add one self-hosted application per staff subdomain with an "Allow, emails in list" policy, and add the staff emails.
4. After the code change is deployed, open each address once on each device and install the app again.

## Order of work

1. Code: host routing, config, manifests, noindex, cross-app links, tests (local, with fake hostnames).
2. Owner: Cloudflare Access applications (before the domains go live, so the apps are never exposed).
3. Deploy, then keep the old paths redirecting to the new hosts for two weeks, then switch them to 404.
